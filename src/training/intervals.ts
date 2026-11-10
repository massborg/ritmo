// Splitting a run into intervals (update 2, §2 Intervals). The rules, in order:
//   1. workout steps from the watch (laps marked warm up / active / rest / cool down in the file)
//   2. manual laps from the watch (laps of uneven length; even 1 km or 1 mile laps are auto-laps, not reps)
//   3. reps the runner entered by hand
//   4. reps found automatically in the pace stream: stretches of at least 15 s clearly faster than the running
//      around them (more than 15% faster than the rolling median), paired with the recoveries between them
//   5. otherwise 1 km (or mile) splits
// Reps are never judged against the easy-pace band; strides just get a consistency note.
import type { Activity, Lap, StreamPoint } from '../lib/types';

export type SegmentKind = 'warmup' | 'run' | 'recovery' | 'cooldown' | 'split';
export interface Segment {
  kind: SegmentKind;
  /** Rep or split number (1-based) for runs and splits */
  n?: number;
  startS: number;
  endS: number;
  timeS: number;
  distanceM: number;
  paceS?: number;
  avgHr?: number;
  maxHr?: number;
  cadence?: number;
  elevChangeM?: number;
}
export type SplitMethod = 'workout' | 'laps' | 'entered' | 'auto' | 'splits' | 'none';
export interface Intervals {
  method: SplitMethod;
  /** "6 × 30 s strides", "5 × 1 km", "Splits" */
  title: string;
  /** "found automatically", "from your workout", "from your laps", "as you entered them" */
  caption: string;
  segments: Segment[];
  reps: Segment[];
  summary?: { avgRepPaceS?: number; avgRepTimeS: number; avgRepDistM?: number; avgRecoveryS?: number; spreadS?: number; faded: boolean; note: string; ok: boolean };
  footnote: string;
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Stats for the stream between two times */
function stats(s: StreamPoint[], startS: number, endS: number): Pick<Segment, 'avgHr' | 'maxHr' | 'cadence' | 'elevChangeM' | 'distanceM'> {
  const pts = s.filter((p) => p.t >= startS && p.t <= endS);
  if (!pts.length) return { distanceM: 0 };
  const hr = pts.map((p) => p.hr).filter((x): x is number => !!x);
  const cad = pts.map((p) => p.cad).filter((x): x is number => !!x);
  const alt = pts.filter((p) => p.alt != null);
  return {
    distanceM: pts[pts.length - 1].d - pts[0].d,
    avgHr: hr.length ? Math.round(mean(hr)) : undefined,
    maxHr: hr.length ? Math.max(...hr) : undefined,
    cadence: cad.length ? Math.round(mean(cad)) : undefined,
    elevChangeM: alt.length > 1 ? Math.round(alt[alt.length - 1].alt! - alt[0].alt!) : undefined,
  };
}
function seg(kind: SegmentKind, startS: number, endS: number, s: StreamPoint[] | undefined, extra: Partial<Segment> = {}): Segment {
  const st = s?.length ? stats(s, startS, endS) : { distanceM: 0 };
  const distanceM = extra.distanceM ?? st.distanceM;
  const timeS = extra.timeS ?? endS - startS;
  return { kind, startS, endS, timeS, ...st, ...extra, distanceM, paceS: distanceM > 20 ? timeS / (distanceM / 1000) : undefined };
}

/** Round a rep length to a friendly figure: "30 s", "1:30", "400 m", "1 km" */
function repName(reps: Segment[], strides: boolean): string {
  const n = reps.length;
  const t = median(reps.map((r) => r.timeS)), d = median(reps.map((r) => r.distanceM));
  if (strides || t < 75) return `${n} × ${Math.round(t / 5) * 5} s${strides ? ' strides' : ''}`;
  const km = d / 1000;
  for (const nice of [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 1.6, 2, 3, 4, 5]) if (Math.abs(km - nice) / nice < 0.06) return `${n} × ${nice < 1 ? `${Math.round(nice * 1000)} m` : `${nice} km`}`;
  const m = Math.round(t / 15) * 15;
  return `${n} × ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function withPairs(reps: Segment[], s: StreamPoint[] | undefined, total: { endS: number }): Segment[] {
  const out: Segment[] = [];
  if (reps[0].startS > 5) out.push(seg('warmup', 0, reps[0].startS, s));
  reps.forEach((r, i) => {
    out.push({ ...r, kind: 'run', n: i + 1 });
    const next = reps[i + 1];
    if (next && next.startS - r.endS > 2) out.push(seg('recovery', r.endS, next.startS, s));
  });
  const last = reps[reps.length - 1];
  if (total.endS - last.endS > 5) out.push(seg('cooldown', last.endS, total.endS, s));
  return out;
}

function summarise(reps: Segment[], segments: Segment[], strides: boolean): Intervals['summary'] {
  const paces = reps.map((r) => r.paceS).filter((x): x is number => !!x);
  const rec = segments.filter((x) => x.kind === 'recovery');
  const spread = paces.length > 1 ? Math.max(...paces) - Math.min(...paces) : undefined;
  const firstHalf = mean(paces.slice(0, Math.ceil(paces.length / 2))), lastHalf = mean(paces.slice(Math.floor(paces.length / 2)));
  const faded = paces.length >= 3 && lastHalf > firstHalf * 1.05;
  const note = !paces.length ? `${reps.length} reps` : faded
    ? `The reps faded: the last ones were ${Math.round(((lastHalf - firstHalf) / firstHalf) * 100)}% slower than the first. Start the first rep a touch easier next time.`
    : spread != null ? `Even reps: only ${Math.round(spread)} s/km between fastest and slowest${strides ? ', which is what strides are for' : ''}.` : '';
  return {
    avgRepPaceS: paces.length ? mean(paces) : undefined, avgRepTimeS: mean(reps.map((r) => r.timeS)), avgRepDistM: reps.some((r) => r.distanceM) ? mean(reps.map((r) => r.distanceM)) : undefined,
    avgRecoveryS: rec.length ? mean(rec.map((r) => r.timeS)) : undefined, spreadS: spread, faded, note, ok: !faded,
  };
}

/** Consecutive warm-up laps (or cool-down laps) become one row, as on the watch: "Warm up · 31:17 · 6.48 km" */
function mergeEnds(segments: Segment[], s?: StreamPoint[]): Segment[] {
  const out: Segment[] = [];
  for (const x of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === x.kind && (x.kind === 'warmup' || x.kind === 'cooldown')) {
      const distanceM = prev.distanceM + x.distanceM, timeS = prev.timeS + x.timeS;
      const st: Partial<Segment> = s?.length ? stats(s, prev.startS, x.endS) : {};
      out[out.length - 1] = { ...prev, ...st, endS: x.endS, timeS, distanceM, paceS: distanceM > 20 ? timeS / (distanceM / 1000) : undefined, avgHr: st.avgHr ?? (prev.avgHr && x.avgHr ? Math.round((prev.avgHr * prev.timeS + x.avgHr * x.timeS) / timeS) : prev.avgHr ?? x.avgHr) };
    } else out.push(x);
  }
  return out;
}

/** Speed (m/s) at each point over a window of about `win` seconds */
function speeds(s: StreamPoint[], win = 10): number[] {
  const out: number[] = [];
  let j = 0, k = 0;
  for (let i = 0; i < s.length; i++) {
    while (s[i].t - s[j].t > win / 2) j++;
    while (k < s.length - 1 && s[k + 1].t - s[i].t <= win / 2) k++;
    const dt = s[k].t - s[j].t;
    out.push(dt > 0 ? (s[k].d - s[j].d) / dt : 0);
  }
  return out;
}

/** Rule 4: reps found in the pace stream */
export function detectReps(s: StreamPoint[]): Segment[] {
  if (s.length < 30) return [];
  const v = speeds(s, 10);
  // Rolling median of the running around each point (±3 minutes), from a thinned copy so it stays fast
  const step = Math.max(1, Math.floor(s.length / 600));
  const thin = s.map((p, i) => ({ t: p.t, v: v[i] })).filter((_, i) => i % step === 0);
  const thr: number[] = s.map((p) => median(thin.filter((x) => Math.abs(x.t - p.t) <= 180 && x.v > 1).map((x) => x.v)) * 1.15);
  const fast: boolean[] = s.map((_, i) => thr[i] > 0 && v[i] > thr[i] && v[i] > 2.5);
  // Edges from a short (3 s) window, so a 30 s stride is not smeared into 35 s by the smoothing
  const v3 = speeds(s, 3);
  // Contiguous fast stretches, small gaps (under 4 s) bridged
  const runs: { a: number; b: number }[] = [];
  let start = -1, lastFast = -1;
  for (let i = 0; i < s.length; i++) {
    if (fast[i]) { if (start < 0) start = i; lastFast = i; }
    else if (start >= 0 && s[i].t - s[lastFast].t > 4) { runs.push({ a: start, b: lastFast }); start = -1; }
  }
  if (start >= 0) runs.push({ a: start, b: lastFast });
  const tight = runs.map((r) => {
    let a = r.a, b = r.b;
    while (a < b && v3[a] <= thr[a]) a++;
    while (b > a && v3[b] <= thr[b]) b--;
    while (a > 0 && v3[a - 1] > thr[a - 1] && s[r.a].t - s[a - 1].t < 6) a--;
    while (b < s.length - 1 && v3[b + 1] > thr[b + 1] && s[b + 1].t - s[r.b].t < 6) b++;
    return { a, b };
  });
  const reps = tight.filter((r) => s[r.b].t - s[r.a].t >= 15).map((r) => seg('run', s[r.a].t, s[r.b].t, s));
  return reps.length >= 2 ? reps : [];
}

const lapSeg = (l: Lap, kind: SegmentKind, s?: StreamPoint[]): Segment => seg(kind, l.startS, l.startS + l.durationS, s, { distanceM: l.distanceM, timeS: l.durationS, ...(l.avgHr ? { avgHr: l.avgHr } : {}) });

/** Even laps (all about 1 km or 1 mile) are the watch's auto-laps, not reps */
const autoLaps = (laps: Lap[]) => {
  const inner = laps.slice(0, -1);
  return inner.length >= 2 && inner.every((l) => Math.abs(l.distanceM - 1000) < 25) || inner.length >= 2 && inner.every((l) => Math.abs(l.distanceM - 1609.344) < 30);
};

/** Rule 5: per-km (or per-mile) splits from the stream */
function splits(a: Activity, unitM: number): Segment[] {
  const s = a.streams;
  if (!s?.length) return [];
  const out: Segment[] = [];
  let from = s[0];
  for (const p of s) {
    if (p.d - from.d >= unitM) { out.push(seg('split', from.t, p.t, s, { n: out.length + 1 })); from = p; }
  }
  const last = s[s.length - 1];
  if (last.d - from.d > 50) out.push(seg('split', from.t, last.t, s, { n: out.length + 1 }));
  return out;
}

export function splitRun(a: Activity, units: 'km' | 'mi' = 'km'): Intervals {
  const s = a.streams?.length ? a.streams : undefined;
  const endS = s ? s[s.length - 1].t : a.durationS;
  const laps = a.laps ?? [];

  // 1. Workout steps from the watch
  if (laps.length > 1 && laps.some((l) => l.intensity === 'active') && laps.some((l) => l.intensity && l.intensity !== 'active')) {
    const kindOf = (l: Lap, i: number): SegmentKind => l.intensity === 'warmup' ? 'warmup' : l.intensity === 'cooldown' ? 'cooldown' : l.intensity === 'rest' || l.intensity === 'recovery' ? 'recovery' : i === 0 && laps.length > 2 && !laps.some((x) => x.intensity === 'warmup') ? 'warmup' : 'run';
    let n = 0;
    const segments = mergeEnds(laps.map((l, i) => { const k = kindOf(l, i); return { ...lapSeg(l, k, s), ...(k === 'run' ? { n: ++n } : {}) }; }), s);
    const reps = segments.filter((x) => x.kind === 'run');
    if (reps.length >= 2) {
      const strides = median(reps.map((r) => r.timeS)) < 60;
      return { method: 'workout', title: repName(reps, strides), caption: 'from your workout', segments, reps, summary: summarise(reps, segments, strides), footnote: 'Split using the workout steps your watch recorded (warm up, run, recovery, cool down).' };
    }
  }
  // 2. Manual laps
  if (laps.length >= 3 && !autoLaps(laps)) {
    const lp = laps.map((l) => (l.distanceM > 20 ? l.durationS / (l.distanceM / 1000) : Infinity));
    const m = median(lp.filter(Number.isFinite));
    const isRep = lp.map((p, i) => p < m * 0.93 && i > 0 && i < laps.length - 1 || (p < m * 0.85));
    if (isRep.filter(Boolean).length >= 2) {
      let n = 0;
      const firstRep = isRep.indexOf(true), lastRep = isRep.lastIndexOf(true);
      const segments = mergeEnds(laps.map((l, i) => {
        const k: SegmentKind = isRep[i] ? 'run' : i < firstRep ? 'warmup' : i > lastRep ? 'cooldown' : 'recovery';
        return { ...lapSeg(l, k, s), ...(k === 'run' ? { n: ++n } : {}) };
      }), s);
      const reps = segments.filter((x) => x.kind === 'run');
      const strides = median(reps.map((r) => r.timeS)) < 60;
      return { method: 'laps', title: repName(reps, strides), caption: 'from your laps', segments, reps, summary: summarise(reps, segments, strides), footnote: 'Split using the laps you pressed on your watch: the faster laps are the reps.' };
    }
  }
  // 3. Reps entered by hand
  if (a.reps?.some((r) => r.kind === 'work' && r.timeS)) {
    let t = 0, n = 0;
    const segments: Segment[] = a.reps.map((r) => {
      const kind: SegmentKind = r.kind === 'work' ? 'run' : r.kind === 'warmup' ? 'warmup' : r.kind === 'cooldown' ? 'cooldown' : 'recovery';
      const timeS = r.timeS ?? 0;
      const x: Segment = { kind, startS: t, endS: t + timeS, timeS, distanceM: r.distanceM ?? 0, paceS: r.distanceM && timeS ? timeS / (r.distanceM / 1000) : undefined, avgHr: r.avgHr, ...(kind === 'run' ? { n: ++n } : {}) };
      t += timeS;
      return x;
    });
    const reps = segments.filter((x) => x.kind === 'run');
    const strides = median(reps.map((r) => r.timeS)) < 60;
    return { method: 'entered', title: repName(reps, strides), caption: 'as you entered them', segments, reps, summary: summarise(reps, segments, strides), footnote: 'These are the reps you entered. Once the watch file arrives (from Strava or an upload), Ritmo splits the run from it.' };
  }
  // 4. Found automatically in the pace stream
  if (s) {
    const found = detectReps(s);
    if (found.length >= 2) {
      const segments = withPairs(found, s, { endS });
      const reps = segments.filter((x) => x.kind === 'run');
      const strides = median(reps.map((r) => r.timeS)) < 60;
      return { method: 'auto', title: repName(reps, strides), caption: 'found automatically', segments, reps, summary: summarise(reps, segments, strides), footnote: 'Found automatically: stretches of at least 15 seconds clearly faster (over 15%) than the running around them. Everything before the first rep is the warm up, after the last the cool down.' };
    }
  }
  // 5. Splits
  const unitM = units === 'mi' ? 1609.344 : 1000;
  const sp = splits(a, unitM);
  if (sp.length) return { method: 'splits', title: 'Splits', caption: `per ${units}`, segments: sp, reps: [], footnote: `No reps or laps in this run, so it is shown in ${units === 'mi' ? 'mile' : '1 km'} splits.` };
  return { method: 'none', title: 'Splits', caption: '', segments: [], reps: [], footnote: 'This run has no laps, reps or GPS track to split.' };
}

/** "0:31.6" under a minute (tenths), "31:17" or "1:09:49" otherwise */
export function segTime(s: number): string {
  if (s < 60) return `0:${(Math.round(s * 10) / 10).toFixed(1).padStart(4, '0')}`;
  const r = Math.round(s), h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), sec = r % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
