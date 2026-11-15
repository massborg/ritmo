// Your week in review: a session planned for today, not yet run, is not called missed
import { describe, expect, it } from 'vitest';
import type { Plan, PlannedSession } from '../lib/types';
import { weekReview } from './report';

const session = (date: string, type: string, title: string): PlannedSession => ({ id: date, date, type, title, status: 'planned', distanceM: 11000, durationS: 3600, steps: [] } as unknown as PlannedSession);
const plan = { sessions: [session('2026-11-10', 'threshold', 'Threshold: 2 x 15 min'), session('2026-11-15', 'long', 'Long run')] } as unknown as Plan;

describe('week review', () => {
  it('on the Sunday itself the long run still to do is not missed; an earlier key session is', () => {
    const r = weekReview({ weekStart: '2026-11-09', plan, activities: [], units: 'km', today: '2026-11-15' })!;
    const missed = r.lines.find((l) => l.startsWith('Missed:'))!;
    expect(missed).toMatch(/threshold: 2 x 15 min/);
    expect(missed).not.toMatch(/long run/);
    // A plan that starts today: nothing is missed
    const fresh = weekReview({ weekStart: '2026-11-09', plan: { sessions: [plan.sessions[1]] } as unknown as Plan, activities: [], units: 'km', today: '2026-11-15' })!;
    expect(fresh.lines.some((l) => l.startsWith('Missed:'))).toBe(false);
  });
  it('once the day has passed, the long run is missed', () => {
    const r = weekReview({ weekStart: '2026-11-09', plan, activities: [], units: 'km', today: '2026-11-16' })!;
    expect(r.lines.find((l) => l.startsWith('Missed:'))).toMatch(/long run/);
  });
});

describe('week review units', () => {
  it('a runner who uses miles gets the distances in miles', () => {
    const acts = [{ startTime: '2026-11-10T07:00:00Z', distanceM: 16093.44 }] as unknown as Parameters<typeof weekReview>[0]['activities'];
    const mi = weekReview({ weekStart: '2026-11-09', plan, activities: acts, units: 'mi', today: '2026-11-16' })!;
    expect(mi.lines[0]).toBe('10.0 mi of 14 mi planned in 1 run.');
    const km = weekReview({ weekStart: '2026-11-09', plan, activities: acts, units: 'km', today: '2026-11-16' })!;
    expect(km.lines[0]).toBe('16.1 km of 22 km planned in 1 run.');
  });
});
