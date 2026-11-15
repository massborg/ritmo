import { describe, expect, it } from 'vitest';
import { generatePlan, validatePlan } from '../training/generator';
import { resolveStrength } from '../training/strength';
import { trainingPaces } from '../training/fitness';
import { SAMPLE_PROFILE } from '../data/sample';
import type { Plan, Profile, Race } from '../lib/types';
import { hyroxRunPace, planGoal, stationBlocks, stationExercises, targetsFromGoal } from './plan-goal';
import { addDays, daysBetween, parseYmd, ymd } from '../lib/format';

const TODAY = new Date('2026-11-16T09:00:00'); // a Monday
const P = trainingPaces(52); // about a 19:30 5K
const base: Profile = { ...SAMPLE_PROFILE, daysAvailable: [0, 1, 2, 3, 5, 6], longRunDay: 5, training: {} };
const hyrox = (o: Partial<NonNullable<Profile['hyrox']>> = {}, type: Profile['athleteType'] = 'hyrox'): Profile => ({ ...base, athleteType: type, hyrox: { division: 'men_open', raceDate: ymd(addDays(TODAY, 12 * 7 + 5)), goalS: 75 * 60, hardest: ['sled_pull', 'wall_balls'], equipment: ['skierg', 'rower', 'wall_ball', 'kettlebells'], ...o } });
const gen = (profile: Profile, race?: Race, km = 50): Plan => { const r = generatePlan({ today: TODAY, profile, race, paces: P, recentWeeklyKm: km, longestRecentKm: 16 }); if (!r.ok) throw new Error(r.problem.message); return r.plan; };
const tenK: Race = { id: 'r', name: 'City 10K', date: ymd(addDays(TODAY, 8 * 7 + 6)), distanceM: 10000, courseType: 'road', priority: 'A' };
const T = Math.round((P.threshold[0] + P.threshold[1]) / 2);

describe('which goal the plan is for', () => {
  it('a runner gets a running plan; a HYROX athlete gets HYROX', () => {
    expect(planGoal(base, tenK, TODAY)).toEqual({});
    const g = planGoal(hyrox(), undefined, TODAY).hyrox!;
    expect(g.race).toMatchObject({ name: 'HYROX', distanceM: 8000, goalS: 4500 });
    expect(g.runShare).toBe(0.47);
    expect(g.hardest).toEqual(['sled_pull', 'wall_balls']);
  });
  it('"Both": whichever race is nearer, keeping one session for the other inside 8 weeks', () => {
    // The 10K is nearer (8 weeks), HYROX 4 weeks later: a running plan that keeps HYROX
    expect(planGoal(hyrox({}, 'both'), tenK, TODAY)).toEqual({ keepHyrox: true });
    // HYROX nearer
    const g = planGoal(hyrox({ raceDate: ymd(addDays(TODAY, 40)) }, 'both'), tenK, TODAY);
    expect(g.hyrox?.keepRunning).toBe(true);
    // Far apart: no maintenance
    expect(planGoal(hyrox({ raceDate: ymd(addDays(TODAY, 40)) }, 'both'), { ...tenK, date: ymd(addDays(TODAY, 150)) }, TODAY).hyrox?.keepRunning).toBe(false);
  });
});

describe('HYROX run pace and targets', () => {
  it('goal × run share ÷ 8, never faster than threshold', () => {
    expect(hyroxRunPace(75 * 60, 0.47, 240)).toBe(264); // 4:24/km
    expect(hyroxRunPace(60 * 60, 0.47, 240)).toBe(240); // 3:32 would be faster than threshold: limited
    expect(hyroxRunPace(undefined, 0.47, 240)).toBe(255);
  });
  it('station blocks and strength follow the hardest stations and the equipment', () => {
    expect(stationBlocks(['sled_pull', 'wall_balls'], ['wall_ball'])).toEqual(['20 heavy band rows', '25 wall balls']);
    expect(stationExercises(['sled_push', 'wall_balls'], ['sled'])).toEqual(['sled-push', 'goblet-squat']);
    const t = targetsFromGoal(75 * 60);
    expect(t.run).toBe(264);
    // A goal that asks for runs faster than threshold pace: the run target is held at threshold
    expect(targetsFromGoal(60 * 60).run).toBe(212);
    expect(targetsFromGoal(60 * 60, 0.47, 265).run).toBe(265);
    expect(t.wall_balls).toBeGreaterThan(t.farmers_carry!);
  });
});

