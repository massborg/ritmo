// Body: injury and recovery support (review #2 §10). General guidance and load management only: Ritmo never
// diagnoses or prescribes treatment. Red flags are rules, checked before anything else (and before any AI).
import type { Plan, PlannedSession } from '../lib/types';
import { addDays, parseYmd, ymd } from '../lib/format';

export const BODY_AREAS = ['Foot', 'Ankle', 'Achilles', 'Calf', 'Shin', 'Knee', 'Hamstring', 'Quad', 'Hip', 'Glute', 'Lower back', 'Other'] as const;
export type BodyArea = (typeof BODY_AREAS)[number];
export type PainWhen = 'start-eases' | 'worse-running' | 'after' | 'next-morning' | 'walking' | 'rest-night';
export const WHEN_LABEL: Record<PainWhen, string> = {
  'start-eases': 'At the start, then it eases', 'worse-running': 'Gets worse while running', after: 'After the run',
  'next-morning': 'The next morning', walking: 'When walking', 'rest-night': 'At rest or at night',
};
export type Sign = 'swelling' | 'bruising' | 'numbness' | 'bony-spot' | 'limping' | 'cannot-bear-weight';
export const SIGN_LABEL: Record<Sign, string> = { swelling: 'Marked swelling', bruising: 'Bruising', numbness: 'Numbness or tingling', 'bony-spot': 'One bony spot that hurts to press', limping: 'Limping', 'cannot-bear-weight': 'Cannot put weight on it' };

export interface BodyCheckin {
  id: string; at: string; area: BodyArea; side?: 'left' | 'right'; pain: number; when: PainWhen[];
  onset: 'sudden' | 'gradual'; trend?: 'better' | 'same' | 'worse'; signs: Sign[]; redFlags: string[];
}
export interface BodyState {
  checkins: BodyCheckin[];
  /** When a red flag was shown; hard training stays paused until the runner confirms they have been checked */
  redFlagAt?: string;
  checkedAt?: string;
  /** Return-to-run step reached (1–6), while coming back */
  rtrStep?: number;
  disclaimerSeenAt?: string;
  /** The Body AI chat can be switched off separately from the Coach AI */
  aiChat?: boolean;
  /** Prehab routine levels the runner set with too easy / just right / too hard */
  prehab?: Record<string, number>;
  /** The check-in the runner chose to be more careful with than the rule (one step stricter) */
  careful?: string;
}

const label = (c: Pick<BodyCheckin, 'area' | 'side'>) => `${c.side ? `${c.side[0].toUpperCase()}${c.side.slice(1)} ` : ''}${c.side ? c.area.toLowerCase() : c.area}`;
export const areaLabel = label;

/** Red flags for a check-in, given earlier check-ins of the same area. Any red flag means: stop running and get checked. */
export function redFlags(c: Omit<BodyCheckin, 'redFlags' | 'id' | 'at'>, history: BodyCheckin[], now = new Date()): string[] {
  const out: string[] = [];
  if (c.when.includes('rest-night')) out.push('Pain at rest or at night');
  if (c.signs.includes('swelling') || c.signs.includes('bruising')) out.push('Marked swelling or bruising');
  if (c.onset === 'sudden') out.push('It started suddenly (a pop, tear or fall)');
  if (c.signs.includes('cannot-bear-weight') || c.signs.includes('limping')) out.push('You cannot put weight on it, or you are limping');
  if (c.signs.includes('numbness')) out.push('Numbness or tingling');
  if (c.signs.includes('bony-spot')) out.push('Pain on one bony spot (this can be a stress fracture)');
  if (c.pain >= 7) out.push(`Pain ${c.pain}/10`);
  const same = history.filter((h) => h.area === c.area && h.side === c.side).sort((a, b) => a.at.localeCompare(b.at));
  const recent = [...same, { ...c, at: now.toISOString() } as BodyCheckin].filter((h) => (now.getTime() - new Date(h.at).getTime()) / 86400000 <= 3.5);
  if (recent.length >= 3 && recent.slice(-3).every((h) => h.trend === 'worse')) out.push('Getting worse for 3 days or more');
  const first = same[0];
  if (first && (now.getTime() - new Date(first.at).getTime()) / 86400000 >= 10 && c.pain >= first.pain) out.push('Not improving after 10 days or more');
  return out;
}

