import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity as ActivityIcon, HeartPulse, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';
import { healthAvailability, healthKind, healthLabel, isNative, type HealthAvailability } from '../data/health';
import { relTime } from '../lib/format';

export default function HealthConnect() {
  const { data, connectHealth, syncHealthNow, healthSyncing, disconnectSource } = useApp();
  const [avail, setAvail] = useState<HealthAvailability>();
  const [msg, setMsg] = useState<{ kind: 'success' | 'warning' | 'danger'; text: string }>();
  const [busy, setBusy] = useState(false);
  const kind = healthKind();
  const label = isNative() ? healthLabel() : 'Apple Health and Health Connect';
  const src = kind ? data.sources.find((s) => s.kind === kind) : undefined;
  const ios = kind === 'apple_health';

  useEffect(() => { healthAvailability().then(setAvail); }, []);

  return (
    <div className="stack-lg">
      <AppHeader title={label} eyebrow="Bring in runs recorded on your phone or watch" back />

      <section className="card stack">
        <h2 className="title">What Ritmo reads</h2>
        <div className="group" style={{ border: 0 }}>
          <div><span className="row-icon"><ActivityIcon size={18} strokeWidth={2} aria-hidden="true" /></span><span className="stack-sm" style={{ gap: 0 }}><span className="label">Running workouts</span><span className="caption">Date, distance, time and laps, to track your training and adapt your plan.</span></span></div>
          <div><span className="row-icon"><HeartPulse size={18} strokeWidth={2} aria-hidden="true" /></span><span className="stack-sm" style={{ gap: 0 }}><span className="label">Heart rate during runs</span><span className="caption">To judge effort and training load.</span></span></div>
          <div><span className="row-icon"><Lock size={18} strokeWidth={2} aria-hidden="true" /></span><span className="stack-sm" style={{ gap: 0 }}><span className="label">Nothing is written</span><span className="caption">Ritmo only reads. It never adds or changes your health data.</span></span></div>
        </div>
        <p className="caption">Runs from {label} may have less detail than a Garmin file, with no per-kilometre splits or route. Session feedback says when that limits the analysis. If the same run also arrives from Garmin or a file, Ritmo keeps the most detailed version.</p>
      </section>

      {!isNative() ? (
        <section className="card stack">
          <StatusLine kind="warning">Only available in the iPhone and Android apps</StatusLine>
          <p className="muted">Phones only share health data with installed apps, not websites. Until the apps are released, upload your files or your Garmin export.</p>
          <Link to="/profile/data" className="btn" style={{ alignSelf: 'flex-start' }}>Upload files</Link>
        </section>
      ) : avail && !avail.available ? (
        <section className="card stack"><StatusLine kind="warning">{label} is not available</StatusLine><p className="muted">{avail.reason}</p></section>
      ) : src?.connected ? (
        <section className="card stack">
          <StatusLine kind="success">Connected</StatusLine>
          <p className="caption">{src.lastSyncAt ? `Last sync ${relTime(src.lastSyncAt)} · ${src.activityCount} runs` : 'First sync in progress'}</p>
          {src.lastError && <StatusLine kind="danger">{src.lastError}</StatusLine>}
          <div className="row wrap">
            <button className="btn btn-primary" disabled={healthSyncing} onClick={() => syncHealthNow()}><RefreshCw size={18} strokeWidth={2} aria-hidden="true" />{healthSyncing ? 'Syncing…' : 'Sync now'}</button>
            <button className="btn" onClick={() => { if (kind) disconnectSource(kind); setMsg({ kind: 'warning', text: ios ? 'Disconnected. To remove access completely, open the Health app, then Sharing, then Apps, then Ritmo.' : 'Disconnected. To remove access completely, open Health Connect, then App permissions, then Ritmo.' }); }}>Disconnect</button>
          </div>
          <p className="caption">Ritmo syncs automatically each time you open the app.</p>
        </section>
      ) : (
        <section className="card stack">
          <div className="row" style={{ gap: 8 }}><ShieldCheck size={20} strokeWidth={2} aria-hidden="true" /><p className="label">Your phone will ask for permission next</p></div>
          <p className="muted">Allow <strong>Workouts</strong> and <strong>Heart rate</strong>.{!ios && ' Also allow access to past data so Ritmo can read your history.'} You can change this at any time in {ios ? 'the Health app' : 'Health Connect'}.</p>
          <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); const m = await connectHealth(); setBusy(false); setMsg(m ? { kind: 'warning', text: m } : { kind: 'success', text: 'Connected. Importing your runs now.' }); }}>Connect {label}</button>
        </section>
      )}
      {msg && <StatusLine kind={msg.kind}>{msg.text}</StatusLine>}
    </div>
  );
}
