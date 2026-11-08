// The "Add Ritmo to your home screen" card on the Training page, for signed-in runners who have not installed it.
import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { getConsent, onConsent } from '../lib/consent';
import { installWay, onInstallChange, promptInstall, snoozeInstall } from '../lib/install';

export function InstallPrompt() {
  const [, setTick] = useState(0);
  useEffect(() => { const a = onInstallChange(() => setTick((t) => t + 1)); const b = onConsent(() => setTick((t) => t + 1)); return () => { a(); b(); }; }, []);
  const way = installWay();
  // Wait until the privacy notice is answered, so the two never stack up
  if (!way || !getConsent()) return null;
  return (
    <section className="card install-card" aria-labelledby="install-title">
      <img src="/brand/ritmo-app-icon-180.png" width={52} height={52} alt="" className="install-icon" />
      <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
        <h2 id="install-title" className="label">Add Ritmo to your home screen</h2>
        {way === 'prompt' ? (
          <p className="caption">It opens full screen, like an app, straight to today's training.</p>
        ) : (
          <p className="caption">Tap <Share size={15} strokeWidth={2} aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-2px' }} /> <strong>Share</strong> in Safari's toolbar, then <strong>Add to Home Screen</strong>. Ritmo then opens full screen, like an app.</p>
        )}
        {way === 'prompt' && <div><button type="button" className="btn btn-small btn-primary" onClick={() => void promptInstall()}>Install Ritmo</button></div>}
      </div>
      <button type="button" className="icon-btn" aria-label="Not now" onClick={snoozeInstall}><X size={20} strokeWidth={2} aria-hidden="true" /></button>
    </section>
  );
}
