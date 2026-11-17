// The guided strength recorder (update 3, §5; update 4, tasks 4 and 4b): title, elapsed time and progress;
// "Exercise x of y" with a demo, the name and one cue; a set table (Set / Last time / kg / Reps / done) filled from the
// last session, with quick weight chips and effort per set; Set done, then a rest timer; Swap, Add exercise, Notes;
// Up next. It records a planned Ritmo session, or the runner's own workout (/strength/free?w=1, from the builder or
// a saved workout). Then a summary with volume, best set and estimated 1-rep max. Strength counts toward streaks
// and sessions done, and as light load, never as running km.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Circle, Plus, Timer } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Sheet } from '../components/inputs';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { worksLabel } from '../components/figure';
import { ExerciseLibrary, NumInput, liveWorkoutKey, stashedWorkout } from '../components/StrengthBits';
import { exById, noteInUnit, resolveStrength, type Exercise, type Routine } from '../training/strength';
import { LOAD_LABEL, asTemplateExercises, defaultLoadType, doubleProgression, exerciseSummary, freeName, fromUnit, groupsOf, lastLine, lastSets, sessionSummary, showLoad, showVolume, toUnit, type Band, type LoadType, type SetLog, type WeightUnit } from '../training/strength-load';
import { useStrengthAt } from '../components/StrengthSession';
import { duration, ymd } from '../lib/format';

interface SetRow { reps?: number; load?: number; seconds?: number; effort?: number; done: boolean }
interface Item { id: string; ex: Exercise; sets: number; reps?: number; seconds?: number; load?: number; note?: string }
interface Meta { loadType: LoadType; band?: Band }
/** A workout in progress, kept for the tab: a stray Back, a tab tap or a reload does not lose the sets done */
interface Kept { startedAt: number; idx: number; items: Omit<Item, 'ex'>[]; sets: SetRow[][]; meta: Meta[]; notes: string }
const KEEP_MS = 12 * 3600 * 1000;
function readKept(key: string): (Omit<Kept, 'items'> & { items: Item[] }) | undefined {
  try {
    const k = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Kept | null;
    if (!k || Date.now() - k.startedAt > KEEP_MS || !k.items.length || k.items.length !== k.sets.length || k.items.length !== k.meta.length || k.items.some((x) => !exById.has(x.id))) return undefined;
    return { ...k, idx: Math.min(Math.max(0, k.idx), k.items.length - 1), items: k.items.map((x) => ({ ...x, ex: exById.get(x.id)! })) };
  } catch { return undefined; }
}

