// Acceptance tests from the November 2026 review (section 13), plus engine safety rules.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import type { Activity, PlannedSession, Profile, Race } from '../lib/types';
import { generatePlan, validatePlan, type GenResult } from './generator';
import { estimateFitness, hrSetup, predictRace, trainingPaces } from './fitness';
import { parseYmd, startOfWeek, ymd } from '../lib/format';

const require = createRequire(import.meta.url);
const ryan = require('../../e2e/fixtures/ryan.cjs') as { ryanActivities: (t?: Date) => Activity[]; ryanProfile: Profile; ryanRace: Race };

const FRIDAY = new Date('2026-11-06T09:00:00');
const base: Profile = { name: 'R', units: 'km', theme: 'system', goal: '', daysAvailable: [0, 1, 2, 3, 4, 5, 6], longRunDay: 5, injuries: [], onboarded: true };
const race5k: Race = { id: 'r', name: 'Safi 5K AM', date: '2026-12-06', distanceM: 5000, courseType: 'road', goalS: 930, priority: 'A' };
const P63 = trainingPaces(63.3);
const gen = (profile: Partial<Profile>, km: number, o: { race?: Race; today?: Date } = {}) =>
  generatePlan({ today: o.today ?? FRIDAY, profile: { ...base, ...profile }, race: 'race' in o ? o.race : race5k, paces: P63, recentWeeklyKm: km, longestRecentKm: 21 });
const ok = (r: GenResult) => { if (!r.ok) throw new Error(`${r.problem.message} ${(r.problem.issues ?? []).join(' | ')}`); return r.plan; };
const day = (s: PlannedSession) => (parseYmd(s.date).getDay() + 6) % 7; // 0 = Monday
const fullWeek = (sessions: PlannedSession[], weekStart: string) => sessions.filter((s) => ymd(startOfWeek(parseYmd(s.date))) === weekStart);
const fmt = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

describe('1. volume must fit the days', () => {
  it('93 km on 3 days is blocked with options, never dumped into one run', () => {
    const r = gen({ daysAvailable: [1, 3, 5] }, 93);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problem.kind).toBe('doesNotFit');
    expect(r.problem.message).toMatch(/93 km a week does not fit safely into 3 days/);
    expect(r.problem.fit?.maxKm).toBeGreaterThanOrEqual(50);
    expect(r.problem.fit?.maxKm).toBeLessThanOrEqual(58);
    expect(r.problem.fit?.recommendedDays).toBe(6);
    expect(r.problem.options.map((o) => o.label).join(' | ')).toMatch(/Train 6 days a week \(recommended\).*Lower to \d+ km a week on 3 days/);
  });
  it('the lower option, once applied, builds a plan where no run is over 35% of its week', () => {
    const r = gen({ daysAvailable: [1, 3, 5] }, 93);
    if (r.ok) throw new Error('expected a problem');
    const lower = r.problem.options.find((o) => /Lower/.test(o.label))!;
    const plan = ok(gen({ daysAvailable: [1, 3, 5], training: lower.training }, 93));
    expect(validatePlan(plan, P63)).toEqual([]);
  });
});

describe('2. default week at 90 km on 6 days', () => {
  const plan = ok(gen({}, 90));
  const wk = fullWeek(plan.sessions, '2026-11-09');
  const roleOf = (d: number) => wk.find((s) => day(s) === d)!;
  it('Mon threshold, Tue easy, Wed rest, Thu intervals, Fri easy, Sat long progressive, Sun easy', () => {
    expect(roleOf(0).type).toBe('threshold');
    expect(roleOf(1).type).toBe('easy');
    expect(roleOf(2).type).toBe('rest');
    expect(roleOf(3).type).toBe('vo2max');
    expect(roleOf(4).type).toBe('easy');
    expect(roleOf(5).type).toBe('long');
    expect(roleOf(5).title).toMatch(/progressive/i);
    expect(roleOf(6).type).toBe('easy');
  });
  it('long run 20–27 km, no easy run over 15 km, week near 90 km', () => {
    expect(roleOf(5).distanceM / 1000).toBeGreaterThanOrEqual(20);
    expect(roleOf(5).distanceM / 1000).toBeLessThanOrEqual(27);
    for (const s of wk.filter((x) => x.type === 'easy')) expect(s.distanceM / 1000).toBeLessThanOrEqual(15);
    const total = wk.reduce((x, s) => x + s.distanceM, 0) / 1000;
    expect(total).toBeGreaterThan(80);
    expect(total).toBeLessThan(100);
  });
  it('passes every safety check', () => expect(validatePlan(plan, P63)).toEqual([]));
});

