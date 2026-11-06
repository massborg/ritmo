// Athlete setup: which steps a person still needs, age rules, goal realism and the first plan.
import type { Activity, BackgroundLevel, GoalType, Plan, Profile, Race } from '../lib/types';
import { addDays, daysBetween, distanceLabel, duration, parseYmd, ymd } from '../lib/format';
import { estimateFitness, hrSetup, predictTime, trainingPaces, vdotFromPerformance } from './fitness';
import { buildStarterPlan } from './plan';
import { generatePlan, type PlanProblem } from './generator';

export const MIN_AGE = 18;
export const CONSENT_VERSION = '2026-11';

export type SetupStep = 'consent' | 'basics' | 'health' | 'background' | 'goal' | 'schedule' | 'injuries' | 'runs' | 'preview';
export const ALL_STEPS: SetupStep[] = ['consent', 'basics', 'health', 'background', 'goal', 'schedule', 'injuries', 'runs', 'preview'];

export function ageOn(dob: string, today: Date): number {
  const b = parseYmd(dob);
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export function isOldEnough(dob: string | undefined, today: Date): boolean {
  return !!dob && ageOn(dob, today) >= MIN_AGE;
}

/**
 * Steps this person still has to answer. New accounts see every step; existing users only what's missing.
 * "runs" is offered only to people with no runs yet; "preview" only when there is no plan to keep.
 */
export function stepsNeeded(p: Profile, ctx: { hasRuns: boolean; hasPlan: boolean; today: Date }): SetupStep[] {
  const out: SetupStep[] = [];
  if (!p.consents?.healthData?.granted) out.push('consent');
  if (!p.name || !isOldEnough(p.dateOfBirth, ctx.today)) out.push('basics');
  if (!p.healthCheck || (p.healthCheck.doctorAdvised && !p.healthCheck.acknowledgedAt)) out.push('health');
  if (!p.background) out.push('background');
  if (!p.goalType) out.push('goal');
  if (!p.schedule || !p.daysAvailable.length) out.push('schedule');
  if (!p.injuriesAnswered) out.push('injuries');
  if (!ctx.hasRuns && !p.setupStepsDone?.includes('runs')) out.push('runs');
  if (!ctx.hasPlan) out.push('preview');
  return out;
}

// ---------------- Health check ----------------
/** Our wording, shown to the user for review. Any "yes" means: check with a doctor first. */
export const HEALTH_QUESTIONS: { id: string; text: string }[] = [
  { id: 'heart', text: 'Has a doctor ever told you that you have a heart condition, or that you should only exercise under medical supervision?' },
  { id: 'chest', text: 'Do you get pain or tightness in your chest, at rest or when you are active?' },
  { id: 'dizzy', text: 'Do you lose your balance because of dizziness, or have you fainted in the past year?' },
  { id: 'joints', text: 'Do you have a bone, joint or muscle problem, such as in your back, hip or knee, that could be made worse by running?' },
  { id: 'meds', text: 'Are you currently taking medicine for your heart or blood pressure?' },
  { id: 'other', text: 'Is there any other reason you know of, including pregnancy or a recent illness or operation, why you should not exercise?' },
];

// ---------------- Goal realism ----------------
export interface GoalCheck { ok: boolean; message?: string; saferGoal?: { goalType: GoalType; label: string; race?: Partial<Race> } }

const RACE_MIN_WEEKS = (m: number, level: BackgroundLevel) => {
  const beginner = level === 'new' || level === 'returning';
  if (m >= 40000) return beginner ? 36 : 16;
  if (m >= 20000) return beginner ? 20 : 10;
  if (m >= 9000) return beginner ? 10 : 6;
  return beginner ? 8 : 3;
};

/** Kindly flag goals that are unlikely or unsafe in the time available, and offer a safer alternative. */
export function checkGoal(opts: { goalType: GoalType; race?: Partial<Race>; level: BackgroundLevel; canRun10?: boolean; weeklyKm?: number; vdot?: number; today: Date }): GoalCheck {
  const { goalType, race, level, canRun10, weeklyKm = 0, vdot, today } = opts;
  if (goalType === 'first10k' && level === 'new' && canRun10 === false) {
    return { ok: false, message: 'A first 10K is a great goal. Starting from run/walk, it is safer to aim for running 5K without stopping first, then build to 10K.', saferGoal: { goalType: '5k', label: 'Run 5K without stopping first' } };
  }
  if (goalType !== 'race' || !race?.distanceM || !race.date) return { ok: true };
  const weeks = daysBetween(today, parseYmd(race.date)) / 7;
  if (weeks < 0) return { ok: false, message: 'That date has already passed. Choose a future race date.' };
  const minWeeks = RACE_MIN_WEEKS(race.distanceM, level);
  if (weeks < minWeeks || (race.distanceM >= 40000 && weeklyKm < 25 && weeks < 20)) {
    const later = ymd(addDays(today, Math.ceil(minWeeks * 7)));
    return {
      ok: false,
      message: `${Math.max(0, Math.floor(weeks))} weeks is short to prepare for a ${distanceLabel(race.distanceM).toLowerCase()} from where you are now. Rushing raises the risk of injury. A safer option is to run it just to finish, or choose a race on or after ${parseYmd(later).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
      saferGoal: { goalType: 'race', label: 'Run it to finish, without a time target', race: { ...race, goalS: undefined } },
    };
  }
  if (race.goalS && vdot) {
    const predicted = predictTime(vdot, race.distanceM);
    // Allow roughly one VDOT point of improvement per six weeks of training, up to four
    const reachable = predictTime(vdot + Math.min(4, weeks / 6), race.distanceM);
    if (race.goalS < reachable * 0.99) {
      return {
        ok: false,
        message: `Your current fitness suggests about ${duration(predicted)} today, and around ${duration(reachable)} is realistic by race day. ${duration(race.goalS)} would need a much bigger jump than is safe to plan for.`,
        saferGoal: { goalType: 'race', label: `Aim for about ${duration(Math.round(reachable / 10) * 10)}`, race: { ...race, goalS: Math.round(reachable / 10) * 10 } },
      };
    }
  }
  return { ok: true };
}

// ---------------- First plan ----------------
/** Rough fitness from typical weekly distance when there is no run or race to measure it. Always labelled an estimate. */
export function vdotFromWeeklyKm(km: number): number {
  if (km <= 10) return 32;
  if (km <= 20) return 35;
  if (km <= 35) return 39;
  if (km <= 50) return 43;
  if (km <= 70) return 47;
  return 50;
}

export interface SetupPlanResult { plan: Plan; basis: string; confidence: 'measured' | 'estimated' | 'none'; problem?: PlanProblem }
export type SetupPlanOutcome = SetupPlanResult | { problem: PlanProblem; plan?: undefined; basis?: undefined; confidence?: undefined };

export function planFromSetup(opts: { profile: Profile; races: Race[]; activities: Activity[]; today: Date }): SetupPlanOutcome {
  const { profile, races, activities } = opts;
  const bg = profile.background;
  const start = profile.schedule?.startDate && parseYmd(profile.schedule.startDate) > opts.today ? parseYmd(profile.schedule.startDate) : opts.today;
  const beginner = !bg || bg.level === 'new' || (bg.level === 'returning' && !bg.canRun10);
  let result: SetupPlanResult;

  if (beginner || (bg?.level === 'returning' && !activities.length)) {
    const canRun10 = !!bg?.canRun10;
    const plan = buildStarterPlan({ today: start, profile, canRun10, walksRegularly: bg?.walksRegularly ?? true });
    const why = bg?.level === 'returning'
      ? `You are returning after a break, so the plan restarts gently with run/walk${canRun10 ? ' at the point where you can already run 10 minutes' : ''}, three days a week with rest days between.`
      : `You are new to running, so the plan uses short run/walk intervals three days a week with full rest days between, building to 30 minutes of running.`;
    result = { plan, basis: `${why} Sessions are set by effort, not pace, until Ritmo has enough of your runs to estimate it.`, confidence: 'none' };
  } else {
    const hr = hrSetup(profile, activities, start);
    const measured = estimateFitness(activities, hr, start);
    const race = bg?.recentRace && bg.recentRace !== 'unknown' ? bg.recentRace : undefined;
    let vdot: number, confidence: 'measured' | 'estimated', source: string;
    if (measured && measured.confidence !== 'low') { vdot = measured.vdot; confidence = 'measured'; source = `based on ${measured.basedOn}`; }
    else if (race) { vdot = vdotFromPerformance(race.distanceM, race.timeS); confidence = 'estimated'; source = `estimated from your ${distanceLabel(race.distanceM)} time of ${duration(race.timeS)}`; }
    else { vdot = vdotFromWeeklyKm(bg?.weeklyKm ?? 15); confidence = 'estimated'; source = `estimated from your typical ${bg?.weeklyKm ?? 15} km a week, so treat pace targets as a starting point`; }
    const recent = activities.filter((a) => { const d = daysBetween(new Date(a.startTime), start); return d >= 0 && d < 28; });
    const recentWeeklyKm = recent.length ? recent.reduce((x, a) => x + a.distanceM, 0) / 4000 : bg?.weeklyKm ?? 15;
    const longest = activities.filter((a) => { const d = daysBetween(new Date(a.startTime), start); return d >= 0 && d < 42; }).reduce((m, a) => Math.max(m, a.distanceM / 1000), 0) || bg?.longestRecentKm || 8;
    const aRace = races.filter((r) => r.date >= ymd(start)).sort((a, b) => a.priority.localeCompare(b.priority) || a.date.localeCompare(b.date))[0];
    const res = generatePlan({ today: start, profile, race: aRace, paces: trainingPaces(vdot), recentWeeklyKm, longestRecentKm: longest });
    if (!res.ok) return { problem: res.problem };
    const plan = res.plan;
    result = { plan, basis: `${plan.changes[0].summary} Paces are ${source}.${res.warnings.length ? ` ${res.warnings.join(' ')}` : ''}`, confidence };
  }
  // Known time off becomes rest
  const off = profile.schedule?.timeOff ?? [];
  if (off.length) {
    let n = 0;
    for (const s of result.plan.sessions) {
      if (s.type !== 'rest' && off.some((o) => s.date >= o.from && s.date <= o.to)) {
        Object.assign(s, { type: 'rest', title: 'Time off', focus: 'Recovery', purpose: 'You told Ritmo you are away or busy, so nothing is planned.', howItHelps: 'Rest is part of training.', steps: [{ label: 'Time off', detail: 'Enjoy it. A walk is always fine.' }], distanceM: 0, durationS: 0, paceTarget: undefined, hrZones: undefined });
        n++;
      }
    }
    if (n) result.basis += ` ${n} session${n > 1 ? 's' : ''} during your time off ${n > 1 ? 'are' : 'is'} rest.`;
  }
  result.plan.basis = result.basis;
  result.plan.paceConfidence = result.confidence;
  return result;
}

/** Fill running background from imported runs, so setup does not ask for what is already known. */
export function backgroundFromRuns(activities: Activity[], today: Date): { weeklyKm: number; longestRecentKm: number } | undefined {
  const last8 = activities.filter((a) => { const d = daysBetween(new Date(a.startTime), today); return d >= 0 && d < 56; });
  if (last8.length < 3) return undefined;
  return {
    weeklyKm: Math.round(last8.reduce((x, a) => x + a.distanceM, 0) / 8000),
    longestRecentKm: Math.round(last8.reduce((m, a) => Math.max(m, a.distanceM), 0) / 1000),
  };
}
