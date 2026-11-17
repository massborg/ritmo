// Fixes from the second QA sweep: one race run for both race pages, race preparation in the runner's unit, no
// fitness estimate before the first run, a HYROX session made from a run counted once, and HYROX as a hard session.
import { describe, expect, it } from 'vitest';
import type { Activity, LogEntry, Profile, Race } from '../lib/types';
import { raceReadiness, raceResultS, raceRunFor } from './insights';
import { estimateFitness } from './fitness';
import { loadSeries, type LoadDay } from './load';
import { readinessScore } from './readiness';
import { enteredRace } from '../hyrox/hyrox';
import { localReply, type CoachContext } from '../coach/coach';
import { trainingPaces } from './fitness';

const run = (id: string, start: string, km: number, movingS: number, extra: Partial<Activity> = {}): Activity => ({ id, source: 'upload', sourceIds: {}, name: 'Run', sport: 'run', startTime: start, distanceM: km * 1000, movingS, durationS: movingS, detailScore: 5, importedAt: '', ...extra } as Activity);
const hr = { rest: 50, max: 190 } as Parameters<typeof loadSeries>[1];

describe('the run that was the race', () => {
  const race = { id: 'r', name: 'Autumn 10K', date: '2026-11-01', distanceM: 10000, courseType: 'road', priority: 'A' } as Race;
  it('is the one the runner marked, on both pages, with one result time', () => {
    const early = run('a', '2026-11-01T06:30:00', 10, 2780, { durationS: 2810 }), marked = run('b', '2026-11-01T08:00:00', 10.02, 1991, { isRace: true });
    expect(raceRunFor(race, [early, marked])?.id).toBe('b');
    expect(raceRunFor(race, [marked, early])?.id).toBe('b');
    // Nothing marked: the one nearest the race distance
    expect(raceRunFor(race, [run('c', '2026-11-01T06:30:00', 4, 1200), early])?.id).toBe('a');
    expect(raceResultS(early)).toBe(2810);
  });
  it('race preparation is in the runner\'s unit', () => {
    const today = new Date('2026-11-12T09:00:00');
    const acts = [run('l', '2026-11-08T07:00:00', 21.1, 6000), run('m', '2026-11-05T07:00:00', 10, 3000)];
    const safi = { ...race, date: '2026-12-06' } as Race;
    expect(raceReadiness(safi, acts, 55, today).parts[0].value).toMatch(/^21\.1 km of \d+ km$/);
    const mi = raceReadiness(safi, acts, 55, today, 'mi').parts;
    expect(mi[0].value).toMatch(/^13\.1 mi of \d+\.\d mi$/);
    expect(mi[1].value).toMatch(/^\d+ mi of \d+ mi$/);
  });
});

describe('fitness estimates over time', () => {
  it('there is none for a month before the runner\'s first run', () => {
    const acts = [run('a', '2026-07-06T07:00:00', 10, 3000), run('b', '2026-08-06T07:00:00', 10, 2950)];
    expect(estimateFitness(acts, hr as never, new Date('2026-03-31T12:00:00'))).toBeUndefined();
    expect(estimateFitness(acts, hr as never, new Date('2026-08-31T12:00:00'))).toBeDefined();
  });
});

describe('HYROX in load and readiness', () => {
  const t = Array(8).fill(300);
  const sim = { ...enteredRace({ id: 'h', date: '2026-11-11', division: 'men_open', runs: t, stations: t }), mode: 'full' as const, isRace: false, partial: undefined };
  const entry = (id: string): LogEntry => ({ id, date: '2026-11-11', kind: 'hyrox', minutes: 80, rpe: 8, at: '', hyrox: { ...sim, id } });
  it('a session made from a run\'s laps is counted once: the run feeds the load, the entry adds nothing', () => {
    const a = run('act1', '2026-11-11T09:00:00', 8, 4800);
    const to = new Date('2026-11-11T20:00:00');
    const load = (log: LogEntry[]) => loadSeries([a], hr, 270, to, 5, log).find((d) => d.date === '2026-11-11')!.load;
    expect(load([entry('laps-act1')])).toBe(load([]));
    // Recorded with the HYROX recorder (no run behind it): it counts
    expect(load([entry('h1')])).toBeGreaterThan(load([]));
  });
  it('the morning after a recorded simulation, Recovery is "Under 24 h", not "No hard session in the last two weeks"', () => {
    const now = new Date('2026-11-12T07:30:00');
    const series: LoadDay[] = [{ date: '2026-11-12', load: 0, ctl: 60, atl: 60, tsb: 0 }];
    const profile = { name: 'R', units: 'km', theme: 'system', log: [entry('h1')] } as Profile;
    const r = readinessScore({ now, series, activities: [], feedback: [], profile, typeOf: () => 'easy' as never });
    const rec = r.factors.find((f) => f.key === 'recovery')!;
    expect(rec.value).toBe('Under 24 h');
    expect(rec.effect).toBe(-20);
    expect(rec.explain).toMatch(/HYROX simulation/);
    const none = readinessScore({ now, series, activities: [], feedback: [], profile: { ...profile, log: [] }, typeOf: () => 'easy' as never });
    expect(none.factors.find((f) => f.key === 'recovery')!.explain).toBe('No hard session in the last two weeks.');
  });
});

describe('the built-in coach on HYROX', () => {
  const t = Array(8).fill(300);
  const sim = { ...enteredRace({ id: 'h', date: '2026-11-01', division: 'men_open', runs: t, stations: t }), mode: 'full' as const, isRace: false, partial: undefined };
  const profile = { units: 'km', injuries: [], athleteType: 'hyrox', hyrox: { goalS: 4500, raceDate: '2026-12-12' }, log: [{ id: 'h', date: '2026-11-01', kind: 'hyrox', at: '', hyrox: sim }] } as unknown as Profile;
  const ctx = (o: Partial<CoachContext> = {}): CoachContext => ({ today: new Date('2026-11-12T09:00:00'), profile, units: 'km', readiness: { label: 'Ready (85)', summary: '', basedOn: [] } as never, stage: { stage: 'full', predictions: true } as never, nextSessions: [], weekDoneM: 0, weekPlannedM: 0, weekSessionsDone: 0, weekSessionsPlanned: 0, planSessionsDone: 0, planSessionsTotal: 0, runCount: 10, hasData: true, paces: trainingPaces(55),
    race: { id: 'r', name: '5K', date: '2026-12-06', distanceM: 5000, courseType: 'road', priority: 'A', goalS: 930 } as Race, raceReadiness: { predictedS: 951, score: 95, parts: [], summary: '' } as never, ...o });
  it('answers "on track for my HYROX race" from the HYROX prediction and goal, not the running race', () => {
    const r = localReply('Am I on track for my HYROX race?', ctx()).text;
    expect(r).toMatch(/Your HYROX prediction is 1:\d\d:\d\d/);
    expect(r).toMatch(/your goal of 1:15:00, with 30 days to go/);
    expect(r).not.toMatch(/15:51|930|Race preparation/);
  });
  it('answers station and pacing questions from the same facts', () => {
    for (const q of ['What HYROX time can I expect?', 'How do I get better at wall balls?', 'What are my weakest stations?']) expect(localReply(q, ctx()).text).toMatch(/HYROX prediction/);
    // A runner asking about a running race still gets the running answer
    expect(localReply('Am I on track for my race?', ctx({ profile: { units: 'km', injuries: [] } as unknown as Profile })).text).not.toMatch(/HYROX/);
  });
});
