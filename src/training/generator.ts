// Plan generator: a weekly structure by role (long run, two quality sessions, easy days, rest), volume split
// across sessions with hard caps, a check that the volume fits before anything is built, phases and tapers
// by race distance, cutback weeks, and structured sessions whose distance and time always add up.
import { applyWeekChoice, weekWarnings, type WeekChoice } from './week-choice';
import { ROUTINE_TITLE, type Intensity, type Routine } from './strength';
import type { Phase, Plan, PlannedSession, PlanWeek, Profile, Race, SessionStep, SessionType, TrainingSettings } from '../lib/types';
import { addDays, DAY_NAMES, daysBetween, distanceLabel, duration, pace, parseYmd, startOfWeek, uid, weekday, ymd } from '../lib/format';
import type { TrainingPaces } from './fitness';
import { EQUIPMENT, hyroxRunPace, planGoal, stationBlocks, stationExercises, type HyroxGoal } from '../hyrox/plan-goal';

const P = (s: number) => pace(s, 'km', false);
const PR = (r: [number, number]) => `${P(r[0])}–${P(r[1])}/km`;
const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
const r1 = (x: number) => Math.round(x * 10) / 10;
const DAYS_PLURAL = DAY_NAMES.map((d) => `${d}s`);
/** "5K", "10K", "half marathon", "marathon" for use mid-sentence */
const raceWord = (m: number) => { const l = distanceLabel(m); return /K$/.test(l) ? l : l.toLowerCase(); };

/** 'HX' is HYROX (update 4, task 6): less running than a road race, with station work */
export type DistanceClass = '5K' | '10K' | 'HM' | 'M' | 'HX';
export const distanceClass = (m?: number): DistanceClass => (!m ? '10K' : m >= 40000 ? 'M' : m >= 18000 ? 'HM' : m >= 8000 ? '10K' : '5K');

/** Longest long run per goal (km, and minutes unless the runner sets their own) */
export const LONG_CAP_KM: Record<DistanceClass, number> = { '5K': 22, '10K': 24, HM: 28, M: 35, HX: 16 };
const LONG_CAP_MIN: Record<DistanceClass, number> = { '5K': 105, '10K': 110, HM: 135, M: 180, HX: 85 };
const TAPER_DAYS: Record<DistanceClass, number> = { '5K': 9, '10K': 10, HM: 12, M: 19, HX: 10 };
const PEAK_DEFAULT: Record<DistanceClass, number> = { '5K': 45, '10K': 55, HM: 65, M: 80, HX: 40 };
/** A HYROX plan runs about 70% of a road plan's volume */
export const HX_VOLUME = 0.7;
const RATE = { maintain: 0, steady: 0.05, progressive: 0.08, aggressive: 0.12 };
/** No single run may be more than this share of the week */
export const MAX_SHARE = 0.35;
/** A HYROX simulation is about as much station work as running, so in the share-of-the-week rule it counts as
 *  twice its running distance (a half simulation as 8 km, not 4). */
const weekShareM = (x: PlannedSession) => (x.hyrox?.kind.startsWith('sim') ? x.distanceM * 2 : x.distanceM) + (x.second?.distanceM ?? 0);
export const HARD_TYPES: SessionType[] = ['long', 'threshold', 'vo2max', 'tempo', 'hills', 'race', 'timetrial'];

export interface GenInput {
  today: Date;
  profile: Profile;
  race?: Race;
  paces: TrainingPaces;
  recentWeeklyKm: number;
  longestRecentKm: number;
  /** Plain words for where the paces come from, e.g. "your 10K in 33:11 on 1 Nov" */
  pacesFrom?: string;
  /** B and C races before the main race: B races get a short taper, C races replace a session */
  otherRaces?: Race[];
}

// ---------------------------------------------------------------------------
// Settings with defaults
export interface Resolved {
  weeklyKm: number; peakKm: number; progression: NonNullable<TrainingSettings['progression']>;
  available: number[]; daysPerWeek: number; longDay: number; dayAfterLong: 'easy' | 'off'; cutbackEvery: 3 | 4;
  maxEasyMin: number; maxQualityMin: number; maxLongMin: number; startMode: 'today' | 'monday'; dc: DistanceClass;
  doubles: number[]; hardSessions: number; difficulty: 'easier' | 'normal' | 'harder'; longRunStyle: 'auto' | 'steady' | 'progressive' | 'fast-finish';
  strides: boolean; strengthPerWeek: number; planWeeks: number;
  /** The week the runner chose (update 3, §7) */
  week?: WeekChoice;
}

export function resolveSettings(profile: Profile, race: Race | undefined, recentWeeklyKm: number, hyrox = false): Resolved {
  const t = profile.training ?? {};
  const dc: DistanceClass = hyrox ? 'HX' : distanceClass(race?.distanceM);
  const available = (profile.daysAvailable.length ? [...new Set(profile.daysAvailable)] : [0, 1, 3, 4, 5, 6]).sort((a, b) => a - b);
  const weeklyKm = Math.max(10, Math.round(t.weeklyKm ?? (hyrox ? recentWeeklyKm * HX_VOLUME : recentWeeklyKm)));
  const progression = t.progression ?? 'progressive';
  const peakKm = Math.max(weeklyKm, Math.round(t.peakKm ?? (progression === 'maintain' ? weeklyKm : Math.max(weeklyKm, Math.min(PEAK_DEFAULT[dc], weeklyKm * 1.3)))));
  const longDay = available.includes(profile.longRunDay) ? profile.longRunDay : available.includes(5) ? 5 : available.includes(6) ? 6 : available[available.length - 1];
  const dayAfterLong = t.dayAfterLong ?? 'easy';
  // Default: everything available except one rest day in the middle of the week (the default template uses 6 days)
  const defaultDays = Math.min(available.length, dayAfterLong === 'off' ? 5 : 6);
  const daysPerWeek = Math.max(2, Math.min(available.length, t.daysPerWeek ?? defaultDays));
  return {
    weeklyKm, peakKm, progression, available, daysPerWeek, longDay, dayAfterLong, cutbackEvery: t.cutbackEvery ?? 4,
    maxEasyMin: t.maxEasyMin ?? 90, maxQualityMin: t.maxQualityMin ?? 105, maxLongMin: t.maxLongMin ?? LONG_CAP_MIN[dc],
    startMode: t.startMode ?? 'today', dc,
    doubles: (t.doubles ?? []).filter((d) => available.includes(d) && d !== longDay), hardSessions: Math.max(0, Math.min(2, t.hardSessions ?? 2)),
    difficulty: t.difficulty ?? 'normal', longRunStyle: t.longRunStyle ?? 'auto', strides: t.strides ?? true,
    strengthPerWeek: Math.max(0, Math.min(3, t.strengthPerWeek ?? (hyrox ? 2 : 0))), planWeeks: Math.max(4, Math.min(24, t.planWeeks ?? 12)),
    week: t.week?.mode === 'custom' ? t.week : undefined,
  };
}

// ---------------------------------------------------------------------------
// Which day does what. Default (long run on Saturday): Mon threshold, Tue easy, Wed rest, Thu intervals,
// Fri easy, Sat long, Sun easy or off. Everything is placed relative to the long-run day, so moving the
// long run moves the rest of the week with it and two hard days never touch.
export type Role = 'long' | 'q1' | 'q2' | 'easy' | 'rest';

const adjacent = (a: number, b: number) => (a - b + 7) % 7 === 1 || (b - a + 7) % 7 === 1;

export function weekRoles(s: Pick<Resolved, 'available' | 'daysPerWeek' | 'longDay' | 'dayAfterLong'> & { hardSessions?: number }): { roles: Role[]; warnings: string[] } {
  const roles: Role[] = Array(7).fill('rest');
  const warnings: string[] = [];
  const L = s.longDay;
  const at = (off: number) => (L + off) % 7;
  const free = (d: number) => s.available.includes(d) && roles[d] === 'rest';
  const hardOk = (d: number) => ![0, 1, 2, 3, 4, 5, 6].some((x) => roles[x] !== 'rest' && roles[x] !== 'easy' && adjacent(x, d));
  roles[L] = 'long';
  let n = s.daysPerWeek - 1;
  const place = (role: Role, prefs: number[]) => {
    if (n <= 0) return false;
    for (const off of prefs) { const d = at(off); if (free(d) && hardOk(d)) { roles[d] = role; n--; return true; } }
    return false;
  };
  const hard = s.hardSessions ?? 2;
  if (hard >= 1 && !place('q1', [2, 3, 4, 5])) warnings.push('There is no day for a threshold session that is not next to the long run.');
  if (hard >= 2 && s.daysPerWeek >= 3 && !place('q2', [5, 4, 3, 2])) warnings.push('Only one quality session fits without two hard days back to back.');
  // Easy days, in order of preference; the day after the long run only if the runner wants it
  const easyPrefs = [3, 6, ...(s.dayAfterLong === 'off' ? [] : [1]), 4, 2, 5];
  for (const off of easyPrefs) { if (n <= 0) break; const d = at(off); if (free(d)) { roles[d] = 'easy'; n--; } }
  return { roles, warnings };
}

