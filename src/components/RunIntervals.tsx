// Run page › Intervals (update 2, §2): the run split automatically (workout steps, laps, entered reps, reps found
// in the pace stream, or 1 km splits), a summary with a bar per rep, filters and a table. Tap a row for its details.
import { Fragment, useState } from 'react';
import { AlertTriangle, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { Sheet } from './inputs';
import type { Intervals, Segment, SegmentKind } from '../training/intervals';
import { segKey, segTime } from '../training/intervals';
import { pace as fmtPace } from '../lib/format';

type Units = 'km' | 'mi';
type Filter = 'all' | SegmentKind;
const TYPE: Record<SegmentKind, string> = { warmup: 'Warm up', run: 'Interval', recovery: 'Recovery', cooldown: 'Cool down', split: 'Split', stride: 'Stride' };
const DOT: Record<SegmentKind, string> = { warmup: 'z1', run: 'z5', recovery: 'z1', cooldown: 'z1', split: 'z2', stride: 'z4' };
type Mark = 'warmup' | 'stride' | 'run' | 'recovery' | 'cooldown';
const MARKS: { kind: Mark; label: string }[] = [{ kind: 'warmup', label: 'Warm-up' }, { kind: 'stride', label: 'Stride' }, { kind: 'run', label: 'Interval' }, { kind: 'recovery', label: 'Recovery' }, { kind: 'cooldown', label: 'Cool-down' }];

/** `onMark`: the runner marks a part by hand (undefined: back to automatic); Ritmo keeps it with the run */
export function RunIntervals({ iv, units, onMark }: { iv: Intervals; units: Units; onMark?: (key: string, kind: Mark | undefined, part: { timeS: number; distanceM: number; was: string }) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number>();
  const [marking, setMarking] = useState<Segment>();
  const [stridesOpen, setStridesOpen] = useState(false);
  const P = (s?: number) => (s ? fmtPace(s, units, false) : '–');
  const toU = (m: number) => (units === 'mi' ? m / 1609.344 : m / 1000);
  if (iv.method === 'none') return <p className="muted">{iv.footnote}</p>;
  const reps = iv.reps;
  // The summary card shows the interval set; for an easy run with strides it shows the strides
  const card = reps.length ? reps : iv.strides?.reps ?? [];
  const s = iv.summary;
  const shown = iv.segments.filter((x) => filter === 'all' || x.kind === filter);
  const kinds = [...new Set(iv.segments.map((x) => x.kind))];
  const paces = card.map((r) => r.paceS).filter((x): x is number => !!x);
  const slow = Math.max(...paces, 0), fast = Math.min(...paces, Infinity);

  return (
    <div className="stack">
      {card.length > 0 && s && (
        <section className="card stack-sm" aria-labelledby="iv-title">
          <div className="row-between" style={{ alignItems: 'baseline' }}><h2 id="iv-title" className="label">{iv.title}</h2><span className="caption">{iv.caption}</span></div>
          <div className="iv-stats">
            {s.avgRepPaceS ? <div><span className="stat">{P(s.avgRepPaceS)}</span><span className="caption">Avg rep pace</span></div> : null}
            <div><span className="stat">{s.avgRepTimeS >= 90 || !s.avgRepDistM ? segTime(s.avgRepTimeS) : segTime(s.avgRepTimeS)}</span><span className="caption">Avg rep time</span></div>
            {s.avgRecoveryS ? <div><span className="stat">{segTime(s.avgRecoveryS)}</span><span className="caption">Avg recovery</span></div> : null}
          </div>
          {paces.length >= 2 && (
            <div className="iv-bars" role="img" aria-label={card.map((r) => `Rep ${r.n} ${P(r.paceS)}`).join(', ')}>
              {card.map((r) => {
                const h = r.paceS ? 40 + 60 * (slow === fast ? 1 : (slow - r.paceS) / (slow - fast)) : 20;
                return <div key={r.n} className="iv-bar-col"><span className="iv-bar-pace">{P(r.paceS)}</span><span className="iv-bar" style={{ height: `${h}%` }} /><span className="iv-bar-n">{r.n}</span></div>;
              })}
            </div>
          )}
          {s.note && <p className={`row caption iv-note${s.ok ? ' ok' : ' warn'}`} style={{ gap: 6 }}>{s.ok ? <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" /> : <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />}{s.note}</p>}
        </section>
      )}
      {iv.strides && reps.length > 0 && (
        <section className="card stack-sm strides-group" aria-label="Strides">
          <button type="button" className="row-between strides-head" aria-expanded={stridesOpen} onClick={() => setStridesOpen((x) => !x)}>
            <span className="stack-sm" style={{ gap: 0, textAlign: 'left' }}><span className="status-chip partial" style={{ alignSelf: 'flex-start' }}>Strides ×{iv.strides.reps.length}</span><span className="caption">{iv.strides.line.replace(/^Strides ×\d+ · /, '')}</span></span>
            <span className="stat">{P(median(iv.strides.reps.map((r) => r.paceS).filter((x): x is number => !!x)))}<small>/{units}</small></span>
          </button>
          {stridesOpen && (
            <ol className="strides-list">
              {iv.strides.reps.map((r) => <li key={r.startS} className="row-between"><span className="caption">Stride {r.n}</span><span className="stat">{segTime(r.timeS)} · {P(r.paceS)}/{units}</span></li>)}
            </ol>
          )}
          <p className="caption">{reps.length ? 'Short fast efforts before the main set. They are left out of the interval averages, count and fastest rep.' : 'Short fast efforts with a jog or walk after each.'}</p>
        </section>
      )}
      {kinds.length > 1 && (
        <div className="row wrap" role="group" aria-label="Show" style={{ gap: 8 }}>
          {(['all', ...(['warmup', 'stride', 'run', 'recovery', 'cooldown'] as SegmentKind[]).filter((k) => kinds.includes(k))] as Filter[]).map((f) => (
            <button key={f} type="button" className={`chip${f === 'stride' ? ' chip-strides' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'stride' ? `Strides ${iv.strides?.reps.length ?? ''}` : f === 'run' ? `Intervals ${reps.length}` : f === 'warmup' ? 'Warm-up' : f === 'cooldown' ? 'Cool-down' : TYPE[f as SegmentKind]}
            </button>
          ))}
        </div>
      )}
      <div className="table-scroll">
        <table className="data iv-table">
          <caption className="sr-only">{iv.title}{iv.caption ? `, ${iv.caption}` : ''}</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Type</th><th scope="col">Time</th><th scope="col">{units}</th><th scope="col">/{units}</th>{onMark && <th scope="col"><span className="sr-only">Change</span></th>}</tr></thead>
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
                    {onMark && <td className="iv-mark">{x.kind !== 'split' && <button type="button" className="icon-btn" aria-label={`Mark ${TYPE[x.kind].toLowerCase()}${x.n ? ` ${x.n}` : ''} as something else`} onClick={(e) => { e.stopPropagation(); setMarking(x); }}><MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" /></button>}</td>}
                  </tr>
                  {isOpen && <tr className="iv-detail"><td colSpan={onMark ? 6 : 5}><Detail x={x} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="caption">{iv.footnote} Tap a row for heart rate, cadence and elevation.{onMark && iv.method !== 'splits' ? ' Wrong? Tap ⋯ on a row to mark it as a warm-up, stride, interval, recovery or cool-down.' : ''}</p>
      {onMark && marking && (
        <Sheet open onClose={() => setMarking(undefined)} title={`${TYPE[marking.kind]}${marking.n ? ` ${marking.n}` : ''} · ${segTime(marking.timeS)}`}>
          <p className="caption">Mark this part as:</p>
          <ul className="list">
            {MARKS.map((m) => (
              <li key={m.kind}><button type="button" className="list-item row-between" style={{ width: '100%' }} aria-pressed={marking.kind === m.kind}
                onClick={() => { onMark(segKey(marking), m.kind, { timeS: marking.timeS, distanceM: marking.distanceM, was: marking.kind }); setMarking(undefined); }}>
                <span className="label">{m.label}</span>{marking.kind === m.kind && <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />}
              </button></li>
            ))}
          </ul>
          {marking.byHand && <button type="button" className="btn btn-ghost" onClick={() => { onMark(segKey(marking), undefined, { timeS: marking.timeS, distanceM: marking.distanceM, was: marking.kind }); setMarking(undefined); }}>Back to automatic</button>}
          <p className="caption">Ritmo remembers this for the run, regroups it, and uses your corrections to recognise your strides next time.</p>
        </Sheet>
      )}
    </div>
  );
}

const median = (xs: number[]) => { if (!xs.length) return undefined; const s2 = [...xs].sort((a, b) => a - b); return s2[s2.length >> 1]; };

function Detail({ x }: { x: Segment }) {
  const items = [x.avgHr ? `Avg HR ${x.avgHr}` : '', x.maxHr ? `Max HR ${x.maxHr}` : '', x.cadence ? `Cadence ${x.cadence} spm` : '', x.elevChangeM != null ? `Elevation ${x.elevChangeM > 0 ? '+' : ''}${x.elevChangeM} m` : ''].filter(Boolean);
  return <span className="caption">{items.length ? items.join(' · ') : 'No heart rate, cadence or elevation for this part.'}</span>;
}
