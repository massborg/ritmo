// Which goal a plan is built for when the athlete does HYROX (update 4, task 6): a HYROX athlete trains for HYROX;
// "Both" trains for whichever race is nearer, and when the two are within 8 weeks of each other one session a week
// is kept for the other. Also: the HYROX run pace, the station blocks for compromised runs, and station targets.
import type { Profile, Race } from '../lib/types';
import { STATIONS, stationByKey, type StationKey } from './hyroxDivisions';
import { isPartial, summarise, type HyroxSession } from './hyrox';
import { daysBetween, parseYmd, ymd } from '../lib/format';

export type AthleteType = 'runner' | 'hyrox' | 'both';
export const EQUIPMENT: { value: string; label: string }[] = [
  { value: 'skierg', label: 'SkiErg' }, { value: 'rower', label: 'Rower' }, { value: 'sled', label: 'Sled' }, { value: 'wall_ball', label: 'Wall ball' }, { value: 'kettlebells', label: 'Kettlebells' }, { value: 'sandbag', label: 'Sandbag' },
];
export const RUN_SHARE = 0.47;
export const BOTH_WINDOW_DAYS = 56;

export interface HyroxGoal {
  /** Stands in for the race in the plan engine: 8 km of running, on the HYROX race day (or none) */
  race?: Race;
  goalS?: number; runShare: number; hardest: StationKey[]; equipment: string[];
  /** "Both", with a running race within 8 weeks: keep one running session a week */
  keepRunning: boolean;
}
/** The athlete's own share of race time spent running, from their latest full simulation or race */
export function ownRunShare(profile: Profile): number | undefined {
  const full = (profile.log ?? []).filter((e) => e.kind === 'hyrox' && e.hyrox && (e.hyrox.mode === 'full' || e.hyrox.isRace)).map((e) => e.hyrox as HyroxSession)
    .filter((h) => !isPartial(h) && h.segments.filter((x) => x.kind === 'run').length === 8 && h.segments.filter((x) => x.kind === 'station').length === 8).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!full) return undefined;
  const s = summarise(full);
  // Without Roxzone timing the transitions are inside the runs; either way this is the share the runs took
  const share = s.runningMs / full.totalMs;
  return share > 0.3 && share < 0.65 ? share : undefined;
}
/** The share of the athlete's own latest whole race or simulation spent in the Roxzone, when it was timed */
export function ownRoxShare(profile: Profile): number | undefined {
  const full = (profile.log ?? []).filter((e) => e.kind === 'hyrox' && e.hyrox && (e.hyrox.mode === 'full' || e.hyrox.isRace)).map((e) => e.hyrox as HyroxSession)
    .filter((h) => !isPartial(h) && h.segments.filter((x) => x.kind === 'run').length === 8 && h.segments.filter((x) => x.kind === 'station').length === 8).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!full) return undefined;
  const share = summarise(full).roxzoneMs / full.totalMs;
  // Not timed: the transitions are inside the runs, so nothing is set aside for them
  return share === 0 ? 0 : share > 0.02 && share < 0.2 ? share : undefined;
}
/** What the plan is for. `undefined`: a running plan. `keepHyrox`: a running plan that keeps one HYROX session a week. */
export function planGoal(profile: Profile, race: Race | undefined, today: Date): { hyrox?: HyroxGoal; keepHyrox?: boolean } {
  const type: AthleteType = profile.athleteType ?? 'runner';
  if (type === 'runner') return {};
  const h = profile.hyrox ?? {};
  const t = ymd(today);
  const date = h.raceDate && h.raceDate >= t ? h.raceDate : undefined;
  const near = !!date && !!race && Math.abs(daysBetween(parseYmd(date), parseYmd(race.date))) <= BOTH_WINDOW_DAYS;
  // Both, and the running race is nearer (or HYROX has no date): a running plan
  if (type === 'both' && race && (!date || race.date < date)) return { keepHyrox: near || !date };
  // Both, with a running goal that is not a race ("Get faster") and no HYROX race: HYROX was never chosen as the
  // goal, so this is a running plan too, with the station strength kept
  if (type === 'both' && !race && !date && !!profile.goalType && profile.goalType !== 'race') return { keepHyrox: true };
  const hardest = (h.hardest ?? []).filter((k) => stationByKey.has(k)).slice(0, 3);
  return { hyrox: {
    race: date ? { id: 'hyrox', name: 'HYROX', date, distanceM: 8000, courseType: 'road', goalS: h.goalS, priority: 'A' } : undefined,
    goalS: h.goalS, runShare: ownRunShare(profile) ?? RUN_SHARE, hardest: hardest.length ? hardest : ['sled_push', 'sandbag_lunges', 'wall_balls'],
    equipment: h.equipment ?? EQUIPMENT.map((e) => e.value), keepRunning: type === 'both' && near,
  } };
}

