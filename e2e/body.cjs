// Review #2 acceptance 18 and 19 in the browser: a "pain at night" check-in shows "stop and get checked", gives
// no exercise tips and pauses running; typing it in Body chat does the same; a 5/10 calf check-in replaces
// runs with cross-training. Body is only there for flagged accounts. Usage: node e2e/body.cjs
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const tap = (page, name) => page.getByRole('radio', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first().click();

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'body@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  rows.profiles[0].data.profile.daysAvailable = [0, 1, 3, 4, 5, 6];
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/calendar`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Build my plan|Rebuild/ }).first().click(); await page.waitForTimeout(1500);
  await page.goto(`${APP}/`); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Add a run/ }).click();
  check(await page.getByText('Something hurts').count() === 1, 'every runner has "Something hurts" (no flag needed)');
  await page.keyboard.press('Escape');

  mock.state.tables.feature_flags.push({ user_id: uid, flag: 'body' });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);

  // 19: calf 5/10, worse after running → cross-training
  await page.getByRole('button', { name: /^Add a run/ }).click();
  await page.getByText('Something hurts').click();
  await tap(page, 'Calf'); await tap(page, 'Left');
  await page.locator('#pain').fill('5');
  await page.getByRole('button', { name: 'After the run' }).click();
  await tap(page, 'Gradually');
  await page.getByRole('button', { name: 'See what to do' }).click();
  await page.getByText('What Ritmo changes in your plan').waitFor();
  check(await page.getByText(/Left calf pain 5\/10: running is replaced with cross-training/).first().isVisible(), 'a 5/10 calf check-in replaces runs with cross-training, with the reason');
  check(await page.getByText(/no hills, spikes or fast strides/).first().isVisible(), 'and removes hills and strides');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.goto(`${APP}/calendar`); await page.waitForTimeout(600);
  check(await page.getByText('Cross-training instead of running').first().isVisible(), 'the calendar shows cross-training days');

  // 18: pain at night → red flag
  await page.goto(`${APP}/`); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Add a run/ }).click();
  await page.getByText('Something hurts').click();
  await tap(page, 'Shin'); await tap(page, 'Right');
  await page.getByRole('button', { name: 'At rest or at night' }).click();
  await tap(page, 'Gradually');
  await page.getByRole('button', { name: 'See what to do' }).click();
  await page.getByText('Please stop running and see a doctor or physio').waitFor();
  check(true, '"pain at night" shows stop and get checked');
  check(await page.getByText(/Exercises many runners use/).count() === 0, 'and gives no exercise tips');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);
  check(await page.getByText('Training paused: get checked first').isVisible(), 'running is paused on the Training page');
  check(await page.getByRole('button', { name: 'I have been checked by a professional' }).isVisible(), 'until the runner confirms they were checked');

  // Body chat: the same rule before any AI
  await page.goto(`${APP}/coach?mode=body`); await page.waitForTimeout(600);
  await page.locator('#ask').fill('My knee wakes me at night');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: /No, built-in answers only/ }).click().catch(() => {});
  await page.getByText(/Please stop running and get checked by a doctor or physio/).first().waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByText(/Please stop running and get checked by a doctor or physio/).first().isVisible(), 'typing "wakes me at night" in Body chat gets the same answer');
  check(!mock.state.calls.some((c) => c.includes('/functions/v1/coach')), 'and the message never went to the AI');
  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
