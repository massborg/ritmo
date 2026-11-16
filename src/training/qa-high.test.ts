// Fixes from the QA sweep's high findings: a plan built mid-week, an edited session and the load-spike trim, and the
// "not improving" red flag on a care plan.
import { describe, expect, it } from 'vitest';
import type { Activity, Plan, Profile, SessionType } from '../lib/types';
import { generatePlan } from './generator';
import { adaptPlan } from './plan';
import { trainingPaces } from './fitness';
import { redFlags, type BodyCheckin } from './body';
import { SAMPLE_PROFILE } from '../data/sample';
import { addDays, ymd } from '../lib/format';

const P = trainingPaces(55);
const profile: Profile = { ...SAMPLE_PROFILE, daysAvailable: [0, 1, 2, 3, 5, 6], longRunDay: 6, training: {} };
const run = (id: string, d: Date, km: number): Activity => ({ id, source: 'strava', sourceIds: { strava: id }, startTime: `${ymd(d)}T07:00:00.000Z`, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: km * 300, movingS: km * 300, detailScore: 5, importedAt: '' } as Activity);
const typeOf = (): SessionType => 'easy';
const build = (today: Date, km: number): Plan => { const r = generatePlan({ today, profile, paces: P, recentWeeklyKm: km, longestRecentKm: 20 }); if (!r.ok) throw new Error(r.problem.message); return r.plan; };
const MON = new Date('2026-11-09T09:00:00'), THU = addDays(MON, 3);
// Four steady weeks before, so the load-spike check has a normal baseline
const history = (perWeek: number) => [1, 2, 3, 4].flatMap((w) => [0, 1, 2, 3, 4].map((i) => run(`h${w}-${i}`, addDays(MON, -7 * w + i), perWeek / 5)));

describe('a plan built part-way through the week', () => {
  it('runs from before it started are not counted against its part-week target', () => {
    const plan = build(THU, 80);
    const before = [run('a', MON, 15), run('b', addDays(MON, 1), 15), run('c', addDays(MON, 2), 14)];
    const out = adaptPlan({ plan: structuredClone(plan), activities: [...history(80), ...before], feedback: [], profile, today: addDays(THU, 1), typeOf, paces: P });
    // Nothing is cut: Friday to Sunday are as planned, and no "over its target" change is logged
    expect(out.changes.filter((c) => /over its|Easy runs adjusted/.test(c.summary))).toEqual([]);
    for (const s of plan.sessions.filter((x) => x.date <= ymd(addDays(MON, 6)))) expect(out.sessions.find((x) => x.id === s.id)!.distanceM).toBe(s.distanceM);
  });
  it('a run on a rest day after the plan started still counts, as before', () => {
    const plan = build(MON, 80);
    const rest = plan.sessions.find((s) => s.type === 'rest' && s.date > ymd(MON) && s.date < ymd(addDays(MON, 5)))!;
    const extra = run('x', new Date(`${rest.date}T07:00:00`), 25);
    const done = plan.sessions.filter((s) => s.date < rest.date && s.type !== 'rest').map((s, i) => run(`d${i}`, new Date(`${s.date}T07:00:00`), s.distanceM / 1000));
    const out = adaptPlan({ plan: structuredClone(plan), activities: [...history(80), ...done, extra], feedback: [], profile, today: addDays(new Date(`${rest.date}T09:00:00`), 1), typeOf, paces: P });
    expect(out.changes.some((c) => /days with no session planned/.test(c.summary))).toBe(true);
  });
});

