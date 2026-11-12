// GPS for recording a run. In a browser this is the page's own location watch, which stops when the screen locks
// (Pocket mode and the "GPS paused" gap handle that). In the store app the native background location plugin keeps
// tracking with the phone locked: iPhone background location mode (a blue pill in the status bar), and an Android
// foreground service with a "Recording your run" notification. The background watch only runs during a run, so
// opening the Run tab never shows the notification.
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

export interface GpsFix { t: number; lat: number; lon: number; acc: number; alt: number | null; speed: number | null }
export type GpsError = 'denied' | 'searching';

export const hasBackgroundGps = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackgroundGeolocation');
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** Watch the position; returns a function that stops watching. `background`: keep going with the phone locked. */
export function watchGps(onFix: (f: GpsFix) => void, onError: (e: GpsError) => void, background: boolean): () => void {
  if (hasBackgroundGps()) {
    let id: string | undefined;
    let stopped = false;
    BackgroundGeolocation.addWatcher(
      {
        ...(background ? { backgroundTitle: 'Recording your run', backgroundMessage: 'Ritmo is tracking your distance and pace. Open Ritmo to pause or finish.' } : {}),
        requestPermissions: true, stale: false, distanceFilter: 0,
      },
      (loc, err) => {
        if (err) { onError(err.code === 'NOT_AUTHORIZED' ? 'denied' : 'searching'); return; }
        if (loc) onFix({ t: loc.time ?? Date.now(), lat: loc.latitude, lon: loc.longitude, acc: loc.accuracy, alt: loc.altitude ?? null, speed: loc.speed ?? null });
      },
    ).then((w) => { if (stopped) void BackgroundGeolocation.removeWatcher({ id: w }); else id = w; }).catch(() => onError('searching'));
    return () => { stopped = true; if (id) void BackgroundGeolocation.removeWatcher({ id }); };
  }
  if (!('geolocation' in navigator)) { onError('denied'); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({ t: p.timestamp, lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude, speed: p.coords.speed }),
    (e) => onError(e.code === 1 ? 'denied' : 'searching'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Open the app's settings (location was refused) */
export function openLocationSettings(): void { if (hasBackgroundGps()) void BackgroundGeolocation.openSettings(); }
