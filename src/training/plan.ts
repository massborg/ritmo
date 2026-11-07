// Adaptive training plans: generation by phase, and adaptation with explained changes.
import type { Activity, Phase, Plan, PlanChange, PlannedSession, Profile, SessionFeedback, SessionType } from '../lib/types';
import { addDays, daysBetween, DAY_NAMES, longDate, pace, parseYmd, startOfWeek, uid, weekday, ymd } from '../lib/format';

/** "Wednesday 28 October" for plan-change notes, so a note can never be mistaken for a different week. */
const dayLabel = (d: string) => longDate(parseYmd(d));
import type { TrainingPaces } from './fitness';
import { easyRun, generatePlan, type GenInput, type PlanProblem, restDay } from './generator';


export class PlanNotPossible extends Error {
  problem: PlanProblem;
  constructor(problem: PlanProblem) { super(problem.message); this.problem = problem; }
}

/** Builds a plan, or throws PlanNotPossible with the reason and options when the settings do not fit. */
export function buildPlan(input: GenInput): Plan {
  const r = generatePlan(input);
  if (!r.ok) throw new PlanNotPossible(r.problem);
  return r.plan;
}
export type PlanInput = GenInput;

export const PHASE_LABEL: Record<Phase, string> = {
  base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper', recovery: 'Recovery week', race: 'Race',
};
export const PHASE_EXPLAIN: Record<Phase, string> = {
  base: 'Building aerobic volume and durability with mostly easy running.',
  build: 'Adding threshold and VO2 max work on top of your base.',
  peak: 'Race-specific sessions at the paces you will need.',
  taper: 'Cutting volume so you arrive fresh, while keeping some intensity.',
  recovery: 'A lighter week so your body absorbs the last three.',
  race: 'Race week.',
};

const KEY: SessionType[] = ['long', 'threshold', 'vo2max', 'tempo', 'hills', 'race'];
const HARDER: SessionType[] = ['threshold', 'vo2max', 'tempo', 'hills'];

/**
 * Apply adaptations to a plan given what actually happened. Idempotent: each change has a stable id.
 */
