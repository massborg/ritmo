// The 9 Nov 2026 test case from the update brief: 6 x 1 km intervals planned, an easy 16.29 km run done instead.
// Ritmo must call it an easy run swapped from intervals, judge it as an easy run, give no "start slower" advice,
// and never move the race estimate from it.
import { describe, expect, it } from 'vitest';
import type { Activity, PlannedSession, Race, StreamPoint } from '../lib/types';
import { analyse, classify, sessionOutcome, TYPE_LABEL } from './analysis';
import { hrCheck, hrZones, trainingPaces } from './fitness';
import { buildReport } from './report';
import { implausible, forStats } from '../data/quality';

const paces = trainingPaces(63.3); // easy about 4:17–4:48 /km
const zones = hrZones({ max: 175, rest: 44, source: 'profile' } as never); // max HR set too low: 144 bpm reads as Z3

// 16.29 km in 1:12:01 moving, the last 20% about 13% slower, heart rate a steady 144
function nov9Streams(): StreamPoint[] {
  const pts: StreamPoint[] = [];
  const total = 16290, mainEnd = total * 0.8;
  const fastPace = 256, slowPace = fastPace * 1.132;
  let t = 0;
  for (let d = 0; d <= total; d += 50) {
    pts.push({ t: Math.round(t), d, hr: 144 } as StreamPoint);
    t += (d < mainEnd ? fastPace : slowPace) * 0.05;
  }
  return pts;
}
const run: Activity = {
  id: 'nov9', source: 'strava', name: 'Morning Run', startTime: '2026-11-09T06:42:00Z',
  distanceM: 16290, movingS: 4321, durationS: 4412, avgHr: 144, maxHr: 168, avgCadence: 168, streams: nov9Streams(),
} as Activity;
const intervals = {
  id: 's9', date: '2026-11-09', type: 'vo2max', title: 'Intervals: 6 x 1 km', focus: 'VO2 max', purpose: '', howItHelps: '', phase: 'build',
  status: 'planned', distanceM: 16000, durationS: 4200, paceTarget: { minSPerKm: 190, maxSPerKm: 195 },
  steps: [{ label: '6 x 1 km', detail: '', kind: 'work', pace: [190, 195] as [number, number] }],
} as unknown as PlannedSession;
const safi: Race = { id: 'r', name: 'Safi 5K AM', date: '2026-12-06', distanceM: 5000, courseType: 'road', goalS: 960, priority: 'A' };

describe('9 Nov: intervals planned, an easy run done instead', () => {
  const type = classify(run, paces, zones, 3600).type;
  it('is an easy run, not tempo (heart rate alone cannot make an easy-paced run tempo)', () => {
    expect(type).toBe('easy');
  });
  it('counts as swapped, not done', () => {
    expect(sessionOutcome('vo2max', type).status).toBe('swapped');
    expect(sessionOutcome('easy', 'tempo')).toEqual({ status: 'done', harder: true });
    expect(sessionOutcome('threshold', 'threshold').status).toBe('done');
  });
  const hrSetupLow = { max: 175, rest: 44, estimated: false };
  const check = hrCheck([{ ...run, maxHr: 177 }], hrSetupLow, paces.easy[0], new Date('2026-11-09T12:00:00Z'));
  it('spots that max heart rate is set too low (a run recorded above it)', () => {
    expect(check?.reason).toMatch(/177 bpm, above your max of 175/);
  });
  const an = analyse({ a: run, all: [run], paces, zones, typicalMovingS: 3600, planned: intervals, pastFeedback: [], units: 'km', typeOf: () => type, hrSuspect: !!check });
  it('is judged as an easy run: easy pace range, planned distance, no "start slower" advice', () => {
    expect(an.swappedFrom?.title).toBe('Intervals: 6 x 1 km');
    expect(an.planned?.type).toBe('easy');
    const pace = an.plannedVsActual.find((r) => /pace/i.test(r.label))!;
    expect(pace.ok).toBe(true);
    expect(an.plannedVsActual.find((r) => r.label === 'Distance')!.ok).toBe(true);
    expect(an.improve.join(' ')).not.toMatch(/slower/i);
    expect(an.patternNotes.join(' ')).toMatch(/zones look set too low/);
    expect(an.wentWell.join(' ')).toMatch(/relaxed finish is fine/i);
    expect(an.score).toBeGreaterThanOrEqual(75);
  });
  const rep = buildReport({ a: run, an, planned: an.planned, all: [run], race: safi, paces, fitnessVdot: 63.3, units: 'km', typeOf: () => type });
  it('no pace-accuracy 0 and no consistency penalty for the relaxed finish', () => {
    const pace = rep.breakdown.find((b) => b.key === 'pace');
    expect(pace?.value ?? 100).toBeGreaterThanOrEqual(90);
    expect(rep.breakdown.find((b) => b.key === 'consistency')).toBeUndefined();
  });
  it('does not change the race estimate', () => {
    expect(rep.goalNote).toBe("Safi 5K AM prediction not changed: easy runs don't move your race estimate.");
    expect(rep.goalNote).not.toMatch(/suggests/);
  });
  it('the label is "Easy run" (the app adds "swapped from intervals")', () => {
    expect(TYPE_LABEL[type]).toBe('Easy run');
  });
});