// ---------------------------------------------------------------------------
// Splitting weekly volume across sessions
export interface Caps { longKm: number; qualityKm: number; easyKm: number }

export function sessionCaps(r: Resolved, paces: TrainingPaces): Caps {
  const qPace = mid(paces.easy) * 0.6 + mid(paces.threshold) * 0.4;
  return {
    longKm: Math.min(LONG_CAP_KM[r.dc], (r.maxLongMin * 60) / mid(paces.long)),
    qualityKm: Math.min(18, (r.maxQualityMin * 60) / qPace),
    easyKm: (r.maxEasyMin * 60) / mid(paces.easy),
  };
}

export interface Split { longKm: number; qKm: number; easyKm: number; fits: boolean }

/** Soft shares (long ~27%, quality ~16%, easy the rest), then any overflow goes where the hard caps allow. */
export function splitWeek(vol: number, nQ: number, nEasy: number, hasLong: boolean, caps: Caps): Split {
  const lMax = hasLong ? Math.min(caps.longKm, MAX_SHARE * vol) : 0;
  const qMax = Math.min(caps.qualityKm, MAX_SHARE * vol);
  const eMax = Math.min(caps.easyKm, MAX_SHARE * vol);
  let longKm = hasLong ? Math.min(0.27 * vol, lMax) : 0;
  let qKm = nQ ? Math.min(Math.max(0.16 * vol, Math.min(8, qMax)), qMax) : 0;
  const rem = vol - longKm - nQ * qKm;
  let easyKm = nEasy ? rem / nEasy : 0;
  if (nEasy && easyKm < 4) easyKm = Math.min(4, eMax);
  // Distance the easy days cannot take goes to the long run first, then to the quality sessions
  let over = 0;
  if (!nEasy) over = rem;
  else if (easyKm > eMax) { over = (easyKm - eMax) * nEasy; easyKm = eMax; }
  const place = () => {
    if (hasLong && over > 0) { const add = Math.min(over, lMax - longKm); longKm += add; over -= add; }
    if (nQ && over > 0) { const add = Math.min(over / nQ, qMax - qKm); qKm += add; over -= add * nQ; }
  };
  place();
  // The long run is the longest run of the week: an easy day is never longer than it
  if (hasLong && nEasy && easyKm > longKm + 0.05) {
    const even = Math.min(lMax, (longKm + easyKm * nEasy) / (nEasy + 1));
    over += (easyKm - even) * nEasy - (even - longKm);
    easyKm = even; longKm = even;
    place();
  }
  return { longKm, qKm, easyKm, fits: over <= 0.5 };
}

export interface VolumeFit {
  fits: boolean; weeklyKm: number; days: number; maxKm: number; recommendedDays?: number; recommendedDayList?: number[];
  /** The fewest days that fit within the hard limits (may be fewer than recommended) */
  minDays?: number; minDayList?: number[];
  /** Easy runs longer than ideal (over 15% of the week each) */
  easyHeavy: boolean;
}

function rolesCount(roles: Role[]) { return { nQ: roles.filter((x) => x === 'q1' || x === 'q2').length, nEasy: roles.filter((x) => x === 'easy').length, hasLong: roles.includes('long') }; }

/** Check, before building, that the weekly volume fits the chosen days without breaking any session cap. */
export function checkVolumeFit(r: Resolved, paces: TrainingPaces, vol = r.peakKm): VolumeFit {
  const caps = sessionCaps(r, paces);
  const test = (days: number, available: number[], v: number) => {
    const { roles } = weekRoles({ ...r, available, daysPerWeek: days });
    const c = rolesCount(roles);
    const nDoubles = r.doubles.filter((d) => roles[d] !== 'rest' && roles[d] !== 'long').length;
    return { split: splitWeek(v, c.nQ, c.nEasy + nDoubles, c.hasLong, caps), ...c, nEasy: c.nEasy + nDoubles };
  };
  const cur = test(r.daysPerWeek, r.available, vol);
  let lo = 10, hi = vol;
  if (!cur.split.fits) { for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (test(r.daysPerWeek, r.available, m).split.fits) lo = m; else hi = m; } }
  const all = [0, 1, 2, 3, 4, 5, 6];
  let recommendedDays: number | undefined;
  for (let d = 3; d <= 7; d++) {
    const t = test(d, all, vol);
    if (t.split.fits && (!t.nEasy || t.split.easyKm <= 0.15 * vol + 0.3)) { recommendedDays = d; break; }
  }
  recommendedDays ??= [6, 7].find((d) => test(d, all, vol).split.fits);
  const minDays = [2, 3, 4, 5, 6, 7].find((d) => test(d, all, vol).split.fits);
  const minDayList = minDays ? weekRoles({ ...r, available: all, daysPerWeek: minDays }).roles.map((x, i) => (x === 'rest' ? -1 : i)).filter((i) => i >= 0) : undefined;
  const recommendedDayList = recommendedDays ? weekRoles({ ...r, available: all, daysPerWeek: recommendedDays }).roles.map((x, i) => (x === 'rest' ? -1 : i)).filter((i) => i >= 0) : undefined;
  return {
    fits: cur.split.fits, weeklyKm: vol, days: r.daysPerWeek, maxKm: cur.split.fits ? vol : Math.floor(lo),
    recommendedDays, recommendedDayList, minDays, minDayList, easyHeavy: cur.split.fits && cur.nEasy > 0 && cur.split.easyKm > 0.15 * vol + 0.3,
  };
}

// ---------------------------------------------------------------------------
// Session builders. Every step carries its km and duration; the session totals are their sums.
interface Ctx { paces: TrainingPaces; race?: Race; dc: DistanceClass; vol: number; hx?: HyroxGoal & { pace: [number, number] } }

function st(kind: NonNullable<SessionStep['kind']>, km: number, p: [number, number], label: string, detail: string, zones?: number[]): SessionStep {
  return { kind, km: r1(km), durationS: Math.round(r1(km) * mid(p)), pace: p, zones, label, detail };
}
/** Repetitions with jog recoveries: reps x repKm at pace, (reps - 1) recoveries of recS */
function reps(n: number, repKm: number, p: [number, number], recS: number, jog: [number, number], label: string, effort: string, zones: number[]): SessionStep {
  const recKm = (recS / mid(jog)) * (n - 1);
  const km = n * repKm + recKm;
  return { kind: 'work', km: r1(km), durationS: Math.round(n * repKm * mid(p) + recS * (n - 1)), pace: p, zones, label, detail: `at ${PR(p)}, ${effort}, ${recS >= 60 ? `${Math.round(recS / 60 * 10) / 10} min` : `${recS} s`} easy jog between` };
}

function make(date: string, phase: Phase, type: SessionType, title: string, focus: string, purpose: string, howItHelps: string, steps: SessionStep[], target?: [number, number], zones?: number[], extra: Partial<PlannedSession> = {}): PlannedSession {
  const km = steps.reduce((x, s) => x + (s.km ?? 0), 0);
  const durationS = steps.reduce((x, s) => x + (s.durationS ?? 0), 0);
  return {
    id: uid(), date, phase, status: 'planned', type, title, focus, purpose, howItHelps, steps,
    distanceM: Math.round(km * 1000), durationS: Math.round(durationS),
    paceTarget: target ? { minSPerKm: target[0], maxSPerKm: target[1] } : undefined, hrZones: zones, ...extra,
  };
}

export function easyRun(date: string, km: number, phase: Phase, ctx: Pick<Ctx, 'paces' | 'race'>, o: { strides?: boolean; recovery?: boolean; title?: string; why?: string } = {}): PlannedSession {
  const p = o.recovery ? ctx.paces.recovery : ctx.paces.easy;
  const steps = [st('easy', km, p, `${r1(km)} km ${o.recovery ? 'very easy' : 'easy'}`, `at ${PR(p)}, conversational, heart rate in Z${o.recovery ? 1 : 2}`, [o.recovery ? 1 : 2])];
  if (o.strides) steps.push({ kind: 'strides', label: '6 x 20 s strides', detail: `quick and relaxed around ${P(ctx.paces.repetition[0])}/km, walk back between`, km: 0, durationS: 0 });
  return make(date, phase, o.recovery ? 'recovery' : 'easy', o.title ?? (o.strides ? 'Easy run with strides' : o.recovery ? 'Recovery run' : 'Easy run'),
    o.strides ? 'Easy + strides' : o.recovery ? 'Recovery' : 'Easy',
    o.why ?? (o.strides ? 'Easy aerobic running plus a few short, relaxed strides to keep your legs quick without adding fatigue.' : 'Builds your aerobic engine: more capillaries, more mitochondria, stronger tendons. Most of your fitness comes from runs like this.'),
    `A bigger aerobic base lets you hold race pace for longer${ctx.race ? ` at ${ctx.race.name}` : ''}.`, steps, p, [o.recovery ? 1 : 2]);
}

