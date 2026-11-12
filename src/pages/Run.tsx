// The Run tab (review #2 §3): record a run with the phone's GPS, follow today's planned session step by step
// with spoken cues, then save it as a Ritmo run and see the feedback. Open to every runner, from the Run tab
// or Quick run on the Training page.
// Honest about the web: a browser may pause GPS when the screen locks, so Ritmo keeps the screen on and says so.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronRight, Flag, History, Lock, MapPin, Smartphone, Pause, Play, Settings2, Square, Unlock, Volume2, VolumeX } from 'lucide-react';
import { get, set, del } from 'idb-keyval';
import { useApp } from '../app/AppContext';
import { plannedNum, structureLine } from '../training/session-view';
import { fitView, mapsOn, prefetchTiles, setMapsOn, TILE } from '../lib/maptiles';
import { AppHeader, WorkoutGraph, ZONE_OF } from '../components/app';
import { Chips, Sheet } from '../components/inputs';
import { StatusLine } from '../components/ui';
import { SessionSheet } from '../components/training';
import { moveTargets } from '../training/plan';
import { ZONE_NAMES } from '../training/fitness';
import { DAY_SHORT, dist, duration, durationWords, MONTHS_LONG, pace as fmtPace, paceRange, parseYmd, weekday, ymd } from '../lib/format';
import { addFix, addLap, avgPace, clockS, currentPace, gpsLostS, lapSplits, paceGauge, setPaused, startTrack, stepLeft, stepsFor, toStreams, type TrackState, type WorkStep } from '../run/tracker';
import { tapHaptic } from '../native';
import { primeVoices, type SpeakOptions } from '../run/voice';
import { cue, resetVoice, unlockAudio } from '../run/cues';
import { primeNativeVoice } from '../run/native-voice';
import { hasBackgroundGps, watchGps } from '../run/native-gps';
import { RunCheck } from '../components/RunCheck';
import { PocketMode } from '../components/PocketMode';
import { VoicePicker } from '../components/VoicePicker';
import type { Lap, PlannedSession } from '../lib/types';

type Phase = 'ready' | 'countdown' | 'running' | 'summary';
type GoalKind = 'none' | 'distance' | 'time' | 'pace';
/** "4:30" or "4.30" to seconds; undefined when it is not a pace */
const parsePace = (x: string): number | undefined => { const m = x.trim().match(/^(\d{1,2})[:.](\d{2})$/); return m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : undefined; };
interface Settings { cues: 'km' | 'steps' | 'off'; countdown: 3 | 5 | 10; autoPause: boolean; screenOn: boolean; voiceURI?: string; rate: number }
const DEFAULTS: Settings = { cues: 'steps', countdown: 5, autoPause: true, screenOn: true, rate: 1 };
interface Saved { track: TrackState; sessionId?: string; stepIdx: number; stepStart: { s: number; m: number }; savedAt: number }

const spoken = (sec: number) => { const m = Math.floor(sec / 60), x = Math.round(sec % 60); return `${m ? `${m} minute${m > 1 ? 's' : ''} ` : ''}${x} second${x === 1 ? '' : 's'}`; };
// The voice and speed chosen in Settings (kept here so every cue uses them)
let voiceOpts: SpeakOptions = {};
// Every cue is checked: if the phone blocks speech, Ritmo's recorded clips say it instead (update 3, §2)
const say = (text: string, on: boolean) => { if (on) void cue(text, voiceOpts); };

