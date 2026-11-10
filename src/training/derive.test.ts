import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { bestEffort, deriveCore, effortKey } from './derive-core';
import { effortOf } from './derive';
import { personalBests } from './insights';
import type { Activity, PlannedSession, StreamPoint } from '../lib/types';

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

describe('races and PB labels', () => {
  it('a run named like a race over a race distance is a race in the PB list; "not a race" is respected', async () => {
    const { personalBests, racesToReview } = await import('./insights');
    const s = stream([[10100, 1991]]);
    const nadur = run('nadur', s, { name: 'Nadur – Garmin Nadur 10k race 2026', startTime: '2026-11-01T08:00:00Z' });
    const ten = personalBests([nadur]).find((p) => p.m === 10000)!;
    expect(ten.kind).toBe('race');
    expect(racesToReview([nadur]).map((a) => a.id)).toEqual(['nadur']);
    expect(personalBests([{ ...nadur, notRace: true }]).find((p) => p.m === 10000)!.kind).toBe('training');
    expect(racesToReview([{ ...nadur, isRace: true }])).toEqual([]);
  });
  it('a run on a race day from the calendar counts as a race; hard heart rate alone does not label it', async () => {
    const { personalBests } = await import('./insights');
    const s = stream([[5000, 951]]);
    const r = run('r', s, { name: 'Morning Run', startTime: '2026-09-20T08:00:00Z', avgHr: 185 });
    expect(personalBests([r]).find((p) => p.m === 5000)!.kind).toBe('training');
    const race = { id: 'x', name: 'Safi 5K', date: '2026-09-20', distanceM: 5000, priority: 'A' } as never;
    expect(personalBests([r], [race]).find((p) => p.m === 5000)!.kind).toBe('race');
  });
  it('PB history lists each improvement in order', async () => {
    const { pbHistory } = await import('./insights');
    const mk = (id: string, date: string, s5: number) => run(id, stream([[5000, s5]]), { startTime: `${date}T08:00:00Z` });
    const h = pbHistory([mk('a', '2025-01-01', 1000), mk('b', '2025-06-01', 1010), mk('c', '2026-01-01', 960)], 5000);
    expect(h.map((x) => x.activityId)).toEqual(['a', 'c']);
  });
});

