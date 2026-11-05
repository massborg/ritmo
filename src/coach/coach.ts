// The Ritmo coach. Answers are built only from the runner's computed data (facts), never invented numbers.
// When the Supabase "coach" function is configured with a Claude API key, it phrases answers from the same facts.
import type { Activity, PlannedSession, Profile, Race } from '../lib/types';
import { daysBetween, distanceLabel, duration, parseYmd, pace, paceRange, type Units } from '../lib/format';
import type { FitnessEstimate, TrainingPaces } from '../training/fitness';
import type { Readiness } from '../training/load';
import type { RaceReadiness } from '../training/insights';
import type { Analysis } from '../training/analysis';
import { PHASE_EXPLAIN, PHASE_LABEL } from '../training/plan';
import { supabase } from '../data/supabase';

export interface CoachContext {
  today: Date;
  profile: Profile;
  units: Units;
  readiness: Readiness;
  todaySession?: PlannedSession;
  nextSessions: PlannedSession[];
  race?: Race;
  raceReadiness?: RaceReadiness;
  fitness?: FitnessEstimate;
  paces?: TrainingPaces;
  weekDoneM: number;
  weekPlannedM: number;
  last?: { activity: Activity; analysis: Analysis };
  hasData: boolean;
}

export interface CoachReply { text: string; facts: string[] }

export function buildFacts(c: CoachContext): string[] {
  const f: string[] = [];
  const U = c.units;
  f.push(`Today is ${c.today.toDateString()}.`);
  f.push(`Readiness: ${c.readiness.label}. ${c.readiness.summary} Based on: ${c.readiness.basedOn.join('; ')}.`);
  if (c.todaySession) {
    const s = c.todaySession;
    f.push(`Today's planned session: ${s.title} (${s.focus}), ${s.distanceM ? `${(s.distanceM / 1000).toFixed(1)} km` : 'no running'}, phase ${PHASE_LABEL[s.phase]}. Purpose: ${s.purpose} Steps: ${s.steps.map((x) => `${x.label} ${x.detail}`).join('; ')}.`);
  }
  if (c.nextSessions.length) f.push(`Next sessions: ${c.nextSessions.map((s) => `${s.date} ${s.title}`).join('; ')}.`);
  f.push(`This week so far: ${(c.weekDoneM / 1000).toFixed(1)} km of ${(c.weekPlannedM / 1000).toFixed(1)} km planned.`);
  if (c.fitness && c.paces) {
    f.push(`Fitness estimate VDOT ${c.fitness.vdot}, based on ${c.fitness.basedOn} (confidence ${c.fitness.confidence}).`);
    f.push(`Paces: easy ${paceRange(c.paces.easy[0], c.paces.easy[1], U)}, marathon ${paceRange(c.paces.marathon[0], c.paces.marathon[1], U)}, threshold ${paceRange(c.paces.threshold[0], c.paces.threshold[1], U)}, interval ${paceRange(c.paces.interval[0], c.paces.interval[1], U)}.`);
  }
  if (c.race) {
    const d = daysBetween(c.today, parseYmd(c.race.date));
    f.push(`Next A race: ${c.race.name}, ${distanceLabel(c.race.distanceM)}, ${c.race.date} (${d} days away)${c.race.goalS ? `, goal ${duration(c.race.goalS)}` : ''}.`);
    if (c.raceReadiness) f.push(`Predicted finish ${duration(c.raceReadiness.predictedS)}. Race readiness ${c.raceReadiness.score}/100: ${c.raceReadiness.parts.map((p) => `${p.label} ${p.value}`).join('; ')}.`);
  }
  if (c.last) {
    const a = c.last.activity, an = c.last.analysis;
    f.push(`Last run ${a.startTime.slice(0, 10)}: ${(a.distanceM / 1000).toFixed(1)} km in ${duration(a.movingS)}, ${an.type}, score ${an.score}. ${an.scoreReason}`);
  }
  const injuries = c.profile.injuries.filter((i) => i.status === 'current');
  if (injuries.length) f.push(`Current injuries: ${injuries.map((i) => i.area).join(', ')}.`);
  return f;
}

const PAIN = /(pain|hurt|injur|sore|ache|niggle|swollen|sprain|strain|shin|knee|achilles|calf|hamstring|plantar|hip|back)/i;
const MINUTES = /(\d{2,3})\s*(min|minutes|mins)/i;

