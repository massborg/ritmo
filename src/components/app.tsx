// App-style building blocks: large-title header, week strip, workout graph, readiness gauge, tiles.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { PlannedSession, SessionType } from '../lib/types';
import type { ReadinessLevel } from '../training/load';
import { useApp } from '../app/AppContext';

/** iOS-style header: large title that collapses into a compact sticky bar on scroll. */
export function AppHeader({ title, eyebrow, right, back, large = true }: { title: string; eyebrow?: ReactNode; right?: ReactNode; back?: boolean; large?: boolean }) {
  const nav = useNavigate();
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const on = () => setCompact(window.scrollY > 56);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <>
      <div className={`appbar${compact ? ' appbar-compact' : ''}`}>
        <div className="appbar-inner">
          <div className="appbar-side">{back && <button className="icon-btn" aria-label="Back" onClick={() => nav(-1)}><ChevronLeft size={26} strokeWidth={2} /></button>}</div>
          <span className="appbar-title" aria-hidden={!compact}>{title}</span>
          <div className="appbar-side appbar-right">{right}</div>
        </div>
      </div>
      {large && <header className="large-title">
        {eyebrow && <p className="caption">{eyebrow}</p>}
        <h1 className="display-lg">{title}</h1>
      </header>}
    </>
  );
}

export function SampleChip() {
  const { data } = useApp();
  if (data.mode !== 'sample') return null;
  return <Link to="/profile/data" className="tag tag-sample" style={{ minHeight: 32 }} aria-label="Sample data. Tap to use your own data.">Sample data</Link>;
}

export function Avatar() {
  const { data, session, avatarSrc } = useApp();
  const initials = (data.profile.name ? data.profile.name.split(' ').map((x) => x[0]).join('') : (session?.user.email ?? 'R')[0]).slice(0, 2).toUpperCase();
  return avatarSrc
    ? <Link to="/profile" className="avatar avatar-photo" aria-label="Profile"><img src={avatarSrc} alt="" /></Link>
    : <Link to="/profile" className="avatar" aria-label="Profile">{initials}</Link>;
}

export const ZONE_OF: Partial<Record<SessionType, number>> = { recovery: 1, easy: 2, long: 2, runwalk: 2, tempo: 3, threshold: 4, hills: 4, timetrial: 4, vo2max: 5, speed: 5, race: 4 };

/** Horizontal strip of days with a coloured mark for each session. */
export function WeekStrip({ days, selected, onSelect }: { days: { date: string; dow: string; dom: number; session?: PlannedSession; done: boolean; today: boolean }[]; selected: string; onSelect: (d: string) => void }) {
  return (
    <div className="weekstrip" role="tablist" aria-label="This week">
      {days.map((d) => {
        const z = d.session ? ZONE_OF[d.session.type] : undefined;
        return (
          <button key={d.date} role="tab" aria-selected={selected === d.date} className={`daychip${d.today ? ' is-today' : ''}`} onClick={() => onSelect(d.date)}
            aria-label={`${d.dow} ${d.dom}: ${d.session ? d.session.title : 'nothing planned'}${d.done ? ', done' : ''}`}>
            <span className="daychip-dow">{d.dow.slice(0, 1)}</span>
            <span className="daychip-dom">{d.dom}</span>
            <span className="daychip-mark" style={{ background: d.done ? 'currentColor' : z ? `var(--zone-${z})` : 'transparent', borderColor: z || d.done ? 'transparent' : 'var(--hairline)' }} />
          </button>
        );
      })}
    </div>
  );
}

interface Block { label: string; m: number; zone: number }

