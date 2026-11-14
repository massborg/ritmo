// The figure for exercise demos (update 3, §4): a fit, muscular body for its movement pattern, moving between the
// start and end positions, with the muscles the exercise works lit in Ritmo orange ("muscle map"). The body is built
// from smooth tapered shapes laid along the same joints the old stick figure used, so every exercise has a demo.
// Still (the start position) for people who prefer reduced motion.
import type { Pattern } from '../training/strength';

type P = [number, number];
export interface Pose { head: P; sh: P; hip: P; k1: P; f1: P; k2: P; f2: P; hand: P }
const pose = (o: Pose) => o;
// Side view, 100 x 100, ground at y = 92
export const POSES: Record<Pattern, [Pose, Pose]> = {
  squat: [pose({ head: [50, 14], sh: [50, 26], hip: [50, 52], k1: [52, 72], f1: [52, 92], k2: [48, 72], f2: [48, 92], hand: [62, 40] }),
    pose({ head: [44, 34], sh: [46, 44], hip: [36, 64], k1: [58, 66], f1: [52, 92], k2: [56, 68], f2: [48, 92], hand: [66, 50] })],
  lunge: [pose({ head: [50, 14], sh: [50, 26], hip: [50, 52], k1: [60, 70], f1: [64, 92], k2: [42, 72], f2: [36, 92], hand: [52, 46] }),
    pose({ head: [50, 28], sh: [50, 40], hip: [50, 64], k1: [66, 66], f1: [66, 92], k2: [40, 88], f2: [26, 92], hand: [52, 60] })],
  hinge: [pose({ head: [50, 14], sh: [50, 26], hip: [50, 52], k1: [51, 72], f1: [51, 92], k2: [49, 72], f2: [49, 92], hand: [52, 50] }),
    pose({ head: [74, 38], sh: [64, 40], hip: [44, 50], k1: [47, 71], f1: [48, 92], k2: [30, 56], f2: [14, 58], hand: [64, 66] })],
  bridge: [pose({ head: [12, 86], sh: [22, 86], hip: [46, 86], k1: [62, 70], f1: [70, 90], k2: [62, 70], f2: [70, 90], hand: [36, 90] }),
    pose({ head: [12, 86], sh: [22, 84], hip: [46, 66], k1: [62, 66], f1: [70, 90], k2: [62, 66], f2: [70, 90], hand: [36, 90] })],
  calf: [pose({ head: [50, 16], sh: [50, 28], hip: [50, 54], k1: [51, 73], f1: [51, 92], k2: [49, 73], f2: [49, 92], hand: [60, 44] }),
    pose({ head: [50, 8], sh: [50, 20], hip: [50, 46], k1: [51, 65], f1: [52, 85], k2: [49, 65], f2: [50, 85], hand: [60, 36] })],
  plank: [pose({ head: [20, 64], sh: [28, 70], hip: [56, 74], k1: [70, 77], f1: [84, 82], k2: [70, 77], f2: [84, 82], hand: [28, 90] }),
    pose({ head: [20, 62], sh: [28, 68], hip: [56, 72], k1: [70, 76], f1: [84, 82], k2: [70, 76], f2: [84, 82], hand: [28, 90] })],
  'side-plank': [pose({ head: [24, 56], sh: [30, 64], hip: [56, 80], k1: [70, 85], f1: [84, 90], k2: [70, 85], f2: [84, 90], hand: [30, 90] }),
    pose({ head: [24, 50], sh: [30, 60], hip: [56, 70], k1: [70, 80], f1: [84, 90], k2: [70, 80], f2: [84, 90], hand: [30, 40] })],
  'core-floor': [pose({ head: [16, 86], sh: [26, 86], hip: [52, 86], k1: [60, 70], f1: [72, 70], k2: [60, 70], f2: [72, 70], hand: [30, 64] }),
    pose({ head: [16, 86], sh: [26, 86], hip: [52, 86], k1: [60, 70], f1: [72, 70], k2: [72, 82], f2: [90, 82], hand: [8, 76] })],
  step: [pose({ head: [42, 18], sh: [42, 30], hip: [42, 56], k1: [56, 60], f1: [58, 76], k2: [42, 74], f2: [42, 92], hand: [48, 48] }),
    pose({ head: [54, 6], sh: [54, 18], hip: [54, 44], k1: [57, 60], f1: [58, 76], k2: [60, 54], f2: [56, 70], hand: [60, 36] })],
  hop: [pose({ head: [50, 18], sh: [50, 30], hip: [50, 56], k1: [52, 74], f1: [52, 92], k2: [48, 74], f2: [48, 92], hand: [58, 44] }),
    pose({ head: [50, 6], sh: [50, 18], hip: [50, 44], k1: [52, 62], f1: [53, 80], k2: [48, 62], f2: [47, 80], hand: [60, 26] })],
  clam: [pose({ head: [14, 82], sh: [24, 84], hip: [50, 84], k1: [62, 72], f1: [52, 88], k2: [62, 72], f2: [52, 88], hand: [20, 70] }),
    pose({ head: [14, 82], sh: [24, 84], hip: [50, 84], k1: [62, 72], f1: [52, 88], k2: [62, 56], f2: [52, 86], hand: [20, 70] })],
  mobility: [pose({ head: [50, 14], sh: [50, 26], hip: [50, 52], k1: [50, 72], f1: [50, 92], k2: [62, 68], f2: [70, 84], hand: [60, 40] }),
    pose({ head: [50, 14], sh: [50, 26], hip: [50, 52], k1: [50, 72], f1: [50, 92], k2: [36, 66], f2: [26, 78], hand: [60, 40] })],
};

