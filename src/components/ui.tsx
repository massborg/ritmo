import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, Moon, Database } from 'lucide-react';
import type { ReadinessLevel } from '../training/load';
import { ZONE_NAMES } from '../training/fitness';
import { duration } from '../lib/format';
import { useApp } from '../app/AppContext';

/** Logo files are used exactly as supplied (public/brand). */
function useDark() {
  const { data } = useApp();
  const t = data.profile.theme;
  if (t === 'notte') return true;
  if (t === 'giorno' || t === 'sole') return false;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function Logo({ variant = 'main', reversed, width = 140, alt }: { variant?: 'main' | 'compact' | 'badge'; reversed?: boolean; width?: number; alt?: string }) {
  const dark = useDark();
  if (reversed === undefined) reversed = dark;
  const file = variant === 'badge' ? 'ritmo-badge.svg'
    : variant === 'compact' ? (reversed ? 'ritmo-logo-reversed.svg' : 'ritmo-logo.svg')
    : reversed ? 'ritmo-running-logo-reversed.svg' : 'ritmo-running-logo.svg';
  const ratio = variant === 'badge' ? 1 : variant === 'compact' ? 120 / 426 : 120 / 326;
  return <img src={`/brand/${file}`} width={width} height={Math.round(width * ratio)} alt={alt ?? (variant === 'main' ? 'Ritmo Running' : 'Ritmo')} />;
}

/** Decorative track-lane arcs for brand fills only. */
export function Lanes() {
  return (
    <svg className="hero-lanes" viewBox="0 0 260 260" aria-hidden="true">
      <g fill="none" stroke="var(--lane)" strokeWidth="5" opacity="0.9">
        {[230, 200, 170, 140].map((r) => <circle key={r} cx="260" cy="260" r={r} />)}
      </g>
    </svg>
  );
}

export function SampleBanner() {
  const { data } = useApp();
  if (data.mode !== 'sample') return null;
  return (
    <div className="banner" role="note" style={{ marginBottom: 'var(--s4)' }}>
      <Database size={20} strokeWidth={2} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
      <div className="row-between wrap" style={{ flex: 1 }}>
        <p className="label">Sample data. You are exploring Ritmo with an example runner.</p>
        <Link to="/profile/data" className="btn btn-small">Use my own data</Link>
      </div>
    </div>
  );
}

export function ReadinessStatus({ level, label }: { level: ReadinessLevel; label: string }) {
  const Icon = level === 'ready' ? CheckCircle2 : level === 'easy' ? AlertTriangle : Moon;
  const cls = level === 'ready' ? 'status-success' : level === 'easy' ? 'status-warning' : 'status-info';
  return <span className={`status ${cls}`}><Icon size={18} strokeWidth={2} aria-hidden="true" />{label}</span>;
}

export function StatusLine({ kind, children }: { kind: 'success' | 'warning' | 'danger' | 'info'; children: ReactNode }) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'info' ? Info : AlertTriangle;
  return <span className={`status status-${kind}`}><Icon size={18} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />{children}</span>;
}

export function ZoneBar({ seconds, showLegend = true }: { seconds: number[]; showLegend?: boolean }) {
  const total = seconds.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="stack-sm">
      <div className="zone-bar" role="img" aria-label={seconds.map((s, i) => `Z${i + 1} ${Math.round((s / total) * 100)}%`).join(', ')}>
        {seconds.map((s, i) => s > 0 && <span key={i} className={`z${i + 1}`} style={{ width: `${(s / total) * 100}%` }} />)}
      </div>
      {showLegend && (
        <ul className="list" style={{ marginTop: 4 }}>
          {seconds.map((s, i) => (
            <li key={i} className="row-between" style={{ padding: '6px 0' }}>
              <span className="row" style={{ gap: 8 }}><span className={`zone-dot z${i + 1}`} aria-hidden="true" /><span className="label">Z{i + 1}</span><span className="caption">{ZONE_NAMES[i]}</span></span>
              <span className="stat">{duration(s)} · {Math.round((s / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ZoneTag({ zones }: { zones: number[] }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      {zones.map((z) => <span key={z} className="tag"><span className={`zone-dot z${z}`} aria-hidden="true" />Z{z} {ZONE_NAMES[z - 1]}</span>)}
    </span>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card stack" style={{ alignItems: 'flex-start' }}>
      {icon}
      <h3 className="title">{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="caption">{label}</span>
      <span className="v">{value}</span>
      {sub && <span className="caption">{sub}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function ScoreRing({ score }: { score: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--brand)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="48" textAnchor="middle" style={{ font: '500 22px var(--font-mono)', fill: 'var(--ink)' }}>{score}</text>
    </svg>
  );
}
