// Asks the weather server function for a run's weather (MET Norway). Quietly gives up (undefined) when the run is
// no longer recent, has no GPS, the daily limit is reached or anything fails: weather is a nice extra, never a blocker.
import { supabase } from './supabase';
import type { RunWeather } from '../lib/types';

/** The run's weather, or why it has none ('no_gps' is permanent and saved with the run by the server). */
export async function requestWeather(activityId: string): Promise<RunWeather | { skip: string } | undefined> {
  if (!supabase) return undefined;
  try {
    const r = await supabase.functions.invoke('weather', { body: { id: activityId } });
    if (r.error) {
      const ctx = (r.error as { context?: Response }).context;
      const why = ctx && typeof ctx.json === 'function' ? ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error : undefined;
      return why === 'no_gps' ? { skip: 'no_gps' } : undefined;
    }
    const w = (r.data as { weather?: RunWeather } | null)?.weather;
    return w && typeof w.t === 'number' ? w : undefined;
  } catch { return undefined; }
}

/** MET Norway has current weather and forecasts only, so a run can get weather while its middle is in the last 3 hours. */
export const WEATHER_WINDOW_MS = 3 * 3600 * 1000;
export function inWeatherWindow(a: { startTime: string; durationS: number }, now = Date.now()): boolean {
  const mid = new Date(a.startTime).getTime() + (a.durationS * 1000) / 2;
  return now - mid <= WEATHER_WINDOW_MS && mid - now <= WEATHER_WINDOW_MS;
}
