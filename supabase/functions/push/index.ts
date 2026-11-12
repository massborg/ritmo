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
import { catchUpAll } from '../_shared/strava.ts';
import { localNow, planPush, withDefaults, type PushHubGroup, type PushMessage, type PushRace, type PushRun, type PushSession, type PushShoe, type Reminders, type Sent } from '../_shared/push-core.ts';

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

interface SubRow { endpoint: string; user_id: string; p256dh: string; auth: string; tz: string; last_morning: string | null; last_evening: string | null; sent: Sent | null }
interface ProfileData {
  reminders?: Partial<Reminders>; units?: 'km' | 'mi'; illnessUntil?: string;
  body?: { redFlagAt?: string; checkedAt?: string };
  /** What the app works out and the server can't: today's readiness and how worn each pair of shoes is */
  pushHints?: { readiness?: { date: string; score: number; band: 'recover' | 'easy' | 'hard' }; shoes?: PushShoe[] };
}
interface UserData { p: ProfileData; sessions: PushSession[]; races: PushRace[]; runs: { id: string; name: string; start: string; endMs: number; source: string; distanceM: number }[]; feelIds: Set<string>; hub: PushHubGroup[]; hubIds: number[] }

async function deliver(db: SupabaseClient, vapid: KeyPair, sub: SubRow, msg: PushMessage): Promise<boolean> {
  try {
    const status = await sendPush(sub, msg, vapid, SUBJECT);
    if (status === 404 || status === 410) { await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); return false; }
    if (status >= 400) console.error('push service', new URL(sub.endpoint).hostname, status);
    return status < 300;
  } catch (e) { console.error('push send', (e as Error).message); return false; }
}

async function loadUser(db: SupabaseClient, uid: string, now: Date): Promise<UserData> {
  const since = new Date(now.getTime() - 9 * 86400e3).toISOString();
  const [prof, plan, races, recent, last, notes] = await Promise.all([
    db.from('profiles').select('data').eq('user_id', uid).maybeSingle(),
    db.from('plans').select('data').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('races').select('id,data').eq('user_id', uid),
    db.from('activities').select('id,name,start_time,moving_s,duration_s,source,distance_m,source_ids').eq('user_id', uid).gte('start_time', since).order('start_time', { ascending: false }).limit(60),
    db.from('activities').select('id,start_time,source_ids').eq('user_id', uid).order('start_time', { ascending: false }).limit(5),
    db.from('notifications').select('id,kind,actor_id,post_id').eq('user_id', uid).is('pushed_at', null).gte('created_at', new Date(now.getTime() - 2 * 86400e3).toISOString()).order('created_at', { ascending: false }).limit(50),
  ]);
  const live = (x: { source_ids?: { deleted?: string } | null }) => !x.source_ids?.deleted; // runs deleted in Ritmo never count
  const runs = ((recent.data ?? []) as { id: string; name: string; start_time: string; moving_s: number; duration_s: number; source: string; distance_m: number; source_ids: { deleted?: string } | null }[])
    .filter(live).map((a) => ({ id: a.id, name: a.name || 'Run', start: a.start_time, endMs: new Date(a.start_time).getTime() + (a.duration_s || a.moving_s || 0) * 1000, source: a.source, distanceM: Number(a.distance_m) || 0 }));
  const lastRun = ((last.data ?? []) as { id: string; start_time: string; source_ids: { deleted?: string } | null }[]).filter(live)[0];
  if (lastRun && !runs.some((r) => r.id === lastRun.id)) runs.push({ id: lastRun.id, name: 'Run', start: lastRun.start_time, endMs: new Date(lastRun.start_time).getTime(), source: 'old', distanceM: 0 });
  const recentIds = runs.filter((r) => now.getTime() - r.endMs < 5 * 3600e3).map((r) => r.id);
  const fb = recentIds.length ? await db.from('session_feedback').select('activity_id').eq('user_id', uid).in('activity_id', recentIds) : { data: [] };
  // Hub notifications, batched like the in-app list, with the actors' Hub names
  const nrows = (notes.data ?? []) as { id: number; kind: PushHubGroup['kind']; actor_id: string | null; post_id: string | null }[];
  const actorIds = [...new Set(nrows.map((n) => n.actor_id).filter(Boolean))] as string[];
  const people = actorIds.length ? await db.from('hub_profiles').select('user_id,display_name').in('user_id', actorIds) : { data: [] };
  const nameOf = new Map(((people.data ?? []) as { user_id: string; display_name: string }[]).map((x) => [x.user_id, x.display_name]));
  const groups = new Map<string, PushHubGroup>();
  for (const n of nrows) {
    const k = n.kind === 'follow' || n.kind === 'follow_request' ? `${n.kind}:${n.actor_id}` : `${n.kind}:${n.post_id}`;
    const g = groups.get(k) ?? { kind: n.kind, names: [], postId: n.post_id };
    const nm = nameOf.get(n.actor_id ?? '') ?? 'Someone';
    if (!g.names.includes(nm)) g.names.push(nm);
    groups.set(k, g);
  }
  return {
    p: ((prof.data?.data as { profile?: ProfileData } | null)?.profile ?? {}),
    sessions: ((plan.data?.data as { sessions?: PushSession[] } | null)?.sessions ?? []),
    races: ((races.data ?? []) as { id: string; data: { name?: string; date?: string } }[]).filter((x) => x.data?.date).map((x) => ({ id: x.id, name: x.data.name ?? 'Your race', date: x.data.date as string })),
    runs, feelIds: new Set(((fb.data ?? []) as { activity_id: string }[]).map((x) => x.activity_id)),
    hub: [...groups.values()], hubIds: nrows.map((n) => n.id),
  };
}

