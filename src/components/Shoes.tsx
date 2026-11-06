// Shoe mileage: runs since a shoe was added count towards it, with a reminder near its retirement distance.
import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { DateField, Stepper } from './inputs';
import { StatusLine } from './ui';
import { shortDate, parseYmd, uid, ymd } from '../lib/format';
import type { Shoe } from '../lib/types';

export function shoeKm(shoe: Shoe, shoes: Shoe[], runs: { startTime: string; distanceM: number }[]): number {
  // Each run counts for the newest active shoe that was in use on that day
  const later = shoes.filter((s) => !s.retired && s.startDate > shoe.startDate).map((s) => s.startDate).sort()[0];
  return shoe.startKm + runs.filter((a) => { const d = a.startTime.slice(0, 10); return d >= shoe.startDate && (!later || d < later); }).reduce((x, a) => x + a.distanceM / 1000, 0);
}

export function Shoes() {
  const { data, updateProfile } = useApp();
  const shoes = data.profile.shoes ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState(ymd(new Date()));
  const [startKm, setStartKm] = useState<number | undefined>(0);
  const [retire, setRetire] = useState<number | undefined>(700);
  const save = (list: Shoe[]) => updateProfile({ shoes: list });
  if (data.mode === 'sample') return null;
  return (
    <section className="card stack" aria-labelledby="shoes">
      <div className="row-between"><h2 id="shoes" className="title">Shoes</h2>{!adding && <button className="btn btn-small" onClick={() => setAdding(true)}>Add shoes</button>}</div>
      {!shoes.length && !adding && <p className="caption">Add your shoes and Ritmo counts the distance, so you know when they are worn out. Most running shoes last 500 to 800 km.</p>}
      <ul className="list">{shoes.map((s) => {
        const km = shoeKm(s, shoes, data.activities);
        const near = !s.retired && km >= s.retireKm * 0.9;
        return (
          <li key={s.id} className="list-item stack-sm">
            <div className="row-between"><span className="label">{s.name}{s.retired ? ' (retired)' : ''}</span><span className="stat">{Math.round(km)} / {s.retireKm} km</span></div>
            <div className="progress" role="progressbar" aria-label={`${s.name} distance`} aria-valuemin={0} aria-valuemax={s.retireKm} aria-valuenow={Math.round(km)}><span style={{ width: `${Math.min(100, (km / s.retireKm) * 100)}%`, background: near ? 'var(--warning)' : undefined }} /></div>
            <div className="row-between"><span className="caption">Since {shortDate(parseYmd(s.startDate))}</span>
              <button className="btn btn-ghost btn-small" onClick={() => save(shoes.map((x) => (x.id === s.id ? { ...x, retired: !x.retired } : x)))}>{s.retired ? 'Use again' : 'Retire'}</button></div>
            {near && <StatusLine kind="warning">{km >= s.retireKm ? 'Time for new shoes.' : 'Nearly worn out: think about new shoes soon.'}</StatusLine>}
          </li>
        );
      })}</ul>
      {adding && (
        <div className="stack">
          <div className="field"><label htmlFor="sh-name">Name</label><input id="sh-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, daily trainers" /></div>
          <DateField id="sh-date" label="First run in them" value={start} onChange={setStart} />
          <div className="grid-2">
            <Stepper id="sh-km" label="Distance already (km)" value={startKm} onChange={setStartKm} min={0} max={2000} step={10} unit="km" />
            <Stepper id="sh-ret" label="Retire at (km)" value={retire} onChange={setRetire} min={100} max={2000} step={50} unit="km" />
          </div>
          <div className="row"><button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={() => { save([...shoes, { id: uid(), name: name.trim(), startDate: start, startKm: startKm ?? 0, retireKm: retire ?? 700 }]); setAdding(false); setName(''); }}>Save shoes</button></div>
        </div>
      )}
    </section>
  );
}
