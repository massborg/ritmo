// Choose your week (update 3, §7). The runner can let Ritmo plan the week, or choose each day: Threshold, Intervals,
// Tempo, Easy, Long run, Strength (no run), Rest or "Ritmo picks", with "+ Strength" as a second session on any run
// day. Ritmo still fills in the content (distances, reps, paces) from fitness, phase and race. It changes a chosen
// type by phase only when the runner allows it. Guard rails warn, never block.
import type { Role } from './generator';

export type DayChoice = 'auto' | 'threshold' | 'intervals' | 'tempo' | 'easy' | 'long' | 'strength' | 'rest';
export const DAY_CHOICES: { value: DayChoice; label: string }[] = [
  { value: 'auto', label: 'Ritmo picks' }, { value: 'threshold', label: 'Threshold' }, { value: 'intervals', label: 'Intervals' },
  { value: 'tempo', label: 'Tempo' }, { value: 'easy', label: 'Easy' }, { value: 'long', label: 'Long run' },
  { value: 'strength', label: 'Strength' }, { value: 'rest', label: 'Rest' },
];
export interface WeekChoice {
  mode: 'auto' | 'custom';
  /** Monday first, 7 entries */
  days: DayChoice[];
  /** "+ Strength" as a second session on that day (a run day), Monday first */
  plusStrength: boolean[];
  /** "Let Ritmo adjust by phase": chosen hard types may become easier or change with the phase */
  adjustByPhase: boolean;
}
export const emptyWeek = (): WeekChoice => ({ mode: 'auto', days: Array(7).fill('auto'), plusStrength: Array(7).fill(false), adjustByPhase: false });

const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HARD: DayChoice[] = ['threshold', 'intervals', 'tempo', 'long'];

/**
 * The week the runner chose, laid over the week Ritmo would plan. Days left on "Ritmo picks" keep Ritmo's role,
 * except that a second long run, or a third hard session, becomes easy.
 * Returns the roles, which hard type each chosen day is, and which days are strength only.
 */
export function applyWeekChoice(auto: Role[], w: WeekChoice | undefined): { roles: Role[]; hardType: (DayChoice | undefined)[]; strengthOnly: boolean[]; plusStrength: boolean[] } {
  const none = { roles: auto, hardType: Array(7).fill(undefined), strengthOnly: Array(7).fill(false), plusStrength: Array(7).fill(false) };
  if (!w || w.mode !== 'custom') return none;
  const roles = [...auto];
  const hardType: (DayChoice | undefined)[] = Array(7).fill(undefined);
  const strengthOnly = Array(7).fill(false);
  const chosenLong = w.days.includes('long');
  const chosenQ = w.days.filter((d) => d === 'threshold' || d === 'intervals' || d === 'tempo').length;
  let q = 0;
  for (let d = 0; d < 7; d++) {
    const c = w.days[d] ?? 'auto';
    if (c === 'auto') {
      if (roles[d] === 'long' && chosenLong) roles[d] = 'easy';
      if ((roles[d] === 'q1' || roles[d] === 'q2') && chosenQ >= 2) roles[d] = 'easy';
      continue;
    }
    if (c === 'rest') roles[d] = 'rest';
    else if (c === 'strength') { roles[d] = 'rest'; strengthOnly[d] = true; }
    else if (c === 'easy') roles[d] = 'easy';
    else if (c === 'long') roles[d] = 'long';
    else { roles[d] = q === 0 ? 'q1' : 'q2'; hardType[d] = c; q++; }
  }
  // Auto quality days keep their order after the chosen ones
  for (let d = 0; d < 7; d++) if ((w.days[d] ?? 'auto') === 'auto' && (roles[d] === 'q1' || roles[d] === 'q2')) { roles[d] = q === 0 ? 'q1' : 'q2'; q++; }
  const plusStrength = w.days.map((c, d) => !!w.plusStrength[d] && roles[d] !== 'rest' && c !== 'strength');
  return { roles, hardType, strengthOnly, plusStrength };
}

/** Guard rails for a chosen week: warnings only. Uses the chosen days, and Ritmo's roles for "Ritmo picks" days. */
export function weekWarnings(w: WeekChoice, auto?: Role[]): string[] {
  if (w.mode !== 'custom') return [];
  const kind = (d: number): DayChoice => {
    const c = w.days[(d + 7) % 7] ?? 'auto';
    if (c !== 'auto' || !auto) return c;
    const r = auto[(d + 7) % 7];
    return r === 'long' ? 'long' : r === 'q1' || r === 'q2' ? 'threshold' : r === 'easy' ? 'easy' : 'rest';
  };
  const out: string[] = [];
  for (let d = 0; d < 7; d++) {
    if (HARD.includes(kind(d)) && HARD.includes(kind(d + 1))) out.push(`Two hard days in a row: ${DAY[d]} and ${DAY[(d + 1) % 7]}. An easy day between them helps you recover.`);
    if (kind(d) === 'intervals' && kind(d + 1) === 'long') out.push(`A long run the day after intervals (${DAY[(d + 1) % 7]}): your legs may still be tired.`);
    const heavy = kind(d) === 'strength' || !!w.plusStrength[d];
    if (heavy && ['threshold', 'intervals', 'tempo', 'long'].includes(kind(d + 1))) out.push(`Strength on ${DAY[d]}, the day before a hard run: keep the leg work light that day.`);
  }
  if (![0, 1, 2, 3, 4, 5, 6].some((d) => kind(d) === 'rest' || kind(d) === 'strength')) out.push('No rest day this week. One day without running (or with only strength) helps your body adapt.');
  return [...new Set(out)];
}

/** What a strength-only day and a "+ Strength" day say until the strength library (update 3, §4) fills them in */
export const STRENGTH_ONLY = 'Strength, no run today: 25–30 minutes at a moderate effort (squats, lunges, calf raises, hip bridges, side plank). Treat the day as recovery: stop well before you are tired.';
export const STRENGTH_PLUS = '20 min strength and mobility after the run: squats, lunges, calf raises, hip bridges and a plank. Body weight is enough.';
