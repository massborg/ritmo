// Weight on every strength set (update 4, task 4b), and free strength with saved workouts (task 4).
// - every set records reps (or time), load in kg, how it was loaded, and effort
// - double progression: when all sets are at effort 7 or less, add reps up to the top of the range, then add load
//   and drop back to the bottom of the range
// - a session's volume (kg × reps), best set and estimated 1-rep max (Epley)
// - saved workouts ("templates"), up to 2 starred as favourites
import { exById, type Exercise } from './strength';

export type LoadType = 'added' | 'bodyweight' | 'bodyweight_plus' | 'band';
export const LOAD_LABEL: Record<LoadType, string> = { added: 'Added weight', bodyweight: 'Bodyweight', bodyweight_plus: 'Bodyweight + load', band: 'Band' };
export type Band = 'light' | 'medium' | 'heavy';

/** One logged set. `load` is kg (the added weight; per side when `perSide`). */
export interface SetLog { reps?: number; /** 'm': reps holds metres (a carry or a sled) */ unit?: 'm'; seconds?: number; load?: number; loadType?: LoadType; band?: Band; perSide?: boolean; /** Effort 5–10 */ effort?: number }

export type WeightUnit = 'kg' | 'lb';
const LB = 2.2046226218;
/** Stored in kg, shown in the runner's unit: lb to the nearest 0.5 */
export const toUnit = (kg: number, u: WeightUnit) => (u === 'lb' ? Math.round(kg * LB * 2) / 2 : Math.round(kg * 100) / 100);
export const fromUnit = (v: number, u: WeightUnit) => (u === 'lb' ? Math.round((v / LB) * 100) / 100 : v);
export const showLoad = (kg: number | undefined, u: WeightUnit) => (kg ? `${toUnit(kg, u)} ${u}` : '');

/** How the exercise is loaded by default */
export const defaultLoadType = (e: Pick<Exercise, 'equipment' | 'loadType'>): LoadType => e.loadType ?? (e.equipment === 'none' ? 'bodyweight' : 'added');
/** The step when load goes up: 2.5 kg for two-legged lower-body lifts, 1 kg for one-sided and dumbbell moves */
export const loadStep = (e: Pick<Exercise, 'perSide' | 'equipment' | 'pattern'>): number => (e.perSide || e.equipment === 'light' && !['squat', 'hinge', 'bridge'].includes(e.pattern) ? 1 : 2.5);
/** The rep range an exercise works in: from its usual reps to 4 more ("8 to 12") */
export const repRange = (e: Pick<Exercise, 'reps'>): [number, number] => { const lo = e.reps ?? 8; return [lo, lo + 4]; };

export interface NextTarget { reps?: number; seconds?: number; load?: number; note: string; change: 'reps' | 'load' | 'time' | 'repeat' | 'first' }

/**
 * Double progression for one exercise, from its last session. All sets done at effort 7 or less: one more rep, up to
 * the top of the range; at the top, add load and go back to the bottom. Otherwise the same again. Holds add 5 s.
 * An exercise done without load stays on reps (the harder version comes with the next block).
 */
