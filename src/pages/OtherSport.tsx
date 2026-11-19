// Other sport (update 5, U1): a bike ride, a swim, the elliptical, a row, a walk or a class. Record it now with a
// timer (and GPS distance outdoors), or log one already done. Both are saved as cross-training: they count toward
// fitness and fatigue, never as running distance.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pause, Play } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { DateField } from '../components/inputs';
import { CrossFields, GPS_SPORTS, SPORTS } from '../components/LogBits';
import { addFix, startTrack, type TrackState } from '../run/tracker';
import { hasBackgroundGps, watchGps } from '../run/native-gps';
import { dist, duration, ymd } from '../lib/format';

/** A recording in progress, kept on the device so a reload or a closed tab does not lose it. Time comes from the
 *  clock (start and pauses), not from counting, so it stays right with the screen off. */
interface Live { sport: string; startedAt: number; pausedAt?: number; pausedMs: number; distanceM: number; gps: boolean }
const elapsedS = (l: Live, now: number) => Math.max(0, Math.round(((l.pausedAt ?? now) - l.startedAt - l.pausedMs) / 1000));

export default function OtherSport() {
  const { addLog, data, session } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const key = `ritmo:other:${session?.user.id ?? 'me'}`;
  const [tab, setTab] = useState<'record' | 'log'>(params.get('log') ? 'log' : 'record');
  const [sport, setSport] = useState('Bike');
  const [live, setLiveState] = useState<Live | undefined>(() => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as Live) : undefined; } catch { return undefined; } });
  const [now, setNow] = useState(Date.now());
  const [gpsNote, setGpsNote] = useState<string>();
  const [finishing, setFinishing] = useState(false);
  const [rpe, setRpe] = useState(4);
  // The log form
  const [date, setDate] = useState(ymd(new Date()));
  const [minutes, setMinutes] = useState<number | undefined>(45);
  const [text, setText] = useState('');
  const liveRef = useRef(live);
  const setLive = (l: Live | undefined) => { liveRef.current = l; setLiveState(l); try { if (l) localStorage.setItem(key, JSON.stringify(l)); else localStorage.removeItem(key); } catch { /* */ } };
  const running = !!live && !live.pausedAt && !finishing;

  useEffect(() => { if (!live) return; const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, [!!live]); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS distance for outdoor sports. Distance already covered is kept across a reload; the track itself is not.
  const track = useRef<TrackState | undefined>(undefined);
  const baseM = useRef(live?.distanceM ?? 0);
  useEffect(() => {
    if (!running || !live?.gps) return;
    if (!hasBackgroundGps() && !('geolocation' in navigator)) { setGpsNote('This device has no GPS that Ritmo can use: time only.'); return; }
    track.current = startTrack(Date.now());
    baseM.current = liveRef.current?.distanceM ?? 0;
    return watchGps((p) => {
      setGpsNote(undefined);
      if (!track.current || !liveRef.current) return;
      track.current = addFix(track.current, { t: p.t, lat: p.lat, lon: p.lon, acc: p.acc, alt: p.alt, speed: p.speed }, false);
      const m = Math.round(baseM.current + track.current.distanceM);
      if (m !== liveRef.current.distanceM) setLive({ ...liveRef.current, distanceM: m });
    }, (e) => setGpsNote(e === 'denied' ? 'Location is blocked, so this is recorded by time only.' : 'Looking for GPS…'), true);
  }, [running, live?.gps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen on while recording (where the browser allows it)
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | undefined;
    const get = () => { (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); };
    get();
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => {}); };
  }, [running]);

  const gpsFor = (s: string) => GPS_SPORTS.includes(s);
  const start = () => setLive({ sport, startedAt: Date.now(), pausedMs: 0, distanceM: 0, gps: gpsFor(sport) });
  const pause = () => live && setLive({ ...live, pausedAt: Date.now() });
  const resume = () => live?.pausedAt && setLive({ ...live, pausedMs: live.pausedMs + (Date.now() - live.pausedAt), pausedAt: undefined });
  const finish = () => { if (live && !live.pausedAt) setLive({ ...live, pausedAt: Date.now() }); setFinishing(true); };
  const discard = () => { if (window.confirm('Discard this recording? Nothing will be saved.')) { setLive(undefined); setFinishing(false); } };
  const save = () => {
    if (!live) return;
    const s = elapsedS(live, Date.now());
    const id = addLog({ kind: 'cross', date: ymd(new Date(live.startedAt)), sport: live.sport, minutes: Math.max(1, Math.round(s / 60)), durationS: s, distanceM: live.distanceM > 20 ? live.distanceM : undefined, rpe, startedAt: new Date(live.startedAt).toISOString(), recorded: true });
    setLive(undefined); setFinishing(false);
    nav(`/log/${id}`, { replace: true });
  };
  const saveLog = () => { addLog({ kind: 'cross', date, sport, minutes, rpe, text: text.trim() || undefined }); nav('/history'); };

  const secs = live ? elapsedS(live, now) : 0;
  const U = data.profile.units;
  const speed = live && live.distanceM > 50 && secs > 10 ? (live.distanceM / (U === 'mi' ? 1609.344 : 1000)) / (secs / 3600) : undefined;

  if (live) return (
    <div className="stack-lg other-page" style={{ maxWidth: 720 }}>
      <AppHeader title={live.sport} eyebrow={finishing ? 'Finished' : live.pausedAt ? 'Paused' : 'Recording'} large={false} />
      <section className="other-live" aria-label="Recording">
        <p className="other-eyebrow">{live.sport}{live.gps ? ' · outdoor' : ''}</p>
        <p className="other-clock" role="timer" aria-live="off" data-testid="other-clock">{duration(secs).padStart(4, '0')}</p>
        <dl className="other-stats">
          <div><dt>Distance</dt><dd>{live.gps && live.distanceM > 20 ? dist(live.distanceM, U, 2) : '–'}</dd></div>
          <div><dt>Speed</dt><dd>{speed ? `${speed.toFixed(1)} ${U === 'mi' ? 'mph' : 'km/h'}` : '–'}</dd></div>
        </dl>
      </section>
      {gpsNote && live.gps && <p className="caption" role="status">{gpsNote}</p>}
      {finishing ? (
        <section className="card stack" aria-label="How hard was it?">
          <CrossFields idPrefix="os" showSport={false} sport={live.sport} setSport={() => {}} minutes={Math.max(1, Math.round(secs / 60))} setMinutes={() => {}} rpe={rpe} setRpe={setRpe} />
          <button type="button" className="btn btn-primary btn-block" onClick={save}>Save {live.sport.toLowerCase()}</button>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => { setFinishing(false); resume(); }}>Keep going</button>
            <button type="button" className="btn btn-ghost btn-danger" style={{ flex: 1 }} onClick={discard}>Discard</button>
          </div>
        </section>
      ) : (
        <div className="stack-sm">
          <button type="button" className="btn btn-primary btn-block other-finish" onClick={finish}>Finish</button>
          <div className="row" style={{ gap: 8 }}>
            {live.pausedAt ? <button type="button" className="btn" style={{ flex: 1 }} onClick={resume}><Play size={18} aria-hidden="true" />Resume</button> : <button type="button" className="btn" style={{ flex: 1 }} onClick={pause}><Pause size={18} aria-hidden="true" />Pause</button>}
            <button type="button" className="btn btn-ghost btn-danger" style={{ flex: 1 }} onClick={discard}>Discard</button>
          </div>
          <p className="caption">The time keeps counting with the screen off or the app closed. Come back here to finish.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="stack-lg other-page" style={{ maxWidth: 720 }}>
      <AppHeader title="Other sport" back />
      <div className="row wrap" role="group" aria-label="Sport" style={{ gap: 6 }}>
        {SPORTS.map((s) => <button key={s} type="button" className="chip" aria-pressed={sport === s} onClick={() => setSport(s)}>{s}</button>)}
      </div>
      <div className="text-tabs" role="tablist" aria-label="How">
        <button type="button" role="tab" aria-selected={tab === 'record'} className="text-tab" onClick={() => setTab('record')}>Record now</button>
        <button type="button" role="tab" aria-selected={tab === 'log'} className="text-tab" onClick={() => setTab('log')}>Log one I did</button>
      </div>
      {tab === 'record' ? (
        <>
          <section className="other-live idle" aria-label="Ready">
            <p className="other-eyebrow">{sport}{gpsFor(sport) ? ' · outdoor' : ''}</p>
            <p className="other-clock">0:00:00</p>
            <dl className="other-stats"><div><dt>Distance</dt><dd>–</dd></div><div><dt>Speed</dt><dd>–</dd></div></dl>
          </section>
          <section className="card hyrox-settings" aria-label="How it is recorded">
            <div className="hx-row"><span>GPS</span><strong>{gpsFor(sport) ? 'On (outdoor)' : 'Off: time only'}</strong></div>
            <div className="hx-row"><span>Counts toward</span><strong>Fitness and fatigue, not running km</strong></div>
            <div className="hx-row"><span>Effort</span><strong>Asked at the end</strong></div>
          </section>
          <button type="button" className="btn btn-primary btn-block other-finish" onClick={start}>Start {sport.toLowerCase()}</button>
          <p className="caption">Rides, swims and gym sessions in the files you import are added as cross-training too.</p>
        </>
      ) : (
        <section className="card stack" aria-label="Log one I did">
          <DateField id="os-date" label="Date" value={date} onChange={setDate} />
          <CrossFields idPrefix="os" showSport={false} sport={sport} setSport={setSport} minutes={minutes} setMinutes={setMinutes} rpe={rpe} setRpe={setRpe} />
          <div className="field"><label htmlFor="os-text">Note (optional)</label><textarea id="os-text" className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} /></div>
          <button type="button" className="btn btn-primary btn-block" disabled={!minutes} onClick={saveLog}>Save {sport.toLowerCase()}</button>
          <p className="caption">Cross-training counts toward your fitness and fatigue, scaled by how hard it was and how much it carries over to running. It does not count as running distance.</p>
        </section>
      )}
    </div>
  );
}
