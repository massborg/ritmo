// Update 5, U5: every exercise shows its own movement. The gallery page lists all of them; the ones that used to
// borrow a wrong drawing have their own, with props (wall, ball, bench, sled, band) and a second arm.
// Usage: node e2e/u5-demos.cjs (app on :4173). Made-up runner only.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u5-demos'); fs.mkdirSync(OUT, { recursive: true });
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
  const email = 'u5-demos@test.ritmo';
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

  await page.goto(`${APP}/exercise-demos`); await page.waitForTimeout(3000);
  const cells = page.locator('.demo-cell');
  const n = await cells.count();
  check(n >= 50, `the gallery shows every exercise (${n})`);
  const drawn = await cells.evaluateAll((l) => l.filter((c) => c.querySelectorAll('svg.exercise-demo path').length > 10).length);
  check(drawn === n, `each one is drawn (${drawn} of ${n})`);
  const own = await cells.evaluateAll((l) => l.filter((c) => /Its own drawing/.test(c.textContent)).length);
  check(own >= 32, `${own} exercises have a drawing of their own`);
  const cell = (name) => page.locator('.demo-cell', { has: page.getByText(name, { exact: true }) });
  const fills = async (name) => cell(name).locator('svg.exercise-demo path').evaluateAll((l) => l.map((p) => p.getAttribute('fill')));
  check((await fills('Wall balls')).includes('var(--accent)'), 'wall balls: a ball and a target');
  check((await fills('Banded side walk')).filter((f) => f === 'var(--demo-muscle)').length >= 1, 'banded side walk: the band');
  check((await fills('Farmers carry')).filter((f) => f === 'var(--ink)').length >= 4, 'farmers carry: a weight in each hand');
  const paths = async (name) => cell(name).locator('svg.exercise-demo path').count();
  check(await paths('Overhead press') > await paths('Body-weight squat'), 'overhead press: both arms are drawn');
  // It moves: the drawing changes over time
  const snap = async () => cell('Push-up').locator('svg.exercise-demo g').innerHTML();
  const a = await snap(); await page.waitForTimeout(700); const c = await snap();
  check(a !== c, 'the push-up moves');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at 390 px');
  await page.setViewportSize({ width: 1100, height: 900 }); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '01-gallery.png'), fullPage: true });
  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
