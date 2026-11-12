// Edit a running session (update 3, §8): distance or time ("+2 km"), the type within the easy family, and the target
// pace (with a note when it leaves the zone). An impact check before saving. That day only; Reset to plan.
import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Chips, Sheet, Stepper } from './inputs';
import { applyEdit, easyKind, EASY_FAMILY, impactCheck, paceNote, type EasyKind, type SessionEdit } from '../training/edit-session';
import { trainingPaces } from '../training/fitness';
import { forStats } from '../data/quality';
import { startOfWeek, ymd } from '../lib/format';
import type { PlannedSession } from '../lib/types';

const MI = 1609.344;
const toSec = (x: string) => { const m = x.trim().match(/^(\d{1,2})[:.](\d{2})$/); return m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : undefined; };
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export function EditSession({ session, open, onClose }: { session: PlannedSession; open: boolean; onClose: () => void }) {
  const { data, paces, editSession, resetSession, weekTarget } = useApp();
  const U = data.profile.units;
  const unitM = U === 'km' ? 1000 : MI;
  // Edits apply to the plan's own session (the one before pain or readiness changes)
  const base = data.plan?.sessions.find((x) => x.id === session.id) ?? session;
  const easy = EASY_FAMILY.includes(base.type);
  const byTime = base.distanceM === 0 && base.durationS > 0;
  const [dist, setDist] = useState<number | undefined>(base.distanceM ? Math.round((base.distanceM / unitM) * 10) / 10 : undefined);
  const [mins, setMins] = useState<number | undefined>(byTime ? Math.round(base.durationS / 60) : undefined);
  const [kind, setKind] = useState<EasyKind>(easyKind(base));
  const perU = (s: number) => (U === 'km' ? s : s * (MI / 1000));
  const [pMin, setPMin] = useState(base.paceTarget ? fmt(perU(base.paceTarget.minSPerKm)) : '');
  const [pMax, setPMax] = useState(base.paceTarget ? fmt(perU(base.paceTarget.maxSPerKm)) : '');
  const p = paces ?? trainingPaces(40);
  const edit: SessionEdit = useMemo(() => {
    const e: SessionEdit = {};
    if (dist != null && !byTime) { const m = Math.round(dist * unitM); if (Math.abs(m - base.distanceM) >= 50) e.distanceM = m; }
    if (mins != null && byTime && Math.round(mins * 60) !== base.durationS) e.durationS = mins * 60;
    if (easy && kind !== easyKind(base)) e.kind = kind;
    const a = toSec(pMin), b = toSec(pMax);
    const k = U === 'km' ? 1 : 1000 / MI;
    if (a && b && (!base.paceTarget || Math.abs(a * k - base.paceTarget.minSPerKm) > 1 || Math.abs(b * k - base.paceTarget.maxSPerKm) > 1)) e.pace = [Math.min(a, b) * k, Math.max(a, b) * k];
    return e;
  }, [dist, mins, kind, pMin, pMax, base, byTime, easy, unitM, U]);
  const changed = Object.keys(edit).length > 0;
  const preview = changed ? applyEdit(base, edit, p).session : base;
  const biggestWeekKm = useMemo(() => {
    const weeks = new Map<string, number>();
    const cut = Date.now() - 16 * 7 * 86400e3;
    for (const a of forStats(data.activities)) { if (new Date(a.startTime).getTime() < cut) continue; const k = ymd(startOfWeek(new Date(a.startTime))); weeks.set(k, (weeks.get(k) ?? 0) + a.distanceM / 1000); }
    return Math.max(0, ...weeks.values());
  }, [data.activities]);
  const impact = changed && data.plan ? impactCheck(data.plan, preview, { biggestWeekKm, targetKm: ymd(startOfWeek(new Date(`${base.date}T12:00:00`))) === ymd(startOfWeek(new Date())) ? weekTarget.originalM / 1000 || undefined : undefined }) : undefined;
  const note = edit.pace ? paceNote(base, edit.pace, p) : undefined;
  const delta = dist != null && !byTime ? Math.round((dist - base.distanceM / unitM) * 10) / 10 : 0;
  return (
    <Sheet open={open} onClose={onClose} title={`Edit: ${base.title}`}
      footer={<div className="stack-sm">
        <button className="btn btn-primary btn-block" disabled={!changed} onClick={() => { editSession(base.id, edit); onClose(); }}>Save for this day</button>
        {base.edited && <button className="btn btn-block" onClick={() => { resetSession(base.id); onClose(); }}>Reset to plan</button>}
      </div>}>
      <div className="stack">
        {byTime
          ? <Stepper id="ed-min" label="Time" value={mins} min={10} max={240} step={5} unit="min" onChange={setMins} />
          : <Stepper id="ed-dist" label={`Distance (${U})`} value={dist} min={1} max={60} step={0.5} unit={U} onChange={setDist} />}
        {delta !== 0 && <p className="caption"><span className="edit-delta">{delta > 0 ? '+' : ''}{delta} {U}</span> compared with the plan ({Math.round((base.distanceM / unitM) * 10) / 10} {U})</p>}
        {easy && <Chips<EasyKind> label="Type" value={kind} onChange={setKind} options={[{ value: 'easy', label: 'Easy' }, { value: 'strides', label: 'Easy + strides' }, { value: 'recovery', label: 'Recovery' }]} />}
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Target pace (per {U})</legend>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" aria-label="Fastest pace" inputMode="numeric" placeholder="4:50" value={pMin} onChange={(e) => setPMin(e.target.value)} style={{ maxWidth: 110 }} />
            <span>to</span>
            <input className="input" aria-label="Slowest pace" inputMode="numeric" placeholder="5:20" value={pMax} onChange={(e) => setPMax(e.target.value)} style={{ maxWidth: 110 }} />
          </div>
          {note && <p className="caption" role="status">{note}</p>}
        </fieldset>
        {impact && <div className={`card stack-sm edit-impact${impact.ok ? '' : ' warn'}`} role="status"><p className="caption" style={{ color: 'var(--ink)' }}>{impact.text}</p></div>}
        <p className="caption">This changes this day only. Ritmo doesn't cut other days to make up for it, and your run is judged against your version.</p>
      </div>
    </Sheet>
  );
}