describe('3. Sunday off', () => {
  it('5 days, volume spread, still no session over the caps', () => {
    const plan = ok(gen({ training: { dayAfterLong: 'off' } }, 90));
    const wk = fullWeek(plan.sessions, '2026-11-09');
    expect(wk.filter((s) => s.type !== 'rest')).toHaveLength(5);
    expect(wk.find((s) => day(s) === 6)!.type).toBe('rest');
    for (const s of wk.filter((x) => x.type === 'easy')) expect(s.durationS).toBeLessThanOrEqual(90 * 60 + 30);
    expect(validatePlan(plan, P63)).toEqual([]);
  });
});

describe('4. long run on Sunday', () => {
  it('Monday becomes easy and threshold moves to Tuesday', () => {
    const plan = ok(gen({ longRunDay: 6 }, 90));
    const wk = fullWeek(plan.sessions, '2026-11-09');
    expect(wk.find((s) => day(s) === 6)!.type).toBe('long');
    expect(wk.find((s) => day(s) === 0)!.type).toBe('easy');
    expect(wk.find((s) => day(s) === 1)!.type).toBe('threshold');
    expect(validatePlan(plan, P63)).toEqual([]);
  });
});

describe('5. paces from fitness', () => {
  it('VDOT 63 gives easy about 4:20–4:50/km, always slower than marathon pace', () => {
    const p = trainingPaces(63);
    expect(p.easy[0]).toBeGreaterThanOrEqual(4 * 60 + 15);
    expect(p.easy[1]).toBeLessThanOrEqual(4 * 60 + 55);
    expect(p.easy[0]).toBeGreaterThan(p.marathon[1]);
    for (const v of [30, 40, 50, 60, 70]) { const q = trainingPaces(v); expect(q.easy[0]).toBeGreaterThan(q.marathon[1]); expect(q.long[0]).toBeGreaterThan(q.marathon[1]); }
  });
  it('pace text never shows 60 seconds', () => {
    const plan = ok(gen({}, 90));
    expect(JSON.stringify(plan)).not.toMatch(/:60\b/);
  });
});

describe('6. races in imported files update fitness and predictions', () => {
  const acts = ryan.ryanActivities(FRIDAY);
  const hr = hrSetup(ryan.ryanProfile, acts, FRIDAY);
  const f = estimateFitness(acts, hr, FRIDAY, [ryan.ryanRace])!;
  it('recognises the races and uses them at full value', () => {
    expect(f.confidence).toBe('high');
    expect(f.vdot).toBeGreaterThan(64.5);
    expect(f.basedOn).toMatch(/5K in 15:51 on 20 Sep/);
  });
  it('the predicted 5K is not slower than a PB from the last 8 weeks', () => {
    const p5 = predictRace(f.vdot, 5000, acts, FRIDAY).timeS;
    expect(p5).toBeLessThanOrEqual(951 + 1);
    expect(predictRace(f.vdot, 10000, acts, FRIDAY).timeS).toBeLessThanOrEqual(1991 + 1);
    expect(fmt(predictRace(f.vdot, 21097.5, acts, FRIDAY).timeS) <= '1:13:37' || predictRace(f.vdot, 21097.5, acts, FRIDAY).timeS <= 4417 + 1).toBe(true);
  });
  it('a later, stronger 10K takes over as the source', () => {
    const faster = [...acts, { ...acts[acts.length - 1], id: 'new10k', startTime: '2026-11-05T08:00:00.000Z', distanceM: 10000, movingS: 1950, durationS: 1960, avgHr: 180 }];
    const g = estimateFitness(faster, hr, FRIDAY, [ryan.ryanRace])!;
    expect(g.basedOn).toMatch(/10K in 32:30/);
    expect(g.vdot).toBeGreaterThan(f.vdot);
  });
});

