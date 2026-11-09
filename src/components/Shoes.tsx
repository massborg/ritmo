// Shoe mileage: runs are assigned to shoes by session type (fast shoes for intervals and races, long-run shoes for
// long runs, everyday trainers for the rest) unless the runner chose one on the run page, with alerts from 100 km
// before the retirement distance.
import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { ShoeFinder, ShoeImage, ShoePhotoButton } from './ShoeFinder';
import { removeShoePhoto } from '../data/shoe-photo';
import { StatusLine } from './ui';
import { shortDate, parseYmd, ymd } from '../lib/format';
import type { Shoe } from '../lib/types';
import { SHOE_USE, shoeAlert, shoeTotals } from '../training/shoes';

export function Shoes() {
  const { data, updateProfile, typeOf } = useApp();
  const shoes = useMemo(() => data.profile.shoes ?? [], [data.profile.shoes]);
  const totals = useMemo(() => shoeTotals(data.activities, shoes, typeOf), [data.activities, shoes, typeOf]);
  const [adding, setAdding] = useState(false);
  const save = (list: Shoe[]) => updateProfile({ shoes: list });
  if (data.mode === 'sample') return null;
  return (
    <section className="card stack" aria-labelledby="shoes" id="shoes-card">
      <div className="row-between"><h2 id="shoes" className="title">Shoes</h2><button className="btn btn-small" onClick={() => setAdding(true)}>Add shoes</button></div>
      {!shoes.length && !adding && <p className="caption">Add your shoes and Ritmo counts the distance, so you know when they are worn out. Most running shoes last 500 to 800 km.</p>}
      {shoes.length > 0 && <p className="caption">Runs are assigned automatically: fast shoes for intervals, tempo runs and races, long-run shoes for long runs, everyday shoes for the rest. Change a run's shoes on its page.</p>}
      <ul className="list">{shoes.map((s) => {
        const km = totals.get(s.id) ?? s.startKm;
        const alert = shoeAlert(s, km);
        const near = !!alert;
        return (
          <li key={s.id} className="list-item stack-sm">
            <div className="row-between" style={{ gap: 'var(--s3)' }}>
              <span className="row" style={{ gap: 'var(--s3)', minWidth: 0 }}>
                <ShoeImage shoe={s} size={64} />
                <span className="stack-sm" style={{ gap: 0, minWidth: 0 }}><span className="label">{s.name}{s.retired ? ' (retired)' : ''}</span><span className="caption">{SHOE_USE[s.use ?? 'everyday']}</span></span>
              </span>
              <span className="stat" style={{ whiteSpace: 'nowrap' }}>{Math.round(km)} / {s.retireKm} km</span>
            </div>
            <div className="progress" role="progressbar" aria-label={`${s.name} distance`} aria-valuemin={0} aria-valuemax={s.retireKm} aria-valuenow={Math.round(km)}><span style={{ width: `${Math.min(100, (km / s.retireKm) * 100)}%`, background: near ? 'var(--warning)' : undefined }} /></div>
            <div className="row-between"><span className="caption">Since {shortDate(parseYmd(s.startDate))}</span>
              <button className="btn btn-ghost btn-small" onClick={() => save(shoes.map((x) => (x.id === s.id ? { ...x, retired: !x.retired, retiredAt: x.retired ? undefined : ymd(new Date()) } : x)))}>{s.retired ? 'Use again' : 'Retire'}</button></div>
            <div className="row wrap" style={{ gap: 8 }}>
              <ShoePhotoButton shoeId={s.id} label={s.photo ? 'Change photo' : 'Add a photo of your pair'} onDone={(p) => save(shoes.map((x) => (x.id === s.id ? { ...x, photo: p } : x)))} />
              {s.photo && <button className="btn btn-ghost btn-small" onClick={() => { void removeShoePhoto(s.photo!); save(shoes.map((x) => (x.id === s.id ? { ...x, photo: undefined } : x))); }}>Remove photo</button>}
            </div>
            {near && <StatusLine kind="warning">{alert === 'retire' ? `Time for new shoes: ${s.name} have done ${Math.round(km)} km.` : `Nearly worn out: about ${Math.max(0, Math.round(s.retireKm - km))} km left. Think about new shoes soon.`}</StatusLine>}
          </li>
        );
      })}</ul>
      <ShoeFinder open={adding} onClose={() => setAdding(false)} onSave={(sh) => save([...shoes, sh])} />
    </section>
  );
}
