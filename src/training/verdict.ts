// The verdict card on a run's feedback page: a short title, one sentence on what the run was for, and a checklist
// of three to five things that went right or need changing. It judges the run that was actually run (a quality
// session run easy is checked as an easy run), and reads only numbers already worked out by analyse and buildReport,
// so it never disagrees with them.
import type { Activity, SessionType } from '../lib/types';
import { pace as fmtPace, paceRange, type Units } from '../lib/format';
import { EASY_FAMILY, STEADY_TYPES, TYPE_LABEL, type Analysis } from './analysis';
import type { Report } from './report';
import { type TrainingPaces, zoneOf } from './fitness';

export interface VerdictCheck { ok: boolean; label: string; detail?: string }
export interface Verdict { title: string; meaning: string; zone?: number; checks: VerdictCheck[] }

const MEANING: Record<SessionType, string> = {
  easy: 'Easy running builds your aerobic base without adding much fatigue.',
  recovery: 'A recovery run keeps you moving while your body absorbs harder work.',
  long: 'The long run builds endurance and teaches your body to use fuel well.',
  strides: 'Easy running with short, relaxed strides keeps your legs quick.',
  runwalk: 'Run-walk builds the habit and your durability, step by step.',
  tempo: 'Tempo running lifts the pace you can hold comfortably for longer.',
  threshold: 'Threshold work raises the pace you can hold before tiring fast.',
  vo2max: 'Intervals raise your top-end aerobic fitness.',
  speed: 'Short fast reps sharpen your speed and running form.',
  hills: 'Hill reps build strength and power with less pounding.',
  race: 'A race is the truest test of your fitness.',
  timetrial: 'A time trial measures your fitness so your paces stay right.',
  rest: 'Rest is when training turns into fitness.',
};

const kmOf = (m: number) => (m / 1000).toFixed(1);