export function adaptPlan(opts: {
  plan: Plan;
  activities: Activity[];
  feedback: SessionFeedback[];
  profile: Profile;
  today: Date;
  typeOf: (a: Activity) => SessionType;
  paces: TrainingPaces;
}): Plan {
  const { activities, feedback, profile, today, typeOf, paces } = opts;
  const plan: Plan = { ...opts.plan, sessions: opts.plan.sessions.map((s) => ({ ...s })), changes: [...opts.plan.changes] };
  const t = ymd(today);
  const has = (id: string) => plan.changes.some((c) => c.id === id);
  const log = (id: string, reason: PlanChange['reason'], summary: string) => {
    if (!has(id)) plan.changes.push({ id, at: new Date().toISOString(), reason, summary });
  };
  const byDate = new Map<string, Activity[]>();
  for (const a of activities) {
    const k = a.startTime.slice(0, 10);
    byDate.set(k, [...(byDate.get(k) ?? []), a]);
  }
  const used = new Set<string>();

  // 1) Match completed runs to planned sessions (same day first, then the day after)
  for (const s of plan.sessions) {
    if (s.type === 'rest' || s.date > t) continue;
    // The day's main run (the longest piece) completes the session, not a warm-up or strides file
    const longestFirst = (xs: Activity[]) => [...xs].sort((x, y) => y.distanceM - x.distanceM);
    const pick = longestFirst(byDate.get(s.date) ?? []).find((a) => !used.has(a.id))
      ?? (byDate.get(ymd(addDays(parseYmd(s.date), 1))) ?? []).find((a) => !used.has(a.id) && !plan.sessions.some((o) => o.date === a.startTime.slice(0, 10) && o.type !== 'rest'));
    if (pick) {
      used.add(pick.id);
      s.status = 'done';
      s.completedActivityId = pick.id;
    } else if (s.date < t && s.status === 'planned') {
      s.status = 'missed';
    }
  }

  const upcoming = plan.sessions.filter((s) => s.date >= t && s.status === 'planned');
  const toEasy = (s: PlannedSession, why: string) => {
    if (s.type === 'runwalk' || s.type === 'timetrial') { Object.assign(s, { ...walkSession(s.date, s.phase), id: s.id, purpose: `${why} ${walkSession(s.date, s.phase).purpose}` }); return; }
    const e = easyRun(s.date, Math.max(4, Math.round(s.distanceM / 1000 * 0.8)), s.phase, { paces });
    Object.assign(s, { ...e, id: s.id, title: 'Easy run (adjusted)', purpose: `${why} ${e.purpose}` });
  };

  // 1b) Runs on rest days (or before the plan started this week) still count. If the week would now
  // overshoot its target, the remaining easy runs this week are trimmed, and the change is explained.
  const wkStart = ymd(startOfWeek(today));
  const wkEnd = ymd(addDays(startOfWeek(today), 6));
  const target = plan.weeks?.find((w) => w.start === wkStart)?.targetKm;
  if (target) {
    const doneKm = activities.filter((a) => { const d = a.startTime.slice(0, 10); return d >= wkStart && d < t; }).reduce((x, a) => x + a.distanceM, 0) / 1000;
    const todayDone = (byDate.get(t) ?? []).reduce((x, a) => x + a.distanceM, 0) / 1000;
    const rest = plan.sessions.filter((s) => s.date >= t && s.date <= wkEnd && s.status === 'planned' && !(s.date === t && todayDone > 0));
    const over = doneKm + todayDone + rest.reduce((x, s) => x + s.distanceM, 0) / 1000 - target;
    const unplanned = activities.filter((a) => { const d = a.startTime.slice(0, 10); return d >= wkStart && d < t && !plan.sessions.some((s) => s.date === d && s.type !== 'rest'); });
    const id = `rebalance:${wkStart}:${unplanned.map((a) => a.id).join(',')}`;
    if (over > 3 && unplanned.length && !has(id)) {
      const easy = rest.filter((s) => s.type === 'easy' || s.type === 'recovery').sort((a, b) => b.distanceM - a.distanceM);
      let left = over;
      const notes: string[] = [];
      for (const s of easy) {
        if (left <= 0.5) break;
        const before = s.distanceM / 1000;
        const after = Math.max(0, Math.round((before - left) * 10) / 10);
        if (after < 4) { Object.assign(s, { ...restDay(s.date, s.phase, 'Rest instead of an easy run, because you have already run extra this week.'), id: s.id }); notes.push(`${dayLabel(s.date)}: ${before.toFixed(1)} km easy → rest`); left -= before; }
        else { const e = easyRun(s.date, after, s.phase, { paces }); Object.assign(s, { ...e, id: s.id, title: `${s.title} (shortened)` }); notes.push(`${dayLabel(s.date)}: ${before.toFixed(1)} → ${after.toFixed(1)} km`); left -= before - after; }
      }
      if (notes.length) log(id, 'rebuilt', `You ran ${unplanned.reduce((x, a) => x + a.distanceM, 0) / 1000 > 0 ? (unplanned.reduce((x, a) => x + a.distanceM, 0) / 1000).toFixed(1) : '0'} km on days with no session planned, so this week was heading ${over.toFixed(0)} km over its ${target} km target. Easy runs adjusted: ${notes.join('; ')}. Key sessions stay as planned.`);
    }
  }

  // 2) Missed sessions
  const recentMissed = plan.sessions.filter((s) => s.status === 'missed' && daysBetween(parseYmd(s.date), today) <= 7);
  for (const s of recentMissed.filter((x) => KEY.includes(x.type) && daysBetween(parseYmd(x.date), today) <= 3)) {
    log(`missed:${s.id}`, 'missed', `You missed ${s.title.toLowerCase()} on ${dayLabel(s.date)}. We will not squeeze it in on top of other sessions: one missed session costs almost nothing, but cramming raises injury risk. The rest of the week stays as planned.`);
  }
  if (recentMissed.length >= 3) {
    const nextWeek = upcoming.filter((s) => daysBetween(today, parseYmd(s.date)) < 7);
    const q = nextWeek.find((s) => ['threshold', 'vo2max', 'tempo', 'hills'].includes(s.type));
    if (q && !has(`missedmany:${q.id}`)) {
      toEasy(q, 'Adjusted after a few missed days.');
      for (const s of nextWeek.filter((x) => x.type === 'long')) s.distanceM = Math.round(s.distanceM * 0.85 / 1000) * 1000;
      log(`missedmany:${q.id}`, 'missed', `You missed ${recentMissed.length} sessions in the past week, so this week eases back in: one quality session becomes easy and the long run is about 15% shorter. Coming back gradually is safer than picking up where you left off.`);
    }
  }

  // 3) Harder than planned: an easy day run as tempo or faster, or far longer than planned
  for (const s of plan.sessions.filter((x) => x.status === 'done' && daysBetween(parseYmd(x.date), today) <= 2 && daysBetween(parseYmd(x.date), today) >= 0)) {
    const a = activities.find((x) => x.id === s.completedActivityId);
    if (!a) continue;
    const actualType = typeOf(a);
    const ranHard = ['easy', 'recovery'].includes(s.type) && ['tempo', 'threshold', 'vo2max', 'race'].includes(actualType);
    const ranLong = s.distanceM > 0 && a.distanceM > s.distanceM * 1.3 && a.distanceM - s.distanceM > 3000;
    if (ranHard || ranLong) {
      const nextQ = upcoming.find((x) => ['threshold', 'vo2max', 'tempo', 'hills'].includes(x.type) && daysBetween(parseYmd(s.date), parseYmd(x.date)) <= 2);
      if (nextQ && !has(`harder:${s.id}`)) {
        toEasy(nextQ, 'Adjusted because your last run was harder than planned.');
        log(`harder:${s.id}`, 'harder', `Your ${dayLabel(s.date)} run was ${ranHard ? `a ${actualType} effort instead of easy` : `${((a.distanceM - s.distanceM) / 1000).toFixed(0)} km longer than planned`}. To keep fatigue in check, ${dayLabel(nextQ.date)}'s quality session is now an easy run.`);
      } else if (!has(`harder:${s.id}`)) {
        log(`harder:${s.id}`, 'harder', `Your ${dayLabel(s.date)} run was harder than planned. No change needed, but keep the next easy day truly easy.`);
      }
    }
    const ranEasy = ['threshold', 'vo2max', 'tempo'].includes(s.type) && ['easy', 'recovery'].includes(actualType);
    if (ranEasy) log(`easier:${s.id}`, 'easier', `${s.title} on ${dayLabel(s.date)} ended up as an easy run. That is fine occasionally. Your next quality session stays as planned rather than doubling up.`);
  }

  // 3b) Beginners: repeat instead of progressing when a run/walk felt very hard, or after missed sessions
  const doneRW = plan.sessions.filter((x) => x.status === 'done' && (x.type === 'runwalk') && x.date < t).sort((x, y) => y.date.localeCompare(x.date))[0];
  const upcomingRW = upcoming.filter((x) => x.type === 'runwalk');
  const nextRW = upcomingRW[0];
  if (doneRW && nextRW) {
    const fb = feedback.find((f) => f.activityId === doneRW.completedActivityId);
    const veryHard = fb && (fb.feel === 1 || (fb.feel === 2 && (fb.rpe ?? 0) >= 9));
    if (veryHard && !has(`repeat:${doneRW.id}`)) {
      // Hold back the next step up: the next session that would progress repeats this level instead
      const stepUp = upcomingRW.slice(0, 3).find((x) => x.title !== doneRW.title);
      if (stepUp) Object.assign(stepUp, { title: doneRW.title, steps: doneRW.steps, durationS: doneRW.durationS, purpose: `A repeat of an earlier level, because your run on ${dayLabel(doneRW.date)} felt very hard. ${doneRW.purpose}` });
      log(`repeat:${doneRW.id}`, 'harder', `Your run/walk on ${dayLabel(doneRW.date)} felt very hard, so your next sessions stay at this level before moving on. Repeating a step is normal and smart: you will move on when it feels comfortable.`);
    }
  }
  const missedRW = plan.sessions.filter((x) => x.type === 'runwalk' && x.status === 'missed' && daysBetween(parseYmd(x.date), today) <= 10);
  if (missedRW.length >= 2 && nextRW) {
    const id = `missedrw:${missedRW[missedRW.length - 1].id}`;
    const level = doneRW ?? missedRW[0];
    if (!has(id) && level && nextRW.title !== level.title) {
      Object.assign(nextRW, { title: level.title, steps: level.steps, durationS: level.durationS, purpose: `Picking up where you left off. ${level.purpose}` });
      log(id, 'missed', `A couple of sessions did not happen, and that is fine. Your next session picks up at the level you last ran, so you ease back in without a jump.`);
    }
  }

  // 3c) Temporary changes the runner asked for: easier, no pace targets, or travel
  const adj = profile.adjust;
  if (adj && adj.until >= t) {
    const id = `adjust:${adj.kind}:${adj.from}:${adj.until}`;
    const inRange = upcoming.filter((s) => s.date >= adj.from && s.date <= adj.until && s.type !== 'race' && s.type !== 'rest');
    if (!has(id)) {
      for (const s of inRange) {
        if (adj.kind === 'easier' && HARDER.includes(s.type)) toEasy(s, 'Easier for a few days, as you asked.');
        if (adj.kind === 'easier' && s.type === 'long') Object.assign(s, { ...easyRun(s.date, Math.max(6, Math.round(s.distanceM / 1000 * 0.7)), s.phase, { paces }), id: s.id, title: 'Long run, easier', type: 'long' });
        if (adj.kind === 'travel') {
          const km = Math.min(s.distanceM / 1000, Math.round(45 * 60 / ((paces.easy[0] + paces.easy[1]) / 2) * 10) / 10);
          Object.assign(s, { ...easyRun(s.date, Math.max(3, km), s.phase, { paces }, { why: 'Travel mode: an easy run of up to 45 minutes, or skip it if the day is too full. Any running keeps your fitness ticking over.' }), id: s.id, title: 'Easy run (travel)' });
        }
        if (adj.kind === 'nopace') {
          s.paceTarget = undefined;
          s.steps = s.steps.map((x) => ({ ...x, pace: undefined, detail: x.detail.replace(/at \d+:\d\d–\d+:\d\d\/km/g, x.kind === 'easy' || x.kind === 'warmup' || x.kind === 'cooldown' ? 'by feel, conversational' : 'by effort').replace(/around \d+:\d\d\/km/g, 'quick and relaxed') }));
          s.purpose = `${s.purpose} Run it by feel for now: no pace targets until ${dayLabel(adj.until)}.`;
        }
      }
      const what = adj.kind === 'easier' ? 'hard sessions are easy runs and long runs are shorter' : adj.kind === 'travel' ? 'sessions are easy runs of up to 45 minutes' : 'sessions have no pace targets: run them by feel';
      log(id, adj.kind === 'easier' ? 'harder' : 'rebuilt', `You asked for ${adj.kind === 'travel' ? 'travel mode' : adj.kind === 'easier' ? 'an easier few days' : 'no pace targets'} from ${dayLabel(adj.from)} to ${dayLabel(adj.until)}, so ${what}. Afterwards the plan picks up where it was, with the first hard session kept a little shorter.`);
      // Guide back: the first hard session after the period is shortened
      const back = upcoming.find((s) => s.date > adj.until && HARDER.includes(s.type));
      if (back && adj.kind !== 'nopace') { back.distanceM = Math.round(back.distanceM * 0.85 / 100) * 100; back.durationS = Math.round(back.durationS * 0.85); back.purpose = `First hard session back: a little shorter than usual. ${back.purpose}`; }
    }
  }

  // 4) Illness
  if (profile.illnessUntil && profile.illnessUntil >= t) {
    const id = `illness:${profile.illnessUntil}`;
    if (!has(id)) {
      for (const s of upcoming) {
        if (s.date <= profile.illnessUntil && s.type !== 'race') Object.assign(s, { ...restDay(s.date, s.phase), id: s.id });
        else if (daysBetween(parseYmd(profile.illnessUntil), parseYmd(s.date)) <= 4 && s.type !== 'rest' && s.type !== 'race') toEasy(s, 'Easing back after illness.');
      }
      log(id, 'illness', `You reported feeling unwell. Sessions until ${profile.illnessUntil} are now rest, and the following four days are easy only. If you had a fever or chest symptoms, wait until you have been symptom-free for at least a day before running.`);
    }
  }

  // 5) Pain
  const painFb = feedback.filter((f) => f.pain.some((x) => x.severity >= 2 || /chest|dizz/i.test(x.area)) && daysBetween(new Date(f.loggedAt), today) <= 2);
  for (const f of painFb) {
    const id = `pain:${f.activityId}`;
    if (has(id)) continue;
    const next2 = upcoming.filter((s) => daysBetween(today, parseYmd(s.date)) <= 2 && s.type !== 'rest' && s.type !== 'race');
    next2.forEach((s, i) => (i === 0 ? Object.assign(s, { ...restDay(s.date, s.phase), id: s.id }) : toEasy(s, 'Adjusted because you logged pain.')));
    log(id, 'pain', `You logged ${f.pain.map((x) => x.area.toLowerCase()).join(' and ')} pain, so the next two days are rest and easy running. This is coaching, not medical advice: if pain persists, gets worse or changes how you run, please see a physio or doctor.${f.pain.some((x) => /chest|dizz/i.test(x.area)) ? ' Chest pain, dizziness or fainting need medical advice before you exercise again.' : ''}`);
  }

  // 6) Load spike check on the coming week
  // Compare with the biggest of the last four weeks, so a planned recovery week does not make normal training look like a spike
  const weekTotals = [0, 1, 2, 3].map((w) => activities.filter((a) => { const d = daysBetween(new Date(a.startTime), today); return d >= w * 7 + 1 && d <= w * 7 + 7; }).reduce((x, a) => x + a.distanceM, 0));
  const avgWeek = Math.max(weekTotals.reduce((x, y) => x + y, 0) / 4, Math.max(...weekTotals) * 0.95);
  const comingWeek = plan.sessions.filter((s) => { const d = daysBetween(today, parseYmd(s.date)); return d >= 0 && d < 7 && s.status === 'planned'; });
  const comingKm = comingWeek.reduce((x, s) => x + s.distanceM, 0);
  if (avgWeek > 5000 && comingKm > avgWeek * 1.3 && !comingWeek.some((s) => s.type === 'race')) {
    const id = `spike:${ymd(startOfWeek(today))}`;
    if (!has(id)) {
      const scale = (avgWeek * 1.2) / comingKm;
      for (const s of comingWeek) if (s.type === 'easy' || s.type === 'long') s.distanceM = Math.round((s.distanceM * scale) / 1000) * 1000;
      log(id, 'rebuilt', `The next 7 days were ${Math.round(comingKm / 1000)} km against your recent average of ${Math.round(avgWeek / 1000)} km in your recent big weeks. Jumps above about 30% are linked to higher injury risk, so easy and long runs are trimmed to keep the increase near 20%.`);
    }
  }
  return plan;
}