async function tick(db: SupabaseClient, vapid: KeyPair, now: Date) {
  const { data: subs, error } = await db.from('push_subscriptions').select('*');
  if (error) throw new Error(error.message);
  let sent = 0;
  const perUser = new Map<string, Promise<UserData>>();
  const hubDone = new Map<string, number[]>();
  for (const sub of (subs ?? []) as SubRow[]) {
    if (!perUser.has(sub.user_id)) perUser.set(sub.user_id, loadUser(db, sub.user_id, now));
    const u = await perUser.get(sub.user_id)!;
    if (!u.p.reminders) continue; // reminders never turned on
    const { date, minutes } = localNow(now, sub.tz);
    const dayOf = (iso: string) => localNow(new Date(iso), sub.tz).date;
    const yesterday = localNow(new Date(now.getTime() - 86400e3), sub.tz).date;
    const runDays = new Set(u.runs.map((r) => dayOf(r.start)));
    // This week (Monday to today) for the Sunday summary
    const wd = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const monday = new Date(`${date}T12:00:00Z`); monday.setUTCDate(monday.getUTCDate() - wd);
    const mon = monday.toISOString().slice(0, 10);
    const weekRuns = u.runs.filter((r) => { const d = dayOf(r.start); return d >= mon && d <= date; });
    const planned = u.sessions.filter((s) => s.type !== 'rest' && s.date >= mon && s.date <= date);
    const body = u.p.body;
    const plan = planPush({
      date, minutes, nowMs: now.getTime(), r: withDefaults(u.p.reminders), units: u.p.units === 'mi' ? 'mi' : 'km', sessions: u.sessions,
      lastMorning: sub.last_morning, lastEvening: sub.last_evening, sent: sub.sent ?? {},
      ranToday: runDays.has(date), ranYesterday: runDays.has(yesterday),
      lastRunDate: u.runs.length ? u.runs.map((r) => dayOf(r.start)).sort().at(-1) : undefined,
      ill: !!u.p.illnessUntil && u.p.illnessUntil >= date,
      paused: !!body?.redFlagAt && (!body.checkedAt || body.checkedAt < body.redFlagAt),
      races: u.races.filter((x) => x.date >= date),
      readiness: u.p.pushHints?.readiness,
      week: { km: weekRuns.reduce((n, r) => n + r.distanceM, 0) / 1000, runs: weekRuns.length, planned: planned.length, done: planned.filter((s) => runDays.has(s.date)).length },
      recentRuns: u.runs.map((r): PushRun => ({ id: r.id, name: r.name, endedAtMs: r.endMs, synced: r.source !== 'manual' && r.source !== 'ritmo_gps' && r.source !== 'old', hasFeel: u.feelIds.has(r.id) })),
      shoes: u.p.pushHints?.shoes ?? [],
      hub: u.hub,
    });
    for (const msg of plan.messages as PushMessage[]) if (await deliver(db, vapid, sub, msg)) sent++;
    if (plan.hubHandled && u.hubIds.length) hubDone.set(sub.user_id, u.hubIds);
    const update: Record<string, unknown> = {};
    if (plan.lastMorning) update.last_morning = plan.lastMorning;
    if (plan.lastEvening) update.last_evening = plan.lastEvening;
    if (JSON.stringify(plan.sent) !== JSON.stringify(sub.sent ?? {})) update.sent = plan.sent;
    if (Object.keys(update).length) await db.from('push_subscriptions').update(update).eq('endpoint', sub.endpoint);
  }
  // Hub notifications pushed to every device of the runner are marked, so each goes once
  for (const ids of hubDone.values()) await db.from('notifications').update({ pushed_at: now.toISOString() }).in('id', ids);
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
    try {
      const now = new Date();
      const out: Record<string, unknown> = await tick(db, cfg.vapid, now);
      // Once an hour, the Strava catch-up behind the webhook (a lost push never loses a run)
      if (now.getUTCMinutes() < 15) { try { out.strava = await catchUpAll(db); } catch (e) { console.error('strava catch-up', (e as Error).message); } }
      return json(out);
    } catch (e) { console.error('tick', (e as Error).message); return json({ error: 'server_error' }, 500); }
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