// ---- Geometry ----
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]) || 1e-6;
const unit = (a: P) => mul(a, 1 / len(a));
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** The side 90° clockwise from a segment: the front of the chest when the torso points down */
const front = (from: P, to: P): P => { const u = unit(sub(to, from)); return [u[1], -u[0]]; };
const n2 = (n: number) => n.toFixed(2);
const circle = (c: P, r: number) => `M${n2(c[0] - r)},${n2(c[1])}a${n2(r)},${n2(r)} 0 1 0 ${n2(2 * r)},0a${n2(r)},${n2(r)} 0 1 0 ${n2(-2 * r)},0Z`;
/** A limb or muscle: a tapered quad with a round cap at each end. Separate shapes, so overlaps never cut holes. */
function capsule(a: P, b: P, wa: number, wb: number): string[] {
  const u = unit(sub(b, a)), n: P = [-u[1], u[0]];
  const q = [add(a, mul(n, wa / 2)), add(b, mul(n, wb / 2)), sub(b, mul(n, wb / 2)), sub(a, mul(n, wa / 2))];
  return [`M${q.map((x) => `${n2(x[0])},${n2(x[1])}`).join('L')}Z`, circle(a, wa / 2), circle(b, wb / 2)];
}
/** Elbow from shoulder and hand: a two-bone reach, bending downward */
function elbow(sh: P, hand: P): P {
  const L1 = 12, L2 = 11, v = sub(hand, sh), d = Math.min(len(v), L1 + L2 - 0.2);
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))), u = unit(v);
  const rot = (s: number): P => [u[0] * Math.cos(s * a) - u[1] * Math.sin(s * a), u[0] * Math.sin(s * a) + u[1] * Math.cos(s * a)];
  const e1 = add(sh, mul(rot(1), L1)), e2 = add(sh, mul(rot(-1), L1));
  return e1[1] > e2[1] ? e1 : e2;
}

/** The muscles an exercise lists, as parts of the figure */
export type Part = 'quads' | 'glutes' | 'hamstrings' | 'calves' | 'achilles' | 'ankles' | 'core' | 'back' | 'hips';
export const PART_LABEL: Record<Part, string> = { quads: 'Quads', glutes: 'Glutes', hamstrings: 'Hamstrings', calves: 'Calves', achilles: 'Achilles', ankles: 'Ankles', core: 'Core', back: 'Back', hips: 'Hips' };
/** "Quads, glutes": the muscles in a sentence */
export const worksLabel = (muscles: string[]) => muscles.map((m, i) => { const l = PART_LABEL[m as Part] ?? m; return i === 0 ? l : l.toLowerCase(); }).join(', ');

