// Reads the laps or intervals from screenshots of a run (Garmin Connect, Strava, COROS, Apple Fitness, Polar)
// and returns them as a table for the runner to check and edit before anything is saved. Never saves on its own.
// Requires the ANTHROPIC_API_KEY secret; without it, returns 503 and the app asks the runner to type the laps.
// Uses a smaller model (LAPS_MODEL, default claude-haiku-5-5): reading a table needs no deep reasoning.
// Limited to 30 reads a day per person. Screenshots are read from the caller's own private folder only.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = `You read running lap or interval tables from screenshots of watch apps (Garmin Connect, Strava, COROS, Apple Fitness, Polar).
Copy exactly what is shown, in order, across all screenshots (they may continue one table). Never invent or estimate a value that is not visible: leave it null.
Convert times to seconds and distances to metres. Pace is seconds per kilometre (convert from per mile if the screenshot uses miles).
For every value you are not sure you read correctly (blurry, cut off, ambiguous), list its field name in "unsure".
Call report_laps once with the full table.`;

const LAP = {
  type: 'object', additionalProperties: false,
  required: ['rep', 'distance_m', 'time_s', 'pace_s_per_km', 'avg_hr', 'max_hr', 'cadence', 'unsure'],
  properties: {
    rep: { type: 'integer', description: 'Lap number as shown, starting at 1' },
    distance_m: { type: ['number', 'null'] }, time_s: { type: ['number', 'null'] }, pace_s_per_km: { type: ['number', 'null'] },
    avg_hr: { type: ['number', 'null'] }, max_hr: { type: ['number', 'null'] }, cadence: { type: ['number', 'null'] },
    unsure: { type: 'array', items: { type: 'string', enum: ['distance_m', 'time_s', 'pace_s_per_km', 'avg_hr', 'max_hr', 'cadence'] } },
  },
};
const REPORT: Anthropic.Tool = {
  name: 'report_laps',
  description: 'Report the laps read from the screenshots, plus the totals if shown.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['laps', 'totals', 'app'],
    properties: {
      laps: { type: 'array', items: LAP },
      totals: { type: 'object', additionalProperties: false, required: ['distance_m', 'time_s', 'avg_hr'], properties: { distance_m: { type: ['number', 'null'] }, time_s: { type: ['number', 'null'] }, avg_hr: { type: ['number', 'null'] } } },
      app: { type: ['string', 'null'], description: 'The watch app the screenshots come from, if recognisable' },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await db.auth.getUser();
  if (!who?.user) return json({ error: 'not_signed_in' }, 401);
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);
  let body: { paths?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string') : [];
  if (!paths.length || paths.length > 10 || paths.some((p) => !p.startsWith(`${who.user.id}/`))) return json({ error: 'bad_request' }, 400);
  const quota = await db.rpc('take_lap_read_quota');
  if (quota.error) console.error('lap read quota check failed', quota.error.message);
  else if (quota.data === false) return json({ error: 'rate_limited' }, 429);

  const images: Anthropic.ImageBlockParam[] = [];
  for (const p of paths) {
    const f = await db.storage.from('run-media').download(p);
    if (f.error || !f.data) return json({ error: 'image_missing', path: p }, 400);
    const type = f.data.type === 'image/png' ? 'image/png' : f.data.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    images.push({ type: 'image', source: { type: 'base64', media_type: type, data: encodeBase64(new Uint8Array(await f.data.arrayBuffer())) } });
  }
  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: Deno.env.get('LAPS_MODEL') ?? 'claude-haiku-5-5',
      max_tokens: 4000,
      system: SYSTEM,
      tools: [REPORT],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [...images, { type: 'text', text: `${images.length} screenshot${images.length > 1 ? 's' : ''} of one run. Read the lap table.` }] }],
    });
    if (res.stop_reason === 'refusal') return json({ error: 'declined' }, 502);
    const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'report_laps');
    if (!call || call.type !== 'tool_use') return json({ error: 'no_table' }, 422);
    return json(call.input);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'upstream_busy' }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: 'upstream', status: e.status }, 502);
    return json({ error: 'failed', message: String(e) }, 500);
  }
});
