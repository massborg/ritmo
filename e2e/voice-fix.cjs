// Voice cues hardened after a tester heard problems. Each part simulates a way a real phone fails:
// 1. Quick run from Training: the run starts by itself once GPS is ready, with no tap on the Run screen. The Quick
//    run tap must unlock speech and the recorded clips, so the countdown is spoken.
// 2. Speech left paused (iPhone after the page was in the background): nothing is said unless resume() is called.
// 3. The chosen voice fails (not downloaded / needs signal): Ritmo retries with the default voice, no clips, and
//    Run settings lists the problem under "Voice problems on this device".
// 4. Speech that starts late (a slow phone): briefly "blocked", then back to speech on its own, clips stopped.
// 5. No speech at all (Android's in-app browser has none): recorded clips from the first cue.
// 6. A block is not for ever: Test voice checks speech again.
// Usage: node e2e/voice-fix.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const LAT0 = 35.9, LON0 = 14.5;

// A phone's speech, in one of several moods; records what is spoken (and with which voice) and the clips played
const speech = (mode) => {
  window.__spoken = []; window.__clips = []; window.__srcs = []; window.__mode = mode;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.rate = 1; } };
  if (mode === 'none') { try { delete window.speechSynthesis; } catch { /* */ } Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => undefined }); delete window.speechSynthesis; }
  else {
    const voices = [{ name: 'Daniel', lang: 'en-GB', voiceURI: 'daniel', localService: true }, { name: 'Serena (Premium)', lang: 'en-GB', voiceURI: 'serena', localService: true }];
    const synth = {
      speaking: false, pending: false, paused: mode === 'paused',
      getVoices: () => voices,
      resume() { synth.paused = false; window.__resumed = (window.__resumed || 0) + 1; },
      cancel() { synth.speaking = false; },
      speak(u) {
        window.__spoken.push({ text: u.text, voice: u.voice?.voiceURI });
        if (!u.text.trim()) return;
        const m = window.__mode;
        if (m === 'paused' && synth.paused) return; // queued, silently, until resume()
        if (m === 'voice-fails' && u.voice?.voiceURI === 'serena') { setTimeout(() => u.onerror?.({ error: 'synthesis-failed' }), 20); return; }
        if (m === 'blocked') return;
        const delay = m === 'late' ? 3000 : 0;
        synth.speaking = true;
        setTimeout(() => u.onstart?.(), delay);
        setTimeout(() => { synth.speaking = false; u.onend?.(); }, delay + 300);
      },
      addEventListener() {}, removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__srcs.push(this.src); if (this.dataset?.clip) window.__clips.push(this.dataset.clip); try { return play.call(this).catch(() => {}); } catch { return Promise.resolve(); } };
};

async function account(b, mock, email, mode, settings = {}) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: LAT0, longitude: LON0, accuracy: 5 }, permissions: ['geolocation'] });
  await ctx.addInitScript((s) => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); localStorage.setItem('ritmo:run:pocket', 'off'); localStorage.setItem('ritmo:run:settings', JSON.stringify({ countdown: 3, cues: 'km', autoPause: false, screenOn: false, rate: 1, ...s })); } catch { /* */ } }, settings);
  await ctx.addInitScript(speech, mode);
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
  return { ctx, page, errors };
}
const said = (page) => page.evaluate(() => window.__spoken.filter((x) => x.text.trim()).map((x) => x.text));
const startFree = async (page) => {
  await page.goto(`${APP}/run`); await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Free run' }).click().catch(() => {});
  await page.getByText(/GPS ready/).waitFor({ timeout: 10000 });
};

