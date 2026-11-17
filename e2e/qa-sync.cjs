// Saving and syncing the profile (QA sweep 2):
// - a workout saved a moment before a reload is still there, and reaches the account
// - a workout saved while offline reaches the account when the connection is back, without touching anything,
//   and survives a reload made while still offline
// - two tabs open at once do not overwrite each other's saved workouts
// Usage: node e2e/qa-sync.cjs (app on :4173). Made-up runner only.
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
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'qa-sync@test.ritmo';
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
  const stored = () => (mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.strength?.templates ?? []).map((t) => t.name).sort().join(',');
  const shown = async (p) => (await p.locator('.template-card').allInnerTexts()).join(' | ');
  const save = async (p, name) => {
    const add = p.getByRole('button', { name: 'Add Goblet squat', exact: true });
    if (await add.count() && await add.isEnabled()) await add.click();
    await p.getByRole('button', { name: 'Save as a workout' }).click();
    await p.locator('#sf-name').fill(name);
    await p.getByRole('button', { name: 'Save workout' }).click();
  };

  // ---- 1. Saved, then reloaded 300 ms later
  await page.goto(`${APP}/strength`); await page.waitForTimeout(3000);
  await save(page, 'Quick'); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(4500);
  check(/Quick/.test(await shown(page)), 'a workout saved 300 ms before a reload is still shown');
  check(/Quick/.test(stored()), '… and has reached the account');

  // ---- 2. Saved offline: kept through a reload, sent when the connection is back
  mock.state.offline = true;
  await save(page, 'Offline'); await page.waitForTimeout(3000);
  check(/saved on this device/.test(await page.locator('body').innerText()), 'offline: the banner says the change is on this device');
  check(!/Offline/.test(stored()), 'offline: the account does not have it yet');
  await page.reload(); await page.waitForTimeout(3000);
  check(/Offline/.test(await shown(page)), 'reloaded while offline: the workout is still shown');
  mock.state.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(6000);
  check(/Offline/.test(stored()) && /Quick/.test(stored()), 'back online: the workout reaches the account without touching anything');
  check(!/saved on this device/.test(await page.locator('body').innerText()), 'the banner is gone');
  // failed while the app stays open: retried on its own
  mock.state.offline = true;
  await save(page, 'Retry'); await page.waitForTimeout(2500);
  mock.state.offline = false;
  await page.waitForTimeout(8000);
  check(/Retry/.test(stored()), 'a save that failed is tried again on its own');
  await page.reload(); await page.waitForTimeout(3500);
  check(/Offline/.test(await shown(page)) && /Retry/.test(await shown(page)), 'after a reload online the workouts are still there');

  // ---- 3. Two tabs
  const tabB = await ctx.newPage();
  await tabB.goto(`${APP}/strength`); await tabB.waitForTimeout(3500);
  await save(page, 'TabA'); await page.waitForTimeout(3000);
  await save(tabB, 'TabB'); await tabB.waitForTimeout(5000);
  check(/TabA/.test(stored()) && /TabB/.test(stored()), `two tabs: both workouts are in the account (${stored()})`);
  check(/TabA/.test(await shown(tabB)), 'tab B now shows the workout saved in tab A');
  await page.reload(); await page.waitForTimeout(3500);
  check(/TabA/.test(await shown(page)) && /TabB/.test(await shown(page)), 'tab A shows both after a reload');
  // a setting changed in one tab and a workout deleted in the other
  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
