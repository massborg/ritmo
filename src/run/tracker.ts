// Recording a run with the phone's GPS (review #2 §3). Pure functions, so the maths is tested without a phone.
// Fixes worse than 25 m are dropped, and so are jumps faster than anyone runs. Distance comes from the filtered
// track; pace is smoothed over the last 30 seconds; once you have got going, the run pauses itself when you stop
// for 3 seconds. When GPS comes back after more than 30 seconds without a fix (the phone was locked, the page was
// paused), nothing is invented: no straight line, no distance and no time for the gap, which is kept and shown.
import type { PlannedSession, StreamPoint } from '../lib/types';

export interface Fix { t: number; lat: number; lon: number; acc: number; alt?: number | null; speed?: number | null }
export interface TrackPoint { t: number; lat: number; lon: number; d: number; alt?: number; moving: boolean; /** First point after a GPS gap */ gap?: boolean }
/** A stretch with no GPS (ms timestamps), and the distance when it started */
export interface TrackGap { fromT: number; toT: number; atM: number }

export interface TrackState {
  points: TrackPoint[];
  distanceM: number;
  movingS: number;
  elapsedS: number;
  startedAt: number; // ms
  paused: boolean; // paused by the runner
  autoPaused: boolean;
  stillSince?: number; // ms
  laps: { atS: number; atM: number }[];
  /** When the runner last pressed Resume (ms), so time until the next GPS fix still counts */
  resumedAt?: number;
  last?: Fix;
  /** Recent good fixes, for a speed that GPS jitter cannot fake while standing still */
  recent?: Fix[];
  /** GPS gaps of more than 30 seconds: left out of distance, time and pace */
  gaps?: TrackGap[];
}

/** No fix for this long while running is a gap, not a straight line */
export const GAP_MS = 30000;

export const MAX_ACCURACY_M = 25;
const MAX_SPEED = 1000 / 140; // 2:20/km: faster than any runner, so a GPS jump
const STOP_SPEED = 0.5; // m/s
const STOP_FOR_MS = 3000;

const R = 6371000;
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function startTrack(now: number): TrackState {
  return { points: [], distanceM: 0, movingS: 0, elapsedS: 0, startedAt: now, paused: false, autoPaused: false, laps: [] };
}

/** Add a GPS fix. Returns a new state (the input is not changed). */
export function addFix(s: TrackState, f: Fix, autoPause = true): TrackState {
  const next: TrackState = { ...s, points: s.points, elapsedS: (f.t - s.startedAt) / 1000 };
  if (f.acc > MAX_ACCURACY_M) return next; // too inaccurate to use
  const prev = s.last;
  if (!prev) {
    // Time from the start (or Resume) to this first fix counts as running time
    if (!s.paused) next.movingS = s.movingS + Math.max(0, (f.t - (s.resumedAt ?? s.startedAt)) / 1000);
    next.last = f;
    next.points = [...s.points, { t: next.elapsedS, lat: f.lat, lon: f.lon, d: s.distanceM, alt: f.alt ?? undefined, moving: !s.paused }];
    return next;
  }
  const dt = (f.t - prev.t) / 1000;
  if (dt <= 0) return next;
  if (f.t - prev.t > GAP_MS && !s.paused) {
    // GPS was gone (a locked phone, a paused page): start again from here, with nothing added for the gap
    next.gaps = [...(s.gaps ?? []), { fromT: prev.t, toT: f.t, atM: s.distanceM }];
    next.last = f; next.recent = [f]; next.stillSince = undefined; next.autoPaused = false;
    next.points = [...s.points, { t: next.elapsedS, lat: f.lat, lon: f.lon, d: s.distanceM, alt: f.alt ?? undefined, moving: true, gap: true }];
    return next;
  }
  const dd = haversine(prev, f);
  if (dd / dt > MAX_SPEED) return next; // a jump: ignore this fix, keep the previous one
  // Speed over the last ~8 seconds: GPS jitter of a few metres cannot make a standing runner look like moving
  const recent = [...(s.recent ?? []), f].filter((x) => f.t - x.t <= 8000);
  next.recent = recent;
  const span = (f.t - recent[0].t) / 1000;
  const speed = span >= 4 ? haversine(recent[0], f) / span : f.speed != null && f.speed >= 0 ? f.speed : dd / dt;
  // Auto-pause: under 0.5 m/s for 3 seconds
  let autoPaused = s.autoPaused, stillSince = s.stillSince;
  // Only once the runner has got going (20 m), so waiting at the start or testing indoors does not stop the clock
  if (autoPause && s.distanceM >= 20) {
    if (speed < STOP_SPEED) { stillSince = stillSince ?? f.t; if (f.t - stillSince >= STOP_FOR_MS) autoPaused = true; }
    else { stillSince = undefined; autoPaused = false; }
  }
  const moving = !s.paused && !autoPaused;
  next.autoPaused = autoPaused; next.stillSince = stillSince; next.last = f;
  if (moving) { next.distanceM = s.distanceM + dd; next.movingS = s.movingS + dt; }
  next.points = [...s.points, { t: next.elapsedS, lat: f.lat, lon: f.lon, d: next.distanceM, alt: f.alt ?? undefined, moving }];
  return next;
}

export const setPaused = (s: TrackState, paused: boolean, now = Date.now()): TrackState => paused
  ? { ...s, movingS: clockS(s, now), paused: true, stillSince: undefined, autoPaused: false, last: s.last }
  : { ...s, paused: false, stillSince: undefined, autoPaused: false, last: undefined, resumedAt: now };

