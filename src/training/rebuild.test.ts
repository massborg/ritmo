// Update 2, §4: rebuilding the plan keeps the past and (with "Next Monday") the current week, shows a summary,
// and never triggers automatic cuts straight after. Also §5: hand-entered and synced copies of a run become one.
import { describe, expect, it } from 'vitest';
import type { Activity, Plan, Profile, Race } from '../lib/types';
import { generatePlan } from './generator';
import { trainingPaces } from './fitness';
import { adaptPlan } from './plan';
import { canRestore, mergeRebuild, weekTargetM } from './rebuild';
import { merge } from '../data/integration';
import { findDuplicates } from '../data/quality';

const base: Profile = { name: 'R', units: 'km', theme: 'system', goal: '', daysAvailable: [0, 1, 2, 3, 4, 5, 6], longRunDay: 2, injuries: [], onboarded: true, training: { dayAfterLong: 'easy' } };
const race: Race = { id: 'r', name: 'Safi 5K AM', date: '2026-12-06', distanceM: 5000, courseType: 'road', goalS: 930, priority: 'A' };
const P = trainingPaces(63.3);
const build = (today: Date, startMode: 'today' | 'monday' = 'monday') => {
  const r = generatePlan({ today, profile: { ...base, training: { ...base.training, startMode } }, race, paces: P, recentWeeklyKm: 95, longestRecentKm: 21 });
  if (!r.ok) throw new Error(r.problem.message);
  return r.plan;
};
const run = (id: string, iso: string, km: number, extra: Partial<Activity> = {}): Activity => ({ id, source: 'strava', sourceIds: { strava: id }, startTime: iso, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: km * 300, movingS: km * 300, detailScore: 5, importedAt: iso, ...extra });

// The old plan started Monday 9 Nov; Mon and Tue were run; today is Wednesday 11 Nov
const MON = new Date('2026-11-09T08:00:00');
const WED = new Date('2026-11-11T09:00:00');
const old: Plan = (() => {
  const p = build(MON, 'today');
  for (const s of p.sessions) if (s.date === '2026-11-09') { s.status = 'swapped'; s.completedActivityId = 'mon'; s.swappedTo = 'easy'; }
  for (const s of p.sessions) if (s.date === '2026-11-10') { s.status = 'done'; s.completedActivityId = 'tue'; }
  return p;
})();
const runs = [run('mon', '2026-11-09T05:42:00Z', 16.3), run('tue', '2026-11-10T05:50:00Z', 14.2)];

describe('rebuilding the plan (update 2, §4)', () => {
  it('"Next Monday" with no changes keeps Mon and Tue history and Wed to Sun exactly as they were', () => {
    const fresh = build(WED, 'monday');
    const p = mergeRebuild({ old, fresh, today: WED, activities: runs, startMode: 'monday' });
    const week = (pl: Plan) => pl.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-15').map((s) => `${s.date} ${s.type} ${s.distanceM} ${s.status} ${s.completedActivityId ?? ''}`);
    expect(week(p)).toEqual(week(old));
    expect(p.sessions.find((s) => s.date === '2026-11-09')?.status).toBe('swapped');
    expect(p.rebuild?.startDate).toBe('2026-11-16');
    expect(p.rebuild?.notes.join(' ')).toMatch(/This week's sessions stay exactly as they were until Sunday/);
    expect(p.changes[p.changes.length - 1]?.summary).toMatch(/Rebuilt the plan from Monday 16 November/);
    expect(canRestore(p)).toBe(true);
    expect(p.previous?.plan.sessions.length).toBe(old.sessions.length);
  });

  it('"Today" after today\'s run keeps today linked to its original session and changes only tomorrow onwards', () => {
    const tue = new Date('2026-11-10T12:00:00');
    const fresh = build(tue, 'today');
    const p = mergeRebuild({ old, fresh, today: tue, activities: runs, startMode: 'today' });
    const today = p.sessions.find((s) => s.date === '2026-11-10')!;
    expect(today.completedActivityId).toBe('tue');
    expect(today.id).toBe(old.sessions.find((s) => s.date === '2026-11-10')!.id);
    expect(p.rebuild?.startDate).toBe('2026-11-11');
    expect(p.sessions.find((s) => s.date === '2026-11-09')?.completedActivityId).toBe('mon');
  });

  it('straight after a rebuild, runs on unplanned days do not cut this week\'s easy runs', () => {
    const fresh = build(WED, 'monday');
    const p = mergeRebuild({ old: { ...old, sessions: old.sessions.filter((s) => s.date >= '2026-11-11') }, fresh, today: WED, activities: runs, startMode: 'monday' });
    const before = p.sessions.filter((s) => s.date >= '2026-11-11' && s.date <= '2026-11-15').map((s) => `${s.type}${s.distanceM}`);
    const adapted = adaptPlan({ plan: p, activities: runs, feedback: [], profile: base, today: WED, typeOf: () => 'easy', paces: P });
    expect(adapted.sessions.filter((s) => s.date >= '2026-11-11' && s.date <= '2026-11-15').map((s) => `${s.type}${s.distanceM}`)).toEqual(before);
    expect(adapted.changes.some((c) => /days with no session planned/.test(c.summary))).toBe(false);
  });

  it('without a rebuild, the easy run the day after the long run is shortened, never turned into rest', () => {
    const p: Plan = { ...old, sessions: old.sessions.filter((s) => s.date >= '2026-11-11').map((s) => ({ ...s })) };
    const extra = [run('a', '2026-11-09T05:00:00Z', 30), run('b', '2026-11-10T05:00:00Z', 30)];
    const adapted = adaptPlan({ plan: p, activities: extra, feedback: [], profile: base, today: WED, typeOf: () => 'easy', paces: P });
    const thu = adapted.sessions.find((s) => s.date === '2026-11-12')!;
    const wed = adapted.sessions.find((s) => s.date === '2026-11-11')!;
    if (wed.type === 'long') expect(thu.type).not.toBe('rest');
  });

  it('one weekly target: the sum of the week\'s sessions', () => {
    const wk = old.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-15').reduce((x, s) => x + s.distanceM, 0);
    expect(weekTargetM(old, '2026-11-09')).toBe(wk);
  });
});

describe('hand-entered and synced copies of a run (update 2, §5)', () => {
  const synced = run('strava-1', '2026-11-09T05:42:00Z', 16.3);
  const manual: Activity = { ...run('manual-1', '2026-11-09T11:00:00Z', 15.8), source: 'manual', sourceIds: { manual: 'manual-1' }, detailScore: 1, plannedSessionId: 'sess-1' };
  it('a run logged by hand after the synced one joins it instead of counting twice', () => {
    const m = merge([synced], [manual]);
    expect(m.activities).toHaveLength(1);
    expect(m.mapped['manual-1']).toBe('strava-1');
    expect(m.activities[0].plannedSessionId).toBe('sess-1');
  });
  it('a synced run arriving after the hand-entered one replaces it and keeps its id (and so how it felt)', () => {
    const m = merge([manual], [synced]);
    expect(m.activities).toHaveLength(1);
    expect(m.activities[0].id).toBe('manual-1');
    expect(m.activities[0].sourceIds.strava).toBe('strava-1');
  });
  it('existing duplicates (logged by hand and synced, same day) are found so they can be merged', () => {
    expect(findDuplicates([synced, manual]).length).toBe(1);
  });
});
