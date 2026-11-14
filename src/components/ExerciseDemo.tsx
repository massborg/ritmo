// A short demo for each exercise (update 3, §4): the fit figure from ./figure moving between the start and end
// positions, with the muscles the exercise works lit in Ritmo orange. Still for people who prefer reduced motion.
import { useEffect, useRef } from 'react';
import type { Pattern } from '../training/strength';
import { ease, figure, lerpPose, POSES, svgOf, worksLabel } from './figure';

export function ExerciseDemo({ pattern, name, muscles = [], weights = false, size = 120 }: { pattern: Pattern; name: string; muscles?: string[]; weights?: boolean; size?: number }) {
  const g = useRef<SVGGElement>(null);
  const [a, b] = POSES[pattern];
  const key = muscles.join(',');
  useEffect(() => {
    const el = g.current;
    if (!el) return;
    const ms = key ? key.split(',') : [];
    const draw = (t: number) => { el.innerHTML = svgOf(figure(lerpPose(a, b, t), ms, weights)); };
    draw(0);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame === 'undefined') return;
    let id = 0;
    const start = performance.now(), period = 2600;
    const tick = (now: number) => { const ph = ((now - start) % period) / period; draw(ease(ph < 0.5 ? ph * 2 : 2 - ph * 2)); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [a, b, key, weights]);
  const works = muscles.length ? `, working the ${worksLabel(muscles).toLowerCase()}` : '';
  return (
    <svg className="exercise-demo" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`How to do ${name}${works}`}>
      <line x1="4" y1="94" x2="96" y2="94" stroke="var(--hairline)" strokeWidth="1.5" />
      <g ref={g} />
    </svg>
  );
}
