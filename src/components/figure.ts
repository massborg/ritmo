// The figure for exercise demos (update 3, §4): a fit, muscular body for its movement pattern, moving between the
// start and end positions, with the muscles the exercise works lit in Ritmo orange ("muscle map"). The body is built
// from smooth tapered shapes laid along the same joints the old stick figure used, so every exercise has a demo.
// Still (the start position) for people who prefer reduced motion.
import type { Pattern } from '../training/strength';

type P = [number, number];
/** `hand2` is the far arm (drawn behind the body); `elbow` / `elbow2` fix an elbow where the usual bend is wrong
 *  (a row, a press, a push-up). Without them the far arm follows the near one and elbows are worked out. */
export interface Pose { head: P; sh: P; hip: P; k1: P; f1: P; k2: P; f2: P; hand: P; hand2?: P; elbow?: P; elbow2?: P }
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

// ---- Exercise-specific demos (update 5, U5) ----
// 23 of the exercises used to borrow a movement that was not theirs (a deadlift drawn as a single-leg RDL, a sled
// push as a lunge). Each of these has its own keyframes, a second arm, and the things it is done with or on.
type Anchor = P | 'hand' | 'hand2' | 'hands' | 'sh' | 'k1' | 'k2' | 'knees';
export type Prop =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; tone?: 'prop' | 'accent' }
  | { kind: 'line'; from: Anchor; to: Anchor; tone?: 'prop' | 'band' }
  | { kind: 'dumbbell' | 'kettlebell' | 'ball' | 'sandbag' | 'bar'; at: Anchor };
