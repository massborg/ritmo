// Strength sessions in the plan (update 3, §4) and changing them (§8):
// - StrengthCard: duration, exercise count, equipment, the first 4 exercises with "+ N more", the why line,
//   Start workout, Edit and Swap
// - Edit: swap an exercise (3+ alternatives with a reason each, and "Always use this instead"), remove, add from
//   the library, reorder, and change sets, reps or time. That day only; Reset to plan
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Dumbbell, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import { ExerciseDemo } from './ExerciseDemo';
import { alternatives, blockOf, doseText, EQUIPMENT_LABEL, EXERCISES, excluded, exById, resolveStrength, ROUTINE_TITLE, skippedInARow, WEEK_FOCUS, type BlockWeek, type Routine, type StrengthItem } from '../training/strength';
import type { PlannedSession } from '../lib/types';

/** The strength block and week of a session, and how many planned sessions in a row were skipped before it */
export function useStrengthAt(date: string): { block: number; week: BlockWeek; skips: number } {
  const { plan, data } = useApp();
  const logged = new Set((data.profile.log ?? []).filter((e) => e.kind === 'strength' && e.strength?.sessionId).map((e) => e.strength!.sessionId!));
  return { ...blockOf(plan?.weeks, date), skips: skippedInARow(plan?.sessions ?? [], logged, date) };
}

const dayWord = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });

export function StrengthCard({ session, compact }: { session: PlannedSession; compact?: boolean }) {
  const { data } = useApp();
  const [editing, setEditing] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const at = useStrengthAt(session.date);
  if (!session.strengthPlan) return null;
  const r = resolveStrength(session.strengthPlan, data.profile.strength, at);
  const done = (data.profile.log ?? []).some((e) => e.kind === 'strength' && e.strength?.sessionId === session.id);
  const only = session.type === 'rest';
  return (
    <section className={`card stack-sm strength-card${compact ? ' compact' : ''}`} aria-label={`Strength: ${r.title}`}>
      <div className="row-between" style={{ gap: 8 }}>
        <span className="label row" style={{ gap: 8 }}><Dumbbell size={18} strokeWidth={2} aria-hidden="true" />{r.title}{only ? '' : ' · after the run'}</span>
        {done ? <span className="tag tag-accent"><Check size={14} strokeWidth={2.5} aria-hidden="true" />Done</span> : session.strengthPlan.custom ? <span className="tag">Your version</span> : null}
      </div>
      <p className="caption strength-meta">{r.minutes} min · {r.items.length} exercises · {EQUIPMENT_LABEL[r.equipment]} · <Link to="/strength-plan" className="strength-block-link">Block {at.block}, week {at.week}: {WEEK_FOCUS[at.week].name}</Link></p>
      {at.skips >= 2 && <p className="caption">Two sessions were skipped, so this one is a step back: a little easier, to pick up again.</p>}
      <ul className="strength-list">
        {r.items.slice(0, 4).map((x) => <li key={x.id}><span>{x.ex.name}</span><span className="caption">{doseText(x)}</span></li>)}
        {r.items.length > 4 && <li className="caption">+ {r.items.length - 4} more</li>}
      </ul>
      <p className="caption"><strong style={{ color: 'var(--ink)' }}>Why: </strong>{session.strengthPlan.why}</p>
      {!done && (
        <div className="row wrap" style={{ gap: 8 }}>
          <Link to={`/strength/${session.id}`} className="btn btn-primary btn-small"><Play size={16} strokeWidth={2.2} aria-hidden="true" />Start workout</Link>
          <button className="btn btn-small" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-small btn-ghost" onClick={() => setSwapping(true)}><Repeat size={16} strokeWidth={2} aria-hidden="true" />Swap</button>
        </div>
      )}
      {editing && <StrengthEdit session={session} onClose={() => setEditing(false)} />}
      {swapping && <RoutineSwap session={session} onClose={() => setSwapping(false)} />}
    </section>
  );
}

