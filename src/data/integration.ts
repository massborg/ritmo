// One integration layer for every data source. Each source adapter returns normalised Activities;
// merge() removes duplicates across sources and keeps the most detailed version.
import type { Activity, SourceKind } from '../lib/types';

export interface SourceAdapter {
  kind: SourceKind;
  label: string;
  /** Where this source is available in the build order */
  availability: 'now' | 'stage-2' | 'stage-3' | 'later';
  description: string;
  /** Fetch activities newer than `since`. Uploads are pushed, not pulled, so they return []. */
  sync?: (since?: string) => Promise<Activity[]>;
}

export const SOURCES: SourceAdapter[] = [
  { kind: 'upload', label: 'File upload', availability: 'now', description: 'FIT, GPX and TCX files, or your full Garmin account export. The best way to bring in past years.' },
  { kind: 'garmin', label: 'Garmin Connect', availability: 'stage-2', description: 'Automatic sync of each new run with pace, heart rate, cadence, laps and route. Waiting for Garmin developer approval.' },
  { kind: 'apple_health', label: 'Apple Health', availability: 'stage-3', description: 'Available in the iPhone app. Some runs may arrive with less detail.' },
  { kind: 'health_connect', label: 'Health Connect', availability: 'stage-3', description: 'Available in the Android app. Some runs may arrive with less detail.' },
  { kind: 'strava', label: 'Strava', availability: 'later', description: 'Planned.' },
  { kind: 'coros', label: 'COROS', availability: 'later', description: 'Planned.' },
];

export function detailScore(a: Activity): number {
  let s = 1;
  if (a.streams?.length) s += 4;
  if (a.avgHr) s += 2;
  if (a.streams?.some((p) => p.hr)) s += 1;
  if (a.avgCadence) s += 1;
  if (a.elevGainM != null) s += 0.5;
  if (a.laps?.length) s += 1;
  if (a.streams?.some((p) => p.lat != null)) s += 0.5;
  return s;
}

/** Two records are the same run if they start within 3 minutes and distances agree within 5%. */
export function isSameRun(a: Activity, b: Activity): boolean {
  const dt = Math.abs(new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  if (dt > 3 * 60 * 1000) return false;
  const big = Math.max(a.distanceM, b.distanceM, 1);
  return Math.abs(a.distanceM - b.distanceM) / big < 0.05;
}

export interface MergeResult {
  activities: Activity[];
  added: number;
  replaced: number; // an existing run was upgraded with a more detailed version
  duplicates: number; // incoming runs we already had at equal or better detail
}

/** Merge incoming activities into existing ones. Sorted by start time; O(n log n) via a time index. */
export function merge(existing: Activity[], incoming: Activity[]): MergeResult {
  const list = [...existing].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const times = list.map((a) => new Date(a.startTime).getTime());
  let added = 0, replaced = 0, duplicates = 0;
  const findNear = (t: number) => {
    let lo = 0, hi = times.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t - 180000) lo = m + 1; else hi = m; }
    const out: number[] = [];
    for (let i = lo; i < times.length && times[i] <= t + 180000; i++) out.push(i);
    return out;
  };
  for (const inc of incoming) {
    const t = new Date(inc.startTime).getTime();
    const match = findNear(t).find((i) => isSameRun(list[i], inc));
    if (match === undefined) {
      let pos = times.findIndex((x) => x > t);
      if (pos < 0) pos = times.length;
      list.splice(pos, 0, inc);
      times.splice(pos, 0, t);
      added++;
    } else {
      const cur = list[match];
      const sourceIds = { ...cur.sourceIds, ...inc.sourceIds };
      if (inc.detailScore > cur.detailScore) {
        list[match] = { ...inc, id: cur.id, sourceIds, isRace: cur.isRace || inc.isRace, name: cur.name !== 'Run' ? cur.name : inc.name };
        replaced++;
      } else {
        list[match] = { ...cur, sourceIds };
        duplicates++;
      }
    }
  }
  return { activities: list, added, replaced, duplicates };
}
