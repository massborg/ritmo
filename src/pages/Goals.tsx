import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { DAY_NAMES, DAY_SHORT, distanceLabel, shortDate, parseYmd } from '../lib/format';
import type { Injury } from '../lib/types';

export default function Goals() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const setup = params.get('setup') === '1';
  const { data, updateProfile, buildMyPlan } = useApp();
  const p = data.profile;
  const [goal, setGoal] = useState(p.goal);
  const [days, setDays] = useState<number[]>(p.daysAvailable);
  const [longDay, setLongDay] = useState(p.longRunDay);
  const [injuries, setInjuries] = useState<Injury[]>(p.injuries);
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<Injury['status']>('current');

  const save = () => {
    updateProfile({ goal, daysAvailable: [...days].sort(), longRunDay: days.includes(longDay) ? longDay : days[days.length - 1], injuries, onboarded: true });
    if (setup) { setTimeout(buildMyPlan, 0); nav('/'); } else nav(-1);
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      {setup && <p className="caption">Step 3 of 3</p>}
      <AppHeader title="Goals" eyebrow="Goals, races and availability" back={!setup} />

      <section className="card stack">
        <div className="field"><label htmlFor="goal">What are you training for?</label><input id="goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="For example, my first 10K, or a marathon under 3:30" /></div>
        <div className="stack-sm">
          <span className="label">Target races</span>
          {data.races.length ? <ul className="bullets">{data.races.map((r) => <li key={r.id}>{r.name}, {distanceLabel(r.distanceM)}, {shortDate(parseYmd(r.date))} ({r.priority})</li>)}</ul> : <p className="caption">No races yet.</p>}
          <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/race/new')}><Plus size={18} strokeWidth={2} aria-hidden="true" />Add a race</button>
        </div>
      </section>

      <section className="card stack">
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Which days can you train?</legend>
          <div className="row wrap">{DAY_SHORT.map((d, i) => <button type="button" key={d} className="chip" aria-pressed={days.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{d}</button>)}</div>
          <p className="caption">{days.length} days a week. Three to five suits most runners.</p>
        </fieldset>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Long-run day</legend>
          <div className="row wrap">{days.sort().map((i) => <button type="button" key={i} className="chip" aria-pressed={longDay === i} onClick={() => setLongDay(i)}>{DAY_NAMES[i]}</button>)}</div>
        </fieldset>
      </section>

      <section className="card stack">
        <span className="label">Current or past injuries</span>
        <p className="caption">Ritmo uses this to be more careful with load. It is not a diagnosis.</p>
        <ul className="list">{injuries.map((inj, i) => (
          <li key={i} className="list-item row-between"><span>{inj.area} <span className="caption">({inj.status})</span></span><button className="icon-btn" aria-label={`Remove ${inj.area}`} onClick={() => setInjuries((x) => x.filter((_, j) => j !== i))}><X size={18} strokeWidth={2} /></button></li>
        ))}</ul>
        <div className="row wrap">
          <input aria-label="Injury area" className="input" style={{ flex: 1, minWidth: 180 }} placeholder="For example, right knee" value={area} onChange={(e) => setArea(e.target.value)} />
          <div className="segmented" role="group" aria-label="Injury status">
            <button type="button" aria-pressed={status === 'current'} onClick={() => setStatus('current')}>Current</button>
            <button type="button" aria-pressed={status === 'past'} onClick={() => setStatus('past')}>Past</button>
          </div>
          <button className="btn btn-small" type="button" disabled={!area.trim()} onClick={() => { setInjuries((x) => [...x, { area: area.trim(), status }]); setArea(''); }}>Add</button>
        </div>
        {injuries.some((i) => i.status === 'current') && <p className="caption">With a current injury, please check with a physio or doctor before increasing training.</p>}
      </section>

      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={save} disabled={!days.length}>{setup ? 'Build my plan' : 'Save'}</button>
    </div>
  );
}
