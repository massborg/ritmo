// Persistence. Every account is required; data lives in Supabase per user (row-level security),
// with a per-user cache on the device for speed. Nothing is shared between accounts on one device.
import { del, get, set } from 'idb-keyval';
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

export const EMPTY_PROFILE: Profile = {
  name: '',
  units: 'km',
  theme: 'system',
  goal: '',
  daysAvailable: [1, 3, 5],
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

// ---------------- Device cache (per user) ----------------
const userKey = (uid: string) => `ritmo:user:${uid}`;
/** Data saved by earlier versions that worked without an account */
export const LEGACY_KEY = 'ritmo:data:v1';

export async function loadUserCache(uid: string): Promise<AppData | undefined> {
  try { return (await get(userKey(uid))) as AppData | undefined; } catch { return undefined; }
}
export async function saveUserCache(uid: string, data: AppData) {
  try { await set(userKey(uid), data); } catch (e) { console.warn('Could not save on this device', e); }
}
export async function clearUserCache(uid: string) {
  try { await del(userKey(uid)); } catch { /* ignore */ }
}
export async function loadLegacy(): Promise<AppData | undefined> {
  try {
    const d = (await get(LEGACY_KEY)) as AppData | undefined;
    return d && d.mode === 'real' && (d.activities.length > 0 || d.races.length > 0) ? d : undefined;
  } catch { return undefined; }
}
export async function clearLegacy() {
  try { await del(LEGACY_KEY); } catch { /* ignore */ }
}

// ---------------- Cloud ----------------
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
  isTimeTrial: !!(r.source_ids as Record<string, unknown> | null)?.timeTrial,
  detailScore: Number(r.detail_score), laps: (r.laps as Activity['laps']) ?? undefined, streams: (r.streams as Activity['streams']) ?? undefined,
  importedAt: r.imported_at as string,
});

/** Turn Supabase and network errors into plain language. */
export function friendlyError(e: unknown): string {
  const err = e as { message?: string; code?: string; status?: number; name?: string };
  const msg = err?.message ?? String(e);
  if (/fetch|network|Failed to fetch|NetworkError|Load failed/i.test(msg) || err?.name === 'TypeError') return 'Ritmo cannot reach the server. Check your internet connection and try again.';
  if (err?.status === 401 || /JWT|not_signed_in/i.test(msg)) return 'Your session has expired. Please log in again.';
  return msg;
}

export interface CloudSnapshot { found: boolean; data?: Partial<AppData> }

/** Load everything for the signed-in user. Row-level security returns only their rows. */
export async function pullFromCloud(): Promise<CloudSnapshot> {
  if (!supabase) return { found: false };
  const p = await supabase.from('profiles').select('data').maybeSingle();
  if (p.error) throw p.error;
  if (!p.data) return { found: false };
  const stored = p.data.data as { profile?: Profile; mode?: AppData['mode']; sources?: SourceStatus[] } & Partial<Profile>;
  const profile = (stored.profile ?? stored) as Profile;
  const mode = stored.mode ?? 'real';
  const coach = await supabase.from('coach_messages').select('data').order('created_at');
  if (coach.error) throw coach.error;
  const base: Partial<AppData> = { profile, mode, sources: stored.sources ?? [], coach: (coach.data ?? []).map((x) => x.data as CoachMessage) };
  if (mode !== 'real') return { found: true, data: base };
  const [a, r, pl, f] = await Promise.all([
    supabase.from('activities').select('*').order('start_time'),
    supabase.from('races').select('data'),
    supabase.from('plans').select('data').order('updated_at', { ascending: false }).limit(1),
    supabase.from('session_feedback').select('data'),
  ]);
  for (const res of [a, r, pl, f]) if (res.error) throw res.error;
  return {
    found: true,
    data: {
      ...base,
      activities: (a.data ?? []).map(rowToAct),
      races: (r.data ?? []).map((x) => x.data as Race),
      plan: (pl.data?.[0]?.data as Plan) ?? undefined,
      feedback: (f.data ?? []).map((x) => x.data as SessionFeedback),
    },
  };
}

