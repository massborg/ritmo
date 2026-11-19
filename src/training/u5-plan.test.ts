// Update 5, U4: plan-builder fixes from the 31-profile test
import { describe, expect, it } from 'vitest';
import { generatePlan, validatePlan, type GenResult } from './generator';
import { trainingPaces } from './fitness';
import { SAMPLE_PROFILE } from '../data/sample';
import type { Plan, Profile, Race } from '../lib/types';
import { stationBlocks, stationExercises } from '../hyrox/plan-goal';
import { addDays, ymd } from '../lib/format';

const TODAY = new Date('2026-11-16T09:00:00'); // a Monday
const base: Profile = { ...SAMPLE_PROFILE, daysAvailable: [1, 3, 5, 6], longRunDay: 6, training: {} };
const race = (weeks: number, distanceM: number, o: Partial<Race> = {}): Race => ({ id: 'r', name: 'City race', date: ymd(addDays(TODAY, weeks * 7 - 1)), distanceM, courseType: 'road', priority: 'A', ...o });
const gen = (profile: Profile, r: Race | undefined, km: number, vdot = 42, longest = 12): GenResult => generatePlan({ today: TODAY, profile, race: r, paces: trainingPaces(vdot), vdot, recentWeeklyKm: km, longestRecentKm: longest });
const ok = (r: GenResult): { plan: Plan; warnings: string[] } => { if (!r.ok) throw new Error(JSON.stringify(r.problem).slice(0, 300)); return r; };
const longest = (p: Plan) => Math.max(...p.sessions.filter((s) => s.type === 'long').map((s) => s.distanceM / 1000));

describe('1. marathon and half long runs reach the distance the race needs', () => {
  it('a 20-week marathon from 30 km a week, peak 70, builds to 28-32 km (it stopped at 18)', () => {
    const { plan, warnings } = ok(gen({ ...base, training: { peakKm: 70, maxLongMin: 180 } }, race(20, 42195), 30));
    expect(longest(plan)).toBeGreaterThanOrEqual(28);
    expect(longest(plan)).toBeLessThanOrEqual(32);
    expect(warnings.join(' ')).not.toMatch(/longest run in this plan/);
    expect(validatePlan(plan, trainingPaces(42))).toEqual([]);
    // It builds: no long run jumps by more than about 3 km on the one before a normal week
    const longs = plan.sessions.filter((s) => s.type === 'long').map((s) => s.distanceM / 1000);
    expect(Math.max(...longs.slice(1).map((x, i) => x - Math.max(...longs.slice(0, i + 1))))).toBeLessThanOrEqual(3.5);
  });
  it('when the volume cannot support it, the plan says so and what would', () => {
    const { plan, warnings } = ok(gen({ ...base, training: { peakKm: 38, maxLongMin: 180 } }, race(20, 42195), 30));
    expect(longest(plan)).toBeGreaterThan(11);
    expect(longest(plan)).toBeLessThan(28);
    expect(warnings.join(' ')).toMatch(/Your longest run in this plan is \d+ km\. For a marathon, 28 to 32 km is the usual target; a peak of 38 km a week does not allow it.*peak of about 63 km a week.*half marathon/);
    const short = ok(gen(base, race(6, 42195), 20));
    expect(short.warnings.join(' ')).toMatch(/longest run in this plan/);
  });
  it('a half marathon builds toward 18-21 km when the week allows it', () => {
    const { plan } = ok(gen({ ...base, training: { peakKm: 50 } }, race(16, 21097.5), 35));
    expect(longest(plan)).toBeGreaterThanOrEqual(18);
    expect(longest(plan)).toBeLessThanOrEqual(21);
    // A 10K plan is unchanged by this
    expect(longest(ok(gen(base, race(10, 10000), 35)).plan)).toBeLessThan(18);
  });
});

