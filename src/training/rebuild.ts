// Rebuilding a plan from Goals and training (update 2, §4). The rules:
// - The past is read-only: sessions before the new start keep their status, links and swaps.
// - "Today" starts the new plan today, or tomorrow if a run is already done today (today's session is kept).
// - "Next Monday" keeps this week's existing sessions until Sunday and starts the new plan on Monday.
// - A rebuild never triggers the automatic load adjustments for the current week.
// - The previous plan is kept for 24 hours so the runner can restore it.
import type { Activity, Plan, PlannedSession } from '../lib/types';
import { addDays, parseYmd, startOfWeek, weekday, ymd } from '../lib/format';

export const RESTORE_HOURS = 24;

export interface RebuildSummary {
  at: string;
  weeks: number;
  /** First full week's planned volume and the peak week, in km */
  firstWeekKm: number;
  peakKm: number;
  startDate: string;
  /** This week's key sessions (long run and quality), in order */
  keyThisWeek: { date: string; title: string; km: number }[];
  /** How the days from the new start compare with the old plan */
  changed: number;
  unchanged: number;
  /** Plain sentences, e.g. why some days are empty */
  notes: string[];
}

export type RebuiltPlan = Plan;

const KEY = ['long', 'threshold', 'vo2max', 'tempo', 'hills', 'speed', 'race', 'timetrial'];
const sameSession = (a: PlannedSession, b: PlannedSession) => a.type === b.type && Math.abs(a.distanceM - b.distanceM) < 300;
const nextMonday = (d: Date) => addDays(startOfWeek(d), 7);
const dayWord = (d: string) => parseYmd(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** Combine the freshly generated plan with what must not change in the old one. */
export function mergeRebuild(opts: { old?: Plan; fresh: Plan; today: Date; activities: Activity[]; startMode: 'today' | 'monday' | 'tomorrow'; why?: string }): RebuiltPlan {
  const { old, fresh, activities } = opts;
  const today = parseYmd(ymd(opts.today));
  const t = ymd(today);
  const ranToday = activities.some((a) => !a.hidden && a.startTime.slice(0, 10) === t);
  // Where the new sessions begin
  // "tomorrow": a changed week of the runner's own (update 3, §7) never touches today
  const start = opts.startMode === 'monday' && weekday(today) !== 0 ? ymd(nextMonday(today))
    : ranToday || opts.startMode === 'tomorrow' ? ymd(addDays(today, 1)) : t;
  const kept = (old?.sessions ?? []).filter((s) => s.date < start).map((s) => ({ ...s }));
  const added = fresh.sessions.filter((s) => s.date >= start);
  const sessions = [...kept, ...added].sort((a, b) => a.date.localeCompare(b.date));

  // Weeks: the old plan's targets before the new start, the new plan's after
  const startWeek = ymd(startOfWeek(parseYmd(start)));
  const weeks = [...(old?.weeks ?? []).filter((w) => w.start < startWeek), ...(fresh.weeks ?? []).filter((w) => w.start >= startWeek)];

  // Compare with the old plan from the new start on
  let changed = 0, unchanged = 0;
  for (const s of added) {
    const o = old?.sessions.find((x) => x.date === s.date);
    if (!o) { if (s.type !== 'rest') changed++; continue; }
    if (sameSession(o, s)) unchanged++; else changed++;
  }
  const notes: string[] = [];
  // Never leave planned days empty without saying so
  const emptyDays: string[] = [];
  for (let d = today; ymd(d) < start; d = addDays(d, 1)) if (!kept.some((s) => s.date === ymd(d))) emptyDays.push(ymd(d));
  if (emptyDays.length && opts.startMode === 'monday') notes.push(`Nothing was planned for ${emptyDays.length === 1 ? dayWord(emptyDays[0]) : `${emptyDays.length} days until ${dayWord(start)}`}, and that stays as it was: the new plan starts on Monday, as you chose. Easy running or rest until then.`);
  if (ranToday && opts.startMode === 'today') notes.push('You have already run today, so today stays linked to its original session and the new plan starts tomorrow.');
  if (opts.startMode === 'monday' && kept.some((s) => s.date >= t)) notes.push(`This week's sessions stay exactly as they were until Sunday.`);

  const wkEnd = ymd(addDays(startOfWeek(today), 6));
  const keyThisWeek = sessions.filter((s) => s.date >= t && s.date <= wkEnd && KEY.includes(s.type)).map((s) => ({ date: s.date, title: s.title, km: Math.round(s.distanceM / 100) / 10 }));
  const full = (fresh.weeks ?? []).filter((w) => w.start >= startWeek);
  const firstFull = full.find((w) => w.start >= ymd(startOfWeek(parseYmd(start))) && (fresh.sessions.filter((s) => s.date >= w.start && s.date <= ymd(addDays(parseYmd(w.start), 6))).length >= 3)) ?? full[0];
  const at = new Date().toISOString();
  const summary: RebuildSummary = {
    at, weeks: full.length, firstWeekKm: firstFull?.targetKm ?? 0, peakKm: Math.max(0, ...full.map((w) => w.targetKm)), startDate: start,
    keyThisWeek, changed, unchanged, notes,
  };
  const first = fresh.changes[0];
  const what = `${changed} session${changed === 1 ? '' : 's'} changed and ${unchanged} unchanged from ${dayWord(start)}.`;
  const logged = first ? { ...first, summary: `${opts.why ? `${opts.why} ` : ''}Rebuilt the plan from ${dayWord(start)}: ${what} Past sessions and your runs are unchanged. ${first.summary}` } : undefined;
  const { previous: _p, rebuild: _r, noAutoAdjustUntil: _n, ...oldClean } = (old ?? {}) as Plan; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    ...fresh,
    startDate: old && old.startDate < start ? old.startDate : fresh.startDate,
    sessions, weeks,
    changes: [...(old?.changes ?? []), ...(logged ? [logged] : [])],
    // No automatic load adjustments for the rest of this week: the runner just chose this plan
    noAutoAdjustUntil: ymd(nextMonday(today)),
    previous: old ? { at, plan: oldClean as Plan } : undefined,
    rebuild: summary,
  };
}

/** Whether "Restore previous plan" is still offered */
export const canRestore = (p: RebuiltPlan | undefined, now = new Date()) => !!p?.previous && now.getTime() - new Date(p.previous.at).getTime() < RESTORE_HOURS * 3600e3;

/** The planned volume of a week: the sum of its sessions. Training, Coach and Plan changes all use this one number. */
export function weekTargetM(plan: Plan | undefined, weekStart: string): number {
  if (!plan) return 0;
  const end = ymd(addDays(parseYmd(weekStart), 6));
  return plan.sessions.filter((s) => s.date >= weekStart && s.date <= end).reduce((x, s) => x + s.distanceM, 0);
}
