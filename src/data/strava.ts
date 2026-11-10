// Strava (API v3, push). The webhook and the 30-day backfill store each run in strava_inbox; the app turns those into
// Ritmo runs here and merges them like any other source. Behind the 'strava' flag.
// Strava's API agreement: Strava data is shown only to the runner it belongs to and is never used with AI. Runs that
// came from Strava (isStravaRun) cannot be posted to the Hub or shared as images, and are left out of everything the
// AI coach and Body chat are told.
import type { Activity, Lap, StreamPoint } from '../lib/types';
import { detailScore } from './integration';
import { supabase as client } from './supabase';

const supabase = () => {
  if (!client) throw new Error('Ritmo is not connected to its server.');
  return client;
};

/** Fields of a Strava DetailedActivity that Ritmo uses. */
export interface StravaActivity {
  id?: number | string;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number; // per leg for runs
  device_name?: string;
  trainer?: boolean;
  laps?: { lap_index?: number; elapsed_time?: number; distance?: number; start_index?: number; average_heartrate?: number }[];
}
type Stream<T> = { data?: T[] } | undefined;
export interface StravaStreams { time?: Stream<number>; distance?: Stream<number>; latlng?: Stream<[number, number]>; heartrate?: Stream<number>; altitude?: Stream<number>; cadence?: Stream<number> }

export const isStravaSportRun = (a: StravaActivity) => /^(Run|TrailRun|VirtualRun)$/.test(a.sport_type ?? a.type ?? '');

/** A Ritmo run from a Strava activity and its streams; null for anything that is not a run. */
export function stravaToActivity(a: StravaActivity, s: StravaStreams = {}): Activity | null {
  if (a.id == null || !isStravaSportRun(a) || !a.start_date) return null;
  const id = String(a.id);
  const t = s.time?.data ?? [];
  let streams: StreamPoint[] | undefined;
  if (t.length > 1) {
    const d = s.distance?.data, ll = s.latlng?.data, hr = s.heartrate?.data, alt = s.altitude?.data, cad = s.cadence?.data;
    let lastD = 0;
    streams = t.map((sec, i) => {
      const dist = d?.[i] ?? lastD;
      lastD = dist;
      const p: StreamPoint = { t: sec, d: dist };
      if (hr?.[i]) p.hr = hr[i];
      if (cad?.[i]) p.cad = Math.round(cad[i] * 2); // Strava gives running cadence per leg
      if (alt?.[i] != null) p.alt = alt[i];
      if (ll?.[i]) { p.lat = ll[i][0]; p.lon = ll[i][1]; }
      return p;
    });
  }
  let laps: Lap[] | undefined;
  if ((a.laps?.length ?? 0) > 1) {
    let startS = 0;
    laps = a.laps!.map((l, i) => {
      const lap: Lap = { index: i, startS: streams && l.start_index != null ? streams[Math.min(l.start_index, streams.length - 1)].t : startS, durationS: l.elapsed_time ?? 0, distanceM: l.distance ?? 0, ...(l.average_heartrate ? { avgHr: Math.round(l.average_heartrate) } : {}) };
      startS = lap.startS + lap.durationS;
      return lap;
    });
  }
  const run: Activity = {
    id: `strava-${id}`, source: 'strava', sourceIds: { strava: id },
    startTime: new Date(a.start_date).toISOString(), name: a.name?.trim() || 'Run', sport: 'run',
    distanceM: a.distance ?? (streams ? streams[streams.length - 1].d : 0),
    durationS: a.elapsed_time ?? (streams ? streams[streams.length - 1].t : 0),
    movingS: a.moving_time ?? a.elapsed_time ?? 0,
    ...(a.total_elevation_gain != null ? { elevGainM: Math.round(a.total_elevation_gain) } : {}),
    ...(a.average_heartrate ? { avgHr: Math.round(a.average_heartrate) } : {}),
    ...(a.max_heartrate ? { maxHr: Math.round(a.max_heartrate) } : {}),
    ...(a.average_cadence ? { avgCadence: Math.round(a.average_cadence * 2) } : {}),
    ...(laps ? { laps } : {}), ...(streams ? { streams } : {}),
    ...(a.device_name ? { device: a.device_name } : {}),
    detailScore: 0, importedAt: new Date().toISOString(),
  };
  run.detailScore = detailScore(run);
  return run;
}

/** Runs whose data came from Strava: only for the runner's own eyes, never for the Hub, share images or AI. */
export const isStravaRun = (a: Pick<Activity, 'source'>) => a.source === 'strava';
/** Strava's attribution link for a run that came from Strava. */
export const stravaUrl = (a: Pick<Activity, 'source' | 'sourceIds'>) => (isStravaRun(a) && a.sourceIds.strava ? `https://www.strava.com/activities/${a.sourceIds.strava}` : undefined);

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke('strava-auth', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.message) msg = j.message; } catch { /* keep the generic message */ }
    throw new Error(msg);
  }
  return data as T;
}

/** Open Strava's consent page. The runner comes back to /strava/callback. */
export async function startStravaConnect(): Promise<void> {
  const { url } = await call<{ url: string }>({ action: 'start' });
  window.location.assign(url);
}
export const finishStravaConnect = (code: string, state: string, scope: string) => call<{ connected: boolean; backfillDays?: number }>({ action: 'finish', code, state, scope });
export const disconnectStrava = () => call<{ connected: boolean }>({ action: 'disconnect' });
/** Ask the server to check Strava for recent runs Ritmo has not got yet (behind the webhook); they land in the inbox */
export const requestStravaSync = () => call<{ queued: number; checkedAt: string }>({ action: 'sync' });

export async function stravaConnected(): Promise<boolean> {
  if (!client) return false;
  const { data, error } = await client.rpc('strava_status');
  return !error && Array.isArray(data) && data.length > 0;
}

/** Runs (and deletions) Strava has sent since the last sync, plus a function to clear them once applied. */
export async function pullStravaInbox(): Promise<{ runs: Activity[]; deleted: string[]; clear: () => Promise<void> }> {
  const { data, error } = await supabase().from('strava_inbox').select('id,activity_id,payload').order('received_at').limit(500);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const runs: Activity[] = [], deleted: string[] = [];
  for (const r of rows) {
    const p = r.payload as { deleted?: boolean; activity?: StravaActivity; streams?: StravaStreams };
    if (p?.deleted) { deleted.push(String(r.activity_id)); continue; }
    const a = p?.activity ? stravaToActivity(p.activity, p.streams) : null;
    if (a) runs.push(a);
  }
  const ids = rows.map((r) => r.id as number);
  return { runs, deleted, clear: async () => { if (ids.length) await supabase().from('strava_inbox').delete().in('id', ids); } };
}