describe('the load-spike trim and a session the runner edited', () => {
  const plan = build(MON, 60);
  const easy = () => plan.sessions.find((s) => s.type === 'easy' && s.date > ymd(MON) && s.date < ymd(addDays(MON, 6)))!;
  it('a big edit to one day does not cut that day or any other', () => {
    const p = structuredClone(plan);
    const e = p.sessions.find((s) => s.id === easy().id)!;
    e.edited = { at: '', original: { type: e.type, title: e.title, distanceM: e.distanceM, durationS: e.durationS, steps: e.steps, paceTarget: e.paceTarget, purpose: e.purpose, focus: e.focus, hrZones: e.hrZones } };
    e.distanceM = 60000; e.durationS = 60 * 300;
    const out = adaptPlan({ plan: p, activities: history(60), feedback: [], profile, today: MON, typeOf, paces: P });
    expect(out.changes.some((c) => /Jumps above about 30%/.test(c.summary))).toBe(false);
    expect(out.sessions.find((s) => s.id === e.id)!.distanceM).toBe(60000);
    for (const s of plan.sessions.filter((x) => x.id !== e.id && x.date < ymd(addDays(MON, 7)))) expect(out.sessions.find((x) => x.id === s.id)!.distanceM).toBe(s.distanceM);
  });
  it('when the trim does apply, the time is cut with the distance', () => {
    const out = adaptPlan({ plan: structuredClone(plan), activities: history(30), feedback: [], profile, today: MON, typeOf, paces: P });
    expect(out.changes.some((c) => /Jumps above about 30%/.test(c.summary))).toBe(true);
    const cut = out.sessions.filter((s) => { const was = plan.sessions.find((x) => x.id === s.id)!; return was.distanceM > s.distanceM; });
    expect(cut.length).toBeGreaterThan(0);
    for (const s of cut) { const was = plan.sessions.find((x) => x.id === s.id)!; expect(Math.abs(s.durationS / s.distanceM - was.durationS / was.distanceM)).toBeLessThan(0.005); }
  });
});

describe('"Not improving after 10 days" (red flag)', () => {
  const now = new Date('2026-11-20T09:00:00');
  const c = (daysAgo: number, pain: number): BodyCheckin => ({ id: `c${daysAgo}`, at: addDays(now, -daysAgo).toISOString(), area: 'Knee', side: 'left', pain, when: [], onset: 'gradual', trend: 'same', signs: [], redFlags: [] });
  it('a steady 2/10 on a care plan is not a red flag: easy running is fine in that band', () => {
    expect(redFlags(c(0, 2), [c(11, 2), c(8, 2), c(4, 2)], now)).toEqual([]);
    expect(redFlags(c(0, 1), [c(11, 2)], now)).toEqual([]);
  });
  it('3/10 or more that is no better after 10 days still is', () => {
    expect(redFlags(c(0, 3), [c(11, 3), c(5, 3)], now)).toContain('Not improving after 10 days or more');
    expect(redFlags(c(0, 4), [c(12, 3)], now)).toContain('Not improving after 10 days or more');
    expect(redFlags(c(0, 3), [c(12, 5)], now)).toEqual([]); // better than at the start
  });
  it('an old episode that cleared does not count: the 10 days start after the last pain-free check', () => {
    expect(redFlags(c(0, 4), [c(40, 3), c(30, 0), c(3, 4)], now)).toEqual([]);
    expect(redFlags(c(0, 4), [c(40, 3), c(30, 0), c(11, 4)], now)).toContain('Not improving after 10 days or more');
  });
});

// ---- Medium findings from the same sweep
import { restoreAdjusted } from './plan';
import { applyBody } from './body';
import { planGoal } from '../hyrox/plan-goal';

describe('"I feel back to normal" puts the changed sessions back', () => {
  const plan = build(MON, 60);
  const hist = history(60);
  it('tired for 3 days, then back to normal: hard sessions return, and it is logged', () => {
    const tired: Profile = { ...profile, adjust: { kind: 'easier', from: ymd(MON), until: ymd(addDays(MON, 4)), at: '' } };
    const out = adaptPlan({ plan: structuredClone(plan), activities: hist, feedback: [], profile: tired, today: MON, typeOf, paces: P });
    const changed = out.sessions.filter((s) => s.adjustedFrom);
    expect(changed.length).toBeGreaterThan(0);
    const hard = plan.sessions.find((s) => ['threshold', 'vo2max', 'hills', 'tempo'].includes(s.type) && s.date <= ymd(addDays(MON, 4)))!;
    expect(out.sessions.find((s) => s.id === hard.id)!.type).toBe('easy');
    const back = restoreAdjusted(out, MON, 'adjust');
    const again = back.sessions.find((s) => s.id === hard.id)!;
    expect(again).toMatchObject({ type: hard.type, title: hard.title, distanceM: hard.distanceM, durationS: hard.durationS });
    expect(again.adjustedFrom).toBeUndefined();
    expect(back.changes[back.changes.length - 1].summary).toMatch(/You said you feel back to normal/);
    // With the flag gone, adapting again changes nothing, and the same request can be made again later
    const after = adaptPlan({ plan: structuredClone(back), activities: hist, feedback: [], profile, today: MON, typeOf, paces: P });
    expect(after.sessions.find((s) => s.id === hard.id)!.type).toBe(hard.type);
    expect(back.changes.some((c) => c.id.startsWith('adjust:') && !c.id.endsWith(':undone'))).toBe(false);
  });
  it('ill for 2 days, then back to normal: rest days become the planned runs again; past days stay', () => {
    const ill: Profile = { ...profile, illnessUntil: ymd(addDays(MON, 1)) };
    const out = adaptPlan({ plan: structuredClone(plan), activities: hist, feedback: [], profile: ill, today: MON, typeOf, paces: P });
    const tue = plan.sessions.find((s) => s.date === ymd(addDays(MON, 1)))!;
    expect(out.sessions.find((s) => s.id === tue.id)!.type).toBe('rest');
    const back = restoreAdjusted(out, addDays(MON, 1), 'illness');
    expect(back.sessions.find((s) => s.id === tue.id)!.type).toBe(tue.type);
    // Monday is in the past by then: it stays as it was shown, without the marker
    const mon = back.sessions.find((s) => s.date === ymd(MON))!;
    expect(mon.adjustedFrom).toBeUndefined();
    expect(mon.type).toBe('rest');
  });
});

