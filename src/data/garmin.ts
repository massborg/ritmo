// Garmin Connect (Activity API, push). Garmin sends each new run to our webhook, which stores it in garmin_inbox;
// the app turns those into Ritmo runs here and merges them like any other source. Behind the 'garmin' flag.
import type { Activity, Lap, StreamPoint } from '../lib/types';
import { detailScore } from './integration';
import { supabase as client } from './supabase';

const supabase = () => {
  if (!client) throw new Error('Ritmo is not connected to its server.');
  return client;
};

/** Fields of a Garmin activity summary that Ritmo uses (Activity API). */
export interface GarminSummary {
  summaryId?: string | number;
  activityId?: string | number;
  activityName?: string;
  activityType?: string;
  deviceName?: string;
  manual?: boolean;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  movingDurationInSeconds?: number;
  distanceInMeters?: number;
  averageHeartRateInBeatsPerMinute?: number;
  activeKilocalories?: number;
  maxHeartRateInBeatsPerMinute?: number;
  averageRunCadenceInStepsPerMinute?: number;
  totalElevationGainInMeters?: number;
}
interface GarminSample {
  startTimeInSeconds?: number;
  totalDistanceInMeters?: number;
  heartRate?: number;
  stepsPerMinute?: number;
  runCadenceInStepsPerMinute?: number;
  elevationInMeters?: number;
  latitudeInDegree?: number;
  longitudeInDegree?: number;
}
export interface GarminDetails {
  summaryId?: string | number;
  summary?: GarminSummary;
  samples?: GarminSample[];
  laps?: { startTimeInSeconds?: number }[];
}

const isRun = (type?: string) => !!type && /RUN/i.test(type);

/** Turn a Garmin summary and/or its details into a Ritmo run. Returns null for anything that is not a run. */
export function garminToActivity(summary?: GarminSummary, details?: GarminDetails): Activity | null {
  const s: GarminSummary = { ...(details?.summary ?? {}), ...(summary ?? {}) };
  const summaryId = String(summary?.summaryId ?? details?.summaryId ?? '').replace(/-detail$/, '');
  if (!summaryId || !isRun(s.activityType) || s.startTimeInSeconds == null) return null;
  const start = s.startTimeInSeconds;

  let streams: StreamPoint[] | undefined;
  const samples = (details?.samples ?? []).filter((p) => p.startTimeInSeconds != null).sort((a, b) => a.startTimeInSeconds! - b.startTimeInSeconds!);
  if (samples.length > 1) {
    let lastD = 0;
    streams = samples.map((p) => {
      const d = p.totalDistanceInMeters ?? lastD;
      lastD = d;
      const pt: StreamPoint = { t: p.startTimeInSeconds! - start, d };
      if (p.heartRate) pt.hr = p.heartRate;
      const cad = p.runCadenceInStepsPerMinute ?? p.stepsPerMinute;
      if (cad) pt.cad = cad;
      if (p.elevationInMeters != null) pt.alt = p.elevationInMeters;
      if (p.latitudeInDegree != null && p.longitudeInDegree != null) { pt.lat = p.latitudeInDegree; pt.lon = p.longitudeInDegree; }
      return pt;
    });
  }

  const durationS = s.durationInSeconds ?? (streams ? streams[streams.length - 1].t : 0);
  const distanceM = s.distanceInMeters ?? (streams ? streams[streams.length - 1].d : 0);
  let laps: Lap[] | undefined;
  const lapStarts = (details?.laps ?? []).map((l) => l.startTimeInSeconds).filter((x): x is number => x != null).sort((a, b) => a - b);
  if (streams && lapStarts.length > 1) {
    const at = (sec: number) => { let best = streams![0]; for (const p of streams!) { if (p.t <= sec) best = p; else break; } return best; };
    laps = lapStarts.map((ls, i) => {
      const from = ls - start, to = i + 1 < lapStarts.length ? lapStarts[i + 1] - start : durationS;
      const pts = streams!.filter((p) => p.t >= from && p.t < to && p.hr);
      return { index: i, startS: from, durationS: to - from, distanceM: at(to).d - at(from).d,
        ...(pts.length ? { avgHr: Math.round(pts.reduce((x, p) => x + p.hr!, 0) / pts.length) } : {}) };
    });
  }

  const a: Activity = {
    id: `garmin-${summaryId}`, source: 'garmin', sourceIds: { garmin: summaryId },
    startTime: new Date(start * 1000).toISOString(), name: s.activityName?.trim() || 'Run', sport: 'run',
    distanceM, durationS, movingS: s.movingDurationInSeconds ?? durationS,
    ...(s.totalElevationGainInMeters != null ? { elevGainM: s.totalElevationGainInMeters } : {}),
    ...(s.averageHeartRateInBeatsPerMinute ? { avgHr: s.averageHeartRateInBeatsPerMinute } : {}),
    ...(s.activeKilocalories ? { calories: Math.round(s.activeKilocalories) } : {}),
    ...(s.maxHeartRateInBeatsPerMinute ? { maxHr: s.maxHeartRateInBeatsPerMinute } : {}),
    ...(s.averageRunCadenceInStepsPerMinute ? { avgCadence: s.averageRunCadenceInStepsPerMinute } : {}),
    ...(laps ? { laps } : {}), ...(streams ? { streams } : {}),
    ...(s.deviceName ? { device: s.deviceName } : {}),
    detailScore: 0, importedAt: new Date().toISOString(),
  };
  a.detailScore = detailScore(a);
  return a;
}

/** How Garmin wants its data credited: "Garmin" plus the device model where known. */
export const garminAttribution = (a: Pick<Activity, 'source' | 'sourceIds' | 'device'>) =>
  a.source === 'garmin' || a.sourceIds.garmin ? (a.device ? (/^garmin/i.test(a.device) ? a.device : `Garmin ${a.device}`) : 'Garmin') : undefined;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke('garmin-auth', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.message) msg = j.message; } catch { /* keep the generic message */ }
    throw new Error(msg);
  }
  return data as T;
}

/** Open Garmin's consent page. The runner comes back to /garmin/callback. */
export async function startGarminConnect(): Promise<void> {
  const { url } = await call<{ url: string }>({ action: 'start' });
  window.location.assign(url);
}
export const finishGarminConnect = (code: string, state: string) => call<{ connected: boolean }>({ action: 'finish', code, state });
export const disconnectGarmin = () => call<{ connected: boolean }>({ action: 'disconnect' });

export async function garminConnected(): Promise<boolean> {
  if (!client) return false;
  const { data, error } = await client.rpc('garmin_status');
  return !error && Array.isArray(data) && data.length > 0;
}

/** Runs Garmin has pushed since the last sync, as Ritmo runs, plus a function to clear them once saved. */
export async function pullGarminInbox(): Promise<{ runs: Activity[]; clear: () => Promise<void> }> {
  const { data, error } = await supabase().from('garmin_inbox').select('id,summary_id,kind,payload').order('received_at').limit(500);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const byRun = new Map<string, { summary?: GarminSummary; details?: GarminDetails }>();
  for (const r of rows) {
    const e = byRun.get(r.summary_id) ?? {};
    if (r.kind === 'summary') e.summary = r.payload as GarminSummary; else e.details = r.payload as GarminDetails;
    byRun.set(r.summary_id, e);
  }
  const runs = [...byRun.values()].map((e) => garminToActivity(e.summary, e.details)).filter((a): a is Activity => !!a);
  const ids = rows.map((r) => r.id as number);
  return { runs, clear: async () => { if (ids.length) await supabase().from('garmin_inbox').delete().in('id', ids); } };
}
