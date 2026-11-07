import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIcs, type IcsSession } from './ics-core';

const now = new Date('2026-11-07T10:00:00Z');
const sess = (date: string, type: string, km: number, extra: Partial<IcsSession> = {}): IcsSession =>
  ({ id: `s-${date}`, date, type, title: type === 'long' ? 'Long run' : 'Threshold, 5 x 6 min', distanceM: km * 1000, durationS: km * 330, purpose: 'Raises the pace you can hold, with commas; and semicolons', ...extra });
const opts = { units: 'km' as const, morningHour: 7, eveReminder: true, appUrl: 'https://app.ritmorunning.run', now };
const events = (ics: string) => ics.split('BEGIN:VEVENT').slice(1);

describe('calendar feed', () => {
  it('builds a valid calendar with one all-day event per session and race', () => {
    const ics = buildIcs([sess('2026-11-09', 'threshold', 12), sess('2026-11-14', 'long', 20), sess('2026-11-10', 'rest', 0), sess('2026-10-01', 'easy', 8)],
      [{ id: 'r1', name: 'Valletta 10K', date: '2026-12-20', distanceM: 10000 }], opts);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // CRLF line endings only
    expect(events(ics)).toHaveLength(3); // rest day and the old session left out, race included
    expect(ics).toContain('DTSTART;VALUE=DATE:20261109');
    expect(ics).toContain('DTEND;VALUE=DATE:20261110');
    expect(ics).toContain('SUMMARY:Threshold\\, 5 x 6 min: 12 km\\, about 66 min');
    expect(ics).toContain('UID:s-2026-11-09@ritmorunning.run');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('adds the morning alert and the evening-before reminder for long runs and races', () => {
    const [q, long, race] = events(buildIcs([sess('2026-11-09', 'threshold', 12), sess('2026-11-14', 'long', 20)], [{ id: 'r1', name: 'Valletta 10K', date: '2026-12-20', distanceM: 10000 }], opts));
    expect(q).toContain('TRIGGER:PT7H');
    expect(q).not.toContain('TRIGGER:-PT4H');
    expect(long).toContain('TRIGGER:-PT4H');
    expect(long.replace(/\r\n /g, '')).toContain('Tomorrow: long run\\, 20 km. Plan your fuel and lay out your kit tonight.');
    expect(race).toContain('TRIGGER:-PT4H');
    expect(race.replace(/\r\n /g, '')).toContain('/race/r1/day');
  });
  it('leaves reminders out when they are off, and uses miles', () => {
    const ics = buildIcs([sess('2026-11-14', 'long', 20)], [], { ...opts, morningHour: null, eveReminder: false, units: 'mi' });
    expect(ics).not.toContain('VALARM');
    expect(ics).toContain('12 mi');
  });
  it('the server copy is identical', () => {
    expect(readFileSync('supabase/functions/_shared/ics-core.ts', 'utf8')).toBe(readFileSync('src/training/ics-core.ts', 'utf8'));
  });
});
