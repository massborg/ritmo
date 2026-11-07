import { describe, expect, it } from 'vitest';
import type { RunWeather } from '../lib/types';
import { weatherLine, weatherNote, windFrom } from './weather';

const n = (s: string | undefined) => s?.replace(/\u00a0/g, ' ');
const w = (o: Partial<RunWeather>): RunWeather => ({ t: 18, fl: 18, h: 55, dp: 9, ws: 10, wd: 315, c: 'clear sky', at: '2026-11-07T08:00:00Z', src: 'openweather', ...o });

describe('weather', () => {
  it('formats one line, in the runner\'s units', () => {
    expect(n(weatherLine(w({ t: 24, fl: 26.4, h: 70, ws: 18 }), 'km'))).toBe('24°C, feels like 26°C · humidity 70% · wind 18 km/h NW · clear sky');
    expect(n(weatherLine(w({ t: 20, fl: 20.5, ws: 16.1 }), 'mi'))).toBe('68°F · humidity 55% · wind 10 mph NW · clear sky');
    expect(n(weatherLine(w({ ws: 3, c: undefined }), 'km'))).toBe('18°C · humidity 55% · wind 3 km/h');
  });
  it('names the wind direction', () => {
    expect([0, 44, 90, 180, 270, 337, 360, -45].map(windFrom)).toEqual(['N', 'NE', 'E', 'S', 'W', 'NW', 'N', 'NW']);
  });
  it('says nothing on an ordinary day', () => {
    expect(weatherNote(w({}), 'km')).toBeUndefined();
    expect(weatherNote(undefined, 'km')).toBeUndefined();
  });
  it('explains heat, humidity, cold and wind', () => {
    expect(n(weatherNote(w({ t: 29, fl: 33, h: 70, dp: 22 }), 'km'))).toMatch(/^Hot and humid \(feels like 33°C\)/);
    expect(n(weatherNote(w({ t: 30, fl: 28, h: 30, dp: 10 }), 'km'))).toMatch(/^Hot \(feels like 28°C\)/);
    expect(n(weatherNote(w({ t: 23, fl: 24, h: 80, dp: 19 }), 'km'))).toMatch(/^Warm and humid \(23°C, humidity 80%\)/);
    expect(n(weatherNote(w({ t: 2, fl: -3 }), 'km'))).toMatch(/^Cold \(feels like -3°C\)/);
    expect(n(weatherNote(w({ ws: 32 }), 'km'))).toMatch(/^Windy \(32 km\/h\)/);
    expect(n(weatherNote(w({ t: 30, fl: 31, ws: 30 }), 'mi'))).toMatch(/^Hot \(feels like 88°F\).*Windy \(19 mph\)/);
  });
});
