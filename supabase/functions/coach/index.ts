// Ritmo coach: phrases an answer from facts computed in the app. It must not invent numbers.
// Requires the ANTHROPIC_API_KEY secret. Without it, returns 503 and the app uses its local, grounded answers.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `You are Ritmo, a calm, knowledgeable running coach. Write like a coach: specific, encouraging, honest. Address the runner as "you".
Lead with what the data means, then what to do. Keep answers under 120 words, in plain sentences, sentence case, no emoji, no markdown headings.
Use ONLY the numbers in the FACTS block. Never invent or estimate numbers that are not there. If the facts do not answer the question, say what data is missing.
You give coaching guidance, not medical advice. If pain, illness or injury is mentioned, advise rest and suggest seeing a physio or doctor.
A DRAFT answer built from the same facts is provided; you may improve its wording but must keep it accurate.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { question, facts, draft, history } = await req.json();
    if (typeof question !== 'string' || question.length > 1000 || !Array.isArray(facts)) {
      return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const prior = (Array.isArray(history) ? history : []).slice(-6).map((m: { role: string; text: string }) => ({
      role: m.role === 'coach' ? 'assistant' : 'user', content: String(m.text).slice(0, 1500),
    }));
    // The Messages API needs alternating roles starting with user
    while (prior.length && prior[0].role !== 'user') prior.shift();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('COACH_MODEL') ?? 'claude-opus-5-5',
        max_tokens: 400,
        system: SYSTEM,
        messages: [...prior, { role: 'user', content: `FACTS:\n${facts.map((f: string) => `- ${String(f).slice(0, 600)}`).join('\n')}\n\nDRAFT:\n${String(draft ?? '').slice(0, 1500)}\n\nQUESTION:\n${question}` }],
      }),
    });
    if (!res.ok) return new Response(JSON.stringify({ error: 'upstream', status: res.status }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    const data = await res.json();
    const text = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim();
    return new Response(JSON.stringify({ text }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'failed', message: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
