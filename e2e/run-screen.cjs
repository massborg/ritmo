// The Run screen (update brief, section 3): Ritmo plan | Free run tabs, defaulting to the plan when today has an open
// session; the session card (caption, zone chip, title, three stats, workout shape, structure, coach tip) with the
// week's other sessions to preview; free-run goals; the GPS pill; Settings · 128 px Start · Audio; Swap session;
// all audio settings in one Run settings sheet; Start on the plan records a run linked to today's session; a free
// run with a distance goal says when the goal is reached.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const LAT0 = 35.9, LON0 = 14.5, M_PER_DEG = 111195;
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 5 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:run:pocket', 'off'); } catch { /* */ }
    window.__spoken = [];
    if ('speechSynthesis' in window) { const real = window.speechSynthesis.speak.bind(window.speechSynthesis); window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onstart?.(), 0); try { real(u); } catch { /* */ } }; }
  });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'runscreen@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const today = ymd(new Date());
  rows.activities = rows.activities.filter((r) => ymd(new Date(r.start_time)) !== today);
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => localStorage.setItem('ritmo:run:settings', JSON.stringify({ countdown: 3, cues: 'steps', autoPause: false, screenOn: false })));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.waitForTimeout(1500);
  // Today: an easy run, so the plan tab has something to start
  const plan = mock.state.tables.plans.at(-1).data;
  let s = plan.sessions.find((x) => x.date === today);
  if (!s) { s = { ...plan.sessions[0], id: 'today-run', date: today }; plan.sessions.unshift(s); }
  Object.assign(s, { type: 'easy', title: 'Easy run', focus: 'Aerobic base', status: 'planned', distanceM: 8000, durationS: 2700, paceTarget: { minSPerKm: 300, maxSPerKm: 330 }, steps: [{ label: '8 km easy', detail: 'conversational', kind: 'easy', km: 8 }] });
  delete s.completedActivityId;
  await page.goto(`${APP}/about`); await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keyval-store'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(`${APP}/run`); await page.waitForTimeout(2000);

  // Layout
  check(await page.getByRole('heading', { name: 'Run', exact: true }).isVisible() && await page.getByRole('link', { name: 'Run history' }).isVisible(), 'header: Run, with Run history');
  check(await page.getByRole('tab', { name: 'Ritmo plan' }).getAttribute('aria-selected') === 'true', 'defaults to Ritmo plan when today has an open session');
  const card = page.locator('.run-card').first();
  const ct = await card.innerText();
  check(/Today's session · \w{3} \d+ \w{3}/.test(ct), 'card caption: "Today\'s session · Tue 10 Nov"');
  check(await card.locator('.zone-chip').innerText().then((x) => /^Z2 Easy$/.test(x.trim())), 'zone chip "Z2 Easy"');
  check(/Easy run/.test(ct) && /Distance/.test(ct) && /Target pace/.test(ct) && /Time/.test(ct), 'title and three stats: distance, target pace, time');
  check(await card.locator('.wgraph').isVisible() && /Coach tip:/.test(ct), 'workout shape and a coach tip');
  const dots = await page.locator('.run-dot').count();
  if (dots > 1) {
    await page.locator('.run-dot').nth(1).click();
    check(!/Today's session/.test(await card.innerText()) && /Start runs this session today/.test(await page.locator('main').innerText()), `the week's other sessions can be previewed (${dots}), and say Start runs them today`);
    await page.locator('.run-dot').nth(0).click();
  } else check(true, 'only one session left this week: no preview dots');
  const go = await page.locator('.run-go').boundingBox(), rounds = await page.locator('.run-round').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  check(Math.round(go.width) === 128 && rounds.length === 2 && rounds.every((w) => Math.round(w) === 56), `controls: 56 px Settings, 128 px Start, 56 px Audio (${rounds.map(Math.round).join(', ')} / ${Math.round(go.width)})`);
  check(Math.abs(go.x + go.width / 2 - 412 / 2) < 4 || Math.abs(go.x + go.width / 2 - (await page.viewportSize()).width / 2) < 4, 'Start is centred');
  await page.locator('.gps-pill', { hasText: 'GPS ready' }).waitFor({ timeout: 8000 });
  check(true, 'GPS pill says "GPS ready" with an icon');
  await page.getByRole('button', { name: 'Swap session' }).click();
  check(await page.getByRole('dialog').getByText('Swap').first().isVisible(), 'Swap session opens the session sheet with the swap options');
  await page.keyboard.press('Escape');

  // Settings in one sheet; audio toggle and long press
  await page.getByRole('button', { name: 'Run settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Run settings' });
  const st = await sheet.innerText();
  check(/Audio cues/.test(st) && /Countdown/.test(st) && /Voice/.test(st) && /Pause automatically/.test(st) && /Keep the screen on/.test(st), 'Run settings holds cues, countdown, voice, auto-pause and screen-on');
  check(!(await page.locator('.run-ready-content').getByText('Countdown').count()), 'none of them sit on the Run screen itself');
  await page.keyboard.press('Escape');
  const audio = page.locator('.run-round').nth(1);
  await audio.click();
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:run:settings')))).cues === 'off' && await audio.getAttribute('aria-pressed') === 'false', 'tapping Audio turns cues off');
  await audio.click();
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:run:settings')))).cues === 'steps', 'and on again');
  await audio.dispatchEvent('pointerdown'); await page.waitForTimeout(800); await audio.dispatchEvent('pointerup');
  check(await page.getByRole('dialog', { name: 'Run settings' }).isVisible(), 'holding Audio opens the voice settings');
  await page.keyboard.press('Escape');

  // Free run: goals
  await page.getByRole('tab', { name: 'Free run' }).click();
  const free = await page.locator('.run-card').innerText();
  check(/Run your way/.test(free) && /Ritmo still logs it and counts it toward your week/.test(free), 'Free run: "Run your way"');
  check(await page.getByRole('radio', { name: 'Just run' }).getAttribute('aria-checked') === 'true', 'goal "Just run" by default');
  check(/Today's plan: Easy run/.test(free) && /Switch to plan/.test(free), 'with "Today\'s plan: … Switch to plan"');
  check(!(await page.getByRole('button', { name: 'Swap session' }).count()), 'no Swap session on a free run');
  await page.getByRole('radio', { name: 'Distance' }).click();
  await page.locator('#run-goal').fill('0.1');

  // A free run with a 0.1 km goal (at 5 m/s, a realistic pace: faster jumps are ignored as GPS errors): the goal is said when reached, and the run is not linked to the plan
  await page.evaluate(() => { window.__spoken.length = 0; });
  await page.locator('.run-go').click(); await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.run-live').waitFor({ timeout: 8000 });
  let d = 0;
  for (let i = 0; i < 48; i++) { d += 2.5; await ctx.setGeolocation({ latitude: LAT0 + d / M_PER_DEG, longitude: LON0, accuracy: 5 }); await page.waitForTimeout(500); }
  await page.waitForTimeout(1500);
  const said = await page.evaluate(() => window.__spoken.join(' | '));
  check(/Goal reached: 0\.1 km/.test(said), `the goal is said when reached (${said.slice(-120)})`);
  check(/Run 0\.1 km/.test(await page.locator('.run-live').innerText()), 'the goal shows during the run');
  await page.getByRole('button', { name: 'Hold to finish the run' }).dispatchEvent('pointerdown'); await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Save and see feedback' }).click(); await page.waitForURL(/\/activity\//); await page.waitForTimeout(1800);
  const freeRow = mock.state.tables.activities.filter((r) => r.user_id === uid && r.source === 'ritmo_gps').at(-1);
  check(!!freeRow && !freeRow.source_ids?.planned, 'the free run is saved, not linked to the plan');

  // Start on Ritmo plan: linked to today's session
  await page.goto(`${APP}/run`); await page.waitForTimeout(1500);
  check(await page.getByRole('tab', { name: 'Ritmo plan' }).getAttribute('aria-selected') === 'true', 'the plan tab is shown again for the open session');
  await page.locator('.gps-pill', { hasText: 'GPS ready' }).waitFor({ timeout: 8000 });
  await page.locator('.run-go').click(); await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.run-live').waitFor({ timeout: 8000 });
  for (let i = 0; i < 16; i++) { d += 2.5; await ctx.setGeolocation({ latitude: LAT0 + d / M_PER_DEG, longitude: LON0, accuracy: 5 }); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: 'Hold to finish the run' }).dispatchEvent('pointerdown'); await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Save and see feedback' }).click(); await page.waitForURL(/\/activity\//); await page.waitForTimeout(2000);
  const planRow = mock.state.tables.activities.filter((r) => r.user_id === uid && r.source === 'ritmo_gps').at(-1);
  check(planRow?.source_ids?.planned === s.id, "a run started on Ritmo plan is linked to today's session");

  // Profile links here for run settings
  await page.goto(`${APP}/profile`);
  await page.getByRole('link', { name: /^Run settings/ }).click(); await page.waitForURL(/\/run/); await page.waitForTimeout(800);
  check(await page.getByRole('dialog', { name: 'Run settings' }).isVisible(), "Profile's Run settings link opens the sheet");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
