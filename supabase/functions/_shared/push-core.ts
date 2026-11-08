// Self-contained reminder logic for push notifications. No imports, so the same file runs in the app and in the
// push server function (Deno); supabase/functions/_shared/push-core.ts is a copy, checked by a test.
// Two reminders, both off until the runner turns them on:
//   morning: today's planned session (nothing on rest days)
//   evening: only if today's session is still open, i.e. no run arrived and it was not skipped or moved

export interface Reminders {
  /** "HH:MM" local time of the morning reminder, or null for off */
  morning: string | null;
  /** "HH:MM" local time of the evening check-in, or null for off */
  evening: string | null;
}
export const DEFAULT_REMINDERS: Reminders = { morning: '07:00', evening: '20:00' };

export interface PushSession { id: string; date: string; type: string; title: string; distanceM: number; durationS: number; status?: string }
export interface PushMessage { title: string; body: string; url: string; tag: string }

/** A reminder sent up to this long after its time (the server checks every 15 minutes), never twice a day. */
export const LATE_WINDOW_MIN = 60;

const valid = (t: string | null | undefined): t is string => !!t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The local date (YYYY-MM-DD) and minutes since midnight in a time zone; falls back to UTC for an unknown zone. */
export function localNow(now: Date, timeZone: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    return localNow(now, 'UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Is this reminder due now? lastSent is the local date it was last sent on this device. */
export function isDue(time: string | null | undefined, minutes: number, today: string, lastSent: string | null | undefined): boolean {
  if (!valid(time) || lastSent === today) return false;
  const start = toMin(time);
  return minutes >= start && minutes < start + LATE_WINDOW_MIN;
}

const dist = (m: number, u: 'km' | 'mi') => { const v = u === 'mi' ? m / 1609.344 : m / 1000; return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${u}`; };
const amount = (s: PushSession, u: 'km' | 'mi') => (s.distanceM > 0 ? dist(s.distanceM, u) : s.durationS > 0 ? `${Math.round(s.durationS / 60)} min` : '');

/** Today's sessions that count for reminders: planned training, not rest. */
export const todaysSessions = (sessions: PushSession[], today: string) => sessions.filter((s) => s.date === today && s.type !== 'rest');

export function morningMessage(sessions: PushSession[], today: string, units: 'km' | 'mi'): PushMessage | null {
  const list = todaysSessions(sessions, today).filter((s) => !s.status || s.status === 'planned');
  if (!list.length) return null;
  const s = list[0];
  if (s.type === 'race') return { title: `Race day: ${s.title}`, body: 'Your race plan, splits and warm-up are ready in Ritmo. Enjoy it.', url: '/', tag: `morning-${today}` };
  const a = amount(s, units);
  const more = list.length > 1 ? ` (plus ${list.length - 1} more)` : '';
  return { title: `Today: ${s.title}${more}`, body: `${a ? `${a}. ` : ''}Tap to see the session.`, url: '/', tag: `morning-${today}` };
}

/**
 * Evening check-in: only when a session today is still open. ranToday is true when any run for today has arrived
 * (logged, synced or waiting to be added), so a run never gets a "did you run?" message.
 */
export function eveningMessage(sessions: PushSession[], today: string, ranToday: boolean): PushMessage | null {
  if (ranToday) return null;
  const open = todaysSessions(sessions, today).filter((s) => (!s.status || s.status === 'planned') && s.type !== 'race');
  if (!open.length) return null;
  return {
    title: 'How did today go?',
    body: `${open[0].title} is still open. Log your run, or mark it skipped so your plan can adjust.`,
    url: '/', tag: `evening-${today}`,
  };
}
