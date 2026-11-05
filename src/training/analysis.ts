// Session analysis: classification, splits, patterns, scoring and plain-English feedback.
import type { Activity, PlannedSession, SessionFeedback, SessionType, StreamPoint } from '../lib/types';
import { pace as fmtPace, type Units } from '../lib/format';
import { type TrainingPaces, zoneOf } from './fitness';

export type Zones = { zone: number; min: number; max: number }[];

export const TYPE_LABEL: Record<SessionType, string> = {
  easy: 'Easy run',
  recovery: 'Recovery run',
  long: 'Long run',
  tempo: 'Tempo run',
  threshold: 'Threshold session',
  vo2max: 'VO2 max intervals',
  speed: 'Speed session',
  hills: 'Hill session',
  race: 'Race',
  runwalk: 'Run/walk',
  timetrial: 'Time trial',
  rest: 'Rest day',
};

export const TYPE_FOCUS: Record<SessionType, string> = {
  easy: 'Aerobic base',
  recovery: 'Recovery',
  long: 'Endurance',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2max: 'VO2 max',
  speed: 'Speed',
  hills: 'Hill strength',
  race: 'Race',
  runwalk: 'Building up',
  timetrial: 'Fitness test',
  rest: 'Recovery',
};

export interface Split {
  index: number;
  distanceM: number;
  timeS: number;
  paceS: number; // s per km
  avgHr?: number;
  avgCad?: number;
  elevDelta?: number;
}

export function splits(streams: StreamPoint[], unitM = 1000): Split[] {
  const out: Split[] = [];
  if (!streams.length) return out;
  let startIdx = 0;
  let next = unitM;
  const total = streams[streams.length - 1].d;
  for (let i = 1; i < streams.length; i++) {
    const isLast = i === streams.length - 1;
    if (streams[i].d >= next || isLast) {
      const seg = streams.slice(startIdx, i + 1);
      const dM = streams[i].d - streams[startIdx].d;
      const tS = streams[i].t - streams[startIdx].t;
      if (dM < 50) break;
      const hrs = seg.filter((p) => p.hr).map((p) => p.hr!);
      const cads = seg.filter((p) => p.cad).map((p) => p.cad!);
      const alt0 = streams[startIdx].alt, alt1 = streams[i].alt;
      out.push({
        index: out.length + 1,
        distanceM: dM,
        timeS: tS,
        paceS: tS / (dM / 1000),
        avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined,
        avgCad: cads.length ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : undefined,
        elevDelta: alt0 != null && alt1 != null ? Math.round(alt1 - alt0) : undefined,
      });
      startIdx = i;
      next += unitM;
      if (next > total + unitM) break;
    }
  }
  return out;
}

export function zoneTime(streams: StreamPoint[], zones: Zones): number[] {
  const z = [0, 0, 0, 0, 0];
  for (let i = 1; i < streams.length; i++) {
    const hr = streams[i].hr;
    if (!hr) continue;
    z[zoneOf(hr, zones) - 1] += streams[i].t - streams[i - 1].t;
  }
  return z;
}

/** 400 m segment paces, used to detect structured sessions without laps */
function segmentPaces(streams: StreamPoint[], seg = 400): number[] {
  return splits(streams, seg).filter((s) => s.distanceM > seg * 0.7).map((s) => s.paceS);
}

export interface Classification {
  type: SessionType;
  reason: string;
  workPace?: number;
  reps?: number;
}

