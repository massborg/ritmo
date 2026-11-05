// Apple Health (iOS) and Health Connect (Android) source adapter. Phone app only.
// Runs arrive as summaries plus heart rate; there are no GPS splits, so feedback flags limited data.
import { Capacitor } from '@capacitor/core';
import type { Activity, SourceKind } from '../lib/types';
import { detailScore } from './integration';

export const isNative = () => Capacitor.isNativePlatform();
export const healthKind = (): SourceKind | undefined =>
  Capacitor.getPlatform() === 'ios' ? 'apple_health' : Capacitor.getPlatform() === 'android' ? 'health_connect' : undefined;
export const healthLabel = () => (Capacitor.getPlatform() === 'ios' ? 'Apple Health' : 'Health Connect');

async function plugin() {
  const { Health } = await import('@capgo/capacitor-health');
  return Health;
}

export interface HealthAvailability { available: boolean; reason?: string }

export async function healthAvailability(): Promise<HealthAvailability> {
  if (!isNative()) return { available: false, reason: 'Available in the iPhone and Android apps.' };
  try {
    const H = await plugin();
    const r = await H.isAvailable();
    return { available: r.available, reason: r.available ? undefined : Capacitor.getPlatform() === 'android' ? 'Install Health Connect by Android from the Play Store, then try again.' : (r.reason ?? 'Health data is not available on this device.') };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}

/** Ask the operating system for read access. Ritmo never writes to the health store. */
export async function requestHealthAccess(): Promise<{ granted: boolean; history?: boolean; message?: string }> {
  const H = await plugin();
  const s = await H.requestAuthorization({ read: ['workouts', 'heartRate', 'distance'], write: [], requestHistoryAccess: true });
  const granted = s.readAuthorized.includes('workouts');
  return {
    granted,
    history: s.historyAccessAuthorized,
    message: !granted ? 'Ritmo needs permission to read workouts. You can allow it in the Health settings on your phone.'
      : s.historyAccessAvailable === false ? 'Your version of Health Connect only shares the last 30 days. Upload your Garmin export for older runs.'
      : undefined,
  };
}

const RUN_TYPES = ['running', 'runningTreadmill', 'trackAndField'] as const;

/** Fetch runs since `since` (default: 10 years). Pages through results. */
export async function syncHealth(since?: string, onProgress?: (n: number) => void): Promise<Activity[]> {
  const H = await plugin();
  const kind = healthKind()!;
  const startDate = since ?? new Date(Date.now() - 10 * 365 * 86400000).toISOString();
  const endDate = new Date().toISOString();
  const out: Activity[] = [];
  for (const workoutType of RUN_TYPES) {
    let anchor: string | undefined;
    do {
      const res = await H.queryWorkouts({ workoutType, startDate, endDate, limit: 100, ascending: true, anchor });
      for (const w of res.workouts) {
        if (!w.totalDistance || w.totalDistance < 500 || !w.duration) continue;
        // Heart rate samples during the run, if the watch recorded them
        let avgHr: number | undefined, maxHr: number | undefined;
        try {
          const { samples } = await H.readSamples({ dataType: 'heartRate', startDate: w.startDate, endDate: w.endDate, limit: 3000, ascending: true });
          if (samples.length > 5) {
            avgHr = Math.round(samples.reduce((x, s) => x + s.value, 0) / samples.length);
            maxHr = Math.round(Math.max(...samples.map((s) => s.value)));
          }
        } catch { /* heart rate permission may be denied */ }
        const id = `${kind}-${w.platformId ?? w.startDate}`;
        const lapEvents = (w.workoutEvents ?? []).filter((e) => e.type === 'lap' && (e as { duration?: number }).duration);
        const a: Activity = {
          id, source: kind, sourceIds: { [kind]: w.platformId ?? id }, startTime: new Date(w.startDate).toISOString(),
          name: workoutType === 'runningTreadmill' ? 'Treadmill run' : 'Run', sport: 'run',
          distanceM: Math.round(w.totalDistance), durationS: Math.round(w.duration), movingS: Math.round(w.duration),
          avgHr, maxHr,
          laps: lapEvents.length > 1 ? lapEvents.map((e, i) => {
            const ev = e as { date: string; duration?: number; distance?: number };
            return { index: i + 1, startS: (new Date(ev.date).getTime() - new Date(w.startDate).getTime()) / 1000, durationS: ev.duration ?? 0, distanceM: ev.distance ?? 0 };
          }) : undefined,
          detailScore: 0,
          importedAt: new Date().toISOString(),
        };
        a.detailScore = detailScore(a);
        out.push(a);
      }
      onProgress?.(out.length);
      anchor = res.anchor ?? undefined;
    } while (anchor);
  }
  return out;
}
