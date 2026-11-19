// Update 5, U7: rests and timers
import { describe, expect, it } from 'vitest';
import { clockOf, restAfter, secondsLeft } from './timers';

describe('rest after a set', () => {
  const workout = { restBetweenSetsS: 60, restBetweenExercisesS: 120 };
  it('between sets: the exercise, else the workout, else the usual rest', () => {
    expect(restAfter({ lastOfExercise: false, item: { restS: 30 }, workout, usual: 90 })).toBe(30);
    expect(restAfter({ lastOfExercise: false, item: {}, workout, usual: 90 })).toBe(60);
    expect(restAfter({ lastOfExercise: false, item: {}, workout: {}, usual: 90 })).toBe(90);
  });
  it('after the last set: the rest before the next exercise', () => {
    expect(restAfter({ lastOfExercise: true, item: { restS: 30, restAfterS: 150 }, workout, usual: 90 })).toBe(150);
    expect(restAfter({ lastOfExercise: true, item: { restS: 30 }, workout, usual: 90 })).toBe(120);
    // No between-exercises rest set anywhere: the between-sets rest is used
    expect(restAfter({ lastOfExercise: true, item: { restS: 30 }, workout: { restBetweenSetsS: 60 }, usual: 90 })).toBe(30);
    expect(restAfter({ lastOfExercise: true, item: {}, workout: {}, usual: 90 })).toBe(90);
  });
});
describe('timers keep time from the clock', () => {
  it('the time left comes from when it ends, so a locked screen does not stop it', () => {
    const endsAt = 1_000_000 + 120_000;
    expect(secondsLeft(endsAt, 1_000_000)).toBe(120);
    expect(secondsLeft(endsAt, 1_000_000 + 119_100)).toBe(1);
    // Two minutes with the phone locked: it is simply over
    expect(secondsLeft(endsAt, 1_000_000 + 125_000)).toBe(0);
    expect(clockOf(38)).toBe('0:38');
    expect(clockOf(120)).toBe('2:00');
  });
});
