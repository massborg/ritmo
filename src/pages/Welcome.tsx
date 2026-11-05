import { Link, useNavigate } from 'react-router-dom';
import { isNative } from '../data/health';
import { Watch, Smartphone } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Lanes, Logo } from '../components/ui';
import { GarminExportSteps, UploadPanel } from './DataSources';

const markWelcomed = () => { try { localStorage.setItem('ritmo:welcomed', '1'); } catch { /* ignore */ } };

export default function Welcome() {
  const nav = useNavigate();
  const { loadSample, importState, data } = useApp();
  const imported = !!importState.result && data.mode === 'real' && data.activities.length > 0;
  return (
    <div className="stack-lg" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="welcome-top" style={{ paddingTop: 'calc(var(--s5) + env(safe-area-inset-top))' }}><Logo variant="main" width={180} /></div>
      <section className="hero stack">
        <Lanes />
        <h1 className="display-lg">Train to your own rhythm.</h1>
        <p className="body" style={{ maxWidth: 520 }}>Ritmo reads your training history, understands how you run, and tells you what to do next and why. Like a calm, expert coach in your pocket, for a first 10K or a marathon best.</p>
      </section>

      <section className="card stack" aria-labelledby="s1">
        <p className="caption">Step 1 of 3</p>
        <h2 id="s1" className="title">Bring in your runs</h2>
        <p className="muted">Uploading your history is the best way to start. Ritmo reads the files on your device.</p>
        <UploadPanel />
        <details>
          <summary className="label" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>How to get your Garmin history</summary>
          <GarminExportSteps />
        </details>
        {imported && (
          <button className="btn btn-primary" onClick={() => { markWelcomed(); nav('/story?setup=1'); }}>See your running story</button>
        )}
      </section>

      <section className="card stack">
        <h2 className="title">Other ways to connect</h2>
        <ul className="list">
          <li className="list-item row-between wrap"><span className="row"><Watch size={20} strokeWidth={2} aria-hidden="true" /><span className="stack-sm" style={{ gap: 0 }}><span className="label">Connect Garmin</span><span className="caption">Automatic sync is coming once Garmin approves access.</span></span></span><span className="tag">Coming soon</span></li>
          <li className="list-item row-between wrap"><span className="row"><Smartphone size={20} strokeWidth={2} aria-hidden="true" /><span className="stack-sm" style={{ gap: 0 }}><span className="label">Apple Health and Health Connect</span><span className="caption">In the iPhone and Android apps.</span></span></span>{isNative() ? <Link to="/profile/health" className="btn btn-small btn-primary">Connect</Link> : <span className="tag">In the phone app</span>}</li>
        </ul>
      </section>

      <div className="stack-sm" style={{ alignItems: 'center', paddingBottom: 'var(--s6)' }}>
        <p className="muted">Want to look around first?</p>
        <button className="btn" onClick={() => { loadSample(); markWelcomed(); nav('/'); }}>Explore with sample data</button>
      </div>
    </div>
  );
}
