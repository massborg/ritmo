import { describe, expect, it } from 'vitest';
import { applyBody, injuryMode } from './body';
import { canReopen, checkIn, dayNumber, feelsHealed, heal, reopen, startingStep, testDue, testFor, type Injury } from './injury';
import type { Plan, PlannedSession } from '../lib/types';

const today = new Date('2026-11-09T09:00:00');
const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ses = (n: number, type: string, km = 10): PlannedSession => ({ id: `s${n}`, date: day(n), type, title: type, focus: '', purpose: '', howItHelps: '', phase: 'build', distanceM: km * 1000, durationS: km * 300, status: 'planned', steps: [{ label: type, detail: '' }] } as PlannedSession);
const plan: Plan = { id: 'p', createdAt: '', startDate: day(0), endDate: day(14), phases: [], changes: [], sessions: [ses(0, 'long', 22), ses(1, 'easy', 8), ses(2, 'threshold', 12), ses(3, 'rest', 0), ses(4, 'easy', 6), ses(5, 'vo2max', 11), ses(6, 'long', 24)] } as Plan;
const ankle = (o: Partial<Injury> = {}): Injury => ({ id: 'i1', area: 'Ankle', side: 'right', startedAt: day(0), onset: 'sudden', running: 'same', days: [{ date: day(0), pain: 2 }], step: 2, stepSince: day(0), ...o });

describe('injury: the first report picks the starting step (update 4, task 2b)', () => {
  it('the milder the report, the further along', () => {
    expect(startingStep({ pain: 1, running: 'eases' })).toBe(3);
    expect(startingStep({ pain: 2, running: 'same' })).toBe(2);
    expect(startingStep({ pain: 2, running: 'worse' })).toBe(1);
    expect(startingStep({ pain: 4, running: 'eases' })).toBe(1);
    expect(startingStep({ pain: 1, running: 'untried' })).toBe(1);
  });
  it('a quick test every 3rd day: hops, or calf raises for calf and Achilles', () => {
    expect(testFor('Ankle')).toMatch(/hops/);
    expect(testFor('Achilles')).toMatch(/calf raises/);
    expect(testFor('Lower back')).toBeUndefined();
    const i = ankle();
    expect(dayNumber(i, day(2))).toBe(3);
    expect([1, 2, 3, 4, 5].map((n) => testDue(i, day(n)))).toEqual([false, true, false, false, true]);
  });
});

describe('injury: daily check-ins and the progression rules', () => {
  it('2 clear days in a row unlock the next step', () => {
    const d2 = checkIn(ankle(), { date: day(1), pain: 1, vs: 'better', run: 'ok' });
    expect(d2.change).toBe('stay'); expect(d2.injury.step).toBe(2); expect(d2.clearDays).toBe(1);
    expect(d2.message).toMatch(/1 day clear/);
    const d3 = checkIn(d2.injury, { date: day(2), pain: 1, vs: 'better', run: 'ok', test: 'pass' });
    expect(d3.change).toBe('up'); expect(d3.injury.step).toBe(3); expect(d3.injury.stepSince).toBe(day(2));
    expect(d3.message).toMatch(/Step 3 unlocked: 2 days clear/);
    // The count starts again at the new step
    const d4 = checkIn(d3.injury, { date: day(3), pain: 1, vs: 'same', run: 'ok' });
    expect(d4.injury.step).toBe(3); expect(d4.clearDays).toBe(1);
  });
  it('pain above 2, or worse the next morning, keeps the step; twice in a row goes back one', () => {
    const a = checkIn(ankle({ step: 3 }), { date: day(1), pain: 3, vs: 'worse', run: 'high' });
    expect(a.change).toBe('stay'); expect(a.injury.step).toBe(3);
    const b = checkIn(a.injury, { date: day(2), pain: 2, vs: 'same', run: 'high' });
    expect(b.change).toBe('back'); expect(b.injury.step).toBe(2);
    // Never below step 1
    const c = checkIn(checkIn(ankle({ step: 1 }), { date: day(1), pain: 3, vs: 'worse', run: 'high' }).injury, { date: day(2), pain: 3, vs: 'worse', run: 'high' });
    expect(c.injury.step).toBe(1);
  });
  it('a day with no run neither counts nor resets', () => {
    const a = checkIn(ankle(), { date: day(1), pain: 1, vs: 'better', run: 'ok' });
    const b = checkIn(a.injury, { date: day(2), pain: 1, vs: 'same', run: 'none' });
    expect(b.injury.step).toBe(2);
    const c = checkIn(b.injury, { date: day(3), pain: 1, vs: 'same', run: 'ok' });
    expect(c.change).toBe('up'); expect(c.injury.step).toBe(3);
  });
  it('5 days at 0–1 with a passed test suggest "Feels healed?"', () => {
    let i = ankle({ days: [{ date: day(0), pain: 2 }] });
    for (let n = 1; n <= 4; n++) i = checkIn(i, { date: day(n), pain: 1, vs: 'same', run: 'ok', ...(n === 2 ? { test: 'pass' as const } : {}) }).injury;
    expect(feelsHealed(i)).toBe(false); // day 1 was 2/10
    const r = checkIn(i, { date: day(5), pain: 0, vs: 'better', run: 'ok' });
    expect(r.offerHealed).toBe(true);
    expect(feelsHealed(r.injury)).toBe(true);
    // A failed test in those days holds it back
    expect(feelsHealed({ ...r.injury, days: r.injury.days.map((d) => (d.date === day(2) ? { ...d, test: 'fail' as const } : d)) })).toBe(false);
  });
});

