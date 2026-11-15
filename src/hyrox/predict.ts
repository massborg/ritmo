// HYROX extras (update 4, task 7): a race predictor, race-day pacing, laps from a watch mapped to segments, and
// the facts the Coach is given. No screen code here.
import type { Lap, Profile } from '../lib/types';
import { STATIONS, divisionLabel, loadFor, stationByKey, type Division, type StationKey } from './hyroxDivisions';
import { clock, records, simulationPlan, summarise, type HyroxSession, type Segment } from './hyrox';
import { RUN_SHARE, ownRunShare } from './plan-goal';

export const hyroxSessions = (profile: Pick<Profile, 'log'>): HyroxSession[] =>
  (profile.log ?? []).filter((e) => e.kind === 'hyrox' && e.hyrox).map((e) => e.hyrox as HyroxSession).sort((a, b) => a.startedAt.localeCompare(b.startedAt));

/** A typical Open athlete's station times (seconds), for a runner whose threshold pace is 4:30/km. A starting point only. */
const TYPICAL: Record<StationKey, number> = { skierg: 275, sled_push: 185, sled_pull: 300, burpee_broad_jump: 330, row: 290, farmers_carry: 135, sandbag_lunges: 305, wall_balls: 400 };
const TYPICAL_ROXZONE_S = 390;
/** A station done fresh in practice is faster than the same station in the race */
const IN_RACE = 1.08;
/** Race runs are slower than threshold pace: tired legs, turns and the Roxzone */
const RUN_OVER_THRESHOLD = 1.07;

export interface HyroxPrediction {
  totalS: number; runningS: number; stationsS: number; roxzoneS: number;
  runPaceS: number;
  stations: { key: StationKey; name: string; s: number; from: 'race' | 'practice' | 'typical' }[];
  /** How many of the 8 stations come from the athlete's own times */
  known: number;
  confidence: 'low' | 'medium' | 'good';
  basedOn: string;
  /** The station with the most to gain against a typical time */
  focus?: { name: string; gainS: number };
  vsGoalS?: number;
}
/**
 * Predicted HYROX time. Runs from threshold pace (or the athlete's own run splits in a full simulation or race);
 * each station from their own best (a little slower when it was done on its own), otherwise a typical time scaled
 * to their running fitness; Roxzone from their own sessions, otherwise a typical 6 to 7 minutes.
 */
