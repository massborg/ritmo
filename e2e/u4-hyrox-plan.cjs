// Update 4, task 6: HYROX athlete onboarding and plan.
// - onboarding: "How do you train?" (Runner / HYROX athlete / Both); the goal step offers HYROX next to the race
//   distances, chosen already for a HYROX athlete; division with its loads, race date, goal time, previous time,
//   hardest stations (up to 3) and equipment; the recent 5K step stays
// - the plan: HYROX on the Training header, 1 km repeats and compromised runs at the HYROX run pace, simulations,
//   station strength, the race at the end; explained in Plan changes
// - a simulation's Start opens the HYROX recorder; Profile → HYROX edits it all and rebuilds the plan
// Usage: node e2e/u4-hyrox-plan.cjs (app on :4173). Made-up athlete only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u4-hyrox-plan'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const cont = (page) => page.getByRole('button', { name: 'Continue', exact: true }).click();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'u4-hyrox-plan@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const profile = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  const plan = () => mock.state.tables.plans.filter((r) => r.user_id === uid).at(-1)?.data;
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // ---- Onboarding
  await page.locator('#c-health').check(); await cont(page);
  await page.locator('#s-name').fill('Alex');
  await page.getByLabel('Day', { exact: true }).selectOption('15'); await page.getByLabel('Month', { exact: true }).selectOption('4'); await page.getByLabel('Year', { exact: true }).selectOption('1992');
  const train = page.locator('fieldset', { hasText: 'How do you train?' });
  check((await train.getByRole('button').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()).join('|') === 'Runner|HYROX athlete new|Both', 'About you asks "How do you train?": Runner / HYROX athlete (new) / Both');
  await train.getByRole('button', { name: /HYROX athlete/ }).click();
  await shot('01-about-you');
  await cont(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'No', exact: true }).nth(i).click();
  await cont(page);
  await page.getByRole('radio', { name: /I run regularly/ }).click();
  await page.locator('#s-weekly').fill('40');
  await page.getByRole('button', { name: '5K', exact: true }).click();
  await page.locator('#s-racetime').pressSequentially('2030');
  check(/5K in 20:30/.test(await page.locator('.time-readback').innerText()), 'the recent 5K step is kept: run paces still come from running fitness');
  await cont(page);
  // The goal step
  await page.getByText('What would you like to achieve?').waitFor();
  check(await page.getByRole('radio', { name: 'Train for a race' }).getAttribute('aria-checked') === 'true', 'a HYROX athlete starts on "Train for a race"');
  const raceChips = page.locator('fieldset', { hasText: 'Race' }).first();
  check((await raceChips.getByRole('button').allInnerTexts()).join('|') === '5K|10K|Half marathon|Marathon|HYROX' && await raceChips.getByRole('button', { name: 'HYROX' }).getAttribute('aria-pressed') === 'true', 'race chips: 5K · 10K · Half marathon · Marathon · HYROX, with HYROX chosen');
  await page.getByRole('button', { name: 'Women', exact: true }).click();
  check(/sled push 102 kg, sled pull 78 kg, farmers carry 2 × 16 kg, sandbag 10 kg, wall ball 4 kg to 2\.70 m/.test(await page.locator('.hyrox-loads').innerText()), 'the division shows its loads in one line (Women Open)');
  await page.getByRole('button', { name: 'Doubles', exact: true }).click();
  check(await page.getByRole('button', { name: 'Mixed', exact: true }).count() === 1, 'Doubles and Relay add Mixed');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const raceDate = new Date(); raceDate.setDate(raceDate.getDate() + 13 * 7 - ((raceDate.getDay() + 6) % 7) + 5); // a Saturday, about 13 weeks out
  // The date field is a calendar sheet: step to the month, then pick the day
  await page.getByRole('button', { name: 'Race date (optional)' }).click();
  const now = new Date();
  for (let i = 0; i < (raceDate.getFullYear() - now.getFullYear()) * 12 + raceDate.getMonth() - now.getMonth(); i++) await page.getByRole('button', { name: 'Next month' }).click();
  await page.locator(`[aria-label$=" ${raceDate.getDate()} ${raceDate.toLocaleDateString('en-GB', { month: 'long' })}"]`).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.waitForTimeout(300);
  await page.locator('#hg-goal').pressSequentially('12000');
  check(/HYROX in 1:20:00: about 4:42\s*\/km for each 1 km run/.test(await page.locator('.hyrox-goal [role=status]').innerText()), 'the goal time uses the digit keypad and says the run pace (1:20:00 → 4:42/km)');
  await page.locator('#hg-prev').pressSequentially('12830');
  for (const s of ['Sled pull', 'Sandbag lunges', 'Wall balls']) await page.getByRole('button', { name: s, exact: true }).click();
  check(await page.getByRole('button', { name: 'SkiErg', exact: true }).first().isDisabled(), 'up to 3 hardest stations: a fourth cannot be picked');
  const equip = page.locator('fieldset', { hasText: 'Equipment you can use' });
  check((await equip.getByRole('button').allInnerTexts()).join('|') === 'SkiErg|Rower|Sled|Wall ball|Kettlebells|Sandbag', 'equipment: SkiErg, Rower, Sled, Wall ball, Kettlebells, Sandbag');
  await equip.getByRole('button', { name: 'Sled' }).click();
  check(await noOverflow(), 'no sideways scroll at 390 px (goal step)');
  await shot('02-goal-hyrox');
  await cont(page);
  // The rest of onboarding
  for (let i = 0; i < 8 && /setup/.test(page.url()); i++) {
    await page.waitForTimeout(500);
    if (process.env.DBG) console.log('STEP', i, (await page.locator('main, .setup').first().innerText()).replace(/\s+/g, ' ').slice(0, 260));
    const start = page.getByRole('button', { name: 'Start my plan' });
    if (await start.count()) { await shot('03-preview'); await start.click(); break; }
    for (const name of [/No injuries/, /^Continue$/, /^Skip for now$/]) { const n = page.getByRole('button', { name }); if (await n.count()) { await n.first().click(); break; } }
  }
  await page.waitForURL((u) => !/setup/.test(u.pathname), { timeout: 15000 }); await page.waitForTimeout(3500);
  const p = profile();
  check(p.athleteType === 'hyrox' && p.hyrox?.division === 'women_open' && p.hyrox.goalS === 4800 && p.hyrox.previousS === 5310 && p.hyrox.raceDate === ymd(raceDate), 'saved: athlete type, division, goal 1:20:00, previous 1:28:30 and the race date');
  check(p.hyrox.hardest.join(',') === 'sled_pull,sandbag_lunges,wall_balls' && !p.hyrox.equipment.includes('sled') && p.hyrox.equipment.length === 5 && p.hyrox.targets?.run === 282, 'saved: hardest stations, equipment (no sled) and targets from the goal (4:42 runs)');
  check(/HYROX in 1:20:00/.test(p.goal), `the goal reads "${p.goal}"`);

  // ---- The plan
  const pl = plan();
  const kinds = (k) => pl.sessions.filter((s) => s.hyrox?.kind === k);
  check(pl?.goal === 'hyrox' && pl.sessions.at(-1).title === 'HYROX' && pl.sessions.at(-1).date === ymd(raceDate), 'the plan is built for HYROX and ends on race day');
  check(kinds('km_repeats').length >= 3 && kinds('compromised').length >= 3 && kinds('sim_half').length >= 1 && kinds('sim_full').length === 1 && kinds('run_through').length === 1, `1 km repeats (${kinds('km_repeats').length}), compromised runs (${kinds('compromised').length}), half simulations (${kinds('sim_half').length}), one full simulation (${kinds('sim_full').length}) and a run-through (${kinds('run_through').length})`);
  check(/20 heavy band rows/.test(kinds('compromised')[0].hyrox.blocks.join(',')) && /50 m sandbag lunges/.test(kinds('compromised')[0].hyrox.blocks.join(',')), 'compromised runs use the hardest stations, with a swap for the missing sled');
  check(pl.sessions.filter((s) => s.strengthPlan?.extra).length >= 3, 'strength has extra work for the hardest stations');
  check(/This is a HYROX plan/.test(pl.changes[0].summary) && /HYROX run pace of 4:42\/km/.test(pl.changes[0].summary), 'Plan changes explains the HYROX plan and its run pace');
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  const head = await page.locator('main').innerText();
  check(/HYROX · \d+ \w+ \d{4} · \w+ phase · 1[2-4] weeks to go/.test(head), 'Training says "HYROX · date · phase · weeks to go"');
  check(/Your HYROX run pace is 4:42\s*\/km[\s\S]*goal of 1:20:00/.test(head), 'and where the HYROX run pace comes from');
  check(await noOverflow(), 'no sideways scroll at 390 px (Training)');
  await shot('04-training');
  // A 1 km repeats session
  const rep = kinds('km_repeats').find((s) => s.phase !== 'taper');
  await page.goto(`${APP}/session/${rep.id}`); await page.waitForTimeout(1500);
  const sp = await page.locator('main').innerText();
  check(/HYROX 1 km repeats: \d x 1 km/.test(sp) && /at HYROX pace/.test(sp) && /4:3\d–4:4\d\s*\/km/.test(sp), 'a 1 km repeats session shows its reps and the HYROX pace');
  await shot('05-repeats');
  // A simulation today: Start opens the HYROX recorder
  const row = mock.state.tables.plans.filter((r) => r.user_id === uid).at(-1);
  const sim = row.data.sessions.find((s) => s.hyrox?.kind === 'sim_half');
  const todayS = row.data.sessions.find((s) => s.date === ymd(new Date()));
  const simDate = sim.date; sim.date = ymd(new Date()); if (todayS && todayS !== sim) todayS.date = simDate;
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/record`); await page.waitForTimeout(2500);
  const today = page.locator('[aria-label="Today\'s planned session"]');
  check(/HYROX half simulation/.test(await today.innerText()) && (await today.getByRole('link', { name: 'Start session' }).getAttribute('href')) === '/hyrox', 'a planned simulation starts in the HYROX recorder');

  // ---- Profile → HYROX (with some recorded runs: a plan is rebuilt from running fitness)
  mock.state.tables.activities.push(...ryanRows(uid, new Date()).activities);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/profile`); await page.waitForTimeout(1200);
  check(/HYROX athlete · goal 1:20:00/.test(await page.locator('main').innerText()), 'Profile has a HYROX row with the goal');
  await page.locator('a[href="/profile/hyrox"]').click(); await page.waitForURL(/profile\/hyrox/); await page.waitForTimeout(500);
  check(await page.locator('#hg-goal').inputValue() === '1:20:00' && await page.getByRole('button', { name: 'Wall balls', exact: true }).getAttribute('aria-pressed') === 'true', 'Profile → HYROX shows everything chosen in onboarding');
  await page.locator('#hg-goal').fill('1:10:00');
  await page.getByRole('button', { name: /Save and rebuild my plan/ }).click(); await page.waitForTimeout(3500);
  check(/Your plan has been rebuilt/.test(await page.locator('main').innerText()), 'saving rebuilds the plan');
  const p2 = plan();
  check(profile().hyrox.goalS === 4200 && /HYROX run pace of \d:\d\d\/km/.test(p2.changes.map((c) => c.summary).join(' ')) && p2.goal === 'hyrox' && p2.sessions.at(-1).durationS === 4200, 'the new goal (1:10:00) is in the rebuilt HYROX plan');
  await shot('06-profile-hyrox');
  // Back to a runner: a running plan again
  await page.getByRole('button', { name: 'Runner', exact: true }).click();
  await page.getByRole('button', { name: /Save and rebuild my plan/ }).click(); await page.waitForTimeout(3500);
  const p3 = plan();
  const said = (await page.locator('main [role=status]').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
  // This athlete's recorded runs are a high weekly distance: on 4 days a road plan may not fit, and Ritmo says so
  check(profile().athleteType === 'runner' && (p3.goal !== 'hyrox' && !p3.sessions.some((s) => s.hyrox && s.date > ymd(new Date())) || /do not fit safely/.test(said)), `switching to Runner rebuilds a running plan, or says why it cannot yet ("${said.slice(0, 80)}")`);

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
