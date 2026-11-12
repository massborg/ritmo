// Strength to help with an injury (update 3, §10). A care plan for one area, in three stages: calm it down, build,
// return to full training. The exercises live in public/care/care-plans.json, so a physiotherapist can review and
// edit them without code changes. Each morning (and after the exercises) a pain check decides the next step:
// 0–2 move forward (once the stage's minimum days are done), 3–5 stay at this stage, 6+ step back and rest the area.
// The same check is a Body check-in, so running follows the one rule set (update 3, §1.5).
// Guidance, not a diagnosis: see a physio if pain is sharp, getting worse, makes you limp or lasts over 2 weeks.

export type CareArea = 'foot' | 'ankle' | 'achilles' | 'calf' | 'shin' | 'knee' | 'itband-hip' | 'hamstring' | 'lower-back';
export interface CareExercise { name: string; dose: string; frequency: string; cues: string[] }
export interface CarePlans {
  version: string; reviewed: boolean; note: string;
  stages: { name: string; goal: string; minDays: number }[];
  areas: Record<CareArea, { label: string; avoid: string; stages: CareExercise[][] }>;
}
export interface CareCheck { date: string; morning: number; during?: number; sharp?: boolean; limping?: boolean }
export interface CareState {
  area: CareArea; side?: 'left' | 'right'; stage: number; startedAt: string; stageSince: string;
  checks: CareCheck[];
  /** Days the exercises were done (YYYY-MM-DD) */
  done: string[];
  /** A physio's own programme, scheduled and tracked instead of Ritmo's exercises */
  physio?: CareExercise[];
}

/** Which care plan suits a niggle area (Body check-in or run feedback) */
export function careAreaFor(area: string): CareArea | undefined {
  const a = area.toLowerCase();
  if (/plantar|foot|heel|arch/.test(a)) return 'foot';
  if (/achilles/.test(a)) return 'achilles';
  if (/ankle/.test(a)) return 'ankle';
  if (/calf/.test(a)) return 'calf';
  if (/shin/.test(a)) return 'shin';
  if (/knee|quad/.test(a)) return 'knee';
  if (/it band|itb|hip|glute/.test(a)) return 'itband-hip';
  if (/hamstring/.test(a)) return 'hamstring';
  if (/back/.test(a)) return 'lower-back';
  return undefined;
}

export type CareStep = 'forward' | 'stay' | 'back';
/** The pain rule: 0–2 move forward, 3–5 stay, 6+ step back and rest that area */
export const careStep = (pain: number): CareStep => (pain >= 6 ? 'back' : pain >= 3 ? 'stay' : 'forward');
const days = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);

/**
 * A pain check: the worse of this morning and during yesterday's exercises decides. Moving forward also needs the
 * stage's minimum days. Returns the new state and what it means, in words.
 */
export function applyCheck(c: CareState, check: CareCheck, plans: Pick<CarePlans, 'stages'>): { state: CareState; step: CareStep; message: string } {
  const pain = Math.max(check.morning, check.during ?? 0);
  const step = careStep(pain);
  const checks = [...c.checks.filter((x) => x.date !== check.date), check].sort((a, b) => a.date.localeCompare(b.date));
  const last = plans.stages.length - 1;
  const inStage = days(c.stageSince, check.date);
  const min = plans.stages[c.stage]?.minDays ?? 3;
  let stage = c.stage, stageSince = c.stageSince, message: string;
  if (step === 'back') {
    stage = Math.max(0, c.stage - 1); stageSince = check.date;
    message = `Pain ${pain}/10: step back${c.stage > 0 ? ` to "${plans.stages[stage].name}"` : ''} and rest that area today. Running is replaced with rest; see a physio if it stays this high.`;
  } else if (step === 'stay') {
    message = `Pain ${pain}/10: stay at "${plans.stages[c.stage].name}" for now. Keep the exercises gentle.`;
  } else if (c.stage < last && inStage >= min) {
    stage = c.stage + 1; stageSince = check.date;
    message = `Pain ${pain}/10: move forward to "${plans.stages[stage].name}".`;
  } else if (c.stage < last) {
    message = `Pain ${pain}/10: good. ${min - inStage} more day${min - inStage === 1 ? '' : 's'} at "${plans.stages[c.stage].name}" before moving on.`;
  } else message = `Pain ${pain}/10: you're at the last stage. Keep going, and back to full training as it stays low.`;
  return { state: { ...c, checks, stage, stageSince }, step, message };
}

/** When to advise a physio: sharp pain, getting worse, limping, or over 2 weeks */
export function physioAdvice(c: CareState, today: string): string | undefined {
  const last = c.checks[c.checks.length - 1];
  const worse = c.checks.length >= 3 && c.checks.slice(-3).every((x, i, a) => i === 0 || Math.max(x.morning, x.during ?? 0) > Math.max(a[i - 1].morning, a[i - 1].during ?? 0));
  if (last?.limping) return 'You said it makes you limp. Please see a physio before running on it.';
  if (last?.sharp) return 'Sharp pain is a reason to see a physio before you go on.';
  if (worse) return 'It has been getting worse for three checks in a row. Please see a physio.';
  if (days(c.startedAt, today) > 14) return 'It has been more than 2 weeks. If it is not clearly better, please see a physio.';
  return undefined;
}

export const CARE_DISCLAIMER = 'Guidance, not a diagnosis. Ritmo suggests general exercises many runners use; it does not treat injuries.';
export const URGENT = 'Chest pain, dizziness or fainting: stop all exercise now. If it is severe or happening now, call your local emergency number; otherwise see a doctor before you exercise again.';

let cache: Promise<CarePlans> | undefined;
/** The care plans, from the data file (fetched once) */
export function loadCarePlans(): Promise<CarePlans> {
  if (!cache) cache = fetch('/care/care-plans.json').then((r) => { if (!r.ok) throw new Error(`care plans (${r.status})`); return r.json() as Promise<CarePlans>; }).catch((e) => { cache = undefined; throw e; });
  return cache;
}