describe('a HYROX plan (update 4, task 6)', () => {
  const plan = gen(hyrox());
  const of = (k: string) => plan.sessions.filter((s) => s.hyrox?.kind === k);
  it('is valid, marked as HYROX, and ends with the race', () => {
    expect(validatePlan(plan, P)).toEqual([]);
    expect(plan.goal).toBe('hyrox');
    expect(plan.raceId).toBeUndefined();
    const last = plan.sessions[plan.sessions.length - 1];
    expect(last).toMatchObject({ type: 'race', title: 'HYROX', distanceM: 8000, durationS: 4500 });
    expect(plan.changes[0].summary).toMatch(/This is a HYROX plan/);
  });
  it('runs less than a road plan, with the long run capped near 85 minutes', () => {
    const road = gen(base, { ...tenK, date: hyrox().hyrox!.raceDate! });
    // Over the whole plan: about 60 to 80% of the road plan's running; the hardest weeks stay under its peak
    const avg = (p: Plan) => p.weeks!.reduce((a, w) => a + w.targetKm, 0) / p.weeks!.length;
    const peak = (p: Plan) => Math.max(...p.weeks!.map((w) => w.targetKm));
    expect(avg(plan) / avg(road)).toBeGreaterThan(0.6);
    expect(avg(plan) / avg(road)).toBeLessThan(0.8);
    expect(peak(plan)).toBeLessThan(peak(road));
    for (const s of plan.sessions.filter((x) => x.type === 'long')) expect(s.durationS).toBeLessThanOrEqual(90 * 60);
  });
  it('1 km repeats start at 6 x 1 km with 90 s and build, at the HYROX pace', () => {
    const reps = of('km_repeats').filter((s) => s.phase !== 'taper');
    expect(reps.length).toBeGreaterThanOrEqual(3);
    expect(reps[0].title).toBe('HYROX 1 km repeats: 6 x 1 km');
    expect(reps[0].steps[1].detail).toMatch(/1\.5 min easy jog between/);
    expect(reps.map((s) => Number(s.title.match(/(\d) x 1 km/)![1])).every((n, i, a) => i === 0 || n >= a[i - 1])).toBe(true);
    expect(reps.some((s) => /(1 min|45 s) easy jog/.test(s.steps[1].detail))).toBe(true);
    // 75 min × 0.47 ÷ 8 = 4:24/km, slower than threshold, so it is used as it is
    const pace = reps[0].steps[1].pace!;
    expect(Math.round((pace[0] + pace[1]) / 2)).toBe(Math.max(264, T));
    expect(pace[0]).toBeGreaterThanOrEqual(T - 4);
  });
  it('compromised runs use the hardest stations, with swaps for missing equipment', () => {
    const c = of('compromised');
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c[0].title).toMatch(/^Compromised runs: [4-8] x \(station \+ 1 km\)$/);
    expect(c[0].hyrox!.blocks).toEqual(['20 heavy band rows', '25 wall balls']); // no sled: band rows
  });
  it('half simulations in the build, one full simulation 3 to 4 weeks out, none in race week', () => {
    const race = parseYmd(hyrox().hyrox!.raceDate!);
    expect(of('sim_half').length).toBeGreaterThanOrEqual(1);
    const full = of('sim_full');
    expect(full).toHaveLength(1);
    const out = daysBetween(parseYmd(full[0].date), race);
    expect(out).toBeGreaterThanOrEqual(21);
    expect(out).toBeLessThanOrEqual(34);
    for (const s of [...of('sim_half'), ...full]) expect(daysBetween(parseYmd(s.date), race)).toBeGreaterThan(10);
  });
  it('the taper keeps a 4 x 1 km touch and ends with a light station run-through', () => {
    const taper = plan.sessions.filter((s) => s.phase === 'taper');
    expect(taper.some((s) => /Race-pace sharpener: 4 x 1 km/.test(s.title))).toBe(true);
    expect(of('run_through')).toHaveLength(1);
    expect(daysBetween(parseYmd(of('run_through')[0].date), parseYmd(hyrox().hyrox!.raceDate!))).toBeLessThanOrEqual(4);
  });
  it('two strength sessions a week, with extra work for the hardest stations, light in the taper', () => {
    const wk = plan.sessions.filter((s) => s.date >= plan.weeks![3].start && s.date < plan.weeks![4].start && s.strengthPlan);
    expect(wk).toHaveLength(2);
    const withStations = plan.sessions.filter((s) => s.strengthPlan?.extra);
    expect(withStations.length).toBeGreaterThan(3);
    expect(resolveStrength(withStations[0].strengthPlan!, { equipment: 'gym' }).items.map((x) => x.id)).toEqual(expect.arrayContaining(['db-row', 'wall-ball']));
    for (const s of plan.sessions.filter((x) => x.phase === 'taper' && x.strengthPlan)) expect(s.strengthPlan!.intensity).toBe('light');
  });
  it('no race date: an open-ended HYROX plan, without a full simulation', () => {
    const open = gen(hyrox({ raceDate: undefined }));
    expect(validatePlan(open, P)).toEqual([]);
    expect(open.sessions.some((s) => s.hyrox?.kind === 'compromised')).toBe(true);
    expect(open.sessions.some((s) => s.type === 'race')).toBe(false);
  });
  it('"Both" with a running race within 8 weeks keeps a threshold run every week', () => {
    const both = gen(hyrox({ raceDate: ymd(addDays(TODAY, 8 * 7 + 5)) }, 'both'), { ...tenK, date: ymd(addDays(TODAY, 12 * 7)) });
    expect(both.goal).toBe('hyrox');
    expect(both.sessions.filter((s) => s.type === 'threshold').length).toBeGreaterThanOrEqual(4);
    expect(both.changes[0].summary).toMatch(/one threshold run a week is kept/);
    // And the other way round: a running plan with station strength
    const run = gen(hyrox({}, 'both'), tenK);
    expect(run.goal).toBeUndefined();
    expect(run.sessions.some((s) => s.strengthPlan?.extra)).toBe(true);
    expect(run.changes[0].summary).toMatch(/You also train for HYROX/);
  });
  it('a runner’s plan is unchanged by all of this', () => {
    const a = gen(base, tenK);
    expect(a.sessions.some((s) => s.hyrox)).toBe(false);
    expect(a.sessions.some((s) => s.strengthPlan)).toBe(false);
  });
});