export function classify(a: Activity, paces: TrainingPaces, zones: Zones | undefined, typicalMovingS: number): Classification {
  if (a.isRace) return { type: 'race', reason: 'Marked as a race' };
  const avgPace = a.movingS / (a.distanceM / 1000);
  const elevPerKm = (a.elevGainM ?? 0) / (a.distanceM / 1000);

  // Structured efforts from laps or 400 m segments
  const lapPaces = (a.laps ?? []).filter((l) => l.distanceM > 150).map((l) => l.durationS / (l.distanceM / 1000));
  const segs = lapPaces.length >= 5 ? lapPaces : a.streams ? segmentPaces(a.streams) : [];
  if (segs.length >= 6) {
    const sorted = [...segs].sort((x, y) => x - y);
    const fastQ = sorted[Math.floor(sorted.length * 0.25)];
    const slowQ = sorted[Math.floor(sorted.length * 0.75)];
    if (slowQ / fastQ > 1.18) {
      const work = segs.filter((p) => p <= fastQ * 1.04);
      const workPace = work.reduce((x, y) => x + y, 0) / work.length;
      const reps = countReps(segs, fastQ * 1.06);
      if (elevPerKm > 18) return { type: 'hills', reason: `Repeated hard efforts with ${Math.round(a.elevGainM ?? 0)} m of climbing`, workPace, reps };
      if (workPace <= paces.repetition[1] + 4) return { type: 'speed', reason: `Short fast reps around ${Math.round(workPace)} s/km`, workPace, reps };
      if (workPace <= paces.interval[1] + 4) return { type: 'vo2max', reason: 'Hard reps at interval pace with recoveries', workPace, reps };
      if (workPace <= paces.threshold[1] + 6) return { type: 'threshold', reason: 'Sustained reps at threshold pace', workPace, reps };
    }
  }

  const hrZone = a.avgHr && zones ? zoneOf(a.avgHr, zones) : undefined;
  if (a.movingS >= Math.max(75 * 60, typicalMovingS * 1.45) && a.distanceM >= 14000)
    return { type: 'long', reason: `${Math.round(a.movingS / 60)} minutes, well above your usual run length` };
  if (avgPace <= paces.threshold[1] + 3 && a.movingS >= 15 * 60) return { type: 'threshold', reason: 'Steady running at threshold pace' };
  if (hrZone === 4 && a.movingS >= 15 * 60) return { type: 'threshold', reason: 'Average heart rate in Z4' };
  if (avgPace <= paces.marathon[1] + 6 || hrZone === 3) return { type: 'tempo', reason: 'Steady running between marathon and threshold effort' };
  if (elevPerKm > 30) return { type: 'hills', reason: `Hilly route with ${Math.round(a.elevGainM ?? 0)} m of climbing` };
  if (a.movingS < 45 * 60 && avgPace >= paces.recovery[0] - 2) return { type: 'recovery', reason: 'Short and gentle' };
  return { type: 'easy', reason: 'Relaxed aerobic running' };
}

function countReps(segs: number[], threshold: number): number {
  let reps = 0, inRep = false;
  for (const p of segs) {
    if (p <= threshold && !inRep) { reps++; inRep = true; }
    else if (p > threshold) inRep = false;
  }
  return reps;
}

export interface Patterns {
  hrDriftPct?: number; // aerobic decoupling, % (positive = drift)
  fadePct?: number; // last 20% vs earlier, % slower (negative = finished faster)
  easyTooHardPct?: number; // share of time in Z3+ on an easy day
  cadenceAvg?: number;
}

export function patterns(a: Activity, type: SessionType, zones?: Zones): Patterns {
  const s = a.streams;
  const out: Patterns = { cadenceAvg: a.avgCadence };
  if (!s || s.length < 20) return out;
  const total = s[s.length - 1].d;
  const steady = ['easy', 'long', 'recovery', 'tempo', 'race'].includes(type);

  // HR drift: efficiency (m per beat) first half vs second half, skipping first 10%
  if (steady && a.movingS > 35 * 60 && s.some((p) => p.hr)) {
    const ef = (from: number, to: number) => {
      const seg = s.filter((p) => p.d >= from && p.d <= to && p.hr);
      if (seg.length < 5) return undefined;
      const dt = seg[seg.length - 1].t - seg[0].t;
      const dd = seg[seg.length - 1].d - seg[0].d;
      const hr = seg.reduce((x, p) => x + p.hr!, 0) / seg.length;
      return dd / dt / hr;
    };
    const e1 = ef(total * 0.1, total * 0.55), e2 = ef(total * 0.55, total);
    if (e1 && e2) out.hrDriftPct = Math.round(((e1 - e2) / e1) * 1000) / 10;
  }

  if (steady && total > 5000) {
    const at = (d: number) => {
      for (let i = 1; i < s.length; i++) if (s[i].d >= d) return s[i].t;
      return s[s.length - 1].t;
    };
    const tA = at(1000), tB = at(total * 0.8), tEnd = s[s.length - 1].t;
    const pEarly = (tB - tA) / ((total * 0.8 - 1000) / 1000);
    const pLate = (tEnd - tB) / ((total * 0.2) / 1000);
    out.fadePct = Math.round(((pLate - pEarly) / pEarly) * 1000) / 10;
  }

  if (zones && ['easy', 'recovery', 'long'].includes(type)) {
    const zt = zoneTime(s, zones);
    const sum = zt.reduce((x, y) => x + y, 0);
    if (sum > 0) out.easyTooHardPct = Math.round(((zt[2] + zt[3] + zt[4]) / sum) * 100);
  }
  return out;
}