describe('impossible runs stay out of the stats', () => {
  const r = (m: number, s: number) => ({ id: `${m}-${s}`, startTime: '2026-11-07T16:02:00Z', distanceM: m, movingS: s, durationS: s } as Activity);
  it('15 km in 75 seconds (a mistyped time) and GPS blips are left out', () => {
    expect(implausible(r(15000, 75))).toMatch(/world-record/);
    expect(implausible(r(5, 13))).toMatch(/too short/);
    expect(implausible(r(5000, 15 * 60 + 51))).toBeUndefined(); // a 15:51 5K is fine
    expect(forStats([r(15000, 75), r(10000, 2400)]).map((a) => a.distanceM)).toEqual([10000]);
  });
});

describe('9 Nov feedback screen: the verdict card', async () => {
  const { buildVerdict } = await import('./verdict');
  const type = classify(run, paces, zones, 3600).type;
  const check = hrCheck([{ ...run, maxHr: 177 }], { max: 175, rest: 44, estimated: false }, paces.easy[0], new Date('2026-11-09T12:00:00Z'));
  const an = analyse({ a: run, all: [run], paces, zones, typicalMovingS: 3600, planned: intervals, pastFeedback: [], units: 'km', typeOf: () => type, hrSuspect: !!check });
  const rep = buildReport({ a: run, an, planned: an.planned, all: [run], race: safi, paces, fitnessVdot: 63.3, units: 'km', typeOf: () => type });
  const v = buildVerdict({ a: run, an, rep, paces, zones, units: 'km', hrSuspect: !!check });
  it('is a good easy run, checked against the easy range, distance and finish', () => {
    const labels = v.checks.map((c) => c.label);
    expect(labels).toContain('Pace in your easy range');
    expect(labels).toContain('Distance as planned');
    expect(labels).toContain('Relaxed finish is fine');
    expect(v.checks.find((c) => c.label === 'Distance as planned')?.detail).toBe('16.3 of 16.0 km');
    expect(v.checks.find((c) => c.label === 'Pace in your easy range')?.detail).toMatch(/^4:25\/km · range 4:\d\d–4:\d\d\/km$/);
    expect(v.checks.length).toBeGreaterThanOrEqual(3);
    expect(v.checks.length).toBeLessThanOrEqual(5);
  });
  it('blames the heart rate settings, not the runner, and never says "start slower"', () => {
    const text = v.checks.map((c) => `${c.label} ${c.detail ?? ''}`).join(' ');
    expect(text).not.toMatch(/start (the first third )?slower/i);
    expect(text).not.toMatch(/Heart rate ran high/);
    expect(v.title).toBe('Good easy run');
  });
  it('without the heart rate problem, it is simply a good easy run', () => {
    const okZones = hrZones({ max: 190, rest: 44 } as never);
    const an2 = analyse({ a: run, all: [run], paces, zones: okZones, typicalMovingS: 3600, planned: intervals, pastFeedback: [], units: 'km', typeOf: () => type });
    const rep2 = buildReport({ a: run, an: an2, planned: an2.planned, all: [run], race: safi, paces, fitnessVdot: 63.3, units: 'km', typeOf: () => type });
    const v2 = buildVerdict({ a: run, an: an2, rep: rep2, paces, zones: okZones, units: 'km' });
    expect(v2.title).toBe('Good easy run');
    expect(v2.zone).toBe(2);
    expect(v2.checks.every((c) => c.ok)).toBe(true);
  });
});

describe('a session logged with its reps is done, not swapped', async () => {
  const { adaptPlan } = await import('./plan');
  it('6 x 1 km entered by hand, averaging an easy-looking pace overall', () => {
    const plan = { id: 'p', createdAt: '2026-11-01T00:00:00Z', startDate: '2026-11-02', endDate: '2026-12-06', phases: [], changes: [], sessions: [{ ...intervals, date: '2026-11-09' }] } as never;
    const ranEasy = { ...run, id: 'm1', source: 'manual', streams: undefined, plannedSessionId: 's9', reps: [{ kind: 'work', label: 'Rep 1', timeS: 192, distanceM: 1000 }] } as Activity;
    const out = adaptPlan({ plan, activities: [ranEasy], feedback: [], profile: { name: 'R', units: 'km' } as never, today: new Date('2026-11-10T09:00:00Z'), typeOf: () => 'easy' as never, paces });
    expect(out.sessions[0].status).toBe('done');
  });
});
