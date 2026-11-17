// Decisions from QA sweep 2, in the browser:
// - Start workout uses the reps and weight set in the builder (the builder starts from the progression target)
// - a goal typed on the HYROX page is for that session only: the race goal in the profile is not overwritten, and
//   the half simulation has no goal field
// - a race result with missing splits is saved as partial: no goal comparison, not a best race; with every split
//   and the finish time it is a full result
// - a station practice does not complete a planned simulation
// Usage: node e2e/qa-decisions.cjs (app on :4173). Made-up runner only.
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
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const email = 'qa-decisions@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  const prof = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  Object.assign(prof(), { athleteType: 'hyrox', hyrox: { division: 'men_open', goalS: 5400 }, strength: { ...(prof().strength ?? {}), equipment: 'gym', progress: { 'goblet-squat': { reps: 8, load: 8, next: 'up', at: new Date().toISOString(), target: { reps: 9, load: 8, note: '+1 rep: 9 reps at 8 kg for all sets' } } } } });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  // ---- 1. The builder's values are what the recorder starts with
  await page.goto(`${APP}/strength`); await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Add Goblet squat', exact: true }).click();
  const reps = page.getByLabel('Reps of Goblet squat'), kg = page.getByLabel('Weight for Goblet squat in kg');
  check(await reps.inputValue() === '9' && await kg.inputValue() === '8', `the builder starts from the progression target (9 reps, 8 kg): ${await reps.inputValue()} / ${await kg.inputValue()}`);
  await reps.fill('5'); await kg.fill('30');
  await page.getByRole('button', { name: 'Start workout' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(1200);
  const row = await page.locator('.set-row').first().innerText();
  const vals = await page.locator('.set-row').first().locator('input').evaluateAll((l) => l.map((x) => x.value).join(' '));
  check(/\b30\b/.test(vals) && /\b5\b/.test(vals), `Start workout uses 5 reps at 30 kg (${vals} | ${row.replace(/\n/g, ' ')})`);

  // ---- 2. The goal on the HYROX page is for that session only
  await page.goto(`${APP}/hyrox`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Half simulation: front/ }).click();
  check(await page.locator('#hx-goal').count() === 0, 'a half simulation has no goal field');
  await page.getByRole('button', { name: /Full simulation/ }).click();
  await page.locator('#hx-goal').click(); await page.locator('#hx-goal').press('Control+a'); await page.locator('#hx-goal').press('Backspace');
  await page.locator('#hx-goal').pressSequentially('12000');
  await page.getByRole('button', { name: 'Start simulation' }).click(); await page.waitForURL(/hyrox\/live/); await page.waitForTimeout(3500);
  check(prof().hyrox.goalS === 5400, `the race goal in the profile is still 1:30:00 (${prof().hyrox.goalS})`);

  // ---- 3. A partial race result
  await page.goto(`${APP}/hyrox?tab=race`); await page.waitForTimeout(2500);
  await page.locator('#hx-run-1').pressSequentially('500'); await page.locator('#hx-st-1').pressSequentially('430'); await page.locator('#hx-rox').pressSequentially('630');
  check(/saved as a partial result/.test(await page.locator('main').innerText()), 'the form says it will be a partial result');
  await page.getByRole('button', { name: 'Save race result' }).click(); await page.waitForURL(/hyrox\/session\//); await page.waitForTimeout(1500);
  let text = await page.locator('main').innerText();
  check(/Partial result/.test(text) && !/Goal 1:/.test(text), 'the saved result is marked partial and not compared with the goal');
  await page.goto(`${APP}/hyrox`); await page.waitForTimeout(2500);
  check(!/Best race/.test(await page.locator('main').innerText()), 'a partial result is not the best race');
  // every split and the finish time: a full result
  await page.goto(`${APP}/hyrox?tab=race`); await page.waitForTimeout(2500);
  for (let i = 1; i <= 8; i++) { await page.locator(`#hx-run-${i}`).pressSequentially('500'); await page.locator(`#hx-st-${i}`).pressSequentially('400'); }
  await page.locator('#hx-finish').pressSequentially('11830');
  check(!/saved as a partial result/.test(await page.locator('main').innerText()), 'with every split and the finish time it is a full result');
  await page.getByRole('button', { name: 'Save race result' }).click(); await page.waitForURL(/hyrox\/session\//); await page.waitForTimeout(1500);
  text = await page.locator('main').innerText();
  check((await page.getByTestId('hx-sum-total').innerText()) === '1:18:30' && /Roxzone\s*6:30/.test(text) && !/Partial result/.test(text), `finish 1:18:30 with the remaining 6:30 as Roxzone`);

  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
