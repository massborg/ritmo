// Push reminders (Web Push). Deploy with JWT verification off (--no-verify-jwt): the scheduler calls it without a
// Supabase token, so each action checks who is calling itself.
//   { action: 'key' }                                   -> { publicKey }   the server's VAPID key, for subscribing
//   { action: 'subscribe', subscription, tz }           -> { ok: true }    signed-in runner: save this browser
//   { action: 'unsubscribe', endpoint }                 -> { ok: true }    signed-in runner: forget this browser
//   { action: 'test', endpoint }                        -> { sent: true }  signed-in runner: a test notification
//   { action: 'tick' } + x-ritmo-cron header           -> { sent, checked } the scheduler, every 15 minutes
// Messages are encrypted for each browser, so the push services that carry them cannot read them.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { generateKeyPair, sendPush, type KeyPair } from '../_shared/webpush.ts';
import { eveningMessage, isDue, localNow, morningMessage, type PushMessage, type PushSession, type Reminders } from '../_shared/push-core.ts';

const SUBJECT = 'https://app.ritmorunning.run';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** Only real push services: the function never posts to any other address. */
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export const isPushEndpoint = (e: string) => { try { const u = new URL(e); return u.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(u.hostname)); } catch { return false; } };

interface Config { vapid: KeyPair; cronToken: string }
async function config(db: SupabaseClient): Promise<Config> {
  const { data, error } = await db.from('push_config').select('vapid_public,vapid_private,cron_token').eq('id', 1).single();
  if (error || !data) throw new Error(`push config missing: ${error?.message}`);
  if (data.vapid_public && data.vapid_private) return { vapid: { publicKey: data.vapid_public, privateKey: data.vapid_private }, cronToken: data.cron_token };
  // First use: make the key pair. Only one is ever kept (changing it would cut off every browser).
  const pair = await generateKeyPair();
  await db.from('push_config').update({ vapid_public: pair.publicKey, vapid_private: pair.privateKey }).eq('id', 1).is('vapid_public', null);
  return config(db);
}

async function signedInUser(req: Request): Promise<string | null> {
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data, error } = await asUser.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

interface SubRow { endpoint: string; user_id: string; p256dh: string; auth: string; tz: string; last_morning: string | null; last_evening: string | null }
interface ProfileData { reminders?: Reminders; units?: 'km' | 'mi'; illnessUntil?: string }

async function deliver(db: SupabaseClient, vapid: KeyPair, sub: SubRow, msg: PushMessage): Promise<boolean> {
  try {
    const status = await sendPush(sub, msg, vapid, SUBJECT);
    if (status === 404 || status === 410) { await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); return false; }
    if (status >= 400) console.error('push service', new URL(sub.endpoint).hostname, status);
    return status < 300;
  } catch (e) { console.error('push send', (e as Error).message); return false; }
}

