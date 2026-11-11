// Update 2, §13 and §14: PBs on the Hub profile are off by default and chosen by the runner; streak and run count
// never use Strava runs.
import { describe, expect, it } from 'vitest';
import type { Activity } from '../lib/types';
import { fasterThanOwn, parseTime, resolvePbs, ritmoBests, shareableRuns, weekStreak } from './profile-pbs';

const run = (id: string, day: string, km: number, secs: number, extra: Partial<Activity> = {}): Activity => ({ id, source: 'upload', sourceIds: { upload: id }, startTime: `${day}T07:00:00Z`, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: secs, movingS: secs, detailScore: 3, importedAt: '', ...extra });
const acts = [
  run('a', '2026-10-04', 5, 960, { isRace: true, name: 'Harbour 5K' }),
  run('b', '2026-10-18', 10, 2010),
  run('s', '2026-10-25', 5, 900, { source: 'strava', sourceIds: { strava: '1' } }), // faster, but from Strava
  run('c', '2026-11-02', 21.1, 4500),
  run('d', '2026-11-09', 8, 2600),
];
const bests = ritmoBests(acts);

describe('PBs on the profile (update 2, §14)', () => {
  it('are never shown unless turned on with distances chosen', () => {
    expect(resolvePbs(undefined, bests)).toBeNull();
    expect(resolvePbs({ show: false, items: [{ m: 5000, mode: 'ritmo' }] }, bests)).toBeNull();
    expect(resolvePbs({ show: true, items: [] }, bests)).toBeNull();
  });
  it('5K and 10K only, from Ritmo, with the race name; Strava runs never count', () => {
    const p = resolvePbs({ show: true, items: [{ m: 5000, mode: 'ritmo' }, { m: 10000, mode: 'ritmo' }] }, bests)!;
    expect(p.map((x) => x.label)).toEqual(['5K', '10K']);
    expect(p[0]).toMatchObject({ timeS: 960, race: 'Harbour 5K' });
    expect(p[1].timeS).toBe(2010);
  });
  it('Half and Marathon: a time entered by hand is shown as self-reported', () => {
    const p = resolvePbs({ show: true, items: [{ m: 21097.5, mode: 'ritmo' }, { m: 42195, mode: 'own', timeS: 9900, race: 'Valletta Marathon' }] }, bests)!;
    expect(p.map((x) => x.label)).toEqual(['Half', 'Marathon']);
    expect(p[1]).toMatchObject({ timeS: 9900, self: true, race: 'Valletta Marathon' });
    expect(p[0].self).toBeUndefined();
  });
  it('at most 4 distances', () => {
    const items = [1609.344, 5000, 10000, 16093.44, 21097.5].map((m) => ({ m, mode: 'own' as const, timeS: 3000 }));
    expect(resolvePbs({ show: true, items }, bests)!.length).toBe(4);
  });
  it('a faster Ritmo time than the one typed in is offered', () => {
    expect(fasterThanOwn({ show: true, items: [{ m: 5000, mode: 'own', timeS: 990 }] }, bests)).toEqual([expect.objectContaining({ label: '5K', timeS: 960 })]);
    expect(fasterThanOwn({ show: true, items: [{ m: 5000, mode: 'own', timeS: 950 }] }, bests)).toEqual([]);
  });
  it('times are checked as m:ss or h:mm:ss', () => {
    expect(parseTime('15:38')).toBe(938);
    expect(parseTime('1:13:37')).toBe(4417);
    expect(parseTime('15.38')).toBe(938);
    expect(parseTime('15:3')).toBeUndefined();
    expect(parseTime('1:75:00')).toBeUndefined();
    expect(parseTime('abc')).toBeUndefined();
  });
});

describe('streak and run count (update 2, §13)', () => {
  it('counts weeks in a row with a run, this week once it has one; never Strava runs', () => {
    expect(shareableRuns(acts).length).toBe(4);
    // Runs in the weeks of 2 and 9 Nov (Strava's week of 26 Oct does not count, so the streak stops there)
    expect(weekStreak(acts, new Date('2026-11-11T12:00:00'))).toBe(2);
    expect(weekStreak(acts, new Date('2026-11-17T12:00:00'))).toBe(2);
    expect(weekStreak(acts, new Date('2026-11-25T12:00:00'))).toBe(0);
  });
});
