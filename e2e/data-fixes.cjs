// Data correctness (update brief, section 8): an impossible run (15 km in 75 seconds) is flagged on its page, left
// out of the totals and can be corrected; the Coach hides answers written before the full history loaded and
// folds answers from before the current plan; and it waits for the runs to load before answering.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const email = 'datafix@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  // A manual run typed with the time in seconds instead of minutes
  const bad = { id: 'manual-typo', user_id: uid, source: 'manual', source_ids: {}, start_time: new Date(Date.now() - 2 * 86400000).toISOString(), name: 'Afternoon run', distance_m: 15000, duration_s: 75, moving_s: 75, is_race: false, detail_score: 1, laps: null, streams: null, derived: { v: 1 } };
  mock.state.tables.activities.push(bad);
  // Coach answers: one from before the full history loaded, one from before the current plan
  const msg = (id, role, text, at) => ({ id, user_id: uid, data: { id, role, text, at, mode: 'real' }, created_at: at });
  mock.state.tables.coach_messages.push(
    msg('m1', 'runner', 'Am I on track for 3:14:30?', '2026-11-01T08:00:00.000Z'), msg('m2', 'coach', 'Your goal of 3:14:30 is within reach.', '2026-11-01T08:00:01.000Z'),
    msg('m3', 'runner', 'Why is Thursday easy?', new Date(Date.now() - 86400000).toISOString()), msg('m4', 'coach', 'Thursday is easy to recover from Wednesday.', new Date(Date.now() - 86400000 + 1000).toISOString()),
  );
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Train 6 days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }

  // 1) The impossible run
  await page.goto(`${APP}/activity/manual-typo`); await page.waitForTimeout(1200);
  const alert = page.getByRole('alert').filter({ hasText: "This run can't be right" });
  check(await alert.isVisible(), 'the run page says the run cannot be right');
  check(/world-record pace/.test(await alert.innerText()), 'and explains why (faster than world-record pace)');
  await page.goto(`${APP}/progress`); await page.waitForTimeout(1200);
  const prog = await page.locator('main').innerText();
  check(!/\b1:15\b/.test(prog), 'its 1:15 does not appear as a personal best on Progress');
  await page.goto(`${APP}/activity/manual-typo`); await page.waitForTimeout(800);
  await page.getByLabel('Correct the time').fill('1:15:00');
  await page.getByRole('button', { name: 'Save time' }).click(); await page.waitForTimeout(800);
  check(await page.getByRole('alert').filter({ hasText: "This run can't be right" }).count() === 0, 'correcting the time to 1:15:00 clears the warning');
  await page.waitForTimeout(1500);
  check(mock.state.tables.activities.find((r) => r.id === 'manual-typo')?.moving_s === 4500, 'the corrected time is saved (4500 s)');

  // 2) The Coach
  await page.goto(`${APP}/coach`); await page.waitForTimeout(1500);
  const main = await page.locator('main').innerText();
  check(!/3:14:30/.test(main), 'answers written before the full history loaded are not shown');
  const older = page.locator('details.older-answers');
  check(await older.isVisible() && /Older answers \(before your plan changed\)/.test(await older.innerText()), 'answers from before the current plan are folded under "Older answers"');
  check(!(await older.getAttribute('open')), 'and folded away (closed) by default');

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
