// App-style inputs: bottom sheet, calendar date picker, time picker, stepper and choice chips.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { addDays, DAY_SHORT, longDate, MONTHS_LONG, parseYmd, startOfWeek, ymd } from '../lib/format';

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], button, input')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="row-between" style={{ padding: '0 var(--s4)' }}>
          <h2 className="title">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={22} strokeWidth={2} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A month calendar. Marks optional dates (e.g. sessions) with a dot. */
export function MonthCalendar({ value, onChange, min, marks }: { value?: string; onChange: (d: string) => void; min?: string; marks?: Set<string> }) {
  const [cursor, setCursor] = useState(() => (value ? parseYmd(value) : new Date()));
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = ymd(new Date());
  return (
    <div className="stack-sm">
      <div className="row-between">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={22} strokeWidth={2} /></button>
        <span className="label" aria-live="polite">{MONTHS_LONG[cursor.getMonth()]} {cursor.getFullYear()}</span>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={22} strokeWidth={2} /></button>
      </div>
      <div className="mcal" role="grid">
        {DAY_SHORT.map((d) => <span key={d} className="caption mcal-dow" aria-hidden="true">{d.slice(0, 1)}</span>)}
        {days.map((d) => {
          const k = ymd(d);
          const disabled = !!min && k < min;
          return (
            <button key={k} type="button" role="gridcell" disabled={disabled}
              className={`mcal-day${d.getMonth() !== cursor.getMonth() ? ' out' : ''}${k === today ? ' today' : ''}`}
              aria-selected={value === k} aria-label={longDate(d)} onClick={() => onChange(k)}>
              {d.getDate()}
              {marks?.has(k) && <span className="mcal-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateField({ label, value, onChange, min, id }: { label: string; value: string; onChange: (d: string) => void; min?: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <div className="field">
      <span className="label" id={`${id}-l`}>{label}</span>
      <button type="button" className="input pick" aria-labelledby={`${id}-l`} aria-haspopup="dialog" onClick={() => { setDraft(value); setOpen(true); }}>
        <CalendarDays size={20} strokeWidth={2} aria-hidden="true" />
        <span className={value ? '' : 'muted'}>{value ? longDate(parseYmd(value)) : 'Choose a date'}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}
        footer={<button type="button" className="btn btn-primary btn-block" disabled={!draft} onClick={() => { onChange(draft); setOpen(false); }}>Done</button>}>
        <MonthCalendar value={draft} onChange={setDraft} min={min} />
        {draft && <p className="caption" style={{ textAlign: 'center' }}>{longDate(parseYmd(draft))} {parseYmd(draft).getFullYear()}</p>}
      </Sheet>
    </div>
  );
}

export function Stepper({ label, value, onChange, min = 0, max = 999, step = 1, unit, id, placeholder }: { label: string; value?: number; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; unit?: string; id: string; placeholder?: string }) {
  const v = value ?? undefined;
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" className="icon-btn" aria-label={`Decrease ${label}`} onClick={() => set((v ?? Number(placeholder) ?? min) - step)}><Minus size={20} strokeWidth={2} /></button>
        <input id={id} inputMode="numeric" className="stepper-input" value={v ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))} />
        {unit && <span className="caption">{unit}</span>}
        <button type="button" className="icon-btn" aria-label={`Increase ${label}`} onClick={() => set((v ?? Number(placeholder) ?? min) + step)}><Plus size={20} strokeWidth={2} /></button>
      </div>
    </div>
  );
}

/** Hours, minutes, seconds with tap steppers. Value in seconds. */
export function DurationField({ label, value, onChange, id }: { label: string; value?: number; onChange: (s: number | undefined) => void; id: string }) {
  const s = value ?? 0;
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.round(s % 60)];
  const names = ['hours', 'minutes', 'seconds'];
  const max = [23, 59, 59];
  const setPart = (i: number, n: number) => {
    const p = [...parts];
    p[i] = (n + (max[i] + 1)) % (max[i] + 1);
    const total = p[0] * 3600 + p[1] * 60 + p[2];
    onChange(total || undefined);
  };
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} id={id}>
      <legend className="label" style={{ marginBottom: 6 }}>{label}</legend>
      <div className="duration">
        {parts.map((p, i) => (
          <div key={i} className="duration-col">
            <button type="button" className="icon-btn" aria-label={`More ${names[i]}`} onClick={() => setPart(i, p + (i === 2 ? 5 : 1))}><Plus size={18} strokeWidth={2} /></button>
            <input aria-label={names[i]} inputMode="numeric" className="duration-input" value={String(p).padStart(i ? 2 : 1, '0')} onChange={(e) => setPart(i, Math.min(max[i], Number(e.target.value.replace(/\D/g, '').slice(-2)) || 0))} />
            <button type="button" className="icon-btn" aria-label={`Fewer ${names[i]}`} onClick={() => setPart(i, p - (i === 2 ? 5 : 1))}><Minus size={18} strokeWidth={2} /></button>
            <span className="caption">{['h', 'min', 's'][i]}</span>
          </div>
        ))}
        {value ? <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange(undefined)}>Clear</button> : null}
      </div>
    </fieldset>
  );
}

export function Chips<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label" style={{ marginBottom: 6 }}>{label}</legend>
      <div className="row wrap">
        {options.map((o) => (
          <button type="button" key={String(o.value)} className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}{o.sub && <span className="caption" style={{ color: 'inherit', opacity: 0.75 }}>{o.sub}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
