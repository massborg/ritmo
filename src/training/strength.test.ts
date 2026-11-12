// Strength (update 3, §4, §5, §8)
import { describe, expect, it } from 'vitest';
import type { Profile, Race } from '../lib/types';
import { alternatives, EXERCISES, exById, resolveStrength } from './strength';
import { generatePlan, type GenResult } from './generator';
import { trainingPaces } from './fitness';
import { crossLoad } from './load';
import { weekStreak } from './profile-pbs';
import { adaptPlan } from './plan';
import { emptyWeek } from './week-choice';
import { daysBetween, parseYmd } from '../lib/format';

const FRIDAY = new Date('2026-11-06T09:00:00');
const base: Profile = { name: 'R', units: 'km', theme: 'system', goal: '', daysAvailable: [0, 1, 2, 3, 4, 5, 6], longRunDay: 5, injuries: [], onboarded: true };
const half: Race = { id: 'r', name: 'Half', date: '2027-02-07', distanceM: 21097.5, courseType: 'road', priority: 'A' };
const ok = (r: GenResult) => { if (!r.ok) throw new Error(r.problem.message); return r.plan; };
const gen = (training: Profile['training']) => ok(generatePlan({ today: FRIDAY, profile: { ...base, training }, race: half, paces: trainingPaces(55), recentWeeklyKm: 60, longestRecentKm: 18 }));

describe('the strength library', () => {
  it('every exercise has cues, muscles and a dose; every routine slot exists', () => {
    for (const e of EXERCISES) { expect(e.cues.length).toBeGreaterThan(0); expect(e.muscles.length).toBeGreaterThan(0); expect(e.reps ?? e.seconds).toBeTruthy(); }
    for (const r of ['A', 'B', 'core', 'mobility'] as const) expect(resolveStrength({ routine: r, intensity: 'heavy', why: '' }).items.length).toBeGreaterThanOrEqual(4);
  });
  it('fits the equipment: no weights at home, heavier lifts in the gym', () => {
    const home = resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }, { equipment: 'none' });
    expect(home.items.every((x) => x.ex.equipment === 'none')).toBe(true);
    expect(home.equipment).toBe('none');
    const gym = resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }, { equipment: 'gym' });
    expect(gym.items[0].ex.id).toBe('back-squat');
  });
  it('lighter by intensity: heavy 7 exercises, moderate 5, light 4 with fewer sets', () => {
    expect(resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }).items).toHaveLength(7);
    expect(resolveStrength({ routine: 'A', intensity: 'moderate', why: '' }).items).toHaveLength(5);
    const light = resolveStrength({ routine: 'A', intensity: 'light', why: '' });
    expect(light.items).toHaveLength(4);
    expect(light.items.every((x) => x.sets === 2)).toBe(true);
  });
  it('swap: 3+ alternatives for the same muscles, each with a reason', () => {
    const alts = alternatives('split-squat');
    expect(alts.length).toBeGreaterThanOrEqual(3);
    expect(alts.every((a) => a.reason.length > 3)).toBe(true);
    expect(alts.some((a) => /knee-friendly|easier on balance|no weights needed/.test(a.reason))).toBe(true);
  });
  it('"Never give me…" leaves exercises and categories out of sessions and alternatives', () => {
    const r = resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }, { never: ['tag:jumping', 'tag:floor', 'calf-raise'] });
    expect(r.items.some((x) => x.ex.tags.includes('jumping') || x.ex.tags.includes('floor') || x.ex.id === 'calf-raise')).toBe(false);
    expect(alternatives('glute-bridge', ['tag:floor']).some((a) => a.ex.tags.includes('floor'))).toBe(false);
  });
  it('"Always use this instead" applies to every future session; one day\u2019s own list stays that day', () => {
    const r = resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }, { swaps: { 'bw-squat': 'wall-sit' } });
    expect(r.items.some((x) => x.id === 'wall-sit')).toBe(true);
    expect(r.items.some((x) => x.id === 'bw-squat')).toBe(false);
    const own = resolveStrength({ routine: 'A', intensity: 'heavy', why: '', custom: [{ id: 'plank', sets: 2, seconds: 30 }, { id: 'bw-squat', sets: 3, reps: 10 }] }, { swaps: { 'bw-squat': 'wall-sit' } });
    expect(own.items.map((x) => x.id)).toEqual(['plank', 'wall-sit']);
    expect(exById.get('wall-sit')).toBeTruthy();
  });
});

