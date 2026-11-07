// No cap on the number of runs: an account with 10,000 (then 12,000) runs loads every run, newest included,
// PBs include best efforts inside the newest run, and no detailed data (streams/laps) is downloaded for the
// history. A repeat visit fetches only what changed. Usage: node e2e/scale.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanProfile } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const DAY = 86400000;

/** Streams for a run: warm-up, then `fastKm` at `fastPace`, then cool-down, one point per second */
function streams(totalKm, fastKm, fastPace) {
  const pts = [{ t: 0, d: 0, hr: 140 }];
  let t = 0, d = 0;
  const leg = (km, pace) => { const v = 1000 / pace; for (let i = 0; i < km * pace; i++) { t++; d += v; pts.push({ t, d: Math.round(d * 10) / 10, hr: 160 }); } };
  const easy = (totalKm - fastKm) / 2;
  leg(easy, 270); leg(fastKm, fastPace); leg(easy, 270);
  return pts;
}

function seed(uid, n, today) {
  const rows = [];
  const start = today.getTime() - n * DAY / 1.3; // about 1.3 runs a day
  for (let i = 0; i < n; i++) {
    const t = new Date(start + i * DAY / 1.3);
    const km = 8 + (i % 7) * 2;
    rows.push({ id: `s-${i}`, user_id: uid, source: 'upload', source_ids: { upload: `s-${i}` }, start_time: t.toISOString(), name: 'Run',
      distance_m: km * 1000, duration_s: km * 280 + 20, moving_s: km * 280, elev_gain_m: 40, avg_hr: 145, max_hr: 165, avg_cadence: 178,
      is_race: false, detail_score: 6, imported_at: t.toISOString(), updated_at: t.toISOString(),
      // Older runs already have their summary; their detail sits in the account but must never be downloaded
      laps: [{ index: 1, distanceM: km * 1000, durationS: km * 280 }], streams: [{ t: 0, d: 0 }, { t: km * 280, d: km * 1000, hr: 150 }],
      derived: { v: 1, be: { 5000: 1400, 10000: 2800 } } });
  }
  // The newest run: a 10K with a 15:51 5K inside it, summary not worked out yet
  const s = streams(10, 5, 951 / 5);
  rows.push({ id: 'newest', user_id: uid, source: 'upload', source_ids: { upload: 'newest' }, start_time: new Date(today.getTime() - 3 * 3600000).toISOString(), name: 'Newest run',
    distance_m: s[s.length - 1].d, duration_s: s[s.length - 1].t, moving_s: s[s.length - 1].t, avg_hr: 170, max_hr: 185, is_race: false, detail_score: 8,
    imported_at: today.toISOString(), updated_at: today.toISOString(), laps: null, streams: s, derived: null });
  return rows;
}

async function account(n) {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = `scale-${n}@test.ritmo`;
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const today = new Date();
  mock.state.tables.profiles.push({ user_id: uid, data: { profile: { ...ryanProfile, name: 'Scale' }, mode: 'real', sources: [] }, updated_at: today.toISOString() });
  mock.state.tables.activities.push(...seed(uid, n, today));
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  // Count every byte of activity data the app downloads, and whether any streams/laps come with it
  let bytes = 0, streamBytes = 0, requests = 0;
  page.on('response', async (r) => {
    if (!r.url().includes('/rest/v1/activities')) return;
    requests++;
    try { const body = await r.text(); bytes += body.length; if (/"streams"|"laps"/.test(body)) streamBytes += body.length; } catch { /* HEAD */ }
  });

  const t0 = Date.now();
  await page.goto(`${APP}/progress`);
  await page.getByText(`${(n + 1).toLocaleString('en-GB').replace(/,/g, '')} runs`).or(page.getByText(`${n + 1} runs`)).first().waitFor({ timeout: 30000 });
  const loadMs = Date.now() - t0;
  check(true, `${n}: lifetime shows all ${n + 1} runs (loaded in ${(loadMs / 1000).toFixed(1)} s)`);
  check(streamBytes === 0, `${n}: no streams or laps downloaded for the history (${(bytes / 1024).toFixed(0)} KB of run summaries in ${requests} requests)`);
  // The newest run's summary is worked out on the server, then its 5K segment becomes the 5K PB
  await page.waitForFunction(() => document.body.innerText.includes('15:51'), null, { timeout: 30000 }).catch(() => {});
  check(await page.getByText('15:51').first().isVisible().catch(() => false), `${n}: the 5K PB (15:51) comes from inside the newest run`);
  await page.goto(`${APP}/calendar`);
  await page.waitForTimeout(800);
  check(await page.getByText('Newest run').or(page.getByText(/10\.0 km done/)).first().isVisible().catch(() => false), `${n}: the newest run is on the calendar`);

  // Repeat visit: only changes since the last sync are downloaded
  await page.waitForTimeout(2500);
  bytes = 0; requests = 0;
  const t1 = Date.now();
  await page.goto(`${APP}/progress`);
  await page.getByText(`${n + 1} runs`).first().waitFor({ timeout: 30000 });
  const repeatMs = Date.now() - t1;
  check(bytes < 50 * 1024, `${n}: repeat visit downloads only changes (${(bytes / 1024).toFixed(1)} KB, usable in ${(repeatMs / 1000).toFixed(1)} s)`);
  check(errors.length === 0, `${n}: no errors ${errors.slice(0, 2).join(' | ')}`);
  await b.close();
}

(async () => {
  await account(10000);
  await account(12000);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
