// Update 4, tasks 3, 4 and 4b: the Activity tab, free strength with saved workouts, and weight on every set.
// - nav says Activity and opens /record: today's session with Start and Details, Free run, Strength, Log something done
// - the builder: search and filters (Upper, HYROX), add, sets × reps × kg, reorder, marked (not hidden) exclusions,
//   Save as a workout; saved workouts: Start, star up to 2, rename, duplicate, delete
// - the recorder: Set / Last time / kg / Reps / done, decimal kg, quick chips, effort per set, Swap / Add / Notes,
//   volume, best set and estimated 1-rep max; saved with source 'free' and every set's load
// - double progression the next time; "Last session" on the strength plan with a history chart; kg/lb setting
// - "Log strength session" → Pick exercises
// Usage: node e2e/u4-strength.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u4-strength'); fs.mkdirSync(OUT, { recursive: true });
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
  const email = 'u4-strength@test.ritmo';
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

  // ---- Task 3: the Activity tab
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  const tab = page.locator('.tabbar a').nth(2);
  check(/Activity/.test(await tab.innerText()) && (await tab.getAttribute('href')) === '/record', 'the middle tab says Activity and opens /record');
  await tab.click(); await page.waitForURL(/\/record$/); await page.waitForTimeout(600);
  let main = await page.locator('main').innerText();
  check(/Activity/.test(main) && /Free run/.test(main) && /Strength/.test(main) && /Log something done/.test(main), 'the hub offers Free run, Strength and Log something done');
  check(await page.locator('[aria-label="Today\'s planned session"]').count() === 1, "today's planned session (or that nothing is planned) comes first");
  const hasToday = await page.getByRole('link', { name: 'Start session' }).count();
  if (hasToday) check(await page.getByRole('link', { name: 'Details' }).count() === 1, "today's session has Start session and Details");
  check(/active/.test(await tab.getAttribute('class')), 'the Activity tab is marked as the current one');
  check(await noOverflow(), 'no sideways scroll at 390 px (Activity)');
  await shot('01-activity');
  await page.getByRole('button', { name: /Log something done/ }).click();
  check(await page.getByRole('button', { name: /Log a run/ }).isVisible(), '"Log something done" opens the + sheet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto(`${APP}/run?free=1`); await page.waitForTimeout(1200);
  check(await page.getByRole('tab', { name: 'Free run' }).getAttribute('aria-selected') === 'true', 'Free run opens the run recorder on its Free run tab');
  check(/active/.test(await page.locator('.tabbar a').nth(2).getAttribute('class')), 'the Activity tab stays current on the run recorder');

  // ---- Task 4: the builder
  await page.goto(`${APP}/record`); await page.waitForTimeout(800);
  await page.getByRole('link', { name: /Strength/ }).first().click(); await page.waitForURL(/\/strength$/); await page.waitForTimeout(600);
  check(/None yet/.test(await page.locator('main').innerText()), 'no saved workouts yet, and it says how to make one');
  for (const g of ['Legs', 'Hips', 'Core', 'Upper', 'Plyo', 'HYROX']) if (!(await page.getByRole('group', { name: 'Filter exercises' }).getByRole('button', { name: g, exact: true }).count())) check(false, `filter ${g}`);
  await page.getByRole('button', { name: 'HYROX', exact: true }).click();
  let lib = await page.locator('.ex-list').innerText();
  check(/Wall ball/.test(lib) && /Sled push/.test(lib) && !/Calf raise/.test(lib), 'the HYROX filter lists wall balls and the sled, and nothing else');
  check(/Needs gym equipment/.test(lib), 'exercises that need equipment the runner does not have are marked, not hidden');
  await page.getByRole('button', { name: 'Upper', exact: true }).click();
  check(/Push-up/.test(await page.locator('.ex-list').innerText()), 'the Upper filter lists upper-body exercises');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search exercises').fill('goblet');
  await page.getByRole('button', { name: 'Add Goblet squat' }).click();
  await page.getByLabel('Search exercises').fill('push-up');
  await page.getByRole('button', { name: 'Add Push-up', exact: true }).click();
  await page.getByLabel('Search exercises').fill('plank');
  await page.getByRole('button', { name: 'Add Plank', exact: true }).click();
  await page.getByLabel('Search exercises').fill('');
  check(await page.locator('.build-row').count() === 3, 'three exercises are in the workout');
  await page.getByLabel('Sets of Goblet squat').fill('2');
  await page.getByLabel('Reps of Goblet squat').fill('12');
  await page.getByLabel('Weight for Goblet squat in kg').fill('17,5');
  check(await page.getByLabel('Weight for Goblet squat in kg').getAttribute('inputmode') === 'decimal', 'the weight field opens the decimal keypad');
  await page.getByLabel('Sets of Push-up').fill('1'); await page.getByLabel('Sets of Plank').fill('1');
  await page.getByRole('button', { name: 'Move Plank up' }).click();
  const order = await page.locator('.build-row .label').allInnerTexts();
  check(/Goblet/.test(order[0]) && /Plank/.test(order[1]) && /Push-up/.test(order[2]), 'exercises can be reordered');
  check(await noOverflow(), 'no sideways scroll at 390 px (builder)');
  await shot('02-builder');
  await page.getByRole('button', { name: 'Save as a workout' }).click();
  await page.locator('#sf-name').fill('Leg day');
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(400);
  check(await page.locator('.template-card').count() === 1 && /Leg day/.test(await page.locator('.template-card').innerText()) && /3 exercises · about \d+ min/.test(await page.locator('.template-card').innerText()), 'saved as "Leg day": a card with its exercises, time and Start');
  // Duplicate twice, star: at most 2
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'More for Leg day', exact: true }).click(); await page.getByRole('button', { name: 'Duplicate' }).click(); await page.waitForTimeout(250); }
  check(await page.locator('.template-card').count() === 3, 'duplicate makes copies ("Leg day copy", "Leg day copy 2")');
  await page.getByRole('button', { name: 'More for Leg day copy 2' }).click(); await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator('#sf-rename').fill('Upper day'); await page.getByRole('button', { name: 'Save name' }).click(); await page.waitForTimeout(250);
  check(/Upper day/.test(await page.locator('.template-list').innerText()), 'a workout can be renamed');
  await page.getByRole('button', { name: 'Make Upper day a favourite' }).click();
  await page.getByRole('button', { name: 'Make Leg day a favourite', exact: true }).click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Make Leg day copy a favourite' }).click(); await page.waitForTimeout(200);
  check(/up to 2 favourites/.test(await page.locator('main').innerText()) && await page.locator('.template-card.fav').count() === 2, 'only 2 favourites can be starred; a third says so');
  const names = await page.locator('.template-name').allInnerTexts();
  check(names[2] === 'Leg day copy', `favourites come first (${names.join(', ')})`);
  await page.getByRole('button', { name: 'More for Leg day copy' }).click(); await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete workout' }).click(); await page.waitForTimeout(250);
  check(await page.locator('.template-card').count() === 2, 'a workout can be deleted (after confirming)');
  await shot('03-saved');
  await page.waitForTimeout(2200);
  check((profile().strength?.templates ?? []).length === 2 && profile().strength.templates.find((t) => t.name === 'Leg day').exercises[0].weightKg === 17.5, 'saved workouts are stored with the profile (17.5 kg kept)');

  // ---- Task 4 / 4b: the recorder
  await page.getByRole('button', { name: 'Start Leg day', exact: true }).click(); await page.waitForURL(/strength\/free/); await page.getByText('Exercise 1 of 3').waitFor();
  main = await page.locator('main').innerText();
  check(/Leg day/.test(main) && /Goblet squat/.test(main), 'the saved workout opens in the recorder');
  const heads = await page.locator('.set-head [role=columnheader]').allInnerTexts();
  check(heads.slice(0, 4).join('|').toLowerCase() === 'set|last time|kg|reps', `the set table has Set / Last time / kg / Reps (${heads.join('/')})`);
  check(await page.getByLabel('Set 1 weight in kg').inputValue() === '17.5' && await page.getByLabel('Set 1 reps').inputValue() === '12', 'sets are filled from the workout (17.5 kg × 12)');
  await page.getByRole('button', { name: 'Add 2.5 kg' }).click(); await page.waitForTimeout(200);
  check(await page.getByLabel('Set 1 weight in kg').inputValue() === '20' && await page.getByLabel('Set 2 weight in kg').inputValue() === '20', 'a quick chip changes this set and the ones to come (+2.5 → 20 kg)');
  await page.getByRole('button', { name: 'Take off 1 kg' }).click();
  await page.getByLabel('Set 1 weight in kg').fill('18');
  await page.getByRole('button', { name: 'Effort 6 out of 10' }).click();
  check(/Volume 432 kg/.test(await page.locator('.volume-card').innerText()) && /estimated 1-rep max 25\.2 kg/.test(await page.locator('.volume-card').innerText()), 'live volume, best set and estimated 1-rep max (18 kg × 12 × 2 = 432 kg; 25.2 kg)');
  check(await noOverflow(), 'no sideways scroll at 390 px (recorder)');
  await shot('04-recorder');
  await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click();
  check(await page.locator('.set-row.done').count() === 1 && await page.locator('.set-row.now').count() === 1, 'the set is ticked and the next one is now');
  await page.getByRole('button', { name: 'Effort 7 out of 10' }).click();
  await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click();
  // Plank (timed, bodyweight: no kg column), then swap the push-up, add an exercise, write a note
  check(/Exercise 2 of 3/.test(await page.locator('main').innerText()) && await page.getByLabel('Set 1 seconds').count() === 1 && await page.getByLabel('Set 1 weight in kg').count() === 0, 'a bodyweight hold has no kg column by default');
  check(await page.getByRole('button', { name: '+ Add load' }).count() === 1, '"+ Add load" is there for bodyweight exercises');
  await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Swap', exact: true }).click();
  await page.getByLabel('Search exercises').fill('row');
  await page.getByRole('button', { name: /^Use .*row/i }).first().click(); await page.waitForTimeout(300);
  check(/row/i.test(await page.locator('.strength-now h2').innerText()), 'Swap replaces the exercise');
  await page.getByRole('button', { name: 'Band', exact: true }).click();
  check(await page.getByRole('button', { name: 'Heavy band' }).count() === 1, 'a band exercise records the band (light, medium, heavy)');
  await page.getByRole('button', { name: 'Heavy band' }).click();
  await page.getByRole('button', { name: 'Notes' }).click(); await page.locator('#sp-notes').fill('Felt strong');
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByLabel('Search exercises').fill('calf raise');
  await page.getByRole('button', { name: /^Add .*calf raise/i }).first().click(); await page.waitForTimeout(300);
  check(/Exercise 3 of 4/.test(await page.locator('main').innerText()), 'Add exercise appends one (now 4)');
  await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click().catch(() => {});
  await page.getByRole('button', { name: 'Finish workout' }).click();
  main = await page.locator('main').innerText();
  check(/Workout done/.test(main) && /2 × 12 · 18 kg/.test(main) && /Volume\s*432 kg/.test(main) && /Best set: Goblet squat, 18 kg × 12\. Estimated 1-rep max 25\.2 kg/.test(main), 'the summary shows weight with reps ("2 × 12 · 18 kg"), volume, best set and estimated 1-rep max');
  await shot('05-summary');
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(3000);
  let entry = (profile().log ?? []).filter((e) => e.kind === 'strength').at(-1);
  const gs = entry?.strength.exercises.find((x) => x.id === 'goblet-squat');
  check(entry?.strength.source === 'free' && !!entry.strength.templateId && entry.strength.notes === 'Felt strong', "saved as a strength activity with source 'free', its saved workout and the note");
  check(gs?.sets.length === 2 && gs.sets[0].load === 18 && gs.sets[0].reps === 12 && gs.sets[0].loadType === 'added' && gs.sets[0].effort === 6 && gs.sets[1].effort === 7, 'every set stores reps, load in kg, how it was loaded and its effort');
  const band = entry?.strength.exercises.find((x) => /row/i.test(x.name));
  check(band?.sets[0].loadType === 'band' && band.sets[0].band === 'heavy' && band.sets[0].load === undefined, 'a band set stores the band, not a weight');
  check(profile().strength.templates.find((t) => t.name === 'Leg day').lastUsedAt, 'the saved workout remembers when it was last used');
  check(/\+1 rep: 13 reps at 18 kg/.test(profile().strength.progress['goblet-squat'].target.note), `double progression: reps first (${profile().strength.progress['goblet-squat'].target?.note})`);

  // ---- Next time: last time, and the suggested increase
  await page.goto(`${APP}/strength`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Start Leg day', exact: true }).click(); await page.getByText('Exercise 1 of 3').waitFor();
  main = await page.locator('main').innerText();
  check(/Last time: 2 × 12 at 18 kg/.test(main) && /Today: \+1 rep: 13 reps at 18 kg/.test(main), '"Last time: 2 × 12 at 18 kg" with the suggested increase');
  check(await page.getByLabel('Set 1 reps').inputValue() === '13' && /18 × 12/.test(await page.locator('.set-row').first().innerText()), 'the sets are filled with the target, next to last time (18 × 12)');
  // Reach the top of the goblet squat's range (10 to 14): the next step is more load, back at 10 reps
  await page.getByLabel('Set 1 reps').fill('16');
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click(); }
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(3000);
  const t2 = profile().strength.progress['goblet-squat'].target;
  check(t2.load === 20.5 && t2.reps === 10 && /Add load: 20\.5 kg for 10 reps/.test(t2.note), `at the top of the range the load goes up and reps drop back (${t2.note})`);

  // ---- The strength plan's Last session, and the history chart
  await page.goto(`${APP}/strength-plan`); await page.waitForTimeout(1500);
  const lastCard = await page.locator('section[aria-labelledby="sp-last"]').innerText();
  check(/2 × 16 · 18 kg/.test(lastCard) && /Volume 576 kg/.test(lastCard) && /estimated 1-rep max 27\.6 kg/.test(lastCard) && /Next: Add load: 20\.5 kg/.test(lastCard), 'Last session shows weight with reps, volume, best set, 1-rep max and what is next');
  await page.getByRole('button', { name: 'Goblet squat: history' }).click();
  check(await page.locator('.ex-history circle').count() === 2 && /Estimated 1-rep max \(kg\)/.test(await page.locator('[role=dialog]').innerText()), 'tapping an exercise shows its history chart (2 sessions)');
  await shot('06-history');
  await page.keyboard.press('Escape');
  check(!/active/.test(await page.locator('.tabbar a').nth(2).getAttribute('class')), 'the strength plan is not under the Activity tab');

  // ---- kg / lb
  await page.goto(`${APP}/profile/strength`); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'lb', exact: true }).click(); await page.waitForTimeout(2300);
  await page.goto(`${APP}/strength-plan`); await page.waitForTimeout(1200);
  check(/2 × 16 · 39\.5 lb/.test(await page.locator('section[aria-labelledby="sp-last"]').innerText()), 'with lb chosen, weights show in lb (18 kg → 39.5 lb), stored in kg');
  await page.goto(`${APP}/profile/strength`); await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'kg', exact: true }).click(); await page.waitForTimeout(2300);

  // ---- Log strength session → Pick exercises
  await page.goto(`${APP}/record`); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Log something done/ }).click();
  await page.getByRole('button', { name: /Log strength session/ }).click();
  await page.getByRole('button', { name: /Pick exercises/ }).click(); await page.waitForURL(/strength\?log=1/); await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Use Leg day', exact: true }).click();
  check(await page.locator('.build-row').count() === 3, '"Pick exercises" opens the builder to log after the fact; a saved workout fills it in');
  await page.getByLabel('Weight for Goblet squat in kg').fill('20');
  await shot('07-log-after');
  await page.getByRole('button', { name: 'Save to my log' }).click(); await page.waitForTimeout(3000);
  entry = (profile().log ?? []).filter((e) => e.kind === 'strength').at(-1);
  check(entry?.strength.source === 'manual' && entry.strength.exercises.length === 3 && entry.strength.exercises[0].sets.length === 2 && entry.strength.exercises[0].sets[0].load === 20, 'logged by hand with its exercises, sets and weights');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
