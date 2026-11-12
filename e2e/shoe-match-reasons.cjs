// Strava shoes matched to Ritmo shoes (asked once), and why runners are suggested in Find runners.
// - Strava runs logged with a pair of shoes: Training asks once which Ritmo shoe that is; the answer assigns those
//   runs, and new runs with the same shoes, to it. "Don't track these" stops the question for that pair.
// - Find runners: "Followed by …" (a runner you follow follows them), "N mutual followers", "Also racing … · date"
//   (a race you both have) and "Runs near …" (the same area).
// Usage: node e2e/shoe-match-reasons.cjs (app on :4173). Made-up runners only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'shoe-match-reasons');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const tap = async (loc) => { await loc.waitFor({ timeout: 15000 }); await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await loc.click(); };
const ymd = (d) => d.toISOString().slice(0, 10);

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'shoematch@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const since = ymd(new Date(Date.now() - 400 * 86400e3));
  rows.profiles[0].data.profile.shoes = [
    { id: 'shoe-peg', name: 'Nike Pegasus 41 (Black)', brand: 'Nike', model: 'Pegasus 41', startDate: since, startKm: 0, retireKm: 700, use: 'everyday' },
    { id: 'shoe-vapor', name: 'Nike Vaporfly 3', brand: 'Nike', model: 'Vaporfly 3', startDate: since, startKm: 0, retireKm: 350, use: 'fast' },
  ];
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  // Three Strava runs logged with the same pair, and one with a pair that isn't running shoes
  const strava = (n, daysAgo, gear) => { const t = new Date(Date.now() - daysAgo * 86400e3); t.setUTCHours(18, 10, 0, 0); return { user_id: uid, id: `strava-9${n}`, source: 'strava', source_ids: { strava: `9${n}`, gear }, start_time: t.toISOString(), name: `Strava evening ${n}`, distance_m: 8000 + n * 100, duration_s: 2500, moving_s: 2480, detail_score: 3, updated_at: new Date().toISOString() }; };
  const peg = { id: 'g-peg', name: 'Pegasus black' };
  mock.state.tables.activities.push(strava(1, 2, peg), strava(2, 4, peg), strava(3, 6, peg));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  const row = (id) => mock.state.tables.activities.find((r) => r.id === id);

  // ---- Asked once on Training ----
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  const q = page.locator('section.gear-question');
  check(await q.isVisible() && /Pegasus black/.test(await q.innerText()) && /3 runs/.test(await q.innerText()), 'Training asks which shoes "Pegasus black" (3 Strava runs) are');
  await q.screenshot({ path: path.join(OUT, 'gear-question.png') });
  await tap(q.getByRole('button', { name: 'Nike Pegasus 41 (Black)' }));
  await page.waitForTimeout(3000);
  check(['strava-91', 'strava-92', 'strava-93'].every((id) => row(id)?.source_ids?.shoe === 'shoe-peg'), 'answering assigns those runs to the Pegasus');
  check(await page.locator('section.gear-question').count() === 0, 'and the question goes away');
  // A new run with the same shoes is assigned without asking
  mock.state.tables.activities.push(strava(4, 1, peg));
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`);
  for (let i = 0; i < 20 && row('strava-94')?.source_ids?.shoe !== 'shoe-peg'; i++) await page.waitForTimeout(500);
  check(row('strava-94')?.source_ids?.shoe === 'shoe-peg', 'a new Strava run with the same shoes counts for the Pegasus automatically');
  // A pair that isn't for running: "Don't track these"
  mock.state.tables.activities.push(strava(5, 1, { id: 'g-walk', name: 'Walking boots' }));
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/profile/shoes`); await page.waitForTimeout(2500);
  const q2 = page.locator('section.gear-question');
  check(await q2.isVisible() && /Walking boots/.test(await q2.innerText()), 'Profile › Shoes asks about the next pair');
  await tap(q2.getByRole('button', { name: "Don't track these" }));
  await page.waitForTimeout(2500);
  const prof = mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  check(prof.gearMap?.['g-walk'] === 'ignore' && prof.gearMap?.['g-peg'] === 'shoe-peg' && await page.locator('section.gear-question').count() === 0, '"Don\'t track these" is remembered and not asked again');
  check(!row('strava-95')?.source_ids?.shoe, 'and that run keeps the automatic shoe choice');

  // ---- Find runners reasons ----
  await page.goto(`${APP}/hub`);
  await page.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
  await page.locator('#hub-name').fill('Sam Shoes');
  await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click();
  await page.waitForTimeout(2500);
  mock.state.tables.hub_profiles.find((h) => h.user_id === uid).area = 'Sliema';
  const id = () => crypto.randomUUID();
  const [cal, bea, dan, eva, fay, gus] = [id(), id(), id(), id(), id(), id()];
  const hp = (user_id, display_name, extra = {}) => ({ user_id, display_name, search_name: display_name.toLowerCase(), private: false, ...extra });
  mock.state.tables.hub_profiles.push(hp(cal, 'Cal Camilleri'), hp(bea, 'Bea Borg Testa'), hp(dan, 'Dan Borg Testa'), hp(eva, 'Eva Borg Testa', { area: 'Sliema' }), hp(fay, 'Fay Fenech'), hp(gus, 'Gus Galea'));
  const fol = (a, z) => ({ follower_id: a, followee_id: z, status: 'accepted', created_at: new Date().toISOString() });
  // You follow Cal, Fay and Gus; Cal follows Bea (one mutual); Fay and Gus follow Dan (two)
  mock.state.tables.follows.push(fol(uid, cal), fol(uid, fay), fol(uid, gus), fol(cal, bea), fol(fay, dan), fol(gus, dan));
  // A race you both have: yours and Eva's, same date and distance
  const raceDay = ymd(new Date(Date.now() + 25 * 86400e3));
  mock.state.tables.races.push({ user_id: uid, id: 'r-me', data: { id: 'r-me', name: 'Harbour 10K', date: raceDay, distanceM: 10000, priority: 'B' } }, { user_id: eva, id: 'r-eva', data: { id: 'r-eva', name: 'harbour ten', date: raceDay, distanceM: 10000 } });
  await page.goto(`${APP}/hub/find`); await page.waitForTimeout(800);
  await page.getByRole('searchbox').pressSequentially('borg testa', { delay: 30 }); await page.waitForTimeout(1800);
  const line = async (n) => (await page.locator('.find-row', { hasText: n }).innerText()).replace(/\s+/g, ' ');
  check(/Followed by Cal Camilleri/.test(await line('Bea Borg Testa')), '"Followed by Cal Camilleri": a runner you follow follows Bea');
  check(/2 mutual followers/.test(await line('Dan Borg Testa')), '"2 mutual followers" for Dan');
  const d = new Date(`${raceDay}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  check(new RegExp(`Also racing Harbour 10K · ${d}`).test(await line('Eva Borg Testa')), `"Also racing Harbour 10K · ${d}": a race you both have, with your name for it`);
  await page.screenshot({ path: path.join(OUT, 'find-reasons.png') });
  // The same area, when nothing more personal applies
  mock.state.tables.races = mock.state.tables.races.filter((r) => r.user_id !== eva);
  await page.getByRole('searchbox').fill(''); await page.getByRole('searchbox').pressSequentially('eva', { delay: 30 }); await page.waitForTimeout(1500);
  check(/Runs near Sliema/.test(await line('Eva Borg Testa')), '"Runs near Sliema" for someone in the same area');
  // A private runner's race is never used
  mock.state.tables.hub_profiles.find((h) => h.user_id === eva).private = true;
  mock.state.tables.races.push({ user_id: eva, id: 'r-eva2', data: { id: 'r-eva2', name: 'x', date: raceDay, distanceM: 10000 } });
  await page.getByRole('searchbox').fill(''); await page.getByRole('searchbox').pressSequentially('eva', { delay: 30 }); await page.waitForTimeout(1500);
  check(!/Also racing/.test(await line('Eva Borg Testa')), 'a private runner\'s races are never used');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
