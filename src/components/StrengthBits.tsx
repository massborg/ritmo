// Shared pieces for free strength and weight on every set (update 4, tasks 4 and 4b): a number field that takes
// decimals from the phone keypad, the exercise library with search and filters, and an exercise's history chart.
import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import { worksLabel } from './figure';
import { CUSTOM_GROUP_LABEL, EQUIPMENT_LABEL, excluded, library, nameTaken, toExercise, type CustomExercise, type CustomGroup, type Equipment, type Exercise } from '../training/strength';
import { Chips } from './inputs';
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
      // Leaving the field: show the number that is actually used (a value above the limit is capped, lb are rounded)
      onBlur={() => { if (value != null && Number(text.replace(',', '.')) !== value) setText(String(value)); }}
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
  const custom = prefs.customExercises;
  const [own, setOwn] = useState<{ name?: string; edit?: CustomExercise }>();
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return library().filter((e) => (group === 'all' || groupsOf(e).includes(group)) && words.every((w) => `${e.name} ${e.muscles.join(' ')} ${groupsOf(e).join(' ')}`.toLowerCase().includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, group, custom]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack-sm ex-library">
      <label className="search-field"><Search size={18} aria-hidden="true" /><input className="input" type="search" aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="row wrap" role="group" aria-label="Filter exercises" style={{ gap: 6 }}>
        <button type="button" className="chip" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>All</button>
        {GROUPS.map((g) => <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{GROUP_LABEL[g]}</button>)}
      </div>
      <button type="button" className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setOwn({ name: q.trim() || undefined })}><Plus size={16} aria-hidden="true" />Add your own exercise</button>
      <ul className="list ex-list" aria-label="Exercises">
        {list.map((e) => {
          const note = exclusionNote(e, prefs.never ?? [], prefs.equipment ?? 'none');
          const on = picked.includes(e.id);
          return (
            <li key={e.id} className={`list-item row-between${note ? ' ex-marked' : ''}`}>
              <span className="stack-sm" style={{ gap: 0, minWidth: 0 }}>
                <span className="label">{e.name}{e.custom && <span className="mine-tag">Mine</span>}</span>
                <span className="caption">{[e.muscles.length ? worksLabel(e.muscles) : '', EQUIPMENT_LABEL[e.equipment]].filter(Boolean).join(' · ')}</span>
                {note && <span className="caption ex-note">{note}</span>}
              </span>
              {e.custom && <button type="button" className="icon-btn" aria-label={`Edit ${e.name}`} onClick={() => setOwn({ edit: (custom ?? []).find((c) => c.id === e.id) })}><Pencil size={16} /></button>}
              <button type="button" className={`btn btn-small${on ? ' btn-ghost' : ''}`} disabled={on} aria-label={on ? `${e.name}: added` : `${verb} ${e.name}`} onClick={() => onPick(e)}>{on ? <><Check size={16} aria-hidden="true" />Added</> : <><Plus size={16} aria-hidden="true" />{verb}</>}</button>
            </li>
          );
        })}
        {!list.length && <li className="list-item stack-sm" style={{ alignItems: 'flex-start' }}><span className="muted">No exercise matches. Try another word or filter{q.trim() ? ', or add it once and use it in any workout.' : '.'}</span>{q.trim() && <button type="button" className="btn btn-small btn-primary" onClick={() => setOwn({ name: q.trim() })}><Plus size={16} aria-hidden="true" />Add "{q.trim()}" as my exercise</button>}</li>}
      </ul>
      {own && <CustomExerciseSheet name={own.name} edit={own.edit} onClose={() => setOwn(undefined)} onSaved={(e, isNew) => { setOwn(undefined); setQ(''); if (isNew && !picked.includes(e.id)) onPick(e); }} />}
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
                <li key={i} className="list-item row-between"><span className="label">{day(p.date)}</span><span className="caption" style={{ textAlign: 'right' }}>{p.text}{p.volumeKg ? <><br />Volume {p.volume}{p.e1rm ? ` · est. 1-rep max ${showLoad(p.e1rm, unit)}` : ''}</> : null}</span></li>
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
/** Where the recorder keeps a workout in progress for the tab (sets done, notes), so a stray Back or a reload does not lose it */
export const liveWorkoutKey = (id: string) => `ritmo:strength:live:${id}`;
// A workout started afresh from the builder replaces whatever was in progress
export const stashWorkout = (w: FreeWorkout) => { try { sessionStorage.setItem(KEY, JSON.stringify(w)); sessionStorage.removeItem(liveWorkoutKey('free:w')); } catch { /* */ } };
export const stashedWorkout = (): FreeWorkout | undefined => { try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : undefined; } catch { return undefined; } };

const MEASURES: { value: CustomExercise['measure']; label: string }[] = [{ value: 'reps', label: 'Reps' }, { value: 'seconds', label: 'Time' }, { value: 'distance', label: 'Distance' }];
const LOADS: { value: CustomExercise['loadType']; label: string }[] = [{ value: 'added', label: 'Added weight' }, { value: 'bodyweight', label: 'Bodyweight' }, { value: 'band', label: 'Band' }];

/** Add or change one of your own exercises (update 5, U2). It joins the library: search, filters, saved workouts,
 *  logging, "last time" and progression all treat it like any other, tagged MINE. */