export interface Demo { frames: Pose[]; props?: Prop[]; /** 3+ frames: run through them and start again, instead of going back and forth */ loop?: boolean }
const stand: Pick<Pose, 'head' | 'sh' | 'hip'> = { head: [50, 14], sh: [50, 26], hip: [50, 52] };
const BENCH: Prop = { kind: 'rect', x: 14, y: 74, w: 24, h: 18 };
export const DEMOS: Record<string, Demo> = {
  'hinge-2leg': { frames: [{ ...stand, k1: [52, 72], f1: [51, 92], k2: [48, 72], f2: [47, 92], hand: [53, 51], hand2: [51, 51] }, { head: [73, 41], sh: [65, 43], hip: [42, 52], k1: [50, 72], f1: [51, 92], k2: [47, 72], f2: [47, 92], hand: [64, 67], hand2: [62, 67] }] },
  row: { frames: [{ head: [72, 39], sh: [64, 43], hip: [40, 52], k1: [50, 72], f1: [52, 92], k2: [42, 72], f2: [38, 92], hand: [64, 67], hand2: [54, 68] }, { head: [72, 39], sh: [64, 43], hip: [40, 52], k1: [50, 72], f1: [52, 92], k2: [42, 72], f2: [38, 92], hand: [52, 52], elbow: [46, 40], hand2: [54, 68] }], props: [{ kind: 'dumbbell', at: 'hand' }] },
  quadruped: { frames: [{ head: [22, 63], sh: [30, 70], hip: [58, 70], k1: [60, 92], f1: [76, 92], k2: [58, 92], f2: [74, 92], hand: [30, 92], hand2: [32, 92] }, { head: [22, 63], sh: [30, 70], hip: [58, 70], k1: [74, 68], f1: [92, 66], k2: [58, 92], f2: [74, 92], hand: [30, 92], hand2: [8, 64] }] },
  'wall-sit': { frames: [{ head: [36, 36], sh: [36, 48], hip: [36, 72], k1: [58, 72], f1: [58, 92], k2: [56, 72], f2: [56, 92], hand: [48, 70] }, { head: [36, 36.6], sh: [36, 48.4], hip: [36, 72], k1: [58, 72], f1: [58, 92], k2: [56, 72], f2: [56, 92], hand: [48, 70] }], props: [{ kind: 'rect', x: 26, y: 8, w: 4, h: 84 }] },
  rfess: { frames: [{ head: [58, 14], sh: [57, 26], hip: [55, 52], k1: [64, 70], f1: [66, 92], k2: [42, 64], f2: [28, 72], hand: [58, 50] }, { head: [58, 30], sh: [57, 42], hip: [53, 66], k1: [70, 68], f1: [68, 92], k2: [42, 84], f2: [28, 72], hand: [58, 66] }], props: [BENCH] },
  'push-up': { frames: [{ head: [23, 61], sh: [30, 67], hip: [56, 76], k1: [70, 82], f1: [86, 89], k2: [70, 82], f2: [86, 89], hand: [30, 92] }, { head: [22, 79], sh: [30, 84], hip: [56, 87], k1: [70, 89], f1: [86, 90], k2: [70, 89], f2: [86, 90], hand: [30, 92], elbow: [40, 82] }] },
  'overhead-press': { frames: [{ ...stand, k1: [52, 72], f1: [52, 92], k2: [48, 72], f2: [48, 92], hand: [55, 24], elbow: [57, 36], hand2: [47, 24], elbow2: [45, 36] }, { ...stand, k1: [52, 72], f1: [52, 92], k2: [48, 72], f2: [48, 92], hand: [53, 3], hand2: [48, 3] }], props: [{ kind: 'dumbbell', at: 'hand' }, { kind: 'dumbbell', at: 'hand2' }] },
  'pull-down': { frames: [{ ...stand, k1: [52, 72], f1: [52, 92], k2: [48, 72], f2: [48, 92], hand: [57, 5], hand2: [53, 5] }, { ...stand, k1: [52, 72], f1: [52, 92], k2: [48, 72], f2: [48, 92], hand: [60, 48], hand2: [56, 48] }], props: [{ kind: 'line', from: [58, 0], to: 'hands', tone: 'band' }] },
  carry: { frames: [{ ...stand, k1: [58, 72], f1: [62, 92], k2: [44, 72], f2: [38, 92], hand: [52, 52], hand2: [48, 52] }, { head: [52, 14], sh: [52, 26], hip: [52, 52], k1: [48, 72], f1: [42, 92], k2: [58, 72], f2: [64, 92], hand: [54, 52], hand2: [50, 52] }], props: [{ kind: 'kettlebell', at: 'hand2' }, { kind: 'kettlebell', at: 'hand' }] },
  'wall-ball': { frames: [{ head: [46, 34], sh: [47, 44], hip: [37, 64], k1: [58, 66], f1: [52, 92], k2: [56, 68], f2: [48, 92], hand: [56, 40], elbow: [56, 50], hand2: [54, 40] }, { head: [52, 10], sh: [51, 22], hip: [50, 48], k1: [52, 70], f1: [52, 92], k2: [48, 70], f2: [48, 90], hand: [56, 6], hand2: [54, 7] }], props: [{ kind: 'rect', x: 92, y: 2, w: 3, h: 90 }, { kind: 'rect', x: 78, y: 2, w: 14, h: 4, tone: 'accent' }, { kind: 'ball', at: 'hands' }] },
  'sled-push': { frames: [{ head: [66, 38], sh: [58, 44], hip: [38, 60], k1: [52, 72], f1: [54, 92], k2: [28, 78], f2: [18, 92], hand: [72, 50], hand2: [71, 51] }, { head: [70, 38], sh: [62, 44], hip: [42, 60], k1: [36, 78], f1: [26, 92], k2: [56, 72], f2: [58, 92], hand: [76, 50], hand2: [75, 51] }], props: [{ kind: 'rect', x: 74, y: 80, w: 22, h: 12 }, { kind: 'line', from: [75, 80], to: [75, 46] }, { kind: 'line', from: [91, 80], to: [91, 46] }] },
  'sled-pull': { frames: [{ head: [38, 34], sh: [40, 45], hip: [32, 66], k1: [50, 68], f1: [54, 92], k2: [48, 70], f2: [50, 92], hand: [62, 54], hand2: [52, 58] }, { head: [36, 34], sh: [38, 45], hip: [31, 66], k1: [50, 68], f1: [54, 92], k2: [48, 70], f2: [50, 92], hand: [50, 57], elbow: [42, 60], hand2: [63, 53] }], props: [{ kind: 'rect', x: 80, y: 80, w: 16, h: 12 }, { kind: 'line', from: 'hand', to: [80, 84] }, { kind: 'line', from: 'hand2', to: [80, 84] }] },
  'side-walk': { frames: [{ head: [46, 18], sh: [46, 30], hip: [46, 56], k1: [52, 72], f1: [53, 92], k2: [40, 72], f2: [39, 92], hand: [54, 50], hand2: [38, 50] }, { head: [54, 18], sh: [54, 30], hip: [54, 56], k1: [68, 72], f1: [72, 92], k2: [46, 72], f2: [42, 92], hand: [62, 50], hand2: [46, 50] }], props: [{ kind: 'line', from: 'k1', to: 'k2', tone: 'band' }] },
  skater: { frames: [{ head: [30, 24], sh: [32, 36], hip: [34, 60], k1: [32, 76], f1: [30, 92], k2: [46, 74], f2: [54, 84], hand: [46, 40], hand2: [18, 54] }, { head: [70, 24], sh: [68, 36], hip: [66, 60], k1: [68, 76], f1: [70, 92], k2: [54, 74], f2: [46, 84], hand: [54, 40], hand2: [82, 54] }] },
  'half-kneel': { frames: [{ head: [46, 32], sh: [46, 44], hip: [46, 70], k1: [64, 72], f1: [66, 92], k2: [40, 91], f2: [24, 92], hand: [54, 64] }, { head: [52, 30], sh: [52, 42], hip: [52, 72], k1: [68, 72], f1: [68, 92], k2: [42, 91], f2: [26, 92], hand: [54, 14] }] },
  'ankle-rock': { frames: [{ head: [46, 32], sh: [46, 44], hip: [46, 70], k1: [64, 72], f1: [66, 92], k2: [40, 91], f2: [24, 92], hand: [56, 66] }, { head: [54, 33], sh: [53, 45], hip: [50, 70], k1: [74, 73], f1: [66, 92], k2: [42, 91], f2: [26, 92], hand: [66, 68] }] },
  'burpee-broad-jump': { loop: true, frames: [{ ...stand, k1: [52, 72], f1: [52, 92], k2: [48, 72], f2: [48, 92], hand: [56, 48], hand2: [52, 48] }, { head: [18, 86], sh: [26, 88], hip: [52, 88], k1: [66, 89], f1: [82, 90], k2: [66, 89], f2: [82, 90], hand: [28, 92], hand2: [30, 92] }, { head: [70, 30], sh: [66, 40], hip: [52, 58], k1: [66, 64], f1: [58, 78], k2: [62, 66], f2: [54, 80], hand: [82, 30], hand2: [80, 32] }] },
  'seated-calf': { frames: [{ head: [40, 32], sh: [40, 44], hip: [42, 68], k1: [62, 68], f1: [62, 92], k2: [60, 68], f2: [60, 92], hand: [60, 66] }, { head: [40, 29], sh: [40, 41], hip: [42, 65], k1: [62, 63], f1: [63, 86], k2: [60, 63], f2: [61, 86], hand: [60, 61] }], props: [{ kind: 'rect', x: 26, y: 72, w: 24, h: 20 }, { kind: 'dumbbell', at: 'k1' }] },
  'step-down': { frames: [{ head: [46, 8], sh: [46, 20], hip: [46, 46], k1: [47, 62], f1: [46, 76], k2: [52, 62], f2: [56, 80], hand: [56, 36] }, { head: [42, 18], sh: [43, 30], hip: [40, 56], k1: [52, 64], f1: [46, 76], k2: [52, 76], f2: [58, 92], hand: [56, 46] }], props: [{ kind: 'rect', x: 30, y: 78, w: 22, h: 14 }] },
  'step-up': { frames: [{ head: [42, 18], sh: [42, 30], hip: [42, 56], k1: [56, 60], f1: [58, 76], k2: [42, 74], f2: [42, 92], hand: [48, 48] }, { head: [54, 6], sh: [54, 18], hip: [54, 44], k1: [57, 60], f1: [58, 76], k2: [60, 54], f2: [56, 70], hand: [60, 36] }], props: [{ kind: 'rect', x: 50, y: 78, w: 22, h: 14 }] },
  pallof: { frames: [{ ...stand, k1: [54, 72], f1: [56, 92], k2: [46, 72], f2: [44, 92], hand: [54, 38], elbow: [56, 46], hand2: [52, 38] }, { ...stand, k1: [54, 72], f1: [56, 92], k2: [46, 72], f2: [44, 92], hand: [72, 36], hand2: [70, 36] }], props: [{ kind: 'rect', x: 95, y: 20, w: 3, h: 72 }, { kind: 'line', from: 'hands', to: [95, 38], tone: 'band' }] },
  'bridge-1leg': { frames: [{ head: [12, 86], sh: [22, 86], hip: [46, 86], k1: [62, 70], f1: [70, 90], k2: [64, 80], f2: [82, 74], hand: [36, 90] }, { head: [12, 86], sh: [22, 84], hip: [46, 66], k1: [62, 66], f1: [70, 90], k2: [64, 60], f2: [82, 54], hand: [36, 90] }] },
  thrust: { frames: [{ head: [14, 62], sh: [24, 68], hip: [44, 84], k1: [62, 70], f1: [68, 92], k2: [62, 70], f2: [68, 92], hand: [36, 80] }, { head: [14, 62], sh: [24, 67], hip: [46, 66], k1: [64, 68], f1: [68, 92], k2: [64, 68], f2: [68, 92], hand: [38, 64] }], props: [{ kind: 'rect', x: 6, y: 72, w: 22, h: 20 }] },
  'thrust-1leg': { frames: [{ head: [14, 62], sh: [24, 68], hip: [44, 84], k1: [62, 70], f1: [68, 92], k2: [60, 80], f2: [78, 76], hand: [36, 80] }, { head: [14, 62], sh: [24, 67], hip: [46, 66], k1: [64, 68], f1: [68, 92], k2: [64, 62], f2: [82, 58], hand: [38, 64] }], props: [{ kind: 'rect', x: 6, y: 72, w: 22, h: 20 }] },
  'calf-bent': { frames: [{ head: [48, 20], sh: [48, 32], hip: [46, 56], k1: [56, 72], f1: [51, 92], k2: [54, 73], f2: [49, 92], hand: [60, 46] }, { head: [48, 13], sh: [48, 25], hip: [46, 49], k1: [56, 65], f1: [52, 85], k2: [54, 66], f2: [50, 85], hand: [60, 39] }] },
  'side-plank-lift': { frames: [{ head: [24, 50], sh: [30, 60], hip: [56, 70], k1: [70, 80], f1: [84, 90], k2: [70, 79], f2: [84, 88], hand: [30, 90], hand2: [36, 44] }, { head: [24, 50], sh: [30, 60], hip: [56, 70], k1: [70, 80], f1: [84, 90], k2: [72, 66], f2: [88, 62], hand: [30, 90], hand2: [36, 44] }] },
  'side-leg-raise': { frames: [{ head: [14, 82], sh: [24, 84], hip: [50, 84], k1: [68, 87], f1: [86, 89], k2: [68, 84], f2: [86, 84], hand: [20, 70] }, { head: [14, 82], sh: [24, 84], hip: [50, 84], k1: [68, 87], f1: [86, 89], k2: [66, 72], f2: [82, 60], hand: [20, 70] }] },
  'plank-still': { frames: [{ head: [20, 64], sh: [28, 70], hip: [56, 74], k1: [70, 77], f1: [84, 82], k2: [70, 77], f2: [84, 82], hand: [28, 90] }, { head: [20, 63.5], sh: [28, 69.6], hip: [56, 73.5], k1: [70, 77], f1: [84, 82], k2: [70, 77], f2: [84, 82], hand: [28, 90] }] },
};
/** Which demo an exercise uses when it is not simply its movement pattern, and what it is done with */
const EXERCISE_DEMO: Record<string, { demo: string; props?: Prop[] }> = {
  'db-rdl': { demo: 'hinge-2leg', props: [{ kind: 'dumbbell', at: 'hand2' }, { kind: 'dumbbell', at: 'hand' }] }, 'trap-deadlift': { demo: 'hinge-2leg', props: [{ kind: 'bar', at: 'hands' }] },
  'db-row': { demo: 'row' }, 'sled-pull': { demo: 'sled-pull' }, 'bird-dog': { demo: 'quadruped' }, 'wall-sit': { demo: 'wall-sit' },
  bulgarian: { demo: 'rfess' }, 'rfe-weighted': { demo: 'rfess', props: [BENCH, { kind: 'dumbbell', at: 'hand' }] }, 'push-up': { demo: 'push-up' }, pallof: { demo: 'pallof' },
  'overhead-press': { demo: 'overhead-press' }, 'band-pulldown': { demo: 'pull-down' }, 'farmers-carry': { demo: 'carry' }, 'wall-ball': { demo: 'wall-ball' },
  'sled-push': { demo: 'sled-push' }, 'band-walk': { demo: 'side-walk' }, skater: { demo: 'skater' }, 'burpee-broad-jump': { demo: 'burpee-broad-jump' },
  'hip-flexor': { demo: 'half-kneel' }, 'ankle-rock': { demo: 'ankle-rock' }, 'seated-calf': { demo: 'seated-calf' }, 'step-down': { demo: 'step-down' },
  'step-up': { demo: 'step-up' }, 'weighted-step-up': { demo: 'step-up', props: [{ kind: 'rect', x: 50, y: 78, w: 22, h: 14 }, { kind: 'dumbbell', at: 'hand' }] },
  'sl-bridge': { demo: 'bridge-1leg' }, 'hip-thrust': { demo: 'thrust' }, 'sl-hip-thrust': { demo: 'thrust-1leg' }, 'bent-calf': { demo: 'calf-bent' },
  'side-plank-lift': { demo: 'side-plank-lift' }, 'side-leg-raise': { demo: 'side-leg-raise' }, plank: { demo: 'plank-still' },
  'sandbag-lunge': { demo: 'lunge', props: [{ kind: 'sandbag', at: 'sh' }] },
};
/** The keyframes and props for an exercise: its own demo when it has one, else its movement pattern */
export function demoFor(id: string | undefined, pattern: Pattern): Demo {
  const own = id ? EXERCISE_DEMO[id] : undefined;
  if (!own) return { frames: POSES[pattern] };
  const base = DEMOS[own.demo] ?? { frames: POSES[own.demo as Pattern] ?? POSES[pattern] };
  return { ...base, props: own.props ?? base.props };
}
/** True when the exercise has a drawing of its own (not one borrowed from its pattern) */
export const hasOwnDemo = (id: string) => !!EXERCISE_DEMO[id];
/** The pose at time t (0 to 1) through a demo: back and forth between two frames, or once round a loop */
export function demoPose(d: Demo, t: number): Pose {
  const f = d.frames;
  if (f.length < 2) return f[0];
  // Any time is taken round the cycle (a frame timestamp can be a moment before the start)
  t = ((t % 1) + 1) % 1;
  if (!d.loop || f.length === 2) { const x = t < 0.5 ? t * 2 : 2 - t * 2; const seg = Math.min(f.length - 2, Math.floor(x * (f.length - 1))); return lerpPose(f[seg], f[seg + 1], ease(x * (f.length - 1) - seg)); }
  const x = (t % 1) * f.length, i = Math.floor(x) % f.length;
  return lerpPose(f[i], f[(i + 1) % f.length], ease(x - Math.floor(x)));
}

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
export type Part = 'quads' | 'glutes' | 'hamstrings' | 'calves' | 'achilles' | 'ankles' | 'core' | 'back' | 'hips' | 'chest' | 'arms' | 'shoulders';
export const PART_LABEL: Record<Part, string> = { quads: 'Quads', glutes: 'Glutes', hamstrings: 'Hamstrings', calves: 'Calves', achilles: 'Achilles', ankles: 'Ankles', core: 'Core', back: 'Back', hips: 'Hips', chest: 'Chest', arms: 'Arms', shoulders: 'Shoulders' };
/** "Quads, glutes": the muscles in a sentence */
export const worksLabel = (muscles: string[]) => muscles.map((m, i) => { const l = PART_LABEL[m as Part] ?? m; return i === 0 ? l : l.toLowerCase(); }).join(', ');

