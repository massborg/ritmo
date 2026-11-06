// File parsers: FIT, GPX, TCX and Garmin bulk account export (ZIP). All run in the browser.
import type { Activity, Lap, StreamPoint } from '../lib/types';
import { detailScore } from './integration';

/** Why a file was not imported, grouped for the import report */
export type SkipCategory = 'wellness' | 'cycling' | 'swimming' | 'walking' | 'gym' | 'other-sport' | 'unreadable' | 'unsupported';
export const SKIP_LABEL: Record<SkipCategory, string> = {
  wellness: 'wellness and monitoring (sleep, steps, heart rate)', cycling: 'cycling', swimming: 'swimming', walking: 'walking and hiking',
  gym: 'gym and strength', 'other-sport': 'other sports', unreadable: 'could not be read', unsupported: 'not an activity file',
};

export interface ParsedFile {
  activities: Activity[];
  skipped: { file: string; reason: string; category: SkipCategory }[];
}

/** A file that is not a run: the sport it was, for the import report */
export class NotARun {
  category: SkipCategory;
  sport?: string;
  constructor(category: SkipCategory, sport?: string) { this.category = category; this.sport = sport; }
}

const sportCategory = (sport: string): SkipCategory => {
  const s = sport.toLowerCase();
  if (/cycl|bik|ride/.test(s)) return 'cycling';
  if (/swim/.test(s)) return 'swimming';
  if (/walk|hik/.test(s)) return 'walking';
  if (/train|strength|fitness|gym|yoga|pilates|cardio|hiit/.test(s)) return 'gym';
  return 'other-sport';
};

/** Garmin export files that are never activities (recognised by name, so they are not even opened) */
const WELLNESS_FILE = /(_WELLNESS|_SLEEP|_METRICS|_HRV|_MONITOR|_SPO2|_STRESS|_RESPIRATION|_BODY_BATTERY|_SETTINGS|_TOTALS|_GOALS|_SEGMENT|_COURSE|_SCHEDULE|_LOCATION|_RECORD)[^/]*\.fit$/i;

const R = 6371000;
function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function summarise(base: { id: string; name: string; start: Date; streams: StreamPoint[]; laps?: Lap[]; elapsedS?: number; distanceM?: number; source: 'upload' }, extra: Partial<Activity> = {}): Activity {
  const s = base.streams;
  const last = s[s.length - 1];
  const distanceM = base.distanceM ?? last?.d ?? 0;
  // moving time: ignore gaps where speed < 0.5 m/s
  let moving = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = s[i].t - s[i - 1].t, dd = s[i].d - s[i - 1].d;
    if (dt > 0 && dt < 60 && dd / dt > 0.5) moving += dt;
  }
  const hrs = s.filter((p) => p.hr).map((p) => p.hr!);
  const cads = s.filter((p) => p.cad).map((p) => p.cad!);
  let gain = 0;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1].alt, b = s[i].alt;
    if (a != null && b != null && b - a > 0.2) gain += b - a;
  }
  const act: Activity = {
    id: base.id,
    source: base.source,
    sourceIds: { upload: base.id },
    startTime: base.start.toISOString(),
    name: base.name || 'Run',
    sport: 'run',
    distanceM: Math.round(distanceM),
    durationS: Math.round(base.elapsedS ?? last?.t ?? 0),
    movingS: Math.round(moving || base.elapsedS || last?.t || 0),
    elevGainM: s.some((p) => p.alt != null) ? Math.round(gain) : undefined,
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined,
    maxHr: hrs.length ? Math.max(...hrs) : undefined,
    avgCadence: cads.length ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : undefined,
    laps: base.laps?.length ? base.laps : undefined,
    streams: s.length ? downsample(s) : undefined,
    detailScore: 0,
    importedAt: new Date().toISOString(),
    ...extra,
  };
  act.detailScore = detailScore(act);
  return act;
}

/** Keep about one point every 5 s to stay light */
function downsample(s: StreamPoint[]): StreamPoint[] {
  const out: StreamPoint[] = [];
  let lastT = -Infinity;
  for (const p of s) if (p.t - lastT >= 4.5) { out.push(p); lastT = p.t; }
  if (out[out.length - 1] !== s[s.length - 1]) out.push(s[s.length - 1]);
  return out;
}

const childText = (el: Element, tag: string) => {
  const n = el.getElementsByTagName(tag)[0] ?? el.getElementsByTagNameNS('*', tag)[0];
  return n?.textContent ?? undefined;
};
const byLocal = (el: Element | Document, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));

