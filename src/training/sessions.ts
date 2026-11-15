// Group a day's pieces into one session. Watches often save a warm-up, strides, the main run and a cool-down as
// separate files; a coach looks at them together. Pieces less than 30 minutes apart on the same day (from the end of
// one to the start of the next) form one session in parts, wherever they came from (files, Strava, Health). The main run is the longest piece; pieces before it are the warm-up (or strides), after it the cool-down.
import type { Activity } from '../lib/types';

export type PartRole = 'warmup' | 'strides' | 'main' | 'cooldown';
export const ROLE_LABEL: Record<PartRole, string> = { warmup: 'Warm-up', strides: 'Strides', main: 'Main run', cooldown: 'Cool-down' };

export interface RunGroup {
  id: string; // the main run's id
  date: string;
  parts: Activity[];
  main: Activity;
  roles: Record<string, PartRole>;
  totalM: number;
  movingS: number;
}

const GAP_S = 30 * 60;

/** `split` holds runs the runner split off ("Split" on the day view): they start a session of their own. */
export function groupRuns(activities: Activity[], split?: Set<string>): RunGroup[] {
  const sorted = [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const groups: Activity[][] = [];
  for (const a of sorted) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (prev && !split?.has(a.id) && prev.startTime.slice(0, 10) === a.startTime.slice(0, 10)
      && (new Date(a.startTime).getTime() - new Date(prev.startTime).getTime()) / 1000 - prev.durationS < GAP_S) g.push(a);
    else groups.push([a]);
  }
  return groups.map((parts) => {
    const main = parts.reduce((m, a) => (a.distanceM > m.distanceM ? a : m));
    const mi = parts.indexOf(main);
    const roles: Record<string, PartRole> = {};
    parts.forEach((p, i) => {
      // Before the main run: a short piece (about 1 km or less) is strides or drills, a longer one the warm-up
      roles[p.id] = i === mi ? 'main' : i > mi ? 'cooldown' : p.distanceM <= 1050 ? 'strides' : 'warmup';
    });
    return { id: main.id, date: main.startTime.slice(0, 10), parts, main, roles, totalM: parts.reduce((x, a) => x + a.distanceM, 0), movingS: parts.reduce((x, a) => x + a.movingS, 0) };
  });
}

/** Group lookup by any piece's id */
export function groupIndex(groups: RunGroup[]): Map<string, RunGroup> {
  const m = new Map<string, RunGroup>();
  for (const g of groups) for (const p of g.parts) m.set(p.id, g);
  return m;
}

/**
 * What a run was to the plan, in the same words on every screen (update 4): all runs matched to one planned session
 * are shown as one session in parts, and a part says which part it is.
 */
export function planTagText(o: { status?: string; today: boolean; typeLabel: string; plannedShort?: string; group?: RunGroup; runId: string; swappedLabel: string }): { kind: 'ok' | 'muted' | 'swapped'; text: string } | undefined {
  const n = o.group?.parts.length ?? 1;
  const role = o.group && n > 1 ? o.group.roles[o.runId] : undefined;
  if (o.status === 'swapped') return { kind: 'swapped', text: o.swappedLabel };
  if (o.status === 'partial') return { kind: 'muted', text: `Part of your planned ${o.plannedShort ?? 'session'} · ${o.typeLabel}` };
  if (o.status === 'done') {
    const matched = o.today ? "Matched today's plan" : 'Matched your plan';
    if (n > 1 && role && role !== 'main') return { kind: 'ok', text: `${ROLE_LABEL[role]} · part of a session of ${n}` };
    return { kind: 'ok', text: n > 1 ? `${matched} · session of ${n} parts` : `${matched} · ${o.typeLabel}` };
  }
  return undefined;
}
