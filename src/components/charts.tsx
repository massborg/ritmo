// Minimal SVG charts with round caps, drawn on surface-sunken wells.
import { useId } from 'react';

export interface Bar { label: string; value: number; compare?: number; highlight?: boolean; title?: string }

export function BarChart({ bars, height = 180, format = (v: number) => v.toFixed(0), compareLabel, valueLabel, every = 1 }: {
  bars: Bar[]; height?: number; format?: (v: number) => string; compareLabel?: string; valueLabel?: string; every?: number;
}) {
  const w = Math.max(320, bars.length * 28);
  const max = Math.max(1, ...bars.map((b) => Math.max(b.value, b.compare ?? 0))) * 1.1;
  const pad = { t: 16, b: 26, l: 8, r: 8 };
  const ih = height - pad.t - pad.b;
  const slot = (w - pad.l - pad.r) / bars.length;
  const bw = Math.min(18, slot * (bars.some((b) => b.compare != null) ? 0.34 : 0.6));
  const summary = bars.map((b) => `${b.label}: ${format(b.value)}${b.compare != null ? `, ${compareLabel ?? 'compare'} ${format(b.compare)}` : ''}`).join('; ');
  return (
    <div className="well" style={{ padding: 'var(--s3)' }}>
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={summary} preserveAspectRatio="none" style={{ height }}>
        {[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={w - pad.r} y1={pad.t + ih * (1 - f / 1.1)} y2={pad.t + ih * (1 - f / 1.1)} stroke="var(--hairline)" />)}
        {bars.map((b, i) => {
          const x = pad.l + slot * i + slot / 2;
          const h = (b.value / max) * ih;
          const hc = b.compare != null ? (b.compare / max) * ih : 0;
          const dual = b.compare != null;
          return (
            <g key={i}>
              <title>{b.title ?? `${b.label}: ${format(b.value)}`}</title>
              {dual && hc > 0 && <line x1={x - bw * 0.6} x2={x - bw * 0.6} y1={pad.t + ih} y2={pad.t + ih - hc + bw / 2} stroke="var(--border)" strokeWidth={bw} strokeLinecap="round" opacity="0.55" />}
              {h > 0 && <line x1={dual ? x + bw * 0.6 : x} x2={dual ? x + bw * 0.6 : x} y1={pad.t + ih} y2={Math.min(pad.t + ih, pad.t + ih - h + bw / 2)} stroke={b.highlight ? 'var(--brand)' : 'var(--ink)'} strokeWidth={bw} strokeLinecap="round" />}
              {i % every === 0 && <text x={x} y={height - 6} textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
      </svg>
      {(compareLabel || valueLabel) && (
        <div className="row caption" style={{ marginTop: 6, gap: 16 }}>
          {valueLabel && <span className="row" style={{ gap: 6 }}><span className="zone-dot" style={{ background: 'var(--ink)' }} />{valueLabel}</span>}
          {compareLabel && <span className="row" style={{ gap: 6 }}><span className="zone-dot" style={{ background: 'var(--border)', opacity: 0.55 }} />{compareLabel}</span>}
        </div>
      )}
    </div>
  );
}

export interface Series { name: string; values: (number | null)[]; color: string; dashed?: boolean }

export function LineChart({ series, labels, height = 180, format = (v: number) => v.toFixed(0), invert = false, every = 1 }: {
  series: Series[]; labels: string[]; height?: number; format?: (v: number) => string; invert?: boolean; every?: number;
}) {
  const id = useId();
  const w = 640;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!all.length) return <div className="well caption">Not enough data to draw this chart yet.</div>;
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.08; max += span * 0.08;
  const pad = { t: 14, b: 24, l: 44, r: 10 };
  const ih = height - pad.t - pad.b, iw = w - pad.l - pad.r;
  const n = labels.length;
  const x = (i: number) => pad.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => { const f = (v - min) / (max - min); return pad.t + ih * (invert ? f : 1 - f); };
  const path = (vals: (number | null)[]) => {
    let d = '', pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
  return (
    <div className="well" style={{ padding: 'var(--s3)' }}>
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-labelledby={id} style={{ height }} preserveAspectRatio="none">
        <title id={id}>{series.map((s) => `${s.name}: ${s.values.filter((v) => v != null).map((v) => format(v!)).slice(-6).join(', ')}`).join('. ')}</title>
        {ticks.map((t) => <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" /><text x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text></g>)}
        {series.map((s) => <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '2 6' : undefined} />)}
        {labels.map((l, i) => i % every === 0 && <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{l}</text>)}
      </svg>
      {series.length > 1 && (
        <div className="row wrap caption" style={{ marginTop: 6, gap: 16 }}>
          {series.map((s) => <span key={s.name} className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 3, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}

/** Route trace from lat/lon points */
export function RouteMap({ points }: { points: { lat?: number; lon?: number }[] }) {
  const pts = points.filter((p) => p.lat != null && p.lon != null) as { lat: number; lon: number }[];
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lons), maxLo = Math.max(...lons);
  const k = Math.cos((minLa * Math.PI) / 180);
  const spanX = (maxLo - minLo) * k || 1e-6, spanY = maxLa - minLa || 1e-6;
  const s = 280 / Math.max(spanX, spanY);
  const d = pts.filter((_, i) => i % 3 === 0).map((p, i) => `${i ? 'L' : 'M'}${(10 + (p.lon - minLo) * k * s).toFixed(1)},${(10 + (maxLa - p.lat) * s).toFixed(1)}`).join('');
  return (
    <div className="well" style={{ padding: 'var(--s3)' }}>
      <svg viewBox={`0 0 ${20 + spanX * s} ${20 + spanY * s}`} style={{ width: '100%', maxHeight: 260 }} role="img" aria-label="Route shape">
        <path d={d} fill="none" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
