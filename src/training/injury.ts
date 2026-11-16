// An injury, from the first report to "healed" (update 4, task 2b). General guidance and load management only:
// Ritmo never diagnoses or treats (see body.ts for red flags, which come first and pause running).
//
// Day 1: the full report picks the starting return-to-run step. From day 2: a 20-second check-in compared with
// yesterday. The rules, in one place:
// - 2 clear check-ins in a row (yesterday's run at pain 2 or less, and this morning not worse) unlock the next step
// - a bad check-in (run pain above 2, or worse this morning) keeps the step; two in a row go back one step
// - every 3rd day a quick test (hops, or calf raises for calf and Achilles)
// - 5 days at pain 0–1 with a passed test: Ritmo suggests "Feels healed?"
// - "It feels healed" is always there: ease back in over 10 days (about 70%, no hard sessions for 4 days) or go
//   straight back to the plan. The injury moves to history; "It's back" within 30 days resumes at the last step.
import type { BodyArea } from './body';
import { addDays, parseYmd, ymd } from '../lib/format';

export type RunBehaviour = 'eases' | 'same' | 'worse' | 'untried';
export const RUN_BEHAVIOUR: Record<RunBehaviour, string> = { eases: 'Eases as I warm up', same: 'Stays the same', worse: 'Gets worse', untried: "Haven't tried" };

export interface InjuryDay {
  date: string;
  /** Pain this morning, 0–10 */
  pain: number;
  vs?: 'better' | 'same' | 'worse';
  /** Yesterday's step session: pain 2 or less, above 2, or no run */
  run?: 'ok' | 'high' | 'none';
  /** The quick test, on the days it is asked */
  test?: 'pass' | 'fail';
}
export interface Injury {
  id: string; area: BodyArea; side?: 'left' | 'right';
  startedAt: string; onset: 'sudden' | 'gradual';
  /** From the first report */
  running: RunBehaviour; seenPhysio?: boolean;
  /** One entry per day, the first from the report */
  days: InjuryDay[];
  /** The return-to-run step (1–6), and the day it was reached */
  step: number; stepSince: string;
  /** Set when this injury came back ("It's back") */
  reopenedAt?: string;
}
export interface PastInjury {
  id: string; area: BodyArea; side?: 'left' | 'right'; startedAt: string; endedAt: string;
  /** Morning pain, day by day */
  pains: number[];
  /** The last return-to-run step reached: where "It's back" resumes */
  lastStep: number;
  onset: 'sudden' | 'gradual'; running: RunBehaviour;
  how: 'ease' | 'straight';
}
/** Coming back after "It feels healed · Ease back in" */
export interface EaseBack { from: string; until: string; noHardUntil: string; label: string }

export const EASE_DAYS = 10, EASE_NO_HARD_DAYS = 4, EASE_SCALE = 0.7, REOPEN_DAYS = 30, LAST_STEP = 6;

const where = (x: Pick<Injury, 'area' | 'side'>) => `${x.side ? `${x.side} ` : ''}${x.area.toLowerCase()}`;
export const injuryLabel = where;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The step a new injury starts at: the milder the first report, the further along */
export function startingStep(o: { pain: number; running: RunBehaviour }): number {
  if (o.pain <= 1 && o.running === 'eases') return 3;
  if (o.pain <= 2 && (o.running === 'eases' || o.running === 'same')) return 2;
  return 1;
}

/**
 * "Update details (wrong place or type?)": the facts of the current injury are corrected in place. It is the same
 * injury, so its days, step and start date stay, and nothing is filed as healed.
 */
export function correctDetails(inj: Injury, fix: { area: BodyArea; side?: 'left' | 'right'; onset: 'sudden' | 'gradual'; running: RunBehaviour; seenPhysio?: boolean }): Injury {
  return { ...inj, area: fix.area, side: fix.side, onset: fix.onset, running: fix.running, seenPhysio: fix.seenPhysio ?? inj.seenPhysio };
}

/** Which day of the injury a date is (the report is day 1) */
export const dayNumber = (inj: Pick<Injury, 'startedAt'>, date: string) => Math.round((parseYmd(date).getTime() - parseYmd(inj.startedAt).getTime()) / 86400000) + 1;

/** The quick test for an area, asked every 3rd day */
export function testFor(area: BodyArea): string | undefined {
  if (area === 'Calf' || area === 'Achilles') return '15 single-leg calf raises';
  if (['Foot', 'Ankle', 'Shin', 'Knee'].includes(area)) return '10 single-leg hops';
  return undefined;
}
export const testDue = (inj: Injury, date: string) => !!testFor(inj.area) && dayNumber(inj, date) >= 3 && dayNumber(inj, date) % 3 === 0;

const clear = (d: InjuryDay) => d.run === 'ok' && d.vs !== 'worse' && d.pain <= 2;
const bad = (d: InjuryDay) => d.run === 'high' || d.vs === 'worse' || d.pain > 2 && d.run !== undefined;

export interface CheckResult { injury: Injury; change: 'up' | 'stay' | 'back' | 'none'; clearDays: number; offerHealed: boolean; message: string }