describe('2. "Both": the plan covers both races', () => {
  const both = (runWeeks: number, hxWeeks: number, dist = 10000) => ok(gen({ ...base, daysAvailable: [0, 1, 3, 4, 5, 6], athleteType: 'both', hyrox: { division: 'men_open', raceDate: ymd(addDays(TODAY, hxWeeks * 7 - 1)), goalS: 5400 } }, race(runWeeks, dist), 45, 48, 14));
  it('10K in 6 weeks, HYROX in 14: the 10K block, a recovery week, then HYROX sessions to the HYROX race', () => {
    const { plan } = both(6, 14);
    const races = plan.sessions.filter((s) => s.type === 'race');
    expect(races.map((s) => s.title)).toEqual(['City race', 'HYROX']);
    expect(plan.endDate).toBe(ymd(addDays(TODAY, 14 * 7 - 1)));
    expect(plan.next).toEqual({ startDate: ymd(addDays(TODAY, 6 * 7)), goal: 'hyrox' });
    const after = plan.sessions.filter((s) => s.date > races[0].date);
    expect(after.filter((s) => s.hyrox).length).toBeGreaterThan(6);
    // The week after the first race: two days off, then easy only
    const week = after.filter((s) => s.date <= ymd(addDays(TODAY, 6 * 7 + 6)));
    expect(week.slice(0, 2).every((s) => s.type === 'rest')).toBe(true);
    expect(week.every((s) => s.type === 'rest' || s.type === 'easy')).toBe(true);
    expect(plan.changes[0].summary).toMatch(/Two races, two blocks/);
    // No day is planned twice
    expect(new Set(plan.sessions.map((s) => s.date)).size).toBe(plan.sessions.length);
  });
  it('HYROX in 4 weeks, a half in 12: HYROX first, then the half is planned too', () => {
    const { plan } = both(12, 4, 21097.5);
    expect(plan.goal).toBe('hyrox');
    expect(plan.sessions.filter((s) => s.type === 'race').map((s) => s.title)).toEqual(['HYROX', 'City race']);
    expect(plan.next).toMatchObject({ raceId: 'r' });
    expect(plan.sessions.filter((s) => s.date > ymd(addDays(TODAY, 5 * 7)) && s.type === 'long').length).toBeGreaterThan(3);
  });
  it('races a week apart stay one block', () => {
    const { plan } = both(6, 7);
    expect(plan.next).toBeUndefined();
    expect(plan.sessions.filter((s) => s.type === 'race')).toHaveLength(1);
  });
});

describe('3. an injury in the profile changes the start of the plan', () => {
  it('no hard sessions and no long runs in the first two weeks, and the plan says why', () => {
    const { plan, warnings } = ok(gen({ ...base, daysAvailable: [0, 1, 3, 4, 5, 6], injuries: [{ area: 'Knee', status: 'current' }] }, race(10, 10000), 45, 48));
    const early = plan.sessions.filter((s) => s.date <= ymd(addDays(TODAY, 13)) && s.type !== 'rest');
    expect(early.every((s) => s.type === 'easy' || s.type === 'recovery')).toBe(true);
    expect(early.some((s) => /because of your knee/.test(s.purpose))).toBe(true);
    expect(plan.sessions.filter((s) => s.date > ymd(addDays(TODAY, 13))).some((s) => s.type === 'threshold' || s.type === 'vo2max')).toBe(true);
    expect(warnings.join(' ')).toMatch(/Because of your knee, the first two weeks have no hard sessions/);
    // A past injury changes nothing
    const past = ok(gen({ ...base, daysAvailable: [0, 1, 3, 4, 5, 6], injuries: [{ area: 'Knee', status: 'past' }] }, race(10, 10000), 45, 48));
    expect(past.plan.sessions.filter((s) => s.date <= ymd(addDays(TODAY, 13))).some((s) => s.type !== 'rest' && s.type !== 'easy')).toBe(true);
  });
});

describe('4. limits the runner set are respected or said', () => {
  it('a weekly limit below the current distance is the limit (90 km now, 60 asked: not 89-91)', () => {
    const { plan, warnings } = ok(gen({ ...base, daysAvailable: [0, 1, 2, 3, 4, 5, 6], training: { peakKm: 60 } }, race(16, 42195), 90, 55, 26));
    expect(Math.max(...(plan.weeks ?? []).filter((w) => w.phase !== 'taper').map((w) => w.targetKm))).toBeLessThanOrEqual(62);
    expect(warnings.join(' ')).toMatch(/You set a limit of 60 km a week, below the 90 km you run now/);
  });
  it('sessions longer than the time available are counted and named', () => {
    const { warnings } = ok(gen({ ...base, schedule: { sessionMinutes: 30, startDate: ymd(TODAY), timeOff: [] } }, race(16, 42195), 40));
    expect(warnings.join(' ')).toMatch(/\d+ sessions are longer than the 30 minutes you have for a session \(the longest is \d+ min\)/);
    expect(ok(gen({ ...base, schedule: { sessionMinutes: 240, startDate: ymd(TODAY), timeOff: [] } }, race(16, 42195), 40)).warnings.join(' ')).not.toMatch(/longer than the/);
  });
});

