// Weather on runs: how it is shown, and the plain note the feedback adds on hot, humid, windy or cold days.
// The note explains the conditions; it never changes the session score or the plan.
import type { RunWeather } from '../lib/types';
import type { Units } from '../lib/format';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const windFrom = (deg?: number) => (deg == null ? '' : DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);
export const temp = (c: number, u: Units) => (u === 'mi' ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`);
export const wind = (kmh: number, u: Units) => (u === 'mi' ? `${Math.round(kmh / 1.609)}\u00a0mph` : `${Math.round(kmh)}\u00a0km/h`);

/** One line for the run page, e.g. "24°C, feels like 26°C · humidity 70% · wind 18 km/h NW · clear sky". */
export function weatherLine(w: RunWeather, u: Units): string {
  const parts = [`${temp(w.t, u)}${Math.abs(w.fl - w.t) >= 2 ? `, feels like ${temp(w.fl, u)}` : ''}`, `humidity ${Math.round(w.h)}%`, `wind ${wind(w.ws, u)}${w.wd != null && w.ws >= 5 ? ` ${windFrom(w.wd)}` : ''}`];
  if (w.c) parts.push(w.c);
  return parts.join(' · ');
}

export const HOT_FL = 27;
export const WARM_T = 22;
export const HUMID_DP = 18;
export const WINDY_KMH = 25;
export const COLD_FL = 0;

/** A short note on conditions that affect pace, or undefined on an ordinary day. */
export function weatherNote(w: RunWeather | undefined, u: Units): string | undefined {
  if (!w) return undefined;
  const notes: string[] = [];
  const humid = (w.dp != null && w.dp >= HUMID_DP) || w.h >= 75;
  if (w.fl >= HOT_FL) notes.push(`Hot${humid ? ' and humid' : ''} (feels like ${temp(w.fl, u)}): a slower pace at the same effort is normal in this heat.`);
  else if (w.t >= WARM_T && humid) notes.push(`Warm and humid (${temp(w.t, u)}, humidity ${Math.round(w.h)}%): expect pace to drop a little at the same effort.`);
  else if (w.fl <= COLD_FL) notes.push(`Cold (feels like ${temp(w.fl, u)}): it takes longer to warm up, so the first kilometres are often slower.`);
  if (w.ws >= WINDY_KMH) notes.push(`Windy (${wind(w.ws, u)}): pace rises and falls with the wind, so effort is the better guide today.`);
  return notes.length ? notes.join(' ') : undefined;
}