export interface Similar {
  activity: Activity;
  paceS: number;
  avgHr?: number;
}

export function similarSessions(a: Activity, type: SessionType, all: Activity[], typeOf: (x: Activity) => SessionType): Similar[] {
  const t = new Date(a.startTime).getTime();
  return all
    .filter((x) => x.id !== a.id && new Date(x.startTime).getTime() < t && t - new Date(x.startTime).getTime() < 365 * 86400000)
    .filter((x) => Math.abs(x.distanceM - a.distanceM) / a.distanceM < 0.2)
    .filter((x) => typeOf(x) === type)
    .sort((x, y) => y.startTime.localeCompare(x.startTime))
    .slice(0, 5)
    .map((x) => ({ activity: x, paceS: x.movingS / (x.distanceM / 1000), avgHr: x.avgHr }));
}

export interface Analysis {
  type: SessionType;
  classificationReason: string;
  score: number;
  scoreReason: string;
  planned?: PlannedSession;
  plannedVsActual: { label: string; planned: string; actual: string; ok: boolean }[];
  splits: Split[];
  zoneSeconds?: number[];
  patterns: Patterns;
  patternNotes: string[];
  similar: Similar[];
  similarNote?: string;
  wentWell: string[];
  improve: string[];
  nextDays: string;
  limitedData?: string;
}

