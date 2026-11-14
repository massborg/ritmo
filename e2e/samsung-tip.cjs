// Samsung Internet's dark mode repaints websites (Ritmo's orange shows dark red) and ignores color-scheme, so
// Samsung Internet runners get a one-time tip on Training: how to turn it off, and where Ritmo's own dark theme is.
// Other browsers never see it. Usage: node e2e/samsung-tip.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

async function account(b, mock, email, ua) {
  const ctx = await b.newContext({ ...devices['Pixel 7'], userAgent: ua });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
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
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  // Answer the privacy notice if it is still showing (the tip waits for it)
  const accept = page.getByRole('button', { name: /Accept|Allow|Save/ }).first();
  if (await accept.isVisible().catch(() => false)) await accept.click();
  return { page, errors };
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const S = await account(b, mock, 'samsung-tip@test.ritmo', SAMSUNG);
  await S.page.goto(`${APP}/`); await S.page.waitForTimeout(1200);
  const tip = S.page.getByRole('region', { name: 'Colours look dark red?' });
  check(await tip.isVisible().catch(() => false), 'Samsung Internet: Training shows "Colours look dark red?"');
  const t = await tip.innerText().catch(() => '');
  check(/Settings/.test(t) && /Dark mode/.test(t) && /Off/.test(t), 'it says how to turn off Samsung Internet\'s dark mode');
  check(await tip.getByRole('link', { name: /Profile, under Appearance/ }).isVisible().catch(() => false), 'and links to Ritmo\'s own theme setting');
  await tip.getByRole('button', { name: 'Got it' }).click();
  check(await tip.count() === 0, '"Got it" closes it');
  await S.page.reload(); await S.page.waitForTimeout(1500);
  check(await S.page.getByRole('region', { name: 'Colours look dark red?' }).count() === 0, 'and it stays closed after a reload');
  check(S.errors.length === 0, `no page errors${S.errors.length ? `: ${S.errors[0]}` : ''}`);

  const C = await account(b, mock, 'chrome-tip@test.ritmo', CHROME);
  await C.page.goto(`${APP}/`); await C.page.waitForTimeout(1200);
  check(await C.page.getByRole('region', { name: 'Colours look dark red?' }).count() === 0, 'Chrome on the same phone: no tip');
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
