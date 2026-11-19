// "Workout in progress" (update 5, U6): a card on Activity and Training, and a small bar on every other screen,
// with Resume, Finish and save, and Discard. A workout left for more than 12 hours is never deleted silently:
// the card asks whether to save what was done.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { WORKOUT_EVENT, clearActive, currentActive, doneSets, isStale, loggedOf, minutesOf, totalSets, type ActiveWorkout } from '../training/active-workout';
import { duration, parseYmd, ymd } from '../lib/format';

/** The workout in progress, kept up to date as it changes (in this tab, another tab, or the account) */
export function useActiveWorkout(): { active?: ActiveWorkout; now: number; finish: () => void; discard: () => void } {
  const { data, session, saveStrength, setStrengthPrefs } = useApp();
  const uid = session?.user.id ?? 'me';
  const fromAccount = data.profile.strength?.active;
  const [active, setActive] = useState<ActiveWorkout | undefined>(() => currentActive(uid, fromAccount));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const read = () => setActive(currentActive(uid, fromAccount));
    read();
    window.addEventListener(WORKOUT_EVENT, read);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener(WORKOUT_EVENT, read); window.removeEventListener('storage', read); };
  }, [uid, fromAccount]);
  useEffect(() => { if (!active) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [!!active]); // eslint-disable-line react-hooks/exhaustive-deps
  const drop = () => { clearActive(uid); if (fromAccount) setStrengthPrefs({ active: undefined }); setActive(undefined); };
  const finish = () => {
    if (!active) return;
    const exercises = loggedOf(active);
    if (exercises.length) saveStrength({ date: ymd(new Date(active.startedAt)), minutes: minutesOf(active), strength: { title: active.title, source: active.source === 'plan' ? 'ritmo' : 'free', sessionId: active.sessionId, templateId: active.templateId, exercises, notes: active.notes.trim() || undefined } });
    drop();
  };
  const discard = () => { if (window.confirm('Discard this workout? The sets you did will not be saved.')) drop(); };
  return { active, now, finish, discard };
}

const dayWord = (ms: number, now: number) => { const d = ymd(new Date(ms)); return d === ymd(new Date(now)) ? 'today' : `on ${parseYmd(d).toLocaleDateString('en-GB', { weekday: 'short' })}`; };

/** The card on Activity and Training */
export function WorkoutInProgress() {
  const { active, now, finish, discard } = useActiveWorkout();
  const nav = useNavigate();
  if (!active) return null;
  const done = doneSets(active), total = totalSets(active);
  if (isStale(active, now)) return (
    <section className="workout-live stale" aria-label="Unfinished workout">
      <p className="workout-live-eyebrow">Unfinished workout</p>
      <h2 className="workout-live-title">{active.title}</h2>
      <p className="workout-live-sub">{done ? `Save the ${done} set${done === 1 ? '' : 's'} you did ${dayWord(active.startedAt, now)}?` : `Started ${dayWord(active.startedAt, now)}, with no sets done.`}</p>
      <div className="row wrap" style={{ gap: 8 }}>
        {done > 0 && <button type="button" className="btn btn-primary" onClick={finish}>Save what I did</button>}
        <button type="button" className="btn workout-live-btn" onClick={() => nav(active.route)}>Carry on</button>
        <button type="button" className="btn btn-ghost workout-live-ghost" onClick={discard}>Discard</button>
      </div>
    </section>
  );
  const exDone = active.sets.filter((s) => s.every((x) => x.done)).length;
  return (
    <section className="workout-live" aria-label="Workout in progress">
      <p className="workout-live-eyebrow row-between"><span>Workout in progress</span><span className="workout-live-clock" role="timer" aria-live="off">{duration(Math.max(0, Math.round((now - active.startedAt) / 1000)))}</span></p>
      <h2 className="workout-live-title">{active.title}</h2>
      <p className="workout-live-sub">Exercise {Math.min(active.items.length, exDone + 1)} of {active.items.length} · {done} of {total} sets done · started {new Date(active.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => nav(active.route)}>Resume</button>
        <button type="button" className="btn workout-live-btn" style={{ flex: 1 }} disabled={!done} onClick={finish}>Finish and save</button>
      </div>
      <button type="button" className="workout-live-link" onClick={discard}>Discard workout</button>
    </section>
  );
}

/** The small bar on every other screen while a workout is running */
export function WorkoutBar() {
  const { active, now } = useActiveWorkout();
  const nav = useNavigate();
  const { pathname } = useLocation();
  // Not on the recorder itself, nor where the card already shows
  // nor on the recording screens, whose own Start button sits where the bar would be (Activity is one tap away)
  const hidden = ['/', '/record', '/setup', '/strength', '/other'].includes(pathname) || ['/strength/', '/run', '/hyrox'].some((p) => pathname.startsWith(p));
  if (!active || isStale(active, now) || hidden) return null;
  return (
    <button type="button" className="workout-bar" onClick={() => nav(active.route)} aria-label={`Workout in progress: ${active.title}. Resume`}>
      <span className="workout-bar-dot" aria-hidden="true" /><span className="workout-bar-title">{active.title}</span>
      <span className="workout-bar-clock">{duration(Math.max(0, Math.round((now - active.startedAt) / 1000)))}</span><span className="workout-bar-go">Resume</span>
    </button>
  );
}
