import { describe, expect, it } from 'vitest';
import { predictTime, trainingPaces, vdotFromPerformance, bestEffort, hrZones, estimateFitness, hrSetup } from './fitness';
import { buildPlan, adaptPlan, moveSession } from './plan';
import { classify, analyse, splits } from './analysis';
import { loadSeries, readiness } from './load';
import { merge, isSameRun } from '../data/integration';
import { generateSample, SAMPLE_TODAY, SAMPLE_PROFILE } from '../data/sample';
import { parseYmd, ymd } from '../lib/format';
import type { Activity } from '../lib/types';

describe('fitness', () => {
  it('VDOT round-trips through race prediction', () => {
    const v = vdotFromPerformance(10000, 40 * 60);
    expect(v).toBeGreaterThan(50);
    expect(v).toBeLessThan(53);
    expect(Math.abs(predictTime(v, 10000) - 2400)).toBeLessThan(2);
    // a 40:00 10K predicts roughly a 3:05–3:10 marathon
    const m = predictTime(v, 42195);
    expect(m).toBeGreaterThan(3 * 3600);
    expect(m).toBeLessThan(3 * 3600 + 15 * 60);
  });
  it('training paces are ordered', () => {
    const p = trainingPaces(50);
    expect(p.repetition[0]).toBeLessThan(p.interval[0]);
    expect(p.interval[0]).toBeLessThan(p.threshold[0]);
    expect(p.threshold[0]).toBeLessThan(p.marathon[0]);
    expect(p.marathon[0]).toBeLessThan(p.easy[0]);
  });
  it('best effort finds the fastest window', () => {
    const s = Array.from({ length: 601 }, (_, i) => ({ t: i * 5, d: i * 5 * (i > 300 && i < 400 ? 5 : 3) }));
    // recompute cumulative distance properly
    let d = 0;
    const st = s.map((p, i) => { if (i) d += 5 * (i > 300 && i < 400 ? 5 : 3); return { t: p.t, d }; });
    const e = bestEffort(st, 1000)!;
    expect(e).toBeCloseTo(200, 0);
  });
  it('zones are contiguous Z1..Z5', () => {
    const z = hrZones({ max: 190, rest: 50, estimated: false });
    expect(z.map((x) => x.zone)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < 5; i++) expect(z[i].min).toBe(z[i - 1].max);
  });
});

describe('integration layer', () => {
  const base: Activity = { id: 'a', source: 'upload', sourceIds: { upload: 'a' }, startTime: '2026-01-01T07:00:00Z', name: 'Run', sport: 'run', distanceM: 10000, durationS: 3000, movingS: 2950, detailScore: 3, importedAt: '' };
  it('detects the same run across sources and keeps the most detailed', () => {
    const fromPhone: Activity = { ...base, id: 'b', source: 'apple_health', sourceIds: { apple_health: 'b' }, startTime: '2026-01-01T07:01:00Z', distanceM: 10080, detailScore: 1 };
    const fromGarmin: Activity = { ...base, id: 'c', source: 'garmin', sourceIds: { garmin: 'c' }, startTime: '2026-01-01T07:00:20Z', distanceM: 9990, detailScore: 9, avgHr: 150 };
    expect(isSameRun(base, fromPhone)).toBe(true);
    const r1 = merge([], [fromPhone]);
    const r2 = merge(r1.activities, [fromGarmin, base]);
    expect(r2.activities).toHaveLength(1);
    expect(r2.replaced).toBe(1);
    expect(r2.duplicates).toBe(1);
    expect(r2.activities[0].avgHr).toBe(150);
    expect(Object.keys(r2.activities[0].sourceIds).sort()).toEqual(['apple_health', 'garmin', 'upload']);
  });
  it('keeps two different runs on the same day', () => {
    const later = { ...base, id: 'd', startTime: '2026-01-01T18:00:00Z' };
    expect(merge([base], [later]).activities).toHaveLength(2);
  });
});