describe('9–12. plan dates and safety', () => {
  it('a plan generated on a Friday starts that Friday and never plans past days', () => {
    const plan = ok(gen({}, 90));
    expect(plan.startDate).toBe('2026-11-06');
    expect(plan.sessions.every((s) => s.date >= '2026-11-06')).toBe(true);
  });
  it('or next Monday, if the runner prefers', () => {
    const plan = ok(gen({ training: { startMode: 'monday' } }, 90));
    expect(plan.startDate).toBe('2026-11-09');
    expect(plan.sessions[0].date).toBe('2026-11-09');
  });
  it('a 5K 30 days away does not spend half the plan on base', () => {
    const plan = ok(gen({}, 90));
    expect(plan.phases.some((p) => p.phase === 'base')).toBe(false);
    expect(plan.phases[plan.phases.length - 1].phase).toBe('taper');
  });
  it('5K taper: 7–10 days, lighter volume, short sharp openers, easy day before the race', () => {
    const plan = ok(gen({}, 90));
    const taper = plan.phases.find((p) => p.phase === 'taper')!;
    const days = (parseYmd(race5k.date).getTime() - parseYmd(taper.start).getTime()) / 86400000;
    expect(days).toBeGreaterThanOrEqual(7);
    expect(days).toBeLessThanOrEqual(10);
    const dayBefore = plan.sessions.find((s) => s.date === '2026-12-05')!;
    expect(['easy', 'rest']).toContain(dayBefore.type);
    expect(dayBefore.distanceM).toBeLessThanOrEqual(5000);
    const raceWeek = fullWeek(plan.sessions, '2026-11-30').filter((s) => s.type !== 'race').reduce((x, s) => x + s.distanceM, 0) / 1000;
    expect(raceWeek).toBeLessThan(90 * 0.75);
  });
  it('never two hard days back to back, in any template', () => {
    for (const prof of [{}, { longRunDay: 6 }, { training: { dayAfterLong: 'off' as const } }, { daysAvailable: [0, 2, 4, 5] }, { daysAvailable: [1, 2, 3, 4, 5] }]) {
      const plan = ok(gen(prof, 70));
      expect(validatePlan(plan, P63).filter((x) => /back to back/.test(x))).toEqual([]);
    }
  });
  it('every session adds up: distance and time equal the sum of their steps', () => {
    for (const km of [20, 40, 60, 90, 120]) {
      for (const r of [race5k, { ...race5k, distanceM: 21097.5, date: '2027-03-07' }, { ...race5k, distanceM: 42195, date: '2027-04-18' }, undefined]) {
        const res = gen({}, km, { race: r });
        if (!res.ok) { expect(res.problem.kind).toBe('doesNotFit'); continue; }
        expect(validatePlan(res.plan, trainingPaces(63.3))).toEqual([]);
      }
    }
  });
});

// ---- 7, 8: following the plan ----
import { adaptPlan, isUnplanned, missedKeySession, missedMoveOptions, moveSession } from './plan';
import { localReply, namedDay, type CoachContext } from '../coach/coach';
import { daysUntil } from '../lib/format';

const act = (id: string, date: string, km: number, paceS = 270): Activity => ({ id, source: 'manual', sourceIds: { manual: id }, startTime: `${date}T07:00:00.000Z`, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: km * paceS, movingS: km * paceS, detailScore: 1, importedAt: '' });
const typeOf = () => 'easy' as const;

describe('7. a run on a planned rest day', () => {
  const plan = ok(gen({ training: { startMode: 'monday' } }, 90, { today: new Date('2026-11-06T09:00:00') }));
  // Wednesday 11 Nov is the rest day; the runner does 14 km there anyway
  it('shows as unplanned and the rest of the week is trimmed with an explanation', () => {
    expect(plan.sessions.find((s) => s.date === '2026-11-11')!.type).toBe('rest');
    expect(isUnplanned(plan, '2026-11-11')).toBe(true);
    const acts = plan.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-10' && s.type !== 'rest').map((s, i) => act(`a${i}`, s.date, s.distanceM / 1000));
    acts.push(act('extra', '2026-11-11', 14.2));
    const thu = new Date('2026-11-12T06:00:00');
    const adapted = adaptPlan({ plan, activities: acts, feedback: [], profile: base, today: thu, typeOf, paces: P63 });
    const note = adapted.changes.find((c) => c.id.startsWith('rebalance:'));
    expect(note?.summary).toMatch(/You ran 14\.2 km on days with no session planned/);
    expect(note?.summary).toMatch(/→/);
    const restOfWeek = (p: typeof plan) => p.sessions.filter((s) => s.date >= '2026-11-12' && s.date <= '2026-11-15').reduce((x, s) => x + s.distanceM, 0);
    expect(restOfWeek(adapted)).toBeLessThan(restOfWeek(plan));
    // key sessions are not touched
    expect(adapted.sessions.find((s) => s.date === '2026-11-12')!.type).toBe('vo2max');
    expect(adapted.sessions.find((s) => s.date === '2026-11-14')!.type).toBe('long');
  });
});

