// Cookie and storage notice: shown once until answered (on the login page too), both choices saved, changeable in
// Privacy. Install prompt: Android/desktop shows an Install button that opens the browser's own dialog; iPhone shows
// the Share > Add to Home Screen steps; "Not now" hides it; never shown when already installed or before the notice
// is answered. Manifest: installable fields and icons.
// Usage: node e2e/consent-install.cjs (needs the app on APP_URL, served with netlify.toml headers).
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const path = require('path'); const fs = require('fs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'consent-install'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

async function signedIn(mock, ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  return page;
}
// A fake beforeinstallprompt, as Chrome sends when the app can be installed
const fireInstallEvent = (page) => page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = async () => { window.__prompted = (window.__prompted ?? 0) + 1; };
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
});

(async () => {
  const b = await chromium.launch();
  const errors = [];

  // ---- Android: notice first, then the Install button ----
  const mock = createMock();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA, { consent: false });
  const pub = await ctx.newPage();
  pub.on('pageerror', (e) => errors.push(e.message));
  await pub.goto(`${APP}/login`);
  const banner = pub.getByRole('region', { name: 'Your privacy on this device' });
  await banner.waitFor({ timeout: 15000 });
  check(/no cookies, advertising or analytics/.test(await banner.textContent()), 'notice shown on first visit (before signing in), saying no cookies, ads or analytics');
  await banner.screenshot({ path: path.join(OUT, 'notice.png') });
  await pub.close();

  const page = await signedIn(mock, ctx, 'android@test.ritmo');
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  await fireInstallEvent(page);
  await page.waitForTimeout(300);
  check(await page.getByRole('heading', { name: 'Add Ritmo to your home screen' }).count() === 0, 'install card waits until the notice is answered');
  await page.getByRole('button', { name: 'Essential only' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:consent')));
  check(stored?.errors === false && stored.v === 1, '"Essential only" saved: error reports off');
  check(await page.getByRole('region', { name: 'Your privacy on this device' }).count() === 0, 'notice gone after choosing');
  await page.reload(); await page.waitForTimeout(1200);
  check(await page.getByRole('region', { name: 'Your privacy on this device' }).count() === 0, 'and stays gone after reloading');
  await fireInstallEvent(page);
  const card = page.locator('.install-card');
  await card.waitFor({ timeout: 5000 });
  check(await card.getByRole('button', { name: 'Install Ritmo' }).isVisible(), 'Android: install card with an Install button');
  await card.screenshot({ path: path.join(OUT, 'install-android.png') });
  await card.getByRole('button', { name: 'Install Ritmo' }).click();
  await page.waitForTimeout(400);
  check(await page.evaluate(() => window.__prompted) === 1, 'Install opens the browser\'s own install dialog');
  check(await page.locator('.install-card').count() === 0 && await page.evaluate(() => localStorage.getItem('ritmo:install:done')) === '1', 'after installing, the card is gone for good');

  // Privacy: change the choice
  await page.goto(`${APP}/profile/privacy`);
  const row = page.getByText(/Error reports on this device:/);
  await row.waitFor({ timeout: 15000 });
  check(/off/.test(await row.textContent()), 'Privacy shows error reports: off');
  await page.locator('.row-between', { has: row }).getByRole('button', { name: 'Turn on' }).click();
  check(/on$/.test((await row.textContent()).trim()) && (await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:consent')).errors)) === true, 'turned on from Privacy, and saved');
  check(await page.getByRole('heading', { name: 'Cookies and storage on your device' }).isVisible(), 'policy explains cookies and storage');
  await ctx.close();

  // ---- iPhone: Share > Add to Home Screen steps, Not now hides it ----
  const mock2 = createMock();
  const ctx2 = await b.newContext({ ...devices['Pixel 7'], userAgent: IPHONE_UA });
  await ctx2.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock2.install(ctx2, SUPA);
  const ip = await signedIn(mock2, ctx2, 'iphone@test.ritmo');
  ip.on('pageerror', (e) => errors.push(e.message));
  await ip.goto(`${APP}/`);
  const icard = ip.locator('.install-card');
  await icard.waitFor({ timeout: 15000 });
  const itext = await icard.textContent();
  check(/Share/.test(itext) && /Add to Home Screen/.test(itext) && await icard.getByRole('button', { name: 'Install Ritmo' }).count() === 0, 'iPhone: shows the Share > Add to Home Screen steps (no Install button)');
  await icard.screenshot({ path: path.join(OUT, 'install-iphone.png') });
  await icard.getByRole('button', { name: 'Not now' }).click();
  await ip.reload(); await ip.waitForTimeout(1500);
  check(await ip.locator('.install-card').count() === 0, '"Not now" hides it (for 30 days)');
  // Already installed (opened from the home screen): never shown
  await ip.evaluate(() => localStorage.removeItem('ritmo:install:dismissed'));
  await ip.emulateMedia({ media: 'screen' });
  await ctx2.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  await ip.reload(); await ip.waitForTimeout(1500);
  check(await ip.locator('.install-card').count() === 0, 'opened as an installed app: no install card');
  await ctx2.close();

  // ---- Manifest ----
  const mctx = await b.newContext();
  const mp = await mctx.newPage();
  const r = await mp.request.get(`${APP}/manifest.webmanifest`);
  const m = await r.json();
  const sizes = m.icons.map((i) => i.sizes);
  check(m.display === 'standalone' && m.start_url === '/' && m.id === '/' && sizes.includes('192x192') && sizes.includes('512x512'), `manifest installable (icons ${sizes.join(', ')})`);
  check((await mp.request.get(`${APP}/brand/ritmo-app-icon-192.png`)).ok(), '192 px icon is served');
  await mctx.close();

  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
