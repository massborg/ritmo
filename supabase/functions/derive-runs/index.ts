// Fills in each run's stored summary (best efforts, structure, heart-rate bands) from the detailed data already
// in the account, a batch at a time, so the app never has to download every run's streams to work them out.
// Works only on the caller's own runs (row-level security, with the caller's own token).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { DERIVED_VERSION, deriveCore } from '../_shared/derive-core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const BATCH = 40;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await db.auth.getUser();
  if (!who?.user) return json({ error: 'not_signed_in' }, 401);
  const stale = `derived.is.null,derived->>v.lt.${DERIVED_VERSION}`;
  const r = await db.from('activities').select('id,streams,laps').or(stale).order('start_time', { ascending: false }).limit(BATCH);
  if (r.error) return json({ error: 'read_failed', message: r.error.message }, 500);
  const updated: { id: string; derived: unknown }[] = [];
  for (const row of r.data ?? []) {
    // Runs without any detail still get a summary (with only the version), so they are not asked about again
    const derived = deriveCore(row.streams, row.laps) ?? { v: DERIVED_VERSION };
    const u = await db.from('activities').update({ derived }).eq('id', row.id);
    if (u.error) return json({ error: 'write_failed', message: u.error.message, updated }, 500);
    updated.push({ id: row.id, derived });
  }
  const left = await db.from('activities').select('id', { count: 'exact', head: true }).or(stale);
  return json({ updated, remaining: left.count ?? 0 });
});
