// Update 5, U6: a workout is never lost.
// - it is saved from the moment it starts (before any set), and shows as "Workout in progress" on Activity and Training
// - closing the tab and opening the app again: Resume restores the exact set
// - Leave opens a sheet: Keep it running and leave / Finish and save / Discard
// - a small bar shows on other screens; Finish and save from the card logs the sets done
// - a workout left for more than 12 hours asks whether to save what was done
// - starting another workout while one has sets done asks first
// - the builder's unsaved exercise list survives a reload
// Usage: node e2e/u5-resume.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u5-resume'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  let page = await ctx.newPage();
  const errors = []; const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept()); }; watch(page);
  const email = 'u5-resume@test.ritmo';
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
  const live = () => page.locator('.workout-live');
  const setDone = async () => { await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click().catch(() => {}); await page.waitForTimeout(150); };

  // ---- The builder's list survives a reload
  await page.goto(`${APP}/strength`); await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Add Goblet squat', exact: true }).click();
  await page.getByRole('button', { name: 'Add Plank', exact: true }).click();
  await page.reload(); await page.waitForTimeout(2500);
  check(await page.locator('.build-row').count() === 2, 'the exercise list being built survives a reload');

  // ---- Started, no set done yet: already in progress everywhere
  await page.getByRole('button', { name: 'Start workout' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(800);
  await page.goto(`${APP}/record`); await page.waitForTimeout(2500);
  check(await live().count() === 1 && /workout in progress/i.test(await live().innerText()) && /0 of 6 sets done/.test(await live().innerText()), 'started with no set done: "Workout in progress" on Activity');
  check(await live().getByRole('button', { name: 'Resume' }).count() === 1 && await live().getByRole('button', { name: 'Finish and save' }).isDisabled(), 'with Resume; Finish and save waits for a set');
  await page.screenshot({ path: path.join(OUT, '01-activity.png'), fullPage: true });
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  check(await live().count() === 1, 'and on Training');
  await live().getByRole('button', { name: 'Resume' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(800);

  // ---- Two sets, then the tab is closed
  await setDone(); await setDone();
  await page.close();
  page = await ctx.newPage(); watch(page);
  await page.goto(`${APP}/record`); await page.waitForTimeout(3000);
  check(/2 of 6 sets done/.test(await live().innerText()), 'tab closed and reopened: the card says 2 of 6 sets done');
  await live().getByRole('button', { name: 'Resume' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(900);
  check(await page.locator('.set-row.done').count() === 2 && await page.locator('.set-row.now').count() === 1 && /Goblet squat/.test(await page.locator('.strength-now h2').innerText()), 'Resume restores the exact set (2 done, on set 3 of the squat)');

  // ---- Leave: a sheet with three choices
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  const sheet = page.getByRole('dialog');
  check((await sheet.getByRole('button').allInnerTexts()).filter((x) => /Keep it running and leave|Finish and save|Discard/.test(x)).length === 3, 'Leave offers: Keep it running and leave, Finish and save, Discard');
  await page.screenshot({ path: path.join(OUT, '02-leave.png') });
  await sheet.getByRole('button', { name: 'Keep it running and leave' }).click(); await page.waitForURL(/\/record$/); await page.waitForTimeout(600);
  check(await live().count() === 1, 'keeping it running goes back to Activity with the workout still there');

  // ---- The bar on other screens
  await page.goto(`${APP}/coach`); await page.waitForTimeout(2500);
  const bar = page.locator('.workout-bar');
  check(await bar.count() === 1 && /Resume/.test(await bar.innerText()), 'a small "Resume" bar shows on other screens');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at 390 px');

  // ---- Another workout while this one has sets done: asked first
  await page.goto(`${APP}/strength`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Add Side plank', exact: true }).click();
  await page.getByRole('button', { name: 'Start workout' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(800);
  check(/Another workout is open/.test(await page.locator('body').innerText()) && /2 sets done and not saved/.test(await main()), 'starting another workout asks what to do with the open one');
  await page.getByRole('button', { name: 'Resume it' }).click(); await page.waitForTimeout(900);
  check(await page.locator('.set-row.done').count() === 2, 'Resume it goes back to the open workout');

  // ---- Left for more than 12 hours: asked, not deleted
  await page.goto(`${APP}/record`); await page.waitForTimeout(2000);
  // 13 hours later (the clock is moved forward; nothing else touched the workout)
  await page.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 13 * 3600 * 1000; });
  await page.waitForTimeout(1500);
  await page.waitForTimeout(500);
  const stale = await live().innerText();
  check(/unfinished workout/i.test(stale) && /Save the 2 sets you did/.test(stale) && await live().getByRole('button', { name: 'Save what I did' }).count() === 1, 'after 12 hours it asks "Save the 2 sets you did …?"');
  await page.screenshot({ path: path.join(OUT, '03-stale.png'), fullPage: true });
  await live().getByRole('button', { name: 'Save what I did' }).click(); await page.waitForTimeout(3000);
  const e = (prof().log ?? []).filter((x) => x.kind === 'strength').at(-1);
  check(e && e.strength.exercises.length === 1 && e.strength.exercises[0].id === 'goblet-squat' && e.strength.exercises[0].sets.length === 2 && e.minutes >= 1 && e.minutes <= 10, `saving logs the 2 sets done with the time actually spent, not 13 hours (${e && e.minutes} min)`);
  check(await live().count() === 0, 'and the card is gone');

  // ---- Discard
  await page.goto(`${APP}/strength`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Add Goblet squat', exact: true }).click();
  await page.getByRole('button', { name: 'Start workout' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(800);
  await setDone();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click(); await page.waitForURL(/\/record$/); await page.waitForTimeout(600);
  check(await live().count() === 0 && (prof().log ?? []).filter((x) => x.kind === 'strength').length === 1, 'Discard removes it without logging anything');

  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
