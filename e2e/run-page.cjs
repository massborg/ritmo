// The run page on a phone (dark mode): in a session made of several pieces, the piece you are viewing is
// highlighted in orange; the summary numbers line up and fit (even a slow pace like 15:16/km); the weather block
// does not overlap; "This was a race" looks like a button. Uses two made-up short runs on one morning.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

const day = new Date(Date.now() - 4 * 86400000); day.setUTCHours(5, 3, 0, 0);
const pts = (lat0, lon0, metres, secs) => Array.from({ length: 12 }, (_, i) => ({ t: Math.round((secs * i) / 11), d: Math.round((metres * i) / 11), lat: lat0 + (i * metres) / 11 / 111195, lon: lon0 }));
const runs = (uid) => [
  { id: 'piece-strides', user_id: uid, source: 'ritmo_gps', source_ids: { ritmo_gps: 'piece-strides', weather: { c: 'cloudy', h: 74, t: 19.6, fl: 19.6, ws: 10.1, wd: 209, dp: 14.8, at: day.toISOString(), src: 'met.no' } }, start_time: day.toISOString(), name: 'Morning run', distance_m: 345, duration_s: 317, moving_s: 316, elev_gain_m: 25, is_race: false, detail_score: 6, laps: null, streams: pts(35.8725, 14.5036, 345, 316), derived: { v: 1 } },
  { id: 'piece-main', user_id: uid, source: 'ritmo_gps', source_ids: { ritmo_gps: 'piece-main' }, start_time: new Date(day.getTime() + 20 * 60000).toISOString(), name: 'Morning run', distance_m: 414, duration_s: 256, moving_s: 254, elev_gain_m: 10, is_race: false, detail_score: 6, laps: null, streams: pts(35.8718, 14.5046, 414, 254), derived: { v: 1 } },
];

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+/btfwAJfwPpa1fKXQAAAABJRU5ErkJggg==', 'base64') }));
  const page = await ctx.newPage();
  const email = 'runpage@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  mock.state.tables.activities.push(...runs(uid));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Train 6 days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }

  await page.goto(`${APP}/activity/piece-strides`); await page.locator('#session-parts').waitFor({ timeout: 10000 });
  const card = page.locator('section', { has: page.locator('#session-parts') });
  const current = card.locator('a[aria-current="page"]');
  check(await current.count() === 1, 'exactly one run in the session list is marked as the one you are viewing');
  check(await current.getAttribute('href') === '/activity/piece-strides', 'it is the run you opened');
  const look = await current.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, bar: getComputedStyle(el).boxShadow, name: getComputedStyle(el.querySelector('.run-part-name')).color }));
  const orange = (c) => { const m = (c.match(/\d+(\.\d+)?/g) || []).map(Number); return m[0] > 200 && m[1] > 60 && m[1] < 150 && m[2] < 80; };
  check(look.bg !== 'rgba(0, 0, 0, 0)' && /(255|1) 0?\.?4|255, 106/.test(look.bg.replace(/,\s*/g, ', ')), `the viewed run has an orange background tint (${look.bg})`);
  check(orange(look.name) && /inset/.test(look.bar), `and an orange bar and name (${look.name})`);
  const other = card.locator('.session-parts a:not([aria-current])').first();
  check(await other.evaluate((el) => getComputedStyle(el).backgroundColor) === 'rgba(0, 0, 0, 0)', 'the other run is not highlighted');
  await other.click();
  await page.waitForURL(/piece-main/);
  const moved = await page.locator('section', { has: page.locator('#session-parts') }).locator('a[aria-current="page"][href="/activity/piece-main"]').waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(moved, 'opening the other run moves the highlight to it');

  await page.goto(`${APP}/activity/piece-strides`); await page.locator('.run-stat-grid').waitFor();
  const labels = await page.locator('.run-stat-grid .caption').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  check(labels.length >= 3 && labels[0] === labels[1] && (labels.length < 4 || labels[2] === labels[3]), `the stat labels line up in two rows (${labels.join(', ')})`);
  const spill = await page.locator('.run-stat-grid .stat').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.parentElement.clientWidth + 1).length);
  check(spill === 0 && /15:16/.test(await page.locator('.run-stat-grid').innerText()), 'a slow pace (15:16/km) fits in its column');
  const w = await page.locator('.run-weather p').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.top, r.bottom]));
  check(w.length === 2 && w.every((r, i) => i === 0 || r[0] >= w[i - 1][1] - 0.5), 'the weather lines and the MET Norway credit do not overlap');
  const race = page.getByRole('button', { name: 'This was a race' });
  check(await race.evaluate((el) => getComputedStyle(el).borderTopStyle !== 'none' && getComputedStyle(el).borderTopColor !== 'rgba(0, 0, 0, 0)'), '"This was a race" has a visible button outline');

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