function longRun(date: string, km: number, phase: Phase, ctx: Ctx, style: 'steady' | 'progressive' | 'mp'): PlannedSession {
  const P2 = ctx.paces;
  const steady: [number, number] = [P2.marathon[1] + 6, P2.marathon[1] + 18];
  if (style === 'steady' || km < 12) {
    return make(date, phase, 'long', 'Long run', 'Long', 'Builds endurance and durability: your heart, legs and fuel systems all adapt to time on your feet.',
      'Endurance means you slow down less at the end of your race.', [st('easy', km, P2.long, `${r1(km)} km steady and relaxed`, `at ${PR(P2.long)}, heart rate in Z2`, [2])], P2.long, [2]);
  }
  const fastShare = style === 'progressive' ? 0.2 : ctx.dc === 'M' ? 0.4 : 0.28;
  const fastKm = Math.round(km * fastShare);
  const fastPace = style === 'progressive' ? steady : P2.marathon;
  return make(date, phase, 'long', style === 'progressive' ? 'Long run, progressive' : 'Long run with marathon-pace finish', 'Long progressive',
    style === 'progressive' ? 'Starts easy and finishes at a steady effort, which teaches you to run well on tired legs.' : 'Finishing a long run at marathon pace builds the strength to hold a fast rhythm late in a race.',
    'Endurance with some pace in it makes your race pace feel more comfortable.',
    [st('easy', km - fastKm, P2.long, `${km - fastKm} km easy`, `at ${PR(P2.long)}, Z2`, [2]), st('steady', fastKm, fastPace, `last ${fastKm} km ${style === 'progressive' ? 'steady' : 'at marathon pace'}`, `at ${PR(fastPace)}, Z3, smooth and controlled`, [3])],
    P2.long, [2, 3]);
}

/** Fills warm-up and cool-down so the session lands near its target distance (2 to 5 km each). */
const wuMin = (targetKm: number) => (targetKm < 9 ? 1 : 2);
function withWuCd(work: SessionStep, targetKm: number, ctx: Ctx): SessionStep[] {
  const m = wuMin(targetKm);
  const rest = Math.max(2 * m, Math.min(10, targetKm - (work.km ?? 0)));
  const wu = Math.max(m, Math.min(5, Math.round(rest / 2)));
  const cd = Math.max(m, Math.min(5, Math.round(rest - wu)));
  return [st('warmup', wu, ctx.paces.easy, 'Warm up', `${wu} km easy at ${PR(ctx.paces.easy)}, then 4 relaxed strides`, [2]), work, st('cooldown', cd, ctx.paces.easy, 'Cool down', `${cd} km easy`, [2])];
}

/** Largest number of reps (down to minN) whose work fits inside the session's share of the week */
function fitReps(maxN: number, minN: number, targetKm: number, mk: (n: number) => SessionStep): SessionStep {
  const room = Math.max(1.2, targetKm - 2 * wuMin(targetKm));
  for (let n = maxN; n > minN; n--) { const w = mk(n); if ((w.km ?? 0) <= room) return w; }
  return mk(minN);
}

function threshold(date: string, km: number, phase: Phase, ctx: Ctx, variant: number, light = false): PlannedSession {
  const T = ctx.paces.threshold;
  const kmAt = (min: number) => (min * 60) / mid(T);
  const opts = light ? [[3, 8, 90]] : phase === 'peak' ? [[3, 10, 90], [2, 15, 120]] : [[5, 6, 60], [2, 15, 120], [4, 8, 90]];
  const [n0, min0, rec] = opts[variant % opts.length];
  // If the work does not fit the session's share of the week, use shorter reps first, then fewer
  const room = Math.max(1.2, km - 2 * wuMin(km));
  let work: SessionStep | undefined, min = min0;
  for (const m of [min0, 10, 8, 6].filter((x) => x <= min0)) {
    min = m;
    work = fitReps(Math.max(n0, 2), 2, km, (k) => reps(k, kmAt(m), T, rec, ctx.paces.recovery, `${k} x ${m} min threshold`, 'comfortably hard, about the pace you could race for an hour', [4]));
    if ((work.km ?? 0) <= room) break;
  }
  work = work!;
  const n = Number(work.label.split(' ')[0]);
  return make(date, phase, 'threshold', `Threshold: ${n} x ${min} min`, 'Threshold',
    'Raises the pace you can hold before lactate builds up fast. Comfortably hard, never all out.',
    'A higher threshold makes every race pace from 5K to marathon feel more controlled.', withWuCd(work, km, ctx), T, [4]);
}

function intervals(date: string, km: number, phase: Phase, ctx: Ctx, variant: number): PlannedSession {
  const I = ctx.paces.interval;
  const big = ctx.vol >= 70;
  const opts: [number, number, number, string][] = [[big ? 6 : 5, 1, 120, '1 km'], [big ? 8 : 6, 0.8, 120, '800 m'], [big ? 12 : 10, 0.4, 60, '400 m']];
  const [n0, rep, rec, lbl] = opts[variant % opts.length];
  const work = fitReps(n0, rep >= 1 ? 3 : 4, km, (n) => reps(n, rep, I, rec, ctx.paces.recovery, `${n} x ${lbl}`, 'hard but controlled, even splits', [5]));
  const n = Number(work.label.split(' ')[0]);
  return make(date, phase, 'vo2max', `Intervals: ${n} x ${lbl}`, 'Intervals',
    'Works your heart and lungs close to their maximum, which raises the ceiling of your aerobic fitness.',
    'A higher ceiling makes race pace a smaller share of your maximum.', withWuCd(work, km, ctx), I, [5]);
}

/** A continuous tempo run: steady and strong, between marathon pace and threshold (chosen days, update 3 §7) */
function tempo(date: string, km: number, phase: Phase, ctx: Ctx): PlannedSession {
  const P: [number, number] = [ctx.paces.threshold[1], ctx.paces.marathon[0]];
  const room = Math.max(2, km - 2 * wuMin(km));
  const tk = Math.max(2, Math.min(phase === 'base' ? 6 : 10, Math.round(room)));
  const work = st('work', tk, P, `${tk} km tempo`, `at ${PR(P)}, strong and steady, about the effort you could hold for 75 minutes`, [3, 4]);
  return make(date, phase, 'tempo', `Tempo: ${tk} km`, 'Tempo',
    'A sustained steady-hard run: teaches you to hold a strong rhythm for a long time.',
    'Tempo running makes race pace feel more relaxed and builds stamina for the second half of a race.', withWuCd(work, km, ctx), P, [3, 4]);
}

function racePace(date: string, km: number, phase: Phase, ctx: Ctx, sharpener = false): PlannedSession {
  const pc = ctx.paces;
  const dc = ctx.dc;
  const rp: [number, number] = dc === '5K' ? [pc.interval[1], pc.interval[1] + 5] : dc === '10K' ? [Math.round((pc.interval[1] + pc.threshold[0]) / 2) - 2, Math.round((pc.interval[1] + pc.threshold[0]) / 2) + 3]
    : dc === 'HM' ? [Math.round((pc.threshold[1] + pc.marathon[0]) / 2) - 2, Math.round((pc.threshold[1] + pc.marathon[0]) / 2) + 3] : pc.marathon;
  const name = dc === 'M' ? 'marathon' : dc === 'HM' ? 'half marathon' : dc;
  if (ctx.hx) {
    // HYROX: a short race-pace touch, 4 x 1 km at the HYROX run pace
    const hp = ctx.hx.pace;
    const tgt = Math.max(7, Math.min(km, 9));
    const w = fitReps(4, 2, tgt, (k) => reps(k, 1, hp, 90, pc.recovery, `${k} x 1 km at HYROX pace`, 'your race-day run rhythm', [4]));
    return make(date, phase, 'vo2max', `Race-pace sharpener: ${w.label.split(' ')[0]} x 1 km`, 'HYROX', 'Short and crisp: keeps your legs sharp while fatigue drops before the race.', 'Knowing exactly how race pace feels is the best pacing tool you have.', withWuCd(w, tgt, ctx), hp, [4], { hyrox: { kind: 'km_repeats' } });
  }
  let n: number, rep: number, rec: number, lbl: string;
  if (sharpener) { n = dc === 'M' || dc === 'HM' ? 3 : 4; rep = dc === 'M' ? 2 : 1; rec = 120; lbl = dc === 'M' ? '2 km' : '1 km'; }
  else if (dc === '5K') { n = 4; rep = 1.2; rec = 150; lbl = '1.2 km'; }
  else if (dc === '10K') { n = 3; rep = 2; rec = 120; lbl = '2 km'; }
  else if (dc === 'HM') { n = 2; rep = 5; rec = 180; lbl = '5 km'; }
  else { n = 1; rep = Math.min(16, Math.max(4, Math.round(km - 2 * wuMin(km) - 1))); rec = 0; lbl = `${rep} km`; }
  const tgt = sharpener ? Math.min(km, 9) : km;
  const work = n === 1 ? st('work', rep, rp, `${lbl} at ${name} pace`, `at ${PR(rp)}, steady and controlled`, [3]) : fitReps(n, 2, tgt, (k) => reps(k, rep, rp, rec, pc.recovery, `${k} x ${lbl} at ${name} pace`, `your ${name} race rhythm`, [dc === 'M' ? 3 : 4]));
  n = n === 1 ? 1 : Number(work.label.split(' ')[0]);
  const title = sharpener ? `Race-pace sharpener: ${n} x ${lbl}` : n === 1 ? `Marathon pace: ${lbl}` : `Race pace: ${n} x ${lbl}`;
  return make(date, phase, dc === 'M' ? 'tempo' : 'vo2max', title, 'Race pace',
    sharpener ? 'Short and crisp: keeps your legs sharp while fatigue drops before the race.' : `Rehearses your ${name} rhythm so it feels familiar and controlled on race day.`,
    'Knowing exactly how race pace feels is the best pacing tool you have.', withWuCd(work, tgt, ctx), rp, [dc === 'M' ? 3 : 4]);
}

