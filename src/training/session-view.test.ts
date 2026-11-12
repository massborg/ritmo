import { describe, expect, it } from 'vitest';
import { fitSteps, plannedNum, sessionAmount, structureLine, weekTarget } from './session-view';
import { applyBody } from './body';
import { suggestions, buildFacts, type CoachContext } from '../coach/coach';
import { withAdapted, planPush } from './push-core';
import type { Plan, PlannedSession } from '../lib/types';

const easy = (date: string, km: number, extra: Partial<PlannedSession> = {}): PlannedSession => ({
  id: `e-${date}`, date, type: 'easy', title: 'Easy run', focus: 'Aerobic base', purpose: 'Easy.', howItHelps: '', phase: 'build', status: 'planned',
  distanceM: km * 1000, durationS: km * 330, steps: [{ kind: 'easy', label: `${km} km easy`, detail: `${km} km at 5:20–5:50/km, Z2`, km, durationS: km * 330 }], ...extra,
} as PlannedSession);

describe('one session, one truth (update 3, §1.1)', () => {
  it('a session cut by a pain check-in has steps, structure line and distance that agree', () => {
    // Friday 13 Nov: a 9.2 km easy run, lowered after an ankle check-in on Thursday 12 Nov
    const today = new Date('2026-11-12T09:00:00');
    const plan = { id: 'p', createdAt: '', startDate: '2026-11-09', endDate: '2026-12-31', phases: [], changes: [], sessions: [easy('2026-11-12', 6), easy('2026-11-13', 9.2), { ...easy('2026-11-14', 10), type: 'threshold', title: 'Threshold', steps: [{ kind: 'warmup', label: 'Warm up', detail: '2 km easy', km: 2 }, { kind: 'work', label: '4 x 1.5 km', detail: 'at 4:00/km', km: 6.6 }, { kind: 'cooldown', label: 'Cool down', detail: '1.4 km easy', km: 1.4 }] }] } as unknown as Plan;
    const four = applyBody(plan, { checkins: [{ id: 'c', at: '2026-11-12T08:00:00', area: 'Ankle', side: 'right', pain: 4, when: [], onset: 'gradual', signs: [], redFlags: [] }] }, today);
    const fri = fitSteps(four.sessions.find((s) => s.date === '2026-11-16') ?? four.sessions[1]);
    const sum = fri.steps.reduce((a, x) => a + (x.km ?? 0), 0);
    if (fri.distanceM > 0) expect(Math.abs(sum - fri.distanceM / 1000)).toBeLessThan(0.15);
    // Scaled directly: 9.2 km → 5.5 km rewrites "9.2 km easy"
    const cut = fitSteps({ ...easy('2026-11-13', 9.2), distanceM: 5520 });
    expect(structureLine(cut)).toBe('5.5 km easy');
    expect(cut.steps[0].detail).toMatch(/^5\.5 km at/);
    expect(sessionAmount(cut, 'km')).toBe('5.5 km');
    expect(plannedNum(cut.distanceM, 'km')).toBe(5.5);
  });
  it('reps stay as planned; warm-up and cool-down take the change', () => {
    const s = { ...easy('2026-11-14', 10), type: 'threshold', distanceM: 8000, steps: [{ kind: 'warmup', label: 'Warm up', detail: '2 km easy, then strides', km: 2 }, { kind: 'work', label: '4 x 1.5 km', detail: 'at 4:00/km', km: 6 }, { kind: 'cooldown', label: 'Cool down', detail: '2 km easy', km: 2 }] } as PlannedSession;
    const f = fitSteps(s);
    expect(f.steps[1]).toEqual(s.steps[1]);
    expect(f.steps[0].km! + f.steps[2].km!).toBeCloseTo(2, 1);
    expect(f.steps[0].detail).toMatch(/^1 km easy/);
  });
  it('a session that adds up is returned as is', () => {
    const s = easy('2026-11-13', 6);
    expect(fitSteps(s)).toBe(s);
  });
  it('one rounding everywhere: 6 km, 5.5 km, 12.4 km, 40 min', () => {
    expect(sessionAmount({ distanceM: 6000, durationS: 0 }, 'km')).toBe('6 km');
    expect(sessionAmount({ distanceM: 5520, durationS: 0 }, 'km')).toBe('5.5 km');
    expect(sessionAmount({ distanceM: 12420, durationS: 0 }, 'km')).toBe('12.4 km');
    expect(sessionAmount({ distanceM: 0, durationS: 2400 }, 'km')).toBe('40 min');
  });
});

