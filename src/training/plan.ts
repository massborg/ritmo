// Adaptive training plans: generation by phase, and adaptation with explained changes.
import type { Activity, Phase, Plan, PlanChange, PlannedSession, Profile, Race, SessionFeedback, SessionStep, SessionType } from '../lib/types';
import { addDays, clamp, daysBetween, DAY_NAMES, distanceLabel, parseYmd, startOfWeek, uid, weekday, ymd } from '../lib/format';
import type { TrainingPaces } from './fitness';

const p = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
const pr = (r: [number, number]) => `${p(r[0])}–${p(r[1])}/km`;

interface Ctx {
  paces: TrainingPaces;
  race?: Race;
  goalLabel: string;
}

const PEAK_BY_DISTANCE = (m: number) => (m >= 40000 ? 70 : m >= 20000 ? 55 : m >= 9000 ? 45 : 35);
const LONG_CAP = (m: number) => (m >= 40000 ? 32 : m >= 20000 ? 22 : m >= 9000 ? 18 : 14);

function easySession(date: string, km: number, phase: Phase, ctx: Ctx, recovery = false): PlannedSession {
  const pace = recovery ? ctx.paces.recovery : ctx.paces.easy;
  return {
    id: uid(), date, phase, status: 'planned',
    type: recovery ? 'recovery' : 'easy',
    title: recovery ? 'Recovery run' : 'Easy run',
    focus: recovery ? 'Recovery' : 'Aerobic base',
    purpose: recovery
      ? 'Gentle running that helps your legs recover from harder work without adding fatigue.'
      : 'Builds your aerobic engine: more capillaries, more mitochondria, stronger tendons. Most of your fitness comes from runs like this.',
    howItHelps: `A bigger aerobic base lets you hold goal pace for longer on race day${ctx.race ? ` at ${ctx.race.name}` : ''}.`,
    steps: [{ label: `${km.toFixed(0)} km relaxed`, detail: `at ${pr(pace)}, conversational, heart rate in Z${recovery ? 1 : 2}` }],
    distanceM: km * 1000,
    durationS: km * (pace[0] + pace[1]) / 2,
    paceTarget: { minSPerKm: pace[0], maxSPerKm: pace[1] },
    hrZones: recovery ? [1] : [2],
  };
}

function longSession(date: string, km: number, phase: Phase, ctx: Ctx): PlannedSession {
  const isMarathon = (ctx.race?.distanceM ?? 0) >= 40000;
  const steps: SessionStep[] = [];
  let title = 'Long run';
  let focus = 'Endurance';
  if ((phase === 'peak' || phase === 'build') && isMarathon && km >= 22) {
    const mpKm = Math.round(km * (phase === 'peak' ? 0.45 : 0.3));
    title = 'Long run with marathon pace';
    focus = 'Marathon specific';
    steps.push({ label: `${km - mpKm} km easy`, detail: `at ${pr(ctx.paces.long)}` });
    steps.push({ label: `${mpKm} km at marathon pace`, detail: `at ${pr(ctx.paces.marathon)}, practise drinking and fuelling` });
  } else if (phase === 'peak' && (ctx.race?.distanceM ?? 0) >= 20000 && km >= 16) {
    title = 'Long run with a fast finish';
    steps.push({ label: `${km - 5} km easy`, detail: `at ${pr(ctx.paces.long)}` });
    steps.push({ label: '5 km steady', detail: `at ${pr(ctx.paces.marathon)}, finishing strong` });
  } else {
    steps.push({ label: `${km.toFixed(0)} km steady and relaxed`, detail: `at ${pr(ctx.paces.long)}, heart rate in Z2` });
  }
  return {
    id: uid(), date, phase, status: 'planned', type: 'long', title, focus,
    purpose: 'Teaches your body to burn fat efficiently, strengthens legs and builds the confidence to go the distance.',
    howItHelps: isMarathon ? 'The single most important session for a strong marathon.' : 'Endurance means you slow down less at the end of your race.',
    steps, distanceM: km * 1000, durationS: km * (ctx.paces.long[0] + ctx.paces.long[1]) / 2,
    paceTarget: { minSPerKm: ctx.paces.long[0], maxSPerKm: ctx.paces.long[1] }, hrZones: [2],
  };
}

