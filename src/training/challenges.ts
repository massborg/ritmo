// Hub challenges (brief §9.3): Ritmo-made only for now. Progress is worked out on the device from the runner's own
// runs, every source included (Strava imports count here even though they are never posted or shown to others).
// Joining stores a copy of the challenge in the profile, so a finished month still shows what was joined.
type Units = 'km' | 'mi';

export type ChallengeKind = 'distance' | 'weekly_runs' | 'long_runs' | 'one_long';
export interface Challenge {
  id: string;
  kind: ChallengeKind;
  title: string;
  description: string;
  /** distance: metres; weekly_runs: runs per week; long_runs: number of runs; one_long: 1 */
  target: number;
  /** long_runs / one_long: the shortest run that counts, in metres */
  minM?: number;
  /** weekly_runs: how many weeks */
  weeks?: number;
  /** Local dates, YYYY-MM-DD, both included */
  start: string;
  end: string;
}
export interface JoinedChallenge { challenge: Challenge; joinedAt: string; completedAt?: string; sharedAt?: string }
export interface ChallengeProgress {
  value: number;
  target: number;
  /** 0..1 for the bar */
  frac: number;
  done: boolean;
  ended: boolean;
  daysLeft: number;
  /** "136.4 of 200 km · 21 days left" */
  line: string;
  /** Totals of the runs that counted, for a "challenge complete" post */
  distanceM: number;
  movingS: number;
}

type RunLike = { startTime: string; distanceM: number; movingS?: number };

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s: string, n: number) => { const d = parseDay(s); d.setDate(d.getDate() + n); return localDay(d); };
const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
const mondayOf = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return localDay(x); };
const monthName = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });
const shortDate = (s: string) => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const UNIT_M = { km: 1000, mi: 1609.344 } as const;
const fmt = (m: number, u: Units) => { const v = m / UNIT_M[u]; return v.toFixed(1).replace(/\.0$/, ''); };

function monthChallenges(first: Date, units: Units): Challenge[] {
  const start = localDay(first);
  const end = localDay(new Date(first.getFullYear(), first.getMonth() + 1, 0));
  const ym = start.slice(0, 7);
  const month = monthName(first);
  const [small, big, long] = units === 'mi' ? [60, 125, 6.2] : [100, 200, 10];
  const longLabel = units === 'mi' ? '10K' : '10 km';
  return [
    { id: `dist-${small}${units}-${ym}`, kind: 'distance', title: `${small} ${units} in ${month}`, description: `Run ${small} ${units} in total between ${shortDate(start)} and ${shortDate(end)}.`, target: small * UNIT_M[units], start, end },
    { id: `dist-${big}${units}-${ym}`, kind: 'distance', title: `${big} ${units} in ${month}`, description: `A big month: ${big} ${units} in total by ${shortDate(end)}.`, target: big * UNIT_M[units], start, end },
    { id: `long-4x10-${ym}`, kind: 'long_runs', title: `Four ${longLabel} runs in ${month}`, description: `Four runs of at least ${longLabel} this month.`, target: 4, minM: long * UNIT_M[units === 'mi' ? 'mi' : 'km'], start, end },
  ];
}

/** The challenges Ritmo offers today: this month's, next month's in the last week, a weekly streak starting this
 *  Monday and a half-marathon-distance run before the end of next month. */
export function catalogue(today: Date, units: Units = 'km'): Challenge[] {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const list = monthChallenges(first, units);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (lastDay - today.getDate() < 7) list.push(...monthChallenges(new Date(today.getFullYear(), today.getMonth() + 1, 1), units));
  const mon = mondayOf(today);
  list.push({ id: `weekly-3x4-${mon}`, kind: 'weekly_runs', title: '3 runs a week for 4 weeks', description: `Build the habit: at least 3 runs in each of the 4 weeks from Monday ${shortDate(mon)}.`, target: 3, weeks: 4, start: mon, end: addDays(mon, 27) });
  const halfEnd = localDay(new Date(today.getFullYear(), today.getMonth() + 2, 0));
  list.push({ id: `one-21k-${halfEnd.slice(0, 7)}`, kind: 'one_long', title: `Half marathon distance by ${shortDate(halfEnd)}`, description: `One run of at least ${units === 'mi' ? '13.1 mi' : '21.1 km'} before ${shortDate(halfEnd)}.`, target: 1, minM: 21097.5, start: localDay(first), end: halfEnd });
  return list;
}

