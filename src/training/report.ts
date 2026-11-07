// The feedback report for a run (review #2 §2.5): a specific verdict, a score breakdown, each rep against its
// target, what it means for the goal, a tip for the next session, and trends. Built from the numbers only, so it
// never contradicts the run; an AI write-up, when enabled, may only reword it.
import type { Activity, Plan, PlannedSession, Race, SessionType } from '../lib/types';
import { addDays, duration, parseYmd, pace as fmtPace, paceRange, startOfWeek, type Units, ymd } from '../lib/format';
import type { Analysis } from './analysis';
import { TYPE_LABEL } from './analysis';
import { predictTime, type TrainingPaces, vdotFromPerformance } from './fitness';
import { effortOf } from './derive';
import { PB_DISTANCES, pbHistory } from './insights';
import { weatherNote } from './weather';

export interface RepStat { label: string; timeS: number; distanceM?: number; paceS?: number; avgHr?: number; inTarget?: boolean }
export interface BreakdownItem { key: 'pace' | 'consistency' | 'effort' | 'recovery' | 'completion'; label: string; value: number; note: string }
export interface Report {
  verdict: string;
  breakdown: BreakdownItem[];
  reps: RepStat[];
  target?: [number, number];
  goalNote?: string;
  nextTip?: string;
  /** Conditions that affect pace (heat, humidity, wind, cold). Explains the run; does not change the score */
  weatherNote?: string;
  badges: string[];
  trend?: { labels: string[]; paces: number[] };
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const HARD: SessionType[] = ['threshold', 'vo2max', 'speed', 'hills', 'tempo'];

/** The work reps of a run: from the reps the runner entered or confirmed, otherwise from the watch's laps. */
export function workReps(a: Activity, workPace?: number): RepStat[] {
  if (a.reps?.some((r) => r.kind === 'work' && r.timeS)) {
    return a.reps.filter((r) => r.kind === 'work' && r.timeS).map((r) => ({ label: r.label, timeS: r.timeS!, distanceM: r.distanceM, paceS: r.distanceM ? r.timeS! / (r.distanceM / 1000) : undefined, avgHr: r.avgHr }));
  }
  if (a.laps?.length && workPace) {
    return a.laps.filter((l) => l.distanceM > 150 && l.durationS / (l.distanceM / 1000) <= workPace * 1.06)
      .map((l, i) => ({ label: `Rep ${i + 1}`, timeS: l.durationS, distanceM: l.distanceM, paceS: l.durationS / (l.distanceM / 1000), avgHr: l.avgHr }));
  }
  return [];
}

export function buildReport(o: {
  a: Activity; an: Analysis; planned?: PlannedSession; all: Activity[]; plan?: Plan; race?: Race; paces?: TrainingPaces;
  fitnessVdot?: number; units: Units; typeOf: (x: Activity) => SessionType; workPace?: number;
}): Report {
  const { a, an, planned, all, plan, race, paces, units } = o;
  const P = (s: number) => fmtPace(s, units);
  const type = an.type;
  const avgPace = a.movingS / (a.distanceM / 1000);
  const workStep = planned?.steps.find((s) => s.kind === 'work' && s.pace);
  const target = workStep?.pace ?? (planned?.paceTarget ? [planned.paceTarget.minSPerKm, planned.paceTarget.maxSPerKm] as [number, number] : undefined);
  const reps = workReps(a, o.workPace);
  const tol = 3; // seconds per km either side of the band
  if (target) for (const r of reps) if (r.paceS) r.inTarget = r.paceS >= target[0] - tol && r.paceS <= target[1] + tol;

  // ---- Score breakdown ----
  const breakdown: BreakdownItem[] = [];
  const withPace = reps.filter((r) => r.paceS);
  if (target && withPace.length) {
    const inT = withPace.filter((r) => r.inTarget).length;
    breakdown.push({ key: 'pace', label: 'Pace accuracy', value: clamp((inT / withPace.length) * 100), note: `${inT} of ${withPace.length} reps inside ${paceRange(target[0], target[1], units)}` });
  } else if (target && !reps.length) {
    const off = avgPace < target[0] ? target[0] - avgPace : avgPace > target[1] ? avgPace - target[1] : 0;
    breakdown.push({ key: 'pace', label: 'Pace accuracy', value: clamp(100 - off * 4), note: off ? `${Math.round(off)} s/km ${avgPace < target[0] ? 'faster' : 'slower'} than the target` : 'Inside the target pace' });
  }
  if (withPace.length >= 3) {
    const ps = withPace.map((r) => r.paceS!);
    const mean = ps.reduce((x, y) => x + y, 0) / ps.length;
    const spread = (Math.max(...ps) - Math.min(...ps)) / mean;
    breakdown.push({ key: 'consistency', label: 'Consistency', value: clamp(100 - spread * 800), note: `Reps within ${Math.round(Math.max(...ps) - Math.min(...ps))} s/km of each other` });
  } else if (an.patterns.fadePct != null) {
    breakdown.push({ key: 'consistency', label: 'Consistency', value: clamp(100 - Math.max(0, an.patterns.fadePct) * 6), note: an.patterns.fadePct > 0 ? `Last 20% was ${an.patterns.fadePct}% slower` : 'Even or faster at the end' });
  }
  if (an.patterns.easyTooHardPct != null) breakdown.push({ key: 'effort', label: 'Effort control', value: clamp(100 - Math.max(0, an.patterns.easyTooHardPct - 10) * 1.6), note: `${100 - an.patterns.easyTooHardPct}% of the time in Z1–Z2` });
  else if (an.patterns.hrDriftPct != null) breakdown.push({ key: 'effort', label: 'Effort control', value: clamp(100 - Math.max(0, an.patterns.hrDriftPct - 3) * 8), note: `Heart rate drift ${an.patterns.hrDriftPct}%` });
  const recs = a.reps?.filter((r) => r.kind === 'recovery' && r.timeS && r.distanceM) ?? [];
  if (recs.length && paces) {
    const rp = recs.reduce((x, r) => x + r.timeS! / (r.distanceM! / 1000), 0) / recs.length;
    const tooFast = Math.max(0, paces.easy[0] - rp);
    breakdown.push({ key: 'recovery', label: 'Recovery quality', value: clamp(100 - tooFast * 2), note: tooFast > 5 ? `Recoveries at ${P(rp)}: too fast to recover` : `Recoveries at ${P(rp)}: easy enough` });
  }
  if (planned && planned.type !== 'rest') {
    const repSteps = workStep?.label.match(/^(\d+)\s*x/i);
    const plannedReps = repSteps ? Number(repSteps[1]) : 0;
    if (plannedReps && reps.length) breakdown.push({ key: 'completion', label: 'Completion', value: clamp((Math.min(reps.length, plannedReps) / plannedReps) * 100), note: `${Math.min(reps.length, plannedReps)} of ${plannedReps} reps` });
    else if (planned.distanceM) {
      const r = a.distanceM / planned.distanceM;
      breakdown.push({ key: 'completion', label: 'Completion', value: clamp(r > 1.15 ? 100 - (r - 1.15) * 200 : r * 100), note: `${(a.distanceM / 1000).toFixed(1)} of ${(planned.distanceM / 1000).toFixed(1)} km` });
    }
  }

  // ---- Verdict: one specific line ----
  let verdict: string;
  if (withPace.length >= 2) {
    const avg = withPace.reduce((x, r) => x + r.paceS!, 0) / withPace.length;
    const inT = withPace.filter((r) => r.inTarget).length;
    const lastFastest = withPace[withPace.length - 1].paceS! <= Math.min(...withPace.map((r) => r.paceS!)) + 0.5;
    const repLabel = withPace[0].distanceM ? (withPace[0].distanceM >= 1000 ? `${Math.round(withPace[0].distanceM / 100) / 10} km` : `${Math.round(withPace[0].distanceM)} m`) : 'reps';
    const lead = target ? (inT === withPace.length ? 'Nailed it' : inT / withPace.length >= 0.7 ? 'Solid session' : 'Off target today') : 'Done';
    verdict = `${lead}: ${withPace.length} x ${repLabel} averaged ${P(avg)}${target ? `, ${inT === withPace.length ? 'all' : `${inT} of ${withPace.length}`} inside target` : ''}${lastFastest ? ', last rep fastest' : ''}.`;
  } else if (type === 'race' || type === 'timetrial') verdict = `${TYPE_LABEL[type]}: ${(a.distanceM / 1000).toFixed(2)} km in ${duration(a.movingS)} (${P(avgPace)}).`;
  else if (type === 'easy' || type === 'recovery') verdict = an.patterns.easyTooHardPct != null && an.patterns.easyTooHardPct > 25 ? `Easy day that ran warm: ${an.patterns.easyTooHardPct}% of it above Z2 at ${P(avgPace)}.` : `Easy done right: ${(a.distanceM / 1000).toFixed(1)} km at ${P(avgPace)}${a.avgHr ? `, average heart rate ${a.avgHr}` : ''}.`;
  else if (type === 'long') verdict = `Long run: ${(a.distanceM / 1000).toFixed(1)} km in ${duration(a.movingS)}${an.patterns.fadePct != null ? (an.patterns.fadePct <= 0 ? ', finishing strong' : `, last 20% ${an.patterns.fadePct}% slower`) : ''}.`;
  else verdict = `${TYPE_LABEL[type]}: ${(a.distanceM / 1000).toFixed(1)} km at ${P(avgPace)}.`;

  // ---- What it means for the goal ----
  let goalNote: string | undefined;
  if (race && (type === 'race' || type === 'timetrial' || HARD.includes(type))) {
    const best = [race.distanceM, 5000, 3000, 10000].map((m) => ({ m, t: effortOf(a, m) })).find((x) => x.t && (type === 'race' || type === 'timetrial' || x.m >= 3000));
    if (best?.t) {
      const v = vdotFromPerformance(best.m, best.t) * (type === 'race' || type === 'timetrial' ? 1 : 0.985);
      const pred = predictTime(v, race.distanceM);
      const cur = o.fitnessVdot ? predictTime(o.fitnessVdot, race.distanceM) : undefined;
      const diff = cur ? Math.round(cur - pred) : 0;
      goalNote = `Your best ${best.m >= 1000 ? `${best.m / 1000} km` : `${best.m} m`} in this run (${duration(best.t)}) suggests about ${duration(pred)} for ${race.name}${cur && Math.abs(diff) >= 5 ? `, ${Math.abs(diff)} s ${diff > 0 ? 'faster' : 'slower'} than your current estimate` : ', in line with your current estimate'}${race.goalS ? `. Your goal is ${duration(race.goalS)}` : ''}.`;
    }
  }

  // ---- Tip for the next session ----
  let nextTip: string | undefined;
  const after = plan?.sessions.filter((s) => s.date > a.startTime.slice(0, 10) && s.type !== 'rest').sort((x, y) => x.date.localeCompare(y.date))[0];
  if (after) {
    const when = (() => { const d = Math.round((parseYmd(after.date).getTime() - parseYmd(a.startTime.slice(0, 10)).getTime()) / 86400000); return d === 1 ? 'Tomorrow' : `On ${parseYmd(after.date).toLocaleDateString('en-GB', { weekday: 'long' })}`; })();
    const how = after.type === 'easy' || after.type === 'recovery'
      ? `keep it at ${after.paceTarget ? paceRange(after.paceTarget.minSPerKm, after.paceTarget.maxSPerKm, units) : paces ? paceRange(paces.easy[0], paces.easy[1], units) : 'an easy, chatty pace'} even if you feel great`
      : after.type === 'long' ? 'start slower than you think and take on fuel from about 45 minutes'
      : after.type === 'race' ? 'trust the taper: start at goal pace, not faster'
      : 'arrive fresh: keep the day before it easy';
    nextTip = `${when} is ${after.title.toLowerCase()}: ${how}.`;
  }

  // ---- Badges and trend ----
  const badges: string[] = [];
  for (const d of PB_DISTANCES) {
    if (a.distanceM < d.m) continue;
    const h = pbHistory(all.filter((x) => x.startTime <= a.startTime), d.m);
    const last = h[h.length - 1];
    if (last?.activityId === a.id && h.length > 1) badges.push(`New ${d.label} best effort: ${duration(last.timeS)}`);
  }
  const year = a.startTime.slice(0, 4);
  const sameType = all.filter((x) => x.id !== a.id && x.distanceM >= 2000 && o.typeOf(x) === type && x.startTime < a.startTime);
  if (HARD.includes(type) || type === 'long') {
    const thisYear = sameType.filter((x) => x.startTime.startsWith(year));
    const pOf = (x: Activity) => x.movingS / (x.distanceM / 1000);
    if (thisYear.length >= 3 && thisYear.every((x) => pOf(x) > avgPace)) badges.push(`Fastest ${TYPE_LABEL[type].toLowerCase()} this year`);
  }
  const recent = sameType.slice(-7);
  const trend = recent.length >= 3 ? {
    labels: [...recent, a].map((x) => new Date(x.startTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
    paces: [...recent, a].map((x) => x.movingS / (x.distanceM / 1000)),
  } : undefined;

  return { verdict, breakdown, reps, target, goalNote, nextTip, badges, trend, weatherNote: weatherNote(a.weather, units) };
}

/** "Your week in review": volume against plan, sessions done, one insight, the focus for next week. */
export function weekReview(o: { weekStart: string; plan?: Plan; activities: Activity[]; units: Units }): { title: string; lines: string[] } | undefined {
  const { weekStart, plan, activities } = o;
  const end = ymd(addDays(parseYmd(weekStart), 6));
  const runs = activities.filter((a) => { const d = a.startTime.slice(0, 10); return d >= weekStart && d <= end; });
  const sessions = (plan?.sessions ?? []).filter((s) => s.date >= weekStart && s.date <= end && s.type !== 'rest');
  if (!runs.length && !sessions.length) return undefined;
  const km = runs.reduce((x, a) => x + a.distanceM, 0) / 1000;
  const plannedKm = sessions.reduce((x, s) => x + s.distanceM, 0) / 1000;
  const done = sessions.filter((s) => s.status === 'done').length;
  const keyMissed = sessions.filter((s) => s.status !== 'done' && ['threshold', 'vo2max', 'long', 'tempo', 'hills'].includes(s.type));
  const next = (plan?.sessions ?? []).filter((s) => s.date > end && s.date <= ymd(addDays(parseYmd(end), 7)) && s.type !== 'rest');
  const nextKey = next.find((s) => ['threshold', 'vo2max', 'long', 'race'].includes(s.type));
  const lines = [
    `${km.toFixed(1)} km${plannedKm ? ` of ${plannedKm.toFixed(0)} km planned` : ''} in ${runs.length} run${runs.length === 1 ? '' : 's'}.`,
    sessions.length ? `${done} of ${sessions.length} planned sessions done.` : '',
    keyMissed.length ? `Missed: ${keyMissed.map((s) => s.title.toLowerCase()).join(', ')}. One missed session costs very little; do not try to make it up.` : sessions.length && done === sessions.length ? 'Every planned session done. That consistency is what builds fitness.' : '',
    nextKey ? `Next week's key session: ${nextKey.title.toLowerCase()} on ${parseYmd(nextKey.date).toLocaleDateString('en-GB', { weekday: 'long' })}.` : '',
  ].filter(Boolean);
  return { title: `Your week in review · ${parseYmd(weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, lines };
}

export const weekStartOf = (d: string) => ymd(startOfWeek(parseYmd(d)));
