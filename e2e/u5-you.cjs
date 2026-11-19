// Update 5, U8: the You page shows every kind of training.
// With a strength session, a bike and a HYROX simulation this month: All lists them and counts their time; the
// Strength filter shows sessions, volume and records; Other sport shows minutes per sport; Run is the old view.
// Usage: node e2e/u5-you.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u5-you'); fs.mkdirSync(OUT, { recursive: true });
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
  const email = 'u5-you@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  const prof = mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  const main = () => page.locator('main').innerText();
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // ---- A runner with nothing else logged: the running view, as before
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/you`); await page.waitForTimeout(3000);
  check((await page.locator('[aria-label="Kind of training"] .chip').allInnerTexts()).join('|') === 'All|Run|Strength|HYROX|Other sport', 'a filter: All, Run, Strength, HYROX, Other sport');
  check(await page.locator('[aria-label="Kind of training"] .chip[aria-pressed="true"]').innerText() === 'Run' && /Personal bests/.test(await main()), 'runs only so far: the running view, unchanged');

  // ---- Add a strength session, a bike and a HYROX half simulation this month
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return ymd(x); };
  const seg = (kind, key, n, ms, o = {}) => ({ kind, key, n, ms, i: 0, startMs: 0, endMs: ms, ...o });
  prof.log = [
    { id: 's1', kind: 'strength', date: d(1), at: new Date().toISOString(), minutes: 32, rpe: 6, strength: { title: 'Strength session 1', source: 'free', exercises: [{ id: 'goblet-squat', name: 'Goblet squat', sets: [{ reps: 12, load: 18 }, { reps: 12, load: 18 }] }, { id: 'plank', name: 'Plank', sets: [{ seconds: 90 }] }] } },
    { id: 'c1', kind: 'cross', date: d(0), at: new Date().toISOString(), sport: 'Bike', minutes: 45, rpe: 4 },
    { id: 'h1', kind: 'hyrox', date: d(2), at: new Date().toISOString(), minutes: 38, rpe: 8, hyrox: { id: 'h1', startedAt: new Date(Date.now() - 2 * 86400000).toISOString(), mode: 'half_front', division: 'men_open', title: 'HYROX half simulation', isRace: false, totalMs: 38 * 60000 + 12000,
      segments: [seg('run', 'run', 1, 270000, { distanceM: 1000 }), seg('station', 'skierg', 1, 250000, { distanceM: 1000 }), seg('run', 'run', 2, 280000, { distanceM: 1000 }), seg('station', 'sled_push', 2, 200000, { distanceM: 50 }), seg('run', 'run', 3, 290000, { distanceM: 1000 }), seg('station', 'sled_pull', 3, 300000, { distanceM: 50 }), seg('run', 'run', 4, 300000, { distanceM: 1000 }), seg('station', 'burpee_broad_jump', 4, 402000, { distanceM: 80 })] } },
  ];
  await page.evaluate(() => { indexedDB.deleteDatabase('keyval-store'); localStorage.removeItem('ritmo:you:sport'); });
  await page.goto(`${APP}/you`); await page.waitForTimeout(3000);

  // ---- All
  check(await page.locator('[aria-label="Kind of training"] .chip[aria-pressed="true"]').innerText() === 'All', 'with other training logged it opens on All');
  let text = await main();
  check(/Time trained/i.test(text) && /Sessions/i.test(text) && /Running/i.test(text), 'All: time trained, sessions and running distance');
  check(/Time by type/i.test(text) && /Run \d+:\d\d/.test(text) && /Strength 0:32 · 1/.test(text) && /HYROX 0:38 · 1/.test(text) && /Other sport 0:45 · 1/.test(text), 'a time-by-type bar counts the strength session, the HYROX simulation and the bike');
  const titles = (await page.locator('.feed-title').allInnerTexts()).join('|');
  check(/Bike/.test(titles) && /Strength session 1/.test(titles) && /HYROX half simulation/.test(titles), 'the list mixes runs with the bike, the strength session and the HYROX simulation');
  check(await noOverflow(), 'no sideways scroll at 390 px (All)');
  await page.screenshot({ path: path.join(OUT, '01-all.png'), fullPage: true });

  // ---- Strength
  await page.getByRole('button', { name: 'Strength', exact: true }).click(); await page.waitForTimeout(300);
  text = await main();
  check(/Sessions\s*1/i.test(text) && /0:32/.test(text) && /432 kg/.test(text), 'Strength: 1 session, 0:32, volume 432 kg');
  check(/Strength records/i.test(text) && /Goblet squat\s*18 kg × 12/.test(text) && /Plank\s*1:30/.test(text), 'records: best set per exercise and the longest hold');
  check(/Muscles worked/i.test(text) && /Quads 2 sets/.test(text) && /Sessions per week/i.test(text), 'muscles worked and sessions per week');
  check(await noOverflow(), 'no sideways scroll at 390 px (Strength)');
  await page.screenshot({ path: path.join(OUT, '02-strength.png'), fullPage: true });
  await page.locator('.feed-row').first().click(); await page.waitForURL(/\/log\/s1/); await page.waitForTimeout(400);
  check(/Goblet squat/.test(await main()) && await page.getByRole('button', { name: 'Delete' }).count() === 1, 'a strength session opens its page, with its exercises and Delete');
  await page.goBack(); await page.waitForTimeout(800);

  // ---- HYROX and Other sport
  await page.getByRole('button', { name: 'HYROX', exact: true }).click(); await page.waitForTimeout(300);
  text = await main();
  check(/Best 1 km\s*4:30/i.test(text) && /Station bests/i.test(text) && /SkiErg\s*4:10/.test(text) && /Average 1 km split 4:45/.test(text), 'HYROX: best 1 km, station bests and the average run split');
  await page.getByRole('button', { name: 'Other sport', exact: true }).click(); await page.waitForTimeout(300);
  text = await main();
  check(/By sport/i.test(text) && /Bike\s*45 min · 1 session · load \d+/.test(text), 'Other sport: minutes, sessions and load per sport');
  await page.screenshot({ path: path.join(OUT, '03-other.png'), fullPage: true });

  // ---- Run is the old view, and the choice is remembered
  await page.getByRole('button', { name: 'Run', exact: true }).click(); await page.waitForTimeout(300);
  check(/Personal bests/.test(await main()) && /Kilometres/i.test(await main()), 'Run: the running view');
  await page.reload(); await page.waitForTimeout(2500);
  check(await page.locator('[aria-label="Kind of training"] .chip[aria-pressed="true"]').innerText() === 'Run', 'the choice is remembered');

  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
