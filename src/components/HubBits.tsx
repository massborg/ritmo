// Small pieces shared by the Hub profile, lists and notifications (update 2, §11–§14).
import { useEffect, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { duration } from '../lib/format';
import type { ShownPb } from '../training/profile-pbs';

/** The PB strip: only the distances the runner chose; hand-entered times say "self-reported" */
export function PbStrip({ pbs }: { pbs?: ShownPb[] | null }) {
  if (!pbs?.length) return null;
  return (
    <ul className="pb-strip" aria-label="Personal bests">
      {pbs.map((p) => (
        <li key={p.m} className="pb-cell">
          <span className="caption">{p.label}</span>
          <span className="stat pb-time">{duration(p.timeS)}</span>
          <span className="caption pb-meta">{p.self ? <span className="row" style={{ gap: 3 }}><Info size={12} strokeWidth={2} aria-hidden="true" />Self-reported</span> : p.race ?? (p.date ? new Date(`${p.date}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '')}</span>
          {!p.self && p.basis && <span className="caption pb-basis">{p.basis === 'official' ? 'Official race time' : 'Best effort'}</span>}
        </li>
      ))}
    </ul>
  );
}

/** A toast with an action ("Anna can now follow you. Follow back"), on its own for about 6 seconds */
export function ActionToast({ message, action, onDone }: { message: ReactNode; action?: ReactNode; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 6000); return () => clearTimeout(t); }, [onDone]);
  return <div className="toast toast-action" role="status" aria-live="polite"><span>{message}</span>{action}</div>;
}
