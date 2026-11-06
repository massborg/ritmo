// Aggregations: mileage, personal bests, running story, race readiness, pacing and taper guidance.
import type { Activity, Race } from '../lib/types';
import { addDays, daysBetween, daysUntil, distanceLabel, parseYmd, RACE_DISTANCES, startOfWeek, ymd } from '../lib/format';
import { predictRace, raceEvidence, vdotFromPerformance } from './fitness';
import { effortOf } from './derive';

export function totalsBy(activities: Activity[], key: (a: Activity) => string): Map<string, { m: number; n: number; s: number }> {
  const m = new Map<string, { m: number; n: number; s: number }>();
  for (const a of activities) {
    const k = key(a);
    const cur = m.get(k) ?? { m: 0, n: 0, s: 0 };
    cur.m += a.distanceM; cur.n++; cur.s += a.movingS;
    m.set(k, cur);
  }
  return m;
}

export const weekKey = (a: Activity) => ymd(startOfWeek(new Date(a.startTime)));
export const monthKey = (a: Activity) => a.startTime.slice(0, 7);
export const yearKey = (a: Activity) => a.startTime.slice(0, 4);

export type PbKind = 'race' | 'timetrial' | 'training';
/** Distances with personal bests (best efforts inside runs count) */
export const PB_DISTANCES: { label: string; m: number }[] = [
  { label: '1 km', m: 1000 }, { label: '1 mile', m: 1609.344 }, { label: '3K', m: 3000 }, ...RACE_DISTANCES.slice(0, 1),
  { label: '5 miles', m: 8046.72 }, ...RACE_DISTANCES.slice(1, 2), { label: '15K', m: 15000 }, { label: '10 miles', m: 16093.44 },
  ...RACE_DISTANCES.slice(2, 3), { label: '30K', m: 30000 }, ...RACE_DISTANCES.slice(3, 4),
];
export const PB_KIND_LABEL: Record<PbKind, string> = { race: 'race', timetrial: 'time trial', training: 'training effort' };
export interface PB { label: string; m: number; timeS: number; date: string; activityId: string; fromRace: boolean; kind: PbKind }

/** Best times at race distances: whole runs of that distance and best efforts inside longer runs.
 *  `races` (the runner's calendar) helps label which PBs were set in races. */
