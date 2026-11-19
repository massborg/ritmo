// A strength workout in progress (update 5, U6). It is written to the device from the moment it starts and on every
// change, so closing the tab, the phone killing the app, or going back never loses it. A copy goes to the account
// every 30 seconds, so it can be carried on from another device. It is only removed by Finish or Discard.
import type { Band, LoadType, SetLog } from './strength-load';
import type { Exercise } from './strength';
import { exById } from './strength';
import type { FreeWorkout } from '../components/StrengthBits';

export interface ActiveSet { reps?: number; load?: number; seconds?: number; effort?: number; done: boolean }
export interface ActiveItem { id: string; sets: number; reps?: number; seconds?: number; load?: number; note?: string }
export interface ActiveMeta { loadType: LoadType; band?: Band }
export interface ActiveWorkout {
  /** Which workout: a planned session's id, 'free:w' (your own), or 'free:A' (a routine) */
  key: string;
  /** Where to carry it on */
  route: string;
  title: string; source: 'plan' | 'free' | 'template';
  sessionId?: string; templateId?: string;
  /** Your own workout as it was started, so it can be reopened after the tab is closed */
  free?: FreeWorkout;
  startedAt: number; idx: number; items: ActiveItem[]; sets: ActiveSet[][]; meta: ActiveMeta[]; notes: string;
  /** When the rest in progress ends (a moment in time, so it is right after the screen was off) */
  restEndsAt?: number;
  updatedAt: number;
}

const KEY = (uid: string) => `ritmo:workout:active:${uid}`;
export const WORKOUT_EVENT = 'ritmo:workout';
const tell = () => { try { window.dispatchEvent(new Event(WORKOUT_EVENT)); } catch { /* */ } };

const valid = (a: ActiveWorkout | null | undefined): a is ActiveWorkout => !!a && !!a.key && Array.isArray(a.items) && a.items.length > 0 && a.items.length === a.sets?.length && a.items.length === a.meta?.length;
export function loadActive(uid: string): ActiveWorkout | undefined {
  try { const a = JSON.parse(localStorage.getItem(KEY(uid)) ?? 'null') as ActiveWorkout | null; return valid(a) ? a : undefined; } catch { return undefined; }
}
export function saveActive(uid: string, a: ActiveWorkout): void {
  try { localStorage.setItem(KEY(uid), JSON.stringify(a)); tell(); } catch { /* storage may be off: the workout is then only on screen */ }
}
export function clearActive(uid: string): void {
  try { localStorage.removeItem(KEY(uid)); tell(); } catch { /* */ }
}
/** The newer of the copy on this device and the copy in the account (started on another device) */
export function currentActive(uid: string, fromAccount: ActiveWorkout | undefined): ActiveWorkout | undefined {
  const here = loadActive(uid), there = valid(fromAccount) ? fromAccount : undefined;
  if (!here) return there;
  return there && there.key === here.key && there.updatedAt > here.updatedAt ? there : here;
}

export const doneSets = (a: Pick<ActiveWorkout, 'sets'>) => a.sets.reduce((n, s) => n + s.filter((x) => x.done).length, 0);
export const totalSets = (a: Pick<ActiveWorkout, 'sets'>) => a.sets.reduce((n, s) => n + s.length, 0);
/** Left for more than 12 hours: not carried on silently, the athlete is asked whether to save what was done */
export const STALE_MS = 12 * 3600 * 1000;
export const isStale = (a: ActiveWorkout, now = Date.now()) => now - a.updatedAt > STALE_MS;

/** One recorded set as it goes into the log */
export function asLog(x: ActiveSet, m: ActiveMeta, ex: Pick<Exercise, 'equipment' | 'perSide' | 'unit'>): SetLog {
  const kg = m.loadType === 'added' || m.loadType === 'bodyweight_plus';
  return { reps: x.reps, unit: ex.unit, seconds: x.seconds, load: kg && x.load ? x.load : undefined, loadType: kg && !x.load && ex.equipment === 'none' ? 'bodyweight' : m.loadType, band: m.loadType === 'band' ? m.band ?? 'medium' : undefined, perSide: ex.perSide || undefined, effort: x.effort };
}
/** What was done so far, as the exercises of a log entry (only sets ticked as done) */
export function loggedOf(a: ActiveWorkout): { id: string; name: string; planned: number; sets: SetLog[] }[] {
  return a.items.map((x, i) => { const ex = exById.get(x.id); return ex ? { id: x.id, name: ex.name, planned: a.sets[i].length, sets: a.sets[i].filter((y) => y.done).map((y) => asLog(y, a.meta[i], ex)) } : undefined; })
    .filter((x): x is { id: string; name: string; planned: number; sets: SetLog[] } => !!x && x.sets.length > 0);
}
/** How long it took: to now while it is fresh, to the last change once it has been left (a workout abandoned at
 *  set 7 on Tuesday did not last until Thursday) */
export const minutesOf = (a: ActiveWorkout, now = Date.now()) => Math.max(1, Math.round(((isStale(a, now) ? a.updatedAt : now) - a.startedAt) / 60000));
