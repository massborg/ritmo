// Update 3, §2–3: voice cues and the locked screen.
// - The Start tap says "Ready when you are" straight away, and opens "Before you start": GPS, "Voice cues working",
//   the Pocket mode warning, Test voice and Start run
// - Pocket mode: a black screen with big distance, time and pace and "Voice cues on · next at 1 km"; taps do nothing;
//   swipe up unlocks; a Pocket mode button brings it back
// - Speech blocked (an iPhone on silent, no voice): "Voice is blocked" with what to check, Ritmo's recorded clips
//   play instead, and the failure is logged on the device
// - A saved run with a GPS gap: "GPS paused for 6 min, your phone was locked 18:12–18:18", a dashed line on the map,
//   "Keep as is" or "Add the missing km"
// Usage: node e2e/u3-stage2.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u3-stage2');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const LAT0 = 35.9, LON0 = 14.5;

// Speech that works (reports onstart) or is blocked (never starts), and a record of the recorded clips played
const speech = (works) => {
  window.__spoken = []; window.__clips = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.rate = 1; } };
  const synth = { speaking: false, getVoices: () => [{ name: 'Daniel', lang: 'en-GB', voiceURI: 'daniel', localService: true }],
    speak(u) { window.__spoken.push(u.text); if (works) setTimeout(() => u.onstart?.(), 0); }, cancel() {}, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (this.dataset?.clip) window.__clips.push(this.dataset.clip); try { return play.call(this).catch(() => {}); } catch { return Promise.resolve(); } };
};

