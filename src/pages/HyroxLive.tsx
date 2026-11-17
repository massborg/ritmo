// The HYROX live recorder (update 4, task 5): dark and full screen. Total time, a strip of the segments, the current
// segment with its timer and target, and one big button ("Station done → Run 5"). Undo, Pause and Pocket mode.
// Runs use GPS distance, or time only on a treadmill. A voice cue and a vibration at every change. The session is
// saved on the device after every tap, so a reload or a crash does not lose it.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pause, Play, Smartphone, Undo2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { PocketMode } from '../components/PocketMode';
import { advance, buttonLabel, clock, finish, pause, resume, roxzoneMs, segmentMs, segmentName, segmentWork, stopEarly, targetMs, totalMs, undo, type HyroxSession, type Live } from '../hyrox/hyrox';
import { clearLive, liveKey, loadLive, saveLive } from '../hyrox/live-store';
import { hasBackgroundGps, watchGps } from '../run/native-gps';
import { addFix, startTrack, type TrackState } from '../run/tracker';
import { cue } from '../run/cues';
import type { StationKey } from '../hyrox/hyroxDivisions';

const UNDO_MS = 3000;

export default function HyroxLive() {
  const { data, session, saveHyrox } = useApp();
  const nav = useNavigate();
  const key = liveKey(session?.user.id);
  const [live, setLiveState] = useState<Live | null>();
  const liveRef = useRef<Live | null>(undefined);
  const [now, setNow] = useState(Date.now());
  const [pocket, setPocket] = useState(false);
  const [undoUntil, setUndoUntil] = useState(0);
  const [gps, setGps] = useState<'ok' | 'searching' | 'denied'>('searching');
  const [rpe, setRpe] = useState<number>();
  const [notes, setNotes] = useState('');
  const track = useRef<TrackState | undefined>(undefined);
  const setLive = (l: Live) => { liveRef.current = l; setLiveState(l); void saveLive(key, l); };
  useEffect(() => { void loadLive(key).then((l) => { liveRef.current = l ?? null; setLiveState(l ?? null); }); }, [key]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(t); }, []);
  // Every 5 seconds as well as after every tap
  useEffect(() => { const t = window.setInterval(() => { if (liveRef.current && !liveRef.current.finishedAt) void saveLive(key, liveRef.current); }, 5000); return () => window.clearInterval(t); }, [key]);

  const outdoors = !!live && !live.indoor && live.plan.some((p) => p.kind === 'run');
  const running = !!live && !live.finishedAt;
  // GPS for outdoor runs: one track for the whole session; each run takes its own part of the distance
  useEffect(() => {
    if (!outdoors || !running) return;
    if (!hasBackgroundGps() && !('geolocation' in navigator)) { setGps('denied'); return; }
    if (!track.current) track.current = startTrack(Date.now());
    return watchGps((p) => { setGps('ok'); if (track.current) track.current = addFix(track.current, { t: p.t, lat: p.lat, lon: p.lon, acc: p.acc, alt: p.alt, speed: p.speed }, false); },
      (e) => setGps(e === 'denied' ? 'denied' : 'searching'), hasBackgroundGps());
  }, [outdoors, running]);
  // Keep the screen on
  useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    const n = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const take = () => { n.wakeLock?.request('screen').then((w) => { lock = w; }).catch(() => {}); };
    take();
    const vis = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release(); };
  }, [running]);

  if (live === undefined) return <div className="hyrox-live" aria-busy="true" />;
  if (live === null) return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <p className="muted">No HYROX session is being recorded.</p>
      <Link to="/hyrox" className="btn">Back to HYROX</Link>
    </div>
  );
  const sessions = (data.profile.log ?? []).filter((e) => e.kind === 'hyrox' && e.hyrox).map((e) => e.hyrox as HyroxSession);
  const gpsM = () => (outdoors ? track.current?.distanceM ?? 0 : 0);
  const say = (l: Live) => {
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* */ }
    if (l.finishedAt) { void cue('Session finished. Great work.'); return; }
    const p = l.plan[l.idx];
    void cue(l.phase === 'roxzone' ? `Roxzone. Next: ${segmentName(p)}.` : p.kind === 'run' ? `${segmentName(p)}. Go.` : p.kind === 'rest' ? 'Rest.' : `${segmentName(p)}. ${p.distanceM ? `${p.distanceM} metres` : p.reps ? `${p.reps} reps` : ''}.`);
  };
  const tap = () => { const l = advance(live, Date.now(), gpsM()); setLive(l); setUndoUntil(Date.now() + UNDO_MS); say(l); };
  const takeBack = () => { setLive(undo(live)); setUndoUntil(0); };
  const togglePause = () => setLive(live.pausedAt ? resume(live, Date.now()) : pause(live, Date.now()));
  const save = () => {
    const h = finish(live, { rpe, notes: notes.trim() || undefined });
    saveHyrox(h);
    void clearLive(key);
    nav(`/hyrox/session/${h.id}`, { replace: true });
  };
  const discard = () => { void clearLive(key); nav('/hyrox', { replace: true }); };

  if (live.finishedAt) return (
    <div className="hyrox-live hyrox-done">
      <p className="hx-eyebrow">{live.title}</p>
      <p className="hx-label">Finished</p>
      <p className="hx-total" data-testid="hx-total">{clock(live.done.reduce((a, s) => a + s.ms, 0))}</p>
      <fieldset className="hx-effort">
        <legend>How hard was it? Effort 1 to 10</legend>
        <div className="row wrap" style={{ gap: 6 }}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <button key={n} type="button" className="chip" aria-pressed={rpe === n} onClick={() => setRpe(n)}>{n}</button>)}</div>
      </fieldset>
      <label className="hx-notes"><span>Notes (optional)</span><textarea className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <button type="button" className="hx-main" onClick={save}>Save session</button>
      <div className="hx-foot">
        <button type="button" onClick={takeBack}><Undo2 size={18} aria-hidden="true" />Not finished: undo</button>
        <button type="button" onClick={discard}>Discard</button>
      </div>
    </div>
  );

  const p = live.plan[live.idx], next = live.plan[live.idx + 1];
  const inRox = live.phase === 'roxzone';
  const segT = segmentMs(live, now);
  const tgt = !inRox && p.kind !== 'rest' && !p.swapped ? targetMs(p.kind === 'run' ? 'run' : (p.key as StationKey), data.profile.hyrox, sessions) : undefined;
  const nDone = live.done.filter((s) => s.kind !== 'roxzone').length;
  const lastDone = [...live.done].reverse().find((s) => s.kind !== 'roxzone');
  const rox = roxzoneMs(live.done) + (inRox ? segT : 0);
  const canUndo = live.done.length > 0;
  const runM = p.kind === 'run' && outdoors ? Math.max(0, Math.round((track.current?.distanceM ?? 0) - live.segStartM)) : undefined;
  if (pocket) return (
    <PocketMode distance={clock(segT)} unit="" time={clock(totalMs(live, now))} pace={inRox ? 'Roxzone' : segmentName(p)} cueLine={`Swipe up, then tap "${buttonLabel(live)}"`} onUnlock={() => setPocket(false)} />
  );
  return (
    <div className="hyrox-live">
      <div className="row-between">
        <p className="hx-eyebrow">{live.title}</p>
        {outdoors ? <span className={`hx-gps ${gps}`} role="status">{gps === 'ok' ? 'GPS' : gps === 'denied' ? 'No GPS' : 'GPS…'}<span className="hx-dot" aria-hidden="true" /></span> : live.plan.some((x) => x.kind === 'run') ? <span className="hx-gps indoor">Treadmill</span> : null}
      </div>
      <p className="hx-label">Total</p>
      <p className="hx-total" data-testid="hx-total" aria-label="Total time">{clock(totalMs(live, now))}</p>
      <div className="hx-strip" role="img" aria-label={`Segment ${nDone + 1} of ${live.plan.length}`}>
        {live.plan.map((x, i) => <span key={i} className={i < live.idx ? 'done' : i === live.idx ? 'now' : x.kind === 'run' ? 'run' : ''} />)}
      </div>
      <p className="hx-progress">Segment {nDone + 1} of {live.plan.length}{lastDone ? ` · ${segmentName(lastDone).toLowerCase()} done ${clock(lastDone.ms)}` : ''}</p>
      {live.pausedAt && <p className="hx-paused" role="status">Paused. The clock is stopped.</p>}

      <section className="hx-card" aria-label="Current segment">
        <p className="hx-kind">{inRox ? 'Roxzone' : p.kind === 'run' ? `Run ${p.n}` : p.kind === 'rest' ? 'Rest' : live.mode === 'practice' ? `Repeat ${p.n}` : `Station ${p.n}`}{p.swapped && !inRox ? ' · swapped' : ''}</p>
        <h1 className="hx-name">{inRox ? `To ${segmentName(p).toLowerCase()}` : p.kind === 'run' ? `${(p.distanceM ?? 1000) >= 1000 ? `${(p.distanceM ?? 1000) / 1000} km` : `${p.distanceM} m`} run` : segmentName(p)}</h1>
        <p className="hx-work">{inRox ? 'Tap when you start the station' : p.kind === 'run' ? (runM != null ? `${runM} m so far` : live.indoor ? 'Treadmill or indoor: time only' : '') : segmentWork(p, live.division)}</p>
        <div className="row-between" style={{ alignItems: 'flex-end' }}>
          <div><p className="hx-small">{inRox ? 'Roxzone time' : p.kind === 'run' ? 'Run time' : p.kind === 'rest' ? 'Rest time' : 'Station time'}</p><p className="hx-seg" data-testid="hx-seg">{clock(segT)}</p></div>
          {tgt && <div style={{ textAlign: 'right' }}><p className="hx-small">{tgt.from === 'target' ? 'Your target' : 'Your best'}</p><p className="hx-target">{clock(tgt.ms)}</p></div>}
        </div>
      </section>
      <div className="hx-two">
        <div className="hx-mini"><p className="hx-small">{live.roxzone ? 'Roxzone so far' : 'Goal'}</p><p className="hx-mini-v">{live.roxzone ? clock(rox) : live.goalMs ? clock(live.goalMs) : '–'}</p></div>
        <div className="hx-mini"><p className="hx-small">Next</p><p className="hx-mini-v">{inRox ? segmentName(p) : next ? `${segmentName(next)}${next.kind === 'run' && next.distanceM ? ` · ${next.distanceM >= 1000 ? `${next.distanceM / 1000} km` : `${next.distanceM} m`}` : ''}` : 'Finish'}</p></div>
      </div>
      <button type="button" className="hx-main" onClick={tap} disabled={!!live.pausedAt}>{buttonLabel(live)}</button>
      <div className="hx-foot">
        <button type="button" onClick={togglePause} aria-pressed={!!live.pausedAt}>{live.pausedAt ? <><Play size={18} aria-hidden="true" />Resume</> : <><Pause size={18} aria-hidden="true" />Pause</>}</button>
        <button type="button" onClick={takeBack} disabled={!canUndo} className={now < undoUntil ? 'hot' : ''}><Undo2 size={18} aria-hidden="true" />Undo</button>
        <button type="button" onClick={() => setPocket(true)}><Smartphone size={18} aria-hidden="true" />Pocket mode</button>
      </div>
      {live.pausedAt && <button type="button" className="hx-end" onClick={discard}>End without saving</button>}
      {live.pausedAt && nDone > 0 && <button type="button" className="hx-end" onClick={() => setLive(stopEarly(live, Date.now()))}>Stop here and save what is done</button>}
    </div>
  );
}
