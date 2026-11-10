// Training with the calendar merged in, and Readiness (update brief, sections 4 and 4A): today's session first with
// the readiness strip under it; the same score, word and sentence on Training, Coach and run feedback; factor effects
// that add up to the score; "Not logged" and "less accurate" without a check-in; with intervals planned on an Easy
// day, a "Swap to easy" link that changes the plan only when tapped and logs it; /calendar opens the month view.
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
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'ready@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const today = ymd(new Date());
  // Only an older run on record for today's checks: today's session stays open
  rows.activities = rows.activities.filter((r) => ymd(new Date(r.start_time)) !== today);
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1500); } }
  await page.waitForTimeout(1500);

  // Today: 6 x 1 km intervals; a poor morning and an easy run that felt very hard make it an Easy day
  const planRow = mock.state.tables.plans[mock.state.tables.plans.length - 1];
  const plan = planRow.data;
  let s = plan.sessions.find((x) => x.date === today);
  if (!s) { s = { ...plan.sessions[0], id: 'today-intervals', date: today }; plan.sessions.unshift(s); }
  Object.assign(s, { type: 'vo2max', title: 'Intervals: 6 x 1 km', focus: 'VO2 max', status: 'planned', distanceM: 16000, durationS: 4200, paceTarget: { minSPerKm: 190, maxSPerKm: 195 }, steps: [{ label: '6 x 1 km', detail: '', kind: 'work', pace: [190, 195] }] });
  delete s.completedActivityId;
  const prof = mock.state.tables.profiles.find((r) => r.user_id === uid);
  prof.data.profile = { ...prof.data.profile, checkins: [{ date: today, sleep: 1, legs: 1, energy: 1 }] };
  // A recent easy run that felt very hard (pain would make the plan itself switch to rest)
  const easyRun = [...rows.activities].sort((x, y) => y.start_time.localeCompare(x.start_time)).find((r) => r.distance_m >= 5000 && r.distance_m <= 12000 && r.moving_s / (r.distance_m / 1000) > 270);
  mock.state.tables.session_feedback.push({ user_id: uid, activity_id: easyRun.id, data: { activityId: easyRun.id, feel: 1, pain: [], loggedAt: new Date(Date.now() - 20 * 3600000).toISOString() } });
  await page.goto(`${APP}/about`); await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keyval-store'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);

  // Layout
  check(await page.getByRole('heading', { name: 'Training', exact: true }).isVisible(), 'the screen is called Training');
  const order = await page.evaluate(() => { const hero = document.querySelector('.hero'), strip = document.querySelector('.rd-strip'); return !!hero && !!strip && !!(hero.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING); });
  check(order, "today's session comes first, the readiness strip under it");
  check(await page.locator('.week-bar').isVisible() && /This week/.test(await page.locator('.week-bar').innerText()), 'the week bar shows this week');
  check(await page.getByRole('link', { name: 'Start session' }).isVisible() && await page.getByRole('button', { name: 'Swap' }).first().isVisible(), 'today card: Start session and Swap');
  check(await page.getByRole('heading', { name: 'Rest of the week' }).isVisible(), 'rest of the week');
  check(await page.locator('#month .mp-legend').isVisible() && /Done.*Planned.*Race.*Today/s.test(await page.locator('#month .mp-legend').innerText()), 'the month calendar with its legend');
  check(await page.getByRole('heading', { name: 'Plan changes' }).isVisible() && !(await page.locator('details.plan-more').getAttribute('open')), 'plan changes, collapsed');

  // The strip
  const strip = page.locator('.rd-strip').first();
  const st = await strip.innerText();
  const score = Number((st.match(/Readiness\s+(\d+)/) ?? [])[1]);
  check(score >= 34 && score <= 66 && /Easy day/.test(st), `an Easy day score (${score})`);
  check(/Intervals may feel hard today\./.test(st), 'the one line: "Intervals may feel hard today."');
  check(await strip.getByRole('button', { name: 'Swap to easy' }).isVisible(), 'a "Swap to easy" link');
  const line = 'Intervals may feel hard today.';

  // Breakdown
  await strip.getByRole('link').first().click(); await page.waitForURL(/\/readiness/); await page.waitForTimeout(800);
  const effects = await page.locator('.rd-effect').allInnerTexts();
  const total = 85 + effects.reduce((x, e) => x + Number(e.replace('−', '-').replace('+', '')), 0);
  check(total === score, `the factor effects add up to the score (85 ${effects.join(' ')} = ${total})`);
  check(await page.getByText('Effect from 85').isVisible(), 'the baseline is shown');
  check(await page.getByRole('button', { name: /^Swap to easy \d+ km$/ }).isVisible() && await page.getByRole('button', { name: 'Keep plan' }).isVisible(), 'breakdown: "Swap to easy N km" and "Keep plan"');
  check(await page.getByText(/Readiness suggests; it never changes your plan without you/).isVisible() && await page.getByText(/Race preparation/).isVisible(), 'the note, and Race preparation explained');

  // Same score on Coach
  await page.goto(`${APP}/coach`); await page.waitForTimeout(1200);
  const cs = await page.locator('.coach-ready').innerText();
  check(new RegExp(`Readiness\\s+${score}`).test(cs) && /Easy day/.test(cs) && cs.includes(line), 'Coach shows the same score, word and sentence');

  // Swap from the strip: suggestion first, nothing changes until tapped
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  await page.locator('.rd-strip').getByRole('button', { name: 'Swap to easy' }).click(); await page.waitForURL(/swap=easy/); await page.waitForTimeout(600);
  check(mock.state.tables.plans.at(-1).data.sessions.find((x) => x.id === s.id).type === 'vo2max', 'opening the swap changes nothing yet');
  await page.locator('.rd-suggest').getByRole('button', { name: /^Swap to easy/ }).click(); await page.waitForURL((u) => u.pathname === '/'); await page.waitForTimeout(2200);
  const after = mock.state.tables.plans.at(-1).data;
  check(after.sessions.find((x) => x.id === s.id).type === 'easy', 'tapping Swap makes today an easy run');
  check(after.changes.some((c) => /Intervals: 6 x 1 km .* → Easy run \(swapped\)/.test(c.summary)), 'and logs it under Plan changes');
  check(!(await page.locator('.rd-strip').getByRole('button', { name: /Swap to/ }).count()), 'readiness and the plan now agree: no swap link');

  // Check-in: without one, "Not logged" and less accurate
  prof.data.profile.checkins = [];
  await page.goto(`${APP}/about`); await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keyval-store'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(`${APP}/readiness`); await page.waitForTimeout(2000);
  check(await page.getByText('Not logged').isVisible() && await page.getByText(/Less accurate today/).isVisible(), 'no check-in: "Not logged" and "less accurate"');
  await page.getByRole('button', { name: 'Add morning check-in' }).click();
  for (const [g, v] of [['Sleep', 'Good'], ['Legs', 'Fresh'], ['Energy', 'Good']]) await page.getByRole('radiogroup', { name: g }).getByRole('radio', { name: v }).click();
  await page.getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(600);
  check(!(await page.getByText('Not logged').count()), 'after a check-in, sleep and legs count');

  // Redirects and the old Calendar's features
  await page.goto(`${APP}/calendar`); await page.waitForTimeout(1500);
  const top = await page.locator('#month').evaluate((el) => el.getBoundingClientRect().top);
  check(new URL(page.url()).pathname === '/' && top >= -5 && top < 300, `/calendar opens Training at the month view (${Math.round(top)} px)`);
  const raceRow = mock.state.tables.races[0];
  await page.goto(`${APP}/race/${raceRow.id}`); await page.waitForTimeout(1000);
  check(!(await page.getByText('Race readiness').count()), '"Race readiness" is gone from the race page');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
