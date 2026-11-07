// Asks the weather server function for a run's weather. Quietly gives up (undefined) when the service is not set
// up, the run has no GPS, the daily limit is reached or anything fails: weather is a nice extra, never a blocker.
import { supabase } from './supabase';
import type { RunWeather } from '../lib/types';

export async function requestWeather(activityId: string): Promise<RunWeather | undefined> {
  if (!supabase) return undefined;
  try {
    const r = await supabase.functions.invoke('weather', { body: { id: activityId } });
    if (r.error) return undefined;
    const w = (r.data as { weather?: RunWeather } | null)?.weather;
    return w && typeof w.t === 'number' ? w : undefined;
  } catch { return undefined; }
}