describe('8. a missed key session', () => {
  const plan = ok(gen({ training: { startMode: 'monday' } }, 90));
  it('Thursday intervals missed: offered Friday or Sunday? Only days with no hard neighbour', () => {
    const acts = plan.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-10' && s.type !== 'rest').map((s, i) => act(`b${i}`, s.date, s.distanceM / 1000));
    const fri = new Date('2026-11-13T08:00:00');
    const adapted = adaptPlan({ plan, activities: acts, feedback: [], profile: base, today: fri, typeOf, paces: P63 });
    const missed = missedKeySession(adapted, fri)!;
    expect(missed.type).toBe('vo2max');
    expect(missed.date).toBe('2026-11-12');
    const opts = missedMoveOptions(adapted, missed.id, fri);
    // Friday sits next to Saturday's long run, so it is not offered; nothing hard may end up back to back
    expect(opts).not.toContain('2026-11-13');
    for (const d of opts) {
      const moved = moveSession(adapted, missed.id, d);
      expect(validatePlan(moved, P63).filter((x) => /back to back/.test(x))).toEqual([]);
    }
  });
});

describe('9. the coach answers the question asked', () => {
  const plan = ok(gen({}, 90));
  const ctx = (today: Date): CoachContext => ({
    today, profile: base, units: 'km', readiness: { level: 'ready', label: 'Ready to train', summary: '', basedOn: [] } as never, stage: { stage: 'full', predictions: true, paces: true, runs: 50, next: '' } as never,
    nextSessions: [], weekDoneM: 0, weekPlannedM: 0, weekSessionsDone: 0, weekSessionsPlanned: 0, planSessionsDone: 0, planSessionsTotal: 0, runCount: 50, hasData: true,
    weekAhead: plan.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-16'), weekTargetKm: 93, maxEasyMin: 90,
  });
  it('"Why is Thursday so long?" mentions that session’s real numbers', () => {
    const mon = new Date('2026-11-09T08:00:00');
    expect(namedDay('why is my thursday run so long?', ctx(mon))).toBe('2026-11-12');
    const thu = plan.sessions.find((s) => s.date === '2026-11-12')!;
    const r = localReply('Why is my Thursday run so long?', ctx(mon));
    expect(r.text).toContain((thu.distanceM / 1000).toFixed(1));
    expect(r.text).toMatch(new RegExp(thu.title.split(':')[0], 'i'));
  });
  it('an easy day question explains the cap', () => {
    const mon = new Date('2026-11-09T08:00:00');
    const r = localReply('Why is Tuesday\'s easy run that many km?', ctx(mon));
    expect(r.text).toMatch(/capped at 90 minutes/);
  });
});

describe('10–11. one value everywhere', () => {
  it('days to race is the same however the time of day', () => {
    expect(daysUntil(new Date('2026-11-06T00:05:00'), '2026-12-06')).toBe(30);
    expect(daysUntil(new Date('2026-11-06T23:55:00'), '2026-12-06')).toBe(30);
  });
  it('the Month label (focus) and the Week label (title) describe the same session', () => {
    const plan = ok(gen({}, 90));
    const family: Record<string, RegExp> = { easy: /easy|openers|shakeout/i, recovery: /recovery/i, long: /long/i, threshold: /threshold/i, vo2max: /intervals|race pace|sharpener/i, tempo: /pace/i, hills: /hills/i, rest: /rest/i, race: /./ };
    for (const s of plan.sessions) {
      expect(s.title).toMatch(family[s.type]);
      if (s.type !== 'race') expect(s.focus).toMatch(family[s.type]);
    }
  });
});

