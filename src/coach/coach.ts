// The Ritmo coach. Answers are built only from the runner's computed data (facts), never invented numbers.
// When the Supabase "coach" function is configured with a Claude API key, it phrases answers from the same facts.
import type { Activity, PlannedSession, Profile, Race } from '../lib/types';
import { daysUntil, distanceLabel, duration, longDate, parseYmd, pace, paceRange, shortDate, type Units } from '../lib/format';
import type { StageInfo } from '../training/stage';
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
  stage: StageInfo;
  todaySession?: PlannedSession;
  nextSessions: PlannedSession[];
  race?: Race;
  raceReadiness?: RaceReadiness;
  fitness?: FitnessEstimate;
  paces?: TrainingPaces;
  weekDoneM: number;
  weekPlannedM: number;
  weekSessionsDone: number;
  weekSessionsPlanned: number;
  planSessionsDone: number;
  planSessionsTotal: number;
  runCount: number;
  last?: { activity: Activity; analysis: Analysis };
  hasData: boolean;
  /** Sessions from Monday this week to a week from today, so questions about a named day can be answered */
  weekAhead?: PlannedSession[];
  /** Target for this week, in km */
  weekTargetKm?: number;
  /** Longest easy run allowed, minutes */
  maxEasyMin?: number;
}

export interface CoachProposal { kind: 'move' | 'swap'; sessionId: string; toDate?: string; swap?: 'shorter' | 'easy'; label: string }
export interface CoachReply { text: string; facts: string[]; proposal?: CoachProposal }

