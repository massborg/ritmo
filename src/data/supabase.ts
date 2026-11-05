import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase client. The implicit flow is used so that confirmation and password-reset links
 * work even when opened on a different device or browser from the one that requested them.
 */
export const supabase: SupabaseClient | undefined = url && key
  ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ritmo-auth' } })
  : undefined;
