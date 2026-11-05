import { describe, expect, it } from 'vitest';
import type { Activity, Profile } from '../lib/types';
import { ageOn, ALL_STEPS, backgroundFromRuns, checkGoal, HEALTH_QUESTIONS, isOldEnough, planFromSetup, stepsNeeded, vdotFromWeeklyKm } from './setup';
import { avatarFileProblem } from '../data/avatar';
import { addDays, parseYmd, ymd } from '../lib/format';

const today = parseYmd('2026-11-06');
const base: Profile = { name: '', units: 'km', theme: 'system', goal: '', daysAvailable: [1, 3, 5], longRunDay: 5, injuries: [], onboarded: false };
const complete: Profile = {
  ...base, name: 'Sam', dateOfBirth: '1990-05-01',
  consents: { healthData: { granted: true, at: '2026-11-06T08:00:00Z', version: '2026-11' } },
  healthCheck: { completedAt: '2026-11-06T08:00:00Z', doctorAdvised: false },
  background: { level: 'regular', weeklyKm: 30, longestRecentKm: 12 }, goalType: 'faster',
  schedule: { sessionMinutes: 45, startDate: '2026-11-06', timeOff: [] }, injuriesAnswered: true,
};
const run = (id: string, date: string, km: number, min: number): Activity => ({
  id, source: 'manual', sourceIds: { manual: id }, startTime: `${date}T08:00:00.000Z`, name: 'Run', sport: 'run',
  distanceM: km * 1000, durationS: min * 60, movingS: min * 60, detailScore: 1, importedAt: '',
});

describe('age rule', () => {
  it('counts birthdays correctly', () => {
    expect(ageOn('2008-11-06', today)).toBe(18);
    expect(ageOn('2008-11-07', today)).toBe(17);
    expect(ageOn('2000-02-29', parseYmd('2026-02-28'))).toBe(25);
  });
  it('requires 18 or over', () => {
    expect(isOldEnough('2008-11-06', today)).toBe(true);
    expect(isOldEnough('2008-11-07', today)).toBe(false);
    expect(isOldEnough(undefined, today)).toBe(false);
  });
});

describe('setup steps', () => {
  it('a new account sees every step', () => {
    expect(stepsNeeded(base, { hasRuns: false, hasPlan: false, today })).toEqual(ALL_STEPS);
  });
  it('an existing user with runs and a plan only answers what is missing', () => {
    const existing: Profile = { ...base, name: 'Alex', onboarded: true, experience: 'runner', schedule: { sessionMinutes: 45, startDate: '2026-01-01', timeOff: [] } };
    expect(stepsNeeded(existing, { hasRuns: true, hasPlan: true, today })).toEqual(['consent', 'basics', 'health', 'background', 'goal', 'injuries']);
  });
  it('a fully answered profile needs nothing, and resumes where it stopped', () => {
    expect(stepsNeeded(complete, { hasRuns: true, hasPlan: true, today })).toEqual([]);
    expect(stepsNeeded({ ...complete, goalType: undefined, schedule: undefined }, { hasRuns: true, hasPlan: true, today })).toEqual(['goal', 'schedule']);
  });
  it('skipping the runs step is remembered', () => {
    expect(stepsNeeded({ ...complete, setupStepsDone: ['runs'] }, { hasRuns: false, hasPlan: false, today })).toEqual(['preview']);
  });
  it('a doctor-advised health check must be acknowledged', () => {
    expect(stepsNeeded({ ...complete, healthCheck: { completedAt: 'x', doctorAdvised: true } }, { hasRuns: true, hasPlan: true, today })).toEqual(['health']);
    expect(stepsNeeded({ ...complete, healthCheck: { completedAt: 'x', doctorAdvised: true, acknowledgedAt: 'y' } }, { hasRuns: true, hasPlan: true, today })).toEqual([]);
  });
  it('an under-18 date of birth sends the person back to basics', () => {
    expect(stepsNeeded({ ...complete, dateOfBirth: '2010-01-01' }, { hasRuns: true, hasPlan: true, today })).toEqual(['basics']);
  });
  it('has six health questions with unique ids', () => {
    expect(new Set(HEALTH_QUESTIONS.map((q) => q.id)).size).toBe(6);
  });
});

