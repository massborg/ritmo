// Self-contained calendar (iCalendar, RFC 5545) builder for the training plan feed. No imports, so the same file
// runs in the app and in the calendar server function (Deno); supabase/functions/_shared/ics-core.ts is a copy,
// checked by a test. Sessions are all-day events (the runner picks the time), with optional reminders:
// a morning alert on the day, and the evening before a long run or race, a fuelling and kit reminder.

export interface IcsSession { id: string; date: string; type: string; title: string; distanceM: number; durationS: number; purpose?: string; status?: string }
export interface IcsRace { id: string; name: string; date: string; distanceM: number }
export interface IcsOptions {
  units: 'km' | 'mi';
  /** Hour of the morning alert (0–23), or null for none */
  morningHour: number | null;
  /** The evening before a long run or race: fuelling and kit reminder at 20:00 */
  eveReminder: boolean;
  appUrl: string;
  now: Date;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const ymdCompact = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const distLabel = (m: number, u: 'km' | 'mi') => { const v = u === 'mi' ? m / 1609.344 : m / 1000; return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${u}`; };
const mins = (s: number) => `${Math.round(s / 60)} min`;
/** An alarm relative to the event's start (midnight of an all-day event), in minutes. */
const alarm = (minutes: number, text: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`,
  `TRIGGER:${minutes < 0 ? '-' : ''}PT${Math.floor(Math.abs(minutes) / 60)}H${Math.abs(minutes) % 60 ? `${Math.abs(minutes) % 60}M` : ''}`, 'END:VALARM'];

export function buildIcs(sessions: IcsSession[], races: IcsRace[], o: IcsOptions): string {
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ritmo Running//Training plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Ritmo training', 'X-WR-CALDESC:Your Ritmo training plan. Updates when your plan changes.',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  const now = stamp(o.now);
  const from = new Date(o.now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  const raceDays = new Set(races.map((r) => r.date));
  for (const s of sessions) {
    if (s.date < from || s.type === 'rest' || s.distanceM <= 0 || s.status === 'skipped' || raceDays.has(s.date) && s.type === 'race') continue;
    const what = `${s.title}: ${distLabel(s.distanceM, o.units)}, about ${mins(s.durationS)}`;
    L.push('BEGIN:VEVENT', `UID:${s.id}@ritmorunning.run`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${ymdCompact(s.date)}`, `DTEND;VALUE=DATE:${ymdCompact(nextDay(s.date))}`,
      `SUMMARY:${esc(what)}`, `DESCRIPTION:${esc(`${s.purpose ? `${s.purpose}\n\n` : ''}Open in Ritmo: ${o.appUrl}/session/${s.id}`)}`,
      `URL:${o.appUrl}/session/${s.id}`, 'TRANSP:TRANSPARENT', 'CATEGORIES:Running');
    if (o.morningHour != null) L.push(...alarm(o.morningHour * 60, `Today's training: ${what}`));
    if (o.eveReminder && s.type === 'long') L.push(...alarm(-4 * 60, `Tomorrow: long run, ${distLabel(s.distanceM, o.units)}. Plan your fuel and lay out your kit tonight.`));
    L.push('END:VEVENT');
  }
  for (const r of races) {
    if (r.date < from) continue;
    L.push('BEGIN:VEVENT', `UID:race-${r.id}@ritmorunning.run`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${ymdCompact(r.date)}`, `DTEND;VALUE=DATE:${ymdCompact(nextDay(r.date))}`,
      `SUMMARY:${esc(`Race: ${r.name} (${distLabel(r.distanceM, o.units)})`)}`, `DESCRIPTION:${esc(`Race-day mode: ${o.appUrl}/race/${r.id}/day`)}`,
      `URL:${o.appUrl}/race/${r.id}/day`, 'TRANSP:OPAQUE', 'CATEGORIES:Running');
    if (o.eveReminder) L.push(...alarm(-4 * 60, `Tomorrow: ${r.name}. Familiar dinner, lay out your kit and bib, and get to bed early.`));
    if (o.morningHour != null) L.push(...alarm(o.morningHour * 60, `Race day: ${r.name}. Open race-day mode for your splits and warm-up.`));
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
