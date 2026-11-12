// Pocket mode (update 3, §3): a full-screen black overlay for running with the phone in a pocket. It keeps the page
// active (Wake Lock), ignores touches, shows big distance, time and pace, and says when the next voice cue comes.
// Swipe up to unlock.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUp } from 'lucide-react';

export function PocketMode({ distance, unit, time, pace, cueLine, gpsLost, onUnlock }: {
  distance: string; unit: string; time: string; pace: string; cueLine: string; gpsLost?: number; onUnlock: () => void;
}) {
  const start = useRef<number | undefined>(undefined);
  const [lift, setLift] = useState(0);
  // Keep the screen (and so GPS and voice) awake while in the pocket
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const get = () => { nav.wakeLock?.request('screen').then((w) => { lock = w; }).catch(() => {}); };
    get();
    // A wake lock is dropped when the page is hidden; take it again when it comes back
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release(); };
  }, []);
  // Positions kept in refs, so the swipe is judged on the real finger position, not on the last render
  const last = useRef<number | undefined>(undefined);
  const down = (y: number) => { start.current = y; last.current = y; };
  const move = (y: number) => { if (start.current == null) return; last.current = y; setLift(Math.max(0, start.current - y)); };
  const up = () => {
    const d = start.current != null && last.current != null ? start.current - last.current : 0;
    start.current = undefined; last.current = undefined; setLift(0);
    if (d > 120) onUnlock();
  };
  // On document.body, above the tab bar and anything else on the page
  return createPortal(
    <div className="pocket" role="dialog" aria-modal="true" aria-label="Pocket mode. Swipe up to unlock."
      // Fingers use touch events; pointer events are for a mouse only. A browser may cancel the pointer during the
      // gesture, so a cancel never ends the swipe: lifting the finger (or the mouse button) does.
      onPointerDown={(e) => { if (e.pointerType === 'touch') return; e.preventDefault(); down(e.clientY); }}
      onPointerMove={(e) => { if (e.pointerType !== 'touch') move(e.clientY); }}
      onPointerUp={(e) => { if (e.pointerType !== 'touch') up(); }}
      onTouchStart={(e) => down(e.touches[0].clientY)} onTouchMove={(e) => move(e.touches[0].clientY)} onTouchEnd={up} onTouchCancel={up}
      onContextMenu={(e) => e.preventDefault()} onKeyDown={(e) => { if (e.key === 'Escape') onUnlock(); }}>
      <div className="pocket-stats" style={{ transform: `translateY(${-Math.min(lift, 160)}px)`, opacity: 1 - Math.min(lift, 160) / 320 }}>
        <span className="pocket-big" data-testid="pocket-distance">{distance}<small> {unit}</small></span>
        <span className="pocket-mid">{time}</span>
        <span className="pocket-mid">{pace}</span>
        <span className="pocket-cue">{cueLine}</span>
        {gpsLost != null && <span className="pocket-gps">No GPS for {gpsLost} s: distance waits for the signal</span>}
      </div>
      <div className="pocket-unlock" aria-hidden="true"><ChevronsUp size={28} strokeWidth={2} /><span>Swipe up to unlock</span></div>
      <button className="sr-only" onClick={onUnlock}>Unlock</button>
    </div>
  , document.body);
}