describe('goal check', () => {
  it('offers 5K first to someone who cannot run 10 minutes yet', () => {
    const c = checkGoal({ goalType: 'first10k', level: 'new', canRun10: false, today });
    expect(c.ok).toBe(false);
    expect(c.saferGoal?.goalType).toBe('5k');
  });
  it('flags a marathon too soon for a beginner and suggests a later date', () => {
    const c = checkGoal({ goalType: 'race', level: 'new', race: { distanceM: 42195, date: ymd(addDays(today, 70)) }, today });
    expect(c.ok).toBe(false);
    expect(c.message).toMatch(/weeks is short/);
    expect(c.saferGoal?.race?.goalS).toBeUndefined();
  });
  it('accepts a sensible race', () => {
    expect(checkGoal({ goalType: 'race', level: 'regular', weeklyKm: 35, race: { distanceM: 10000, date: ymd(addDays(today, 70)) }, today }).ok).toBe(true);
  });
  it('flags a target time far beyond current fitness and offers a realistic one', () => {
    const c = checkGoal({ goalType: 'race', level: 'regular', weeklyKm: 30, vdot: 40, race: { distanceM: 10000, date: ymd(addDays(today, 56)), goalS: 35 * 60 }, today });
    expect(c.ok).toBe(false);
    expect(c.saferGoal?.race?.goalS).toBeGreaterThan(40 * 60);
  });
  it('rejects a race date in the past', () => {
    expect(checkGoal({ goalType: 'race', level: 'regular', race: { distanceM: 5000, date: '2026-01-01' }, today }).ok).toBe(false);
  });
});

describe('first plan from setup', () => {
  it('beginners get a run/walk plan set by effort', () => {
    const r = planFromSetup({ profile: { ...complete, background: { level: 'new', canRun10: false, walksRegularly: true } }, races: [], activities: [], today });
    expect(r.confidence).toBe('none');
    expect(r.plan.sessions.some((s) => s.type === 'runwalk')).toBe(true);
    expect(r.plan.basis).toMatch(/new to running/);
  });
  it('a runner with only weekly distance gets estimated paces, labelled as such', () => {
    const r = planFromSetup({ profile: complete, races: [], activities: [], today });
    expect(r.confidence).toBe('estimated');
    expect(r.basis).toMatch(/estimated from your typical 30 km/);
    expect(r.plan.paceConfidence).toBe('estimated');
  });
  it('a recent race time sets paces', () => {
    const r = planFromSetup({ profile: { ...complete, background: { level: 'racer', weeklyKm: 40, recentRace: { distanceM: 10000, timeS: 45 * 60 } } }, races: [], activities: [], today });
    expect(r.basis).toMatch(/10K time of 45:00/);
  });
  it('time off becomes rest', () => {
    const r = planFromSetup({ profile: { ...complete, schedule: { sessionMinutes: 45, startDate: ymd(today), timeOff: [{ from: ymd(addDays(today, 3)), to: ymd(addDays(today, 9)) }] } }, races: [], activities: [], today });
    const off = r.plan.sessions.filter((s) => s.date >= ymd(addDays(today, 3)) && s.date <= ymd(addDays(today, 9)));
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((s) => s.type === 'rest')).toBe(true);
    expect(r.basis).toMatch(/time off/);
  });
  it('fills running background from imported runs', () => {
    const acts = [0, 3, 7, 10, 14, 17].map((d, k) => run(`r${k}`, ymd(addDays(today, -d - 1)), 8, 45));
    expect(backgroundFromRuns(acts, today)).toEqual({ weeklyKm: 6, longestRecentKm: 8 });
    expect(backgroundFromRuns(acts.slice(0, 2), today)).toBeUndefined();
  });
  it('weekly distance estimate rises with volume', () => {
    expect(vdotFromWeeklyKm(10)).toBeLessThan(vdotFromWeeklyKm(40));
  });
});

describe('profile picture files', () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size }) as File;
  it('accepts JPG, PNG and HEIC up to 10 MB', () => {
    expect(avatarFileProblem(file('me.jpg', 'image/jpeg', 2e6))).toBeUndefined();
    expect(avatarFileProblem(file('me.png', 'image/png', 2e6))).toBeUndefined();
    expect(avatarFileProblem(file('IMG_1.HEIC', '', 2e6))).toBeUndefined();
  });
  it('rejects other types and large files with a clear message', () => {
    expect(avatarFileProblem(file('me.gif', 'image/gif', 1e5))).toMatch(/not supported/);
    expect(avatarFileProblem(file('me.jpg', 'image/jpeg', 11 * 1024 * 1024))).toMatch(/10 MB/);
  });
});