export default function StrengthPlayer() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { data, plan, saveStrength, setStrengthPrefs, saveTemplate } = useApp();
  const session = plan?.sessions.find((s) => s.id === id);
  // The runner's own workout, from the builder or a saved workout
  const [free] = useState(() => (id === 'free' && params.get('w') ? stashedWorkout() : undefined));
  const sp = free ? undefined : session?.strengthPlan ?? (id === 'free' ? { routine: (params.get('routine') as Routine) || 'A', intensity: 'moderate' as const, why: '' } : undefined);
  const prefs = data.profile.strength;
  const unit: WeightUnit = prefs?.units ?? 'kg';
  const log = data.profile.log;
  const at = useStrengthAt(session?.date ?? ymd(new Date()));
  // With progression (update 3, §9): this block's versions, and each exercise's target from its last session
  const workout = useMemo(() => {
    if (free) {
      const items: Item[] = free.exercises.filter((x) => exById.has(x.exerciseId)).map((x) => {
        const ex = exById.get(x.exerciseId)!, t = prefs?.progress?.[ex.id]?.target;
        // A hold stays a hold: a saved 0 seconds falls back to the exercise's usual time, never to reps
        const timed = x.seconds != null;
        // From the builder, what the runner set there is used (the builder shows the progression target to start
        // from, so a changed value is a choice). A saved workout follows the progression target.
        const own = !free.templateId;
        const reps = own ? x.reps ?? t?.reps : t?.reps ?? x.reps, secs = own ? x.seconds || t?.seconds : t?.seconds ?? x.seconds, load = own ? x.weightKg ?? t?.load : t?.load ?? x.weightKg;
        const asTarget = !own || ((timed ? secs === t?.seconds : reps === t?.reps) && load === t?.load);
        return { id: ex.id, ex, sets: x.sets, reps: timed ? undefined : reps ?? ex.reps, seconds: timed ? secs || ex.seconds || 30 : undefined, load, note: asTarget ? noteInUnit(t?.note, unit) : undefined };
      });
      return { title: free.name, items };
    }
    return sp ? resolveStrength(sp, prefs, at) : undefined;
  }, [free, sp?.routine, sp?.intensity, sp?.custom, at.block, at.week, at.skips]); // eslint-disable-line react-hooks/exhaustive-deps
  const keepKey = liveWorkoutKey(free ? 'free:w' : id === 'free' ? `free:${params.get('routine') ?? 'A'}` : id ?? '');
  const [kept, setKept] = useState(() => readKept(keepKey));
  const [startedAt, setStartedAt] = useState(() => kept?.startedAt ?? Date.now());
  const [now, setNow] = useState(Date.now());
  const [idx, setIdx] = useState(kept?.idx ?? 0);
  // Pre-filled from the progression target (from the last session), otherwise with what was done last time
  const rowsFor = (x: Item): SetRow[] => {
    const last = prefs?.last?.[x.id];
    const hasTarget = !!prefs?.progress?.[x.id] || !!free;
    // The weight: today's target, else the stored target, else what was lifted last time. Never blank when a weight is known
    return Array.from({ length: x.sets }, (): SetRow => ({ reps: x.seconds ? undefined : hasTarget ? x.reps : last?.reps ?? x.reps, seconds: x.seconds ? (hasTarget ? x.seconds : last?.seconds ?? x.seconds) : undefined, load: hasTarget ? x.load ?? prefs?.progress?.[x.id]?.target?.load ?? last?.load : last?.load, done: false }));
  };
  const metaFor = (x: Item, rows: SetRow[]): Meta => {
    const was = lastSets(log, x.id)?.sets[0];
    if (was?.loadType === 'band') return { loadType: 'band', band: was.band ?? 'medium' };
    const loaded = rows.some((r) => r.load);
    return { loadType: x.ex.equipment === 'none' ? (loaded ? 'bodyweight_plus' : 'bodyweight') : loaded || defaultLoadType(x.ex) === 'added' ? 'added' : 'bodyweight' };
  };
  const [items, setItems] = useState<Item[]>(() => kept?.items ?? workout?.items ?? []);
  const [sets, setSets] = useState<SetRow[][]>(() => kept?.sets ?? (workout?.items ?? []).map(rowsFor));
  const [meta, setMeta] = useState<Meta[]>(() => kept?.meta ?? (workout?.items ?? []).map((x) => metaFor(x, rowsFor(x))));
  // The plan may still be loading on the first render: fill the sets in once the workout is there
  useEffect(() => { if (workout && !items.length && workout.items.length) { setItems(workout.items); setSets(workout.items.map(rowsFor)); setMeta(workout.items.map((x) => metaFor(x, rowsFor(x)))); } }, [workout]); // eslint-disable-line react-hooks/exhaustive-deps
  const [restLen, setRestLen] = useState(prefs?.rest ?? 60);
  const [restLeft, setRestLeft] = useState<number>();
  const [finished, setFinished] = useState(false);
  const [rpe, setRpe] = useState<number>();
  const [picker, setPicker] = useState<'swap' | 'add'>();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(kept?.notes ?? '');
  const [saveName, setSaveName] = useState('');
  const [savedAs, setSavedAs] = useState<string>();
  const beep = useRef(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // Kept for the tab once a set is done (nothing to keep before that)
  useEffect(() => {
    try {
      if (!sets.some((s) => s.some((x) => x.done))) { sessionStorage.removeItem(keepKey); return; }
      sessionStorage.setItem(keepKey, JSON.stringify({ startedAt, idx, items: items.map(({ ex: _ex, ...x }) => x), sets, meta, notes } satisfies Kept)); // eslint-disable-line @typescript-eslint/no-unused-vars
    } catch { /* storage may be off: the workout is then only on screen */ }
  }, [keepKey, startedAt, idx, items, sets, meta, notes]);
  useEffect(() => {
    if (restLeft == null) return;
    if (restLeft <= 0) { setRestLeft(undefined); if (!beep.current) { beep.current = true; try { navigator.vibrate?.(200); } catch { /* */ } } return; }
    const t = setTimeout(() => setRestLeft((x) => (x == null ? x : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  if (!workout || !items.length) return (
    <div className="stack-lg"><AppHeader title="Strength" back large={false} /><p className="muted">{id === 'free' && params.get('w') ? 'This workout is no longer open. Start it again from Strength.' : "This strength session isn't in your plan any more."}</p><Link to={id === 'free' ? '/strength' : '/'} className="btn">{id === 'free' ? 'Back to Strength' : 'Back to Training'}</Link></div>
  );
  const totalSets = sets.reduce((a, s) => a + s.length, 0);
  const doneSets = sets.reduce((a, s) => a + s.filter((x) => x.done).length, 0);
  const cur = items[idx], curSets = sets[idx] ?? [], curMeta = meta[idx] ?? { loadType: 'bodyweight' as LoadType };
  const nowSet = curSets.findIndex((x) => !x.done);
  const elapsed = Math.round((now - startedAt) / 1000);
  const hasKg = curMeta.loadType === 'added' || curMeta.loadType === 'bodyweight_plus';
  const was = lastSets(log, cur.id);
  // What gets saved for a set: its load only when the exercise is loaded with weight
  const asLog = (x: SetRow, m: Meta, ex: Exercise): SetLog => {
    const kg = m.loadType === 'added' || m.loadType === 'bodyweight_plus';
    return { reps: x.reps, seconds: x.seconds, load: kg && x.load ? x.load : undefined, loadType: kg && !x.load && ex.equipment === 'none' ? 'bodyweight' : m.loadType, band: m.loadType === 'band' ? m.band ?? 'medium' : undefined, perSide: ex.perSide || undefined, effort: x.effort };
  };
  const setRow = (j: number, p: Partial<SetRow>) => setSets((all) => all.map((s, i) => (i !== idx ? s : s.map((x, k) => (k === j ? { ...x, ...p } : x)))));
  // A change to the set you're on carries to the sets still to come
  const carry = (j: number, field: 'reps' | 'load' | 'seconds', v: number | undefined) => setSets((all) => all.map((s, i) => (i !== idx ? s : s.map((x, k) => (k === j || k > j && !x.done && j === nowSet ? { ...x, [field]: v } : x)))));
  const nudge = (d: number) => { if (nowSet < 0) return; const v = Math.max(0, Math.round((toUnit(curSets[nowSet].load ?? 0, unit) + d) * 100) / 100); carry(nowSet, 'load', v ? fromUnit(v, unit) : undefined); };
  const setType = (t: LoadType) => setMeta((all) => all.map((m, i) => (i === idx ? { loadType: t, band: t === 'band' ? m.band ?? 'medium' : undefined } : m)));
  const setDone = () => {
    if (nowSet < 0) return;
    setRow(nowSet, { done: true });
    beep.current = false;
    const lastOfEx = nowSet === curSets.length - 1;
    // After an exercise's last set: on to the next one that still has sets to do (those after it first, then any
    // skipped earlier). The workout only ends by itself when nothing is left anywhere.
    const open = lastOfEx ? [...items.keys()].filter((i) => i !== idx && sets[i]?.some((x) => !x.done)) : [];
    if (lastOfEx && !open.length) { setFinished(true); setRestLeft(undefined); return; }
    if (lastOfEx) setIdx(open.find((i) => i > idx) ?? open[0]);
    setRestLeft(restLen);
  };
  const pick = (ex: Exercise) => {
    const it: Item = { id: ex.id, ex, sets: picker === 'swap' ? curSets.length : ex.sets, reps: ex.seconds ? undefined : ex.reps ?? 10, seconds: ex.seconds, load: prefs?.last?.[ex.id]?.load };
    const rows = rowsFor(it);
    if (picker === 'swap') { setItems((a) => a.map((x, i) => (i === idx ? it : x))); setSets((a) => a.map((x, i) => (i === idx ? rows : x))); setMeta((a) => a.map((x, i) => (i === idx ? metaFor(it, rows) : x))); }
    else { setItems((a) => [...a, it]); setSets((a) => [...a, rows]); setMeta((a) => [...a, metaFor(it, rows)]); }
    setPicker(undefined);
  };
  const logged = items.map((x, i) => ({ id: x.id, name: x.ex.name, planned: sets[i].length, sets: sets[i].filter((y) => y.done).map((y) => asLog(y, meta[i], x.ex)) })).filter((x) => x.sets.length);
  const save = () => {
    setStrengthPrefs({ rest: restLen });
    try { sessionStorage.removeItem(keepKey); } catch { /* */ }
    saveStrength({ date: ymd(new Date(startedAt)), minutes: Math.max(1, Math.round(elapsed / 60)), rpe, strength: { title: workout.title, source: free ? 'free' : 'ritmo', sessionId: session?.id, templateId: free?.templateId, exercises: logged, notes: notes.trim() || undefined } });
    nav(session ? `/session/${session.id}` : '/');
  };

  if (finished) {
    const sum = sessionSummary(logged);
    return (
      <div className="stack-lg strength-summary">
        <AppHeader title="Workout done" large={false} />
        <section className="card row wrap" style={{ gap: 'var(--s5)' }} aria-label="Summary">
          <div><p className="caption">Time</p><p className="stat-xl" style={{ fontSize: 36 }}>{duration(elapsed)}</p></div>
          <div><p className="caption">Exercises</p><p className="stat" style={{ fontSize: 28 }}>{logged.length}</p></div>
          <div><p className="caption">Sets</p><p className="stat" style={{ fontSize: 28 }}>{doneSets}</p></div>
          {sum.volumeKg > 0 && <div><p className="caption">Volume</p><p className="stat" style={{ fontSize: 28 }}>{showVolume(logged.flatMap((x) => x.sets), unit)}</p></div>}
        </section>
        {logged.length > 0 && (
          <section className="card stack-sm" aria-label="What you did">
            <ul className="list">{logged.map((x) => <li key={x.id} className="list-item row-between"><span className="label">{x.name}</span><span className="caption">{exerciseSummary(x.sets, unit).text}</span></li>)}</ul>
            {sum.best && <p className="caption">Best set: {sum.best.name}, {showLoad(sum.best.load, unit)} × {sum.best.reps}. Estimated 1-rep max {showLoad(sum.best.e1rm, unit)}.</p>}
          </section>
        )}
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">How did it feel? Effort 1 to 10</legend>
          <div className="row wrap" style={{ gap: 6 }}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} type="button" className="chip" aria-pressed={rpe === n} onClick={() => setRpe(n)}>{n}</button>)}</div>
        </fieldset>
        {free && !free.templateId && logged.length > 0 && (
          <section className="card stack-sm" aria-label="Save as a workout">
            {savedAs ? <p className="label" role="status"><Check size={16} aria-hidden="true" /> Saved as "{savedAs}"</p> : <>
              <div className="field"><label htmlFor="sp-save-name">Save this as a workout, to start it again</label><input id="sp-save-name" className="input" maxLength={40} placeholder="Leg day" value={saveName} onChange={(e) => setSaveName(e.target.value)} /></div>
              <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!saveName.trim()} onClick={() => { const stored = freeName(prefs?.templates ?? [], saveName.trim()); saveTemplate({ name: stored, exercises: asTemplateExercises(logged) }); setSavedAs(stored); }}>Save as a workout</button>
            </>}
          </section>
        )}
        <button className="btn btn-primary" onClick={save}>Save workout</button>
        <p className="caption">It counts toward your streak and sessions done, and as light load in readiness. It never counts as running distance.</p>
      </div>
    );
  }

  const filled = curSets.map((x) => asLog(x, curMeta, cur.ex));
  const vol = exerciseSummary(filled, unit), lastVol = was ? exerciseSummary(was.sets, unit).volumeKg : 0;
  const pct = lastVol && vol.volumeKg ? Math.round((vol.volumeKg / lastVol - 1) * 100) : undefined;
  const doneLog = curSets.filter((x) => x.done).map((x) => asLog(x, curMeta, cur.ex));
  // The next-time advice only once every set of this exercise is done: sets still to come are not "missed"
  const next = doneLog.length && doneLog.length === curSets.length ? doubleProgression(cur.ex, doneLog, curSets.length, undefined, unit) : undefined;
  const types: LoadType[] = cur.ex.equipment === 'none' ? ['bodyweight', 'bodyweight_plus', 'band'] : ['added', 'bodyweight', 'band'];
  const timed = curSets.some((x) => x.seconds != null);

  return (
    <div className="stack strength-player">
      <AppHeader title={workout.title} back large={false} />
      {kept && (
        <p className="row-between caption" role="status"><span>Carried on from where you left it.</span>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => { const fresh = workout.items; setItems(fresh); setSets(fresh.map(rowsFor)); setMeta(fresh.map((x) => metaFor(x, rowsFor(x)))); setIdx(0); setNotes(''); setStartedAt(Date.now()); setKept(undefined); }}>Start again</button></p>
      )}
      <p className="row-between strength-head"><span className="stat" aria-label="Elapsed time">{duration(elapsed)}</span><span className="caption">{doneSets} of {totalSets} sets</span></p>
      <div className="progress" role="progressbar" aria-label="Workout progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((doneSets / Math.max(1, totalSets)) * 100)}><span style={{ width: `${(doneSets / Math.max(1, totalSets)) * 100}%` }} /></div>
      <section className="card stack-sm strength-now" aria-label="Current exercise">
        <span className="caption">Exercise {idx + 1} of {items.length}</span>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <ExerciseDemo pattern={cur.ex.pattern} name={cur.ex.name} muscles={cur.ex.muscles} weights={cur.ex.equipment === 'light' && !!cur.ex.tags?.includes('weights')} size={104} />
          <div className="stack-sm" style={{ gap: 2 }}>
            <h2 className="title">{cur.ex.name}</h2>
            <p className="caption">{cur.ex.cues[0]}{cur.ex.perSide ? ' · each side' : ''}</p>
            {cur.ex.load && <p className="caption">Load: {cur.ex.load}</p>}
            {cur.ex.muscles.length > 0 && <p className="caption works"><span className="works-dot" aria-hidden="true" />Works: {worksLabel(cur.ex.muscles)}</p>}
            {was && <p className="caption last-time">Last time: {lastLine(was.sets, unit)}</p>}
            {cur.note && <p className="caption progress-note">Today: {cur.note}</p>}
          </div>
        </div>
        <div className="row wrap load-types" role="group" aria-label="How it is loaded" style={{ gap: 6 }}>
          {types.map((t) => <button key={t} type="button" className="chip" aria-pressed={curMeta.loadType === t} onClick={() => setType(t)}>{t === 'bodyweight_plus' ? '+ Add load' : LOAD_LABEL[t]}</button>)}
          {hasKg && <span className="unit-tag">{unit}</span>}
        </div>
        {curMeta.loadType === 'band' && (
          <div className="row wrap" role="group" aria-label="Band" style={{ gap: 6 }}>
            {(['light', 'medium', 'heavy'] as Band[]).map((b) => <button key={b} type="button" className="chip" aria-pressed={(curMeta.band ?? 'medium') === b} onClick={() => setMeta((all) => all.map((m, i) => (i === idx ? { ...m, band: b } : m)))}>{b[0].toUpperCase() + b.slice(1)} band</button>)}
          </div>
        )}
        <div className={`set-table${hasKg ? '' : ' no-kg'}`} role="table" aria-label="Sets">
          <div className="set-head" role="row"><span role="columnheader">Set</span><span role="columnheader">Last time</span>{hasKg && <span role="columnheader">{unit}</span>}<span role="columnheader">{timed ? 'Sec' : 'Reps'}</span><span role="columnheader"><span className="sr-only">Done</span></span></div>
          {curSets.map((x, j) => {
            const l = was?.sets[j];
            return (
              <div key={j} role="row" className={`set-row${x.done ? ' done' : j === nowSet ? ' now' : ''}`} aria-current={j === nowSet ? 'step' : undefined}>
                <span role="cell" className="set-n">{j + 1}<span className="sr-only">{x.done ? ' Done' : j === nowSet ? ' Now' : ' Next'}: {x.seconds != null ? `${x.seconds} s` : `${x.reps ?? '–'} reps`}{hasKg && x.load ? ` · ${showLoad(x.load, unit)}` : ''}</span></span>
                <span role="cell" className="caption set-last">{l ? `${l.load ? `${toUnit(l.load, unit)} × ` : ''}${l.seconds ? `${l.seconds} s` : l.reps ?? '–'}` : '–'}</span>
                {hasKg && <span role="cell"><NumInput decimal label={`Set ${j + 1} weight in ${unit}`} placeholder="0" value={x.load ? toUnit(x.load, unit) : undefined} onChange={(v) => carry(j, 'load', v ? fromUnit(v, unit) : undefined)} /></span>}
                <span role="cell">{x.seconds != null
                  ? <NumInput label={`Set ${j + 1} seconds`} value={x.seconds} max={900} onChange={(v) => carry(j, 'seconds', v ?? 0)} />
                  : <NumInput label={`Set ${j + 1} reps`} value={x.reps} max={200} onChange={(v) => carry(j, 'reps', v)} />}</span>
                <span role="cell"><button type="button" className={`set-check${x.done ? ' on' : ''}`} aria-pressed={x.done} aria-label={`Set ${j + 1} done`} onClick={() => setRow(j, { done: !x.done })}>{x.done ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}</button></span>
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost btn-small add-set" onClick={() => setSets((all) => all.map((s, i) => (i !== idx ? s : [...s, { ...(s[s.length - 1] ?? { reps: cur.reps, seconds: cur.seconds, load: cur.load }), effort: undefined, done: false }])))}><Plus size={16} aria-hidden="true" />Add set</button>
        </div>
        {nowSet >= 0 && hasKg && (
          <div className="row wrap quick-load" role="group" aria-label={`Quick change for set ${nowSet + 1}`} style={{ gap: 6, alignItems: 'center' }}>
            {[-2.5, -1, 1, 2.5].map((d) => <button key={d} type="button" className="chip" aria-label={`${d > 0 ? 'Add' : 'Take off'} ${Math.abs(d)} ${unit}`} onClick={() => nudge(d)}>{d > 0 ? '+' : '−'}{Math.abs(d)}</button>)}
            <span className="caption">quick change for set {nowSet + 1}</span>
          </div>
        )}
        {nowSet >= 0 && (
          <div className="row wrap" role="group" aria-label={`Effort for set ${nowSet + 1}`} style={{ gap: 6, alignItems: 'center' }}>
            <span className="caption">Effort</span>
            {[5, 6, 7, 8, 9, 10].map((n) => <button key={n} type="button" className="chip chip-sm" aria-pressed={curSets[nowSet].effort === n} aria-label={`Effort ${n} out of 10`} onClick={() => setRow(nowSet, { effort: curSets[nowSet].effort === n ? undefined : n })}>{n}</button>)}
          </div>
        )}
        {vol.volumeKg > 0 && (
          <div className="volume-card" role="status" aria-label="Volume">
            <p className="row-between"><span className="label">Volume {showVolume(filled, unit)}</span>{pct != null && <span className="vs-last">{pct >= 0 ? '+' : ''}{pct}% vs last</span>}</p>
            <p className="caption">{vol.best ? `Best set: ${showLoad(vol.best.load, unit)} × ${vol.best.reps}, estimated 1-rep max ${showLoad(vol.best.e1rm, unit)}.` : ''}{next ? ` Next time: ${next.note}.` : ''}</p>
          </div>
        )}
      </section>
      {restLeft != null && (
        <section className="card row-between rest-timer" role="timer" aria-live="polite" aria-label="Rest">
          <span className="row" style={{ gap: 8 }}><Timer size={20} strokeWidth={2} aria-hidden="true" /><span className="label">Rest</span><span className="stat" style={{ fontSize: 28 }}>{restLeft} s</span></span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn btn-small" onClick={() => setRestLeft((x) => (x ?? 0) + 15)}>+15 s</button>
            <button className="btn btn-small btn-ghost" onClick={() => setRestLeft(undefined)}>Skip</button>
          </span>
        </section>
      )}
      <button className="btn btn-primary btn-block strength-set-done" onClick={setDone} disabled={nowSet < 0}><Check size={20} strokeWidth={2.2} aria-hidden="true" />Set done</button>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn-small" onClick={() => setPicker('swap')}>Swap</button>
        <button type="button" className="btn btn-small" onClick={() => setPicker('add')}>Add exercise</button>
        <button type="button" className="btn btn-small" aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}>Notes</button>
      </div>
      {notesOpen && <div className="field"><label htmlFor="sp-notes">Notes for this workout</label><textarea id="sp-notes" className="input" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>}
      <label className="row caption" style={{ gap: 8 }}>Rest between sets
        <select className="input" style={{ maxWidth: 110, minHeight: 40 }} value={restLen} onChange={(e) => setRestLen(Number(e.target.value))} aria-label="Rest between sets">
          {[30, 45, 60, 90, 120].map((s) => <option key={s} value={s}>{s} s</option>)}
        </select>
      </label>
      {items.length > 1 && (
        <section className="stack-sm" aria-label="Up next">
          <span className="label">Up next</span>
          {/* Every other exercise, those after this one first: an earlier one that was skipped can be opened again */}
          <ul className="list">{[...items.keys()].filter((i) => i > idx).concat([...items.keys()].filter((i) => i < idx)).map((i) => {
            const x = items[i], total = sets[i]?.length ?? x.sets, done = sets[i]?.filter((y) => y.done).length ?? 0;
            return <li key={`${x.id}-${i}`}><button className="list-item row-between" style={{ width: '100%' }} onClick={() => setIdx(i)}><span>{x.ex.name}</span><span className="row caption" style={{ gap: 4 }}>{done ? `${done} of ${total} sets done` : total === 1 ? '1 set' : `${total} sets`}<ChevronRight size={16} aria-hidden="true" /></span></button></li>;
          })}</ul>
        </section>
      )}
      <button className="btn btn-ghost" onClick={() => setFinished(true)}>Finish workout</button>
      {picker && (
        <Sheet open onClose={() => setPicker(undefined)} title={picker === 'swap' ? `Swap ${cur.ex.name}` : 'Add exercise'}>
          <ExerciseLibrary onPick={pick} picked={items.map((x) => x.id)} group={picker === 'swap' ? groupsOf(cur.ex)[0] : undefined} verb={picker === 'swap' ? 'Use' : 'Add'} />
        </Sheet>
      )}
    </div>
  );
}
