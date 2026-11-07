// App-side helpers for each run's stored summary (best efforts, structure, heart-rate bands). The maths lives in
// derive-core.ts, shared with the derive-runs server function.
import type { Activity, ActivityDerived } from '../lib/types';
import { bestEffort, deriveCore, effortKey } from './derive-core';

export { DERIVED_VERSION, EFFORT_METRES, effortKey } from './derive-core';

/** The stored summary of a run. Needs the run's streams or laps; undefined when there are none. */
export function deriveSummary(a: Activity): ActivityDerived | undefined {
  return deriveCore(a.streams, a.laps);
}

/** Best effort over a distance inside a run: from its streams when loaded, otherwise from the stored summary. */
export function effortOf(a: Activity, m: number): number | undefined {
  if (a.streams?.length) return bestEffort(a.streams, m);
  return a.derived?.be?.[effortKey(m)];
}

/** Zone seconds from a stored heart-rate histogram. */
export function zoneTimeFromHistogram(h: Record<string, number>, zoneOf: (hr: number) => number): number[] {
  const z = [0, 0, 0, 0, 0];
  for (const [k, s] of Object.entries(h)) z[zoneOf(Number(k) + 2.5) - 1] += s;
  return z;
}