/** Swap the whole session: the other routine, core and hips, mobility, or no strength today */
function RoutineSwap({ session, onClose }: { session: PlannedSession; onClose: () => void }) {
  const { editStrength } = useApp();
  const cur = session.strengthPlan!.routine;
  const opts: { r: Routine | null; label: string; why: string }[] = [
    ...(cur === 'A' || cur === 'B' ? [{ r: (cur === 'A' ? 'B' : 'A') as Routine, label: ROUTINE_TITLE[cur === 'A' ? 'B' : 'A'], why: 'The other runner\'s routine' }] : [{ r: 'A' as Routine, label: ROUTINE_TITLE.A, why: 'A full legs, hips and core session' }]),
    ...(cur !== 'core' ? [{ r: 'core' as Routine, label: ROUTINE_TITLE.core, why: 'No heavy leg work' }] : []),
    ...(cur !== 'mobility' ? [{ r: 'mobility' as Routine, label: ROUTINE_TITLE.mobility, why: 'Gentle, for a tired day' }] : []),
    { r: null, label: 'No strength today', why: 'Take it off this day' },
  ];
  const go = (o: typeof opts[number]) => {
    editStrength(session.id, o.r ? { routine: o.r, custom: undefined, intensity: o.r === 'mobility' || o.r === 'core' ? 'light' : session.strengthPlan!.intensity } : null,
      o.r ? `${dayWord(session.date)}'s strength is now ${o.label.toLowerCase()} (your change).` : `No strength on ${dayWord(session.date)} (your change).`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Swap this strength session">
      <ul className="list">{opts.map((o) => <li key={o.label}><button className="list-item row-between" style={{ width: '100%' }} onClick={() => go(o)}><span className="stack-sm" style={{ gap: 0, textAlign: 'left' }}><span className="label">{o.label}</span><span className="caption">{o.why}</span></span></button></li>)}</ul>
    </Sheet>
  );
}

/** Edit one day's exercises */
export function StrengthEdit({ session, onClose }: { session: PlannedSession; onClose: () => void }) {
  const { data, editStrength, setStrengthPrefs } = useApp();
  const prefs = data.profile.strength ?? {};
  const at = useStrengthAt(session.date);
  const resolved = resolveStrength(session.strengthPlan!, prefs, at);
  const [items, setItems] = useState<StrengthItem[]>(resolved.items.map((x) => ({ id: x.id, sets: x.sets, ...(x.reps != null ? { reps: x.reps } : {}), ...(x.seconds != null ? { seconds: x.seconds } : {}) })));
  const [swapIdx, setSwapIdx] = useState<number>();
  const [adding, setAdding] = useState(false);
  const set = (i: number, patch: Partial<StrengthItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setItems((xs) => { const a = [...xs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const never = prefs.never ?? [];
  const save = () => {
    editStrength(session.id, { custom: items }, `You changed ${dayWord(session.date)}'s strength: ${items.map((x) => exById.get(x.id)?.name).join(', ')}.`);
    onClose();
  };
  return (
    <>
      <Sheet open onClose={onClose} title={`Edit: ${resolved.title}`}
        footer={<div className="stack-sm">
          <button className="btn btn-primary btn-block" onClick={save} disabled={!items.length}>Save for this day</button>
          {session.strengthPlan!.custom && <button className="btn btn-block" onClick={() => { editStrength(session.id, { custom: undefined }, `${dayWord(session.date)}'s strength is back to the plan.`); onClose(); }}>Reset to plan</button>}
        </div>}>
        <ol className="strength-edit">
          {items.map((x, i) => {
            const ex = exById.get(x.id)!;
            return (
              <li key={`${x.id}-${i}`} className="strength-edit-row">
                <div className="row-between" style={{ gap: 8 }}>
                  <span className="label">{ex.name}</span>
                  <span className="row" style={{ gap: 2 }}>
                    <button className="icon-btn" aria-label={`Move ${ex.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={18} /></button>
                    <button className="icon-btn" aria-label={`Move ${ex.name} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={18} /></button>
                    <button className="icon-btn" aria-label={`Remove ${ex.name}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
                  </span>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <MiniStep label="Sets" value={x.sets} min={1} max={8} onChange={(v) => set(i, { sets: v })} name={ex.name} />
                  {x.seconds != null ? <MiniStep label="Seconds" value={x.seconds} min={10} max={180} step={5} onChange={(v) => set(i, { seconds: v })} name={ex.name} />
                    : <MiniStep label="Reps" value={x.reps ?? 10} min={1} max={50} onChange={(v) => set(i, { reps: v })} name={ex.name} />}
                  <button className="btn btn-small" onClick={() => setSwapIdx(i)}><Repeat size={16} strokeWidth={2} aria-hidden="true" />Swap</button>
                </div>
              </li>
            );
          })}
        </ol>
        <button className="btn btn-small" onClick={() => setAdding(true)}><Plus size={16} strokeWidth={2} aria-hidden="true" />Add an exercise</button>
        <p className="caption">These changes are for {dayWord(session.date)} only. To change an exercise for good, tick "Always use this instead" when you swap it.</p>
      </Sheet>
      {swapIdx != null && (
        <SwapSheet fromId={items[swapIdx].id} never={never} onClose={() => setSwapIdx(undefined)}
          onPick={(id, always) => {
            const ex = exById.get(id)!;
            setItems((xs) => xs.map((x, j) => (j === swapIdx ? { id, sets: x.sets, ...(ex.seconds ? { seconds: ex.seconds } : { reps: ex.reps }) } : x)));
            if (always) setStrengthPrefs({ swaps: { ...(prefs.swaps ?? {}), [items[swapIdx].id]: id } });
            setSwapIdx(undefined);
          }} />
      )}
      {adding && (
        <Sheet open onClose={() => setAdding(false)} title="Add an exercise">
          <ul className="list">
            {EXERCISES.filter((e) => !excluded(e, never) && !items.some((x) => x.id === e.id)).map((e) => (
              <li key={e.id}><button className="list-item row-between" style={{ width: '100%' }} onClick={() => { setItems((xs) => [...xs, { id: e.id, sets: e.sets, ...(e.seconds ? { seconds: e.seconds } : { reps: e.reps }) }]); setAdding(false); }}>
                <span className="stack-sm" style={{ gap: 0, textAlign: 'left' }}><span className="label">{e.name}</span><span className="caption">{e.muscles.join(', ')} · {EQUIPMENT_LABEL[e.equipment]}</span></span><Plus size={18} aria-hidden="true" />
              </button></li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

/** 3+ alternatives for the same muscles, each with a reason, and "Always use this instead" */
export function SwapSheet({ fromId, never, onPick, onClose }: { fromId: string; never: string[]; onPick: (id: string, always: boolean) => void; onClose: () => void }) {
  const from = exById.get(fromId)!;
  const [always, setAlways] = useState(false);
  const alts = alternatives(fromId, never);
  return (
    <Sheet open onClose={onClose} title={`Instead of ${from.name}`}>
      <ul className="list swap-list">
        {alts.map(({ ex, reason }) => (
          <li key={ex.id}><button className="list-item row" style={{ width: '100%', gap: 12 }} onClick={() => onPick(ex.id, always)}>
            <ExerciseDemo pattern={ex.pattern} name={ex.name} size={56} />
            <span className="stack-sm" style={{ gap: 0, textAlign: 'left' }}><span className="label">{ex.name}</span><span className="caption">{reason}</span></span>
          </button></li>
        ))}
      </ul>
      <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /> Always use this instead</label>
      <p className="caption">With "Always use this instead", future sessions use the new exercise too, and your progress carries on with it.</p>
    </Sheet>
  );
}

function MiniStep({ label, value, onChange, min, max, step = 1, name }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; name: string }) {
  return (
    <span className="mini-step" role="group" aria-label={`${label} for ${name}`}>
      <button className="icon-btn" aria-label={`Fewer ${label.toLowerCase()} for ${name}`} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <span className="stat">{value}</span><span className="caption">{label.toLowerCase()}</span>
      <button className="icon-btn" aria-label={`More ${label.toLowerCase()} for ${name}`} onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </span>
  );
}
