// One planned session, one truth (update 3, §1.1). Every screen that shows a planned session (Training, the Run screen,
// the session page, the Coach, reminders and run feedback) formats it with these helpers, from the same adapted plan, so
// the distance and the structure line can never disagree.
import type { Plan, PlannedSession, SessionStep } from '../lib/types';
import type { Units } from '../lib/format';

const MI = 1609.344;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** A planned distance as one number for display: one decimal, without a trailing ".0" (5.5, 6, 12.4). */
export const plannedNum = (m: number, u: Units) => r1(u === 'mi' ? m / MI : m / 1000);

/** "5.5 km", "6 km", or "40 min" for a session planned by time. Empty for rest. */
export function sessionAmount(s: Pick<PlannedSession, 'distanceM' | 'durationS'>, u: Units): string {
  if (s.distanceM > 0) return `${plannedNum(s.distanceM, u)} ${u}`;
  if (s.durationS > 0) return `${Math.round(s.durationS / 60)} min`;
  return '';
}

/** The structure line ("Warm up · 6 x 800 m · Cool down"), from the same steps the distance comes from. */
export const structureLine = (s: Pick<PlannedSession, 'steps'>) => s.steps.map((x) => x.label).join(' · ');

const FLEX: (SessionStep['kind'] | undefined)[] = ['easy', 'warmup', 'cooldown', 'steady'];
/** The part of a session that cannot be scaled: reps, strides, hills (everything that is not easy, warm-up, cool-down or steady), in km */
export const repsKm = (s: Pick<PlannedSession, 'steps'>) => s.steps.filter((x) => !FLEX.includes(x.kind)).reduce((a, x) => a + (x.km ?? 0), 0);
const KM_AT_START = /^(last )?(\d+(?:\.\d+)?) km\b/;
/** A step's label or detail with its leading distance rewritten: "2 km easy" and "last 4 km steady" take the new km */
export const relabelKm = (text: string, km: number) => text.replace(KM_AT_START, (_, last) => `${last ?? ''}${r1(km)} km`);
const relabel = relabelKm;

/**
 * Bring a session's steps back in line with its distance after the plan was adapted (a lighter week, a pain check-in,
 * travel mode). The reps stay as planned; warm-up, cool-down, easy and steady parts are scaled, and any "9.2 km easy"
 * label or detail is rewritten with the new number. Sessions that already add up are returned unchanged.
 */
export function fitSteps(s: PlannedSession): PlannedSession {
  const withKm = s.steps.filter((x) => (x.km ?? 0) > 0);
  if (!withKm.length || s.distanceM <= 0) return s;
  const target = s.distanceM / 1000;
  const sum = withKm.reduce((a, x) => a + (x.km ?? 0), 0);
  if (Math.abs(sum - target) < 0.15) return s;
  const flexSum = withKm.filter((x) => FLEX.includes(x.kind)).reduce((a, x) => a + (x.km ?? 0), 0);
  const fixed = sum - flexSum;
  // Scale only the flexible parts when that is enough; otherwise everything (a session cut far below its reps)
  const onlyFlex = flexSum > 0 && target - fixed >= 0.5;
  const f = onlyFlex ? (target - fixed) / flexSum : target / sum;
  const steps = s.steps.map((x) => {
    if (!x.km || (onlyFlex && !FLEX.includes(x.kind))) return x;
    const km = r1(x.km * f);
    return { ...x, km, durationS: x.durationS ? Math.round(x.durationS * f) : x.durationS, label: relabel(x.label, km), detail: relabel(x.detail, km) };
  });
  return { ...s, steps };
}

/** The plan with every session's steps matching its distance. */
export function fitPlan(p: Plan): Plan {
  const sessions = p.sessions.map(fitSteps);
  return sessions.some((s, i) => s !== p.sessions[i]) ? { ...p, sessions } : p;
}

/** Cross-training days are rest days in the plan with a cross-training title */
export const isCrossTraining = (s: Pick<PlannedSession, 'type' | 'title'>) => s.type === 'rest' && /cross-training/i.test(s.title);

const REASON: Record<string, string> = {
  pain: 'of your niggle', illness: 'you were ill', missed: 'of missed sessions', easier: 'you asked for an easier week',
  harder: 'you asked for a harder week', 'race-date': 'your race date changed', moved: 'sessions were moved', rebuilt: 'your plan was rebuilt', paces: 'your paces changed', edited: 'you changed a session',
};

export interface WeekTarget {
  /** This week's target now: the adapted plan's sessions added up, in metres */
  m: number;
  /** The target the plan was built with, in metres */
  originalM: number;
  /** Set when the target is lower than planned, with when and why */
  lowered?: { at: string; because: string; changeId?: string; /** Lowered while coming back from an injury (a return-to-run step or care plan) */ returning?: boolean };
}

/**
 * This week's target, the one Training, the Coach and Plan changes all use: the adapted sessions of the week added up.
 * When that is clearly lower than the plan was built with, the latest plan change says when and why.
 * `painLabel` names the niggle ("right ankle") for pain changes.
 */
export function weekTarget(adapted: Plan | undefined, stored: Plan | undefined, weekStart: string, weekEnd: string, painLabel?: string, returning = false): WeekTarget {
  const inWeek = (p?: Plan) => (p?.sessions ?? []).filter((s) => s.date >= weekStart && s.date <= weekEnd);
  const m = inWeek(adapted).reduce((a, s) => a + s.distanceM, 0);
  // What was planned for the days of this week the plan covers (a plan that starts mid-week isn't "lowered")
  const storedM = inWeek(stored).reduce((a, s) => a + s.distanceM, 0);
  const built = adapted?.weeks?.find((w) => w.start === weekStart)?.targetKm;
  const originalM = storedM || (built ? built * 1000 : 0);
  if (!(originalM > 0 && m < originalM * 0.9 && originalM - m >= 2000)) return { m, originalM };
  const ch = [...(adapted?.changes ?? [])].filter((c) => c.reason !== 'moved').sort((a, b) => b.at.localeCompare(a.at))[0];
  const because = ch ? (ch.reason === 'pain' && painLabel ? `of your ${painLabel.toLowerCase()}` : REASON[ch.reason] ?? 'of a plan change') : 'of a plan change';
  return { m, originalM, lowered: { at: ch?.at ?? new Date().toISOString(), because, changeId: ch?.id, returning: returning || undefined } };
}

/** "7.1 of 22 km" (or "20 of 45 min" for sessions set by time): how much of a partly done session was covered */
export function partlyDone(s: Pick<PlannedSession, 'distanceM' | 'durationS' | 'partial'>, u: Units): { text: string; ratio: number } | undefined {
  if (!s.partial) return undefined;
  if (s.distanceM > 0) return { text: `${plannedNum(s.partial.doneM, u)} of ${plannedNum(s.distanceM, u)} ${u}`, ratio: Math.min(1, s.partial.doneM / s.distanceM) };
  return { text: `${Math.round(s.partial.doneS / 60)} of ${Math.round(s.durationS / 60)} min`, ratio: s.durationS ? Math.min(1, s.partial.doneS / s.durationS) : 0 };
}

/** "25 km (reduced from 93 km while returning)": the one wording for a week lowered by an injury (update 4) */
export const reducedLine = (wt: WeekTarget, u: Units) => `${plannedNum(wt.m, u)} ${u} (reduced from ${plannedNum(wt.originalM, u)} ${u} while returning)`;
