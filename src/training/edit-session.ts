// Change what Ritmo gives you, for running sessions (update 3, §8). The runner can change a session's distance or
// time, its type within the easy family (Easy, Easy + strides, Recovery) and its target pace. The change applies to
// that day only: no other day is cut to make up for it. The original is kept for "Reset to plan", and every edit is
// logged in Plan changes. Run feedback then judges the run against the edited session.
import type { Plan, PlannedSession } from '../lib/types';
import { addDays, longDate, parseYmd, startOfWeek, ymd } from '../lib/format';
import { easyRun } from './generator';
import type { TrainingPaces } from './fitness';
import { fitSteps } from './session-view';

export type EasyKind = 'easy' | 'strides' | 'recovery';
export interface SessionEdit { distanceM?: number; durationS?: number; kind?: EasyKind; pace?: [number, number] }
/** What the session was before the runner edited it */
export type Original = Pick<PlannedSession, 'type' | 'title' | 'distanceM' | 'durationS' | 'steps' | 'paceTarget' | 'purpose' | 'focus' | 'hrZones'>;

export const EASY_FAMILY = ['easy', 'recovery'];
export const easyKind = (s: PlannedSession): EasyKind => (s.type === 'recovery' ? 'recovery' : s.steps.some((x) => x.kind === 'strides') ? 'strides' : 'easy');
const KIND_TITLE: Record<EasyKind, string> = { easy: 'Easy run', strides: 'Easy run with strides', recovery: 'Recovery run' };
const dayName = (d: string) => longDate(parseYmd(d)).split(' ')[0];
const r1 = (x: number) => Math.round(x * 10) / 10;

/** The session with the edit applied (a new object), and how it reads in Plan changes */
export function applyEdit(s: PlannedSession, e: SessionEdit, paces: TrainingPaces): { session: PlannedSession; summary: string } {
  const original: Original = s.edited?.original ?? { type: s.type, title: s.title, distanceM: s.distanceM, durationS: s.durationS, steps: s.steps, paceTarget: s.paceTarget, purpose: s.purpose, focus: s.focus, hrZones: s.hrZones };
  let next: PlannedSession = { ...s };
  const easy = EASY_FAMILY.includes(s.type);
  const km = e.distanceM != null ? e.distanceM / 1000 : s.distanceM / 1000;
  if (easy && (e.kind || e.distanceM != null)) {
    // Easy family: built again from the same rules, so steps, time and pace all match
    const kind = e.kind ?? easyKind(s);
    const built = easyRun(s.date, km, s.phase, { paces }, { strides: kind === 'strides', recovery: kind === 'recovery', title: KIND_TITLE[kind], why: s.purpose });
    next = { ...next, type: built.type, title: built.title, focus: built.focus, steps: built.steps, distanceM: built.distanceM, durationS: built.durationS, paceTarget: built.paceTarget, hrZones: built.hrZones };
  } else if (e.distanceM != null && s.distanceM > 0) {
    // A hard session: the reps stay; warm-up, cool-down and steady parts take the change
    const f = e.distanceM / s.distanceM;
    next = fitSteps({ ...next, distanceM: Math.round(e.distanceM), durationS: Math.round(s.durationS * f) });
    next = { ...next, durationS: next.steps.reduce((a, x) => a + (x.durationS ?? 0), 0) || next.durationS };
  }
  if (e.durationS != null && s.distanceM === 0) next = { ...next, durationS: Math.round(e.durationS) };
  if (e.pace) next = { ...next, paceTarget: { minSPerKm: Math.round(e.pace[0]), maxSPerKm: Math.round(e.pace[1]) } };
  // What changed, in words: "You changed Thursday to 10 km (+2 km)"
  const parts: string[] = [];
  const dKm = r1((next.distanceM - original.distanceM) / 1000);
  if (next.distanceM !== original.distanceM && original.distanceM > 0) parts.push(`${r1(next.distanceM / 1000)} km (${dKm > 0 ? '+' : ''}${dKm} km)`);
  if (s.distanceM === 0 && next.durationS !== original.durationS) parts.push(`${Math.round(next.durationS / 60)} min`);
  if (next.title !== original.title && easy) parts.push(next.title.toLowerCase());
  if (e.pace) parts.push(`a target pace of ${fmt(e.pace[0])}–${fmt(e.pace[1])}/km`);
  const summary = `You changed ${dayName(s.date)} (${longDate(parseYmd(s.date))}) to ${parts.join(', ') || 'your own version'}. Only that day changes; nothing else in your week is cut to make up for it.`;
  return { session: { ...next, edited: { at: new Date().toISOString(), original } }, summary };
}

/** The session back as the plan had it */
export function resetEdit(s: PlannedSession): PlannedSession {
  if (!s.edited) return s;
  const { edited, ...rest } = s;
  return { ...rest, ...edited.original };
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** A note when a chosen pace is outside the session's zone */
export function paceNote(s: PlannedSession, pace: [number, number], paces: TrainingPaces): string | undefined {
  const band = EASY_FAMILY.includes(s.type) || s.type === 'long' ? paces.easy : s.type === 'threshold' ? paces.threshold : s.type === 'vo2max' ? paces.interval : s.type === 'tempo' ? [paces.threshold[1], paces.marathon[1]] as [number, number] : undefined;
  if (!band) return undefined;
  const name = EASY_FAMILY.includes(s.type) || s.type === 'long' ? 'easy' : s.type === 'threshold' ? 'threshold' : s.type === 'vo2max' ? 'interval' : 'tempo';
  if (pace[0] < band[0] - 5) return `Faster than your ${name} range (${fmt(band[0])}–${fmt(band[1])}/km): this makes the session harder than planned.`;
  if (pace[1] > band[1] + 15 && name !== 'easy') return `Slower than your ${name} range (${fmt(band[0])}–${fmt(band[1])}/km): it will train something easier.`;
  return undefined;
}

/** "Fine for your week, 92 of 100 km planned", or a gentle warning (biggest week, a hard session tomorrow). */
export function impactCheck(plan: Plan, edited: PlannedSession, o: { biggestWeekKm: number; targetKm?: number }): { ok: boolean; text: string } {
  const ws = ymd(startOfWeek(parseYmd(edited.date))), we = ymd(addDays(startOfWeek(parseYmd(edited.date)), 6));
  const week = plan.sessions.filter((s) => s.date >= ws && s.date <= we).map((s) => (s.id === edited.id ? edited : s));
  const km = Math.round(week.reduce((a, s) => a + s.distanceM + (s.second?.distanceM ?? 0), 0) / 1000);
  const target = Math.round(o.targetKm ?? km);
  const before = plan.sessions.find((s) => s.id === edited.id);
  const more = !!before && edited.distanceM > before.distanceM;
  const tomorrow = plan.sessions.find((s) => s.date === ymd(addDays(parseYmd(edited.date), 1)));
  const hardTomorrow = !!tomorrow && ['threshold', 'vo2max', 'tempo', 'hills', 'long', 'race', 'timetrial'].includes(tomorrow.type);
  if (more && o.biggestWeekKm > 0 && km > o.biggestWeekKm * 1.05) return { ok: false, text: `This makes it your biggest week (${km} km; your biggest so far is ${Math.round(o.biggestWeekKm)} km). Fine if you feel good, but go easy on the extra.` };
  if (more && hardTomorrow) return { ok: false, text: `${tomorrow!.title} is tomorrow: a longer run today can leave your legs tired for it.` };
  return { ok: true, text: `Fine for your week, ${km} of ${target} km planned.` };
}