/** Turn a planned session's steps into intensity blocks for the workout graph. */
export function workoutBlocks(s: PlannedSession): Block[] {
  const blocks: Block[] = [];
  const workZone = s.hrZones?.[s.hrZones.length - 1] ?? ZONE_OF[s.type] ?? 2;
  for (const st of s.steps) {
    const label = st.label.toLowerCase();
    const rw = st.label.match(/(\d+) x \((\d+) (min|s)(?: (\d+) s)? running \+ (\d+) (min|s)(?: (\d+) s)? walking\)/);
    if (rw) {
      const secs = (n: string, u: string, extra?: string) => Number(n) * (u === 'min' ? 60 : 1) + Number(extra ?? 0);
      const run = secs(rw[2], rw[3], rw[4]) * 3, walk = secs(rw[5], rw[6], rw[7]) * 1.6; // relative widths by time
      for (let i = 0; i < Number(rw[1]); i++) { blocks.push({ label: 'Run', m: run, zone: 3 }); if (i < Number(rw[1]) - 1) blocks.push({ label: 'Walk', m: walk, zone: 1 }); }
      continue;
    }
    const cont = st.label.match(/^(\d+) min easy running$/);
    if (cont) { blocks.push({ label: st.label, m: Number(cont[1]) * 180, zone: 3 }); continue; }
    const reps = st.label.match(/(\d+)\s*x\s*([\d.]+)\s*(km|m|s)\b/i);
    if (/warm up|cool down/.test(label)) { blocks.push({ label: st.label, m: s.type === 'runwalk' ? 900 : 2000, zone: 1 }); continue; }
    if (reps) {
      const n = Number(reps[1]);
      const len = reps[3].toLowerCase() === 'km' ? Number(reps[2]) * 1000 : reps[3].toLowerCase() === 'm' ? Number(reps[2]) : Number(reps[2]) * 4.5;
      const rest = /strides|s\b/.test(label) ? Math.max(60, len) : Math.max(250, len * 0.35);
      for (let i = 0; i < n; i++) { blocks.push({ label: st.label, m: len, zone: workZone }); if (i < n - 1) blocks.push({ label: 'Recovery', m: rest, zone: 1 }); }
      continue;
    }
    const km = st.label.match(/([\d.]+)\s*km/i);
    const m = km ? Number(km[1]) * 1000 : s.distanceM || 5000;
    const z = /steady|marathon|tempo/.test(label + st.detail.toLowerCase()) && s.type !== 'long' ? workZone : (s.type === 'recovery' ? 1 : 2);
    blocks.push({ label: st.label, m, zone: s.type === 'race' ? 4 : z });
  }
  return blocks;
}

export function WorkoutGraph({ session, height = 56, onBrand = false }: { session: PlannedSession; height?: number; onBrand?: boolean }) {
  const blocks = workoutBlocks(session);
  const total = blocks.reduce((x, b) => x + b.m, 0) || 1;
  return (
    <div className={`wgraph${onBrand ? ' wgraph-brand' : ''}`} style={{ height }} role="img" aria-label={`Workout structure: ${session.steps.map((s) => s.label).join(', ')}`}>
      {blocks.map((b, i) => (
        <span key={i} title={`${b.label}, Z${b.zone}`} style={{ flexGrow: b.m / total, height: `${28 + b.zone * 14}%`, background: onBrand ? undefined : `var(--zone-${b.zone})` }} className={onBrand ? `wz${b.zone}` : undefined} />
      ))}
    </div>
  );
}

/** Semi-circular readiness gauge. Status is always paired with a word. */
export function ReadinessGauge({ level, value, label }: { level: ReadinessLevel; value: number; label: string }) {
  const r = 52, c = Math.PI * r;
  const frac = Math.max(0.04, Math.min(1, value / 100));
  const color = level === 'ready' ? 'var(--success)' : level === 'easy' ? 'var(--warning)' : 'var(--info)';
  return (
    <svg width="132" height="78" viewBox="0 0 132 78" role="img" aria-label={`${label}, ${value} out of 100`}>
      <path d="M14 70 A52 52 0 0 1 118 70" fill="none" stroke="var(--surface-sunken)" strokeWidth="11" strokeLinecap="round" />
      <path d="M14 70 A52 52 0 0 1 118 70" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${frac * c} ${c}`} />
      <text x="66" y="66" textAnchor="middle" style={{ font: '500 30px var(--font-mono)', fill: 'var(--ink)' }}>{value}</text>
    </svg>
  );
}

export function Tile({ to, label, value, unit, sub, accent }: { to?: string; label: string; value: ReactNode; unit?: string; sub?: ReactNode; accent?: boolean }) {
  const body = (
    <>
      <span className="caption">{label}</span>
      <span className="tile-value">{value}{unit && <span className="tile-unit"> {unit}</span>}</span>
      {sub && <span className="caption">{sub}</span>}
    </>
  );
  return to ? <Link to={to} className={`tile${accent ? ' tile-accent' : ''}`}>{body}</Link> : <div className={`tile${accent ? ' tile-accent' : ''}`}>{body}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="section-title"><h2 className="label">{children}</h2>{action}</div>;
}
