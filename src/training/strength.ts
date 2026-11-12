// Strength for runners (update 3, §4, §5, §8). A small library of runner-specific exercises, the A and B routines,
// core and mobility, each in home (no equipment), home (light weights) and gym versions. A planned strength session
// stores only which routine, how hard and why; the exercise list is worked out when shown, from the library and the
// runner's choices (equipment, "Always use this instead", "Never give me…"), so a swap applies to every future
// session. Edits to one session's list are kept on that session only.

export type Equipment = 'none' | 'light' | 'gym';
export type Pattern = 'squat' | 'lunge' | 'hinge' | 'bridge' | 'calf' | 'plank' | 'side-plank' | 'core-floor' | 'step' | 'hop' | 'clam' | 'mobility';
export type ExTag = 'jumping' | 'gym' | 'floor' | 'balance' | 'knee-load' | 'weights';
export interface Exercise {
  id: string; name: string; pattern: Pattern; muscles: string[]; equipment: Equipment;
  /** Default dose: sets and reps, or seconds held */
  sets: number; reps?: number; seconds?: number; perSide?: boolean;
  load?: string; cues: string[]; tags: ExTag[];
}

export const EXERCISES: Exercise[] = [
  // Legs: squat and lunge patterns
  { id: 'bw-squat', name: 'Body-weight squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: 'none', sets: 3, reps: 12, cues: ['Sit back, knees over toes', 'Chest up, heels down'], tags: ['knee-load'] },
  { id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: 'light', sets: 3, reps: 10, load: 'a dumbbell or kettlebell you can lift 12 times', cues: ['Hold the weight at your chest', 'Push the floor away'], tags: ['knee-load', 'weights'] },
  { id: 'back-squat', name: 'Barbell back squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: 'gym', sets: 3, reps: 6, load: 'about 75% of your best, 2 reps in reserve', cues: ['Brace before each rep', 'Drive up through the whole foot'], tags: ['knee-load', 'gym', 'weights'] },
  { id: 'wall-sit', name: 'Wall sit', pattern: 'squat', muscles: ['quads'], equipment: 'none', sets: 3, seconds: 40, cues: ['Knees at 90 degrees', 'Back flat on the wall'], tags: ['knee-load'] },
  { id: 'split-squat', name: 'Split squat', pattern: 'lunge', muscles: ['quads', 'glutes'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Back knee straight down', 'Front shin upright'], tags: ['knee-load', 'balance'] },
  { id: 'reverse-lunge', name: 'Reverse lunge', pattern: 'lunge', muscles: ['quads', 'glutes'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Step back softly', 'Push through the front heel'], tags: ['knee-load', 'balance'] },
  { id: 'db-lunge', name: 'Dumbbell reverse lunge', pattern: 'lunge', muscles: ['quads', 'glutes'], equipment: 'light', sets: 3, reps: 8, perSide: true, load: 'light dumbbells', cues: ['Weights by your sides', 'Tall torso'], tags: ['knee-load', 'balance', 'weights'] },
  { id: 'bulgarian', name: 'Bulgarian split squat', pattern: 'lunge', muscles: ['quads', 'glutes'], equipment: 'none', sets: 3, reps: 8, perSide: true, load: 'body weight, then dumbbells', cues: ['Back foot on a bench', 'Lower straight down'], tags: ['knee-load', 'balance'] },
  { id: 'step-up', name: 'Step-up', pattern: 'step', muscles: ['quads', 'glutes'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Whole foot on the step', 'Drive up, lower slowly'], tags: ['balance'] },
  { id: 'step-down', name: 'Slow step-down', pattern: 'step', muscles: ['quads'], equipment: 'none', sets: 3, reps: 8, perSide: true, cues: ['3 seconds down', 'Knee tracks over the toes'], tags: ['balance'] },
  { id: 'rfe-weighted', name: 'Weighted rear-foot elevated split squat', pattern: 'lunge', muscles: ['quads', 'glutes'], equipment: 'light', sets: 3, reps: 8, perSide: true, load: 'dumbbells, 2 reps in reserve', cues: ['Back foot on a bench', 'Weights by your sides'], tags: ['knee-load', 'balance', 'weights'] },
  // Hinge and posterior chain
  { id: 'sl-rdl', name: 'Single-leg Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes'], equipment: 'none', sets: 3, reps: 8, perSide: true, cues: ['Hips square', 'Long line from head to heel'], tags: ['balance'] },
  { id: 'db-rdl', name: 'Dumbbell Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes'], equipment: 'light', sets: 3, reps: 10, load: 'dumbbells you can lift 12 times', cues: ['Push the hips back', 'Weights close to the legs'], tags: ['weights'] },
  { id: 'trap-deadlift', name: 'Trap-bar deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes', 'back'], equipment: 'gym', sets: 3, reps: 5, load: 'heavy, 2 reps in reserve', cues: ['Brace, then stand up', 'Bar path straight'], tags: ['gym', 'weights'] },
  { id: 'glute-bridge', name: 'Glute bridge', pattern: 'bridge', muscles: ['glutes', 'hamstrings'], equipment: 'none', sets: 3, reps: 15, cues: ['Squeeze at the top', 'Ribs down'], tags: ['floor'] },
  { id: 'sl-bridge', name: 'Single-leg glute bridge', pattern: 'bridge', muscles: ['glutes', 'hamstrings'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Hips level', 'Push through the heel'], tags: ['floor'] },
  { id: 'sl-hip-thrust', name: 'Single-leg hip thrust (shoulders on a sofa)', pattern: 'bridge', muscles: ['glutes', 'hamstrings'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Shoulders on the sofa edge', 'Drive through the heel'], tags: [] },
  { id: 'hip-thrust', name: 'Hip thrust', pattern: 'bridge', muscles: ['glutes'], equipment: 'gym', sets: 3, reps: 8, load: 'barbell, 2 reps in reserve', cues: ['Shoulders on a bench', 'Chin tucked'], tags: ['gym', 'weights'] },
  // Calves and feet
  { id: 'calf-raise', name: 'Calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'none', sets: 3, reps: 15, cues: ['All the way up', '3 seconds down'], tags: [] },
  { id: 'sl-calf-raise', name: 'Single-leg calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'none', sets: 3, reps: 12, perSide: true, cues: ['Hold a wall for balance', 'Slow on the way down'], tags: ['balance'] },
  { id: 'bent-calf', name: 'Bent-knee calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'none', sets: 3, reps: 12, cues: ['Knees slightly bent', 'Heels high'], tags: [] },
  { id: 'weighted-calf', name: 'Weighted calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'light', sets: 3, reps: 12, load: 'a dumbbell in one hand', cues: ['Edge of a step', 'Full range'], tags: ['weights'] },
  { id: 'weighted-sl-calf', name: 'Weighted single-leg calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'light', sets: 3, reps: 10, perSide: true, load: 'a dumbbell in one hand', cues: ['Edge of a step', 'Slow on the way down'], tags: ['balance', 'weights'] },
  { id: 'seated-calf', name: 'Seated calf raise (machine)', pattern: 'calf', muscles: ['calves'], equipment: 'gym', sets: 3, reps: 12, load: 'moderate', cues: ['Pause at the top', 'Slow lower'], tags: ['gym', 'weights'] },
  // Hips
  { id: 'clamshell', name: 'Clamshell', pattern: 'clam', muscles: ['hips', 'glutes'], equipment: 'none', sets: 2, reps: 15, perSide: true, cues: ['Feet together', 'Don\'t roll back'], tags: ['floor'] },
  { id: 'side-leg-raise', name: 'Side-lying leg raise', pattern: 'clam', muscles: ['hips', 'glutes'], equipment: 'none', sets: 2, reps: 15, perSide: true, cues: ['Toes forward', 'Slow and controlled'], tags: ['floor'] },
  { id: 'band-walk', name: 'Banded side walk', pattern: 'clam', muscles: ['hips', 'glutes'], equipment: 'light', sets: 2, reps: 12, perSide: true, load: 'a light band above the knees', cues: ['Stay low', 'Feet never touch'], tags: [] },
  // Core
  { id: 'plank', name: 'Plank', pattern: 'plank', muscles: ['core'], equipment: 'none', sets: 3, seconds: 40, cues: ['Straight line', 'Breathe'], tags: ['floor'] },
  { id: 'side-plank', name: 'Side plank', pattern: 'side-plank', muscles: ['core', 'hips'], equipment: 'none', sets: 2, seconds: 30, perSide: true, cues: ['Hips high', 'Stack the shoulders'], tags: ['floor'] },
  { id: 'side-plank-lift', name: 'Side plank with leg lift', pattern: 'side-plank', muscles: ['core', 'hips'], equipment: 'none', sets: 2, seconds: 30, perSide: true, cues: ['Hips high', 'Lift the top leg slowly'], tags: ['floor'] },
  { id: 'dead-bug', name: 'Dead bug', pattern: 'core-floor', muscles: ['core'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Low back on the floor', 'Move slowly'], tags: ['floor'] },
  { id: 'bird-dog', name: 'Bird dog', pattern: 'core-floor', muscles: ['core', 'glutes'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Reach long', 'Hips level'], tags: ['floor'] },
  { id: 'pallof', name: 'Pallof press', pattern: 'plank', muscles: ['core'], equipment: 'light', sets: 3, reps: 10, perSide: true, load: 'a band or cable', cues: ['Press straight out', 'Don\'t let it turn you'], tags: [] },
  { id: 'standing-march', name: 'Standing knee drive hold', pattern: 'step', muscles: ['core', 'hips'], equipment: 'none', sets: 3, seconds: 20, perSide: true, cues: ['Thigh level', 'Stand tall'], tags: ['balance'] },
  // Plyometrics
  { id: 'pogo', name: 'Pogo hops', pattern: 'hop', muscles: ['calves', 'achilles'], equipment: 'none', sets: 3, reps: 20, cues: ['Stiff ankles', 'Quick contacts'], tags: ['jumping'] },
  { id: 'skater', name: 'Skater bounds', pattern: 'hop', muscles: ['glutes', 'hips'], equipment: 'none', sets: 3, reps: 8, perSide: true, cues: ['Land softly', 'Stick the landing'], tags: ['jumping', 'balance'] },
  // Mobility
  { id: 'leg-swings', name: 'Leg swings', pattern: 'mobility', muscles: ['hips', 'hamstrings'], equipment: 'none', sets: 1, reps: 15, perSide: true, cues: ['Relaxed', 'Front to back, then side to side'], tags: [] },
  { id: 'hip-flexor', name: 'Kneeling hip-flexor stretch', pattern: 'mobility', muscles: ['hips'], equipment: 'none', sets: 2, seconds: 40, perSide: true, cues: ['Tuck the pelvis', 'Gentle lean forward'], tags: ['floor'] },
  { id: 'world-greatest', name: 'World\'s greatest stretch', pattern: 'mobility', muscles: ['hips', 'hamstrings', 'back'], equipment: 'none', sets: 2, reps: 5, perSide: true, cues: ['Long lunge', 'Rotate to the ceiling'], tags: ['floor'] },
  { id: 'ankle-rock', name: 'Ankle rocks', pattern: 'mobility', muscles: ['calves', 'ankles'], equipment: 'none', sets: 2, reps: 10, perSide: true, cues: ['Knee over toes', 'Heel down'], tags: [] },
];
export const exById = new Map(EXERCISES.map((e) => [e.id, e]));

/** Why an alternative might suit someone better */
export function altReason(alt: Exercise, from: Exercise): string {
  const r: string[] = [];
  if (alt.equipment === 'none' && from.equipment !== 'none') r.push('no weights needed');
  if (alt.equipment === 'gym' && from.equipment !== 'gym') r.push('heavier, for the gym');
  if (alt.equipment === 'light' && from.equipment === 'none') r.push('adds light weights');
  if (from.tags.includes('balance') && !alt.tags.includes('balance')) r.push('easier on balance');
  if (from.tags.includes('knee-load') && !alt.tags.includes('knee-load')) r.push('knee-friendly');
  if (from.tags.includes('floor') && !alt.tags.includes('floor')) r.push('no floor work');
  if (from.tags.includes('jumping') && !alt.tags.includes('jumping')) r.push('no jumping');
  if (!r.length && alt.seconds && !from.seconds) r.push('a hold instead of reps');
  if (!r.length) r.push(`works the ${alt.muscles.slice(0, 2).join(' and ')} too`);
  return r.join(', ');
}
/** At least 3 alternatives for the same muscles, best matches first, leaving out what the runner never wants */
export function alternatives(id: string, never: string[] = []): { ex: Exercise; reason: string }[] {
  const from = exById.get(id);
  if (!from) return [];
  const score = (e: Exercise) => (e.pattern === from.pattern ? 3 : 0) + e.muscles.filter((m) => from.muscles.includes(m)).length;
  const ranked = EXERCISES.filter((e) => e.id !== id && !excluded(e, never) && e.muscles.some((m) => from.muscles.includes(m)))
    .sort((a, b) => score(b) - score(a)).map((ex) => ({ ex, reason: altReason(ex, from) }));
  // A useful choice: different reasons first (easier on balance, knee-friendly, no weights…), then the closest matches
  const out: typeof ranked = [];
  for (const a of ranked) if (out.length < 5 && !out.some((o) => o.reason === a.reason)) out.push(a);
  for (const a of ranked) if (out.length < 5 && !out.includes(a)) out.push(a);
  return out;
}

/** "Never give me…": exercise ids or categories */
export const NEVER_CATEGORIES: { value: string; label: string }[] = [
  { value: 'tag:jumping', label: 'Jumping' }, { value: 'tag:gym', label: 'Gym equipment' }, { value: 'tag:floor', label: 'Floor work' },
  { value: 'tag:weights', label: 'Weights' }, { value: 'tag:balance', label: 'Balance exercises' }, { value: 'tag:knee-load', label: 'Deep knee bends' },
];
export const excluded = (e: Exercise, never: string[]) => never.includes(e.id) || e.tags.some((t) => never.includes(`tag:${t}`));

export type Routine = 'A' | 'B' | 'core' | 'mobility';
export type Intensity = 'heavy' | 'moderate' | 'light';
/** Slots of each routine: the first exercise that fits the runner's equipment and choices fills each slot */
const SLOTS: Record<Routine, string[][]> = {
  A: [['back-squat', 'goblet-squat', 'bw-squat', 'wall-sit'], ['db-lunge', 'reverse-lunge', 'split-squat', 'step-up'], ['seated-calf', 'weighted-calf', 'sl-calf-raise', 'calf-raise'], ['hip-thrust', 'sl-bridge', 'glute-bridge'], ['pallof', 'plank', 'standing-march'], ['band-walk', 'clamshell', 'side-leg-raise'], ['pogo', 'ankle-rock']],
  B: [['trap-deadlift', 'db-rdl', 'sl-rdl', 'glute-bridge'], ['bulgarian', 'step-up', 'split-squat', 'step-down'], ['bent-calf', 'calf-raise'], ['sl-bridge', 'glute-bridge'], ['side-plank', 'pallof', 'standing-march'], ['dead-bug', 'bird-dog'], ['skater', 'leg-swings']],
  core: [['plank', 'pallof', 'standing-march'], ['side-plank', 'standing-march'], ['dead-bug', 'bird-dog'], ['bird-dog', 'standing-march'], ['glute-bridge', 'clamshell'], ['calf-raise', 'bent-calf']],
  mobility: [['leg-swings'], ['hip-flexor', 'leg-swings'], ['world-greatest', 'ankle-rock'], ['ankle-rock'], ['glute-bridge', 'calf-raise']],
};
export const ROUTINE_TITLE: Record<Routine, string> = { A: "Runner's strength A", B: "Runner's strength B", core: 'Core and hips', mobility: 'Mobility' };
const EQ_RANK: Record<Equipment, number> = { none: 0, light: 1, gym: 2 };

export interface StrengthPlan {
  routine: Routine; intensity: Intensity; why: string;
  /** This session's own list, when the runner edited it (that day only) */
  custom?: StrengthItem[];
}
export interface StrengthItem { id: string; sets: number; reps?: number; seconds?: number }
export interface StrengthPrefs { equipment?: Equipment; swaps?: Record<string, string>; never?: string[]; last?: Record<string, { reps?: number; load?: number; seconds?: number }>; /** What each exercise's last session means for the next (update 3, §9) */ progress?: Record<string, ExProgress> }

/** Sets and reps for the intensity: heavy as planned, moderate one set fewer, light two sets and lighter */
const dose = (e: Exercise, k: Intensity): StrengthItem => ({ id: e.id, sets: k === 'heavy' ? e.sets : k === 'moderate' ? Math.max(2, e.sets - 1) : 2, ...(e.reps ? { reps: k === 'light' ? Math.max(6, Math.round(e.reps * 0.8)) : e.reps } : {}), ...(e.seconds ? { seconds: k === 'light' ? Math.round(e.seconds * 0.75) : e.seconds } : {}) });

/** The exercises of a planned strength session, for this runner */
/** `at`: the block and week of the session, and how many planned sessions in a row were skipped (2: a step back) */
export function resolveStrength(sp: StrengthPlan, p: StrengthPrefs = {}, at?: { block: number; week: BlockWeek; skips?: number }): { title: string; items: (StrengthItem & { ex: Exercise; load?: number; note?: string })[]; minutes: number; equipment: Equipment } {
  const eq = p.equipment ?? 'none', never = p.never ?? [];
  const swap = (id: string) => { const to = p.swaps?.[id]; return to && exById.has(to) && !excluded(exById.get(to)!, never) ? to : id; };
  let items: StrengthItem[];
  if (sp.custom) items = sp.custom.map((x) => ({ ...x, id: swap(x.id) }));
  else {
    const slots = SLOTS[sp.routine].slice(0, sp.intensity === 'light' ? 4 : sp.intensity === 'moderate' ? 5 : 7);
    const used = new Set<string>();
    items = [];
    // A new block brings the harder version of each movement (a step back after two skipped sessions)
    const level = at ? Math.max(1, at.block - ((at.skips ?? 0) >= 2 ? 1 : 0)) : 1;
    const fits = (e?: Exercise) => !!e && EQ_RANK[e.equipment] <= EQ_RANK[eq] && !excluded(e, never);
    for (const slot of slots) {
      const cands = [...slot.map(swap).map((id) => exById.get(id)), ...alternatives(slot[0], never).map((a) => a.ex)].filter(fits) as Exercise[];
      let ex: Exercise | undefined;
      for (const c of cands) {
        const up = exById.get(levelFor(c.id, level, p))!;
        if (!used.has(up.id)) { ex = up; break; }
        if (!used.has(c.id)) { ex = c; break; }
      }
      if (!ex) continue;
      used.add(ex.id);
      items.push(dose(ex, sp.intensity));
    }
  }
  const prog = p.progress ?? {};
  const back = (at?.skips ?? 0) >= 2;
  const full = items.map((x) => {
    const pr = prog[x.id];
    const t = at && !sp.custom ? targetFor(x, back && pr ? { ...pr, next: 'back' } : pr, at.week) : { ...x };
    return { ...t, ex: exById.get(x.id)! };
  }).filter((x) => x.ex);
  // About 45 s a set plus the rest between sets
  const minutes = Math.max(10, Math.round(full.reduce((a, x) => a + x.sets * ((x.seconds ?? (x.reps ?? 10) * 3) + 60) * (x.ex.perSide ? 1.6 : 1), 0) / 60 / 5) * 5);
  const usedEq = full.reduce<Equipment>((m, x) => (EQ_RANK[x.ex.equipment] > EQ_RANK[m] ? x.ex.equipment : m), 'none');
  return { title: ROUTINE_TITLE[sp.routine], items: full, minutes, equipment: usedEq };
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = { none: 'No equipment', light: 'Light weights', gym: 'Gym' };
/** "3 x 12", "3 x 10 each side", "2 x 30 s" */
export const doseText = (x: StrengthItem & { ex?: Exercise }) => `${x.sets} x ${x.seconds ? `${x.seconds} s` : x.reps ?? ''}${x.ex?.perSide ? ' each side' : ''}`;

// ---------------------------------------------------------------- Strength that progresses (update 3, §9)

/** Harder versions of each movement pattern, one step per block */
export const LADDERS: string[][] = [
  ['split-squat', 'bulgarian', 'rfe-weighted'],
  ['reverse-lunge', 'db-lunge', 'bulgarian'],
  ['bw-squat', 'goblet-squat', 'back-squat'],
  ['glute-bridge', 'sl-bridge', 'sl-hip-thrust', 'hip-thrust'],
  ['calf-raise', 'sl-calf-raise', 'weighted-sl-calf'],
  ['plank', 'side-plank', 'side-plank-lift'],
  ['step-down', 'step-up'],
  ['sl-rdl', 'db-rdl', 'trap-deadlift'],
  ['clamshell', 'side-leg-raise', 'band-walk'],
  ['dead-bug', 'bird-dog'],
];
/** The version of an exercise for a block (1 = the first): steps up its ladder, as far as equipment and choices allow */
export function levelFor(id: string, block: number, p: StrengthPrefs = {}): string {
  const ladder = LADDERS.find((l) => l.includes(id));
  if (!ladder || block <= 1) return id;
  const eq = p.equipment ?? 'none', never = p.never ?? [];
  let at = ladder.indexOf(id);
  // One rung per block; a rung the runner can't do (equipment) or doesn't want is skipped for the next one that fits
  for (let k = 1; k < block; k++) {
    const nx = ladder.findIndex((id, i) => i > at && !!exById.get(id) && EQ_RANK[exById.get(id)!.equipment] <= EQ_RANK[eq] && !excluded(exById.get(id)!, never));
    if (nx < 0) break;
    at = nx;
  }
  return ladder[at];
}

export type BlockWeek = 1 | 2 | 3 | 4;
export const WEEK_FOCUS: Record<BlockWeek, { name: string; focus: string }> = {
  1: { name: 'Learn', focus: 'Learn the movements: smooth reps, stop with 3 in reserve.' },
  2: { name: 'Build', focus: 'Build: a couple more reps on each set.' },
  3: { name: 'Load', focus: 'Add load: a little more weight, or a harder version.' },
  4: { name: 'Lighter', focus: 'A lighter week: fewer sets, so you come back fresh.' },
};
/**
 * Which strength block and week a date is in. Blocks follow the plan's own rhythm: a lighter running week (or the
 * taper and race week) is always week 4 of a block, and a new block starts after it.
 */
export function blockOf(weeks: { start: string; cutback?: boolean; phase?: string }[] | undefined, date: string): { block: number; week: BlockWeek } {
  const list = [...(weeks ?? [])].sort((a, b) => a.start.localeCompare(b.start)).filter((w) => w.start <= date);
  let block = 1, week = 0;
  for (const w of list) {
    const lighter = !!w.cutback || w.phase === 'taper' || w.phase === 'recovery';
    if (week >= 4) { block++; week = 0; }
    week = lighter ? 4 : Math.min(3, week + 1);
  }
  return { block, week: (Math.max(1, week) as BlockWeek) };
}

/** What the last session of an exercise says about the next one */
export interface ExProgress { reps?: number; load?: number; seconds?: number; next: 'up' | 'repeat' | 'back'; at: string }
/**
 * Session to session: all sets done and rated OK or easier (effort 7 or less): progress (+1 rep, +5 s, or +2 kg when
 * it has load). Rated hard (8 or more) or sets missed: repeat.
 */
export function nextAfter(done: { reps?: number; load?: number; seconds?: number }[], planned: number, rpe: number | undefined): ExProgress['next'] {
  if (done.length < planned) return 'repeat';
  if ((rpe ?? 6) >= 8) return 'repeat';
  return 'up';
}
/** The target for the next session of an exercise, from its last result (or the plan's dose) */
export function targetFor(x: StrengthItem, pr: ExProgress | undefined, week: BlockWeek): StrengthItem & { load?: number; note?: string } {
  const lighter = week === 4;
  const base: StrengthItem & { load?: number; note?: string } = { ...x };
  if (week === 2 && base.reps) base.reps += 2;
  if (week === 2 && base.seconds) base.seconds += 10;
  if (lighter) { base.sets = Math.max(2, base.sets - 1); if (base.reps) base.reps = Math.max(6, Math.round(base.reps * 0.8)); }
  if (!pr) return base;
  const k = pr.next === 'up' ? 1 : pr.next === 'back' ? -1 : 0;
  if (pr.load) { base.load = Math.max(0, pr.load + 2 * k); if (pr.reps) base.reps = pr.reps; base.note = k > 0 ? `+2 kg (to ${base.load} kg)` : k < 0 ? `a step back (${base.load} kg)` : `same as last time (${pr.load} kg)`; }
  else if (pr.seconds && base.seconds) { base.seconds = Math.max(10, pr.seconds + 5 * k); base.note = k > 0 ? `+5 s (to ${base.seconds} s)` : k < 0 ? `a step back (${base.seconds} s)` : `same as last time (${pr.seconds} s)`; }
  else if (pr.reps && base.reps) { base.reps = Math.max(4, Math.min((x.reps ?? 10) + 6, pr.reps + k)); base.note = k > 0 ? `+${base.reps - pr.reps} reps (to ${base.reps})` : k < 0 ? `a step back (${base.reps} reps)` : `same as last time (${pr.reps} reps)`; }
  if (lighter) { base.sets = Math.max(2, x.sets - 1); base.note = `${base.note ? `${base.note}, ` : ''}lighter week`; }
  return base;
}

/** Planned strength sessions in a row (most recent first, before `date`) that passed without a workout */
export function skippedInARow(sessions: { id: string; date: string; strengthPlan?: unknown }[], loggedIds: Set<string>, date: string): number {
  const past = sessions.filter((s) => s.strengthPlan && s.date < date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  let n = 0;
  for (const s of past) { if (loggedIds.has(s.id)) break; n++; }
  return n;
}
