// Self-contained maths for each run's stored summary. No imports, so the same file runs in the app and in the
// derive-runs server function (Deno). Keep it free of app types and libraries.

export interface CorePoint { t: number; d: number; hr?: number }
export interface CoreLap { distanceM: number; durationS: number }
export interface CoreDerived { v: number; be?: Record<string, number>; segs?: number[]; hrh?: Record<string, number> }

/** Bump when the summary changes, so stored summaries are recomputed. */
export const DERIVED_VERSION = 1;

/** Best-effort distances, in metres: 400 m, 1 km, 1 mile, 3K, 5K, 5 mi, 10K, 15K, 10 mi, half, 30K, marathon. */
export const EFFORT_METRES = [400, 1000, 1609.344, 3000, 5000, 8046.72, 10000, 15000, 16093.44, 21097.5, 30000, 42195];
export const effortKey = (m: number) => String(Math.round(m));

/** Fastest running speed accepted from GPS (2:20/km). Faster jumps between two points are GPS glitches. */
const MAX_SPEED = 1000 / 140;
const isGlitch = (dt: number, dd: number) => dd > 0 && (dt <= 0 ? dd > 5 : dd / dt > MAX_SPEED);

/** Streams with GPS jumps removed: distance gained faster than 2:20/km between two points is dropped. */
export function cleanStreams<T extends CorePoint>(streams: T[]): T[] {
  let glitch = false;
  for (let i = 1; i < streams.length && !glitch; i++) glitch = isGlitch(streams[i].t - streams[i - 1].t, streams[i].d - streams[i - 1].d);
  if (!glitch) return streams;
  const out: T[] = [streams[0]];
  let removed = 0;
  for (let i = 1; i < streams.length; i++) {
    const dd = streams[i].d - streams[i - 1].d;
    if (isGlitch(streams[i].t - streams[i - 1].t, dd)) removed += dd;
    out.push({ ...streams[i], d: streams[i].d - removed });
  }
  return out;
}

/** Fastest time over a distance anywhere inside a run (sliding window), ignoring GPS glitches. */
export function bestEffort(raw: CorePoint[], distanceM: number): number | undefined {
  const streams = cleanStreams(raw);
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

/** Paces (s/km) of consecutive 400 m segments, the same segments the session classifier uses. */
export function segmentPaces(streams: CorePoint[], seg = 400): number[] {
  const out: number[] = [];
  if (!streams.length) return out;
  let startIdx = 0;
  let next = seg;
  const total = streams[streams.length - 1].d;
  for (let i = 1; i < streams.length; i++) {
    if (streams[i].d >= next || i === streams.length - 1) {
      const dM = streams[i].d - streams[startIdx].d;
      const tS = streams[i].t - streams[startIdx].t;
      if (dM < 50) break;
      if (dM > seg * 0.7) out.push(tS / (dM / 1000));
      startIdx = i;
      next += seg;
      if (next > total + seg) break;
    }
  }
  return out;
}

/** Lap or segment paces, kept only when the run looks structured (fast and slow parts). */
function structuredSegments(streams: CorePoint[] | undefined, laps: CoreLap[] | undefined): number[] | undefined {
  const lapPaces = (laps ?? []).filter((l) => l.distanceM > 150).map((l) => l.durationS / (l.distanceM / 1000));
  const segs = lapPaces.length >= 5 ? lapPaces : streams?.length ? segmentPaces(streams) : [];
  if (segs.length < 6) return undefined;
  const sorted = [...segs].sort((x, y) => x - y);
  if (sorted[Math.floor(sorted.length * 0.75)] / sorted[Math.floor(sorted.length * 0.25)] <= 1.18) return undefined;
  return segs.map((p) => Math.round(p));
}

/** Seconds spent in each 5 bpm heart-rate band, keyed by the band's lower edge. */
function hrHistogram(s: CorePoint[]): Record<string, number> | undefined {
  const h: Record<string, number> = {};
  let any = false;
  for (let i = 1; i < s.length; i++) {
    const hr = s[i].hr;
    if (!hr) continue;
    const dt = s[i].t - s[i - 1].t;
    if (dt <= 0 || dt > 30) continue;
    const k = String(Math.floor(hr / 5) * 5);
    h[k] = (h[k] ?? 0) + dt;
    any = true;
  }
  if (!any) return undefined;
  for (const k of Object.keys(h)) h[k] = Math.round(h[k]);
  return h;
}

/** The stored summary of a run from its streams and laps; undefined when it has neither. */
export function deriveCore(streams: CorePoint[] | undefined | null, laps: CoreLap[] | undefined | null): CoreDerived | undefined {
  const s = streams?.length ? streams : undefined;
  const l = laps?.length ? laps : undefined;
  if (!s && !l) return undefined;
  const be: Record<string, number> = {};
  if (s) for (const m of EFFORT_METRES) {
    const e = bestEffort(s, m);
    if (e) be[effortKey(m)] = Math.round(e * 10) / 10;
  }
  const segs = structuredSegments(s, l);
  const hrh = s ? hrHistogram(s) : undefined;
  return { v: DERIVED_VERSION, ...(Object.keys(be).length ? { be } : {}), ...(segs ? { segs } : {}), ...(hrh ? { hrh } : {}) };
}
