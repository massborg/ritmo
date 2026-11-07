// The runner's training plan as a calendar feed (iCalendar), for Apple Calendar, Google Calendar, Outlook and others.
// Calendar apps cannot sign in, so the feed is reached by a long random private link (profiles.data.calendarFeed.token)
// that the runner can reset or turn off in the app. It contains only planned sessions and races: no runs, health data,
// locations or account details. Deploy with JWT verification off (--no-verify-jwt): the link itself is the key.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildIcs, type IcsRace, type IcsSession } from '../_shared/ics-core.ts';

const APP_URL = 'https://app.ritmorunning.run';
const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405);
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[a-f0-9]{48,128}$/.test(token)) return text('Not found', 404);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const prof = await db.from('profiles').select('user_id,data').eq('data->calendarFeed->>token', token).maybeSingle();
  if (prof.error) { console.error('calendar profile lookup', prof.error.message); return text('Temporarily unavailable', 503); }
  if (!prof.data) return text('Not found', 404);
  const uid = prof.data.user_id as string;
  const p = (prof.data.data ?? {}) as { units?: 'km' | 'mi'; calendarFeed?: { morningHour?: number | null; eveReminder?: boolean } };
  const [plan, races] = await Promise.all([
    db.from('plans').select('data').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('races').select('data').eq('user_id', uid),
  ]);
  if (plan.error || races.error) { console.error('calendar data', plan.error?.message ?? races.error?.message); return text('Temporarily unavailable', 503); }
  const sessions = ((plan.data?.data as { sessions?: IcsSession[] } | null)?.sessions ?? []);
  const raceList = ((races.data ?? []) as { data: IcsRace }[]).map((r) => r.data).filter((r) => r?.date);
  const ics = buildIcs(sessions, raceList, {
    units: p.units === 'mi' ? 'mi' : 'km',
    morningHour: p.calendarFeed?.morningHour === undefined ? 7 : p.calendarFeed.morningHour,
    eveReminder: p.calendarFeed?.eveReminder !== false,
    appUrl: APP_URL, now: new Date(),
  });
  return new Response(req.method === 'HEAD' ? null : ics, { status: 200, headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="ritmo-training.ics"',
    'Cache-Control': 'private, max-age=900', 'X-Robots-Tag': 'noindex',
  } });
});