export function predictHyrox(profile: Pick<Profile, 'log' | 'hyrox'>, thresholdS: number | undefined): HyroxPrediction | undefined {
  const all = hyroxSessions(profile);
  const fulls = all.filter((h) => h.segments.filter((x) => x.kind === 'run').length === 8 && h.segments.filter((x) => x.kind === 'station').length === 8);
  const last = fulls[fulls.length - 1];
  if (!thresholdS && !last) return undefined;
  const T = thresholdS ?? 270;
  // Runs
  const lastRunS = last ? last.segments.filter((x) => x.kind === 'run').reduce((a, x) => a + x.ms, 0) / 1000 : undefined;
  const fromFitness = T * RUN_OVER_THRESHOLD * 8;
  // With a full session behind them, their own runs count for more than the estimate
  const runningS = Math.round(lastRunS && thresholdS ? lastRunS * 0.65 + fromFitness * 0.35 : lastRunS ?? fromFitness);
  // Stations
  const inRace = records(fulls).stations, any = records(all).stations;
  const scale = Math.min(1.35, Math.max(0.8, T / 270));
  const stations = STATIONS.map((s) => {
    const r = inRace[s.key], p = any[s.key];
    if (r && (!p || r.ms <= p.ms * IN_RACE)) return { key: s.key, name: s.name, s: Math.round(r.ms / 1000), from: 'race' as const };
    if (p) return { key: s.key, name: s.name, s: Math.round((p.ms / 1000) * IN_RACE), from: 'practice' as const };
    return { key: s.key, name: s.name, s: Math.round(TYPICAL[s.key] * scale), from: 'typical' as const };
  });
  const stationsS = stations.reduce((a, x) => a + x.s, 0);
  const timedRox = [...all].reverse().find((h) => h.segments.some((x) => x.kind === 'roxzone') && h.segments.filter((x) => x.kind === 'station').length === 8);
  const roxzoneS = Math.round(timedRox ? summarise(timedRox).roxzoneMs / 1000 : TYPICAL_ROXZONE_S * Math.min(1.2, Math.max(0.85, scale)));
  // Without Roxzone timing the transitions were already inside the runs of the last full session
  const roxInRuns = !!last && !last.segments.some((x) => x.kind === 'roxzone') && !last.entered;
  const totalS = runningS + stationsS + (roxInRuns && lastRunS ? Math.round(roxzoneS * 0.35) : roxzoneS);
  const known = stations.filter((x) => x.from !== 'typical').length;
  const confidence = last && known === 8 ? 'good' : known >= 4 || last ? 'medium' : 'low';
  const gains = stations.filter((x) => x.from !== 'typical').map((x) => ({ name: x.name, gainS: x.s - Math.round(TYPICAL[x.key] * scale) })).sort((a, b) => b.gainS - a.gainS);
  const goalS = profile.hyrox?.goalS;
  return {
    totalS, runningS, stationsS, roxzoneS: totalS - runningS - stationsS, runPaceS: Math.round(runningS / 8), stations, known, confidence,
    basedOn: [last ? `your ${last.isRace ? 'race' : 'full simulation'} on ${new Date(last.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : undefined, thresholdS ? 'your running fitness' : undefined,
      known ? `your own time on ${known} of 8 stations` : 'typical station times, until you record yours'].filter(Boolean).join(', '),
    focus: gains[0] && gains[0].gainS >= 15 ? gains[0] : undefined,
    vsGoalS: goalS ? totalS - goalS : undefined,
  };
}

// ---------------------------------------------------------------- Race day

export interface RacePacing { runs: { n: number; paceS: number; note: string }[]; stations: { key: StationKey; name: string; work: string; targetS?: number; tip: string }[]; goalS?: number; runPaceS: number }
const TIPS: Record<StationKey, string> = {
  skierg: 'Long pulls, steady breathing. You should finish able to run straight away.',
  sled_push: 'Low hips, short fast steps. Rest at the turn, not in the middle of a length.',
  sled_pull: 'Walk backwards with the rope, or pull hand over hand from a low stance. Keep the rope tidy.',
  burpee_broad_jump: 'A rhythm you can hold without stopping. Step up, do not jump up, if your legs are gone.',
  row: 'Drive with the legs. Use it to bring your heart rate down a little.',
  farmers_carry: 'Stand tall and walk fast. Put the weights down before your grip fails, not after.',
  sandbag_lunges: 'Bag high on the shoulders, short steps, back knee to the floor every time.',
  wall_balls: 'Sets you can repeat, for example 20 then 15s. Short breaks, ball stays in your hands.',
};
/** Pacing for race day: the first run held back, the last one free, and each station's target and one tip */
export function racePacing(profile: Pick<Profile, 'hyrox' | 'log'>, thresholdS: number | undefined): RacePacing | undefined {
  const h = profile.hyrox ?? {};
  const pred = predictHyrox(profile, thresholdS);
  const share = ownRunShare(profile as Profile) ?? RUN_SHARE;
  const goalPace = h.goalS ? (h.goalS * share) / 8 : undefined;
  const base = Math.round(Math.max(goalPace ?? pred?.runPaceS ?? 0, thresholdS ?? 0));
  if (!base) return undefined;
  const division: Division = h.division ?? 'men_open';
  const runs = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    return n === 1 ? { n, paceS: base + 6, note: 'Hold back: the start is always too fast' }
      : n === 8 ? { n, paceS: base - 3, note: 'Everything you have left, then the wall balls' }
      : { n, paceS: base + (n === 3 || n === 4 || n === 7 ? 4 : 0), note: n === 3 ? 'After the sled push: let the legs come back' : n === 4 ? 'After the sled pull: short steps first' : n === 7 ? 'After the carry: relax the shoulders' : 'Settle into your rhythm' };
  });
  const stations = simulationPlan('race', division).filter((p) => p.kind === 'station').map((p) => {
    const st = stationByKey.get(p.key as StationKey)!;
    const load = loadFor(division, st.key)?.text;
    return { key: st.key, name: st.name, work: [st.distanceM ? `${st.distanceM} m` : `${st.reps} reps`, load].filter(Boolean).join(' · '), targetS: h.targets?.[st.key] ?? pred?.stations.find((x) => x.key === st.key)?.s, tip: TIPS[st.key] };
  });
  return { runs, stations, goalS: h.goalS, runPaceS: base };
}
export const HYROX_WARMUP: { label: string; detail: string; minutes: number }[] = [
  { label: 'Easy jog', detail: 'Very easy, just to get warm', minutes: 8 },
  { label: 'Mobility', detail: 'Hips, ankles and shoulders: leg swings, lunges with a reach, arm circles', minutes: 4 },
  { label: 'Station primers', detail: '10 air squats, 10 lunges, 5 burpees, 10 light wall balls or thrusters', minutes: 4 },
  { label: 'Strides', detail: '3 × 20 seconds at your race run pace, walking back', minutes: 3 },
  { label: 'To the start', detail: 'A sip of water. Start slower than feels right', minutes: 2 },
];

// ---------------------------------------------------------------- Laps from a watch

export const HYROX_LAPS = 16;
/**
 * Laps from a watch as HYROX segments: 16 laps in order are run 1, station 1, run 2 … With more than 16 laps
 * (Roxzone laps, or a lap pressed twice) the 16 are chosen as the 8 laps that look most like 1 km runs and the lap
 * after each. Returns undefined when that cannot be done.
 */
export function lapsToSegments(laps: Lap[], division: Division): Segment[] | undefined {
  const ls = laps.filter((l) => l.durationS > 5);
  if (ls.length < HYROX_LAPS) return undefined;
  let pick = ls.slice(0, HYROX_LAPS);
  if (ls.length > HYROX_LAPS) {
    // The runs are the laps nearest to 1 km; each is followed by its station
    const runIdx = ls.map((l, i) => ({ i, d: Math.abs(l.distanceM - 1000) })).filter((x) => x.i < ls.length - 1).sort((a, b) => a.d - b.d).slice(0, 8).map((x) => x.i).sort((a, b) => a - b);
    if (runIdx.length < 8 || runIdx.some((x, k) => k > 0 && x - runIdx[k - 1] < 2)) return undefined;
    pick = runIdx.flatMap((i) => [ls[i], ls[i + 1]]);
  }
  const plan = simulationPlan('race', division);
  let at = 0;
  return pick.map((l, i) => { const ms = Math.round(l.durationS * 1000); const seg: Segment = { ...plan[i], i, startMs: at, endMs: at + ms, ms, gpsM: plan[i].kind === 'run' && l.distanceM > 0 ? Math.round(l.distanceM) : undefined }; at += ms; return seg; });
}
/** Does this activity look like a HYROX session recorded on a watch? */
export const looksLikeHyrox = (laps: Lap[] | undefined) => (laps?.filter((l) => l.durationS > 5).length ?? 0) >= HYROX_LAPS;

// ---------------------------------------------------------------- For the Coach

/** What the Coach is told about a HYROX athlete: profile, the latest splits, records and weak stations */
export function hyroxFacts(profile: Pick<Profile, 'athleteType' | 'hyrox' | 'log'>, thresholdS: number | undefined): string[] {
  const type = profile.athleteType ?? 'runner';
  const all = hyroxSessions(profile);
  if (type === 'runner' && !all.length) return [];
  const h = profile.hyrox ?? {};
  const f: string[] = [];
  const name = (k: StationKey) => stationByKey.get(k)?.name.toLowerCase() ?? k;
  f.push(`HYROX: the athlete trains ${type === 'hyrox' ? 'for HYROX' : type === 'both' ? 'for running and HYROX' : 'as a runner and has recorded HYROX sessions'}. Division ${divisionLabel(h.division ?? 'men_open')}${h.raceDate ? `, race on ${h.raceDate}` : ', no race date set'}${h.goalS ? `, goal ${clock(h.goalS * 1000)}` : ''}${h.previousS ? `, previous time ${clock(h.previousS * 1000)}` : ''}.`);
  if (h.hardest?.length) f.push(`HYROX stations the athlete finds hardest: ${h.hardest.map(name).join(', ')}.`);
  if (h.equipment) f.push(`HYROX equipment available: ${h.equipment.length ? h.equipment.join(', ').replace(/_/g, ' ') : 'none'}.`);
  const last = all[all.length - 1];
  if (last) {
    const s = summarise(last);
    f.push(`Latest HYROX session (${last.startedAt.slice(0, 10)}, ${last.title}): total ${clock(last.totalMs)}; running ${clock(s.runningMs)}, stations ${clock(s.stationsMs)}${s.roxzoneMs ? `, Roxzone ${clock(s.roxzoneMs)}` : ''}. Splits: ${last.segments.filter((x) => x.kind !== 'roxzone' && x.kind !== 'rest').map((x) => `${x.kind === 'run' ? `run ${x.n}` : name(x.key as StationKey)}${x.swapped ? ' (swapped)' : ''} ${clock(x.ms)}`).join(', ')}.${s.slowLine ? ` ${s.slowLine}` : ''}`);
  }
  const rec = records(all);
  const bests = STATIONS.filter((s) => rec.stations[s.key]).map((s) => `${s.name.toLowerCase()} ${clock(rec.stations[s.key]!.ms)}`);
  if (rec.simulation || rec.race || rec.run || bests.length) f.push(`HYROX bests: ${[rec.race ? `race ${clock(rec.race.ms)}` : '', rec.simulation ? `full simulation ${clock(rec.simulation.ms)}` : '', rec.run ? `1 km run split ${clock(rec.run.ms)}` : '', ...bests].filter(Boolean).join(', ')}.`);
  const p = predictHyrox(profile, thresholdS);
  if (p) f.push(`HYROX prediction: ${clock(p.totalS * 1000)} (confidence ${p.confidence}; based on ${p.basedOn}); runs at about ${clock(p.runPaceS * 1000)} per km${p.focus ? `; most time to gain on ${p.focus.name.toLowerCase()} (about ${p.focus.gainS} s against a typical time)` : ''}${p.vsGoalS != null ? `; ${p.vsGoalS <= 0 ? `${clock(-p.vsGoalS * 1000)} inside` : `${clock(p.vsGoalS * 1000)} outside`} the goal` : ''}. This is an estimate, not a promise.`);
  return f;
}