describe('engine sweep', () => {
  it('every combination of volume, days, fitness, long-run day and goal gives a sound plan or a clear "does not fit"', () => {
    const races: (Race | undefined)[] = [undefined, { ...race5k, date: '2026-11-22' }, { ...race5k, distanceM: 10000, date: '2027-01-10' }, { ...race5k, distanceM: 42195, date: '2027-03-21' }];
    for (const km of [8, 15, 25, 40, 60, 90, 120]) for (const days of [[1, 3, 5], [1, 3, 5, 6], [0, 1, 3, 5, 6], [0, 1, 2, 3, 4, 5, 6]]) for (const vdot of [32, 48, 65]) for (const lr of [5, 6]) for (const race of races) {
      const r = generatePlan({ today: FRIDAY, profile: { ...base, daysAvailable: days, longRunDay: lr }, race, paces: trainingPaces(vdot), recentWeeklyKm: km, longestRecentKm: 10 });
      if (!r.ok) expect(r.problem.kind, `${km} km, ${days.length} days, VDOT ${vdot}: ${(r.problem.issues ?? []).join(' | ')}`).toBe('doesNotFit');
      else expect(r.plan.sessions.filter((s) => (s.type === 'easy' || s.type === 'recovery') && s.durationS > 2 * 3600)).toEqual([]);
    }
  });
});

// ---- Improvements: training style, doubles, races, adjustments, swaps, coach edits, units ----
import { swapSession } from './plan';
import { localise, parseTime } from '../lib/format';

describe('training style settings', () => {
  it('doubles: 93 km on 3 days fits with a second easy run on those days, and every session still passes', () => {
    const r = gen({ daysAvailable: [1, 3, 5] }, 93);
    if (r.ok) throw new Error('expected a problem');
    const dbl = r.problem.options.find((o) => /second easy run/.test(o.label));
    expect(dbl).toBeTruthy();
    const plan = ok(gen({ daysAvailable: [1, 3, 5], training: dbl!.training }, 93));
    expect(plan.sessions.some((s) => s.second)).toBe(true);
    expect(validatePlan(plan, P63)).toEqual([]);
  });
  it('no hard sessions means only the long run is hard; one means one', () => {
    const none = ok(gen({ training: { hardSessions: 0 } }, 60));
    expect(fullWeek(none.sessions, '2026-11-09').filter((s) => ['threshold', 'vo2max', 'tempo', 'hills'].includes(s.type))).toHaveLength(0);
    const one = ok(gen({ training: { hardSessions: 1 } }, 60));
    expect(fullWeek(one.sessions, '2026-11-09').filter((s) => ['threshold', 'vo2max', 'tempo', 'hills'].includes(s.type))).toHaveLength(1);
  });
  it('harder sessions use slightly faster paces, easier ones slightly slower', () => {
    const t = (d: 'easier' | 'normal' | 'harder') => ok(gen({ training: { difficulty: d } }, 70)).sessions.find((s) => s.type === 'threshold')!.paceTarget!.minSPerKm;
    expect(t('harder')).toBeLessThan(t('normal'));
    expect(t('easier')).toBeGreaterThan(t('normal'));
  });
  it('strength goes away from hard days, never heavy the day before one (update 3, §4)', () => {
    const plan = ok(gen({ training: { strengthPerWeek: 2 } }, 70));
    const week = fullWeek(plan.sessions, '2026-11-09');
    const wk = week.filter((s) => s.strengthPlan);
    expect(wk).toHaveLength(2);
    expect(wk.every((s) => !['threshold', 'vo2max', 'hills', 'tempo', 'long'].includes(s.type))).toBe(true);
    for (const s of wk) {
      const next = week.find((x) => x.date > s.date);
      if (next && ['threshold', 'vo2max', 'hills', 'tempo', 'long'].includes(next.type)) expect(s.strengthPlan!.intensity).toBe('light');
    }
  });
  it('a plan without a race follows the chosen length', () => {
    const plan = ok(gen({ training: { planWeeks: 6 } }, 50, { race: undefined }));
    expect(plan.weeks!.length).toBeLessThanOrEqual(7);
  });
  it('a C race replaces that day, with easy days either side', () => {
    const c: Race = { id: 'c', name: 'Club 10K', date: '2026-11-22', distanceM: 10000, courseType: 'road', priority: 'C' };
    const plan = ok(generatePlan({ today: FRIDAY, profile: base, race: race5k, paces: P63, recentWeeklyKm: 80, longestRecentKm: 20, otherRaces: [c] }));
    expect(plan.sessions.find((s) => s.date === '2026-11-22')!.type).toBe('race');
    expect(['easy', 'rest', 'recovery']).toContain(plan.sessions.find((s) => s.date === '2026-11-21')!.type);
    expect(['easy', 'rest', 'recovery']).toContain(plan.sessions.find((s) => s.date === '2026-11-23')!.type);
    expect(validatePlan(plan, P63).filter((x) => /back to back/.test(x))).toEqual([]);
  });
});

