// A short demo for each exercise (update 3, §4): an animated figure for its movement pattern, moving between the
// start and end positions. Still (the start position) for people who prefer reduced motion.
import type { Pattern } from '../training/strength';

type P = [number, number];
interface Pose { head: P; sh: P; hip: P; k1: P; f1: P; k2: P; f2: P; hand: P }
const pose = (o: Pose) => o;
// Side view, 100 x 100, ground at y = 92
const POSES: Record<Pattern, [Pose, Pose]> = {
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
const pts = (...xs: P[]) => xs.map(([x, y]) => `${x},${y}`).join(' ');
const parts = (p: Pose) => ({ body: pts(p.sh, p.hip), arm: pts(p.sh, p.hand), leg1: pts(p.hip, p.k1, p.f1), leg2: pts(p.hip, p.k2, p.f2) });

export function ExerciseDemo({ pattern, name, size = 120 }: { pattern: Pattern; name: string; size?: number }) {
  const [a, b] = POSES[pattern];
  const A = parts(a), B = parts(b);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anim = (from: string, to: string) => (reduce ? null : <animate attributeName="points" values={`${from};${to};${from}`} dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />);
  return (
    <svg className="exercise-demo" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`How to do ${name}`}>
      <line x1="4" y1="93" x2="96" y2="93" stroke="var(--hairline)" strokeWidth="2" />
      <g fill="none" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={A.leg2} opacity="0.55">{anim(A.leg2, B.leg2)}</polyline>
        <polyline points={A.body}>{anim(A.body, B.body)}</polyline>
        <polyline points={A.leg1}>{anim(A.leg1, B.leg1)}</polyline>
        <polyline points={A.arm} stroke="var(--brand)">{anim(A.arm, B.arm)}</polyline>
      </g>
      <circle cx={a.head[0]} cy={a.head[1]} r="6" fill="var(--ink)">
        {!reduce && <animate attributeName="cx" values={`${a.head[0]};${b.head[0]};${a.head[0]}`} dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />}
        {!reduce && <animate attributeName="cy" values={`${a.head[1]};${b.head[1]};${a.head[1]}`} dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />}
      </circle>
    </svg>
  );
}
