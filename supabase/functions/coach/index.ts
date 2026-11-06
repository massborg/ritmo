// Ritmo AI coach. Answers the runner's actual question from their own data (facts computed in the app,
// this week's sessions and the recent chat), and may propose one plan change that the runner confirms in
// the app. Requires the ANTHROPIC_API_KEY secret; without it, returns 503 and the app uses its built-in coach.
// Never receives the runner's email, photo, date of birth or health check answers.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = `You are Ritmo, a calm, expert running coach inside the Ritmo app. Answer the runner's actual question, like a good coach would: specific, encouraging and honest. Address the runner as "you".
Use only the numbers in FACTS and SESSIONS. Never invent or estimate numbers that are not there; if the data does not answer the question, say what is missing.
Lead with the answer, then the reason, then what to do. Under 150 words, plain sentences, sentence case, no emoji, no markdown headings or bullet symbols. Use the runner's units.
A DRAFT from Ritmo's built-in coach is included. It may answer a different question; use it only if it helps.
If a change to a planned session would clearly help, or the runner asks for one (moving, shortening or easing a session), write your answer first and then call propose_plan_change once. The app asks the runner to confirm, so describe the change as a suggestion. Never propose changes to races or rest days, never move a hard session next to another hard day, and never move anything into the past.
You give coaching guidance, not medical advice. If pain, illness, chest symptoms, dizziness or injury come up, advise rest and seeing a doctor or physio, and do not propose harder training.`;

const PROPOSE: Anthropic.Tool = {
  name: 'propose_plan_change',
  description: 'Offer the runner one change to a planned session from SESSIONS. The app shows it as a button the runner must confirm. action "move" moves the session to to_date (YYYY-MM-DD); "shorter" makes it about 30% shorter; "easy" turns it into an easy run.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'session_id', 'to_date'],
    properties: {
      action: { type: 'string', enum: ['move', 'shorter', 'easy'] },
      session_id: { type: 'string', description: 'The id of the session in SESSIONS' },
      to_date: { type: ['string', 'null'], description: 'For "move": the new date, YYYY-MM-DD. Otherwise null.' },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Only real signed-in users may use the coach (the public anon key alone is not enough)
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return json({ error: 'not_signed_in' }, 401);
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);
  // Usage limit (30 an hour, 100 a day per person), enforced in the database. Over the limit, the app answers locally.
  const quota = await asUser.rpc('take_coach_quota');
  if (quota.error) console.error('coach quota check failed', quota.error.message);
  else if (quota.data === false) return json({ error: 'rate_limited' }, 429);

  let body: { question?: unknown; facts?: unknown; draft?: unknown; history?: unknown; sessions?: unknown; today?: unknown; units?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const { question, facts, draft, history, sessions, today, units } = body;
  if (typeof question !== 'string' || question.length > 1000 || !Array.isArray(facts)) return json({ error: 'bad_request' }, 400);

  const prior = (Array.isArray(history) ? history : []).slice(-6).map((m: { role: string; text: string }) => ({
    role: (m.role === 'coach' ? 'assistant' : 'user') as 'assistant' | 'user', content: String(m.text).slice(0, 1500),
  }));
  while (prior.length && prior[0].role !== 'user') prior.shift(); // the conversation must start with the runner
  const sessionLines = (Array.isArray(sessions) ? sessions : []).slice(0, 21)
    .map((s: Record<string, unknown>) => `- id ${String(s.id)} | ${String(s.date)} | ${String(s.type)} | ${String(s.title)} | ${Number(s.km)} km | ${Number(s.minutes)} min | ${String(s.status)}`).join('\n');
  const prompt = `TODAY: ${String(today ?? '')}\nUNITS: ${units === 'mi' ? 'miles' : 'kilometres'}\n\nFACTS:\n${facts.map((f) => `- ${String(f).slice(0, 700)}`).join('\n')}\n\nSESSIONS (this week and the next few days):\n${sessionLines || '- none'}\n\nDRAFT:\n${String(draft ?? '').slice(0, 1500)}\n\nQUESTION:\n${question}`;

  try {
    const client = new Anthropic({ apiKey: key });
    // Refusal fallback is on by default: if the main model declines, the API re-runs on a suitable model in the same call.
    const params = {
      model: Deno.env.get('COACH_MODEL') ?? 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' }, // short chat answers: low effort keeps them quick and inexpensive
      system: SYSTEM,
      tools: [PROPOSE],
      tool_choice: { type: 'auto' },
      messages: [...prior, { role: 'user', content: prompt }],
    };
    // deno-lint-ignore no-explicit-any
    const res = await client.beta.messages.create(params as any);
    if (res.stop_reason === 'refusal') return json({ error: 'declined' }, 502);
    let text = '';
    let proposal: unknown = null;
    for (const block of res.content) {
      if (block.type === 'text') text += (text ? '\n' : '') + block.text;
      if (block.type === 'tool_use' && block.name === 'propose_plan_change') proposal = block.input;
    }
    text = text.trim();
    if (!text && proposal) text = 'Here is a change that would help this week. Tap the button to apply it.';
    if (!text) return json({ error: 'empty' }, 502);
    return json({ text, proposal });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'upstream_busy' }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: 'upstream', status: e.status }, 502);
    return json({ error: 'failed', message: String(e) }, 500);
  }
});
