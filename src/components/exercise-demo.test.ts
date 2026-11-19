import { describe, expect, it } from 'vitest';
import { DEMOS, demoFor, demoPose, figure, hasOwnDemo, lerpPose, POSES, worksLabel } from './figure';
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

describe('each exercise shows its own movement (update 5, U5)', () => {
  const WRONG = ['db-rdl', 'trap-deadlift', 'db-row', 'sled-pull', 'bird-dog', 'wall-sit', 'bulgarian', 'rfe-weighted', 'push-up', 'pallof', 'overhead-press', 'band-pulldown', 'farmers-carry', 'wall-ball', 'sled-push', 'band-walk', 'skater', 'burpee-broad-jump', 'hip-flexor', 'ankle-rock', 'seated-calf', 'step-down'];
  const DETAIL = ['sl-bridge', 'sl-hip-thrust', 'hip-thrust', 'bent-calf', 'side-plank-lift', 'side-leg-raise', 'sandbag-lunge', 'step-up', 'weighted-step-up', 'plank'];
  it('the exercises that borrowed a wrong or incomplete drawing have their own', () => {
    for (const id of [...WRONG, ...DETAIL]) { expect(EXERCISES.some((e) => e.id === id), id).toBe(true); expect(hasOwnDemo(id), id).toBe(true); }
    // Not the borrowed pattern any more
    for (const id of WRONG) { const e = EXERCISES.find((x) => x.id === id)!; expect(demoFor(id, e.pattern).frames, id).not.toBe(POSES[e.pattern]); }
    // An exercise with no special drawing still uses its pattern
    expect(demoFor('bw-squat', 'squat').frames).toBe(POSES.squat);
  });
  it('every demo draws cleanly through the whole movement, with its props', () => {
    for (const e of EXERCISES) {
      const d = demoFor(e.id, e.pattern);
      for (const t of [0, 0.1, 0.25, 0.4, 0.5, 0.7, 0.99]) expect(figure(demoPose(d, t), e.muscles, false, d.props).flatMap((l) => l.d).join(' '), e.name).not.toMatch(/NaN|Infinity/);
    }
    for (const k of Object.keys(DEMOS)) expect(DEMOS[k].frames.length, k).toBeGreaterThanOrEqual(2);
  });
  it('props and the second arm are drawn: a wall and ball for wall balls, a sled, a bench, a band', () => {
    const fills = (id: string) => { const e = EXERCISES.find((x) => x.id === id)!; const d = demoFor(id, e.pattern); return figure(d.frames[0], [], false, d.props).map((l) => l.fill); };
    expect(fills('wall-ball')).toEqual(expect.arrayContaining(['prop', 'accent']));
    expect(fills('sled-push').filter((f) => f === 'prop').length).toBe(3);
    expect(fills('bulgarian')).toContain('prop');
    expect(fills('band-walk')).toContain('band');
    expect(fills('farmers-carry').filter((f) => f === 'ink').length).toBe(2);
    // Two arms: the far one is drawn in the far tone
    const one = figure(POSES.squat[0], []).filter((l) => l.fill === 'far').length;
    expect(figure(demoFor('overhead-press', 'mobility').frames[0], []).filter((l) => l.fill === 'far').length).toBe(one + 1);
  });
  it('the burpee broad jump has three positions and runs round: stand, chest down, jump', () => {
    const d = demoFor('burpee-broad-jump', 'hop');
    expect(d.frames).toHaveLength(3);
    expect(d.loop).toBe(true);
    expect(demoPose(d, 0).head[1]).toBeCloseTo(14);
    expect(demoPose(d, 1 / 3).head[1]).toBeCloseTo(86);
    expect(demoPose(d, 2 / 3).head[0]).toBeCloseTo(70);
    // A time just before the start, or past the end, is still a pose
    expect(Number.isFinite(demoPose(d, -0.01).head[0])).toBe(true);
    expect(Number.isFinite(demoPose(demoFor('push-up', 'plank'), 1.3).head[0])).toBe(true);
  });
  it('a pose with an elbow in only one frame still moves smoothly', () => {
    const d = DEMOS['push-up'];
    const mid = lerpPose(d.frames[0], d.frames[1], 0.5);
    expect(mid.elbow).toBeDefined();
    expect(Number.isFinite(mid.elbow![0])).toBe(true);
  });
});