describe('same-day sessions', () => {
  it('groups warm-up, strides, race and cool-down files within 90 minutes; the race is the main run', async () => {
    const { groupRuns } = await import('./sessions');
    const at = (h: number, m: number) => `2026-11-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    const part = (id: string, start: string, km: number, s: number) => ({ id, source: 'upload', sourceIds: {}, startTime: start, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: s, movingS: s, detailScore: 3, importedAt: '' }) as Activity;
    const g = groupRuns([part('w', at(7, 30), 3, 900), part('s', at(7, 47), 1, 300), part('r', at(8, 0), 10.1, 1991), part('c', at(8, 40), 1.5, 500), part('pm', at(17, 0), 8, 2400)]);
    expect(g.length).toBe(2);
    expect(g[0].main.id).toBe('r');
    expect(g[0].roles).toEqual({ w: 'warmup', s: 'strides', r: 'main', c: 'cooldown' });
    expect(Math.round(g[0].totalM)).toBe(15600);
    expect(g[1].parts.map((p) => p.id)).toEqual(['pm']);
  });
});

describe('run feedback rules', () => {
  const zones = { z: [{ zone: 1, min: 100, max: 120 }, { zone: 2, min: 120, max: 140 }, { zone: 3, min: 140, max: 155 }, { zone: 4, min: 155, max: 170 }, { zone: 5, min: 170, max: 200 }] };
  it('never tells a 4:30/km runner to slow down to 4:03, and never leaves "what to improve" empty', async () => {
    const { analyse } = await import('./analysis');
    const { trainingPaces } = await import('./fitness');
    const paces = trainingPaces(58); // easy pace starts faster than 4:30/km
    // 10 km at 4:30/km, heart rate high (Z3) throughout
    const s: StreamPoint[] = [];
    for (let t = 0; t <= 2700; t += 5) s.push({ t, d: (t / 2700) * 10000, hr: 150 });
    const a = run('easy', s, { avgHr: 150 });
    const res = analyse({ a, all: [a], paces, zones: zones.z as never, typicalMovingS: 2700, pastFeedback: [], units: 'km', typeOf: () => 'easy' });
    const text = res.improve.join(' ');
    expect(res.improve.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/Nothing to change/);
    if (paces.easy[0] < 270) expect(text).not.toMatch(/Slow to that|slow down to/i);
  });
});

describe('laps from screenshots', () => {
  it('finds the warm-up, 6 reps, recoveries and the cool-down, and keeps "not sure" marks', async () => {
    const { mapLaps } = await import('./laps');
    const lap = (rep: number, d: number, t: number, hr: number, unsure: string[] = []) => ({ rep, distance_m: d, time_s: t, pace_s_per_km: null, avg_hr: hr, unsure });
    const laps = [lap(1, 3000, 840, 140)];
    for (let i = 0; i < 6; i++) { laps.push(lap(laps.length + 1, 1000, 192 + i, 172, i === 2 ? ['time_s'] : [])); if (i < 5) laps.push(lap(laps.length + 1, 400, 150, 150)); }
    laps.push(lap(laps.length + 1, 2000, 580, 138));
    const rows = mapLaps(laps);
    expect(rows[0].kind).toBe('warmup');
    expect(rows.filter((r) => r.kind === 'work').length).toBe(6);
    expect(rows.filter((r) => r.kind === 'recovery').length).toBe(5);
    expect(rows[rows.length - 1].kind).toBe('cooldown');
    expect(rows.find((r) => r.label === 'Rep 3')!.unsure).toEqual(['time']);
  });
});

describe('feedback report', () => {
  it('a 6 x 1 km session inside target gets a specific verdict and a full breakdown', async () => {
    const { buildReport } = await import('./report');
    const reps = Array.from({ length: 6 }, (_, i) => ({ label: `Rep ${i + 1}`, kind: 'work' as const, distanceM: 1000, timeS: 193 - (i === 5 ? 2 : 0), avgHr: 170 + i }));
    const a = run('m', stream([[10000, 2700]]), { source: 'manual', streams: undefined, reps });
    const planned = { id: 'p', date: '2026-11-01', type: 'vo2max', title: 'Intervals: 6 x 1 km', distanceM: 10000, durationS: 2700, steps: [{ label: '6 x 1 km', detail: '', kind: 'work', pace: [190, 196] as [number, number] }] } as unknown as PlannedSession;
    const an = { type: 'vo2max', patterns: {}, score: 90 } as never;
    const r = buildReport({ a, an, planned, all: [a], units: 'km', typeOf: () => 'vo2max' });
    expect(r.verdict).toMatch(/^Nailed it: 6 x 1 km averaged 3:1\d\/km, all inside target, last rep fastest\.$/);
    expect(r.breakdown.find((b) => b.key === 'pace')!.value).toBe(100);
    expect(r.breakdown.find((b) => b.key === 'completion')!.note).toBe('6 of 6 reps');
    expect(r.breakdown.find((b) => b.key === 'consistency')!.value).toBeGreaterThan(90);
  });
});

describe('Hub and share privacy', () => {
  it('shared routes leave out the first and last 200 m', async () => {
    const { shareableRoute } = await import('../data/hub');
    const pts = Array.from({ length: 100 }, (_, i) => ({ d: i * 50, lat: 35.9 + (i * 50) / 111195, lon: 14.5 }));
    const r = shareableRoute(pts)!;
    expect(r[0][0]).toBeGreaterThanOrEqual(Math.round((35.9 + 200 / 111195) * 1e5) / 1e5);
    expect(r[r.length - 1][0]).toBeLessThanOrEqual(Math.round((35.9 + (4950 - 200) / 111195) * 1e5) / 1e5);
  });
  it('ritmo wording', async () => {
    const { fuegoCount, giversLine, notificationText, whenLine } = await import('../data/hub');
    expect(fuegoCount(1)).toBe('1 Fuego');
    expect(fuegoCount(6)).toBe('6 Fuego');
    expect(giversLine(['Marco', 'Elena'], 24)).toBe('Marco, Elena and 22 others gave a Fuego');
    expect(notificationText('ritmo', ['Anna'])).toBe('Anna gave your run a Fuego');
    expect(notificationText('ritmo', ['Marco', 'A', 'B', 'C', 'D', 'E'])).toBe('Marco and 5 others gave your run a Fuego');
    const now = new Date(2026, 10, 10, 20, 0);
    expect(whenLine(new Date(2026, 10, 10, 6, 42).toISOString(), now)).toBe('Today at 06:42');
    expect(whenLine(new Date(2026, 10, 9, 18, 10).toISOString(), now)).toBe('Yesterday at 18:10');
    expect(whenLine(new Date(2026, 10, 5, 7, 5).toISOString(), now)).toBe('Thu 5 Nov at 07:05');
  });
});
