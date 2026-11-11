// Deleting a run (update 2, §8): the confirmation sheet, a long press on run lists, and the Undo toast.
import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import { dist } from '../lib/format';
import type { Activity } from '../lib/types';

/** Where an imported run came from, in the words the confirmation uses ("This doesn't delete it from Strava") */
export function importedFrom(a: Activity): string | undefined {
  if (a.source === 'manual' || a.source === 'sample') return undefined;
  if (a.sourceIds.strava) return 'Strava';
  if (a.sourceIds.garmin) return 'Garmin Connect';
  if (a.sourceIds.apple_health) return 'Apple Health';
  if (a.sourceIds.health_connect) return 'Health Connect';
  if (a.source === 'ritmo_gps') return undefined;
  return 'the file on your device';
}

export function DeleteRunSheet({ run, onClose, onDeleted }: { run: Activity; onClose: () => void; onDeleted?: () => void }) {
  const { deleteRun, data } = useApp();
  const from = data.mode === 'real' ? importedFrom(run) : undefined;
  return (
    <Sheet open onClose={onClose} title="Delete this run?"
      footer={(
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-block" onClick={onClose}>Cancel</button>
          <button className="btn btn-block btn-danger-solid" onClick={() => { deleteRun(run.id); onClose(); onDeleted?.(); }}><Trash2 size={18} strokeWidth={2} aria-hidden="true" />Delete</button>
        </div>
      )}>
      <div className="stack-sm">
        <p className="label">{run.name} · {new Date(run.startTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {dist(run.distanceM, data.profile.units)}</p>
        <p>It will be removed from your stats, records, plan and the Hub.</p>
        {from && <p className="muted">This doesn't delete it from {from}. Ritmo remembers it, so it won't come back on the next sync, and you can re-import it from Data sources.</p>}
      </div>
    </Sheet>
  );
}

/**
 * A long press (or right-click) on a run in a list offers to delete it. Returns the props for each run's link and the
 * sheet to render once. A tap still opens the run.
 */
export function useRunLongPress(): { bind: (a: Activity) => Record<string, unknown>; sheet: ReactNode } {
  const [run, setRun] = useState<Activity>();
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const fired = useRef(false);
  const cancel = () => { window.clearTimeout(timer.current); start.current = undefined; };
  const bind = (a: Activity) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(15); setRun(a); }, 550);
    },
    onPointerMove: (e: PointerEvent) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel(); },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); cancel(); setRun(a); },
    // The tap that ends a long press does not also open the run
    onClickCapture: (e: MouseEvent) => { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; } },
    'aria-description': 'Press and hold to delete',
  });
  return { bind, sheet: run ? <DeleteRunSheet run={run} onClose={() => setRun(undefined)} /> : null };
}

/** "Run deleted · Undo", for 10 seconds after a run is deleted, on every screen */
export function UndoDeleteToast() {
  const { undoableDelete, undoDelete } = useApp();
  if (!undoableDelete) return null;
  return (
    <div className="toast toast-action" role="status" aria-live="polite">
      <span>Run deleted</span>
      <button className="toast-btn" onClick={undoDelete}>Undo</button>
    </div>
  );
}
