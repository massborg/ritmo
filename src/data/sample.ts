// Deterministic sample data: about six years of running for one runner, plus a marathon plan in progress.
// Clearly labelled as sample data in the UI, and delivered through the same integration layer as real sources.
import type { Activity, Lap, Plan, Profile, Race, SessionFeedback, SessionType, StreamPoint } from '../lib/types';
import { addDays, parseYmd, ymd, daysBetween, weekday } from '../lib/format';
import { predictTime, trainingPaces, type TrainingPaces } from '../training/fitness';
import { adaptPlan, buildPlan } from '../training/plan';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE_TODAY = '2026-11-05';
const MAX_HR = 186;
const REST_HR = 49;

/** Fitness anchors (VDOT) over time */
const VDOT_ANCHORS: [string, number][] = [
  ['2021-01-01', 34.5], ['2021-11-01', 37.5], ['2022-10-01', 40.5], ['2023-06-01', 42.5],
  ['2024-02-01', 44], ['2025-02-01', 46.5], ['2025-10-01', 47.5], ['2026-03-01', 48.5], ['2026-11-05', 50],
];

function vdotAt(date: string) {
  for (let i = 1; i < VDOT_ANCHORS.length; i++) {
    const [d1, v1] = VDOT_ANCHORS[i - 1], [d2, v2] = VDOT_ANCHORS[i];
    if (date <= d2) {
      const f = daysBetween(parseYmd(d1), parseYmd(date)) / daysBetween(parseYmd(d1), parseYmd(d2));
      return v1 + (v2 - v1) * Math.max(0, f);
    }
  }
  return VDOT_ANCHORS[VDOT_ANCHORS.length - 1][1];
}

/** Past races: [date, name, distance m, effort factor (1 = perfect day)] */
const PAST_RACES: [string, string, number, number][] = [
  ['2021-11-14', 'Sliema 10K', 10000, 1],
  ['2022-02-27', 'Malta Half Marathon', 21097.5, 0.99],
  ['2022-10-16', 'Valletta 10K', 10000, 1],
  ['2023-02-26', 'Malta Half Marathon', 21097.5, 1],
  ['2023-11-12', 'Sliema 10K', 10000, 1.005],
  ['2024-02-25', 'Malta Marathon', 42195, 0.98],
  ['2024-10-20', 'Rome Half Marathon', 21097.5, 1],
  ['2025-02-23', 'Malta Marathon', 42195, 1],
  ['2025-06-08', 'Mdina 5K', 5000, 1],
  ['2025-10-19', 'Valletta Half Marathon', 21097.5, 1],
  ['2026-03-08', 'Sliema 10K', 10000, 1.005],
  ['2026-10-11', 'Gozo Half Marathon', 21097.5, 1],
];

// Three weeks off with a calf strain in 2023, and a quieter August every summer heat.
const BREAKS: [string, string][] = [['2023-06-05', '2023-06-25'], ['2024-12-23', '2024-12-29']];

interface Seg { m: number; pace: number; hr: number; lap?: boolean }

function hrFor(pct: number) { return Math.round(REST_HR + pct * (MAX_HR - REST_HR)); }