export function personalBests(activities: Activity[], races: Race[] = []): PB[] {
  const out: PB[] = [];
  for (const d of PB_DISTANCES) {
    let best: PB | undefined;
    for (const a of activities) {
      let t: number | undefined;
      if (a.distanceM >= d.m * 0.99 && a.distanceM <= d.m * 1.03) t = a.movingS * (d.m / a.distanceM);
      if (a.distanceM >= d.m) {
        const e = effortOf(a, d.m);
        if (e && (!t || e < t)) t = e;
      }
      if (t && (!best || t < best.timeS)) {
        const kind: PbKind = a.isTimeTrial ? 'timetrial' : raceEvidence(a, races) ? 'race' : 'training';
        best = { label: d.label, m: d.m, timeS: t, date: a.startTime.slice(0, 10), activityId: a.id, fromRace: kind === 'race', kind };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/** Every time a new best was set at a distance, oldest first (whole runs and best efforts inside runs). */
export function pbHistory(activities: Activity[], m: number, races: Race[] = []): Omit<PB, 'label'>[] {
  const sorted = [...activities].filter((a) => a.distanceM >= m * 0.99).sort((x, y) => x.startTime.localeCompare(y.startTime));
  const out: Omit<PB, 'label'>[] = [];
  let best = Infinity;
  for (const a of sorted) {
    let t: number | undefined;
    if (a.distanceM <= m * 1.03) t = a.movingS * (m / a.distanceM);
    const e = effortOf(a, m);
    if (e && (!t || e < t)) t = e;
    if (t && t < best - 0.5) {
      best = t;
      const kind: PbKind = a.isTimeTrial ? 'timetrial' : raceEvidence(a, races) ? 'race' : 'training';
      out.push({ m, timeS: t, date: a.startTime.slice(0, 10), activityId: a.id, fromRace: kind === 'race', kind });
    }
  }
  return out;
}

/** Runs that look like races (by name or calendar date) but the runner has not confirmed or rejected yet. */
export function racesToReview(activities: Activity[], races: Race[] = []): Activity[] {
  return activities.filter((a) => !a.isRace && !a.notRace && !a.isTimeTrial && raceEvidence(a, races)).sort((x, y) => y.startTime.localeCompare(x.startTime));
}

/** PB progression: best time at each distance, by year */
export function pbByYear(activities: Activity[]): { year: string; pbs: PB[] }[] {
  const years = [...new Set(activities.map(yearKey))].sort();
  return years.map((y) => ({ year: y, pbs: personalBests(activities.filter((a) => yearKey(a) === y)) }));
}

export interface Story {
  totalM: number;
  totalRuns: number;
  totalS: number;
  firstDate?: string;
  years: { year: string; m: number; n: number }[];
  biggestYear?: { year: string; m: number };
  biggestMonth?: { month: string; m: number };
  longest?: Activity;
  pbs: PB[];
  activeWeeksPct: number;
  longestStreakWeeks: number;
  currentStreakWeeks: number;
}

export function runningStory(activities: Activity[], today: Date): Story {
  const years = [...totalsBy(activities, yearKey).entries()].map(([year, v]) => ({ year, m: v.m, n: v.n })).sort((a, b) => a.year.localeCompare(b.year));
  const months = [...totalsBy(activities, monthKey).entries()].map(([month, v]) => ({ month, m: v.m }));
  const weeks = new Set(activities.map(weekKey));
  const first = activities[0]?.startTime.slice(0, 10);
  let longestStreak = 0, streak = 0, current = 0, totalWeeks = 0;
  if (first) {
    for (let w = startOfWeek(parseYmd(first)); w <= today; w = addDays(w, 7)) {
      totalWeeks++;
      if (weeks.has(ymd(w))) { streak++; longestStreak = Math.max(longestStreak, streak); } else streak = 0;
    }
    // current streak counts back from this week (this week may not have a run yet)
    let w = startOfWeek(today);
    if (!weeks.has(ymd(w))) w = addDays(w, -7);
    while (weeks.has(ymd(w))) { current++; w = addDays(w, -7); }
  }
  return {
    totalM: activities.reduce((x, a) => x + a.distanceM, 0),
    totalRuns: activities.length,
    totalS: activities.reduce((x, a) => x + a.movingS, 0),
    firstDate: first,
    years,
    biggestYear: [...years].sort((a, b) => b.m - a.m)[0],
    biggestMonth: months.sort((a, b) => b.m - a.m)[0],
    longest: [...activities].sort((a, b) => b.distanceM - a.distanceM)[0],
    pbs: personalBests(activities),
    activeWeeksPct: totalWeeks ? Math.round((weeks.size / totalWeeks) * 100) : 0,
    longestStreakWeeks: longestStreak,
    currentStreakWeeks: current,
  };
}

const LONG_NEEDED = (m: number) => (m >= 40000 ? 30 : m >= 20000 ? 18 : m >= 9000 ? 13 : 9) * 1000;
const WEEKLY_NEEDED = (m: number) => (m >= 40000 ? 60 : m >= 20000 ? 45 : m >= 9000 ? 35 : 25) * 1000;

export interface RaceReadiness {
  score: number;
  predictedS: number;
  parts: { label: string; value: string; ok: boolean }[];
  summary: string;
}

export function raceReadiness(race: Race, activities: Activity[], vdot: number, today: Date): RaceReadiness {
  const predictedS = predictRace(vdot, race.distanceM, activities, today).timeS * (race.courseType === 'trail' ? 1.12 : race.courseType === 'cross-country' ? 1.06 : 1);
  const last42 = activities.filter((a) => { const d = daysBetween(new Date(a.startTime), today); return d >= 0 && d <= 42; });
  const longest = last42.reduce((x, a) => Math.max(x, a.distanceM), 0);
  const weekly = last42.reduce((x, a) => x + a.distanceM, 0) / 6;
  const weeksActive = new Set(last42.map(weekKey));
  const runs8 = activities.filter((a) => { const d = daysBetween(new Date(a.startTime), today); return d >= 0 && d < 56; });
  const consistentWeeks = [...totalsBy(runs8, weekKey).values()].filter((v) => v.n >= 3).length;

  const longScore = Math.min(1, longest / LONG_NEEDED(race.distanceM));
  const volScore = Math.min(1, weekly / WEEKLY_NEEDED(race.distanceM));
  const consScore = Math.min(1, consistentWeeks / 7);
  const goalScore = race.goalS ? Math.min(1, Math.max(0, 1 - (race.goalS < predictedS ? (predictedS - race.goalS) / race.goalS * 8 : 0))) : 1;
  const score = Math.round((longScore * 0.3 + volScore * 0.25 + consScore * 0.2 + goalScore * 0.25) * 100);
  const parts = [
    { label: 'Longest run, last 6 weeks', value: `${(longest / 1000).toFixed(1)} km of ${LONG_NEEDED(race.distanceM) / 1000} km`, ok: longScore >= 0.9 },
    { label: 'Weekly average, last 6 weeks', value: `${(weekly / 1000).toFixed(0)} km of ${WEEKLY_NEEDED(race.distanceM) / 1000} km`, ok: volScore >= 0.85 },
    { label: 'Consistent weeks (3+ runs), last 8', value: `${consistentWeeks} of 8`, ok: consScore >= 0.85 },
  ];
  if (race.goalS) parts.push({ label: 'Goal compared with prediction', value: race.goalS >= predictedS ? 'Within reach' : `${predictedS - race.goalS < 90 ? `${Math.round(predictedS - race.goalS)} s` : `${Math.round((predictedS - race.goalS) / 60)} min`} quicker than predicted`, ok: race.goalS >= predictedS * 0.99 });
  const weak = parts.filter((p) => !p.ok).map((p) => p.label.toLowerCase().replace(/, last.*/, ''));
  void weeksActive;
  const summary = score >= 85 ? 'You are well prepared. Trust the work and protect your freshness.'
    : score >= 70 ? `On track. The area to watch is your ${weak[0] ?? 'consistency'}.`
    : `Some catching up to do on ${weak.slice(0, 2).join(' and ') || 'training'}. A more conservative goal may serve you better.`;
  return { score, predictedS, parts, summary };
}

export interface PacingPlanRow { label: string; atM: number; splitPace: number; cumulativeS: number }

/** Even-effort pacing: slightly conservative first 20%, steady middle, small lift at the end. */
export function pacingPlan(race: Race, targetS: number): PacingPlanRow[] {
  const step = race.distanceM >= 20000 ? 5000 : 1000;
  const avg = targetS / (race.distanceM / 1000);
  const rows: PacingPlanRow[] = [];
  let cum = 0;
  for (let at = step; at < race.distanceM + step; at += step) {
    const end = Math.min(at, race.distanceM);
    const startM = at - step;
    const frac = startM / race.distanceM;
    const adj = frac < 0.2 ? 1.012 : frac > 0.85 ? 0.985 : 0.998;
    const segKm = (end - startM) / 1000;
    const p = avg * adj;
    cum += p * segKm;
    rows.push({ label: end === race.distanceM ? 'Finish' : `${end / 1000} km`, atM: end, splitPace: p, cumulativeS: cum });
  }
  // normalise to target
  const k = targetS / cum;
  return rows.map((r) => ({ ...r, splitPace: r.splitPace * k, cumulativeS: r.cumulativeS * k }));
}

export function taperGuidance(race: Race, today: Date): string {
  const d = daysUntil(today, race.date);
  const long = race.distanceM >= 40000;
  if (d < 0) return 'Race complete. Recover with easy running for about one day per 3 km raced before any hard sessions.';
  if (d === 0) return 'Race day. Eat a familiar breakfast 3 hours before, warm up gently, and start at your planned pace, not faster.';
  if (d <= 2) return 'Final days: short easy runs only, plenty of sleep, extra carbohydrate the day before. Lay out your kit tonight.';
  if (d <= 7) return `Race week: volume drops to about half while a few short race-pace efforts keep you sharp. Feeling restless or sluggish is normal${long ? '. Start carbohydrate loading two days out' : ''}.`;
  if (d <= (long ? 21 : 10)) return `Taper: ${long ? 'over the last two to three weeks' : 'in the final ten days'} volume falls 30 to 50% while intensity stays. This is when fatigue clears and fitness shows.`;
  return `Taper starts about ${long ? 'three weeks' : 'ten days'} out. Until then, focus on consistent training.`;
}

export function vdotForRace(a: Activity) {
  return vdotFromPerformance(a.distanceM, a.movingS);
}

export { distanceLabel };

export interface Balance {
  easyPct: number; // share of running time that was easy, last 28 days
  plannedEasyPct?: number; // what the plan prescribed over the same days
  phase?: string;
  verdict: 'good' | 'matches-plan' | 'too-hard';
  message: string;
}

const EASY_TYPES = ['easy', 'recovery', 'long', 'runwalk'];

/**
 * Easy/hard balance that takes the training phase into account: in build and peak weeks the plan itself
 * prescribes more quality work, so the runner is only warned when they run harder than the plan asked for.
 */
export function easyHardBalance(opts: {
  activities: Activity[]; typeOf: (a: Activity) => string; sessions: { date: string; type: string; durationS: number; phase: string }[]; today: Date;
}): Balance | undefined {
  const { activities, typeOf, sessions, today } = opts;
  const inWindow = (d: Date) => { const x = daysBetween(d, today); return x >= 0 && x < 28; };
  const runs = activities.filter((a) => inWindow(new Date(a.startTime)));
  const total = runs.reduce((x, a) => x + a.movingS, 0);
  if (!total) return undefined;
  const easy = runs.filter((a) => EASY_TYPES.includes(typeOf(a))).reduce((x, a) => x + a.movingS, 0);
  const easyPct = Math.round((easy / total) * 100);
  const planned = sessions.filter((s) => inWindow(parseYmd(s.date)) && s.type !== 'rest' && s.durationS > 0);
  const plannedTotal = planned.reduce((x, s) => x + s.durationS, 0);
  if (plannedTotal > 0) {
    const plannedEasyPct = Math.round((planned.filter((s) => EASY_TYPES.includes(s.type)).reduce((x, s) => x + s.durationS, 0) / plannedTotal) * 100);
    const phases = planned.map((s) => s.phase);
    const phase = phases.sort((a, b) => phases.filter((p) => p === b).length - phases.filter((p) => p === a).length)[0];
    if (easyPct >= plannedEasyPct - 7) {
      return { easyPct, plannedEasyPct, phase, verdict: easyPct >= 75 ? 'good' : 'matches-plan', message: easyPct >= 75 ? `A healthy balance, in line with the ${plannedEasyPct}% easy your plan set for these weeks.` : `This matches your plan: in the ${phase} phase it prescribes about ${plannedEasyPct}% easy running, with more quality sessions than usual. It will swing back towards easy running afterwards.` };
    }
    return { easyPct, plannedEasyPct, phase, verdict: 'too-hard', message: `Your plan set about ${plannedEasyPct}% easy running for these weeks, but you ran ${easyPct}% easy. Slow your easy days down so the hard sessions can count.` };
  }
  return easyPct >= 75
    ? { easyPct, verdict: 'good', message: 'A healthy balance. Most of your running is easy, which lets your hard sessions count.' }
    : { easyPct, verdict: 'too-hard', message: 'More of your running is hard than ideal. Aim for about 80% easy to keep fatigue in check.' };
}
