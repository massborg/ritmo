// Training load (TRIMP-based), fitness/fatigue/form and readiness.
import type { Activity, LogEntry, Profile, SessionFeedback } from '../lib/types';
import { addDays, parseYmd, ymd } from '../lib/format';
import type { HrSetup } from './fitness';

/** Load for one activity, scaled so one hour at threshold is about 100. */
export function activityLoad(a: Activity, hr: HrSetup, thresholdPace?: number): number {
  if (a.avgHr && a.avgHr > hr.rest) {
    const r = Math.min(1, (a.avgHr - hr.rest) / (hr.max - hr.rest));
    const trimp = (a.movingS / 60) * r * 0.64 * Math.exp(1.92 * r);
    return trimp * (100 / 183);
  }
  if (thresholdPace && a.distanceM > 0) {
    const p = a.movingS / (a.distanceM / 1000);
    const intensity = thresholdPace / p;
    return (a.movingS / 3600) * intensity * intensity * 100;
  }
  return (a.movingS / 3600) * 55;
}

/** How much of a cross-training session's effort counts as running load. Non-impact sports build the
 *  heart and lungs but load the legs less, so they count partly. */
const CROSS_TRANSFER: Record<string, number> = { Bike: 0.7, Elliptical: 0.8, Swim: 0.5, Gym: 0.5, Walk: 0.4, Other: 0.6 };

/** Load for one cross-training entry from minutes and effort (1 easy, 10 all out), on the same scale
 *  as runs: an hour at effort 7 (about threshold) of running is about 100. */
export function crossLoad(e: LogEntry): number {
  if (e.kind !== 'cross' || !e.minutes) return 0;
  const rpe = Math.min(10, Math.max(1, e.rpe ?? 4));
  return (e.minutes / 60) * 100 * (rpe / 7) ** 2 * (CROSS_TRANSFER[e.sport ?? 'Other'] ?? 0.6);
}

export interface LoadDay {
  date: string;
  load: number;
  ctl: number; // fitness, 42-day
  atl: number; // fatigue, 7-day
  tsb: number; // form, yesterday's ctl - atl
}

export function loadSeries(activities: Activity[], hr: HrSetup, thresholdPace: number | undefined, to: Date, days = 365, log: LogEntry[] = []): LoadDay[] {
  const byDay = new Map<string, number>();
  for (const a of activities) {
    const k = a.startTime.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + activityLoad(a, hr, thresholdPace));
  }
  for (const e of log) {
    const l = crossLoad(e);
    if (l > 0) byDay.set(e.date, (byDay.get(e.date) ?? 0) + l);
  }
  // warm up the averages with 120 extra days
  const start = addDays(parseYmd(ymd(to)), -(days + 120));
  let ctl = 0, atl = 0;
  const out: LoadDay[] = [];
  for (let i = 0; i <= days + 120; i++) {
    const d = ymd(addDays(start, i));
    const load = byDay.get(d) ?? 0;
    const tsb = ctl - atl;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    if (i >= 120) out.push({ date: d, load, ctl, atl, tsb });
  }
  return out;
}

/** Acute:chronic workload ratio from distance (7-day vs 28-day weekly average). */
export function acwr(activities: Activity[], at: Date): { ratio: number; acute: number; chronicWeekly: number } {
  const t = parseYmd(ymd(at)).getTime() + 86400000;
  let acute = 0, chronic = 0;
  for (const a of activities) {
    const age = (t - new Date(a.startTime).getTime()) / 86400000;
    if (age < 0) continue;
    if (age <= 7) acute += a.distanceM;
    if (age <= 28) chronic += a.distanceM;
  }
  const chronicWeekly = chronic / 4;
  return { ratio: chronicWeekly > 0 ? acute / chronicWeekly : 0, acute, chronicWeekly };
}

export type ReadinessLevel = 'ready' | 'easy' | 'recovery';

export interface Readiness {
  level: ReadinessLevel;
  label: string; // "Ready to train"
  summary: string; // one sentence
  basedOn: string[]; // bullet reasons with numbers
}

const daysApart = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);

