const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
// A beginner on a starter plan with two very short runs (under 1 km in total): every main screen still opens.
// The You screen used to crash ("Something went wrong") when no day reached 1 km. Usage: node e2e/short-runs.cjs
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const APP = process.env.APP_URL || 'http://localhost:4173', SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch {} });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const email = 'short@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const now = new Date(); const d1 = new Date(now); d1.setDate(now.getDate() - 1);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const profile = { mode: 'real', profile: { goal: 'Run more often', name: 'Test', theme: 'system', units: 'km', starter: { canRun10: false, startedAt: ymd(now), walksRegularly: false }, consents: { aiCoach: { at: now.toISOString(), granted: true }, healthData: { at: now.toISOString(), granted: true, version: '2026-11' }, hubSharing: { at: now.toISOString(), granted: true, version: '2026-11' } }, goalType: 'fit', injuries: [], schedule: { timeOff: [], startDate: ymd(now), sessionMinutes: 20 }, birthYear: 1990, onboarded: true, reminders: { evening: '20:00', morning: '07:00' }, setupStep: 'done', background: { level: 'new', canRun10: false, exerciseTypes: ['Cycling'], walksRegularly: false, exerciseDaysPerWeek: 2 }, challenges: [], experience: 'new', longRunDay: 5, dateOfBirth: '1990-01-01', healthCheck: { completedAt: now.toISOString(), doctorAdvised: false }, daysAvailable: [1, 3, 5], setupStepsDone: ['consent','basics','health','background','goal','schedule','injuries','runs'], healthConsentAt: now.toISOString(), injuriesAnswered: true, setupCompletedAt: now.toISOString() }, sources: [{ kind: 'strava', connected: true, lastSyncAt: now.toISOString(), activityCount: 0 }] };
  mock.state.tables.profiles.push({ user_id: uid, data: profile, updated_at: now.toISOString() });
  const st = (n, dist) => Array.from({ length: n }, (_, i) => ({ t: i * (300 / n), d: i * (dist / n), lat: 35.9 + i * 0.00002, lon: 14.5 + i * 0.00002 }));
  const w = { c: 'cloudy', h: 74, t: 19.6, at: d1.toISOString(), dp: 14.8, fl: 19.6, wd: 209, ws: 10.1, src: 'met.no' };
  mock.state.tables.activities.push(
    { user_id: uid, id: 'gps-1', source: 'ritmo_gps', source_ids: { weather: w, ritmo_gps: 'gps-1' }, start_time: new Date(d1.getTime() + 7 * 3600e3).toISOString(), name: 'Morning run', distance_m: 345, duration_s: 317, moving_s: 316, elev_gain_m: 25, is_race: false, detail_score: 6, derived: { v: 1 }, streams: st(20, 345), updated_at: now.toISOString() },
    { user_id: uid, id: 'gps-2', source: 'ritmo_gps', source_ids: { weather: w, ritmo_gps: 'gps-2' }, start_time: new Date(d1.getTime() + 8 * 3600e3).toISOString(), name: 'Morning run', distance_m: 414, duration_s: 256, moving_s: 254, elev_gain_m: 10, is_race: false, detail_score: 6, derived: { v: 1, be: { 400: 175.2 } }, streams: st(151, 414), updated_at: now.toISOString() });
  mock.state.tables.session_feedback.push({ user_id: uid, activity_id: 'gps-2', data: { rpe: 5, feel: 5, pain: [], loggedAt: now.toISOString(), activityId: 'gps-2' } });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  for (const name of [/Build my plan/, /Start my plan/, /starter/i]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1500); } }
  for (const p of ['/you', '/you?tab=races', '/run', '/', '/coach', '/hub']) {
    errors.length = 0;
    await page.goto(`${APP}${p}`); await page.waitForTimeout(2500);
    const wrong = await page.getByText(/Something went wrong/i).count();
    check(wrong === 0 && errors.length === 0, `${p} opens without an error${errors.length ? `: ${errors[0].split('\n')[0]}` : ''}`);
  }
  check(/0\.8|0\.7/.test(await (await (async () => { await page.goto(`${APP}/you`); await page.waitForTimeout(2000); return page.locator('.you-big'); })()).innerText()), 'You shows the small total');
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
