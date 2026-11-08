// Ritmo's service worker: notifications only. It does not cache or intercept anything (no fetch handler),
// so the app always loads the latest version from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data ? event.data.text() : '' }; }
  const title = msg.title || 'Ritmo';
  event.waitUntil(self.registration.showNotification(title, {
    body: msg.body || '',
    tag: msg.tag || undefined,
    icon: '/brand/ritmo-app-icon-192.png',
    badge: '/brand/ritmo-app-icon-192.png',
    data: { url: typeof msg.url === 'string' && msg.url.startsWith('/') ? msg.url : '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) { await open.focus(); if ('navigate' in open) await open.navigate(url).catch(() => undefined); return; }
    await self.clients.openWindow(url);
  })());
});
