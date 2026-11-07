// Weather for one of the caller's recent runs, from MET Norway's Locationforecast 2.0 (api.met.no): free, no key,
// commercial use allowed (CC BY 4.0, credit "MET Norway"). MET has current weather and forecasts, not the past, so
// only runs whose middle is within the last 3 hours get weather. The result is saved with the run
// (activities.source_ids.weather), so each run is looked up only once.
// Sends MET only a location rounded to 2 decimals (about 1 km): never who the runner is. MET's terms ask for an
// identifying User-Agent with contact details; it names Ritmo and the company's contact address.
// Limited to 100 lookups a day per person.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UA = 'RitmoRunning/1.0 (+https://app.ritmorunning.run; info@tricoreconsult.eu)';
const DAILY = 100;
const WINDOW_S = 3 * 3600;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Dew point (°C) from temperature and relative humidity (Magnus formula). */
export function dewPoint(t: number, rh: number): number {
  const a = 17.62, b = 243.12;
  const g = Math.log(Math.max(1, rh) / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}
/** Feels-like temperature (°C): heat index in the heat, wind chill in the cold, otherwise the air temperature. */
export function feelsLike(t: number, rh: number, windKmh: number): number {
  if (t >= 27 && rh >= 40) {
    const f = t * 9 / 5 + 32;
    const hi = -42.379 + 2.04901523 * f + 10.14333127 * rh - 0.22475541 * f * rh - 0.00683783 * f * f - 0.05481717 * rh * rh
      + 0.00122874 * f * f * rh + 0.00085282 * f * rh * rh - 0.00000199 * f * f * rh * rh;
    return (hi - 32) * 5 / 9;
  }
  if (t <= 10 && windKmh > 4.8) {
    const v = windKmh ** 0.16;
    return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v;
  }
  return t;
}
const SYMBOLS: Record<string, string> = {
  clearsky: 'clear sky', fair: 'mostly clear', partlycloudy: 'partly cloudy', cloudy: 'cloudy', fog: 'fog',
  lightrain: 'light rain', rain: 'rain', heavyrain: 'heavy rain', lightrainshowers: 'light showers', rainshowers: 'showers', heavyrainshowers: 'heavy showers',
  lightsleet: 'light sleet', sleet: 'sleet', heavysleet: 'heavy sleet', lightsleetshowers: 'sleet showers', sleetshowers: 'sleet showers', heavysleetshowers: 'heavy sleet showers',
  lightsnow: 'light snow', snow: 'snow', heavysnow: 'heavy snow', lightsnowshowers: 'snow showers', snowshowers: 'snow showers', heavysnowshowers: 'heavy snow showers',
};
/** "partlycloudy_day" -> "partly cloudy"; anything with "thunder" -> "thunder". */
export function describe(symbol?: string): string | undefined {
  if (!symbol) return undefined;
  const base = symbol.split('_')[0];
  return base.includes('thunder') ? 'thunder' : SYMBOLS[base];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await db.auth.getUser();
  if (!who?.user) return json({ error: 'not_signed_in' }, 401);
  let body: { id?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (typeof body.id !== 'string' || !body.id) return json({ error: 'bad_request' }, 400);

  // Row-level security limits this to the caller's own runs
  const run = await db.from('activities').select('id,start_time,duration_s,source_ids,p:streams->0').eq('id', body.id).maybeSingle();
  if (run.error) return json({ error: 'lookup_failed' }, 500);
  if (!run.data) return json({ error: 'not_found' }, 404);
  const ids = (run.data.source_ids ?? {}) as Record<string, unknown>;
  if (ids.weather) return json({ weather: ids.weather });
  if (ids.weatherSkip) return json({ error: String(ids.weatherSkip) }, 422);
  const mid = new Date(run.data.start_time as string).getTime() / 1000 + Number(run.data.duration_s ?? 0) / 2;
  if (Date.now() / 1000 - mid > WINDOW_S) return json({ error: 'too_old' }, 422);
  const p = run.data.p as { lat?: number; lon?: number } | null;
  if (p?.lat == null || p?.lon == null) {
    // Remembered on the run (an indoor or treadmill run), so the app never asks about it again
    await db.from('activities').update({ source_ids: { ...ids, weatherSkip: 'no_gps' } }).eq('id', body.id);
    return json({ error: 'no_gps' }, 422);
  }

  const today = new Date().toISOString().slice(0, 10);
  const used = await db.from('activities').select('id', { count: 'exact', head: true }).gte('source_ids->weather->>at', today);
  if (!used.error && (used.count ?? 0) >= DAILY) return json({ error: 'rate_limited' }, 429);

  let res: Response;
  try {
    res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${p.lat.toFixed(2)}&lon=${p.lon.toFixed(2)}`, { headers: { 'User-Agent': UA } });
  } catch { return json({ error: 'unavailable' }, 502); }
  if (!res.ok) { console.error('met.no', res.status); return json({ error: res.status === 429 ? 'rate_limited' : 'unavailable' }, res.status === 429 ? 429 : 502); }
  const series = ((await res.json())?.properties?.timeseries ?? []) as { time: string; data: { instant?: { details?: Record<string, number> }; next_1_hours?: { summary?: { symbol_code?: string } } } }[];
  // The entry nearest the middle of the run (the series starts at the current hour)
  let best: (typeof series)[number] | undefined, gap = Infinity;
  for (const s of series) { const g = Math.abs(new Date(s.time).getTime() / 1000 - mid); if (g < gap) { gap = g; best = s; } }
  const d = best?.data.instant?.details;
  if (!d || typeof d.air_temperature !== 'number' || gap > WINDOW_S) return json({ error: 'unavailable' }, 502);
  const t = d.air_temperature, h = d.relative_humidity ?? 50, ws = (d.wind_speed ?? 0) * 3.6;
  const c = describe(best!.data.next_1_hours?.summary?.symbol_code);
  const weather = {
    t: r1(t), fl: r1(feelsLike(t, h, ws)), h: Math.round(h), dp: r1(dewPoint(t, h)), ws: r1(ws),
    ...(typeof d.wind_from_direction === 'number' ? { wd: Math.round(d.wind_from_direction) } : {}),
    ...(c ? { c } : {}), at: new Date().toISOString(), src: 'met.no',
  };
  const saved = await db.from('activities').update({ source_ids: { ...ids, weather } }).eq('id', body.id);
  if (saved.error) console.error('weather save failed', saved.error.message);
  return json({ weather });
});
