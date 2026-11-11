// The Hub profile's numbers (update 2, §13 and §14): PBs the runner chose to show, their weekly streak and run count.
// - PBs are never shown automatically: off until the runner turns them on and picks up to 4 distances.
// - For each distance: Ritmo's best (time, date, race name) or a time they enter (shown as self-reported).
// - Only runs that may be shown to others count: never Strava runs (Strava's rules), never runs left out of stats.
import type { Activity, Race } from '../lib/types';
import { addDays, parseYmd, startOfWeek, ymd } from '../lib/format';
import { personalBests, type PB } from './insights';

export const PROFILE_PB_DISTANCES: { label: string; m: number }[] = [
  { label: '1 mile', m: 1609.344 }, { label: '5K', m: 5000 }, { label: '10K', m: 10000 },
  { label: '10 mile', m: 16093.44 }, { label: 'Half', m: 21097.5 }, { label: 'Marathon', m: 42195 },
];
export const MAX_PROFILE_PBS = 4;

export interface PbChoice { m: number; mode: 'ritmo' | 'own'; timeS?: number; race?: string; date?: string }
export interface HubPbSettings { show: boolean; items: PbChoice[] }
/** A PB as other runners see it */
export interface ShownPb { label: string; m: number; timeS: number; date?: string; race?: string; self?: boolean }

const near = (a: number, b: number) => Math.abs(a - b) / b < 0.005;
export const labelOf = (m: number) => PROFILE_PB_DISTANCES.find((d) => near(d.m, m))?.label ?? `${Math.round(m / 100) / 10} km`;

/** Runs that may appear on the profile: not from Strava, not left out of stats, not deleted */
export const shareableRuns = (acts: Activity[]) => acts.filter((a) => a.source !== 'strava' && a.source !== 'sample' && !a.hidden && !a.deletedAt);

/** Ritmo's best at each profile distance, from shareable runs only */
export function ritmoBests(acts: Activity[], races: Race[] = []): Map<number, PB & { race?: string }> {
  const runs = shareableRuns(acts);
  const byId = new Map(runs.map((a) => [a.id, a]));
  const out = new Map<number, PB & { race?: string }>();
  for (const pb of personalBests(runs, races)) {
    const d = PROFILE_PB_DISTANCES.find((x) => near(x.m, pb.m));
    if (!d) continue;
    const a = byId.get(pb.activityId);
    out.set(d.m, { ...pb, race: pb.kind === 'race' || pb.kind === 'timetrial' ? a?.name : undefined });
  }
  return out;
}

/** What the profile shows, or null when PBs are off or none are chosen */
export function resolvePbs(s: HubPbSettings | undefined, bests: Map<number, PB & { race?: string }>): ShownPb[] | null {
  if (!s?.show || !s.items.length) return null;
  const out: ShownPb[] = [];
  for (const c of s.items.slice(0, MAX_PROFILE_PBS)) {
    const label = labelOf(c.m);
    if (c.mode === 'own') { if (c.timeS) out.push({ label, m: c.m, timeS: c.timeS, date: c.date || undefined, race: c.race || undefined, self: true }); continue; }
    const b = bests.get(c.m);
    if (b) out.push({ label, m: c.m, timeS: Math.round(b.timeS), date: b.date, race: b.race });
  }
  return out.length ? out : null;
}

/** Distances where Ritmo now has a faster time than the one the runner typed in ("New best 15:38 at … Update?") */
export function fasterThanOwn(s: HubPbSettings | undefined, bests: Map<number, PB & { race?: string }>): { m: number; label: string; timeS: number; date: string; race?: string }[] {
  if (!s?.show) return [];
  return s.items.filter((c) => c.mode === 'own' && c.timeS).flatMap((c) => {
    const b = bests.get(c.m);
    return b && Math.round(b.timeS) < c.timeS! - 0.5 ? [{ m: c.m, label: labelOf(c.m), timeS: Math.round(b.timeS), date: b.date, race: b.race }] : [];
  });
}

/** "15:38" or "1:13:37" (also "15.38") to seconds; undefined when it isn't a sensible time */
export function parseTime(s: string): number | undefined {
  const t = s.trim().replace(/\./g, ':');
  const m = t.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const [h, mi, se] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (se > 59 || (m[1] !== undefined && mi > 59)) return undefined;
  const total = h * 3600 + mi * 60 + se;
  return total >= 120 && total < 24 * 3600 ? total : undefined;
}

/** Weeks in a row (Monday to Sunday) with at least one run, up to this week; this week counts once it has a run */
export function weekStreak(acts: Activity[], today: Date): number {
  const weeks = new Set(shareableRuns(acts).map((a) => ymd(startOfWeek(parseYmd(a.startTime.slice(0, 10))))));
  let w = startOfWeek(today);
  if (!weeks.has(ymd(w))) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(ymd(w))) { n++; w = addDays(w, -7); }
  return n;
}
