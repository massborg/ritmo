import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';

export default function Privacy() {
  const nav = useNavigate();
  const { exportData, deleteEverything, session } = useApp();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <div className="stack-lg">
      <AppHeader title="Privacy" eyebrow="Your data, and how Ritmo uses it" back={!!session} />

      <section className="card stack">
        <h2 className="title">What Ritmo uses, and why</h2>
        <ul className="bullets">
          <li><strong>Your email and password</strong>: to create your account and keep your data private to you. Everyone needs an account to use Ritmo.</li>
          <li><strong>Your runs</strong> (distance, time, pace, heart rate, cadence, elevation, laps, route): to analyse sessions, estimate fitness and plan training.</li>
          <li><strong>Health information</strong> (heart rate, injuries, pain you log and how runs felt): to adjust your training and keep you safe. You agree to this when you create an account.</li>
          <li><strong>Goals, races and the days you can train</strong>: to build and adapt your plan.</li>
          <li><strong>Coach chats</strong>: so the coach can follow the conversation.</li>
        </ul>
        <p>Your data is stored in Ritmo's database in the EU and protected so that only your account can read or change it. It is also kept on your device for speed, and removed from the device when you log out. Files you upload are read on your device.</p>
        <p>When you ask the coach a question, a summary of the relevant numbers is sent to an AI model to write the answer. Your data is never sold and never used to train AI models. Garmin data is never used to train AI models.</p>
        <h3 className="label">Who processes your data for Ritmo</h3>
        <ul className="bullets">
          <li><strong>Supabase</strong> (database and accounts, EU region, Frankfurt).</li>
          <li><strong>Netlify</strong> (hosts the website; does not store your training data).</li>
          <li><strong>Anthropic</strong> (the AI model that writes coach answers; receives only the summary needed for your question, at your request, and does not use it for training).</li>
        </ul>
        <p>Data from connected services such as Garmin Connect is used only to give you your own analysis and coaching. It is never sold, shared with other users or used to train AI models. Disconnecting a service stops new data arriving; deleting your account removes everything.</p>
        <p className="caption">Ritmo gives coaching guidance, not medical advice. See a doctor or physio about ongoing pain, and get medical help straight away for chest pain, dizziness or fainting.</p>
      </section>

      <p className="caption"><Link to="/about">About Ritmo</Link> · <Link to="/terms">Terms of service</Link></p>

      {!session ? (
        <section className="card stack">
          <p className="muted">Log in to export or delete your data.</p>
          <div className="row wrap"><Link to="/login" className="btn btn-primary">Log in</Link><Link to="/signup" className="btn">Create an account</Link></div>
        </section>
      ) : (
        <>
          <section className="card stack">
            <h2 className="title">Export everything</h2>
            <p className="muted">Download all your runs, plan, races, feedback and coach chats as a JSON file.</p>
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={exportData}><Download size={18} strokeWidth={2} aria-hidden="true" />Export my data</button>
          </section>

          <section className="card stack">
            <h2 className="title">Delete your account</h2>
            <p className="muted">This permanently deletes your Ritmo account ({session.user.email}) and all data stored in it: runs, plans, races, feedback, coach chats and settings. It also clears this device. It cannot be undone. Export your data first if you want a copy.</p>
            <div className="field"><label htmlFor="del">Type DELETE to confirm</label><input id="del" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></div>
            <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} disabled={confirm !== 'DELETE' || busy} onClick={async () => {
              setBusy(true); setErr(undefined);
              const e = await deleteEverything();
              setBusy(false);
              if (e) setErr(e); else nav('/login?deleted=1', { replace: true });
            }}><Trash2 size={18} strokeWidth={2} aria-hidden="true" />{busy ? 'Deleting…' : 'Delete my account and all data'}</button>
            {err && <div role="alert"><StatusLine kind="danger">{err}</StatusLine></div>}
          </section>
        </>
      )}
    </div>
  );
}
