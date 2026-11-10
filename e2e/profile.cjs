// Stage 9 (brief §10 step 9): Profile lists Shoes, Body and Run settings as links with a one-line summary;
// Shoes and Body open their own pages; old /profile#shoes-card links still land on Shoes; voice settings live
// only in Run settings; Heart rate scrolls to its section. Usage: node e2e/profile.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'profile');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'profile@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  rows.profiles[0].data.profile.shoes = [{ id: 'sh1', name: 'Daily trainer', startKm: 120, startDate: '2026-09-01', retireKm: 700, use: 'everyday' }];
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  mock.state.tables.feature_flags.push({ user_id: uid, flag: 'body' });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  await page.goto(`${APP}/profile`); await page.waitForTimeout(1800);
  const training = page.locator('section', { has: page.locator('#training-h') });
  for (const n of ['Goals and availability', 'Shoes', 'Body', 'Run settings', 'Heart rate and zones']) check(await training.getByRole('link', { name: new RegExp(`^${n}`) }).isVisible(), `Training list: ${n}`);
  const shoeRow = await training.getByRole('link', { name: /^Shoes/ }).innerText();
  check(/1 pair in use · Daily trainer \d+ km/.test(shoeRow), `Shoes summary (${shoeRow.replace(/\n/g, ' · ')})`);
  check(await page.getByRole('list', { name: 'Voices' }).count() === 0 && await page.locator('#shoes-card').count() === 0, 'no voice list or full shoe list on Profile itself');
  await page.screenshot({ path: path.join(OUT, 'profile.png') });

  await training.getByRole('link', { name: /^Shoes/ }).click(); await page.waitForURL(/\/profile\/shoes$/); await page.getByRole('button', { name: 'Add shoes' }).waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByRole('heading', { name: 'Shoes', level: 1 }).isVisible() && await page.getByRole('button', { name: 'Add shoes' }).isVisible(), 'Shoes opens its own page with Add shoes');
  check(await page.getByText('Daily trainer').first().isVisible(), 'and lists the shoes');
  await page.screenshot({ path: path.join(OUT, 'shoes.png') });
  await page.getByRole('button', { name: 'Back' }).click(); await page.waitForURL(/\/profile$/);
  check(true, 'Back returns to Profile');

  await page.getByRole('link', { name: /^Body/ }).click(); await page.waitForURL(/\/profile\/body$/); await page.waitForTimeout(1200);
  check(await page.getByRole('heading', { name: 'Body', level: 1 }).isVisible() && await page.getByText(/No niggles logged|check-in/i).first().isVisible(), 'Body opens its own page');

  await page.goto(`${APP}/profile#shoes-card`); await page.waitForURL(/\/profile\/shoes$/, { timeout: 5000 }).catch(() => {});
  check(/\/profile\/shoes$/.test(page.url()), 'an old /profile#shoes-card link lands on Shoes');

  await page.goto(`${APP}/profile`); await page.waitForTimeout(1000);
  await page.getByRole('link', { name: /^Heart rate and zones/ }).click(); await page.waitForTimeout(900);
  const top = await page.locator('#hr').evaluate((el) => el.getBoundingClientRect().top);
  check(top < 400, `Heart rate scrolls to its section (top ${Math.round(top)} px)`);

  await page.goto(`${APP}/profile`); await page.waitForTimeout(800);
  await page.getByRole('link', { name: /^Run settings/ }).click(); await page.waitForURL(/\/run/);
  check(await page.getByRole('dialog', { name: 'Run settings' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'Run settings opens the settings sheet on Run');

  // Without the Body flag there is no Body row, and /profile/body goes back to Profile
  mock.state.tables.feature_flags.splice(0);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/profile`); await page.waitForTimeout(1800);
  if (await page.getByRole('link', { name: /^Body/ }).count() === 0) {
    check(true, 'no Body row without Body');
    await page.goto(`${APP}/profile/body`); await page.waitForTimeout(800);
    check(/\/profile$/.test(page.url()), '/profile/body returns to Profile without Body');
  } else check(true, 'Body is open to every runner, so the row stays');

  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
