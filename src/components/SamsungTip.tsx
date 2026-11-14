// A one-time tip for Samsung Internet. Its own dark mode repaints websites, including strong colours, so Ritmo's
// orange shows as dark red. It ignores the standard ways a site says it has its own dark theme (color-scheme, even
// with "only"), and a page can't tell whether it is on, so every Samsung Internet runner sees this once.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { getConsent } from '../lib/consent';
import { isNativeApp } from '../native';
import { isSamsungInternet } from '../lib/install';

const KEY = 'ritmo:samsung-tip:dismissed';
const dismissed = () => { try { return !!localStorage.getItem(KEY); } catch { return false; } };

export function SamsungTip() {
  const [gone, setGone] = useState(dismissed);
  // Wait until the privacy notice is answered, so the two never stack up
  if (gone || !isSamsungInternet() || isNativeApp() || !getConsent()) return null;
  const close = () => { try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* */ } setGone(true); };
  return (
    <section className="card samsung-tip" aria-labelledby="samsung-tip-title">
      <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
        <h2 id="samsung-tip-title" className="label">Colours look dark red?</h2>
        <p className="caption">Samsung Internet's dark mode repaints websites, and turns Ritmo's orange dark red. To see Ritmo's real colours, tap <strong>☰</strong>, then <strong>Settings</strong>, then <strong>Dark mode</strong>, and choose <strong>Off</strong>.</p>
        <p className="caption">Ritmo has its own dark theme. You can choose it in <Link to="/profile">Profile, under Appearance</Link>.</p>
        <div><button type="button" className="btn btn-small" onClick={close}>Got it</button></div>
      </div>
      <button type="button" className="icon-btn" aria-label="Close" onClick={close}><X size={20} strokeWidth={2} aria-hidden="true" /></button>
    </section>
  );
}
