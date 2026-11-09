// Readiness (update brief, section 4A): one score out of 100 for today, built from a baseline of 85 and a short list
// of factors whose effects add up to the score. Worked out once, in this module, so Training, Coach and run feedback
// show the same number, band word and sentence. It only ever suggests: nothing in the plan changes unless the runner
// taps a swap.
import type { Activity, PlannedSession, Profile, Race, SessionFeedback, SessionType } from '../lib/types';
import { parseYmd, ymd } from '../lib/format';
import { EASY_FAMILY, QUALITY_TYPES, SESSION_SHORT } from './analysis';
import { acwr, type LoadDay, type Readiness } from './load';
import { type TrainingPaces, zoneOf } from './fitness';

export const READINESS_BASELINE = 85;
export type ReadinessBand = 'recover' | 'easy' | 'hard';
export const BAND_WORD: Record<ReadinessBand, string> = { recover: 'Recover', easy: 'Easy day', hard: 'Ready for hard' };
export const bandOf = (score: number): ReadinessBand => (score <= 33 ? 'recover' : score <= 66 ? 'easy' : 'hard');

export type FactorKey = 'load' | 'recovery' | 'recent' | 'feel' | 'checkin' | 'body' | 'race' | 'limit';
export interface ReadinessFactor {
  key: FactorKey;
  name: string;
  /** One or two words for the factor's state, e.g. "High", "Not logged" */
  value: string;
  tone: 'good' | 'neutral' | 'warn' | 'bad';
  /** Points added to or taken from the baseline */
  effect: number;
  explain: string;
}

/** The morning check-in: sleep, legs and energy, 1 (poor) to 5 (great) */
export interface CheckIn { date: string; sleep: number; legs: number; energy: number }