function segmentsFor(type: SessionType, km: number, P: TrainingPaces, r: () => number): Seg[] {
  const easy = (P.easy[0] * 0.55 + P.easy[1] * 0.45) + (r() - 0.5) * 10;
  const wu: Seg = { m: 2000, pace: easy + 5, hr: hrFor(0.62) };
  switch (type) {
    case 'threshold': {
      const reps = km > 13 ? 5 : 4;
      const out: Seg[] = [wu];
      for (let i = 0; i < reps; i++) {
        out.push({ m: 1600, pace: (P.threshold[0] + P.threshold[1]) / 2 + (r() - 0.5) * 6, hr: hrFor(0.86 + i * 0.008), lap: true });
        out.push({ m: 250, pace: easy + 40, hr: hrFor(0.72), lap: true });
      }
      out.push({ m: Math.max(1000, km * 1000 - 2000 - reps * 1850), pace: easy + 5, hr: hrFor(0.68) });
      return out;
    }
    case 'vo2max': {
      const out: Seg[] = [wu];
      for (let i = 0; i < 5; i++) {
        out.push({ m: 1000, pace: (P.interval[0] + P.interval[1]) / 2 + (r() - 0.5) * 5, hr: hrFor(0.92 + i * 0.01), lap: true });
        out.push({ m: 400, pace: easy + 50, hr: hrFor(0.74), lap: true });
      }
      out.push({ m: Math.max(1000, km * 1000 - 9000), pace: easy + 5, hr: hrFor(0.68) });
      return out;
    }
    case 'tempo': {
      const tk = Math.max(4, km - 4);
      return [wu, { m: tk * 1000, pace: (P.marathon[0] + P.marathon[1]) / 2 + (r() - 0.5) * 4, hr: hrFor(0.8), lap: true }, { m: 2000, pace: easy + 5, hr: hrFor(0.7) }];
    }
    case 'hills': {
      const out: Seg[] = [wu];
      for (let i = 0; i < 8; i++) { out.push({ m: 280, pace: P.interval[1] + 20, hr: hrFor(0.9), lap: true }); out.push({ m: 280, pace: easy + 60, hr: hrFor(0.72), lap: true }); }
      out.push({ m: Math.max(1000, km * 1000 - 2000 - 8 * 560), pace: easy + 5, hr: hrFor(0.68) });
      return out;
    }
    case 'speed':
      return [{ m: km * 1000 - 800, pace: easy, hr: hrFor(0.68) }, ...Array.from({ length: 6 }, () => ({ m: 100, pace: P.repetition[0] + 8, hr: hrFor(0.8) })), { m: 200, pace: easy + 10, hr: hrFor(0.7) }];
    case 'long':
      return [{ m: km * 1000, pace: (P.long[0] * 0.5 + P.long[1] * 0.5) + (r() - 0.5) * 8, hr: hrFor(0.655) }];
    case 'recovery':
      return [{ m: km * 1000, pace: (P.recovery[0] + P.recovery[1]) / 2, hr: hrFor(0.56) }];
    default:
      return [{ m: km * 1000, pace: easy, hr: hrFor(0.635) }];
  }
}

function synthStreams(segs: Seg[], r: () => number, hilly: boolean, drift: number): { streams: StreamPoint[]; laps: Lap[] } {
  const streams: StreamPoint[] = [];
  const laps: Lap[] = [];
  let t = 0, d = 0, hr = 95;
  const total = segs.reduce((x, s) => x + s.m, 0);
  const base = { lat: 35.9125, lon: 14.5045 };
  for (const s of segs) {
    const segStartT = t, segStartD = d;
    const hrs: number[] = [];
    const segEnd = d + s.m;
    while (d < segEnd) {
      const dt = 5;
      const frac = d / total;
      const grade = hilly ? Math.sin(d / 900) * 0.03 : Math.sin(d / 1700) * 0.008;
      const fatigue = 1 + frac * drift * 0.4;
      const v = 1000 / (s.pace * fatigue * (1 + grade * 3)) * (1 + (r() - 0.5) * 0.05);
      d = Math.min(segEnd, d + v * dt);
      t += dt;
      const target = s.hr * (1 + frac * drift) + grade * 150;
      hr += (target - hr) * 0.12 + (r() - 0.5) * 1.5;
      hrs.push(hr);
      const ang = (d / 6000) * Math.PI * 2;
      streams.push({
        t, d: Math.round(d * 10) / 10,
        hr: Math.round(hr),
        cad: Math.round(158 + (360 - s.pace) * 0.09 + (r() - 0.5) * 4),
        alt: Math.round((12 + (hilly ? 40 : 6) * (1 - Math.cos(d / 900)) / 2) * 10) / 10,
        lat: base.lat + Math.sin(ang) * 0.012 + d * 0.0000006,
        lon: base.lon + (1 - Math.cos(ang)) * 0.018,
      });
    }
    if (s.lap) laps.push({ index: laps.length + 1, startS: segStartT, durationS: t - segStartT, distanceM: d - segStartD, avgHr: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) });
  }
  return { streams, laps };
}

