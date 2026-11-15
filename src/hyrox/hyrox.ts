// HYROX recording (update 4, task 5): the segments of a session, the live recorder's state (one tap per segment,
// undo, pause, optional Roxzone timing), and what the summary says about it. No screen code here.
import { RUN_M, STATIONS, divisionLabel, loadFor, stationByKey, type Division, type StationKey } from './hyroxDivisions';

export type HyroxMode = 'full' | 'half_front' | 'half_back' | 'custom' | 'practice' | 'race';
export const MODE_LABEL: Record<HyroxMode, string> = { full: 'HYROX full simulation', half_front: 'HYROX half simulation (front)', half_back: 'HYROX half simulation (back)', custom: 'HYROX custom session', practice: 'HYROX station practice', race: 'HYROX race' };

/** One part of a session, as planned */
export interface SegmentPlan {
  kind: 'run' | 'station' | 'rest';
  key: 'run' | 'rest' | StationKey;
  /** Run 1–8 or station 1–8 (its place in the race), or the repeat number in practice */
  n: number;
  distanceM?: number; reps?: number; loadKg?: number;
  /** What was done instead (missing equipment): flagged, and left out of records */
  swapped?: string;
}
/** One part as recorded. `roxzone` is the transition before a station (arrive → start), when it is timed. */
export interface Segment extends Omit<SegmentPlan, 'kind' | 'key'> {
  i: number; kind: SegmentPlan['kind'] | 'roxzone'; key: SegmentPlan['key'] | 'roxzone';
  startMs: number; endMs: number;
  /** Time in the segment, without pauses */
  ms: number;
  /** Distance measured by GPS (runs outdoors) */
  gpsM?: number;
}
export interface HyroxSession {
  id: string; startedAt: string; mode: HyroxMode; division: Division; title: string;
  segments: Segment[]; totalMs: number; isRace: boolean;
  /** Runs on a treadmill or indoors: time only */
  indoor?: boolean;
  /** Entered after the race from the official splits, not recorded live */
  entered?: boolean;
  goalMs?: number; rpe?: number; notes?: string; templateId?: string;
  /** The Hub post made for it, if any */
  postId?: string;
}
export interface HyroxTemplate { id: string; name: string; segments: SegmentPlan[]; createdAt: string; lastUsedAt?: string }
export interface HyroxPrefs {
  division?: Division; roxzone?: boolean; indoor?: boolean;
  /** Station → what is done instead */
  swaps?: Partial<Record<StationKey, string>>;
  templates?: HyroxTemplate[];
  /** Target time per station and per 1 km run, in seconds (from onboarding) */
  targets?: Partial<Record<StationKey | 'run', number>>;
  goalS?: number;
}

const run = (n: number): SegmentPlan => ({ kind: 'run', key: 'run', n, distanceM: RUN_M });
export function stationPlan(key: StationKey, division: Division, swaps: HyroxPrefs['swaps'] = {}, n?: number): SegmentPlan {
  const s = stationByKey.get(key)!;
  const sw = swaps?.[key] ? s.swaps.find((x) => x.id === swaps[key]) : undefined;
  return { kind: 'station', key, n: n ?? s.n, distanceM: s.distanceM, reps: s.reps, loadKg: sw ? undefined : loadFor(division, key)?.kg, swapped: sw?.name };
}
/** The segments of a simulation: full (16), or the front or back half (8) */
export function simulationPlan(mode: 'full' | 'half_front' | 'half_back' | 'race', division: Division, swaps?: HyroxPrefs['swaps']): SegmentPlan[] {
  const [from, to] = mode === 'half_front' ? [1, 4] : mode === 'half_back' ? [5, 8] : [1, 8];
  return STATIONS.filter((s) => s.n >= from && s.n <= to).flatMap((s) => [run(s.n), stationPlan(s.key, division, swaps)]);
}
/** One station, timed, with optional repeats (a rest between them) */
export function practicePlan(key: StationKey, repeats: number, division: Division, swaps?: HyroxPrefs['swaps']): SegmentPlan[] {
  const out: SegmentPlan[] = [];
  for (let i = 1; i <= Math.max(1, repeats); i++) { if (i > 1) out.push({ kind: 'rest', key: 'rest', n: i - 1 }); out.push(stationPlan(key, division, swaps, i)); }
  return out;
}

