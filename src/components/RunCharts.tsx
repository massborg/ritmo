// Run page › Charts (update 2, §2): pace, heart rate, cadence and elevation on one time axis, reps shaded, and a
// scrub bar that reads all four at the point you drag to (or move to with the arrow keys).
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Activity } from '../lib/types';
type Units = 'km' | 'mi';
import type { Segment } from '../training/intervals';
import { segTime } from '../training/intervals';
import { pace as fmtPace } from '../lib/format';

interface Pt { t: number; d: number; pace?: number; hr?: number; cad?: number; alt?: number }
const W = 340, H = 104, PAD_L = 6, PAD_R = 6, PAD_T = 8, PAD_B = 16;

/** About 300 evenly spaced points with pace smoothed over ~20 s */
function sample(a: Activity): Pt[] {
  const s = a.streams ?? [];
  if (s.length < 10) return [];
  const step = Math.max(1, Math.floor(s.length / 300));
  const out: Pt[] = [];
  let j = 0;
  for (let i = 0; i < s.length; i += step) {
    const p = s[i];
    while (p.t - s[j].t > 20) j++;
    const dd = p.d - s[j].d, dt = p.t - s[j].t;
    out.push({ t: p.t, d: p.d, pace: dd > 5 && dt > 0 ? Math.min(720, dt / (dd / 1000)) : undefined, hr: p.hr, cad: p.cad, alt: p.alt });
  }
  return out;
}

type Key = 'pace' | 'hr' | 'cad' | 'alt';
const CHARTS: { key: Key; title: string; colour: string; unit: string; invert?: boolean }[] = [
  { key: 'pace', title: 'Pace', colour: 'var(--brand)', unit: '', invert: true },
  { key: 'hr', title: 'Heart rate', colour: 'var(--danger)', unit: 'bpm' },
  { key: 'cad', title: 'Cadence', colour: 'var(--info)', unit: 'steps per minute' },
  { key: 'alt', title: 'Elevation', colour: 'var(--zone-2)', unit: 'metres' },
];

