import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Sparkles } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { FALLBACK_TEXT } from '../coach/coach';

/** Answers written before Ritmo loaded every run (review #2 fix) may quote wrong totals */
const DATA_FIX_AT = '2026-11-07T00:00:00.000Z';
import { AppHeader, SampleChip } from '../components/app';
import { suggestions } from '../coach/coach';
import { localise } from '../lib/format';
import { Sheet } from '../components/inputs';


export default function Coach() {
  const { data, sendCoach, coachBusy, clearCoach, todaySession, updateProfile, applyCoachProposal } = useApp();
  const ai = data.profile.consents?.aiCoach;
  // Chats with the sample runner stay with the sample runner
  const chat = data.coach.filter((m) => (m.mode ?? 'real') === (data.mode === 'sample' ? 'sample' : 'real'));
  const [pending, setPending] = useState<string>();
  const SUGGESTIONS = suggestions(todaySession, data.activities.length > 0);
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    const q = params.get('q');
    if (q && !asked.current) { asked.current = true; submit(q); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat.length, coachBusy]);

  // The first question asks whether answers may use the AI coach. Declining keeps answers on the device's built-in coach.
  const submit = (q: string) => {
    if (!q.trim() || coachBusy) return;
    setText('');
    if (!ai && data.mode !== 'sample') { setPending(q.trim()); return; }
    sendCoach(q.trim());
  };
  const decide = (granted: boolean) => {
    updateProfile({ consents: { ...data.profile.consents, aiCoach: { granted, at: new Date().toISOString() } } });
    const q = pending; setPending(undefined);
    if (q) sendCoach(q, granted);
  };

  return (
    <div className="stack-lg">
      <AppHeader title="Coach" eyebrow="Answers from your own runs and plan. Coaching guidance, not medical advice." right={chat.length > 0 ? <button className="btn btn-ghost btn-small" onClick={clearCoach}>Clear</button> : <SampleChip />} />

      <div className="chat" aria-live="polite">
        {chat.length === 0 && (
          <div className="bubble bubble-coach"><p>Hello{data.profile.name ? ` ${data.profile.name}` : ''}. {data.activities.length ? 'I know your runs, your plan and how your recent sessions went.' : todaySession ? 'I know your plan, and I will learn more about you with every run you log.' : 'Once you have a plan or log a run, I can answer with your own data.'} What would you like to know?</p></div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'coach' ? 'bubble-coach' : 'bubble-runner'}`}>
            {m.fallback && <p className="caption" style={{ marginBottom: 6 }}><strong style={{ color: 'var(--ink)' }}>{m.fallback === 'health' ? 'Safety first.' : 'AI coach unavailable.'}</strong> {FALLBACK_TEXT[m.fallback]}</p>}
            <p>{localise(m.text, data.profile.units)}</p>
            {m.role === 'coach' && m.at < DATA_FIX_AT && data.mode === 'real' && <p className="caption" style={{ marginTop: 6 }}>Written before Ritmo loaded your full history, so it may be out of date.</p>}
            {m.proposal && (m.proposal.applied
              ? <p className="caption" style={{ marginTop: 6 }}>Done. Your plan is updated.</p>
              : <button className="btn btn-small btn-primary" style={{ marginTop: 8 }} onClick={() => applyCoachProposal(m.id)}>{m.proposal.label}</button>)}
            {m.facts && m.facts.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="caption" style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>{m.source === 'ai' ? 'AI coach · data used' : m.source === 'local' ? 'Built-in coach · data used' : 'Data used'}</summary>
                <ul className="bullets caption" style={{ marginTop: 4 }}>{m.facts.slice(0, 8).map((f) => <li key={f}>{f}</li>)}</ul>
              </details>
            )}
          </div>
        ))}
        {data.mode === 'real' && chat.some((m) => m.role === 'coach' && m.at < DATA_FIX_AT) && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-small" onClick={clearCoach}>Clear old answers</button>
          </div>
        )}
        {coachBusy && <div className="bubble bubble-coach" aria-label="Coach is thinking"><p className="muted">Looking at your data…</p></div>}
        <div ref={endRef} />
      </div>

      <div className="row wrap" role="group" aria-label="Suggested questions">
        {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => submit(s)} disabled={coachBusy}>{s}</button>)}
      </div>

      {ai && (
        <p className="caption">
          {ai.granted ? 'Answers use the AI coach. ' : 'Answers come from Ritmo\'s built-in coach only. '}
          <button className="link-btn" onClick={() => updateProfile({ consents: { ...data.profile.consents, aiCoach: { granted: !ai.granted, at: new Date().toISOString() } } })}>{ai.granted ? 'Stop using AI' : 'Use the AI coach'}</button>
        </p>
      )}

      <Sheet open={!!pending} onClose={() => setPending(undefined)} title="Use the AI coach?"
        footer={<div className="stack"><button className="btn btn-primary" onClick={() => decide(true)}>Yes, use the AI coach</button><button className="btn" onClick={() => decide(false)}>No, built-in answers only</button></div>}>
        <div className="stack">
          <p><Sparkles size={18} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--brand)' }} />Ritmo can send your question and a summary of your training to an AI service so the answer reads more naturally.</p>
          <ul className="bullets">
            <li>Sent: your question, recent chat, and training facts such as paces, distances, readiness and your plan.</li>
            <li>Never sent: your email, profile picture, date of birth or health check answers.</li>
            <li>The AI service does not use it to train its models. Garmin data is never used to train AI.</li>
            <li>Without it, the built-in coach still answers from the same data.</li>
          </ul>
          <p className="caption">You can change this at any time on this screen or in Privacy.</p>
        </div>
      </Sheet>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
        <label htmlFor="ask" className="sr-only">Ask your coach</label>
        <input id="ask" className="input" style={{ borderRadius: 'var(--r-pill)', paddingLeft: 20 }} placeholder="Ask about your training" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Send" disabled={!text.trim() || coachBusy} style={{ padding: '0 18px' }}><Send size={18} strokeWidth={2} aria-hidden="true" /></button>
      </form>
    </div>
  );
}
