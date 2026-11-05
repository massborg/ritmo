// Which fitness features are unlocked. Numbers are only shown when there is enough data to make them honest.
import type { Activity } from '../lib/types';
import type { FitnessEstimate } from './fitness';

export type FitnessStage = 'starter' | 'building' | 'full';

export interface StageInfo {
  stage: FitnessStage;
  runs: number; // runs with time and distance in the last 90 days
  /** What unlocks next, in plain words */
  next: string;
  /** Pace targets can be shown (estimated in "building", measured in "full") */
  paces: boolean;
  /** VDOT, race predictions, readiness score, form and training load */
  predictions: boolean;
}

export const RUNS_FOR_PACES = 3;

export function fitnessStage(activities: Activity[], fitness: FitnessEstimate | undefined, today = new Date()): StageInfo {
  const from = today.getTime() - 90 * 86400000;
  const runs = activities.filter((a) => a.distanceM > 0 && a.movingS > 0 && new Date(a.startTime).getTime() >= from && new Date(a.startTime).getTime() <= today.getTime()).length;
  if (fitness && fitness.confidence !== 'low') {
    return { stage: 'full', runs, next: '', paces: true, predictions: true };
  }
  if (runs >= RUNS_FOR_PACES && fitness) {
    return { stage: 'building', runs, next: 'Run a 5K time trial or a race to unlock race predictions, your fitness score and your readiness score.', paces: true, predictions: false };
  }
  const left = Math.max(1, RUNS_FOR_PACES - runs);
  return { stage: 'starter', runs, next: `Log ${left} more run${left > 1 ? 's' : ''} to get estimated pace targets. A 5K time trial later unlocks race predictions.`, paces: false, predictions: false };
}
