import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { StatusLine } from '../components/ui';

export default function Privacy() {
  const nav = useNavigate();
  const { exportData, deleteAll, session } = useApp();
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => nav(-1)}><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />Back</button>
      <h1 className="display-lg">Privacy and your data</h1>

      <section className="card stack">
        <h2 className="title">What Ritmo uses, and why</h2>
        <ul className="bullets">
          <li><strong>Your runs</strong> (distance, time, pace, heart rate, cadence, elevation, laps, route): to analyse sessions, estimate fitness and plan training.</li>
          <li><strong>How runs felt and any pain</strong>: to adjust feedback and keep you safe.</li>
          <li><strong>Goals, races, availability and injuries</strong>: to build and adapt your plan.</li>
          <li><strong>Your email</strong>, only if you sign in: to back up your data and sync devices.</li>
        </ul>
        <p>Files you upload are read on your device. Your data is stored on this device and, if you sign in, in Ritmo's database in the EU, visible only to you.</p>
        <p>When you ask the coach a question, a summary of the relevant numbers is sent to an AI model to write the answer. Your data is never sold and never used to train AI models. Garmin data is never used to train AI models.</p>
        <p className="caption">Ritmo gives coaching guidance, not medical advice.</p>
      </section>

      <section className="card stack">
        <h2 className="title">Export everything</h2>
        <p className="muted">Download all your runs, plan, races, feedback and coach chats as a JSON file.</p>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={exportData}><Download size={18} strokeWidth={2} aria-hidden="true" />Export my data</button>
      </section>

      <section className="card stack">
        <h2 className="title">Delete everything</h2>
        <p className="muted">This permanently removes all your data from this device{session ? ' and from your Ritmo account' : ''}. It cannot be undone.</p>
        <div className="field"><label htmlFor="del">Type DELETE to confirm</label><input id="del" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></div>
        <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} disabled={confirm !== 'DELETE'} onClick={async () => { await deleteAll(); setDone(true); setConfirm(''); }}><Trash2 size={18} strokeWidth={2} aria-hidden="true" />Delete all my data</button>
        {done && <StatusLine kind="success">All your data has been deleted.</StatusLine>}
      </section>
    </div>
  );
}
