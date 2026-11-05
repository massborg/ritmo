import { describe, expect, it } from 'vitest';
import type { Activity, PlannedSession, Profile, SessionFeedback } from '../lib/types';
import { adaptPlan, buildStarterPlan, pickStarterDays } from './plan';
import { fitnessStage } from './stage';
import { estimateFitness, hrSetup, predictTime, trainingPaces } from './fitness';
import { readiness, loadSeries } from './load';
import { easyHardBalance } from './insights';
import { analyse } from './analysis';
import { localReply, suggestions, type CoachContext } from '../coach/coach';
import { generateSample, SAMPLE_PROFILE, SAMPLE_TODAY } from '../data/sample';
import { addDays, daysBetween, parseYmd, ymd } from '../lib/format';

const profile: Profile = { name: 'Sam', units: 'km', theme: 'system', goal: 'Run 5K without stopping', daysAvailable: [0, 2, 4], longRunDay: 4, injuries: [], onboarded: true, experience: 'new' };
const monday = parseYmd('2026-11-09');
const run = (id: string, date: string, km: number, min: number, extra: Partial<Activity> = {}): Activity => ({
  id, source: 'manual', sourceIds: { manual: id }, startTime: `${date}T08:00:00.000Z`, name: 'Run', sport: 'run',
  distanceM: km * 1000, durationS: min * 60, movingS: min * 60, detailScore: 1, importedAt: '', ...extra,
});

describe('starter plan', () => {
  const plan = buildStarterPlan({ today: monday, profile, canRun10: false, walksRegularly: true });
  const sessions = plan.sessions.filter((s) => s.type !== 'rest');

  it('is 8 to 10 weeks, three days a week, with rest days between', () => {
    const weeks = Math.ceil((daysBetween(parseYmd(plan.startDate), parseYmd(plan.endDate)) + 1) / 7);
    expect(weeks).toBeGreaterThanOrEqual(8);
    expect(weeks).toBeLessThanOrEqual(10);
    for (let i = 1; i < sessions.length; i++) expect(daysBetween(parseYmd(sessions[i - 1].date), parseYmd(sessions[i].date))).toBeGreaterThanOrEqual(2);
    const perWeek = new Map<number, number>();
    for (const s of sessions) { const w = Math.floor(daysBetween(monday, parseYmd(s.date)) / 7); perWeek.set(w, (perWeek.get(w) ?? 0) + 1); }
    for (const n of perWeek.values()) expect(n).toBeLessThanOrEqual(3);
  });
  it('starts with 1 minute running intervals and builds to 30 minutes continuous, then a 5K', () => {
    expect(sessions[0].title).toBe('Run/walk: 8 x 1 min');
    const continuous = sessions.filter((s) => /^Run \d+ min$/.test(s.title));
    expect(continuous[continuous.length - 1].title).toBe('Run 30 min');
    expect(sessions[sessions.length - 1].type).toBe('timetrial');
  });
  it('is set by effort, not pace', () => {
    for (const s of sessions.filter((x) => x.type === 'runwalk')) {
      expect(s.paceTarget).toBeUndefined();
      expect(s.steps.map((x) => x.detail).join(' ')).toMatch(/talk in full sentences/);
    }
  });
  it('total time never jumps by more than about 25% between consecutive sessions', () => {
    const rw = sessions.filter((s) => s.type === 'runwalk');
    for (let i = 1; i < rw.length; i++) expect(rw[i].durationS / rw[i - 1].durationS).toBeLessThan(1.3);
  });
  it('is shorter for people who can already run 10 minutes, gentler for non-walkers', () => {
    const fit = buildStarterPlan({ today: monday, profile, canRun10: true, walksRegularly: true }).sessions.filter((s) => s.type !== 'rest');
    const gentle = buildStarterPlan({ today: monday, profile, canRun10: false, walksRegularly: false }).sessions.filter((s) => s.type !== 'rest');
    expect(fit.length).toBeLessThan(sessions.length);
    expect(gentle.length).toBeGreaterThan(sessions.length);
    expect(gentle[0].title).toBe('Run/walk: 8 x 45 s');
  });
  it('picks training days with a rest day between them', () => {
    expect(pickStarterDays([0, 1, 2, 3, 4, 5, 6])).toEqual([0, 2, 4]);
    expect(pickStarterDays([1, 2, 3])).toEqual([1, 3]);
    expect(pickStarterDays([5, 6])).toEqual([5, 6]);
  });
});