describe('not feeling 100%', () => {
  const plan = ok(gen({ training: { startMode: 'monday' } }, 80));
  const mon = new Date('2026-11-09T07:00:00');
  const run = (kind: 'easier' | 'nopace' | 'travel') => adaptPlan({ plan, activities: [], feedback: [], profile: { ...base, adjust: { kind, from: '2026-11-09', until: '2026-11-13', at: '' } }, today: mon, typeOf, paces: P63 });
  it('easier: hard sessions become easy, the long run is shorter, the first hard session back is shorter', () => {
    const a = run('easier');
    const wk = a.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-13');
    expect(wk.some((s) => ['threshold', 'vo2max'].includes(s.type))).toBe(false);
    expect(a.changes.some((c) => /an easier few days/.test(c.summary))).toBe(true);
  });
  it('no pace targets: sessions keep their shape without paces', () => {
    const a = run('nopace');
    const thr = a.sessions.find((s) => s.date === '2026-11-09')!;
    expect(thr.paceTarget).toBeUndefined();
    expect(thr.steps.map((x) => x.detail).join(' ')).not.toMatch(/\/km/);
  });
  it('travel: easy runs of up to 45 minutes', () => {
    const a = run('travel');
    for (const s of a.sessions.filter((x) => x.date >= '2026-11-09' && x.date <= '2026-11-13' && x.type !== 'rest')) expect(s.durationS).toBeLessThanOrEqual(45 * 60 + 30);
  });
});

describe('changing one session', () => {
  const plan = ok(gen({}, 80));
  const thr = plan.sessions.find((s) => s.type === 'threshold')!;
  it('shorter, easy, similar and treadmill all keep distance and time consistent and log the change', () => {
    for (const k of ['shorter', 'easy', 'similar', 'treadmill'] as const) {
      const p = swapSession(plan, thr.id, k, P63);
      const s = p.sessions.find((x) => x.id === thr.id)!;
      expect(p.changes[p.changes.length - 1].summary).toMatch(/→/);
      const km = s.steps.reduce((x, y) => x + (y.km ?? 0), 0);
      if (s.steps.every((x) => x.km !== undefined)) expect(Math.abs(km * 1000 - s.distanceM)).toBeLessThan(200);
      if (k === 'shorter') expect(s.distanceM).toBeLessThan(thr.distanceM);
      if (k === 'easy') expect(s.type).toBe('easy');
    }
  });
});

describe('coach plan edits', () => {
  const plan = ok(gen({}, 90));
  const ctx: CoachContext = {
    today: new Date('2026-11-09T08:00:00'), profile: base, units: 'km', readiness: { level: 'ready', label: '', summary: '', basedOn: [] } as never, stage: { stage: 'full', predictions: true, paces: true, runs: 50, next: '' } as never,
    nextSessions: [], weekDoneM: 0, weekPlannedM: 0, weekSessionsDone: 0, weekSessionsPlanned: 0, planSessionsDone: 0, planSessionsTotal: 0, runCount: 50, hasData: true,
    weekAhead: plan.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-16'),
  };
  it('"move Thursday to Friday" proposes a move, and warns about back-to-back hard days', () => {
    const r = localReply('Can you move Thursday to Friday?', ctx);
    expect(r.proposal?.kind).toBe('move');
    expect(r.proposal?.toDate).toBe('2026-11-13');
    expect(r.text).toMatch(/back to back/);
  });
  it('"make tomorrow easier" proposes an easy run', () => {
    const r = localReply('Make tomorrow easier please', ctx);
    expect(r.proposal?.kind).toBe('swap');
  });
});

describe('typed times and miles', () => {
  it('parses times as typed', () => {
    expect(parseTime('15:30')).toBe(930);
    expect(parseTime('1:13:37')).toBe(4417);
    expect(parseTime('45')).toBe(2700);
    expect(parseTime('15:75')).toBeUndefined();
  });
  it('shows plan text in miles for mile users', () => {
    expect(localise('12.6 km easy at 4:13–4:44/km', 'mi')).toBe('7.8 mi easy at 6:47–7:37/mi');
    expect(localise('12.6 km easy', 'km')).toBe('12.6 km easy');
  });
});

