// Review #2 acceptance 5, 6, 7 and 12: the Training page shows any day (with the runs done that day), a past
// planned session is logged with "Log this session" (manual reps, then screenshots), it is linked and marked
// done, feedback opens, and the watch file that arrives later does not count the run twice.
// Usage: node e2e/training.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'training');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function gpx(startIso, km, paceS) {
  const t0 = new Date(startIso).getTime(); const pts = [];
  for (let d = 0, t = 0; d <= km * 1000; d += 25, t += paceS * 0.025) pts.push(`<trkpt lat="${(35.9 + d / 111195).toFixed(7)}" lon="14.5"><time>${new Date(t0 + t * 1000).toISOString()}</time></trkpt>`);
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Watch run</name><type>running</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'training@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  rows.profiles[0].data.profile.daysAvailable = [0, 1, 3, 4, 5, 6];
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/calendar`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Build my plan|Rebuild/ }).first().click(); await page.waitForTimeout(1800);

  // ---- Acceptance 12 / 5: title and any previous day ----
  await page.goto(`${APP}/`); await page.waitForTimeout(800);
  check(await page.getByRole('heading', { name: "Today's training" }).isVisible(), 'Training page title is "Today\'s training"');
  check(await page.getByRole('navigation', { name: 'Main' }).last().getByText('Training').isVisible(), 'the phone tab bar says Training');
  // Monday of this week has runs in the fixture: open it from the strip
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  if (ymd(monday) !== ymd(new Date())) {
    await page.locator('.daychip').first().click(); await page.waitForTimeout(300);
    const title = await page.locator('h1').first().textContent();
    check(/Monday's training|Yesterday's training/.test(title ?? ''), `selecting Monday changes the title (${title})`);
    check(await page.getByText(/Your runs on/).isVisible(), 'a past day shows the runs done, not "Nothing planned"');
    await page.screenshot({ path: path.join(OUT, 'monday.png') });
  }

  // ---- Acceptance 6: a past planned session, logged by hand with 6 reps ----
  const plan = () => mock.state.tables.plans[mock.state.tables.plans.length - 1].data;
  const q = plan().sessions.find((s) => ['vo2max', 'threshold'].includes(s.type) && s.date > ymd(new Date()));
  const later = new Date(`${q.date}T09:00:00`); later.setDate(later.getDate() + 2);
  await ctx.clock.install({ time: later });
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300);
  check(await page.getByText('Did you do this session?').isVisible(), 'a past planned session asks "Did you do this session?"');
  check(await page.getByRole('button', { name: 'I skipped it' }).isVisible() && await page.getByRole('button', { name: 'I did something else' }).isVisible(), 'with "I skipped it" and "I did something else"');
  await page.getByRole('button', { name: 'Log this session' }).click();
  await page.getByText('Log this session').first().waitFor();
  await page.getByRole('radio', { name: 'Enter manually' }).or(page.getByRole('button', { name: 'Enter manually' })).first().click();
  const reps = await page.locator('.rep-table tbody tr').count();
  check(reps >= 3, `the rep table is built from the plan (${reps} rows)`);
  const timeInputs = page.locator('.rep-table input[aria-label$=" time"]');
  const n = await timeInputs.count();
  for (let i = 0; i < n; i++) await timeInputs.nth(i).fill('3:12');
  await page.locator('#ls-km').fill(String(Math.round(q.distanceM / 100) / 10));
  await page.getByRole('radio', { name: 'Strong' }).or(page.getByRole('button', { name: 'Strong' })).first().click();
  await page.screenshot({ path: path.join(OUT, 'log-session.png') });
  await page.getByRole('button', { name: 'Save and see feedback' }).click();
  await page.waitForURL(/\/activity\//);
  await page.locator('.verdict-card').waitFor({ timeout: 8000 }).catch(() => {});
  check(await page.locator('.verdict-card').isVisible(), 'saving opens the feedback for the run');
  await page.waitForTimeout(1800);
  const saved = mock.state.tables.activities.find((r) => r.source === 'manual' && r.user_id === uid);
  check(saved?.source_ids?.planned === q.id, 'the run is linked to the planned session');
  check((saved?.source_ids?.reps ?? []).filter((r) => r.timeS === 192).length >= 1, 'the reps are saved with the run');
  await page.goto(`${APP}/`); await page.waitForTimeout(800);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300);
  check(await page.getByText(/Linked to your/).isVisible(), 'the session now says "Linked to your … run"');

  // The watch file for the same run arrives later: it replaces the manual log, it does not add a second run
  const before = mock.state.tables.activities.filter((r) => r.user_id === uid && r.start_time.slice(0, 10) === q.date).length;
  const file = path.join(OUT, 'watch.gpx');
  fs.writeFileSync(file, gpx(`${q.date}T07:00:00Z`, q.distanceM / 1000, 230));
  await page.goto(`${APP}/profile/data`); await page.waitForTimeout(600);
  await page.locator('input[type=file]').first().setInputFiles(file);
  await page.getByText(/Imported \d+ new run|Duplicates merged/).first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const after = mock.state.tables.activities.filter((r) => r.user_id === uid && r.start_time.slice(0, 10) === q.date);
  check(after.length === before, `the later watch file merges with the manual log (runs that day: ${before} before, ${after.length} after)`);
  check(after.some((r) => r.source_ids?.planned === q.id), 'the merged run keeps its link to the planned session');

  // ---- Acceptance 7: screenshots → editable table of reps plus warm-up and cool-down ----
  const q2 = plan().sessions.find((s) => ['vo2max', 'threshold'].includes(s.type) && s.date > q.date) ?? null;
  if (q2) {
    later.setTime(new Date(`${q2.date}T09:00:00`).getTime() + 86400000);
    await ctx.clock.setSystemTime(later);
    const laps = [{ rep: 1, distance_m: 3000, time_s: 840, pace_s_per_km: null, avg_hr: 140, max_hr: null, cadence: null, unsure: [] }];
    for (let i = 0; i < 6; i++) { laps.push({ rep: laps.length + 1, distance_m: 1000, time_s: 192 + i, pace_s_per_km: null, avg_hr: 172, max_hr: null, cadence: null, unsure: i === 1 ? ['time_s'] : [] }); if (i < 5) laps.push({ rep: laps.length + 1, distance_m: 400, time_s: 150, pace_s_per_km: null, avg_hr: 150, max_hr: null, cadence: null, unsure: [] }); }
    laps.push({ rep: laps.length + 1, distance_m: 2000, time_s: 580, pace_s_per_km: null, avg_hr: 138, max_hr: null, cadence: null, unsure: [] });
    mock.state.lapRead = { laps, totals: { distance_m: 13000, time_s: 3400, avg_hr: 158 }, app: 'Garmin Connect' };
    await page.goto(`${APP}/session/${q2.id}`).catch(() => {});
    await page.goto(`${APP}/`); await page.waitForTimeout(800);
    const days = Math.round((new Date(`${ymd(later)}T12:00:00`) - new Date(`${q2.date}T12:00:00`)) / 86400000);
    for (let i = 0; i < days; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Log this session' }).click();
    await page.getByRole('radio', { name: 'Screenshots' }).or(page.getByRole('button', { name: 'Screenshots' })).first().click();
    const s1 = path.join(OUT, 'laps1.png'), s2 = path.join(OUT, 'laps2.png');
    fs.writeFileSync(s1, PNG); fs.writeFileSync(s2, PNG);
    await page.locator('.drop-zone input[type=file]').setInputFiles([s1, s2]);
    await page.getByRole('button', { name: 'Read the laps' }).click();
    await page.locator('.rep-table').waitFor({ timeout: 10000 });
    const kinds = await page.locator('.rep-table tbody th').allTextContents();
    check(kinds.filter((k) => /^Rep \d/.test(k)).length === 6 && kinds.some((k) => /Warm-up/.test(k)) && kinds.some((k) => /Cool-down/.test(k)), `two screenshots give an editable table of 6 reps plus warm-up and cool-down (${kinds.length} rows)`);
    check(await page.locator('.rep-table input.unsure').count() === 1, 'the value the reader was not sure about is highlighted to check');
    await page.screenshot({ path: path.join(OUT, 'screenshots-table.png') });
    check([...mock.state.files.keys()].filter((k) => k.startsWith(`run-media/${uid}/`)).length === 2, 'both screenshots are stored in the runner\'s private folder');
    await page.getByRole('radio', { name: 'Strong' }).or(page.getByRole('button', { name: 'Strong' })).first().click();
    await page.getByRole('button', { name: 'Save and see feedback' }).click();
    await page.waitForURL(/\/activity\//);
    await page.waitForTimeout(1800);
    const run2 = mock.state.tables.activities.find((r) => r.source_ids?.planned === q2.id);
    check((run2?.source_ids?.reps ?? []).filter((r) => r.kind === 'work').length === 6, 'the confirmed reps are saved with the run');
    check((run2?.source_ids?.media ?? []).length === 2, 'the screenshots stay attached to the run');
  } else check(false, 'no second past quality session to test screenshots');

  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
