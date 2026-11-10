// Run page › Shoes (update 2, §2): the shoe for this run with its wear, switching to another pair, adding shoes,
// and each shoe's default run type (new runs get a shoe automatically by type). Reads the same list as Profile › Shoes.
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Plus } from 'lucide-react';
import { useApp } from '../app/AppContext';
import type { Activity, Shoe } from '../lib/types';
import { SHOE_USE, shoeForRun, shoeTotals } from '../training/shoes';
import { ShoeFinder, ShoeImage } from './ShoeFinder';

const DEFAULT_FOR: Record<NonNullable<Shoe['use']>, string> = { everyday: 'default for easy runs', fast: 'default for intervals, tempo and races', long: 'default for long runs', trail: 'default for trail runs' };
export const LIFE_KM = 700;
const WORN = 0.85;

export function RunShoes({ run }: { run: Activity }) {
  const { data, typeOf, setRunShoe, updateProfile } = useApp();
  const U = data.profile.units;
  const toU = (km: number) => (U === 'mi' ? km / 1.609344 : km);
  const shoes = useMemo(() => data.profile.shoes ?? [], [data.profile.shoes]);
  const km = useMemo(() => shoeTotals(data.activities, shoes, typeOf), [data.activities, shoes, typeOf]);
  const [adding, setAdding] = useState(false);
  const current = shoeForRun(run, typeOf(run), shoes);
  const runKm = run.distanceM / 1000;
  const others = shoes.filter((s) => !s.retired && s.id !== current?.id);
  const fmt = (k: number) => `${Math.round(toU(k))} ${U}`;

  const card = (s: Shoe) => {
    const total = km.get(s.id) ?? s.startKm;
    const life = s.retireKm || LIFE_KM;
    const pct = Math.min(1, total / life);
    return (
      <article className="card stack-sm shoe-run-card" aria-label={`Shoes for this run: ${s.name}`}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <ShoeImage shoe={s} size={56} />
          <div className="stack-sm" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <div className="row-between" style={{ gap: 8 }}><span className="label">{s.name}</span><span className="tag tag-success"><Check size={14} strokeWidth={2} aria-hidden="true" />This run</span></div>
            <span className="caption">{DEFAULT_FOR[s.use ?? 'everyday']}{run.shoeId ? '' : ' · picked automatically'}</span>
          </div>
        </div>
        <div className="row-between" style={{ alignItems: 'baseline' }}><span className="stat shoe-km">{fmt(total)}</span><span className="caption">of about {fmt(life)}</span></div>
        <div className="progress" role="progressbar" aria-label={`${s.name} wear`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}><span style={{ width: `${pct * 100}%`, background: pct >= WORN ? 'var(--warning)' : undefined }} /></div>
        <span className="caption">+{toU(runKm).toFixed(1)} {U} from this run · about {fmt(Math.max(0, life - total))} left</span>
        {pct >= WORN && <span className="caption row" style={{ gap: 6, color: 'var(--warning)' }}><AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />Nearly worn out</span>}
      </article>
    );
  };

  return (
    <div className="stack">
      <span className="caption">Shoes for this run</span>
      {current ? card(current) : <p className="muted">No shoes yet. Add your shoes and Ritmo counts the distance on each pair, so you know when they are worn out.</p>}
      {others.length > 0 && (
        <section className="stack-sm" aria-labelledby="change-shoe">
          <h2 id="change-shoe" className="caption">Change shoe</h2>
          <ul className="list stack-sm">{others.map((s) => {
            const total = km.get(s.id) ?? s.startKm;
            const worn = total >= (s.retireKm || LIFE_KM) * WORN;
            return (
              <li key={s.id} className="card row shoe-row" style={{ gap: 12 }}>
                {worn ? <span className="shoe-warn" aria-hidden="true"><AlertTriangle size={20} strokeWidth={2} /></span> : <ShoeImage shoe={s} size={44} />}
                <div className="stack-sm" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <span className="label">{s.name}</span>
                  <span className="caption" style={worn ? { color: 'var(--warning)' } : undefined}>{fmt(total)}{worn ? ' · nearly worn out' : ` · ${DEFAULT_FOR[s.use ?? 'everyday']}`}</span>
                </div>
                <button className="btn btn-small" onClick={() => setRunShoe(run.id, s.id)} aria-label={`Use ${s.name} for this run`}>Use</button>
              </li>
            );
          })}</ul>
        </section>
      )}
      {run.shoeId && <button className="link-btn caption" style={{ alignSelf: 'flex-start' }} onClick={() => setRunShoe(run.id, undefined)}>Pick automatically by run type</button>}
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus size={18} strokeWidth={2} aria-hidden="true" />Add shoes</button>
      {current && (
        <div className="field">
          <label htmlFor="shoe-default">Make {current.name} the default for</label>
          <select id="shoe-default" className="input" value={current.use ?? 'everyday'} onChange={(e) => updateProfile({ shoes: shoes.map((x) => (x.id === current.id ? { ...x, use: e.target.value as Shoe['use'] } : x)) })}>
            {(Object.keys(SHOE_USE) as NonNullable<Shoe['use']>[]).map((u) => <option key={u} value={u}>{u === 'everyday' ? 'Easy runs' : u === 'fast' ? 'Intervals, tempo and races' : u === 'long' ? 'Long runs' : 'Trail runs'}</option>)}
          </select>
        </div>
      )}
      <p className="caption">Set a default shoe for each kind of run and Ritmo picks it automatically. Most running shoes last 500 to 800 km. Retired shoes stay in Profile › Shoes with their history.</p>
      <ShoeFinder open={adding} onClose={() => setAdding(false)} onSave={(sh) => { updateProfile({ shoes: [...shoes, sh] }); setRunShoe(run.id, sh.id); }} />
    </div>
  );
}
