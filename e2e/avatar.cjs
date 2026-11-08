// Profile picture on phone screens: the photo buttons are the browser's own file controls (Safari on iPhone can
// ignore a hidden picker opened from code), choosing the same photo twice still works, and the picture saves.
const path = require('path');
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const PHOTO = path.join(__dirname, '..', 'public', 'brand', 'ritmo-app-icon-1024.png');
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
(async () => {
  const b = await chromium.launch();
  for (const dev of ['iPhone 13', 'Pixel 7']) {
    const mock = createMock();
    const ctx = await b.newContext({ ...devices[dev] });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
    await mock.install(ctx, SUPA);
    const page = await ctx.newPage();
    const email = `photo-${dev.replace(' ', '').toLowerCase()}@test.ritmo`;
    await page.goto(`${APP}/signup`);
    await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
    for (const c of await page.locator('.consent input').all()) await c.check();
    await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
    await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
    await page.waitForURL(/setup/);
    const rows = ryanRows(mock.state.users.get(email).id, new Date());
    for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
    await page.goto(`${APP}/`); await page.waitForTimeout(1500);
    const fit = page.getByRole('button', { name: /Train 6 days a week/ });
    if (await fit.isVisible().catch(() => false)) { await fit.click(); await page.waitForTimeout(1000); }
    await page.goto(`${APP}/profile`);
    await page.getByRole('button', { name: 'Add a photo' }).click();
    // Each photo button is a label around a real, rendered file input (not display:none, not opened from code)
    const native = await page.evaluate(() => ['Take a photo', 'Choose a photo'].map((t) => {
      const l = [...document.querySelectorAll('label.file-btn')].find((x) => x.textContent.includes(t));
      const i = l?.querySelector('input[type=file]');
      return !!i && getComputedStyle(i).display !== 'none' && !i.hidden;
    }));
    check(native.every(Boolean), `${dev}: Take a photo and Choose a photo are the browser's own file controls`);
    check(await page.locator('label.file-btn input[capture="user"]').count() === 1, `${dev}: Take a photo opens the front camera`);
    const choose = async () => {
      const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 4000 }), page.getByText('Choose a photo', { exact: true }).click()]);
      await fc.setFiles(PHOTO);
    };
    let opened = true;
    try { await choose(); } catch { opened = false; }
    check(opened && await page.getByRole('button', { name: 'Save picture' }).waitFor({ timeout: 6000 }).then(() => true, () => false), `${dev}: tapping Choose a photo opens the picker and the crop screen`);
    await page.getByRole('button', { name: 'Choose another' }).click();
    let again = true;
    try { await choose(); await page.getByRole('button', { name: 'Save picture' }).waitFor({ timeout: 4000 }); } catch { again = false; }
    check(again, `${dev}: choosing the same photo again still works`);
    await page.getByRole('button', { name: 'Save picture' }).click();
    const shown = await page.locator('.card img.avatar-img').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    check(shown && mock.state.files.has(`avatars/${mock.state.users.get(email).id}/avatar.jpg`), `${dev}: the picture saves and shows on Profile`);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