export function buildFacts(c: CoachContext): string[] {
  const f: string[] = [];
  const U = c.units;
  f.push(`Today is ${longDate(c.today)}.`);
  f.push(c.runCount ? `Runs recorded: ${c.runCount}.` : 'No runs recorded yet.');
  if (c.stage.stage !== 'full') f.push(`Fitness stage: ${c.stage.stage}. Race predictions and fitness score are not available yet. ${c.stage.next}`);
  if (c.profile.experience === 'new') f.push(`New runner on a run/walk starter plan. Sessions completed: ${c.planSessionsDone} of ${c.planSessionsTotal}.`);
  f.push(`Readiness: ${c.readiness.label}. ${c.readiness.summary} Based on: ${c.readiness.basedOn.join('; ')}.`);
  if (c.todaySession) {
    const s = c.todaySession;
    f.push(`Today's planned session: ${s.title} (${s.focus}), ${s.distanceM ? `${(s.distanceM / 1000).toFixed(1)} km` : s.durationS ? `${Math.round(s.durationS / 60)} minutes` : 'no running'}, phase ${PHASE_LABEL[s.phase]}. Purpose: ${s.purpose} Steps: ${s.steps.map((x) => `${x.label} ${x.detail}`).join('; ')}.`);
  }
  if (c.weekAhead?.length) f.push(`This week and next days: ${c.weekAhead.map((x) => `${longDate(parseYmd(x.date))}: ${x.type === 'rest' ? 'rest' : `${x.title}, ${(x.distanceM / 1000).toFixed(1)} km`}${x.status === 'done' ? ' (done)' : x.status === 'missed' ? ' (missed)' : ''}`).join('; ')}.`);
  if (c.nextSessions.length) f.push(`Next sessions: ${c.nextSessions.map((s) => `${longDate(parseYmd(s.date))} ${s.title}`).join('; ')}.`);
  if (c.weekPlannedM > 0) f.push(`This week so far: ${(c.weekDoneM / 1000).toFixed(1)} km of ${(c.weekPlannedM / 1000).toFixed(1)} km planned.`);
  if (c.weekSessionsPlanned) f.push(`Sessions this week: ${c.weekSessionsDone} of ${c.weekSessionsPlanned} done.`);
  if (c.fitness && c.paces) {
    f.push(`Fitness estimate VDOT ${c.fitness.vdot.toFixed(1)}, based on ${c.fitness.basedOn} (confidence ${c.fitness.confidence}).`);
    f.push(`Paces: easy ${paceRange(c.paces.easy[0], c.paces.easy[1], U)}, marathon ${paceRange(c.paces.marathon[0], c.paces.marathon[1], U)}, threshold ${paceRange(c.paces.threshold[0], c.paces.threshold[1], U)}, interval ${paceRange(c.paces.interval[0], c.paces.interval[1], U)}.`);
  }
  if (c.race) {
    const d = daysUntil(c.today, c.race.date);
    f.push(`Next A race: ${c.race.name}, ${distanceLabel(c.race.distanceM)}, ${shortDate(parseYmd(c.race.date))} (${d} days away)${c.race.goalS ? `, goal ${duration(c.race.goalS)}` : ''}.`);
    if (c.raceReadiness) f.push(`Predicted finish ${duration(c.raceReadiness.predictedS)}. Race readiness ${c.raceReadiness.score}/100: ${c.raceReadiness.parts.map((p) => `${p.label} ${p.value}`).join('; ')}.`);
  }
  if (c.last) {
    const a = c.last.activity, an = c.last.analysis;
    f.push(`Last run ${shortDate(new Date(a.startTime))}: ${(a.distanceM / 1000).toFixed(1)} km in ${duration(a.movingS)}, ${an.type}, score ${an.score}. ${an.scoreReason}`);
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
    return { text: 'I do not have any runs or a plan to work from yet. Choose "I\'m new to running" for a starter plan, log a run, or upload your files, and I can answer with your real data.', facts };
  }

  if (/chest pain|chest tight|dizz|faint|palpitat|short of breath|can't breathe|cannot breathe/.test(lower)) {
    return { text: 'Please stop exercising. Chest pain, dizziness, fainting or unusual breathlessness need medical advice before you run again. If it is severe or happening now, call your local emergency number. I can give coaching guidance, not medical advice.', facts };
  }

  // Requests to change the plan: propose the change, the runner confirms with one tap
  const edit = planEdit(lower, c);
  if (edit) return { ...edit, facts };

  // Questions about a particular day: answer with that session's real numbers
  const dayRef = namedDay(lower, c);
  if (dayRef && c.weekAhead?.length) {
    let ses = c.weekAhead.find((x) => x.date === dayRef);
    let dayName = longDate(parseYmd(dayRef));
    let lead = '';
    if (!ses) {
      // Nothing planned that day (for example before the plan started): talk about the coming one instead
      const next = new Date(parseYmd(dayRef)); next.setDate(next.getDate() + 7);
      const nextIso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      ses = c.weekAhead.find((x) => x.date === nextIso);
      if (!ses) return { text: `There is nothing planned on ${dayName}.`, facts };
      lead = `Nothing was planned on ${dayName}. `;
      dayName = longDate(next);
    }
    if (ses.type === 'rest') return { text: `${lead}${dayName} is a rest day. ${ses.purpose}`, facts: [...facts, `${dayName}: rest day.`] };
    const km = (ses.distanceM / 1000).toFixed(1);
    const parts = ses.steps.filter((x) => x.label !== 'Rest').map((x) => `${x.label} ${x.detail}`).join('; ');
    const wkShare = c.weekTargetKm ? ` That is ${Math.round(ses.distanceM / 10 / c.weekTargetKm)}% of this week's ${c.weekTargetKm} km.` : '';
    const limits = /(km|long|far|distance|so much|big)/.test(lower) && (ses.type === 'easy' || ses.type === 'recovery')
      ? ` Easy runs are capped at ${c.maxEasyMin ?? 90} minutes and no run is more than about a third of your week, so it will never be stretched to fill your weekly total.` : '';
    return {
      text: `${lead}${dayName} is ${ses.title.toLowerCase()}: ${km} km, about ${Math.round(ses.durationS / 60)} minutes (${parts}). ${ses.purpose} It is in the ${PHASE_LABEL[ses.phase].toLowerCase()} phase: ${PHASE_EXPLAIN[ses.phase].toLowerCase()}${wkShare}${limits}`,
      facts: [...facts, `${dayName}: ${ses.title}, ${km} km, ${Math.round(ses.durationS / 60)} min. Steps: ${parts}.`],
    };
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
    if (s?.type === 'runwalk') {
      const main = s.steps[1]?.label ?? 'your run/walk intervals';
      return { text: `With ${m} minutes, keep the 5-minute walking warm-up and cool-down and do as much of ${main.toLowerCase()} as fits in between. Stopping early is fine: a shorter session still counts and keeps your routine going.`, facts };
    }
    if (!P) return { text: `Go for ${m} minutes at an easy, conversational effort, walking whenever you need to. Pace targets appear once you have logged a few runs.`, facts };
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
    if (s.type === 'runwalk') return { text: `Today is ${s.title.toLowerCase()}. ${s.purpose} ${s.howItHelps} Keep the running easy enough to talk, and walk the walking breaks.`, facts };
    return {
      text: `Today is ${s.title.toLowerCase()} because you are in the ${PHASE_LABEL[s.phase].toLowerCase()} phase: ${PHASE_EXPLAIN[s.phase].toLowerCase()} ${reason} ${s.paceTarget ? `Aim for ${paceRange(s.paceTarget.minSPerKm, s.paceTarget.maxSPerKm, U)}${s.hrZones ? ` and keep heart rate in Z${s.hrZones.join(' to Z')}` : ''}.` : ''} Your status is "${c.readiness.label.toLowerCase()}": ${c.readiness.basedOn[0] ?? ''}.`,
      facts,
    };
  }

  if (/on track|ready|predict|goal|race|finish time|marathon|half|10k|5k/.test(lower)) {
    if (!c.stage.predictions) {
      const progress = c.planSessionsTotal ? ` You have completed ${c.planSessionsDone} of ${c.planSessionsTotal} sessions in your plan${c.weekSessionsPlanned ? `, and ${c.weekSessionsDone} of ${c.weekSessionsPlanned} this week` : ''}.` : '';
      return { text: `${c.runCount ? `You have logged ${c.runCount} run${c.runCount > 1 ? 's' : ''}.` : 'You have not logged a run yet.'}${progress} Turning up regularly is what matters most right now. ${c.stage.next}`, facts };
    }
    if (!c.race || !c.raceReadiness) return { text: 'Add a target race in Calendar and I will predict your finish time and track how ready you are.', facts };
    const r = c.raceReadiness, race = c.race;
    const days = daysUntil(c.today, race.date);
    const gap = race.goalS ? r.predictedS - race.goalS : 0; // positive: prediction slower than goal
    const gapWords = (sec: number) => (Math.abs(sec) < 90 ? `${Math.round(Math.abs(sec))} seconds` : `${Math.round(Math.abs(sec) / 60)} minutes`);
    const goal = race.goalS
      ? gap <= 0 ? `Your goal of ${duration(race.goalS)} is within reach: your current fitness predicts ${duration(r.predictedS)}.`
        : `Your fitness currently predicts ${duration(r.predictedS)}, ${gapWords(gap)} slower than your goal of ${duration(race.goalS)}.`
      : `Your current fitness predicts ${duration(r.predictedS)}.`;
    const weak = r.parts.find((p) => !p.ok);
    return { text: `${goal} Race readiness is ${r.score} out of 100 with ${days} days to go. ${weak ? `The gap is ${weak.label.toLowerCase()} (${weak.value}).` : 'Every marker is where it should be.'} ${r.summary}`, facts };
  }

  if (/last run|yesterday|how did|my run/.test(lower) && !c.last) {
    return { text: 'You have not logged a run yet. After your first session, tap "I did it" on Today and I will tell you how it went.', facts };
  }
  if (/last run|yesterday|how did|my run/.test(lower) && c.last) {
    const an = c.last.analysis;
    return { text: `${an.scoreReason} ${an.wentWell[0]} ${an.improve[0] !== 'Nothing to change. Repeat this kind of execution.' ? `To improve: ${an.improve[0]}` : ''} ${an.nextDays}`, facts };
  }

  if (/week|mileage|volume|how much/.test(lower) && c.weekPlannedM === 0) {
    return { text: `${c.weekSessionsPlanned ? `You have done ${c.weekSessionsDone} of ${c.weekSessionsPlanned} sessions this week.` : 'There are no sessions planned this week.'} ${c.nextSessions[0] ? `Next up: ${c.nextSessions[0].title.toLowerCase()} on ${longDate(parseYmd(c.nextSessions[0].date))}.` : ''}`, facts };
  }
  if (/week|mileage|volume|how much/.test(lower)) {
    const left = Math.max(0, c.weekPlannedM - c.weekDoneM);
    return { text: `You have run ${(c.weekDoneM / 1000).toFixed(1)} km this week of ${(c.weekPlannedM / 1000).toFixed(1)} km planned${left ? `, with ${(left / 1000).toFixed(1)} km to go` : ''}. ${c.nextSessions[0] ? `Next up: ${c.nextSessions[0].title.toLowerCase()} on ${parseYmd(c.nextSessions[0].date).toLocaleDateString('en-GB', { weekday: 'long' })}.` : ''}`, facts };
  }

  if (/threshold/.test(lower)) return { text: `Threshold is the fastest pace you can hold before lactate builds faster than your body clears it, roughly what you could race for an hour. Training there raises it, so every race pace feels easier. For you that is about ${c.paces ? paceRange(c.paces.threshold[0], c.paces.threshold[1], U) : 'comfortably hard'}.`, facts };
  if (/vo2|interval/.test(lower)) return { text: `VO2 max is the most oxygen your body can use. Intervals of 2 to 5 minutes near your 5K pace push it up. For you that is about ${c.paces ? paceRange(c.paces.interval[0], c.paces.interval[1], U) : 'hard but controlled'}.`, facts };
  if (/zone|heart rate/.test(lower)) return { text: 'Zones split your heart rate into five bands. Z1 and Z2 are easy and build your aerobic base, Z3 is steady tempo, Z4 is threshold, and Z5 is VO2 max. Around 80% of your running should be in Z1 and Z2.', facts };
  if (/how fast should i run|how fast|run\/walk instead|why run.walk/.test(lower)) {
    return { text: c.paces ? `Run your easy running at ${paceRange(c.paces.easy[0], c.paces.easy[1], U)}, or slower. If you can talk in full sentences, the pace is right.` : 'Slowly enough to talk in full sentences. Walking breaks let your heart, lungs, muscles and tendons adapt gradually, which is how new runners avoid injury. Pace targets appear once you have logged a few runs.', facts };
  }
  if (/easy pace|how slow/.test(lower) && c.paces) return { text: `Your easy pace is ${paceRange(c.paces.easy[0], c.paces.easy[1], U)}. If you can hold a conversation, you are in the right place. Easy days done easy let the hard days count.`, facts };
  if (/sick|ill|cold|flu|fever/.test(lower)) return { text: 'Use "I am unwell" in Profile and I will turn the next days into rest and ease you back in. Above the neck (a runny nose) an easy run is usually fine. With fever, chest symptoms or aches, rest until you have been symptom-free for a day.', facts };

  return {
    text: `Here is where you are: ${c.readiness.label.toLowerCase()}. ${s ? `Today is ${s.title.toLowerCase()}. ` : ''}You can ask me ${suggestions(s, !!c.last).map((x) => `"${x}"`).join(', ')}.`,
    facts,
  };
}