export default function RunPage() {
  const { plan, today, data, saveRecordedRun, session, moveSession } = useApp();
  const nav = useNavigate();
  const U = data.profile.units;
  const key = `ritmo:run:active:${session?.user.id ?? 'anon'}`;
  const t0 = ymd(today);
  const todays = plan?.sessions.find((s) => s.date === t0 && s.type !== 'rest' && s.status !== 'done' && s.status !== 'swapped');
  // The session card: today's session first, then the rest of this week's planned runs to preview (swipe)
  const weekEnd = ymd(new Date(parseYmd(t0).getTime() + (6 - weekday(parseYmd(t0))) * 86400000));
  const cards: PlannedSession[] = (plan?.sessions ?? []).filter((s) => s.date >= t0 && s.date <= weekEnd && s.type !== 'rest' && s.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  const [shownIdx, setShownIdx] = useState(0);
  const [goal, setGoal] = useState<GoalKind>('none');
  const [goalValue, setGoalValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [swapDay, setSwapDay] = useState<string>();
  const [pos, setPos] = useState<{ lat: number; lon: number }>();
  const goalDone = useRef(false);
  const swipe = useRef<number | undefined>(undefined);
  const holdAudio = useRef<number | undefined>(undefined);
  // "Quick run" on the Training page: a free run that starts by itself once GPS is ready
  const [params, setParams] = useSearchParams();
  const quick = params.get('quick') === '1';
  // Profile's "Run settings" link opens the settings sheet here
  useEffect(() => { if (params.get('settings') === '1') { setSettingsOpen(true); setParams({}, { replace: true }); } }, [params, setParams]);
  const [autoStart, setAutoStart] = useState(quick);
  const [what, setWhat] = useState<'planned' | 'free'>(todays && !quick ? 'planned' : 'free');
  const [settings, setSettings] = useState<Settings>(() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('ritmo:run:settings') ?? '{}') }; } catch { return DEFAULTS; } });
  const [phase, setPhase] = useState<Phase>('ready');
  const [acc, setAcc] = useState<number>();
  const [gpsErr, setGpsErr] = useState<string>();
  const [count, setCount] = useState(0);
  const [track, setTrack] = useState<TrackState>();
  const [locked, setLocked] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [pocket, setPocket] = useState(false);
  // Pocket mode is on by default in a browser (which stops when the screen locks); in the app locking is fine
  const [pocketNext, setPocketNext] = useState(() => { const d = !hasBackgroundGps(); try { const v = localStorage.getItem('ritmo:run:pocket'); return v ? v === 'on' : d; } catch { return d; } });
  const [unfinished, setUnfinished] = useState<Saved>();
  const [stepIdx, setStepIdx] = useState(0);
  const stepStart = useRef({ s: 0, m: 0 });
  const stepIdxRef = useRef(0);
  const trackRef = useRef<TrackState | undefined>(undefined);
  const lastKm = useRef(0);
  const lastGaugeCue = useRef(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const shown = what === 'planned' ? cards[Math.min(shownIdx, Math.max(0, cards.length - 1))] : undefined;
  const sessionPlan = shown;
  const unitM = U === 'km' ? 1000 : 1609.344;
  const goalNum = Number(goalValue.replace(',', '.'));
  const goalPace = goal === 'pace' ? parsePace(goalValue) : undefined;
  // A free run with a goal is followed like a one-step session: distance or time left, or a pace to hold
  const goalSteps: WorkStep[] = goal === 'distance' && goalNum > 0 ? [{ kind: 'work', label: `Run ${goalNum} ${U}`, distanceM: goalNum * unitM }]
    : goal === 'time' && goalNum > 0 ? [{ kind: 'work', label: `Run ${goalNum} min`, durationS: goalNum * 60 }]
    : goal === 'pace' && goalPace ? [{ kind: 'work', label: `Hold ${fmtPace(goalPace * (U === 'km' ? 1 : 1.609344), U)}`, pace: [goalPace - 5, goalPace + 5] }]
    : [];
  const steps: WorkStep[] = sessionPlan ? stepsFor(sessionPlan) : goalSteps;
  const cues = settings.cues !== 'off';

  useEffect(() => { try { localStorage.setItem('ritmo:run:settings', JSON.stringify(settings)); } catch { /* ignore */ } voiceOpts = { voiceURI: settings.voiceURI, rate: settings.rate }; }, [settings]);
  // An unfinished run saved on this device (the app closed or crashed mid-run)
  useEffect(() => { get(key).then((v) => { if (v) setUnfinished(v as Saved); }).catch(() => {}); }, [key]);

  // GPS: watch position from the moment the tab opens, so the fix is ready by the time the runner starts. In the
  // store app the watch switches to background tracking for the run, so it keeps going with the phone locked.
  const recording = phase === 'running' || phase === 'countdown';
  useEffect(() => {
    if (!hasBackgroundGps() && !('geolocation' in navigator)) { setGpsErr('This device has no GPS that Ritmo can use.'); return; }
    return watchGps((p) => {
      setAcc(p.acc); setGpsErr(undefined);
      if (!trackRef.current) setPos({ lat: p.lat, lon: p.lon });
      // While waiting to start, load the map around here so it is ready the moment the run begins
      if (p.acc <= 100) prefetchTiles(p.lat, p.lon);
      const t = trackRef.current;
      if (!t) return;
      const next = addFix(t, { t: p.t, lat: p.lat, lon: p.lon, acc: p.acc, alt: p.alt, speed: p.speed }, settings.autoPause);
      trackRef.current = next; setTrack(next);
    }, (e) => setGpsErr(e === 'denied' ? (hasBackgroundGps() ? 'Location is blocked. Allow location for Ritmo in your phone settings.' : 'Location is blocked. Allow location for Ritmo in your browser or phone settings.') : 'Searching for GPS…'), recording && hasBackgroundGps());
  }, [settings.autoPause, recording]);

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
        // A free run's distance or time goal: said once when it is reached
        if (!sessionPlan && steps.length === 1 && left?.complete && !goalDone.current) { goalDone.current = true; say(`Goal reached: ${steps[0].label.replace(/^Run /, '')}. Great work.`, cues); }
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

  // Load the device's voices as soon as the screen opens, so "5" at the start already uses the chosen voice
  // A Quick run starts by itself once GPS is ready: check the voice afresh (the Quick run tap unlocked it), and
  // let the first tap anywhere on this screen unlock speech and the clips too, whichever way the run starts
  useEffect(() => {
    primeVoices(); primeNativeVoice();
    if (quick) resetVoice();
    const first = () => { unlockAudio(); document.removeEventListener('click', first, true); document.removeEventListener('touchend', first, true); };
    document.addEventListener('click', first, true); document.addEventListener('touchend', first, true);
    return () => { document.removeEventListener('click', first, true); document.removeEventListener('touchend', first, true); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const begin = () => {
    // A later day's session started today is moved to today first (when the plan allows it), so the run links to it
    if (sessionPlan && sessionPlan.date !== t0 && plan && moveTargets(sessionPlan, today).includes(t0)) moveSession(sessionPlan.id, t0);
    goalDone.current = false;
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
  // The Start tap: speak straight away (inside the tap), so the phone allows the cues that come later from a timer,
  // unlock the recorded clips, and show "Before you start"
  const openCheck = () => {
    resetVoice(); unlockAudio();
    if (cues) void cue('Ready when you are.', voiceOpts);
    setCheckOpen(true);
  };
  const startFromCheck = () => {
    setCheckOpen(false);
    try { localStorage.setItem('ritmo:run:pocket', pocketNext ? 'on' : 'off'); } catch { /* */ }
    if (pocketNext) setPocket(true);
    begin();
  };
  const ready0 = acc != null && acc <= 20;
  useEffect(() => {
    if (!autoStart || phase !== 'ready' || unfinished || !ready0) return;
    setAutoStart(false); setParams({}, { replace: true }); begin();
  });
  const cancelQuick = () => { setAutoStart(false); setParams({}, { replace: true }); };
  const togglePause = () => { const t = trackRef.current; if (!t) return; const n = setPaused(t, !t.paused); trackRef.current = n; setTrack(n); say(n.paused ? 'Paused.' : 'Resumed.', cues); };
  // Lap: a clear sign it worked (buzz, a banner with the split, spoken split) and a list of laps on screen
  const [lapFlash, setLapFlash] = useState<{ n: number; s: number; m: number }>();
  const lapFlashTimer = useRef<number | undefined>(undefined);
  const lap = () => {
    const t = trackRef.current; if (!t) return;
    const now = Date.now();
    const done = lapSplits(t, now).slice(-1)[0];
    const n = addLap(t, now); trackRef.current = n; setTrack(n);
    try { navigator.vibrate?.(80); } catch { /* not supported */ }
    void tapHaptic();
    setLapFlash(done); window.clearTimeout(lapFlashTimer.current); lapFlashTimer.current = window.setTimeout(() => setLapFlash(undefined), 4000);
    if (steps.length && stepIdxRef.current < steps.length - 1) { const ni = stepIdxRef.current + 1; stepIdxRef.current = ni; setStepIdx(ni); stepStart.current = { s: n.movingS, m: n.distanceM }; say(steps[ni].label, cues); }
    else say(`Lap ${done.n}. ${dist(done.m, U, 2).replace(/ (km|mi)$/, (x) => (x.trim() === 'km' ? ' kilometres' : ' miles'))} in ${spoken(done.s)}.`, cues);
  };
  // Finishing stops the clock where it is; "Keep going" carries on from there
  const finish = () => { const t = trackRef.current; if (t) { const n = setPaused(t, true); trackRef.current = n; setTrack(n); } setPhase('summary'); say('Run finished.', cues); };
  const keepGoing = () => { const t = trackRef.current; if (t) { const n = setPaused(t, false); trackRef.current = n; setTrack(n); } setPhase('running'); };
  const lapsOf = (t: TrackState): Lap[] => {
    const marks = [...t.laps, { atS: Math.max(t.movingS, t.laps[t.laps.length - 1]?.atS ?? 0), atM: t.distanceM }];
    let ps = 0, pm = 0;
    return t.laps.length ? marks.map((m, i) => { const l = { index: i + 1, startS: ps, durationS: m.atS - ps, distanceM: m.atM - pm }; ps = m.atS; pm = m.atM; return l; }) : [];
  };
  const save = (t: TrackState, sessionId?: string) => {
    const id = saveRecordedRun({ startedAt: t.startedAt, streams: toStreams(t), movingS: t.movingS, elapsedS: t.elapsedS, distanceM: t.distanceM, laps: lapsOf(t), sessionId,
      gaps: t.gaps?.map((g) => ({ from: new Date(g.fromT).toISOString(), to: new Date(g.toT).toISOString(), atM: Math.round(g.atM) })) });
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

  const lostS = t && phase === 'running' ? gpsLostS(t, Date.now()) : undefined;
  const unitWord = U === 'km' ? 'km' : 'mi';
  const nextCueAt = t ? Math.floor(t.distanceM / unitM) + 1 : 1;
  if (phase === 'running' && t && pocket) return (
    <PocketMode distance={dist(t.distanceM, U, 2).split(' ')[0]} unit={U} time={duration(Math.floor(clockS(t, Date.now())))} pace={cp ? `${fmtPace(cp, U)} now` : ap ? `${fmtPace(ap, U)} average` : '–'}
      cueLine={cues ? `Voice cues on · next at ${nextCueAt} ${unitWord}` : 'Voice cues off'} gpsLost={lostS} onUnlock={() => setPocket(false)} />
  );
  if (phase === 'running' && t) return (
    <div className="run-live" aria-live="off">
      {lostS != null && <StatusLine kind="warning">No GPS for {lostS} s. Distance waits for the signal: nothing is added for the gap.</StatusLine>}
      <div className="run-stats">
        <div className="run-big"><span className="caption">Time</span><span className="stat-xl" data-testid="run-clock">{duration(Math.floor(clockS(t, Date.now())))}</span></div>
        <div className="run-big"><span className="caption">Distance</span><span className="stat-xl">{dist(t.distanceM, U, 2).split(' ')[0]}<small> {U}</small></span></div>
        <div><span className="caption">Pace now</span><span className="stat">{cp ? fmtPace(cp, U) : '–'}</span></div>
        <div><span className="caption">Average</span><span className="stat">{ap ? fmtPace(ap, U) : '–'}</span></div>
      </div>
      {lapFlash && <div className="run-lap-flash" role="status">Lap {lapFlash.n}: {dist(lapFlash.m, U, 2)} in {duration(Math.round(lapFlash.s))}</div>}
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
        <button className="btn btn-primary btn-block run-pause" onClick={togglePause} disabled={locked}>{t.paused ? <><Play size={22} strokeWidth={2} aria-hidden="true" />Resume</> : <><Pause size={22} strokeWidth={2} aria-hidden="true" />Pause</>}</button>
        <button className="btn btn-block" onClick={lap} disabled={locked}><Flag size={20} strokeWidth={2} aria-hidden="true" />Lap {t.laps.length + 1}</button>
        <button className={`btn btn-block${holding ? ' holding' : ''}`} disabled={locked} onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} aria-label="Hold to finish the run"><Square size={20} strokeWidth={2} aria-hidden="true" />Hold to finish</button>
        <button className="btn btn-ghost btn-block" onClick={() => setLocked((l) => !l)} aria-pressed={locked}>{locked ? <><Unlock size={20} strokeWidth={2} aria-hidden="true" />Unlock</> : <><Lock size={20} strokeWidth={2} aria-hidden="true" />Lock</>}</button>
        <button className="btn btn-block run-pocket-btn" onClick={() => setPocket(true)}><Smartphone size={20} strokeWidth={2} aria-hidden="true" />Pocket mode</button>
      </div>
      {t.laps.length > 0 && (
        <section className="card stack-sm" aria-label="Laps">
          <span className="label">Laps</span>
          <ol className="run-laps">{lapSplits(t, Date.now()).slice().reverse().map((x, i) => (
            <li key={x.n} className={i === 0 ? 'current' : undefined}><span>{i === 0 ? `Lap ${x.n} (now)` : `Lap ${x.n}`}</span><span>{dist(x.m, U, 2)}</span><span>{duration(Math.round(x.s))}</span></li>
          ))}</ol>
        </section>
      )}
      <p className="caption">Don't lock your phone: use Pocket mode. A locked screen pauses GPS in a browser; any gap is left out, never guessed.</p>
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
        <button className="btn" onClick={keepGoing}>Keep going</button>
        <button className="btn btn-ghost" onClick={discard}>Discard</button>
      </div>
    </div>
  );

  const dayCaption = (d: string) => { const x = parseYmd(d); return `${d === t0 ? "Today's session" : `${DAY_SHORT[weekday(x)]}'s session`} · ${DAY_SHORT[weekday(x)]} ${x.getDate()} ${MONTHS_LONG[x.getMonth()].slice(0, 3)}`; };
  const workStep = (x: PlannedSession) => x.steps.find((y) => y.kind === 'work' && y.pace);
  const targetPace = (x: PlannedSession) => { const w = workStep(x); const r = w?.pace ?? (x.paceTarget ? [x.paceTarget.minSPerKm, x.paceTarget.maxSPerKm] as [number, number] : undefined); return r ? paceRange(r[0], r[1], U).replace(/\/(km|mi)$/, '') : '–'; };
  const zone = (x: PlannedSession) => ZONE_OF[x.type];
  const gpsReady = ready;
  const gpsText = gpsErr && !acc ? gpsErr : acc == null ? 'Searching for GPS…' : gpsReady ? 'GPS ready' : 'Weak GPS signal';
  const audioDown = () => { holdAudio.current = window.setTimeout(() => { holdAudio.current = undefined; setSettingsOpen(true); window.setTimeout(() => document.getElementById('run-voice-settings')?.scrollIntoView({ block: 'start' }), 300); }, 550); };
  const audioUp = () => { if (holdAudio.current) { window.clearTimeout(holdAudio.current); holdAudio.current = undefined; setSettings((x) => ({ ...x, cues: x.cues === 'off' ? 'steps' : 'off' })); } };

  return (
    <div className="run-ready">
      <MapBackdrop pos={pos} />
      <div className="stack run-ready-content">
        <AppHeader title="Run" avatar right={<Link to="/you#recent" className="icon-btn" aria-label="Run history"><History size={22} strokeWidth={2} /></Link>} />
        <div className="text-tabs" role="tablist" aria-label="What are you running?">
          <button role="tab" aria-selected={what === 'planned'} className="text-tab" onClick={() => setWhat('planned')}>Ritmo plan</button>
          <button role="tab" aria-selected={what === 'free'} className="text-tab" onClick={() => setWhat('free')}>Free run</button>
        </div>

        {unfinished && (
          <div className="card stack-sm" role="alert">
            <StatusLine kind="warning">An unfinished run from {new Date(unfinished.track.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}: {dist(unfinished.track.distanceM, U)}</StatusLine>
            <div className="row wrap">
              <button className="btn btn-primary btn-small" onClick={() => save(unfinished.track, unfinished.sessionId)}>Save it</button>
              <button className="btn btn-ghost btn-small" onClick={discard}>Discard</button>
            </div>
          </div>
        )}

        {what === 'planned' ? (
          shown ? (
            <div className="stack-sm">
              <section className="card stack-sm run-card" aria-label={`${dayCaption(shown.date)}: ${shown.title}`}
                onTouchStart={(e) => { swipe.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => { const x0 = swipe.current; swipe.current = undefined; if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) setShownIdx((i) => Math.max(0, Math.min(cards.length - 1, i + (dx < 0 ? 1 : -1)))); }}>
                <div className="row-between"><span className="caption">{dayCaption(shown.date)}</span>{zone(shown) && <span className="zone-chip"><span className={`zone-dot z${zone(shown)}`} aria-hidden="true" />Z{zone(shown)} {ZONE_NAMES[zone(shown)! - 1]}</span>}</div>
                <h2 className="title">{shown.title}</h2>
                <div className="run-card-stats">
                  <div><span className="caption">Distance</span><span className="stat">{shown.distanceM > 0 ? <>{plannedNum(shown.distanceM, U)}<small> {U}</small></> : '–'}</span></div>
                  <div><span className="caption">{workStep(shown) ? 'Rep pace' : 'Target pace'}</span><span className="stat">{targetPace(shown)}<small>/{U}</small></span></div>
                  <div><span className="caption">Time</span><span className="stat">{durationWords(shown.durationS)}</span></div>
                </div>
                <WorkoutGraph session={shown} height={36} />
                <p className="caption run-structure">{structureLine(shown)}</p>
                <p className="run-tip"><strong>Coach tip: </strong>{shown.howItHelps || shown.purpose}</p>
              </section>
              {cards.length > 1 && (
                <div className="run-dots" role="group" aria-label="This week's sessions">
                  {cards.map((c, i) => <button key={c.id} className={`run-dot${i === shownIdx ? ' on' : ''}`} aria-label={`${dayCaption(c.date)}: ${c.title}`} aria-pressed={i === shownIdx} onClick={() => setShownIdx(i)} />)}
                </div>
              )}
              {shown.date !== t0 && <p className="caption" style={{ textAlign: 'center' }}>Start runs this session today{moveTargets(shown, today).includes(t0) ? ' and moves it here in your plan' : ''}.</p>}
            </div>
          ) : (
            <section className="card stack-sm run-card">
              <h2 className="title">No run planned for the rest of this week</h2>
              <p className="muted">Enjoy the rest, or go for a free run: Ritmo still logs it.</p>
              <button className="link-btn" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={() => setWhat('free')}>Free run ›</button>
            </section>
          )
        ) : (
          <section className="card stack-sm run-card" aria-label="Free run">
            <h2 className="title">Run your way</h2>
            <p className="caption">Ritmo still logs it and counts it toward your week.</p>
            <div className="row wrap" role="radiogroup" aria-label="Goal" style={{ gap: 6 }}>
              {([['none', 'Just run'], ['distance', 'Distance'], ['time', 'Time'], ['pace', 'Pace']] as [GoalKind, string][]).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={goal === k} className={`chip${goal === k ? ' chip-on' : ''}`} onClick={() => { setGoal(k); setGoalValue(''); }}>{label}</button>
              ))}
            </div>
            {goal !== 'none' && (
              <div className="field run-goal">
                <label htmlFor="run-goal">{goal === 'distance' ? `Distance (${U})` : goal === 'time' ? 'Time (minutes)' : `Pace (min:sec per ${U})`}</label>
                <input id="run-goal" className="input" inputMode={goal === 'pace' ? 'text' : 'decimal'} value={goalValue} onChange={(e) => setGoalValue(e.target.value)} placeholder={goal === 'distance' ? '5' : goal === 'time' ? '30' : '5:00'} />
                {goal === 'pace' && goalValue && !goalPace && <span className="caption">Type the pace like 5:00.</span>}
              </div>
            )}
            {todays && <button className="link-btn run-switch" onClick={() => { setWhat('planned'); setShownIdx(0); }}><span className="caption">Today's plan: {todays.title}</span><span>Switch to plan <ChevronRight size={16} strokeWidth={2} aria-hidden="true" /></span></button>}
          </section>
        )}

        <div className="run-gps-row" aria-live="polite">
          <span className={`gps-pill${gpsReady ? ' ok' : gpsErr && !acc ? ' bad' : ''}`}><MapPin size={16} strokeWidth={2.2} aria-hidden="true" />{gpsText}</span>
          {!gpsReady && phase === 'ready' && !autoStart && <button className="link-btn" onClick={openCheck}>Start anyway</button>}
        </div>

        {phase === 'countdown'
          ? <div className="run-countdown" role="status" aria-live="assertive">{count}</div>
          : autoStart && !unfinished
          ? <div className="stack-sm" role="status">
              <StatusLine kind="info">Quick run: starts by itself as soon as GPS is ready.</StatusLine>
              <button className="btn btn-primary btn-block run-start" onClick={() => { cancelQuick(); resetVoice(); unlockAudio(); begin(); }}><Play size={24} strokeWidth={2} aria-hidden="true" />Start now</button>
              <button className="btn btn-ghost" onClick={cancelQuick}>Cancel</button>
            </div>
          : <div className="run-controls-row">
              <button className="run-round" aria-label="Run settings" onClick={() => setSettingsOpen(true)}><Settings2 size={24} strokeWidth={2} /></button>
              <button className="run-go" onClick={openCheck} disabled={!gpsReady}>Start</button>
              <button className="run-round" aria-label={cues ? 'Audio cues on. Tap to turn off, hold for voice settings' : 'Audio cues off. Tap to turn on, hold for voice settings'} aria-pressed={cues}
                onPointerDown={audioDown} onPointerUp={audioUp} onPointerLeave={() => { if (holdAudio.current) { window.clearTimeout(holdAudio.current); holdAudio.current = undefined; } }} onContextMenu={(e) => e.preventDefault()}>
                {cues ? <Volume2 size={24} strokeWidth={2} /> : <VolumeX size={24} strokeWidth={2} />}
              </button>
            </div>}
        {phase === 'ready' && !autoStart && what === 'planned' && shown && <button className="pill-btn" style={{ alignSelf: 'center' }} onClick={() => setSwapDay(shown.date)}><ArrowLeftRight size={16} strokeWidth={2} aria-hidden="true" />Swap session</button>}
        <p className="caption run-note">Don't lock your phone; use Pocket mode. In a browser, GPS stops when the screen locks.</p>
      </div>

      <RunCheck open={checkOpen} onClose={() => setCheckOpen(false)} onStart={startFromCheck} gps={gpsText} gpsReady={gpsReady} cuesOn={cues} voice={voiceOpts}
        pocket={pocketNext} setPocket={setPocketNext} />
      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Run settings">
        <div className="stack">
          <Chips<Settings['cues']> label="Audio cues" value={settings.cues} onChange={(cues2) => setSettings((x) => ({ ...x, cues: cues2 }))} options={[{ value: 'steps', label: 'Every step and km' }, { value: 'km', label: 'Every km' }, { value: 'off', label: 'Off' }]} />
          <Chips<Settings['countdown']> label="Countdown" value={settings.countdown} onChange={(c) => setSettings((x) => ({ ...x, countdown: c }))} options={[3, 5, 10].map((v) => ({ value: v as Settings['countdown'], label: `${v} s` }))} />
          <div id="run-voice-settings"><VoicePicker voiceURI={settings.voiceURI} rate={settings.rate} onChange={(v) => setSettings((x) => ({ ...x, ...v }))} /></div>
          <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={settings.autoPause} onChange={(e) => setSettings((x) => ({ ...x, autoPause: e.target.checked }))} /> Pause automatically when I stop</label>
          <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={settings.screenOn} onChange={(e) => setSettings((x) => ({ ...x, screenOn: e.target.checked }))} /> Keep the screen on</label>
        </div>
      </Sheet>
      <SessionSheet date={swapDay} onClose={() => setSwapDay(undefined)} />
    </div>
  );
}

/** A faint map of where you are, behind the Run screen (decorative; off when maps are off on this device). */
function MapBackdrop({ pos }: { pos?: { lat: number; lon: number } }) {
  if (!pos || !mapsOn()) return <div className="run-map-bg" aria-hidden="true" />;
  const W = 420, H = 760;
  const view = fitView([pos], W, H, 0, 15);
  if (!view) return <div className="run-map-bg" aria-hidden="true" />;
  const me = view.toView(pos.lat, pos.lon);
  return (
    <div className="run-map-bg" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {view.tiles.map((t) => <image key={`${t.z}/${t.x}/${t.y}`} href={t.url} x={t.left} y={t.top} width={TILE} height={TILE} preserveAspectRatio="none" />)}
        <circle cx={me.x} cy={me.y} r="14" fill="var(--brand)" opacity="0.25" />
        <circle cx={me.x} cy={me.y} r="7" fill="var(--brand)" stroke="#fff" strokeWidth="3" />
      </svg>
      <a className="run-map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
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
  // The line breaks at a GPS gap; the gap itself is dashed
  const d = xy.map((p, i) => `${i && !pts[i].gap ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
  const gapLines = xy.map((p, i) => (i && pts[i].gap ? [xy[i - 1], p] : undefined)).filter(Boolean) as { x: number; y: number }[][];
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
            {gapLines.map(([g0, g1], i) => <line key={i} className="route-gap" x1={g0.x} y1={g0.y} x2={g1.x} y2={g1.y} stroke="var(--ink)" strokeOpacity="0.7" strokeWidth="3" strokeDasharray="6 8" />)}
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
