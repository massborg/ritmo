// A time or a pace typed on the numbers-only keypad (update 4, task 1). Phones show no ":" key for
// inputMode="numeric", so digits fill in from the right, like a timer: 2 0 0 5 becomes 20:05. Shown as boxes
// (h : min : sec, or min : sec for a pace). One real input sits over the boxes, so the keypad, paste, a hardware
// keyboard and screen readers all work with it. The logic is in lib/timeEntry.
import { useEffect, useRef, useState } from 'react';
import { distanceLabel, duration, pace as fmtPace, type Units } from '../lib/format';
import { fromDigits, maxDigits, sayEntry, showEntry, textToDigits, toDigits, unlikelyFor, type EntryKind } from '../lib/timeEntry';

interface Props {
  id: string; value?: number; onChange: (seconds: number | undefined) => void;
  /** What the field is, for screen readers ("5K time", "Fastest pace") */
  label: string;
  /** Smaller, for tables and rows */
  small?: boolean;
  /** Shown faintly while empty, in seconds */
  placeholderS?: number;
  invalid?: boolean; describedBy?: string;
  /** The caller shows the error text itself (DurationField does, in its hint line) */
  quietError?: boolean;
}

function Entry({ kind, id, value, onChange, label, small, placeholderS, invalid, describedBy, quietError, onError }: Props & { kind: EntryKind; onError?: (e: 'seconds' | 'minutes' | undefined) => void }) {
  const [digits, setDigits] = useState(() => toDigits(value, kind));
  const ref = useRef<HTMLInputElement>(null);
  const e = fromDigits(digits, kind);
  // Changed from outside (a reset, a loaded value): show that
  useEffect(() => { if (value !== fromDigits(digits, kind).seconds && (value || !fromDigits(digits, kind).error)) setDigits(toDigits(value, kind)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const shown = digits ? showEntry(e, kind) : '';
  const set = (d: string) => {
    setDigits(d);
    const n = fromDigits(d, kind);
    onError?.(d ? n.error : undefined);
    onChange(n.seconds);
  };
  const change = (raw: string) => {
    if (raw.length === shown.length + 1 && raw.startsWith(shown)) {
      // One key on the keypad: a digit joins on the right; anything else (":" on a keyboard) is not needed
      const c = raw.slice(-1);
      if (/\d/.test(c) && digits.length < maxDigits(kind) && (digits || c !== '0')) set(digits + c);
    } else if (shown && raw === shown.slice(0, -1)) set(digits.slice(0, -1)); // backspace
    else set(textToDigits(raw, kind)); // pasted, filled in, or typed over a selection
  };
  // Digits join on the right, so a tap puts the caret at the end. Only on a tap, never on focus: a select-all
  // (to clear or replace the whole time) must be left alone.
  const caretToEnd = () => { const el = ref.current; if (el) { try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* */ } } };
  const p2 = (n: number) => String(n).padStart(2, '0');
  const ph = placeholderS && !digits ? fromDigits(toDigits(placeholderS, kind), kind) : undefined;
  const v = ph ?? e;
  const boxes: [string, string][] = kind === 'pace'
    ? [[String(v.h * 60 + v.m), 'min'], [p2(v.s), 'sec']]
    : [[String(v.h), 'hours'], [p2(v.m), 'min'], [p2(v.s), 'sec']];
  const bad = invalid || !!e.error;
  // Unless the caller shows the error itself, the field says why the time is not valid, under the boxes.
  // The wrapper is always there, so the input is not rebuilt (and does not lose the keypad) when the line appears.
  const ownErr = !quietError && digits && e.error ? e.error : undefined;
  const described = [describedBy, ownErr ? `${id}-err` : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <span className="time-entry-wrap">
    <span className={`time-entry${small ? ' time-entry-sm' : ''}${digits ? '' : ' empty'}${bad ? ' bad' : ''}`}>
      <span className="time-boxes" aria-hidden="true">
        {boxes.map(([n, unit], i) => (
          <span key={unit} className="time-box-wrap">
            {i > 0 && <span className="time-colon">:</span>}
            <span className="time-box"><span className="time-num">{n}</span>{!small && <span className="time-unit">{unit}</span>}</span>
          </span>
        ))}
      </span>
      {/* No pattern attribute: the value holds colons ("1:15:00"), and a digits-only pattern made the browser refuse the form */}
      <input ref={ref} id={id} className="time-entry-input" inputMode="numeric" autoComplete="off" value={shown}
        aria-label={`${label}: ${digits ? sayEntry(e) : 'empty'}`} aria-invalid={bad || undefined} aria-describedby={described}
        onChange={(ev) => change(ev.target.value)} onClick={caretToEnd}
        onKeyDown={(ev) => {
          // Digits join and leave on the right, like a timer. With the caret moved into the middle, a digit or Backspace
          // used to do nothing: the caret goes back to the end first. A selection (to replace the lot) is left alone.
          const el = ev.currentTarget;
          if ((ev.key === 'Backspace' || /^\d$/.test(ev.key)) && el.selectionStart === el.selectionEnd && el.selectionStart !== el.value.length) caretToEnd();
        }}
        onPaste={(ev) => { ev.preventDefault(); set(textToDigits(ev.clipboardData.getData('text'), kind)); }} />
    </span>
    {ownErr && <span id={`${id}-err`} className="caption time-entry-err" role="alert">{ERR[ownErr]}</span>}
    </span>
  );
}

const ERR = { seconds: 'Seconds must be under 60.', minutes: 'Minutes must be under 60. For 75 minutes, type 1 15 00.' };

/** A time (hours, minutes, seconds). Value in seconds. */
export function DurationInput(p: Props & { onError?: (e: 'seconds' | 'minutes' | undefined) => void }) { return <Entry kind="duration" {...p} />; }
/** A pace (minutes and seconds). Value in seconds. */
export function PaceInput(p: Props & { onError?: (e: 'seconds' | 'minutes' | undefined) => void }) { return <Entry kind="pace" {...p} />; }

/**
 * A labelled time field with a hint, and for a race time (distanceM) a live readback, "5K in 20:05 · 4:01/km",
 * with a gentle warning when the time can't be right for the distance.
 */
export function DurationField({ label, value, onChange, id, distanceM, units = 'km' }: { label: string; value?: number; onChange: (s: number | undefined) => void; id: string; distanceM?: number; units?: Units }) {
  const [err, setErr] = useState<'seconds' | 'minutes'>();
  const odd = value && distanceM ? unlikelyFor(value, distanceM) : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <DurationInput id={id} label={label} value={value} onChange={onChange} onError={setErr} quietError describedBy={`${id}-h`} />
      <span id={`${id}-h`} className="caption" role={err ? 'alert' : undefined}>{err ? ERR[err] : <>Just type the digits: <strong>2 0 0 5</strong> becomes <strong>20:05</strong>. The colons fill in for you.</>}</span>
      {value && distanceM ? (
        <p className={`time-readback${odd ? ' odd' : ''}`} role="status">
          <strong>{distanceLabel(distanceM)} in {duration(value)} · {fmtPace(value / (distanceM / 1000), units)}</strong>
          {odd && <span className="caption">{odd === 'fast' ? 'That is faster than the world record pace for this distance. Check the time.' : 'That is a very slow pace for this distance. Check the time, or carry on if it is right.'}</span>}
        </p>
      ) : null}
    </div>
  );
}
