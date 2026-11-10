// Shoe finder: search by model, filter by brand, pick a model and colour, and the name, use and lifespan fill
// themselves in; a shoe that is not listed can still be added by name. Shoes are saved with the profile.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const PHOTO = require('path').join(__dirname, '..', 'public', 'brand', 'ritmo-app-icon-1024.png');
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'shoes@test.ritmo';
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

  await page.goto(`${APP}/profile/shoes`); await page.waitForTimeout(1800);
  await page.locator('#shoes-card').getByRole('button', { name: 'Add shoes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Find your shoes' });
  check(await sheet.isVisible(), 'Add shoes opens "Find your shoes"');
  await sheet.getByLabel('Search shoes by brand or model').fill('vomero plus');
  const first = sheet.locator('.shoe-result').first();
  check(/Vomero Plus/.test(await first.innerText()) && /Nike · Long runs/.test(await first.innerText()), 'searching "vomero plus" finds the Nike Vomero Plus');
  await sheet.getByLabel('Search shoes by brand or model').fill('');
  await sheet.getByRole('button', { name: 'Brooks', exact: true }).click();
  const brooks = await sheet.locator('.shoe-result').allInnerTexts();
  check(brooks.length > 3 && brooks.every((x) => /Brooks/.test(x)), `the Brooks filter shows only Brooks (${brooks.length})`);
  await sheet.getByRole('button', { name: 'All', exact: true }).click();
  // Each model is drawn in the shape that fits it
  const shapes = await sheet.locator('.shoe-result svg[data-shape]').evaluateAll((els) => els.map((e) => e.getAttribute('data-shape')));
  check(new Set(shapes).size >= 4, `the list draws different shoe shapes (${[...new Set(shapes)].join(', ')})`);
  await sheet.getByLabel('Search shoes by brand or model').fill('speedgoat');
  check(await sheet.locator('.shoe-result svg[data-shape="trail"]').count() === 1, 'a trail shoe is drawn as a trail shoe');
  await sheet.getByLabel('Search shoes by brand or model').fill('vaporfly');
  check(await sheet.locator('.shoe-result svg[data-shape="carbon-racer"]').count() === 1, 'a carbon racer is drawn as a carbon racer');
  await sheet.getByLabel('Search shoes by brand or model').fill('');
  await page.screenshot({ path: require('path').join(__dirname, 'out', 'shoes-finder.png') }).catch(() => {});
  await sheet.getByLabel('Search shoes by brand or model').fill('vomero plus');
  await first.click();
  const det = page.getByRole('dialog', { name: 'Nike Vomero Plus' });
  await det.getByRole('radio', { name: 'Black' }).click();
  check(await page.locator('#sh-name').inputValue() === 'Nike Vomero Plus (Black)', 'picking Black names it "Nike Vomero Plus (Black)"');
  check(await det.locator('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"]', { hasText: 'Long runs' }).count() === 1, 'what they are for is filled in (long runs)');
  check(await page.locator('#sh-ret').inputValue() === '800', 'the retire distance is filled in (800 km)');
  check(await det.locator('.shoe-hero svg[data-shape="max"] path[fill="#1E1A17"]').count() === 1, 'the picture is a max-cushion shoe in black');
  await page.screenshot({ path: require('path').join(__dirname, 'out', 'shoes-details.png') }).catch(() => {});
  // A photo of your own pair, stored privately in your own folder
  await det.locator('input[type=file]').setInputFiles(PHOTO); await page.waitForTimeout(1200);
  check(await det.locator('img.shoe-photo').isVisible(), 'your photo replaces the drawing');
  const key = [...mock.state.files.keys()].find((k) => k.startsWith(`avatars/${uid}/shoe-`));
  check(!!key, `the photo is stored in your private folder (${key})`);
  await det.getByRole('button', { name: 'Save shoes' }).click(); await page.waitForTimeout(2200);
  const saved = mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.shoes ?? [];
  check(saved.some((s) => s.name === 'Nike Vomero Plus (Black)' && s.brand === 'Nike' && s.model === 'Vomero Plus' && s.colour === 'Black' && s.use === 'long' && s.retireKm === 800), 'saved with brand, model, colour, use and lifespan');
  check(saved.find((s) => s.name === 'Nike Vomero Plus (Black)')?.photo === key.replace(/^avatars\//, ''), 'the shoe remembers its photo');
  await page.waitForTimeout(800);
  check(await page.locator('#shoes-card img.shoe-photo').count() >= 1 && await page.locator('#shoes-card').getByText('Nike Vomero Plus (Black)').isVisible(), 'the list shows the shoe with your photo');
  await page.locator('#shoes-card').getByRole('button', { name: 'Remove photo' }).first().click(); await page.waitForTimeout(2200);
  check(!mock.state.files.has(key) && !mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.shoes.find((s) => s.name === 'Nike Vomero Plus (Black)').photo, 'removing the photo deletes it and goes back to the drawing');

  // Not listed: add by name
  await page.locator('#shoes-card').getByRole('button', { name: 'Add shoes' }).click();
  await page.getByLabel('Search shoes by brand or model').fill('my old trainers');
  check(await page.getByText('No shoes match "my old trainers".').isVisible(), 'no match says so');
  await page.getByRole('button', { name: "Can't find yours? Add it by name" }).click();
  check(await page.locator('#sh-name').inputValue() === 'my old trainers', 'adding by name keeps what was typed');
  await page.getByRole('button', { name: 'Save shoes' }).click(); await page.waitForTimeout(2200);
  const saved2 = mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.shoes ?? [];
  check(saved2.some((s) => s.name === 'my old trainers' && !s.brand), 'a shoe that is not listed is saved by name');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