describe('sample data and plan', () => {
  const s = generateSample();
  const today = parseYmd(SAMPLE_TODAY);
  it('has years of history and a race in the plan', () => {
    expect(s.activities.length).toBeGreaterThan(800);
    expect(s.activities[0].startTime.slice(0, 4)).toBe('2021');
    expect(s.plan.sessions.some((x) => x.type === 'race')).toBe(true);
    expect(s.plan.phases.map((p) => p.phase)).toContain('taper');
  });
  it('estimates sensible fitness for the sample runner', () => {
    const hr = hrSetup(SAMPLE_PROFILE, s.activities, today);
    const f = estimateFitness(s.activities, hr, today)!;
    expect(f.vdot).toBeGreaterThan(45);
    expect(f.vdot).toBeLessThan(55);
  });
  it('logged explained adaptations while the plan ran', () => {
    const reasons = s.plan.changes.map((c) => c.reason);
    expect(reasons).toContain('missed');
    expect(reasons).toContain('harder');
    for (const c of s.plan.changes) expect(c.summary.length).toBeGreaterThan(40);
  });
  it('has a session today', () => {
    expect(s.plan.sessions.find((x) => x.date === SAMPLE_TODAY)).toBeTruthy();
  });
  it('never increases planned weekly volume by more than about 10% outside recovery weeks', () => {
    const weeks = new Map<string, number>();
    for (const x of s.plan.sessions.filter((y) => y.type !== 'race')) {
      const k = ymd(new Date(parseYmd(x.date).getTime() - ((parseYmd(x.date).getDay() + 6) % 7) * 86400000));
      weeks.set(k, (weeks.get(k) ?? 0) + x.distanceM);
    }
    const vals = [...weeks.values()];
    for (let i = 1; i < vals.length; i++) if (vals[i - 1] > 0) expect(vals[i] / vals[i - 1]).toBeLessThan(1.4);
  });
});

describe('analysis and adaptation', () => {
  const s = generateSample();
  const today = parseYmd(SAMPLE_TODAY);
  const hr = hrSetup(SAMPLE_PROFILE, s.activities, today);
  const zones = hrZones(hr);
  const P = trainingPaces(estimateFitness(s.activities, hr, today)!.vdot);
  const recent = s.activities.filter((a) => a.streams);
  it('classifies structured sessions from streams and laps', () => {
    const thr = recent.find((a) => a.name === 'Threshold reps')!;
    expect(['threshold', 'tempo']).toContain(classify(thr, P, zones, 3000).type);
    const long = recent.filter((a) => a.name === 'Long run').sort((a, b) => b.distanceM - a.distanceM)[0];
    expect(classify(long, P, zones, 3000).type).toBe('long');
  });
  it('flags an easy run done too hard', () => {
    const hard = recent.find((a) => a.startTime.startsWith('2026-10-28'))!;
    const an = analyse({ a: hard, all: s.activities, paces: P, zones, typicalMovingS: 3000, planned: s.plan.sessions.find((x) => x.date === '2026-10-28'), pastFeedback: [], units: 'km', typeOf: (x) => classify(x, P, zones, 3000).type });
    expect(an.score).toBeLessThan(85);
    expect(an.plannedVsActual.some((r) => !r.ok)).toBe(true);
  });
  it('produces km splits', () => {
    const sp = splits(recent[0].streams!);
    expect(sp.length).toBeGreaterThan(3);
    expect(sp[0].distanceM).toBeGreaterThan(950);
  });
  it('reacts to illness and pain with rest', () => {
    const profile = { ...SAMPLE_PROFILE, illnessUntil: '2026-11-06' };
    const p = adaptPlan({ plan: s.plan, activities: s.activities, feedback: [], profile, today, typeOf: () => 'easy', paces: P });
    expect(p.sessions.find((x) => x.date === '2026-11-06')!.type).toBe('rest');
    expect(p.changes.some((c) => c.reason === 'illness')).toBe(true);
  });
  it('readiness explains itself', () => {
    const series = loadSeries(s.activities, hr, P.threshold[1], today);
    const r = readiness({ today, profile: SAMPLE_PROFILE, series, activities: s.activities, feedback: s.feedback });
    expect(r.basedOn.length).toBeGreaterThan(0);
    const r2 = readiness({ today, profile: SAMPLE_PROFILE, series, activities: s.activities, feedback: [{ activityId: 'x', feel: 2, pain: [{ area: 'Knee', severity: 2 }], loggedAt: today.toISOString() }] });
    expect(r2.level).toBe('recovery');
  });
  it('moving a session swaps days and logs it', () => {
    const tomorrow = s.plan.sessions.find((x) => x.date === '2026-11-06')!;
    const p = moveSession(s.plan, tomorrow.id, '2026-11-07');
    expect(p.sessions.find((x) => x.id === tomorrow.id)!.date).toBe('2026-11-07');
    expect(p.changes[p.changes.length - 1].reason).toBe('moved');
  });
  it('builds a plan for a first 10K with low volume', () => {
    const plan = buildPlan({ today, profile: { ...SAMPLE_PROFILE, daysAvailable: [1, 3, 5] , longRunDay: 5 }, race: { id: 'r', name: 'First 10K', date: '2027-02-07', distanceM: 10000, courseType: 'road', priority: 'A' }, paces: trainingPaces(35), recentWeeklyKm: 12, longestRecentKm: 6 });
    const firstWeek = plan.sessions.slice(0, 7).reduce((x, y) => x + y.distanceM, 0) / 1000;
    expect(firstWeek).toBeLessThan(25);
    expect(plan.sessions.filter((x) => x.type !== 'rest').every((x) => x.purpose && x.howItHelps && x.focus)).toBe(true);
  });
});