/** Add a day's check-in and apply the progression rules. Days with no run neither count nor reset. */
export function checkIn(inj: Injury, day: InjuryDay): CheckResult {
  const days = [...inj.days.filter((d) => d.date !== day.date), day].sort((a, b) => a.date.localeCompare(b.date));
  // Check-ins since this step was reached, leaving out days without a run
  const since = days.filter((d) => d.date > inj.stepSince && d.run !== 'none' && d.run !== undefined);
  let clearDays = 0;
  for (let i = since.length - 1; i >= 0 && clear(since[i]); i--) clearDays++;
  let badDays = 0;
  for (let i = since.length - 1; i >= 0 && bad(since[i]); i--) badDays++;
  let step = inj.step, stepSince = inj.stepSince, change: CheckResult['change'] = 'none', message: string;
  if (clearDays >= 2 && step < LAST_STEP) {
    step++; stepSince = day.date; change = 'up';
    message = `Step ${step} unlocked: 2 days clear. Ritmo moves today's session to match.`;
  } else if (clearDays >= 2) {
    change = 'stay';
    message = 'The last step is done. If it feels healed, tap "It feels healed" to go back to your plan.';
  } else if (badDays >= 2 && step > 1) {
    step--; stepSince = day.date; change = 'back';
    message = `Two check-ins in a row with pain: back to step ${step} for now. That is normal, and it protects the ${where(inj)}.`;
  } else if (badDays >= 1) {
    change = 'stay';
    message = `Stay on step ${step} for now. If it is the same or worse tomorrow, Ritmo goes back one step.`;
  } else if (clearDays === 1) {
    change = 'stay';
    message = `1 day clear. One more like this unlocks step ${Math.min(LAST_STEP, step + 1)}.`;
  } else message = day.run === 'none' || day.run === undefined ? `No run yesterday, so step ${step} stays. Saved for the trend.` : `Step ${step} stays for now.`;
  // 5 days at 0–1 with a passed test (or no test for this area): suggest "Feels healed?"
  const last5 = days.slice(-5);
  const calm = last5.length >= 5 && last5.every((d) => d.pain <= 1);
  const tested = !testFor(inj.area) || days.some((d) => d.test === 'pass' && d.date >= last5[0]?.date);
  const offerHealed = calm && tested && !days.slice(-5).some((d) => d.test === 'fail');
  return { injury: { ...inj, days, step, stepSince }, change, clearDays: change === 'up' ? 2 : clearDays, offerHealed, message };
}

/** Whether Ritmo suggests "Feels healed?" now */
export function feelsHealed(inj: Injury): boolean {
  const last5 = inj.days.slice(-5);
  if (last5.length < 5 || !last5.every((d) => d.pain <= 1) || last5.some((d) => d.test === 'fail')) return false;
  return !testFor(inj.area) || last5.some((d) => d.test === 'pass');
}

/** The pain trend for the chart: the last 5 days */
export const painTrend = (inj: Pick<Injury, 'days'>) => inj.days.slice(-5).map((d) => ({ date: d.date, pain: d.pain }));
export function trendWord(inj: Pick<Injury, 'days'>): 'Getting better' | 'About the same' | 'Getting worse' {
  const p = inj.days.slice(-5).map((d) => d.pain);
  if (p.length < 2) return 'About the same';
  const d = p[p.length - 1] - p[0];
  return d < 0 ? 'Getting better' : d > 0 ? 'Getting worse' : 'About the same';
}

/** "It feels healed": the injury moves to history, and (for "ease back in") the next 10 days are lighter */
export function heal(inj: Injury, how: 'ease' | 'straight', today: Date): { past: PastInjury; easeBack?: EaseBack; change: string } {
  const t = ymd(today);
  const past: PastInjury = { id: inj.id, area: inj.area, side: inj.side, startedAt: inj.startedAt, endedAt: t, pains: inj.days.map((d) => d.pain), lastStep: inj.step, onset: inj.onset, running: inj.running, how };
  const on = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const name = cap(where(inj));
  if (how === 'straight') return { past, change: `${name} marked healed on ${on}. Your plan is rebuilt from today.` };
  const easeBack: EaseBack = { from: t, until: ymd(addDays(today, EASE_DAYS - 1)), noHardUntil: ymd(addDays(today, EASE_NO_HARD_DAYS - 1)), label: where(inj) };
  return { past, easeBack, change: `${name} marked healed on ${on}, easing back in over ${EASE_DAYS} days: about ${Math.round(EASE_SCALE * 100)}% of the planned distance, with no intervals or hills for the first ${EASE_NO_HARD_DAYS} days.` };
}

/** "It's back" is offered for 30 days after an injury was marked healed */
export const canReopen = (p: PastInjury, today: Date) => (today.getTime() - parseYmd(p.endedAt).getTime()) / 86400000 <= REOPEN_DAYS;
/** The same injury again, at the last step reached (not step 1) */
export function reopen(p: PastInjury, pain: number, today: Date): Injury {
  const t = ymd(today);
  return { id: p.id, area: p.area, side: p.side, startedAt: t, onset: p.onset, running: p.running, days: [{ date: t, pain }], step: Math.max(1, Math.min(LAST_STEP, p.lastStep)), stepSince: t, reopenedAt: t };
}
