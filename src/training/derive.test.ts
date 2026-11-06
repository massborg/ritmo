import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { bestEffort, deriveCore, effortKey } from './derive-core';
import { effortOf } from './derive';
import { personalBests } from './insights';
import type { Activity, StreamPoint } from '../lib/types';

/** A run as 1-second points: pieces of [metres, seconds] run at an even pace. */
function stream(pieces: [number, number][]): StreamPoint[] {
  const out: StreamPoint[] = [{ t: 0, d: 0, hr: 140 }];
  let t = 0, d = 0;
  for (const [m, s] of pieces) {
    const v = m / s;
    for (let i = 0; i < s; i++) { t += 1; d += v; out.push({ t, d, hr: 150 }); }
  }
  return out;
}
const run = (id: string, s: StreamPoint[], extra: Partial<Activity> = {}): Activity => ({
  id, source: 'garmin', sourceIds: {}, startTime: '2026-11-01T08:00:00Z', name: 'Run', sport: 'run',
  distanceM: s[s.length - 1].d, durationS: s[s.length - 1].t, movingS: s[s.length - 1].t, streams: s, detailScore: 5, importedAt: '', ...extra,
});

describe('best efforts inside runs', () => {
  it('a 15:51 5K inside a 10K run is the 5K best effort and the 5K PB', () => {
    // 2.5 km warm-up at 4:30/km, 5 km in 15:51, 2.5 km cool-down at 4:30/km
    const s = stream([[2500, 675], [5000, 951], [2500, 675]]);
    expect(bestEffort(s, 5000)).toBeCloseTo(951, 0);
    const pb = personalBests([run('a', s)]).find((p) => p.m === 5000)!;
    expect(Math.round(pb.timeS)).toBe(951);
  });
  it('the stored summary gives the same best efforts without the streams', () => {
    const s = stream([[2500, 675], [5000, 951], [2500, 675]]);
    const derived = deriveCore(s, undefined)!;
    expect(derived.be![effortKey(5000)]).toBeCloseTo(951, 0);
    expect(derived.be![effortKey(10000)]).toBeCloseTo(2301, 0);
    const summaryOnly = run('b', s, { streams: undefined, derived });
    expect(effortOf(summaryOnly, 5000)).toBeCloseTo(951, 0);
    expect(Math.round(personalBests([summaryOnly]).find((p) => p.m === 5000)!.timeS)).toBe(951);
  });
  it('ignores GPS jumps faster than 2:20/km', () => {
    // steady 5:00/km with a 300 m jump in one second in the middle
    const s = stream([[2000, 600]]);
    const glitched = [...s.slice(0, 300), ...s.slice(300).map((p) => ({ ...p, d: p.d + 300 }))];
    const e = bestEffort(glitched, 1000)!;
    expect(e).toBeGreaterThan(290); // still about 5:00/km, not a fake 3:30
  });
  it('keeps segment paces only for structured runs', () => {
    const steady = deriveCore(stream([[8000, 2400]]), undefined)!;
    expect(steady.segs).toBeUndefined();
    const reps: [number, number][] = [];
    for (let i = 0; i < 6; i++) reps.push([1000, 192], [400, 120]);
    expect(deriveCore(stream(reps), undefined)!.segs!.length).toBeGreaterThan(6);
  });
  it('the server function uses an identical copy of the maths', () => {
    expect(readFileSync('supabase/functions/_shared/derive-core.ts', 'utf8')).toBe(readFileSync('src/training/derive-core.ts', 'utf8'));
  });
});