export interface ReadinessScore {
  /** Missing when the inputs look broken; then `unavailable` says so */
  score?: number;
  band: ReadinessBand;
  word: string;
  /** Eight words at most, for the strip */
  line: string;
  /** Two short sentences, for the breakdown */
  summary: string;
  factors: ReadinessFactor[];
  baseline: number;
  /** No check-in today, or too little history for load numbers */
  lessAccurate: boolean;
  unavailable?: string;
  /** Readiness and today's plan disagree: the swap to offer */
  swap?: { kind: 'easy' | 'rest'; sessionId: string; label: string; km?: number };
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const HARD_TYPES: SessionType[] = [...QUALITY_TYPES, 'race'];

export function readinessScore(o: {
  now: Date;
  series: LoadDay[];
  activities: Activity[];
  feedback: SessionFeedback[];
  profile: Profile;
  typeOf: (a: Activity) => SessionType;
  zones?: { zone: number; min: number; max: number }[];
  paces?: TrainingPaces;
  todaySession?: PlannedSession;
  race?: Race;
  /** Too little history for load numbers (no fitness estimate yet) */
  simple?: boolean;
  /** Heart-rate zones look set too low: heart rate is not used to call a run hard */
  hrSuspect?: boolean;
}): ReadinessScore {
  const { now, series, activities, feedback, profile, typeOf } = o;
  const t = ymd(now);
  const factors: ReadinessFactor[] = [];
  const day = series.find((d) => d.date === t) ?? series[series.length - 1];
  const tsb = day ? day.tsb : 0;

  // Broken inputs: never show a score built on them
  if (!o.simple && day && (tsb < -60 || tsb > 60)) {
    console.warn('Readiness unavailable: form out of range', Math.round(tsb));
    return { band: 'easy', word: 'Unavailable', line: 'Checking your training data.', summary: 'Readiness unavailable: checking your training data.', factors: [], baseline: READINESS_BASELINE, lessAccurate: true, unavailable: 'Readiness unavailable: checking your training data' };
  }

  // 1) Training load: form and the 7-day against 28-day ratio
  const ratio = acwr(activities, now);
  let loadEffect = 0;
  if (o.simple) {
    factors.push({ key: 'load', name: 'Training load', value: 'Building up', tone: 'neutral', effect: 0, explain: 'Ritmo needs a fitness estimate (a race or time trial) before it can judge your load.' });
  } else {
    const ratioEff = ratio.chronicWeekly > 0 ? (ratio.ratio > 1.5 ? -18 : ratio.ratio > 1.3 ? -10 : ratio.ratio < 0.6 ? 2 : 0) : 0;
    const formEff = tsb < -30 ? -15 : tsb < -20 ? -10 : tsb < -10 ? -5 : tsb > 10 ? 4 : 0;
    loadEffect = Math.max(-25, ratioEff + formEff);
    const value = loadEffect <= -15 ? 'High' : loadEffect < 0 ? 'Building' : loadEffect > 0 ? 'Fresh' : 'Steady';
    const parts = [`Form ${tsb >= 0 ? '+' : ''}${Math.round(tsb)}`];
    if (ratio.chronicWeekly > 0) parts.push(`${(ratio.acute / 1000).toFixed(0)} km in 7 days against ${(ratio.chronicWeekly / 1000).toFixed(0)} km a week (ratio ${ratio.ratio.toFixed(2)})`);
    factors.push({ key: 'load', name: 'Training load', value, tone: loadEffect <= -15 ? 'bad' : loadEffect < 0 ? 'warn' : 'good', effect: loadEffect, explain: `${parts.join(', ')}.` });
  }

  // 2) Recovery since the last hard session
  const endOf = (a: Activity) => new Date(a.startTime).getTime() + (a.durationS || a.movingS) * 1000;
  const isHard = (a: Activity) => HARD_TYPES.includes(typeOf(a)) || (!o.hrSuspect && !!a.avgHr && !!o.zones && zoneOf(a.avgHr, o.zones) >= 4);
  const lastHard = activities.filter((a) => endOf(a) <= now.getTime() && now.getTime() - endOf(a) < 14 * 86400000 && isHard(a)).sort((a, b) => endOf(b) - endOf(a))[0];
  if (lastHard) {
    const h = (now.getTime() - endOf(lastHard)) / 3600000;
    const when = h < 24 ? `${Math.max(1, Math.round(h))} hours ago` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'} ago`;
    const short = SESSION_SHORT[typeOf(lastHard)];
    const what = short && short !== 'easy run' && short !== 'long run' ? short : 'run at a hard effort';
    if (h < 24) factors.push({ key: 'recovery', name: 'Recovery', value: 'Under 24 h', tone: 'bad', effect: -20, explain: `Your last hard session (${what}) was ${when}.` });
    else if (h < 48) factors.push({ key: 'recovery', name: 'Recovery', value: '24–48 h', tone: 'warn', effect: -8, explain: `Your last hard session (${what}) was ${when}.` });
    else factors.push({ key: 'recovery', name: 'Recovery', value: 'Recovered', tone: 'good', effect: 0, explain: `Your last hard session (${what}) was ${when}.` });
  } else factors.push({ key: 'recovery', name: 'Recovery', value: 'Recovered', tone: 'good', effect: 0, explain: 'No hard session in the last two weeks.' });

  // 3) Recent runs: heart rate at easy pace against the runner's normal
  if (o.paces && !o.hrSuspect) {
    const easyPaced = activities.filter((a) => a.avgHr && a.distanceM >= 3000 && a.movingS / (a.distanceM / 1000) >= o.paces!.easy[0]);
    const age = (a: Activity) => (now.getTime() - new Date(a.startTime).getTime()) / 86400000;
    const recent = easyPaced.filter((a) => age(a) >= 0 && age(a) <= 7);
    const base = easyPaced.filter((a) => age(a) > 7 && age(a) <= 35);
    if (recent.length && base.length >= 3) {
      const avg = (xs: Activity[]) => xs.reduce((s, a) => s + a.avgHr!, 0) / xs.length;
      const diff = Math.round(avg(recent) - avg(base));
      const eff = diff >= 6 ? -8 : diff >= 3 ? -4 : diff <= -2 ? 2 : 0;
      factors.push({ key: 'recent', name: 'Recent runs', value: eff < 0 ? 'Higher heart rate' : eff > 0 ? 'Lower heart rate' : 'Normal', tone: eff <= -8 ? 'bad' : eff < 0 ? 'warn' : 'good', effect: eff,
        explain: `Heart rate on easy runs this week is ${Math.abs(diff)} bpm ${diff >= 0 ? 'higher' : 'lower'} than your 4-week normal.` });
    } else factors.push({ key: 'recent', name: 'Recent runs', value: 'Not enough data', tone: 'neutral', effect: 0, explain: 'Needs easy runs with heart rate this week and over the last month.' });
  }

  // 4) How the last runs felt
  const fb = feedback.filter((f) => { const d = (now.getTime() - new Date(f.loggedAt).getTime()) / 86400000; return d >= 0 && d <= 3; })
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)).slice(0, 3);
  if (fb.length) {
    const runOf = (f: SessionFeedback) => activities.find((a) => a.id === f.activityId);
    const hardEasy = fb.find((f) => f.feel <= 2 && runOf(f) && EASY_FAMILY.includes(typeOf(runOf(f)!)));
    const hard = fb.find((f) => f.feel <= 2);
    const avg = fb.reduce((s, f) => s + f.feel, 0) / fb.length;
    const word = (f: SessionFeedback) => ['', 'very hard', 'hard', 'okay', 'good', 'great'][f.feel];
    if (hardEasy) factors.push({ key: 'feel', name: 'How runs felt', value: 'Hard', tone: 'bad', effect: -10, explain: `An easy run felt ${word(hardEasy)}.` });
    else if (hard) factors.push({ key: 'feel', name: 'How runs felt', value: 'Hard', tone: 'warn', effect: -5, explain: `Your last run felt ${word(hard)}.` });
    else if (avg >= 4) factors.push({ key: 'feel', name: 'How runs felt', value: 'Good', tone: 'good', effect: 2, explain: `Your recent runs felt ${word(fb[0])}.` });
    else factors.push({ key: 'feel', name: 'How runs felt', value: 'Okay', tone: 'neutral', effect: 0, explain: 'Your recent runs felt okay.' });
  } else factors.push({ key: 'feel', name: 'How runs felt', value: 'Not rated', tone: 'neutral', effect: 0, explain: 'Rate your runs under "How did it feel?" to include this.' });

  // 5) Sleep, legs and energy (optional morning check-in)
  const ci = profile.checkins?.find((c) => c.date === t);
  if (ci) {
    const avg = (ci.sleep + ci.legs + ci.energy) / 3;
    const eff = Math.round((avg - 3) * 5);
    factors.push({ key: 'checkin', name: 'Sleep and legs', value: eff <= -5 ? 'Poor' : eff >= 5 ? 'Great' : eff > 0 ? 'Good' : eff < 0 ? 'So-so' : 'Okay', tone: eff <= -5 ? 'bad' : eff < 0 ? 'warn' : 'good', effect: eff,
      explain: `This morning: sleep ${ci.sleep}, legs ${ci.legs}, energy ${ci.energy} out of 5.` });
  } else factors.push({ key: 'checkin', name: 'Sleep and legs', value: 'Not logged', tone: 'neutral', effect: 0, explain: 'Add a morning check-in to include sleep, legs and energy.' });

  // 6) Body: niggles in the last 7 days; illness and worrying symptoms cap the score below
  const week = feedback.filter((f) => { const d = (now.getTime() - new Date(f.loggedAt).getTime()) / 86400000; return d >= 0 && d <= 7; });
  const pains = week.flatMap((f) => f.pain);
  const redFlag = pains.some((p) => /chest|dizz|faint/i.test(p.area));
  const niggle = pains.filter((p) => !/chest|dizz|faint/i.test(p.area)).sort((a, b) => b.severity - a.severity)[0];
  const ill = !!profile.illnessUntil && profile.illnessUntil >= t;
  if (niggle) {
    const eff = niggle.severity >= 3 ? -25 : niggle.severity === 2 ? -15 : -6;
    factors.push({ key: 'body', name: 'Body', value: `Niggle: ${niggle.area.toLowerCase()}`, tone: eff <= -15 ? 'bad' : 'warn', effect: eff, explain: `You logged ${niggle.area.toLowerCase()} pain in the last 7 days.` });
  } else factors.push({ key: 'body', name: 'Body', value: ill ? 'Unwell' : 'No niggles', tone: ill ? 'bad' : 'good', effect: 0, explain: ill ? 'You told Ritmo you are unwell.' : 'No pain logged in the last 7 days.' });

  // 7) Race timing: during the taper, freshness weighs more
  const daysToRace = o.race ? Math.round((parseYmd(o.race.date).getTime() - parseYmd(t).getTime()) / 86400000) : undefined;
  if (daysToRace != null && daysToRace >= 0 && daysToRace <= 10 && !o.simple) {
    const eff = loadEffect < 0 ? -5 : 3;
    factors.push({ key: 'race', name: 'Race timing', value: 'Taper', tone: eff < 0 ? 'warn' : 'good', effect: eff, explain: `${o.race!.name} is in ${daysToRace} day${daysToRace === 1 ? '' : 's'}: fresh legs matter most now.` });
  }

  // Score: the baseline plus the effects, kept within 0–100; illness holds it in Recover. Any adjustment is its own
  // row, so the rows always add up to the score.
  const raw = READINESS_BASELINE + factors.reduce((s, f) => s + f.effect, 0);
  let score = clamp(raw);
  let limitWhy = score !== raw ? 'Kept within 0–100.' : '';
  if (redFlag && score > 10) { score = 10; limitWhy = 'You logged chest pain, dizziness or feeling faint: please see a doctor before running.'; }
  else if (ill && score > 25) { score = 25; limitWhy = 'Held in Recover while you are unwell.'; }
  if (score !== raw) factors.push({ key: 'limit', name: redFlag ? 'Symptoms' : ill ? 'Unwell' : 'Limit', value: redFlag || ill ? 'Rest' : 'Limit', tone: redFlag || ill ? 'bad' : 'neutral', effect: score - raw, explain: limitWhy });

  const band = bandOf(score);
  const s = o.todaySession && o.todaySession.status === 'planned' ? o.todaySession : undefined;
  const quality = !!s && QUALITY_TYPES.includes(s.type);
  const running = !!s && s.type !== 'rest';
  const short = s ? SESSION_SHORT[s.type] ?? s.title.toLowerCase() : '';
  // Today's session already done or swapped: the line is about recovering from it, not about a rest day
  const doneToday = !!o.todaySession && o.todaySession.type !== 'rest' && (o.todaySession.status === 'done' || o.todaySession.status === 'swapped');
  const line = doneToday
    ? (band === 'recover' ? 'Rest up: today\'s work is done.' : 'Today\'s work is done. Recover well.')
    : band === 'hard'
    ? (quality ? `Good day for ${short}.` : running ? 'Ready for today\'s run.' : 'Rest day: you\'re absorbing training well.')
    : band === 'easy'
      ? (quality ? `${cap(short)} may feel hard today.` : 'Keep today relaxed and easy.')
      : (running ? 'Rest or a gentle walk today.' : 'Rest is the right call today.');
  const worst = factors.filter((f) => f.effect < 0).sort((a, b) => a.effect - b.effect)[0];
  const lead = band === 'hard' ? 'You are fresh and recovering well.' : band === 'easy' ? 'Some fatigue is showing, so keep the effort down.' : 'Your body needs recovery today.';
  const summary = `${lead} ${worst ? worst.explain : 'Nothing is holding you back.'}`;

  let swap: ReadinessScore['swap'];
  if (s && band === 'recover' && running) swap = { kind: 'rest', sessionId: s.id, label: 'Swap to rest' };
  else if (s && band === 'easy' && quality) {
    const km = Math.max(4, Math.round((s.distanceM / 1000) * 0.8));
    swap = { kind: 'easy', sessionId: s.id, label: 'Swap to easy', km };
  }
  const lessAccurate = !ci || !!o.simple;
  return { score, band, word: BAND_WORD[band], line, summary, factors, baseline: READINESS_BASELINE, lessAccurate, swap };
}