interface RunSpec { date: string; type: SessionType; km: number; name?: string; isRace?: boolean; raceM?: number; raceFactor?: number; tooHard?: boolean }

function makeActivity(spec: RunSpec, idx: number, withStreams: boolean): Activity {
  const r = mulberry32(idx * 7919 + 17);
  const vdot = vdotAt(spec.date);
  const P = trainingPaces(vdot);
  let segs: Seg[];
  if (spec.isRace && spec.raceM) {
    const timeS = predictTime(vdot * (spec.raceFactor ?? 1), spec.raceM);
    const pct = spec.raceM >= 40000 ? 0.84 : spec.raceM >= 20000 ? 0.88 : spec.raceM >= 9000 ? 0.92 : 0.95;
    segs = [{ m: spec.raceM, pace: timeS / (spec.raceM / 1000), hr: hrFor(pct) }];
  } else {
    segs = segmentsFor(spec.type, spec.km, P, r);
    if (spec.tooHard) segs = segs.map((s) => ({ ...s, pace: s.pace - 32, hr: s.hr + 16 }));
  }
  const hour = spec.isRace ? 8 : weekday(parseYmd(spec.date)) >= 5 ? 7 : 6 + Math.floor(r() * 2) + (r() > 0.6 ? 12 : 0);
  const start = new Date(`${spec.date}T${String(hour).padStart(2, '0')}:${String(Math.floor(r() * 50)).padStart(2, '0')}:00`);
  const hilly = spec.type === 'hills' || r() > 0.85;
  const drift = spec.type === 'long' ? 0.02 + r() * 0.05 : spec.isRace ? 0.05 : 0.01;
  const distanceM = segs.reduce((x, s) => x + s.m, 0);
  let movingS: number, avgHr: number, maxHr: number, elev: number, avgCad: number;
  let streams: StreamPoint[] | undefined, laps: Lap[] | undefined;
  if (withStreams) {
    const s = synthStreams(segs, r, hilly, drift);
    streams = s.streams;
    laps = s.laps.length ? s.laps : undefined;
    movingS = streams[streams.length - 1].t;
    avgHr = Math.round(streams.reduce((x, p) => x + (p.hr ?? 0), 0) / streams.length);
    maxHr = Math.max(...streams.map((p) => p.hr ?? 0));
    avgCad = Math.round(streams.reduce((x, p) => x + (p.cad ?? 0), 0) / streams.length);
    elev = 0;
    for (let i = 1; i < streams.length; i++) elev += Math.max(0, (streams[i].alt ?? 0) - (streams[i - 1].alt ?? 0));
  } else {
    movingS = segs.reduce((x, s) => x + s.m / 1000 * s.pace * (1 + drift * 0.2), 0);
    avgHr = Math.round(segs.reduce((x, s) => x + s.hr * s.m, 0) / distanceM * (1 + drift / 2));
    maxHr = Math.min(MAX_HR, Math.round(Math.max(...segs.map((s) => s.hr)) * 1.04));
    elev = (hilly ? 22 : 6) * distanceM / 1000;
    avgCad = Math.round(166 + r() * 8);
  }
  const typeName: Record<string, string> = { easy: 'Easy run', recovery: 'Recovery jog', long: 'Long run', tempo: 'Steady run', threshold: 'Threshold reps', vo2max: 'Track intervals', speed: 'Easy run with strides', hills: 'Hill reps' };
  const id = `sample-${spec.date}-${idx}`;
  return {
    id, source: 'sample', sourceIds: { sample: id }, startTime: start.toISOString(), name: spec.name ?? typeName[spec.type] ?? 'Run', sport: 'run',
    distanceM: Math.round(distanceM), durationS: Math.round(movingS * 1.02), movingS: Math.round(movingS), elevGainM: Math.round(elev),
    avgHr, maxHr: Math.min(MAX_HR, maxHr), avgCadence: avgCad, laps, streams, isRace: spec.isRace,
    detailScore: withStreams ? 10 : 6, importedAt: new Date(SAMPLE_TODAY).toISOString(),
  };
}

