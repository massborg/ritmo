// Weather on runs: the run page shows the weather for a run with GPS, looks it up once (it is saved with the run),
// adds a conditions note on a hot day without changing the score, and shows nothing when weather is not set up
// or the run has no GPS. Usage: node e2e/weather.cjs (needs the app on APP_URL).
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'weather');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'weather@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const gpsStreams = () => Array.from({ length: 200 }, (_, i) => ({ t: i * 19, d: i * 70, lat: 35.9 + i * 0.0005, lon: 14.5 }));
  const hot = rows.activities[rows.activities.length - 1]; hot.streams = gpsStreams();
  const other = rows.activities[rows.activities.length - 3]; other.streams = gpsStreams();
  const noGps = rows.activities[rows.activities.length - 2]; noGps.streams = Array.from({ length: 50 }, (_, i) => ({ t: i * 20, d: i * 60 }));
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  const weatherLine = page.locator('.run-weather');

  // Not set up yet (no key): no weather, no error
  await page.goto(`${APP}/activity/${other.id}`); await page.locator('h2#verdict').waitFor({ timeout: 15000 }); await page.waitForTimeout(1500);
  check(mock.state.weatherCalls === 1 && await weatherLine.count() === 0, 'weather not set up: asked once, nothing shown');
  const scoreBefore = await page.locator('h2#verdict ~ p.caption').first().textContent();

  // Set up: hot and humid
  mock.state.weather = { t: 29.4, fl: 33.2, h: 71, dp: 23.1, ws: 14.4, wd: 200, c: 'few clouds' };
  await page.goto(`${APP}/activity/${hot.id}`); await page.locator('h2#verdict').waitFor({ timeout: 15000 });
  await weatherLine.waitFor({ timeout: 8000 });
  const line = (await weatherLine.textContent()).replace(/\s+/g, ' ').trim();
  check(line === 'Weather 29°C, feels like 33°C · humidity 71% · wind 14 km/h S · few clouds · OpenWeather', `weather line: "${line}"`);
  check(await page.getByRole('link', { name: 'OpenWeather' }).getAttribute('href') === 'https://openweathermap.org/', 'OpenWeather credited and linked');
  const note = page.locator('.weather-note');
  check(await note.isVisible() && /^Hot and humid \(feels like 33°C\)/.test(await note.textContent()), 'hot-day note in the feedback');
  const saved = mock.state.tables.activities.find((r) => r.id === hot.id).source_ids.weather;
  check(saved?.t === 29.4 && saved.src === 'openweather', 'weather saved with the run');
  await page.locator('section[aria-labelledby="verdict"]').screenshot({ path: path.join(OUT, 'verdict.png') });
  await page.locator('section.card').filter({ has: weatherLine }).screenshot({ path: path.join(OUT, 'stats.png') });

  // Looked up once: reopening the run (and after reload, from the account) asks nothing new
  const calls = mock.state.weatherCalls;
  await page.goto(`${APP}/progress`); await page.goto(`${APP}/activity/${hot.id}`); await weatherLine.waitFor({ timeout: 8000 });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store')); await page.reload(); await weatherLine.waitFor({ timeout: 15000 });
  check(mock.state.weatherCalls === calls, `no new lookups when the run is opened again (${mock.state.weatherCalls - calls})`);

  // Score unchanged by weather
  mock.state.weather = { t: 16, fl: 16, h: 50, dp: 6, ws: 8, wd: 0, c: 'clear sky' };
  await page.goto(`${APP}/activity/${other.id}`); await weatherLine.waitFor({ timeout: 8000 });
  check(await page.locator('.weather-note').count() === 0, 'no note on an ordinary day');
  check((await page.locator('h2#verdict ~ p.caption').first().textContent()) === scoreBefore, 'session score the same with and without weather');

  // No GPS: never asked
  const before = mock.state.weatherCalls;
  await page.goto(`${APP}/activity/${noGps.id}`); await page.locator('h2#verdict').waitFor({ timeout: 15000 }); await page.waitForTimeout(1200);
  check(mock.state.weatherCalls === before && await weatherLine.count() === 0, 'run without GPS: no lookup, no weather');
  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
