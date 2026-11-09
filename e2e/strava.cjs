// Strava sync (open to every runner): a runner connects (round trip through
// the callback page), the last 30 days arrive and are merged (rides ignored), each Strava run says "from Strava" with
// a "View on Strava" link and cannot be posted to the Hub or shared as an image, the AI coach is told nothing derived
// from Strava runs, a run deleted on Strava is removed, and Disconnect revokes access.
// Usage: node e2e/strava.cjs (needs the app on APP_URL, served with netlify.toml headers).
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const tap = async (loc) => { await loc.waitFor({ timeout: 15000 }); await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await loc.click(); };

// A Strava run with streams; `km` and `name` are distinctive so we can prove the AI never hears about them
const stravaRun = (id, daysAgo, km, name, sport = 'Run') => {
  const start = new Date(Date.now() - daysAgo * 86400000); start.setUTCHours(6, 30, 0, 0);
  const n = 60, secs = Math.round(km * 300);
  return {
    activity: { id, name, sport_type: sport, start_date: start.toISOString(), distance: km * 1000, moving_time: secs, elapsed_time: secs + 30, total_elevation_gain: 55, average_heartrate: 151, max_heartrate: 176, average_cadence: 87, device_name: 'Garmin Forerunner 265' },
    streams: { time: { data: Array.from({ length: n }, (_, i) => Math.round((i * secs) / (n - 1))) }, distance: { data: Array.from({ length: n }, (_, i) => (i * km * 1000) / (n - 1)) },
      latlng: { data: Array.from({ length: n }, (_, i) => [35.9 + i * 0.0004, 14.5]) }, heartrate: { data: Array.from({ length: n }, () => 150) }, cadence: { data: Array.from({ length: n }, () => 87) } },
  };
};

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 404, body: '' }));
  // Record what the app sends to the AI coach (the fake answers "not configured", so the built-in coach replies)
  const aiBodies = [];
  await ctx.route(`${SUPA}/functions/v1/coach`, (r) => { if (r.request().method() === 'POST') aiBodies.push(r.request().postData() ?? ''); return r.fallback(); });
  mock.state.strava = { connected: new Set(), states: new Map(), calls: [], appUrl: APP,
    backfill: [stravaRun(111, 1, 21.37, 'Strava Long One'), stravaRun(222, 4, 8.4, 'Strava Trail', 'TrailRun'), stravaRun(333, 3, 40, 'Strava Ride', 'Ride')] };

  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'strava@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  // AI coach switched on for this runner
  const prof = mock.state.tables.profiles.find((p) => p.user_id === uid);
  prof.data = { ...prof.data, profile: { ...(prof.data?.profile ?? {}), consents: { ...(prof.data?.profile?.consents ?? {}), aiCoach: { granted: true, at: new Date().toISOString() } } } };
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  const row = (id) => mock.state.tables.activities.find((r) => r.id === id);
  const stravaRow = () => page.locator('li', { has: page.locator('.label', { hasText: /^Strava$/ }) });

  // ---- Without the flag ----
  await page.goto(`${APP}/profile/data`); await stravaRow().waitFor({ timeout: 15000 });
  check(await stravaRow().getByText('Coming soon').count() === 0 && await stravaRow().getByRole('button', { name: 'Connect with Strava' }).count() === 1, 'every runner can connect Strava (no flag needed)');

  // ---- Flagged: connect (round trip through the callback page) ----
  mock.state.tables.feature_flags.push({ user_id: uid, flag: 'strava' }, { user_id: uid, flag: 'hub' }, { user_id: uid, flag: 'share_cards' });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/profile/data`);
  const btn = stravaRow().getByRole('button', { name: 'Connect with Strava' });
  await btn.waitFor({ timeout: 15000 });
  const img = await btn.locator('img').evaluate((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, h: i.getBoundingClientRect().height }));
  check(img.src === '/brand/strava/btn_strava_connect_with_orange.svg' && img.ok && img.h >= 44, `official "Connect with Strava" button image, ${Math.round(img.h)} px tall`);
  await stravaRow().screenshot({ path: require('path').join(__dirname, 'out', 'strava-connect.png') });
  await tap(btn);
  await page.waitForURL(/\/strava\/callback/, { timeout: 15000 });
  await page.getByText(/Strava is connected/).waitFor({ timeout: 15000 });
  check(mock.state.strava.connected.has(uid), 'connected after the round trip through Strava\'s callback');
  await page.waitForURL(/\/profile\/data/, { timeout: 15000 });
  await page.waitForTimeout(9000); // the app picks up the 30-day backfill shortly after connecting
  await page.waitForTimeout(2500); // and saves to the account
  check(row('strava-111')?.source === 'strava' && row('strava-222')?.source === 'strava', 'last 30 days of runs arrived and were saved (run and trail run)');
  check(!row('strava-333'), 'the ride was ignored');
  check(mock.state.tables.strava_inbox.filter((r) => r.user_id === uid).length === 0, 'inbox cleared after the runs were saved');
  check(await stravaRow().getByRole('button', { name: 'Sync now' }).isVisible() && await stravaRow().getByRole('img', { name: 'Powered by Strava' }).isVisible(), 'Strava row shows Sync now and the official "Powered by Strava" logo');
  const logo = await stravaRow().getByRole('img', { name: 'Powered by Strava' }).evaluate((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 }));
  check(logo.src === '/brand/strava/api_logo_pwrdBy_strava_horiz_orange.svg' && logo.ok, 'the official logo file loads');

  // ---- A Strava run: attribution and no sharing ----
  await page.goto(`${APP}/activity/strava-111`); await page.locator('h2#verdict').waitFor({ timeout: 15000 });
  const meta = await page.locator('header.large-title p.caption').textContent();
  check(/· Strava$/.test(meta) && (await page.getByRole('link', { name: 'View on Strava' }).getAttribute('href')) === 'https://www.strava.com/activities/111', 'run page: dated "· Strava" with a View on Strava link');
  check(await page.getByRole('button', { name: 'Post to Hub' }).count() === 0 && await page.getByRole('button', { name: 'Share this run' }).count() === 0, 'no Post to Hub or Share for a Strava run');
  check(await page.getByText(/came from Strava, so it stays private to you/).isVisible(), 'explains why');
  const shots = require('path').join(__dirname, 'out');
  await page.locator('a.strava-link').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: require('path').join(shots, 'strava-run-attribution.png') });
  await page.getByText(/came from Strava, so it stays private to you/).evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: require('path').join(shots, 'strava-run-private.png') });
  // A non-Strava run still offers sharing
  const own = rows.activities[rows.activities.length - 1].id;
  await page.goto(`${APP}/activity/${own}`); await page.locator('h2#verdict').waitFor({ timeout: 15000 });
  check(await page.getByRole('button', { name: 'Share this run' }).count() === 1, 'a run from another source can still be shared');

  // ---- The AI coach is told nothing derived from Strava runs ----
  await page.goto(`${APP}/coach`); await page.locator('#ask').waitFor({ timeout: 15000 });
  await page.locator('#ask').fill('How did my last run go?');
  await tap(page.getByRole('button', { name: 'Send' }));
  await page.waitForTimeout(2500);
  const sent = aiBodies.join('\n');
  check(aiBodies.length > 0 && JSON.parse(aiBodies[0]).facts?.length > 0, `the AI request was made with facts (${aiBodies.length} request)`);
  check(!/21\.4|21\.37|Strava Long One|Strava Trail|8\.4 km/.test(sent), 'nothing from the Strava runs is in what the AI is told');

  // ---- A run deleted on Strava is removed here ----
  mock.state.tables.strava_inbox.push({ id: 99, user_id: uid, activity_id: '222', payload: { deleted: true }, received_at: new Date().toISOString() });
  await page.goto(`${APP}/profile/data`);
  await tap(stravaRow().getByRole('button', { name: 'Sync now' }));
  await page.waitForTimeout(3000);
  check(!row('strava-222') && !!row('strava-111'), 'run deleted on Strava removed from the account; others kept');

  // ---- Disconnect ----
  await tap(stravaRow().getByRole('button', { name: 'Disconnect' }));
  await page.waitForTimeout(1500);
  check(mock.state.strava.calls.includes('disconnect') && !mock.state.strava.connected.has(uid), 'Disconnect revokes access');
  check(!!row('strava-111'), 'runs already saved stay after disconnecting');

  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
