// Update 2, §8: deleting runs. A hand-entered run can be deleted from the run page (with a confirmation and Undo),
// leaving the run lists and the account, with its Hub post and how it felt; Undo brings it back. A Strava run is
// deleted from Ritmo only, says so, does not come back on the next sync, and can be re-imported from Data sources.
// A long press on a run in Progress offers to delete it.
// Usage: node e2e/delete-runs.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'delete-runs');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const tap = async (loc) => { await loc.waitFor({ timeout: 15000 }); await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await loc.click(); };

const stravaRun = (id, daysAgo, km, name) => {
  const start = new Date(Date.now() - daysAgo * 86400000); start.setUTCHours(17, 45, 0, 0);
  const n = 40, secs = Math.round(km * 300);
  return {
    activity: { id, name, sport_type: 'Run', start_date: start.toISOString(), distance: km * 1000, moving_time: secs, elapsed_time: secs + 30, total_elevation_gain: 20, average_heartrate: 148, max_heartrate: 170, device_name: 'Garmin Forerunner 265' },
    streams: { time: { data: Array.from({ length: n }, (_, i) => Math.round((i * secs) / (n - 1))) }, distance: { data: Array.from({ length: n }, (_, i) => (i * km * 1000) / (n - 1)) },
      latlng: { data: Array.from({ length: n }, (_, i) => [35.9 + i * 0.0004, 14.5]) }, heartrate: { data: Array.from({ length: n }, () => 148) } },
  };
};

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 404, body: '' }));
  mock.state.strava = { connected: new Set(), states: new Map(), calls: [], appUrl: APP, backfill: [stravaRun(5151, 2, 12.34, 'Strava Sunset Run')] };
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'delete@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  // Today's run, logged by hand, posted to the Hub, with how it felt
  const id = 'manual-del1';
  const t0 = new Date(); t0.setHours(5, 10, 0, 0);
  mock.state.tables.activities.push({ user_id: uid, id, source: 'manual', source_ids: { manual: id }, start_time: t0.toISOString(), name: 'Hand-logged test run', distance_m: 7770, duration_s: 2700, moving_s: 2700, detail_score: 1, updated_at: new Date().toISOString() });
  mock.state.tables.session_feedback.push({ user_id: uid, activity_id: id, data: { activityId: id, feel: 4, rpe: 4, pain: [], loggedAt: new Date().toISOString() } });
  mock.state.tables.posts.push({ id: 'post-del1', user_id: uid, activity_id: id, title: 'Hand-logged test run', visibility: 'everyone', show_map: false, show_hr: false, stats: {}, ritmo_count: 2, comment_count: 1, created_at: new Date().toISOString() });
  mock.state.tables.comments.push({ id: 'c-del1', post_id: 'post-del1', user_id: uid, body: 'Nice', created_at: new Date().toISOString() });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  const row = (rid) => mock.state.tables.activities.find((r) => r.id === rid);
  const todayRuns = async () => (await page.locator('#ran-here').count()) ? await page.locator('section', { has: page.locator('#ran-here') }).innerText() : '';

  // ---- The hand-entered run ----
  await page.goto(`${APP}/`); await page.waitForTimeout(1800);
  check(/7\.8 km/.test(await todayRuns()), 'today\'s hand-logged run shows under "Your runs today"');
  await page.goto(`${APP}/activity/${id}`); await page.waitForTimeout(1500);
  await tap(page.getByRole('button', { name: 'Run options' }));
  const del = page.getByRole('dialog', { name: 'Run options' }).getByRole('button', { name: 'Delete run' });
  check(await del.isVisible() && /btn-danger/.test(await del.getAttribute('class')), 'Run options has "Delete run", in the danger colour');
  await tap(del);
  const sheet = page.getByRole('dialog', { name: 'Delete this run?' });
  await sheet.waitFor({ timeout: 5000 });
  const text = await sheet.innerText();
  check(/It will be removed from your stats, records, plan and the Hub\./.test(text), 'the confirmation says what deleting does');
  check(!/doesn't delete it from/.test(text), 'a hand-entered run says nothing about Strava');
  check(await sheet.getByRole('button', { name: 'Cancel' }).isVisible(), 'with Cancel');
  await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, 'confirm.png') });
  await tap(sheet.getByRole('button', { name: 'Delete' }));
  await page.waitForTimeout(600);
  check(!/\/activity\//.test(page.url()), 'the run page closes');
  const toast = page.locator('.toast-action');
  check(await toast.isVisible() && /Run deleted/.test(await toast.innerText()), 'a "Run deleted" toast offers Undo');
  await page.goto(`${APP}/`).catch(() => {}); await page.waitForTimeout(1200);
  // The toast belongs to the app, so a full reload ends it; test Undo without reloading instead
  await page.goto(`${APP}/activity/${id}`); await page.waitForTimeout(1200);
  check(row(id) !== undefined, 'nothing irreversible happens to the account during the Undo window');
  // Delete again and use Undo
  const delAgain = async () => {
    await tap(page.getByRole('button', { name: 'Run options' }));
    await tap(page.getByRole('dialog', { name: 'Run options' }).getByRole('button', { name: 'Delete run' }));
    await tap(page.getByRole('dialog', { name: 'Delete this run?' }).getByRole('button', { name: 'Delete' }));
    await page.waitForTimeout(500);
  };
  if (await page.getByRole('button', { name: 'Run options' }).isVisible().catch(() => false)) {
    await delAgain();
    await page.getByRole('link', { name: 'Training', exact: true }).first().click();
    await page.waitForTimeout(800);
    check(!/7\.8 km/.test(await todayRuns()), '"Your runs today" no longer lists it');
    await page.screenshot({ path: path.join(OUT, 'undo-toast.png') });
    await tap(page.locator('.toast-action').getByRole('button', { name: 'Undo' }));
    await page.waitForTimeout(800);
    check(/7\.8 km/.test(await todayRuns()), 'Undo brings it back');
  } else check(false, 'the run is back after the reload');

  // Delete for good: after the Undo window, it leaves the account with its post, comments and how it felt
  await page.goto(`${APP}/activity/${id}`); await page.waitForTimeout(1200);
  await delAgain();
  await page.waitForTimeout(11500);
  check(!row(id), 'after 10 seconds the hand-entered run is deleted from the account');
  check(!mock.state.tables.posts.some((p) => p.id === 'post-del1') && !mock.state.tables.comments.some((c) => c.post_id === 'post-del1'), 'its Hub post goes too, with Fuego and comments');
  check(!mock.state.tables.session_feedback.some((f) => f.activity_id === id), 'and how it felt');
  check(await page.locator('.toast-action').count() === 0, 'the Undo toast is gone');
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(2000);
  check(!/7\.8 km/.test(await todayRuns()), 'it stays deleted after reloading');

  // ---- A Strava run ----
  await page.goto(`${APP}/profile/data`);
  const stravaRow = () => page.locator('li', { has: page.locator('.label', { hasText: /^Strava$/ }) });
  await tap(stravaRow().getByRole('button', { name: 'Connect with Strava' }));
  await page.waitForURL(/\/profile\/data/, { timeout: 20000 });
  await page.waitForTimeout(11000);
  check(row('strava-5151')?.source === 'strava', 'a Strava run arrived');
  await page.goto(`${APP}/activity/strava-5151`); await page.waitForTimeout(1500);
  await tap(page.getByRole('button', { name: 'Run options' }));
  await tap(page.getByRole('dialog', { name: 'Run options' }).getByRole('button', { name: 'Delete run' }));
  const s2 = page.getByRole('dialog', { name: 'Delete this run?' });
  check(/This doesn't delete it from Strava/.test(await s2.innerText()), 'deleting a Strava run says "This doesn\'t delete it from Strava"');
  await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, 'confirm-strava.png') });
  await tap(s2.getByRole('button', { name: 'Delete' }));
  await page.waitForTimeout(2500);
  check(!!row('strava-5151')?.source_ids?.deleted, 'the account remembers it was deleted');
  // Strava sends the run again (an update, or the hourly check): it must not come back
  mock.state.tables.strava_inbox.push({ id: 501, user_id: uid, activity_id: '5151', payload: stravaRun(5151, 2, 12.34, 'Strava Sunset Run'), received_at: new Date().toISOString() });
  await page.goto(`${APP}/profile/data`); await page.waitForTimeout(1500);
  await tap(stravaRow().getByRole('button', { name: 'Sync now' }));
  await page.waitForTimeout(3500);
  check(mock.state.tables.strava_inbox.filter((r) => r.user_id === uid).length === 0, 'the sync ran (inbox emptied)');
  check(!!row('strava-5151')?.source_ids?.deleted, 'the deleted Strava run does not come back on the next sync');
  await page.goto(`${APP}/progress`); await page.waitForTimeout(1500);
  check(!(await page.locator('main').innerText()).includes('Strava Sunset Run'), 'and is not in your runs');
  // Re-import from Data sources
  await page.goto(`${APP}/profile/data`); await page.waitForTimeout(1500);
  const sec = page.locator('section', { has: page.locator('#deleted-runs') });
  check(/Strava Sunset Run/.test(await sec.innerText()) && /from Strava/.test(await sec.innerText()), 'Data sources lists it under "Deleted runs"');
  await sec.screenshot({ path: path.join(OUT, 'deleted-runs.png') });
  await tap(sec.getByRole('button', { name: 'Re-import' }));
  await page.waitForTimeout(2500);
  check(row('strava-5151') && !row('strava-5151').source_ids?.deleted, 'Re-import brings it back, in the account too');

  // ---- Long press on a run in Progress ----
  await page.goto(`${APP}/progress`); await page.waitForTimeout(1800);
  const card = page.locator('.run-card-link').first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 20); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  await page.waitForTimeout(300);
  check(await page.getByRole('dialog', { name: 'Delete this run?' }).isVisible(), 'press and hold a run in Progress offers to delete it');
  check(!/\/activity\//.test(page.url()), `without opening the run (${page.url().replace(APP, '')})`);
  await page.screenshot({ path: path.join(OUT, 'long-press.png') });
  await tap(page.getByRole('dialog', { name: 'Delete this run?' }).getByRole('button', { name: 'Cancel' }));

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
