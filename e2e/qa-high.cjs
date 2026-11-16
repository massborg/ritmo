// QA sweep, high findings:
// - the race entered in setup is still there when setup is resumed after a reload (it used to be lost, and the plan
//   was built with no race)
// - a steady 2/10 check on a care plan that is over 10 days old does not pause training as a red flag
// - medium findings: a goal changed away from a race drops that race; "Both" with a non-race goal gets a running plan
// Usage: node e2e/qa-high.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const cont = (page) => page.getByRole('button', { name: 'Continue', exact: true }).click();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function signUp(b, mock, email) {
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  return { page, errors, uid: mock.state.users.get(email).id };
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();

  // ---- 1. The setup race survives a resumed setup
  const A = await signUp(b, mock, 'qa-race@test.ritmo');
  let page = A.page;
  await page.locator('#c-health').check(); await cont(page);
  await page.locator('#s-name').fill('Sam');
  await page.getByLabel('Day', { exact: true }).selectOption('15'); await page.getByLabel('Month', { exact: true }).selectOption('4'); await page.getByLabel('Year', { exact: true }).selectOption('1990');
  await cont(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'No', exact: true }).nth(i).click();
  await cont(page);
  await page.getByRole('radio', { name: /I run regularly/ }).click();
  await page.locator('#s-weekly').fill('40');
  await page.getByRole('button', { name: '5K', exact: true }).click();
  await page.locator('#s-racetime').pressSequentially('2230');
  await cont(page);
  await page.getByRole('radio', { name: 'Train for a race' }).click();
  await page.locator('#g-name').fill('City 10K');
  const race = new Date(); race.setDate(race.getDate() + 70 - ((race.getDay() + 6) % 7) + 6); // a Sunday, about 10 weeks out
  await page.getByRole('button', { name: 'Race date' }).click();
  const now = new Date();
  for (let i = 0; i < (race.getFullYear() - now.getFullYear()) * 12 + race.getMonth() - now.getMonth(); i++) await page.getByRole('button', { name: 'Next month' }).click();
  await page.locator(`[aria-label$=" ${race.getDate()} ${race.toLocaleDateString('en-GB', { month: 'long' })}"]`).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '10K', exact: true }).click();
  await page.locator('#g-time').pressSequentially('4600');
  await cont(page);
  const keep = page.getByRole('button', { name: 'Keep my goal' });
  if (await keep.count()) await keep.click();
  await page.getByText('Your training week').waitFor(); await page.waitForTimeout(3000);
  const prof = () => mock.state.tables.profiles.find((r) => r.user_id === A.uid).data.profile;
  check(prof().setupRace?.name === 'City 10K' && prof().setupRace.date === ymd(race) && prof().setupRace.goalS === 2760, 'the race is kept with the setup answers in the account');
  // Leave and come back: the device copy is gone too, as on another device
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.reload(); await page.getByText('Your training week').waitFor(); await page.waitForTimeout(800);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    if (await page.getByRole('button', { name: 'Start my plan' }).count()) break;
    for (const name of [/No injuries/, /^Continue$/, /^Skip for now$/]) { const n = page.getByRole('button', { name }); if (await n.count()) { await n.first().click(); break; } }
  }
  const preview = (await page.locator('main, .setup').first().innerText()).replace(/\s+/g, ' ');
  check(/City 10K/.test(preview), `after resuming, the plan preview is still for the race ("${(preview.match(/Built[^.]*\./) || [''])[0].slice(0, 110)}")`);
  await page.getByRole('button', { name: 'Start my plan' }).click();
  await page.waitForURL((u) => !/setup/.test(u.pathname), { timeout: 15000 }); await page.waitForTimeout(3500);
  const races = mock.state.tables.races.filter((r) => r.user_id === A.uid);
  const plan = mock.state.tables.plans.filter((r) => r.user_id === A.uid).at(-1)?.data;
  check(races.length === 1 && races[0].data.name === 'City 10K', 'the race is saved to the account once the plan starts (once, not twice)');
  check(plan?.raceId === races[0]?.data.id && plan.sessions.at(-1).type === 'race' && plan.sessions.at(-1).date === ymd(race), 'the plan is built for that race and ends on race day');
  check(A.errors.length === 0, `no page errors (setup)${A.errors.length ? `: ${A.errors[0]}` : ''}`);
  await page.context().close();

  // ---- 2. A steady low pain check on an older care plan
  const B = await signUp(b, mock, 'qa-care@test.ritmo');
  page = B.page;
  const rows = ryanRows(B.uid, new Date());
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(8, 0, 0, 0); return d; };
  const p = rows.profiles[0].data.profile;
  const ci = (n) => ({ id: `k${n}`, at: day(n).toISOString(), area: 'Knee', side: 'left', pain: 2, when: [], onset: 'gradual', signs: [], redFlags: [] });
  p.flags = { ...(p.flags ?? {}), body: true };
  p.body = { ...(p.body ?? {}), checkins: [ci(11), ci(9), ci(7), ci(5), ci(3)], care: { area: 'knee', side: 'left', startedAt: ymd(day(11)), stage: 1, stageSince: ymd(day(8)), checks: [11, 9, 7, 5, 3].map((n) => ({ date: ymd(day(n)), morning: 2 })), done: [] } };
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/care`); await page.waitForTimeout(2500);
  const hasCheck = await page.locator('#care-morning').count();
  if (!hasCheck) check(false, `the care plan page shows the morning check (${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160)})`);
  else {
    await page.locator('#care-morning').fill('2');
    await page.getByRole('button', { name: 'Save the check' }).click(); await page.waitForTimeout(2600);
    const care = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    check(/Pain 2\/10/.test(care) && !/Training is paused/.test(care), 'a steady 2/10 after 10 days: the care plan carries on, with no "training is paused"');
    await page.goto(`${APP}/`); await page.waitForTimeout(2500);
    check(!/Training paused: get checked first/.test(await page.locator('main').innerText()), 'and Training is not paused as a warning sign');
  }
  check(B.errors.length === 0, `no page errors (care)${B.errors.length ? `: ${B.errors[0]}` : ''}`);

  await page.context().close();

  // ---- 3. Medium findings: a goal changed away from a race drops the race; "Both" with a non-race goal runs
  const C = await signUp(b, mock, 'qa-goal@test.ritmo');
  page = C.page;
  await page.locator('#c-health').check(); await cont(page);
  await page.locator('#s-name').fill('Kim');
  await page.getByLabel('Day', { exact: true }).selectOption('3'); await page.getByLabel('Month', { exact: true }).selectOption('6'); await page.getByLabel('Year', { exact: true }).selectOption('1988');
  await page.locator('fieldset', { hasText: 'How do you train?' }).getByRole('button', { name: 'Both' }).click();
  await cont(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'No', exact: true }).nth(i).click();
  await cont(page);
  await page.getByRole('radio', { name: /I run regularly/ }).click();
  await page.locator('#s-weekly').fill('40');
  await page.getByRole('button', { name: '5K', exact: true }).click();
  await page.locator('#s-racetime').pressSequentially('2030');
  await cont(page);
  // First a running race...
  await page.getByRole('radio', { name: 'Train for a race' }).click();
  await page.getByRole('button', { name: '10K', exact: true }).click();
  await page.locator('#g-name').fill('Harbour 10K');
  await page.getByRole('button', { name: 'Race date' }).click();
  const race2 = new Date(); race2.setDate(race2.getDate() + 70);
  const now2 = new Date();
  for (let i = 0; i < (race2.getFullYear() - now2.getFullYear()) * 12 + race2.getMonth() - now2.getMonth(); i++) await page.getByRole('button', { name: 'Next month' }).click();
  await page.locator(`[aria-label$=" ${race2.getDate()} ${race2.toLocaleDateString('en-GB', { month: 'long' })}"]`).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.waitForTimeout(300);
  await cont(page);
  const keep2 = page.getByRole('button', { name: 'Keep my goal' });
  if (await keep2.count()) await keep2.click();
  await page.getByText('Your training week').waitFor(); await page.waitForTimeout(2600);
  const profC = () => mock.state.tables.profiles.find((r) => r.user_id === C.uid).data.profile;
  check(profC().setupRace?.name === 'Harbour 10K', 'a race is entered first');
  // ...then back, and another goal
  await page.getByRole('button', { name: 'Back to the previous question' }).click();
  await page.getByRole('radio', { name: 'Get faster' }).click();
  await cont(page);
  await page.getByText('Your training week').waitFor(); await page.waitForTimeout(2600);
  check(!profC().setupRace && profC().goalType === 'faster', 'going back and choosing "Get faster" drops the race this setup saved');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    if (await page.getByRole('button', { name: 'Start my plan' }).count()) break;
    for (const name of [/No injuries/, /^Continue$/, /^Skip for now$/]) { const n = page.getByRole('button', { name }); if (await n.count()) { await n.first().click(); break; } }
  }
  const prev = (await page.locator('main, .setup').first().innerText()).replace(/\s+/g, ' ');
  check(!/Harbour 10K/.test(prev) && !/HYROX plan/.test(prev) && /You also train for HYROX/.test(prev), '"Both" with "Get faster": a running plan with no race, that keeps HYROX strength (not a HYROX plan)');
  await page.getByRole('button', { name: 'Start my plan' }).click();
  await page.waitForURL((u) => !/setup/.test(u.pathname), { timeout: 15000 }); await page.waitForTimeout(3500);
  const planC = mock.state.tables.plans.filter((r) => r.user_id === C.uid).at(-1)?.data;
  check(mock.state.tables.races.filter((r) => r.user_id === C.uid).length === 0 && planC && planC.goal !== 'hyrox' && !planC.sessions.some((x) => x.type === 'race'), 'no race is saved, and the plan has no race day and is not a HYROX plan');
  check(planC.sessions.some((x) => x.strengthPlan?.extra?.includes('sled-push')), 'its station strength uses the real station exercises (equipment was never changed)');
  check(C.errors.length === 0, `no page errors (goal change)${C.errors.length ? `: ${C.errors[0]}` : ''}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