describe('injury mode overrides the plan (update 4, task 2.1)', () => {
  it('the next run is the step; long and hard sessions become easy, flat runs the step allows', () => {
    const p = applyBody(plan, { checkins: [], injury: ankle() }, today);
    const by = (n: number) => p.sessions.find((s) => s.id === `s${n}`)!;
    expect(by(0).title).toBe('Return to run · step 2 of 6');
    expect(by(0).changedFor).toMatchObject({ label: 'right ankle', title: 'long', distanceM: 22000 });
    // Step 2 allows 4 km: the easy 8 km, the threshold, the intervals and the long run are all easy flat runs of 4 km
    for (const n of [1, 2, 4, 5, 6]) { expect(by(n).type, `s${n}`).toBe('easy'); expect(by(n).title).toBe('Easy flat run'); expect(by(n).distanceM).toBe(4000); expect(by(n).changedFor?.label).toBe('right ankle'); }
    expect(by(3).type).toBe('rest'); expect(by(3).changedFor).toBeUndefined();
    expect(p.changes.some((c) => /Return to run, step 2 of 6: your plan follows this until you are cleared/.test(c.summary))).toBe(true);
    expect(injuryMode({ checkins: [], injury: ankle() }, today)).toBe('right ankle');
  });
  it('a later step allows longer runs, and a session inside the limit is left alone', () => {
    const p = applyBody(plan, { checkins: [], injury: ankle({ step: 4 }) }, today);
    expect(p.sessions.find((s) => s.id === 's4')!.title).toBe('easy'); // 6 km easy is within step 4's 7 km
    expect(p.sessions.find((s) => s.id === 's6')!.distanceM).toBe(7000);
  });
  it('a care plan caps runs too, without a step session', () => {
    const p = applyBody(plan, { checkins: [], care: { area: 'achilles', stage: 0, startedAt: day(0), stageSince: day(0), checks: [], done: [] } }, today);
    expect(p.sessions[0].title).toBe('Easy flat run'); expect(p.sessions[0].distanceM).toBe(4500);
    expect(p.sessions[2].type).toBe('easy');
  });
});

describe('"It feels healed" and "It\'s back"', () => {
  it('ease back in: history entry, 10 lighter days, no hard sessions for 4', () => {
    const inj = ankle({ step: 3, days: [{ date: day(0), pain: 2 }, { date: day(1), pain: 1 }, { date: day(2), pain: 1 }] });
    const h = heal(inj, 'ease', today);
    expect(h.past).toMatchObject({ area: 'Ankle', side: 'right', startedAt: day(0), endedAt: day(0), pains: [2, 1, 1], lastStep: 3, how: 'ease' });
    expect(h.easeBack).toEqual({ from: day(0), until: day(9), noHardUntil: day(3), label: 'right ankle' });
    expect(h.change).toBe('Right ankle marked healed on 9 Nov, easing back in over 10 days: about 70% of the planned distance, with no intervals or hills for the first 4 days.');
    const p = applyBody(plan, { checkins: [], easeBack: h.easeBack }, today);
    expect(p.sessions[0].distanceM).toBe(15400); expect(p.sessions[0].type).toBe('long');
    expect(p.sessions[2].type).toBe('easy'); // threshold on day 3 of 4: easy
    expect(p.sessions[5].type).toBe('vo2max'); // after the first 4 days: back, at 70%
    expect(p.sessions[5].distanceM).toBe(7700);
    expect(p.sessions[0].changedFor?.label).toBe('right ankle');
  });
  it('straight back: no easing', () => {
    const h = heal(ankle(), 'straight', today);
    expect(h.easeBack).toBeUndefined();
    expect(h.change).toBe('Right ankle marked healed on 9 Nov. Your plan is rebuilt from today.');
  });
  it('"It\'s back" within 30 days resumes at the last step reached, not step 1', () => {
    const h = heal(ankle({ step: 3 }), 'ease', today);
    const later = new Date(today); later.setDate(later.getDate() + 12);
    expect(canReopen(h.past, later)).toBe(true);
    const again = reopen(h.past, 2, later);
    expect(again.step).toBe(3); expect(again.days).toHaveLength(1); expect(again.area).toBe('Ankle');
    const tooLate = new Date(today); tooLate.setDate(tooLate.getDate() + 31);
    expect(canReopen(h.past, tooLate)).toBe(false);
  });
});