function qualitySession(date: string, kind: SessionType, km: number, phase: Phase, ctx: Ctx): PlannedSession {
  const P = ctx.paces;
  const wu: SessionStep = { label: 'Warm up', detail: `2 km easy at ${pr(P.easy)}, then 4 relaxed strides` };
  const cd: SessionStep = { label: 'Cool down', detail: `2 km easy at ${pr(P.easy)}` };
  let s: Omit<PlannedSession, 'id' | 'date' | 'phase' | 'status' | 'distanceM' | 'durationS'>;
  switch (kind) {
    case 'threshold': {
      const reps = phase === 'base' ? 3 : phase === 'build' ? 4 : 5;
      s = {
        type: 'threshold', title: `Threshold: ${reps} x 1.6 km`, focus: 'Threshold',
        purpose: 'Raises the pace you can hold before lactate builds up fast. This is the pace you could race for about an hour.',
        howItHelps: 'A higher threshold makes every race pace from 10K to marathon feel more controlled.',
        steps: [wu, { label: `${reps} x 1.6 km`, detail: `at ${pr(P.threshold)}, comfortably hard, 90 s easy jog between` }, cd],
        paceTarget: { minSPerKm: P.threshold[0], maxSPerKm: P.threshold[1] }, hrZones: [4],
      };
      break;
    }
    case 'vo2max': {
      const reps = phase === 'build' ? 5 : 6;
      s = {
        type: 'vo2max', title: `VO2 max: ${reps} x 1 km`, focus: 'VO2 max',
        purpose: 'Pushes your heart and lungs close to their maximum, which raises the ceiling of your aerobic fitness.',
        howItHelps: 'A higher ceiling makes your goal pace a smaller percentage of your maximum.',
        steps: [wu, { label: `${reps} x 1 km`, detail: `at ${pr(P.interval)}, hard but controlled, 2 min jog between` }, cd],
        paceTarget: { minSPerKm: P.interval[0], maxSPerKm: P.interval[1] }, hrZones: [5],
      };
      break;
    }
    case 'tempo': {
      const tk = clamp(Math.round(km - 4), 4, 12);
      const isM = (ctx.race?.distanceM ?? 0) >= 40000;
      s = {
        type: 'tempo', title: isM ? `Marathon pace: ${tk} km` : `Tempo: ${tk} km`, focus: isM ? 'Marathon pace' : 'Tempo',
        purpose: isM ? 'Rehearses the exact rhythm you will hold on race day so it becomes automatic.' : 'Steady running just below threshold that builds stamina at faster paces.',
        howItHelps: 'Makes sustained, honest effort feel familiar.',
        steps: [wu, { label: `${tk} km steady`, detail: `at ${pr(P.marathon)}, Z3` }, cd],
        paceTarget: { minSPerKm: P.marathon[0], maxSPerKm: P.marathon[1] }, hrZones: [3],
      };
      break;
    }
    case 'hills':
      s = {
        type: 'hills', title: 'Hills: 8 x 60 s', focus: 'Hill strength',
        purpose: 'Running uphill builds leg strength and power with less impact than flat speed work.',
        howItHelps: 'Stronger legs hold their form late in a race.',
        steps: [wu, { label: '8 x 60 s uphill', detail: 'strong effort on a steady 4–6% hill, jog back down' }, cd],
        hrZones: [4, 5],
      };
      break;
    case 'speed':
    default:
      s = {
        type: 'speed', title: 'Easy run with strides', focus: 'Speed',
        purpose: 'Short, relaxed bursts that keep your legs quick and your form efficient without tiring you.',
        howItHelps: 'Good running economy means every pace costs less energy.',
        steps: [{ label: `${Math.max(4, km - 1).toFixed(0)} km easy`, detail: `at ${pr(P.easy)}` }, { label: '6 x 20 s strides', detail: `quick and relaxed around ${p(P.repetition[0])}/km, full recovery` }],
        paceTarget: { minSPerKm: P.easy[0], maxSPerKm: P.easy[1] }, hrZones: [2],
      };
  }
  const avgPace = s.paceTarget ? (s.paceTarget.minSPerKm + s.paceTarget.maxSPerKm) / 2 : P.easy[0];
  return { ...s, id: uid(), date, phase, status: 'planned', distanceM: km * 1000, durationS: km * (avgPace * 0.4 + P.easy[1] * 0.6) };
}

