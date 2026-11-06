// Tells the runner when a new version of Ritmo is live, so they can reload at a good moment.
import { useEffect, useState } from 'react';
import { BUILD_ID } from '../lib/chunks';

export function UpdateToast() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (BUILD_ID === 'dev') return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const v = (await r.json()) as { build?: string };
        if (v.build && v.build !== BUILD_ID) setReady(true);
      } catch { /* offline */ }
    };
    const id = window.setInterval(check, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    void check();
    return () => { stopped = true; window.clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, []);
  if (!ready) return null;
  return (
    <div className="update-toast" role="status">
      <span>A new version of Ritmo is ready.</span>
      <button className="btn btn-small btn-primary" onClick={() => window.location.reload()}>Reload</button>
      <button className="btn btn-small btn-ghost" onClick={() => setReady(false)}>Later</button>
    </div>
  );
}
