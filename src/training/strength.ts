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
  { id: 'bulgarian', name: 'Bulgarian split squat', pattern: 'lunge', muscles: ['quads', 'glutes'], equipment: 'light', sets: 3, reps: 8, perSide: true, load: 'body weight, then dumbbells', cues: ['Back foot on a bench', 'Lower straight down'], tags: ['knee-load', 'balance'] },
  { id: 'step-up', name: 'Step-up', pattern: 'step', muscles: ['quads', 'glutes'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Whole foot on the step', 'Drive up, lower slowly'], tags: ['balance'] },
  { id: 'step-down', name: 'Slow step-down', pattern: 'step', muscles: ['quads'], equipment: 'none', sets: 3, reps: 8, perSide: true, cues: ['3 seconds down', 'Knee tracks over the toes'], tags: ['balance'] },
  // Hinge and posterior chain
  { id: 'sl-rdl', name: 'Single-leg Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes'], equipment: 'none', sets: 3, reps: 8, perSide: true, cues: ['Hips square', 'Long line from head to heel'], tags: ['balance'] },
  { id: 'db-rdl', name: 'Dumbbell Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes'], equipment: 'light', sets: 3, reps: 10, load: 'dumbbells you can lift 12 times', cues: ['Push the hips back', 'Weights close to the legs'], tags: ['weights'] },
  { id: 'trap-deadlift', name: 'Trap-bar deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes', 'back'], equipment: 'gym', sets: 3, reps: 5, load: 'heavy, 2 reps in reserve', cues: ['Brace, then stand up', 'Bar path straight'], tags: ['gym', 'weights'] },
  { id: 'glute-bridge', name: 'Glute bridge', pattern: 'bridge', muscles: ['glutes', 'hamstrings'], equipment: 'none', sets: 3, reps: 15, cues: ['Squeeze at the top', 'Ribs down'], tags: ['floor'] },
  { id: 'sl-bridge', name: 'Single-leg glute bridge', pattern: 'bridge', muscles: ['glutes', 'hamstrings'], equipment: 'none', sets: 3, reps: 10, perSide: true, cues: ['Hips level', 'Push through the heel'], tags: ['floor'] },
  { id: 'hip-thrust', name: 'Hip thrust', pattern: 'bridge', muscles: ['glutes'], equipment: 'gym', sets: 3, reps: 8, load: 'barbell, 2 reps in reserve', cues: ['Shoulders on a bench', 'Chin tucked'], tags: ['gym', 'weights'] },
  // Calves and feet
  { id: 'calf-raise', name: 'Calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'none', sets: 3, reps: 15, cues: ['All the way up', '3 seconds down'], tags: [] },
  { id: 'sl-calf-raise', name: 'Single-leg calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'none', sets: 3, reps: 12, perSide: true, cues: ['Hold a wall for balance', 'Slow on the way down'], tags: ['balance'] },
  { id: 'bent-calf', name: 'Bent-knee calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'none', sets: 3, reps: 12, cues: ['Knees slightly bent', 'Heels high'], tags: [] },
  { id: 'weighted-calf', name: 'Weighted calf raise', pattern: 'calf', muscles: ['calves', 'achilles'], equipment: 'light', sets: 3, reps: 12, load: 'a dumbbell in one hand', cues: ['Edge of a step', 'Full range'], tags: ['weights'] },
  { id: 'seated-calf', name: 'Seated calf raise (machine)', pattern: 'calf', muscles: ['calves'], equipment: 'gym', sets: 3, reps: 12, load: 'moderate', cues: ['Pause at the top', 'Slow lower'], tags: ['gym', 'weights'] },
  // Hips
  { id: 'clamshell', name: 'Clamshell', pattern: 'clam', muscles: ['hips', 'glutes'], equipment: 'none', sets: 2, reps: 15, perSide: true, cues: ['Feet together', 'Don\'t roll back'], tags: ['floor'] },
  { id: 'side-leg-raise', name: 'Side-lying leg raise', pattern: 'clam', muscles: ['hips', 'glutes'], equipment: 'none', sets: 2, reps: 15, perSide: true, cues: ['Toes forward', 'Slow and controlled'], tags: ['floor'] },
  { id: 'band-walk', name: 'Banded side walk', pattern: 'clam', muscles: ['hips', 'glutes'], equipment: 'light', sets: 2, reps: 12, perSide: true, load: 'a light band above the knees', cues: ['Stay low', 'Feet never touch'], tags: [] },
  // Core
  { id: 'plank', name: 'Plank', pattern: 'plank', muscles: ['core'], equipment: 'none', sets: 3, seconds: 40, cues: ['Straight line', 'Breathe'], tags: ['floor'] },
  { id: 'side-plank', name: 'Side plank', pattern: 'side-plank', muscles: ['core', 'hips'], equipment: 'none', sets: 2, seconds: 30, perSide: true, cues: ['Hips high', 'Stack the shoulders'], tags: ['floor'] },
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
export interface StrengthPrefs { equipment?: Equipment; swaps?: Record<string, string>; never?: string[]; last?: Record<string, { reps?: number; load?: number; seconds?: number }> }

/** Sets and reps for the intensity: heavy as planned, moderate one set fewer, light two sets and lighter */
const dose = (e: Exercise, k: Intensity): StrengthItem => ({ id: e.id, sets: k === 'heavy' ? e.sets : k === 'moderate' ? Math.max(2, e.sets - 1) : 2, ...(e.reps ? { reps: k === 'light' ? Math.max(6, Math.round(e.reps * 0.8)) : e.reps } : {}), ...(e.seconds ? { seconds: k === 'light' ? Math.round(e.seconds * 0.75) : e.seconds } : {}) });

/** The exercises of a planned strength session, for this runner */
export function resolveStrength(sp: StrengthPlan, p: StrengthPrefs = {}): { title: string; items: (StrengthItem & { ex: Exercise })[]; minutes: number; equipment: Equipment } {
  const eq = p.equipment ?? 'none', never = p.never ?? [];
  const swap = (id: string) => { const to = p.swaps?.[id]; return to && exById.has(to) && !excluded(exById.get(to)!, never) ? to : id; };
  let items: StrengthItem[];
  if (sp.custom) items = sp.custom.map((x) => ({ ...x, id: swap(x.id) }));
  else {
    const slots = SLOTS[sp.routine].slice(0, sp.intensity === 'light' ? 4 : sp.intensity === 'moderate' ? 5 : 7);
    const used = new Set<string>();
    items = [];
    for (const slot of slots) {
      const pick = slot.map(swap).map((id) => exById.get(id)!).find((e) => e && EQ_RANK[e.equipment] <= EQ_RANK[eq] && !excluded(e, never) && !used.has(e.id))
        // Nothing in the slot fits: any exercise for the same muscles that does
        ?? alternatives(slot[0], never).map((a) => a.ex).find((e) => EQ_RANK[e.equipment] <= EQ_RANK[eq] && !used.has(e.id));
      if (!pick) continue;
      used.add(pick.id);
      items.push(dose(pick, sp.intensity));
    }
  }
  const full = items.map((x) => ({ ...x, ex: exById.get(x.id)! })).filter((x) => x.ex);
  // About 45 s a set plus the rest between sets
  const minutes = Math.max(10, Math.round(full.reduce((a, x) => a + x.sets * ((x.seconds ?? (x.reps ?? 10) * 3) + 60) * (x.ex.perSide ? 1.6 : 1), 0) / 60 / 5) * 5);
  const usedEq = full.reduce<Equipment>((m, x) => (EQ_RANK[x.ex.equipment] > EQ_RANK[m] ? x.ex.equipment : m), 'none');
  return { title: ROUTINE_TITLE[sp.routine], items: full, minutes, equipment: usedEq };
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = { none: 'No equipment', light: 'Light weights', gym: 'Gym' };
/** "3 x 12", "3 x 10 each side", "2 x 30 s" */
export const doseText = (x: StrengthItem & { ex?: Exercise }) => `${x.sets} x ${x.seconds ? `${x.seconds} s` : x.reps ?? ''}${x.ex?.perSide ? ' each side' : ''}`;
