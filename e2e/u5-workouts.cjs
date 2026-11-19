// Update 5, U3: saved workouts you can find and schedule.
// - adding an exercise says so ("Added Goblet squat (1 in workout)")
// - a workout saved with no name is "Strength session 1", the next "Strength session 2"
// - Activity shows "Your workouts" with Start and More; the menu has Start now, Schedule on a date and Log as done
// - a scheduled workout shows on Training that day with Start, Move and Remove, and Done once logged
// Usage: node e2e/u5-workouts.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u5-workouts'); fs.mkdirSync(OUT, { recursive: true });
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
  const email = 'u5-workouts@test.ritmo';
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
  const main = () => page.locator('main').innerText();
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // ---- Build and save with no name
  await page.goto(`${APP}/strength`); await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Add Goblet squat', exact: true }).click();
  const toast = page.locator('.toast-action');
  check(/Added Goblet squat \(1 in workout\)/.test(await toast.innerText()) && await toast.getByRole('button', { name: 'View' }).count() === 1, 'adding an exercise says "Added Goblet squat (1 in workout)" with a way back up');
  await page.getByRole('button', { name: 'Add Plank', exact: true }).click();
  check(/Added Plank \(2 in workout\)/.test(await toast.innerText()), 'and counts up (2 in workout)');
  await page.getByRole('button', { name: 'Save as a workout' }).click();
  check(await page.locator('#sf-name').getAttribute('placeholder') === 'Strength session 1', 'the name field suggests "Strength session 1"');
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(400);
  check(/Saved as "Strength session 1"/.test(await main()), 'saved with no name: "Strength session 1"');
  await page.getByRole('button', { name: 'Add Side plank', exact: true }).click();
  await page.getByRole('button', { name: 'Save as a workout' }).click();
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(2800);
  check((prof().strength.templates ?? []).map((t) => t.name).join('|') === 'Strength session 1|Strength session 2', 'the next one is "Strength session 2"');

  // ---- Found on Activity
  await page.goto(`${APP}/record`); await page.waitForTimeout(2500);
  let text = await main();
  check(/your workouts/i.test(text) && /Strength session 1/.test(text) && /Strength session 2/.test(text) && /Never done/.test(text), 'Activity lists "Your workouts"');
  check(await page.getByRole('button', { name: 'Start Strength session 1' }).count() === 1, 'each has Start');
  check(await noOverflow(), 'no sideways scroll at 390 px (Activity)');
  await page.screenshot({ path: path.join(OUT, '01-activity.png'), fullPage: true });
  await page.getByRole('link', { name: /More for Strength session 1/ }).click(); await page.waitForURL(/strength\?menu=/); await page.waitForTimeout(800);
  const sheet = page.getByRole('dialog');
  check((await sheet.getByRole('button').allInnerTexts()).filter((x) => /Start now|Schedule on a date|Log as done|Edit exercises|Rename|Duplicate|Delete/.test(x)).length === 7, 'More opens the workout with Start now, Schedule, Log as done, Edit, Rename, Duplicate and Delete');
  await page.screenshot({ path: path.join(OUT, '02-menu.png') });

  // ---- Schedule on today
  await sheet.getByRole('button', { name: 'Schedule on a date' }).click();
  await sheet.getByRole('button', { name: 'Schedule', exact: true }).click(); await page.waitForTimeout(2800);
  check((prof().strength.scheduled ?? []).length === 1 && /shows on Training that day/.test(await main()), 'scheduled for today, and the page says where it will show');
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  const card = page.locator('.sched-card');
  check(await card.count() === 1 && /Strength session 1/.test(await card.innerText()) && await card.getByRole('button', { name: 'Start' }).count() === 1, 'Training shows it today with Start');
  check(await noOverflow(), 'no sideways scroll at 390 px (Training)');
  await page.screenshot({ path: path.join(OUT, '03-training.png'), fullPage: true });
  await card.getByRole('button', { name: 'Start' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(800);
  check(/Goblet squat/.test(await main()), 'Start opens the recorder with its exercises');
  page.once('dialog', (d) => d.accept());
  await page.goto(`${APP}/record`); await page.waitForTimeout(2000);
  check(/Scheduled today/.test(await main()), 'Activity says it is scheduled today');

  // ---- Log as done: Training shows Done
  await page.goto(`${APP}/strength?log=1&t=${prof().strength.templates[0].id}`); await page.waitForTimeout(2500);
  check(/"Strength session 1" loaded/.test(await main()) && await page.locator('.build-row').count() === 2, 'Log as done opens the log form with its exercises');
  await page.getByRole('button', { name: 'Save to my log' }).click(); await page.waitForTimeout(2800);
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  check(/Done/.test(await page.locator('.sched-card').innerText()) && await page.locator('.sched-card').getByRole('button', { name: 'Start' }).count() === 0, 'once logged, the scheduled workout shows Done');

  // ---- Remove a schedule
  await page.goto(`${APP}/strength?menu=${prof().strength.templates[1].id}`); await page.waitForTimeout(2500);
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule on a date' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click(); await page.waitForTimeout(600);
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  check(await page.locator('.sched-card').count() === 2, 'a second workout can be on the same day');
  await page.locator('.sched-card', { hasText: 'Strength session 2' }).getByRole('button', { name: 'Remove' }).click(); await page.waitForTimeout(2800);
  check(await page.locator('.sched-card').count() === 1 && prof().strength.scheduled.length === 1, 'Remove takes it off the day');

  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
