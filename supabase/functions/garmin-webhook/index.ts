// Receives Garmin push notifications (deploy with --no-verify-jwt: Garmin does not send a Supabase token).
// Handles: activities (summaries), activityDetails (samples and laps), deregistrations, userPermissionsChange.
// Answers 200 straight away for anything it understands; runs are stored in garmin_inbox for the runner's app,
// which turns them into Ritmo runs with the same merge rules as file uploads.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { admin } from '../_shared/garmin.ts';

const RUN_TYPES = /RUN/i; // RUNNING, TRAIL_RUNNING, TREADMILL_RUNNING, TRACK_RUNNING, INDOOR_RUNNING, VIRTUAL_RUN, ULTRA_RUN...
type Item = Record<string, unknown> & { userId?: string; summaryId?: string | number; activityType?: string; summary?: { activityType?: string } };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });
  let body: Record<string, Item[]>;
  try { body = await req.json(); } catch { return new Response('bad request', { status: 400 }); }
  const db = admin();

  // Map Garmin user ids to Ritmo accounts. Notifications for unknown users are ignored (not an error for Garmin).
  const all = Object.values(body).flat().filter((x) => x && typeof x === 'object') as Item[];
  const ids = [...new Set(all.map((x) => x.userId).filter(Boolean))] as string[];
  if (!ids.length) return new Response('ok', { status: 200 });
  const { data: links } = await db.from('garmin_connections').select('user_id,garmin_user_id').in('garmin_user_id', ids);
  const owner = new Map((links ?? []).map((l) => [l.garmin_user_id as string, l.user_id as string]));

  const rows: { user_id: string; summary_id: string; kind: 'summary' | 'details'; payload: Item }[] = [];
  for (const a of body.activities ?? []) {
    const uid = owner.get(a.userId ?? '');
    if (uid && a.summaryId != null && RUN_TYPES.test(String(a.activityType ?? ''))) rows.push({ user_id: uid, summary_id: String(a.summaryId), kind: 'summary', payload: a });
  }
  for (const a of body.activityDetails ?? []) {
    const uid = owner.get(a.userId ?? '');
    const type = String(a.summary?.activityType ?? a.activityType ?? '');
    if (uid && a.summaryId != null && RUN_TYPES.test(type)) rows.push({ user_id: uid, summary_id: String(a.summaryId).replace(/-detail$/, ''), kind: 'details', payload: a });
  }
  if (rows.length) {
    const r = await db.from('garmin_inbox').upsert(rows, { onConflict: 'user_id,summary_id,kind' });
    // A storage failure asks Garmin to retry later
    if (r.error) return new Response('retry', { status: 500 });
  }

  // The runner removed Ritmo in Garmin Connect: forget the tokens and anything still waiting
  for (const d of body.deregistrations ?? []) {
    const uid = owner.get(d.userId ?? '');
    if (!uid) continue;
    await db.from('garmin_connections').delete().eq('user_id', uid);
    await db.from('garmin_inbox').delete().eq('user_id', uid);
  }
  for (const p of body.userPermissionsChange ?? []) {
    const uid = owner.get(p.userId ?? '');
    if (!uid) continue;
    const permissions = (p.permissions as string[] | undefined) ?? [];
    await db.from('garmin_connections').update({ permissions, updated_at: new Date().toISOString() }).eq('user_id', uid);
    // Without activity sharing nothing new will arrive; anything waiting is removed
    if (!permissions.includes('ACTIVITY_EXPORT')) await db.from('garmin_inbox').delete().eq('user_id', uid);
  }
  return new Response('ok', { status: 200 });
});