export function RunCharts({ a, reps, units, zones }: { a: Activity; reps: Segment[]; units: Units; zones?: { zone: number; min: number; max: number }[] }) {
  const pts = useMemo(() => sample(a), [a]);
  const [i, setI] = useState<number>();
  const [byDist, setByDist] = useState(false);
  const [showZones, setShowZones] = useState(false);
  if (!pts.length) return <p className="muted">This run has no recorded track, so there are no charts. Runs from a watch file, Strava or recorded in Ritmo have them.</p>;
  const P = (spk?: number) => (spk ? fmtPace(spk, units, false) : '–');
  const xs = pts.map((p) => (byDist ? p.d : p.t));
  const x0 = xs[0], x1 = xs[xs.length - 1] || 1;
  const X = (v: number) => PAD_L + ((v - x0) / (x1 - x0 || 1)) * (W - PAD_L - PAD_R);
  const xOfT = (t: number) => { if (!byDist) return X(t); const k = pts.findIndex((p) => p.t >= t); return X(pts[Math.max(0, k)].d); };
  const unitM = units === 'mi' ? 1609.344 : 1000;
  const xLabel = (v: number) => (byDist ? `${(v / unitM).toFixed(v / unitM < 10 ? 1 : 0)}` : segTime(v));
  const cur = i != null ? pts[i] : undefined;
  const repAt = cur ? reps.find((r) => cur.t >= r.startS && cur.t <= r.endS) : undefined;
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const v = x0 + ((vx - PAD_L) / (W - PAD_L - PAD_R)) * (x1 - x0);
    let best = 0;
    for (let k = 0; k < xs.length; k++) if (Math.abs(xs[k] - v) < Math.abs(xs[best] - v)) best = k;
    setI(best);
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { setI((v) => Math.min(pts.length - 1, (v ?? -1) + 3)); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { setI((v) => Math.max(0, (v ?? pts.length) - 3)); e.preventDefault(); }
  };
  const avg = (k: Key) => { const v = pts.map((p) => p[k]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined; };
  const climb = (() => { let up = 0; for (let k = 1; k < pts.length; k++) { const d = (pts[k].alt ?? 0) - (pts[k - 1].alt ?? 0); if (pts[k].alt != null && pts[k - 1].alt != null && d > 0) up += d; } return Math.round(a.elevGainM ?? up); })();

  return (
    <div className="stack run-charts">
      <div className="scrub-bar" role="status" aria-live="polite">
        {cur ? <>{repAt ? <span>Rep {repAt.n}</span> : null}<span>{segTime(cur.t)}</span><strong>{P(cur.pace)} /{units}</strong>{cur.hr ? <strong>{cur.hr} bpm</strong> : null}{cur.cad ? <strong>{cur.cad} spm</strong> : null}</>
          : <span>Drag across a chart to read pace, heart rate and cadence at any point</span>}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="segmented" role="group" aria-label="Chart axis">
          <button type="button" aria-pressed={!byDist} onClick={() => setByDist(false)}>Time</button>
          <button type="button" aria-pressed={byDist} onClick={() => setByDist(true)}>Distance</button>
        </div>
        {zones && pts.some((p) => p.hr) && <label className="row caption" style={{ gap: 6, minHeight: 44 }}><input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />HR zones</label>}
      </div>
      {CHARTS.map((c) => {
        const vals = pts.map((p) => p[c.key]);
        const have = vals.filter((v): v is number => v != null);
        if (have.length < 5) return c.key === 'pace' || c.key === 'hr' ? <p key={c.key} className="caption chart-missing">{c.key === 'hr' ? 'No heart rate recorded' : 'No pace recorded'}</p> : null;
        // Pace: trim slow outliers (stops) so the reps stay readable
        const sorted = [...have].sort((x, y) => x - y);
        const lo = c.key === 'pace' ? sorted[Math.floor(sorted.length * 0.01)] : sorted[0];
        const hi = c.key === 'pace' ? sorted[Math.floor(sorted.length * 0.97)] : sorted[sorted.length - 1];
        const span = hi - lo || 1;
        const Y = (v: number) => { const f = (Math.min(hi, Math.max(lo, v)) - lo) / span; return PAD_T + (c.invert ? f : 1 - f) * (H - PAD_T - PAD_B); };
        const d = vals.map((v, k) => (v == null ? '' : `${k && vals[k - 1] != null ? 'L' : 'M'}${X(xs[k]).toFixed(1)},${Y(v).toFixed(1)}`)).join('');
        const average = avg(c.key);
        const head = c.key === 'pace' ? `avg ${P(a.movingS / (a.distanceM / 1000))}` : c.key === 'alt' ? `${climb} m climb` : average ? `avg ${Math.round(average)}` : '';
        const range = c.key === 'pace' ? `${P(hi)} – ${P(lo)}` : `${Math.round(lo)} – ${Math.round(hi)}`;
        const summary = c.key === 'pace' ? paceSummary(reps, P, a, units) : c.key === 'hr' ? `Heart rate from ${Math.round(lo)} to ${Math.round(hi)} bpm, average ${Math.round(average ?? 0)}.` : c.key === 'cad' ? `Cadence averaged ${Math.round(average ?? 0)} steps per minute.` : `Elevation ${Math.round(lo)} to ${Math.round(hi)} m, ${climb} m of climb.`;
        return (
          <section key={c.key} className="chart-card" aria-label={c.title}>
            <div className="row-between"><span className="label">{c.title}</span><span className="caption mono">{head}</span></div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={summary} tabIndex={0}
              onPointerDown={pick} onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') pick(e); }} onKeyDown={keys} style={{ touchAction: 'pan-y' }}>
              {c.key === 'hr' && showZones && zones?.map((z) => <rect key={z.zone} x={PAD_L} width={W - PAD_L - PAD_R} y={Y(Math.min(hi, z.max))} height={Math.max(0, Y(Math.max(lo, z.min)) - Y(Math.min(hi, z.max)))} fill={`var(--zone-${z.zone})`} opacity="0.12" />)}
              {reps.map((r) => <rect key={r.startS} x={xOfT(r.startS)} width={Math.max(2, xOfT(r.endS) - xOfT(r.startS))} y={PAD_T} height={H - PAD_T - PAD_B} fill="var(--brand)" opacity="0.12" />)}
              <path d={d} fill="none" stroke={c.colour} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
              {cur && <line x1={X(xs[i!])} x2={X(xs[i!])} y1={PAD_T - 4} y2={H - PAD_B} stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 3" />}
              <text x={PAD_L} y={H - 3} fontSize="9" fill="var(--ink-muted)">{xLabel(x0)}</text>
              <text x={W / 2} y={H - 3} fontSize="9" fill="var(--ink-muted)" textAnchor="middle">{xLabel((x0 + x1) / 2)}</text>
              <text x={W - PAD_R} y={H - 3} fontSize="9" fill="var(--ink-muted)" textAnchor="end">{xLabel(x1)}</text>
            </svg>
            <div className="row-between caption"><span>{c.key === 'pace' ? `min/${units}, faster is higher` : c.unit}</span><span className="mono">{range}</span></div>
            <p className="sr-only">{summary}</p>
          </section>
        );
      })}
      {pts.some((p) => p.cad) ? null : <p className="caption">No cadence recorded.</p>}
      {reps.length > 0 && <p className="caption">Shaded: the {reps.length} reps.</p>}
    </div>
  );
}

function paceSummary(reps: Segment[], P: (s?: number) => string, a: Activity, units: Units): string {
  const avg = P(a.movingS / (a.distanceM / 1000));
  if (!reps.length) return `Pace: steady around ${avg} /${units} on average.`;
  const rp = reps.map((r) => r.paceS).filter((x): x is number => !!x);
  const mid = rp.length ? P(rp.reduce((x, y) => x + y, 0) / rp.length) : '';
  return `Pace: ${reps.length} fast reps around ${mid} /${units}, ${avg} /${units} on average over the whole run.`;
}