describe('weekly target (update 3, §1.2)', () => {
  const stored = { id: 'p', createdAt: '', startDate: '2026-11-09', endDate: '2026-12-31', phases: [], weeks: [{ start: '2026-11-09', targetKm: 100, phase: 'build' }], changes: [], sessions: [easy('2026-11-09', 20), easy('2026-11-11', 30), easy('2026-11-13', 30), easy('2026-11-15', 20)] } as unknown as Plan;
  it('is the adapted week, with when and why it was lowered', () => {
    const adapted = { ...stored, sessions: [easy('2026-11-09', 20), easy('2026-11-11', 8)], changes: [{ id: 'body-rule:c:cross', at: '2026-11-12T08:00:00Z', reason: 'pain', summary: '…' }] } as unknown as Plan;
    const w = weekTarget(adapted, stored, '2026-11-09', '2026-11-15', 'Right ankle');
    expect(w.m).toBe(28000);
    expect(w.originalM).toBe(100000);
    expect(w.lowered?.because).toBe('of your right ankle');
  });
  it('a plan that starts mid-week is not "lowered" (only its own days count)', () => {
    const midweek = { ...stored, sessions: stored.sessions.slice(2) } as Plan;
    expect(weekTarget(midweek, midweek, '2026-11-09', '2026-11-15', 'Right ankle').lowered).toBeUndefined();
  });
  it('says nothing when the target is as planned', () => {
    expect(weekTarget(stored, stored, '2026-11-09', '2026-11-15').lowered).toBeUndefined();
  });
});

describe('coach context (update 3, §1.3–1.4)', () => {
  const ctx = (o: Partial<CoachContext>): CoachContext => ({ today: new Date('2026-11-12T09:00:00'), profile: { injuries: [{ area: 'Hamstring', status: 'current' }] } as never, units: 'km', readiness: { label: 'Moderate (61)', summary: '', basedOn: [] } as never, stage: { stage: 'full' } as never, nextSessions: [], weekDoneM: 56400, weekPlannedM: 28000, weekSessionsDone: 2, weekSessionsPlanned: 4, planSessionsDone: 0, planSessionsTotal: 0, runCount: 10, hasData: true, ...o });
  it('names the Body niggle, not an old profile injury', () => {
    const f = buildFacts(ctx({ niggle: { label: 'Right ankle', pain: 1, rule: 'Keep running easy and flat: no hills or intervals.' } })).join('\n');
    expect(f).toMatch(/Right ankle, pain 1\/10/);
    expect(f).not.toMatch(/Hamstring/);
    expect(f).toMatch(/Readiness: Moderate \(61\)/);
  });
  it('with Strava runs hidden, gives no readiness or weekly distance and says why', () => {
    const f = buildFacts(ctx({ stravaHidden: true })).join('\n');
    expect(f).not.toMatch(/Readiness:/);
    expect(f).not.toMatch(/56\.4/);
    expect(f).toMatch(/I can't see your Strava runs; your totals on Training include them/);
    expect(f).toMatch(/This week's target: 28 km/);
  });
  it('suggested questions come from today\'s real session', () => {
    const cross = { ...easy('2026-11-12', 0), type: 'rest', title: 'Cross-training instead of running' } as PlannedSession;
    expect(suggestions(cross, true)[0]).toBe('Why cross-training today?');
    expect(suggestions(cross, true)).not.toContain('Why is today a rest day?');
    expect(suggestions(easy('2026-11-12', 6), true, { niggle: 'Right ankle' })).toContain('What can I do with my right ankle?');
  });
});

describe('reminders use the adapted sessions (update 3, §1.1)', () => {
  it('the stored plan is replaced for the days the app sent', () => {
    const stored = [{ id: 'a', date: '2026-11-13', type: 'easy', title: 'Easy run', distanceM: 9200, durationS: 3000 }];
    const out = withAdapted(stored, { from: '2026-11-11', to: '2026-11-19', sessions: [{ id: 'a', date: '2026-11-13', type: 'easy', title: 'Easy run', distanceM: 5520, durationS: 1800 }] });
    expect(out).toHaveLength(1);
    expect(out[0].distanceM).toBe(5520);
    expect(typeof planPush).toBe('function');
  });
});
