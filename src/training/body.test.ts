import { describe, expect, it } from 'vitest';
import { applyBody, redFlags, stepUnlocked, textRedFlags, type BodyCheckin } from './body';
import type { Plan, PlannedSession } from '../lib/types';

const today = new Date('2026-11-09T09:00:00');
const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ses = (n: number, type: string, extra: Partial<PlannedSession> = {}): PlannedSession => ({ id: `s${n}`, date: day(n), type, title: type, focus: '', purpose: '', howItHelps: '', phase: 'build', distanceM: 10000, durationS: 3000, status: 'planned', steps: [{ label: type, detail: '' }], ...extra } as unknown as PlannedSession);
const plan: Plan = { id: 'p', createdAt: '', startDate: day(0), endDate: day(14), phases: [], changes: [], sessions: [ses(0, 'easy'), ses(1, 'hills'), ses(2, 'easy', { steps: [{ label: 'Easy', detail: '', kind: 'easy' }, { label: 'Strides', detail: '', kind: 'strides' }] }), ses(3, 'vo2max'), ses(4, 'rest'), ses(5, 'long'), ses(6, 'easy')] } as unknown as Plan;
const checkin = (o: Partial<BodyCheckin>): BodyCheckin => ({ id: 'c', at: today.toISOString(), area: 'Calf', side: 'left', pain: 3, when: ['start-eases'], onset: 'gradual', trend: 'same', signs: [], redFlags: [], ...o });

describe('Body red flags (rules, before any AI)', () => {
  it('pain at night or one bony spot is a red flag', () => {
    expect(redFlags(checkin({ when: ['rest-night'] }), [], today)).toContain('Pain at rest or at night');
    expect(redFlags(checkin({ signs: ['bony-spot'] }), [], today).join()).toMatch(/bony spot/);
    expect(redFlags(checkin({ pain: 7 }), [], today)).toContain('Pain 7/10');
    expect(redFlags(checkin({}), [], today)).toEqual([]);
  });
  it('typing it in Body chat triggers the same', () => {
    expect(textRedFlags('My shin hurts at night')).toContain('Pain at rest or at night');
    expect(textRedFlags('there is one spot on the bone that hurts')).toContain('Pain on one bony spot');
    expect(textRedFlags('Can I run with sore calves after intervals?')).toEqual([]);
  });
  it('a red flag pauses training (no running, no tips) until the runner confirms they were checked', () => {
    const p = applyBody(plan, { checkins: [checkin({ when: ['rest-night'] })], redFlagAt: today.toISOString() }, today);
    expect(p.sessions.filter((s) => s.date >= day(0)).every((s) => s.type === 'rest')).toBe(true);
    expect(p.changes.some((c) => /paused because you reported a warning sign/.test(c.summary))).toBe(true);
    const resumed = applyBody(plan, { checkins: [checkin({ pain: 2 })], redFlagAt: today.toISOString(), checkedAt: new Date(today.getTime() + 1000).toISOString() }, today);
    expect(resumed.sessions.some((s) => s.type !== 'rest')).toBe(true);
  });
});

describe('Body plan changes', () => {
  it('calf pain 5/10 replaces the next runs with cross-training, removes hills and strides, and logs why', () => {
    const p = applyBody(plan, { checkins: [checkin({ pain: 5, when: ['after'] })] }, today);
    const cross = p.sessions.filter((s) => s.title === 'Cross-training instead of running');
    expect(cross.length).toBeGreaterThanOrEqual(2);
    expect(p.sessions.some((s) => s.type === 'hills')).toBe(false);
    expect(p.sessions.some((s) => s.steps.some((x) => x.kind === 'strides'))).toBe(false);
    expect(p.changes.some((c) => c.reason === 'pain' && /Left calf pain 5\/10/.test(c.summary))).toBe(true);
  });
  it('pain 1–3 that eases keeps easy runs and drops the next hard session', () => {
    const p = applyBody(plan, { checkins: [checkin({ pain: 2, area: 'Knee' })] }, today);
    expect(p.sessions.find((s) => s.id === 's1')!.type).toBe('easy');
    expect(p.sessions.find((s) => s.id === 's0')!.type).toBe('easy');
  });
  it('return-to-run steps unlock only at 2/10 or lower', () => {
    expect(stepUnlocked(checkin({ pain: 2 }))).toBe(true);
    expect(stepUnlocked(checkin({ pain: 3 }))).toBe(false);
    expect(stepUnlocked(checkin({ pain: 1, when: ['worse-running'] }))).toBe(false);
    const p = applyBody(plan, { checkins: [], rtrStep: 2 }, today);
    expect(p.sessions.find((s) => /Return to run · step 2 of 6/.test(s.title))).toBeTruthy();
  });
});
