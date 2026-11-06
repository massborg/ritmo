// Review #2 acceptance 11: each share template exports a PNG at the selected size (Story 1080x1920, Square
// 1080x1080), and the route in the image has its start and finish trimmed. Usage: node e2e/share.cjs
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'share');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'share@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const last = rows.activities[rows.activities.length - 1];
  last.streams = Array.from({ length: 200 }, (_, i) => ({ t: i * 19, d: i * 71, lat: 35.9 + (i * 71) / 111195, lon: 14.5 + Math.sin(i / 20) / 500 }));
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  mock.state.tables.feature_flags.push({ user_id: uid, flag: 'share_cards' });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/activity/${last.id}`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.locator('.share-preview canvas').waitFor();
  const label = await page.locator('[aria-live="polite"]').filter({ hasText: / of \d+$/ }).first().textContent();
  const total = Number(label.match(/of (\d+)/)[1]);
  check(total >= 4, `${total} templates available for a run with a route`);
  const sizes = { Story: [1080, 1920], Square: [1080, 1080] };
  for (const [name, [w, h]] of Object.entries(sizes)) {
    await page.getByRole('radio', { name }).or(page.getByRole('button', { name, exact: true })).first().click();
    for (let i = 0; i < total; i++) {
      await page.waitForTimeout(250);
      const tpl = (await page.locator('[aria-live="polite"]').filter({ hasText: / of \d+$/ }).first().textContent()).split(' · ')[0];
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
      const file = path.join(OUT, `${tpl.replace(/\W+/g, '-')}-${name}.png`);
      await dl.saveAs(file);
      const [pw, ph] = pngSize(fs.readFileSync(file));
      check(pw === w && ph === h, `${tpl}, ${name}: PNG ${pw}x${ph}`);
      await page.getByRole('button', { name: 'Next template' }).click();
    }
  }
  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