export function CustomExerciseSheet({ name: startName, edit, onClose, onSaved }: { name?: string; edit?: CustomExercise; onClose: () => void; onSaved?: (e: Exercise, isNew: boolean) => void }) {
  const { saveCustomExercise, archiveCustomExercise } = useApp();
  const [name, setName] = useState(edit?.name ?? startName ?? '');
  const [group, setGroup] = useState<CustomGroup>(edit?.group ?? 'legs');
  const [measure, setMeasure] = useState<CustomExercise['measure']>(edit?.measure ?? 'reps');
  const [loadType, setLoadType] = useState<CustomExercise['loadType']>(edit?.loadType ?? 'bodyweight');
  const [equipment, setEquipment] = useState<Equipment>(edit?.equipment ?? 'none');
  const [perSide, setPerSide] = useState(!!edit?.perSide);
  const [sets, setSets] = useState<number | undefined>(edit?.sets ?? 3);
  const [amount, setAmount] = useState<number | undefined>(edit?.amount ?? 10);
  const [note, setNote] = useState(edit?.note ?? '');
  const taken = nameTaken(name, edit?.id);
  const ok = name.trim().length > 1 && !taken && !!sets && !!amount;
  // Changing how it is measured starts from a sensible amount
  const pickMeasure = (m: CustomExercise['measure']) => { setMeasure(m); if (m !== measure) setAmount(m === 'reps' ? 10 : m === 'seconds' ? 30 : 20); };
  const save = () => {
    const c = { id: edit?.id, name: name.trim(), group, measure, loadType, equipment, perSide: perSide || undefined, sets: sets!, amount: amount!, note: note.trim() || undefined, archived: edit?.archived };
    const id = saveCustomExercise(c);
    onSaved?.(toExercise({ ...c, id, createdAt: edit?.createdAt ?? '' }), !edit);
    if (!onSaved) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={edit ? 'Your exercise' : 'Add your own exercise'}
      footer={<button type="button" className="btn btn-primary btn-block" disabled={!ok} onClick={save}>Save exercise</button>}>
      <div className="stack">
        <div className="field">
          <label htmlFor="cx-name">Name</label>
          <input id="cx-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-describedby="cx-name-help" />
          <p id="cx-name-help" className="caption" role={taken ? 'alert' : undefined} style={taken ? { color: 'var(--danger)' } : undefined}>{taken ? 'There is already an exercise with this name.' : 'Not in the library yet? Add it once, use it in any workout.'}</p>
        </div>
        <Chips<CustomGroup> label="Muscle group" value={group} onChange={setGroup} options={(Object.keys(CUSTOM_GROUP_LABEL) as CustomGroup[]).map((g) => ({ value: g, label: CUSTOM_GROUP_LABEL[g] }))} />
        <Chips<CustomExercise['measure']> label="Record it as" value={measure} onChange={pickMeasure} options={MEASURES} />
        <Chips<CustomExercise['loadType']> label="Weight" value={loadType} onChange={setLoadType} options={LOADS} />
        <Chips<Equipment> label="Equipment" value={equipment} onChange={setEquipment} options={(['none', 'light', 'gym'] as Equipment[]).map((e) => ({ value: e, label: e === 'none' ? 'None' : EQUIPMENT_LABEL[e] }))} />
        <button type="button" className="hx-row" role="switch" aria-checked={perSide} onClick={() => setPerSide((v) => !v)}><span>One side at a time</span><strong>{perSide ? 'On' : 'Off'}</strong></button>
        <div className="field">
          <span className="label" id="cx-dose">Default sets × {measure === 'reps' ? 'reps' : measure === 'seconds' ? 'seconds' : 'metres'}</span>
          <div className="build-dose" role="group" aria-labelledby="cx-dose">
            <label><span className="caption">Sets</span><NumInput label="Sets" value={sets} max={10} onChange={setSets} /></label>
            <span className="build-x" aria-hidden="true">×</span>
            <label><span className="caption">{measure === 'reps' ? 'Reps' : measure === 'seconds' ? 'Seconds' : 'Metres'}</span><NumInput label={measure === 'reps' ? 'Reps' : measure === 'seconds' ? 'Seconds' : 'Metres'} value={amount} max={measure === 'distance' ? 2000 : 600} onChange={setAmount} /></label>
          </div>
        </div>
        <div className="field"><label htmlFor="cx-note">How to do it <span className="caption">(optional note or video link)</span></label><input id="cx-note" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></div>
        {edit && <button type="button" className="btn btn-ghost" onClick={() => { archiveCustomExercise(edit.id, !edit.archived); onClose(); }}>{edit.archived ? 'Bring back to the library' : 'Archive (hide from the library, keep its history)'}</button>}
      </div>
    </Sheet>
  );
}

/** The athlete's note for one of their own exercises: text, or a link to a video */
export function OwnNote({ ex }: { ex: Exercise }) {
  if (!ex.custom) return null;
  const link = ex.note && /^https?:\/\//i.test(ex.note) ? ex.note : undefined;
  return <div className="own-demo" aria-label="Your own exercise"><span className="mine-tag">Mine</span>{link ? <a href={link} target="_blank" rel="noreferrer" className="caption">Watch how to do it</a> : <span className="caption">Your own exercise</span>}</div>;
}