/** Try the Claude-backed coach (Supabase function); fall back to local, grounded answers. */
/**
 * Answers from the built-in coach, optionally rewritten by the AI coach. The AI is used only when the
 * person has agreed to it (useAi). Only training facts are sent: never the profile picture, name or email.
 */
export async function ask(q: string, c: CoachContext, history: { role: string; text: string }[], useAi = false): Promise<CoachReply & { source: 'ai' | 'local' }> {
  const local = localReply(q, c);
  if (!supabase || !useAi || !c.hasData || PAIN.test(q)) return { ...local, source: 'local' };
  try {
    const { data, error } = await supabase.functions.invoke('coach', {
      body: { question: q, facts: local.facts, draft: local.text, history: history.slice(-6) },
    });
    const status = (error as { context?: Response } | null)?.context?.status;
    if (status === 429) return { ...local, text: `${local.text}\n\nYou have asked the AI coach a lot of questions recently, so this answer comes from Ritmo's built-in coach. AI answers will be back shortly.`, source: 'local' };
    if (error || !data?.text) return { ...local, source: 'local' };
    return { text: data.text as string, facts: local.facts, proposal: local.proposal, source: 'ai' };
  } catch {
    return { ...local, source: 'local' };
  }
}

export { pace };

/** Suggested questions that match today's session and what data exists. */
export function suggestions(s: PlannedSession | undefined, hasRuns: boolean): string[] {
  const why = !s ? 'What should I do today?'
    : s.type === 'rest' ? 'Why is today a rest day?'
    : s.type === 'easy' || s.type === 'recovery' ? 'Why is today easy?'
    : s.type === 'long' ? 'Why does the long run matter?'
    : s.type === 'runwalk' ? 'Why run/walk instead of running?'
    : s.type === 'race' ? 'How should I pace today?'
    : `Why is today ${s.focus.toLowerCase()}?`;
  const out = [why, 'Am I on track?'];
  if (s && s.type !== 'rest') out.push('I only have 30 minutes, what should I do?');
  if (hasRuns) out.push('How did my last run go?');
  out.push(s?.type === 'runwalk' || !s ? 'How fast should I run?' : 'What is threshold pace?');
  return out;
}