function raceSession(date: string, race: Race, ctx: Ctx): PlannedSession {
  return {
    id: uid(), date, phase: 'race', status: 'planned', type: 'race', title: race.name, focus: 'Race',
    purpose: 'Race day. Everything you have done has been building to this.',
    howItHelps: 'Run your pacing plan, start controlled and finish strong.',
    steps: [{ label: 'Race', detail: `${distanceLabel(race.distanceM)}${race.goalS ? `, goal ${Math.floor(race.goalS / 3600)}:${String(Math.floor((race.goalS % 3600) / 60)).padStart(2, '0')}:${String(Math.round(race.goalS % 60)).padStart(2, '0')}` : ''}` }],
    distanceM: race.distanceM, durationS: race.goalS ?? race.distanceM * ctx.paces.marathon[0] / 1000,
  };
}

function restSession(date: string, phase: Phase): PlannedSession {
  return {
    id: uid(), date, phase, status: 'planned', type: 'rest', title: 'Rest day', focus: 'Recovery',
    purpose: 'Fitness is built while you recover. Rest lets your body adapt to the training.',
    howItHelps: 'Arriving fresh at your key sessions makes them count.',
    steps: [{ label: 'Rest', detail: 'Optional: a walk, mobility or gentle stretching' }],
    distanceM: 0, durationS: 0,
  };
}

export interface PlanInput {
  today: Date;
  profile: Profile;
  race?: Race;
  paces: TrainingPaces;
  recentWeeklyKm: number; // average of last 4 weeks
  longestRecentKm: number; // longest in last 6 weeks
}