export const segmentName = (s: Pick<SegmentPlan, 'kind' | 'key' | 'n' | 'swapped'> | Pick<Segment, 'kind' | 'key' | 'n' | 'swapped'>): string =>
  s.kind === 'run' ? `Run ${s.n}` : s.kind === 'rest' ? 'Rest' : s.kind === 'roxzone' ? 'Roxzone' : s.swapped ?? stationByKey.get(s.key as StationKey)?.name ?? 'Station';
export function segmentWork(s: SegmentPlan, division: Division): string {
  if (s.kind === 'rest') return 'Recover, then start the next one';
  const d = s.distanceM ? (s.kind === 'run' && s.distanceM >= 1000 && s.distanceM % 1000 === 0 ? `${s.distanceM / 1000} km` : `${s.distanceM} m`) : s.reps ? `${s.reps} reps` : '';
  if (s.kind === 'run') return d;
  const st = stationByKey.get(s.key as StationKey)!;
  if (s.swapped) return `${st.swaps.find((x) => x.name === s.swapped)?.work ?? d} · instead of ${st.name.toLowerCase()}`;
  const load = loadFor(division, st.key)?.text;
  return [d, load, st.standard].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- The live recorder

export interface Live {
  id: string; title: string; mode: HyroxMode; division: Division; plan: SegmentPlan[];
  roxzone: boolean; indoor: boolean; goalMs?: number; templateId?: string;
  startedAt: number; done: Segment[];
  /** Index in the plan of the segment being done (or about to be done, in the Roxzone) */
  idx: number; phase: 'segment' | 'roxzone';
  segStart: number; pausedAt?: number;
  /** Pause time inside the current segment, and in the whole session */
  segPausedMs: number; pausedMs: number;
  /** GPS distance when the current segment started */
  segStartM: number;
  finishedAt?: number;
}
export function startLive(o: { id: string; title: string; mode: HyroxMode; division: Division; plan: SegmentPlan[]; roxzone: boolean; indoor: boolean; goalMs?: number; templateId?: string }, now: number): Live {
  return { ...o, startedAt: now, done: [], idx: 0, phase: 'segment', segStart: now, segPausedMs: 0, pausedMs: 0, segStartM: 0 };
}
const pausedNow = (l: Live, now: number) => (l.pausedAt ? now - l.pausedAt : 0);
/** Time on the clock, and in the current segment, without pauses */
export const totalMs = (l: Live, now: number) => (l.finishedAt ?? now) - l.startedAt - l.pausedMs - (l.finishedAt ? 0 : pausedNow(l, now));
export const segmentMs = (l: Live, now: number) => Math.max(0, now - l.segStart - l.segPausedMs - pausedNow(l, now));
export const roxzoneMs = (segs: Segment[]) => segs.filter((s) => s.kind === 'roxzone').reduce((a, s) => a + s.ms, 0);

export const pause = (l: Live, now: number): Live => (l.pausedAt || l.finishedAt ? l : { ...l, pausedAt: now });
export function resume(l: Live, now: number): Live {
  if (!l.pausedAt) return l;
  const d = now - l.pausedAt;
  return { ...l, pausedAt: undefined, segPausedMs: l.segPausedMs + d, pausedMs: l.pausedMs + d };
}
/** The one big button: this segment is done. `gpsM` is the GPS distance so far (outdoor runs). */
export function advance(l0: Live, now: number, gpsM = 0): Live {
  if (l0.finishedAt) return l0;
  const l = resume(l0, now);
  const p = l.plan[l.idx];
  const ms = Math.max(0, now - l.segStart - l.segPausedMs);
  const base = { i: l.done.length, startMs: l.segStart - l.startedAt, endMs: now - l.startedAt, ms };
  const next = { segStart: now, segPausedMs: 0, segStartM: gpsM };
  if (l.phase === 'roxzone') return { ...l, ...next, phase: 'segment', done: [...l.done, { ...base, kind: 'roxzone', key: 'roxzone', n: p.n }] };
  const seg: Segment = { ...p, ...base, gpsM: p.kind === 'run' && !l.indoor && gpsM - l.segStartM > 0 ? Math.round(gpsM - l.segStartM) : undefined };
  const done = [...l.done, seg];
  if (l.idx >= l.plan.length - 1) return { ...l, done, finishedAt: now };
  // With Roxzone timing, a run ends on arriving at the station; a second tap starts the station
  const rox = l.roxzone && p.kind === 'run' && l.plan[l.idx + 1].kind === 'station';
  return { ...l, ...next, done, idx: l.idx + 1, phase: rox ? 'roxzone' : 'segment' };
}
/** Take back the last tap: the segment before carries on as if it had not been pressed */
export function undo(l: Live): Live {
  const last = l.done[l.done.length - 1];
  if (!last) return l;
  const done = l.done.slice(0, -1);
  // Pauses inside the restored segment: its span minus its timed length
  const restore = { segStart: l.startedAt + last.startMs, segPausedMs: last.endMs - last.startMs - last.ms + l.segPausedMs, segStartM: last.gpsM != null ? l.segStartM - last.gpsM : l.segStartM, finishedAt: undefined };
  // A Roxzone segment taken back: in the Roxzone again, before the same station
  if (last.kind === 'roxzone') return { ...l, ...restore, done, phase: 'roxzone' };
  // Roxzone segments are not in the plan, so the plan index is the number of the others done
  return { ...l, ...restore, done, idx: done.filter((x) => x.kind !== 'roxzone').length, phase: 'segment' };
}

/** The label on the big button: "Station done → Run 5", "Run done → Sled push", "Start sled push" */
export function buttonLabel(l: Live): string {
  const p = l.plan[l.idx], n = l.plan[l.idx + 1];
  if (l.phase === 'roxzone') return `Start ${segmentName(p).toLowerCase()}`;
  const what = p.kind === 'run' ? 'Run done' : p.kind === 'rest' ? 'Rest over' : 'Station done';
  return n ? `${what} → ${segmentName(n)}` : `${what} → Finish`;
}
export function finish(l: Live, extra: { rpe?: number; notes?: string } = {}): HyroxSession {
  return { id: l.id, startedAt: new Date(l.startedAt).toISOString(), mode: l.mode, division: l.division, title: l.title, segments: l.done, totalMs: l.done.reduce((a, s) => a + s.ms, 0), isRace: l.mode === 'race', indoor: l.indoor || undefined, goalMs: l.goalMs, templateId: l.templateId, ...extra };
}
/** A race entered afterwards from the official splits: 8 runs, 8 stations, and the Roxzone total (seconds) */
export function enteredRace(o: { id: string; date: string; division: Division; runs: (number | undefined)[]; stations: (number | undefined)[]; roxzoneS?: number; goalMs?: number }): HyroxSession {
  const segments: Segment[] = [];
  let at = 0;
  const push = (s: Omit<Segment, 'i' | 'startMs' | 'endMs'>) => { segments.push({ ...s, i: segments.length, startMs: at, endMs: at + s.ms }); at += s.ms; };
  simulationPlan('race', o.division).forEach((p) => { const sec = p.kind === 'run' ? o.runs[p.n - 1] : o.stations[p.n - 1]; if (sec) push({ ...p, ms: sec * 1000 }); });
  if (o.roxzoneS) push({ kind: 'roxzone', key: 'roxzone', n: 0, ms: o.roxzoneS * 1000 });
  return { id: o.id, startedAt: new Date(`${o.date}T09:00:00`).toISOString(), mode: 'race', division: o.division, title: `HYROX race · ${divisionLabel(o.division)}`, segments, totalMs: at, isRace: true, entered: true, goalMs: o.goalMs };
}

// ---------------------------------------------------------------- The summary

export const clock = (ms: number): string => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
export const SLOW_RUN_MS = 15000;

export interface HyroxSummary {
  runningMs: number; stationsMs: number; roxzoneMs: number; restMs: number;
  runs: { n: number; ms: number; slow: boolean; after?: string }[];
  /** "Runs after sled pull and sandbag lunges were 26 s slower than your other runs." */
  slowLine?: string;
  vsGoalMs?: number;
}
export function summarise(s: HyroxSession): HyroxSummary {
  const of = (k: Segment['kind']) => s.segments.filter((x) => x.kind === k);
  const sum = (a: Segment[]) => a.reduce((t, x) => t + x.ms, 0);
  const runSegs = of('run');
  const runs = runSegs.map((r) => {
    const others = runSegs.filter((x) => x !== r).map((x) => x.ms);
    const before = [...s.segments].slice(0, s.segments.indexOf(r)).reverse().find((x) => x.kind === 'station');
    return { n: r.n, ms: r.ms, slow: others.length >= 2 && r.ms > median(others) + SLOW_RUN_MS, after: before ? segmentName(before).toLowerCase() : undefined, over: others.length ? r.ms - median(others) : 0 };
  });
  const slow = runs.filter((r) => r.slow);
  let slowLine: string | undefined;
  if (slow.length) {
    const avg = Math.round(slow.reduce((a, r) => a + r.over, 0) / slow.length / 1000);
    const after = [...new Set(slow.map((r) => r.after).filter(Boolean) as string[])];
    const list = after.length > 1 ? `${after.slice(0, -1).join(', ')} and ${after[after.length - 1]}` : after[0];
    const first = slow.filter((r) => !r.after).map((r) => `run ${r.n}`);
    slowLine = list ? `${slow.length > 1 ? 'Runs' : 'The run'} after ${list} ${slow.length > 1 ? 'were' : 'was'} ${avg} s slower than your other runs.` : `${first.join(' and ')} was ${avg} s slower than your other runs.`.replace(/^r/, 'R');
  }
  return { runningMs: sum(runSegs), stationsMs: sum(of('station')), roxzoneMs: sum(of('roxzone')), restMs: sum(of('rest')), runs: runs.map(({ over: _o, ...r }) => r), slowLine, vsGoalMs: s.goalMs ? s.totalMs - s.goalMs : undefined }; // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** A station done to the standard: not swapped, and the standard amount of work */
const standard = (x: Segment) => { const st = stationByKey.get(x.key as StationKey); return x.kind === 'station' && !x.swapped && !!st && x.distanceM === st.distanceM && x.reps === st.reps; };
export interface HyroxRecords { simulation?: { ms: number; date: string; id: string }; race?: { ms: number; date: string; id: string }; run?: { ms: number; date: string }; stations: Partial<Record<StationKey, { ms: number; date: string }>> }
/** Best full simulation, best race, best 1 km run split and best time per station. Swapped stations never count. */
export function records(sessions: HyroxSession[]): HyroxRecords {
  const out: HyroxRecords = { stations: {} };
  for (const s of sessions) {
    const date = s.startedAt.slice(0, 10);
    const whole = s.segments.filter((x) => x.kind === 'run').length === 8 && s.segments.filter(standard).length === 8;
    if (whole && s.mode === 'full' && (!out.simulation || s.totalMs < out.simulation.ms)) out.simulation = { ms: s.totalMs, date, id: s.id };
    if (whole && s.isRace && (!out.race || s.totalMs < out.race.ms)) out.race = { ms: s.totalMs, date, id: s.id };
    for (const x of s.segments) {
      if (x.kind === 'run' && x.distanceM === RUN_M && x.ms > 0 && (!out.run || x.ms < out.run.ms)) out.run = { ms: x.ms, date };
      if (standard(x) && x.ms > 0) { const k = x.key as StationKey; if (!out.stations[k] || x.ms < out.stations[k]!.ms) out.stations[k] = { ms: x.ms, date }; }
    }
  }
  return out;
}
/** What a station (or a run) is measured against: the target from onboarding, else the best before this session */
export function targetMs(key: StationKey | 'run', prefs: HyroxPrefs | undefined, earlier: HyroxSession[]): { ms: number; from: 'target' | 'best' } | undefined {
  const t = prefs?.targets?.[key];
  if (t) return { ms: t * 1000, from: 'target' };
  const r = records(earlier);
  const b = key === 'run' ? r.run : r.stations[key];
  return b ? { ms: b.ms, from: 'best' } : undefined;
}
/** "+26 s", "−8 s" or "on" (within 3 s) */
export function deltaTag(ms: number, target: number): { text: string; tone: 'good' | 'slow' | 'on' } {
  const d = Math.round((ms - target) / 1000);
  return Math.abs(d) <= 3 ? { text: 'on', tone: 'on' } : d < 0 ? { text: `−${-d} s`, tone: 'good' } : { text: `+${d} s`, tone: 'slow' };
}
/** For the feed and load: minutes, and the running distance (planned distance when indoors) */
export const sessionMinutes = (s: HyroxSession) => Math.max(1, Math.round(s.totalMs / 60000));
export const runningM = (s: HyroxSession) => s.segments.filter((x) => x.kind === 'run').reduce((a, x) => a + (x.gpsM ?? x.distanceM ?? 0), 0);