describe('fitness stages unlock in order', () => {
  const hr = hrSetup(profile, [], monday);
  it('starts as starter with no runs', () => {
    const st = fitnessStage([], estimateFitness([], hr, monday), monday);
    expect(st.stage).toBe('starter');
    expect(st.paces).toBe(false);
    expect(st.predictions).toBe(false);
  });
  it('estimates paces after three runs, but no predictions', () => {
    const acts = [run('a', '2026-11-02', 3, 24), run('b', '2026-11-04', 3.2, 25), run('c', '2026-11-06', 3.5, 27)];
    const f = estimateFitness(acts, hr, monday);
    expect(f?.confidence).toBe('low');
    const st = fitnessStage(acts, f, monday);
    expect(st.stage).toBe('building');
    expect(st.paces).toBe(true);
    expect(st.predictions).toBe(false);
  });
  it('unlocks everything after a 5K time trial', () => {
    const acts = [run('a', '2026-11-02', 3, 24), run('b', '2026-11-04', 3.2, 25), run('tt', '2026-11-07', 5, 31, { isTimeTrial: true })];
    const f = estimateFitness(acts, hr, monday);
    expect(f?.confidence).toBe('high');
    expect(fitnessStage(acts, f, monday).stage).toBe('full');
  });
  it('a full Garmin-style history is full', () => {
    const s = generateSample();
    const today = parseYmd(SAMPLE_TODAY);
    const f = estimateFitness(s.activities, hrSetup(SAMPLE_PROFILE, s.activities, today), today);
    expect(fitnessStage(s.activities, f, today).stage).toBe('full');
  });
});

describe('fitness estimate uses recent races at full value', () => {
  it('a half marathon run 25 days ago predicts the same time back', () => {
    const today = parseYmd('2026-11-05');
    const race = run('hm', '2026-10-11', 21.0975, 0, { movingS: 92 * 60 + 45, durationS: 92 * 60 + 45, isRace: true, name: 'Half' });
    const f = estimateFitness([race], hrSetup(SAMPLE_PROFILE, [race], today), today)!;
    expect(Math.abs(predictTime(f.vdot, 21097.5) - (92 * 60 + 45))).toBeLessThan(3);
    expect(f.basedOn).toMatch(/11 Oct 2026/);
  });
  it('the sample runner\'s estimated half matches their recent 1:32:45 race', () => {
    const s = generateSample();
    const today = parseYmd(SAMPLE_TODAY);
    const f = estimateFitness(s.activities, hrSetup(SAMPLE_PROFILE, s.activities, today), today)!;
    const race = s.activities.find((a) => a.name === 'Gozo Half Marathon')!;
    expect(f.basedOn).toMatch(/Gozo Half Marathon/);
    expect(Math.abs(predictTime(f.vdot, 21097.5) - race.movingS * (21097.5 / race.distanceM))).toBeLessThan(5);
  });
});

