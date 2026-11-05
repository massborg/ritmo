import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader, SampleChip } from '../components/app';
import { suggestions } from '../coach/coach';


export default function Coach() {
  const { data, sendCoach, coachBusy, clearCoach, todaySession } = useApp();
  const SUGGESTIONS = suggestions(todaySession, data.activities.length > 0);
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    const q = params.get('q');
    if (q && !asked.current) { asked.current = true; sendCoach(q); setParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [data.coach.length, coachBusy]);

  const submit = (q: string) => { if (!q.trim() || coachBusy) return; sendCoach(q.trim()); setText(''); };

  return (
    <div className="stack-lg">
      <AppHeader title="Coach" eyebrow="Answers from your own runs and plan. Coaching guidance, not medical advice." right={data.coach.length > 0 ? <button className="btn btn-ghost btn-small" onClick={clearCoach}>Clear</button> : <SampleChip />} />

      <div className="chat" aria-live="polite">
        {data.coach.length === 0 && (
          <div className="bubble bubble-coach"><p>Hello{data.profile.name ? ` ${data.profile.name}` : ''}. {data.activities.length ? 'I know your runs, your plan and how your recent sessions went.' : todaySession ? 'I know your plan, and I will learn more about you with every run you log.' : 'Once you have a plan or log a run, I can answer with your own data.'} What would you like to know?</p></div>
        )}
        {data.coach.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'coach' ? 'bubble-coach' : 'bubble-runner'}`}>
            <p>{m.text}</p>
            {m.facts && m.facts.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="caption" style={{ cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>Data used</summary>
                <ul className="bullets caption" style={{ marginTop: 4 }}>{m.facts.slice(0, 8).map((f) => <li key={f}>{f}</li>)}</ul>
              </details>
            )}
          </div>
        ))}
        {coachBusy && <div className="bubble bubble-coach" aria-label="Coach is thinking"><p className="muted">Looking at your data…</p></div>}
        <div ref={endRef} />
      </div>

      <div className="row wrap" role="group" aria-label="Suggested questions">
        {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => submit(s)} disabled={coachBusy}>{s}</button>)}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
        <label htmlFor="ask" className="sr-only">Ask your coach</label>
        <input id="ask" className="input" style={{ borderRadius: 'var(--r-pill)', paddingLeft: 20 }} placeholder="Ask about your training" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Send" disabled={!text.trim() || coachBusy} style={{ padding: '0 18px' }}><Send size={18} strokeWidth={2} aria-hidden="true" /></button>
      </form>
    </div>
  );
}
