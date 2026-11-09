const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
// Phone fit: every main screen fits phone widths from 360 to 430 px with nothing wider than the screen, the page
// cannot zoom, and text boxes are at least 16 px (iPhones zoom in on smaller ones).
const APP = process.env.APP_URL || 'http://localhost:4173', SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const results = [];
  for (const width of [360, 375, 390, 430]) {
    const ctx = await b.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, geolocation: { latitude: 35.9, longitude: 14.5, accuracy: 5 }, permissions: ['geolocation'] });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch {} });
    await mock.install(ctx, SUPA);
    await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+/btfwAJfwPpa1fKXQAAAABJRU5ErkJggg==', 'base64') }));
    const page = await ctx.newPage();
    for (const p of ['/login', '/signup']) { await page.goto(APP + p); await page.waitForTimeout(500); results.push(await measure(page, width, p)); }
    const email = `fit${width}@test.ritmo`;
    await page.goto(`${APP}/signup`);
    await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
    for (const c of await page.locator('.consent input').all()) await c.check();
    await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
    await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
    await page.waitForURL(/setup/); await page.waitForTimeout(800);
    results.push(await measure(page, width, '/setup'));
    const uid = mock.state.users.get(email).id;
    const rows = ryanRows(uid, new Date());
    for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
    await page.goto(`${APP}/`); await page.waitForTimeout(1500);
    for (const name of [/Train 6 days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
    const act = rows.activities?.[0]?.id;
    for (const p of ['/', '/calendar', '/you', '/goals', '/coach', '/run', '/hub', '/profile', '/profile/data', '/privacy', act ? `/activity/${act}` : null].filter(Boolean)) {
      await page.goto(APP + p); await page.waitForTimeout(1300);
      results.push(await measure(page, width, p));
    }
    if (width === 390) {
      const vp = await page.locator('meta[name=viewport]').getAttribute('content');
      check(/maximum-scale=1/.test(vp) && /user-scalable=no/.test(vp), `the page does not zoom (${vp})`);
      await page.goto(`${APP}/profile`); await page.waitForTimeout(800);
      const small = await page.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea')].filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length);
      check(small === 0, 'text boxes are at least 16 px, so tapping one does not zoom in');
      check(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction) === 'manipulation', 'double-tap does not zoom');
    }
    await ctx.close();
  }
  for (const r of results) check(!r.over, `${r.path} fits a ${r.width} px wide phone${r.over ? `: page ${r.sw}px; widest: ${r.culprits.join(' | ')}` : ''}`);
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
async function measure(page, width, path) {
  return page.evaluate(([width, path]) => {
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const culprits = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > width + 1 || r.left < -1)) {
        let p = el.parentElement, clipped = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') { if (p !== document.body && p !== document.documentElement) { clipped = true; break; } } p = p.parentElement; }
        if (!clipped && getComputedStyle(el).position !== 'fixed') culprits.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(r.left)}→${Math.round(r.right)}`);
      }
    }
    return { width, path, sw, over: culprits.length > 0, culprits: culprits.slice(0, 4) };
  }, [width, path]);
}
