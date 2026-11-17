// Update 4, task 1: time and pace fields work on a numbers-only keypad. Digits fill in from the right (2 0 0 5
// becomes 20:05), backspace takes one off, pasted "1.13.37" is understood, seconds of 60+ are flagged, and a race
// time reads back as "5K in 20:05 · 4:01/km". Checked in onboarding ("Your time"), Log a run, and Edit session.
// Usage: node e2e/u4-time-input.cjs (app on :4173). Made-up runners only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u4-time-input'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const cont = (page) => page.getByRole('button', { name: 'Continue', exact: true }).click();

async function signUp(b, mock, email) {
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  return { ctx, page, errors };
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();

  // ---- Onboarding: "Your time" for a recent 5K ----
  const A = await signUp(b, mock, 'u4-time@test.ritmo');
  let page = A.page;
  await page.locator('#c-health').check(); await cont(page);
  await page.locator('#s-name').fill('Sam');
  await page.getByLabel('Day', { exact: true }).selectOption('15'); await page.getByLabel('Month', { exact: true }).selectOption('4'); await page.getByLabel('Year', { exact: true }).selectOption('1990');
  await cont(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'No', exact: true }).nth(i).click();
  await cont(page);
  await page.getByRole('radio', { name: /I run regularly/ }).click();
  await page.locator('#s-weekly').fill('30');
  await page.getByRole('button', { name: '5K', exact: true }).click();
  const t = page.locator('#s-racetime');
  await t.waitFor();
  check(await t.getAttribute('inputmode') === 'numeric' && await t.getAttribute('pattern') === null, 'the time field asks for the numbers-only keypad');
  await t.click();
  const seen = [];
  for (const d of '2005') { await page.keyboard.type(d); seen.push(await t.inputValue()); }
  check(seen.join(' ') === '0:02 0:20 2:00 20:05', `digits fill in from the right: ${seen.join(' → ')}`);
  check(/5K in 20:05 · 4:01\s*\/km/.test(await page.locator('.time-readback').innerText()), 'a live readback says "5K in 20:05 · 4:01/km"');
  check(/20 minutes 5 seconds/.test(await t.getAttribute('aria-label')), 'a screen reader hears "20 minutes 5 seconds"');
  await page.locator('.field', { has: t }).screenshot({ path: path.join(OUT, 'onboarding-time.png') });
  await page.keyboard.type('15');
  check(await t.inputValue() === '20:05:15', 'two more digits make 20:05:15');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  check(await t.inputValue() === '20:05', 'backspace takes one digit off at a time');
  await page.keyboard.type(':');
  check(await t.inputValue() === '20:05', 'a typed ":" is not needed and changes nothing');
  // 60 or more seconds
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('99');
  check(/Seconds must be under 60/.test(await page.locator('#s-racetime-h').innerText()) && await t.getAttribute('aria-invalid') === 'true', '"99" is flagged: seconds must be under 60');
  // Pasted values with separators
  await t.fill('1.13.37');
  check(await t.inputValue() === '1:13:37', 'a pasted "1.13.37" becomes 1:13:37');
  await t.fill('');
  check(await t.inputValue() === '', 'clearing the field empties it');
  await t.fill('2:10:00');
  check(/very slow pace/.test(await page.locator('.time-readback').innerText()), 'a 5K in 2:10:00 gets a gentle warning, not a block');
  await t.fill(' 20:05 ');
  check(await t.inputValue() === '20:05', 'a pasted " 20:05 " becomes 20:05');
  await t.fill('11:00');
  check(/faster than the world record/.test(await page.locator('.time-readback').innerText()), 'an 11:00 5K is flagged as too fast');
  await t.fill('2005');
  await cont(page);
  check(await page.getByText('What would you like to achieve?').waitFor({ timeout: 8000 }).then(() => true, () => false), 'Continue accepts the time and moves on (sign-up is no longer blocked)');
  await page.waitForTimeout(1500);
  check(/"timeS":\s*1205/.test(JSON.stringify(mock.state.tables)), `the 5K time is saved as 20:05 (1205 s)`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scrolling at phone width');
  check(A.errors.length === 0, `no page errors${A.errors.length ? `: ${A.errors[0]}` : ''}`);

  // ---- Log a run and Edit session, as a runner with a plan ----
  const B = await signUp(b, mock, 'u4-time2@test.ritmo');
  page = B.page;
  const uid = mock.state.users.get('u4-time2@test.ritmo').id;
  const rows = ryanRows(uid, new Date());
  for (const k of Object.keys(rows)) mock.state.tables[k].push(...rows[k]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.getByRole('button', { name: /Add a run, cross-training/ }).first().click();
  await page.getByRole('button', { name: /Log a run|A run/ }).first().click();
  const lr = page.locator('#lr-time');
  await lr.waitFor({ timeout: 8000 });
  await page.waitForTimeout(1200); // the sheet settles after opening
  check(await lr.inputValue() === '30:00', 'Log a run starts at 30:00');
  await lr.fill('');
  await lr.click(); await page.keyboard.type('4500');
  check(await lr.inputValue() === '45:00', 'Log a run: 4 5 0 0 becomes 45:00');
  await page.keyboard.press('Escape');

  // Open a coming run session and edit it
  const today = new Date().toISOString().slice(0, 10);
  const planRow = mock.state.tables.plans.find((r) => r.user_id === uid);
  const run = (planRow?.data?.sessions ?? []).find((x) => x.date > today && x.paceTarget && !x.strengthPlan);
  await page.goto(`${APP}/session/${run?.id}`); await page.waitForTimeout(2500);
  const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    const pm = page.locator('#ed-pace-min');
    await pm.waitFor({ timeout: 6000 });
    await pm.fill('');
    await pm.click(); await page.keyboard.type('450');
    check(await pm.inputValue() === '4:50' && /Fastest pace: 4 minutes 50 seconds/.test(await pm.getAttribute('aria-label')), 'Edit session: pace 4 5 0 becomes 4:50');
    check(await pm.getAttribute('inputmode') === 'numeric', 'pace fields use the number keypad too');
    await page.getByRole('dialog').first().screenshot({ path: path.join(OUT, 'edit-session-pace.png') }).catch(() => {});
  } else check(false, 'a coming run session can be edited');
  check(B.errors.length === 0, `no page errors${B.errors.length ? `: ${B.errors[0]}` : ''}`);

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
