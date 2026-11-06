import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ArrowLeftRight } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { LogRunSheet } from '../components/LogRun';
import { AppHeader } from '../components/app';
import { Empty, StatusLine, ZoneTag } from '../components/ui';
import { addDays, DAY_SHORT, durationWords, localise, longDate, paceRange, parseYmd, startOfWeek, weekday, ymd } from '../lib/format';
import { PHASE_EXPLAIN, PHASE_LABEL } from '../training/plan';

const CONCEPTS: Record<string, string> = {
  easy: 'Easy running is conversational. It builds your aerobic engine with little fatigue, so around 80% of your running should feel like this.',
  recovery: 'Recovery runs are slower than easy runs. They keep blood flowing to tired legs without adding stress.',
  long: 'The long run builds endurance: your body learns to use fat as fuel and your legs learn to keep going.',
  tempo: 'Tempo, or steady, running sits between easy and threshold. It builds stamina at faster paces.',
  threshold: 'Threshold is the pace you could race for about an hour. Training here raises the speed you can hold before tiring quickly.',
  vo2max: 'VO2 max is the most oxygen your body can use. Hard intervals of 2 to 5 minutes push this ceiling up.',
  speed: 'Strides and short reps train fast, relaxed form. They make every pace more economical.',
  hills: 'Hill reps build strength and power with less impact than flat speed work.',
  race: 'Race day. Start controlled and run your plan.',
  runwalk: 'Run/walk means short spells of easy running with walking breaks. It is how most new runners build up safely: your heart and lungs adapt quickly, while muscles, tendons and bones need a little longer.',
  timetrial: 'A time trial is a solo effort over a set distance. It tells Ritmo your current fitness so it can set paces and predict race times.',
  rest: 'Rest is when your body adapts to training. Skipping it makes the hard days less effective.',
};

