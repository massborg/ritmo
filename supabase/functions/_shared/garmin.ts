// Garmin Connect Developer Program: OAuth 2.0 PKCE endpoints and token handling, shared by garmin-auth and
// garmin-webhook. Endpoints follow Garmin's "OAuth2.0 PKCE Specification"; each can be overridden with an
// environment variable in case Garmin's portal lists a different address after approval.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const GARMIN = {
  authorize: Deno.env.get('GARMIN_AUTHORIZE_URL') ?? 'https://connect.garmin.com/oauth2Confirm',
  token: Deno.env.get('GARMIN_TOKEN_URL') ?? 'https://connectapi.garmin.com/di-oauth2-service/oauth/token',
  userId: Deno.env.get('GARMIN_USER_ID_URL') ?? 'https://apis.garmin.com/wellness-api/rest/user/id',
  permissions: Deno.env.get('GARMIN_PERMISSIONS_URL') ?? 'https://apis.garmin.com/wellness-api/rest/user/permissions',
  registration: Deno.env.get('GARMIN_REGISTRATION_URL') ?? 'https://apis.garmin.com/wellness-api/rest/user/registration',
};

export const clientId = () => Deno.env.get('GARMIN_CLIENT_ID') ?? '';
export const clientSecret = () => Deno.env.get('GARMIN_CLIENT_SECRET') ?? '';
export const redirectUri = () => Deno.env.get('GARMIN_REDIRECT_URI') ?? 'https://app.ritmorunning.run/garmin/callback';
export const configured = () => !!clientId() && !!clientSecret();

export const admin = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export interface TokenSet { access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in?: number }

export async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const body = new URLSearchParams({ ...params, client_id: clientId(), client_secret: clientSecret() });
  const r = await fetch(GARMIN.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error(`Garmin token request failed (${r.status})`);
  return await r.json() as TokenSet;
}

export const expiry = (seconds: number | undefined) => (seconds ? new Date(Date.now() + (seconds - 60) * 1000).toISOString() : null);

/** A valid access token for a connected runner, refreshed and saved when it is about to expire. */
export async function accessTokenFor(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data: c } = await db.from('garmin_connections').select('access_token,refresh_token,access_expires_at').eq('user_id', userId).maybeSingle();
  if (!c) return null;
  if (new Date(c.access_expires_at).getTime() > Date.now()) return c.access_token as string;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh_token as string });
  await db.from('garmin_connections').update({
    access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token,
    access_expires_at: expiry(t.expires_in), refresh_expires_at: expiry(t.refresh_token_expires_in), updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  return t.access_token;
}

/** Tell Garmin to stop sending this runner's data (required when the runner disconnects in Ritmo). */
export async function deregister(db: SupabaseClient, userId: string): Promise<void> {
  try {
    const token = await accessTokenFor(db, userId);
    if (token) await fetch(GARMIN.registration, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  } catch { /* the connection is removed on our side regardless */ }
}
