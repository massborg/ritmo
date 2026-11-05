// Persistence. Local-first in IndexedDB; mirrored to Supabase when the runner signs in.
import { get, set, del } from 'idb-keyval';
import type { Activity, CoachMessage, Plan, Profile, Race, SessionFeedback, SourceStatus } from '../lib/types';
import { supabase } from './supabase';

export interface AppData {
  mode: 'sample' | 'real' | 'empty';
  profile: Profile;
  activities: Activity[];
  races: Race[];
  plan?: Plan;
  feedback: SessionFeedback[];
  coach: CoachMessage[];
  sources: SourceStatus[];
}

const KEY = 'ritmo:data:v1';

export const EMPTY_PROFILE: Profile = {
  name: '',
  units: 'km',
  theme: 'system',
  goal: '',
  daysAvailable: [1, 3, 5, 6],
  longRunDay: 6,
  injuries: [],
  onboarded: false,
};

export const emptyData = (): AppData => ({
  mode: 'empty',
  profile: { ...EMPTY_PROFILE },
  activities: [],
  races: [],
  feedback: [],
  coach: [],
  sources: [],
});

export async function loadLocal(): Promise<AppData | undefined> {
  try {
    return (await get(KEY)) as AppData | undefined;
  } catch {
    return undefined;
  }
}

export async function saveLocal(data: AppData) {
  try {
    await set(KEY, data);
  } catch (e) {
    console.warn('Could not save locally', e);
  }
}

export async function clearLocal() {
  try { await del(KEY); } catch { /* ignore */ }
}

// ---------------- Supabase mirror ----------------
// Sample data is never uploaded. Real data is stored per user with row-level security.

type Row = Record<string, unknown>;

const actToRow = (uid: string, a: Activity): Row => ({
  id: a.id, user_id: uid, source: a.source, source_ids: a.sourceIds, start_time: a.startTime, name: a.name,
  distance_m: a.distanceM, duration_s: a.durationS, moving_s: a.movingS, elev_gain_m: a.elevGainM ?? null,
  avg_hr: a.avgHr ?? null, max_hr: a.maxHr ?? null, avg_cadence: a.avgCadence ?? null, is_race: !!a.isRace,
  detail_score: a.detailScore, laps: a.laps ?? null, streams: a.streams ?? null, imported_at: a.importedAt,
});
const rowToAct = (r: Row): Activity => ({
  id: r.id as string, source: r.source as Activity['source'], sourceIds: (r.source_ids ?? {}) as Activity['sourceIds'],
  startTime: r.start_time as string, name: r.name as string, sport: 'run', distanceM: Number(r.distance_m), durationS: Number(r.duration_s),
  movingS: Number(r.moving_s), elevGainM: (r.elev_gain_m as number) ?? undefined, avgHr: (r.avg_hr as number) ?? undefined,
  maxHr: (r.max_hr as number) ?? undefined, avgCadence: (r.avg_cadence as number) ?? undefined, isRace: !!r.is_race,
  detailScore: Number(r.detail_score), laps: (r.laps as Activity['laps']) ?? undefined, streams: (r.streams as Activity['streams']) ?? undefined,
  importedAt: r.imported_at as string,
});

export async function pushToCloud(data: AppData): Promise<string | undefined> {
  if (!supabase || data.mode !== 'real') return;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  try {
    const p = await supabase.from('profiles').upsert({ user_id: uid, data: data.profile, updated_at: new Date().toISOString() });
    if (p.error) throw p.error;
    for (let i = 0; i < data.activities.length; i += 200) {
      const r = await supabase.from('activities').upsert(data.activities.slice(i, i + 200).map((a) => actToRow(uid, a)));
      if (r.error) throw r.error;
    }
    if (data.races.length) {
      const r = await supabase.from('races').upsert(data.races.map((x) => ({ id: x.id, user_id: uid, data: x })));
      if (r.error) throw r.error;
    }
    if (data.plan) {
      const r = await supabase.from('plans').upsert({ id: data.plan.id, user_id: uid, data: data.plan, updated_at: new Date().toISOString() });
      if (r.error) throw r.error;
    }
    if (data.feedback.length) {
      const r = await supabase.from('session_feedback').upsert(data.feedback.map((f) => ({ activity_id: f.activityId, user_id: uid, data: f })));
      if (r.error) throw r.error;
    }
    return undefined;
  } catch (e) {
    return (e as Error).message ?? 'Cloud sync failed';
  }
}

export async function pullFromCloud(): Promise<Partial<AppData> | undefined> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const [p, a, r, pl, f] = await Promise.all([
    supabase.from('profiles').select('data').maybeSingle(),
    supabase.from('activities').select('*').order('start_time'),
    supabase.from('races').select('data'),
    supabase.from('plans').select('data').order('updated_at', { ascending: false }).limit(1),
    supabase.from('session_feedback').select('data'),
  ]);
  if (!p.data && !(a.data ?? []).length) return undefined;
  return {
    mode: 'real',
    profile: p.data?.data as Profile,
    activities: (a.data ?? []).map(rowToAct),
    races: (r.data ?? []).map((x) => x.data as Race),
    plan: (pl.data?.[0]?.data as Plan) ?? undefined,
    feedback: (f.data ?? []).map((x) => x.data as SessionFeedback),
  };
}

export async function deleteCloudData(): Promise<string | undefined> {
  if (!supabase) return;
  const { error } = await supabase.rpc('delete_my_data');
  return error?.message;
}
