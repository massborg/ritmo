import { describe, expect, it } from 'vitest';
import { badgeOf, badgeSrc, catalogue, markCompleted, progress, type JoinedChallenge } from './challenges';
import { existsSync } from 'fs';

const at = (y: number, m: number, d: number, h = 7) => new Date(y, m - 1, d, h).toISOString();
const run = (iso: string, km: number) => ({ startTime: iso, distanceM: km * 1000, movingS: km * 330 });

describe('challenges', () => {
  const today = new Date(2026, 10, 10, 12); // Tue 10 Nov 2026

  it('offers this month, a weekly streak from Monday and a half-marathon run', () => {
    const c = catalogue(today);
    expect(c.map((x) => x.title)).toEqual([
      '100 km in November', '200 km in November', 'Four 10 km runs in November',
      '3 runs a week for 4 weeks', 'Half marathon distance by 31 Dec',
    ]);
    expect(c[0].start).toBe('2026-11-01');
    expect(c[0].end).toBe('2026-11-30');
    expect(c[3].start).toBe('2026-11-09');
    expect(c[3].end).toBe('2026-12-06');
  });

  it('adds next month in the last week', () => {
    const c = catalogue(new Date(2026, 10, 26));
    expect(c.some((x) => x.title === '200 km in December')).toBe(true);
  });

  it('uses miles for mile runners', () => {
    expect(catalogue(today, 'mi')[1].title).toBe('125 mi in November');
  });

  it('counts distance in the month only, every source included', () => {
    const c = catalogue(today)[1];
    const p = progress(c, [run(at(2026, 10, 31), 20), run(at(2026, 11, 2), 16.3), run(at(2026, 11, 8), 120.1)], 'km', today);
    expect(p.line).toBe('136.4 of 200 km · 21 days left');
    expect(p.done).toBe(false);
    expect(p.frac).toBeCloseTo(0.682, 2);
  });

  it('long runs need the minimum distance (a GPS rounding short still counts)', () => {
    const c = catalogue(today)[2];
    const p = progress(c, [run(at(2026, 11, 1), 10), run(at(2026, 11, 3), 9.97), run(at(2026, 11, 5), 8)], 'km', today);
    expect(p.value).toBe(2);
    expect(p.line).toBe('2 of 4 runs · 21 days left');
  });

  it('one long run before the date', () => {
    const c = catalogue(today)[4];
    expect(progress(c, [run(at(2026, 11, 1), 15.2)], 'km', today).line).toBe('Longest so far 15.2 of 21.1 km · 52 days left');
    const p = progress(c, [run(at(2026, 11, 1), 21.2)], 'km', today);
    expect(p.done).toBe(true);
    expect(p.line).toBe('Done: 21.2 km · Complete');
  });

  it('weekly runs count whole weeks', () => {
    const c = catalogue(today)[3];
    const p = progress(c, [run(at(2026, 11, 9), 5), run(at(2026, 11, 10), 5)], 'km', today);
    expect(p.line).toBe('Week 1 of 4 · 2 of 3 runs this week · 27 days left');
    const all = [0, 7, 14, 21].flatMap((w) => [0, 2, 4].map((d) => run(new Date(2026, 10, 9 + w + d, 7).toISOString(), 5)));
    expect(progress(c, all, 'km', new Date(2026, 11, 6)).done).toBe(true);
  });

  it('marks a joined challenge complete once', () => {
    const c = catalogue(today)[0];
    const joined: JoinedChallenge[] = [{ challenge: c, joinedAt: today.toISOString() }];
    expect(markCompleted(joined, [run(at(2026, 11, 2), 50)], today)).toBeUndefined();
    const done = markCompleted(joined, [run(at(2026, 11, 2), 50), run(at(2026, 11, 9), 50)], today)!;
    expect(done[0].completedAt).toBeTruthy();
    expect(markCompleted(done, [run(at(2026, 11, 2), 120)], today)).toBeUndefined();
  });

  it('every challenge has its own badge file', () => {
    const ids = [...catalogue(today), ...catalogue(today, 'mi')].map(badgeOf);
    expect(ids).toEqual(expect.arrayContaining(['distance-100km', 'distance-200km', 'distance-60mi', 'distance-125mi', 'long-runs-4x10', 'weekly-3x4', 'half-distance']));
    for (const id of [...ids, 'challenge-generic' as const, 'locked' as const]) expect(existsSync(`public${badgeSrc(id)}`)).toBe(true);
    expect(badgeOf({ kind: 'distance', id: 'dist-150km-2026-11' })).toBe('challenge-generic');
  });
});