export function parseGpx(text: string, fileName: string): Activity | undefined {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const pts = byLocal(doc, 'trkpt');
  if (pts.length < 2) return undefined;
  const type = (childText(doc.documentElement, 'type') ?? '').toLowerCase();
  if (type && !/run|9|1/.test(type)) return new NotARun(sportCategory(type), type) as unknown as undefined; // Strava/Garmin export runs as "running" or "9"
  const t0 = new Date(childText(pts[0], 'time') ?? '');
  if (isNaN(t0.getTime())) return undefined;
  const streams: StreamPoint[] = [];
  let d = 0;
  let prev: { lat: number; lon: number } | undefined;
  for (const p of pts) {
    const lat = Number(p.getAttribute('lat')), lon = Number(p.getAttribute('lon'));
    const time = new Date(childText(p, 'time') ?? '');
    if (prev) d += haversine(prev, { lat, lon });
    prev = { lat, lon };
    const hr = byLocal(p, 'hr')[0]?.textContent;
    const cad = byLocal(p, 'cad')[0]?.textContent;
    const ele = childText(p, 'ele');
    streams.push({
      t: (time.getTime() - t0.getTime()) / 1000, d, lat, lon,
      hr: hr ? Number(hr) : undefined,
      cad: cad ? Number(cad) * (Number(cad) < 120 ? 2 : 1) : undefined,
      alt: ele ? Number(ele) : undefined,
    });
  }
  const name = childText(doc.documentElement, 'name') ?? fileName.replace(/\.gpx$/i, '');
  return summarise({ id: `gpx-${t0.getTime()}`, name, start: t0, streams, source: 'upload' });
}

export function parseTcx(text: string, fileName: string): Activity | undefined {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const act = byLocal(doc, 'Activity')[0];
  if (!act) return undefined;
  const sport = (act.getAttribute('Sport') ?? '').toLowerCase();
  if (sport && sport !== 'running') return new NotARun(sportCategory(sport), sport) as unknown as undefined;
  const tps = byLocal(act, 'Trackpoint');
  const t0 = new Date(childText(act, 'Id') ?? childText(tps[0], 'Time') ?? '');
  if (isNaN(t0.getTime())) return undefined;
  const streams: StreamPoint[] = [];
  let prev: { lat: number; lon: number } | undefined;
  let dCalc = 0;
  for (const tp of tps) {
    const time = new Date(childText(tp, 'Time') ?? '');
    const lat = childText(tp, 'LatitudeDegrees'), lon = childText(tp, 'LongitudeDegrees');
    const dist = childText(tp, 'DistanceMeters');
    if (lat && lon) {
      const cur = { lat: Number(lat), lon: Number(lon) };
      if (prev) dCalc += haversine(prev, cur);
      prev = cur;
    }
    const hrEl = byLocal(tp, 'HeartRateBpm')[0];
    const cad = byLocal(tp, 'RunCadence')[0]?.textContent ?? childText(tp, 'Cadence');
    streams.push({
      t: (time.getTime() - t0.getTime()) / 1000,
      d: dist ? Number(dist) : dCalc,
      lat: lat ? Number(lat) : undefined, lon: lon ? Number(lon) : undefined,
      hr: hrEl ? Number(childText(hrEl, 'Value')) : undefined,
      cad: cad ? Number(cad) * 2 : undefined, // TCX RunCadence is per foot
      alt: childText(tp, 'AltitudeMeters') ? Number(childText(tp, 'AltitudeMeters')) : undefined,
    });
  }
  const laps: Lap[] = byLocal(act, 'Lap').map((l, i) => ({
    index: i + 1,
    startS: (new Date(l.getAttribute('StartTime') ?? '').getTime() - t0.getTime()) / 1000,
    durationS: Number(childText(l, 'TotalTimeSeconds') ?? 0),
    distanceM: Number(childText(l, 'DistanceMeters') ?? 0),
    avgHr: byLocal(l, 'AverageHeartRateBpm')[0] ? Number(childText(byLocal(l, 'AverageHeartRateBpm')[0], 'Value')) : undefined,
  }));
  const totalD = laps.reduce((x, l) => x + l.distanceM, 0);
  return summarise({ id: `tcx-${t0.getTime()}`, name: childText(act, 'Notes') ?? fileName.replace(/\.tcx$/i, ''), start: t0, streams: streams.filter((s) => !isNaN(s.t)), laps, distanceM: totalD || undefined, source: 'upload' });
}

interface FitRecord { timestamp?: string | Date; elapsed_time?: number; distance?: number; heart_rate?: number; cadence?: number; altitude?: number; enhanced_altitude?: number; position_lat?: number; position_long?: number }
interface FitData {
  sessions?: { sport?: string; start_time?: string | Date; total_distance?: number; total_elapsed_time?: number; total_timer_time?: number; avg_heart_rate?: number; max_heart_rate?: number; avg_cadence?: number; total_ascent?: number }[];
  records?: FitRecord[];
  laps?: { start_time?: string | Date; total_elapsed_time?: number; total_distance?: number; avg_heart_rate?: number }[];
}

