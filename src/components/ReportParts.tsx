// Parts of the run feedback report: the score breakdown bars and the plan-against-actual rep chart.
import { pace as fmtPace, type Units } from '../lib/format';
import type { BreakdownItem, RepStat } from '../training/report';

export function Breakdown({ items }: { items: BreakdownItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="breakdown" aria-label="Score breakdown">
      {items.map((b) => (
        <li key={b.key}>
          <div className="row-between"><span className="label">{b.label}</span><span className="stat">{b.value}</span></div>
          <span className="breakdown-bar" role="img" aria-label={`${b.label} ${b.value} out of 100`}><span style={{ width: `${b.value}%`, background: b.value >= 85 ? 'var(--success)' : b.value >= 65 ? 'var(--brand)' : 'var(--warning)' }} /></span>
          <span className="caption">{b.note}</span>
        </li>
      ))}
    </ul>
  );
}

/** Each rep as a bar (taller is faster), the target band shaded, and heart rate as a line on top. */
export function RepChart({ reps, target, units }: { reps: RepStat[]; target?: [number, number]; units: Units }) {
  const withPace = reps.filter((r) => r.paceS);
  if (withPace.length < 2) return null;
  const W = 320, H = 150, pad = 26, bw = Math.min(36, (W - pad * 2) / withPace.length - 8);
  const ps = withPace.map((r) => r.paceS!);
  const lo = Math.min(...ps, target?.[0] ?? Infinity) - 6, hi = Math.max(...ps, target?.[1] ?? -Infinity) + 6;
  // faster (smaller s/km) is higher on the chart
  const y = (p: number) => pad + ((p - lo) / (hi - lo)) * (H - pad * 2);
  const hrs = withPace.map((r) => r.avgHr).filter((h): h is number => !!h);
  const hLo = Math.min(...hrs) - 5, hHi = Math.max(...hrs) + 5;
  const hy = (h: number) => pad + (1 - (h - hLo) / (hHi - hLo || 1)) * (H - pad * 2);
  const x = (i: number) => pad + i * ((W - pad * 2) / withPace.length) + 4;
  const P = (s: number) => fmtPace(s, units, false);
  return (
    <figure className="stack-sm" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={withPace.map((r) => `${r.label} ${P(r.paceS!)}${target ? (r.inTarget ? ', on target' : r.paceS! < target[0] ? `, ${Math.round(target[0] - r.paceS!)} seconds fast` : `, ${Math.round(r.paceS! - target[1])} seconds slow`) : ''}`).join('; ')}>
        {target && <rect x={pad - 4} width={W - pad * 2 + 8} y={y(target[0])} height={Math.max(2, y(target[1]) - y(target[0]))} fill="var(--success)" opacity="0.14" />}
        {withPace.map((r, i) => (
          <g key={i}>
            <rect x={x(i)} width={bw} y={y(r.paceS!)} height={H - pad - y(r.paceS!)} rx="4" fill={r.inTarget === false ? 'var(--warning)' : 'var(--brand)'} />
            <text x={x(i) + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-muted)">{i + 1}</text>
            <text x={x(i) + bw / 2} y={y(r.paceS!) - 4} textAnchor="middle" fontSize="9" fill="var(--ink)">{P(r.paceS!)}</text>
          </g>
        ))}
        {hrs.length === withPace.length && <polyline fill="none" stroke="var(--zone-4)" strokeWidth="2" points={withPace.map((r, i) => `${x(i) + bw / 2},${hy(r.avgHr!)}`).join(' ')} />}
      </svg>
      <figcaption className="caption">Each rep's pace{target ? `; the shaded band is the target (${P(target[0])}–${P(target[1])}/${units})` : ''}{hrs.length === withPace.length ? '; the line is average heart rate' : ''}.</figcaption>
    </figure>
  );
}

export function Sparkline({ values, labels, units }: { values: number[]; labels: string[]; units: Units }) {
  const W = 200, H = 40, lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (W - 8) + 4},${4 + ((v - lo) / (hi - lo || 1)) * (H - 8)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Pace in recent similar sessions: ${values.map((v, i) => `${labels[i]} ${fmtPace(v, units, false)}`).join(', ')}`}>
      <polyline points={pts.join(' ')} fill="none" stroke="var(--brand)" strokeWidth="2" />
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3.5" fill="var(--brand)" />
    </svg>
  );
}
