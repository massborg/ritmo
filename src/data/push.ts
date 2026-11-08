// Push reminders in the browser: the notifications-only service worker (/sw.js), the browser's permission, and
// this browser's push subscription, saved by the push server function. Works in Chrome, Edge, Firefox and Safari
// on computers and Android; on iPhone and iPad only once Ritmo is added to the home screen (Apple's rule).
import { supabase } from './supabase';
import { isIos, isStandalone } from '../lib/install';
import { isNativeApp } from '../native';

export type PushSupport = 'ok' | 'ios-install' | 'native' | 'unsupported';

export function pushSupport(): PushSupport {
  if (isNativeApp()) return 'native';
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'ios-install';
  return has ? 'ok' : 'unsupported';
}

export const pushPermission = (): NotificationPermission => ('Notification' in window ? Notification.permission : 'denied');

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { data, error } = await supabase.functions.invoke('push', { body });
  if (error) {
    let message = 'Reminders could not be set up right now. Please try again later.';
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.message) message = j.message; } catch { /* keep the general message */ }
    throw new Error(message);
  }
  return data as T;
}

const registration = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready);
const keyBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

/** This browser's current subscription, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask for permission (must follow a tap), subscribe this browser and save it. */
export async function enablePush(): Promise<PushSubscription> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied'
    ? 'Notifications are blocked for Ritmo. Allow them in your browser or phone settings, then try again.'
    : 'Notifications were not allowed.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await call<{ publicKey: string }>({ action: 'key' });
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  }
  await call({ action: 'subscribe', subscription: sub.toJSON(), tz: tz() });
  return sub;
}

/** Stop notifications on this browser. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  try { await call({ action: 'unsubscribe', endpoint: sub.endpoint }); } finally { await sub.unsubscribe().catch(() => undefined); }
}

export async function sendTestPush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) throw new Error('Reminders are not on for this device.');
  await call({ action: 'test', endpoint: sub.endpoint });
}

/** On start-up: keep the saved subscription and time zone current (people travel; browsers renew subscriptions). */
export async function refreshPush(): Promise<void> {
  try {
    if (pushSupport() !== 'ok' || pushPermission() !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await call({ action: 'subscribe', subscription: sub.toJSON(), tz: tz() });
  } catch { /* quietly: reminders are a nice extra */ }
}
