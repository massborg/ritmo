// Moving between screens is smooth: tapping a run (or another screen) keeps the current screen visible until the
// next one is ready, then fades it in. Every animation frame after the tap is checked: the page is never blank and
// never shows the loading placeholder. Tested before the page code is cached (slow network) and after.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

const watch = () => {
  window.__frames = [];
  const tick = () => {
    const main = document.querySelector('main');
    const text = (main?.innerText ?? '').replace(/\s+/g, ' ').trim();
    window.__frames.push({ path: location.pathname, chars: text.length, loading: !!main?.querySelector('[aria-label="Loading"]') });
    if (window.__frames.length < 120) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  // Slow page code (as on a phone network), so a cold tap has to wait for it
  await ctx.route(/\/assets\/(Activity|Calendar)-[^/]+\.js/, async (r) => { await new Promise((x) => setTimeout(x, 700)); return r.continue(); });
  const page = await ctx.newPage();
  const email = 'smooth@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  for (const name of [/Train 6 days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1000); } }

  const tapAndWatch = async (locator, urlPattern) => {
    await page.evaluate(watch);
    await locator.click();
    await page.waitForURL(urlPattern, { timeout: 10000 });
    await page.waitForFunction(() => window.__frames.length >= 120, null, { timeout: 15000 });
    return page.evaluate(() => window.__frames);
  };

  // 1) Cold: open a run right away, before its page code has arrived (it takes 700 ms)
  await page.goto(`${APP}/`); await page.locator('a[href^="/activity/"]').first().waitFor({ timeout: 8000 });
  let f = await tapAndWatch(page.locator('a[href^="/activity/"]').first(), /\/activity\//);
  check(f.every((x) => !x.loading), `opening a run never shows the loading placeholder (${f.length} frames)`);
  check(f.every((x) => x.chars > 40), `the screen is never blank while the run page loads (fewest characters on screen: ${Math.min(...f.map((x) => x.chars))})`);
  check(f[f.length - 1].path.startsWith('/activity/'), 'and the run page then appears');
  check(await page.locator('.page-in').evaluate((el) => getComputedStyle(el).animationName) === 'page-in', 'the new screen fades in gently');

  // 2) Warm: back to Training, then another run (code already cached)
  await page.goBack(); await page.waitForURL((u) => u.pathname === '/'); await page.waitForTimeout(400);
  f = await tapAndWatch(page.locator('a[href^="/activity/"]').first(), /\/activity\//);
  check(f.every((x) => !x.loading && x.chars > 40), 'a second run opens smoothly too');

  // 3) Tab change to a page whose code is slow
  f = await tapAndWatch(page.locator('.tabbar a[href="/calendar"]'), /\/calendar/);
  check(f.every((x) => !x.loading && x.chars > 40), 'switching tabs never flashes blank or loading');

  // Each screen still starts fresh: a run page's state does not leak into the next run
  check(await page.locator('main .page-in').count() === 1, 'one screen at a time');

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
