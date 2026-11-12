// A care plan for a niggle (update 3, §10): the stage (calm it down, build, return to full training) and its
// exercises with how often and cues; "Done today"; the morning pain check (0–10, also during yesterday's exercises),
// which moves the plan forward, keeps it, or steps back, and adjusts running with the same rules as Training; a
// physio's own programme instead; and the safety text, always.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, HeartPulse } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';
import { activeNiggle, painRule, type BodyArea } from '../training/body';
import { applyCheck, CARE_DISCLAIMER, careAreaFor, loadCarePlans, physioAdvice, URGENT, type CareArea, type CareExercise, type CarePlans, type CareState } from '../training/care';
import { longDate, parseYmd, ymd } from '../lib/format';

const BODY_AREA: Record<CareArea, BodyArea> = { foot: 'Foot', ankle: 'Ankle', achilles: 'Achilles', calf: 'Calf', shin: 'Shin', knee: 'Knee', 'itband-hip': 'Hip', hamstring: 'Hamstring', 'lower-back': 'Lower back' };

export default function CarePlan() {
  const { data, updateBody, addBodyCheckin, today } = useApp();
  const [plans, setPlans] = useState<CarePlans>();
  const [err, setErr] = useState<string>();
  useEffect(() => { loadCarePlans().then(setPlans).catch(() => setErr('The care plans could not be loaded. Check your connection and try again.')); }, []);
  const b = data.profile.body;
  const care = b?.care;
  const t = ymd(today);
  const niggle = activeNiggle(b, today);
  const [area, setArea] = useState<CareArea | undefined>(niggle ? careAreaFor(niggle.area) : undefined);
  const [side, setSide] = useState<'left' | 'right' | undefined>(niggle?.side);
  const [morning, setMorning] = useState(2);
  const [during, setDuring] = useState<number | undefined>();
  const [sharp, setSharp] = useState(false);
  const [limping, setLimping] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [result, setResult] = useState<string>();
  const [physioText, setPhysioText] = useState<string>();
  if (err) return <div className="stack-lg"><AppHeader title="Care plan" back /><StatusLine kind="warning">{err}</StatusLine></div>;
  if (!plans) return <div className="stack-lg"><AppHeader title="Care plan" back /><p className="muted">Loading…</p></div>;

  const safety = (
    <section className="card stack-sm care-safety" aria-label="Safety">
      <p className="caption"><strong style={{ color: 'var(--ink)' }}>{CARE_DISCLAIMER}</strong></p>
      <p className="caption">See a physio if the pain is sharp, getting worse, makes you limp, or lasts more than 2 weeks.</p>
      <p className="caption">Chest pain, dizziness or fainting: stop everything and get urgent medical help.</p>
      {!plans.reviewed && <p className="caption">These exercises (version {plans.version}) are waiting for review by a physiotherapist.</p>}
    </section>
  );

  if (!care) return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title="Care plan" eyebrow="Strength to help with a niggle" back />
      <section className="card stack">
        <h2 className="title">Start a care plan</h2>
        <p className="caption">Three stages: calm it down, build, then return to full training. A pain check each morning decides when to move on.</p>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Which area?</legend>
          <div className="row wrap" style={{ gap: 6 }}>{(Object.keys(plans.areas) as CareArea[]).map((a) => <button key={a} type="button" className="chip" aria-pressed={area === a} onClick={() => setArea(a)}>{plans.areas[a].label}</button>)}</div>
        </fieldset>
        {area && area !== 'lower-back' && (
          <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="Side">
            {(['left', 'right'] as const).map((x) => <button key={x} type="button" className="chip" aria-pressed={side === x} onClick={() => setSide(x)}>{x === 'left' ? 'Left' : 'Right'}</button>)}
          </div>
        )}
        <button className="btn btn-primary" disabled={!area} onClick={() => updateBody({ care: { area: area!, side, stage: 0, startedAt: t, stageSince: t, checks: [], done: [] } })}>Start the care plan</button>
      </section>
      {safety}
    </div>
  );

  const ap = plans.areas[care.area];
  const stage = plans.stages[care.stage];
  const exercises: CareExercise[] = care.physio ?? ap.stages[care.stage] ?? [];
  const doneToday = care.done.includes(t);
  const checked = care.checks.find((c) => c.date === t);
  const advice = physioAdvice(care, t);
  const save = (next: CareState) => updateBody({ care: next });
  const submit = () => {
    if (urgent) { updateBody({ redFlagAt: new Date().toISOString() }); setResult(URGENT); return; }
    const r = applyCheck(care, { date: t, morning, during, sharp: sharp || undefined, limping: limping || undefined }, plans);
    save(r.state);
    // The same check is a Body check-in: running follows the one rule set (0–2 easy, 3–5 cross-train, 6+ rest)
    const pain = Math.max(morning, during ?? 0);
    addBodyCheckin({ area: BODY_AREA[care.area], side: care.side, pain, when: [], onset: 'gradual', trend: undefined, signs: limping ? ['limping'] : [] });
    const rule = painRule({ id: '', at: '', area: BODY_AREA[care.area], side: care.side, pain, when: [], onset: 'gradual', signs: [], redFlags: [] });
    setResult(`${r.message} Running: ${rule.short}`);
  };
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title={`${ap.label} care plan`} eyebrow={`${care.side ? `${care.side === 'left' ? 'Left' : 'Right'} · ` : ''}started ${longDate(parseYmd(care.startedAt))}`} back />
      {result === URGENT && <section className="card stack-sm care-urgent" role="alert"><p className="label row" style={{ gap: 8 }}><HeartPulse size={18} aria-hidden="true" />Stop all exercise</p><p>{URGENT}</p></section>}
      <section className="card stack" aria-labelledby="care-stage">
        <div className="care-stage" role="list" aria-label="Stages">
          {plans.stages.map((s, i) => <span key={s.name} role="listitem" className={i === care.stage ? 'now' : i < care.stage ? 'done' : undefined} aria-current={i === care.stage ? 'step' : undefined}>{s.name}</span>)}
        </div>
        <h2 id="care-stage" className="title">Stage {care.stage + 1}: {stage.name}</h2>
        <p>{stage.goal}</p>
        <p className="caption">For now: {ap.avoid}</p>
      </section>

      <section className="card stack" aria-labelledby="care-ex">
        <div className="row-between"><h2 id="care-ex" className="title">{care.physio ? "Your physio's exercises" : 'Exercises'}</h2>{doneToday && <span className="tag tag-accent"><Check size={14} aria-hidden="true" />Done today</span>}</div>
        <ul className="list">{exercises.map((e) => (
          <li key={e.name} className="list-item stack-sm" style={{ alignItems: 'flex-start' }}>
            <span className="label">{e.name}</span>
            <span className="caption">{e.dose} · {e.frequency}</span>
            {e.cues.length > 0 && <span className="caption">{e.cues.join('. ')}.</span>}
          </li>
        ))}</ul>
        <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => save({ ...care, done: doneToday ? care.done.filter((d) => d !== t) : [...care.done, t] })}>{doneToday ? 'Not done after all' : 'Done today'}</button>
        <p className="caption">Stop any exercise that pushes the pain above 3/10.</p>
      </section>

      <section className="card stack" aria-labelledby="care-check">
        <h2 id="care-check" className="title">Pain check</h2>
        {checked && !result ? <p>This morning: {checked.morning}/10{checked.during != null ? `, during the exercises ${checked.during}/10` : ''}. Next check tomorrow morning.</p> : (
          <>
            <label htmlFor="care-morning">This morning, 0 to 10: <span className="stat">{morning}</span></label>
            <input id="care-morning" type="range" min={0} max={10} value={morning} onChange={(e) => setMorning(Number(e.target.value))} style={{ minHeight: 44, accentColor: 'var(--brand)' }} />
            <label htmlFor="care-during">During yesterday's exercises (optional): <span className="stat">{during ?? '–'}</span></label>
            <input id="care-during" type="range" min={0} max={10} value={during ?? 0} onChange={(e) => setDuring(Number(e.target.value))} style={{ minHeight: 44, accentColor: 'var(--brand)' }} />
            <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={sharp} onChange={(e) => setSharp(e.target.checked)} /> The pain is sharp</label>
            <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={limping} onChange={(e) => setLimping(e.target.checked)} /> It makes me limp</label>
            <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Chest pain, dizziness or fainting</label>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={submit}>Save the check</button>
            <p className="caption">0–2: move forward · 3–5: stay at this stage · 6 or more: step back and rest that area.</p>
          </>
        )}
        {result && result !== URGENT && <div role="status"><StatusLine kind="info">{result}</StatusLine><p className="caption"><Link to="/">See the change on Training</Link> (you can undo it there).</p></div>}
        {advice && <p className="row caption" style={{ gap: 8, color: 'var(--ink)' }}><AlertTriangle size={16} aria-hidden="true" style={{ flex: 'none' }} />{advice}</p>}
        {care.checks.length > 0 && <p className="caption">Recent checks: {care.checks.slice(-7).map((c) => `${parseYmd(c.date).getDate()}/${parseYmd(c.date).getMonth() + 1} ${Math.max(c.morning, c.during ?? 0)}`).join(' · ')}</p>}
      </section>

      <section className="card stack" aria-labelledby="care-physio">
        <h2 id="care-physio" className="title">Your physio's programme</h2>
        {physioText == null ? (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-small" onClick={() => setPhysioText((care.physio ?? []).map((e) => `${e.name} | ${e.dose} | ${e.frequency}`).join('\n'))}>{care.physio ? 'Edit it' : 'Use my physio\'s programme instead'}</button>
            {care.physio && <button className="btn btn-small btn-ghost" onClick={() => save({ ...care, physio: undefined })}>Back to Ritmo's exercises</button>}
          </div>
        ) : (
          <>
            <label htmlFor="physio" className="label">One exercise a line: name | sets and reps | how often</label>
            <textarea id="physio" className="input" rows={5} value={physioText} onChange={(e) => setPhysioText(e.target.value)} placeholder={'Calf raises | 3 x 15 | every day\nHeel drops | 3 x 15 | every other day'} />
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-small" onClick={() => { const list = physioText.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([name, dose, frequency]) => ({ name, dose: dose || 'as advised', frequency: frequency || 'as advised', cues: [] })); save({ ...care, physio: list.length ? list : undefined }); setPhysioText(undefined); }}>Save</button>
              <button className="btn btn-small btn-ghost" onClick={() => setPhysioText(undefined)}>Cancel</button>
            </div>
          </>
        )}
        <p className="caption">Ritmo shows these each day and tracks when you do them, instead of its own exercises.</p>
      </section>

      {safety}
      <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => updateBody({ care: undefined })}>Stop the care plan</button>
    </div>
  );
}
