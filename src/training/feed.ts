// Everything the athlete did, in one date-ordered list (update 5, U1 and U8): runs, strength, HYROX and other
// sports. History, the day on Training and the You page all read this, so an entry saved anywhere shows everywhere.
import type { Activity, LogEntry, Profile } from '../lib/types';
import { dist, duration, pace, runDay, type Units } from '../lib/format';
import { crossLoad } from './load';
import { sessionSummary } from './strength-load';
import { clock } from '../hyrox/hyrox';

export type FeedType = 'run' | 'strength' | 'hyrox' | 'cross' | 'note';
export interface FeedItem {
  id: string; type: FeedType;
  /** The day on the athlete's calendar, and the moment it started (for ordering within a day) */
  date: string; at: string;
  title: string;
  /** What it amounted to, in a few words: "14.6 km · 4:58/km", "5 exercises · 612 kg · 32 min" */
  line: string;
  durationS: number; distanceM?: number; volumeKg?: number;
  /** Where tapping it goes */
  link: string;
  /** Training load on the same scale as runs (0 for runs here: theirs comes from pace and heart rate) */
  load: number;
  /** A short tag for the row: Run, Strength, HYROX, or the sport */
  tag: string;
}

export const FEED_LABEL: Record<FeedType, string> = { run: 'Run', strength: 'Strength', hyrox: 'HYROX', cross: 'Cross', note: 'Note' };
export const FEED_FILTERS: { value: 'all' | FeedType; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'run', label: 'Runs' }, { value: 'strength', label: 'Strength' }, { value: 'hyrox', label: 'HYROX' }, { value: 'cross', label: 'Cross-training' },
];

/** A short mark for the row icon */
export const sportMark = (sport?: string): string => {
  const s = (sport ?? '').toLowerCase();
  return /indoor/.test(s) ? 'IB' : /bike/.test(s) ? 'B' : /swim/.test(s) ? 'SW' : /ellip/.test(s) ? 'E' : /row/.test(s) ? 'RW' : /walk|hik/.test(s) ? 'W' : /class/.test(s) ? 'C' : /gym/.test(s) ? 'G' : 'O';
};

const logSeconds = (e: LogEntry) => e.durationS ?? (e.minutes ?? 0) * 60;

/** One log entry as a feed item (undefined for one with nothing to show) */
export function logItem(e: LogEntry, units: Units): FeedItem | undefined {
  const at = e.startedAt ?? e.hyrox?.startedAt ?? (e.date === runDay(e.at) ? e.at : new Date(`${e.date}T12:00:00`).toISOString());
  const base = { id: e.id, date: e.date, at, durationS: logSeconds(e), load: Math.round(crossLoad(e)) };
  const mins = e.minutes ?? Math.round(logSeconds(e) / 60);
  if (e.kind === 'hyrox' && e.hyrox) {
    const st = e.hyrox.segments.filter((x) => x.kind === 'station').length;
    return { ...base, type: 'hyrox', title: e.hyrox.title, durationS: Math.round(e.hyrox.totalMs / 1000), line: [clock(e.hyrox.totalMs), st ? `${st} station${st === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '), link: `/hyrox/session/${e.hyrox.id}`, tag: 'HYROX' };
  }
  if (e.kind === 'strength') {
    const ex = e.strength?.exercises ?? [];
    const vol = ex.length ? Math.round(sessionSummary(ex).volumeKg) : 0;
    return { ...base, type: 'strength', title: e.strength?.title ?? (e.sport ? `Strength · ${e.sport}` : 'Strength session'), volumeKg: vol || undefined,
      line: [ex.length ? `${ex.length} exercise${ex.length === 1 ? '' : 's'}` : '', vol ? `${vol.toLocaleString('en-GB')} kg` : '', mins ? `${mins} min` : ''].filter(Boolean).join(' · '), link: `/log/${e.id}`, tag: 'Strength' };
  }
  if (e.kind === 'cross') {
    return { ...base, type: 'cross', title: e.sport ?? 'Cross-training', distanceM: e.distanceM,
      line: [mins ? `${mins} min` : '', e.distanceM ? dist(e.distanceM, units) : '', e.rpe ? `effort ${e.rpe}` : ''].filter(Boolean).join(' · '), link: `/log/${e.id}`, tag: e.sport ?? 'Cross' };
  }
  if (e.kind === 'note' && e.text) return { ...base, type: 'note', title: 'Note', line: e.text.length > 80 ? `${e.text.slice(0, 77)}…` : e.text, link: `/log/${e.id}`, tag: 'Note', load: 0 };
  return undefined;
}

export function runItem(a: Activity, units: Units): FeedItem {
  return { id: a.id, type: 'run', date: runDay(a.startTime), at: a.startTime, title: a.name, durationS: a.movingS || a.durationS, distanceM: a.distanceM,
    line: [dist(a.distanceM, units, 2), a.movingS && a.distanceM > 100 ? pace(a.movingS / (a.distanceM / 1000), units) : duration(a.durationS)].join(' · '), link: `/activity/${a.id}`, load: 0, tag: 'Run' };
}

/** Every run and log entry, newest first. Notes are left out unless asked for (they are not training). */
export function activityFeed(activities: Activity[], profile: Pick<Profile, 'log' | 'units'>, o: { notes?: boolean } = {}): FeedItem[] {
  const units = profile.units ?? 'km';
  const items: FeedItem[] = activities.map((a) => runItem(a, units));
  for (const e of profile.log ?? []) { const it = logItem(e, units); if (it && (it.type !== 'note' || o.notes)) items.push(it); }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
}

/** The log entries of one day, for the day card on Training (oldest first, as the day went) */
export function dayLog(profile: Pick<Profile, 'log' | 'units'>, date: string): FeedItem[] {
  return (profile.log ?? []).filter((e) => e.date === date).map((e) => logItem(e, profile.units ?? 'km')).filter((x): x is FeedItem => !!x).sort((a, b) => a.at.localeCompare(b.at));
}