/** Red flags in something the runner typed in Body chat (checked before the AI answers). */
export function textRedFlags(t: string): string[] {
  const s = t.toLowerCase();
  const out: string[] = [];
  if (/chest pain|tight chest|dizz|faint|black(ed)? out|short of breath/.test(s)) out.push('Chest pain, dizziness or fainting');
  if (/at night|night pain|wakes? me|at rest|resting|lying down|in bed/.test(s)) out.push('Pain at rest or at night');
  if (/\bpop(ped)?\b|\btear\b|\btore\b|snap(ped)?|\bfell\b|\bfall\b/.test(s)) out.push('A sudden pop, tear or fall');
  if (/can'?t (walk|put weight|bear weight|stand)|cannot (walk|put weight|bear weight)|limp/.test(s)) out.push('Cannot put weight on it, or limping');
  if (/numb|tingl|pins and needles/.test(s)) out.push('Numbness or tingling');
  if (/swollen|swelling|bruis/.test(s)) out.push('Marked swelling or bruising');
  if (/bony|on the bone|one spot on the bone|stress fracture/.test(s)) out.push('Pain on one bony spot');
  return out;
}

/** The niggle Ritmo is currently looking after: the latest check-in, if it is recent and not settled (pain 0). */
export function activeNiggle(b: BodyState | undefined, now = new Date()): BodyCheckin | undefined {
  const last = [...(b?.checkins ?? [])].sort((a, c) => c.at.localeCompare(a.at))[0];
  if (!last || last.pain === 0) return undefined;
  if ((now.getTime() - new Date(last.at).getTime()) / 86400000 > 21) return undefined;
  return last;
}

export const RTR_STEPS = [
  { title: 'Return to run · step 1 of 6', km: 3, detail: 'Run/walk: 5 x (4 min easy running + 1 min walking).' },
  { title: 'Return to run · step 2 of 6', km: 4, detail: 'Run/walk: 6 x (5 min easy running + 1 min walking).' },
  { title: 'Return to run · step 3 of 6', km: 5, detail: '30 minutes of continuous easy running on a flat, soft route.' },
  { title: 'Return to run · step 4 of 6', km: 7, detail: '40 minutes of easy running.' },
  { title: 'Return to run · step 5 of 6', km: 7, detail: '40 minutes easy, with 4 relaxed strides at the end.' },
  { title: 'Return to run · step 6 of 6', km: 8, detail: 'Easy run with a short steady section. Normal training resumes after this if pain stays at 2/10 or lower.' },
];

/** Whether the next return-to-run step is unlocked: pain 2/10 or lower during the run and the next morning. */
export const stepUnlocked = (c: BodyCheckin | undefined) => !!c && c.pain <= 2 && !c.when.includes('worse-running') && !c.when.includes('rest-night');

const HARD = ['threshold', 'vo2max', 'speed', 'hills', 'tempo', 'race', 'timetrial'];
const isRun = (s: PlannedSession) => s.type !== 'rest';

export type PainLevel = 'easy' | 'cross' | 'rest';
const LEVELS: PainLevel[] = ['easy', 'cross', 'rest'];
/** The one rule set (update 3, §1.5): 0–2 keep easy running, 3–5 cross-train, 6+ rest and see a physio. Being more
 *  careful moves one step stricter, never looser. */
export function painLevel(pain: number, careful = false): PainLevel {
  const i = pain >= 6 ? 2 : pain >= 3 ? 1 : 0;
  return LEVELS[Math.min(2, i + (careful ? 1 : 0))];
}
/** What the rule does for a check-in, in the words Training, the Coach and Plan changes all use. */
export function painRule(c: BodyCheckin, careful = false): { level: PainLevel; days: number; summary: string; short: string } {
  const where = label(c);
  const level = painLevel(c.pain, careful);
  const days = level === 'rest' ? 5 : level === 'cross' ? (c.pain >= 5 ? 3 : 2) : 0;
  const by = careful ? ' (you chose to be more careful)' : '';
  const short = level === 'easy' ? 'Keep running easy and flat: no hills or intervals.'
    : level === 'cross' ? `Cross-train instead of running for ${days} days, then easy, flat running.`
      : `Rest from running for ${days} days, and see a physio before you run again.`;
  return { level, days, short, summary: `${where} pain ${c.pain}/10${by}: ${short.charAt(0).toLowerCase()}${short.slice(1)}${level === 'easy' ? ' Hard sessions this week become easy runs.' : ' The week after is lighter, with no hard sessions.'}` };
}

/** The plan with Body changes applied for the active niggle. Every change is logged with its reason. */
export function applyBody(plan: Plan, b: BodyState | undefined, today: Date): Plan {
  const active = activeNiggle(b, today);
  const paused = !!b?.redFlagAt && (!b.checkedAt || b.checkedAt < b.redFlagAt);
  if (!active && !paused && !b?.rtrStep) return plan;
  const t = ymd(today);
  const sessions = plan.sessions.map((s) => ({ ...s }));
  const changes = [...plan.changes];
  const log = (id: string, summary: string) => { if (!changes.some((c) => c.id === id)) changes.push({ id, at: new Date().toISOString(), reason: 'pain', summary }); };
  const upcoming = sessions.filter((s) => s.date >= t && s.status !== 'done' && s.type !== 'race');
  const rest = (s: PlannedSession, title: string, purpose: string) => Object.assign(s, { type: 'rest', title, focus: 'Recovery', purpose, howItHelps: purpose, distanceM: 0, durationS: 0, steps: [{ label: title, detail: purpose }], paceTarget: undefined, hrZones: undefined, second: undefined });
  const easy = (s: PlannedSession, why: string, kmScale = 1) => Object.assign(s, { type: 'easy', title: 'Easy run', focus: 'Aerobic base', purpose: why, distanceM: Math.round(s.distanceM * kmScale), durationS: Math.round(s.durationS * kmScale), steps: [{ label: 'Easy run', detail: 'Relaxed and conversational. Stop if pain goes above 3/10.', km: Math.round(s.distanceM * kmScale / 100) / 10 }], paceTarget: s.type === 'easy' ? s.paceTarget : undefined, second: undefined });

  if (paused) {
    // Red flag: no running until checked; no exercise tips either
    for (const s of upcoming.filter((x) => parseYmd(x.date) <= addDays(today, 13))) rest(s, 'Rest: get checked first', 'You reported a warning sign. Please see a doctor or physio before running again. Confirm in Ritmo once you have been checked.');
    log(`body-redflag:${b!.redFlagAt}`, 'Training is paused because you reported a warning sign. Get checked by a doctor or physio, then confirm in Ritmo to resume.');
    return { ...plan, sessions, changes };
  }

  if (active) {
    const where = label(active);
    const area = active.area;
    const rule = painRule(active, b?.careful === active.id);
    const settle = ymd(addDays(parseYmd(active.at.slice(0, 10)), rule.days));
    if (rule.level === 'rest') {
      // 6+: rest from running, and see a physio
      for (const s of upcoming.filter((x) => x.date < settle && isRun(x))) rest(s, 'Rest: see a physio', `Rest from running while your ${where.toLowerCase()} settles. Gentle walking is fine if it does not hurt. Please see a physio before you run again.`);
    } else if (rule.level === 'cross') {
      // 3–5: cross-training instead of running for a few days
      for (const s of upcoming.filter((x) => x.date < settle && isRun(x))) rest(s, 'Cross-training instead of running', `Bike, pool running or the elliptical for ${Math.min(45, Math.round(s.durationS / 60) || 40)} minutes at an easy effort, as long as it does not hurt. This keeps your fitness while the ${where.toLowerCase()} settles.`);
    }
    // Every level: easy, flat running only (no hard sessions, hills or intervals) for a week after that, and lighter after cross-training or rest
    const easyUntil = ymd(addDays(parseYmd(rule.level === 'easy' ? active.at.slice(0, 10) : settle), 7));
    for (const s of upcoming.filter((x) => x.date >= (rule.level === 'easy' ? t : settle) && x.date < easyUntil && isRun(x))) {
      const k = rule.level === 'easy' ? 1 : 0.6;
      if (HARD.includes(s.type)) easy(s, `An easy, flat run instead of a hard session while your ${where.toLowerCase()} settles.`, k === 1 ? 0.8 : k);
      else if (k < 1) Object.assign(s, { distanceM: Math.round(s.distanceM * k), durationS: Math.round(s.durationS * k) });
    }
    log(`body-rule:${active.id}:${rule.level}`, rule.summary);
    // Location-aware: what each area should avoid for now
    const two = upcoming.filter((x) => parseYmd(x.date) <= addDays(today, 13));
    for (const s of two) {
      if (!isRun(s)) continue;
      if ((area === 'Achilles' || area === 'Calf') && (s.type === 'hills' || s.type === 'speed' || s.steps.some((x) => x.kind === 'strides'))) easy(s, `No hills, spikes or fast strides while your ${where.toLowerCase()} recovers.`);
      if (area === 'Hamstring' && (s.type === 'speed' || s.type === 'vo2max')) easy(s, 'No sprint-speed reps while your hamstring recovers.');
      if (area === 'Knee' && s.type === 'long') Object.assign(s, { distanceM: Math.round(s.distanceM * 0.7), durationS: Math.round(s.durationS * 0.7), purpose: `${s.purpose} Shorter and on flat ground (no long downhills) while your knee settles.` });
    }
    if (area === 'Shin') {
      // no back-to-back running days
      const runs = two.filter(isRun).sort((a, c) => a.date.localeCompare(c.date));
      for (let i = 1; i < runs.length; i++) if (runs[i - 1].type !== 'rest' && ymd(addDays(parseYmd(runs[i - 1].date), 1)) === runs[i].date) rest(runs[i], 'Rest or cross-training', 'No back-to-back running days while your shin settles. Choose soft surfaces when you do run.');
    }
    if (['Achilles', 'Calf', 'Hamstring', 'Knee', 'Shin'].includes(area)) log(`body-area:${active.id}`, `${where}: sessions that load it most are changed for the next two weeks (${area === 'Shin' ? 'no back-to-back running days' : area === 'Knee' ? 'shorter, flatter long run' : area === 'Hamstring' ? 'no sprint-speed reps' : 'no hills, spikes or fast strides'}).`);
  }

  if (b?.rtrStep && b.rtrStep >= 1 && b.rtrStep <= RTR_STEPS.length) {
    // Coming back: the next running days become return-to-run steps, one step at a time
    const step = RTR_STEPS[b.rtrStep - 1];
    const next = upcoming.find((x) => isRun(x) && x.title !== 'Cross-training instead of running');
    if (next) Object.assign(next, { type: 'runwalk', title: step.title, focus: 'Building up', purpose: `${step.detail} Move to the next step only if pain stays at 2/10 or lower during the run and the next morning.`, distanceM: step.km * 1000, durationS: step.km * 400, steps: [{ label: step.title, detail: step.detail, km: step.km }], paceTarget: undefined, second: undefined });
  }
  return { ...plan, sessions, changes };
}

/** Exercises many runners use to stay strong in each area (general guidance, not treatment). */
export const PREHAB: Record<string, { title: string; exercises: { name: string; dose: string[] }[] }> = {
  'calf-achilles': { title: 'Calf and Achilles', exercises: [{ name: 'Double-leg calf raises', dose: ['2 x 12', '3 x 15', '3 x 20'] }, { name: 'Single-leg calf raises', dose: ['2 x 8', '3 x 12', '3 x 15'] }, { name: 'Bent-knee calf raises', dose: ['2 x 10', '3 x 12', '3 x 15'] }, { name: 'Slow lowering off a step', dose: ['2 x 8', '3 x 10', '3 x 15'] }] },
  shin: { title: 'Shin', exercises: [{ name: 'Toe raises against a wall', dose: ['2 x 12', '3 x 15', '3 x 20'] }, { name: 'Heel walks', dose: ['2 x 20 m', '3 x 30 m', '3 x 40 m'] }, { name: 'Calf raises', dose: ['2 x 12', '3 x 15', '3 x 20'] }] },
  knee: { title: 'Knee', exercises: [{ name: 'Wall sit', dose: ['3 x 20 s', '3 x 40 s', '4 x 45 s'] }, { name: 'Step-downs', dose: ['2 x 8', '3 x 10', '3 x 12'] }, { name: 'Glute bridge', dose: ['2 x 12', '3 x 15', '3 x 20'] }, { name: 'Side-lying leg raise', dose: ['2 x 12', '3 x 15', '3 x 20'] }] },
  hip: { title: 'IT band and hip', exercises: [{ name: 'Clamshells', dose: ['2 x 12', '3 x 15', '3 x 20'] }, { name: 'Side plank', dose: ['2 x 20 s', '3 x 30 s', '3 x 45 s'] }, { name: 'Single-leg balance', dose: ['2 x 30 s', '3 x 45 s', '3 x 60 s'] }] },
  foot: { title: 'Foot and plantar fascia', exercises: [{ name: 'Towel scrunches', dose: ['2 x 30 s', '3 x 45 s', '3 x 60 s'] }, { name: 'Calf raises with toes on a rolled towel', dose: ['2 x 8', '3 x 10', '3 x 12'] }, { name: 'Short-foot holds', dose: ['2 x 5', '3 x 8', '3 x 10'] }] },
  hamstring: { title: 'Hamstring', exercises: [{ name: 'Glute bridge', dose: ['2 x 12', '3 x 15', '3 x 20'] }, { name: 'Single-leg bridge', dose: ['2 x 8', '3 x 10', '3 x 12'] }, { name: 'Slow hamstring slides', dose: ['2 x 6', '3 x 8', '3 x 10'] }] },
  back: { title: 'Lower back', exercises: [{ name: 'Bird dog', dose: ['2 x 8', '3 x 10', '3 x 12'] }, { name: 'Dead bug', dose: ['2 x 8', '3 x 10', '3 x 12'] }, { name: 'Side plank', dose: ['2 x 20 s', '3 x 30 s', '3 x 45 s'] }] },
};
export const prehabFor = (a: BodyArea) => (a === 'Calf' || a === 'Achilles' ? 'calf-achilles' : a === 'Shin' ? 'shin' : a === 'Knee' || a === 'Quad' ? 'knee' : a === 'Hip' || a === 'Glute' ? 'hip' : a === 'Foot' || a === 'Ankle' ? 'foot' : a === 'Hamstring' ? 'hamstring' : a === 'Lower back' ? 'back' : undefined);

/** "Your right shin has come up 3 times this year…" */
export function patternAlert(checkins: BodyCheckin[], now = new Date()): string | undefined {
  const year = checkins.filter((c) => (now.getTime() - new Date(c.at).getTime()) / 86400000 <= 365);
  const by = new Map<string, BodyCheckin[]>();
  for (const c of year) { const k = label(c); by.set(k, [...(by.get(k) ?? []), c]); }
  for (const [k, list] of by) {
    // separate episodes: more than 14 days apart
    const sorted = list.sort((a, b) => a.at.localeCompare(b.at));
    let episodes = 1;
    for (let i = 1; i < sorted.length; i++) if ((new Date(sorted[i].at).getTime() - new Date(sorted[i - 1].at).getTime()) / 86400000 > 14) episodes++;
    if (episodes >= 3) return `Your ${k.toLowerCase()} has come up ${episodes} times this year. It may be worth a lower weekly volume ceiling or more easy days between hard sessions; a physio can help you find out why.`;
  }
  return undefined;
}

export const DISCLAIMER = 'Ritmo gives general guidance, not medical advice. See a doctor or physio for diagnosis and treatment.';
