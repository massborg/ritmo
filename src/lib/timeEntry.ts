// Typing a time or a pace on a numbers-only keypad (update 4, task 1). Phones show a keypad with no ":" for
// inputMode="numeric", so digits fill in from the right, the way a timer app does: 2 → 0:02, 20 → 0:20,
// 205 → 2:05, 2005 → 20:05, 200515 → 20:05:15. Backspace takes the last digit off. Pasted or hardware-keyboard
// text with ":", ".", "," or spaces between the parts is understood too ("1.13.37" → 1:13:37).

export type EntryKind = 'duration' | 'pace';
/** Most digits kept: h mm ss for a time, mm ss for a pace */
export const maxDigits = (kind: EntryKind) => (kind === 'pace' ? 4 : 6);

export interface Entry { h: number; m: number; s: number; /** Total seconds, when the parts make a real time */ seconds?: number; /** Why it isn't one */ error?: 'seconds' | 'minutes' }

const clean = (digits: string, kind: EntryKind) => digits.replace(/\D/g, '').replace(/^0+/, '').slice(-maxDigits(kind));

/** Digits, filled in from the right, as hours, minutes and seconds */
export function fromDigits(digits: string, kind: EntryKind = 'duration'): Entry {
  const d = clean(digits, kind).padStart(6, '0');
  const h = Number(d.slice(0, 2)), m = Number(d.slice(2, 4)), s = Number(d.slice(4, 6));
  if (s > 59) return { h, m, s, error: 'seconds' };
  if (m > 59) return { h, m, s, error: 'minutes' };
  const seconds = h * 3600 + m * 60 + s;
  return { h, m, s, seconds: seconds > 0 ? seconds : undefined };
}

/** Seconds as the digits that show them: 1205 → "2005", 4417 → "11337" */
export function toDigits(seconds: number | undefined, kind: EntryKind = 'duration'): string {
  if (!seconds || seconds <= 0) return '';
  const t = Math.round(seconds), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (kind === 'pace') return clean(`${p(h * 60 + m)}${p(s)}`, kind);
  return clean(`${h}${p(m)}${p(s)}`, kind);
}

/**
 * Typed or pasted text as digits. With separators (":", ".", ",", spaces) the parts are hours, minutes and seconds
 * from the right, each padded ("5:3" → 5:03); without, the digits are taken as they are.
 */
export function textToDigits(text: string, kind: EntryKind = 'duration'): string {
  const parts = text.trim().split(/[^\d]+/).filter((x) => x !== '');
  if (!parts.length) return '';
  if (parts.length === 1) return clean(parts[0], kind);
  const last = parts.slice(-3);
  return clean(last.map((x, i) => (i === 0 ? x : x.padStart(2, '0').slice(-2))).join(''), kind);
}

/** A typed or pasted time in seconds, or undefined when it isn't a real time */
export const parseEntry = (text: string, kind: EntryKind = 'duration') => fromDigits(textToDigits(text, kind), kind).seconds;

/** "20:05", "1:13:37", "0:02": what the field shows */
export function showEntry(e: Pick<Entry, 'h' | 'm' | 's'>, kind: EntryKind = 'duration'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return kind === 'pace' || !e.h ? `${e.m}:${p(e.s)}` : `${e.h}:${p(e.m)}:${p(e.s)}`;
}

/** "20 minutes 5 seconds", for screen readers */
export function sayEntry(e: Pick<Entry, 'h' | 'm' | 's'>): string {
  const n = (v: number, w: string) => (v ? `${v} ${w}${v === 1 ? '' : 's'}` : '');
  return [n(e.h, 'hour'), n(e.m, 'minute'), n(e.s, 'second')].filter(Boolean).join(' ') || 'empty';
}

/** A time that can't be right for a race distance: faster than 2:24/km (a 12:00 5K) or slower than 24:00/km (a 2-hour 5K) */
export function unlikelyFor(seconds: number, distanceM: number): 'fast' | 'slow' | undefined {
  const perKm = seconds / (distanceM / 1000);
  return perKm < 144 ? 'fast' : perKm > 1440 ? 'slow' : undefined;
}
