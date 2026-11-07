import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';

/** Strava sends the runner back here after they agree (or decline) to share their activities with Ritmo. */
export default function StravaCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { completeStravaConnect, session } = useApp();
  const [msg, setMsg] = useState<{ kind: 'info' | 'success' | 'danger'; text: string }>({ kind: 'info', text: 'Connecting your Strava account…' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !session) return;
    started.current = true;
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      setMsg({ kind: 'danger', text: params.get('error') ? 'Strava was not connected, because access was not allowed. You can try again at any time.' : 'This link is incomplete. Please start again from Data sources.' });
      return;
    }
    completeStravaConnect(code, state, params.get('scope') ?? '').then((err) => {
      if (err) { setMsg({ kind: 'danger', text: err }); return; }
      setMsg({ kind: 'success', text: 'Strava is connected. Your runs from the last 30 days are on their way, and each new run will appear shortly after it uploads to Strava.' });
      setTimeout(() => nav('/profile/data', { replace: true }), 3000);
    });
  }, [params, session, completeStravaConnect, nav]);

  return (
    <div className="stack-lg">
      <AppHeader title="Strava" />
      <section className="card stack">
        {!session ? <StatusLine kind="info">Log in to finish connecting Strava.</StatusLine> : <StatusLine kind={msg.kind}>{msg.text}</StatusLine>}
        <Link to="/profile/data" className="btn" style={{ alignSelf: 'flex-start' }}>Back to Data sources</Link>
      </section>
    </div>
  );
}
