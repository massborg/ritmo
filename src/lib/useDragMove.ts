// Drag a planned session onto another day. Works with mouse, pen and touch: a mouse drag starts after a
// small movement; on touch the runner presses and holds for a moment first, so ordinary scrolling still works.
// Drop targets are elements with data-drop-date="YYYY-MM-DD". Tapping without dragging still works as a tap.
import { useEffect, useRef, useState } from 'react';

export interface DragState { id: string; label: string; x: number; y: number; over: string | null }

const HOLD_MS = 350;
const SLOP = 8;

export function useDragMove(onDrop: (id: string, date: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{ id: string; label: string; x: number; y: number; touch: boolean; timer?: number; active: boolean } | null>(null);
  const justDragged = useRef(false);
  const dropRef = useRef(onDrop);
  useEffect(() => { dropRef.current = onDrop; });

  useEffect(() => {
    const dateAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-drop-date]') as HTMLElement | null)?.dataset.dropDate ?? null;
    const start = (p: NonNullable<typeof pending.current>, x: number, y: number) => {
      p.active = true;
      justDragged.current = true;
      navigator.vibrate?.(10);
      setDrag({ id: p.id, label: p.label, x, y, over: dateAt(x, y) });
    };
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP;
      if (!p.active) {
        if (p.touch) { if (far) { clearTimeout(p.timer); pending.current = null; } return; } // moving before the hold: it is a scroll
        if (far) start(p, e.clientX, e.clientY);
        return;
      }
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: dateAt(e.clientX, e.clientY) } : d));
    };
    const end = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      clearTimeout(p.timer);
      pending.current = null;
      if (!p.active) return;
      setDrag(null);
      const d = e.type === 'pointerup' ? dateAt(e.clientX, e.clientY) : null;
      if (d) dropRef.current(p.id, d);
      setTimeout(() => { justDragged.current = false; }, 0);
    };
    // While dragging on touch, stop the page from scrolling
    const noScroll = (e: TouchEvent) => { if (pending.current?.active) e.preventDefault(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && pending.current?.active) { pending.current = null; setDrag(null); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    document.addEventListener('touchmove', noScroll, { passive: false });
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.removeEventListener('touchmove', noScroll);
      window.removeEventListener('keydown', esc);
    };
  }, []);

  /** Props for an element that can be dragged. */
  const handle = (id: string, label: string) => ({
    'data-draggable': true,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const touch = e.pointerType !== 'mouse';
      const p = { id, label, x: e.clientX, y: e.clientY, touch, active: false, timer: undefined as number | undefined };
      pending.current = p;
      if (touch) p.timer = window.setTimeout(() => { if (pending.current === p) { p.active = true; justDragged.current = true; navigator.vibrate?.(10); setDrag({ id, label, x: p.x, y: p.y, over: null }); } }, HOLD_MS);
    },
    onContextMenu: (e: React.MouseEvent) => { if (pending.current) e.preventDefault(); },
  });

  /** Put on a container: swallows the click that ends a drag, so dropping does not also open the day. */
  const swallowClick = (e: React.MouseEvent) => { if (justDragged.current) { e.preventDefault(); e.stopPropagation(); } };

  return { drag, handle, swallowClick };
}
