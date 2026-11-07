// Strava API v3: OAuth 2.0 token handling and activity fetching, shared by strava-auth and strava-webhook.
// Docs: developers.strava.com. Tokens last six hours and are refreshed here; they never leave the server.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const STRAVA = {
  authorize: 'https://www.strava.com/oauth/authorize',
  token: 'https://www.strava.com/oauth/token',
  deauthorize: 'https://www.strava.com/oauth/deauthorize',
  api: 'https://www.strava.com/api/v3',
};
export const clientId = () => Deno.env.get('STRAVA_CLIENT_ID') ?? '';
export const clientSecret = () => Deno.env.get('STRAVA_CLIENT_SECRET') ?? '';
export const redirectUri = () => Deno.env.get('STRAVA_REDIRECT_URI') ?? 'https://app.ritmorunning.run/strava/callback';
export const configured = () => !!clientId() && !!clientSecret();
export const admin = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export interface TokenSet { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number } }

export async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const body = new URLSearchParams({ ...params, client_id: clientId(), client_secret: clientSecret() });
  const r = await fetch(STRAVA.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error(`Strava token request failed (${r.status})`);
  return await r.json() as TokenSet;
}
/** Strava gives an absolute expiry in seconds; refresh a minute early. */
export const expiry = (expiresAt: number) => new Date((expiresAt - 60) * 1000).toISOString();

/** A valid access token for a connected runner, refreshed and saved when it is about to expire. */
export async function accessTokenFor(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data: c } = await db.from('strava_connections').select('access_token,refresh_token,access_expires_at').eq('user_id', userId).maybeSingle();
  if (!c) return null;
  if (new Date(c.access_expires_at).getTime() > Date.now()) return c.access_token as string;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh_token as string });
  await db.from('strava_connections').update({ access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token, access_expires_at: expiry(t.expires_at), updated_at: new Date().toISOString() }).eq('user_id', userId);
  return t.access_token;
}

/** Runs only: Run, TrailRun and VirtualRun (treadmill runs are VirtualRun or Run with trainer set). */
export const isRun = (a: { sport_type?: string; type?: string }) => /^(Run|TrailRun|VirtualRun)$/.test(a.sport_type ?? a.type ?? '');

/** One activity with its streams, ready for the inbox; null if it is not a run or cannot be read. */
export async function fetchRun(token: string, id: string | number): Promise<{ activity: Record<string, unknown>; streams: Record<string, unknown> } | null> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const a = await fetch(`${STRAVA.api}/activities/${id}?include_all_efforts=false`, auth);
  if (!a.ok) { if (a.status === 404) return null; throw new Error(`Strava activity ${id} (${a.status})`); }
  const activity = await a.json();
  if (!isRun(activity)) return null;
  const s = await fetch(`${STRAVA.api}/activities/${id}/streams?keys=time,distance,latlng,heartrate,altitude,cadence&key_by_type=true`, auth);
  const streams = s.ok ? await s.json() : {};
  return { activity, streams };
}

/** Tell Strava the runner revoked access (required when they disconnect in Ritmo). */
export async function deauthorize(db: SupabaseClient, userId: string): Promise<void> {
  try {
    const token = await accessTokenFor(db, userId);
    if (token) await fetch(STRAVA.deauthorize, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch { /* the connection is removed on our side regardless */ }
}

/** Work that continues after the response is sent (Supabase's EdgeRuntime.waitUntil); runs inline if unavailable. */
export function inBackground(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => undefined);
}
