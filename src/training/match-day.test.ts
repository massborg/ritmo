// Update 3, §1.6: join runs from the same day before judging the plan (the Mon 9 Nov case)
import { describe, expect, it } from 'vitest';
import { adaptPlan } from './plan';
import { groupRuns } from './sessions';
import { trainingPaces } from './fitness';
import type { Activity, Plan, PlannedSession, SessionType } from '../lib/types';

const run = (id: string, start: string, km: number, min: number, source = 'strava'): Activity => ({ id, source, startTime: start, name: id, distanceM: km * 1000, durationS: min * 60, movingS: min * 60 } as unknown as Activity);
const session = (date: string, type: SessionType): PlannedSession => ({ id: `s-${date}`, date, type, title: type === 'threshold' ? 'Threshold session' : 'Easy run', focus: '', purpose: '', howItHelps: '', phase: 'build', status: 'planned', distanceM: 10500, durationS: 3000, steps: [] } as unknown as PlannedSession);
const plan = (sessions: PlannedSession[]): Plan => ({ id: 'p', createdAt: '', startDate: '2026-11-09', endDate: '2026-12-31', phases: [], changes: [], sessions } as unknown as Plan);
const types: Record<string, SessionType> = { morning: 'easy', wu: 'easy', main: 'threshold', cd: 'easy' };
const typeOf = (a: Activity) => types[a.id] ?? 'easy';
const morning = run('morning', '2026-11-09T06:30:00Z', 16.29, 88);
const evening = [run('wu', '2026-11-09T17:30:00Z', 1.46, 8), run('main', '2026-11-09T17:41:00Z', 5.71, 21.5), run('cd', '2026-11-09T18:05:00Z', 3.34, 18)];
const adapt = (acts: Activity[], today: string, extra: Partial<Parameters<typeof adaptPlan>[0]['profile']> = {}) =>
  adaptPlan({ plan: plan([session('2026-11-09', 'threshold')]), activities: acts, feedback: [], profile: { injuries: [], ...extra } as never, today: new Date(`${today}T21:00:00`), typeOf, paces: trainingPaces(55) });

describe('runs from the same day are joined before the plan is judged', () => {
  it('Strava runs less than 30 minutes apart are one session in parts; hours apart are separate', () => {
    const g = groupRuns([morning, ...evening]);
    expect(g).toHaveLength(2);
    expect(g[1].parts.map((a) => a.id)).toEqual(['wu', 'main', 'cd']);
    expect(g[1].main.id).toBe('main');
  });
  it('Mon 9 Nov: the evening session in parts matches the plan; the morning 16.29 km is extra', () => {
    const p = adapt([morning, ...evening], '2026-11-10');
    const s = p.sessions[0];
    expect(s.status).toBe('done');
    expect(s.completedActivityId).toBe('main');
    expect(s.completedParts).toEqual(['wu', 'main', 'cd']);
    expect(p.changes.some((c) => /instead of threshold/i.test(c.summary))).toBe(false);
  });
  it('the order the runs arrive in does not matter', () => {
    expect(adapt([...evening, morning], '2026-11-10').sessions[0].completedActivityId).toBe('main');
  });
  it('on the day itself, an easy morning run is not judged yet (the session may still come)', () => {
    const p = adapt([morning], '2026-11-09');
    expect(p.sessions[0].status).toBe('planned');
    // Once the day is over it is judged on what was run
    expect(adapt([morning], '2026-11-10').sessions[0].status).toBe('swapped');
  });
  it('Split makes parts separate again; Change plan (a linked run) wins over the best fit', () => {
    expect(groupRuns([morning, ...evening], new Set(['cd']))).toHaveLength(3);
    const linked = adapt([{ ...morning, plannedSessionId: 's-2026-11-09' }, ...evening], '2026-11-10');
    expect(linked.sessions[0].completedActivityId).toBe('morning');
  });
});
