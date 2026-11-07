// Deletes the signed-in user's account. All their rows are removed by ON DELETE CASCADE.
// The user is identified from their own access token; the request body is ignored, so nobody can delete someone else.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { deregister } from '../_shared/garmin.ts';
import { deauthorize as stravaDeauthorize } from '../_shared/strava.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) return json({ error: 'not_signed_in' }, 401);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // Remove stored files first (profile picture, run screenshots). Rows go with the account below.
  const files = await admin.storage.from('avatars').list(data.user.id, { limit: 100 });
  if (files.data?.length) {
    const rm = await admin.storage.from('avatars').remove(files.data.map((f) => `${data.user.id}/${f.name}`));
    if (rm.error) return json({ error: 'delete_failed', message: `Your profile picture could not be removed: ${rm.error.message}` }, 500);
  }
  // Run screenshots: run-media/<user>/<run or session>/<file>
  const uid = data.user.id;
  const top = await admin.storage.from('run-media').list(uid, { limit: 1000 });
  for (const entry of top.data ?? []) {
    const inner = entry.id ? [`${uid}/${entry.name}`] : ((await admin.storage.from('run-media').list(`${uid}/${entry.name}`, { limit: 1000 })).data ?? []).map((f) => `${uid}/${entry.name}/${f.name}`);
    if (inner.length) {
      const rm = await admin.storage.from('run-media').remove(inner);
      if (rm.error) return json({ error: 'delete_failed', message: `Your run screenshots could not be removed: ${rm.error.message}` }, 500);
    }
  }
  // Garmin: tell Garmin to stop sending data before the tokens go with the account
  await deregister(admin, uid);
  // Strava: revoke Ritmo's access at Strava too (its terms require it when the runner leaves)
  await stravaDeauthorize(admin, uid);
  const del = await admin.auth.admin.deleteUser(data.user.id);
  if (del.error) return json({ error: 'delete_failed', message: del.error.message }, 500);
  return json({ deleted: true });
});
