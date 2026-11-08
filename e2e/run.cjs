// Review #2 acceptance 9: Run tab. Start a free run, simulate a GPS track, pause and resume, finish: the run is
// saved with the right distance (within 2%), opens its feedback, and the Run tab only shows for flagged accounts.
// Usage: node e2e/run.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const LAT0 = 35.9, LON0 = 14.5, M_PER_DEG = 111195;

async function account(mock, ctx, email, flagged) {
  const page = await ctx.newPage();
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  if (flagged) mock.state.tables.feature_flags.push({ user_id: uid, flag: 'run_tab' });
  await page.evaluate(() => { indexedDB.deleteDatabase('keyval-store'); localStorage.setItem('ritmo:run:settings', JSON.stringify({ countdown: 3, cues: 'off', autoPause: false, screenOn: false })); });
  return { page, uid };
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 5 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);

  // An account without the flag: the Run tab, Quick run and recording are open to everyone
  const other = await account(mock, ctx, 'norun@test.ritmo', false);
  await other.page.goto(`${APP}/`); await other.page.waitForTimeout(1000);
  check(await other.page.locator('.tabbar a[href="/run"]').count() === 1, 'every runner has the Run tab (no flag needed)');
  const fitO = other.page.getByRole('button', { name: /Train 6 days a week/ });
  if (await fitO.isVisible().catch(() => false)) { await fitO.click(); await other.page.waitForTimeout(800); }
  check(await other.page.locator('a.quick-run').isVisible(), 'Quick run is shown to every runner, not only flagged accounts');
  await other.page.goto(`${APP}/run`); await other.page.waitForTimeout(500);
  check(await other.page.getByText(/GPS ready|Searching for GPS|waiting for a better signal/).first().isVisible() && await other.page.getByText('Not available yet').count() === 0, 'and every runner can record (the Run page works without the flag)');
  await other.page.close();
  await ctx.clearCookies();

  const ctx2 = await b.newContext({ ...devices['Pixel 7'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 5 }, permissions: ['geolocation'] });
  await ctx2.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx2, SUPA);
  const tiles = [];
  await ctx2.route('https://tile.openstreetmap.org/**', (r) => { tiles.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+/btfwAJfwPpa1fKXQAAAABJRU5ErkJggg==', 'base64') }); });
  const { page, uid } = await account(mock, ctx2, 'runner@test.ritmo', true);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  check(await page.locator('.tabbar a[href="/run"]').isVisible(), 'flagged account: Run is in the tab bar');
  await page.locator('.tabbar a[href="/run"]').click();
  await page.getByText(/GPS ready ±\d+ m/).waitFor({ timeout: 10000 });
  check(true, 'GPS accuracy shown before the start');
  await page.getByRole('radio', { name: 'Free run' }).or(page.getByRole('button', { name: 'Free run' })).first().click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.locator('.run-live').waitFor({ timeout: 8000 });
  check(true, 'countdown then live screen');

  // Move north at 5 m/s: 30 s running, 10 s paused (still moving, must not count), 30 s running
  let d = 0, counted = 0;
  const step = async (metres, count) => { d += metres; if (count) counted += metres; await ctx2.setGeolocation({ latitude: LAT0 + d / M_PER_DEG, longitude: LON0, accuracy: 5 }); await page.waitForTimeout(500); };
  for (let i = 0; i < 60; i++) await step(2.5, true);
  // Live map: tiles under the route, centred, at street zoom, with the credit and a Hide map switch
  const live = page.getByRole('img', { name: 'Your route so far, on a map' });
  check(await live.isVisible() && await page.locator('.run-route image.route-tile').count() >= 4, `live map: ${await page.locator('.run-route image.route-tile').count()} OpenStreetMap tiles under the route`);
  const zs = [...new Set(tiles.map((u) => Number(u.split('/')[3])))];
  check(zs.length > 0 && zs.every((z) => z <= 16), `zoomed no closer than street level (zoom ${zs.join(', ')})`);
  check(await page.getByRole('link', { name: '© OpenStreetMap contributors' }).isVisible(), 'OpenStreetMap credit on the live map');
  const box0 = await page.locator('.run-route svg').boundingBox();
  const here = await page.locator('.run-route circle[r="8"]').last().boundingBox();
  const cx = (here.x + here.width / 2 - box0.x) / box0.width, cy = (here.y + here.height / 2 - box0.y) / box0.height;
  check(cx > 0.1 && cx < 0.9 && cy > 0.1 && cy < 0.9, `"you are here" inside the map, not stuck in a corner (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
  await page.locator('.run-route').screenshot({ path: require('path').join(__dirname, 'out', 'run-live-map.png') });
  await page.getByRole('button', { name: 'Hide map' }).click();
  check(await page.locator('.run-route image').count() === 0 && await page.getByRole('img', { name: 'Your route so far' }).isVisible(), 'Hide map leaves only the route');
  await page.getByRole('button', { name: 'Show map' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  for (let i = 0; i < 20; i++) await step(2.5, false);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.waitForTimeout(600);
  for (let i = 0; i < 60; i++) await step(2.5, true);
  const fin = page.getByRole('button', { name: 'Hold to finish the run' });
  const box = await fin.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1800); await page.mouse.up();
  await page.getByText('Run finished').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Save and see feedback' }).click();
  await page.waitForURL(/\/activity\/gps-/);
  await page.waitForTimeout(800);
  const body = await page.locator('main').innerText();
  check(/Session score/.test(body), `saving opens the feedback for the run (${body.slice(0, 160).replace(/\n/g, ' / ')})`);
  await page.waitForTimeout(2000);
  const row = mock.state.tables.activities.find((r) => r.user_id === uid && r.source === 'ritmo_gps');
  const err = row ? Math.abs(row.distance_m - counted) / counted : 1;
  check(!!row && err <= 0.02, `saved distance ${row?.distance_m} m vs ${counted} m run while recording (${(err * 100).toFixed(1)}% off)`);
  check(!!row?.streams?.length && row.streams.every((p) => p.lat != null), 'the route is saved with the run');
  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  // Quick run on the Training page: orange, opens Run as a free run that starts by itself once GPS is ready
  const ctx3 = await b.newContext({ ...devices['Pixel 7'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 5 }, permissions: ['geolocation'] });
  await ctx3.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx3, SUPA);
  const q = await account(mock, ctx3, 'quick@test.ritmo', false); // no flag: Quick run is for everyone
  await q.page.goto(`${APP}/`); await q.page.waitForTimeout(1200);
  const fit = q.page.getByRole('button', { name: /Train 6 days a week/ });
  if (await fit.isVisible().catch(() => false)) { await fit.click(); await q.page.waitForTimeout(800); }
  const btn = q.page.locator('a.quick-run');
  check(await btn.isVisible() && /Quick run/.test(await btn.innerText()), 'Training page shows a Quick run button');
  const colours = await btn.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() }));
  const rgb = (c) => { const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : []; };
  const [r, g, bl] = rgb(colours.bg);
  check(r > 200 && g > 50 && g < 140 && bl < 60, `Quick run is orange (${colours.bg}, brand ${colours.brand})`);
  // Orange in every theme, including dark and high contrast (whose brand colour is a dark red-brown)
  for (const theme of ['dark', 'sole']) {
    const c = await btn.evaluate((el, t) => { document.documentElement.dataset.theme = t; return getComputedStyle(el).backgroundColor; }, theme);
    const [r2, g2, b2] = rgb(c);
    check(r2 > 200 && g2 > 60 && g2 < 140 && b2 < 70, `Quick run stays orange in the ${theme === 'sole' ? 'high-contrast' : 'dark'} theme (${c})`);
  }
  await btn.evaluate(() => { delete document.documentElement.dataset.theme; });
  const top = await btn.boundingBox();
  check(top && top.y < (await q.page.viewportSize()).height * 0.6, 'Quick run is near the top of the page, without scrolling');
  await btn.click();
  await q.page.waitForURL(/\/run/);
  await q.page.locator('.run-live').waitFor({ timeout: 12000 });
  check(true, 'tapping it starts recording by itself once GPS is ready (no extra Start tap)');
  check(await q.page.locator('.run-step').count() === 0, "it is a free run, not today's planned session");
  check(!/quick=1/.test(q.page.url()), 'the address is tidied, so reopening Run does not start another run');
  // The clock ticks every second, even with no new GPS fix (standing still, auto-pause off in these tests)
  const secs = async () => { const t = await q.page.getByTestId('run-clock').innerText(); return t.split(':').reduce((a, x) => a * 60 + Number(x), 0); };
  const c1 = await secs(); await q.page.waitForTimeout(3200); const c2 = await secs();
  check(c2 - c1 >= 2 && c2 - c1 <= 4, `the clock ticks every second without new GPS points (${c1}s, then ${c2}s)`);
  // Lap: a visible confirmation, a lap list, and the button counts up
  const lapBtn = q.page.getByRole('button', { name: /^Lap 1$/ });
  check(await lapBtn.isVisible(), 'the Lap button shows which lap it will mark ("Lap 1")');
  await lapBtn.click();
  check(await q.page.locator('.run-lap-flash').filter({ hasText: /^Lap 1: .+ in \d+:\d\d$/ }).isVisible(), 'pressing Lap shows "Lap 1: distance in time" straight away');
  check(await q.page.getByRole('button', { name: /^Lap 2$/ }).isVisible(), 'and the button moves on to "Lap 2"');
  check(await q.page.getByRole('region', { name: 'Laps' }).or(q.page.locator('section[aria-label="Laps"]')).first().getByText('Lap 2 (now)').isVisible(), 'a Laps list shows the finished lap and the one in progress');

  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