describe('strength in the plan', () => {
  const plan = gen({ strengthPerWeek: 2 });
  const withS = plan.sessions.filter((s) => s.strengthPlan);
  it('2 a week, never on a hard day, never heavy the day before one', () => {
    const wk = withS.filter((s) => s.date >= '2026-11-16' && s.date <= '2026-11-22');
    expect(wk).toHaveLength(2);
    for (const s of withS) {
      expect(['threshold', 'vo2max', 'tempo', 'hills', 'long', 'race']).not.toContain(s.type);
      const next = plan.sessions.find((x) => daysBetween(parseYmd(s.date), parseYmd(x.date)) === 1);
      if (next && ['threshold', 'vo2max', 'tempo', 'hills', 'long'].includes(next.type)) expect(s.strengthPlan!.intensity).toBe('light');
    }
  });
  it('by phase: heavier in base, maintenance later, light in the taper, none in the last 4 days before the race', () => {
    const baseS = withS.filter((s) => s.phase === 'base' && s.strengthPlan!.intensity !== 'light');
    expect(baseS.length).toBeGreaterThan(0);
    expect(baseS.every((s) => s.strengthPlan!.intensity === 'heavy')).toBe(true);
    expect(withS.filter((s) => s.phase === 'build' || s.phase === 'peak').every((s) => s.strengthPlan!.intensity !== 'heavy')).toBe(true);
    expect(withS.filter((s) => s.phase === 'taper').every((s) => s.strengthPlan!.intensity === 'light')).toBe(true);
    expect(withS.some((s) => daysBetween(parseYmd(s.date), parseYmd(half.date)) <= 3)).toBe(false);
    // A and B take turns
    const heavy = withS.filter((s) => s.strengthPlan!.routine === 'A' || s.strengthPlan!.routine === 'B');
    expect(new Set(heavy.map((s) => s.strengthPlan!.routine)).size).toBe(2);
  });
  it('on chosen days: a strength-only day and "+ Strength" after a run', () => {
    const p = gen({ week: { ...emptyWeek(), mode: 'custom', days: ['threshold', 'strength', 'easy', 'intervals', 'rest', 'long', 'easy'], plusStrength: [false, false, false, false, false, false, true] } });
    const wk = p.sessions.filter((s) => s.date >= '2026-11-16' && s.date <= '2026-11-22');
    const tue = wk.find((s) => s.date === '2026-11-17')!, sun = wk.find((s) => s.date === '2026-11-22')!;
    expect(tue.type).toBe('rest');
    expect(tue.strengthPlan).toBeTruthy();
    expect(sun.type).toBe('easy');
    expect(sun.strengthPlan).toBeTruthy();
  });
});

describe('how strength counts', () => {
  it('as light load, never as running', () => {
    const s = crossLoad({ id: 'x', date: '2026-11-10', kind: 'strength', minutes: 40, rpe: 6, at: '' });
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(40);
  });
  it('toward the weekly streak', () => {
    expect(weekStreak([], new Date('2026-11-12T12:00:00'), ['2026-11-10', '2026-11-03'])).toBe(2);
  });
  it('a strength-only day is done once its workout is saved', () => {
    const p = gen({ week: { ...emptyWeek(), mode: 'custom', days: ['threshold', 'strength', 'easy', 'intervals', 'rest', 'long', 'easy'], plusStrength: Array(7).fill(false) } });
    const tue = p.sessions.find((s) => s.date === '2026-11-10')!;
    const adapted = adaptPlan({ plan: p, activities: [], feedback: [], today: new Date('2026-11-12T12:00:00'), typeOf: () => 'easy', paces: trainingPaces(55),
      profile: { ...base, log: [{ id: 'l', date: '2026-11-10', kind: 'strength', minutes: 30, at: '', strength: { title: 'x', source: 'ritmo', sessionId: tue.id, exercises: [] } }] } });
    expect(adapted.sessions.find((s) => s.id === tue.id)!.status).toBe('done');
  });
});
