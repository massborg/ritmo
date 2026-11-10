// You (update brief, section 6): Progress with W | M | Y | All, a period picker, the big total with runs, pace and time,
// the bar chart with its average, PB tiles with "New", Insights and All records, run cards with plan tags and the
// device; Races with the next race against the goal, adding a race, predictions and past races. Shoes and Body
// moved to Profile.
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
  const email = 'you@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  // One older run marked as a race, and a recorded run with a device
  const race = [...rows.activities].sort((x, y) => x.start_time.localeCompare(y.start_time)).find((r) => r.distance_m >= 4900 && r.distance_m <= 5200) ?? rows.activities[0];
  race.is_race = true;
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }

  await page.goto(`${APP}/you`); await page.waitForTimeout(2000);
  check(await page.getByRole('heading', { name: 'You', exact: true }).isVisible() && await page.getByRole('button', { name: /^Add a run/ }).isVisible(), 'header: You with +');
  const seg = async (name) => page.getByRole('radio', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first();
  check(await (await seg('M')).getAttribute('aria-checked') === 'true' || await (await seg('M')).getAttribute('aria-pressed') === 'true', 'defaults to M');
  const now = new Date();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  check(await page.locator('.period-pick').innerText().then((x) => x.includes(`${months[now.getMonth()]} ${now.getFullYear()}`)), 'the picker shows this month');
  const total = async () => Number(await page.locator('.you-big').innerText());
  const m = await total();
  check(m > 0 && await page.getByText('Kilometres', { exact: true }).isVisible(), `big total in kilometres (${m})`);
  const stats = await page.locator('.you-stats').innerText();
  check(/Runs/.test(stats) && /Avg pace \/km/.test(stats) && /Time/.test(stats), 'three stats: runs, average pace, time');
  check(await page.locator('.pbar').count() > 0 && await page.locator('.pbars-avg').count() === 1 && /avg \d/.test(await page.locator('.pbars').innerText()), 'bars with a dashed average line, labelled');
  check(/^Longest day [\d.]+ km on /.test(await page.locator('.pbars figcaption').innerText()), 'an accessible summary of the chart');
  await (await seg('All')).click(); await page.waitForTimeout(300);
  const all = await total();
  await (await seg('W')).click(); await page.waitForTimeout(300);
  const w = await total();
  check(all > m && m >= w, `W, M and All change the total (${w} ≤ ${m} < ${all})`);
  check(await page.locator('.pbar').count() <= 7, 'W shows one bar per day');
  await (await seg('M')).click(); await page.waitForTimeout(300);
  await page.locator('.period-pick').click();
  const prev = `${months[(now.getMonth() + 11) % 12]} ${now.getMonth() ? now.getFullYear() : now.getFullYear() - 1}`;
  await page.getByRole('dialog').getByRole('button', { name: prev }).click(); await page.waitForTimeout(300);
  check(await page.locator('.period-pick').innerText().then((x) => x.includes(prev)) && await total() !== m, `choosing ${prev} changes the view`);
  await page.locator('.period-pick').click();
  await page.getByRole('dialog').getByRole('button', { name: `${months[now.getMonth()]} ${now.getFullYear()}` }).click(); await page.waitForTimeout(300);

  // PBs, Insights, records
  const tiles = await page.locator('.pb-tile').allInnerTexts();
  check(tiles.length === 3 && /5K/.test(tiles[0]) && /10K/.test(tiles[1]) && /Half/.test(tiles[2]), 'PB tiles: 5K, 10K, Half');
  check(await page.locator('.pb-tile .tag-new').count() >= 1, 'a PB from the last 30 days has a "New" tag');
  await page.getByRole('link', { name: /All records/ }).click(); await page.waitForURL(/\/you\/records/); await page.getByRole('heading', { name: 'All records', level: 1 }).waitFor(); await page.waitForTimeout(300);
  const rec = await page.locator('main').innerText();
  const hist = await page.getByRole('button', { name: 'History' }).count();
  check(['1 km', '5K', '10K', 'Half marathon'].every((x) => rec.includes(x)) && hist >= 4, `All records lists every distance the runs cover, each with history (${hist})`);
  await page.goBack(); await page.waitForTimeout(800);
  await page.getByRole('link', { name: /Insights/ }).click(); await page.waitForURL(/\/you\/insights/); await page.getByRole('heading', { name: 'Easy and hard balance' }).waitFor();
  const ins = await page.locator('main').innerText();
  check(['Easy and hard balance', 'Time in each zone', 'Long-run progress', 'Consistency', 'Your reviews', 'Mileage'].every((x) => ins.includes(x)), 'Insights holds balance, zones, long runs, consistency, mileage and reviews');
  await page.goBack(); await page.waitForTimeout(800);

  // Run cards
  const card = page.locator('.run-card-link').first();
  const ct = await card.innerText();
  check(/km/.test(ct) && /\/km/.test(ct) && await card.locator('.plan-tag').isVisible(), 'run cards: km, pace, time and a plan tag');
  check(await card.locator('.run-card-device').isVisible(), 'and the device line');
  check(await page.locator('#shoes-card').count() === 0 && await page.getByRole('heading', { name: 'Shoes' }).count() === 0, 'Shoes are no longer on You');
  await card.click(); await page.waitForURL(/\/activity\//);
  check(true, 'tapping a card opens the run');
  await page.goBack(); await page.waitForTimeout(500);

  // Races
  await page.getByRole('radio', { name: 'Races' }).or(page.getByRole('button', { name: 'Races' })).first().click(); await page.waitForTimeout(600);
  const nr = await page.locator('.next-race-card').innerText();
  check(/Next race · main goal/.test(nr) && /\d+\s*days? to go/.test(nr), 'next race card with a countdown');
  check(/Your goal/.test(nr) && /Ritmo estimate/.test(nr) && (/On track for your goal/.test(nr) || /Behind your goal by/.test(nr)), 'goal against estimate, with a status line');
  check(await page.getByRole('link', { name: 'Race plan' }).isVisible() && await page.getByRole('link', { name: 'Edit goal' }).isVisible() && await page.getByRole('link', { name: 'Add a race' }).isVisible(), 'Race plan, Edit goal and Add a race');
  const preds = await page.locator('.pred-tile').allInnerTexts();
  check(preds.length === 4 && /5K/.test(preds[0]) && /Marathon/.test(preds[3]), 'predictions: 5K, 10K, Half, Marathon');
  check(await page.locator('#past-h').isVisible() && await page.locator('section', { has: page.locator('#past-h') }).locator('li').count() >= 1, 'past races list the run marked as a race');

  // Shoes and Body in Profile
  await page.goto(`${APP}/profile`); await page.waitForTimeout(1200);
  check(await page.locator('#shoes-card').isVisible(), 'Shoes are in Profile');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
