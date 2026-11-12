// Persistence. Every account is required; data lives in Supabase per user (row-level security),
// with a per-user cache on the device for speed. Nothing is shared between accounts on one device.
import { del, get, set } from 'idb-keyval';
import type { Activity, CoachMessage, Plan, Profile, Race, SessionFeedback, SourceStatus } from '../lib/types';
import { supabase } from './supabase';
import { deriveSummary } from '../training/derive';

export interface AppData {
  mode: 'sample' | 'real' | 'empty';
  /** Server time of the newest run change this device has seen (for fetching only newer changes) */
  activitiesSyncedAt?: string;
  /** Features switched on for this account (granted on the server) */
  flags?: string[];
  profile: Profile;
  activities: Activity[];
  /** Imported runs the runner deleted (Strava, a watch, a file, Health). Kept, out of every list and stat, so the next
   *  sync does not bring them back, and so they can be re-imported from Data sources. */
  removed?: Activity[];
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

/** What the device keeps: the data, plus which runs the account is known to hold. */
export interface CachedData extends AppData { cloudIds?: string[] }

export async function loadUserCache(uid: string): Promise<CachedData | undefined> {
  try { return (await get(userKey(uid))) as CachedData | undefined; } catch { return undefined; }
}
/** Save on the device. Detailed data (streams, laps) of runs already in the account is left out: it is
 *  fetched again only when a run is opened. Runs not yet saved to the account keep their detail. */
export async function saveUserCache(uid: string, data: AppData, inCloud?: (a: Activity) => boolean) {
  try {
    const slim = (list: Activity[]) => (data.mode === 'real' && inCloud
      ? list.map((a) => ((a.streams || a.laps) && inCloud(a) ? { ...a, streams: undefined, laps: undefined } : a))
      : list);
    const removed = data.removed ?? [];
    const cloudIds = inCloud ? [...data.activities, ...removed].filter(inCloud).map((a) => a.id) : undefined;
    await set(userKey(uid), { ...data, activities: slim(data.activities), removed: slim(removed), cloudIds } satisfies CachedData);
  } catch (e) { console.warn('Could not save on this device', e); }
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

/** Summary columns of a run. The detailed data (streams, laps) is only written when this device has it,
 *  so saving a run loaded as a summary never erases its detail in the account. */
const summaryRow = (uid: string, a: Activity): Row => ({
  id: a.id, user_id: uid, source: a.source, source_ids: { ...withoutDeletedMark(a.sourceIds), ...(a.isTimeTrial ? { timeTrial: true } : {}), ...(a.notRace ? { notRace: true } : {}), ...(a.plannedSessionId ? { planned: a.plannedSessionId } : {}), ...(a.reps?.length ? { reps: a.reps } : {}), ...(a.media?.length ? { media: a.media } : {}), ...(a.device ? { device: a.device } : {}), ...(a.weather ? { weather: a.weather } : {}), ...(a.weatherSkip ? { weatherSkip: a.weatherSkip } : {}), ...(a.hidden ? { hidden: true } : {}), ...(a.distFrom ? { distFrom: a.distFrom } : {}), ...(a.shoeId ? { shoe: a.shoeId } : {}), ...(a.calories ? { kcal: a.calories } : {}), ...(a.deletedAt ? { deleted: a.deletedAt } : {}), ...(a.gear ? { gear: a.gear } : {}), ...(a.gpsGaps?.length ? { gaps: a.gpsGaps } : {}) }, start_time: a.startTime, name: a.name,
  distance_m: a.distanceM, duration_s: a.durationS, moving_s: a.movingS, elev_gain_m: a.elevGainM ?? null,
  avg_hr: a.avgHr ?? null, max_hr: a.maxHr ?? null, avg_cadence: a.avgCadence ?? null, is_race: !!a.isRace,
  detail_score: a.detailScore,
  ...(a.importedAt ? { imported_at: a.importedAt } : {}),
  // The summary is written only from detail on this device; for runs loaded as summaries the server keeps it
  ...(hasDetail(a) && deriveSummary(a) ? { derived: deriveSummary(a) } : {}),
});
/** The deleted mark is saved from deletedAt only, so a restored run never keeps an old one from its stored ids */
const withoutDeletedMark = (ids: Activity['sourceIds']) => { const { deleted: _d, gear: _g, gaps: _p, ...rest } = ids as Record<string, unknown>; return rest; }; // eslint-disable-line @typescript-eslint/no-unused-vars
const hasDetail = (a: Activity) => a.streams !== undefined || a.laps !== undefined;
/** Columns loaded for every run, with short names to keep years of history small: no streams or laps (fetched for
 *  one run at a time) and only the parts of the stored summary the app needs for the whole history. */
const SUMMARY_COLUMNS = 'id,k:source,x:source_ids,t:start_time,n:name,dm:distance_m,ds:duration_s,ms:moving_s,eg:elev_gain_m,ah:avg_hr,mh:max_hr,ac:avg_cadence,r:is_race,sc:detail_score,v:derived->v,be:derived->be,sg:derived->segs';
const num = (x: unknown) => (x == null ? undefined : Number(x));
const rowToAct = (r: Row): Activity => ({
  id: r.id as string, source: r.k as Activity['source'], sourceIds: (r.x ?? {}) as Activity['sourceIds'],
  startTime: r.t as string, name: r.n as string, sport: 'run', distanceM: Number(r.dm), durationS: Number(r.ds),
  movingS: Number(r.ms), elevGainM: num(r.eg), avgHr: num(r.ah), maxHr: num(r.mh), avgCadence: num(r.ac), isRace: !!r.r,
  isTimeTrial: !!(r.x as Record<string, unknown> | null)?.timeTrial, notRace: !!(r.x as Record<string, unknown> | null)?.notRace,
  plannedSessionId: ((r.x as Record<string, unknown> | null)?.planned as string | undefined) ?? undefined,
  reps: ((r.x as Record<string, unknown> | null)?.reps as Activity['reps']) ?? undefined,
  media: ((r.x as Record<string, unknown> | null)?.media as string[] | undefined) ?? undefined,
  device: ((r.x as Record<string, unknown> | null)?.device as string | undefined) ?? undefined,
  weather: ((r.x as Record<string, unknown> | null)?.weather as Activity['weather']) ?? undefined,
  weatherSkip: ((r.x as Record<string, unknown> | null)?.weatherSkip as string | undefined) ?? undefined,
  hidden: !!(r.x as Record<string, unknown> | null)?.hidden || undefined,
  distFrom: num((r.x as Record<string, unknown> | null)?.distFrom),
  shoeId: ((r.x as Record<string, unknown> | null)?.shoe as string | undefined) ?? undefined,
  calories: ((r.x as Record<string, unknown> | null)?.kcal as number | undefined) ?? undefined, detailScore: Number(r.sc),
  deletedAt: ((r.x as Record<string, unknown> | null)?.deleted as string | undefined) ?? undefined,
  gear: ((r.x as Record<string, unknown> | null)?.gear as Activity['gear']) ?? undefined,
  gpsGaps: ((r.x as Record<string, unknown> | null)?.gaps as Activity['gpsGaps']) ?? undefined,
  derived: r.v != null ? { v: Number(r.v), ...(r.be ? { be: r.be as Record<string, number> } : {}), ...(r.sg ? { segs: r.sg as number[] } : {}) } : undefined,
  importedAt: '',
});

/** Heart-rate bands of runs since a date (for the zones chart), which are not part of the run summaries. */
export async function fetchHrBands(sinceIso: string): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (!supabase) return out;
  const r = await supabase.from('activities').select('id,hrh:derived->hrh').gte('start_time', sinceIso);
  if (r.error) throw r.error;
  for (const x of (r.data ?? []) as unknown as { id: string; hrh: Record<string, number> | null }[]) if (x.hrh) out.set(x.id, x.hrh);
  return out;
}
const PAGE = 1000;

/** All run summaries changed after `since` (or all of them), newest first, in pages. There is no limit on
 *  the number of runs: pages are fetched until the account's count is reached. */
async function fetchSummaries(since?: string): Promise<{ rows: Row[]; newest?: string }> {
  if (!supabase) return { rows: [] };
  // The newest change time, read first: anything changed during the fetch is picked up again next time
  const top = await supabase.from('activities').select('updated_at').order('updated_at', { ascending: false }).limit(1);
  if (top.error) throw top.error;
  const newest = (top.data?.[0]?.updated_at as string | undefined) ?? since;
  const rows: Row[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('activities').select(SUMMARY_COLUMNS, from === 0 ? { count: 'exact' } : undefined)
      .order('start_time', { ascending: false }).order('id').range(from, from + PAGE - 1);
    if (since) q = q.gte('updated_at', since);
    const r = await q;
    if (r.error) throw r.error;
    if (from === 0) total = r.count;
    const page = (r.data ?? []) as unknown as Row[];
    rows.push(...page);
    if (!page.length || (total != null ? rows.length >= total : page.length < PAGE)) break;
  }
  return { rows, newest };
}

/** The account's runs as summaries: only changes since the last sync when the device has a copy. */
async function pullActivities(cache?: CachedData): Promise<{ activities: Activity[]; syncedAt?: string }> {
  if (!supabase) return { activities: [] };
  const byStart = (x: Activity, y: Activity) => x.startTime.localeCompare(y.startTime);
  if (cache?.mode === 'real' && cache.activitiesSyncedAt && cache.cloudIds) {
    const since = cache.activitiesSyncedAt;
    const [delta, dels, count] = await Promise.all([
      fetchSummaries(since),
      supabase.from('activity_deletions').select('id').gte('deleted_at', since),
      supabase.from('activities').select('id', { count: 'exact', head: true }),
    ]);
    if (dels.error) throw dels.error;
    if (count.error) throw count.error;
    const gone = new Set((dels.data ?? []).map((x) => x.id as string));
    const known = new Set(cache.cloudIds);
    const map = new Map([...cache.activities, ...(cache.removed ?? [])].filter((a) => known.has(a.id) && !gone.has(a.id)).map((a) => [a.id, { ...a, streams: undefined, laps: undefined } as Activity]));
    for (const r of delta.rows) map.set(r.id as string, rowToAct(r));
    // If anything does not add up (e.g. changes made elsewhere while offline for long), load everything again
    if (map.size === count.count) return { activities: [...map.values()].sort(byStart), syncedAt: delta.newest && delta.newest > since ? delta.newest : since };
  }
  const all = await fetchSummaries();
  return { activities: all.rows.map(rowToAct).sort(byStart), syncedAt: all.newest };
}

/** The detailed data of one run (streams and laps), for the run page. */
export async function fetchRunDetail(id: string): Promise<Pick<Activity, 'streams' | 'laps'> | undefined> {
  if (!supabase) return undefined;
  const r = await supabase.from('activities').select('streams,laps').eq('id', id).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return undefined;
  return { streams: (r.data.streams as Activity['streams']) ?? undefined, laps: (r.data.laps as Activity['laps']) ?? undefined };
}

/** Runs whose stored summary is missing or out of date: the derive-runs function fills them in on the server,
 *  from data already in the account, a batch at a time. Returns the new summaries. */
export async function deriveMissing(onBatch: (updates: { id: string; derived: Activity['derived'] }[]) => void): Promise<void> {
  if (!supabase) return;
  for (let i = 0; i < 2000; i++) {
    const r = await supabase.functions.invoke('derive-runs', { body: {} });
    if (r.error) throw r.error;
    const out = r.data as { updated: { id: string; derived: Activity['derived'] }[]; remaining: number };
    if (out.updated.length) onBatch(out.updated);
    if (!out.remaining || !out.updated.length) return;
  }
}

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
export async function pullFromCloud(cache?: CachedData): Promise<CloudSnapshot> {
  if (!supabase) return { found: false };
  const p = await supabase.from('profiles').select('data').maybeSingle();
  if (p.error) throw p.error;
  if (!p.data) return { found: false };
  const stored = p.data.data as { profile?: Profile; mode?: AppData['mode']; sources?: SourceStatus[] } & Partial<Profile>;
  const profile = (stored.profile ?? stored) as Profile;
  const mode = stored.mode ?? 'real';
  const [coach, flags] = await Promise.all([
    supabase.from('coach_messages').select('data').order('created_at'),
    supabase.from('feature_flags').select('flag'),
  ]);
  if (coach.error) throw coach.error;
  const base: Partial<AppData> = { profile, mode, sources: stored.sources ?? [], coach: (coach.data ?? []).map((x) => x.data as CoachMessage),
    flags: flags.error ? [] : (flags.data ?? []).map((x) => x.flag as string) };
  if (mode !== 'real') return { found: true, data: base };
  const [a, r, pl, f] = await Promise.all([
    pullActivities(cache),
    supabase.from('races').select('data'),
    supabase.from('plans').select('data').order('updated_at', { ascending: false }).limit(1),
    supabase.from('session_feedback').select('data'),
  ]);
  for (const res of [r, pl, f]) if (res.error) throw res.error;
  return {
    found: true,
    data: {
      ...base,
      activities: a.activities.filter((x) => !x.deletedAt),
      removed: a.activities.filter((x) => x.deletedAt),
      activitiesSyncedAt: a.syncedAt,
      races: (r.data ?? []).map((x) => x.data as Race),
      plan: (pl.data?.[0]?.data as Plan) ?? undefined,
      feedback: (f.data ?? []).map((x) => x.data as SessionFeedback),
    },
  };
}

/** Tracks what has been saved so each save only sends changes. */
export interface PushState {
  activities: Map<string, string>; // id -> fingerprint of what was saved
  coach: Set<string>;
  profileJson?: string;
  racesJson?: string;
  planJson?: string;
  feedbackJson?: string;
}
export const newPushState = (): PushState => ({ activities: new Map(), coach: new Set() });

/** What decides whether a run needs saving again */
export const actPrint = (a: Activity) => `${a.detailScore}|${a.isRace ? 1 : 0}|${a.isTimeTrial ? 1 : 0}|${a.notRace ? 1 : 0}|${a.plannedSessionId ?? ''}|${a.reps?.length ?? 0}|${a.media?.length ?? 0}|${a.name}|${a.derived?.v ?? 0}|${a.distanceM}|${a.movingS}|${a.durationS}|${a.hidden ? 1 : 0}|${a.shoeId ?? ''}|${a.distFrom ?? ''}|${a.weather?.at ?? ''}|${a.weatherSkip ?? ''}|${a.device ?? ''}|${a.deletedAt ?? ''}|${a.gear?.id ?? ''}|${a.gpsGaps?.map((g) => g.resolved ?? '-').join('') ?? ''}`;

export function markPulled(ps: PushState, d: AppData) {
  for (const a of [...d.activities, ...(d.removed ?? [])]) ps.activities.set(a.id, actPrint(a));
  for (const m of d.coach) ps.coach.add(m.id);
  ps.profileJson = JSON.stringify({ profile: d.profile, mode: d.mode, sources: d.sources });
  ps.racesJson = JSON.stringify(d.races);
  ps.planJson = JSON.stringify(d.plan ?? null);
  ps.feedbackJson = JSON.stringify(d.feedback);
}

/** Save runs that changed since the last save (or were never saved) to the account. */
export async function pushActivities(uid: string, acts: Activity[], ps: PushState): Promise<void> {
  if (!supabase) return;
  const changed = acts.filter((a) => ps.activities.get(a.id) !== actPrint(a));
  // Only columns this device actually has are written: runs loaded as summaries never erase their detail or
  // summary in the account. Rows in one request must share the same columns, so they are grouped by columns.
  const groups = new Map<string, { a: Activity; row: Row }[]>();
  for (const a of changed) {
    const row = hasDetail(a) ? { ...summaryRow(uid, a), laps: a.laps ?? null, streams: a.streams ?? null } : summaryRow(uid, a);
    const k = Object.keys(row).sort().join(',');
    groups.set(k, [...(groups.get(k) ?? []), { a, row }]);
  }
  for (const group of groups.values()) {
    const size = hasDetail(group[0].a) ? 50 : 500;
    for (let i = 0; i < group.length; i += size) {
      const chunk = group.slice(i, i + size);
      const r = await supabase.from('activities').upsert(chunk.map((x) => x.row), { defaultToNull: false });
      if (r.error) throw r.error;
      chunk.forEach((x) => ps.activities.set(x.a.id, actPrint(x.a)));
    }
  }
}

export async function pushToCloud(uid: string, d: AppData, ps: PushState): Promise<void> {
  if (!supabase || d.mode === 'empty' && !d.profile.onboarded && !d.profile.healthConsentAt && !d.profile.consents && !d.profile.setupStep) return;
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
  await pushActivities(uid, [...d.activities, ...(d.removed ?? [])], ps);
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

/** Deletes runs from the account (after merging duplicates). Other devices drop them through activity_deletions. */
export async function deleteRunsInCloud(ids: string[]) {
  if (!supabase || !ids.length) return;
  const r = await supabase.from('activities').delete().in('id', ids);
  if (r.error) throw r.error;
}

/** Deleting a run also removes what hangs off it: how it felt, and any Hub post (its Fuego and comments go with it). */
export async function deleteRunExtrasInCloud(uid: string, id: string, alsoFeedback: boolean) {
  if (!supabase) return;
  const p = await supabase.from('posts').delete().eq('user_id', uid).eq('activity_id', id);
  if (p.error) throw p.error;
  if (alsoFeedback) { const f = await supabase.from('session_feedback').delete().eq('user_id', uid).eq('activity_id', id); if (f.error) throw f.error; }
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
