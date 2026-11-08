// Connect and disconnect Strava for the signed-in runner (OAuth 2.0).
//   { action: 'start' }                        -> { url }  Strava's consent page
//   { action: 'finish', code, state, scope }   -> { connected: true }  and the last 30 days of runs are fetched
//   { action: 'disconnect' }                   -> { connected: false } (access revoked at Strava, data removed)
// The runner is identified from their own access token. Strava tokens never leave the server.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { accessTokenFor, admin, clientId, configured, deauthorize, expiry, fetchRun, inBackground, isRun, redirectUri, STRAVA, tokenRequest } from '../_shared/strava.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const randomString = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const BACKFILL_DAYS = 30;

/** The last 30 days of runs into the inbox, so a new connection starts with recent history. */
async function backfill(db: SupabaseClient, uid: string) {
  try {
    const token = await accessTokenFor(db, uid);
    if (!token) return;
    const after = Math.floor(Date.now() / 1000) - BACKFILL_DAYS * 86400;
    const r = await fetch(`${STRAVA.api}/athlete/activities?after=${after}&per_page=60`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { console.error('strava backfill list', r.status); return; }
    const list = (await r.json() as { id: number; sport_type?: string; type?: string }[]).filter(isRun);
    for (const a of list) {
      const run = await fetchRun(token, a.id);
      if (run) await db.from('strava_inbox').upsert({ user_id: uid, activity_id: String(a.id), payload: run }, { onConflict: 'user_id,activity_id' });
    }
  } catch (e) { console.error('strava backfill', (e as Error).message); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: u, error: ue } = await asUser.auth.getUser();
  if (ue || !u.user) return json({ error: 'not_signed_in' }, 401);
  const uid = u.user.id;
  const db = admin();

  // Open to every signed-in runner (it was behind the 'strava' flag while being tested)

  let body: { action?: string; code?: string; state?: string; scope?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  if (body.action === 'start') {
    if (!configured()) return json({ error: 'not_configured', message: 'Strava sync is not set up yet.' }, 503);
    const state = randomString(24);
    await db.from('strava_oauth_states').delete().eq('user_id', uid);
    const ins = await db.from('strava_oauth_states').insert({ state, user_id: uid });
    if (ins.error) return json({ error: 'server_error' }, 500);
    const url = new URL(STRAVA.authorize);
    url.search = new URLSearchParams({ client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(), approval_prompt: 'auto', scope: 'read,activity:read_all', state }).toString();
    return json({ url: url.toString() });
  }

  if (body.action === 'finish') {
    if (!body.code || !body.state) return json({ error: 'bad_request' }, 400);
    const { data: st } = await db.from('strava_oauth_states').select('user_id,created_at').eq('state', body.state).maybeSingle();
    await db.from('strava_oauth_states').delete().eq('state', body.state);
    if (!st || st.user_id !== uid || Date.now() - new Date(st.created_at).getTime() > 10 * 60 * 1000) {
      return json({ error: 'expired', message: 'The Strava connection took too long or was started elsewhere. Please try again.' }, 400);
    }
    // Ritmo needs to read activities; private ones too, so every run comes across
    const scope = body.scope ?? '';
    if (!/activity:read/.test(scope)) return json({ error: 'scope', message: 'Ritmo needs permission to read your activities. Please connect again and leave "View data about your activities" ticked.' }, 400);
    try {
      const t = await tokenRequest({ grant_type: 'authorization_code', code: body.code });
      if (!t.athlete?.id) throw new Error('no athlete in the token response');
      await db.from('strava_connections').delete().eq('athlete_id', t.athlete.id).neq('user_id', uid);
      const up = await db.from('strava_connections').upsert({
        user_id: uid, athlete_id: t.athlete.id, access_token: t.access_token, refresh_token: t.refresh_token,
        access_expires_at: expiry(t.expires_at), scope, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (up.error) throw new Error(up.error.message);
      inBackground(backfill(db, uid));
      return json({ connected: true, backfillDays: BACKFILL_DAYS });
    } catch (e) {
      // Strava limits how many runners a new app can connect until it raises the app's capacity
      if (/\((403|429)\)/.test((e as Error).message)) return json({ error: 'strava_full', message: 'Strava sync is full right now: Strava limits how many runners a new app can connect until it approves more. Your runs are safe; please try again later, or upload your files in the meantime.' }, 503);
      return json({ error: 'connect_failed', message: `Strava could not be connected: ${(e as Error).message}` }, 502);
    }
  }

  if (body.action === 'disconnect') {
    await deauthorize(db, uid);
    await db.from('strava_connections').delete().eq('user_id', uid);
    await db.from('strava_inbox').delete().eq('user_id', uid);
    return json({ connected: false });
  }

  return json({ error: 'bad_request' }, 400);
});
