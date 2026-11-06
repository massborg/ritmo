import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';

export default function Privacy() {
  const nav = useNavigate();
  const { exportData, deleteEverything, session, data, updateProfile } = useApp();
  const ai = data.profile.consents?.aiCoach;
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <div className="stack-lg">
      <AppHeader title="Privacy" eyebrow="Your data, and how Ritmo uses it" back={!!session} />

      <section className="card stack">
        <h2 className="title">What Ritmo uses, and why</h2>
        <ul className="bullets">
          <li><strong>Your email and password</strong>: to create your account and keep your data private to you. Everyone needs an account to use Ritmo. Ritmo is for adults aged 18 and over.</li>
          <li><strong>Your name and date of birth</strong>: to talk to you and to apply the age rule. Your date of birth is never shown to anyone.</li>
          <li><strong>Your profile picture</strong> (optional): shown only to you in the app, also if you use the Hub (other runners see your initials). It is cropped and re-saved on your device before upload, which removes location and other hidden details, and is stored privately. It is never sent to the AI coach or used for anything else.</li>
          <li><strong>Health check</strong>: Ritmo keeps only the outcome (whether you were advised to check with a doctor, and when you confirmed), not your individual answers.</li>
          <li><strong>Your runs</strong> (distance, time, pace, heart rate, cadence, elevation, laps, route): to analyse sessions, estimate fitness and plan training.</li>
          <li><strong>Health information</strong> (heart rate, injuries, pain you log and how runs felt): to adjust your training and keep you safe. Ritmo asks for your explicit permission for this at the start of setup, and records when you gave it.</li>
          <li><strong>Goals, races and the days you can train</strong>: to build and adapt your plan.</li>
          <li><strong>Coach chats</strong>: so the coach can follow the conversation.</li>
          <li><strong>Screenshots of runs</strong> (optional): stored privately so you can see them with the run. If you ask Ritmo to read the laps, they are sent to the AI model for that only.</li>
        </ul>
        <p>Your data is stored in Ritmo's database in the EU and protected so that only your account can read or change it. It is also kept on your device for speed, and removed from the device when you log out. Files you upload are read on your device.</p>
        <p>The AI coach is optional. Only if you agree, your question and a summary of the relevant training numbers are sent to an AI model to write the answer. Your email, profile picture, date of birth and health check are never sent. To keep costs fair, each person can get up to 30 AI answers an hour and 100 a day; after that the built-in coach answers. Your data is never sold and never used to train AI models. Garmin data is never used to train AI models.</p>
        <h3 className="label">Who processes your data for Ritmo</h3>
        <ul className="bullets">
          <li><strong>Supabase</strong> (database and accounts, EU region, Frankfurt).</li>
          <li><strong>Netlify</strong> (hosts the website; does not store your training data).</li>
          <li><strong>Anthropic</strong> (the AI model that writes coach answers; receives only the summary needed for your question, at your request, and does not use it for training).</li>
        </ul>
        <h3 className="label">Sharing runs on the Hub (optional, off unless you turn it on)</h3>
        <p>The Hub lets you share runs with other runners. It stays off until you agree to it separately, and Ritmo records when you did. Nothing is ever posted automatically: you choose each run, who can see it (everyone, your followers, or only you), and whether to show the route and heart rate. Routes on the Hub leave out the first and last part, so your start and finish (often your home) are not shown. Other runners see the name you choose for the Hub, never your email, date of birth, health check or how runs felt. Pain, injuries and Body check-ins are never shown on the Hub. You can delete a post at any time, and turning sharing off hides your posts.</p>
        <p>Data from connected services such as Garmin Connect is used only to give you your own analysis and coaching, and on the Hub only for runs you choose to post. It is never sold or used to train AI models. Disconnecting a service stops new data arriving; deleting your account removes everything.</p>
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
            <h2 className="title">Your choices</h2>
            <p className="muted">Health and training data: {data.profile.consents?.healthData?.granted ? `agreed on ${new Date(data.profile.consents.healthData.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Ritmo cannot coach without it; to withdraw it, delete your account below.` : 'not yet given. You will be asked in setup.'}</p>
            <div className="row-between wrap">
              <span className="muted">AI coach answers: {ai?.granted ? 'on' : ai ? 'off' : 'not chosen yet'}</span>
              <button className="btn btn-small" onClick={() => updateProfile({ consents: { ...data.profile.consents, aiCoach: { granted: !ai?.granted, at: new Date().toISOString() } } })}>{ai?.granted ? 'Turn off' : 'Turn on'}</button>
            </div>
          </section>

          <section className="card stack">
            <h2 className="title">Export everything</h2>
            <p className="muted">Download all your data as a JSON file: account details, profile and setup answers, your choices above, runs, plan, races, feedback, coach chats and your profile picture.</p>
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={exportData}><Download size={18} strokeWidth={2} aria-hidden="true" />Export my data</button>
          </section>

          <section className="card stack">
            <h2 className="title">Delete your account</h2>
            <p className="muted">This permanently deletes your Ritmo account ({session.user.email}) and all data stored in it: runs, plans, races, feedback, coach chats, your profile picture and settings. It also clears this device. It cannot be undone. Export your data first if you want a copy.</p>
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