/** Tracks what has been saved so each save only sends changes. */
export interface PushState {
  activities: Map<string, number>; // id -> detail score saved
  coach: Set<string>;
  profileJson?: string;
  racesJson?: string;
  planJson?: string;
  feedbackJson?: string;
}
export const newPushState = (): PushState => ({ activities: new Map(), coach: new Set() });

export function markPulled(ps: PushState, d: AppData) {
  for (const a of d.activities) ps.activities.set(a.id, a.detailScore);
  for (const m of d.coach) ps.coach.add(m.id);
  ps.profileJson = JSON.stringify({ profile: d.profile, mode: d.mode, sources: d.sources });
  ps.racesJson = JSON.stringify(d.races);
  ps.planJson = JSON.stringify(d.plan ?? null);
  ps.feedbackJson = JSON.stringify(d.feedback);
}

export async function pushToCloud(uid: string, d: AppData, ps: PushState): Promise<void> {
  if (!supabase || d.mode === 'empty' && !d.profile.onboarded && !d.profile.healthConsentAt) return;
  const profileJson = JSON.stringify({ profile: d.profile, mode: d.mode, sources: d.sources });
  if (profileJson !== ps.profileJson) {
    const r = await supabase.from('profiles').upsert({ user_id: uid, data: JSON.parse(profileJson), updated_at: new Date().toISOString() });
    if (r.error) throw r.error;
    ps.profileJson = profileJson;
  }
  const newMsgs = d.coach.filter((m) => !ps.coach.has(m.id));
  if (newMsgs.length) {
    const r = await supabase.from('coach_messages').upsert(newMsgs.map((m) => ({ id: m.id, user_id: uid, data: m, created_at: m.at })));
    if (r.error) throw r.error;
    newMsgs.forEach((m) => ps.coach.add(m.id));
  }
  if (d.mode !== 'real') return; // sample data is regenerated on the device and never uploaded
  const changed = d.activities.filter((a) => ps.activities.get(a.id) !== a.detailScore);
  for (let i = 0; i < changed.length; i += 100) {
    const chunk = changed.slice(i, i + 100);
    const r = await supabase.from('activities').upsert(chunk.map((a) => ({ ...actToRow(uid, a), source_ids: { ...a.sourceIds, ...(a.isTimeTrial ? { timeTrial: true } : {}) } })));
    if (r.error) throw r.error;
    chunk.forEach((a) => ps.activities.set(a.id, a.detailScore));
  }
  const racesJson = JSON.stringify(d.races);
  if (racesJson !== ps.racesJson && d.races.length) {
    const r = await supabase.from('races').upsert(d.races.map((x) => ({ id: x.id, user_id: uid, data: x })));
    if (r.error) throw r.error;
  }
  ps.racesJson = racesJson;
  const planJson = JSON.stringify(d.plan ?? null);
  if (planJson !== ps.planJson && d.plan) {
    const r = await supabase.from('plans').upsert({ id: d.plan.id, user_id: uid, data: d.plan, updated_at: new Date().toISOString() });
    if (r.error) throw r.error;
  }
  ps.planJson = planJson;
  const feedbackJson = JSON.stringify(d.feedback);
  if (feedbackJson !== ps.feedbackJson && d.feedback.length) {
    const r = await supabase.from('session_feedback').upsert(d.feedback.map((f) => ({ activity_id: f.activityId, user_id: uid, data: f })));
    if (r.error) throw r.error;
  }
  ps.feedbackJson = feedbackJson;
}

export async function deleteRaceInCloud(id: string) {
  if (!supabase) return;
  const r = await supabase.from('races').delete().eq('id', id);
  if (r.error) throw r.error;
}
export async function clearCoachInCloud() {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const r = await supabase.from('coach_messages').delete().eq('user_id', u.user.id);
  if (r.error) throw r.error;
}
/** Remove old plans when a new one replaces them, so only one plan is stored. */
export async function deleteOtherPlans(keepId: string) {
  if (!supabase) return;
  const r = await supabase.from('plans').delete().neq('id', keepId);
  if (r.error) throw r.error;
}

/** Deletes the account and, through cascading deletes, every row the user owns. */
export async function deleteAccount(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  if (!data?.deleted) throw new Error('The account could not be deleted. Please try again.');
}