describe('5. a goal far beyond current fitness is flagged', () => {
  it('13:00 for 5K at a 24-minute fitness: a warning with a realistic time; a goal within reach: none', () => {
    const w = ok(gen(base, race(10, 5000, { goalS: 780 }), 30, 40)).warnings.join(' ');
    expect(w).toMatch(/Your goal of 13:00 is 4\d% faster than your current fitness suggests \(about 24:\d\d\)\..*realistic goal for this plan is about 2\d:\d\d/);
    expect(ok(gen(base, race(10, 5000, { goalS: 23 * 60 + 30 }), 30, 40)).warnings.join(' ')).not.toMatch(/faster than your current fitness/);
  });
});

describe('6. HYROX progression', () => {
  const hx = (km: number, equipment?: string[]) => ok(gen({ ...base, daysAvailable: [0, 1, 3, 4, 5], longRunDay: 5, athleteType: 'hyrox', hyrox: { division: 'men_open', raceDate: ymd(addDays(TODAY, 16 * 7 - 1)), goalS: 5400, equipment, hardest: ['skierg', 'sled_pull', 'wall_balls'] } }, undefined, km, 45, 10)).plan;
  it('1 km repeats build to 8, with a half simulation every 2 to 3 weeks and one full simulation', () => {
    const plan = hx(45);
    const reps = plan.sessions.filter((s) => s.hyrox?.kind === 'km_repeats').map((s) => Number(s.title.match(/(\d+) x/)?.[1]));
    expect(Math.max(...reps)).toBe(8);
    expect(plan.sessions.filter((s) => s.hyrox?.kind === 'sim_half').length).toBeGreaterThanOrEqual(2);
    expect(plan.sessions.filter((s) => s.hyrox?.kind === 'sim_full')).toHaveLength(1);
    expect(validatePlan(plan, trainingPaces(45))).toEqual([]);
  });
  it('with no equipment at all, station work is bodyweight (no bands)', () => {
    expect(stationBlocks(['skierg', 'sled_pull', 'wall_balls', 'farmers_carry'], [])).toEqual(['20 burpees', '30 air squats', '30 air squats', '60 s wall sit']);
    expect(stationExercises(['skierg', 'sled_pull', 'farmers_carry'], [])).toEqual(['burpee-broad-jump', 'bw-squat', 'wall-sit']);
    expect(stationBlocks(['skierg'], ['kettlebells'])).toEqual(['25 band pull-downs']);
    const blocks = hx(30, []).sessions.flatMap((s) => s.hyrox?.blocks ?? []);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some((b) => /band|SkiErg|sled/.test(b))).toBe(false);
  });
});

describe('7. the easy-run warning says what it means', () => {
  it('gives the length of the easy runs, suggests only days the runner offered, and is quiet in race week', () => {
    const w = ok(gen({ ...base, daysAvailable: [1, 3, 5] }, race(10, 10000), 30)).warnings.join(' ');
    expect(w).not.toMatch(/\dth day|6th/);
    const four = ok(gen({ ...base, daysAvailable: [0, 1, 3, 5, 6], training: { daysPerWeek: 4 } }, race(10, 10000), 45)).warnings.find((x) => /Easy runs are a little long/.test(x));
    if (four) { expect(four).toMatch(/about \d+ km each, with \d+ km a week on 4 days/); expect(four).not.toMatch(/th day/); }
    const raceWeek = generatePlan({ today: TODAY, profile: base, race: { ...race(1, 10000), date: ymd(addDays(TODAY, 1)) }, paces: trainingPaces(42), recentWeeklyKm: 30, longestRecentKm: 12 });
    if (raceWeek.ok) expect(raceWeek.warnings.join(' ')).not.toMatch(/Easy runs are a little long/);
  });
});