export async function parseFit(buf: ArrayBuffer, fileName: string): Promise<Activity | NotARun | undefined> {
  const mod = await import('fit-file-parser');
  const FitParser = (mod as unknown as { default: new (o: object) => { parse: (b: ArrayBuffer, cb: (e: unknown, d: FitData) => void) => void } }).default;
  const parser = new FitParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm', elapsedRecordField: true, mode: 'list' });
  const data = await new Promise<FitData>((res, rej) => parser.parse(buf, (e, d) => (e ? rej(e) : res(d))));
  const sess = data.sessions?.[0];
  // Any running file counts: road, treadmill, track, trail, indoor and virtual runs (sport "running", any sub-sport)
  if (sess?.sport && !/running|^1$/i.test(String(sess.sport))) return new NotARun(sportCategory(String(sess.sport)), String(sess.sport));
  const recs = data.records ?? [];
  // No activity session and no distance: a wellness or monitoring file, not a run
  if (!sess && !recs.some((r) => (r.distance ?? 0) > 0)) return new NotARun('wellness');
  const t0 = new Date(sess?.start_time ?? recs[0]?.timestamp ?? '');
  if (isNaN(t0.getTime())) return undefined;
  const streams: StreamPoint[] = recs
    .filter((r) => r.distance != null || r.heart_rate != null)
    .map((r) => ({
      t: r.elapsed_time ?? (new Date(r.timestamp ?? t0).getTime() - t0.getTime()) / 1000,
      d: r.distance ?? 0,
      hr: r.heart_rate,
      cad: r.cadence ? r.cadence * 2 : undefined, // FIT running cadence is per leg
      alt: r.enhanced_altitude ?? r.altitude,
      lat: r.position_lat, lon: r.position_long,
    }));
  const laps: Lap[] = (data.laps ?? []).map((l, i) => ({
    index: i + 1,
    startS: (new Date(l.start_time ?? t0).getTime() - t0.getTime()) / 1000,
    durationS: l.total_elapsed_time ?? 0,
    distanceM: l.total_distance ?? 0,
    avgHr: l.avg_heart_rate,
  }));
  return summarise(
    { id: `fit-${t0.getTime()}`, name: fileName.replace(/\.fit$/i, ''), start: t0, streams, laps, elapsedS: sess?.total_elapsed_time, distanceM: sess?.total_distance, source: 'upload' },
    sess ? { avgHr: sess.avg_heart_rate ?? undefined, maxHr: sess.max_heart_rate ?? undefined, elevGainM: sess.total_ascent ?? undefined, movingS: Math.round(sess.total_timer_time ?? 0) || undefined } as Partial<Activity> : {},
  );
}

/** Garmin's summarizedActivities JSON from the account export: summaries only, no streams. */
interface GarminSummary { activityId?: number; name?: string; activityType?: string; sportType?: string; beginTimestamp?: number; startTimeGmt?: number; distance?: number; duration?: number; movingDuration?: number; elevationGain?: number; avgHr?: number; maxHr?: number; avgRunCadence?: number; avgDoubleCadence?: number }

function parseGarminSummaries(json: unknown): { runs: Activity[]; others: { name: string; type: string; category: SkipCategory }[] } {
  const arr = Array.isArray(json) ? (json[0]?.summarizedActivitiesExport ?? json) : [];
  const out: Activity[] = [];
  const others: { name: string; type: string; category: SkipCategory }[] = [];
  for (const g of arr as GarminSummary[]) {
    const type = (g.activityType ?? g.sportType ?? '').toLowerCase();
    // treadmill_running, track_running, trail_running, indoor_running, virtual_run, street_running all count
    if (!type.includes('run')) { others.push({ name: g.name ?? 'Activity', type: type.replace(/_/g, ' ') || 'unknown', category: sportCategory(type) }); continue; }
    const start = new Date(g.beginTimestamp ?? g.startTimeGmt ?? 0);
    // Garmin export uses centimetres for distance and milliseconds for duration
    const distanceM = (g.distance ?? 0) / 100;
    const durS = (g.duration ?? 0) / 1000;
    if (!distanceM || !durS) continue;
    const id = `garmin-${g.activityId ?? start.getTime()}`;
    const a: Activity = {
      id, source: 'upload', sourceIds: { upload: id, garmin: String(g.activityId ?? '') }, startTime: start.toISOString(),
      name: g.name ?? 'Run', sport: 'run', distanceM: Math.round(distanceM), durationS: Math.round(durS),
      movingS: Math.round((g.movingDuration ?? g.duration ?? 0) / 1000), elevGainM: g.elevationGain ? Math.round(g.elevationGain / 100) : undefined,
      avgHr: g.avgHr ? Math.round(g.avgHr) : undefined, maxHr: g.maxHr ? Math.round(g.maxHr) : undefined,
      avgCadence: g.avgDoubleCadence ? Math.round(g.avgDoubleCadence) : g.avgRunCadence ? Math.round(g.avgRunCadence * 2) : undefined,
      detailScore: 0, importedAt: new Date().toISOString(),
    };
    a.detailScore = detailScore(a);
    out.push(a);
  }
  return { runs: out, others };
}

