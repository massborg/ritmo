// Update 4, task 7: smaller HYROX improvements.
// - You → Insights: a HYROX race predictor (running, stations, Roxzone; which stations are the athlete's own times)
// - a run from a watch with 16 or more laps offers "Map laps to HYROX segments"
// - a HYROX race-day screen: a pace for each run, station targets and tips, a warm-up, then split entry
// (What the Coach is told is covered by unit tests: src/hyrox/predict.test.ts.)
// Usage: node e2e/u4-task7.cjs (app on :4173). Made-up athlete only.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u4-task7'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'u4-task7@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  // A HYROX athlete with a goal, one full simulation recorded, and a watch run with 16 laps
  const prof = rows.profiles[0].data.profile;
  const raceDate = new Date(); raceDate.setDate(raceDate.getDate() + 5);
  const simDay = new Date(); simDay.setDate(simDay.getDate() - 10); simDay.setHours(9, 0, 0, 0);
  const runs = [242, 254, 281, 258, 262, 265, 292, 276], st = [252, 221, 295, 271, 290, 150, 330, 360];
  const KEYS = ['skierg', 'sled_push', 'sled_pull', 'burpee_broad_jump', 'row', 'farmers_carry', 'sandbag_lunges', 'wall_balls'];
  const segments = []; let at = 0;
  for (let i = 0; i < 8; i++) {
    segments.push({ i: segments.length, kind: 'run', key: 'run', n: i + 1, distanceM: 1000, startMs: at, endMs: at + runs[i] * 1000, ms: runs[i] * 1000 }); at += runs[i] * 1000;
    segments.push({ i: segments.length, kind: 'station', key: KEYS[i], n: i + 1, ...(i === 7 ? { reps: 100 } : { distanceM: [1000, 50, 50, 80, 1000, 200, 100][i] }), startMs: at, endMs: at + st[i] * 1000, ms: st[i] * 1000 }); at += st[i] * 1000;
  }
  Object.assign(prof, { athleteType: 'hyrox', hyrox: { division: 'women_open', goalS: 4500, raceDate: ymd(raceDate), hardest: ['sled_pull', 'wall_balls'], equipment: ['skierg', 'rower'], targets: { wall_balls: 390 } },
    log: [...(prof.log ?? []), { id: 'sim1', date: ymd(simDay), kind: 'hyrox', minutes: 72, rpe: 8, at: simDay.toISOString(), hyrox: { id: 'sim1', startedAt: simDay.toISOString(), mode: 'full', division: 'women_open', title: 'HYROX full simulation · Women Open', segments, totalMs: at, isRace: false, indoor: true } }] });
  const start = new Date(); start.setDate(start.getDate() - 3); start.setHours(8, 0, 0, 0);
  const laps = []; let ls = 0;
  for (let i = 0; i < 16; i++) { const d = i % 2 === 0 ? 268 + (i % 4) * 3 : 230 + i * 4; laps.push({ index: i + 1, startS: ls, durationS: d, distanceM: i % 2 === 0 ? 1004 : 45 + i }); ls += d; }
  const watch = { ...rows.activities[0], id: 'upload-hyrox-watch', source: 'upload', source_ids: { upload: 'hx', device: 'Garmin Forerunner 965' }, start_time: start.toISOString(), name: 'Morning HYROX', distance_m: 8600, duration_s: ls, moving_s: ls, laps, streams: null, is_race: false };
  rows.activities.push(watch);
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  const profile = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // ---- The predictor on Insights
  await page.goto(`${APP}/you/insights`); await page.waitForTimeout(3000);
  const card = page.locator('section[aria-labelledby="hx-pred"]');
  let text = await card.innerText();
  check(/HYROX prediction/.test(text) && /^1:\d\d:\d\d$/.test(await card.getByTestId('hx-pred-total').innerText()), `You → Insights has a HYROX prediction (${await card.getByTestId('hx-pred-total').innerText()})`);
  check(/Based on your full simulation on \d+ \w+, your running fitness, your own time on 8 of 8 stations/.test(text) && /Good confidence/.test(text), 'it says what it is based on, and how sure it is');
  check(/Running\s*\d\d:\d\d/.test(text) && /Stations\s*36:09/.test(text) && /Roxzone/.test(text) && /8 of 8 from your times/.test(text), 'running, stations (her own 36:09) and Roxzone');
  check(await card.locator('.hx-pred-stations li').count() === 8 && /Sled pull\s*4:55\s*yours/.test(text), 'each station with where its time comes from');
  check(/(inside|outside) your goal of 1:15:00/.test(text), 'and how it compares with the goal');
  check(await noOverflow(), 'no sideways scroll at 390 px (Insights)');
  await card.screenshot({ path: path.join(OUT, '01-predictor.png') });

  // ---- The race-day screen
  await card.getByRole('link', { name: 'Race-day plan' }).click(); await page.waitForURL(/hyrox\/race-day/); await page.waitForTimeout(600);
  text = await page.locator('main').innerText();
  check(/HYROX race day/.test(text) && /Women Open/.test(text) && /5 days to go/.test(text), 'race day: division, date and days to go');
  check(/Your plan for 1:15:00/.test(text) && await page.locator('.pace-card').count() === 8, 'a plan for the goal, with a card for each run and its station');
  const first = await page.locator('.pace-card').first().innerText(), second = await page.locator('.pace-card').nth(1).innerText();
  check(/Run 1 · 1 km\s*4:\d\d\s*\/km/.test(first) && /Hold back/.test(first) && /SkiErg/.test(first), 'run 1 has its pace and "hold back", then the SkiErg');
  check(/Sled push/.test(second) && /50 m · 102 kg/.test(second), "each station shows its work and the division's load");
  check(/Wall balls\s*6:30/.test(await page.locator('.pace-card').nth(7).innerText()), 'station targets come from the goal (wall balls 6:30)');
  check(/Warm-up/.test(text) && await page.locator('.hrd-warm li').count() === 5, 'a warm-up in 5 steps');
  check(await noOverflow(), 'no sideways scroll at 390 px (race day)');
  await shot('02-race-day');
  await page.getByRole('link', { name: 'Enter my splits' }).click(); await page.waitForURL(/hyrox\?tab=race/); await page.waitForTimeout(500);
  check(await page.getByRole('tab', { name: 'Race day' }).getAttribute('aria-selected') === 'true' && await page.locator('#hx-run-1').count() === 1, '"Enter my splits" opens the split entry');

  // ---- Laps from a watch
  await page.goto(`${APP}/activity/${watch.id}`); await page.waitForTimeout(2500);
  let lapCard = page.locator('section[aria-labelledby="hx-laps"]');
  if (!(await lapCard.count())) for (const t of await page.getByRole('tab').all()) { await t.click(); await page.waitForTimeout(300); if (await lapCard.count()) break; }
  check(await lapCard.count() === 1 && /16 laps/.test(await lapCard.innerText()), 'a run with 16 laps asks "Was this a HYROX session?"');
  await lapCard.getByRole('button', { name: 'Map laps to HYROX segments' }).click();
  const sheet = page.locator('[role=dialog]');
  check(await sheet.locator('.lap-map li').count() === 16 && /Run 1\s*4:28/.test(await sheet.innerText()) && /8 Wall balls/.test(await sheet.innerText()), 'the laps are shown as run 1, station 1 … to check');
  await shot('03-map-laps');
  await sheet.getByRole('button', { name: 'Save as a HYROX session' }).click(); await page.waitForURL(/hyrox\/session\/laps-/); await page.waitForTimeout(2800);
  text = await page.locator('main').innerText();
  check(/HYROX full simulation · Women Open/.test(text) && await page.locator('.hx-bar').count() === 8, 'saved: the HYROX summary with 8 run splits');
  const e = (profile().log ?? []).find((x) => x.kind === 'hyrox' && x.hyrox.id === `laps-${watch.id}`);
  check(e?.hyrox.segments.length === 16 && e.hyrox.segments[1].key === 'skierg' && e.hyrox.segments[0].gpsM === 1004, 'stored with its 16 segments (runs keep the watch distance)');
  await page.goto(`${APP}/activity/${watch.id}`); await page.waitForTimeout(2500);
  lapCard = page.locator('section[aria-labelledby="hx-laps"]');
  if (!(await lapCard.count())) for (const t of await page.getByRole('tab').all()) { await t.click(); await page.waitForTimeout(300); if (await lapCard.count()) break; }
  check(await lapCard.getByRole('button', { name: 'See the HYROX summary' }).count() === 1, 'the run now links to its HYROX summary, not a second mapping');
  // A normal run (few laps) is not asked
  const other = rows.activities.find((a) => a.id !== watch.id);
  await page.goto(`${APP}/activity/${other.id}`); await page.waitForTimeout(2000);
  check(await page.locator('section[aria-labelledby="hx-laps"]').count() === 0, 'an ordinary run is not asked');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
