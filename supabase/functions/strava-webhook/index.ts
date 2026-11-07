// Strava push subscription callback (deploy with --no-verify-jwt: Strava does not send a Supabase token).
//   GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  -> { "hub.challenge": … } (subscription check)
//   POST { object_type, object_id, aspect_type, owner_id, updates } for activity create/update/delete and
//        athlete deauthorisation. Strava wants a 200 within two seconds, so the work runs after the answer.
// Requires STRAVA_VERIFY_TOKEN (any long random string, also used when creating the subscription).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { accessTokenFor, admin, fetchRun, inBackground } from '../_shared/strava.ts';

interface StravaEvent { object_type?: string; object_id?: number; aspect_type?: string; owner_id?: number; updates?: Record<string, string> }

async function handle(e: StravaEvent) {
  const db = admin();
  const { data: link } = await db.from('strava_connections').select('user_id').eq('athlete_id', e.owner_id ?? -1).maybeSingle();
  if (!link) return;
  const uid = link.user_id as string;
  if (e.object_type === 'athlete' && e.updates?.authorized === 'false') {
    // The runner removed Ritmo in Strava's settings: forget the tokens and anything still waiting
    await db.from('strava_connections').delete().eq('user_id', uid);
    await db.from('strava_inbox').delete().eq('user_id', uid);
    return;
  }
  if (e.object_type !== 'activity' || e.object_id == null) return;
  const id = String(e.object_id);
  if (e.aspect_type === 'delete') {
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
  inBackground(handle(e));
  return new Response('ok', { status: 200 });
});