export type Progress = (done: number, total: number, label: string) => void;

export async function parseFiles(files: File[], onProgress: Progress = () => {}): Promise<ParsedFile> {
  const activities: Activity[] = [];
  const skipped: ParsedFile['skipped'] = [];
  const skip = (file: string, x: unknown, fallback: SkipCategory = 'unreadable') => {
    if (x instanceof NotARun) skipped.push({ file, category: x.category, reason: x.category === 'wellness' ? 'Wellness or monitoring data, not an activity' : `Not a run${x.sport ? ` (${x.sport.replace(/_/g, ' ')})` : ''}` });
    else skipped.push({ file, category: fallback, reason: fallback === 'unreadable' ? 'No track points or summary in this file' : 'Not an activity file' });
  };
  const queue: { name: string; get: () => Promise<ArrayBuffer> }[] = files.map((f) => ({ name: f.name, get: () => f.arrayBuffer() }));
  let total = queue.length;
  let done = 0;
  while (queue.length) {
    const item = queue.shift()!;
    const lower = item.name.toLowerCase();
    onProgress(done, total, item.name.split('/').pop() ?? item.name);
    try {
      if (lower.endsWith('.zip')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await item.get());
        const entries = Object.values(zip.files).filter((e) => !e.dir && /\.(fit|gpx|tcx|zip|json)$/i.test(e.name));
        let queued = 0;
        for (const e of entries) {
          if (/\.json$/i.test(e.name) && !/summarizedActivities/i.test(e.name)) continue;
          if (WELLNESS_FILE.test(e.name)) { skipped.push({ file: e.name, category: 'wellness', reason: 'Wellness or monitoring data, not an activity' }); continue; }
          queue.push({ name: e.name, get: () => e.async('arraybuffer') });
          queued++;
        }
        // Everything else in the export (photos, settings, other data) is not an activity file
        const others = Object.values(zip.files).filter((e) => !e.dir && !/\.(fit|gpx|tcx|zip|json)$/i.test(e.name));
        for (const e of others) skipped.push({ file: e.name, category: 'unsupported', reason: 'Not an activity file' });
        total += queued;
      } else if (lower.endsWith('.fit')) {
        if (WELLNESS_FILE.test(item.name)) skipped.push({ file: item.name, category: 'wellness', reason: 'Wellness or monitoring data, not an activity' });
        else {
          const a = await parseFit(await item.get(), item.name.split('/').pop()!);
          if (a && !(a instanceof NotARun)) activities.push(a); else skip(item.name, a);
        }
      } else if (lower.endsWith('.gpx')) {
        const a = parseGpx(new TextDecoder().decode(await item.get()), item.name.split('/').pop()!) as Activity | NotARun | undefined;
        if (a && !(a instanceof NotARun)) activities.push(a); else skip(item.name, a);
      } else if (lower.endsWith('.tcx')) {
        const a = parseTcx(new TextDecoder().decode(await item.get()), item.name.split('/').pop()!) as Activity | NotARun | undefined;
        if (a && !(a instanceof NotARun)) activities.push(a); else skip(item.name, a);
      } else if (lower.endsWith('.json')) {
        const res = parseGarminSummaries(JSON.parse(new TextDecoder().decode(await item.get())));
        activities.push(...res.runs);
        for (const o of res.others) skipped.push({ file: `${item.name.split('/').pop()} · ${o.name}`, category: o.category, reason: `Not a run (${o.type})` });
      } else {
        skipped.push({ file: item.name, category: 'unsupported', reason: 'Unsupported file type. Use FIT, GPX, TCX or a ZIP export.' });
      }
    } catch (e) {
      skipped.push({ file: item.name, category: 'unreadable', reason: `Could not read this file (${(e as Error).message ?? 'unknown error'})` });
    }
    done++;
    if (done % 20 === 0) await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
  }
  onProgress(total, total, 'Done');
  return { activities, skipped };
}
