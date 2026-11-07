// Race-day mode for A races: target splits for an even or negative-split strategy, a warm-up that suits the
// distance, what to eat and when, and afterwards a race report comparing the actual splits with the plan.
// General guidance only: nothing here is medical or individual nutrition advice.
import type { StreamPoint } from '../lib/types';
import { splits } from './analysis';

export type Strategy = 'even' | 'negative';
export interface TargetSplit { label: string; atM: number; segM: number; paceS: number; segS: number; cumS: number }

/** Split length: every kilometre up to the half, every 5 km beyond. */
export const splitStep = (distanceM: number) => (distanceM > 21100 ? 5000 : 1000);

/** Target splits that add up exactly to the target time. Negative: the first half about 2% slower than the second. */
export function targetSplits(distanceM: number, targetS: number, strategy: Strategy, stepM = splitStep(distanceM)): TargetSplit[] {
  const rows: Omit<TargetSplit, 'cumS'>[] = [];
  for (let at = stepM; at < distanceM + stepM; at += stepM) {
    const end = Math.min(at, distanceM), segM = end - (at - stepM);
    if (segM <= 0) break;
    const mid = (end - segM / 2) / distanceM;
    const w = strategy === 'negative' ? (mid < 0.5 ? 1.01 : 0.99) : 1;
    rows.push({ label: end === distanceM ? 'Finish' : `${+(end / 1000).toFixed(1)} km`, atM: end, segM, paceS: w, segS: 0 });
  }
  // Scale the weights so the segments add up to the target time
  const raw = rows.reduce((x, r) => x + r.paceS * (r.segM / 1000), 0);
  const k = targetS / raw;
  let cum = 0;
  return rows.map((r) => { const paceS = r.paceS * k, segS = paceS * (r.segM / 1000); cum += segS; return { ...r, paceS, segS, cumS: cum }; });
}

export interface WarmupStep { label: string; seconds: number; detail: string }
/** A warm-up that suits the distance: longer and sharper for short races, gentle for the marathon. */
export function warmup(distanceM: number): WarmupStep[] {
  if (distanceM >= 40000) return [
    { label: 'Easy jog', seconds: 6 * 60, detail: 'Very relaxed, just enough to loosen up. Save everything for the race.' },
    { label: 'Leg swings and mobility', seconds: 3 * 60, detail: 'Front-to-back and side-to-side swings, ankle circles.' },
    { label: 'Walk to the start', seconds: 5 * 60, detail: 'Stay warm, sip water, start at your planned pace.' },
  ];
  if (distanceM >= 20000) return [
    { label: 'Easy jog', seconds: 10 * 60, detail: 'Conversational pace.' },
    { label: 'Drills', seconds: 4 * 60, detail: 'High knees, heel flicks, skips: 20 metres each, walk back.' },
    { label: 'Strides', seconds: 3 * 60, detail: '3 x 15 seconds building to race pace, walk back between.' },
    { label: 'Walk to the start', seconds: 5 * 60, detail: 'Keep moving. Start at your planned pace, not faster.' },
  ];
  return [
    { label: 'Easy jog', seconds: 12 * 60, detail: 'Conversational pace, the last few minutes a little quicker.' },
    { label: 'Drills', seconds: 5 * 60, detail: 'High knees, heel flicks, skips, A-skips: 20 metres each.' },
    { label: 'Strides', seconds: 4 * 60, detail: '4 x 20 seconds at about race pace, full recovery between.' },
    { label: 'Walk to the start', seconds: 5 * 60, detail: 'Stay warm. Short races start fast: hold back for the first kilometre.' },
  ];
}

/** What to eat and when, by race distance. Practise all of it in training first. */
export function fuelling(distanceM: number): { when: string; what: string }[] {
  const long = distanceM >= 20000, marathon = distanceM >= 40000;
  return [
    ...(long ? [{ when: 'The day before', what: `Normal meals with a little more carbohydrate (rice, pasta, bread, potatoes)${marathon ? ', spread through the day' : ''}. Nothing new, not too much fibre.` }] : []),
    { when: '3 to 4 hours before', what: 'A familiar, carbohydrate-based breakfast you have eaten before training, such as toast, porridge or a bagel, with water.' },
    { when: '30 to 60 minutes before', what: long ? 'A small snack if you are hungry (a banana or a gel) and a few sips of water.' : 'Water to thirst. A small snack only if breakfast was early.' },
    ...(long ? [{ when: 'During the race', what: `${marathon ? 'From about 30 to 45 minutes in, take carbohydrate regularly (a gel or drink every 20 to 30 minutes)' : 'A gel or sports drink around halfway if you use them in training'} and drink to thirst at the water stations.` }] : [{ when: 'During the race', what: 'Nothing needed for a race this short; take water if it is hot.' }]),
    { when: 'Afterwards', what: 'Drink, and eat a meal with carbohydrate and protein within a couple of hours.' },
  ];
}

export interface ReportRow { label: string; targetS: number; actualS?: number; diffS?: number }
/** Actual splits against the plan, at the same split points. Undefined when the run has no usable stream. */
export function raceReport(streams: StreamPoint[] | undefined, plan: TargetSplit[]): { rows: ReportRow[]; summary: string } | undefined {
  if (!streams?.length || !plan.length) return undefined;
  const step = plan[0].segM;
  const actual = splits(streams, step);
  if (!actual.length) return undefined;
  const rows: ReportRow[] = plan.map((p, i) => {
    const a = actual[i];
    // Scale a short or long final segment to the planned length, so the comparison is like for like
    const actualS = a ? a.timeS * (p.segM / a.distanceM) : undefined;
    return { label: p.label, targetS: p.segS, actualS, diffS: actualS != null ? actualS - p.segS : undefined };
  });
  const done = rows.filter((r) => r.diffS != null);
  const half = Math.floor(done.length / 2);
  const first = done.slice(0, half).reduce((x, r) => x + r.diffS!, 0), second = done.slice(half).reduce((x, r) => x + r.diffS!, 0);
  const total = done.reduce((x, r) => x + r.diffS!, 0);
  const fmt = (s: number) => `${Math.round(Math.abs(s))} s`;
  const summary = `${Math.abs(total) < 5 ? 'Right on plan overall' : total < 0 ? `${fmt(total)} faster than plan overall` : `${fmt(total)} slower than plan overall`}. `
    + (first < -10 && second > 10 ? 'You went out faster than planned and paid for it later: next time hold back in the first half.'
      : first > 5 && second < -5 ? 'A strong second half: you ran a negative split.'
        : 'Your pacing was even through the race.');
  return { rows, summary };
}
