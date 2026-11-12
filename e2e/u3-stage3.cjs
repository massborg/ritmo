// Update 3, §7 and §8 (running sessions):
// - Goals: "I choose each day", a picker for each weekday with "+ Strength", guard rails that warn (never block),
//   "Let Ritmo adjust by phase"; saving rebuilds from tomorrow, today untouched, logged in Plan changes
// - Edit a session: 8 → 10 km shown as "+2 km", an impact check, that day only, "Your version", logged, Reset to plan;
//   the run is judged against the edited session
// Usage: node e2e/u3-stage3.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u3-stage3');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const dow = (s) => (new Date(`${s}T12:00:00`).getDay() + 6) % 7;

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'myweek@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.waitForTimeout(1500);
  const planRow = () => mock.state.tables.plans[mock.state.tables.plans.length - 1];
  const t0 = ymd(Date.now());
  const todayBefore = JSON.stringify(planRow().data.sessions.find((s) => s.date === t0) ?? null);

  // ---- 1. Choose your week ----
  await page.goto(`${APP}/goals`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'I choose each day' }).click();
  const pick = async (day, label) => page.locator(`select#wd-${day}`).selectOption({ label });
  // First a week that breaks the guard rails: intervals Monday, long run Tuesday, no rest day
  for (const [d, l] of [[0, 'Intervals'], [1, 'Long run'], [2, 'Easy'], [3, 'Tempo'], [4, 'Easy'], [5, 'Easy'], [6, 'Easy']]) await pick(d, l);
  await page.getByRole('button', { name: 'Add strength on Wednesday' }).click();
  const warn = await page.locator('.week-warnings').innerText().catch(() => '');
  check(/Two hard days in a row: Monday and Tuesday/.test(warn), 'warns about two hard days in a row');
  check(/long run the day after intervals/i.test(warn), 'warns about a long run the day after intervals');
  check(/Strength on Wednesday, the day before a hard run/.test(warn), 'warns about strength the day before a hard run');
  check(/No rest day this week/.test(warn) && /You can keep your choice/.test(warn), 'warns about no rest day, and says the choice can be kept');
  await page.locator('.week-chooser').screenshot({ path: path.join(OUT, 'week-warnings.png') });
  // Then a sensible week of the runner's own
  for (const [d, l] of [[0, 'Threshold'], [1, 'Strength'], [2, 'Easy'], [3, 'Intervals'], [4, 'Rest'], [5, 'Long run'], [6, 'Easy']]) await pick(d, l);
  await page.getByRole('button', { name: 'Add strength on Wednesday' }).click(); // Wednesday was ticked above: untick it
  await page.getByRole('button', { name: 'Add strength on Tuesday' }).isDisabled().then((x) => check(x, '"+ Strength" is not offered on a strength-only day'));
  await page.getByRole('button', { name: 'Add strength on Saturday' }).click();
  check(await page.locator('.week-warnings').count() === 0, 'a sensible week has no warnings');
  check(!(await page.getByRole('checkbox', { name: 'Let Ritmo adjust by phase' }).isChecked()), '"Let Ritmo adjust by phase" is off by default');
  await page.locator('.week-chooser').screenshot({ path: path.join(OUT, 'week-chosen.png') });
  await page.getByRole('button', { name: /Save and rebuild my plan/ }).click();
  await page.waitForURL(/rebuilt=1|\/$/, { timeout: 15000 }); await page.waitForTimeout(2500);
  const P = planRow().data;
  const nextMon = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - ((d.getDay() + 6) % 7)) % 7 || 7)); return ymd(d); })();
  const wk = P.sessions.filter((s) => s.date >= nextMon && s.date <= ymd(new Date(new Date(`${nextMon}T12:00:00`).getTime() + 6 * 86400e3)));
  const at = (d) => wk.find((s) => dow(s.date) === d);
  check(at(0)?.type === 'threshold' && at(1)?.title === 'Strength (no run)' && at(2)?.type === 'easy' && !at(2)?.strength && at(3)?.type === 'vo2max' && at(4)?.type === 'rest' && at(5)?.type === 'long' && !!at(5)?.strength,
    `next week follows the chosen days (${wk.map((s) => `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow(s.date)]} ${s.type}`).join(', ')})`);
  check(at(0)?.distanceM > 5000 && !!at(0)?.paceTarget, 'Ritmo still fills in distances and paces');
  check(JSON.stringify(P.sessions.find((s) => s.date === t0) ?? null) === todayBefore, 'today is untouched (the rebuild starts tomorrow)');
  check(P.changes.some((c) => /You chose your week: Mon threshold, Tue strength \(no run\), Wed easy, Thu intervals, Fri rest, Sat long run \+ strength, Sun easy/.test(c.summary)), 'Plan changes logs the week that was chosen');
  check(!!P.rebuild, 'a rebuild summary is shown');
  const saved = mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.training.week;
  check(saved?.mode === 'custom' && saved.days[1] === 'strength', 'the choice is saved with the profile');

  // ---- 2. Edit a session ----
  // An easy 8 km run tomorrow
  const tom = ymd(Date.now() + 86400e3);
  const s = planRow().data.sessions.find((x) => x.date === tom);
  Object.assign(s, { type: 'easy', title: 'Easy run', distanceM: 8000, durationS: 2640, steps: [{ kind: 'easy', label: '8 km easy', detail: '8 km at 5:10–5:40/km, Z2', km: 8, durationS: 2640, pace: [310, 340] }], paceTarget: { minSPerKm: 310, maxSPerKm: 340 }, status: 'planned' });
  delete s.edited; delete s.strength;
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/session/${s.id}`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: /Edit: Easy run/ });
  await sheet.waitFor();
  for (let i = 0; i < 4; i++) await sheet.getByRole('button', { name: 'Increase Distance (km)' }).click();
  const st = await sheet.innerText();
  check(/\+2 km\s*compared with the plan \(8 km\)/.test(st), 'the new distance shows as "+2 km"');
  check(/Fine for your week, \d+ of \d+ km planned|biggest week|is tomorrow/.test(st), `an impact check before saving (${(st.match(/(Fine for your week[^\n]*|[^\n]*biggest week[^\n]*|[^\n]*is tomorrow[^\n]*)/) || [''])[0]})`);
  await sheet.getByRole('button', { name: 'Easy + strides' }).click();
  await sheet.screenshot({ path: path.join(OUT, 'edit-sheet.png') });
  const otherBefore = JSON.stringify(planRow().data.sessions.filter((x) => x.date !== tom && x.date >= t0).map((x) => [x.id, x.distanceM]));
  await sheet.getByRole('button', { name: 'Save for this day' }).click(); await page.waitForTimeout(2500);
  const s2 = planRow().data.sessions.find((x) => x.id === s.id);
  check(s2.distanceM === 10000 && s2.steps.some((x) => x.kind === 'strides') && s2.edited?.original.distanceM === 8000, 'saved: 10 km easy with strides, the plan\'s version kept');
  check(JSON.stringify(planRow().data.sessions.filter((x) => x.date !== tom && x.date >= t0).map((x) => [x.id, x.distanceM])) === otherBefore, 'no other day is cut to make up for it');
  check(planRow().data.changes.some((c) => c.reason === 'edited' && /You changed \w+ \(.*\) to 10 km \(\+2 km\), easy run with strides/.test(c.summary)), 'Plan changes: "You changed … to 10 km (+2 km)"');
  check(await page.getByText('Your version').first().isVisible(), 'the session says "Your version"');
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  const rw = await page.locator('.rest-week').innerText().catch(() => '');
  check(/Easy run with strides\s*10 km/.test(rw), 'Training shows the edited session');
  // Reset to plan
  await page.goto(`${APP}/session/${s.id}`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Reset to plan' }).click(); await page.waitForTimeout(2000);
  const s3 = planRow().data.sessions.find((x) => x.id === s.id);
  check(s3.distanceM === 8000 && !s3.edited && s3.title === 'Easy run', 'Reset to plan brings back 8 km easy');
  check(planRow().data.changes.some((c) => /is back to the plan/.test(c.summary)), 'and the reset is logged');

  // ---- 3. The run is judged against the edited session ----
  const today = planRow().data.sessions.find((x) => x.date === t0) ?? (() => { const n = { ...s3, id: 'today-easy', date: t0 }; planRow().data.sessions.push(n); return n; })();
  Object.assign(today, { type: 'easy', title: 'Easy run', distanceM: 8000, durationS: 2640, steps: [{ kind: 'easy', label: '8 km easy', detail: '8 km at 5:10–5:40/km, Z2', km: 8, durationS: 2640, pace: [310, 340] }], paceTarget: { minSPerKm: 310, maxSPerKm: 340 }, status: 'planned' });
  delete today.edited;
  mock.state.tables.activities = mock.state.tables.activities.filter((r) => ymd(r.start_time) !== t0);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const sh2 = page.getByRole('dialog', { name: /Edit: Easy run/ });
  await sh2.locator('#ed-dist').fill('10');
  await sh2.getByRole('button', { name: 'Save for this day' }).click(); await page.waitForTimeout(2500);
  const start = new Date(); start.setHours(Math.max(0, start.getHours() - 2), 0, 0, 0);
  mock.state.tables.activities.push({ id: 'run-edited', user_id: uid, source: 'upload', source_ids: { upload: 'run-edited' }, start_time: start.toISOString(), name: 'Morning run', distance_m: 10050, duration_s: 3300, moving_s: 3280, avg_hr: 140, max_hr: 152, is_race: false, detail_score: 3, laps: null, streams: null, imported_at: new Date().toISOString() });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/activity/run-edited`); await page.waitForTimeout(3000);
  const verdict = await page.locator('.verdict-card').innerText().catch(() => '');
  check(/Distance as planned/.test(verdict) && /10\.1 of 10\.0 km|10\.0 of 10\.0 km/.test(verdict), `the run is judged against the edited 10 km (${(verdict.match(/[\d.]+ of [\d.]+ km/) || [''])[0]})`);

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
