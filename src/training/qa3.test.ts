// Fixes from the second QA sweep, batch 2: consistent weeks never above 8, the step-1 injury message, the long run's
// time after missed sessions, and step paces in miles.
import { describe, expect, it } from 'vitest';
import type { Activity, Profile, Race } from '../lib/types';
import { raceReadiness } from './insights';
import { checkIn, type Injury } from './injury';
import { generatePlan } from './generator';
import { adaptPlan } from './plan';
import { trainingPaces } from './fitness';
import { addDays, localise, localiseStep, paceRange, parseYmd, ymd } from '../lib/format';

const run = (id: string, start: string, km: number, movingS: number): Activity => ({ id, source: 'upload', sourceIds: {}, name: 'Run', sport: 'run', startTime: start, distanceM: km * 1000, movingS, durationS: movingS, detailScore: 5, importedAt: '' } as Activity);

describe('race preparation', () => {
  it('a daily runner has 8 of 8 consistent weeks, never 9', () => {
    const today = new Date('2026-11-12T09:00:00'); // a Thursday: the last 56 days touch 9 calendar weeks
    const acts = Array.from({ length: 56 }, (_, i) => run(`r${i}`, `${ymd(addDays(today, -i))}T07:00:00`, 8, 2400));
    const race = { id: 'r', name: 'Half', date: '2026-12-06', distanceM: 21097.5, courseType: 'road', priority: 'A' } as Race;
    const part = raceReadiness(race, acts, 50, today).parts.find((p) => /Consistent weeks/.test(p.label))!;
    expect(part.value).toBe('8 of 8');
  });
});

describe('injury check-in at step 1', () => {
  it('does not promise a step back that cannot happen', () => {
    const inj: Injury = { id: 'k', area: 'Knee', side: 'left', startedAt: '2026-11-10', onset: 'gradual', running: 'same', days: [{ date: '2026-11-10', pain: 2 }], step: 1, stepSince: '2026-11-10' };
    const one = checkIn(inj, { date: '2026-11-11', pain: 5, vs: 'worse', run: 'high' });
    const two = checkIn(one.injury, { date: '2026-11-12', pain: 5, vs: 'worse', run: 'high' });
    for (const r of [one, two]) {
      expect(r.injury.step).toBe(1);
      expect(r.message).toMatch(/^Stay on step 1 for now\./);
      expect(r.message).not.toMatch(/goes back one step/);
    }
    // On a later step the warning is still given
    const later = checkIn({ ...inj, step: 3 }, { date: '2026-11-11', pain: 5, vs: 'worse', run: 'high' });
    expect(later.message).toMatch(/Stay on step 3 for now\. If it is the same or worse tomorrow, Ritmo goes back one step\./);
  });
});

describe('after three or more missed sessions', () => {
  it('the shortened long run gets a shorter time too', () => {
    const profile: Profile = { name: 'R', units: 'km', theme: 'system', goal: '', daysAvailable: [0, 1, 2, 3, 4, 5, 6], longRunDay: 5, injuries: [], onboarded: true };
    const paces = trainingPaces(50);
    const start = new Date('2026-11-02T09:00:00');
    const g = generatePlan({ today: start, profile, race: { id: 'r', name: 'Half', date: '2027-03-07', distanceM: 21097.5, courseType: 'road', priority: 'A' }, paces, recentWeeklyKm: 50, longestRecentKm: 16 });
    if (!g.ok) throw new Error(g.problem.message);
    const today = addDays(start, 15);
    const before = new Map(g.plan.sessions.map((s) => [s.id, { distanceM: s.distanceM, durationS: s.durationS }]));
    const out = adaptPlan({ plan: g.plan, activities: [], feedback: [], profile, today, typeOf: () => 'easy', paces });
    const cut = out.sessions.filter((s) => s.type === 'long' && s.distanceM < before.get(s.id)!.distanceM && parseYmd(s.date) >= today);
    expect(cut.length).toBeGreaterThan(0);
    for (const s of cut) {
      const was = before.get(s.id)!;
      expect(s.durationS).toBeLessThan(was.durationS);
      // The same pace as before, within rounding
      expect(Math.abs(s.durationS / s.distanceM - was.durationS / was.distanceM)).toBeLessThan(0.002);
    }
  });
});

describe('steps in miles', () => {
  it('the step pace is formatted from its own numbers, as Target pace is', () => {
    const p: [number, number] = [187.6, 192.4];
    const detail = `at ${paceRange(p[0], p[1], 'km')}, hard, 90 s easy jog between`;
    expect(localiseStep(detail, p, 'mi')).toBe(`at ${paceRange(p[0], p[1], 'mi')}, hard, 90 s easy jog between`);
    expect(localiseStep(detail, p, 'km')).toBe(detail);
    // Without the step's numbers, the text is converted as before
    expect(localiseStep(detail, undefined, 'mi')).toBe(localise(detail, 'mi'));
    expect(localise('Intervals: 6 x 1 km', 'mi')).toBe('Intervals: 6 x 0.6 mi');
  });
});
