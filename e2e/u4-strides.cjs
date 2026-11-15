// Update 4, task 2c: strides are their own group on a run's Intervals tab.
// A threshold session: 3 km warm-up, 4 × 20 s strides, 5 × 1 km, cool-down. The strides get their own group
// ("Strides ×4 · avg 20 s · … m · jog-back recovery") and chip, the interval set is "5 × 1 km" with its averages
// leaving the strides out, and any row can be marked by hand (⋯ → Mark as…), which is kept with the run.
// Usage: node e2e/u4-strides.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u4-strides'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

function stream(pieces) {
  const out = [{ t: 0, d: 0, hr: 120, cad: 170, alt: 8, lat: 35.899, lon: 14.494 }];
  let t = 0, d = 0;
  for (const [secs, pace] of pieces) for (let i = 0; i < secs; i++) {
    t++; d += 1000 / pace;
    out.push({ t, d: Math.round(d * 10) / 10, cad: pace < 240 ? 192 : 171, alt: 8, lat: 35.899 + Math.sin(d / 3000) * 0.012, lon: 14.494 + d / 111000 * 0.8, hr: Math.round(pace < 240 ? 165 + (i % 4) : 130) });
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
  const email = 'u4-strides@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(6, 50, 0, 0);
  const pieces = [[900, 300]];
  for (let i = 0; i < 4; i++) { pieces.push([20, 200]); pieces.push([60, 330]); }
  for (let i = 0; i < 5; i++) { pieces.push([208, 208]); if (i < 4) pieces.push([90, 340]); }
  pieces.push([600, 310]);
  const s = stream(pieces);
  const last = s[s.length - 1];
  const run = { user_id: uid, id: 'upload-threshold', source: 'upload', source_ids: { upload: 'x', device: 'Garmin Forerunner 965' }, start_time: start.toISOString(), name: 'Threshold session', distance_m: Math.round(last.d), duration_s: last.t, moving_s: last.t, avg_hr: 148, avg_cadence: 176, elev_gain_m: 12, streams: s, updated_at: new Date().toISOString() };
  rows.activities.push(run);
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  await page.goto(`${APP}/activity/${run.id}`); await page.waitForTimeout(2500);
  await page.getByRole('tab', { name: 'Intervals' }).click(); await page.waitForTimeout(600);
  const main = await page.locator('main').innerText();
  check(/5 × 1 km/.test(main), 'the interval set is "5 × 1 km" (the strides are not part of it)');
  const group = page.locator('.strides-group');
  check(/Strides ×4/.test(await group.innerText()) && /avg 2\d s · \d+ m · jog-back recovery/.test(await group.innerText()), `a strides group: "${(await group.innerText()).replace(/\s+/g, ' ').slice(0, 70)}"`);
  check(/left out of the interval averages, count and fastest rep/.test(await group.innerText()), 'it says strides are left out of the interval averages');
  const chips = await page.getByRole('group', { name: 'Show' }).getByRole('button').allInnerTexts();
  check(chips.join(' · ') === 'All · Warm-up · Strides 4 · Intervals 5 · Recovery · Cool-down', `chips: ${chips.join(' · ')}`);
  check(await page.locator('tr.iv-stride').count() === 4 && await page.locator('tr.iv-run').count() === 5, 'the table has 4 strides and 5 intervals');
  check(await page.locator('.iv-bar').count() === 5, 'the bars show the 5 intervals only');
  const avg = await page.locator('.iv-stats').innerText();
  check(/3:2\d/.test(avg), `the average rep pace is the 1 km pace, about 3:28/km, not pulled faster by the strides (${avg.replace(/\s+/g, ' ')})`);
  // Expand the strides group: each stride's time and pace
  await group.locator('.strides-head').click();
  check(await group.locator('.strides-list li').count() === 4 && /Stride 1/.test(await group.locator('.strides-list').innerText()), 'the group opens to each stride\'s time and pace');
  await page.getByRole('button', { name: 'Strides 4', exact: true }).click(); await page.waitForTimeout(200);
  check(await page.locator('tr.iv-row').count() === 4, 'the "Strides 4" chip shows only the strides');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.screenshot({ path: path.join(OUT, 'strides.png'), fullPage: true });

  // ---- Mark by hand: the first stride as an interval ----
  await page.getByRole('button', { name: 'Mark stride 1 as something else' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  const opts = await sheet.locator('.list .label').allInnerTexts();
  check(opts.join(' · ') === 'Warm-up · Stride · Interval · Recovery · Cool-down', `Mark as: ${opts.join(' · ')}`);
  await sheet.getByRole('button', { name: 'Interval', exact: true }).click(); await page.waitForTimeout(500);
  check(await page.locator('tr.iv-stride').count() === 3 && await page.locator('tr.iv-run').count() === 6, 'marking a stride as an interval regroups: 3 strides, 6 intervals');
  await page.waitForTimeout(2200);
  const saved = mock.state.tables.activities.find((a) => a.id === run.id);
  check(!!saved?.source_ids?.segs && Object.values(saved.source_ids.segs).includes('run'), 'the correction is saved with the run');
  await page.reload(); await page.waitForTimeout(2500);
  await page.getByRole('tab', { name: 'Intervals' }).click(); await page.waitForTimeout(600);
  check(await page.locator('tr.iv-stride').count() === 3, 'and is still there after a reload');
  // Back to automatic
  await page.locator('tr.iv-run').first().getByRole('button').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Back to automatic' }).click(); await page.waitForTimeout(500);
  check(await page.locator('tr.iv-stride').count() === 4 && await page.locator('tr.iv-run').count() === 5, '"Back to automatic" restores 4 strides and 5 intervals');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scrolling at phone width');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
