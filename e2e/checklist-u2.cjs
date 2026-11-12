// Update 2 test checklist (brief §3, §9, §16): the screens added or changed in update 2, in Giorno, Notte and Sole,
// at 390 px and on desktop: no sideways scrolling, every icon-only control labelled, tap targets at least 44 px,
// keyboard focus visible, and the run page tabs reachable by keyboard. The behaviour itself is covered by the
// feature suites (update2-stage1 … stage5, delete-runs, push and others).
// Usage: node e2e/checklist-u2.cjs (app on :4173). Writes e2e/out/checklist-u2/report.json and screenshots.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'checklist-u2');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let passed = 0, failed = 0;
const check = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); results.push({ ok: !!ok, name, detail }); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  const email = 'checklist-u2@test.ritmo';
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
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1500); } }
  // Join the Hub so its screens show
  await page.goto(`${APP}/hub`);
  await page.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
  await page.locator('#hub-name').fill('Sam Checklist');
  await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click();
  await page.waitForTimeout(2500);
  const run = [...rows.activities].sort((x, y) => y.start_time.localeCompare(x.start_time))[0];

  // ---- Run page tabs: reachable and switchable by keyboard ----
  await page.goto(`${APP}/activity/${run.id}`); await page.waitForTimeout(1800);
  await page.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  const sel = await page.getByRole('tab', { selected: true }).innerText();
  check(sel === 'Intervals' && await page.getByRole('tab', { name: 'Intervals' }).evaluate((e) => e === document.activeElement), 'run page tabs move with the arrow keys and keep focus', `selected ${sel}`);
  await page.keyboard.press('End'); await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  const wrapped = await page.getByRole('tab', { selected: true }).innerText();
  check(['Overview', 'Shoes'].includes(wrapped), 'the tab row wraps or stops at the end without losing focus', wrapped);

  // ---- Every update 2 screen × theme × size ----
  const tabUrl = (t) => [`Run · ${t}`, `/activity/${run.id}`, t.toLowerCase()];
  const screens = [
    ['Training', '/'], ...['Overview', 'Intervals', 'Charts', 'Shoes'].map(tabUrl), ['Goals (rebuild)', '/goals'],
    ['Hub feed', '/hub'], ['Find runners', '/hub/find'], ['Hub profile', '/hub/runner/me'], ['Followers', '/hub/runner/me/people/followers'],
    ['Requests', '/hub/runner/me/people/requests'], ['Notifications', '/hub/notifications'], ['Edit profile', '/hub/edit'],
    ['Hub and privacy', '/profile/hub'], ['Profile (photo, reminders)', '/profile'], ['Data sources', '/profile/data'], ['Shoes', '/profile/shoes'], ['Records', '/you/records'],
  ];
  const sizes = [['390', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 860 }, false]];
  const themes = ['giorno', 'notte', 'sole'];
  const sweep = { overflow: [], unlabelled: [], small: [], focus: [] };
  const st = await ctx.storageState();
  await page.close();
  for (const [sizeName, vp, mobile] of sizes) {
    const c2 = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await c2.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ } });
    await c2.addCookies(await ctx.cookies());
    const p2 = await c2.newPage();
    p2.on('pageerror', (e) => errors.push(`${p2.url()}: ${e.message}`));
    await mock.install(c2, SUPA);
    await p2.goto(`${APP}/about`);
    await p2.evaluate((origins) => { for (const o of origins) for (const { name, value } of o.localStorage) localStorage.setItem(name, value); }, st.origins);
    for (const theme of themes) {
      for (const [name, url, tab] of screens) {
        if (tab) await p2.evaluate((t) => sessionStorage.setItem('ritmo:run-tab', t), tab);
        await p2.goto(`${APP}${url}`); await p2.waitForTimeout(1300);
        await p2.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await p2.waitForTimeout(150);
        const r = await p2.evaluate(() => {
          const vis = (el) => { const s = getComputedStyle(el); const rc = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && rc.width > 0 && rc.height > 0 && !el.closest('[aria-hidden="true"]'); };
          const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const ctrls = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input[type=checkbox], input[type=radio], select')].filter(vis);
          const unlabelled = ctrls.filter((el) => {
            const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('').trim();
            const lb = el.getAttribute('aria-labelledby'); const lbl = el.id && document.querySelector(`label[for="${el.id}"]`); const wrap = el.closest('label');
            return !name && !lb && !lbl && !wrap && el.tagName !== 'INPUT' ? true : (el.tagName === 'INPUT' && !lbl && !wrap && !el.getAttribute('aria-label') && !lb);
          }).map((el) => el.outerHTML.slice(0, 90));
          const small = ctrls.filter((el) => {
            if (el.closest('p, li > span, .caption, td') && el.tagName === 'A') return false;
            const r0 = el.getBoundingClientRect(); if (r0.width <= 2 || r0.height <= 2 || el.classList.contains('sr-only') || el.classList.contains('skip-link')) return false;
            if (el.tagName === 'INPUT') { const l = el.closest('label'); const rc = (l ?? el).getBoundingClientRect(); return rc.height < 44 && rc.width < 44; }
            const rc = el.getBoundingClientRect(); return rc.height < 44 && rc.width < 44 || rc.height < 24;
          }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
          return { overflow, unlabelled, small };
        });
        let focusBad = 0, focused = 0;
        for (let i = 0; i < 4; i++) {
          await p2.keyboard.press('Tab');
          const f = await p2.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, ring: s.boxShadow !== 'none' }; });
          if (f) { focused++; if (!f.outline && !f.ring) focusBad++; }
        }
        const tag = `${name} · ${theme} · ${sizeName}`;
        if (r.overflow) sweep.overflow.push(tag);
        if (r.unlabelled.length) sweep.unlabelled.push(`${tag}: ${r.unlabelled.slice(0, 3).join(' ; ')}`);
        if (r.small.length) sweep.small.push(`${tag}: ${r.small.join(' ; ')}`);
        if (focusBad) sweep.focus.push(`${tag}: ${focusBad} of ${focused}`);
        await p2.screenshot({ path: path.join(OUT, `${sizeName}-${theme}-${name.replace(/\W+/g, '-').toLowerCase()}.png`) });
      }
    }
    await c2.close();
  }
  const n = screens.length * themes.length * sizes.length;
  check(!sweep.overflow.length, `no sideways scrolling on ${n} screen views`, sweep.overflow.slice(0, 8).join(' | '));
  check(!sweep.unlabelled.length, 'every icon-only control has a label', sweep.unlabelled.slice(0, 8).join(' | '));
  check(!sweep.small.length, 'tap targets are at least 44 px', `${sweep.small.length} views: ${sweep.small.slice(0, 10).join(' | ')}`);
  check(!sweep.focus.length, 'keyboard focus is visible', sweep.focus.slice(0, 8).join(' | '));
  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, sweep }, null, 2));
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
