// Fitness model: VDOT (Daniels/Gilbert), race predictions, training paces and heart-rate zones.
import type { Activity, Profile, StreamPoint } from '../lib/types';

/** Oxygen cost of running at v metres/minute */
const vo2AtV = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/** Fraction of VO2max sustainable for t minutes */
const pctMax = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

export function vdotFromPerformance(distanceM: number, timeS: number): number {
  const t = timeS / 60;
  const v = distanceM / t;
  return vo2AtV(v) / pctMax(t);
}

/** Predict race time (s) for a distance given VDOT, by bisection */
export function predictTime(vdot: number, distanceM: number): number {
  let lo = distanceM / 400; // 400 m/min — far too fast
  let hi = distanceM / 60; // 60 m/min — walking
  lo *= 60;
  hi *= 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromPerformance(distanceM, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Velocity (m/min) at which oxygen cost equals the given VO2 */
const vAtVo2 = (vo2: number) => {
  const a = 0.000104, b = 0.182258, c = -(4.6 + vo2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
};
const paceAtPct = (vdot: number, pct: number) => 60000 / vAtVo2(vdot * pct); // s per km

export interface TrainingPaces {
  easy: [number, number]; // s/km fast, slow
  recovery: [number, number];
  long: [number, number];
  marathon: [number, number];
  threshold: [number, number];
  interval: [number, number];
  repetition: [number, number];
}

export function trainingPaces(vdot: number): TrainingPaces {
  const mp = predictTime(vdot, 42195) / 42.195;
  const rep = predictTime(vdot, 1609.344) / 1.609344;
  return {
    easy: [paceAtPct(vdot, 0.74), paceAtPct(vdot, 0.65)],
    recovery: [paceAtPct(vdot, 0.64), paceAtPct(vdot, 0.58)],
    long: [paceAtPct(vdot, 0.75), paceAtPct(vdot, 0.66)],
    marathon: [mp - 4, mp + 4],
    threshold: [paceAtPct(vdot, 0.885), paceAtPct(vdot, 0.855)],
    interval: [paceAtPct(vdot, 0.985), paceAtPct(vdot, 0.955)],
    repetition: [rep - 3, rep + 3],
  };
}

/** Fastest time over `distanceM` inside a stream (sliding window, linear interpolation) */
export function bestEffort(streams: StreamPoint[], distanceM: number): number | undefined {
  if (!streams.length || streams[streams.length - 1].d < distanceM) return undefined;
  let best = Infinity;
  let j = 0;
  for (let i = 0; i < streams.length; i++) {
    const target = streams[i].d + distanceM;
    while (j < streams.length && streams[j].d < target) j++;
    if (j >= streams.length) break;
    const a = streams[j - 1], b = streams[j];
    const f = b.d === a.d ? 0 : (target - a.d) / (b.d - a.d);
    const tEnd = a.t + f * (b.t - a.t);
    best = Math.min(best, tEnd - streams[i].t);
  }
  return isFinite(best) ? best : undefined;
}

export interface HrSetup {
  max: number;
  rest: number;
  estimated: boolean;
}

export function hrSetup(profile: Profile, activities: Activity[], today = new Date()): HrSetup {
  if (profile.maxHr) return { max: profile.maxHr, rest: profile.restHr ?? 52, estimated: !profile.restHr };
  const recent = activities
    .filter((a) => a.maxHr && new Date(a.startTime).getTime() > today.getTime() - 730 * 86400000)
    .map((a) => a.maxHr!)
    .sort((a, b) => b - a);
  if (recent.length >= 5) return { max: recent[Math.min(2, recent.length - 1)], rest: profile.restHr ?? 52, estimated: true };
  const age = profile.birthYear ? today.getFullYear() - profile.birthYear : 40;
  return { max: Math.round(208 - 0.7 * age), rest: profile.restHr ?? 55, estimated: true };
}

/** Five zones on heart-rate reserve (Karvonen). Returns lower bounds Z1..Z5 and the ceiling. */
export function hrZones(hr: HrSetup): { zone: number; min: number; max: number }[] {
  const r = hr.max - hr.rest;
  const b = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((p) => Math.round(hr.rest + p * r));
  return [1, 2, 3, 4, 5].map((z) => ({ zone: z, min: b[z - 1], max: b[z] }));
}

export function zoneOf(hrValue: number, zones: { zone: number; min: number; max: number }[]): number {
  if (hrValue < zones[0].min) return 1;
  for (const z of zones) if (hrValue < z.max) return z.zone;
  return 5;
}

export const ZONE_NAMES = ['Recovery', 'Easy', 'Tempo', 'Threshold', 'VO2 max'];

export interface FitnessEstimate {
  vdot: number;
  basedOn: string; // plain-English source
  date: string;
  confidence: 'high' | 'medium' | 'low';
}

const EFFORT_DISTANCES = [5000, 10000, 21097.5];

/**
 * Estimate VDOT at a given date from the previous 120 days.
 * Races count fully; hard training efforts are discounted because they are rarely all-out.
 */
export function estimateFitness(activities: Activity[], hr: HrSetup, at = new Date()): FitnessEstimate | undefined {
  const from = at.getTime() - 120 * 86400000;
  let best: FitnessEstimate | undefined;
  for (const a of activities) {
    const t = new Date(a.startTime).getTime();
    if (t < from || t > at.getTime() || a.distanceM < 3000) continue;
    const hardHr = a.avgHr ? a.avgHr >= hr.rest + 0.82 * (hr.max - hr.rest) : false;
    const candidates: { v: number; label: string }[] = [];
    if (a.isRace) candidates.push({ v: vdotFromPerformance(a.distanceM, a.movingS), label: `your ${a.name}` });
    if (a.streams?.length) {
      for (const d of EFFORT_DISTANCES) {
        const e = bestEffort(a.streams, d);
        if (e) candidates.push({ v: vdotFromPerformance(d, e) * (a.isRace ? 1 : 0.965), label: `a ${d / 1000} km effort on ${a.startTime.slice(0, 10)}` });
      }
    }
    if (!a.isRace && hardHr) candidates.push({ v: vdotFromPerformance(a.distanceM, a.movingS) * 0.97, label: `your hard run on ${a.startTime.slice(0, 10)}` });
    for (const c of candidates) {
      // decay older results a little: 1% per 30 days
      const ageDays = (at.getTime() - t) / 86400000;
      const v = c.v * (1 - 0.01 * (ageDays / 30));
      if (!best || v > best.vdot) {
        best = { vdot: v, basedOn: c.label, date: a.startTime.slice(0, 10), confidence: a.isRace ? 'high' : 'medium' };
      }
    }
  }
  if (!best) {
    // fall back to average easy running: easy pace ~ 70% VO2max
    const easy = activities
      .filter((a) => new Date(a.startTime).getTime() > from && a.distanceM > 4000)
      .map((a) => a.movingS / (a.distanceM / 1000));
    if (!easy.length) return undefined;
    easy.sort((a, b) => a - b);
    const median = easy[Math.floor(easy.length / 2)];
    const v = 60000 / median;
    return { vdot: vo2AtV(v) / 0.7, basedOn: 'your typical easy pace', date: new Date(at).toISOString().slice(0, 10), confidence: 'low' };
  }
  best.vdot = Math.round(best.vdot * 10) / 10;
  return best;
}
