// Cookie and storage notice, shown once per device until the runner chooses. Ritmo uses no cookies, advertising or
// analytics; what it stores is needed to work. The only choice is optional error reports, which can be changed any
// time in Privacy.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, onConsent, setConsent } from '../lib/consent';

export function ConsentBanner() {
  const [open, setOpen] = useState(() => !getConsent());
  useEffect(() => onConsent(() => setOpen(false)), []);
  // Room at the end of the page as tall as the notice, so nothing (such as the sign-up button) stays hidden under it
  const ref = useRef<HTMLElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setH(el.offsetHeight + 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  if (!open) return null;
  return (
    <>
    <div aria-hidden="true" style={{ height: h }} />
    <section ref={ref} className="consent-banner" role="region" aria-labelledby="consent-title">
      <h2 id="consent-title" className="label">Your privacy on this device</h2>
      <p className="caption">
        Ritmo uses no cookies, advertising or analytics. It stores only what it needs to work: your sign-in, a copy of
        your data so it opens quickly, and your settings. You can also let Ritmo send anonymous error reports, so we can
        fix crashes. They never include your name, email, runs or health data. <Link to="/privacy">Privacy policy</Link>
      </p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn-small btn-primary" onClick={() => setConsent(true)}>Allow error reports</button>
        <button type="button" className="btn btn-small" onClick={() => setConsent(false)}>Essential only</button>
      </div>
    </section>
    </>
  );
}