// ---- HYROX sessions (update 4, task 6)
/** 1 km repeats at HYROX run pace. 6 x 1 km with 90 s rest, building to 8; then shorter rests (60 s, 45 s). */
function hxRepeats(date: string, km: number, phase: Phase, ctx: Ctx, stage: number): PlannedSession {
  const hp = ctx.hx!.pace;
  const n0 = Math.min(8, 6 + stage), rec = stage <= 2 ? 90 : stage === 3 ? 60 : 45;
  const work = fitReps(n0, ctx.vol >= 32 ? 6 : 4, km, (n) => reps(n, 1, hp, rec, ctx.paces.recovery, `${n} x 1 km at HYROX pace`, 'the pace you will run between stations: controlled, never a sprint', [4]));
  const n = Number(work.label.split(' ')[0]);
  return make(date, phase, 'vo2max', `HYROX 1 km repeats: ${n} x 1 km`, 'HYROX',
    `Teaches your legs the exact pace of the 8 race runs, ${rec < 90 ? `with only ${rec} s between them, so it starts to feel like the race` : 'with enough rest to hold it evenly'}.`,
    'Even 1 km splits are where most HYROX time is won or lost.', withWuCd(work, Math.min(km, (work.km ?? 0) + 4), ctx), hp, [4], { hyrox: { kind: 'km_repeats' } });
}
/** Compromised runs: 4 to 8 x (a short station block, then 1 km at HYROX pace straight away) */
function hxCompromised(date: string, km: number, phase: Phase, ctx: Ctx, stage: number): PlannedSession {
  const hx = ctx.hx!, hp = hx.pace;
  const blocks = stationBlocks(hx.hardest, hx.equipment).slice(0, 3);
  const BLOCK_S = 100;
  const mk = (n: number): SessionStep => ({ kind: 'work', km: n, durationS: Math.round(n * mid(hp) + n * BLOCK_S), pace: hp, zones: [4], label: `${n} x 1 km at HYROX pace`,
    detail: `each one straight after a station block (${blocks.join(', ')}; take them in turn). Run at ${PR(hp)}: the first 200 m feel heavy, then settle. No rest between the block and the run` });
  const work = fitReps(Math.min(8, 4 + stage), 3, km, mk);
  const n = Number(work.label.split(' ')[0]);
  return make(date, phase, 'vo2max', `Compromised runs: ${n} x (station + 1 km)`, 'HYROX',
    'Running on legs that have just done a station is the skill of HYROX. This practises it with your hardest stations.',
    'The runs after sleds, lunges and wall balls stop costing you time.', withWuCd(work, Math.min(km, (work.km ?? 0) + 4), ctx), hp, [4], { hyrox: { kind: 'compromised', blocks } });
}
/** A half or full simulation, recorded with the HYROX recorder */
function hxSim(date: string, full: boolean, phase: Phase, ctx: Ctx): PlannedSession {
  const hx = ctx.hx!, n = full ? 8 : 4;
  const est = Math.round((hx.goalS ?? mid(hx.pace) * 8 / hx.runShare) * (full ? 1 : 0.5) * (full ? 1.03 : 1.02));
  return make(date, phase, 'tempo', full ? 'HYROX full simulation' : 'HYROX half simulation', 'HYROX',
    full ? 'The whole race in order, once: 8 x (1 km run + station). Pace it like race day and note where it gets hard.' : `Half the race in order: ${n} x (1 km run + station). Alternate the front and back half from one time to the next.`,
    'Nothing shows your pacing, transitions and weak stations like doing them in order.',
    [{ kind: 'work', km: n, durationS: est, pace: hx.pace, zones: [3, 4], label: `${n} x (1 km run + station)`, detail: `runs at ${PR(hx.pace)}; stations at a steady effort you could repeat. Start it from Activity, HYROX` }], hx.pace, [3, 4], { hyrox: { kind: full ? 'sim_full' : 'sim_half' } });
}
function hxRaceDay(date: string, race: Race, ctx: Ctx): PlannedSession {
  const est = Math.round(race.goalS ?? (mid(ctx.hx!.pace) * 8) / ctx.hx!.runShare);
  return {
    id: uid(), date, phase: 'race', status: 'planned', type: 'race', title: 'HYROX', focus: 'Race', hyrox: { kind: 'race' },
    purpose: 'Race day. Everything you have done has been building to this.', howItHelps: 'Run the first kilometre slower than feels right, keep the stations steady, and save something for the wall balls.',
    steps: [{ label: 'Race', detail: `8 x (1 km run + station)${race.goalS ? `, goal ${duration(race.goalS)}` : ''}. Runs at about ${P(mid(ctx.hx!.pace))}/km`, km: 8, durationS: est, kind: 'work' }],
    distanceM: 8000, durationS: est,
  };
}

function hills(date: string, km: number, phase: Phase, ctx: Ctx): PlannedSession {
  const up: [number, number] = ctx.paces.interval;
  const mk = (n: number): SessionStep => ({ kind: 'work', label: `${n} x 60 s uphill`, detail: 'strong effort on a steady 4–6% hill, jog back down', km: r1(n * (60 / mid(up)) * 0.85 + n * (60 / mid(ctx.paces.recovery))), durationS: n * 60 * 2, pace: up, zones: [4, 5] });
  const work = fitReps(8, 4, km, mk);
  return make(date, phase, 'hills', `Hills: ${work.label.split(' ')[0]} x 60 s`, 'Hills', 'Running uphill builds leg strength and power with less impact than flat speed work.',
    'Stronger legs hold their form late in a race.', withWuCd(work, km, ctx), undefined, [4, 5]);
}

function raceDay(date: string, race: Race, paces: TrainingPaces): PlannedSession {
  const est = race.goalS ?? race.distanceM / 1000 * mid(paces.marathon);
  return {
    id: uid(), date, phase: 'race', status: 'planned', type: 'race', title: race.name, focus: 'Race',
    purpose: 'Race day. Everything you have done has been building to this.', howItHelps: 'Start controlled, settle into your rhythm and finish strong.',
    steps: [{ label: 'Race', detail: `${distanceLabel(race.distanceM)}${race.goalS ? `, goal ${duration(race.goalS)}` : ''}`, km: race.distanceM / 1000, durationS: Math.round(est), kind: 'work' }],
    distanceM: race.distanceM, durationS: Math.round(est),
  };
}

export function restDay(date: string, phase: Phase, why?: string): PlannedSession {
  return {
    id: uid(), date, phase, status: 'planned', type: 'rest', title: 'Rest day', focus: 'Rest',
    purpose: why ?? 'Fitness is built while you recover. Rest lets your body adapt to the training.',
    howItHelps: 'Arriving fresh at your key sessions makes them count.',
    steps: [{ label: 'Rest', detail: 'Optional: a walk, mobility or gentle stretching', km: 0, durationS: 0 }], distanceM: 0, durationS: 0,
  };
}

// ---------------------------------------------------------------------------
export interface PlanProblem {
  kind: 'doesNotFit' | 'invalid';
  message: string;
  fit?: VolumeFit;
  options: { label: string; recommended?: boolean; training?: Partial<TrainingSettings>; daysAvailable?: number[] }[];
  issues?: string[];
}
export type GenResult = { ok: true; plan: Plan; warnings: string[] } | { ok: false; problem: PlanProblem };

export function phaseForWeeks(W: number): Phase[] {
  if (W <= 0) return [];
  if (W <= 2) return Array(W).fill('peak');
  if (W <= 4) { const b = Math.ceil(W / 2); return [...Array(b).fill('build'), ...Array(W - b).fill('peak')]; }
  const [bs, bd] = W <= 8 ? [Math.round(W * 0.25), Math.round(W * 0.4)] : [Math.round(W * 0.4), Math.round(W * 0.35)];
  return [...Array(bs).fill('base'), ...Array(bd).fill('build'), ...Array(W - bs - bd).fill('peak')];
}