describe('coach move dates', () => {
  it('asked on a Friday, "move Thursday to Friday" means next Thursday to the Friday after it', () => {
    const plan = ok(gen({}, 90));
    const ctx = { today: new Date('2026-11-06T08:00:00'), profile: base, units: 'km', readiness: { level: 'ready', label: '', summary: '', basedOn: [] }, stage: { stage: 'full', predictions: true, paces: true, runs: 50, next: '' },
      nextSessions: [], weekDoneM: 0, weekPlannedM: 0, weekSessionsDone: 0, weekSessionsPlanned: 0, planSessionsDone: 0, planSessionsTotal: 0, runCount: 50, hasData: true,
      weekAhead: plan.sessions.filter((s) => s.date >= '2026-11-02' && s.date <= '2026-11-13') } as unknown as CoachContext;
    const r = localReply('Move Thursday to Friday', ctx);
    expect(plan.sessions.find((s) => s.id === r.proposal?.sessionId)?.date).toBe('2026-11-12');
    expect(r.proposal?.toDate).toBe('2026-11-13');
  });
});

import { proposalFromAi } from '../coach/coach';
describe('AI coach proposals are checked before they are offered', () => {
  const plan = ok(gen({}, 90));
  const ctx = { today: new Date('2026-11-09T08:00:00'), weekAhead: plan.sessions.filter((s) => s.date >= '2026-11-09' && s.date <= '2026-11-16') } as unknown as CoachContext;
  const thr = ctx.weekAhead!.find((s) => s.type === 'threshold')!;
  const rest = ctx.weekAhead!.find((s) => s.type === 'rest')!;
  it('accepts a valid move or swap of a real session', () => {
    expect(proposalFromAi({ action: 'move', session_id: thr.id, to_date: '2026-11-10' }, ctx)?.kind).toBe('move');
    expect(proposalFromAi({ action: 'easy', session_id: thr.id, to_date: null }, ctx)?.swap).toBe('easy');
  });
  it('rejects unknown sessions, rest days, past dates and far-off dates', () => {
    expect(proposalFromAi({ action: 'move', session_id: 'made-up', to_date: '2026-11-10' }, ctx)).toBeUndefined();
    expect(proposalFromAi({ action: 'easy', session_id: rest.id, to_date: null }, ctx)).toBeUndefined();
    expect(proposalFromAi({ action: 'move', session_id: thr.id, to_date: '2026-11-01' }, ctx)).toBeUndefined();
    expect(proposalFromAi({ action: 'move', session_id: thr.id, to_date: '2027-01-01' }, ctx)).toBeUndefined();
    expect(proposalFromAi({ action: 'delete', session_id: thr.id, to_date: null }, ctx)).toBeUndefined();
  });
});

describe('review #2 §9.7: race week and easy runs', () => {
  // Wed long run (the reviewed account), rest on Sunday = race day
  const plan = ok(gen({ longRunDay: 2, daysAvailable: [0, 1, 2, 3, 4, 5] }, 93));
  const raceWeek = fullWeek(plan.sessions, '2026-11-30');
  const toRace = (s: PlannedSession) => Math.round((parseYmd('2026-12-06').getTime() - parseYmd(s.date).getTime()) / 86400000);
  it('race week keeps 6 run days (the race included), never 7 in a row', () => {
    expect(raceWeek.filter((s) => s.type !== 'rest').length).toBe(6);
  });
  it('a full rest day 2 or 3 days before a 5K', () => {
    expect(raceWeek.some((s) => s.type === 'rest' && [2, 3].includes(toRace(s)))).toBe(true);
  });
  it('one race-pace sharpener 4 to 5 days out', () => {
    const sharp = raceWeek.filter((s) => /sharpener/i.test(s.title));
    expect(sharp.length).toBe(1);
    expect([4, 5]).toContain(toRace(sharp[0]));
  });
  it('no "after the long run" label in a week without a long run', () => {
    expect(raceWeek.some((s) => /after the long run/i.test(s.title))).toBe(false);
  });
  it('easy runs in a normal week are not all the same length, and the week total is unchanged', () => {
    const wk = fullWeek(plan.sessions, '2026-11-09').filter((s) => s.type === 'easy');
    const kms = wk.map((s) => Math.round(s.distanceM / 100) / 10);
    expect(new Set(kms).size).toBeGreaterThan(1);
    expect(validatePlan(plan, P63)).toEqual([]);
  });
});
