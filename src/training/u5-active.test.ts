// Update 5, U6: a workout in progress
import { describe, expect, it } from 'vitest';
import { STALE_MS, asLog, doneSets, isStale, loggedOf, minutesOf, totalSets, type ActiveWorkout } from './active-workout';

const a = (o: Partial<ActiveWorkout> = {}): ActiveWorkout => ({
  key: 'free:w', route: '/strength/free?w=1', title: 'Strength session 1', source: 'template', templateId: 't1', startedAt: 1_000_000, idx: 1, notes: 'Felt good', updatedAt: 1_000_000 + 20 * 60000,
  items: [{ id: 'goblet-squat', sets: 3, reps: 10, load: 18 }, { id: 'plank', sets: 2, seconds: 40 }, { id: 'gone-exercise', sets: 1, reps: 5 }],
  sets: [[{ reps: 10, load: 18, done: true, effort: 6 }, { reps: 10, load: 18, done: true }, { reps: 10, load: 18, done: false }], [{ seconds: 40, done: true }, { seconds: 40, done: false }], [{ reps: 5, done: true }]],
  meta: [{ loadType: 'added' }, { loadType: 'bodyweight' }, { loadType: 'bodyweight' }], ...o,
});

describe('a workout in progress', () => {
  it('counts what is done', () => {
    expect(doneSets(a())).toBe(4);
    expect(totalSets(a())).toBe(6);
  });
  it('saves only the sets that were done, under the right exercises; one that no longer exists is left out', () => {
    const l = loggedOf(a());
    expect(l.map((x) => [x.id, x.name, x.planned, x.sets.length])).toEqual([['goblet-squat', 'Goblet squat', 3, 2], ['plank', 'Plank', 2, 1]]);
    expect(l[0].sets[0]).toMatchObject({ reps: 10, load: 18, loadType: 'added', effort: 6 });
    expect(l[1].sets[0]).toMatchObject({ seconds: 40, loadType: 'bodyweight' });
    expect(loggedOf(a({ sets: [[{ done: false }], [{ done: false }], [{ done: false }]] }))).toEqual([]);
  });
  it('a set with no weight on a bodyweight exercise is bodyweight; a band keeps its strength', () => {
    expect(asLog({ reps: 8, done: true }, { loadType: 'bodyweight_plus' }, { equipment: 'none' })).toMatchObject({ loadType: 'bodyweight', load: undefined });
    expect(asLog({ reps: 12, done: true }, { loadType: 'band' }, { equipment: 'light' })).toMatchObject({ loadType: 'band', band: 'medium' });
  });
  it('is fresh for 12 hours, then asks; its length is to the last change once it was left', () => {
    const w = a();
    expect(isStale(w, w.updatedAt + STALE_MS - 1)).toBe(false);
    expect(isStale(w, w.updatedAt + STALE_MS + 1)).toBe(true);
    expect(minutesOf(w, w.startedAt + 35 * 60000)).toBe(35);
    // Left on Tuesday, opened on Thursday: 20 minutes of work, not two days
    expect(minutesOf(w, w.updatedAt + 2 * 86400000)).toBe(20);
  });
});
