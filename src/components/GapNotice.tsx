// A GPS gap on a run recorded in Ritmo (update 3, §3): "GPS paused for 6 min, your phone was locked 18:12–18:18".
// The gap is left out of distance and pace; the runner can add the km they ran by hand, or keep the run as is.
import { useState } from 'react';
import { MapPinOff } from 'lucide-react';
import { useApp } from '../app/AppContext';
import type { Activity } from '../lib/types';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function GapNotice({ run }: { run: Activity }) {
  const { resolveGap, data } = useApp();
  const U = data.profile.units;
  const [adding, setAdding] = useState<number>();
  const [value, setValue] = useState('');
  const open = (run.gpsGaps ?? []).map((g, i) => ({ g, i })).filter((x) => !x.g.resolved);
  const added = (run.gpsGaps ?? []).filter((g) => g.resolved === 'added');
  if (!open.length && !added.length) return null;
  const unitM = U === 'km' ? 1000 : 1609.344;
  return (
    <section className="card stack-sm gap-notice" aria-label="GPS gaps">
      {open.map(({ g, i }) => {
        const min = Math.max(1, Math.round((new Date(g.to).getTime() - new Date(g.from).getTime()) / 60000));
        return (
          <div key={i} className="stack-sm">
            <p className="label row" style={{ gap: 8 }}><MapPinOff size={18} strokeWidth={2} aria-hidden="true" />GPS paused for {min} min, your phone was locked {hm(g.from)}–{hm(g.to)}</p>
            <p className="caption">Ritmo left the gap out of your distance and pace instead of guessing a straight line. It shows as a dashed line on the map.</p>
            {adding === i ? (
              <form className="row wrap" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); const n = Number(value.replace(',', '.')); if (n > 0 && n < 100) { resolveGap(run.id, i, n * unitM); setAdding(undefined); setValue(''); } }}>
                <label className="sr-only" htmlFor={`gap-km-${i}`}>Distance run during the gap, in {U}</label>
                <input id={`gap-km-${i}`} className="input" inputMode="decimal" placeholder={`e.g. 1.2 ${U}`} value={value} onChange={(e) => setValue(e.target.value)} style={{ maxWidth: 140 }} autoFocus />
                <button className="btn btn-primary btn-small" type="submit">Add</button>
                <button className="btn btn-ghost btn-small" type="button" onClick={() => setAdding(undefined)}>Cancel</button>
              </form>
            ) : (
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn btn-small" onClick={() => setAdding(i)}>Add the missing {U}</button>
                <button className="btn btn-ghost btn-small" onClick={() => resolveGap(run.id, i)}>Keep as is</button>
              </div>
            )}
          </div>
        );
      })}
      {added.map((g, i) => <p key={`a${i}`} className="caption">Added by you for the GPS gap {hm(g.from)}–{hm(g.to)}: {((g.addedM ?? 0) / unitM).toFixed(2)} {U}.</p>)}
    </section>
  );
}
