import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let closing = false;
/** While the app is closing, saves use keepalive requests so the browser finishes them after the page is gone. */
export function setClosing(v: boolean) { closing = v; }
const KEEPALIVE_MAX = 60000; // browsers cap keepalive bodies at 64 KB in total
const fetchWithKeepalive: typeof fetch = (input, init) => {
  const size = typeof init?.body === 'string' ? init.body.length : Infinity;
  return fetch(input, closing && size < KEEPALIVE_MAX ? { ...init, keepalive: true } : init);
};

/**
 * Supabase client. The implicit flow is used so that confirmation and password-reset links
 * work even when opened on a different device or browser from the one that requested them.
 */
export const supabase: SupabaseClient | undefined = url && key
  ? createClient(url, key, { global: { fetch: fetchWithKeepalive }, auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ritmo-auth' } })
  : undefined;