export function buildVerdict(o: {
  a: Activity; an: Analysis; rep: Report; paces?: TrainingPaces; zones?: { zone: number; min: number; max: number }[];
  units: Units; hrSuspect?: boolean;
}): Verdict {
  const { a, an, rep, paces, zones, units } = o;
  const type = an.type;
  const P = (s: number) => fmtPace(s, units);
  const avgPace = a.movingS / (a.distanceM / 1000);
  const zone = a.avgHr && zones ? zoneOf(a.avgHr, zones) : undefined;
  const checks: VerdictCheck[] = [];
  const planned = an.planned;
  const pat = an.patterns;

  const distanceCheck = () => {
    if (!planned?.distanceM || planned.type === 'rest') return;
    const r = a.distanceM / planned.distanceM;
    const of = `${kmOf(a.distanceM)} of ${kmOf(planned.distanceM)} km`;
    if (r >= 0.9 && r <= 1.15) checks.push({ ok: true, label: 'Distance as planned', detail: of });
    else if (r < 0.9) checks.push({ ok: false, label: 'Shorter than planned', detail: `${of}. That's fine now and then; if it keeps happening, tell Ritmo so the plan can shrink.` });
    else checks.push({ ok: false, label: 'Longer than planned', detail: `${of}. Extra distance adds fatigue; stick closer to the plan to stay fresh for the next session.` });
  };
  const driftCheck = () => {
    if (pat.hrDriftPct == null) return;
    // Same limits as analyse: under 4% is steady, up to 7% is normal on longer runs, above 7% costs points
    if (pat.hrDriftPct < 4) checks.push({ ok: true, label: 'Heart rate steady', detail: `Drift ${Math.max(0, pat.hrDriftPct)}%` });
    else if (pat.hrDriftPct <= 7) checks.push({ ok: true, label: 'Heart rate fairly steady', detail: `Drift ${pat.hrDriftPct}%, normal on a longer run` });
    else checks.push({ ok: false, label: 'Heart rate drifted', detail: `Drift ${pat.hrDriftPct}%. Heat, low fuel or a fast start usually cause it: drink, eat, and start easier.` });
  };

  if (EASY_FAMILY.includes(type)) {
    // An easy run: pace in (or slower than) the easy range, heart rate low and steady, distance, and a relaxed finish is fine
    const range: [number, number] | undefined = planned?.paceTarget ? [planned.paceTarget.minSPerKm, planned.paceTarget.maxSPerKm]
      : paces ? (type === 'long' ? paces.long : type === 'recovery' ? paces.recovery : paces.easy) : undefined;
    let fast = false;
    if (range) {
      const r = paceRange(range[0], range[1], units);
      if (avgPace < range[0] - 3) { fast = true; checks.push({ ok: false, label: 'Quicker than your easy range', detail: `${P(avgPace)} · range ${r}. Slow down next time: easy days should feel chatty.` }); }
      else if (avgPace > range[1] + 3) checks.push({ ok: true, label: 'Slower than your easy range is fine', detail: `${P(avgPace)} · range ${r}` });
      else checks.push({ ok: true, label: 'Pace in your easy range', detail: `${P(avgPace)} · range ${r}` });
    }
    if (pat.easyTooHardPct != null && pat.easyTooHardPct > 25) {
      checks.push(o.hrSuspect
        ? { ok: false, label: 'Heart rate reads high', detail: `${pat.easyTooHardPct}% above Z2 at an easy pace. Your heart rate settings are the likely cause: check them below.` }
        : { ok: false, label: 'Heart rate ran high', detail: `${pat.easyTooHardPct}% of the time above Z2. Slow down until it settles in Z1–Z2.` });
    }
    // Without heart rate over time, the average still says something
    if (pat.easyTooHardPct == null && a.avgHr && zone) {
      if (zone <= 2) checks.push({ ok: true, label: 'Heart rate in Z1–Z2', detail: `Average ${a.avgHr} bpm` });
      else checks.push(o.hrSuspect
        ? { ok: false, label: 'Heart rate reads high', detail: `Average ${a.avgHr} bpm (Z${zone}) at an easy pace. Your heart rate settings are the likely cause: check them below.` }
        : { ok: false, label: 'Heart rate ran high', detail: `Average ${a.avgHr} bpm (Z${zone}). Slow down until it settles in Z1–Z2.` });
    }
    driftCheck();
    if (pat.hrDriftPct == null && pat.easyTooHardPct != null && pat.easyTooHardPct <= 25) checks.push({ ok: true, label: 'Heart rate mostly Z1–Z2', detail: `${100 - pat.easyTooHardPct}% of the time` });
    distanceCheck();
    if (pat.fadePct != null) checks.push({ ok: true, label: pat.fadePct > 3 ? 'Relaxed finish is fine' : pat.fadePct < -3 ? 'Finished strong' : 'Even pace throughout' });
    const bad = checks.filter((c) => !c.ok).length;
    const name = TYPE_LABEL[type].toLowerCase();
    const title = bad === 0 ? `Good ${name}` : fast ? `${cap(name)}, a little quick` : bad === 1 ? `${cap(name)}, mostly on track` : `${cap(name)}, worth adjusting`;
    return { title, meaning: MEANING[type], zone, checks: checks.slice(0, 5) };
  }

  // Quality sessions, races and time trials: the score breakdown as a checklist, plus pacing on steady runs
  for (const b of rep.breakdown) {
    const ok = b.value >= 75;
    if (b.key === 'pace') checks.push({ ok, label: ok ? 'Pace on target' : 'Pace off target', detail: ok ? b.note : `${b.note}. Aim for the middle of the range next time.` });
    else if (b.key === 'consistency') checks.push({ ok, label: ok ? 'Even pacing' : 'Pace faded', detail: ok ? b.note : `${b.note}. Start a little slower so you can hold it.` });
    else if (b.key === 'effort') checks.push({ ok, label: ok ? 'Effort under control' : 'Effort ran high', detail: b.note });
    else if (b.key === 'recovery') checks.push({ ok, label: ok ? 'Recoveries easy enough' : 'Recoveries too fast', detail: ok ? b.note : `${b.note}. Jog slower between reps so the reps stay fast.` });
    else if (b.key === 'completion') checks.push({ ok, label: ok ? 'Session completed' : 'Session cut short', detail: b.note });
  }
  if (!rep.breakdown.some((b) => b.key === 'effort')) driftCheck();
  if (STEADY_TYPES.includes(type) && !rep.breakdown.some((b) => b.key === 'consistency') && pat.fadePct != null) {
    checks.push(pat.fadePct <= 3 ? { ok: true, label: 'Even pacing', detail: pat.fadePct > 0 ? `Last 20% ${pat.fadePct}% slower` : 'Even or faster at the end' }
      : { ok: false, label: 'Pace faded', detail: `Last 20% ${pat.fadePct}% slower. Start a little slower so you can hold it.` });
  }
  const bad = checks.filter((c) => !c.ok).length;
  const name = TYPE_LABEL[type].toLowerCase();
  const title = type === 'race' || type === 'timetrial'
    ? `${TYPE_LABEL[type]} done`
    : bad === 0 ? (an.score >= 85 ? `Strong ${name}` : `Good ${name}`) : bad === 1 ? `Solid ${name}` : `Tough ${name}`;
  return { title, meaning: MEANING[type], zone, checks: checks.slice(0, 5) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
