// Run page › Intervals (update 2, §2): the run split automatically (workout steps, laps, entered reps, reps found
// in the pace stream, or 1 km splits), a summary with a bar per rep, filters and a table. Tap a row for its details.
import { Fragment, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Intervals, Segment, SegmentKind } from '../training/intervals';
import { segTime } from '../training/intervals';
import { pace as fmtPace } from '../lib/format';

type Units = 'km' | 'mi';
type Filter = 'all' | SegmentKind;
const TYPE: Record<SegmentKind, string> = { warmup: 'Warm up', run: 'Run', recovery: 'Recovery', cooldown: 'Cool down', split: 'Split' };
const DOT: Record<SegmentKind, string> = { warmup: 'z1', run: 'z5', recovery: 'z1', cooldown: 'z1', split: 'z2' };

export function RunIntervals({ iv, units }: { iv: Intervals; units: Units }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number>();
  const P = (s?: number) => (s ? fmtPace(s, units, false) : '–');
  const toU = (m: number) => (units === 'mi' ? m / 1609.344 : m / 1000);
  if (iv.method === 'none') return <p className="muted">{iv.footnote}</p>;
  const reps = iv.reps;
  const s = iv.summary;
  const shown = iv.segments.filter((x) => filter === 'all' || x.kind === filter);
  const kinds = [...new Set(iv.segments.map((x) => x.kind))];
  const paces = reps.map((r) => r.paceS).filter((x): x is number => !!x);
  const slow = Math.max(...paces, 0), fast = Math.min(...paces, Infinity);

  return (
    <div className="stack">
      {reps.length > 0 && s && (
        <section className="card stack-sm" aria-labelledby="iv-title">
          <div className="row-between" style={{ alignItems: 'baseline' }}><h2 id="iv-title" className="label">{iv.title}</h2><span className="caption">{iv.caption}</span></div>
          <div className="iv-stats">
            {s.avgRepPaceS ? <div><span className="stat">{P(s.avgRepPaceS)}</span><span className="caption">Avg rep pace</span></div> : null}
            <div><span className="stat">{s.avgRepTimeS >= 90 || !s.avgRepDistM ? segTime(s.avgRepTimeS) : segTime(s.avgRepTimeS)}</span><span className="caption">Avg rep time</span></div>
            {s.avgRecoveryS ? <div><span className="stat">{segTime(s.avgRecoveryS)}</span><span className="caption">Avg recovery</span></div> : null}
          </div>
          {paces.length >= 2 && (
            <div className="iv-bars" role="img" aria-label={reps.map((r) => `Rep ${r.n} ${P(r.paceS)}`).join(', ')}>
              {reps.map((r) => {
                const h = r.paceS ? 40 + 60 * (slow === fast ? 1 : (slow - r.paceS) / (slow - fast)) : 20;
                return <div key={r.n} className="iv-bar-col"><span className="iv-bar-pace">{P(r.paceS)}</span><span className="iv-bar" style={{ height: `${h}%` }} /><span className="iv-bar-n">{r.n}</span></div>;
              })}
            </div>
          )}
          {s.note && <p className={`row caption iv-note${s.ok ? ' ok' : ' warn'}`} style={{ gap: 6 }}>{s.ok ? <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" /> : <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />}{s.note}</p>}
        </section>
      )}
      {kinds.length > 1 && (
        <div className="row wrap" role="group" aria-label="Show" style={{ gap: 8 }}>
          {(['all', ...(['warmup', 'run', 'recovery', 'cooldown'] as SegmentKind[]).filter((k) => kinds.includes(k))] as Filter[]).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : TYPE[f as SegmentKind]}</button>
          ))}
        </div>
      )}
      <div className="table-scroll">
        <table className="data iv-table">
          <caption className="sr-only">{iv.title}{iv.caption ? `, ${iv.caption}` : ''}</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Type</th><th scope="col">Time</th><th scope="col">{units}</th><th scope="col">/{units}</th></tr></thead>
          <tbody>
            {shown.map((x, k) => {
              const key = x.startS * 10 + k;
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <tr className={`iv-row iv-${x.kind}`} aria-expanded={isOpen} tabIndex={0} onClick={() => setOpen(isOpen ? undefined : key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? undefined : key); } }}>
                    <td>{x.n ?? ''}</td>
                    <td><span className="row" style={{ gap: 6 }}><span className={`zone-dot ${DOT[x.kind]}`} aria-hidden="true" />{TYPE[x.kind]}</span></td>
                    <td>{segTime(x.timeS)}</td>
                    <td>{x.distanceM ? toU(x.distanceM).toFixed(2) : '–'}</td>
                    <td>{P(x.paceS)}</td>
                  </tr>
                  {isOpen && <tr className="iv-detail"><td colSpan={5}><Detail x={x} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="caption">{iv.footnote} Tap a row for heart rate, cadence and elevation.</p>
    </div>
  );
}

function Detail({ x }: { x: Segment }) {
  const items = [x.avgHr ? `Avg HR ${x.avgHr}` : '', x.maxHr ? `Max HR ${x.maxHr}` : '', x.cadence ? `Cadence ${x.cadence} spm` : '', x.elevChangeM != null ? `Elevation ${x.elevChangeM > 0 ? '+' : ''}${x.elevChangeM} m` : ''].filter(Boolean);
  return <span className="caption">{items.length ? items.join(' · ') : 'No heart rate, cadence or elevation for this part.'}</span>;
}