describe('beginner adaptation', () => {
  const plan = buildStarterPlan({ today: monday, profile, canRun10: false, walksRegularly: true });
  const sess = plan.sessions.filter((s) => s.type === 'runwalk');
  const first = sess[0], second = sess[1];
  const paces = trainingPaces(35);
  const typeOf = () => 'easy' as const;

  it('repeats the session instead of progressing when it felt very hard', () => {
    const acts = [run('r1', first.date, 2.5, first.durationS / 60)];
    const fb: SessionFeedback[] = [{ activityId: 'r1', feel: 1, pain: [], loggedAt: `${first.date}T10:00:00Z` }];
    const out = adaptPlan({ plan, activities: acts, feedback: fb, profile, today: addDays(parseYmd(first.date), 1), typeOf, paces });
    const next = out.sessions.find((s) => s.id === second.id)!;
    expect(next.title).toBe(first.title);
    const change = out.changes.find((c) => c.id === `repeat:${first.id}`)!;
    expect(change.summary).toMatch(/repeats it|stay at this level/);
    expect(change.summary).not.toMatch(/fail|lazy|should have/i);
  });
  it('holds back the next step up after a very hard session', () => {
    const last = sess[2]; // last session of week 1; the next one would step up
    const acts = [run('r3', last.date, 2.5, last.durationS / 60)];
    const fb: SessionFeedback[] = [{ activityId: 'r3', feel: 1, pain: [], loggedAt: `${last.date}T10:00:00Z` }];
    const out = adaptPlan({ plan, activities: acts, feedback: fb, profile, today: addDays(parseYmd(last.date), 1), typeOf, paces });
    expect(sess[3].title).not.toBe(last.title);
    expect(out.sessions.find((s) => s.id === sess[3].id)!.title).toBe(last.title);
    expect(out.sessions.find((s) => s.id === sess[4].id)!.title).toBe(sess[4].title);
  });
  it('progresses normally when it felt fine', () => {
    const acts = [run('r1', first.date, 2.5, first.durationS / 60)];
    const fb: SessionFeedback[] = [{ activityId: 'r1', feel: 4, pain: [], loggedAt: `${first.date}T10:00:00Z` }];
    const out = adaptPlan({ plan, activities: acts, feedback: fb, profile, today: addDays(parseYmd(first.date), 1), typeOf, paces });
    expect(out.sessions.find((s) => s.id === second.id)!.title).toBe(second.title);
  });
  it('eases back in after missed sessions, without guilt', () => {
    const d = parseYmd(sess[3].date);
    const acts = [run('r1', first.date, 2.5, 20)];
    const out = adaptPlan({ plan, activities: acts, feedback: [], profile, today: d, typeOf, paces });
    const change = out.changes.find((c) => c.id.startsWith('missedrw:'))!;
    expect(change.summary).toMatch(/that is fine/);
    expect(out.sessions.find((s) => s.id === sess[3].id)!.title).toBe(first.title);
  });
  it('gives rest after pain, and medical advice for chest pain or dizziness', () => {
    const acts = [run('r1', first.date, 2.5, 20)];
    const fb: SessionFeedback[] = [{ activityId: 'r1', feel: 3, pain: [{ area: 'Chest pain, dizziness or feeling faint', severity: 3 }], loggedAt: `${first.date}T10:00:00Z` }];
    const today = addDays(parseYmd(first.date), 1);
    const out = adaptPlan({ plan, activities: acts, feedback: fb, profile, today, typeOf, paces });
    const second2 = out.sessions.find((s) => s.id === second.id)!;
    expect(second2.type === 'rest' || second2.title === 'Easy walk').toBe(true);
    void ymd;
    expect(out.changes.find((c) => c.reason === 'pain')!.summary).toMatch(/medical advice/);
    const r = readiness({ today, profile, series: [], activities: acts, feedback: fb, simple: true });
    expect(r.level).toBe('recovery');
    expect(r.summary).toMatch(/doctor/);
  });
  it('readiness for beginners ignores load numbers', () => {
    const acts = [run('r1', first.date, 2.5, 20)];
    const r = readiness({ today: monday, profile, series: loadSeries(acts, hrSetup(profile, acts, monday), undefined, monday, 30), activities: acts, feedback: [], simple: true });
    expect(r.basedOn.join(' ')).not.toMatch(/Form|fitness \d/);
  });
});

describe('plan notes carry their full date', () => {
  it('sample adaptations name the day and date', () => {
    const s = generateSample();
    for (const c of s.plan.changes.filter((x) => x.reason === 'harder' || x.reason === 'missed')) {
      expect(c.summary).toMatch(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)/);
    }
  });
});