/** The older readiness shape (level, label, summary, reasons), from the score, for code that still reads it. */
export function asReadiness(r: ReadinessScore): Readiness {
  if (r.score == null) return { level: 'easy', label: 'Readiness unavailable', summary: r.summary, basedOn: [r.unavailable ?? ''] };
  return {
    level: r.band === 'hard' ? 'ready' : r.band === 'easy' ? 'easy' : 'recovery',
    label: `${r.word} (${r.score})`,
    summary: `${r.line} ${r.summary}`,
    basedOn: r.factors.filter((f) => f.effect !== 0 || f.key === 'load').map((f) => `${f.name}: ${f.value} (${f.effect > 0 ? '+' : ''}${f.effect}). ${f.explain}`),
  };
}

// "Keep plan": the runner saw the swap suggestion and chose to keep today's session. Remembered on this device for
// today only, so the suggestion stops showing; nothing in the plan changes either way.
const keepKey = (d: Date) => `ritmo:keep-plan:${ymd(d)}`;
export function keepPlanToday(d: Date) { try { localStorage.setItem(keepKey(d), '1'); } catch { /* fine: the suggestion just shows again */ } }
export function keptPlanToday(d: Date): boolean { try { return localStorage.getItem(keepKey(d)) === '1'; } catch { return false; } }
