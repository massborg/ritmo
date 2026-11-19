// Update 5, U1: other sports are visible, recordable and importable.
// - logging a bike shows "Bike saved · 45 min" with Undo; it appears on the day, in History and can be edited/deleted
// - Other sport → Record now: a timer that survives a reload, effort asked at the end
// - a cycling GPX file is imported as cross-training instead of being skipped
// - Activity → History opens /history, with filters
// Usage: node e2e/u5-cross.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u5-cross'); fs.mkdirSync(OUT, { recursive: true });
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
  const email = 'u5-cross@test.ritmo';
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
  const log = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.log ?? [];
  const main = () => page.locator('main').innerText();
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // ---- Activity: the Other sport card and History
  await page.goto(`${APP}/record`); await page.waitForTimeout(2500);
  check(/Other sport/.test(await main()), 'Activity offers "Other sport"');
  check(await page.getByRole('link', { name: 'History' }).getAttribute('href') === '/history', 'History on Activity opens /history');
  await page.getByRole('link', { name: /Other sport/ }).click(); await page.waitForURL(/\/other$/);
  check((await page.locator('[aria-label="Sport"] .chip').allInnerTexts()).join('|') === 'Bike|Indoor bike|Swim|Elliptical|Row|Walk / hike|Class|Other', 'the eight sports');
  check(await noOverflow(), 'no sideways scroll at 390 px (Other sport)');
  await page.screenshot({ path: path.join(OUT, '01-other-sport.png'), fullPage: true });

  // ---- Log one I did: a message with Undo, then visible everywhere
  await page.getByRole('tab', { name: 'Log one I did' }).click();
  await page.getByRole('button', { name: 'Save bike' }).click(); await page.waitForURL(/\/history$/); await page.locator('.feed-row').first().waitFor();
  const toast = page.locator('.toast-action');
  check(/Bike saved · 45 min/.test(await toast.innerText()) && await toast.getByRole('button', { name: 'Undo' }).count() === 1, 'saving says "Bike saved · 45 min" with Undo');
  let text = await main();
  check(/Bike/.test(text) && /45 min · effort 4/.test(text) && /Today/.test(text), 'the bike is in History');
  check((await page.locator('[aria-label="Show"] .chip').allInnerTexts()).join('|') === 'All|Runs|Strength|HYROX|Cross-training', 'History has a filter per type');
  await page.screenshot({ path: path.join(OUT, '02-history.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cross-training', exact: true }).click(); await page.waitForTimeout(200);
  check(await page.locator('.feed-row').count() === 1, 'the Cross-training filter shows only it');
  await page.getByRole('button', { name: 'Runs', exact: true }).click(); await page.waitForTimeout(200);
  check(await page.locator('.feed-row').count() > 3 && !(await page.locator('.feed-tag').allInnerTexts()).some((x) => x !== 'Run'), 'the Runs filter shows only runs');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.waitForTimeout(2800);
  check(log().filter((e) => e.kind === 'cross').length === 1, 'saved to the account');
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  text = await main();
  check(/Also today/i.test(text) && /Bike/.test(text) && /not running km/.test(text), 'the bike shows on today in Training');
  check(await noOverflow(), 'no sideways scroll at 390 px (Training)');
  await page.screenshot({ path: path.join(OUT, '03-training-day.png'), fullPage: true });

  // ---- Edit and delete
  await page.locator('#log-here + ul .feed-row').first().click(); await page.waitForURL(/\/log\//); await page.waitForTimeout(400);
  await page.locator('#le-min').fill('50'); await page.locator('#le-min').blur();
  await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(2800);
  check(log().find((e) => e.kind === 'cross').minutes === 50, 'minutes can be changed (50)');
  await page.screenshot({ path: path.join(OUT, '04-entry.png'), fullPage: true });

  // ---- Undo
  await page.goto(`${APP}/other?log=1`); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Swim', exact: true }).click();
  await page.getByRole('button', { name: 'Save swim' }).click(); await page.waitForURL(/\/history$/); await page.locator('.feed-row').first().waitFor();
  check(/Swim/.test(await main()), 'a swim is logged');
  await page.locator('.toast-action').getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(300);
  check(!/Swim/.test(await main()), 'Undo takes it away again');

  // ---- Record now: timer, reload, finish with effort
  await page.goto(`${APP}/other`); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Elliptical', exact: true }).click();
  await page.getByRole('button', { name: 'Start elliptical' }).click(); await page.waitForTimeout(2300);
  const clock = async () => (await page.getByTestId('other-clock').innerText()).trim();
  const c1 = await clock();
  check(/^0:0[2-4]$/.test(c1), `the timer runs (${c1})`);
  await page.reload(); await page.waitForTimeout(2500);
  const c2 = await clock();
  check(/^0:0[4-9]$/.test(c2) && await page.getByRole('button', { name: 'Finish' }).count() === 1, `a reload keeps the recording going (${c2})`);
  await page.getByRole('button', { name: 'Pause' }).click(); const p1 = await clock(); await page.waitForTimeout(1600);
  check(await clock() === p1, 'Pause stops the clock');
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.screenshot({ path: path.join(OUT, '05-finish.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save elliptical' }).click(); await page.waitForURL(/\/log\//); await page.waitForTimeout(2800);
  const rec = log().find((e) => e.sport === 'Elliptical');
  check(rec && rec.recorded && rec.rpe === 6 && rec.durationS >= 4 && rec.durationS <= 12 && rec.minutes === 1, `saved as recorded cross-training with its time and effort (${rec && rec.durationS} s)`);
  check(/Recorded in Ritmo/.test(await main()), 'its page says it was recorded in Ritmo');
  await page.getByRole('button', { name: 'Delete' }).click(); await page.waitForTimeout(2800);
  check(!log().some((e) => e.sport === 'Elliptical'), 'and it can be deleted');

  // ---- A cycling file is imported as cross-training
  const pts = Array.from({ length: 40 }, (_, i) => `<trkpt lat="${(35.9 + i * 0.001).toFixed(5)}" lon="14.5"><time>${new Date(Date.UTC(2026, 10, 10, 8, 0, i * 60)).toISOString()}</time></trkpt>`).join('');
  const gpx = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Morning Ride</name><type>cycling</type><trkseg>${pts}</trkseg></trk></gpx>`;
  await page.goto(`${APP}/profile/data`); await page.waitForTimeout(2000);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'ride.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
  await page.waitForTimeout(3500);
  text = await main();
  check(/cross-training/.test(text) && !/No runs were found/.test(text), 'the import report says the ride was saved as cross-training');
  const ride = log().find((e) => e.importId);
  check(ride && ride.sport === 'Bike' && ride.minutes === 39 && ride.date === '2026-11-10' && ride.distanceM > 4000 && ride.text === 'Morning Ride', `the ride is in the log: Bike, 39 min, 10 Nov (${ride && ride.distanceM} m)`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'ride.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
  await page.waitForTimeout(3500);
  check(log().filter((e) => e.importId).length === 1, 'the same file again does not add it twice');

  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
