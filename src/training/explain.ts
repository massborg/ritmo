// "Explain this week": one plain paragraph on why a week of the plan looks the way it does, built from the plan's own
// numbers (phase, volume against last week, lighter weeks, where the hard sessions and the long run fall, the race).
import type { Phase, Plan, PlannedSession, Race } from '../lib/types';
import { addDays, DAY_NAMES, dist, parseYmd, type Units, ymd } from '../lib/format';

const PHASE: Record<Phase, string> = {
  base: 'a base week: mostly easy running to build the aerobic engine that everything else sits on',
  build: 'a build week: the hard sessions get more specific while the long run grows',
  peak: 'a peak week: the hardest, most race-like training of the plan',
  taper: 'a taper week: less running so you arrive at the race fresh, with a little intensity to stay sharp',
  recovery: 'a recovery week: easy running to let the body absorb what came before',
  race: 'race week: short, easy runs and plenty of rest, so the work you have done can show',
};
const HARD: Partial<Record<string, string>> = { threshold: 'threshold', vo2max: 'intervals', tempo: 'a tempo run', speed: 'speed work', hills: 'hill repeats', race: 'the race', timetrial: 'a time trial' };
const dayName = (s: PlannedSession) => DAY_NAMES[(parseYmd(s.date).getDay() + 6) % 7];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The paragraph for the week starting on `weekStart` (a Monday, YYYY-MM-DD), or undefined if the plan has no sessions then. */
export function explainWeek(plan: Plan, weekStart: string, races: Race[], units: Units): string | undefined {
  const end = ymd(addDays(parseYmd(weekStart), 6));
  const sessions = plan.sessions.filter((s) => s.date >= weekStart && s.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  if (!sessions.length) return undefined;
  const week = plan.weeks?.find((w) => w.start === weekStart);
  const prev = plan.weeks?.find((w) => w.start === ymd(addDays(parseYmd(weekStart), -7)));
  const phase = week?.phase ?? sessions[0].phase;
  const runs = sessions.filter((s) => s.type !== 'rest' && s.distanceM > 0);
  const km = week?.targetKm ?? runs.reduce((x, s) => x + s.distanceM / 1000, 0);
  const D = (k: number) => dist(k * 1000, units, 0);
  const out: string[] = [`This is ${PHASE[phase]}.`];

  // Volume, compared with last week
  if (week?.cutback) out.push(`It is a lighter week at about ${D(km)}: every few weeks the load drops so the training of the last weeks turns into fitness instead of fatigue.`);
  else if (prev && prev.targetKm > 0 && phase !== 'taper' && phase !== 'race') {
    const ch = Math.round(((km - prev.targetKm) / prev.targetKm) * 100);
    out.push(ch >= 3 ? `Volume goes up to about ${D(km)}, ${ch}% more than last week, a step small enough to absorb.`
      : ch <= -3 ? `Volume comes down to about ${D(km)}${prev.cutback ? '' : ', a little less than last week'}.`
        : `Volume holds at about ${D(km)}, the same as last week.`);
  } else out.push(`About ${D(km)} in ${runs.length} run${runs.length === 1 ? '' : 's'}.`);

  // Hard sessions and the long run
  const hard = runs.filter((s) => HARD[s.type]);
  if (hard.length) {
    out.push(`${hard.length === 1 ? 'One hard session' : `${hard.length === 2 ? 'Two' : hard.length} hard sessions`}: ${list(hard.map((s) => `${HARD[s.type]} on ${dayName(s)}`))}, with easy days around ${hard.length === 1 ? 'it' : 'them'} so you recover in between.`);
  } else if (phase === 'base' || phase === 'recovery') out.push('No hard sessions yet: easy running builds the base safely, and the harder work comes later.');
  const long = runs.find((s) => s.type === 'long');
  if (long) {
    const longest = plan.sessions.filter((s) => s.type === 'long' && s.date < weekStart).reduce((m, s) => Math.max(m, s.distanceM), 0);
    out.push(`The long run on ${dayName(long)} is ${dist(long.distanceM, units, 0)}${longest && long.distanceM > longest + 400 ? ', the longest so far' : ''}.`);
  }
  if (runs.length < sessions.length) out.push(`${sessions.length - runs.length === 1 ? 'The rest day is' : 'Rest days are'} part of the plan, not a gap in it.`);

  // The race
  const race = races.filter((r) => r.date >= weekStart).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (race) {
    const weeks = Math.round((parseYmd(race.date).getTime() - parseYmd(weekStart).getTime()) / (7 * 86400000));
    out.push(race.date <= end ? `${race.name} is on ${DAY_NAMES[(parseYmd(race.date).getDay() + 6) % 7]}.` : `${weeks} week${weeks === 1 ? '' : 's'} to ${race.name}.`);
  }
  return out.join(' ');
}