/** HYROX run pace (s/km): goal time × run share ÷ 8, never faster than threshold pace. Without a goal: a little slower than threshold. */
export function hyroxRunPace(goalS: number | undefined, runShare: number, thresholdS: number): number {
  const p = goalS ? (goalS * runShare) / 8 : thresholdS + 15;
  return Math.round(Math.max(p, thresholdS));
}

const HAS: Partial<Record<StationKey, string>> = { skierg: 'skierg', row: 'rower', sled_push: 'sled', sled_pull: 'sled', wall_balls: 'wall_ball', farmers_carry: 'kettlebells', sandbag_lunges: 'sandbag' };
/** A short block of a station for compromised runs, with what to do when the equipment is missing */
const BLOCK: Record<StationKey, [string, string]> = {
  skierg: ['250 m SkiErg', '25 band pull-downs'], row: ['250 m row', '20 burpees'], sled_push: ['20 m sled push', '20 m heavy lunges'], sled_pull: ['20 m sled pull', '20 heavy band rows'],
  burpee_broad_jump: ['20 m burpee broad jumps', '20 m burpee broad jumps'], farmers_carry: ['100 m farmers carry', '60 s heavy carry with what you have'], sandbag_lunges: ['50 m sandbag lunges', '50 m walking lunges'], wall_balls: ['25 wall balls', '25 thrusters'],
};
/** With no equipment at all (not even a band): bodyweight only */
const BLOCK_BW: Record<StationKey, string> = { skierg: '20 burpees', row: '20 burpees', sled_push: '20 m walking lunges', sled_pull: '30 air squats', burpee_broad_jump: '20 m burpee broad jumps', farmers_carry: '60 s wall sit', sandbag_lunges: '50 m walking lunges', wall_balls: '30 air squats' };
export const stationBlocks = (hardest: StationKey[], equipment: string[]): string[] =>
  hardest.map((k) => (!equipment.length ? BLOCK_BW[k] : BLOCK[k][!HAS[k] || equipment.includes(HAS[k]!) ? 0 : 1]));
/** Strength exercises for the hardest stations, with what is available */
const EX: Record<StationKey, [string, string]> = {
  skierg: ['band-pulldown', 'band-pulldown'], row: ['db-row', 'db-row'], sled_push: ['sled-push', 'split-squat'], sled_pull: ['sled-pull', 'db-row'], burpee_broad_jump: ['burpee-broad-jump', 'burpee-broad-jump'],
  farmers_carry: ['farmers-carry', 'plank'], sandbag_lunges: ['sandbag-lunge', 'db-lunge'], wall_balls: ['wall-ball', 'goblet-squat'],
};
const EX_BW: Record<StationKey, string> = { skierg: 'burpee-broad-jump', row: 'burpee-broad-jump', sled_push: 'split-squat', sled_pull: 'bw-squat', burpee_broad_jump: 'burpee-broad-jump', farmers_carry: 'wall-sit', sandbag_lunges: 'reverse-lunge', wall_balls: 'bw-squat' };
export const stationExercises = (hardest: StationKey[], equipment: string[]): string[] =>
  [...new Set(hardest.map((k) => (!equipment.length ? EX_BW[k] : EX[k][!HAS[k] || equipment.includes(HAS[k]!) ? 0 : 1])))];

/** Typical share of the station time each station takes, to turn a goal into a target per station */
const STATION_SHARE: Record<StationKey, number> = { skierg: 0.125, sled_push: 0.09, sled_pull: 0.135, burpee_broad_jump: 0.14, row: 0.13, farmers_carry: 0.065, sandbag_lunges: 0.135, wall_balls: 0.18 };
/** Targets from a goal time: the 1 km run, and each station (seconds). About 8% of the time is transitions. */
export function targetsFromGoal(goalS: number, runShare = RUN_SHARE, thresholdS = 0, roxShare = 0.08): Partial<Record<StationKey | 'run', number>> {
  // The run target is never faster than threshold pace, when that is known: the same limit the plan uses
  const out: Partial<Record<StationKey | 'run', number>> = { run: hyroxRunPace(goalS, runShare, thresholdS) };
  const stations = goalS * (1 - runShare - roxShare);
  for (const s of STATIONS) out[s.key] = Math.round((stations * STATION_SHARE[s.key]) / 5) * 5;
  return out;
}