export const SAMPLE_PROFILE: Profile = {
  name: 'Alex',
  units: 'km',
  theme: 'system',
  birthYear: 1986,
  maxHr: MAX_HR,
  restHr: REST_HR,
  goal: 'Run the Valencia Marathon in 3:14:30',
  experience: 'runner',
  daysAvailable: [1, 2, 3, 5, 6],
  longRunDay: 6,
  injuries: [{ area: 'Left calf', status: 'past', notes: 'Strain in June 2023, three weeks off' }],
  onboarded: true,
};

export const SAMPLE_RACES: Race[] = [
  { id: 'race-valencia', name: 'Valencia Marathon', date: '2026-12-06', distanceM: 42195, courseType: 'road', goalS: 3 * 3600 + 14 * 60 + 30, priority: 'A' },
  { id: 'race-sliema', name: 'Sliema 10K', date: '2026-11-15', distanceM: 10000, courseType: 'road', goalS: 40 * 60 + 30, priority: 'C' },
];

export interface SampleBundle {
  profile: Profile;
  activities: Activity[];
  races: Race[];
  plan: Plan;
  feedback: SessionFeedback[];
}

export function generateSample(): SampleBundle {
  const today = parseYmd(SAMPLE_TODAY);
  const planStart = parseYmd('2026-09-07');
  const streamFrom = ymd(addDays(today, -130));
  const specs: RunSpec[] = [];
  const rng = mulberry32(42);
  const raceByDate = new Map(PAST_RACES.map((r) => [r[0], r]));

  // ---- History before the plan ----
  for (let ws = parseYmd('2021-01-04'); ws < planStart; ws = addDays(ws, 7)) {
    const year = ws.getFullYear() + ws.getMonth() / 12;
    let weekKm = 16 + (year - 2021) * 7.5 + (rng() - 0.5) * 8;
    if (ws.getMonth() === 7) weekKm *= 0.75; // August heat
    if (ws.getMonth() === 11 && ws.getDate() > 20) weekKm *= 0.6;
    const nRuns = year < 2022 ? 3 : year < 2024 ? 4 : 5;
    const daysForRuns = nRuns === 3 ? [1, 3, 6] : nRuns === 4 ? [1, 3, 5, 6] : [1, 2, 3, 5, 6];
    const longKm = Math.min(30, weekKm * 0.32);
    for (const d of daysForRuns) {
      const date = ymd(addDays(ws, d));
      if (BREAKS.some(([a, b]) => date >= a && date <= b)) continue;
      const race = raceByDate.get(date);
      if (race) { specs.push({ date, type: 'race', km: race[2] / 1000, name: race[1], isRace: true, raceM: race[2], raceFactor: race[3] }); continue; }
      if (rng() < 0.07) continue;
      if (d === 6) specs.push({ date, type: 'long', km: Math.round(longKm) });
      else if (d === 1 && year >= 2021.8) specs.push({ date, type: (['threshold', 'vo2max', 'hills', 'tempo'] as SessionType[])[Math.floor(rng() * 4)], km: Math.round(Math.max(7, weekKm * 0.2)) });
      else specs.push({ date, type: rng() < 0.15 ? 'recovery' : 'easy', km: Math.max(4, Math.round((weekKm - longKm) / (nRuns - 1))) });
    }
  }

  // ---- Plan in progress for the A race, built on the day it started ----
  const preActs = specs.map((s, i) => makeActivity(s, i, false));
  const recent = preActs.filter((a) => { const d = daysBetween(new Date(a.startTime), planStart); return d > 0 && d <= 28; });
  const longest = preActs.filter((a) => { const d = daysBetween(new Date(a.startTime), planStart); return d > 0 && d <= 42; }).reduce((x, a) => Math.max(x, a.distanceM), 0);
  const P0 = trainingPaces(vdotAt('2026-09-07'));
  let plan = buildPlan({
    today: planStart, profile: SAMPLE_PROFILE, race: SAMPLE_RACES[0], paces: P0,
    recentWeeklyKm: recent.reduce((x, a) => x + a.distanceM, 0) / 4000, longestRecentKm: longest / 1000,
  });
  plan.createdAt = planStart.toISOString();
  plan.changes[0].at = planStart.toISOString();

  // Execute the plan up to yesterday, with realistic deviations
  const missed = new Set(['2026-10-08', '2026-09-26']);
  const tooHard = new Set(['2026-10-28']);
  for (const s of plan.sessions) {
    if (s.date >= SAMPLE_TODAY || s.type === 'rest') continue;
    const race = raceByDate.get(s.date);
    if (race) { specs.push({ date: s.date, type: 'race', km: race[2] / 1000, name: race[1], isRace: true, raceM: race[2], raceFactor: race[3] }); continue; }
    if (missed.has(s.date)) continue;
    // the runner follows the adapted plan: the quality day after the too-hard run became easy
    const afterTooHard = tooHard.has(ymd(addDays(parseYmd(s.date), -1))) && s.type !== 'long';
    specs.push({ date: s.date, type: afterTooHard ? 'easy' : s.type, km: Math.round(s.distanceM / 1000 * (0.97 + rng() * 0.06)), tooHard: tooHard.has(s.date) });
  }

  const activities = specs.map((s, i) => makeActivity(s, i, s.date >= streamFrom));

  // Feedback the runner logged on some recent runs
  const recentActs = activities.filter((a) => a.startTime.slice(0, 10) >= '2026-10-01');
  const feedback: SessionFeedback[] = [];
  const fb = (date: string, f: Omit<SessionFeedback, 'activityId' | 'loggedAt'>) => {
    const a = recentActs.find((x) => x.startTime.startsWith(date));
    if (a) feedback.push({ ...f, activityId: a.id, loggedAt: new Date(new Date(a.startTime).getTime() + 3 * 3600000).toISOString() });
  };
  fb('2026-10-11', { feel: 4, rpe: 9, pain: [], notes: 'Hot second half but held on. Happy with that.' });
  fb('2026-10-18', { feel: 3, rpe: 6, pain: [{ area: 'Left calf', severity: 1 }], notes: 'Calf a bit tight after the race last week.' });
  fb('2026-10-25', { feel: 4, rpe: 6, pain: [{ area: 'Left calf', severity: 1 }] });
  fb('2026-10-28', { feel: 3, rpe: 7, pain: [], notes: 'Felt good so pushed on. Probably too quick.' });
  fb('2026-11-01', { feel: 4, rpe: 7, pain: [], notes: 'Marathon pace felt controlled.' });
  fb('2026-11-03', { feel: 5, rpe: 8, pain: [] });

  // Replay adaptation day by day so the change log reads as it would have happened
  const typeOf = (a: Activity): SessionType => (a.isRace ? 'race' : (a.name.includes('Threshold') ? 'threshold' : a.name.includes('Steady') ? 'tempo' : 'easy'));
  for (let d = addDays(planStart, 1); d <= today; d = addDays(d, 1)) {
    const until = ymd(d);
    const before = plan.changes.length;
    plan = adaptPlan({
      plan, activities: activities.filter((a) => a.startTime.slice(0, 10) < until),
      feedback: feedback.filter((f) => f.loggedAt.slice(0, 10) < until), profile: SAMPLE_PROFILE, today: d,
      typeOf: (a) => (tooHard.has(a.startTime.slice(0, 10)) ? 'tempo' : typeOf(a)), paces: trainingPaces(vdotAt(until)),
    });
    for (let i = before; i < plan.changes.length; i++) plan.changes[i].at = new Date(`${until}T07:00:00`).toISOString();
  }

  return { profile: SAMPLE_PROFILE, activities, races: SAMPLE_RACES, plan, feedback };
}
