// Update 4, task 5: HYROX recording.
// - Activity → HYROX: Simulate / Station practice / Race day; division loads; treadmill or GPS; swaps; Roxzone timing
// - the live recorder: full screen, 16-segment strip, one big button, Roxzone taps, Undo, Pause, kept through a reload
// - the summary: total vs goal, running / stations / Roxzone, run-split bars with the slower runs named, station tags,
//   records; saved in the log (kind 'hyrox') with every segment
// - station practice with repeats, a swapped station (flagged, no record), a custom session saved for next time,
//   race day from official splits, and an unfinished session offered again
// Time is moved forward by the test (Date.now is offset), so a 75-minute simulation takes seconds.
// Usage: node e2e/u4-hyrox.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u4-hyrox'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ }
    // The test's clock: Date.now() runs ahead by a number of ms kept in sessionStorage (so it survives a reload)
    // Frozen at the first load, so real seconds never leak into the splits
    const real = Date.now.bind(Date);
    if (!sessionStorage.getItem('test:base')) sessionStorage.setItem('test:base', String(real()));
    Date.now = () => Number(sessionStorage.getItem('test:base')) + Number(sessionStorage.getItem('test:skew') || 0);
  });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const email = 'u4-hyrox@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  const profile = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const skip = async (s) => { await page.evaluate((ms) => sessionStorage.setItem('test:skew', String(Number(sessionStorage.getItem('test:skew') || 0) + ms)), s * 1000); await page.waitForTimeout(320); };
  const main = () => page.locator('.hx-main');
  const tap = async () => { await main().click(); await page.waitForTimeout(60); };
  const hyroxLog = () => (profile().log ?? []).filter((e) => e.kind === 'hyrox');

  // ---- Setup
  await page.goto(`${APP}/record`); await page.waitForTimeout(2500);
  check(/HYROX/.test(await page.locator('main').innerText()), 'the Activity hub has a HYROX card');
  await page.getByRole('link', { name: /HYROX/ }).click(); await page.waitForURL(/\/hyrox$/); await page.waitForTimeout(500);
  check((await page.getByRole('tab').allInnerTexts()).join('|') === 'Simulate|Station practice|Race day', 'tabs: Simulate / Station practice / Race day');
  let text = await page.locator('main').innerText();
  check(/Full simulation/.test(text) && /Half simulation: front/.test(text) && /Half simulation: back/.test(text) && /Custom/.test(text), 'full, half (front or back) and custom');
  await page.getByRole('button', { name: /^Division/ }).click();
  check(/Women Open[\s\S]*Sled push 102 kg · wall ball 4 kg to 2\.70 m/.test(await page.locator('[role=dialog]').innerText()) && /Men Pro[\s\S]*Sled push 202 kg/.test(await page.locator('[role=dialog]').innerText()), 'divisions list their loads (Women Open 102 kg sled, Men Pro 202 kg)');
  check(/Doubles Mixed/.test(await page.locator('[role=dialog]').innerText()) && /Relay/.test(await page.locator('[role=dialog]').innerText()), 'Doubles and Relay are there');
  await page.getByRole('button', { name: /^Women Open/ }).click(); await page.waitForTimeout(200);
  await page.getByRole('switch', { name: /Runs/ }).click();
  await page.getByRole('switch', { name: /Roxzone timing/ }).click(); await page.waitForTimeout(200);
  text = await page.locator('.hyrox-settings').innerText();
  check(/Women Open/.test(text) && /Treadmill or indoor: time only/.test(text) && /Roxzone timing\s*On/.test(text), 'division, treadmill runs and Roxzone timing are set');
  await page.locator('#hx-goal').pressSequentially('11500');
  check(await noOverflow(), 'no sideways scroll at 390 px (setup)');
  await shot('01-setup');

  // ---- The live recorder
  await page.getByRole('button', { name: 'Start simulation' }).click(); await page.waitForURL(/hyrox\/live/); await main().waitFor();
  check(await page.locator('.tabbar').count() === 0, 'the recorder is full screen (no tab bar)');
  check(await page.locator('.hx-strip span').count() === 16 && await page.locator('.hx-strip span.now').count() === 1, 'a 16-segment strip, with the current one marked');
  check((await main().innerText()) === 'Run done → SkiErg', 'one big button: "Run done → SkiErg"');
  check(/Treadmill/.test(await page.locator('.hyrox-live').innerText()), 'treadmill runs record time only');
  const runs = [242, 254, 281, 258, 262, 265, 292, 276], st = [252, 221, 295, 271, 290, 150, 330, 360], rox = 30;
  // Run 1, with a pause in it and an undo
  await skip(100);
  await page.getByRole('button', { name: 'Pause' }).click(); await skip(500);
  check(/1:40/.test(await page.getByTestId('hx-seg').innerText()) && /Paused/.test(await page.locator('.hyrox-live').innerText()) && await main().isDisabled(), 'Pause stops the clock (1:40 after 10 minutes paused)');
  await page.getByRole('button', { name: 'Resume' }).click();
  await skip(runs[0] - 100);
  await tap();
  check((await main().innerText()) === 'Start skierg' && /Roxzone/.test(await page.locator('.hx-card').innerText()), 'Roxzone timing: the first tap is arriving at the station');
  await page.getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(100);
  check((await main().innerText()) === 'Run done → SkiErg' && /4:02/.test(await page.getByTestId('hx-seg').innerText()), 'Undo takes the tap back: run 1 carries on (4:02)');
  await tap(); await skip(rox); await tap();
  check((await main().innerText()) === 'Station done → Run 2' && /Station 1/i.test(await page.locator('.hx-card').innerText()) && /1000 m/.test(await page.locator('.hx-card').innerText()), 'the second tap starts the station: SkiErg, 1000 m');
  await skip(st[0]); await tap();
  check(/Run 2/i.test(await page.locator('.hx-card').innerText()) && /skierg done 4:12/.test(await page.locator('.hx-progress').innerText()), 'station done → run 2, with the last split shown');
  // A reload in the middle: nothing is lost
  await skip(120);
  await page.reload(); await main().waitFor(); await page.waitForTimeout(400);
  check((await main().innerText()) === 'Run done → Sled push' && /2:00/.test(await page.getByTestId('hx-seg').innerText()) && /Segment 3 of 16/.test(await page.locator('.hx-progress').innerText()), 'after a reload the session is still there (segment 3, 2:00 into the run)');
  await skip(runs[1] - 120); await tap(); await skip(rox); await tap();
  check(/102 kg/.test(await page.locator('.hx-card').innerText()), "the sled push shows the division's load (102 kg)");
  check(await noOverflow(), 'no sideways scroll at 390 px (recorder)');
  await shot('02-live');
  await skip(st[1]); await tap();
  for (let i = 2; i < 8; i++) { await skip(runs[i]); await tap(); await skip(rox); await tap(); await skip(st[i]); await tap(); }
  const total = runs.reduce((a, x) => a + x, 0) + st.reduce((a, x) => a + x, 0) + 8 * rox;
  const fmt = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  check((await page.getByTestId('hx-total').innerText()) === fmt(total) && /Finished/i.test(await page.locator('.hyrox-live').innerText()), `after 16 segments it is finished: ${fmt(total)}`);
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Save session' }).click(); await page.waitForURL(/hyrox\/session\//); await page.waitForTimeout(600);

  // ---- The summary
  text = await page.locator('main').innerText();
  check((await page.getByTestId('hx-sum-total').innerText()) === fmt(total) && /Goal 1:15:00 · \+\d+:\d\d/.test(text), 'the total against the goal (1:15:00)');
  check(/Running\s*35:30/.test(text) && /Stations\s*36:09/.test(text) && /Roxzone\s*4:00/.test(text), 'running, stations and Roxzone totals (35:30 / 36:09 / 4:00)');
  check(await page.locator('.hx-bar').count() === 8 && await page.locator('.hx-bar.slow').count() === 2, '8 run-split bars, the 2 slower ones highlighted');
  check(/Runs after sled push and farmers carry were 25 s slower than your other runs/.test(text), 'the slower runs are named by the station before them');
  check(/First full simulation: 1:15:39/.test(text), 'records: the first full simulation');
  check(await noOverflow(), 'no sideways scroll at 390 px (summary)');
  await shot('03-summary');
  await page.waitForTimeout(2500);
  let e = hyroxLog().at(-1);
  check(e?.hyrox.mode === 'full' && e.hyrox.division === 'women_open' && e.hyrox.segments.length === 24 && e.hyrox.segments.filter((x) => x.kind === 'roxzone').length === 8 && e.rpe === 8 && e.minutes === 76, "saved in the log as 'hyrox' with 16 segments and 8 Roxzone transitions");
  const sled = e.hyrox.segments.find((x) => x.key === 'sled_push');
  check(sled.loadKg === 102 && Math.round(sled.ms / 1000) === 221 && e.hyrox.indoor === true, 'each segment keeps its time and load (sled push 102 kg, 3:41)');
  check(await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('keyval-store'); q.onsuccess = () => { const g = q.result.transaction('keyval').objectStore('keyval').getAllKeys(); g.onsuccess = () => r(!g.result.some((k) => String(k).startsWith('ritmo:hyrox:active'))); }; })), 'the on-device copy is cleared once saved');

  // ---- Station practice, twice, with a rest
  await page.goto(`${APP}/hyrox`); await page.waitForTimeout(1200);
  text = await page.locator('main').innerText();
  check(/Your records/.test(text) && /Best full simulation\s*1:15:39/.test(text) && /Best 1 km run split\s*4:02/.test(text) && /Your sessions/.test(text), 'the HYROX page lists your records and sessions');
  await page.getByRole('tab', { name: 'Station practice' }).click();
  await page.getByRole('button', { name: 'Wall balls', exact: true }).click();
  check(/100 reps · 4 kg to 2\.70 m[\s\S]*your best 6:00/.test(await page.locator('section[aria-label="Station practice"]').innerText()), 'station practice shows the work, the load and your best');
  await page.getByRole('button', { name: '2 times' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click(); await main().waitFor();
  check(/Your best/.test(await page.locator('.hx-card').innerText()) && /6:00/.test(await page.locator('.hx-target').innerText()), 'the recorder shows the time to beat (your best 6:00)');
  await skip(340); await tap();
  check((await main().innerText()) === 'Rest over → Wall balls', 'a rest between repeats');
  await skip(90); await tap(); await skip(365); await tap();
  await page.getByRole('button', { name: 'Save session' }).click(); await page.waitForURL(/hyrox\/session\//); await page.waitForTimeout(500);
  text = await page.locator('main').innerText();
  check(/−20 s/.test(text) && /\+5 s/.test(text) && /Best wall balls: 5:40 \(was 6:00\)/.test(text) && /Rest\s*1:30/.test(text), 'each repeat against the best before (−20 s, +5 s), and the new record');
  await shot('04-practice');
  await page.waitForTimeout(2300); // saves are debounced

  // ---- A swapped station: flagged, and no record
  await page.goto(`${APP}/hyrox`); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Missing equipment/ }).click();
  await page.locator('#hx-swap-sled_push').selectOption('prowler'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(/1 swap/.test(await page.locator('.hyrox-settings').innerText()), 'a swap for missing equipment is set (no sled → heavy prowler push)');
  await page.getByRole('switch', { name: /Roxzone timing/ }).click();
  await page.getByRole('button', { name: /Half simulation: front/ }).click();
  await page.getByRole('button', { name: 'Start simulation' }).click(); await main().waitFor();
  check(await page.locator('.hx-strip span').count() === 8, 'a half simulation has 8 segments');
  await skip(250); await tap(); await skip(240); await tap(); await skip(250); await tap();
  check(/Heavy prowler push/.test(await page.locator('.hx-card').innerText()) && /swapped/i.test(await page.locator('.hx-card').innerText()) && await page.locator('.hx-target').count() === 0, 'the swapped station is shown as swapped, with no target');
  await skip(60); await tap();
  for (const s of [250, 280, 250, 260]) { await skip(s); await tap(); }
  await page.getByRole('button', { name: 'Save session' }).click(); await page.waitForURL(/hyrox\/session\//); await page.waitForTimeout(2500);
  text = await page.locator('main').innerText();
  check(/Swapped: not counted for records/.test(text) && !/Best heavy prowler/.test(text) && /Roxzone was not timed/.test(text), 'the summary marks the swap and says Roxzone was not timed');
  e = hyroxLog().at(-1);
  check(e.hyrox.mode === 'half_front' && e.hyrox.segments.find((x) => x.key === 'sled_push').swapped === 'Heavy prowler push', 'the swap is stored on the segment');
  await page.goto(`${APP}/hyrox`); await page.waitForTimeout(1000);
  check(/Sled push\s*3:41/.test(await page.locator('section[aria-labelledby="hx-rec"]').innerText()), 'the sled push record is still the real one (3:41), not the 1:00 swap');

  // ---- Custom, saved for next time
  await page.getByRole('button', { name: /^Custom/ }).click();
  check(await page.locator('.build-row').count() === 8, 'custom starts from the front half, to change');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Remove segment 3' }).click();
  await page.getByRole('button', { name: '+ Wall balls' }).click();
  await page.getByLabel('Reps for segment 3').fill('50');
  await page.getByRole('button', { name: 'Move segment 3 up' }).click();
  await page.locator('#hx-name').fill('Wall ball sandwich');
  await page.getByRole('button', { name: 'Save for next time' }).click(); await page.waitForTimeout(2500);
  const tpl = profile().hyrox.templates?.[0];
  check(tpl?.name === 'Wall ball sandwich' && tpl.segments.map((x) => x.key).join(',') === 'run,wall_balls,skierg' && tpl.segments[1].reps === 50, 'a custom session (order, reps) is saved for next time');
  await shot('05-custom');
  await page.getByRole('button', { name: 'Start session' }).click(); await main().waitFor();
  check((await main().innerText()) === 'Run done → Wall balls', 'the custom session runs in its own order');
  // Left unfinished: offered again
  await skip(100); await tap();
  await page.goto(`${APP}/hyrox`); await page.waitForTimeout(1000);
  check(/unfinished session is saved on this device[\s\S]*1 of 3 segments done/.test(await page.locator('main').innerText()), 'an unfinished session is offered again');
  await page.getByRole('link', { name: 'Carry on' }).click(); await main().waitFor();
  check((await main().innerText()) === 'Station done → SkiErg', '"Carry on" opens it where it was');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'End without saving' }).click(); await page.waitForURL(/\/hyrox$/); await page.waitForTimeout(600);
  check(!/unfinished session/.test(await page.locator('main').innerText()), 'ended without saving: nothing is left behind');

  // ---- Race day: official splits
  await page.getByRole('tab', { name: 'Race day' }).click();
  for (let i = 1; i <= 8; i++) { await page.locator(`#hx-run-${i}`).pressSequentially('430'); await page.locator(`#hx-st-${i}`).pressSequentially('400'); }
  await page.locator('#hx-rox').pressSequentially('612');
  check(await noOverflow(), 'no sideways scroll at 390 px (race day)');
  await shot('06-race-day');
  await page.getByRole('button', { name: 'Save race result' }).click(); await page.waitForURL(/hyrox\/session\//); await page.waitForTimeout(2500);
  text = await page.locator('main').innerText();
  check((await page.getByTestId('hx-sum-total').innerText()) === '1:14:12' && /official splits/.test(text) && /Roxzone\s*6:12/.test(text) && /First race result: 1:14:12/.test(text), 'a race entered from official splits: 1:14:12, Roxzone 6:12, a race record');
  e = hyroxLog().at(-1);
  check(e.hyrox.isRace === true && e.hyrox.entered === true && e.hyrox.mode === 'race', 'stored as a race');
  await page.getByRole('button', { name: 'Delete' }).click(); await page.waitForURL(/\/hyrox$/); await page.waitForTimeout(2500);
  check(hyroxLog().length === 3, `a session can be deleted (${hyroxLog().map((x) => x.hyrox.mode).join(',')})`);
  check(/active/.test(await page.locator('.tabbar a').nth(2).getAttribute('class')), 'HYROX is under the Activity tab');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
