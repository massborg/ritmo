// The Run tab (review #2 §3): record a run with the phone's GPS, follow today's planned session step by step
// with spoken cues, then save it as a Ritmo run and see the feedback. Open to everyone (Quick run on the Training
// page); the Run tab in the tab bar is still behind the "run_tab" flag.
// Honest about the web: a browser may pause GPS when the screen locks, so Ritmo keeps the screen on and says so.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Flag, Lock, Pause, Play, Square, Unlock } from 'lucide-react';
import { get, set, del } from 'idb-keyval';
import { useApp } from '../app/AppContext';
import { fitView, mapsOn, setMapsOn, TILE } from '../lib/maptiles';
import { AppHeader } from '../components/app';
import { Chips } from '../components/inputs';
import { Segmented, StatusLine } from '../components/ui';
import { dist, duration, pace as fmtPace, paceRange, ymd } from '../lib/format';
import { addFix, addLap, avgPace, currentPace, paceGauge, setPaused, startTrack, stepLeft, stepsFor, toStreams, type TrackState, type WorkStep } from '../run/tracker';
import type { Lap } from '../lib/types';

type Phase = 'ready' | 'countdown' | 'running' | 'summary';
interface Settings { cues: 'km' | 'steps' | 'off'; countdown: 3 | 5 | 10; autoPause: boolean; screenOn: boolean }
const DEFAULTS: Settings = { cues: 'steps', countdown: 5, autoPause: true, screenOn: true };
interface Saved { track: TrackState; sessionId?: string; stepIdx: number; stepStart: { s: number; m: number }; savedAt: number }

