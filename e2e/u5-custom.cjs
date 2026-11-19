// Update 5, U2: your own exercises.
// - a search with no match offers to add it; the form saves it and puts it in the workout, tagged MINE
// - it can be recorded with weight, is saved under its own id, and shows "last time" next session
// - a name already used is refused; Profile → Strength lists it; archived, it leaves the library but keeps its history
// Usage: node e2e/u5-custom.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u5-custom'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const email = 'u5-custom@test.ritmo';
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
  const prof = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  // ---- Nothing matches: add it
  await page.goto(`${APP}/strength`); await page.waitForTimeout(3000);
  check(await page.getByRole('button', { name: 'Add your own exercise' }).count() === 1, 'the library has "Add your own exercise"');
  await page.getByLabel('Search exercises').fill('Nordic hamstring curl'); await page.waitForTimeout(200);
  check(await page.getByRole('button', { name: 'Add "Nordic hamstring curl" as my exercise' }).count() === 1, 'a search with no match offers to add it');
  await page.getByRole('button', { name: 'Add "Nordic hamstring curl" as my exercise' }).click();
  check(await page.locator('#cx-name').inputValue() === 'Nordic hamstring curl', 'the form opens with the name filled in');
  check(await noOverflow(), 'no sideways scroll at 390 px (form)');
  await page.getByRole('button', { name: 'Hamstrings', exact: true }).click();
  await page.getByRole('button', { name: 'Added weight', exact: true }).click();
  await page.getByRole('button', { name: 'Light weights', exact: true }).click();
  await page.getByLabel('Reps', { exact: true }).fill('6');
  await page.locator('#cx-note').fill('Knees anchored, lower slowly');
  await page.screenshot({ path: path.join(OUT, '01-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save exercise' }).click(); await page.waitForTimeout(500);
  const row = await page.locator('.build-row').first().innerText();
  check(/Nordic hamstring curl/.test(row) && /mine/i.test(row) && await page.getByLabel('Reps of Nordic hamstring curl').inputValue() === '6', 'it is in the workout, tagged MINE, with 3 × 6');
  check(/mine/i.test(await page.locator('.ex-list li', { hasText: 'Nordic hamstring curl' }).innerText()), 'and in the library, tagged MINE');
  await page.getByRole('button', { name: 'Legs', exact: true }).click(); await page.waitForTimeout(200);
  check(await page.locator('.ex-list li', { hasText: 'Nordic hamstring curl' }).count() === 1, 'the Legs filter finds it');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.screenshot({ path: path.join(OUT, '02-builder.png'), fullPage: true });

  // ---- The same name again is refused
  await page.getByRole('button', { name: 'Add your own exercise' }).click();
  await page.locator('#cx-name').fill('nordic hamstring curl');
  check(/already an exercise with this name/.test(await page.locator('#cx-name-help').innerText()) && await page.getByRole('button', { name: 'Save exercise' }).isDisabled(), 'a name already used cannot be saved');
  await page.locator('#cx-name').fill('Goblet squat');
  check(await page.getByRole('button', { name: 'Save exercise' }).isDisabled(), 'nor a library exercise name');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // ---- Record it with weight
  await page.getByLabel('Weight for Nordic hamstring curl in kg').fill('10');
  await page.getByRole('button', { name: 'Start workout' }).click(); await page.waitForURL(/strength\/free/); await page.waitForTimeout(1200);
  let text = await page.locator('main').innerText();
  check(/Nordic hamstring curl/.test(text) && /Your own exercise/.test(text) && /Knees anchored, lower slowly/.test(text), 'the recorder shows it with its note, and no borrowed animation');
  check(await page.getByLabel('Set 1 weight in kg').inputValue() === '10' && await page.getByLabel('Set 1 reps').inputValue() === '6', 'sets start at 10 kg × 6');
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click().catch(() => {}); await page.waitForTimeout(150); }
  await page.screenshot({ path: path.join(OUT, '03-recorder.png'), fullPage: true });
  if (!/Workout done/.test(await page.locator('main').innerText())) await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(3000);
  const c = (prof().strength.customExercises ?? [])[0];
  const logged = (prof().log ?? []).filter((e) => e.kind === 'strength').at(-1);
  check(c && c.id.startsWith('custom:') && c.group === 'hamstrings' && c.sets === 3 && c.amount === 6 && c.loadType === 'added', 'the exercise is stored with the athlete (custom:<id>)');
  check(logged && logged.strength.exercises[0].id === c.id && logged.strength.exercises[0].sets.length === 3 && logged.strength.exercises[0].sets[0].load === 10, 'the session is logged under that id with 3 sets at 10 kg');
  check(prof().strength.progress?.[c.id]?.target?.reps === 7, 'progression works as for any exercise (next: 7 reps)');

  // ---- Next time: last time and the target
  await page.goto(`${APP}/strength`); await page.waitForTimeout(2500);
  await page.getByLabel('Search exercises').fill('nordic');
  await page.getByRole('button', { name: 'Add Nordic hamstring curl', exact: true }).click();
  check(await page.getByLabel('Reps of Nordic hamstring curl').inputValue() === '7' && await page.getByLabel('Weight for Nordic hamstring curl in kg').inputValue() === '10', 'next time it starts from the target: 7 reps at 10 kg');

  // ---- Profile → Strength: listed, and archived
  await page.goto(`${APP}/profile/strength`); await page.waitForTimeout(2500);
  check(/Your own exercises/.test(await page.locator('main').innerText()) && /Nordic hamstring curl/.test(await page.locator('main').innerText()), 'Profile, Strength lists it');
  await page.locator('#ps-own ~ ul').getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: /^Archive/ }).click(); await page.waitForTimeout(2800);
  check(prof().strength.customExercises[0].archived === true, 'it can be archived (never deleted)');
  await page.goto(`${APP}/strength`); await page.waitForTimeout(2500);
  await page.getByLabel('Search exercises').fill('nordic'); await page.waitForTimeout(200);
  check(await page.getByRole('button', { name: 'Add Nordic hamstring curl', exact: true }).count() === 0, 'archived: no longer offered in the library');
  await page.goto(`${APP}/log/${logged.id}`); await page.waitForTimeout(2000);
  check(/Nordic hamstring curl/.test(await page.locator('main').innerText()), 'but the session logged with it still shows its name');

  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
