import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';

/** Garmin sends the runner back here after they agree (or decline) to share their data with Ritmo. */
export default function GarminCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { completeGarminConnect, session } = useApp();
  const [msg, setMsg] = useState<{ kind: 'info' | 'success' | 'danger'; text: string }>({ kind: 'info', text: 'Connecting your Garmin account…' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !session) return;
    started.current = true;
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      setMsg({ kind: 'danger', text: params.get('error') ? 'Garmin was not connected, because sharing was not allowed. You can try again at any time.' : 'This link is incomplete. Please start again from Data sources.' });
      return;
    }
    completeGarminConnect(code, state).then((err) => {
      if (err) { setMsg({ kind: 'danger', text: err }); return; }
      setMsg({ kind: 'success', text: 'Garmin is connected. Each new run will appear in Ritmo shortly after it syncs to Garmin Connect.' });
      setTimeout(() => nav('/profile/data', { replace: true }), 2500);
    });
  }, [params, session, completeGarminConnect, nav]);

  return (
    <div className="stack-lg">
      <AppHeader title="Garmin Connect" />
      <section className="card stack">
        {!session ? <StatusLine kind="info">Log in to finish connecting Garmin.</StatusLine> : <StatusLine kind={msg.kind}>{msg.text}</StatusLine>}
        <Link to="/profile/data" className="btn" style={{ alignSelf: 'flex-start' }}>Back to Data sources</Link>
      </section>
    </div>
  );
}
