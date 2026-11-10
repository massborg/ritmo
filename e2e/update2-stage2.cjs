// Update 2, stage 2: every run page has Overview · Intervals · Charts · Shoes. Checked on a copy of the 10 Nov run
// (14.2 km, 6 × ~30 s strides, Garmin Forerunner 965 at 06:50), a run with no heart rate and a steady run.
// Usage: node e2e/update2-stage2.cjs (app on :4173)
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'update2-stage2');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

/** A 1 Hz stream from [seconds, pace] pieces, along a curving line near Ta' Xbiex */
function stream(pieces, withHr = true) {
  const out = [{ t: 0, d: 0, hr: withHr ? 120 : undefined, cad: 170, alt: 8, lat: 35.899, lon: 14.494 }];
  let t = 0, d = 0;
  for (const [secs, pace] of pieces) for (let i = 0; i < secs; i++) {
    t++; d += 1000 / pace;
    const p = { t, d: Math.round(d * 10) / 10, cad: pace < 240 ? 192 : 171, alt: Math.round((8 + Math.sin(t / 400) * 4) * 10) / 10, lat: 35.899 + Math.sin(d / 3000) * 0.012, lon: 14.494 + d / 111000 * 0.8 };
    if (withHr) p.hr = Math.round(pace < 240 ? 150 + (i % 4) : 128 + Math.min(10, t / 400));
    out.push(p);
  }
  return out;
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'u2s2@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  rows.profiles[0].data.profile.shoes = [
    { id: 'daily', name: 'Daily trainer', startDate: '2026-08-01', startKm: 0, retireKm: 700, use: 'everyday' },
    { id: 'race', name: 'Race shoe', startDate: '2026-08-01', startKm: 100, retireKm: 400, use: 'fast' },
    { id: 'old', name: 'Old trainer', startDate: '2026-01-01', startKm: 640, retireKm: 750, use: 'long' },
  ];
  // The 10 Nov run: 6.48 km warm up, 6 × ~31 s strides with ~2:31 recoveries, cool down, from a Forerunner 965
  const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(6, 50, 0, 0);
  const reps = [198, 195, 195, 197, 199, 204];
  const pieces = [[1877, 290]];
  reps.forEach((p, i) => { pieces.push([31, p]); if (i < 5) pieces.push([151, 320]); });
  pieces.push([1490, 306]);
  const s10 = stream(pieces);
  const last = s10[s10.length - 1];
  const tenNov = { user_id: uid, id: 'upload-10nov', source: 'upload', source_ids: { upload: 'x', device: 'Garmin Forerunner 965' }, start_time: start.toISOString(), name: "Ta' Xbiex easy run + strides", distance_m: Math.round(last.d), duration_s: last.t, moving_s: last.t, avg_hr: 133, avg_cadence: 171, elev_gain_m: 24, streams: s10, updated_at: new Date().toISOString() };
  const s2 = stream([[2400, 300]], false);
  const noHr = { user_id: uid, id: 'upload-nohr', source: 'upload', source_ids: { upload: 'y' }, start_time: new Date(start.getTime() - 3 * 86400e3).toISOString(), name: 'Phone run', distance_m: Math.round(s2[s2.length - 1].d), duration_s: 2400, moving_s: 2400, streams: s2, updated_at: new Date().toISOString() };
  rows.activities.push(tenNov, noHr);
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  // ---- Overview ----
  await page.goto(`${APP}/activity/${tenNov.id}`); await page.waitForTimeout(2500);
  const tabs = await page.getByRole('tablist', { name: 'Run' }).getByRole('tab').allInnerTexts();
  check(tabs.join(' · ') === 'Overview · Intervals · Charts · Shoes', `four tabs: ${tabs.join(' · ')}`);
  check(await page.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected') === 'true', 'opens on Overview');
  const main = await page.locator('main').innerText();
  check(/06:50 · Garmin Forerunner 965/.test(main), 'the real start time and the watch: "… · 06:50 · Garmin Forerunner 965"');
  check(!/Logged by hand/.test(main), 'not "Logged by hand"');
  check(await page.locator('#run-title').inputValue() === "Ta' Xbiex easy run + strides", 'the title is shown and editable');
  const sum = await page.getByLabel('Run summary').innerText();
  check(/14\.\d\d\s*km/.test(sum) && /Avg pace/.test(sum) && /Total time/.test(sum) && /Avg heart rate/.test(sum), 'distance large, then avg pace, total time and heart rate');
  check(await page.locator('.verdict-card').isVisible(), 'the verdict card is there');
  check(!/shaded band is the target/.test(main), 'no rep is drawn against the easy-pace band');
  check(await page.locator('.route-map line').count() > 20, 'the route is coloured by pace');
  check(await page.getByText('Slower → faster').isVisible(), 'with a pace legend');
  await page.locator('#run-title').fill('Strides by the marina'); await page.locator('#run-title').press('Enter'); await page.waitForTimeout(1800);
  check(mock.state.tables.activities.find((a) => a.id === tenNov.id).name === 'Strides by the marina', 'renaming the run saves it');
  await page.screenshot({ path: path.join(OUT, 'overview.png') });

  // ---- Intervals ----
  await page.getByRole('tab', { name: 'Intervals' }).click(); await page.waitForTimeout(500);
  const iv = await page.locator('main').innerText();
  check(/6 × 30 s strides/.test(iv) && /found automatically/.test(iv), 'Intervals: "6 × 30 s strides", found automatically');
  const runRows = await page.locator('tr.iv-run').count();
  check(runRows === 6, `six reps in the table (${runRows})`);
  const wu = await page.locator('tr.iv-warmup').first().innerText();
  check(/6\.(4|5)\d/.test(wu), `the warm up is about 6.48 km (${wu.replace(/\s+/g, ' ')})`);
  check(await page.locator('tr.iv-recovery').count() === 5 && await page.locator('tr.iv-cooldown').count() === 1, 'five recoveries and a cool down');
  check(/0:3\d\.\d/.test(await page.locator('tr.iv-run').first().innerText()), 'rep times under a minute show tenths');
  check(/Even reps: only \d+ s\/km between fastest and slowest/.test(iv), 'a consistency note');
  check(await page.locator('.iv-bar').count() === 6, 'a bar per rep');
  await page.getByRole('button', { name: 'Run', exact: true }).click(); await page.waitForTimeout(200);
  check(await page.locator('tr.iv-row').count() === 6, 'the Run filter shows only the reps');
  await page.locator('tr.iv-run').first().click(); await page.waitForTimeout(200);
  check(/Avg HR \d+ · Max HR \d+ · Cadence \d+ spm/.test(await page.locator('tr.iv-detail').innerText()), 'tapping a row shows HR, cadence and elevation');
  await page.screenshot({ path: path.join(OUT, 'intervals.png'), fullPage: true });

  // ---- Charts ----
  await page.getByRole('tab', { name: 'Charts' }).click(); await page.waitForTimeout(500);
  const charts = await page.locator('.chart-card').count();
  check(charts === 4, `four charts: pace, heart rate, cadence, elevation (${charts})`);
  check(await page.locator('.chart-card').first().locator('rect').count() >= 6, 'the six reps are shaded');
  const svg = page.locator('.chart-card svg').first();
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.waitForTimeout(200);
  const bar = await page.locator('.scrub-bar').innerText();
  check(/\d+:\d\d/.test(bar) && /\/km/.test(bar) && /bpm/.test(bar) && /spm/.test(bar), `the scrub bar reads time, pace, heart rate and cadence (${bar.replace(/\s+/g, ' ')})`);
  check((await svg.getAttribute('aria-label')).startsWith('Pace: 6 fast reps'), 'each chart has a text summary');
  await page.screenshot({ path: path.join(OUT, 'charts.png'), fullPage: true });

  // ---- Shoes ----
  await page.getByRole('tab', { name: 'Shoes' }).click(); await page.waitForTimeout(500);
  const card = page.locator('.shoe-run-card');
  check(await card.isVisible() && /This run/.test(await card.innerText()), 'Shoes: the shoe for this run, marked "This run"');
  check(/\+14\.\d km from this run/.test(await card.innerText()) && /left/.test(await card.innerText()), 'with "+14.x km from this run" and the km left');
  check(/nearly worn out/.test(await page.locator('main').innerText()), 'a shoe over 85% of its life is flagged "nearly worn out"');
  const first = (await card.innerText()).split('\n')[0];
  await page.getByRole('button', { name: 'Use Race shoe for this run' }).click(); await page.waitForTimeout(1800);
  check(/Race shoe/.test(await page.locator('.shoe-run-card').innerText()), `changing the shoe moves the run to it (from ${first})`);
  check(mock.state.tables.activities.find((a) => a.id === tenNov.id).source_ids.shoe === 'race', 'and it is saved');
  await page.screenshot({ path: path.join(OUT, 'shoes.png'), fullPage: true });

  // ---- Tab remembered; keyboard ----
  await page.goto(`${APP}/activity/${noHr.id}`); await page.waitForTimeout(1800);
  check(await page.getByRole('tab', { name: 'Shoes' }).getAttribute('aria-selected') === 'true', 'the last tab is remembered in this session');
  await page.getByRole('tab', { name: 'Shoes' }).focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300);
  check(await page.getByRole('tab', { name: 'Charts' }).getAttribute('aria-selected') === 'true', 'arrow keys move between tabs');
  check(await page.getByText('No heart rate recorded').isVisible() && await page.locator('.chart-card').count() === 3, 'a run with no heart rate hides that chart and says so');
  await page.getByRole('tab', { name: 'Intervals' }).click(); await page.waitForTimeout(300);
  const sp = await page.locator('main').innerText();
  check(/Splits/.test(sp) && /1 km splits/.test(sp) && await page.locator('tr.iv-split').count() === 8, 'a run with no laps or reps shows 1 km splits');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
