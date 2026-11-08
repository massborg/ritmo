// The runner's choice about optional extras on this device. Ritmo sets no cookies and has no advertising or
// analytics; everything else it stores (sign-in, the copy of your data, preferences) is needed for the app to work.
// The one optional extra is error reports (Sentry), off until the runner allows it.
const KEY = 'ritmo:consent';
export const CONSENT_VERSION = 1;
export interface Consent { errors: boolean; at: string; v: number }

export function getConsent(): Consent | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Consent | null;
    return c && c.v === CONSENT_VERSION ? c : undefined;
  } catch { return undefined; }
}

const listeners = new Set<(c: Consent) => void>();
export function setConsent(errors: boolean): Consent {
  const c: Consent = { errors, at: new Date().toISOString(), v: CONSENT_VERSION };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage blocked: the choice lasts for this visit */ }
  for (const l of listeners) l(c);
  return c;
}
export function onConsent(l: (c: Consent) => void): () => void { listeners.add(l); return () => listeners.delete(l); }
