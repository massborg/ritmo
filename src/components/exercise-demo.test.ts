import { describe, expect, it } from 'vitest';
import { figure, lerpPose, POSES, worksLabel } from './figure';
import { EXERCISES } from '../training/strength';

describe('exercise demo: muscle map figure', () => {
  it('draws a clean body for every movement, through the whole movement', () => {
    for (const [pattern, [a, b]] of Object.entries(POSES)) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const paths = figure(lerpPose(a, b, t), []).flatMap((l) => l.d).join(' ');
        expect(paths, pattern).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  it('lights exactly the muscles each exercise works, and only those', () => {
    for (const ex of EXERCISES) {
      const lit = figure(POSES[ex.pattern][0], ex.muscles).filter((l) => l.fill === 'muscle').length;
      expect(lit, ex.name).toBe(new Set(ex.muscles).size);
    }
    expect(figure(POSES.squat[0], []).some((l) => l.fill === 'muscle')).toBe(false);
  });
  it('names the muscles for the "Works:" caption', () => {
    expect(worksLabel(['quads', 'glutes'])).toBe('Quads, glutes');
    expect(worksLabel(['hamstrings', 'glutes', 'back'])).toBe('Hamstrings, glutes, back');
  });
  it('shows a dumbbell only when asked', () => {
    expect(figure(POSES.squat[0], [], true).some((l) => l.fill === 'ink')).toBe(true);
    expect(figure(POSES.squat[0], []).some((l) => l.fill === 'ink')).toBe(false);
  });
});
