// Strava push subscription callback (deploy with --no-verify-jwt: Strava does not send a Supabase token).
//   GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  -> { "hub.challenge": … } (subscription check)
//   POST { object_type, object_id, aspect_type, owner_id, updates } for activity create/update/delete and
//        athlete deauthorisation. Strava wants a 200 within two seconds, so the work runs after the answer.
// Requires STRAVA_VERIFY_TOKEN (any long random string, also used when creating the subscription).
//
// Anyone can send a POST here (Strava does not sign its events), so an event is only ever a hint:
//   - nothing in the event is stored; a run's data is always fetched from Strava with the runner's own token
//   - a "deleted" event is believed only when Strava itself says the activity is gone (404)
//   - an "access removed" event is believed only when Strava refuses the runner's token
//   - with STRAVA_SUBSCRIPTION_ID set (the id Strava returned when the subscription was created), events
//     carrying any other subscription_id are dropped before any work is done
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { accessTokenFor, admin, fetchRun, inBackground, STRAVA } from '../_shared/strava.ts';

/** What Strava says about the runner's access: 'ok', 'revoked' (the token is refused), or 'unknown' (Strava could
 *  not be asked, so nothing is concluded) */
async function accessState(db: ReturnType<typeof admin>, uid: string): Promise<'ok' | 'revoked' | 'unknown'> {
  let token: string | null;
  // A refresh that Strava refuses (400/401) means the grant is gone
  try { token = await accessTokenFor(db, uid); } catch (err) { return /\((400|401)\)/.test((err as Error).message) ? 'revoked' : 'unknown'; }
  if (!token) return 'unknown';
  try {
    const r = await fetch(`${STRAVA.api}/athlete`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? 'ok' : r.status === 401 ? 'revoked' : 'unknown';
  } catch { return 'unknown'; }
}
/** True only when Strava itself answers that the activity does not exist any more */
async function goneInStrava(db: ReturnType<typeof admin>, uid: string, id: string): Promise<boolean> {
  try {
    const token = await accessTokenFor(db, uid);
    if (!token) return false;
    const r = await fetch(`${STRAVA.api}/activities/${id}?include_all_efforts=false`, { headers: { Authorization: `Bearer ${token}` } });
    return r.status === 404;
  } catch { return false; }
}

interface StravaEvent { object_type?: string; object_id?: number; aspect_type?: string; owner_id?: number; subscription_id?: number; updates?: Record<string, string> }

async function handle(e: StravaEvent) {
  const db = admin();
  const { data: link } = await db.from('strava_connections').select('user_id').eq('athlete_id', e.owner_id ?? -1).maybeSingle();
  if (!link) return;
  const uid = link.user_id as string;
  if (e.object_type === 'athlete' && e.updates?.authorized === 'false') {
    // The runner removed Ritmo in Strava's settings: forget the tokens and anything still waiting. Checked with
    // Strava first, so a forged event cannot disconnect anyone.
    if (await accessState(db, uid) !== 'revoked') return;
    await db.from('strava_connections').delete().eq('user_id', uid);
    await db.from('strava_inbox').delete().eq('user_id', uid);
    return;
  }
  if (e.object_type !== 'activity' || e.object_id == null) return;
  const id = String(e.object_id);
  if (e.aspect_type === 'delete') {
    if (!(await goneInStrava(db, uid, id))) return; // still there in Strava: not a real deletion
    await db.from('strava_inbox').upsert({ user_id: uid, activity_id: id, payload: { deleted: true } }, { onConflict: 'user_id,activity_id' });
    return;
  }
  try {
    const token = await accessTokenFor(db, uid);
    if (!token) return;
    const run = await fetchRun(token, id);
    if (run) await db.from('strava_inbox').upsert({ user_id: uid, activity_id: id, payload: run }, { onConflict: 'user_id,activity_id' });
  } catch (err) { console.error('strava webhook fetch', (err as Error).message); }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const verify = Deno.env.get('STRAVA_VERIFY_TOKEN') ?? '';
    if (verify && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verify) {
      return new Response(JSON.stringify({ 'hub.challenge': url.searchParams.get('hub.challenge') }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  let e: StravaEvent;
  try { e = await req.json(); } catch { return new Response('bad request', { status: 400 }); }
  const sub = Deno.env.get('STRAVA_SUBSCRIPTION_ID');
  if (sub && String(e.subscription_id ?? '') !== sub) return new Response('ok', { status: 200 });
  inBackground(handle(e));
  return new Response('ok', { status: 200 });
});
