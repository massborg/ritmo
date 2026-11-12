// The guided strength player (update 3, §5): title, elapsed time and progress; "Exercise x of y" with a demo, the
// name and one cue; the sets (done, now, next) with −/+ for reps or load; Set done, then a rest timer (60 s by default,
// editable); Up next. Reps and load are saved per exercise and pre-filled next time. Then a summary and "How did it
// feel?". Strength counts toward streaks and sessions done, and as light load, never as running km.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Minus, Plus, Timer } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { resolveStrength, type Routine } from '../training/strength';
import { useStrengthAt } from '../components/StrengthSession';
import { duration, ymd } from '../lib/format';

interface SetRow { reps?: number; load?: number; seconds?: number; done: boolean }

export default function StrengthPlayer() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { data, plan, saveStrength, setStrengthPrefs } = useApp();
  const session = plan?.sessions.find((s) => s.id === id);
  const sp = session?.strengthPlan ?? (id === 'free' ? { routine: (params.get('routine') as Routine) || 'A', intensity: 'moderate' as const, why: '' } : undefined);
  const prefs = data.profile.strength;
  const at = useStrengthAt(session?.date ?? ymd(new Date()));
  // With progression (update 3, §9): this block's versions, and each exercise's target from its last session
  const workout = useMemo(() => (sp ? resolveStrength(sp, prefs, at) : undefined), [sp?.routine, sp?.intensity, sp?.custom, at.block, at.week, at.skips]); // eslint-disable-line react-hooks/exhaustive-deps
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [idx, setIdx] = useState(0);
  // Pre-filled with the reps and load used last time for each exercise
  const initSets = () => (workout?.items ?? []).map((x) => {
    const last = prefs?.last?.[x.id];
    // The progression target first (from the last session); otherwise what was done last time
    const hasTarget = !!prefs?.progress?.[x.id];
    return Array.from({ length: x.sets }, (): SetRow => ({ reps: x.seconds ? undefined : hasTarget ? x.reps : last?.reps ?? x.reps, seconds: x.seconds ? (hasTarget ? x.seconds : last?.seconds ?? x.seconds) : undefined, load: hasTarget ? x.load : last?.load, done: false }));
  });
  const [sets, setSets] = useState<SetRow[][]>(initSets);
  // The plan may still be loading on the first render: fill the sets in once the workout is there
  useEffect(() => { if (workout && !sets.length && workout.items.length) setSets(initSets()); }, [workout]); // eslint-disable-line react-hooks/exhaustive-deps
  const [restLen, setRestLen] = useState(prefs?.rest ?? 60);
  const [restLeft, setRestLeft] = useState<number>();
  const [finished, setFinished] = useState(false);
  const [rpe, setRpe] = useState<number>();
  const beep = useRef(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (restLeft == null) return;
    if (restLeft <= 0) { setRestLeft(undefined); if (!beep.current) { beep.current = true; try { navigator.vibrate?.(200); } catch { /* */ } } return; }
    const t = setTimeout(() => setRestLeft((x) => (x == null ? x : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  if (!workout || !workout.items.length) return (
    <div className="stack-lg"><AppHeader title="Strength" back large={false} /><p className="muted">This strength session isn't in your plan any more.</p><Link to="/" className="btn">Back to Training</Link></div>
  );
  const items = workout.items;
  const totalSets = sets.reduce((a, s) => a + s.length, 0);
  const doneSets = sets.reduce((a, s) => a + s.filter((x) => x.done).length, 0);
  const cur = items[idx], curSets = sets[idx] ?? [];
  const nowSet = curSets.findIndex((x) => !x.done);
  const elapsed = Math.round((now - startedAt) / 1000);
  // A change to the set you're on carries to the sets still to come
  const change = (field: 'reps' | 'load' | 'seconds', d: number) => setSets((all) => all.map((s, i) => {
    if (i !== idx) return s;
    const v = Math.max(0, Math.round(((s[nowSet]?.[field] ?? 0) + d) * 10) / 10);
    return s.map((x, j) => (j < nowSet || x.done ? x : { ...x, [field]: v }));
  }));
  const setDone = () => {
    if (nowSet < 0) return;
    setSets((all) => all.map((s, i) => (i !== idx ? s : s.map((x, j) => (j === nowSet ? { ...x, done: true } : x)))));
    beep.current = false;
    const lastOfEx = nowSet === curSets.length - 1;
    if (lastOfEx && idx === items.length - 1) { setFinished(true); setRestLeft(undefined); return; }
    if (lastOfEx) setIdx(idx + 1);
    setRestLeft(restLen);
  };
  const save = () => {
    setStrengthPrefs({ rest: restLen });
    const exercises = items.map((x, i) => ({ id: x.id, name: x.ex.name, planned: sets[i].length, sets: sets[i].filter((y) => y.done).map(({ done: _d, ...y }) => y) })).filter((x) => x.sets.length); // eslint-disable-line @typescript-eslint/no-unused-vars
    saveStrength({ date: ymd(new Date(startedAt)), minutes: Math.max(1, Math.round(elapsed / 60)), rpe, strength: { title: workout.title, source: 'ritmo', sessionId: session?.id, exercises } });
    nav(session ? `/session/${session.id}` : '/');
  };

  if (finished) return (
    <div className="stack-lg strength-summary">
      <AppHeader title="Workout done" large={false} />
      <section className="card row wrap" style={{ gap: 'var(--s5)' }} aria-label="Summary">
        <div><p className="caption">Time</p><p className="stat-xl" style={{ fontSize: 36 }}>{duration(elapsed)}</p></div>
        <div><p className="caption">Exercises</p><p className="stat" style={{ fontSize: 28 }}>{sets.filter((s) => s.some((x) => x.done)).length}</p></div>
        <div><p className="caption">Sets</p><p className="stat" style={{ fontSize: 28 }}>{doneSets}</p></div>
      </section>
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">How did it feel? Effort 1 to 10</legend>
        <div className="row wrap" style={{ gap: 6 }}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} type="button" className="chip" aria-pressed={rpe === n} onClick={() => setRpe(n)}>{n}</button>)}</div>
      </fieldset>
      <button className="btn btn-primary" onClick={save}>Save workout</button>
      <p className="caption">It counts toward your streak and sessions done, and as light load in readiness. It never counts as running distance.</p>
    </div>
  );

  return (
    <div className="stack strength-player">
      <AppHeader title={workout.title} back large={false} />
      <p className="row-between strength-head"><span className="stat" aria-label="Elapsed time">{duration(elapsed)}</span><span className="caption">{doneSets} of {totalSets} sets</span></p>
      <div className="progress" role="progressbar" aria-label="Workout progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((doneSets / totalSets) * 100)}><span style={{ width: `${(doneSets / totalSets) * 100}%` }} /></div>
      <section className="card stack-sm strength-now" aria-label="Current exercise">
        <span className="caption">Exercise {idx + 1} of {items.length}</span>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <ExerciseDemo pattern={cur.ex.pattern} name={cur.ex.name} size={104} />
          <div className="stack-sm" style={{ gap: 2 }}>
            <h2 className="title">{cur.ex.name}</h2>
            <p className="caption">{cur.ex.cues[0]}{cur.ex.perSide ? ' · each side' : ''}</p>
            {cur.ex.load && <p className="caption">Load: {cur.ex.load}</p>}
            {cur.note && <p className="caption progress-note">Today: {cur.note}</p>}
          </div>
        </div>
        <ol className="set-list">
          {curSets.map((x, j) => (
            <li key={j} className={`set-row${x.done ? ' done' : j === nowSet ? ' now' : ''}`} aria-current={j === nowSet ? 'step' : undefined}>
              <span className="label">Set {j + 1}</span>
              <span className="stat">{x.seconds != null ? `${x.seconds} s` : `${x.reps ?? '–'} reps`}{x.load ? ` · ${x.load} kg` : ''}</span>
              <span className="caption">{x.done ? <><Check size={14} aria-hidden="true" /> Done</> : j === nowSet ? 'Now' : 'Next'}</span>
            </li>
          ))}
        </ol>
        {nowSet >= 0 && (
          <div className="row wrap" style={{ gap: 12 }}>
            {curSets[nowSet].seconds != null
              ? <Adjust label="Seconds" value={curSets[nowSet].seconds!} onMinus={() => change('seconds', -5)} onPlus={() => change('seconds', 5)} />
              : <Adjust label="Reps" value={curSets[nowSet].reps ?? 0} onMinus={() => change('reps', -1)} onPlus={() => change('reps', 1)} />}
            {cur.ex.equipment !== 'none' && <Adjust label="Load (kg)" value={curSets[nowSet].load ?? 0} onMinus={() => change('load', -2.5)} onPlus={() => change('load', 2.5)} />}
          </div>
        )}
      </section>
      {restLeft != null && (
        <section className="card row-between rest-timer" role="timer" aria-live="polite" aria-label="Rest">
          <span className="row" style={{ gap: 8 }}><Timer size={20} strokeWidth={2} aria-hidden="true" /><span className="label">Rest</span><span className="stat" style={{ fontSize: 28 }}>{restLeft} s</span></span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn btn-small" onClick={() => setRestLeft((x) => (x ?? 0) + 15)}>+15 s</button>
            <button className="btn btn-small btn-ghost" onClick={() => setRestLeft(undefined)}>Skip</button>
          </span>
        </section>
      )}
      <button className="btn btn-primary btn-block strength-set-done" onClick={setDone} disabled={nowSet < 0}><Check size={20} strokeWidth={2.2} aria-hidden="true" />Set done</button>
      <label className="row caption" style={{ gap: 8 }}>Rest between sets
        <select className="input" style={{ maxWidth: 110, minHeight: 40 }} value={restLen} onChange={(e) => setRestLen(Number(e.target.value))} aria-label="Rest between sets">
          {[30, 45, 60, 90, 120].map((s) => <option key={s} value={s}>{s} s</option>)}
        </select>
      </label>
      {items.length > idx + 1 && (
        <section className="stack-sm" aria-label="Up next">
          <span className="label">Up next</span>
          <ul className="list">{items.slice(idx + 1).map((x, k) => (
            <li key={x.id}><button className="list-item row-between" style={{ width: '100%' }} onClick={() => setIdx(idx + 1 + k)}><span>{x.ex.name}</span><span className="row caption" style={{ gap: 4 }}>{x.sets} sets<ChevronRight size={16} aria-hidden="true" /></span></button></li>
          ))}</ul>
        </section>
      )}
      <button className="btn btn-ghost" onClick={() => setFinished(true)}>Finish workout</button>
    </div>
  );
}

function Adjust({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <span className="mini-step" role="group" aria-label={label}>
      <button className="icon-btn" aria-label={`Less: ${label}`} onClick={onMinus}><Minus size={18} /></button>
      <span className="stat">{value}</span><span className="caption">{label}</span>
      <button className="icon-btn" aria-label={`More: ${label}`} onClick={onPlus}><Plus size={18} /></button>
    </span>
  );
}
