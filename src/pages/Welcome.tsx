import { Link, useNavigate } from 'react-router-dom';
import { Compass, Footprints, Smartphone, Upload, Watch } from 'lucide-react';
import { isNative } from '../data/health';
import { useApp } from '../app/AppContext';
import { Lanes, Logo } from '../components/ui';
import { GarminExportSteps, UploadPanel } from './DataSources';

const markWelcomed = () => { try { localStorage.setItem('ritmo:welcomed', '1'); } catch { /* ignore */ } };

export default function Welcome() {
  const nav = useNavigate();
  const { loadSample, importState, data, updateProfile } = useApp();
  const imported = !!importState.result && data.mode === 'real' && data.activities.length > 0 && importState.result.added + importState.result.replaced > 0;
  return (
    <div className="stack-lg" style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="welcome-top" style={{ paddingTop: 'calc(var(--s5) + env(safe-area-inset-top))' }}><Logo variant="main" width={180} /></div>
      <section className="hero stack">
        <Lanes />
        <h1 className="display-lg">Train to your own rhythm.</h1>
        <p className="body" style={{ maxWidth: 520 }}>Ritmo understands how you run and tells you what to do next and why. A calm, expert coach in your pocket, for a first 5K or a marathon best.</p>
      </section>

      <h2 className="title">How would you like to start?</h2>

      <Link to="/start" className="card card-link row" style={{ gap: 'var(--s4)' }}>
        <span className="row-icon" style={{ width: 48, height: 48 }}><Footprints size={22} strokeWidth={2} aria-hidden="true" /></span>
        <span className="stack-sm" style={{ gap: 2, flex: 1 }}>
          <span className="label">I'm new to running</span>
          <span className="caption">A gentle run/walk plan, three days a week, building to 30 minutes of running. No watch or history needed.</span>
        </span>
      </Link>

      <section className="card stack" aria-labelledby="s-upload">
        <div className="row" style={{ gap: 'var(--s4)' }}>
          <span className="row-icon" style={{ width: 48, height: 48 }}><Upload size={22} strokeWidth={2} aria-hidden="true" /></span>
          <span className="stack-sm" style={{ gap: 2 }}>
            <h3 id="s-upload" className="label">I already run</h3>
            <span className="caption">Upload your history so Ritmo can learn from it. Files are read on your device.</span>
          </span>
        </div>
        <UploadPanel />
        <details>
          <summary className="label" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>How to get your Garmin history</summary>
          <GarminExportSteps />
        </details>
        {imported && (
          <button className="btn btn-primary" onClick={() => { markWelcomed(); updateProfile({ experience: 'runner' }); nav('/story?setup=1'); }}>See your running story</button>
        )}
        <ul className="list">
          <li className="list-item row-between wrap"><span className="row"><Watch size={20} strokeWidth={2} aria-hidden="true" /><span className="caption">Automatic Garmin sync is coming once Garmin approves access.</span></span></li>
          <li className="list-item row-between wrap"><span className="row"><Smartphone size={20} strokeWidth={2} aria-hidden="true" /><span className="caption">Apple Health and Health Connect: in the phone apps.</span></span>{isNative() && <Link to="/profile/health" className="btn btn-small btn-primary">Connect</Link>}</li>
        </ul>
      </section>

      <button className="card card-link row" style={{ gap: 'var(--s4)', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => { loadSample(); markWelcomed(); nav('/'); }}>
        <span className="row-icon" style={{ width: 48, height: 48 }}><Compass size={22} strokeWidth={2} aria-hidden="true" /></span>
        <span className="stack-sm" style={{ gap: 2, flex: 1 }}>
          <span className="label">Look around with sample data</span>
          <span className="caption">Explore Ritmo with an example runner. You can switch to your own data at any time.</span>
        </span>
      </button>
    </div>
  );
}
