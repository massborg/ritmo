// Update 5, U7: rests and timers.
// - a workout has rest between sets and between exercises, and an exercise can have its own; saved with the workout
// - the rest timer starts by itself after a set (the exercise's rest, then the longer one before the next exercise),
//   with -15 s, +15 s and Skip, and keeps counting through a reload
// - a timed exercise has a work countdown that ticks the set by itself
// - the summary shows the rest taken
// Usage: node e2e/u5-timers.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u5-timers'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());
  const email = 'u5-timers@test.ritmo';
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
  const prof = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  const secs = async (id) => { const t = (await page.getByTestId(id).innerText()).trim().split(':'); return Number(t[0]) * 60 + Number(t[1]); };

  // ---- Build: workout rests, and one exercise with its own
  await page.goto(`${APP}/strength`); await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Add Goblet squat', exact: true }).click();
  await page.getByRole('button', { name: 'Add Plank', exact: true }).click();
  await page.getByLabel('Sets of Goblet squat').fill('2'); await page.getByLabel('Sets of Plank').fill('1'); await page.getByLabel('Seconds of Plank').fill('4');
  await page.getByRole('button', { name: 'Rest between sets 45 seconds' }).click();
  await page.getByRole('button', { name: 'Rest between exercises 2 minutes' }).click();
  await page.getByLabel('Own rest for Goblet squat, seconds').fill('30');
  check(/Changed for this exercise/.test(await page.locator('.build-row').first().innerText()), 'an exercise with its own rest is tagged');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at 390 px (builder)');
  await page.screenshot({ path: path.join(OUT, '01-builder.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save as a workout' }).click();
  await page.locator('#sf-name').fill('Timed');
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(2800);
  const t = prof().strength.templates[0];
  check(t.restBetweenSetsS === 45 && t.restBetweenExercisesS === 120 && t.exercises[0].restS === 30 && t.exercises[1].seconds === 4, 'the rests and the work time are saved with the workout');

  // ---- After a reload: the same timers
  await page.reload(); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Start Timed' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Set done' }).click(); await page.waitForTimeout(400);
  let r = await secs('rest-left');
  check(r >= 28 && r <= 30, `after a set the rest starts by itself with the exercise's own 30 s (${r})`);
  await page.getByRole('button', { name: '15 seconds more rest' }).click(); await page.waitForTimeout(300);
  const more = await secs('rest-left');
  await page.getByRole('button', { name: '15 seconds less rest' }).click(); await page.waitForTimeout(300);
  check(more >= 42 && more <= 45 && await secs('rest-left') <= 30, '+15 s and -15 s change it');
  await page.screenshot({ path: path.join(OUT, '02-rest.png'), fullPage: true });
  await page.reload(); await page.waitForTimeout(2500);
  r = await secs('rest-left');
  check(r >= 20 && r <= 28, `a reload does not stop or restart the rest (${r})`);
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Set done' }).click(); await page.waitForTimeout(400);
  r = await secs('rest-left');
  check(r >= 117 && r <= 120 && /Plank/.test(await page.locator('.rest-timer').innerText()), `after the last set: the 2 minutes before the next exercise, which is named (${r})`);
  await page.getByRole('button', { name: 'Skip' }).click();

  // ---- A timed exercise: countdown, then the set ticks itself and the workout is done
  await page.getByRole('button', { name: /Start 0:04 timer/ }).click(); await page.waitForTimeout(600);
  check(await page.getByTestId('work-left').count() === 1 && await page.getByRole('button', { name: 'Done early' }).count() === 1, 'a timed exercise has a work countdown with "Done early"');
  await page.screenshot({ path: path.join(OUT, '03-work.png'), fullPage: true });
  await page.waitForTimeout(5200);
  const text = await page.locator('main').innerText();
  check(/Workout done/.test(text), 'when the time is up the set is ticked by itself (here the last one: the workout is done)');
  check(/Rest taken/.test(text), 'the summary shows the rest taken');
  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
