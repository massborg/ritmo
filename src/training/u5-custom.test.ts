// Update 5, U2: the athlete's own exercises join the library
import { afterEach, describe, expect, it } from 'vitest';
import { EXERCISES, exById, library, nameTaken, registerCustom, toExercise, type CustomExercise } from './strength';
import { defaultLoadType, doubleProgression, exerciseSummary, groupsOf } from './strength-load';

const nordic: CustomExercise = { id: 'custom:1', name: 'Nordic hamstring curl', group: 'hamstrings', measure: 'reps', loadType: 'bodyweight', equipment: 'none', sets: 3, amount: 6, note: 'Knees anchored, lower slowly', createdAt: '2026-11-19T10:00:00Z' };
const carry: CustomExercise = { id: 'custom:2', name: 'Suitcase carry', group: 'core', measure: 'distance', loadType: 'added', equipment: 'light', perSide: true, sets: 4, amount: 40, createdAt: '2026-11-19T10:00:00Z' };
const hang: CustomExercise = { id: 'custom:3', name: 'Dead hang', group: 'upper', measure: 'seconds', loadType: 'bodyweight', equipment: 'gym', sets: 3, amount: 30, note: 'https://example.com/hang', createdAt: '2026-11-19T10:00:00Z' };

afterEach(() => registerCustom(undefined));

describe('your own exercises', () => {
  it('take the library shape: dose, groups, load type, and a note as the cue', () => {
    const e = toExercise(nordic);
    expect(e).toMatchObject({ id: 'custom:1', name: 'Nordic hamstring curl', sets: 3, reps: 6, custom: true, equipment: 'none', loadType: 'bodyweight', cues: ['Knees anchored, lower slowly'] });
    expect(groupsOf(e)).toContain('legs');
    expect(toExercise(carry)).toMatchObject({ reps: 40, unit: 'm', perSide: true });
    expect(defaultLoadType(toExercise(carry))).toBe('added');
    const h = toExercise(hang);
    expect(h).toMatchObject({ seconds: 30, cues: [], note: 'https://example.com/hang' });
    expect(h.reps).toBeUndefined();
    expect(groupsOf(h)).toContain('upper');
    expect(defaultLoadType({ ...h, loadType: 'band' })).toBe('band');
  });
  it('join the library and are found by id; archived ones keep their name but are not offered', () => {
    registerCustom([nordic, { ...carry, archived: true }]);
    expect(library()).toHaveLength(EXERCISES.length + 1);
    expect(library().some((e) => e.id === 'custom:1')).toBe(true);
    expect(exById.get('custom:2')?.name).toBe('Suitcase carry');
    expect(library().some((e) => e.id === 'custom:2')).toBe(false);
    // Changed or removed from the profile: the registry follows
    registerCustom([{ ...nordic, name: 'Nordic curl' }]);
    expect(exById.get('custom:1')?.name).toBe('Nordic curl');
    expect(exById.has('custom:2')).toBe(false);
    expect(exById.size).toBe(EXERCISES.length + 1);
  });
  it('a name already used cannot be used again', () => {
    registerCustom([nordic]);
    expect(nameTaken('goblet squat')).toBe(true);
    expect(nameTaken(' Nordic Hamstring Curl ')).toBe(true);
    expect(nameTaken('Nordic hamstring curl', 'custom:1')).toBe(false);
    expect(nameTaken('Copenhagen plank')).toBe(false);
  });
  it('progress like any other: reps, then load; a distance repeats', () => {
    const e = toExercise({ ...nordic, loadType: 'added', equipment: 'light' });
    const t = doubleProgression(e, [{ reps: 6, load: 10, effort: 6 }, { reps: 6, load: 10, effort: 6 }, { reps: 6, load: 10, effort: 6 }], 3);
    expect(t).toMatchObject({ reps: 7, load: 10, change: 'reps' });
    const d = doubleProgression(toExercise(carry), [{ reps: 40, unit: 'm', load: 24 }, { reps: 40, unit: 'm', load: 24 }], 2);
    expect(d).toMatchObject({ reps: 40, load: 24, change: 'repeat' });
    expect(d.note).toMatch(/Same distance again: 40 m at 24 kg/);
    expect(exerciseSummary([{ reps: 40, unit: 'm', load: 24 }, { reps: 40, unit: 'm', load: 24 }]).text).toMatch(/40 m/);
  });
});

import { nextSessionName, scheduledOn, type StrengthTemplate } from './strength-load';
describe('saved workouts (update 5, U3)', () => {
  const t = (id: string, name: string): StrengthTemplate => ({ id, name, exercises: [{ exerciseId: 'goblet-squat', sets: 3, reps: 10 }], favourite: false, createdAt: '2026-11-01T00:00:00Z' });
  it('a workout saved without a name is "Strength session N", the next number not in use', () => {
    expect(nextSessionName([])).toBe('Strength session 1');
    expect(nextSessionName([t('a', 'Strength session 1'), t('b', 'Leg day')])).toBe('Strength session 2');
    expect(nextSessionName([t('a', 'strength session 1'), t('b', 'Strength session 3')])).toBe('Strength session 2');
  });
  it('a workout scheduled on a day is listed for that day, and done once a session from it is logged that day', () => {
    const strength = { templates: [t('a', 'Legs'), t('b', 'Core')], scheduled: [{ id: 's1', templateId: 'a', date: '2026-11-19' }, { id: 's2', templateId: 'b', date: '2026-11-20' }, { id: 's3', templateId: 'gone', date: '2026-11-19' }] };
    expect(scheduledOn(strength, [], '2026-11-19').map((x) => [x.id, x.template.name, x.done])).toEqual([['s1', 'Legs', false]]);
    expect(scheduledOn(strength, [{ kind: 'strength', date: '2026-11-19', strength: { templateId: 'a' } }], '2026-11-19')[0].done).toBe(true);
    expect(scheduledOn(strength, [{ kind: 'strength', date: '2026-11-18', strength: { templateId: 'a' } }], '2026-11-19')[0].done).toBe(false);
    expect(scheduledOn(undefined, undefined, '2026-11-19')).toEqual([]);
  });
});
