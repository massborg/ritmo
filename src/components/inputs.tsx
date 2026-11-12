// App-style inputs: bottom sheet, calendar date picker, time picker, stepper and choice chips.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { addDays, DAY_SHORT, duration, longDate, MONTHS_LONG, parseTime, parseYmd, startOfWeek, ymd } from '../lib/format';

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, so a parent passing a new function on every render does not re-run the effect below: that
  // moved focus back to the first button after every keystroke (Find runners lost each letter after the first)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => { if (!ref.current?.contains(document.activeElement)) ref.current?.querySelector<HTMLElement>('[data-autofocus], button, input')?.focus(); }, 30);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open]);
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
  const dec = step % 1 !== 0;
  // While typing a decimal ("8."), keep the text as typed
  const [typed, setTyped] = useState<string>();
  const set = (n: number) => onChange(Math.min(max, Math.max(min, dec ? Math.round(n * 10) / 10 : n)));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" className="icon-btn" aria-label={`Decrease ${label}`} onClick={() => set((v ?? (placeholder ? Number(placeholder) : min)) - step)}><Minus size={20} strokeWidth={2} /></button>
        <input id={id} inputMode={dec ? 'decimal' : 'numeric'} className="stepper-input" value={typed ?? v ?? ''} placeholder={placeholder} onBlur={() => setTyped(undefined)}
          onChange={(e) => { const x = dec ? e.target.value.replace(',', '.').replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, ''); if (dec) setTyped(x); onChange(x === '' || x === '.' ? undefined : Number(x)); }} />
        {unit && <span className="caption">{unit}</span>}
        <button type="button" className="icon-btn" aria-label={`Increase ${label}`} onClick={() => set((v ?? (placeholder ? Number(placeholder) : min)) + step)}><Plus size={20} strokeWidth={2} /></button>
      </div>
    </div>
  );
}

/** A typed time: "15:30" or "1:13:37" (or minutes, "45"). Value in seconds. */
export function DurationField({ label, value, onChange, id }: { label: string; value?: number; onChange: (s: number | undefined) => void; id: string }) {
  const [text, setText] = useState(value ? duration(value) : '');
  const [bad, setBad] = useState(false);
  useEffect(() => { if (value !== parseTime(text)) setText(value ? duration(value) : ''); /* keep in step when changed from outside */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input time-input" inputMode="numeric" placeholder="mm:ss or h:mm:ss" value={text} aria-invalid={bad || undefined} aria-describedby={`${id}-h`}
        onChange={(e) => { const t = e.target.value.replace(/[^\d:]/g, ''); setText(t); const v = parseTime(t); setBad(!!t && v === undefined); onChange(t ? v : undefined); }}
        onBlur={() => { const v = parseTime(text); if (v) setText(duration(v)); }} />
      <span id={`${id}-h`} className="caption">{bad ? 'Use minutes and seconds, like 15:30, or hours too, like 1:13:37.' : 'For example 15:30 or 1:13:37.'}</span>
    </div>
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

/** A sensible default start time: for today, now minus the run's length (rounded to 5 minutes); otherwise empty */
export function defaultStart(date: string, durationS?: number): string {
  if (date !== new Date().toISOString().slice(0, 10)) return '';
  const d = new Date(Date.now() - (durationS ?? 1800) * 1000);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Start time": when the run began, so a run logged by hand later still shows its real time and matches the watch */
export function StartTimeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>Start time</label>
      <input id={id} type="time" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="caption">When you started. If your watch syncs this run later, Ritmo keeps one copy with your answers.</p>
    </div>
  );
}