const say = (text: string, on: boolean) => {
  if (!on || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB'; u.rate = 1.05;
  window.speechSynthesis.speak(u);
};

export default function RunPage() {
  const { plan, today, data, saveRecordedRun, session } = useApp();
  const nav = useNavigate();
  const U = data.profile.units;
  const key = `ritmo:run:active:${session?.user.id ?? 'anon'}`;
  const todays = plan?.sessions.find((s) => s.date === ymd(today) && s.type !== 'rest' && s.status !== 'done');
  // "Quick run" on the Training page: a free run that starts by itself once GPS is ready
  const [params, setParams] = useSearchParams();
  const quick = params.get('quick') === '1';
  const [autoStart, setAutoStart] = useState(quick);
  const [what, setWhat] = useState<'planned' | 'free'>(todays && !quick ? 'planned' : 'free');
  const [settings, setSettings] = useState<Settings>(() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('ritmo:run:settings') ?? '{}') }; } catch { return DEFAULTS; } });
  const [phase, setPhase] = useState<Phase>('ready');
  const [acc, setAcc] = useState<number>();
  const [gpsErr, setGpsErr] = useState<string>();
  const [count, setCount] = useState(0);
  const [track, setTrack] = useState<TrackState>();
  const [locked, setLocked] = useState(false);
  const [unfinished, setUnfinished] = useState<Saved>();
  const [stepIdx, setStepIdx] = useState(0);
  const stepStart = useRef({ s: 0, m: 0 });
  const stepIdxRef = useRef(0);
  const trackRef = useRef<TrackState | undefined>(undefined);
  const lastKm = useRef(0);
  const lastGaugeCue = useRef(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const sessionPlan = what === 'planned' ? todays : undefined;
  const steps: WorkStep[] = sessionPlan ? stepsFor(sessionPlan) : [];
  const cues = settings.cues !== 'off';

  useEffect(() => { try { localStorage.setItem('ritmo:run:settings', JSON.stringify(settings)); } catch { /* ignore */ } }, [settings]);
  // An unfinished run saved on this device (the app closed or crashed mid-run)
  useEffect(() => { get(key).then((v) => { if (v) setUnfinished(v as Saved); }).catch(() => {}); }, [key]);

  // GPS: watch position from the moment the tab opens, so the fix is ready by the time the runner starts
  useEffect(() => {
    if (!('geolocation' in navigator)) { setGpsErr('This device has no GPS that Ritmo can use.'); return; }
    const id = navigator.geolocation.watchPosition((p) => {
      setAcc(p.coords.accuracy); setGpsErr(undefined);
      const t = trackRef.current;
      if (!t) return;
      const next = addFix(t, { t: p.timestamp, lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude, speed: p.coords.speed }, settings.autoPause);
      trackRef.current = next; setTrack(next);
    }, (e) => setGpsErr(e.code === 1 ? 'Location is blocked. Allow location for Ritmo in your browser or phone settings.' : 'Searching for GPS…'), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [settings.autoPause]);

  // Keep the screen on while running (where the browser allows it)
  useEffect(() => {
    if (phase !== 'running' || !settings.screenOn) return;
    const nav2 = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav2.wakeLock?.request('screen').then((w) => { wake.current = w; }).catch(() => {});
    return () => { void wake.current?.release(); wake.current = null; };
  }, [phase, settings.screenOn]);

  // Every second: clock, steps, cues; every 5 seconds: save on the device
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => {
      const t = trackRef.current;
      if (!t) return;
      const now = { ...t, elapsedS: (Date.now() - t.startedAt) / 1000 };
      trackRef.current = now; setTrack(now);
      // spoken kilometre splits
      if (settings.cues === 'km' || settings.cues === 'steps') {
        const km = Math.floor(now.distanceM / (U === 'km' ? 1000 : 1609.344));
        if (km > lastKm.current) { lastKm.current = km; const ap = avgPace(now); say(`${km} ${U === 'km' ? 'kilometre' : 'mile'}${km > 1 ? 's' : ''}. Average pace ${ap ? fmtPace(ap, U, false).replace(':', ' ') : ''}.`, cues); }
      }
      // workout steps
      if (steps.length && settings.cues !== 'off') {
        const st = steps[stepIdxRef.current];
        const left = st && stepLeft(st, stepStart.current.s, stepStart.current.m, now.movingS, now.distanceM);
        if (st && left?.complete && stepIdxRef.current < steps.length - 1) {
          const ni = stepIdxRef.current + 1;
          stepIdxRef.current = ni; setStepIdx(ni);
          stepStart.current = { s: now.movingS, m: now.distanceM };
          const n = steps[ni];
          say(n.kind === 'work' ? `${n.label}. Go.` : n.kind === 'recovery' ? `Recovery. ${n.durationS ? `${Math.round(n.durationS / 60 * 10) / 10} minutes easy.` : 'Easy.'}` : n.label, cues);
        }
        // "4 seconds too fast", at most every 30 seconds during a rep
        const cur = steps[stepIdxRef.current];
        const p = currentPace(now);
        const g = paceGauge(p, cur?.pace);
        if (cur?.kind === 'work' && g && g !== 'ok' && Date.now() - lastGaugeCue.current > 30000) {
          lastGaugeCue.current = Date.now();
          const off = g === 'fast' ? Math.round(cur.pace![0] - p!) : Math.round(p! - cur.pace![1]);
          say(`You're ${off} seconds too ${g === 'fast' ? 'fast' : 'slow'}.`, cues);
        }
      }
      if (Math.floor(now.elapsedS) % 5 === 0) void set(key, { track: now, sessionId: sessionPlan?.id, stepIdx: stepIdxRef.current, stepStart: stepStart.current, savedAt: Date.now() } satisfies Saved).catch(() => {});
    }, 1000);
    return () => window.clearInterval(id);
  });

  const begin = () => {
    setPhase('countdown'); setCount(settings.countdown);
    let n = settings.countdown;
    say(String(n), cues);
    const id = window.setInterval(() => {
      n--;
      if (n <= 0) {
        window.clearInterval(id);
        const t = startTrack(Date.now());
        trackRef.current = t; setTrack(t);
        stepIdxRef.current = 0; setStepIdx(0); stepStart.current = { s: 0, m: 0 }; lastKm.current = 0;
        setPhase('running');
        say(steps.length ? `Go. ${steps[0].label}.` : 'Go.', cues);
      } else { setCount(n); say(String(n), cues); }
    }, 1000);
  };
  const ready0 = acc != null && acc <= 20;
  useEffect(() => {
    if (!autoStart || phase !== 'ready' || unfinished || !ready0) return;
    setAutoStart(false); setParams({}, { replace: true }); begin();
  });
  const cancelQuick = () => { setAutoStart(false); setParams({}, { replace: true }); };
  const togglePause = () => { const t = trackRef.current; if (!t) return; const n = setPaused(t, !t.paused); trackRef.current = n; setTrack(n); say(n.paused ? 'Paused.' : 'Resumed.', cues); };
  const lap = () => {
    const t = trackRef.current; if (!t) return;
    const n = addLap(t); trackRef.current = n; setTrack(n);
    if (steps.length && stepIdxRef.current < steps.length - 1) { const ni = stepIdxRef.current + 1; stepIdxRef.current = ni; setStepIdx(ni); stepStart.current = { s: n.movingS, m: n.distanceM }; say(steps[ni].label, cues); }
  };
  const finish = () => { setPhase('summary'); say('Run finished.', cues); };
  const lapsOf = (t: TrackState): Lap[] => {
    const marks = [...t.laps, { atS: t.movingS, atM: t.distanceM }];
    let ps = 0, pm = 0;
    return t.laps.length ? marks.map((m, i) => { const l = { index: i + 1, startS: ps, durationS: m.atS - ps, distanceM: m.atM - pm }; ps = m.atS; pm = m.atM; return l; }) : [];
  };
  const save = (t: TrackState, sessionId?: string) => {
    const id = saveRecordedRun({ startedAt: t.startedAt, streams: toStreams(t), movingS: t.movingS, elapsedS: t.elapsedS, distanceM: t.distanceM, laps: lapsOf(t), sessionId });
    void del(key).catch(() => {});
    nav(`/activity/${id}`);
  };
  const discard = () => { void del(key).catch(() => {}); trackRef.current = undefined; setTrack(undefined); setPhase('ready'); setUnfinished(undefined); };

  // Hold to finish: 1.5 seconds, so a bump in a pocket does not end the run
  const holdTimer = useRef<number | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const holdStart = () => { setHolding(true); holdTimer.current = window.setTimeout(() => { setHolding(false); finish(); }, 1500); };
  const holdEnd = () => { setHolding(false); window.clearTimeout(holdTimer.current); };


  const t = track;
  const cp = t ? currentPace(t) : undefined;
  const ap = t ? avgPace(t) : undefined;
  const st = steps[stepIdx];
  const left = st && t ? stepLeft(st, stepStart.current.s, stepStart.current.m, t.movingS, t.distanceM) : undefined;
  const gauge = paceGauge(cp, st?.kind === 'work' ? st.pace : undefined);
  const ready = acc != null && acc <= 20;

  if (phase === 'running' && t) return (
    <div className="run-live" aria-live="off">
      <div className="run-stats">
        <div className="run-big"><span className="caption">Time</span><span className="stat-xl">{duration(Math.round(t.movingS))}</span></div>
        <div className="run-big"><span className="caption">Distance</span><span className="stat-xl">{dist(t.distanceM, U, 2).split(' ')[0]}<small> {U}</small></span></div>
        <div><span className="caption">Pace now</span><span className="stat">{cp ? fmtPace(cp, U) : '–'}</span></div>
        <div><span className="caption">Average</span><span className="stat">{ap ? fmtPace(ap, U) : '–'}</span></div>
      </div>
      {(t.paused || t.autoPaused) && <StatusLine kind="info">{t.paused ? 'Paused' : 'Paused automatically: you stopped'}</StatusLine>}
      {st && (
        <section className={`card stack-sm run-step${gauge ? ` gauge-${gauge}` : ''}`} aria-label="Current step">
          <span className="label">{st.label}{st.pace ? ` @ ${paceRange(st.pace[0], st.pace[1], U)}` : ''}</span>
          <span className="stat" style={{ fontSize: 28 }}>{left?.leftM != null ? `${Math.round(left.leftM)} m left` : left?.leftS != null ? `${duration(Math.round(left.leftS))} left` : 'Press Lap when done'}</span>
          {gauge && <span className="label">{gauge === 'ok' ? 'On target' : gauge === 'fast' ? 'Too fast: ease off' : 'Too slow: pick it up'}</span>}
          {steps[stepIdx + 1] && <span className="caption">Next: {steps[stepIdx + 1].label}</span>}
        </section>
      )}
      <RouteLine track={t} />
      <div className="run-controls">
        <button className="btn btn-block" onClick={lap} disabled={locked}><Flag size={20} strokeWidth={2} aria-hidden="true" />Lap</button>
        <button className="btn btn-primary btn-block run-pause" onClick={togglePause} disabled={locked}>{t.paused ? <><Play size={22} strokeWidth={2} aria-hidden="true" />Resume</> : <><Pause size={22} strokeWidth={2} aria-hidden="true" />Pause</>}</button>
        <button className={`btn btn-block${holding ? ' holding' : ''}`} disabled={locked} onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} aria-label="Hold to finish the run"><Square size={20} strokeWidth={2} aria-hidden="true" />Hold to finish</button>
        <button className="btn btn-ghost btn-block" onClick={() => setLocked((l) => !l)} aria-pressed={locked}>{locked ? <><Unlock size={20} strokeWidth={2} aria-hidden="true" />Unlock</> : <><Lock size={20} strokeWidth={2} aria-hidden="true" />Lock</>}</button>
      </div>
      <p className="caption">Keep Ritmo open with the screen on: phones can pause GPS when the screen locks or another app is in front.</p>
    </div>
  );

  if (phase === 'summary' && t) return (
    <div className="stack-lg">
      <AppHeader title="Run finished" large={false} />
      <section className="card row wrap" style={{ gap: 'var(--s5)' }}>
        <div><p className="caption">Distance</p><p className="stat-xl" style={{ fontSize: 40 }}>{dist(t.distanceM, U, 2)}</p></div>
        <div><p className="caption">Time</p><p className="stat" style={{ fontSize: 24 }}>{duration(Math.round(t.movingS))}</p></div>
        <div><p className="caption">Pace</p><p className="stat" style={{ fontSize: 24 }}>{ap ? fmtPace(ap, U) : '–'}</p></div>
      </section>
      <RouteLine track={t} />
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => save(t, sessionPlan?.id)}>Save and see feedback</button>
        <button className="btn" onClick={() => setPhase('running')}>Keep going</button>
        <button className="btn btn-ghost" onClick={discard}>Discard</button>
      </div>
    </div>
  );

  return (
    <div className="stack-lg">
      <AppHeader title="Run" eyebrow="Record a run with your phone" />
      {unfinished && (
        <div className="card stack-sm" role="alert">
          <StatusLine kind="warning">An unfinished run from {new Date(unfinished.track.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}: {dist(unfinished.track.distanceM, U)}</StatusLine>
          <div className="row wrap">
            <button className="btn btn-primary btn-small" onClick={() => save(unfinished.track, unfinished.sessionId)}>Save it</button>
            <button className="btn btn-ghost btn-small" onClick={discard}>Discard</button>
          </div>
        </div>
      )}
      <section className="card stack-sm" aria-live="polite">
        <StatusLine kind={gpsErr && !acc ? 'warning' : ready ? 'success' : 'info'}>{gpsErr && !acc ? gpsErr : acc == null ? 'Searching for GPS…' : ready ? `GPS ready ±${Math.round(acc)} m` : `GPS ±${Math.round(acc)} m, waiting for a better signal`}</StatusLine>
        <p className="caption">Stand still outside for a moment for the best signal.</p>
      </section>
      <Segmented<'planned' | 'free'> label="What are you running?" value={what} onChange={setWhat} options={[...(todays ? [{ value: 'planned' as const, label: "Today's session" }] : []), { value: 'free' as const, label: 'Free run' }]} />
      {sessionPlan && (
        <section className="card stack-sm">
          <span className="label">{sessionPlan.title}</span>
          <ol className="bullets caption">{steps.slice(0, 8).map((x, i) => <li key={i}>{x.label}{x.distanceM ? `, ${dist(x.distanceM, U)}` : x.durationS ? `, ${duration(x.durationS)}` : ''}{x.pace ? ` at ${paceRange(x.pace[0], x.pace[1], U)}` : ''}</li>)}{steps.length > 8 && <li>…and {steps.length - 8} more steps</li>}</ol>
        </section>
      )}
      <details className="card">
        <summary className="label" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Settings</summary>
        <div className="stack" style={{ marginTop: 'var(--s3)' }}>
          <Chips<Settings['cues']> label="Audio cues" value={settings.cues} onChange={(cues2) => setSettings((x) => ({ ...x, cues: cues2 }))} options={[{ value: 'steps', label: 'Every step and km' }, { value: 'km', label: 'Every km' }, { value: 'off', label: 'Off' }]} />
          <Chips<Settings['countdown']> label="Countdown" value={settings.countdown} onChange={(c) => setSettings((x) => ({ ...x, countdown: c }))} options={[3, 5, 10].map((v) => ({ value: v as Settings['countdown'], label: `${v} s` }))} />
          <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={settings.autoPause} onChange={(e) => setSettings((x) => ({ ...x, autoPause: e.target.checked }))} /> Pause automatically when I stop</label>
          <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={settings.screenOn} onChange={(e) => setSettings((x) => ({ ...x, screenOn: e.target.checked }))} /> Keep the screen on</label>
        </div>
      </details>
      {phase === 'countdown'
        ? <div className="run-countdown" role="status" aria-live="assertive">{count}</div>
        : autoStart && !unfinished
        ? <div className="stack-sm" role="status">
            <StatusLine kind="info">Quick run: starts by itself as soon as GPS is ready.</StatusLine>
            <button className="btn btn-primary btn-block run-start" onClick={() => { cancelQuick(); begin(); }}><Play size={24} strokeWidth={2} aria-hidden="true" />Start now</button>
            <button className="btn btn-ghost" onClick={cancelQuick}>Cancel</button>
          </div>
        : <div className="stack-sm">
            <button className="btn btn-primary btn-block run-start" onClick={begin} disabled={!ready}><Play size={24} strokeWidth={2} aria-hidden="true" />Start</button>
            {!ready && <button className="btn btn-ghost" onClick={begin}>Start anyway</button>}
          </div>}
      <p className="caption">In a browser, GPS can stop when the screen locks. Ritmo keeps the screen on while you run. The phone app (coming) records in the background.</p>
    </div>
  );
}

