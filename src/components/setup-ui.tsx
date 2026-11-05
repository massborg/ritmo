// Small shared pieces from the design foundations: step progress, toast and "See more".
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Progress for multi-step flows: a segmented bar plus "Step 2 of 9" for screen readers and sighted users. */
export function ProgressSteps({ current, total, label }: { current: number; total: number; label?: string }) {
  return (
    <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1} aria-valuetext={`Step ${current + 1} of ${total}${label ? `: ${label}` : ''}`}>
      <div className="steps-bar" aria-hidden="true">{Array.from({ length: total }, (_, k) => <span key={k} className={k < current ? 'done' : k === current ? 'now' : ''} />)}</div>
      <span className="caption">Step {current + 1} of {total}{label ? ` · ${label}` : ''}</span>
    </div>
  );
}

/** A short message that confirms an action, then fades. */
export function Toast({ message, onDone, ms = 3500 }: { message?: string; onDone: () => void; ms?: number }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onDone, ms); return () => clearTimeout(t); }, [message, ms, onDone]);
  if (!message) return null;
  return <div className="toast" role="status" aria-live="polite">{message}</div>;
}

/** Keeps secondary details out of the way until asked for. */
export function SeeMore({ children, label = 'See more', lessLabel = 'See less' }: { children: ReactNode; label?: string; lessLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      {open && children}
      <button className="btn btn-ghost see-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? lessLabel : label}<ChevronDown size={18} strokeWidth={2} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur)' }} />
      </button>
    </div>
  );
}
