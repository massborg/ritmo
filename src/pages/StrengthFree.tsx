// Free strength (update 4, task 4): saved workouts, favourites first, each with Start; and a builder to pick
// exercises from the library, set sets × reps (or time) × weight, reorder, then start it or save it as a workout.
// With ?log=1 it is "Pick exercises" from "Log strength session": the same builder, saved to the log after the fact.
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, MoreHorizontal, Play, Star, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Chips, DateField, Sheet, Stepper } from '../components/inputs';
import { StatusLine } from '../components/ui';
import { ExerciseLibrary, NumInput, exclusionNote, stashWorkout, startTemplate } from '../components/StrengthBits';
import { exById, type Exercise } from '../training/strength';
import { MAX_FAVOURITES, defaultLoadType, freeName, nextSessionName, fromUnit, sortTemplates, templateLine, toUnit, type StrengthTemplate, type TemplateExercise, type WeightUnit } from '../training/strength-load';
import { longDate, parseYmd, ymd } from '../lib/format';

export default function StrengthFree() {
  const { data, plan, saveTemplate, deleteTemplate, duplicateTemplate, starTemplate, saveStrength, scheduleTemplate } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const logMode = params.get('log') === '1';
  const prefs = data.profile.strength ?? {};
  const unit: WeightUnit = prefs.units ?? 'kg';
  const templates = sortTemplates((prefs.templates ?? []).filter((t) => t.exercises.some((x) => exById.has(x.exerciseId))));
  const [list, setList] = useState<TemplateExercise[]>([]);
  const [editing, setEditing] = useState<StrengthTemplate>();
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const [menu, setMenu] = useState<StrengthTemplate>();
  const [rename, setRename] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [added, setAdded] = useState<string>();
  // In log mode: the saved workout the list came from, so the logged session counts as that workout
  const [fromTemplate, setFromTemplate] = useState<string>();
  const [schedDate, setSchedDate] = useState<string>();
  // Log-after mode
  const [date, setDate] = useState(ymd(new Date()));
  const [minutes, setMinutes] = useState<number | undefined>(45);
  const [rpe, setRpe] = useState(6);

  // A new row starts from the exercise's progression target (what Ritmo would give next), else from last time
  const add = (e: Exercise) => {
    const t = prefs.progress?.[e.id]?.target;
    setList((l) => [...l, { exerciseId: e.id, sets: e.sets, reps: e.seconds ? undefined : t?.reps ?? e.reps ?? 10, seconds: e.seconds ? t?.seconds ?? e.seconds : undefined, weightKg: e.equipment === 'none' ? t?.load : t?.load ?? prefs.last?.[e.id]?.load }]);
    setMsg(undefined);
  };
  const patch = (i: number, p: Partial<TemplateExercise>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  // A row counts when it has sets, and a hold has a time (an emptied Seconds field is not a 0-second hold)
  const valid = list.filter((x) => exById.has(x.exerciseId) && x.sets > 0 && !(x.seconds != null && x.seconds <= 0));
  const start = (w: { name: string; templateId?: string; exercises: TemplateExercise[] }) => { stashWorkout(w); nav('/strength/free?w=1'); };
  const use = (t: StrengthTemplate) => {
    if (logMode) { setList(t.exercises.filter((x) => exById.has(x.exerciseId))); setName(t.name); setFromTemplate(t.id); setMsg(`"${t.name}" loaded. Change anything that was different, then save.`); return; }
    start({ name: t.name, templateId: t.id, exercises: t.exercises.filter((x) => exById.has(x.exerciseId)) });
  };
  const edit = (t: StrengthTemplate) => { setEditing(t); setList(t.exercises.filter((x) => exById.has(x.exerciseId))); setName(t.name); setMenu(undefined); setMsg(undefined); window.scrollTo({ top: 0 }); };
  const saveWorkout = () => {
    // The name as it is stored: a name already taken gets a number ("Core 2"), and the message says so
    const others = (prefs.templates ?? []).filter((x) => x.id !== editing?.id);
    // No name given: "Strength session 1", then 2, 3…
    const stored = name.trim() ? freeName(others, name.trim()) : nextSessionName(others);
    saveTemplate({ id: editing?.id, name: stored, exercises: valid });
    setMsg(editing ? `"${stored}" updated.` : `Saved as "${stored}". It is in your saved workouts.`);
    setEditing(undefined); setList([]); setName(''); setNaming(false);
  };
  const saveLog = () => {
    // Logged on a day with a planned strength session: it counts as that session
    const planned = plan?.sessions.find((s) => s.date === date && s.strengthPlan && !(data.profile.log ?? []).some((e) => e.kind === 'strength' && e.strength?.sessionId === s.id));
    saveStrength({ date, minutes: minutes ?? 30, rpe, strength: { title: name.trim() || 'Strength session', source: 'manual', sessionId: planned?.id, templateId: fromTemplate, exercises: valid.map((x) => {
      const ex = exById.get(x.exerciseId)!;
      return { id: ex.id, name: ex.name, planned: x.sets, sets: Array.from({ length: x.sets }, () => ({ reps: x.reps, unit: ex.unit, seconds: x.seconds, load: x.weightKg || undefined, loadType: x.weightKg ? (ex.equipment === 'none' ? 'bodyweight_plus' as const : 'added' as const) : defaultLoadType(ex), perSide: ex.perSide || undefined })) };
    }) } });
    nav('/');
  };
  const stars = templates.filter((t) => t.favourite).length;
  useEffect(() => { if (!added) return; const t = window.setTimeout(() => setAdded(undefined), 5000); return () => window.clearTimeout(t); }, [added]);
  // Opened from elsewhere for one workout: "Log as done" loads it, "More" opens its menu
  useEffect(() => {
    const t = templates.find((x) => x.id === params.get('t')), m = templates.find((x) => x.id === params.get('menu'));
    if (logMode && t) { setList(t.exercises.filter((x) => exById.has(x.exerciseId))); setName(t.name); setFromTemplate(t.id); setMsg(`"${t.name}" loaded. Change anything that was different, then save.`); }
    if (m) setMenu(m);
  }, [params.get('t'), params.get('menu'), templates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack-lg strength-free" style={{ maxWidth: 720 }}>
      <AppHeader title={logMode ? 'Log strength session' : editing ? 'Edit workout' : 'Strength'} eyebrow={logMode ? 'Pick the exercises you did' : editing ? editing.name : 'Your own workout'} back />
      {msg && <StatusLine kind="success">{msg}</StatusLine>}

      {!editing && (
        <section className="stack-sm" aria-labelledby="sf-saved">
          <h2 id="sf-saved" className="title">Saved workouts</h2>
          {templates.length ? (
            <ul className="template-list">
              {templates.map((t) => (
                <li key={t.id} className={`card template-card${t.favourite ? ' fav' : ''}`}>
                  <div className="row-between" style={{ alignItems: 'flex-start', gap: 8 }}>
                    <span className="stack-sm" style={{ gap: 0, minWidth: 0 }}>
                      <span className="label template-name">{t.name}</span>
                      <span className="caption">{templateLine(t)}</span>
                    </span>
                    <span className="row" style={{ gap: 0 }}>
                      <button type="button" className="icon-btn" aria-pressed={t.favourite} aria-label={t.favourite ? `Remove ${t.name} from favourites` : `Make ${t.name} a favourite`}
                        onClick={() => { if (!starTemplate(t.id)) setMsg(`You can star up to ${MAX_FAVOURITES} favourites. Remove a star first.`); else setMsg(undefined); }}><Star size={20} fill={t.favourite ? 'var(--accent)' : 'none'} color={t.favourite ? 'var(--accent)' : 'currentColor'} /></button>
                      <button type="button" className="icon-btn" aria-label={`More for ${t.name}`} onClick={() => { setMenu(t); setRename(undefined); setConfirmDelete(false); }}><MoreHorizontal size={20} /></button>
                    </span>
                  </div>
                  <p className="caption template-ex">{t.exercises.map((x) => exById.get(x.exerciseId)?.name).filter(Boolean).join(' · ')}</p>
                  <button type="button" className={`btn ${t.favourite ? 'btn-primary' : ''}`} aria-label={`${logMode ? 'Use' : 'Start'} ${t.name}`} onClick={() => use(t)}>{!logMode && <Play size={18} strokeWidth={2.2} aria-hidden="true" />}{logMode ? 'Use this' : 'Start'}</button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">None yet. Build a workout below and save it: it will be here with a Start button. You can star {MAX_FAVOURITES} favourites to keep them first.</p>}
          {templates.length > 0 && <p className="caption">{stars} of {MAX_FAVOURITES} favourites starred. Favourites come first.</p>}
        </section>
      )}

      <section className="card stack" aria-labelledby="sf-build">
        <h2 id="sf-build" className="title">{logMode ? 'What you did' : editing ? 'Exercises' : 'Build a workout'}</h2>
        {list.length ? (
          <ol className="build-list">
            {list.map((x, i) => {
              const ex = exById.get(x.exerciseId)!;
              const note = exclusionNote(ex, prefs.never ?? [], prefs.equipment ?? 'none');
              return (
                <li key={`${x.exerciseId}-${i}`} className="build-row">
                  <div className="row-between" style={{ gap: 8 }}>
                    <span className="stack-sm" style={{ gap: 0, minWidth: 0 }}><span className="label">{i + 1}. {ex.name}{ex.custom && <span className="mine-tag">Mine</span>}</span>{(ex.perSide || note) && <span className="caption">{[ex.perSide ? 'each side' : '', note ?? ''].filter(Boolean).join(' · ')}</span>}</span>
                    <span className="row" style={{ gap: 0 }}>
                      <button type="button" className="icon-btn" aria-label={`Move ${ex.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={18} /></button>
                      <button type="button" className="icon-btn" aria-label={`Move ${ex.name} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={18} /></button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${ex.name}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
                    </span>
                  </div>
                  <div className="build-dose">
                    <label><span className="caption">Sets</span><NumInput label={`Sets of ${ex.name}`} value={x.sets} max={10} onChange={(v) => patch(i, { sets: v ?? 0 })} /></label>
                    <span className="build-x" aria-hidden="true">×</span>
                    {x.seconds != null
                      ? <label><span className="caption">Seconds</span><NumInput label={`Seconds of ${ex.name}`} value={x.seconds} max={600} onChange={(v) => patch(i, { seconds: v ?? 0 })} /></label>
                      : <label><span className="caption">{ex.unit === 'm' ? 'Metres' : 'Reps'}</span><NumInput label={`${ex.unit === 'm' ? 'Metres' : 'Reps'} of ${ex.name}`} value={x.reps} max={ex.unit === 'm' ? 2000 : 100} onChange={(v) => patch(i, { reps: v })} /></label>}
                    <span className="build-x" aria-hidden="true">×</span>
                    <label><span className="caption">{unit}</span><NumInput decimal label={`Weight for ${ex.name} in ${unit}`} placeholder={ex.equipment === 'none' ? 'none' : '0'} value={x.weightKg ? toUnit(x.weightKg, unit) : undefined} onChange={(v) => patch(i, { weightKg: v ? fromUnit(v, unit) : undefined })} /></label>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="muted">Add exercises from the library below.</p>}

        {logMode ? (
          <div className="stack">
            <div className="field"><label htmlFor="sf-name">Name (optional)</label><input id="sf-name" className="input" value={name} maxLength={40} placeholder="Strength session" onChange={(e) => setName(e.target.value)} /></div>
            <DateField id="sf-date" label="Date" value={date} onChange={setDate} />
            <Stepper id="sf-min" label="Duration" value={minutes} min={5} max={240} step={5} unit="min" onChange={setMinutes} />
            <Chips<number> label="Effort, 1 easy to 10 all out" value={rpe} onChange={setRpe} options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ value: v, label: String(v) }))} />
            <button type="button" className="btn btn-primary btn-block" disabled={!valid.length || !minutes} onClick={saveLog}>Save to my log</button>
          </div>
        ) : naming || editing ? (
          <div className="stack-sm">
            <div className="field"><label htmlFor="sf-name">Workout name</label><input id="sf-name" className="input" value={name} maxLength={40} placeholder={nextSessionName((prefs.templates ?? []).filter((x) => x.id !== editing?.id))} autoFocus={naming} onChange={(e) => setName(e.target.value)} aria-describedby="sf-name-help" /><p id="sf-name-help" className="caption">Leave it empty and it is named for you.</p></div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary" disabled={!valid.length} onClick={saveWorkout}>{editing ? 'Save changes' : 'Save workout'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setNaming(false); if (editing) { setEditing(undefined); setList([]); setName(''); } }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={!valid.length} onClick={() => start({ name: 'Strength workout', exercises: valid })}><Play size={18} strokeWidth={2.2} aria-hidden="true" />Start workout</button>
            <button type="button" className="btn" disabled={!valid.length} onClick={() => setNaming(true)}>Save as a workout</button>
          </div>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="sf-lib">
        <h2 id="sf-lib" className="title">Add exercises</h2>
        <ExerciseLibrary onPick={(e) => { add(e); setAdded(`Added ${e.name} (${list.length + 1} in workout)`); }} picked={list.map((x) => x.exerciseId)} />
        <p className="caption">Exercises on your "Never give me" list, or that need equipment you don't have, are marked, not hidden: it is your workout, so you can still add them. Change both in Profile, Strength.</p>
      </section>

      {/* Adding from far down the list: say it worked, and offer the way back up to the workout */}
      {added && (
        <div className="toast toast-action" role="status" aria-live="polite">
          <span>{added}</span>
          <button type="button" className="toast-btn" onClick={() => { setAdded(undefined); document.getElementById('sf-build')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>View</button>
        </div>
      )}
      {menu && (
        <Sheet open onClose={() => { setMenu(undefined); setSchedDate(undefined); }} title={menu.name}>
          {rename != null ? (
            <div className="stack">
              <div className="field"><label htmlFor="sf-rename">New name</label><input id="sf-rename" className="input" autoFocus maxLength={40} value={rename} onChange={(e) => setRename(e.target.value)} /></div>
              <button type="button" className="btn btn-primary btn-block" disabled={!rename.trim()} onClick={() => { const stored = freeName((prefs.templates ?? []).filter((x) => x.id !== menu.id), rename.trim()); saveTemplate({ id: menu.id, name: stored, exercises: menu.exercises }); setMsg(`Renamed to "${stored}".`); setMenu(undefined); }}>Save name</button>
            </div>
          ) : confirmDelete ? (
            <div className="stack">
              <p>Delete "{menu.name}"? Sessions you recorded with it stay in your history.</p>
              <button type="button" className="btn btn-danger btn-block" onClick={() => { deleteTemplate(menu.id); setMenu(undefined); }}>Delete workout</button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          ) : (
            <div className="stack-sm">
              <button type="button" className="btn btn-primary btn-block" onClick={() => { setMenu(undefined); startTemplate(menu, nav); }}><Play size={18} strokeWidth={2.2} aria-hidden="true" />Start now</button>
              {schedDate != null ? (
                <div className="card stack-sm">
                  <DateField id="sf-sched" label="Do it on" value={schedDate} min={ymd(new Date())} onChange={setSchedDate} />
                  <button type="button" className="btn btn-block" onClick={() => { scheduleTemplate(menu.id, schedDate); setMsg(`"${menu.name}" is on ${longDate(parseYmd(schedDate))}. It shows on Training that day with a Start button.`); setSchedDate(undefined); setMenu(undefined); }}>Schedule</button>
                </div>
              ) : <button type="button" className="btn btn-block" onClick={() => setSchedDate(ymd(new Date()))}>Schedule on a date</button>}
              <button type="button" className="btn btn-block" onClick={() => { const t = menu; setMenu(undefined); nav(`/strength?log=1&t=${t.id}`); }}>Log as done (already did it)</button>
              <button type="button" className="btn btn-block" onClick={() => edit(menu)}>Edit exercises</button>
              <button type="button" className="btn btn-block" onClick={() => setRename(menu.name)}>Rename</button>
              <button type="button" className="btn btn-block" onClick={() => { duplicateTemplate(menu.id); setMenu(undefined); }}>Duplicate</button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => setConfirmDelete(true)}>Delete</button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
