import { Link } from 'react-router-dom';
import { Activity, Brain, CalendarDays, HeartPulse, Lock, Watch } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Lanes, Logo } from '../components/ui';
import { COMPANY_COUNTRY, COMPANY_NAME, CONTACT_EMAIL } from '../lib/contact';

/** Public page describing Ritmo Running, for visitors, partners and platform reviewers. */
export default function About() {
  const { session } = useApp();
  const features = [
    { icon: Activity, title: 'Every run analysed', text: 'Pace, heart rate, cadence, splits and elevation, with plain-English feedback on what went well and what to change.' },
    { icon: CalendarDays, title: 'Adaptive training plans', text: 'Base, build, peak and taper phases built from your history and goals, adjusted after missed or harder sessions, with every change explained.' },
    { icon: HeartPulse, title: 'Readiness and load', text: 'Fitness, fatigue and form from your recent training, with warnings about sudden spikes linked to injury risk.' },
    { icon: Brain, title: 'A coach that uses your real data', text: 'Ask "Why is today easy?" or "Am I on track?" and get answers from your own runs. Coaching guidance, not medical advice.' },
    { icon: Watch, title: 'Your devices', text: 'Upload FIT, GPX and TCX files or your Garmin export today. Automatic Garmin sync and Apple Health and Health Connect are coming.' },
    { icon: Lock, title: 'Private by design', text: 'Your data is private to your account, stored in the EU, never sold and never used to train AI models. Export or delete it at any time.' },
  ];
  return (
    <div className="stack-lg" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="row-between wrap" style={{ paddingTop: 'calc(var(--s5) + env(safe-area-inset-top))' }}>
        <Logo variant="main" width={170} />
        <div className="row wrap">
          {session ? <Link to="/" className="btn btn-primary">Open Ritmo</Link> : <><Link to="/login" className="btn">Log in</Link><Link to="/signup" className="btn btn-primary">Create an account</Link></>}
        </div>
      </div>
      <section className="hero stack">
        <Lanes />
        <h1 className="display-lg">Train to your own rhythm.</h1>
        <p className="body" style={{ maxWidth: 560 }}>Ritmo Running connects to your running data, understands years of training, and tells you what to do next and why. Like a calm, expert coach in your pocket, for a first 5K or a marathon best.</p>
      </section>
      <div className="grid-2">
        {features.map((f) => (
          <section key={f.title} className="card stack-sm">
            <span className="row-icon"><f.icon size={18} strokeWidth={2} aria-hidden="true" /></span>
            <h2 className="title" style={{ fontSize: 20, lineHeight: '26px' }}>{f.title}</h2>
            <p className="muted">{f.text}</p>
          </section>
        ))}
      </div>
      <section className="band stack-sm">
        <h2 className="title">Who makes Ritmo</h2>
        <p>Ritmo Running is developed in Malta by {COMPANY_NAME}, a company registered in {COMPANY_COUNTRY}. Questions, partnerships or data requests: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--on-graphite)' }}>{CONTACT_EMAIL}</a>.</p>
      </section>
      <p className="caption" style={{ textAlign: 'center', paddingBottom: 'var(--s6)' }}>
        <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms of service</Link> · Garmin is a trademark of Garmin Ltd. or its subsidiaries.
      </p>
    </div>
  );
}