describe('"Both" athletes and the plan goal', () => {
  it('a running goal that is not a race, with no HYROX race, is a running plan that keeps HYROX going', () => {
    expect(planGoal({ ...profile, athleteType: 'both', goalType: 'faster', hyrox: {} }, undefined, MON)).toEqual({ keepHyrox: true });
    // HYROX chosen as the race, or a HYROX date set: a HYROX plan
    expect(planGoal({ ...profile, athleteType: 'both', goalType: 'race', hyrox: {} }, undefined, MON).hyrox).toBeDefined();
    expect(planGoal({ ...profile, athleteType: 'both', goalType: 'faster', hyrox: { raceDate: ymd(addDays(MON, 60)) } }, undefined, MON).hyrox).toBeDefined();
  });
  it('station strength uses the real station exercises when equipment was never changed', () => {
    const race = { id: 'r', name: '10K', date: ymd(addDays(MON, 70)), distanceM: 10000, courseType: 'road' as const, priority: 'A' as const };
    const r = generatePlan({ today: MON, profile: { ...profile, athleteType: 'both', hyrox: {} }, race, paces: P, recentWeeklyKm: 60, longestRecentKm: 20 });
    if (!r.ok) throw new Error(r.problem.message);
    const extra = r.plan.sessions.find((s) => s.strengthPlan?.extra)?.strengthPlan?.extra;
    expect(extra).toEqual(['sled-push', 'sandbag-lunge', 'wall-ball']);
  });
});

describe('easing back in after an injury: the numbers add up', () => {
  const plan = build(MON, 60);
  const body = { checkins: [], easeBack: { from: ymd(MON), until: ymd(addDays(MON, 9)), noHardUntil: ymd(addDays(MON, 3)), label: 'right ankle' } };
  const out = applyBody(structuredClone(plan), body as never, MON);
  it('a hard session turned easy takes the easy zone and an easy-pace time', () => {
    const hard = plan.sessions.find((s) => ['threshold', 'vo2max', 'hills', 'tempo'].includes(s.type) && s.date <= ymd(addDays(MON, 3)))!;
    const s = out.sessions.find((x) => x.id === hard.id)!;
    expect(s.type).toBe('easy');
    expect(s.hrZones).toEqual([2]);
    const perKm = s.durationS / (s.distanceM / 1000);
    expect(perKm).toBeGreaterThanOrEqual(P.easy[0] - 5);
    expect(s.howItHelps).not.toMatch(/threshold/i);
  });
  it('shortened sessions keep steps that add up to the shorter total', () => {
    for (const s of out.sessions.filter((x) => x.date > ymd(addDays(MON, 3)) && x.date <= ymd(addDays(MON, 9)) && x.type !== 'rest')) {
      const was = plan.sessions.find((x) => x.id === s.id)!;
      expect(s.distanceM).toBeLessThanOrEqual(was.distanceM);
      if (s.steps.every((x) => x.km !== undefined)) {
        expect(Math.abs(s.steps.reduce((a, x) => a + (x.km ?? 0), 0) * 1000 - s.distanceM), `${s.date} ${s.title}`).toBeLessThan(250);
        expect(Math.abs(s.steps.reduce((a, x) => a + (x.durationS ?? 0), 0) - s.durationS), `${s.date} ${s.title} time`).toBeLessThan(120);
      }
    }
  });
});