const DAY_WORDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
/** The date a question refers to ("Thursday", "tomorrow", "today"), within this week or the next seven days */
export function namedDay(lower: string, c: CoachContext): string | undefined {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const add = (n: number) => { const d = new Date(c.today); d.setDate(d.getDate() + n); return iso(d); };
  if (/\btomorrow\b/.test(lower)) return add(1);
  if (/\byesterday\b/.test(lower)) return add(-1);
  const i = DAY_WORDS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (i < 0) return undefined;
  const todayIdx = (c.today.getDay() + 6) % 7;
  // "Thursday" means this week's Thursday (as on the week view); "next Thursday" means the coming one
  const diff = i - todayIdx;
  return add(/\bnext\b/.test(lower) ? (diff > 0 ? diff : diff + 7) : diff);
}

const HARD_T = ['long', 'threshold', 'vo2max', 'tempo', 'hills', 'race'];
/** "Move Thursday to Friday", "make tomorrow easier", "swap Saturday for an easy run" */
function planEdit(lower: string, c: CoachContext): { text: string; proposal?: CoachProposal } | undefined {
  if (!c.weekAhead?.length) return undefined;
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayOf = (word: string): string | undefined => {
    if (word === 'today') return iso(c.today);
    if (word === 'tomorrow') { const d = new Date(c.today); d.setDate(d.getDate() + 1); return iso(d); }
    const i = DAY_WORDS.indexOf(word);
    if (i < 0) return undefined;
    const diff = i - (c.today.getDay() + 6) % 7;
    const d = new Date(c.today); d.setDate(d.getDate() + (diff >= 0 ? diff : diff + 7)); return iso(d);
  };
  const words = '(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
  const mv = lower.match(new RegExp(`\\b(?:move|shift|swap|change)\\b.*?${words}.*?\\b(?:to|for|with)\\b.*?${words}`));
  if (mv) {
    const from = dayOf(mv[1]);
    // The target day is in the same week as the session being moved (never in the past)
    let to = dayOf(mv[2]);
    const wi = DAY_WORDS.indexOf(mv[2]);
    if (from && wi >= 0) {
      const f = parseYmd(from); const monday = new Date(f); monday.setDate(f.getDate() - ((f.getDay() + 6) % 7));
      const cand = new Date(monday); cand.setDate(monday.getDate() + wi);
      to = iso(cand) < iso(c.today) ? iso(new Date(cand.getTime() + 7 * 86400000)) : iso(cand);
    }
    const s = c.weekAhead.find((x) => x.date === from);
    if (!s || !to || s.type === 'rest' || s.type === 'race') return { text: `There is no session to move on ${from ? longDate(parseYmd(from)) : 'that day'}.` };
    const near = c.weekAhead.filter((x) => x.id !== s.id && x.date !== from && Math.abs((parseYmd(x.date).getTime() - parseYmd(to).getTime()) / 86400000) === 1);
    const clash = HARD_T.includes(s.type) && near.some((x) => HARD_T.includes(x.type));
    return {
      text: `I can move ${s.title.toLowerCase()} from ${longDate(parseYmd(from!))} to ${longDate(parseYmd(to))}. ${c.weekAhead.find((x) => x.date === to && x.type !== 'rest') ? 'The session on that day moves to the other day.' : ''}${clash ? ' Note: that puts two hard days back to back, so take the second one easier.' : ''}`,
      proposal: { kind: 'move', sessionId: s.id, toDate: to, label: `Move it to ${longDate(parseYmd(to))}` },
    };
  }
  const ez = lower.match(new RegExp(`\\b(?:make|can i make|swap|turn|change)\\b.*?${words}.*?\\b(easier|easy|shorter|short|lighter)\\b`)) ?? lower.match(new RegExp(`\\b(easier|shorter|lighter)\\b.*?${words}`));
  if (ez) {
    const word = DAY_WORDS.includes(ez[1]) || ez[1] === 'today' || ez[1] === 'tomorrow' ? ez[1] : ez[2];
    const kindWord = word === ez[1] ? ez[2] : ez[1];
    const d = dayOf(word);
    const s = c.weekAhead.find((x) => x.date === d);
    if (!s || s.type === 'rest' || s.type === 'race') return { text: `There is nothing to change on ${d ? longDate(parseYmd(d)) : 'that day'}.` };
    const shorter = /short/.test(kindWord) || s.type === 'easy' || s.type === 'recovery';
    return {
      text: shorter ? `I can make ${s.title.toLowerCase()} on ${longDate(parseYmd(d!))} about 30% shorter, keeping its key part.` : `I can turn ${s.title.toLowerCase()} on ${longDate(parseYmd(d!))} into an easy run. One easier day costs very little.`,
      proposal: { kind: 'swap', sessionId: s.id, swap: shorter ? 'shorter' : 'easy', label: shorter ? 'Make it shorter' : 'Make it an easy run' },
    };
  }
  return undefined;
}