/** The route so far as a line (no map tiles yet). */
/** The route so far over OpenStreetMap tiles (unless maps are off on this device), centred, zoomed no closer than
 *  street level so a few metres of GPS wobble stay small, with the start and "you are here" marked. */
function RouteLine({ track }: { track: TrackState }) {
  const [showMap, setShowMap] = useState(mapsOn);
  const moving = track.points.filter((p) => p.moving);
  const pts = moving.length ? moving : track.points.slice(-1);
  const W = 360, H = 360;
  const view = fitView(pts, W, H, 36, 16);
  if (!view) return null;
  const xy = pts.map((p) => view.toView(p.lat, p.lon));
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
  const a = xy[0], b = view.toView(track.points[track.points.length - 1].lat, track.points[track.points.length - 1].lon);
  const toggle = () => { setMapsOn(!showMap); setShowMap(!showMap); };
  return (
    <div className="stack-sm run-map-wrap">
      <div className="run-route route-map" style={{ position: 'relative', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }} role="img" aria-label={showMap ? 'Your route so far, on a map' : 'Your route so far'}>
          {showMap && view.tiles.map((t) => <image key={`${t.z}/${t.x}/${t.y}`} href={t.url} x={t.left} y={t.top} width={TILE} height={TILE} preserveAspectRatio="none" className="route-tile" />)}
          {xy.length > 1 && <>
            <path d={d} fill="none" stroke="#fff" strokeOpacity={showMap ? 0.9 : 0} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={a.x} cy={a.y} r="7" fill="#fff" stroke="var(--brand)" strokeWidth="4"><title>Start</title></circle>
          </>}
          <circle cx={b.x} cy={b.y} r="13" fill="var(--brand)" opacity="0.25" />
          <circle cx={b.x} cy={b.y} r="8" fill="var(--brand)" stroke="#fff" strokeWidth="3"><title>You are here</title></circle>
        </svg>
        {showMap && <a className="route-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
          style={{ position: 'absolute', right: 0, bottom: 0, padding: '2px 6px', fontSize: 11, lineHeight: 1.4, background: 'rgba(255,255,255,.85)', color: '#333', borderTopLeftRadius: 6, textDecoration: 'none' }}>© OpenStreetMap contributors</a>}
      </div>
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={toggle} aria-pressed={showMap}>{showMap ? 'Hide map' : 'Show map'}</button>
    </div>
  );
}
