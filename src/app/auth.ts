// Email and password accounts with Supabase Auth.
import { supabase } from '../data/supabase';

export interface AuthResult { ok: boolean; message?: string; code?: AuthCode; needsConfirmation?: boolean }
export type AuthCode = 'wrong_password' | 'already_registered' | 'weak_password' | 'unconfirmed' | 'network' | 'rate_limited' | 'invalid_email' | 'other';

export const PASSWORD_RULE = 'At least 8 characters, with letters and numbers.';

export function passwordProblem(pw: string): string | undefined {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return 'Use a mix of letters and numbers.';
  return undefined;
}

export function authError(e: unknown): AuthResult {
  const err = e as { message?: string; code?: string; status?: number; name?: string };
  const msg = (err?.message ?? String(e)).toLowerCase();
  const code = err?.code ?? '';
  if (err?.name === 'AuthRetryableFetchError' || /fetch|network|load failed/.test(msg)) return { ok: false, code: 'network', message: 'Ritmo cannot reach the server. Check your internet connection and try again.' };
  if (code === 'invalid_credentials' || /invalid login credentials/.test(msg)) return { ok: false, code: 'wrong_password', message: 'That email and password do not match. Check them and try again, or reset your password.' };
  if (code === 'email_not_confirmed' || /email not confirmed/.test(msg)) return { ok: false, code: 'unconfirmed', message: 'Please confirm your email first. Use the link we sent you, or send a new one below.' };
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered|already been registered/.test(msg)) return { ok: false, code: 'already_registered', message: 'An account with this email already exists. Log in instead, or reset your password if you have forgotten it.' };
  if (code === 'weak_password' || /password should|weak password|password is too/.test(msg)) return { ok: false, code: 'weak_password', message: `That password is too weak. ${PASSWORD_RULE}` };
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err?.status === 429 || /rate limit/.test(msg)) return { ok: false, code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes and try again.' };
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/.test(msg)) return { ok: false, code: 'invalid_email', message: 'That email address does not look right.' };
  return { ok: false, code: 'other', message: err?.message ?? 'Something went wrong. Please try again.' };
}

const origin = () => window.location.origin;

/** Terms and the 18+ confirmation are recorded with the account. Health data consent is asked separately in setup. */
export async function signUp(email: string, password: string, agreedAt: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, code: 'other', message: 'Accounts are not configured for this build.' };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, code: 'weak_password', message: `That password is too weak. ${problem}` };
  try {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin()}/login?confirmed=1`, data: { terms_accepted_at: agreedAt, adult_confirmed_at: agreedAt, terms_version: '2026-11' } } });
    if (error) return authError(error);
    // When the email is already registered and confirmed, Supabase returns a user with no identities
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return authError({ code: 'user_already_exists' });
    return { ok: true, needsConfirmation: !data.session };
  } catch (e) { return authError(e); }
}

export async function logIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, code: 'other', message: 'Accounts are not configured for this build.' };
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? authError(error) : { ok: true };
  } catch (e) { return authError(e); }
}

export async function resendConfirmation(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${origin()}/login?confirmed=1` } });
    return error ? authError(error) : { ok: true };
  } catch (e) { return authError(e); }
}

/** Also how people who used the old emailed sign-in link set a password. */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/reset-password` });
    return error ? authError(error) : { ok: true };
  } catch (e) { return authError(e); }
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, code: 'weak_password', message: `That password is too weak. ${problem}` };
  try {
    const { error } = await supabase.auth.updateUser({ password });
    return error ? authError(error) : { ok: true };
  } catch (e) { return authError(e); }
}

export async function logOut() {
  await supabase?.auth.signOut();
}
