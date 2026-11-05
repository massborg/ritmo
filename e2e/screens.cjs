// Screenshots of key screens on a phone, for before-and-after comparisons.
// Usage: APP_URL=http://localhost:4173 OUT_DIR=e2e/out/after node e2e/screens.cjs
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const fs = require('fs');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:4173';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'screens');
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const mock = createMock();
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  await context.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(context, SUPA);
  const page = await context.newPage();
  const shot = async (name, full = false) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); console.log('saved', name); };

  await page.goto(`${APP}/signup`);
  await page.waitForSelector('#su-email');
  await shot('01-signup', true);
  await page.locator('#su-email').fill('screens@test.ritmo');
  await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor('screens@test.ritmo', 'signup')}`);
  await page.waitForURL(/\/(welcome|setup)/);
  await shot('02-first-screen', true);
  await page.getByRole('button', { name: /Look around with sample data/ }).click();
  await page.waitForURL(`${APP}/`);
  await shot('03-today');
  await shot('03-today-full', true);
  await page.goto(`${APP}/profile`);
  await shot('04-profile');
  await page.goto(`${APP}/coach`);
  await shot('05-coach');
  await browser.close();
})();
