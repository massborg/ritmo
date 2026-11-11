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
  { kind: 'garmin', label: 'Garmin Connect', availability: 'stage-2', description: 'Automatic sync of each new run with pace, heart rate, cadence, laps and route.' },
  { kind: 'apple_health', label: 'Apple Health', availability: 'stage-3', description: 'Available in the iPhone app. Some runs may arrive with less detail.' },
  { kind: 'health_connect', label: 'Health Connect', availability: 'stage-3', description: 'Available in the Android app. Some runs may arrive with less detail.' },
  { kind: 'strava', label: 'Strava', availability: 'stage-2', description: 'Automatic sync of each new run from Strava, with pace, heart rate, cadence, laps and route.' },
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
  /** Incoming run id → the id it was merged into, so answers saved with it (how it felt) follow the run */
  mapped: Record<string, string>;
}

/** Merge incoming activities into existing ones. Sorted by start time; O(n log n) via a time index. */
export function merge(existing: Activity[], incoming: Activity[]): MergeResult {
  const list = [...existing].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const times = list.map((a) => new Date(a.startTime).getTime());
  let added = 0, replaced = 0, duplicates = 0;
  const mapped: Record<string, string> = {};
  const findNear = (t: number) => {
    let lo = 0, hi = times.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t - 180000) lo = m + 1; else hi = m; }
    const out: number[] = [];
    for (let i = lo; i < times.length && times[i] <= t + 180000; i++) out.push(i);
    return out;
  };
  for (const inc of incoming) {
    const t = new Date(inc.startTime).getTime();
    // A run logged by hand ("I've done this run") has a rough time and distance: the watch file that arrives
    // later for the same day replaces it instead of adding a duplicate
    const day = inc.startTime.slice(0, 10);
    // …and the other way round: a run logged by hand for a day that already has the synced run joins that run
    const near = (x: Activity) => x.startTime.slice(0, 10) === day && Math.abs(x.distanceM - inc.distanceM) / Math.max(x.distanceM, inc.distanceM, 1) < 0.15;
    const match = findNear(t).find((i) => isSameRun(list[i], inc))
      ?? (inc.source !== 'manual' ? list.findIndex((x) => x.source === 'manual' && near(x)) : list.findIndex((x) => x.source !== 'manual' && x.source !== 'sample' && near(x)));
    if (match === undefined || match < 0) {
      let pos = times.findIndex((x) => x > t);
      if (pos < 0) pos = times.length;
      list.splice(pos, 0, inc);
      times.splice(pos, 0, t);
      added++;
    } else {
      const cur = list[match];
      mapped[inc.id] = cur.id;
      const sourceIds = { ...cur.sourceIds, ...inc.sourceIds };
      // Strava's terms let Ritmo show Strava data only to the runner, so a copy of the same run from a file, a watch or
      // Health becomes the run's source (and the run can be posted); a Strava copy never replaces such a copy
      const shareable = (x: Activity) => x.source !== 'strava' && x.source !== 'manual' && x.source !== 'sample';
      const takeInc = cur.source === 'strava' && shareable(inc) ? true : inc.source === 'strava' && shareable(cur) ? false : inc.detailScore > cur.detailScore;
      if (takeInc) {
        // What the runner told us stays: the planned session link, reps they entered, race marks
        list[match] = { ...inc, id: cur.id, sourceIds, isRace: cur.isRace || inc.isRace, notRace: cur.notRace, plannedSessionId: cur.plannedSessionId ?? inc.plannedSessionId,
          reps: cur.reps ?? inc.reps, media: cur.media ?? inc.media, name: cur.name !== 'Run' ? cur.name : inc.name, device: inc.device ?? cur.device,
          // A run the runner deleted stays deleted when a better copy arrives
          deletedAt: cur.deletedAt };
        replaced++;
      } else {
        list[match] = { ...cur, sourceIds, device: cur.device ?? inc.device, plannedSessionId: cur.plannedSessionId ?? inc.plannedSessionId, reps: cur.reps ?? inc.reps, media: cur.media ?? inc.media };
        duplicates++;
      }
    }
  }
  return { activities: list, added, replaced, duplicates, mapped };
}

/**
 * Merge new runs into the runner's runs, including the imported runs they deleted: a run that matches a deleted one
 * joins it and stays deleted, so a sync never brings it back. `restore` (a file the runner chose to upload again)
 * brings matching deleted runs back instead.
 */
export function mergeWithRemoved(activities: Activity[], removed: Activity[] | undefined, incoming: Activity[], restore = false): MergeResult & { removed: Activity[] } {
  const m = merge([...activities, ...(removed ?? [])], incoming);
  const back = new Set(restore ? Object.values(m.mapped) : []);
  const all = m.activities.map((a) => (a.deletedAt && back.has(a.id) ? { ...a, deletedAt: undefined } : a));
  return { ...m, activities: all.filter((a) => !a.deletedAt), removed: all.filter((a) => a.deletedAt) };
}
