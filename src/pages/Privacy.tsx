import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { getConsent, setConsent } from '../lib/consent';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';
import { COMPANY_ADDRESS, COMPANY_COUNTRY, COMPANY_NAME, COMPANY_REG_NO, COMPANY_VAT, CONTACT_EMAIL } from '../lib/contact';

export default function Privacy() {
  const nav = useNavigate();
  const { exportData, deleteEverything, session, data, updateProfile } = useApp();
  const [errorsConsent, setErrorsConsent] = useState(getConsent);
  const ai = data.profile.consents?.aiCoach;
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <div className="stack-lg">
      <AppHeader title="Privacy" eyebrow="Last updated 7 November 2026" back={!!session} />

      <section className="card stack">
        <h2 className="title">What Ritmo uses, and why</h2>
        <ul className="bullets">
          <li><strong>Your email and password</strong>: to create your account and keep your data private to you. Everyone needs an account to use Ritmo. Ritmo is for adults aged 18 and over.</li>
          <li><strong>Your name and date of birth</strong>: to talk to you and to apply the age rule. Your date of birth is never shown to anyone.</li>
          <li><strong>Your profile picture</strong> (optional): shown only to you in the app, also if you use the Hub (other runners see your initials). It is cropped and re-saved on your device before upload, which removes location and other hidden details, and is stored privately. It is never sent to the AI coach or used for anything else.</li>
          <li><strong>Photos of your shoes</strong> (optional): shown only to you. Like the profile picture, each is resized and re-saved on your device before upload, which removes location and other hidden details, and stored privately in your own folder.</li>
          <li><strong>Health check</strong>: Ritmo keeps only the outcome (whether you were advised to check with a doctor, and when you confirmed), not your individual answers.</li>
          <li><strong>Your runs</strong> (distance, time, pace, heart rate, cadence, elevation, laps, route): to analyse sessions, estimate fitness and plan training.</li>
          <li><strong>Body check-ins and AI injury chat</strong> (pain, where and when it hurts, warning signs, return-to-run steps): to adjust your plan and give general guidance. This is health data covered by your health-data permission. It is never shown on the Hub or in share images. The Body AI chat is optional and can be switched off separately from the Coach AI; if it is on, your question and a summary of your training load and logged pain are sent to the AI model for that answer only.</li>
          <li><strong>Health information</strong> (heart rate, injuries, pain you log and how runs felt): to adjust your training and keep you safe. Ritmo asks for your explicit permission for this at the start of setup, and records when you gave it.</li>
          <li><strong>Goals, races and the days you can train</strong>: to build and adapt your plan.</li>
          <li><strong>Coach chats</strong>: so the coach can follow the conversation.</li>
          <li><strong>Screenshots of runs</strong> (optional): stored privately so you can see them with the run. If you ask Ritmo to read the laps, they are sent to the AI model for that only.</li>
        </ul>
        <p>Your data is stored in Ritmo's database in the EU and protected so that only your account can read or change it. It is also kept on your device for speed, and removed from the device when you log out. Files you upload are read on your device.</p>
        <h3 className="label">AI features (all optional)</h3>
        <p>Ritmo uses an AI model for three things, and only when you use them:</p>
        <ul className="bullets">
          <li><strong>AI coach answers</strong>, only if you agree: your question and a summary of the relevant training numbers are sent to write the answer. Up to 30 AI answers an hour and 100 a day per person; after that the built-in coach answers.</li>
          <li><strong>Reading laps from screenshots</strong>, only when you tap "Read the laps": the screenshots you chose are sent to read the lap table (times, distances, heart rate). The result is shown to you to check and edit before anything is saved. Up to 30 reads a day per person.</li>
          <li><strong>Body chat</strong>, only if you use it with AI switched on (it has its own switch): your question and a summary of your training load and logged pain are sent for that answer. Warning signs are checked by Ritmo's own rules first and are never sent.</li>
        </ul>
        <p>Your email, profile picture, date of birth and health check answers are never sent to the AI model. Data sent to it is used only to produce your answer, is not used to train AI models, and is never sold. Garmin data is never used to train AI models.</p>
        <h3 className="label">Who processes your data for Ritmo</h3>
        <ul className="bullets">
          <li><strong>Supabase</strong> (database and accounts, EU region, Frankfurt).</li>
          <li><strong>Netlify</strong> (hosts the website; does not store your training data).</li>
          <li><strong>Anthropic</strong> (the AI model behind coach answers, reading laps from screenshots and Body chat; receives only what is needed for the request you made, and does not use it for training).</li>
          <li><strong>Sentry</strong> (Functional Software, Inc.; error reports, so we can find and fix crashes; only if you allow error reports on your device). When something goes wrong in the app, a report of the error, the page it happened on (without any private link or code in the address), your browser and device type, and the app version is sent. Your name, email, account, IP address, runs and health data are not included.</li>
          <li><strong>MET Norway</strong> (the Norwegian Meteorological Institute; the weather shown on your recent runs). Shortly after a run with GPS, Ritmo's server asks MET Norway for the weather at the run's starting area, rounded to about 1 km. Your name, email and account are never sent, and the weather is saved with the run so it is only looked up once.</li>
          <li><strong>Browser push services</strong> (Apple, Google, Mozilla or Microsoft, depending on your device and browser; only if you turn on reminders). Notifications travel through your browser maker's push service. Each message is encrypted on Ritmo's server for your device alone, so the push service cannot read it; it sees only a device address and when a message is sent. Turn reminders off in Profile, or sign out, and that device's address is deleted.</li>
          <li><strong>OpenStreetMap Foundation</strong> (the map behind your own routes, on your run pages and while you record a run). To draw it, your device fetches map images for the area around the route from OpenStreetMap's servers, which receive your IP address and that map area. No account details, run data or health data are sent. You can switch maps off with "Hide map" under any route or the live map.</li>
        </ul>
        <h3 className="label">Strava (optional, only if you connect it)</h3>
        <p>If you connect Strava, Ritmo receives your runs from Strava (time, distance, pace, heart rate, cadence, elevation, laps and route) to give you your own analysis, plan and feedback. Runs that come from Strava are only ever shown to you: they cannot be posted to the Hub or shared as images, and nothing about them is sent to the AI model, which answers only from your other runs. Disconnecting Strava, in Ritmo or in Strava's settings, stops new data and revokes Ritmo's access; a run you delete on Strava is removed from Ritmo too. Deleting your Ritmo account also revokes Ritmo's access to Strava.</p>
        <h3 className="label">Cookies and storage on your device</h3>
        <p>Ritmo uses no cookies, and no advertising or analytics. It stores on your device only what it needs to work: your sign-in, a copy of your data so the app opens quickly and works with a weak signal, and your settings (such as units or whether maps are shown). If you turn on reminders, a small notifications-only helper (a service worker) is added; it shows the notifications and stores nothing. Error reports to Sentry are optional and off until you allow them, in the notice shown on your first visit or under Your choices on this page.</p>
        <h3 className="label">Calendar link (optional, off unless you create it)</h3>
        <p>If you create a calendar link, your calendar app fetches your planned sessions and races from Ritmo through a long, random private link. Anyone who has the link can see those planned sessions and races, but nothing else: no runs, health data, locations or account details. You can reset the link or turn it off at any time, and the old link stops working straight away.</p>
        <h3 className="label">Sharing runs on the Hub (optional, off unless you turn it on)</h3>
        <p>The Hub lets you share runs with other runners. It stays off until you agree to it separately, and Ritmo records when you did. Nothing is ever posted automatically: you choose each run, who can see it (everyone, your followers, or only you), and whether to show the route and heart rate. Routes on the Hub leave out the first and last part, so your start and finish (often your home) are not shown. Other runners see the name you choose for the Hub, never your email, date of birth, health check or how runs felt. Pain, injuries and Body check-ins are never shown on the Hub. You can delete a post at any time, and turning sharing off hides your posts.</p>
        <p>Data from connected services such as Garmin Connect is used only to give you your own analysis and coaching, and on the Hub only for runs you choose to post. It is never sold or used to train AI models. Disconnecting a service stops new data arriving; deleting your account removes everything.</p>
        <h3 className="label">Who is responsible for your data</h3>
        <p>Ritmo Running is provided by {COMPANY_NAME}, a company registered in {COMPANY_COUNTRY} (registration number {COMPANY_REG_NO}, registered office {COMPANY_ADDRESS}, VAT {COMPANY_VAT}), which is responsible for your data under the GDPR. You can ask for a copy of your data, ask us to correct or delete it, object to how it is used, or withdraw your consent at any time by writing to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You can also export or delete everything yourself below. If you are unhappy with how we handle your data, you can complain to your local data protection authority.</p>
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
            <div className="row-between wrap">
              <span className="muted">Error reports on this device: {errorsConsent?.errors ? 'on' : errorsConsent ? 'off' : 'not chosen yet'}</span>
              <button className="btn btn-small" onClick={() => setErrorsConsent(setConsent(!errorsConsent?.errors))}>{errorsConsent?.errors ? 'Turn off' : 'Turn on'}</button>
            </div>
          </section>

          <section className="card stack">
            <h2 className="title">Export everything</h2>
            <p className="muted">Download all your data as a JSON file: account details, profile and setup answers, your choices above, runs, plan, races, feedback, coach chats and your profile picture and any photos of your shoes.</p>
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
