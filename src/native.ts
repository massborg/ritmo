// Native shell helpers (Capacitor). No-ops on the web.
import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => Capacitor.isNativePlatform();

/** Match the status bar to the theme: dark text on Giorno and Sole, light text on Notte. */
export async function syncStatusBar(theme: 'system' | 'giorno' | 'notte' | 'sole') {
  if (!isNativeApp()) return;
  const { StatusBar, Style } = await import('@capacitor/status-bar');
  const dark = theme === 'notte' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

export async function tapHaptic() {
  if (!isNativeApp()) return;
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

export function initNative() {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native', `native-${Capacitor.getPlatform()}`);
  // Android back button: go back in the app, exit from the top level
  import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', ({ canGoBack }) => { if (canGoBack) window.history.back(); else App.exitApp(); });
  });
}
