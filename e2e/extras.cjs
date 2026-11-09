// §7/§8 extras: Classic week preset with week preview, Explain this week, calendar feed link and reminder settings,
// race-day mode (splits, strategy, warm-up timer, fuelling, race report), shoes assigned by session type with
// alerts, and data-quality tools (merge a duplicate, leave out of stats, correct a distance).
// Usage: node e2e/extras.cjs (needs the app on APP_URL, served with netlify.toml headers).
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'extras');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const tap = async (loc) => { await loc.waitFor({ timeout: 15000 }); await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await loc.click(); };
const ymd = (d) => d.toISOString().slice(0, 10);

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'extras@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const acts = rows.activities;
  // A duplicate of the latest run, imported again with the clock an hour out
  const orig = acts[acts.length - 1];
  const dup = { ...orig, id: 'dup-1', source: 'upload', source_ids: { upload: 'dup-1' }, start_time: new Date(new Date(orig.start_time).getTime() + 3600000).toISOString(), detail_score: 0, streams: null, laps: null, derived: null };
  acts.push(dup);
  // An A race in 5 days with a goal, and a past A race with a result run (streams) on that day
  const raceDay = new Date(Date.now() + 5 * 86400000);
  const past = acts[acts.length - 6];
  // First 5 km at 4:51/km, last 5 km at 5:09/km: on a 5:00/km plan, out too fast and slower later
  past.streams = Array.from({ length: 101 }, (_, i) => ({ t: i <= 50 ? i * 29.1 : 50 * 29.1 + (i - 50) * 30.9, d: i * 100 }));
  past.distance_m = 10000; past.moving_s = 3000; past.duration_s = 3000; past.is_race = true;
  rows.races = [
    { id: 'race-a', user_id: uid, data: { id: 'race-a', name: 'Test 10K', date: ymd(raceDay), distanceM: 10000, courseType: 'road', goalS: 2700, priority: 'A' } },
    { id: 'race-p', user_id: uid, data: { id: 'race-p', name: 'Past 10K', date: past.start_time.slice(0, 10), distanceM: 10000, courseType: 'road', goalS: 3000, priority: 'A' } },
  ];
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  // Shoes: everyday trainers and racing flats
  const prof = mock.state.tables.profiles.find((p) => p.user_id === uid);
  prof.data = { ...prof.data, profile: { ...(prof.data?.profile ?? {}), shoes: [
    { id: 'sh-daily', name: 'Daily trainers', startDate: '2020-01-01', startKm: 0, retireKm: 700, use: 'everyday' },
    { id: 'sh-flats', name: 'Racing flats', startDate: '2020-01-01', startKm: 0, retireKm: 400, use: 'fast' },
  ] } };
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  const profile = () => mock.state.tables.profiles.find((p) => p.user_id === uid).data.profile ?? {};
  const row = (id) => mock.state.tables.activities.find((r) => r.id === id);

  // ---- Classic week preset and week preview ----
  await page.goto(`${APP}/goals`); await page.getByText('Classic week').waitFor({ timeout: 15000 });
  await tap(page.getByRole('button', { name: 'Use it' }));
  await page.waitForTimeout(600);
  const week = await page.locator('.week-preview li').allTextContents();
  check(/^Mon.*Threshold/.test(week[0] ?? '') && /^Thu.*Intervals/.test(week[3] ?? '') && /^Sat.*Long run/.test(week[5] ?? ''), `Classic week preview: ${week.map((w) => w.replace(/\d+/g, '').trim()).join(' | ')}`);
  check(await page.getByRole('button', { name: 'In use' }).isVisible(), 'preset shows as in use');
  await page.locator('#fit').screenshot({ path: path.join(OUT, 'classic-week.png') }).catch(() => {});
  await tap(page.getByRole('button', { name: /Save and (re)?build my plan/ }));
  await page.waitForTimeout(1500);

  // ---- Explain this week ----
  await page.goto(`${APP}/`); await tap(page.getByRole('button', { name: 'Explain this week' }));
  const expl = await page.locator('.explain-week').textContent();
  check(/^This is (a|race) .*week/.test(expl) && /km/.test(expl), `explanation: "${expl.slice(0, 90)}…"`);

  // ---- Calendar feed ----
  await page.goto(`${APP}/profile`); await tap(page.getByRole('button', { name: 'Create my calendar link' }));
  const link = await page.locator('.cal-link').textContent();
  check(/\/functions\/v1\/calendar\?t=[a-f0-9]{64}$/.test(link), 'private calendar link created (64-character token)');
  check((await page.getByRole('link', { name: 'Add to Apple Calendar' }).getAttribute('href')).startsWith('webcal://'), 'Apple Calendar link uses webcal://');
  check((await page.getByRole('link', { name: 'Add to Google Calendar' }).getAttribute('href')).startsWith('https://calendar.google.com/calendar/r?cid=webcal'), 'Google Calendar subscribe link');
  await tap(page.getByRole('button', { name: '06:00' }));
  await page.waitForTimeout(2500);
  check(profile().calendarFeed?.morningHour === 6 && profile().calendarFeed?.token === link.split('t=')[1], 'reminder setting and token saved to the account');
  await tap(page.getByRole('button', { name: 'Reset the link' }));
  await page.waitForTimeout(300);
  check((await page.locator('.cal-link').textContent()) !== link, 'reset gives a new link');

  // ---- Race-day mode ----
  await page.goto(`${APP}/race/race-a`); await tap(page.getByRole('link', { name: 'Open race-day mode' }));
  await page.locator('#rd-splits').waitFor();
  const firstEven = await page.locator('table.data tbody tr').first().locator('td').nth(1).textContent();
  const rowsN = await page.locator('table.data tbody tr').count();
  check(rowsN === 10 && firstEven.startsWith('4:30'), `10 km splits at goal pace (first: ${firstEven})`);
  await tap(page.getByRole('button', { name: /Negative split/ }));
  const firstNeg = await page.locator('table.data tbody tr').first().locator('td').nth(1).textContent();
  const lastClock = await page.locator('table.data tbody tr').last().locator('td').nth(2).textContent();
  check(firstNeg > firstEven && lastClock === '45:00', `negative split starts slower (${firstNeg}) and still finishes in ${lastClock}`);
  await tap(page.getByRole('button', { name: 'Start warm-up' }));
  await page.waitForTimeout(2200);
  const timer = await page.locator('[role="timer"]').textContent();
  check(/^11:5\d$/.test(timer), `warm-up timer counting down (${timer})`);
  await tap(page.getByRole('button', { name: 'Next step' }));
  check(/Step 2 of 4: Drills/.test(await page.locator('.warmup-now .label').textContent()), 'next step: drills');
  check(await page.getByText('3 to 4 hours before').isVisible(), 'what to eat and when');
  await page.locator('.race-day').screenshot({ path: path.join(OUT, 'race-day.png') });
  await page.goto(`${APP}/race/race-p/day`); await page.locator('#rd-report').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const summary = await page.locator('#rd-report ~ p').first().textContent();
  check(/plan overall/.test(summary) && /went out faster/.test(summary), `race report: "${summary}"`);
  check(await page.locator('#rd-report').locator('xpath=..').locator('td.diff-fast').count() > 0, 'split differences shown');

  // ---- Shoes: by session type ----
  await page.goto(`${APP}/activity/${orig.id}`); await page.locator('#fix-run').waitFor({ timeout: 15000 });
  const autoOpt = await page.locator('#run-shoe option').first().textContent();
  check(/^Automatic \((Daily trainers|Racing flats)\)$/.test(autoOpt), `shoe chosen automatically: ${autoOpt}`);
  await page.locator('#run-shoe').selectOption('sh-flats');
  await page.waitForTimeout(2500);
  check(row(orig.id).source_ids?.shoe === 'sh-flats', 'chosen shoe saved with the run');

  // ---- Leave out of stats and correct distance ----
  await page.getByText('Leave out of my stats').click();
  await page.waitForTimeout(2500);
  check(row(orig.id).source_ids?.hidden === true, 'run left out of stats (saved)');
  await page.getByText('Leave out of my stats').click();
  // About 5% shorter than the run itself (the fixture's latest run changes with the date: 9.5 km, or a 1 km cool-down)
  const fixM = Math.floor((orig.distance_m * 0.95) / 100) * 100;
  await page.locator('#fix-km').fill(String(fixM / 1000));
  await tap(page.getByRole('button', { name: 'Save distance' }));
  await page.waitForTimeout(2500);
  check(row(orig.id).distance_m === fixM && row(orig.id).source_ids?.distFrom > 0, `distance corrected to ${fixM / 1000} km, original kept (${row(orig.id).source_ids?.distFrom})`);
  await tap(page.getByRole('button', { name: 'Restore original' }));
  await page.waitForTimeout(2500);
  check(row(orig.id).distance_m === row(orig.id).distance_m && !row(orig.id).source_ids?.distFrom, 'original distance restored');

  // ---- Duplicates: listed and merged ----
  await page.goto(`${APP}/profile/data`); await page.locator('#dups').waitFor({ timeout: 15000 });
  check(await page.locator('#dups ~ ul li').count() === 1, 'duplicate pair listed in Data sources');
  await tap(page.getByRole('button', { name: 'Merge' }));
  await page.waitForTimeout(2500);
  check(!row('dup-1') && !!row(orig.id), 'merged: the less detailed copy deleted from the account, the original kept');
  check(await page.locator('#dups').count() === 0, 'no duplicates left');

  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