export function doubleProgression(e: Exercise, last: SetLog[] | undefined, planned: number | undefined, sessionEffort?: number, unit: WeightUnit = 'kg'): NextTarget {
  if (!last?.length) return { reps: e.reps, seconds: e.seconds, note: e.unit === 'm' ? 'First time: a distance you could repeat.' : 'First time: find a weight you could do 2 more reps with.', change: 'first' };
  // A distance (a carry, a sled): the same again, then more load or a little further by feel
  if (e.unit === 'm') { const m = Math.max(...last.map((s) => s.reps ?? e.reps ?? 0)), w = Math.max(0, ...last.map((s) => s.load ?? 0)); return { reps: m, load: w || undefined, note: `Same distance again: ${m} m${w ? ` at ${showLoad(w, unit)}` : ''}. Add load or go a little further when it feels easy`, change: 'repeat' }; }
  const top = last.reduce((a, s) => ((s.load ?? 0) > (a.load ?? 0) || (s.load ?? 0) === (a.load ?? 0) && (s.reps ?? 0) < (a.reps ?? 0) ? s : a), last[0]);
  const efforts = last.map((s) => s.effort ?? sessionEffort ?? 6);
  const allDone = last.length >= (planned ?? last.length);
  const easy = allDone && efforts.every((x) => x <= 7);
  const load = top.load ?? 0;
  if (e.seconds || top.seconds) {
    const sec = Math.min(...last.map((s) => s.seconds ?? e.seconds ?? 30));
    return easy ? { seconds: sec + 5, load: load || undefined, note: `+5 s (to ${sec + 5} s)`, change: 'time' } : { seconds: sec, load: load || undefined, note: `Same again: ${sec} s`, change: 'repeat' };
  }
  const reps = Math.min(...last.map((s) => s.reps ?? e.reps ?? 8));
  const [lo, hi] = repRange(e);
  const kg = (v: number) => showLoad(v, unit);
  if (!easy) return { reps, load: load || undefined, note: `Same again: ${reps} reps${load ? ` at ${kg(load)}` : ''}${allDone ? ' (the last session felt hard)' : ' (some sets were missed)'}`, change: 'repeat' };
  if (reps < hi) return { reps: reps + 1, load: load || undefined, note: `+1 rep: ${reps + 1} reps${load ? ` at ${kg(load)}` : ''} for all sets`, change: 'reps' };
  if (load > 0) { const next = Math.round((load + loadStep(e)) * 100) / 100; return { reps: lo, load: next, note: `Add load: ${kg(next)} for ${lo} reps (you reached ${hi} reps at ${kg(load)})`, change: 'load' }; }
  // A band has no kilograms: at the top of the range the next step is a heavier band, not "no load"
  if (top.loadType === 'band') {
    const band = top.band ?? 'medium', up = band === 'light' ? 'medium' : band === 'medium' ? 'heavy' : undefined;
    return { reps: hi, note: up ? `${hi} reps reached with the ${band} band: try the ${up} band next time` : `${hi} reps reached with the heavy band: the harder version comes with the next block`, change: 'repeat' };
  }
  return { reps: hi, note: `${hi} reps reached with no load: add a little weight, or the harder version comes with the next block`, change: 'repeat' };
}

/** Estimated 1-rep max (Epley): kg × (1 + reps / 30) */
export const epley = (kg: number, reps: number) => (reps <= 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10);

export interface ExerciseSummary { volumeKg: number; best?: { load: number; reps: number; e1rm: number }; text: string }
/** One exercise in a session: "2 × 12 · 18 kg", its volume and best set */
export function exerciseSummary(sets: SetLog[], unit: WeightUnit = 'kg'): ExerciseSummary {
  const volumeKg = sets.reduce((a, s) => a + (s.load ?? 0) * (s.reps ?? 0) * (s.perSide ? 2 : 1), 0);
  const loaded = sets.filter((s) => s.load && s.reps);
  const best = loaded.length ? loaded.map((s) => ({ load: s.load!, reps: s.reps!, e1rm: epley(s.load!, s.reps!) })).sort((a, b) => b.e1rm - a.e1rm)[0] : undefined;
  const first = sets[0] ?? {};
  const same = sets.every((s) => s.reps === first.reps && s.load === first.load && s.seconds === first.seconds);
  const one = (s: SetLog) => `${s.seconds ? `${s.seconds} s` : s.unit === 'm' && s.reps ? `${s.reps} m` : s.reps ?? '–'}${s.load ? ` · ${showLoad(s.load, unit)}` : ''}`;
  const text = !sets.length ? 'No sets' : same ? `${sets.length} × ${one(first)}` : sets.map(one).join(', ');
  return { volumeKg: Math.round(volumeKg), best, text };
}
/** Volume in the runner's unit, as a whole number that agrees with the weights shown: in lb each set's weight is
 *  rounded as it is displayed (to 0.5 lb) before it is multiplied by its reps */
export function showVolume(sets: SetLog[], unit: WeightUnit = 'kg'): string {
  const v = sets.reduce((a, s) => a + (s.load ? toUnit(s.load, unit) : 0) * (s.reps ?? 0) * (s.perSide ? 2 : 1), 0);
  return `${Math.round(v)} ${unit}`;
}
/** A whole session: total volume, and the best set across its exercises */
export function sessionSummary(exercises: { id: string; name: string; sets: SetLog[] }[]): { volumeKg: number; best?: { name: string; load: number; reps: number; e1rm: number } } {
  let best: { name: string; load: number; reps: number; e1rm: number } | undefined;
  let volumeKg = 0;
  for (const x of exercises) {
    const s = exerciseSummary(x.sets);
    volumeKg += s.volumeKg;
    if (s.best && (!best || s.best.e1rm > best.e1rm)) best = { name: x.name, ...s.best };
  }
  return { volumeKg, best };
}

