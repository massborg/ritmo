// "Add Ritmo to your home screen". Chrome and Edge (Android, desktop) announce that the app can be installed with a
// beforeinstallprompt event, kept here so a button can show the browser's own install dialog later. iPhone and
// iPad browsers have no such event: there the runner adds it from the Share menu, so we show those steps instead.
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const DISMISSED = 'ritmo:install:dismissed';
const DONE = 'ritmo:install:done';
const SNOOZE_DAYS = 30;
let deferred: InstallEvent | undefined;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Call once at start-up, before React, so the event is not missed. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = undefined; try { localStorage.setItem(DONE, '1'); } catch { /* */ } emit(); });
}
export const onInstallChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Already opened as an installed app (home screen icon). */
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** iPhone or iPad (iPadOS reports itself as a Mac with touch). */
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

export type InstallWay = 'prompt' | 'ios';
/** How Ritmo can be installed here, or undefined when it is installed already, was dismissed recently, or cannot be. */
export function installWay(now = Date.now()): InstallWay | undefined {
  if (isStandalone()) return undefined;
  try {
    if (localStorage.getItem(DONE)) return undefined;
    const d = Number(localStorage.getItem(DISMISSED) ?? 0);
    if (d && now - d < SNOOZE_DAYS * 86400000) return undefined;
  } catch { /* storage blocked: still offer it */ }
  if (deferred) return 'prompt';
  return isIos() ? 'ios' : undefined;
}

/** Shows the browser's install dialog; true if the runner installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = undefined;
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') { try { localStorage.setItem(DONE, '1'); } catch { /* */ } }
  emit();
  return outcome === 'accepted';
}
export function snoozeInstall() { try { localStorage.setItem(DISMISSED, String(Date.now())); } catch { /* */ } emit(); }