export function localReply(q: string, c: CoachContext): CoachReply {
  const facts = buildFacts(c);
  const U = c.units;
  const s = c.todaySession;
  const lower = q.toLowerCase();

  if (!c.hasData) {
    return { text: 'I do not have any runs to work from yet. Upload your files or connect a source in Profile, and I can answer with your real numbers.', facts };
  }

  if (PAIN.test(lower)) {
    return {
      text: `I am sorry you are dealing with that. I can give coaching guidance, not medical advice. Stop running if the pain is sharp, makes you limp or gets worse as you go, and see a physio or doctor if it lasts more than a few days. In the meantime, log it on your last session so I can keep the next days easy. ${s && s.type !== 'rest' ? `For today, swap ${s.title.toLowerCase()} for rest or a walk.` : 'Today is already a rest day, which helps.'}`,
      facts,
    };
  }

  const mins = lower.match(MINUTES);
  if (mins || /only have|short on time|quick session|little time/.test(lower)) {
    const m = mins ? Number(mins[1]) : 30;
    const P = c.paces;
    if (!P) return { text: 'Run easy for that time. I need a few more runs with pace data to give you exact targets.', facts };
    let plan: string;
    if (c.readiness.level !== 'ready' || !s || ['easy', 'recovery', 'long', 'rest'].includes(s.type)) {
      plan = `Run ${m} minutes easy at ${paceRange(P.easy[0], P.easy[1], U)}${m >= 25 ? ', with 4 relaxed 20-second strides near the end if you feel good' : ''}.`;
    } else if (s.type === 'vo2max') {
      const reps = Math.max(3, Math.floor((m - 15) / 4));
      plan = `10 minutes easy, then ${reps} x 2 minutes at ${paceRange(P.interval[0], P.interval[1], U)} with 2 minutes jog, then 5 minutes easy.`;
    } else if (s.type === 'threshold' || s.type === 'tempo') {
      const work = Math.max(10, m - 18);
      plan = `10 minutes easy, then ${work} minutes ${s.type === 'tempo' ? `steady at ${paceRange(P.marathon[0], P.marathon[1], U)}` : `as ${Math.max(2, Math.round(work / 6))} x 5 minutes at ${paceRange(P.threshold[0], P.threshold[1], U)} with 1 minute jog`}, then 8 minutes easy.`;
    } else {
      plan = `10 minutes easy, 8 x 30 seconds uphill or fast with walk-back recovery, then easy to finish ${m} minutes.`;
    }
    return { text: `With ${m} minutes, keep the most valuable part of today and trim the rest. ${plan} A shorter session that keeps the key stimulus beats skipping it.`, facts };
  }

  if (/why.*(easy|rest|recovery|today)|what.*today|today'?s/.test(lower)) {
    if (!s) return { text: `There is no plan yet. Build one from Calendar and I will explain every session. Right now you are: ${c.readiness.label.toLowerCase()}. ${c.readiness.summary}`, facts };
    const reason = s.type === 'rest' ? 'Rest is when your body turns training into fitness.' : s.purpose;
    return {
      text: `Today is ${s.title.toLowerCase()} because you are in the ${PHASE_LABEL[s.phase].toLowerCase()} phase: ${PHASE_EXPLAIN[s.phase].toLowerCase()} ${reason} ${s.paceTarget ? `Aim for ${paceRange(s.paceTarget.minSPerKm, s.paceTarget.maxSPerKm, U)}${s.hrZones ? ` and keep heart rate in Z${s.hrZones.join(' to Z')}` : ''}.` : ''} Your status is "${c.readiness.label.toLowerCase()}": ${c.readiness.basedOn[0] ?? ''}.`,
      facts,
    };
  }

  if (/on track|ready|predict|goal|race|finish time|marathon|half|10k|5k/.test(lower)) {
    if (!c.race || !c.raceReadiness) return { text: 'Add a target race in Calendar and I will predict your finish time and track how ready you are.', facts };
    const r = c.raceReadiness, race = c.race;
    const days = daysBetween(c.today, parseYmd(race.date));
    const goal = race.goalS
      ? race.goalS >= r.predictedS ? `Your goal of ${duration(race.goalS)} is within reach: your current fitness predicts ${duration(r.predictedS)}.`
        : `Your fitness currently predicts ${duration(r.predictedS)}, ${Math.round((r.predictedS - race.goalS) / 60)} minutes slower than your goal of ${duration(race.goalS)}.`
      : `Your current fitness predicts ${duration(r.predictedS)}.`;
    const weak = r.parts.find((p) => !p.ok);
    return { text: `${goal} Race readiness is ${r.score} out of 100 with ${days} days to go. ${weak ? `The gap is ${weak.label.toLowerCase()} (${weak.value}).` : 'Every marker is where it should be.'} ${r.summary}`, facts };
  }

  if (/last run|yesterday|how did|my run/.test(lower) && c.last) {
    const an = c.last.analysis;
    return { text: `${an.scoreReason} ${an.wentWell[0]} ${an.improve[0] !== 'Nothing to change. Repeat this kind of execution.' ? `To improve: ${an.improve[0]}` : ''} ${an.nextDays}`, facts };
  }

  if (/week|mileage|volume|how much/.test(lower)) {
    const left = Math.max(0, c.weekPlannedM - c.weekDoneM);
    return { text: `You have run ${(c.weekDoneM / 1000).toFixed(1)} km this week of ${(c.weekPlannedM / 1000).toFixed(1)} km planned${left ? `, with ${(left / 1000).toFixed(1)} km to go` : ''}. ${c.nextSessions[0] ? `Next up: ${c.nextSessions[0].title.toLowerCase()} on ${parseYmd(c.nextSessions[0].date).toLocaleDateString('en-GB', { weekday: 'long' })}.` : ''}`, facts };
  }

  if (/threshold/.test(lower)) return { text: `Threshold is the fastest pace you can hold before lactate builds faster than your body clears it, roughly what you could race for an hour. Training there raises it, so every race pace feels easier. For you that is about ${c.paces ? paceRange(c.paces.threshold[0], c.paces.threshold[1], U) : 'comfortably hard'}.`, facts };
  if (/vo2|interval/.test(lower)) return { text: `VO2 max is the most oxygen your body can use. Intervals of 2 to 5 minutes near your 5K pace push it up. For you that is about ${c.paces ? paceRange(c.paces.interval[0], c.paces.interval[1], U) : 'hard but controlled'}.`, facts };
  if (/zone|heart rate/.test(lower)) return { text: 'Zones split your heart rate into five bands. Z1 and Z2 are easy and build your aerobic base, Z3 is steady tempo, Z4 is threshold, and Z5 is VO2 max. Around 80% of your running should be in Z1 and Z2.', facts };
  if (/easy pace|how slow/.test(lower) && c.paces) return { text: `Your easy pace is ${paceRange(c.paces.easy[0], c.paces.easy[1], U)}. If you can hold a conversation, you are in the right place. Easy days done easy let the hard days count.`, facts };
  if (/sick|ill|cold|flu|fever/.test(lower)) return { text: 'Use "I am unwell" in Profile and I will turn the next days into rest and ease you back in. Above the neck (a runny nose) an easy run is usually fine. With fever, chest symptoms or aches, rest until you have been symptom-free for a day.', facts };

  return {
    text: `Here is where you are: ${c.readiness.label.toLowerCase()}. ${s ? `Today is ${s.title.toLowerCase()}. ` : ''}You can ask me "Why is today easy?", "Am I on track?", "I only have 30 minutes, what should I do?", or "How did my last run go?"`,
    facts,
  };
}

/** Try the Claude-backed coach (Supabase function); fall back to local, grounded answers. */
export async function ask(q: string, c: CoachContext, history: { role: string; text: string }[]): Promise<CoachReply & { source: 'ai' | 'local' }> {
  const local = localReply(q, c);
  if (!supabase || !c.hasData || PAIN.test(q)) return { ...local, source: 'local' };
  try {
    const { data, error } = await supabase.functions.invoke('coach', {
      body: { question: q, facts: local.facts, draft: local.text, history: history.slice(-6) },
    });
    if (error || !data?.text) return { ...local, source: 'local' };
    return { text: data.text as string, facts: local.facts, source: 'ai' };
  } catch {
    return { ...local, source: 'local' };
  }
}

export { pace };
