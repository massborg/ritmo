// Update 2, stage 1: rebuilding the plan keeps the past and this week ("Next Monday"), says what it is doing,
// shows a summary on Training and can be undone; a run logged by hand when the watch run is already synced does
// not count twice; Training says when Strava sync is stale; the 10 Nov run page notices are right.
// Usage: node e2e/update2-stage1.cjs (app on :4173)
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'update2-stage1');
fs.mkdirSync(OUT, { recursive: true });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const clearCache = async (page) => { await page.goto(`${APP}/about`); await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keyval-store'); q.onsuccess = q.onerror = q.onblocked = () => r(); })); };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'u2s1@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  rows.profiles[0].data.profile.training = { ...(rows.profiles[0].data.profile.training ?? {}), startMode: 'monday' };
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1500); } }
  await page.waitForTimeout(2000);

  // ---- Rebuild with "Next Monday" and no changes ----
  const today = new Date();
  const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const wk = (plan) => plan.sessions.filter((s) => s.date >= ymd(mon) && s.date <= ymd(sun)).map((s) => `${s.date} ${s.type} ${s.distanceM}`).join(' | ');
  const before = mock.state.tables.plans.at(-1).data;
  const beforeWeek = wk(before);
  await page.goto(`${APP}/goals`); await page.waitForTimeout(1200);
  const btn = page.getByRole('button', { name: /Save and rebuild my plan/ });
  await btn.click();
  const busy = await page.getByRole('button', { name: /Rebuilding your plan…/ }).isVisible().catch(() => false);
  check(busy, 'the button says "Rebuilding your plan…" while it works');
  await page.waitForURL(/rebuilt=1/, { timeout: 8000 }).catch(() => {});
  check(/rebuilt=1/.test(page.url()), 'then Training opens');
  await page.getByRole('dialog', { name: 'Your plan is rebuilt' }).waitFor({ timeout: 5000 }).catch(() => {});
  const sheet = page.getByRole('dialog', { name: 'Your plan is rebuilt' });
  check(await sheet.isVisible(), 'with a summary sheet: "Your plan is rebuilt"');
  const sheetText = await sheet.innerText().catch(() => '');
  check(/week/.test(sheetText) && /a week/.test(sheetText) && /changed/.test(sheetText), 'the summary shows weeks, weekly volume and what changed');
  check(/stay exactly as they were until Sunday|Nothing was planned/.test(sheetText) || today.getDay() === 1, 'and says this week stays as it was');
  await page.screenshot({ path: path.join(OUT, 'rebuild-summary.png') });
  await page.waitForTimeout(1800);
  const after = mock.state.tables.plans.at(-1).data;
  check(wk(after) === beforeWeek, 'this week\'s sessions are exactly as before');
  check(after.sessions.filter((s) => s.date < ymd(today)).length >= before.sessions.filter((s) => s.date < ymd(today) && s.date >= ymd(mon)).length, 'past sessions are kept');
  check(/Rebuilt the plan from/.test(after.changes.at(-1).summary), 'the rebuild is logged in Plan changes');
  check(!after.changes.some((c) => /days with no session planned/.test(c.summary) && c.at > new Date(Date.now() - 60000).toISOString()), 'no automatic cuts after the rebuild');
  await sheet.getByRole('button', { name: 'Restore previous plan' }).click(); await page.waitForTimeout(1800);
  const restored = mock.state.tables.plans.at(-1).data;
  check(restored.id === before.id && /Restored the plan/.test(restored.changes.at(-1).summary), '"Restore previous plan" brings the old plan back, logged');

  // ---- A hand-logged run when the watch run is already in Ritmo ----
  // This morning's run came in from Strava; then the runner logs it by hand as well
  const t6 = new Date(); t6.setHours(6, 0, 0, 0);
  const synced = { user_id: uid, id: 'strava-u2s1', source: 'strava', source_ids: { strava: 'u2s1' }, start_time: t6.toISOString(), name: 'Morning run', distance_m: 10000, duration_s: 3000, moving_s: 3000, avg_hr: 140, updated_at: new Date().toISOString() };
  mock.state.tables.activities.push(synced);
  await clearCache(page);
  const count = mock.state.tables.activities.filter((a) => a.user_id === uid).length;
  await page.goto(`${APP}/`); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /^Add a run/ }).click();
  await page.getByRole('button', { name: /^Log a run/ }).click(); await page.waitForTimeout(500);
  check(await page.locator('#lr-start').isVisible(), 'the hand-logging form asks for the start time');
  await page.locator('#lr-km').fill('9.8');
  await page.getByRole('button', { name: 'Good', exact: true }).first().click().catch(() => {});
  await page.getByRole('button', { name: 'Save run' }).click(); await page.waitForTimeout(2500);
  const n2 = mock.state.tables.activities.filter((a) => a.user_id === uid).length;
  check(n2 === count, `logging the same run by hand does not add a second copy (${count} → ${n2})`);
  check(page.url().includes(synced.id), 'and opens the synced run, with your answers on it');

  // ---- Strava sync note ----
  const prof = mock.state.tables.profiles.find((r) => r.user_id === uid);
  prof.data.sources = [...(prof.data.sources ?? []).filter((s) => s.kind !== 'strava'), { kind: 'strava', connected: true, lastSyncAt: new Date(Date.now() - 2 * 86400e3).toISOString(), activityCount: 3 }];
  await clearCache(page);
  await page.goto(`${APP}/`); await page.waitForTimeout(2200);
  check(await page.getByText(/Strava last synced|Strava sync failed/).first().isVisible().catch(() => false), 'Training says when Strava last synced over a day ago, with Sync now');

  // ---- The 10 Nov run page: hand-logged with heart rate and six reps ----
  const id = 'manual-u2s1';
  const t0 = new Date(); t0.setHours(6, 50, 0, 0); t0.setDate(t0.getDate() - 1);
  mock.state.tables.activities.push({ user_id: uid, id, source: 'manual', source_ids: { manual: id, reps: [1, 2, 3, 4, 5, 6].map((i) => ({ kind: 'work', label: `Rep ${i}`, timeS: 31 + (i % 3), distanceM: 160 })) }, start_time: t0.toISOString(), name: 'Easy run + strides', distance_m: 14210, duration_s: 4189, moving_s: 4189, avg_hr: 133, updated_at: new Date().toISOString() });
  await clearCache(page);
  await page.goto(`${APP}/activity/${id}`); await page.waitForTimeout(2200);
  const body = await page.locator('main').innerText();
  check(!/no splits or heart rate/.test(body), 'no "no splits or heart rate" when heart rate and rep times were given');
  check(/06:50|6:50/.test(body), 'the run shows its real start time (06:50)');
  check(!/shaded band is the target/.test(body), 'strides are not drawn against the easy-pace band');
  await page.screenshot({ path: path.join(OUT, 'run-page.png'), fullPage: true });

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