// ---------------------------------------------------------------- Saved workouts

/** `restS`: rest between this exercise's sets; `restAfterS`: rest before the next exercise (update 5, U7). Both override the workout's. */
export interface TemplateExercise { exerciseId: string; sets: number; reps?: number; seconds?: number; weightKg?: number; restS?: number; restAfterS?: number }
export interface StrengthTemplate { id: string; name: string; exercises: TemplateExercise[]; favourite: boolean; createdAt: string; lastUsedAt?: string; /** Rest between sets and between exercises, saved with the workout (update 5, U7) */ restBetweenSetsS?: number; restBetweenExercisesS?: number }
export const MAX_FAVOURITES = 2;

/** Favourites first, then the most recently used */
export const sortTemplates = (list: StrengthTemplate[]) => [...list].sort((a, b) => Number(b.favourite) - Number(a.favourite) || (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt));
/** Star or unstar; at most 2 favourites (starring a third does nothing, and says so) */
export function toggleFavourite(list: StrengthTemplate[], id: string): { list: StrengthTemplate[]; full: boolean } {
  const t = list.find((x) => x.id === id);
  if (!t) return { list, full: false };
  if (!t.favourite && list.filter((x) => x.favourite).length >= MAX_FAVOURITES) return { list, full: true };
  return { list: list.map((x) => (x.id === id ? { ...x, favourite: !x.favourite } : x)), full: false };
}
/** "6 exercises · about 40 min" */
export function templateLine(t: Pick<StrengthTemplate, 'exercises'>): string {
  const secs = t.exercises.reduce((a, x) => { const e = exById.get(x.exerciseId); return a + x.sets * ((x.seconds ?? (x.reps ?? 10) * 3) + (x.restS ?? 60)) * (e?.perSide ? 1.6 : 1); }, 0);
  const n = t.exercises.length;
  return `${n} exercise${n === 1 ? '' : 's'} · about ${Math.max(5, Math.round(secs / 60 / 5) * 5)} min`;
}
/** A name not used yet: "Legs", "Legs 2", "Legs 3" */
/** A workout saved without a name: "Strength session 1", then 2, 3… (the next number not in use) */
export function nextSessionName(list: StrengthTemplate[]): string {
  const names = new Set(list.map((x) => x.name.toLowerCase()));
  for (let i = 1; ; i++) if (!names.has(`strength session ${i}`)) return `Strength session ${i}`;
}
/** A saved workout put on a day (update 5, U3): it shows on Training that day with Start */
export interface ScheduledWorkout { id: string; templateId: string; date: string }
/** The saved workouts planned for a day, with whether one was already done (a session logged from it that day) */
export function scheduledOn(strength: { templates?: StrengthTemplate[]; scheduled?: ScheduledWorkout[] } | undefined, log: { kind: string; date: string; strength?: { templateId?: string } }[] | undefined, date: string): { id: string; template: StrengthTemplate; done: boolean }[] {
  return (strength?.scheduled ?? []).filter((s) => s.date === date).map((s) => ({ s, template: (strength?.templates ?? []).find((t) => t.id === s.templateId) })).filter((x): x is { s: ScheduledWorkout; template: StrengthTemplate } => !!x.template)
    .map((x) => ({ id: x.s.id, template: x.template, done: (log ?? []).some((e) => e.kind === 'strength' && e.date === date && e.strength?.templateId === x.template.id) }));
}
export function freeName(list: StrengthTemplate[], base: string): string {
  const names = new Set(list.map((x) => x.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

/** Filters in the builder */
export type ExGroup = 'legs' | 'hips' | 'core' | 'upper' | 'plyo' | 'hyrox';
export const GROUP_LABEL: Record<ExGroup, string> = { legs: 'Legs', hips: 'Hips', core: 'Core', upper: 'Upper', plyo: 'Plyo', hyrox: 'HYROX' };
export function groupsOf(e: Exercise): ExGroup[] {
  const g = new Set<ExGroup>(e.groups ?? []);
  if (['squat', 'lunge', 'hinge', 'step', 'calf'].includes(e.pattern) && !e.groups?.includes('upper')) g.add('legs');
  if (e.pattern === 'bridge' || e.pattern === 'clam' || e.muscles.includes('hips') || e.muscles.includes('glutes') && e.pattern !== 'squat' && e.pattern !== 'lunge') g.add('hips');
  if (['plank', 'side-plank', 'core-floor'].includes(e.pattern) && !e.groups?.includes('upper') || e.muscles.includes('core')) g.add('core');
  if (e.pattern === 'hop' || e.tags.includes('jumping')) g.add('plyo');
  return [...g];
}

// ---------------------------------------------------------------- History, from the log

interface Logged { date: string; at?: string; kind: string; strength?: { exercises: { id: string; name: string; sets: SetLog[] }[] } }
/** The sets of an exercise the last time it was done (before `before`, a YYYY-MM-DD, when given) */
export function lastSets(log: Logged[] | undefined, exerciseId: string, before?: string): { date: string; sets: SetLog[] } | undefined {
  const hits = (log ?? []).filter((e) => e.kind === 'strength' && (!before || e.date < before) && e.strength?.exercises.some((x) => x.id === exerciseId && x.sets.length))
    .sort((a, b) => (b.date + (b.at ?? '')).localeCompare(a.date + (a.at ?? '')));
  const e = hits[0];
  return e ? { date: e.date, sets: e.strength!.exercises.find((x) => x.id === exerciseId)!.sets } : undefined;
}
/** Is there already a logged session of this exercise on a later day? Then a back-dated log is history only. */
export const newerLogged = (log: Logged[] | undefined, exerciseId: string, date: string): boolean =>
  (log ?? []).some((e) => e.kind === 'strength' && e.date > date && !!e.strength?.exercises.some((x) => x.id === exerciseId && x.sets.length));
/** "3 × 8 at 10 kg" */
export function lastLine(sets: SetLog[], unit: WeightUnit = 'kg'): string {
  const f = sets[0] ?? {};
  const same = sets.every((s) => s.reps === f.reps && s.seconds === f.seconds && s.load === f.load);
  const dose = (s: SetLog) => (s.seconds ? `${s.seconds} s` : `${s.reps ?? '–'}`);
  return same ? `${sets.length} × ${dose(f)}${f.load ? ` at ${showLoad(f.load, unit)}` : ''}` : sets.map((s) => `${dose(s)}${s.load ? ` at ${showLoad(s.load, unit)}` : ''}`).join(', ');
}
export interface HistoryPoint { date: string; volumeKg: number; topLoad?: number; reps?: number; seconds?: number; e1rm?: number; text: string; /** "1650 lb", in the runner's unit */ volume: string }
/** Every session of an exercise, oldest first, for its history chart */
export function historyOf(log: Logged[] | undefined, exerciseId: string, unit: WeightUnit = 'kg'): HistoryPoint[] {
  return (log ?? []).filter((e) => e.kind === 'strength' && e.strength?.exercises.some((x) => x.id === exerciseId && x.sets.length))
    .sort((a, b) => (a.date + (a.at ?? '')).localeCompare(b.date + (b.at ?? '')))
    .map((e) => {
      const sets = e.strength!.exercises.find((x) => x.id === exerciseId)!.sets;
      const s = exerciseSummary(sets, unit);
      return { date: e.date, volumeKg: s.volumeKg, topLoad: Math.max(0, ...sets.map((x) => x.load ?? 0)) || undefined, reps: Math.max(0, ...sets.map((x) => x.reps ?? 0)) || undefined, seconds: Math.max(0, ...sets.map((x) => x.seconds ?? 0)) || undefined, e1rm: s.best?.e1rm, text: s.text, volume: showVolume(sets, unit) };
    });
}
/** A workout as a template's exercise list, from what was done */
export const asTemplateExercises = (exercises: { id: string; sets: SetLog[]; planned?: number }[]): TemplateExercise[] =>
  exercises.map((x) => { const f = x.sets[0] ?? {}; return { exerciseId: x.id, sets: Math.max(x.planned ?? 0, x.sets.length) || 1, reps: f.seconds ? undefined : f.reps, seconds: f.seconds, weightKg: f.load }; });