export interface Layer { d: string[]; fill: 'body' | 'far' | 'muscle' | 'ink' | 'prop' | 'accent' | 'band' }
/** Everything to draw for one pose, back to front */
export function figure(p: Pose, muscles: string[], weights = false, props: Prop[] = []): Layer[] {
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
  const near = leg(p.k1, p.f1), far = leg(p.k2, p.f2), e = p.elbow ?? elbow(p.sh, p.hand);
  const L: Layer[] = [];
  const push = (d: string[], fill: Layer['fill']) => L.push({ d, fill });
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const where = (a: Anchor): P => (typeof a !== 'string' ? a : a === 'hands' ? mid(p.hand, p.hand2 ?? p.hand) : a === 'knees' ? mid(p.k1, p.k2) : a === 'hand2' ? p.hand2 ?? p.hand : p[a]);
  // What it is done on or against (bench, box, wall, sled): behind the body
  for (const x of props) if (x.kind === 'rect') push([`M${n2(x.x)},${n2(x.y)}h${n2(x.w)}v${n2(x.h)}h${n2(-x.w)}Z`], x.tone ?? 'prop');
  // The far arm, set back like the far leg
  if (p.hand2) { const e2 = p.elbow2 ?? elbow(p.sh, p.hand2); push([...capsule(p.sh, e2, 5.6, 4), ...capsule(e2, p.hand2, 4.2, 3.2), circle(p.hand2, 2.3)], 'far'); }
  // Far leg, set back in a lighter tone
  for (const k of ['thigh', 'quad', 'ham', 'shin', 'calf', 'foot'] as const) push(far[k], 'far');
  // Torso and head
  push(capsule(at(p.sh, p.hip, 0.82, -2.8, tf), at(p.sh, p.hip, 1.05, -3.4, tf), 8.5, 9), lit('glutes') ? 'muscle' : 'body');
  push(capsule(p.sh, p.hip, 13, 11), 'body');
  push(capsule(at(p.sh, p.hip, 0.1, -2.6, tf), at(p.sh, p.hip, 0.55, -2.2, tf), 8, 6), 'body');
  push(capsule(at(p.sh, p.hip, 0.08, 2.6, tf), at(p.sh, p.hip, 0.42, 2.2, tf), 9.5, 6), lit('chest') ? 'muscle' : 'body');
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
  push([circle(add(p.sh, mul(tf, 0.6)), 4.8)], lit('shoulders') ? 'muscle' : 'body');
  push(capsule(p.sh, e, 6.2, 4.4), lit('arms') ? 'muscle' : 'body');
  push(capsule(e, p.hand, 4.6, 3.4), 'body');
  push([circle(p.hand, 2.5)], 'body');
  if (weights) {
    const [x, y] = p.hand;
    push([`M${n2(x - 4)},${n2(y)}h10v2h-10Z`, `M${n2(x - 5.5)},${n2(y - 2.5)}h3v7h-3Z`, `M${n2(x + 4.5)},${n2(y - 2.5)}h3v7h-3Z`], 'ink');
  }
  // What is held or worn (weights, ball, band, rope): in front
  for (const x of props) {
    if (x.kind === 'rect') continue;
    if (x.kind === 'line') { push(capsule(where(x.from), where(x.to), 1.4, 1.4), x.tone ?? 'prop'); continue; }
    const [cx, cy] = where(x.at);
    if (x.kind === 'dumbbell') push([`M${n2(cx - 4)},${n2(cy - 1)}h8v2h-8Z`, `M${n2(cx - 5.5)},${n2(cy - 3.5)}h3v7h-3Z`, `M${n2(cx + 2.5)},${n2(cy - 3.5)}h3v7h-3Z`], 'ink');
    else if (x.kind === 'kettlebell') push([circle([cx, cy + 5.5], 4.2), `M${n2(cx - 2.6)},${n2(cy + 2.2)}v-3.4h5.2v3.4h-1.4v-2h-2.4v2Z`], 'ink');
    else if (x.kind === 'ball') push([circle([cx, cy - 1], 5.2)], 'accent');
    else if (x.kind === 'sandbag') push(capsule([cx - 6, cy - 3], [cx + 6, cy - 3], 6.5, 6.5), 'ink');
    else if (x.kind === 'bar') push([`M${n2(cx - 11)},${n2(cy - 1)}h22v2h-22Z`, circle([cx - 11, cy], 4), circle([cx + 11, cy], 4)], 'ink');
  }
  return L;
}
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  // An arm or elbow given in only one of the two poses is worked out for the other, so it moves smoothly
  const full = (p: Pose): Required<Pose> => { const hand2 = p.hand2 ?? p.hand; return { ...p, hand2, elbow: p.elbow ?? elbow(p.sh, p.hand), elbow2: p.elbow2 ?? elbow(p.sh, hand2) }; };
  const fa = full(a), fb = full(b);
  for (const k of ['head', 'sh', 'hip', 'k1', 'f1', 'k2', 'f2', 'hand'] as const) o[k] = lerp(a[k], b[k], t);
  if (a.hand2 || b.hand2) { o.hand2 = lerp(fa.hand2, fb.hand2, t); if (a.elbow2 || b.elbow2) o.elbow2 = lerp(fa.elbow2, fb.elbow2, t); }
  if (a.elbow || b.elbow) o.elbow = lerp(fa.elbow, fb.elbow, t);
  return o;
}
export const FILL: Record<Layer['fill'], string> = { body: 'var(--demo-body)', far: 'var(--demo-body-far)', muscle: 'var(--demo-muscle)', ink: 'var(--ink)', prop: 'var(--demo-body-far)', accent: 'var(--accent)', band: 'var(--demo-muscle)' };
export const svgOf = (layers: Layer[]) => layers.map((l) => l.d.map((d) => `<path d="${d}" fill="${FILL[l.fill]}"/>`).join('')).join('');
export const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

