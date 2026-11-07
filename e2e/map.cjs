// Route map: OpenStreetMap tiles sit under the route on the runner's own run page, with the required credit,
// a Hide map / Show map switch that is remembered, and tiles allowed by the site's security policy.
// Usage: node e2e/map.cjs (needs the app on APP_URL, served with netlify.toml headers). LIVE_TILES=1 fetches real tiles.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'map');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
// Fixed tab bar and coach button can cover an element at the screen's edge, so tap it in the middle of the screen
const tap = async (loc) => { await loc.waitFor({ timeout: 15000 }); await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await loc.click(); };
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
// 1x1 light grey PNG, used instead of real tiles unless LIVE_TILES=1
const STUB = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+/btfwAJfwPpa1fKXQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const tileHits = [];
  await ctx.route('https://tile.openstreetmap.org/**', (r) => { tileHits.push(r.request().url()); return process.env.LIVE_TILES ? r.continue() : r.fulfill({ status: 200, contentType: 'image/png', body: STUB }); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const csp = []; page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  const email = 'map@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const withGps = rows.activities[rows.activities.length - 1];
  withGps.streams = Array.from({ length: 300 }, (_, i) => ({ t: i * 19, d: i * 30, lat: 35.8989 + (i * 7.5) / 111195 * Math.cos(i / 60), lon: 14.5146 + (i * 7.5) / 90000 * Math.sin(i / 60) }));
  const noGps = rows.activities[rows.activities.length - 2];
  noGps.streams = Array.from({ length: 50 }, (_, i) => ({ t: i * 20, d: i * 60 }));
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  const full = async () => { const btn = page.locator('summary', { hasText: 'Show full analysis' }); await tap(btn); };
  await page.goto(`${APP}/activity/${withGps.id}`); await full();
  const map = page.getByRole('img', { name: 'Route on a map' });
  await map.waitFor({ timeout: 15000 }).catch(async (e) => { await page.screenshot({ path: path.join(OUT, 'debug.png'), fullPage: true }); console.log('URL', page.url(), 'routes:', await page.locator('h2').allTextContents()); throw e; });
  await map.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200);
  const tiles = await page.locator('.route-map image.route-tile').count();
  check(tiles >= 4, `${tiles} map tiles drawn under the route`);
  check(tileHits.length >= 4 && tileHits.every((u) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)), `${tileHits.length} tile requests, all to tile.openstreetmap.org`);
  const z = Number(tileHits[0]?.split('/')[3]);
  check(z === 14, `zoom ${z}: the closest zoom that fits a 3 x 2 km loop`);
  check(csp.length === 0, `tiles allowed by the security policy ${csp[0] || ''}`);
  const credit = page.getByRole('link', { name: '© OpenStreetMap contributors' });
  check(await credit.isVisible() && (await credit.getAttribute('href')) === 'https://www.openstreetmap.org/copyright', 'OpenStreetMap credit shown and linked');
  await page.locator('.route-map').screenshot({ path: path.join(OUT, 'route-map.png') });

  await tap(page.getByRole('button', { name: 'Hide map' }));
  check(await page.locator('.route-map image').count() === 0 && await page.getByRole('img', { name: 'Route shape' }).isVisible(), 'Hide map leaves only the route line');
  check(!(await credit.isVisible().catch(() => false)), 'no credit when the map is hidden');
  const before = tileHits.length;
  await page.reload(); await full(); await page.getByRole('img', { name: 'Route shape' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(800);
  check(tileHits.length === before, 'choice remembered after reload: no tiles fetched');
  await tap(page.getByRole('button', { name: 'Show map' }));
  await page.waitForTimeout(500);
  check(await page.locator('.route-map image.route-tile').count() >= 4, 'Show map brings the tiles back');

  await page.goto(`${APP}/activity/${noGps.id}`); await full(); await page.waitForTimeout(1000);
  check(await page.locator('.route-map').count() === 0, 'no map on a run without GPS');
  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
