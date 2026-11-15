import { describe, expect, it } from 'vitest';
import { exById } from './strength';
import { doubleProgression, epley, exerciseSummary, freeName, fromUnit, groupsOf, loadStep, repRange, sessionSummary, sortTemplates, templateLine, toggleFavourite, toUnit, type SetLog, type StrengthTemplate } from './strength-load';

const goblet = exById.get('goblet-squat')!; // 3 × 10, light weights
const sets = (n: number, reps: number, load: number, effort = 6): SetLog[] => Array.from({ length: n }, () => ({ reps, load, effort }));

describe('double progression (update 4, task 4b)', () => {
  it('adds a rep at a time up to the top of the range, then adds load and drops back', () => {
    expect(repRange(goblet)).toEqual([10, 14]);
    expect(doubleProgression(goblet, sets(3, 10, 18), 3)).toMatchObject({ reps: 11, load: 18, change: 'reps' });
    expect(doubleProgression(goblet, sets(3, 13, 18), 3)).toMatchObject({ reps: 14, load: 18, change: 'reps' });
    const up = doubleProgression(goblet, sets(3, 14, 18), 3);
    expect(up).toMatchObject({ reps: 10, load: 20.5, change: 'load' });
    expect(up.note).toBe('Add load: 20.5 kg for 10 reps (you reached 14 reps at 18 kg)');
  });
  it('a hard session, or missed sets, repeats', () => {
    expect(doubleProgression(goblet, sets(3, 12, 18, 8), 3)).toMatchObject({ reps: 12, load: 18, change: 'repeat' });
    expect(doubleProgression(goblet, sets(2, 12, 18), 3)).toMatchObject({ reps: 12, load: 18, change: 'repeat' });
    // The session's effort is used when sets have none
    expect(doubleProgression(goblet, [{ reps: 12, load: 18 }, { reps: 12, load: 18 }, { reps: 12, load: 18 }], 3, 9).change).toBe('repeat');
  });
  it('uneven sets go from the fewest reps', () => {
    expect(doubleProgression(goblet, [{ reps: 12, load: 18, effort: 6 }, { reps: 10, load: 18, effort: 7 }, { reps: 11, load: 18, effort: 7 }], 3)).toMatchObject({ reps: 11, load: 18 });
  });
  it('one-sided and dumbbell moves go up 1 kg, two-legged lifts 2.5 kg; holds add 5 s', () => {
    expect(loadStep(goblet)).toBe(2.5);
    expect(loadStep(exById.get('db-lunge')!)).toBe(1);
    expect(loadStep(exById.get('back-squat')!)).toBe(2.5);
    expect(doubleProgression(exById.get('plank')!, [{ seconds: 40, effort: 6 }, { seconds: 40, effort: 6 }], 2)).toMatchObject({ seconds: 45, change: 'time' });
  });
  it('the first time has no target to beat; no load stays on reps', () => {
    expect(doubleProgression(goblet, undefined, 3).change).toBe('first');
    const bw = exById.get('bw-squat')!;
    expect(doubleProgression(bw, [{ reps: 12, effort: 6 }, { reps: 12, effort: 6 }, { reps: 12, effort: 6 }], 3)).toMatchObject({ reps: 13, change: 'reps' });
    expect(doubleProgression(bw, [{ reps: 16, effort: 6 }, { reps: 16, effort: 6 }, { reps: 16, effort: 6 }], 3).note).toMatch(/harder version comes with the next block/);
  });
});

describe('session summary: volume, best set and estimated 1-rep max', () => {
  it('shows weight with reps, and works out volume and Epley', () => {
    expect(epley(18, 12)).toBe(25.2);
    const s = exerciseSummary([{ reps: 12, load: 18 }, { reps: 12, load: 18 }]);
    expect(s.text).toBe('2 × 12 · 18 kg');
    expect(s.volumeKg).toBe(432);
    expect(s.best).toEqual({ load: 18, reps: 12, e1rm: 25.2 });
    expect(exerciseSummary([{ reps: 12, load: 18 }, { reps: 10, load: 18 }]).text).toBe('12 · 18 kg, 10 · 18 kg');
    expect(exerciseSummary([{ seconds: 40 }, { seconds: 40 }]).text).toBe('2 × 40 s');
    // Per-side weights count both sides
    expect(exerciseSummary([{ reps: 8, load: 10, perSide: true }]).volumeKg).toBe(160);
    const all = sessionSummary([{ id: 'a', name: 'Goblet squat', sets: sets(3, 12, 18) }, { id: 'b', name: 'Calf raise', sets: sets(2, 15, 20) }]);
    expect(all.volumeKg).toBe(3 * 12 * 18 + 2 * 15 * 20);
    expect(all.best?.name).toBe('Calf raise');
  });
  it('kg is stored; lb is shown to the nearest half', () => {
    expect(toUnit(20, 'lb')).toBe(44);
    expect(toUnit(18, 'kg')).toBe(18);
    expect(Math.abs(fromUnit(44, 'lb') - 19.96)).toBeLessThan(0.01);
  });
});

describe('saved workouts', () => {
  const t = (id: string, o: Partial<StrengthTemplate> = {}): StrengthTemplate => ({ id, name: id, exercises: [{ exerciseId: 'goblet-squat', sets: 3, reps: 10, weightKg: 16 }], favourite: false, createdAt: '2026-11-01T00:00:00Z', ...o });
  it('favourites come first, then the most recently used; at most 2 favourites', () => {
    const list = [t('a', { lastUsedAt: '2026-11-10T00:00:00Z' }), t('b', { favourite: true }), t('c', { lastUsedAt: '2026-11-12T00:00:00Z' })];
    expect(sortTemplates(list).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    const two = toggleFavourite(list, 'a').list;
    expect(two.filter((x) => x.favourite).map((x) => x.id)).toEqual(['a', 'b']);
    const three = toggleFavourite(two, 'c');
    expect(three.full).toBe(true);
    expect(three.list.filter((x) => x.favourite)).toHaveLength(2);
    expect(toggleFavourite(two, 'a').list.filter((x) => x.favourite).map((x) => x.id)).toEqual(['b']);
  });
  it('names and the one-line summary', () => {
    expect(freeName([t('Legs')], 'Legs')).toBe('Legs 2');
    expect(freeName([t('Legs'), t('Legs 2')], 'legs')).toBe('legs 3');
    expect(templateLine(t('x'))).toMatch(/^1 exercise · about \d+ min$/);
  });
  it('every exercise is in at least one filter group, with upper body and HYROX covered', () => {
    for (const e of exById.values()) expect(groupsOf(e).length + (e.pattern === 'mobility' ? 1 : 0), e.name).toBeGreaterThan(0);
    expect(groupsOf(exById.get('push-up')!)).toContain('upper');
    expect(groupsOf(exById.get('wall-ball')!)).toEqual(expect.arrayContaining(['hyrox', 'legs']));
    expect(groupsOf(exById.get('pogo')!)).toContain('plyo');
  });
});