export function readiness(opts: {
  today: Date;
  profile: Profile;
  series: LoadDay[];
  activities: Activity[];
  feedback: SessionFeedback[];
  /** Too little data for load numbers: judge only from feel, pain and illness */
  simple?: boolean;
}): Readiness {
  const { today, profile, series, activities, feedback, simple } = opts;
  const t = ymd(today);
  const day = series.find((d) => d.date === t) ?? series[series.length - 1];
  const tsb = day ? day.tsb : 0;
  const ratio = acwr(activities, today);
  const basedOn: string[] = [];
  if (day && !simple) basedOn.push(`Form ${tsb >= 0 ? '+' : ''}${tsb.toFixed(0)} (fitness ${day.ctl.toFixed(0)}, fatigue ${day.atl.toFixed(0)})`);
  if (ratio.chronicWeekly > 0 && !simple)
    basedOn.push(`Last 7 days ${(ratio.acute / 1000).toFixed(0)} km against a 4-week average of ${(ratio.chronicWeekly / 1000).toFixed(0)} km (ratio ${ratio.ratio.toFixed(2)})`);

  const cross = (profile.log ?? []).filter((e) => e.kind === 'cross' && e.minutes && e.date <= t && daysApart(e.date, t) < 7);
  if (cross.length && !simple) basedOn.push(`Cross-training in the last 7 days: ${cross.reduce((n, e) => n + (e.minutes ?? 0), 0)} min, counted in fitness and fatigue`);

  const recentFb = feedback
    .filter((f) => (today.getTime() - new Date(f.loggedAt).getTime()) / 86400000 <= 3)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const redFlag = recentFb.flatMap((f) => f.pain).find((p) => /chest|dizz/i.test(p.area));
  const pain = recentFb.flatMap((f) => f.pain).filter((p) => p.severity >= 2);
  const lastFeel = recentFb[0]?.feel;
  if (lastFeel) basedOn.push(`You rated your last run ${['', 'very hard', 'hard', 'okay', 'good', 'great'][lastFeel]}`);

  if (profile.illnessUntil && profile.illnessUntil >= t) {
    return {
      level: 'recovery',
      label: 'Recovery day',
      summary: 'You told us you are unwell, so today is for rest. Training resumes gently once you feel better.',
      basedOn: ['Illness reported', ...basedOn],
    };
  }
  if (redFlag) {
    return {
      level: 'recovery',
      label: 'Recovery day',
      summary: 'You reported chest pain, dizziness or feeling faint. Please do not run until you have spoken to a doctor.',
      basedOn: ['Worrying symptom logged after a run', ...basedOn],
    };
  }
  if (pain.length) {
    return {
      level: 'recovery',
      label: 'Recovery day',
      summary: `You logged ${pain[0].area.toLowerCase()} pain recently. Rest or walk today, and see a physio or doctor if it persists.`,
      basedOn: [`Pain logged: ${pain.map((p) => p.area).join(', ')}`, ...basedOn],
    };
  }
  if (simple) {
    if (lastFeel && lastFeel <= 1) return { level: 'easy', label: 'Take it easy', summary: 'Your last run felt very hard. Today is about recovering, so keep anything you do gentle.', basedOn };
    return { level: 'ready', label: 'Ready to train', summary: 'Nothing is holding you back today. Go by feel and keep it easy.', basedOn: basedOn.length ? basedOn : ['How your recent runs felt, and no pain or illness logged'] };
  }
  if (tsb < -25 || ratio.ratio > 1.5) {
    return {
      level: 'easy',
      label: 'Take it easy',
      summary: ratio.ratio > 1.5
        ? 'Your last week was a big jump on your usual volume. Keep today short and relaxed to let your body catch up.'
        : 'Fatigue is high after recent training. Keep today relaxed so the work can sink in.',
      basedOn,
    };
  }
  if (tsb < -12 && lastFeel && lastFeel <= 2) {
    return { level: 'easy', label: 'Take it easy', summary: 'Your last run felt hard and fatigue is building. Keep today gentle.', basedOn };
  }
  return {
    level: 'ready',
    label: 'Ready to train',
    summary: tsb > 5 ? 'You are fresh and absorbing training well. A good day for quality work.' : 'Fatigue is in a healthy range for the work you are doing.',
    basedOn,
  };
}
