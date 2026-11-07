// Connect and disconnect Garmin for the signed-in runner (OAuth 2.0 with PKCE).
//   { action: 'start' }                 -> { url }  the Garmin consent page to open
//   { action: 'finish', code, state }   -> { connected: true }
//   { action: 'disconnect' }            -> { connected: false }
// The runner is identified from their own access token. Garmin tokens never leave the server.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { admin, clientId, configured, deregister, expiry, GARMIN, redirectUri, tokenRequest } from '../_shared/garmin.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const challengeFor = async (verifier: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: u, error: ue } = await asUser.auth.getUser();
  if (ue || !u.user) return json({ error: 'not_signed_in' }, 401);
  const uid = u.user.id;
  const db = admin();

  // Only accounts with the 'garmin' flag can connect until the integration is opened to everyone
  const { data: flag } = await db.from('feature_flags').select('flag').eq('user_id', uid).eq('flag', 'garmin').maybeSingle();
  if (!flag) return json({ error: 'not_available', message: 'Garmin sync is not available on your account yet.' }, 403);

  let body: { action?: string; code?: string; state?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  if (body.action === 'start') {
    if (!configured()) return json({ error: 'not_configured', message: 'Garmin sync is waiting for Garmin approval.' }, 503);
    const verifier = randomString(48);
    const state = randomString(24);
    // Old unfinished attempts for this runner are removed
    await db.from('garmin_oauth_states').delete().eq('user_id', uid);
    const ins = await db.from('garmin_oauth_states').insert({ state, user_id: uid, code_verifier: verifier });
    if (ins.error) return json({ error: 'server_error' }, 500);
    const url = new URL(GARMIN.authorize);
    url.search = new URLSearchParams({
      response_type: 'code', client_id: clientId(), code_challenge: await challengeFor(verifier), code_challenge_method: 'S256',
      redirect_uri: redirectUri(), state,
    }).toString();
    return json({ url: url.toString() });
  }

  if (body.action === 'finish') {
    if (!body.code || !body.state) return json({ error: 'bad_request' }, 400);
    const { data: st } = await db.from('garmin_oauth_states').select('user_id,code_verifier,created_at').eq('state', body.state).maybeSingle();
    await db.from('garmin_oauth_states').delete().eq('state', body.state);
    // The state must belong to this runner and be recent (10 minutes)
    if (!st || st.user_id !== uid || Date.now() - new Date(st.created_at).getTime() > 10 * 60 * 1000) {
      return json({ error: 'expired', message: 'The Garmin connection took too long or was started elsewhere. Please try again.' }, 400);
    }
    try {
      const t = await tokenRequest({ grant_type: 'authorization_code', code: body.code, code_verifier: st.code_verifier, redirect_uri: redirectUri() });
      const auth = { headers: { Authorization: `Bearer ${t.access_token}` } };
      const idRes = await fetch(GARMIN.userId, auth);
      if (!idRes.ok) throw new Error(`Garmin user id request failed (${idRes.status})`);
      const garminUserId = (await idRes.json()).userId as string;
      const permRes = await fetch(GARMIN.permissions, auth);
      const permissions: string[] = permRes.ok ? ((await permRes.json()).permissions ?? []) : [];
      // A Garmin account can be linked to one Ritmo account at a time
      await db.from('garmin_connections').delete().eq('garmin_user_id', garminUserId).neq('user_id', uid);
      const up = await db.from('garmin_connections').upsert({
        user_id: uid, garmin_user_id: garminUserId, access_token: t.access_token, refresh_token: t.refresh_token,
        access_expires_at: expiry(t.expires_in), refresh_expires_at: expiry(t.refresh_token_expires_in), permissions,
        connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (up.error) throw new Error(up.error.message);
      return json({ connected: true, permissions });
    } catch (e) {
      return json({ error: 'connect_failed', message: `Garmin could not be connected: ${(e as Error).message}` }, 502);
    }
  }

  if (body.action === 'disconnect') {
    await deregister(db, uid);
    await db.from('garmin_connections').delete().eq('user_id', uid);
    await db.from('garmin_inbox').delete().eq('user_id', uid);
    return json({ connected: false });
  }

  return json({ error: 'bad_request' }, 400);
});
