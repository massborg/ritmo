// Run feedback screen (update brief 7.3 and 7.4): intervals planned for today, an easy 16.29 km run done instead.
// The page shows the swap banner, four headline stats, a verdict checklist judged as an easy run, the race estimate
// "Not changed", the plan line, no "start slower" advice, and the max heart rate check when the settings look low.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: process.env.SHOTS ? 2 : 1 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = 'feedback@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  rows.profiles[0].data.profile = { ...rows.profiles[0].data.profile, maxHr: 175, restHr: 44 };
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Train 6 days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.waitForTimeout(1500);

  // Make today's session 6 x 1 km intervals, then add the easy run done instead
  const planRow = mock.state.tables.plans[mock.state.tables.plans.length - 1];
  check(!!planRow, 'a plan was saved');
  const today = ymd(new Date());
  const plan = planRow.data;
  let s = plan.sessions.find((x) => x.date === today);
  if (!s) { s = { ...plan.sessions[0], id: 'today-intervals', date: today }; plan.sessions.unshift(s); }
  Object.assign(s, { type: 'vo2max', title: 'Intervals: 6 x 1 km', focus: 'VO2 max', status: 'planned', distanceM: 16000, durationS: 4200,
    paceTarget: { minSPerKm: 190, maxSPerKm: 195 }, steps: [{ label: '6 x 1 km', detail: '', kind: 'work', pace: [190, 195] }] });
  delete s.completedActivityId; delete s.swappedTo;
  // Only this run on today's date (the fixture has a session today too)
  mock.state.tables.activities = mock.state.tables.activities.filter((r) => ymd(new Date(r.start_time)) !== today);
  const midnight = new Date(); midnight.setHours(0, 1, 0, 0);
  const start = new Date(Math.max(midnight.getTime(), Date.now() - 2 * 3600000));
  mock.state.tables.activities.push({ id: 'easy-swap', user_id: uid, source: 'upload', source_ids: {}, start_time: start.toISOString(), name: 'Morning run',
    distance_m: 16290, duration_s: 5500, moving_s: 5400, elev_gain_m: 40, avg_hr: 144, max_hr: 177, avg_cadence: 168, is_race: false, detail_score: 2, laps: null, streams: null });
  // Drop the device cache so the app reads the edited plan from the server
  await page.goto(`${APP}/about`); await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keyval-store'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(`${APP}/activity/easy-swap`); await page.waitForTimeout(2500);
  const main = await page.locator('main').innerText();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/feedback-giorno.png`, fullPage: true });
  if (process.env.DEBUG) { const pr = mock.state.tables.plans; console.log('plans', pr.length, JSON.stringify(pr[pr.length-1].data.sessions.filter((x) => x.date === today))); console.log(main.slice(0, 600)); }

  check(/Swapped session/.test(main) && /Planned intervals: 6 x 1 km, you ran it easy\. Ritmo judges it as an easy run\./.test(main), 'the swap banner explains the run is judged as an easy run');
  check(/(Easy|Long) run · swapped from intervals/.test(main), 'labelled "… run · swapped from intervals" (the run that was actually run)');
  const summary = page.getByLabel('Run summary');
  const sum = await summary.innerText();
  check(/Distance/.test(sum) && /Pace/.test(sum) && /Time/.test(sum) && /Avg heart rate/.test(sum), 'four headline stats: distance, pace, time, average heart rate');
  const grid = await page.locator('.stat-2x2').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  check(grid === 2, 'the stats sit in a 2 x 2 grid');
  check(/Cadence 168 spm · Climb 40 m/.test(sum), 'cadence and climb are still shown');
  const verdict = await page.locator('.verdict-card').innerText();
  check(/(easy|long) run/i.test(verdict.split('\n')[0]), `the verdict title is about an easy run ("${verdict.split('\n')[0]}")`);
  check(/Pace in your easy range|Slower than your easy range is fine/.test(verdict), 'the checklist judges pace against the easy range');
  check(/Distance as planned/.test(verdict) && /16\.3 of 16\.0 km/.test(verdict), 'distance as planned: 16.3 of 16.0 km');
  check(!/Pace accuracy|Session score|3:1\d/.test(verdict), 'no interval pace target or score in the verdict');
  check(!/start (the first third )?slower/i.test(main), 'no "start slower" advice anywhere');
  const racePlan = await page.getByLabel('Race and plan').innerText();
  check(/prediction/.test(racePlan) && /Not changed\./.test(racePlan) && /Easy runs don't move your race estimate/.test(racePlan), 'race prediction: "Not changed. Easy runs don\'t move your race estimate"');
  check(/won't be added back/.test(racePlan), `the plan line says the intervals won't be added back`);
  const hrCard = page.locator('.settings-check');
  check(await hrCard.isVisible() && /Check your max heart rate/.test(await hrCard.innerText()) && /set to 175, so 144 bpm counts as Z3 \(tempo\)/.test(await hrCard.innerText()), 'the max heart rate card: "set to 175, so 144 bpm counts as Z3 (tempo)"');
  check(await page.getByRole('button', { name: 'Share this run' }).isVisible(), 'the share button sits in the header');
  check(await page.locator('.check-list li').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().right <= 390)), 'checklist fits the 390 px screen');
  // Existing sections are still there
  check(await page.getByRole('heading', { name: 'How did it feel?' }).isVisible(), '"How did it feel?" is still on the page');
  check(await page.getByRole('heading', { name: 'Fix this run' }).isVisible(), '"Fix this run" is still on the page');
  await page.locator('summary', { hasText: 'Show full analysis' }).click(); await page.waitForTimeout(300);
  check(await page.getByRole('heading', { name: 'Session score' }).isVisible() && await page.getByRole('heading', { name: 'What went well' }).isVisible(), 'the full analysis keeps the session score and what went well');

  // Update heart rate opens Profile at the heart rate section
  await hrCard.getByRole('link', { name: 'Update heart rate' }).click();
  await page.waitForURL(/\/profile#hr/); await page.waitForTimeout(1200);
  const top = await page.locator('#hr').evaluate((el) => el.getBoundingClientRect().top);
  check(top >= 0 && top < 400, `Profile opens at "Heart rate and fitness" (heading at ${Math.round(top)} px)`);
  check(await page.getByText('Your zones may be set too low').isVisible(), 'Profile explains the zones may be set too low');

  // Dark and high-contrast themes render the new cards
  for (const theme of ['notte', 'sole']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.goto(`${APP}/activity/easy-swap`); await page.waitForTimeout(1200);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/feedback-${theme}.png`, fullPage: false });
    const bg = await page.locator('.swap-banner').evaluate((el) => getComputedStyle(el).backgroundColor);
    check(!!bg && bg !== 'rgba(0, 0, 0, 0)', `${theme}: the swap banner has a background (${bg})`);
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
