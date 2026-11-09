// Five-tab navigation (update brief, section 2): Training · Coach · Run · Hub · You on the phone, Run in the middle as
// a raised orange circle with an outline ring on /run; /progress opens You; the avatar opens Profile on every main
// screen; no floating coach bubble; the desktop menu has the same five items plus Profile and never drops any while
// a page loads.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = 'nav@test.ritmo';
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
  for (const name of [/Train 6 days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);

  // The phone tab bar
  const labels = (await page.locator('.tabbar a').allInnerTexts()).map((x) => x.trim());
  check(labels.join(' · ') === 'Training · Coach · Run · Hub · You', `five tabs in order (${labels.join(' · ')})`);
  const bar = await page.locator('.tabbar').boundingBox();
  const btn = await page.locator('.tab-run-btn').boundingBox();
  check(Math.abs(btn.x + btn.width / 2 - 195) <= 2, 'Run is centred');
  check(btn.width >= 66 && btn.width <= 72, `Run is a 60 px circle with a 4 px ring (${btn.width} px)`);
  check(btn.y < bar.y - 10, `Run is raised above the bar (${Math.round(bar.y - btn.y)} px)`);
  const bg = await page.locator('.tab-run-btn').evaluate((el) => getComputedStyle(el).backgroundColor);
  const brand = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--brand)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  check(bg === brand, `Run is Ritmo orange (${bg})`);
  check(bar.height >= 78, `bar about 80 px tall (${Math.round(bar.height)})`);
  for (const a of await page.locator('.tabbar a').all()) { const r = await a.boundingBox(); if (r.width < 44 || r.height < 44) check(false, `tap target ${await a.innerText()} at least 44 px`); }
  check(await page.locator('.tab.active').innerText() === 'Training', 'Training is the active tab on /');
  check(await page.locator('.tab.active').evaluate((el) => getComputedStyle(el).fontWeight) >= 700, 'the active tab label is bold');
  check(await page.locator('.coach-fab').count() === 0, 'no floating coach bubble');

  await page.locator('.tabbar a[href="/run"]').click(); await page.waitForURL(/\/run$/); await page.waitForTimeout(500);
  const ring = await page.locator('.tab-run-btn').evaluate((el) => getComputedStyle(el).boxShadow);
  check(/3px/.test(ring), `on /run the Run button has the outline ring (${ring})`);
  check(await page.locator('.tabbar').isVisible(), 'the bar stays visible on the Run screen before recording');

  // Redirects
  await page.goto(`${APP}/progress`); await page.waitForTimeout(800);
  check(new URL(page.url()).pathname === '/you', `/progress opens You (${new URL(page.url()).pathname})`);
  check(await page.locator('.tab.active').innerText() === 'You', 'You is the active tab');
  await page.goto(`${APP}/calendar`); await page.waitForTimeout(1200);
  check(new URL(page.url()).pathname === '/' && await page.locator('#month').isVisible(), '/calendar opens the month calendar on Training');
  check(await page.locator('.tab.active').innerText() === 'Training', 'Training is the active tab there');

  // The avatar opens Profile on each main screen
  for (const p of ['/', '/coach', '/run', '/hub', '/you']) {
    await page.goto(`${APP}${p}`); await page.waitForTimeout(700);
    const av = page.locator('.appbar .appbar-side').first().getByRole('link', { name: 'Profile' });
    const box = await av.boundingBox().catch(() => null);
    const ok = !!box && box.x < 40 && box.width >= 44 && box.height >= 44;
    check(ok, `${p}: avatar at the top left, at least 44 px`);
    if (ok && p === '/hub') { await av.click(); await page.waitForURL(/\/profile$/); check(true, 'tapping the avatar opens Profile'); }
  }

  // A link to a section opens at that section
  await page.goto(`${APP}/you#shoes-card`); await page.waitForTimeout(1500);
  const top = await page.locator('#shoes-card').evaluate((el) => el.getBoundingClientRect().top).catch(() => null);
  check(top != null && top >= 0 && top < 300, `/you#shoes-card opens at Shoes (${top == null ? 'missing' : Math.round(top)} px)`);

  // Desktop menu: the same five plus Profile, from a fixed list, also while loading
  const desk = await b.newContext({ viewport: { width: 1280, height: 800 }, storageState: await ctx.storageState() });
  await desk.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(desk, SUPA);
  const dp = await desk.newPage();
  const seen = [];
  await dp.goto(`${APP}/coach`, { waitUntil: 'commit' });
  for (let i = 0; i < 30; i++) {
    const t = await dp.locator('.sidebar nav a').allInnerTexts().catch(() => []);
    if (t.length) seen.push(t.map((x) => x.trim()).join(','));
    await dp.waitForTimeout(50);
  }
  check(seen.length > 0 && seen.every((x) => x === 'Training,Coach,Run,Hub,You'), `desktop menu never drops an item while loading (${[...new Set(seen)].join(' | ')})`);
  check(await dp.locator('.sidebar-foot a', { hasText: 'Profile' }).isVisible(), 'Profile is at the bottom of the desktop menu');
  check(await dp.locator('.sidebar a.active').innerText().then((x) => x.trim()) === 'Coach', 'Coach is highlighted on /coach');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
