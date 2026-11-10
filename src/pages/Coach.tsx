import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, History, Send, Sparkles } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Segmented } from '../components/ui';
import { FALLBACK_TEXT } from '../coach/coach';

/** Answers written before Ritmo loaded every run (review #2 fix) may quote wrong totals */
const DATA_FIX_AT = '2026-11-07T00:00:00.000Z';
import { ReadinessBar } from '../components/training';
import { DAY_NAMES, parseYmd, startOfWeek, toUnit, weekday, ymd, addDays } from '../lib/format';
import { QUALITY_TYPES, SESSION_SHORT } from '../training/analysis';
import { Link } from 'react-router-dom';
import { AppHeader, SampleChip } from '../components/app';
import { suggestions } from '../coach/coach';
import { localise } from '../lib/format';
import { Sheet } from '../components/inputs';


export default function Coach() {
  const { data, sendCoach, coachBusy, clearCoach, todaySession, updateProfile, applyCoachProposal, hasFlag, updateBody, ready, plan, readinessToday, today, aRace, athlete } = useApp();
  const [menu, setMenu] = useState(false);
  const ai = data.profile.consents?.aiCoach;
  const [params, setParams] = useSearchParams();
  // Body mode (flagged): injury and recovery chat with its own safety rules, kept apart from the coach chat
  const [topic, setTopic] = useState<'coach' | 'body'>(params.get('mode') === 'body' && hasFlag('body') ? 'body' : 'coach');
  const body = topic === 'body';
  // Chats with the sample runner stay with the sample runner
  const all = data.coach.filter((m) => (m.mode ?? 'real') === (data.mode === 'sample' ? 'sample' : 'real') && (body ? m.topic === 'body' : m.topic !== 'body'));
  // Answers written before Ritmo had the runner's full history were built on partial data: not shown at all.
  // Answers from before the current plan was made are kept, but folded away as older answers.
  const live = data.mode === 'real' ? all.filter((m) => m.at >= DATA_FIX_AT) : all;
  const planAt = data.mode === 'real' ? plan?.createdAt : undefined;
  const older = planAt ? live.filter((m) => m.at < planAt) : [];
  const chat = planAt ? live.filter((m) => m.at >= planAt) : live;
  const loading = data.mode === 'real' && !ready;
  const [pending, setPending] = useState<string>();
  // This week, for the readiness card: distance and sessions against the plan, and days to the next race
  const t = ymd(today);
  const ws = ymd(startOfWeek(today)), we = ymd(addDays(startOfWeek(today), 6));
  const weekSessions = (plan?.sessions ?? []).filter((x) => x.date >= ws && x.date <= we && x.type !== 'rest');
  const plannedM = weekSessions.reduce((x, y) => x + y.distanceM, 0);
  const doneSessions = weekSessions.filter((x) => x.status === 'done' || x.status === 'swapped').length;
  const daysToRace = aRace ? Math.round((parseYmd(aRace.date).getTime() - parseYmd(t).getTime()) / 86400000) : undefined;
  const U = data.profile.units;
  const nextQ = plan?.sessions.find((x) => x.date > t && x.status === 'planned' && QUALITY_TYPES.includes(x.type));
  const SUGGESTIONS = body ? ['Can I run with sore calves after intervals?', 'My knee hurts on downhills, what should I change?', 'How do I come back after 2 weeks off?']
    : suggestions(todaySession, data.activities.length > 0, { race: aRace?.name, nextQuality: nextQ ? { day: DAY_NAMES[weekday(parseYmd(nextQ.date))], short: SESSION_SHORT[nextQ.type] ?? nextQ.title.toLowerCase() } : undefined });
  const r = readinessToday;
  const chip = r.score == null ? undefined : r.band === 'hard' ? { kind: 'success', word: 'Ready to train' } : r.band === 'easy' ? { kind: 'warning', word: 'Take it easy' } : { kind: 'danger', word: 'Recover today' };
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
    if (!q.trim() || coachBusy || loading) return;
    setText('');
    if (!ai && data.mode !== 'sample') { setPending(q.trim()); return; }
    sendCoach(q.trim(), undefined, body ? 'body' : undefined);
  };
  const decide = (granted: boolean) => {
    updateProfile({ consents: { ...data.profile.consents, aiCoach: { granted, at: new Date().toISOString() } } });
    const q = pending; setPending(undefined);
    if (q) sendCoach(q, granted, body ? 'body' : undefined);
  };

  return (
    <div className="stack-lg">
      <AppHeader avatar title="Coach" eyebrow={body ? 'Injury and recovery support. General guidance, not medical advice.' : 'Answers from your own runs and plan. Not medical advice.'}
        right={<><SampleChip /><button className="icon-btn" aria-label="Past chats and settings" aria-haspopup="dialog" onClick={() => setMenu(true)}><History size={22} strokeWidth={2} /></button></>} />
      {hasFlag('body') && <Segmented<'coach' | 'body'> label="Chat" value={topic} onChange={setTopic} options={[{ value: 'coach', label: 'Coach' }, { value: 'body', label: 'Body' }]} />}
      {body && (
        <div className="card stack-sm">
          <p className="caption">Ritmo gives general guidance, not medical advice, and never diagnoses. Warning signs (pain at night, a pop, swelling, numbness, a bony spot) always get "stop and get checked" first.</p>
        </div>
      )}

      {/* The same readiness as Training and run feedback: one score, word and sentence, plus this week */}
      {!body && plan && (
        <section className="card stack-sm coach-ready" aria-label="Readiness and this week">
          {r.score == null ? <p className="caption">{r.unavailable}</p> : (
            <>
              <div className="row-between">
                <Link to="/readiness" className="row" style={{ gap: 8, alignItems: 'baseline', textDecoration: 'none', color: 'var(--ink)' }}>
                  <span className="caption">Readiness</span><span className="rd-score">{r.score}</span><span className="rd-word" style={{ color: r.band === 'hard' ? 'var(--success)' : r.band === 'easy' ? 'var(--warning)' : 'var(--danger)' }}>{r.word}</span>
                </Link>
                {chip && <span className={`status-chip ${chip.kind === 'success' ? 'done' : 'missed'}`}>{chip.kind === 'success' ? <CheckCircle2 size={12} strokeWidth={2.5} aria-hidden="true" /> : <AlertTriangle size={12} strokeWidth={2.5} aria-hidden="true" />}{chip.word}</span>}
              </div>
              <ReadinessBar score={r.score} />
              <p className="caption">{r.line}</p>
            </>
          )}
          <div className="coach-week">
            <div><span className="stat">{toUnit(athlete.weekM, U).toFixed(1)}{plannedM > 0 ? <small> / {toUnit(plannedM, U).toFixed(0)}</small> : null}</span><span className="caption">{U} this week</span></div>
            <div><span className="stat">{doneSessions}<small> / {weekSessions.length}</small></span><span className="caption">sessions</span></div>
            <div><span className="stat">{daysToRace ?? '–'}</span><span className="caption">{aRace ? `days to ${aRace.name}` : 'no race yet'}</span></div>
          </div>
        </section>
      )}

      <div className="chat" aria-live="polite">
        {older.length > 0 && (
          <details className="older-answers">
            <summary className="caption" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Older answers (before your plan changed) · {older.filter((m) => m.role === 'coach').length}</summary>
            <div className="stack-sm" style={{ opacity: 0.75 }}>
              {older.map((m) => <div key={m.id} className={`bubble ${m.role === 'coach' ? 'bubble-coach' : 'bubble-runner'}`}><p>{localise(m.text, data.profile.units)}</p></div>)}
            </div>
          </details>
        )}
        {chat.length === 0 && (
          <div className="bubble bubble-coach"><p>Hello{data.profile.name ? ` ${data.profile.name}` : ''}. {data.activities.length ? 'I know your runs, your plan and how your recent sessions went.' : todaySession ? 'I know your plan, and I will learn more about you with every run you log.' : 'Once you have a plan or log a run, I can answer with your own data.'} What would you like to know?</p></div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'coach' ? 'bubble-coach' : 'bubble-runner'}`}>
            {m.fallback && <p className="caption" style={{ marginBottom: 6 }}><strong style={{ color: 'var(--ink)' }}>{m.fallback === 'health' ? 'Safety first.' : 'AI coach unavailable.'}</strong> {FALLBACK_TEXT[m.fallback]}</p>}
            <p>{localise(m.text, data.profile.units)}</p>
            {m.proposal && (m.proposal.applied
              ? <p className="caption" style={{ marginTop: 6 }}>Done. Your plan is updated.</p>
              : <button className="btn btn-small btn-primary" style={{ marginTop: 8 }} onClick={() => applyCoachProposal(m.id)}>{m.proposal.label}</button>)}
            {m.facts && m.facts.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="caption based-on">Based on: {m.facts.slice(0, 2).map((f) => f.split(/[.:]/)[0]).join(', ')}{m.facts.length > 2 ? '…' : ''}{m.source === 'ai' ? ' · AI coach' : m.source === 'local' ? ' · built-in coach' : ''}</summary>
                <ul className="bullets caption" style={{ marginTop: 4 }}>{m.facts.slice(0, 8).map((f) => <li key={f}>{f}</li>)}</ul>
              </details>
            )}
          </div>
        ))}
        {loading && <div className="bubble bubble-coach" role="status"><p className="muted">Still loading your runs. Ask in a moment, so the answer uses all of them.</p></div>}
        {coachBusy && <div className="bubble bubble-coach" aria-label="Coach is thinking"><p className="muted">Looking at your data…</p></div>}
        <div ref={endRef} />
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Past chats and settings">
        <div className="stack">
          <p className="caption">{chat.filter((m) => m.role === 'coach').length} answer{chat.filter((m) => m.role === 'coach').length === 1 ? '' : 's'} in this chat{older.length ? `, and ${older.filter((m) => m.role === 'coach').length} older answer${older.filter((m) => m.role === 'coach').length === 1 ? '' : 's'} from before your plan changed (folded at the top of the chat)` : ''}.</p>
          {chat.length > 0 && !body && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { clearCoach(); setMenu(false); }}>Clear this chat</button>}
          {ai ? (
            <div className="stack-sm">
              <span className="label">AI coach</span>
              <p className="caption">{ai.granted ? 'Answers use the AI coach.' : 'Answers come from Ritmo\'s built-in coach only.'}</p>
              <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => updateProfile({ consents: { ...data.profile.consents, aiCoach: { granted: !ai.granted, at: new Date().toISOString() } } })}>{ai.granted ? 'Stop using AI' : 'Use the AI coach'}</button>
            </div>
          ) : <p className="caption">You'll be asked whether to use the AI coach with your first question.</p>}
          {hasFlag('body') && <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={data.profile.body?.aiChat !== false} onChange={(e) => updateBody({ aiChat: e.target.checked })} /> Use AI for Body answers</label>}
        </div>
      </Sheet>

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

      <div className="coach-composer">
      <div className="suggest-row" role="group" aria-label="Suggested questions">
        {SUGGESTIONS.map((x) => <button key={x} className="chip" onClick={() => submit(x)} disabled={coachBusy || loading}>{x}</button>)}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
        <label htmlFor="ask" className="sr-only">Ask your coach</label>
        <input id="ask" className="input" style={{ borderRadius: 'var(--r-pill)', paddingLeft: 20 }} placeholder="Ask about your training" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button className="btn btn-primary" type="submit" aria-label="Send" disabled={!text.trim() || coachBusy || loading} style={{ padding: '0 18px' }}><Send size={18} strokeWidth={2} aria-hidden="true" /></button>
      </form>
      </div>
      <div className="coach-composer-space" aria-hidden="true" />
    </div>
  );
}