export function analyse(opts: {
  a: Activity;
  all: Activity[];
  paces: TrainingPaces;
  zones?: Zones;
  typicalMovingS: number;
  planned?: PlannedSession;
  feedback?: SessionFeedback;
  pastFeedback: SessionFeedback[];
  units: Units;
  typeOf: (x: Activity) => SessionType;
}): Analysis {
  const { a, all, paces, zones, typicalMovingS, planned, feedback, pastFeedback, units, typeOf } = opts;
  if (planned?.type === 'runwalk' || planned?.type === 'timetrial' || a.source === 'manual' || a.isTimeTrial) {
    return simpleAnalysis(a, planned, feedback, units);
  }
  const cls = classify(a, paces, zones, typicalMovingS);
  const type = cls.type;
  const avgPace = a.movingS / (a.distanceM / 1000);
  const sp = a.streams ? splits(a.streams, units === 'km' ? 1000 : 1609.344) : [];
  const hasHrStream = !!a.streams?.some((p) => p.hr);
  const zt = hasHrStream && zones ? zoneTime(a.streams!, zones) : undefined;
  const pat = patterns(a, type, zones);
  const P = (s: number) => fmtPace(s, units);

  // ---- Limited data ----
  const missing: string[] = [];
  if (!a.streams?.length) missing.push('splits');
  if (!a.avgHr) missing.push('heart rate');
  if (!a.avgCadence) missing.push('cadence');
  const limitedData = missing.length
    ? `This run arrived without ${missing.join(', ').replace(/, ([^,]*)$/, ' or $1')}${a.source === 'apple_health' || a.source === 'health_connect' ? ' from your phone' : ''}, so ${missing.includes('splits') ? 'pacing and fade checks are not possible and ' : ''}${missing.includes('heart rate') ? 'effort is judged from pace alone' : 'the rest of the analysis is complete'}.`
    : undefined;

  // ---- Planned vs actual ----
  const pva: Analysis['plannedVsActual'] = [];
  let score = 85;
  const reasons: string[] = [];
  if (planned && planned.type !== 'rest') {
    const dRatio = a.distanceM / planned.distanceM;
    const dOk = dRatio > 0.9 && dRatio < 1.12;
    pva.push({ label: 'Distance', planned: `${(planned.distanceM / 1000).toFixed(1)} km`, actual: `${(a.distanceM / 1000).toFixed(1)} km`, ok: dOk });
    if (!dOk) {
      score -= Math.min(20, Math.round(Math.abs(1 - dRatio) * 60));
      reasons.push(dRatio < 1 ? 'You ran shorter than planned' : 'You ran further than planned');
    }
    const typeOk = planned.type === type || (planned.type === 'easy' && type === 'recovery') || (planned.type === 'recovery' && type === 'easy');
    pva.push({ label: 'Session', planned: TYPE_LABEL[planned.type], actual: TYPE_LABEL[type], ok: typeOk });
    if (!typeOk) { score -= 12; reasons.push(`It became a ${TYPE_LABEL[type].toLowerCase()} rather than a ${TYPE_LABEL[planned.type].toLowerCase()}`); }
    if (planned.paceTarget) {
      const pt = planned.paceTarget;
      const target = ['vo2max', 'speed', 'threshold', 'hills'].includes(planned.type) && cls.workPace ? cls.workPace : avgPace;
      const ok = target >= pt.minSPerKm - 5 && target <= pt.maxSPerKm + 5;
      pva.push({ label: cls.workPace && planned.type !== 'easy' ? 'Work pace' : 'Pace', planned: `${P(pt.minSPerKm).replace(/\/.*/, '')}–${P(pt.maxSPerKm)}`, actual: P(target), ok });
      if (!ok) {
        score -= 10;
        reasons.push(target < pt.minSPerKm ? 'Pace was quicker than the target range' : 'Pace was slower than the target range');
      }
    }
  } else if (!planned) {
    score = 80;
    reasons.push('There was no planned session to compare with');
  }

  // ---- Patterns ----
  const notes: string[] = [];
  const wentWell: string[] = [];
  const improve: string[] = [];
  if (pat.easyTooHardPct != null) {
    if (pat.easyTooHardPct > 25) {
      score -= 12;
      notes.push(`${pat.easyTooHardPct}% of this run was in Z3 or above, which is too much for an ${type === 'long' ? 'long' : 'easy'} day.`);
      improve.push(`Slow down to ${P(paces.easy[0])} or slower and keep heart rate in Z2. Easy days build the engine; running them hard only adds fatigue.`);
    } else {
      wentWell.push(`You kept ${100 - pat.easyTooHardPct}% of the run in Z1 and Z2, exactly where easy running should be.`);
    }
  }
  if (pat.hrDriftPct != null) {
    if (pat.hrDriftPct > 7) {
      score -= 6;
      notes.push(`Heart rate drifted ${pat.hrDriftPct}% relative to pace in the second half.`);
      improve.push('Heart rate drift often comes from heat, low fuel or fluid, or starting too fast. Drink and take on fuel earlier on runs over 75 minutes.');
    } else if (pat.hrDriftPct < 4) {
      wentWell.push(`Heart rate stayed steady against pace (drift ${Math.max(0, pat.hrDriftPct)}%), a sign of solid aerobic fitness.`);
    }
  }
  if (pat.fadePct != null) {
    if (pat.fadePct > 5) {
      score -= 8;
      notes.push(`The last 20% was ${pat.fadePct}% slower than the rest of the run.`);
      improve.push('Start the first third a little slower so you can hold pace to the finish.');
    } else if (pat.fadePct < -2) {
      wentWell.push(`You finished ${Math.abs(pat.fadePct)}% faster than you started, a well-judged negative split.`);
    } else if (type !== 'recovery') {
      wentWell.push('Your pacing was even from start to finish.');
    }
  }
  if (cls.reps && ['vo2max', 'threshold', 'speed', 'hills'].includes(type) && a.laps?.length) {
    const work = a.laps.filter((l) => l.durationS / (l.distanceM / 1000) <= (cls.workPace ?? 0) * 1.06);
    if (work.length >= 3) {
      const first = work[0].durationS / (work[0].distanceM / 1000);
      const last = work[work.length - 1].durationS / (work[work.length - 1].distanceM / 1000);
      if (last <= first + 3) wentWell.push(`You held your reps consistently: first ${P(first)}, last ${P(last)}.`);
      else { improve.push(`Your reps slowed from ${P(first)} to ${P(last)}. Hold back slightly on the first two so the last ones match.`); score -= 5; }
    }
  }
  if (pat.cadenceAvg && pat.cadenceAvg < 155 && type !== 'recovery') {
    notes.push(`Average cadence was ${pat.cadenceAvg} steps per minute.`);
  }

  // ---- Similar sessions ----
  const sim = similarSessions(a, type, all, typeOf);
  let similarNote: string | undefined;
  if (sim.length) {
    const avgSimPace = sim.reduce((x, s) => x + s.paceS, 0) / sim.length;
    const hrSims = sim.filter((s) => s.avgHr);
    const diff = avgSimPace - avgPace;
    if (a.avgHr && hrSims.length) {
      const avgSimHr = hrSims.reduce((x, s) => x + s.avgHr!, 0) / hrSims.length;
      const hrDiff = a.avgHr - avgSimHr;
      similarNote = `Compared with your last ${sim.length} similar ${TYPE_LABEL[type].toLowerCase()}s, you were ${Math.abs(diff).toFixed(0)} s/km ${diff >= 0 ? 'faster' : 'slower'} at a heart rate ${Math.abs(hrDiff).toFixed(0)} bpm ${hrDiff >= 0 ? 'higher' : 'lower'}.`;
      if (diff > 2 && hrDiff <= 2) wentWell.push('You ran faster than similar recent sessions without a higher heart rate. Your fitness is moving the right way.');
    } else {
      similarNote = `Compared with your last ${sim.length} similar sessions, you were ${Math.abs(diff).toFixed(0)} s/km ${diff >= 0 ? 'faster' : 'slower'}.`;
    }
  }

  // ---- How it felt ----
  if (feedback) {
    if (feedback.feel <= 2 && ['easy', 'recovery'].includes(type)) {
      improve.push('You found an easy run hard. If that happens twice in a row, take an extra rest day.');
      score -= 4;
    }
    if (feedback.pain.some((p) => p.severity >= 2)) {
      improve.push('You logged pain. Ritmo will keep the next days easy. If it lasts more than a few days or changes how you run, see a physio or doctor.');
    }
  }
  const repeatedPain = pastFeedback.flatMap((f) => f.pain).reduce<Record<string, number>>((acc, p) => ((acc[p.area] = (acc[p.area] ?? 0) + 1), acc), {});
  const recurring = Object.entries(repeatedPain).find(([, n]) => n >= 2);
  if (recurring) notes.push(`You have mentioned ${recurring[0].toLowerCase()} discomfort ${recurring[1]} times recently. Worth keeping an eye on.`);

  if (!wentWell.length) wentWell.push(planned ? 'You got the session done, which is what builds fitness over months.' : 'Another run in the bank. Consistency is what builds fitness.');
  if (!improve.length) improve.push('Nothing to change. Repeat this kind of execution.');

  score = Math.max(30, Math.min(100, Math.round(score + (wentWell.length - 1) * 3)));
  const scoreReason =
    score >= 85
      ? `Well executed. ${reasons.length ? reasons[0] + ', but the intent of the session was met.' : 'You ran the session as intended.'}`
      : score >= 70
        ? `Good session with room to improve. ${reasons[0] ?? notes[0] ?? ''}`.trim()
        : `This one drifted from the plan. ${reasons.slice(0, 2).join('. ') || notes[0] || ''}`.trim();

  // ---- Next days ----
  let nextDays: string;
  const hard = ['vo2max', 'threshold', 'speed', 'hills', 'race', 'long'].includes(type);
  if (feedback?.pain.some((p) => p.severity >= 2)) nextDays = 'The next two days are now easy or rest so the area can settle.';
  else if (pat.easyTooHardPct != null && pat.easyTooHardPct > 35) nextDays = 'Because this ran harder than planned, keep tomorrow genuinely easy before your next quality session.';
  else if (type === 'race') nextDays = 'Take at least three easy days before any hard running. A rough guide is one easy day per 3 km raced.';
  else if (hard) nextDays = 'Tomorrow is easy so this work can turn into fitness.';
  else nextDays = 'No change to the plan. You are set up well for your next session.';

  return {
    type,
    classificationReason: cls.reason,
    score,
    scoreReason,
    planned,
    plannedVsActual: pva,
    splits: sp,
    zoneSeconds: zt,
    patterns: pat,
    patternNotes: notes,
    similar: sim,
    similarNote,
    wentWell,
    improve,
    nextDays,
    limitedData,
  };
}