export default function Planned() {
  const { id } = useParams();
  const nav = useNavigate();
  const { plan, data, moveSession, today, swap } = useApp();
  const [warnMove, setWarnMove] = useState<string>();
  const s = plan?.sessions.find((x) => x.id === id);
  const [moving, setMoving] = useState(false);
  const [logging, setLogging] = useState(false);
  const U = data.profile.units;
  if (!s) return <Empty title="Session not found" action={<Link to="/calendar" className="btn">Back to calendar</Link>} />;

  const ws = startOfWeek(parseYmd(s.date));
  const options = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i))).filter((d) => d !== s.date && d >= ymd(today));
  const done = s.completedActivityId;

  return (
    <div className="stack-lg">
      <AppHeader title="Session" back large={false} />
      <div className="stack-sm">
        <p className="caption">{longDate(parseYmd(s.date))} · {PHASE_LABEL[s.phase]} phase{s.movedFrom ? ` · moved from ${DAY_SHORT[weekday(parseYmd(s.movedFrom))]}` : ''}</p>
        <h1 className="display-lg">{s.title}</h1>
        <div className="row wrap"><span className="tag">{s.focus}</span>
          {s.status === 'done' && <StatusLine kind="success">Completed</StatusLine>}
          {s.status === 'missed' && <StatusLine kind="warning">Missed</StatusLine>}
        </div>
      </div>

      <div className="grid-2">
        <section className="card stack">
          <h2 className="title">The session</h2>
          {s.type !== 'rest' && (
            <div className="row wrap" style={{ gap: 'var(--s5)' }}>
              <div><p className="caption">Distance</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{s.distanceM > 0 ? `${(s.distanceM / (U === 'km' ? 1000 : 1609.344)).toFixed(1)} ${U}` : 'By time'}</p></div>
              <div><p className="caption">Time</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{durationWords(s.durationS)}</p></div>
            </div>
          )}
          <ol className="ol-steps">{s.steps.map((st, i) => <li key={i}><strong>{localise(st.label, U)}</strong> {localise(st.detail, U)}</li>)}</ol>
          {s.second && <p className="caption"><strong style={{ color: 'var(--ink)' }}>{s.second.title}.</strong> {localise(s.second.detail, U)}</p>}
          {s.strength && <p className="caption"><strong style={{ color: 'var(--ink)' }}>Strength.</strong> {s.strength}</p>}
          {s.paceTarget && <div><p className="caption">Target pace</p><p className="stat">{paceRange(s.paceTarget.minSPerKm, s.paceTarget.maxSPerKm, U)}</p></div>}
          {s.hrZones && <div className="stack-sm"><p className="caption">Heart rate</p><ZoneTag zones={s.hrZones} /></div>}
        </section>

        <section className="card stack">
          <h2 className="title">Why this session</h2>
          <p><strong>Purpose.</strong> {s.purpose}</p>
          <p><strong>How it helps your goal.</strong> {s.howItHelps}</p>
          <p className="muted"><strong>{PHASE_LABEL[s.phase]} phase.</strong> {PHASE_EXPLAIN[s.phase]}</p>
          <hr className="hairline" />
          <p className="caption"><strong>In plain terms.</strong> {CONCEPTS[s.type]}</p>
        </section>
      </div>

      <div className="row wrap">
        {done && <Link className="btn btn-primary" to={`/activity/${done}`}>See your feedback</Link>}
        {!done && s.type !== 'rest' && s.date <= ymd(today) && <button className="btn btn-primary" onClick={() => setLogging(true)}><Check size={18} strokeWidth={2} aria-hidden="true" />I did it</button>}
        {!done && s.date >= ymd(today) && options.length > 0 && (
          <button className="btn" aria-expanded={moving} onClick={() => setMoving((m) => !m)}><ArrowLeftRight size={18} strokeWidth={2} aria-hidden="true" />Move this session</button>
        )}
        <Link to={`/coach?q=${encodeURIComponent(`Why is ${longDate(parseYmd(s.date)).split(' ')[0]}'s session ${s.title.toLowerCase()}?`)}`} className="btn btn-ghost">Ask your coach</Link>
      </div>
      {!done && s.date >= ymd(today) && s.type !== 'rest' && s.type !== 'race' && (
        <section className="card stack-sm" aria-label="Change this session">
          <span className="label">Change this session</span>
          <div className="row wrap">
            <button className="btn btn-small" onClick={() => swap(s.id, 'shorter')}>Make it shorter</button>
            {s.type !== 'easy' && s.type !== 'recovery' && <button className="btn btn-small" onClick={() => swap(s.id, 'easy')}>Easy run instead</button>}
            {['threshold', 'vo2max', 'tempo', 'hills'].includes(s.type) && <button className="btn btn-small" onClick={() => swap(s.id, 'similar')}>Something similar</button>}
            <button className="btn btn-small" onClick={() => swap(s.id, 'treadmill')}>Treadmill version</button>
          </div>
          <p className="caption">Every change is shown under Plan changes in Calendar, with the reason.</p>
        </section>
      )}
      {logging && <LogRunSheet open onClose={() => setLogging(false)} session={s} />}
      {moving && (
        <section className="card stack" aria-label="Choose a new day">
          <p className="label">Move to another day this week. If that day has a session, the two swap.</p>
          {warnMove && <StatusLine kind="warning">That puts two hard days back to back. Tap the day again to move it anyway, and take the second one easier.</StatusLine>}
          <div className="row wrap">
            {options.map((d) => {
              const other = plan?.sessions.find((x) => x.date === d);
              return (
                <button key={d} className="chip" onClick={() => {
                  const HARD = ['long', 'threshold', 'vo2max', 'tempo', 'hills', 'race'];
                  const near = [ymd(addDays(parseYmd(d), -1)), ymd(addDays(parseYmd(d), 1))].map((x) => plan?.sessions.find((y) => y.date === x && y.id !== s.id && y.date !== s.date));
                  const clash = HARD.includes(s.type) && near.some((y) => y && HARD.includes(y.type));
                  if (clash && warnMove !== d) { setWarnMove(d); return; }
                  moveSession(s.id, d); setMoving(false); setWarnMove(undefined); nav('/calendar');
                }}>
                  {DAY_SHORT[weekday(parseYmd(d))]} {parseYmd(d).getDate()}<span className="caption">{other ? other.title : 'Free'}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