/**
 * The run clock in seconds: running time that ticks every second like a stopwatch, not only when a GPS fix
 * arrives. It stops while paused (by the runner or automatically) and carries on through a GPS gap.
 */
export function clockS(s: TrackState, now: number): number {
  if (s.paused || s.autoPaused) return s.movingS;
  // Before the first fix the clock runs from the start; after that, a GPS gap holds it (the gap isn't counted)
  if (!s.last) return s.movingS + Math.max(0, (now - (s.resumedAt ?? s.startedAt)) / 1000);
  return s.movingS + Math.min(GAP_MS / 1000, Math.max(0, (now - s.last.t) / 1000));
}

/** Seconds since the last GPS fix while running, when that is longer than a gap (else undefined) */
export function gpsLostS(s: TrackState, now: number): number | undefined {
  if (s.paused || !s.last) return undefined;
  const x = now - s.last.t;
  return x > GAP_MS ? Math.round(x / 1000) : undefined;
}

/** Mark a lap at this moment (clock time and distance). */
export const addLap = (s: TrackState, now = Date.now()): TrackState => ({ ...s, laps: [...s.laps, { atS: clockS(s, now), atM: s.distanceM }] });

/** Each lap's time and distance so far, the current one last. */
export function lapSplits(s: TrackState, now: number): { n: number; s: number; m: number }[] {
  const marks = [...s.laps, { atS: clockS(s, now), atM: s.distanceM }];
  let ps = 0, pm = 0;
  return marks.map((x, i) => { const r = { n: i + 1, s: Math.max(0, x.atS - ps), m: Math.max(0, x.atM - pm) }; ps = x.atS; pm = x.atM; return r; });
}

/** Pace over the last 30 seconds of moving (s/km), or undefined when there is not enough movement. */
export function currentPace(s: TrackState, windowS = 30): number | undefined {
  const pts = s.points.filter((p) => p.moving);
  if (pts.length < 2) return undefined;
  const end = pts[pts.length - 1];
  let i = pts.length - 1;
  while (i > 0 && end.t - pts[i - 1].t <= windowS) i--;
  const a = pts[i];
  const dd = end.d - a.d, dt = end.t - a.t;
  return dd > 15 && dt > 0 ? dt / (dd / 1000) : undefined;
}

export const avgPace = (s: TrackState) => (s.distanceM > 20 ? s.movingS / (s.distanceM / 1000) : undefined);

/** Streams for the saved run (moving points only, so pauses do not count). */
export function toStreams(s: TrackState): StreamPoint[] {
  let t = 0, prevT: number | undefined;
  return s.points.filter((p) => p.moving).map((p) => {
    // A gap adds no time: the run's clock only counts what GPS saw
    if (prevT != null && !p.gap) t += Math.min(p.t - prevT, 30);
    prevT = p.t;
    return { t: Math.round(t), d: Math.round(p.d * 10) / 10, lat: p.lat, lon: p.lon, alt: p.alt, ...(p.gap ? { gap: true } : {}) };
  });
}

// ---------------- Workout steps ----------------
export interface WorkStep { label: string; kind: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'steady'; distanceM?: number; durationS?: number; pace?: [number, number] }

/** The planned session as a list of steps to follow: warm-up, each rep and recovery, cool-down. */
export function stepsFor(s: PlannedSession): WorkStep[] {
  const out: WorkStep[] = [];
  for (const st of s.steps) {
    const m = st.label.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(km|m|min|s)\b/i);
    if (st.kind === 'work' && m) {
      const n = Number(m[1]), v = Number(m[2]), unit = m[3].toLowerCase();
      const rec = st.detail.match(/(\d+(?:\.\d+)?)\s*(min|s)\s*(?:easy )?jog/i);
      const recS = rec ? Number(rec[1]) * (rec[2] === 'min' ? 60 : 1) : 90;
      for (let i = 1; i <= n; i++) {
        out.push({ label: `Rep ${i} of ${n}`, kind: 'work', pace: st.pace, ...(unit === 'km' ? { distanceM: v * 1000 } : unit === 'm' ? { distanceM: v } : { durationS: v * (unit === 'min' ? 60 : 1) }) });
        if (i < n) out.push({ label: 'Recovery', kind: 'recovery', durationS: recS });
      }
    } else {
      const kind = st.kind === 'warmup' ? 'warmup' : st.kind === 'cooldown' ? 'cooldown' : st.kind === 'work' ? 'work' : 'steady';
      out.push({ label: st.label, kind, pace: st.pace, ...(st.km ? { distanceM: st.km * 1000 } : st.durationS ? { durationS: st.durationS } : {}) });
    }
  }
  return out;
}

/** What is left of the current step, which started at (startS moving seconds, startM metres). */
export function stepLeft(st: WorkStep, startS: number, startM: number, movingS: number, distanceM: number): { leftS?: number; leftM?: number; complete: boolean } {
  if (st.distanceM) { const left = startM + st.distanceM - distanceM; return { leftM: Math.max(0, left), complete: left <= 0 }; }
  if (st.durationS) { const left = startS + st.durationS - movingS; return { leftS: Math.max(0, left), complete: left <= 0 }; }
  return { complete: false }; // open-ended: the runner presses Lap to move on
}

/** "too fast", "on target" or "too slow" against a pace band, with a few seconds of slack. */
export function paceGauge(paceS: number | undefined, band?: [number, number]): 'fast' | 'ok' | 'slow' | undefined {
  if (!paceS || !band) return undefined;
  if (paceS < band[0] - 3) return 'fast';
  if (paceS > band[1] + 3) return 'slow';
  return 'ok';
}
