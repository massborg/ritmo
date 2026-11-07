import { describe, expect, it } from 'vitest';
import type { Activity, Shoe } from '../lib/types';
import { combineRuns, findDuplicates, forStats, isDuplicatePair, withDistance } from './quality';
import { shoeAlert, shoeForRun, shoeTotals } from '../training/shoes';

const run = (id: string, start: string, km: number, min: number, extra: Partial<Activity> = {}): Activity => ({
  id, source: 'upload', sourceIds: { upload: id }, startTime: start, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: min * 60, movingS: min * 60, detailScore: 1, importedAt: '', ...extra,
});

describe('duplicates', () => {
  it('finds the same run with a time-zone shift, or a few minutes apart, but not two different runs', () => {
    const a = run('a', '2026-11-01T07:00:00Z', 10, 50), b = run('b', '2026-11-01T08:00:40Z', 10.1, 50.3);
    expect(isDuplicatePair(a, b)).toBe(true);
    expect(isDuplicatePair(a, run('c', '2026-11-01T07:06:00Z', 10, 50))).toBe(true);
    expect(isDuplicatePair(a, run('d', '2026-11-01T07:30:00Z', 10, 50))).toBe(false); // 30 min apart: two runs
    expect(isDuplicatePair(a, run('e', '2026-11-01T08:00:00Z', 6, 30))).toBe(false); // different run an hour later
    const pairs = findDuplicates([a, b, run('x', '2026-11-03T07:00:00Z', 8, 40)]);
    expect(pairs.map(([p, q]) => [p.id, q.id])).toEqual([['a', 'b']]);
  });
  it('merging keeps the detailed copy and everything the runner set', () => {
    const watch = run('w', '2026-11-01T07:00:00Z', 10, 50, { detailScore: 3, sourceIds: { garmin: 'g1' } });
    const upload = run('u', '2026-11-01T08:00:00Z', 10, 50, { isRace: true, plannedSessionId: 'p1', name: 'Parkrun' });
    const { keep, dropId } = combineRuns(upload, watch);
    expect(dropId).toBe('u');
    expect(keep.id).toBe('w');
    expect(keep).toMatchObject({ isRace: true, plannedSessionId: 'p1', name: 'Parkrun', sourceIds: { garmin: 'g1', upload: 'u' } });
  });
});

describe('fix distance and hide', () => {
  it('scales streams and laps, remembers the original', () => {
    const a = run('t', '2026-11-01T07:00:00Z', 10, 50, { streams: [{ t: 0, d: 0 }, { t: 3000, d: 10000 }], laps: [{ distanceM: 10000, durationS: 3000 } as never] });
    const f = withDistance(a, 9200);
    expect(f.distanceM).toBe(9200);
    expect(f.distFrom).toBe(10000);
    expect(f.streams![1].d).toBeCloseTo(9200);
    expect(f.laps![0].distanceM).toBeCloseTo(9200);
    expect(withDistance(f, 9000).distFrom).toBe(10000);
    expect(withDistance(f, 10000).distFrom).toBeUndefined(); // restored
  });
  it('hidden runs are left out of stats', () => {
    expect(forStats([run('a', '2026-11-01T07:00:00Z', 5, 25), run('b', '2026-11-02T07:00:00Z', 5, 25, { hidden: true })]).map((x) => x.id)).toEqual(['a']);
  });
});

describe('shoes', () => {
  const shoes: Shoe[] = [
    { id: 'daily', name: 'Daily', startDate: '2026-01-01', startKm: 0, retireKm: 700 },
    { id: 'flats', name: 'Racing flats', startDate: '2026-03-01', startKm: 50, retireKm: 400, use: 'fast' },
    { id: 'old', name: 'Old daily', startDate: '2025-01-01', startKm: 0, retireKm: 700, retired: true, retiredAt: '2025-12-31' },
  ];
  it('assigns by session type, respects the runner\'s choice and retirement dates', () => {
    expect(shoeForRun(run('a', '2026-04-01T07:00:00Z', 10, 50), 'vo2max', shoes)?.id).toBe('flats');
    expect(shoeForRun(run('a', '2026-04-01T07:00:00Z', 10, 50), 'easy', shoes)?.id).toBe('daily');
    expect(shoeForRun(run('a', '2026-04-01T07:00:00Z', 20, 100), 'long', shoes)?.id).toBe('daily'); // no long-run shoe: everyday
    expect(shoeForRun(run('a', '2026-02-01T07:00:00Z', 10, 50), 'threshold', shoes)?.id).toBe('daily'); // flats not bought yet
    expect(shoeForRun(run('a', '2025-06-01T07:00:00Z', 10, 50), 'easy', shoes)?.id).toBe('old');
    expect(shoeForRun(run('a', '2026-04-01T07:00:00Z', 10, 50, { shoeId: 'flats' }), 'easy', shoes)?.id).toBe('flats');
  });
  it('totals and alerts from 100 km before the limit', () => {
    const acts = [run('a', '2026-04-01T07:00:00Z', 10, 40), run('b', '2026-04-02T07:00:00Z', 12, 60), run('c', '2026-04-03T07:00:00Z', 5, 25, { hidden: true })];
    const t = shoeTotals(acts, shoes, (a) => (a.id === 'a' ? 'vo2max' : 'easy'));
    expect(t.get('flats')).toBeCloseTo(60);
    expect(t.get('daily')).toBeCloseTo(12);
    expect(shoeAlert(shoes[0], 599)).toBeUndefined();
    expect(shoeAlert(shoes[0], 600)).toBe('soon');
    expect(shoeAlert(shoes[0], 700)).toBe('retire');
    expect(shoeAlert(shoes[2], 900)).toBeUndefined();
  });
});