(async () => {
  const mock = createMock();
  const b = await chromium.launch();

  // ---- 1. Quick run: starts by itself, cues spoken ----
  const A = await account(b, mock, 'vf-quick@test.ritmo', 'works');
  let page = A.page;
  // A blocked state left over from an earlier run on this device must not carry over
  await page.goto(`${APP}/`); await page.waitForTimeout(800);
  await page.evaluate(() => { window.__spoken.length = 0; window.__srcs.length = 0; });
  await page.locator('.quick-run-btn').first().click();
  await page.waitForURL(/\/run/);
  const srcsAtTap = await page.evaluate(() => window.__srcs.slice());
  check(srcsAtTap.some((s) => /silence\.mp3/.test(s)), 'the Quick run tap unlocks the recorded clips');
  check((await page.evaluate(() => window.__spoken.length)) >= 1, 'and unlocks speech (a silent word inside the tap)');
  await page.locator('.run-live').waitFor({ timeout: 15000 }); await page.waitForTimeout(500);
  const q = await said(page);
  check(['3', '2', '1'].every((n) => q.includes(n)) && q.some((t) => /^Go/.test(t)), `the countdown is spoken on a Quick run (${q.join(' | ')})`);
  check((await page.evaluate(() => window.__clips.length)) === 0, 'with speech, not the recorded clips');
  check(A.errors.length === 0, `no page errors${A.errors.length ? `: ${A.errors[0]}` : ''}`);

  // ---- 2. Speech left paused: resume() before speaking ----
  const P = await account(b, mock, 'vf-paused@test.ritmo', 'paused');
  page = P.page;
  await startFree(page);
  await page.locator('.run-go').click();
  const sheetP = page.getByRole('dialog', { name: 'Before you start' });
  await sheetP.waitFor(); await page.waitForTimeout(600);
  check(/Voice cues working/.test(await sheetP.innerText()), 'paused speech is resumed, and the sheet says "Voice cues working"');
  check((await page.evaluate(() => window.__resumed || 0)) > 0, 'resume() was called before speaking');

  // ---- 3. The chosen voice fails: default voice, no clips, problem listed ----
  const V = await account(b, mock, 'vf-voice@test.ritmo', 'voice-fails', { voiceURI: 'serena' });
  page = V.page;
  await startFree(page);
  await page.locator('.run-go').click();
  const sheetV = page.getByRole('dialog', { name: 'Before you start' });
  await sheetV.waitFor(); await page.waitForTimeout(800);
  check(/Voice cues working/.test(await sheetV.innerText()), 'when the chosen voice fails, the default voice speaks and voice counts as working');
  await page.goto(`${APP}/run`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Run settings' }).click().catch(() => {});
  const settings = page.getByRole('dialog', { name: 'Run settings' });
  const hasSettings = await settings.waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (hasSettings) {
    const sum = settings.getByText(/Voice problems on this device/);
    check(await sum.isVisible().catch(() => false), 'Run settings lists "Voice problems on this device"');
    await sum.click();
    check(/default voice used/.test(await settings.innerText()), 'with what happened (chosen voice failed, default voice used)');
  } else check(false, 'Run settings opens');

  await startFree(page);
  await page.locator('.run-go').click();
  await sheetV.waitFor(); await page.waitForTimeout(400);
  await sheetV.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.run-live').waitFor({ timeout: 10000 }); await page.waitForTimeout(400);
  const vs = await page.evaluate(() => window.__spoken.filter((x) => x.text.trim()));
  const after = vs.slice(vs.findIndex((x) => !x.voice));
  check(after.length >= 4 && after.every((x) => !x.voice), `after the failure every cue uses the default voice (${vs.map((x) => `${x.text}:${x.voice || 'default'}`).join(' | ')})`);
  check((await page.evaluate(() => window.__clips.length)) === 0, 'and no recorded clips play');
  // ---- 4. Speech that starts late: back to speech on its own ----
  const L = await account(b, mock, 'vf-late@test.ritmo', 'late');
  page = L.page;
  await startFree(page);
  await page.locator('.run-go').click();
  const sheetL = page.getByRole('dialog', { name: 'Before you start' });
  await sheetL.waitFor();
  await page.waitForTimeout(6500);
  check(/Voice cues working/.test(await sheetL.innerText()), 'speech that starts late is seen working again (not "blocked" for the whole run)');
  await page.evaluate(() => { window.__mode = 'works'; window.__clips.length = 0; window.__spoken.length = 0; });
  await sheetL.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.run-live').waitFor({ timeout: 10000 }); await page.waitForTimeout(400);
  const l = await said(page);
  check(l.includes('3') && (await page.evaluate(() => window.__clips.length)) === 0, `the run's cues are spoken, not played from clips (${l.join(' | ')})`);

  // ---- 5. No speech at all: clips from the first cue ----
  const N = await account(b, mock, 'vf-none@test.ritmo', 'none');
  page = N.page;
  check(!(await page.evaluate(() => 'speechSynthesis' in window && !!window.speechSynthesis)), '(this browser has no speech, like Android\'s in-app browser)');
  await startFree(page);
  await page.locator('.run-go').click();
  const sheetN = page.getByRole('dialog', { name: 'Before you start' });
  await sheetN.getByText('Voice is blocked').waitFor({ timeout: 4000 });
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__clips.slice())).includes('ready'), 'the recorded "Ready when you are" plays straight away');
  check(N.errors.length === 0, `no page errors${N.errors.length ? `: ${N.errors[0]}` : ''}`);

  // ---- 6. Blocked, then fixed (silent switch off): Test voice checks again ----
  const B = await account(b, mock, 'vf-blocked@test.ritmo', 'blocked');
  page = B.page;
  await startFree(page);
  await page.locator('.run-go').click();
  const sheetB = page.getByRole('dialog', { name: 'Before you start' });
  await sheetB.getByText('Voice is blocked').waitFor({ timeout: 7000 });
  check(/tap Test voice to try again/i.test(await sheetB.innerText()), 'the blocked message says to tap Test voice to try again');
  await page.evaluate(() => { window.__mode = 'works'; });
  await sheetB.getByRole('button', { name: 'Test voice' }).click(); await page.waitForTimeout(600);
  check(/Voice cues working/.test(await sheetB.innerText()), 'after the fix, Test voice finds speech working again');
  check((await said(page)).at(-1) === 'Voice cues are working.', 'and says "Voice cues are working"');

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
