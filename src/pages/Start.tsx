import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Chips } from '../components/inputs';
import { StatusLine } from '../components/ui';
import { DAY_NAMES, DAY_SHORT } from '../lib/format';
import type { Injury } from '../lib/types';
import { pickStarterDays } from '../training/plan';

const GOALS = ['Run 5K without stopping', 'My first 10K', 'Run regularly and get fitter'];

export default function Start() {
  const nav = useNavigate();
  const { startBeginner } = useApp();
  const [canRun10, setCanRun10] = useState<'yes' | 'no' | ''>('');
  const [walks, setWalks] = useState<'yes' | 'no' | ''>('');
  const [goal, setGoal] = useState(GOALS[0]);
  const [custom, setCustom] = useState('');
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [area, setArea] = useState('');
  const [err, setErr] = useState('');
  const training = pickStarterDays(days);

  return (
    <div className="stack-lg" style={{ maxWidth: 640, margin: '0 auto' }}>
      <AppHeader title="New to running" eyebrow="A few quick questions so your plan fits you" back />

      <section className="card stack">
        <Chips label="Can you run for 10 minutes without stopping?" value={canRun10} onChange={setCanRun10} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not yet' }]} />
        <Chips label="Do you walk regularly, for example 30 minutes most days?" value={walks} onChange={setWalks} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not really' }]} />
      </section>

      <section className="card stack">
        <Chips label="What is your goal?" value={goal} onChange={setGoal} options={[...GOALS.map((g) => ({ value: g, label: g })), { value: 'custom', label: 'Something else' }]} />
        {goal === 'custom' && <div className="field"><label htmlFor="goal">Your goal</label><input id="goal" className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="For example, run with my daughter at parkrun" /></div>}
      </section>

      <section className="card stack">
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Which days could you train?</legend>
          <div className="row wrap">{DAY_SHORT.map((d, i) => <button type="button" key={d} className="chip" aria-pressed={days.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i].sort()))}>{d}</button>)}</div>
          {days.length >= 2
            ? <p className="caption">Your plan will use {training.map((d) => DAY_NAMES[d]).join(', ').replace(/, ([^,]*)$/, ' and $1')}, with rest days in between.</p>
            : <p className="caption">Choose at least two days, ideally three with a day between each.</p>}
        </fieldset>
      </section>

      <section className="card stack">
        <span className="label">Any current or past injuries?</span>
        <p className="caption">Optional. Ritmo uses this to be more careful. It is not a diagnosis.</p>
        {injuries.map((inj, i) => (
          <div key={i} className="row-between"><span>{inj.area} <span className="caption">({inj.status})</span></span><button className="icon-btn" aria-label={`Remove ${inj.area}`} onClick={() => setInjuries((x) => x.filter((_, j) => j !== i))}><X size={18} strokeWidth={2} /></button></div>
        ))}
        <div className="row wrap">
          <input aria-label="Injury area" className="input" style={{ flex: 1, minWidth: 160 }} placeholder="For example, left knee" value={area} onChange={(e) => setArea(e.target.value)} />
          <button className="btn btn-small" type="button" disabled={!area.trim()} onClick={() => { setInjuries((x) => [...x, { area: area.trim(), status: 'current' }]); setArea(''); }}>Add</button>
        </div>
        {injuries.length > 0 && <StatusLine kind="info">With a current injury, check with a physio or doctor before you start running.</StatusLine>}
      </section>

      {err && <div role="alert"><StatusLine kind="danger">{err}</StatusLine></div>}
      <button className="btn btn-primary btn-block" onClick={() => {
        if (!canRun10 || !walks) { setErr('Please answer the first two questions.'); return; }
        if (days.length < 2) { setErr('Choose at least two days you could train.'); return; }
        if (goal === 'custom' && !custom.trim()) { setErr('Tell us your goal, or pick one of the options.'); return; }
        startBeginner({ canRun10: canRun10 === 'yes', walksRegularly: walks === 'yes', goal: goal === 'custom' ? custom.trim() : goal, days, injuries });
        try { localStorage.setItem('ritmo:welcomed', '1'); } catch { /* ignore */ }
        nav('/', { replace: true });
      }}>Build my starter plan</button>
      <p className="caption" style={{ textAlign: 'center' }}>Ritmo gives coaching guidance, not medical advice. If you have a heart condition, chest pain or dizziness when active, check with a doctor before starting.</p>
    </div>
  );
}
