// Recovering from a new deploy while the app is open: the old page files no longer exist on the server, so
// opening a page that has not been loaded yet fails. Ritmo reloads once to get the new version; if that does
// not help, the page shows a "tap to reload" message instead of a blank screen.
import { lazy, type ComponentType } from 'react';

const FLAG = 'ritmo:chunk-reload';

export const isChunkError = (e: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed|text\/html.*MIME|is not a valid JavaScript MIME type/i.test(String((e as Error)?.message ?? e));

/** Reload the page once per session for a missing file. Returns false if it already tried. */
export function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(FLAG)) return false;
    sessionStorage.setItem(FLAG, String(Date.now()));
  } catch { /* storage blocked: still try once */ }
  window.location.reload();
  return true;
}

/** Clear the flag once a page has loaded fine, so a later deploy can reload again. */
export function chunkLoadedOk() {
  try { sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => factory().then((m) => { chunkLoadedOk(); return m; }).catch((e) => {
    if (isChunkError(e) && reloadOnce()) return new Promise<{ default: T }>(() => { /* reloading */ });
    throw e;
  }));
}

declare const __BUILD_ID__: string;
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