/** Swap two sessions' dates, or move one onto a rest day. */
/** Days a session can move to: another day in the same week, not in the past. Done sessions stay put. */
export function moveTargets(s: PlannedSession, today: Date): string[] {
  if (s.completedActivityId || s.date < ymd(today)) return [];
  const ws = startOfWeek(parseYmd(s.date));
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i))).filter((d) => d !== s.date && d >= ymd(today));
}

/** True when moving a hard session to toDate puts it next to another hard day (the runner may still choose to). */
export function moveClash(plan: Plan, s: PlannedSession, toDate: string): boolean {
  if (!KEY.includes(s.type)) return false;
  const near = [ymd(addDays(parseYmd(toDate), -1)), ymd(addDays(parseYmd(toDate), 1))]
    .map((x) => plan.sessions.find((y) => y.date === x && y.id !== s.id && y.date !== s.date));
  return near.some((y) => y && KEY.includes(y.type));
}

export function moveSession(plan: Plan, sessionId: string, toDate: string): Plan {
  const sessions = plan.sessions.map((s) => ({ ...s }));
  const a = sessions.find((s) => s.id === sessionId);
  if (!a) return plan;
  const b = sessions.find((s) => s.date === toDate);
  const from = a.date;
  a.date = toDate;
  a.movedFrom = from;
  a.status = 'planned'; // a session moved to another day is planned again (even if it was missed)
  if (b) { b.date = from; b.movedFrom = toDate; }
  sessions.sort((x, y) => x.date.localeCompare(y.date));
  const warn = b && KEY.includes(b.type) && KEY.includes(a.type) && Math.abs(daysBetween(parseYmd(from), parseYmd(toDate))) === 1;
  return {
    ...plan,
    sessions,
    changes: [...plan.changes, {
      id: uid(), at: new Date().toISOString(), reason: 'moved',
      summary: `Moved ${a.title.toLowerCase()} from ${dayLabel(from)} to ${dayLabel(toDate)}${b ? ` and ${b.title.toLowerCase()} to ${dayLabel(from)}` : ''}.${warn ? ' Two hard sessions are now on back-to-back days, so take the second one a little easier.' : ''}`,
    }],
  };
}

