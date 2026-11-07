// Weather for one of the caller's runs, from OpenWeather's One Call API 3.0 (timemachine), saved with the run
// (activities.source_ids.weather) so each run is looked up only once.
// Sends OpenWeather only a location rounded to 2 decimals (about 1 km) and a time: never who the runner is.
// Requires the OPENWEATHER_API_KEY secret; without it, returns 503 and the app simply shows no weather.
// Limited to 100 lookups a day per person. Set a daily call limit in the OpenWeather account as well.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const DAILY = 100;
const r1 = (x: number) => Math.round(x * 10) / 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await db.auth.getUser();
  if (!who?.user) return json({ error: 'not_signed_in' }, 401);
  const key = Deno.env.get('OPENWEATHER_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);
  let body: { id?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (typeof body.id !== 'string' || !body.id) return json({ error: 'bad_request' }, 400);

  // Row-level security limits this to the caller's own runs
  const run = await db.from('activities').select('id,start_time,duration_s,source_ids,p:streams->0').eq('id', body.id).maybeSingle();
  if (run.error) return json({ error: 'lookup_failed' }, 500);
  if (!run.data) return json({ error: 'not_found' }, 404);
  const ids = (run.data.source_ids ?? {}) as Record<string, unknown>;
  if (ids.weather) return json({ weather: ids.weather });
  const p = run.data.p as { lat?: number; lon?: number } | null;
  if (p?.lat == null || p?.lon == null) return json({ error: 'no_gps' }, 422);

  const today = new Date().toISOString().slice(0, 10);
  const used = await db.from('activities').select('id', { count: 'exact', head: true }).gte('source_ids->weather->>at', today);
  if (!used.error && (used.count ?? 0) >= DAILY) return json({ error: 'rate_limited' }, 429);

  const mid = Math.round(new Date(run.data.start_time as string).getTime() / 1000 + Number(run.data.duration_s ?? 0) / 2);
  const url = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${p.lat.toFixed(2)}&lon=${p.lon.toFixed(2)}&dt=${mid}&units=metric&appid=${key}`;
  let res: Response;
  try { res = await fetch(url); } catch { return json({ error: 'unavailable' }, 502); }
  if (res.status === 429) return json({ error: 'rate_limited' }, 429);
  if (!res.ok) { console.error('openweather', res.status); return json({ error: 'unavailable' }, 502); }
  const d = (await res.json())?.data?.[0];
  if (!d || typeof d.temp !== 'number') return json({ error: 'unavailable' }, 502);
  const weather = {
    t: r1(d.temp), fl: r1(d.feels_like ?? d.temp), h: Math.round(d.humidity ?? 0),
    ...(typeof d.dew_point === 'number' ? { dp: r1(d.dew_point) } : {}),
    ws: r1((d.wind_speed ?? 0) * 3.6), ...(typeof d.wind_deg === 'number' ? { wd: Math.round(d.wind_deg) } : {}),
    ...(d.weather?.[0]?.description ? { c: String(d.weather[0].description) } : {}),
    at: new Date().toISOString(), src: 'openweather',
  };
  const saved = await db.from('activities').update({ source_ids: { ...ids, weather } }).eq('id', body.id);
  if (saved.error) console.error('weather save failed', saved.error.message);
  return json({ weather });
});
