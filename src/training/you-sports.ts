// The You page for every kind of training (update 5, U8): totals by type, strength records and muscles worked,
// and minutes per sport. Pure functions over the same feed History uses.
import type { LogEntry } from '../lib/types';
import type { FeedItem, FeedType } from './feed';
import { exById } from './strength';
import { epley, exerciseSummary } from './strength-load';
import { crossLoad } from './load';

export const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
/** "26:14": hours and minutes */
export const hoursMinutes = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

export interface TypeTotal { type: FeedType; label: string; seconds: number; sessions: number }
const TYPE_ORDER: [FeedType, string][] = [['run', 'Run'], ['strength', 'Strength'], ['hyrox', 'HYROX'], ['cross', 'Other sport']];
/** Time and sessions per type, for the "time by type" bar (types with nothing are left out) */
export function totalsByType(items: FeedItem[]): TypeTotal[] {
  return TYPE_ORDER.map(([type, label]) => { const l = items.filter((x) => x.type === type); return { type, label, seconds: l.reduce((a, x) => a + x.durationS, 0), sessions: l.length }; }).filter((x) => x.sessions > 0);
}

export interface StrengthRecord { id: string; name: string; text: string; date: string; e1rm?: number }
/** The best set of each exercise over all time (heaviest estimated 1-rep max; for holds the longest; without a
 *  weight the most reps), newest first */
export function strengthRecords(log: LogEntry[] | undefined): StrengthRecord[] {
  // kind: 2 a loaded set (ranked by estimated 1-rep max), 1 a hold (longest), 0 unloaded reps (most). A loaded
  // set always beats an unloaded one of the same exercise.
  const best = new Map<string, StrengthRecord & { score: number; kind: number }>();
  for (const e of log ?? []) {
    if (e.kind !== 'strength') continue;
    for (const x of e.strength?.exercises ?? []) for (const s of x.sets) {
      const kind = s.load && s.reps ? 2 : s.seconds ? 1 : 0;
      const score = kind === 2 ? epley(s.load!, s.reps!) : kind === 1 ? s.seconds! : s.reps ?? 0;
      const cur = best.get(x.id);
      if (!score || (cur && (cur.kind > kind || (cur.kind === kind && cur.score >= score)))) continue;
      const text = kind === 2 ? `${Math.round(s.load! * 100) / 100} kg × ${s.reps}` : kind === 1 ? `${Math.floor(s.seconds! / 60)}:${String(s.seconds! % 60).padStart(2, '0')}` : `${s.reps}${s.unit === 'm' ? ' m' : ' reps'}`;
      best.set(x.id, { id: x.id, name: exById.get(x.id)?.name ?? x.name, text, date: e.date, e1rm: kind === 2 ? score : undefined, score, kind });
    }
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)).map((r) => ({ id: r.id, name: r.name, text: r.text, date: r.date, e1rm: r.e1rm }));
}

/** Sets per muscle in the entries given, most worked first */
export function musclesWorked(entries: LogEntry[]): { muscle: string; sets: number }[] {
  const n = new Map<string, number>();
  for (const e of entries) for (const x of e.strength?.exercises ?? []) for (const m of exById.get(x.id)?.muscles ?? []) n.set(m, (n.get(m) ?? 0) + x.sets.length);
  return [...n.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
}
/** Volume (kg × reps) of the entries given */
export const volumeKg = (entries: LogEntry[]) => entries.reduce((a, e) => a + (e.strength?.exercises ?? []).reduce((b, x) => b + exerciseSummary(x.sets).volumeKg, 0), 0);

/** Minutes, sessions and load per sport, most minutes first */
export function bySport(entries: LogEntry[]): { sport: string; minutes: number; sessions: number; load: number }[] {
  const n = new Map<string, { minutes: number; sessions: number; load: number }>();
  for (const e of entries) {
    if (e.kind !== 'cross') continue;
    const k = e.sport ?? 'Other', c = n.get(k) ?? { minutes: 0, sessions: 0, load: 0 };
    n.set(k, { minutes: c.minutes + (e.minutes ?? Math.round((e.durationS ?? 0) / 60)), sessions: c.sessions + 1, load: c.load + Math.round(crossLoad(e)) });
  }
  return [...n.entries()].map(([sport, v]) => ({ sport, ...v })).sort((a, b) => b.minutes - a.minutes);
}
/** Sessions in each of the last `weeks` weeks ending with the week of `to` (Monday starts), oldest first */
export function sessionsPerWeek(dates: string[], to: Date, weeks = 4): { start: string; n: number }[] {
  const monday = new Date(to.getFullYear(), to.getMonth(), to.getDate() - ((to.getDay() + 6) % 7));
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return Array.from({ length: weeks }, (_, i) => { const s = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (weeks - 1 - i)), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); return { start: key(s), n: dates.filter((d) => d >= key(s) && d <= key(e)).length }; });
}
