import { describe, expect, it } from 'vitest';
import { fromDigits, parseEntry, sayEntry, showEntry, textToDigits, toDigits, unlikelyFor } from './timeEntry';

const show = (text: string) => { const e = fromDigits(textToDigits(text)); return e.error ? `invalid ${e.error}` : showEntry(e); };

describe('typing a time on a numbers-only keypad (update 4, task 1)', () => {
  it('fills digits in from the right, like a timer', () => {
    expect(show('2')).toBe('0:02');
    expect(show('20')).toBe('0:20');
    expect(show('205')).toBe('2:05');
    expect(show('2005')).toBe('20:05');
    expect(show('200515')).toBe('20:05:15');
    expect(parseEntry('2005')).toBe(1205);
    expect(parseEntry('200515')).toBe(20 * 3600 + 5 * 60 + 15);
  });
  it('understands typed or pasted separators', () => {
    expect(parseEntry('20:05')).toBe(1205);
    expect(parseEntry('1.13.37')).toBe(4417);
    expect(parseEntry('1:13:37')).toBe(4417);
    expect(parseEntry(' 20:05 ')).toBe(1205);
    expect(parseEntry('20,05')).toBe(1205);
    expect(parseEntry('1 13 37')).toBe(4417);
    expect(parseEntry('5:3')).toBe(303);
  });
  it('empty is no time, and seconds or minutes of 60 or more are flagged', () => {
    expect(parseEntry('')).toBeUndefined();
    expect(show('99')).toBe('invalid seconds');
    expect(parseEntry('99')).toBeUndefined();
    expect(show('6000')).toBe('invalid minutes');
    expect(parseEntry('6000')).toBeUndefined();
    expect(parseEntry('5959')).toBe(3599);
  });
  it('keeps at most 6 digits (the newest), 4 for a pace', () => {
    expect(textToDigits('1234567')).toBe('234567');
    expect(textToDigits('45012', 'pace')).toBe('5012');
    expect(parseEntry('450', 'pace')).toBe(290);
    expect(parseEntry('4:50', 'pace')).toBe(290);
  });
  it('turns seconds back into the digits that show them', () => {
    expect(toDigits(1205)).toBe('2005');
    expect(toDigits(4417)).toBe('11337');
    expect(toDigits(undefined)).toBe('');
    expect(toDigits(290, 'pace')).toBe('450');
    for (const s of [2, 59, 60, 605, 3599, 3600, 4417, 86399]) expect(parseEntry(toDigits(s))).toBe(s);
  });
  it('reads the value out for screen readers', () => {
    expect(sayEntry(fromDigits('2005'))).toBe('20 minutes 5 seconds');
    expect(sayEntry(fromDigits('11337'))).toBe('1 hour 13 minutes 37 seconds');
    expect(sayEntry(fromDigits(''))).toBe('empty');
  });
  it('flags a time that cannot be right for the distance', () => {
    expect(unlikelyFor(11 * 60 + 59, 5000)).toBe('fast');
    expect(unlikelyFor(20 * 60 + 5, 5000)).toBeUndefined();
    expect(unlikelyFor(2 * 3600 + 1, 5000)).toBe('slow');
  });
});