async function account(b, mock, email, works) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 5 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); localStorage.setItem('ritmo:run:settings', JSON.stringify({ countdown: 3, cues: 'km', autoPause: false, screenOn: false })); } catch { /* */ } });
  await ctx.addInitScript(speech, works);
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
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
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  return { ctx, page, uid, errors };
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();

  // ---- 1. Voice works: the Start tap primes it, and the sheet says so ----
  const A = await account(b, mock, 'voice-ok@test.ritmo', true);
  let page = A.page;
  await page.goto(`${APP}/run`); await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'Free run' }).click().catch(() => {});
  await page.locator('.run-go').click();
  // The tap also says a silent word (it unlocks speech on iPhone); the first real phrase is "Ready when you are"
  const spokenAtTap = await page.evaluate(() => window.__spoken.filter((t) => t.trim()));
  check(spokenAtTap[0] === 'Ready when you are.', `the Start tap speaks "Ready when you are" straight away (${JSON.stringify(spokenAtTap)})`);
  const sheet = page.getByRole('dialog', { name: 'Before you start' });
  await sheet.waitFor();
  await page.waitForTimeout(500);
  const st = await sheet.innerText();
  check(/GPS ready/.test(st), 'the sheet shows GPS ready');
  check(/Voice cues working/.test(st), 'and "Voice cues working" once the phrase played');
  check(/Don't lock your phone, use Pocket mode/.test(st), 'with the warning "Don\'t lock your phone, use Pocket mode"');
  check(await sheet.getByRole('checkbox', { name: 'Start in Pocket mode' }).isChecked(), 'Pocket mode is offered (on by default)');
  await sheet.screenshot({ path: path.join(OUT, 'before-you-start.png') });
  await page.getByRole('button', { name: 'Test voice' }).click(); await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__spoken.at(-1))) === 'Voice cues are working.', 'Test voice speaks');
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.pocket').waitFor({ timeout: 10000 });
  const pocketText = await page.locator('.pocket').innerText();
  check(/0\.00\s*km/.test(pocketText) && /Voice cues on · next at 1 km/.test(pocketText), `Pocket mode shows the distance and "Voice cues on · next at 1 km" (${pocketText.replace(/\s+/g, ' ').slice(0, 90)})`);
  const bg = await page.locator('.pocket').evaluate((e) => getComputedStyle(e).backgroundColor);
  check(bg === 'rgb(0, 0, 0)', 'it is black');
  await page.screenshot({ path: path.join(OUT, 'pocket.png') });
  // Taps do nothing; a swipe up unlocks
  await page.mouse.click(195, 420); await page.waitForTimeout(300);
  check(await page.locator('.pocket').isVisible(), 'a tap does nothing');
  // A finger swipe (touch events, as on a phone)
  const cdp = await A.ctx.newCDPSession(page);
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
  check(await page.evaluate(() => [100, 330, 600, 650].every((y) => !!document.elementFromPoint(195, y)?.closest('.pocket'))), 'it covers the whole screen, tab bar included (nothing can be tapped underneath)');
  if (process.env.DEBUG) await page.evaluate(() => { window.__te = []; for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointercancel']) document.addEventListener(t, (e) => window.__te.push(`${t}:${e.target.className}`), true); });
  await touch('touchStart', 600); for (const y of [560, 500, 440, 380, 320]) await touch('touchMove', y); await touch('touchEnd');
  if (process.env.DEBUG) console.log('te', await page.evaluate(() => window.__te.join(' ')), await page.locator('.pocket').count());
  await page.waitForTimeout(400);
  check(await page.locator('.pocket').count() === 0 && await page.locator('.run-live').isVisible(), 'a swipe up unlocks it');
  await page.getByRole('button', { name: 'Pocket mode' }).click();
  check(await page.locator('.pocket').isVisible(), 'the Pocket mode button brings it back while recording');
  check(A.errors.length === 0, `no page errors${A.errors.length ? `: ${A.errors[0]}` : ''}`);

  // ---- 2. Voice blocked: shown clearly, recorded clips instead, logged ----
  const B = await account(b, mock, 'voice-blocked@test.ritmo', false);
  page = B.page;
  await page.goto(`${APP}/run`); await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'Free run' }).click().catch(() => {});
  await page.locator('.run-go').click();
  const sheet2 = page.getByRole('dialog', { name: 'Before you start' });
  await sheet2.getByText('Voice is blocked').waitFor({ timeout: 5000 });
  const t2 = await sheet2.innerText();
  check(/silent switch/.test(t2) && /volume/.test(t2) && /voice is installed/i.test(t2), 'Voice is blocked, with what to check: silent switch, volume, voice installed');
  await sheet2.screenshot({ path: path.join(OUT, 'voice-blocked.png') });
  check((await page.evaluate(() => window.__clips.slice())).includes('ready'), 'the recorded "Ready when you are" plays instead');
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:voice-log') || '[]'));
  check(log.length === 1 && /nothing spoken within 2\.5 s/.test(log[0].why), `the failure is logged on the device (${log[0]?.why})`);
  // Test voice checks speech again (it may work now), then plays the recorded clip
  await page.getByRole('button', { name: 'Test voice' }).click(); await page.waitForTimeout(5200);
  check((await page.evaluate(() => window.__clips.slice())).includes('voice-check'), 'Test voice checks speech again, then plays the recorded clip');
  // Start the run: cues go straight to the clips (no 2 s wait each time)
  await page.getByRole('checkbox', { name: 'Start in Pocket mode' }).uncheck();
  const before = await page.evaluate(() => window.__spoken.length);
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.run-live').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const clips = await page.evaluate(() => window.__clips.slice());
  check(clips.includes('3') && clips.includes('go') && (await page.evaluate(() => window.__spoken.length)) === before, `the countdown and "Go" come from the clips (${clips.slice(-5).join(', ')})`);
  check(B.errors.length === 0, `no page errors${B.errors.length ? `: ${B.errors[0]}` : ''}`);

  // ---- 3. A saved run with a GPS gap ----
  page = A.page;
  const start = new Date(Date.now() - 3 * 3600e3); start.setSeconds(0, 0);
  const pts = [];
  // 2 km, then 6 minutes with no GPS, then 2 km more (4:00/km)
  for (let i = 0; i <= 120; i++) pts.push({ t: i * 4, d: i * 16.7, lat: LAT0 + (i * 16.7) / 111195, lon: LON0 });
  const off = 120 * 16.7 + 1500;
  for (let i = 0; i <= 120; i++) pts.push({ t: 480 + i * 4, d: 2004 + i * 16.7, lat: LAT0 + (off + i * 16.7) / 111195, lon: LON0 + 0.002, ...(i === 0 ? { gap: true } : {}) });
  const from = new Date(start.getTime() + 480e3), to = new Date(start.getTime() + 840e3);
  const gapRun = (id, name) => ({ user_id: A.uid, id, source: 'ritmo_gps', source_ids: { ritmo_gps: id, gaps: [{ from: from.toISOString(), to: to.toISOString(), atM: 2004 }] }, start_time: start.toISOString(), name, distance_m: 4008, duration_s: 1320, moving_s: 960, detail_score: 6, laps: null, streams: pts, updated_at: new Date().toISOString() });
  mock.state.tables.activities.push(gapRun('gps-gap-1', 'Locked phone run'), gapRun('gps-gap-2', 'Second locked run'));
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/activity/gps-gap-1`); await page.waitForTimeout(2500);
  const hm = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const notice = page.locator('.gap-notice');
  const nt = await notice.innerText().catch(() => '');
  check(new RegExp(`GPS paused for 6 min, your phone was locked ${hm(from)}–${hm(to)}`).test(nt), `the run says "GPS paused for 6 min, your phone was locked ${hm(from)}–${hm(to)}"`);
  check(/left the gap out of your distance and pace/.test(nt), 'and that it was left out of distance and pace');
  check(await page.locator('.route-map line.route-gap').count() === 1 && /GPS gap/.test(await page.locator('main').innerText()), 'the gap is a dashed line on the map');
  await notice.screenshot({ path: path.join(OUT, 'gap-notice.png') });
  await page.locator('.route-map').first().screenshot({ path: path.join(OUT, 'gap-map.png') });
  await page.getByRole('button', { name: 'Keep as is' }).click(); await page.waitForTimeout(2500);
  const row1 = mock.state.tables.activities.find((r) => r.id === 'gps-gap-1');
  check(await page.locator('.gap-notice').count() === 0 && row1.source_ids.gaps[0].resolved === 'kept' && Number(row1.distance_m) === 4008, '"Keep as is" keeps the distance and is saved');
  await page.goto(`${APP}/activity/gps-gap-2`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Add the missing km' }).click();
  await page.getByLabel(/Distance run during the gap/).fill('1.5');
  await page.getByRole('button', { name: 'Add', exact: true }).click(); await page.waitForTimeout(2500);
  const row2 = mock.state.tables.activities.find((r) => r.id === 'gps-gap-2');
  check(Number(row2.distance_m) === 5508 && Number(row2.moving_s) === 1320 && row2.source_ids.gaps[0].resolved === 'added', `"Add the missing km" adds 1.5 km and the gap's time (${row2.distance_m} m, ${row2.moving_s} s)`);
  check(/Added by you for the GPS gap .*1\.50 km/.test(await page.locator('.gap-notice').innerText().catch(() => '')), 'and says it was added by you');

  check(A.errors.length === 0, `no page errors at the end${A.errors.length ? `: ${A.errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
