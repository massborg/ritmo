// Readiness (brief 4A): effects add up to the score, the bands and swap suggestions follow the same thresholds
// everywhere, broken inputs never produce a score, and illness holds the score in Recover.
import { describe, expect, it } from 'vitest';
import type { Activity, PlannedSession, Profile, SessionFeedback } from '../lib/types';
import { asReadiness, bandOf, readinessScore } from './readiness';
import type { LoadDay } from './load';
import { trainingPaces } from './fitness';

const now = new Date('2026-11-09T07:30:00Z');
const day = (tsb: number, ctl = 60): LoadDay[] => [{ date: '2026-11-09', load: 0, ctl, atl: ctl - tsb, tsb }];
const profile = { name: 'R', units: 'km', theme: 'system' } as Profile;
const run = (id: string, daysAgo: number, km: number, min: number, extra: Partial<Activity> = {}): Activity => ({
  id, source: 'upload', name: 'Run', startTime: new Date(now.getTime() - daysAgo * 86400000 - min * 60000).toISOString(), distanceM: km * 1000, movingS: min * 60, durationS: min * 60, ...extra,
} as Activity);
const intervals = { id: 's9', date: '2026-11-09', type: 'vo2max', title: 'Intervals: 6 x 1 km', status: 'planned', distanceM: 16000 } as PlannedSession;
const typeOf = (a: Activity) => (a.name === 'Threshold' ? 'threshold' : 'easy') as never;
// About 70 km a week for a month, steady
const month: Activity[] = Array.from({ length: 24 }, (_, i) => run(`r${i}`, 1 + i * 1.2, 12, 60));
const sum = (r: ReturnType<typeof readinessScore>) => r.baseline + r.factors.reduce((s, f) => s + f.effect, 0);

describe('readiness score', () => {
  it('the 9 Nov example: a plausible Easy day, not 40 from a broken form of -362, and the factors add up', () => {
    const fb: SessionFeedback[] = [{ activityId: 'thr', feel: 2, pain: [], loggedAt: new Date(now.getTime() - 30 * 3600000).toISOString() }];
    const acts = [...month, run('thr', 1.3, 15, 61, { name: 'Threshold' })];
    const r = readinessScore({ now, series: day(-22), activities: acts, feedback: fb, profile, typeOf, paces: trainingPaces(63), todaySession: intervals });
    expect(r.score).toBeGreaterThanOrEqual(34);
    expect(r.score).toBeLessThanOrEqual(66);
    expect(r.word).toBe('Easy day');
    expect(sum(r)).toBe(r.score);
    expect(r.line).toBe('Intervals may feel hard today.');
    expect(r.line.split(' ').length).toBeLessThanOrEqual(8);
    expect(r.swap).toMatchObject({ kind: 'easy', label: 'Swap to easy', km: 13 });
    expect(r.lessAccurate).toBe(true);
    expect(r.factors.find((f) => f.key === 'checkin')?.value).toBe('Not logged');
  });
  it('never shows a score built on broken inputs', () => {
    const r = readinessScore({ now, series: day(-362, 136), activities: month, feedback: [], profile, typeOf, todaySession: intervals });
    expect(r.score).toBeUndefined();
    expect(r.unavailable).toBe('Readiness unavailable: checking your training data');
    expect(asReadiness(r).label).toBe('Readiness unavailable');
  });
  it('a fresh runner with a good check-in is ready for hard, with no swap', () => {
    const p = { ...profile, checkins: [{ date: '2026-11-09', sleep: 5, legs: 4, energy: 5 }] };
    const r = readinessScore({ now, series: day(12), activities: month, feedback: [], profile: p, typeOf, todaySession: intervals });
    expect(r.band).toBe('hard');
    expect(r.line).toBe('Good day for intervals.');
    expect(r.swap).toBeUndefined();
    expect(r.lessAccurate).toBe(false);
    expect(sum(r)).toBe(r.score);
  });
  it('illness holds the score in Recover and offers rest instead of the run, still adding up', () => {
    const p = { ...profile, illnessUntil: '2026-11-11', checkins: [{ date: '2026-11-09', sleep: 5, legs: 5, energy: 5 }] };
    const easy = { ...intervals, type: 'easy', title: 'Easy run' } as PlannedSession;
    const r = readinessScore({ now, series: day(5), activities: month, feedback: [], profile: p, typeOf, todaySession: easy });
    expect(r.score).toBe(25);
    expect(r.word).toBe('Recover');
    expect(r.swap).toMatchObject({ kind: 'rest', label: 'Swap to rest' });
    expect(r.factors.find((f) => f.key === 'limit')?.explain).toMatch(/unwell/);
    expect(sum(r)).toBe(25);
  });
  it('a hard session under 24 hours ago lowers the score strongly; 24–48 hours slightly', () => {
    const fresh = readinessScore({ now, series: day(0), activities: [...month, run('t', 0.5, 12, 50, { name: 'Threshold' })], feedback: [], profile, typeOf });
    const later = readinessScore({ now, series: day(0), activities: [...month, run('t', 1.5, 12, 50, { name: 'Threshold' })], feedback: [], profile, typeOf });
    expect(fresh.factors.find((f) => f.key === 'recovery')?.effect).toBe(-20);
    expect(later.factors.find((f) => f.key === 'recovery')?.effect).toBe(-8);
  });
  it('bands: Recover 0–33, Easy day 34–66, Ready for hard 67–100', () => {
    expect([0, 33, 34, 66, 67, 100].map(bandOf)).toEqual(['recover', 'recover', 'easy', 'easy', 'hard', 'hard']);
  });
});
