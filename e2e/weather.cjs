// Weather on runs (MET Norway): a recent run with GPS gets its weather as soon as it arrives, without opening the
// run page; it is looked up once (saved with the run); the run page shows it with the MET Norway credit and adds a
// conditions note on a hot day without changing the score. Old runs and runs without GPS are never looked up, and
// an unavailable service shows nothing. Usage: node e2e/weather.cjs (needs the app on APP_URL).
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
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

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
  const gps = () => Array.from({ length: 200 }, (_, i) => ({ t: i * 19, d: i * 70, lat: 35.9 + i * 0.0005, lon: 14.5 }));
  const acts = rows.activities;
  const hot = acts[acts.length - 1]; hot.streams = gps(); hot.start_time = ago(90); hot.duration_s = 3600;          // middle 60 min ago
  const mild = acts[acts.length - 2]; mild.streams = gps(); mild.start_time = ago(170); mild.duration_s = 1800;     // middle 155 min ago
  const indoor = acts[acts.length - 3]; indoor.streams = Array.from({ length: 50 }, (_, i) => ({ t: i * 20, d: i * 60 })); indoor.start_time = ago(30); indoor.duration_s = 1500;
  const old = acts[acts.length - 4]; old.streams = gps(); // days ago
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  const scoreOf = async () => page.locator('.verdict-card').getAttribute('data-score');

  // 1. Service unavailable: the recent runs are asked about once, nothing shown, no errors
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/activity/${mild.id}`); await page.locator('h2#verdict').waitFor({ timeout: 15000 }); await page.waitForTimeout(2000);
  check(mock.state.weatherCalls === 3, `service down: the 3 recent runs asked once each (${mock.state.weatherCalls})`);
  check(await page.locator('.run-weather').count() === 0, 'nothing shown while the service is unavailable');
  check(mock.state.tables.activities.find((r) => r.id === indoor.id).source_ids?.weatherSkip === 'no_gps', 'indoor run marked "no GPS" on the server');
  await page.goto(`${APP}/activity/${old.id}`); await page.locator('h2#verdict').waitFor({ timeout: 15000 }); await page.waitForTimeout(1500);
  const oldScore = await scoreOf();
  const calls1 = mock.state.weatherCalls;
  check(calls1 === 5, `next visit retries only the 2 outdoor runs, not the indoor one (${calls1 - 3})`);

  // 2. Service up, new visit: weather arrives without opening the run page
  mock.state.weather = { t: 29.4, fl: 33.2, h: 71, dp: 23.1, ws: 14.4, wd: 200, c: 'partly cloudy' };
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/today`); await page.waitForTimeout(2500);
  const saved = mock.state.tables.activities.find((r) => r.id === hot.id).source_ids?.weather;
  check(saved?.t === 29.4 && saved.src === 'met.no', 'recent run got its weather on arrival, saved with the run');
  check(!mock.state.tables.activities.find((r) => r.id === old.id).source_ids?.weather, 'old run not looked up');
  const calls2 = mock.state.weatherCalls;
  check(calls2 - calls1 === 2, `only the 2 recent outdoor runs asked (${calls2 - calls1}); old and indoor runs never`);

  await page.goto(`${APP}/activity/${hot.id}`); await page.locator('.run-weather').waitFor({ timeout: 8000 });
  const lines = (await page.locator('.run-weather p').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  check(lines.join(' | ') === 'Weather | 29°C, feels like 33°C · humidity 71% · wind 14 km/h S · partly cloudy | Weather data: MET Norway', `weather block: "${lines.join(' | ')}"`);
  check(await page.getByRole('link', { name: 'MET Norway' }).getAttribute('href') === 'https://www.met.no/en', 'MET Norway credited and linked');
  check(/^Hot and humid \(feels like 33°C\)/.test(await page.locator('.weather-note').textContent()), 'hot-day note in the feedback');
  await page.locator('section[aria-labelledby="verdict"]').screenshot({ path: path.join(OUT, 'verdict.png') });
  await page.locator('section.card').filter({ has: page.locator('.run-weather') }).screenshot({ path: path.join(OUT, 'stats.png') });

  // 3. Looked up once: a fresh visit loads weather from the account and asks nothing new
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store')); await page.reload(); await page.locator('.run-weather').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  check(mock.state.weatherCalls === calls2, `no new lookups on a fresh visit (${mock.state.weatherCalls - calls2})`);

  // 4. Weather explains, never changes the score (the old run, given ordinary weather in the account)
  const oldRow = mock.state.tables.activities.find((r) => r.id === old.id);
  oldRow.source_ids = { ...(oldRow.source_ids ?? {}), weather: { t: 16, fl: 16, h: 50, dp: 6, ws: 8, wd: 0, c: 'clear sky', at: ago(0), src: 'met.no' } }; oldRow.updated_at = new Date().toISOString();
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/activity/${old.id}`); await page.locator('.run-weather').waitFor({ timeout: 15000 });
  check(await page.locator('.weather-note').count() === 0, 'no note on an ordinary day');
  check((await scoreOf()) === oldScore, 'session score the same with and without weather');
  // and a hot day on that run would add the note, still with the same score
  oldRow.source_ids.weather = { ...oldRow.source_ids.weather, t: 31, fl: 35, h: 65, dp: 23 }; oldRow.updated_at = new Date().toISOString();
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.reload(); await page.locator('.weather-note').waitFor({ timeout: 15000 });
  check((await scoreOf()) === oldScore, 'hot-day note added, score still the same');

  // 5. Indoor run: no weather shown
  await page.goto(`${APP}/activity/${indoor.id}`); await page.locator('h2#verdict').waitFor({ timeout: 15000 }); await page.waitForTimeout(600);
  check(await page.locator('.run-weather').count() === 0, 'run without GPS: no weather');
  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
