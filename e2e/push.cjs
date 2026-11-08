// Push reminders: turning them on (permission, subscription saved with the device's time zone), choosing times,
// a test message, the service worker showing a pushed notification, turning off, signing out, and the iPhone and
// blocked-permission messages. The browser's push subscription is stubbed (headless Chromium has no push service);
// the real /sw.js is registered and receives a real push event through the DevTools protocol.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

const stub = (answer) => {
  const P = '__push_perm', S = '__push_sub';
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* */ } };
  if (!window.Notification || !window.PushManager) return;
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => get(P) ?? 'default' });
  Notification.requestPermission = async () => { set(P, answer); return answer; };
  const sub = (ep) => ({ endpoint: ep, toJSON: () => ({ endpoint: ep, keys: { p256dh: 'BPfakeKey', auth: 'fakeAuth' } }), unsubscribe: async () => { set(S, null); return true; } });
  PushManager.prototype.getSubscription = async function () { const ep = get(S); return ep ? sub(ep) : null; };
  PushManager.prototype.subscribe = async function (o) { if (!o?.applicationServerKey?.byteLength) throw new Error('no key'); set(S, `https://fcm.googleapis.com/fcm/send/e2e-${Date.now()}`); return sub(get(S)); };
};

async function account(b, { device, answer = 'granted', mock = createMock() } = {}) {
  const ctx = await b.newContext({ ...(device ? devices[device] : { viewport: { width: 1280, height: 900 } }), timezoneId: 'Europe/Madrid' });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await ctx.addInitScript(stub, answer);
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const email = `push-${Math.random().toString(36).slice(2, 8)}@test.ritmo`;
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  const fit = page.getByRole('button', { name: /Train 6 days a week/ });
  if (await fit.isVisible().catch(() => false)) { await fit.click(); await page.waitForTimeout(1000); }
  await page.goto(`${APP}/profile`);
  await page.getByRole('heading', { name: 'Reminders' }).waitFor();
  return { ctx, page, mock, uid };
}
const profileData = (mock, uid) => mock.state.tables.profiles.find((r) => r.user_id === uid)?.data?.profile ?? {};
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

(async () => {
  const b = await chromium.launch();

  // 1) Turn on, choose times, test, receive a push, turn off
  {
    const { ctx, page, mock, uid } = await account(b);
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Reminders' }) });
    check(await card.getByRole('button', { name: 'Turn on reminders' }).isVisible(), 'Profile has a Reminders card with "Turn on reminders"');
    await card.getByRole('button', { name: 'Turn on reminders' }).click();
    await card.getByText("Morning: today's session").waitFor({ timeout: 5000 });
    const subs = [...(mock.state.push?.subs.values() ?? [])];
    check(subs.length === 1 && subs[0].user_id === uid, 'turning on saves this browser for the signed-in runner');
    check(subs[0]?.tz === 'Europe/Madrid', 'the device time zone is saved, so reminders arrive at local time');
    check(await until(() => profileData(mock, uid).reminders?.morning === '07:00' && profileData(mock, uid).reminders?.evening === '20:00'), 'default times are saved: 07:00 morning, 20:00 evening');
    await card.getByRole('radio', { name: '06:30' }).click().catch(async () => card.getByRole('button', { name: '06:30' }).click());
    await card.getByRole('radio', { name: '21:00' }).click().catch(async () => card.getByRole('button', { name: '21:00' }).click());
    check(await until(() => profileData(mock, uid).reminders?.morning === '06:30' && profileData(mock, uid).reminders?.evening === '21:00'), 'choosing other times saves them with the profile');
    await card.getByRole('button', { name: 'Send a test' }).click();
    check(await card.getByText('Sent. It should appear in a few seconds.').waitFor({ timeout: 4000 }).then(() => true, () => false) && mock.state.push.tests === 1, '"Send a test" asks the server to send a test notification');
    // After a reload the card still shows reminders as on (subscription found again)
    await page.reload(); await page.getByRole('heading', { name: 'Reminders' }).waitFor();
    check(await card.getByRole('button', { name: 'Send a test' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'after reopening the app, reminders still show as on');
    // The real service worker shows a pushed message as a notification
    await ctx.grantPermissions(['notifications'], { origin: APP });
    const cdp = await ctx.newCDPSession(page);
    let regId;
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { for (const r of e.registrations) if (r.scopeURL.startsWith(APP)) regId = r.registrationId; });
    await cdp.send('ServiceWorker.enable');
    await until(() => !!regId);
    check(!!regId, 'the notifications-only service worker (/sw.js) is registered');
    // Headless Chromium cannot display notifications, so record what the worker asks the system to show
    const sw = ctx.serviceWorkers().find((w) => w.url().endsWith('/sw.js'));
    await sw.evaluate(() => { self.__shown = []; self.registration.showNotification = async (t, o) => { self.__shown.push({ t, ...o }); }; });
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: APP, registrationId: regId, data: JSON.stringify({ title: 'Today: Easy run', body: '8 km. Tap to see the session.', url: '/', tag: 'morning-test' }) });
    let got;
    const shown = await until(async () => { got = await sw.evaluate(() => self.__shown[0]); return got?.t === 'Today: Easy run' && got.body === '8 km. Tap to see the session.'; });
    check(shown, 'a pushed reminder is shown as a notification with its title and text');
    check(got?.tag === 'morning-test' && got?.data?.url === '/' && /ritmo-app-icon-192/.test(got?.icon ?? ''), 'the notification has the Ritmo icon, opens the app, and replaces an older one of the same kind');
    const caches = await page.evaluate(async () => (await window.caches.keys()).length);
    check(caches === 0, 'the service worker caches nothing (the app always loads fresh)');
    await card.getByRole('button', { name: 'Turn off on this device' }).click();
    await card.getByRole('button', { name: 'Turn on reminders' }).waitFor({ timeout: 4000 });
    check(mock.state.push.subs.size === 0, '"Turn off on this device" forgets this browser on the server');
    // Signing out also forgets the device
    await card.getByRole('button', { name: 'Turn on reminders' }).click();
    await card.getByRole('button', { name: 'Send a test' }).waitFor();
    check(mock.state.push.subs.size === 1, 'turned back on');
    await page.getByRole('button', { name: /Log out/ }).first().click();
    const c = page.getByRole('dialog').getByRole('button', { name: /Log out/ });
    if (await c.isVisible().catch(() => false)) await c.click();
    check(await until(() => mock.state.push.subs.size === 0), 'logging out stops reminders on this device');
    await ctx.close();
  }

  // 2) Notifications blocked
  {
    const { ctx, page } = await account(b, { answer: 'denied' });
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Reminders' }) });
    await card.getByRole('button', { name: 'Turn on reminders' }).click();
    check(await card.getByRole('alert').filter({ hasText: 'Notifications are blocked for Ritmo' }).waitFor({ timeout: 4000 }).then(() => true, () => false), 'blocked notifications explain how to allow them');
    await ctx.close();
  }

  // 3) iPhone in Safari (not on the home screen): explain Apple's rule, no button
  {
    const { ctx, page } = await account(b, { device: 'iPhone 13' });
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Reminders' }) });
    check(await card.getByText('Apple only allows notifications once Ritmo is on your home screen').isVisible(), 'iPhone in Safari: explains adding Ritmo to the home screen first');
    check(await card.getByRole('button', { name: 'Turn on reminders' }).count() === 0, 'iPhone in Safari: no button that cannot work');
    await ctx.close();
  }

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