describe('easy/hard balance respects the training phase', () => {
  const today = parseYmd('2026-11-05');
  const acts = [run('e1', '2026-11-01', 10, 55), run('q1', '2026-11-03', 10, 45), run('e2', '2026-11-04', 8, 44)];
  const typeOf = (a: Activity) => (a.id.startsWith('q') ? 'threshold' : 'easy');
  it('does not warn when the plan prescribes the quality work', () => {
    const sessions = [
      { date: '2026-11-01', type: 'easy', durationS: 3300, phase: 'peak' },
      { date: '2026-11-03', type: 'threshold', durationS: 2700, phase: 'peak' },
      { date: '2026-11-04', type: 'easy', durationS: 2640, phase: 'peak' },
    ];
    const b = easyHardBalance({ activities: acts, typeOf, sessions, today })!;
    expect(b.verdict).not.toBe('too-hard');
    expect(b.message).toMatch(/plan/);
  });
  it('warns when easy days were run hard against the plan', () => {
    const allHard = (a: Activity) => (a.id === 'e2' ? 'easy' : 'threshold');
    const sessions = [
      { date: '2026-11-01', type: 'easy', durationS: 3300, phase: 'base' },
      { date: '2026-11-03', type: 'easy', durationS: 2700, phase: 'base' },
      { date: '2026-11-04', type: 'easy', durationS: 2640, phase: 'base' },
    ];
    expect(easyHardBalance({ activities: acts, typeOf: allHard, sessions, today })!.verdict).toBe('too-hard');
  });
});

describe('analysis and coach for beginners', () => {
  const plan = buildStarterPlan({ today: monday, profile, canRun10: false, walksRegularly: true });
  const s0 = plan.sessions.find((s) => s.type === 'runwalk') as PlannedSession;
  it('feedback for a hand-logged run/walk uses only time, distance and feel', () => {
    const a = run('m1', s0.date, 2.4, 20);
    const an = analyse({ a, all: [a], paces: trainingPaces(35), typicalMovingS: 1200, planned: s0, feedback: { activityId: 'm1', feel: 1, pain: [], loggedAt: '' }, pastFeedback: [], units: 'km', typeOf: () => 'easy' });
    expect(an.type).toBe('runwalk');
    expect(an.limitedData).toMatch(/by hand/);
    expect(an.improve.join(' ')).toMatch(/repeats this one/);
    expect(an.splits).toHaveLength(0);
  });
  const ctx = (extra: Partial<CoachContext> = {}): CoachContext => ({
    today: monday, profile, units: 'km', readiness: { level: 'ready', label: 'Ready to train', summary: '', basedOn: [] },
    stage: fitnessStage([], undefined, monday), todaySession: s0, nextSessions: [], weekDoneM: 0, weekPlannedM: 0,
    weekSessionsDone: 0, weekSessionsPlanned: 3, planSessionsDone: 0, planSessionsTotal: 28, runCount: 0, hasData: true, ...extra,
  });
  it('never invents history or predictions for a new runner', () => {
    for (const q of ['Am I on track?', 'How did my last run go?', 'What is my marathon time?', 'How fast should I run?']) {
      const r = localReply(q, ctx());
      expect(r.text).not.toMatch(/VDOT|predict(s|ed) \d|\d:\d\d:\d\d|you were \d+ s\/km/);
    }
    expect(localReply('How did my last run go?', ctx()).text).toMatch(/not logged a run yet/);
  });
  it('sends urgent symptoms to a doctor', () => {
    expect(localReply('I felt dizzy and had chest pain', ctx()).text).toMatch(/medical advice/);
  });
  it('suggests questions that match the session', () => {
    expect(suggestions({ ...s0, type: 'tempo', focus: 'Marathon pace' }, true)[0]).toBe('Why is today marathon pace?');
    expect(suggestions({ ...s0, type: 'easy' }, true)[0]).toBe('Why is today easy?');
    expect(suggestions({ ...s0, type: 'rest' }, true)[0]).toBe('Why is today a rest day?');
    expect(suggestions(s0, false)).not.toContain('How did my last run go?');
  });
});