export interface Layer { d: string[]; fill: 'body' | 'far' | 'muscle' | 'ink' }
/** Everything to draw for one pose, back to front */
export function figure(p: Pose, muscles: string[], weights = false): Layer[] {
  const lit = (m: Part) => muscles.includes(m);
  const tf = front(p.sh, p.hip);
  const at = (a: P, b: P, t: number, off: number, dir: P) => add(lerp(a, b, t), mul(dir, off));
  const facing = tf[0] >= 0 ? 1 : -1;
  const leg = (k: P, ft: P) => {
    const tq = front(p.hip, k), sf = front(k, ft);
    return {
      thigh: capsule(p.hip, k, 11, 6.6),
      quad: capsule(at(p.hip, k, 0.15, 2.4, tq), at(p.hip, k, 0.8, 1.2, tq), 7, 5),
      ham: capsule(at(p.hip, k, 0.15, -2.6, tq), at(p.hip, k, 0.8, -1.4, tq), 6.4, 4.4),
      shin: capsule(k, ft, 6, 3.6),
      calf: capsule(at(k, ft, 0.12, -1.6, sf), at(k, ft, 0.55, -0.8, sf), 6, 3.6),
      achilles: capsule(at(k, ft, 0.6, -0.9, sf), at(k, ft, 0.95, -0.6, sf), 2.8, 2.6),
      ankle: [circle(ft, 2.6)],
      foot: capsule(ft, add(ft, [6 * facing, 0]), 3.8, 2.8),
    };
  };
  const near = leg(p.k1, p.f1), far = leg(p.k2, p.f2), e = elbow(p.sh, p.hand);
  const L: Layer[] = [];
  const push = (d: string[], fill: Layer['fill']) => L.push({ d, fill });
  // Far leg, set back in a lighter tone
  for (const k of ['thigh', 'quad', 'ham', 'shin', 'calf', 'foot'] as const) push(far[k], 'far');
  // Torso and head
  push(capsule(at(p.sh, p.hip, 0.82, -2.8, tf), at(p.sh, p.hip, 1.05, -3.4, tf), 8.5, 9), lit('glutes') ? 'muscle' : 'body');
  push(capsule(p.sh, p.hip, 13, 11), 'body');
  push(capsule(at(p.sh, p.hip, 0.1, -2.6, tf), at(p.sh, p.hip, 0.55, -2.2, tf), 8, 6), 'body');
  push(capsule(at(p.sh, p.hip, 0.08, 2.6, tf), at(p.sh, p.hip, 0.42, 2.2, tf), 9.5, 6), 'body');
  push(capsule(p.sh, lerp(p.sh, p.head, 0.5), 5.4, 5), 'body');
  push([circle(p.head, 6.4)], 'body');
  if (lit('back')) push(capsule(at(p.sh, p.hip, 0.15, -3.4, tf), at(p.sh, p.hip, 0.75, -3.6, tf), 5, 4.5), 'muscle');
  if (lit('core')) push(capsule(at(p.sh, p.hip, 0.45, 2.4, tf), at(p.sh, p.hip, 0.9, 2.0, tf), 5.5, 5), 'muscle');
  if (lit('hips')) push(capsule(at(p.sh, p.hip, 0.85, 2.6, tf), at(p.hip, p.k1, 0.2, 2.2, front(p.hip, p.k1)), 5, 4.5), 'muscle');
  // Near leg, with the muscles it works
  for (const k of ['thigh', 'quad', 'ham', 'shin', 'calf', 'foot'] as const) push(near[k], 'body');
  if (lit('quads')) push(near.quad, 'muscle');
  if (lit('hamstrings')) push(near.ham, 'muscle');
  if (lit('calves')) push(near.calf, 'muscle');
  if (lit('achilles')) push(near.achilles, 'muscle');
  if (lit('ankles')) push(near.ankle, 'muscle');
  // Near arm
  push([circle(add(p.sh, mul(tf, 0.6)), 4.8)], 'body');
  push(capsule(p.sh, e, 6.2, 4.4), 'body');
  push(capsule(e, p.hand, 4.6, 3.4), 'body');
  push([circle(p.hand, 2.5)], 'body');
  if (weights) {
    const [x, y] = p.hand;
    push([`M${n2(x - 4)},${n2(y)}h10v2h-10Z`, `M${n2(x - 5.5)},${n2(y - 2.5)}h3v7h-3Z`, `M${n2(x + 4.5)},${n2(y - 2.5)}h3v7h-3Z`], 'ink');
  }
  return L;
}
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) o[k] = lerp(a[k], b[k], t);
  return o;
}
export const FILL: Record<Layer['fill'], string> = { body: 'var(--demo-body)', far: 'var(--demo-body-far)', muscle: 'var(--demo-muscle)', ink: 'var(--ink)' };
export const svgOf = (layers: Layer[]) => layers.map((l) => l.d.map((d) => `<path d="${d}" fill="${FILL[l.fill]}"/>`).join('')).join('');
export const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