// ---------------------------------------------------------------------------
// Beginner run/walk plan: effort-based (no paces), three days a week with rest between,
// building to 30 minutes of continuous running, then a 5K time trial that unlocks full features.

/** [run seconds, walk seconds, repeats] per week */
const STARTER_LEVELS: [number, number, number][] = [
  [60, 90, 8], [90, 120, 6], [120, 120, 6], [180, 90, 5], [300, 120, 4], [480, 120, 3], [600, 90, 3], [900, 120, 2],
];
const FIRST_STEPS: [number, number, number] = [45, 105, 8];
const fmtS = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : sec > 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec} s`);

function walkSession(date: string, phase: Phase): PlannedSession {
  return {
    id: uid(), date, phase, status: 'planned', type: 'recovery', title: 'Easy walk', focus: 'Recovery',
    purpose: 'A gentle 20 to 30 minute walk keeps you moving while your body recovers.',
    howItHelps: 'Recovering well now means you come back stronger.',
    steps: [{ label: '20–30 min walk', detail: 'relaxed pace, stop if anything hurts' }],
    distanceM: 0, durationS: 25 * 60,
  };
}

function runWalkSession(date: string, level: [number, number, number], week: number, weeks: number, phase: Phase): PlannedSession {
  const [run, walk, reps] = level;
  const continuous = reps === 1;
  const main = continuous ? `${fmtS(run)} easy running` : `${reps} x (${fmtS(run)} running + ${fmtS(walk)} walking)`;
  return {
    id: uid(), date, phase, status: 'planned', type: 'runwalk',
    title: continuous ? `Run ${fmtS(run)}` : `Run/walk: ${reps} x ${fmtS(run)}`,
    focus: 'Building up',
    purpose: 'Short running spells with walking breaks let your heart, lungs, muscles and tendons adapt gradually, so you build fitness without getting hurt.',
    howItHelps: `Week ${week} of ${weeks}. You are building to 30 minutes of continuous running.`,
    steps: [
      { label: 'Warm up', detail: '5 min brisk walk' },
      { label: main, detail: 'easy effort: you can talk in full sentences. Slow down if you cannot.' },
      { label: 'Cool down', detail: '5 min easy walk' },
    ],
    distanceM: 0,
    durationS: 600 + reps * run + (reps - 1) * walk,
  };
}

function timeTrialSession(date: string, phase: Phase): PlannedSession {
  return {
    id: uid(), date, phase, status: 'planned', type: 'timetrial', title: 'Your first 5K', focus: 'Fitness test',
    purpose: 'A steady 5 km at a comfortably hard effort. Your time sets your training paces and unlocks race predictions.',
    howItHelps: 'From here Ritmo can build a full plan for a 5K, 10K or longer goal.',
    steps: [
      { label: 'Warm up', detail: '10 min brisk walk with a few short jogs' },
      { label: '5 km steady', detail: 'even effort, comfortably hard. Walk breaks are fine.' },
      { label: 'Cool down', detail: '5–10 min easy walk' },
    ],
    distanceM: 5000, durationS: 40 * 60,
  };
}

/** Pick up to three training days with at least one rest day between them. */
export function pickStarterDays(available: number[]): number[] {
  const days = [...new Set(available)].sort((a, b) => a - b);
  const picked: number[] = [];
  for (const d of days) {
    if (picked.length >= 3) break;
    const prev = picked[picked.length - 1];
    if (prev !== undefined && d - prev < 2) continue;
    if (picked.length === 2 && (picked[0] + 7) - d < 2) continue; // keep Sunday and Monday apart
    picked.push(d);
  }
  if (picked.length < 2) return days.slice(0, Math.min(3, days.length));
  return picked;
}

export function buildStarterPlan(input: { today: Date; profile: Profile; canRun10: boolean; walksRegularly: boolean }): Plan {
  const { today, profile, canRun10, walksRegularly } = input;
  let levels = canRun10 ? STARTER_LEVELS.slice(4) : STARTER_LEVELS;
  if (!canRun10 && !walksRegularly) levels = [FIRST_STEPS, ...levels];
  const days = pickStarterDays(profile.daysAvailable.length ? profile.daysAvailable : [1, 3, 5]);
  // flat list of sessions; the last week is 20, 25 then 30 minutes continuous, then the time trial
  const flat: { make: (date: string, week: number, weeks: number, phase: Phase) => PlannedSession }[] = [];
  for (const lv of levels) for (let i = 0; i < 3; i++) flat.push({ make: (d, w, n, ph) => runWalkSession(d, lv, w, n, ph) });
  for (const min of [20, 25, 30]) flat.push({ make: (d, w, n, ph) => runWalkSession(d, [min * 60, 0, 1], w, n, ph) });
  flat.push({ make: (d, _w, _n, ph) => timeTrialSession(d, ph) });
  const weeks = Math.ceil(flat.length / days.length);

  const sessions: PlannedSession[] = [];
  const start = parseYmd(ymd(today));
  let i = 0;
  let d = start;
  let firstDate: string | undefined;
  while (i < flat.length) {
    const key = ymd(d);
    const dow = weekday(d);
    const week = Math.floor(i / days.length) + 1;
    const phase: Phase = week <= Math.ceil(weeks / 2) ? 'base' : 'build';
    if (days.includes(dow)) {
      sessions.push(flat[i].make(key, week, weeks, phase));
      firstDate ??= key;
      i++;
    } else if (firstDate) {
      sessions.push({ ...restDay(key, phase), purpose: 'Rest days are when your body adapts and gets stronger. A gentle walk is fine.' });
    }
    d = addDays(d, 1);
  }
  const end = sessions[sessions.length - 1].date;
  const mid = sessions.find((x) => x.phase === 'build')?.date ?? end;
  const dayNames = days.map((x) => DAY_NAMES[x]).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const first = levels[0];
  return {
    id: uid(), createdAt: new Date().toISOString(), startDate: firstDate ?? ymd(start), endDate: end,
    phases: [{ phase: 'base', start: firstDate ?? ymd(start), end: ymd(addDays(parseYmd(mid), -1)) }, { phase: 'build', start: mid, end }],
    sessions,
    changes: [{
      id: 'built', at: new Date().toISOString(), reason: 'rebuilt',
      summary: `Built a ${weeks}-week run/walk plan on ${dayNames}. You start with ${first[2]} x ${fmtS(first[0])} of easy running with walking breaks and build to 30 minutes of continuous running, then a 5K at your own pace. Go by feel: you should be able to talk the whole time.`,
    }],
  };
}

/** A key session missed recently that the runner has not dealt with yet */
export function missedKeySession(plan: Plan, today: Date): PlannedSession | undefined {
  const t = ymd(today);
  const wkEnd = ymd(addDays(startOfWeek(today), 6));
  return plan.sessions.filter((s) => s.status === 'missed' && KEY.includes(s.type) && s.type !== 'race' && daysBetween(parseYmd(s.date), today) <= 3 && s.date < t && wkEnd >= s.date
    && !plan.changes.some((c) => c.id === `missed-handled:${s.id}`)).sort((a, b) => b.date.localeCompare(a.date))[0];
}

/**
 * Days a missed key session could move to: later this week, onto an easy or rest day, never next to
 * another hard day, and not in the last two days before a race.
 */
export function missedMoveOptions(plan: Plan, sessionId: string, today: Date): string[] {
  const s = plan.sessions.find((x) => x.id === sessionId);
  if (!s) return [];
  const t = ymd(today);
  const wkEnd = ymd(addDays(startOfWeek(today), 6));
  const race = plan.sessions.find((x) => x.type === 'race');
  const hardOn = (d: string) => plan.sessions.some((x) => x.date === d && x.id !== s.id && KEY.includes(x.type));
  const out: string[] = [];
  for (let d = t; d <= wkEnd; d = ymd(addDays(parseYmd(d), 1))) {
    const on = plan.sessions.find((x) => x.date === d);
    if (on && !['easy', 'recovery', 'rest'].includes(on.type)) continue;
    if (race && daysBetween(parseYmd(d), parseYmd(race.date)) <= 2) continue;
    if (hardOn(ymd(addDays(parseYmd(d), -1))) || hardOn(ymd(addDays(parseYmd(d), 1)))) continue;
    out.push(d);
  }
  return out;
}

/** Record that the runner chose to let a missed session go, so they are not asked again */
export function dropMissed(plan: Plan, sessionId: string, movedFrom?: string): Plan {
  const s = plan.sessions.find((x) => x.id === sessionId);
  if (!s) return plan;
  const summary = movedFrom
    ? `${s.title} moved from ${dayLabel(movedFrom)}, when it was missed, to ${dayLabel(s.date)}, with an easier day either side.`
    : `You let ${s.title.toLowerCase()} on ${dayLabel(s.date)} go. That is fine: one missed session costs almost nothing, and the rest of the week stays as planned.`;
  return { ...plan, changes: [...plan.changes, { id: `missed-handled:${s.id}`, at: new Date().toISOString(), reason: 'missed', summary }] };
}

/** Runs on days with no session planned (rest days, or before the plan started) */
export function isUnplanned(plan: Plan | undefined, date: string): boolean {
  if (!plan) return false;
  const s = plan.sessions.find((x) => x.date === date);
  return !s || s.type === 'rest';
}

export type SwapKind = 'shorter' | 'easy' | 'treadmill' | 'similar';

/** Change one planned session at the runner's request, with the reason logged. */
export function swapSession(plan: Plan, sessionId: string, kind: SwapKind, paces: TrainingPaces): Plan {
  const sessions = plan.sessions.map((s) => ({ ...s }));
  const s = sessions.find((x) => x.id === sessionId);
  if (!s || s.type === 'rest' || s.type === 'race') return plan;
  const before = `${s.title} (${(s.distanceM / 1000).toFixed(1)} km)`;
  if (kind === 'shorter') {
    const f = 0.7;
    s.steps = s.steps.map((x) => (x.kind === 'warmup' || x.kind === 'cooldown' || x.kind === 'easy' || x.kind === 'steady' ? { ...x, km: x.km ? Math.round(x.km * f * 10) / 10 : x.km, durationS: x.durationS ? Math.round(x.durationS * f) : x.durationS, label: x.kind === 'easy' && x.km ? `${Math.round(x.km * f * 10) / 10} km easy` : x.label } : x));
    s.distanceM = Math.round(s.steps.reduce((a, x) => a + (x.km ?? 0), 0) * 1000) || Math.round(s.distanceM * f);
    s.durationS = Math.round(s.steps.reduce((a, x) => a + (x.durationS ?? 0), 0)) || Math.round(s.durationS * f);
    s.title = `${s.title.replace(/ \(shorter\)$/, '')} (shorter)`;
  } else if (kind === 'easy') {
    Object.assign(s, { ...easyRun(s.date, Math.max(4, Math.round(s.distanceM / 1000 * 0.8)), s.phase, { paces }), id: s.id, title: 'Easy run (swapped)' });
  } else if (kind === 'treadmill') {
    s.title = `${s.title.replace(/ \(treadmill\)$/, '')} (treadmill)`;
    s.steps = [...s.steps, { label: 'Treadmill', detail: 'Set a 1% incline to match outdoor effort. Use the same paces; for reps, change the speed at the start of each rep and give the belt a few seconds to catch up.' }];
  } else {
    const alt: Record<string, string> = { threshold: 'vo2max', vo2max: 'threshold', tempo: 'threshold', hills: 'threshold', long: 'long', easy: 'easy', recovery: 'easy' };
    if (s.type === 'threshold' || s.type === 'tempo' || s.type === 'hills') {
      s.title = 'Fartlek: 8 x 2 min'; s.focus = 'Threshold'; s.type = 'threshold';
      s.steps = [s.steps[0], { kind: 'work', label: '8 x 2 min comfortably hard', detail: `at about ${pace(paces.threshold[0], 'km', false)}–${pace(paces.threshold[1], 'km', false)}/km, 1 min easy jog between, on any route`, km: Math.round((16 * 60 / ((paces.threshold[0] + paces.threshold[1]) / 2) + 7 * 60 / ((paces.recovery[0] + paces.recovery[1]) / 2)) * 10) / 10, durationS: 16 * 60 + 7 * 60, zones: [4] }, s.steps[s.steps.length - 1]];
      s.purpose = 'A flexible version of today\'s threshold work that needs no track or measured route.';
    } else if (s.type === 'vo2max') {
      s.title = 'Hill reps: 8 x 90 s'; s.focus = 'Intervals';
      s.steps = [s.steps[0], { kind: 'work', label: '8 x 90 s uphill', detail: 'hard but controlled on a steady hill, jog back down', km: Math.round((8 * 90 / ((paces.interval[0] + paces.interval[1]) / 2) * 0.85 + 8 * 90 / ((paces.recovery[0] + paces.recovery[1]) / 2)) * 10) / 10, durationS: 8 * 180, zones: [5] }, s.steps[s.steps.length - 1]];
      s.purpose = 'Hill reps give a similar VO2 max stimulus with less impact, and work anywhere with a slope.';
    } else {
      s.title = `${s.title} (any route)`;
    }
    void alt;
    s.distanceM = Math.round(s.steps.reduce((a, x) => a + (x.km ?? 0), 0) * 1000) || s.distanceM;
    s.durationS = Math.round(s.steps.reduce((a, x) => a + (x.durationS ?? 0), 0)) || s.durationS;
  }
  const after = `${s.title} (${(s.distanceM / 1000).toFixed(1)} km)`;
  return { ...plan, sessions, changes: [...plan.changes, { id: uid(), at: new Date().toISOString(), reason: 'moved', summary: `${dayLabel(s.date)}: ${before} → ${after}, at your request.` }] };
}