export function generatePlan(input: GenInput): GenResult {
  const { profile, paces } = input;
  // HYROX athletes (update 4, task 6): the plan is for HYROX; "Both" is for whichever race is nearer
  const goal = planGoal(profile, input.race, input.today);
  const hxGoal = goal.hyrox;
  const race = hxGoal ? hxGoal.race : input.race;
  const hx = hxGoal ? { ...hxGoal, pace: ((p) => [p - 4, p + 4] as [number, number])(hyroxRunPace(hxGoal.goalS, hxGoal.runShare, Math.round(mid(paces.threshold)))) } : undefined;
  const r = resolveSettings(profile, race, input.recentWeeklyKm, !!hx);
  // A running plan that keeps HYROX going: at least one station strength session a week
  if (goal.keepHyrox && r.strengthPerWeek < 1 && !r.week) r.strengthPerWeek = 1;
  const hxExtra = hx || goal.keepHyrox ? stationExercises(hx?.hardest ?? (profile.hyrox?.hardest?.length ? profile.hyrox.hardest : ['sled_push', 'sandbag_lunges', 'wall_balls']), hx?.equipment ?? profile.hyrox?.equipment ?? EQUIPMENT.map((e) => e.value)) : undefined;
  const warnings: string[] = [];

  // 1) Does the volume fit the days? Never fix it silently.
  const fit = checkVolumeFit(r, paces);
  if (!fit.fits) {
    const options: PlanProblem['options'] = [];
    if (fit.recommendedDays && fit.recommendedDayList && fit.recommendedDays > r.daysPerWeek) {
      options.push({ label: `Train ${fit.recommendedDays} days a week (recommended)`, recommended: true, daysAvailable: [...new Set([...r.available, ...fit.recommendedDayList])].sort(), training: { daysPerWeek: fit.recommendedDays } });
    }
    if (fit.minDays && fit.minDayList && fit.minDays > r.daysPerWeek && fit.minDays < (fit.recommendedDays ?? 8)) {
      options.push({ label: `Train ${fit.minDays} days a week`, daysAvailable: [...new Set([...r.available, ...fit.minDayList])].sort(), training: { daysPerWeek: fit.minDays } });
    }
    // Doubles: a second easy run on the days already chosen (for experienced, high-volume runners)
    const { roles: curRoles } = weekRoles(r);
    const doubleDays = curRoles.map((x, i) => (x === 'q1' || x === 'q2' || x === 'easy' ? i : -1)).filter((i) => i >= 0);
    if (doubleDays.length && r.weeklyKm >= 50 && checkVolumeFit({ ...r, doubles: doubleDays }, paces).fits) {
      options.push({ label: `Keep ${r.daysPerWeek} days and add a second easy run on ${doubleDays.map((d) => DAY_NAMES[d]).join(', ').replace(/, ([^,]*)$/, ' and $1')}`, training: { doubles: doubleDays } });
    }
    options.push({ label: `Lower to ${fit.maxKm} km a week on ${r.daysPerWeek} days`, training: { weeklyKm: fit.maxKm, peakKm: fit.maxKm } });
    return { ok: false, problem: {
      kind: 'doesNotFit', fit, options,
      message: `${Math.round(fit.weeklyKm)} km a week does not fit safely into ${r.daysPerWeek} days: some runs would be longer than is safe or sensible for ${hx ? 'HYROX' : race ? `a ${raceWord(race.distanceM)}` : 'your goal'}. The most that fits in ${r.daysPerWeek} days is about ${fit.maxKm} km.${fit.recommendedDays ? ` ${fit.recommendedDays} days a week would spread ${Math.round(fit.weeklyKm)} km well.` : ''}`,
    } };
  }
  if (fit.easyHeavy) warnings.push(`Easy runs are a little long at ${Math.round(r.weeklyKm)} km on ${r.daysPerWeek} days.${fit.recommendedDays && fit.recommendedDays > r.daysPerWeek ? ` A ${fit.recommendedDays}th day would spread the volume better.` : ''}`);
  if (r.peakKm > input.recentWeeklyKm * 1.3 && input.recentWeeklyKm > 5) warnings.push(`The peak of ${r.peakKm} km is more than 30% above your recent ${Math.round(input.recentWeeklyKm)} km a week. Build carefully.`);

  // 2) Dates
  const today = parseYmd(ymd(input.today));
  const start = r.startMode === 'monday' && weekday(today) !== 0 ? addDays(today, 7 - weekday(today)) : today;
  const raceDate = race ? parseYmd(race.date) : undefined;
  const end = raceDate ?? addDays(startOfWeek(start), r.planWeeks * 7 - 1);
  const ws0 = startOfWeek(start);
  const totalWeeks = Math.max(1, Math.ceil((daysBetween(ws0, end) + 1) / 7));
  const taperStart = raceDate ? addDays(raceDate, -TAPER_DAYS[r.dc]) : undefined;
  const preTaperWeeks = taperStart ? Math.max(0, Math.ceil(daysBetween(ws0, taperStart) / 7)) : totalWeeks;
  const weekPhases = phaseForWeeks(preTaperWeeks);
  const { roles: autoRoles, warnings: roleWarn } = weekRoles(r);
  // The runner's own week, laid over Ritmo's (update 3, §7)
  const chosen = applyWeekChoice(autoRoles, r.week);
  const roles = chosen.roles;
  const keepTypes = !!r.week && !r.week.adjustByPhase;
  if (!r.week) warnings.push(...roleWarn);
  else warnings.push(...weekWarnings(r.week, autoRoles));
  const caps = sessionCaps(r, paces);
  const counts = rolesCount(roles);

  const sessions: PlannedSession[] = [];
  const phases: Plan['phases'] = [];
  const weeks: PlanWeek[] = [];
  const rate = RATE[r.progression];
  let normal = r.weeklyKm;
  let qVariant = 0;
  // HYROX: how far the 1 km repeats and compromised runs have progressed, and whether the full simulation is done
  let hxStage = 0, hxBuildWeeks = 0, hxFullDone = false;
  let strengthN = 0;
  let strengthDows: number[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const ws = addDays(ws0, w * 7);
    let phase: Phase = w < preTaperWeeks ? weekPhases[w] ?? 'peak' : 'taper';
    const cutback = phase !== 'taper' && w > 0 && (w + 1) % r.cutbackEvery === 0 && w < preTaperWeeks - 1;
    if (w > 0 && !cutback) normal = Math.min(r.peakKm, normal * (1 + rate));
    const vol = cutback ? normal * 0.8 : normal;
    if (cutback) phase = 'recovery';
    // One quality session in cutback weeks and for low-volume runners; the second slot becomes easy
    const oneQ = !keepTypes && (cutback || vol < 25 || phase === 'base');
    const nDoubles = r.doubles.filter((d) => roles[d] !== 'rest' && roles[d] !== 'long').length;
    const split = splitWeek(vol, oneQ ? Math.min(1, counts.nQ) : counts.nQ, counts.nEasy + nDoubles + (oneQ && counts.nQ > 1 ? 1 : 0), counts.hasLong, caps);
    // HYROX sessions need room for 6 x 1 km even at a modest weekly volume (still under the 35% rule). The easy
    // runs give the distance back, so the week's total stays where it should be.
    let hxQ: number | undefined;
    if (hx && phase !== 'base' && !cutback && !oneQ) {
      hxQ = Math.min(caps.qualityKm, Math.max(split.qKm, Math.min(12.5, vol * 0.33)));
      const nEasy = counts.nEasy + nDoubles;
      if (nEasy > 0) split.easyKm = Math.max(Math.min(4, split.easyKm), split.easyKm - ((hxQ - split.qKm) * counts.nQ) / nEasy);
    }
    // A week with no easy day (three running days) still needs an easy distance for taper and race-week runs
    const easyBase = split.easyKm > 0 ? split.easyKm : Math.max(5, split.qKm * 0.7);
    const k = r.difficulty === 'easier' ? 1.02 : r.difficulty === 'harder' ? 0.99 : 1;
    const qp: TrainingPaces = k === 1 ? paces : { ...paces, threshold: [paces.threshold[0] * k, paces.threshold[1] * k], interval: [paces.interval[0] * k, paces.interval[1] * k], repetition: [paces.repetition[0] * k, paces.repetition[1] * k] };
    const ctx: Ctx = { paces: qp, race, dc: r.dc, vol, hx };
    const autoStyle = phase === 'peak' ? (r.dc === 'M' || r.dc === 'HM' ? 'mp' : 'progressive') : phase === 'build' ? 'progressive' : 'steady';
    const longStyle: 'steady' | 'progressive' | 'mp' = r.longRunStyle === 'auto' ? autoStyle : r.longRunStyle === 'fast-finish' ? 'mp' : r.longRunStyle;
    let weekKm = 0;
    const weekSessions: PlannedSession[] = [];
    const rebuild = new Map<string, (km: number) => PlannedSession>();

    // Race week keeps the runner's number of run days, with a full rest day 2 days before a 5K or 10K
    // (3 before a half or marathon), and one short race-pace sharpener 4 to 5 days out.
    const dayRole = (d: number): Role => roles[d];
    const forced = new Map<number, 'rest' | 'easy' | 'sharpener'>();
    const raceIdx = raceDate ? daysBetween(ws, raceDate) : -1;
    if (raceDate && raceIdx >= 0 && raceIdx <= 6) {
      const restTo = r.dc === 'HM' || r.dc === 'M' ? 3 : 2;
      const before = (k: number) => raceIdx - k; // day index k days before the race
      const restIdx = [before(restTo), before(restTo === 2 ? 3 : 2)].find((i) => i >= 0);
      const restsBefore = [...Array(raceIdx).keys()].filter((i) => dayRole(i) === 'rest');
      if (restIdx != null) {
        if (dayRole(raceIdx) === 'rest') forced.set(restIdx, 'rest'); // the race takes a rest day's place: one more rest
        else if (!restsBefore.some((i) => i === before(2) || i === before(3))) {
          // move the week's rest day to just before the race, and run on the old rest day instead
          forced.set(restIdx, 'rest');
          const old = restsBefore.find((i) => i < restIdx);
          if (old != null) forced.set(old, 'easy');
        }
      }
      const isRun = (i: number) => (forced.get(i) ?? (dayRole(i) === 'rest' ? 'rest' : 'run')) !== 'rest';
      const sharp = [before(4), before(5)].find((i) => i >= 0 && isRun(i));
      if (sharp != null) forced.set(sharp, 'sharpener');
    }

    // Easy runs of different lengths: shorter the day after a hard day or the long run, longer otherwise,
    // keeping the week's total and every run within its length cap.
    const easyIdx = [...Array(7).keys()].filter((d) => roles[d] === 'easy');
    const afterHard = (d: number) => ['q1', 'q2', 'long'].includes(roles[(d + 6) % 7]);
    const eMax = Math.min(caps.easyKm, 0.35 * vol);
    const easyWeight = new Map<number, number>();
    {
      const short = easyIdx.filter(afterHard), long = easyIdx.filter((d) => !afterHard(d));
      let a = 0.2;
      if (short.length && long.length) {
        const up = (wa: number) => 1 + (wa * short.length) / long.length;
        while (a > 0 && split.easyKm * up(a) > eMax) a -= 0.05;
        a = Math.max(0, a);
        short.forEach((d) => easyWeight.set(d, 1 - a));
        long.forEach((d) => easyWeight.set(d, up(a)));
      } else if (easyIdx.length >= 2) {
        // no hard days to lean on: alternate a little shorter and longer
        const sp = split.easyKm * 1.15 > eMax ? 0 : 0.15;
        easyIdx.forEach((d, i) => easyWeight.set(d, easyIdx.length % 2 && i === easyIdx.length - 1 ? 1 : i % 2 ? 1 + sp : 1 - sp));
      }
    }

    for (let d = 0; d < 7; d++) {
      const dateD = addDays(ws, d);
      const date = ymd(dateD);
      if (dateD < start) continue; // never plan days that have already passed
      if (raceDate && dateD > raceDate) break;
      const toRace = raceDate ? daysBetween(dateD, raceDate) : 99;
      const dayPhase: Phase = taperStart && dateD >= taperStart ? 'taper' : phase;
      const taperScale = r.dc === 'HX' ? 0.6 : r.dc === 'M' ? (toRace > 13 ? 0.75 : toRace > 6 ? 0.6 : 0.5) : r.dc === 'HM' ? (toRace > 6 ? 0.75 : 0.6) : toRace > 6 ? 0.8 : 0.7;
      let s: PlannedSession;
      const force = forced.get(d);
      const role: Role = force === 'rest' ? 'rest' : force === 'easy' ? 'easy' : roles[d];
      const prevSession = weekSessions[weekSessions.length - 1] ?? sessions[sessions.length - 1];
      if (race && toRace === 0) s = hx ? hxRaceDay(date, race, ctx) : raceDay(date, race, paces);
      else if (force === 'sharpener') s = racePace(date, Math.max(5, split.qKm * 0.7), 'taper', ctx, true);
      else if (race && toRace === 1) s = roles[d] !== 'rest' ? easyRun(date, Math.min(5, Math.max(3, split.easyKm * 0.4)), 'taper', ctx, { strides: true, title: 'Shakeout run with strides', why: 'A short, easy run with a few strides the day before the race keeps your legs fresh and loose.' }) : restDay(date, 'taper', 'The day before the race: rest, or a 15 minute walk.');
      else if (role === 'rest' && chosen.strengthOnly[d] && !(raceDate && toRace <= 3)) s = { ...restDay(date, dayPhase, 'Strength only today, at a moderate effort. Treat the day as recovery.'), title: 'Strength (no run)', focus: 'Strength' };
      else if (role === 'rest') s = restDay(date, dayPhase);
      else if (role === 'long') {
        const km = dayPhase === 'taper' ? (toRace <= 6 ? Math.min(r.dc === 'M' ? 16 : 12, split.longKm * 0.55) : split.longKm * taperScale) : cutback ? split.longKm : split.longKm;
        const mkLong = (k: number) => (dayPhase === 'taper' && toRace <= 6 ? easyRun(date, k, 'taper', ctx, { title: 'Easy run (race week)' }) : longRun(date, Math.round(k), dayPhase, ctx, dayPhase === 'taper' || cutback ? 'steady' : longStyle));
        // HYROX: a half simulation every third build week, and the full one once, 3 to 4 weeks before the race
        const simOk = !!hx && dayPhase !== 'taper' && !cutback && (phase === 'build' || phase === 'peak');
        if (simOk && !hxFullDone && toRace >= 21 && toRace <= 34) { s = hxSim(date, true, dayPhase, ctx); hxFullDone = true; }
        else if (simOk && hxBuildWeeks % 3 === 1 && !(toRace >= 14 && toRace < 21)) s = hxSim(date, false, dayPhase, ctx);
        else { s = mkLong(km); rebuild.set(s.id, mkLong); }
      } else if (role === 'q1' || role === 'q2') {
        // HYROX sessions need room for 6 x 1 km even at a modest weekly volume (still under the 35% rule)
        const qKm = hxQ ?? split.qKm;
        if (dayPhase === 'taper') {
          s = toRace <= 3 ? easyRun(date, Math.max(5, easyBase * 0.5), 'taper', ctx, { strides: true, title: 'Openers: easy with strides', why: 'A few strides close to the race wake your legs up without tiring them.' })
            : toRace > 6 ? racePace(date, qKm * 0.7, 'taper', ctx, true) : easyRun(date, Math.max(3, easyBase * taperScale), 'taper', ctx, { strides: true }); // race week has one sharpener (set above)
        } else if (keepTypes && chosen.hardType[d]) {
          // The runner chose this day's session: Ritmo fills in distance, reps and paces, and keeps the type
          const kind = chosen.hardType[d], v = qVariant;
          const mkC = (k: number) => (kind === 'intervals' ? intervals(date, k, phase, ctx, v) : kind === 'tempo' ? tempo(date, k, phase, ctx) : threshold(date, k, phase, ctx, v, phase === 'base'));
          s = mkC(qKm);
          rebuild.set(s.id, mkC);
        } else if (oneQ && role === 'q2') s = easyRun(date, split.easyKm, phase, ctx, { strides: !cutback && r.strides });
        else if (!keepTypes && phase === 'base' && role === 'q2') s = easyRun(date, split.easyKm, phase, ctx, { strides: r.strides });
        else {
          const v = qVariant, ww = w;
          const hs = hxStage;
          const mkHx = (k: number) => (role === 'q1' ? (cutback || hx!.keepRunning ? threshold(date, k, phase, ctx, v) : hxRepeats(date, k, phase, ctx, hs)) : hx!.keepRunning && ww % 2 === 0 ? hxRepeats(date, k, phase, ctx, hs) : hxCompromised(date, k, phase, ctx, hs));
          const mkQ = (k: number) => (hx && k >= 5 && phase !== 'base' ? mkHx(k) : k < 5 ? easyRun(date, Math.max(2.5, k), phase, ctx, { strides: true, why: 'Your weekly volume is still small, so this is an easy run with a few relaxed strides instead of a hard session. Hard sessions come in as your weekly distance grows.' }) : phase === 'base' ? (ww % 2 === 0 ? threshold(date, k, phase, ctx, 0, true) : hills(date, k, phase, ctx))
            : phase === 'build' || cutback ? (role === 'q1' ? threshold(date, k, phase, ctx, v) : intervals(date, k, phase, ctx, v))
            : role === 'q1' ? (r.dc === 'HM' || r.dc === 'M' ? threshold(date, k, phase, ctx, v) : intervals(date, k, phase, ctx, v)) : racePace(date, k, phase, ctx));
          s = mkQ(qKm);
          rebuild.set(s.id, mkQ);
        }
      } else {
        // Named from what actually came the day before, not from the template (race week has no long run)
        const afterLong = prevSession?.type === 'long' && prevSession.date === ymd(addDays(dateD, -1));
        const km = dayPhase === 'taper' ? Math.max(3, easyBase * taperScale) : split.easyKm * (easyWeight.get(d) ?? 1);
        const mkEasy = (k: number) => easyRun(date, k, dayPhase, ctx, { title: afterLong ? 'Easy run (after the long run)' : undefined });
        s = mkEasy(km);
        rebuild.set(s.id, mkEasy);
      }
      if (!rebuild.has(s.id) && s.type === 'easy' && dayPhase !== 'taper') {
        const strides = s.steps.some((x) => x.kind === 'strides'), title = s.title;
        rebuild.set(s.id, (k: number) => easyRun(date, k, dayPhase, ctx, { strides, title }));
      }
      weekSessions.push(s);
    }
    // Doubles: a second easy run on chosen days (not on rest days, the long run, or in race week)
    for (const x of weekSessions) {
      const dw = weekday(parseYmd(x.date));
      if (r.doubles.includes(dw) && x.type !== 'rest' && x.type !== 'long' && x.type !== 'race' && x.phase !== 'taper') {
        const km = Math.round(Math.min(split.easyKm, caps.easyKm) * 0.8 * 10) / 10;
        if (km >= 4) x.second = { distanceM: Math.round(km * 1000), durationS: Math.round(km * mid(paces.easy)), title: 'Second run: easy', detail: `${km} km easy at ${PR(paces.easy)}, at least 4 hours after the first run` };
      }
    }
    // Strength (update 3, §4): on the days the runner chose, or placed automatically away from hard days. By phase:
    // heavier in base, maintenance in build and peak, light in the taper, none in the last 4 days before the race.
    // Never heavy leg work the day before intervals, threshold or the long run: that day gets core and hips instead.
    {
      const HARD_NEXT = ['threshold', 'vo2max', 'hills', 'tempo', 'long', 'race', 'timetrial'];
      // The next day, also across the week boundary (Sunday before next Monday's session, from the week's roles)
      const next = (x: PlannedSession): Pick<PlannedSession, 'type' | 'title'> | undefined => {
        const n = weekSessions.find((y) => y.date === ymd(addDays(parseYmd(x.date), 1)));
        if (n || weekday(parseYmd(x.date)) !== 6) return n;
        const r0 = roles[0];
        return r0 === 'long' ? { type: 'long', title: 'Long run' } : r0 === 'q1' || r0 === 'q2' ? { type: 'threshold', title: "Monday's hard session" } : undefined;
      };
      const nearRace = (x: PlannedSession) => !!raceDate && daysBetween(parseYmd(x.date), raceDate) <= 3;
      const plan = (x: PlannedSession, only: boolean) => {
        const toRace = raceDate ? daysBetween(parseYmd(x.date), raceDate) : 99;
        const beforeHard = HARD_NEXT.includes(next(x)?.type ?? '');
        const taper = x.phase === 'taper' || toRace <= 10;
        const intensity: Intensity = taper || beforeHard ? 'light' : phase === 'base' ? 'heavy' : 'moderate';
        const routine: Routine = taper ? (strengthN % 2 ? 'mobility' : 'core') : beforeHard ? 'core' : strengthN % 2 ? 'B' : 'A';
        strengthN++;
        const why = taper ? 'Light core and mobility to stay loose before your race, without tiring your legs.'
          : beforeHard ? `Core and hips only: ${next(x)!.title.toLowerCase()} is tomorrow, so no heavy leg work today.`
          : phase === 'base' ? 'Builds the strength in your legs, hips and core that lets you run more without injury.'
          : 'Keeps the strength you have built while running is the priority.';
        // HYROX: extra work for the hardest stations, on the days with leg work (never the day before a hard session)
        const stationWork = !!hxExtra && !taper && !beforeHard;
        x.strengthPlan = stationWork ? { routine, intensity, why: `${why} With extra work for your hardest HYROX stations.`, extra: hxExtra } : { routine, intensity, why };
        x.strength = `${ROUTINE_TITLE[routine]}${only ? ' (no run today)' : ' after the run'}: ${why}`;
        if (only) Object.assign(x, { title: 'Strength (no run)', focus: 'Strength', purpose: `${why} Treat the day as recovery: stop well before you are tired.` });
      };
      if (r.week) {
        for (const x of weekSessions) {
          const dw = weekday(parseYmd(x.date));
          if (nearRace(x)) continue;
          if (x.title === 'Strength (no run)') plan(x, true);
          else if (chosen.plusStrength[dw] && x.type !== 'rest' && x.type !== 'race') plan(x, false);
        }
      } else if (r.strengthPerWeek > 0) {
        const ok = (x: PlannedSession) => !nearRace(x) && x.type !== 'race';
        const easyFree = weekSessions.filter((x) => ok(x) && (x.type === 'easy' || x.type === 'recovery') && !HARD_NEXT.includes(next(x)?.type ?? ''));
        const restFree = weekSessions.filter((x) => ok(x) && x.type === 'rest' && !HARD_NEXT.includes(next(x)?.type ?? ''));
        const easyBefore = weekSessions.filter((x) => ok(x) && (x.type === 'easy' || x.type === 'recovery') && HARD_NEXT.includes(next(x)?.type ?? ''));
        // The same weekdays as last week where they still fit (update 4): with one session a week, picking a different
        // day each week left gaps of up to 10 days between sessions
        const dow = (x: PlannedSession) => weekday(parseYmd(x.date));
        const good = [...easyFree, ...restFree];
        const kept = good.filter((x) => strengthDows.includes(dow(x)));
        const picks = [...kept, ...good.filter((x) => !kept.includes(x)), ...easyBefore].slice(0, r.strengthPerWeek).sort((a, b) => a.date.localeCompare(b.date));
        for (const x of picks) plan(x, x.type === 'rest');
        if (picks.length) strengthDows = picks.map(dow);
      }
    }
    // No run may be more than 35% of what the week actually adds up to (training weeks with 3+ runs)
    const runsIn = () => weekSessions.filter((x) => x.type !== 'rest');
    // (a first week that starts mid-week only shows part of the week, so it is left alone)
    if (ws >= start && !runsIn().some((x) => x.phase === 'taper' || x.type === 'race') && runsIn().length >= 3) {
      const totalKm = () => runsIn().reduce((x, y) => x + weekShareM(y), 0) / 1000;
      const tooBig = () => runsIn().filter((x) => !x.hyrox?.kind.startsWith('sim') && x.distanceM / 1000 > totalKm() * MAX_SHARE).sort((a, b) => b.distanceM - a.distanceM);
      for (let pass = 0; pass < 8; pass++) {
        const total = totalKm();
        const big = tooBig().find((x) => rebuild.has(x.id));
        if (!big) break;
        const others = total - big.distanceM / 1000;
        const next = rebuild.get(big.id)!(Math.floor((others * 0.34) / 0.66 * 10) / 10);
        rebuild.set(next.id, rebuild.get(big.id)!);
        weekSessions[weekSessions.indexOf(big)] = next;
      }
      // A session with a fixed minimum (reps plus warm-up) can still be too big for a small week on few days. It
      // then becomes an easy run of exactly the distance the week allows, so a plan can always be built.
      for (let pass = 0; pass < 6; pass++) {
        const big = tooBig()[0];
        if (!big) break;
        const others = totalKm() - big.distanceM / 1000;
        const km = Math.max(2.5, Math.floor((others * 0.34) / 0.66 * 10) / 10);
        const next = { ...easyRun(big.date, km, big.phase, ctx, { strides: big.type !== 'long', why: 'This week is small, so the planned hard session would have been too large a share of it. An easy run with a few relaxed strides takes its place.' }), strengthPlan: big.strengthPlan };
        weekSessions[weekSessions.indexOf(big)] = next;
      }
    }
    for (const x of weekSessions) { weekKm += (x.distanceM + (x.second?.distanceM ?? 0)) / 1000; sessions.push(x); }
    qVariant++;
    if (hx && (phase === 'build' || phase === 'peak') && !cutback) { hxStage++; hxBuildWeeks++; }
    if (weekKm > 0 || w === 0) weeks.push({ start: ymd(ws), targetKm: Math.round(ws < start ? vol : weekKm), phase, cutback });
    const last = phases[phases.length - 1];
    const pEnd = ymd(addDays(ws, 6) > end ? end : addDays(ws, 6));
    const pStart = ymd(ws < start ? start : ws);
    if (taperStart && addDays(ws, 6) >= taperStart && ws < taperStart && phase !== 'taper') {
      // a week that changes into the taper part-way through
      const pre = ymd(addDays(taperStart, -1));
      if (last && last.phase === phase) last.end = pre; else if (pre >= pStart) phases.push({ phase, start: pStart, end: pre });
      phases.push({ phase: 'taper', start: ymd(taperStart), end: pEnd });
    } else if (last && last.phase === phase) last.end = pEnd;
    else phases.push({ phase, start: pStart, end: pEnd });
  }

  const plan: Plan = {
    id: uid(), raceId: hx ? undefined : race?.id, ...(hx ? { goal: 'hyrox' as const } : {}), createdAt: new Date().toISOString(), startDate: ymd(start), endDate: ymd(end), phases, sessions, weeks,
    changes: [{ id: 'built', at: new Date().toISOString(), reason: 'rebuilt', summary: describePlan(r, roles, race, input, totalWeeks, caps) + (hx ? ` This is a HYROX plan: about ${Math.round(HX_VOLUME * 100)}% of the running of a road plan, ${sessions.some((x) => x.hyrox?.kind === 'compromised') ? 'with 1 km repeats and compromised runs' : 'with running'} at your HYROX run pace of ${P(mid(hx.pace))}/km (${hx.goalS ? `your goal of ${duration(hx.goalS)} with ${Math.round(hx.runShare * 100)}% of it running` : 'a little slower than threshold, until you set a goal time'}, never faster than your threshold pace)${sessions.some((x) => x.hyrox?.kind === 'sim_half') ? ', a half simulation every third build week' : ''}${sessions.some((x) => x.hyrox?.kind === 'sim_full') ? ', one full simulation 3 to 4 weeks out' : ''}, and strength with extra work for ${hx.hardest.map((k) => k.replace(/_/g, ' ')).join(', ')}.${hx.keepRunning ? ' You also have a running race within 8 weeks, so one threshold run a week is kept.' : ''}` : goal.keepHyrox ? ' You also train for HYROX, so one strength session a week includes your hardest stations.' : '') }],
  };
  // HYROX taper: the last easy run 2 to 4 days out becomes a light station run-through
  if (hx && raceDate) {
    const c = sessions.filter((x) => x.type === 'easy' && (() => { const d = daysBetween(parseYmd(x.date), raceDate); return d >= 2 && d <= 5; })()).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (c) Object.assign(c, { title: 'Easy run and light station run-through', hyrox: { kind: 'run_through' as const }, purpose: 'An easy run, then walk through each station once at a light effort: a few pulls on the SkiErg and rower, one short sled length, 10 lunges, 10 wall balls. Rehearse the movements, do not train them.' });
  }
  // B and C races inside the plan: the race replaces that day; a B race gets two easy days before; the day after is easy or rest
  for (const o of input.otherRaces ?? []) {
    const i = sessions.findIndex((x) => x.date === o.date);
    if (i < 0 || sessions[i].type === 'race') continue;
    const sess = raceDay(o.date, o, paces);
    sess.phase = sessions[i].phase;
    sess.purpose = o.priority === 'B' ? 'A tune-up race: run it hard, it is great practice and a fitness check.' : 'A training race: treat it as a hard session, not an all-out effort.';
    sessions[i] = sess;
    const soften = (j: number, why: string) => {
      const x = sessions[j];
      if (!x || x.type === 'rest' || x.type === 'race' || !HARD_TYPES.includes(x.type)) return;
      sessions[j] = { ...easyRun(x.date, Math.min(10, x.distanceM / 1000 * 0.7), x.phase, { paces, race }, { why }), id: x.id };
    };
    soften(i - 1, `Easy the day before ${o.name}.`);
    if (o.priority === 'B') soften(i - 2, `Easy two days before ${o.name}, a short taper for a tune-up race.`);
    soften(i + 1, `Easy the day after ${o.name}, to recover.`);
  }

  // 3) Sanity checks: refuse to hand over a plan that breaks the rules
  // A week the runner chose may put hard days next to each other: that is a warning they saw, not a refusal
  const issues = validatePlan(plan, paces).filter((x) => !(r.week && /two hard days back to back/.test(x)));
  if (issues.length) return { ok: false, problem: { kind: 'invalid', message: 'The plan did not pass its safety checks, so it was not saved. Please try different settings.', issues, options: [] } };
  return { ok: true, plan, warnings };
}