async function tick(db: SupabaseClient, vapid: KeyPair, now: Date) {
  const { data: subs, error } = await db.from('push_subscriptions').select('*');
  if (error) throw new Error(error.message);
  let sent = 0;
  const perUser = new Map<string, Promise<{ p: ProfileData; sessions: PushSession[] }>>();
  const load = (uid: string) => {
    if (!perUser.has(uid)) perUser.set(uid, (async () => {
      const [prof, plan] = await Promise.all([
        db.from('profiles').select('data').eq('user_id', uid).maybeSingle(),
        db.from('plans').select('data').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { p: ((prof.data?.data as { profile?: ProfileData } | null)?.profile ?? {}), sessions: ((plan.data?.data as { sessions?: PushSession[] } | null)?.sessions ?? []) };
    })());
    return perUser.get(uid)!;
  };
  for (const sub of (subs ?? []) as SubRow[]) {
    const { date, minutes } = localNow(now, sub.tz);
    const { p, sessions } = await load(sub.user_id);
    const r = p.reminders;
    if (!r) continue;
    const morningDue = isDue(r.morning, minutes, date, sub.last_morning);
    const eveningDue = isDue(r.evening, minutes, date, sub.last_evening);
    if (!morningDue && !eveningDue) continue;
    const ill = !!p.illnessUntil && p.illnessUntil >= date; // no training reminders while unwell
    const update: Partial<SubRow> = {};
    if (morningDue) {
      update.last_morning = date;
      const msg = ill ? null : morningMessage(sessions, date, p.units === 'mi' ? 'mi' : 'km');
      if (msg && await deliver(db, vapid, sub, msg)) sent++;
    }
    if (eveningDue) {
      update.last_evening = date;
      let msg = ill ? null : eveningMessage(sessions, date, false);
      if (msg) {
        // Any run for today (saved, or waiting in the Strava inbox) means no "how did today go?" message
        const since = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();
        const [runs, inbox] = await Promise.all([
          db.from('activities').select('start_time').eq('user_id', sub.user_id).gte('start_time', since),
          db.from('strava_inbox').select('payload').eq('user_id', sub.user_id),
        ]);
        const ranToday = (runs.data ?? []).some((a) => localNow(new Date(a.start_time as string), sub.tz).date === date)
          || (inbox.data ?? []).some((x) => { const st = (x.payload as { activity?: { start_date?: string } } | null)?.activity?.start_date; return !!st && localNow(new Date(st), sub.tz).date === date; });
        msg = eveningMessage(sessions, date, ranToday);
      }
      if (msg && await deliver(db, vapid, sub, msg)) sent++;
    }
    await db.from('push_subscriptions').update(update).eq('endpoint', sub.endpoint);
  }
  return { sent, checked: subs?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: { action?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; tz?: string; endpoint?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const db = admin();
  let cfg: Config;
  try { cfg = await config(db); } catch (e) { console.error((e as Error).message); return json({ error: 'not_configured' }, 503); }

  if (body.action === 'tick') {
    const token = req.headers.get('x-ritmo-cron') ?? '';
    if (!token || token !== cfg.cronToken) return json({ error: 'forbidden' }, 403);
    try { return json(await tick(db, cfg.vapid, new Date())); } catch (e) { console.error('tick', (e as Error).message); return json({ error: 'server_error' }, 500); }
  }

  const uid = await signedInUser(req);
  if (!uid) return json({ error: 'not_signed_in' }, 401);

  if (body.action === 'key') return json({ publicKey: cfg.vapid.publicKey });

  if (body.action === 'subscribe') {
    const s = body.subscription;
    if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth || !isPushEndpoint(s.endpoint)) return json({ error: 'bad_request' }, 400);
    let tz = typeof body.tz === 'string' ? body.tz.slice(0, 64) : 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = 'UTC'; }
    // A browser belongs to whoever last signed in on it
    const up = await db.from('push_subscriptions').upsert({ endpoint: s.endpoint, user_id: uid, p256dh: s.keys.p256dh, auth: s.keys.auth, tz, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
    if (up.error) return json({ error: 'server_error' }, 500);
    return json({ ok: true });
  }

  if (body.action === 'unsubscribe') {
    if (!body.endpoint) return json({ error: 'bad_request' }, 400);
    await db.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('user_id', uid);
    return json({ ok: true });
  }

  if (body.action === 'test') {
    const { data: sub } = await db.from('push_subscriptions').select('*').eq('endpoint', body.endpoint ?? '').eq('user_id', uid).maybeSingle();
    if (!sub) return json({ error: 'not_subscribed' }, 404);
    const ok = await deliver(db, cfg.vapid, sub as SubRow, { title: 'Ritmo reminders are on', body: 'This is how your training reminders will look.', url: '/profile', tag: 'test' });
    return ok ? json({ sent: true }) : json({ error: 'send_failed', message: 'The notification could not be sent. Try turning reminders off and on again.' }, 502);
  }

  return json({ error: 'bad_request' }, 400);
});