/** Feedback for run/walk sessions, time trials and hand-logged runs: built only from time, distance and feel. */
function simpleAnalysis(a: Activity, planned: PlannedSession | undefined, feedback: SessionFeedback | undefined, units: Units): Analysis {
  const type: SessionType = a.isTimeTrial || planned?.type === 'timetrial' ? 'timetrial' : planned?.type === 'runwalk' ? 'runwalk' : a.isRace ? 'race' : 'easy';
  const P = (s: number) => fmtPace(s, units);
  const minutes = Math.round(a.movingS / 60);
  const pva: Analysis['plannedVsActual'] = [];
  let score = 85;
  const wentWell: string[] = [];
  const improve: string[] = [];
  if (planned && planned.durationS > 0) {
    const ratio = a.movingS / planned.durationS;
    const ok = ratio >= 0.85;
    pva.push({ label: 'Time', planned: `${Math.round(planned.durationS / 60)} min`, actual: `${minutes} min`, ok });
    if (!ok) score -= 10;
  }
  if (type === 'runwalk') {
    wentWell.push(`You completed ${planned ? `"${planned.title}"` : 'your session'}: ${minutes} minutes on your feet. Every session like this makes the next one easier.`);
  } else if (type === 'timetrial') {
    wentWell.push(`You ran ${(a.distanceM / 1000).toFixed(2)} km in ${Math.floor(a.movingS / 60)}:${String(Math.round(a.movingS % 60)).padStart(2, '0')}, an average of ${P(a.movingS / (a.distanceM / 1000))}. This result now sets your training paces and race predictions.`);
  } else {
    wentWell.push(`You logged ${(a.distanceM / 1000).toFixed(1)} km in ${minutes} minutes. Consistency like this is what builds fitness.`);
  }
  if (feedback?.feel === 1) {
    score -= 10;
    improve.push(type === 'runwalk'
      ? 'That felt very hard, so your next session repeats this one instead of moving on. There is no rush: repeating a week is normal and smart.'
      : 'That felt very hard. Take an extra rest day and keep your next run gentle.');
  } else if (feedback?.feel === 2) {
    improve.push('If the running felt hard, slow it right down. You should be able to talk in full sentences.');
  } else {
    improve.push(feedback ? 'Nothing to change. Keep the running parts relaxed and conversational.' : 'Tell Ritmo how it felt below, so the next sessions can be adjusted for you.');
  }
  if (feedback?.pain.some((p) => p.severity >= 2 || /chest|dizz/i.test(p.area))) {
    improve.push('You logged pain or a worrying symptom. Rest, and see a doctor or physio if it continues. For chest pain, dizziness or fainting, stop exercising and get medical advice straight away.');
  }
  const nextDays = feedback?.pain.length ? 'The next days are rest or easy walking while this settles.'
    : type === 'timetrial' ? 'Two easy days now. Your full plans, predictions and readiness score are unlocked.'
    : 'Rest tomorrow. Your body gets stronger on rest days, not only on run days.';
  return {
    type,
    classificationReason: type === 'runwalk' ? 'Planned run/walk session' : type === 'timetrial' ? 'Marked as a time trial' : 'Logged by hand',
    score: Math.max(40, Math.min(100, score)),
    scoreReason: score >= 80 ? 'Session done as planned.' : 'Session done, with some changes from the plan.',
    planned,
    plannedVsActual: pva,
    splits: [],
    patterns: {},
    patternNotes: [],
    similar: [],
    wentWell,
    improve,
    nextDays,
    limitedData: a.source === 'manual' ? 'You logged this run by hand, so there are no splits or heart rate. Ritmo uses your time, distance and how it felt.' : undefined,
  };
}
