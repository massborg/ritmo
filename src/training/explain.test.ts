import { describe, expect, it } from 'vitest';
import type { Plan, PlannedSession } from '../lib/types';
import { explainWeek } from './explain';

const s = (date: string, type: PlannedSession['type'], km: number, phase: PlannedSession['phase'] = 'build'): PlannedSession => ({
  id: date + type, date, type, title: type, focus: '', purpose: '', howItHelps: '', steps: [], distanceM: km * 1000, durationS: km * 300, phase, status: 'planned',
});
const plan: Plan = {
  id: 'p', createdAt: '', startDate: '2026-11-02', endDate: '2026-12-20', phases: [], changes: [],
  weeks: [{ start: '2026-11-02', targetKm: 50, phase: 'build' }, { start: '2026-11-09', targetKm: 54, phase: 'build' }, { start: '2026-11-16', targetKm: 40, phase: 'build', cutback: true }],
  sessions: [
    s('2026-11-02', 'threshold', 10), s('2026-11-05', 'vo2max', 10), s('2026-11-07', 'long', 18),
    s('2026-11-09', 'threshold', 11), s('2026-11-10', 'easy', 8), s('2026-11-11', 'rest', 0), s('2026-11-12', 'vo2max', 11), s('2026-11-14', 'long', 20),
    s('2026-11-16', 'easy', 8), s('2026-11-21', 'long', 14),
  ],
};
const race = { id: 'r', name: 'Valletta 10K', date: '2026-12-20', distanceM: 10000, courseType: 'road', priority: 'A' } as never;

describe('explain this week', () => {
  it('explains a build week: volume change, hard days, longest long run, race countdown', () => {
    const t = explainWeek(plan, '2026-11-09', [race], 'km')!;
    expect(t).toMatch(/^This is a build week/);
    expect(t).toContain('Volume goes up to about 54 km, 8% more than last week');
    expect(t).toContain('Two hard sessions: threshold on Monday and intervals on Thursday');
    expect(t).toContain('The long run on Saturday is 20 km, the longest so far.');
    expect(t).toContain('The rest day is part of the plan');
    expect(t).toContain('6 weeks to Valletta 10K.');
  });
  it('explains a lighter week', () => {
    expect(explainWeek(plan, '2026-11-16', [], 'km')).toContain('It is a lighter week at about 40 km');
  });
  it('says nothing for a week without sessions', () => {
    expect(explainWeek(plan, '2027-03-01', [], 'km')).toBeUndefined();
  });
});
