// A short demo for each exercise (update 3, §4): the fit figure from ./figure moving between the start and end
// positions, with the muscles the exercise works lit in Ritmo orange. Still for people who prefer reduced motion.
import { useEffect, useRef } from 'react';
import type { Pattern } from '../training/strength';
import { demoFor, demoPose, figure, svgOf, worksLabel } from './figure';

/** `id` is the exercise: one with a drawing of its own (a push-up, a sled push) uses it, with its props; any other
 *  uses its movement pattern. */
export function ExerciseDemo({ id, pattern, name, muscles = [], weights = false, size = 120 }: { id?: string; pattern: Pattern; name: string; muscles?: string[]; weights?: boolean; size?: number }) {
  const g = useRef<SVGGElement>(null);
  const demo = demoFor(id, pattern);
  // Its own props already show what is held; the plain dumbbell is for pattern demos only
  const dumbbell = weights && !demo.props?.some((x) => x.kind !== 'rect' && x.kind !== 'line');
  const key = muscles.join(',');
  useEffect(() => {
    const el = g.current;
    if (!el) return;
    const ms = key ? key.split(',') : [];
    const draw = (t: number) => { el.innerHTML = svgOf(figure(demoPose(demo, t), ms, dumbbell, demo.props)); };
    draw(0);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    const start = performance.now(), period = demo.loop ? 3600 : 2600;
    const tick = (now: number) => { draw(((now - start) % period) / period); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, pattern, key, weights]); // eslint-disable-line react-hooks/exhaustive-deps
  const works = muscles.length ? `, working the ${worksLabel(muscles).toLowerCase()}` : '';
  return (
    <svg className="exercise-demo" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`How to do ${name}${works}`}>
      <line x1="4" y1="94" x2="96" y2="94" stroke="var(--hairline)" strokeWidth="1.5" />
      <g ref={g} />
    </svg>
  );
}