function describePlan(r: Resolved, roles: Role[], race: Race | undefined, input: GenInput, weeks: number, caps: Caps): string {
  const dayOf = (role: Role) => roles.map((x, i) => (x === role ? i : -1)).filter((i) => i >= 0).map((i) => DAYS_PLURAL[i]);
  const q = [...dayOf('q1'), ...dayOf('q2')];
  const easy = dayOf('easy');
  // The long-run days as they are in the week (a week the runner chose may put it on another day than the setting)
  const long = dayOf('long');
  const vol = r.peakKm > r.weeklyKm ? `starting at ${r.weeklyKm} km a week and building to about ${r.peakKm} km` : `holding about ${r.weeklyKm} km a week`;
  return `Built a ${weeks}-week plan${race ? ` for ${race.name}${race.id === 'hyrox' ? '' : ` (${raceWord(race.distanceM)})`} on ${parseYmd(race.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}, ${vol}, on ${r.daysPerWeek} days. Long runs on ${long.length ? long.join(' and ') : DAYS_PLURAL[r.longDay]} (up to ${Math.round(caps.longKm)} km)${q.length ? `, quality on ${q.join(' and ')}` : ''}${easy.length ? `, easy runs on ${easy.join(', ')}` : ''}. ${input.pacesFrom ? `Paces are based on ${input.pacesFrom}.` : ''} ${race ? (weeks * 7 > TAPER_DAYS[r.dc] + 6 ? `The taper starts ${TAPER_DAYS[r.dc]} days before race day.` : 'The race is close, so this is a taper: short, easy running to arrive fresh.') : ''}`.replace(/\s+\./g, '.').trim();
}

// ---------------------------------------------------------------------------
/** Rules every generated plan must meet. Returns plain-English problems (empty when the plan is sound). */
export function validatePlan(plan: Plan, paces: TrainingPaces): string[] {
  const out: string[] = [];
  const byWeek = new Map<string, PlannedSession[]>();
  for (const s of plan.sessions) { const k = ymd(startOfWeek(parseYmd(s.date))); byWeek.set(k, [...(byWeek.get(k) ?? []), s]); }
  for (const s of plan.sessions) {
    if (s.type === 'rest' || s.type === 'runwalk' || s.type === 'timetrial') continue;
    const tag = `${s.date} ${s.title}`;
    if ((s.type === 'easy' || s.type === 'recovery' || s.type === 'long') && s.paceTarget && s.paceTarget.minSPerKm <= paces.marathon[1]) out.push(`${tag}: easy pace is not slower than marathon pace`);
    if ((s.type === 'easy' || s.type === 'recovery') && s.durationS > 2 * 3600) out.push(`${tag}: an easy run over 2 hours`);
    if (s.steps.every((x) => x.km !== undefined)) {
      const km = s.steps.reduce((x, y) => x + (y.km ?? 0), 0);
      const t = s.steps.reduce((x, y) => x + (y.durationS ?? 0), 0);
      if (Math.abs(km * 1000 - s.distanceM) > 150) out.push(`${tag}: distance does not match its steps`);
      if (Math.abs(t - s.durationS) > Math.max(30, s.durationS * 0.02)) out.push(`${tag}: duration does not match its steps`);
    }
    const z = s.hrZones ?? [];
    if ((s.type === 'easy' || s.type === 'recovery') && z.some((x) => x > 2)) out.push(`${tag}: labelled easy but has hard zones`);
    if (s.type === 'threshold' && !z.includes(4)) out.push(`${tag}: threshold without Z4`);
    if (s.type === 'vo2max' && !z.some((x) => x >= 4)) out.push(`${tag}: intervals without hard zones`);
  }
  for (const [wk, list] of byWeek) {
    const runs = list.filter((s) => s.type !== 'rest');
    const total = runs.reduce((x, s) => x + weekShareM(s), 0);
    // The share rule applies to full training weeks: not taper or race weeks (deliberately small),
    // and not a first week that starts part-way through (its earlier days are not in the plan)
    const partialFirst = wk < plan.startDate;
    if (partialFirst || runs.length < 3 || total === 0 || runs.some((s) => s.type === 'race' || s.phase === 'taper')) continue;
    for (const s of runs) if (!s.hyrox?.kind.startsWith('sim') && s.distanceM > total * MAX_SHARE + 500) out.push(`${s.date} ${s.title}: ${Math.round(s.distanceM / total * 100)}% of the week of ${wk}`);
  }
  const sorted = [...plan.sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (HARD_TYPES.includes(a.type) && HARD_TYPES.includes(b.type) && daysBetween(parseYmd(a.date), parseYmd(b.date)) === 1) out.push(`${a.date} and ${b.date}: two hard days back to back`);
  }
  return out;
}
