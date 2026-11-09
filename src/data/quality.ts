// Data-quality tools: find duplicate runs the import did not catch (often the same run with its clock an exact hour
// or two out, from a time-zone mix-up), merge them, correct a run's distance (treadmill calibration), and leave
// a run out of the stats without deleting it.
import type { Activity } from '../lib/types';

/** Faster than this over a kilometre or more is beyond world-record pace: the time or distance was mistyped. */
export const FASTEST_PACE_S_PER_KM = 150; // 2:30 /km

/**
 * Why a run cannot be right, if it cannot: a mistyped time or distance (15 km in 75 seconds), or a GPS blip of a few
 * metres. Such runs are left out of fitness, load, PBs, predictions and volume until they are corrected, so one typo
 * cannot turn fatigue into 440 or a 15K best into "1:15".
 */
export function implausible(a: Activity): string | undefined {
  const s = a.movingS || a.durationS;
  if (!(a.distanceM >= 100) || !(s >= 30)) return 'too short to be a run (a GPS blip or a test)';
  if (a.distanceM >= 1000 && s / (a.distanceM / 1000) < FASTEST_PACE_S_PER_KM) return 'faster than world-record pace, so the time or distance is probably mistyped';
  return undefined;
}

/** Runs that count towards fitness, load, PBs, predictions, volume and reviews. */
export const forStats = (acts: Activity[]) => acts.filter((a) => !a.hidden && !implausible(a));

/** Runs that need checking: not hidden, but impossible as recorded. */
export const needsChecking = (acts: Activity[]) => acts.filter((a) => !a.hidden && implausible(a) && a.distanceM >= 100);

const close = (x: number, y: number, tol: number) => Math.abs(x - y) <= tol * Math.max(x, y, 1);
/** Same run twice: distance and duration within 3%, and starting within 10 minutes or an exact 1 to 3 hours apart. */
export function isDuplicatePair(a: Activity, b: Activity): boolean {
  if (!close(a.distanceM, b.distanceM, 0.03) || !close(a.movingS || a.durationS, b.movingS || b.durationS, 0.03)) return false;
  const gapMin = Math.abs(new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) / 60000;
  if (gapMin <= 10) return true;
  const hours = Math.round(gapMin / 60);
  return hours >= 1 && hours <= 3 && Math.abs(gapMin - hours * 60) <= 2;
}

/** Pairs of likely duplicates, newest first. */
export function findDuplicates(acts: Activity[]): [Activity, Activity][] {
  const sorted = [...acts].sort((x, y) => x.startTime.localeCompare(y.startTime));
  const out: [Activity, Activity][] = [];
  const used = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const ti = new Date(sorted[i].startTime).getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      if (new Date(sorted[j].startTime).getTime() - ti > 3 * 3600000 + 120000) break;
      if (used.has(sorted[i].id) || used.has(sorted[j].id)) continue;
      if (isDuplicatePair(sorted[i], sorted[j])) { out.push([sorted[i], sorted[j]]); used.add(sorted[i].id); used.add(sorted[j].id); }
    }
  }
  return out.reverse();
}

/** Merges two copies of a run: the more detailed one stays, keeping everything the runner set on either copy. */
export function combineRuns(x: Activity, y: Activity): { keep: Activity; dropId: string } {
  const [rich, poor] = x.detailScore >= y.detailScore ? [x, y] : [y, x];
  const keep: Activity = {
    ...rich, sourceIds: { ...poor.sourceIds, ...rich.sourceIds },
    isRace: rich.isRace || poor.isRace, notRace: rich.notRace ?? poor.notRace,
    plannedSessionId: rich.plannedSessionId ?? poor.plannedSessionId, reps: rich.reps ?? poor.reps, media: rich.media ?? poor.media,
    weather: rich.weather ?? poor.weather, shoeId: rich.shoeId ?? poor.shoeId, device: rich.device ?? poor.device,
    name: rich.name !== 'Run' ? rich.name : poor.name, hidden: rich.hidden && poor.hidden ? true : undefined,
  };
  return { keep, dropId: poor.id };
}

/** The run with a corrected distance; streams and laps are scaled to match, and the original is remembered. */
export function withDistance(a: Activity, newM: number): Activity {
  const k = newM / a.distanceM;
  return {
    ...a, distanceM: Math.round(newM), distFrom: a.distFrom != null && Math.abs(newM - a.distFrom) < 1 ? undefined : a.distFrom ?? a.distanceM,
    streams: a.streams?.map((p) => ({ ...p, d: p.d * k })),
    laps: a.laps?.map((l) => ({ ...l, distanceM: l.distanceM * k })),
    derived: undefined,
  };
}
