// A new deploy while the app is open: the old page file is gone. Opening that page reloads once and works,
// and if the file stays missing, a "Ritmo was updated" message with a reload button shows (never a blank page).
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const email = 'chunk@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const rows = ryanRows(mock.state.users.get(email).id, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  // Open the app on Today with page prefetching blocked, so Goals is not loaded yet
  let gone = true;
  await page.route(/\/assets\/Goals-[^/]+\.js/, (r) => (gone ? r.fulfill({ status: 404, body: 'Not found' }) : r.continue()));
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  let loads = 0; page.on('load', () => loads++);
  // 1) The file is missing once (a deploy happened), then the reload gets the new version
  page.once('load', () => { gone = false; });
  await page.evaluate(() => { history.pushState({}, '', '/goals'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(2500);
  check(loads >= 1, 'a missing page file reloads the app once');
  check(await page.getByRole('heading', { name: /Goals/ }).first().isVisible().catch(() => false), 'after the reload the page opens normally');
  // 2) The file stays missing: a message with a reload button, not a blank screen, and no reload loop
  gone = true;
  await page.unroute(/\/assets\/Goals-[^/]+\.js/);
  await page.route(/\/assets\/Goals-[^/]+\.js/, (r) => r.fulfill({ status: 404, body: 'Not found' }));
  await page.evaluate(() => sessionStorage.setItem('ritmo:chunk-reload', '1'));
  await page.goto(`${APP}/`); await page.waitForTimeout(1000);
  loads = 0;
  await page.evaluate(() => { history.pushState({}, '', '/goals'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(2500);
  check(await page.getByText('Ritmo was updated').isVisible().catch(() => false), 'if it still fails, "Ritmo was updated" shows with a reload button');
  check(loads === 0, 'no reload loop');
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
