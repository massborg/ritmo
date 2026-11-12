// Choose your week (update 3, §7)
import { describe, expect, it } from 'vitest';
import type { PlannedSession, Profile, Race } from '../lib/types';
import { generatePlan, type GenResult } from './generator';
import { trainingPaces } from './fitness';
import { parseYmd, startOfWeek, ymd } from '../lib/format';
import { applyWeekChoice, emptyWeek, weekWarnings, type DayChoice, type WeekChoice } from './week-choice';

const FRIDAY = new Date('2026-11-06T09:00:00');
const base: Profile = { name: 'R', units: 'km', theme: 'system', goal: '', daysAvailable: [0, 1, 2, 3, 4, 5, 6], longRunDay: 5, injuries: [], onboarded: true };
const half: Race = { id: 'r', name: 'Half', date: '2027-03-07', distanceM: 21097.5, courseType: 'road', priority: 'A' };
const ok = (r: GenResult) => { if (!r.ok) throw new Error(r.problem.message); return r.plan; };
const day = (s: PlannedSession) => (parseYmd(s.date).getDay() + 6) % 7;
const week = (days: DayChoice[], o: Partial<WeekChoice> = {}): WeekChoice => ({ ...emptyWeek(), mode: 'custom', days, ...o });
const gen = (w: WeekChoice) => ok(generatePlan({ today: FRIDAY, profile: { ...base, training: { week: w } }, race: half, paces: trainingPaces(55), recentWeeklyKm: 60, longestRecentKm: 18 }));
const wk = (p: { sessions: PlannedSession[] }, start: string) => p.sessions.filter((s) => ymd(startOfWeek(parseYmd(s.date))) === start);

describe('choose your week', () => {
  const mine = week(['intervals', 'easy', 'strength', 'tempo', 'rest', 'long', 'easy'], { plusStrength: [false, true, false, false, false, false, false] });
  it('each day is what the runner chose, with Ritmo\'s distances and paces, in every phase', () => {
    const p = gen(mine);
    for (const start of ['2026-11-16', '2026-12-14', '2027-01-11']) {
      const s = wk(p, start);
      const at = (d: number) => s.find((x) => day(x) === d)!;
      expect(at(0).type).toBe('vo2max');
      expect(at(1).type).toBe('easy');
      expect(at(1).strength).toBeTruthy(); // + Strength
      expect(at(2).type).toBe('rest');
      expect(at(2).title).toBe('Strength (no run)');
      expect(at(3).type).toBe('tempo');
      expect(at(4).type).toBe('rest');
      expect(at(5).type).toBe('long');
      expect(at(0).distanceM).toBeGreaterThan(5000);
      expect(at(0).paceTarget).toBeTruthy();
    }
  });
  it('"Let Ritmo adjust by phase" lets the base phase turn a hard day easy', () => {
    const p = gen({ ...mine, adjustByPhase: true });
    const s = wk(p, '2026-11-16');
    expect(s.filter((x) => ['vo2max', 'tempo', 'threshold', 'hills'].includes(x.type)).length).toBeLessThan(2);
  });
  it('days left on "Ritmo picks" keep Ritmo\'s plan; a second long run becomes easy', () => {
    const auto: ('rest' | 'easy' | 'long' | 'q1' | 'q2')[] = ['q1', 'easy', 'rest', 'q2', 'easy', 'long', 'easy'];
    const r = applyWeekChoice(auto, week(['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'long']));
    expect(r.roles).toEqual(['q1', 'easy', 'rest', 'q2', 'easy', 'easy', 'long']);
  });
  it('race week stays safe: no strength in the last 3 days before the race', () => {
    const p = gen(week(['easy', 'easy', 'easy', 'easy', 'strength', 'long', 'rest'], { plusStrength: [true, true, true, true, true, true, true] }));
    const last = p.sessions.filter((s) => s.date >= '2027-03-04' && s.date <= '2027-03-07');
    expect(last.some((s) => s.strength)).toBe(false);
  });
});

describe('guard rails (warnings, never a block)', () => {
  it('two hard days in a row, long run after intervals, strength before a hard run, no rest day', () => {
    const w = weekWarnings(week(['intervals', 'long', 'easy', 'threshold', 'easy', 'easy', 'easy'], { plusStrength: [false, false, true, false, false, false, false] })).join('\n');
    expect(w).toMatch(/Two hard days in a row: Monday and Tuesday/);
    expect(w).toMatch(/long run the day after intervals/i);
    expect(w).toMatch(/Strength on Wednesday, the day before a hard run/);
    expect(w).toMatch(/No rest day this week/);
  });
  it('a sensible week has no warnings, and the plan still builds with warnings', () => {
    expect(weekWarnings(week(['threshold', 'easy', 'rest', 'intervals', 'easy', 'long', 'easy']))).toEqual([]);
    expect(() => gen(week(['intervals', 'long', 'tempo', 'threshold', 'easy', 'easy', 'easy']))).not.toThrow();
  });
});