/** How far the runner is with a challenge, from their runs. */
export function progress(c: Challenge, runs: RunLike[], units: Units = 'km', today = new Date()): ChallengeProgress {
  const t = localDay(today);
  const inside = runs.filter((r) => { const d = localDay(new Date(r.startTime)); return d >= c.start && d <= c.end && r.distanceM > 0; });
  const ended = t > c.end;
  const daysLeft = Math.max(0, daysBetween(t, c.end) + 1);
  const left = ended ? 'Ended' : daysLeft === 1 ? 'Last day' : `${daysLeft} days left`;
  const minM = (c.minM ?? 0) - 50; // a GPS rounding short of the mark still counts
  let value = 0, target = c.target, counted = inside, line = '';
  if (c.kind === 'distance') {
    value = inside.reduce((s, r) => s + r.distanceM, 0);
    line = `${fmt(value, units)} of ${fmt(target, units)} ${units}`;
  } else if (c.kind === 'long_runs') {
    counted = inside.filter((r) => r.distanceM >= minM);
    value = counted.length;
    line = `${value} of ${target} runs`;
  } else if (c.kind === 'one_long') {
    const best = inside.reduce((m, r) => Math.max(m, r.distanceM), 0);
    counted = inside.filter((r) => r.distanceM >= minM).slice(0, 1);
    value = counted.length ? 1 : 0;
    line = value ? `Done: ${fmt(counted[0].distanceM, units)} ${units}` : best ? `Longest so far ${fmt(best, units)} of ${fmt(c.minM!, units)} ${units}` : 'No long run yet';
  } else {
    const weeks = c.weeks ?? 1;
    target = weeks;
    const perWeek = Array.from({ length: weeks }, (_, i) => { const a = addDays(c.start, i * 7), b = addDays(a, 6); return inside.filter((r) => { const d = localDay(new Date(r.startTime)); return d >= a && d <= b; }).length; });
    value = perWeek.filter((n) => n >= c.target).length;
    const wk = Math.min(weeks - 1, Math.max(0, Math.floor(daysBetween(c.start, t) / 7)));
    line = t < c.start ? `Starts ${shortDate(c.start)}` : value >= weeks ? `${weeks} of ${weeks} weeks` : `Week ${wk + 1} of ${weeks} · ${perWeek[wk]} of ${c.target} runs this week`;
  }
  const done = value >= target;
  return {
    value, target, frac: Math.max(0, Math.min(1, target ? value / target : 0)), done, ended, daysLeft,
    line: done ? `${line} · Complete` : `${line} · ${left}`,
    distanceM: counted.reduce((s, r) => s + r.distanceM, 0),
    movingS: counted.reduce((s, r) => s + (r.movingS ?? 0), 0),
  };
}

/** Joined challenges that have just been completed get a completion date (once). Returns undefined if nothing changed. */
export function markCompleted(joined: JoinedChallenge[], runs: RunLike[], now = new Date()): JoinedChallenge[] | undefined {
  let changed = false;
  const next = joined.map((j) => {
    if (j.completedAt) return j;
    if (!progress(j.challenge, runs, 'km', now).done) return j;
    changed = true;
    return { ...j, completedAt: now.toISOString() };
  });
  return changed ? next : undefined;
}

/** The badge artwork for a challenge (public/brand/badges). Each challenge type has its own medal; anything new
 *  uses the generic one. */
export const BADGES = ['distance-100km', 'distance-200km', 'distance-60mi', 'distance-125mi', 'long-runs-4x10', 'weekly-3x4', 'half-distance', 'challenge-generic'] as const;
export type BadgeId = typeof BADGES[number];
export function badgeOf(c: Pick<Challenge, 'kind' | 'id'>): BadgeId {
  if (c.kind === 'distance') {
    const m = c.id.match(/^dist-(\d+)(km|mi)-/);
    const id = m ? `distance-${m[1]}${m[2]}` : '';
    return (BADGES as readonly string[]).includes(id) ? id as BadgeId : 'challenge-generic';
  }
  if (c.kind === 'long_runs') return 'long-runs-4x10';
  if (c.kind === 'weekly_runs') return 'weekly-3x4';
  if (c.kind === 'one_long') return 'half-distance';
  return 'challenge-generic';
}
export const badgeSrc = (id: BadgeId | 'locked') => `/brand/badges/badge-${id}.svg`;

/**
 * One challenge state everywhere (update 3, §1.8): a challenge the runner posted as completed is joined and completed,
 * even if this device's copy of the profile lost it. Matched by the challenge id in the post, or, for older posts, by
 * its title among the challenges offered when it was posted. Returns undefined if nothing changed.
 */
export function restoreFromPosts(joined: JoinedChallenge[], posts: { title: string; created_at: string; stats: { type?: string; challengeId?: string; badges?: string[] } }[], units: Units = 'km'): JoinedChallenge[] | undefined {
  let next = joined;
  for (const p of posts) {
    if (p.stats?.type !== 'challenge') continue;
    const title = p.stats.badges?.[0] ?? p.title.replace(/^Completed: /, '');
    const c = catalogue(new Date(p.created_at), units).find((x) => (p.stats.challengeId ? x.id === p.stats.challengeId : x.title === title))
      ?? next.find((j) => j.challenge.id === p.stats.challengeId || j.challenge.title === title)?.challenge;
    if (!c) continue;
    const have = next.find((j) => j.challenge.id === c.id);
    if (have?.completedAt && have.sharedAt) continue;
    next = have
      ? next.map((j) => (j.challenge.id === c.id ? { ...j, completedAt: j.completedAt ?? p.created_at, sharedAt: j.sharedAt ?? p.created_at } : j))
      : [...next, { challenge: c, joinedAt: p.created_at, completedAt: p.created_at, sharedAt: p.created_at }];
  }
  return next === joined ? undefined : next;
}
