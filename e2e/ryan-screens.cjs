// Screens for the Ryan-like account (see fixtures/ryan.cjs). Usage: APP_URL=... OUT_DIR=... node e2e/ryan-screens.cjs
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'ryan');
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const shot = async (n, full = false) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: full }); console.log('saved', n); };
  const email = 'ryan@test.ritmo';
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
  await page.goto(`${APP}/calendar`);
  await page.waitForTimeout(1500);
  const build = page.getByRole('button', { name: /Build my plan|Rebuild/ }).first();
  if (await build.count()) { await build.click(); await page.waitForTimeout(800); }
  if (await page.getByText('That week does not fit').count()) {
    await shot('doesnt-fit');
    await page.getByRole('button', { name: /\(recommended\)/ }).click();
    await page.waitForTimeout(1000);
  }
  await page.goto(`${APP}/calendar`); await page.waitForTimeout(1200);
  await shot('calendar-week', true);
  const month = page.getByRole('tab', { name: /Month/ }).or(page.getByRole('button', { name: 'Month', exact: true }));
  if (await month.count()) { await month.first().click(); await shot('calendar-month', true); }
  await page.goto(`${APP}/`); await shot('today', true);
  await page.goto(`${APP}/progress`); await shot('progress', true);
  await page.goto(`${APP}/goals`); await shot('goals', true);
  await page.goto(`${APP}/coach`);
  await page.locator('#ask').fill('Am I on track?'); await page.getByRole('button', { name: 'Send' }).click(); await page.waitForTimeout(800);
  await page.locator('#ask').fill('Why is my Thursday run so long?'); await page.getByRole('button', { name: 'Send' }).click(); await page.waitForTimeout(800);
  await shot('coach', true);
  if (process.env.DUMP) fs.writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify(mock.state.tables.plans.map((p) => p.data), null, 1));
  await b.close();
})();
