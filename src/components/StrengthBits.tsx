// Shared pieces for free strength and weight on every set (update 4, tasks 4 and 4b): a number field that takes
// decimals from the phone keypad, the exercise library with search and filters, and an exercise's history chart.
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import { worksLabel } from './figure';
import { EQUIPMENT_LABEL, EXERCISES, excluded, type Equipment, type Exercise } from '../training/strength';
import { GROUP_LABEL, groupsOf, historyOf, showLoad, toUnit, type ExGroup, type WeightUnit } from '../training/strength-load';
import { parseYmd } from '../lib/format';

const EQ_RANK: Record<Equipment, number> = { none: 0, light: 1, gym: 2 };

/** A number typed on the keypad. `decimal` allows "12.5" or "12,5" (for kg). Empty is undefined. */
export function NumInput({ value, onChange, label, decimal, id, placeholder, max = 999 }: { value?: number; onChange: (v: number | undefined) => void; label: string; decimal?: boolean; id?: string; placeholder?: string; max?: number }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const parse = (t: string) => { const n = Number(t.replace(',', '.')); return t.trim() === '' || !Number.isFinite(n) ? undefined : Math.min(max, Math.max(0, n)); };
  // Changed from outside (a quick chip, a new exercise): show that, but never rewrite what is being typed ("12.")
  useEffect(() => { if (parse(text) !== value) setText(value == null ? '' : String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input id={id} className="input num-input" inputMode={decimal ? 'decimal' : 'numeric'} pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'} autoComplete="off" aria-label={label} placeholder={placeholder} value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => { const t = e.target.value.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, ''); setText(t); onChange(parse(t)); }} />
  );
}

/** Why an exercise is marked in the library: it stays in the list (marked, not hidden), and can still be added */
export function exclusionNote(e: Exercise, never: string[], equipment: Equipment): string | undefined {
  if (excluded(e, never)) return 'On your "Never give me" list';
  if (EQ_RANK[e.equipment] > EQ_RANK[equipment]) return e.equipment === 'gym' ? 'Needs gym equipment' : 'Needs light weights or a band';
  return undefined;
}

const GROUPS: ExGroup[] = ['legs', 'hips', 'core', 'upper', 'plyo', 'hyrox'];

/** The exercise library: search, and filter by Legs, Hips, Core, Upper, Plyo or HYROX */
export function ExerciseLibrary({ onPick, picked = [], group: startGroup, verb = 'Add' }: { onPick: (e: Exercise) => void; picked?: string[]; group?: ExGroup; verb?: string }) {
  const { data } = useApp();
  const prefs = data.profile.strength ?? {};
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<ExGroup | 'all'>(startGroup ?? 'all');
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return EXERCISES.filter((e) => (group === 'all' || groupsOf(e).includes(group)) && words.every((w) => `${e.name} ${e.muscles.join(' ')} ${groupsOf(e).join(' ')}`.toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, group]);
  return (
    <div className="stack-sm ex-library">
      <label className="search-field"><Search size={18} aria-hidden="true" /><input className="input" type="search" aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="row wrap" role="group" aria-label="Filter exercises" style={{ gap: 6 }}>
        <button type="button" className="chip" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>All</button>
        {GROUPS.map((g) => <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}</button>)}
      </div>
      <ul className="list ex-list" aria-label="Exercises">
        {list.map((e) => {
          const note = exclusionNote(e, prefs.never ?? [], prefs.equipment ?? 'none');
          const on = picked.includes(e.id);
          return (
            <li key={e.id} className={`list-item row-between${note ? ' ex-marked' : ''}`}>
              <span className="stack-sm" style={{ gap: 0, minWidth: 0 }}>
                <span className="label">{e.name}</span>
                <span className="caption">{[e.muscles.length ? worksLabel(e.muscles) : '', EQUIPMENT_LABEL[e.equipment]].filter(Boolean).join(' · ')}</span>
                {note && <span className="caption ex-note">{note}</span>}
              </span>
              <button type="button" className={`btn btn-small${on ? ' btn-ghost' : ''}`} disabled={on} aria-label={on ? `${e.name}: added` : `${verb} ${e.name}`} onClick={() => onPick(e)}>{on ? <><Check size={16} aria-hidden="true" />Added</> : <><Plus size={16} aria-hidden="true" />{verb}</>}</button>
            </li>
          );
        })}
        {!list.length && <li className="list-item muted">No exercise matches. Try another word or filter.</li>}
      </ul>
    </div>
  );
}

/** One exercise over time: a line of the estimated 1-rep max (or the reps or seconds when it has no load), and each session */
export function ExerciseHistory({ exerciseId, name, onClose }: { exerciseId: string; name: string; onClose: () => void }) {
  const { data } = useApp();
  const unit: WeightUnit = data.profile.strength?.units ?? 'kg';
  const pts = historyOf(data.profile.log, exerciseId, unit);
  const loaded = pts.some((p) => p.e1rm);
  const val = (p: (typeof pts)[number]) => (loaded ? toUnit(p.e1rm ?? 0, unit) : p.seconds ?? p.reps ?? 0);
  const vals = pts.map(val), lo = Math.min(...vals), hi = Math.max(...vals);
  const W = 300, H = 110, x = (i: number) => (pts.length < 2 ? W / 2 : 12 + (i * (W - 24)) / (pts.length - 1)), y = (v: number) => (hi === lo ? H / 2 : H - 14 - ((v - lo) / (hi - lo)) * (H - 28));
  const day = (d: string) => parseYmd(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const what = loaded ? `Estimated 1-rep max (${unit})` : pts.some((p) => p.seconds) ? 'Longest hold (seconds)' : 'Most reps in a set';
  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="stack">
        {pts.length ? (
          <>
            <p className="label">{what}</p>
            <svg className="ex-history" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${what}: ${pts.map((p) => `${day(p.date)} ${val(p)}`).join(', ')}`}>
              {pts.length > 1 && <polyline fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p, i) => `${x(i)},${y(val(p))}`).join(' ')} />}
              {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(val(p))} r="4" fill="var(--brand)" />)}
              <text x="2" y="10" className="ex-history-t">{hi}</text>{hi !== lo && <text x="2" y={H - 2} className="ex-history-t">{lo}</text>}
            </svg>
            <ul className="list">
              {[...pts].reverse().map((p, i) => (
                <li key={i} className="list-item row-between"><span className="label">{day(p.date)}</span><span className="caption" style={{ textAlign: 'right' }}>{p.text}{p.volumeKg ? <><br />Volume {showLoad(p.volumeKg, unit)}{p.e1rm ? ` · est. 1-rep max ${showLoad(p.e1rm, unit)}` : ''}</> : null}</span></li>
              ))}
            </ul>
            {loaded && <p className="caption">The estimated 1-rep max is worked out from your best set (weight × (1 + reps ÷ 30)). It is a guide for tracking progress, not a lift to attempt.</p>}
          </>
        ) : <p className="muted">Nothing recorded for this exercise yet.</p>}
      </div>
    </Sheet>
  );
}

/** A free workout on its way from the builder to the recorder. Kept for the tab, so a reload does not lose it. */
export interface FreeWorkout { name: string; templateId?: string; exercises: import('../training/strength-load').TemplateExercise[] }
const KEY = 'ritmo:strength:free';
export const stashWorkout = (w: FreeWorkout) => { try { sessionStorage.setItem(KEY, JSON.stringify(w)); } catch { /* */ } };
export const stashedWorkout = (): FreeWorkout | undefined => { try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : undefined; } catch { return undefined; } };