export function buildPlan(input: PlanInput): Plan {
  const { today, profile, race, paces } = input;
  const start = startOfWeek(today);
  const end = race ? parseYmd(race.date) : addDays(start, 12 * 7 - 1);
  const totalWeeks = Math.max(1, Math.ceil((daysBetween(start, end) + 1) / 7));
  const raceM = race?.distanceM ?? 10000;
  const taperWeeks = totalWeeks < 4 ? 1 : raceM >= 40000 ? 2 : 1;
  const trainWeeks = Math.max(0, totalWeeks - taperWeeks);
  const baseW = Math.round(trainWeeks * 0.4), buildW = Math.round(trainWeeks * 0.35);
  const ctx: Ctx = { paces, race, goalLabel: race ? race.name : profile.goal };

  const cur = Math.max(15, input.recentWeeklyKm);
  const peak = clamp(PEAK_BY_DISTANCE(raceM), cur, cur * 1.45);
  const days = profile.daysAvailable.length ? [...profile.daysAvailable].sort() : [1, 3, 5, 6];
  const longDay = days.includes(profile.longRunDay) ? profile.longRunDay : days[days.length - 1];

  const sessions: PlannedSession[] = [];
  const phases: Plan['phases'] = [];
  let vol = cur;
  let longKm = Math.max(8, input.longestRecentKm);
  for (let w = 0; w < totalWeeks; w++) {
    const ws = addDays(start, w * 7);
    let phase: Phase = w < baseW ? 'base' : w < baseW + buildW ? 'build' : w < trainWeeks ? 'peak' : 'taper';
    const recoveryWeek = phase !== 'taper' && w > 0 && (w + 1) % 4 === 0 && w < trainWeeks - 1;
    if (recoveryWeek) phase = 'recovery';
    const last = phases[phases.length - 1];
    if (last && last.phase === phase) last.end = ymd(addDays(ws, 6));
    else phases.push({ phase, start: ymd(ws), end: ymd(addDays(ws, 6)) });

    // Weekly volume, no more than 10% up on the previous normal week
    let weekVol: number;
    if (phase === 'taper') {
      const fromEnd = totalWeeks - w; // 1 = race week
      weekVol = peak * (fromEnd === 1 ? 0.5 : 0.7);
    } else if (recoveryWeek) {
      weekVol = vol * 0.75;
    } else {
      vol = Math.min(peak, w === 0 ? cur : vol * 1.08);
      weekVol = vol;
    }
    const longTarget = phase === 'taper' ? Math.min(longKm, LONG_CAP(raceM)) * (totalWeeks - w === 1 ? 0 : totalWeeks - w === 2 ? 0.75 : 0.6)
      : recoveryWeek ? longKm * 0.75
      : (longKm = Math.min(LONG_CAP(raceM), longKm + (w === 0 ? 0 : 1.5), weekVol * 0.38));

    // Pick quality days: not the long-run day, not the day before it, spread apart
    const others = days.filter((d) => d !== longDay);
    const quality: number[] = [];
    const nQuality = phase === 'recovery' ? 0 : phase === 'taper' ? 1 : phase === 'base' ? 1 : days.length >= 4 ? 2 : 1;
    for (const d of others) {
      if (quality.length >= nQuality) break;
      if (d === (longDay + 6) % 7) continue; // day before long run
      if (quality.some((q) => Math.abs(q - d) < 2)) continue;
      quality.push(d);
    }

    const qualityKinds: SessionType[] =
      phase === 'base' ? [w % 2 === 0 ? 'speed' : 'hills']
      : phase === 'build' ? ['threshold', raceM >= 40000 ? 'tempo' : 'vo2max']
      : phase === 'peak' ? (raceM >= 20000 ? ['threshold', 'tempo'] : ['vo2max', 'threshold'])
      : ['threshold'];

    const raceDate = race ? race.date : undefined;
    const easyCount = days.length - 1 - quality.length;
    const qKm = clamp(weekVol * 0.17, 6, 14);
    const easyKm = easyCount > 0 ? Math.max(4, (weekVol - longTarget - qKm * quality.length) / easyCount) : 0;

    for (let d = 0; d < 7; d++) {
      const date = ymd(addDays(ws, d));
      if (raceDate && date > raceDate) break;
      if (race && date === raceDate) { sessions.push(raceSession(date, race, ctx)); continue; }
      if (raceDate && daysBetween(parseYmd(date), parseYmd(raceDate)) === 1) { sessions.push(restSession(date, 'taper')); continue; }
      if (!days.includes(d)) { sessions.push(restSession(date, phase)); continue; }
      if (d === longDay && longTarget > 0) { sessions.push(longSession(date, Math.round(longTarget), phase, ctx)); continue; }
      const qi = quality.indexOf(d);
      if (qi >= 0) {
        const kind = qualityKinds[qi] ?? 'speed';
        const sess = qualitySession(date, phase === 'taper' ? 'threshold' : kind, Math.round(phase === 'taper' ? qKm * 0.7 : qKm), phase, ctx);
        if (phase === 'taper') {
          sess.title = 'Sharpener: 3 x 1 km';
          sess.steps = [{ label: 'Warm up', detail: `2 km easy at ${pr(paces.easy)}` }, { label: '3 x 1 km', detail: `at ${pr(paces.threshold)}, 2 min jog between. Short and crisp.` }, { label: 'Cool down', detail: '1–2 km easy' }];
          sess.purpose = 'Keeps your legs sharp while fatigue drops before the race.';
        }
        sessions.push(sess);
        continue;
      }
      sessions.push(easySession(date, Math.round(easyKm), phase, ctx, d === (longDay + 1) % 7));
    }
  }

  return {
    id: uid(),
    raceId: race?.id,
    createdAt: new Date().toISOString(),
    startDate: ymd(start),
    endDate: ymd(end),
    phases,
    sessions,
    changes: [{
      id: 'built',
      at: new Date().toISOString(),
      reason: 'rebuilt',
      summary: `Built a ${totalWeeks}-week plan${race ? ` for ${race.name}` : ''} from your recent average of ${Math.round(input.recentWeeklyKm)} km a week, rising to about ${Math.round(peak)} km at peak. Long runs build from ${Math.round(input.longestRecentKm)} km on ${DAY_NAMES[longDay]}s.`,
    }],
  };
}

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
    const pick = (byDate.get(s.date) ?? []).find((a) => !used.has(a.id))
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
    const e = easySession(s.date, Math.max(4, Math.round(s.distanceM / 1000 * 0.8)), s.phase, { paces, goalLabel: '' });
    Object.assign(s, { ...e, id: s.id, title: 'Easy run (adjusted)', purpose: `${why} ${e.purpose}` });
  };

  // 2) Missed sessions
  const recentMissed = plan.sessions.filter((s) => s.status === 'missed' && daysBetween(parseYmd(s.date), today) <= 7);
  for (const s of recentMissed.filter((x) => KEY.includes(x.type) && daysBetween(parseYmd(x.date), today) <= 3)) {
    log(`missed:${s.id}`, 'missed', `You missed ${s.title.toLowerCase()} on ${DAY_NAMES[weekday(parseYmd(s.date))]}. We will not squeeze it in on top of other sessions: one missed session costs almost nothing, but cramming raises injury risk. The rest of the week stays as planned.`);
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
        log(`harder:${s.id}`, 'harder', `Your ${DAY_NAMES[weekday(parseYmd(s.date))]} run was ${ranHard ? `a ${actualType} effort instead of easy` : `${((a.distanceM - s.distanceM) / 1000).toFixed(0)} km longer than planned`}. To keep fatigue in check, ${DAY_NAMES[weekday(parseYmd(nextQ.date))]}'s quality session is now an easy run.`);
      } else if (!has(`harder:${s.id}`)) {
        log(`harder:${s.id}`, 'harder', `Your ${DAY_NAMES[weekday(parseYmd(s.date))]} run was harder than planned. No change needed, but keep the next easy day truly easy.`);
      }
    }
    const ranEasy = ['threshold', 'vo2max', 'tempo'].includes(s.type) && ['easy', 'recovery'].includes(actualType);
    if (ranEasy) log(`easier:${s.id}`, 'easier', `${s.title} on ${DAY_NAMES[weekday(parseYmd(s.date))]} ended up as an easy run. That is fine occasionally. Your next quality session stays as planned rather than doubling up.`);
  }

  // 4) Illness
  if (profile.illnessUntil && profile.illnessUntil >= t) {
    const id = `illness:${profile.illnessUntil}`;
    if (!has(id)) {
      for (const s of upcoming) {
        if (s.date <= profile.illnessUntil && s.type !== 'race') Object.assign(s, { ...restSession(s.date, s.phase), id: s.id });
        else if (daysBetween(parseYmd(profile.illnessUntil), parseYmd(s.date)) <= 4 && s.type !== 'rest' && s.type !== 'race') toEasy(s, 'Easing back after illness.');
      }
      log(id, 'illness', `You reported feeling unwell. Sessions until ${profile.illnessUntil} are now rest, and the following four days are easy only. If you had a fever or chest symptoms, wait until you have been symptom-free for at least a day before running.`);
    }
  }

  // 5) Pain
  const painFb = feedback.filter((f) => f.pain.some((x) => x.severity >= 2) && daysBetween(new Date(f.loggedAt), today) <= 2);
  for (const f of painFb) {
    const id = `pain:${f.activityId}`;
    if (has(id)) continue;
    const next2 = upcoming.filter((s) => daysBetween(today, parseYmd(s.date)) <= 2 && s.type !== 'rest' && s.type !== 'race');
    next2.forEach((s, i) => (i === 0 ? Object.assign(s, { ...restSession(s.date, s.phase), id: s.id }) : toEasy(s, 'Adjusted because you logged pain.')));
    log(id, 'pain', `You logged ${f.pain.map((x) => x.area.toLowerCase()).join(' and ')} pain, so the next two days are rest and easy running. This is coaching, not medical advice: if pain persists, gets worse or changes how you run, please see a physio or doctor.`);
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
export function moveSession(plan: Plan, sessionId: string, toDate: string): Plan {
  const sessions = plan.sessions.map((s) => ({ ...s }));
  const a = sessions.find((s) => s.id === sessionId);
  if (!a) return plan;
  const b = sessions.find((s) => s.date === toDate);
  const from = a.date;
  a.date = toDate;
  a.movedFrom = from;
  if (b) { b.date = from; b.movedFrom = toDate; }
  sessions.sort((x, y) => x.date.localeCompare(y.date));
  const warn = b && KEY.includes(b.type) && KEY.includes(a.type) && Math.abs(daysBetween(parseYmd(from), parseYmd(toDate))) === 1;
  return {
    ...plan,
    sessions,
    changes: [...plan.changes, {
      id: uid(), at: new Date().toISOString(), reason: 'moved',
      summary: `Moved ${a.title.toLowerCase()} from ${DAY_NAMES[weekday(parseYmd(from))]} to ${DAY_NAMES[weekday(parseYmd(toDate))]}${b ? ` and ${b.title.toLowerCase()} to ${DAY_NAMES[weekday(parseYmd(from))]}` : ''}.${warn ? ' Two hard sessions are now on back-to-back days, so take the second one a little easier.' : ''}`,
    }],
  };
}
