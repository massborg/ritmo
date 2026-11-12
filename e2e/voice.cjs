// Voices for spoken cues: Run settings (the sheet behind the Run screen's Settings button) lists the device's best English voices (novelty voices left out), each
// with a play button; choosing one (and a speed) is remembered on the device, and the run's cues use it.
// The browser's speech is stubbed with an iPhone-like voice list, recording what is spoken and with which voice.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

const stub = () => {
  const list = [
    ['Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'],
    ['Serena (Premium)', 'en-GB', 'com.apple.voice.premium.en-GB.Serena'],
    ['Samantha (Enhanced)', 'en-US', 'com.apple.voice.enhanced.en-US.Samantha'],
    ['Karen', 'en-AU', 'com.apple.voice.compact.en-AU.Karen'],
    ['Zarvox', 'en-US', 'com.apple.speech.synthesis.voice.Zarvox'],
    ['Thomas', 'fr-FR', 'com.apple.voice.compact.fr-FR.Thomas'],
  ].map(([name, lang, voiceURI]) => ({ name, lang, voiceURI, localService: true, default: false }));
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.rate = 1; } };
  const synth = { getVoices: () => (window.__voicesHidden ? [] : list), speak: (u) => { window.__spoken.push({ text: u.text, voice: u.voice?.voiceURI, rate: u.rate }); setTimeout(() => u.onstart?.(), 0); }, cancel() {}, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth });
};

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], geolocation: { latitude: 35.9, longitude: 14.5, accuracy: 5 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:run:pocket', 'off'); } catch { /* */ } });
  await ctx.addInitScript(stub);
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const email = 'voices@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => localStorage.setItem('ritmo:run:settings', JSON.stringify({ countdown: 3, cues: 'km', autoPause: false, screenOn: false })));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Train 6 days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.goto(`${APP}/run`);
  await page.getByRole('button', { name: 'Run settings' }).click();
  const list = page.getByRole('list', { name: 'Voices' });
  await list.waitFor();
  const names = await list.locator('.voice-name').allInnerTexts();
  check(names[0] === 'Automatic' && names[1] === 'Serena' && names[2] === 'Samantha', `the best voices come first: ${names.join(', ')}`);
  check(!names.includes('Zarvox') && !names.includes('Thomas'), 'novelty and non-English voices are left out');
  check(await list.getByText("British · woman's voice · Premium").isVisible(), 'each voice says what it sounds like ("British · woman\'s voice · Premium")');
  check(await list.getByText('The best voice on this device: Serena').isVisible(), 'Automatic says which voice it uses');
  check(await page.getByText(/Settings → Accessibility → Spoken Content → Voices/).isVisible(), 'on iPhone, explains how to download more natural voices');

  await page.getByRole('button', { name: 'Play Samantha' }).click();
  let last = await page.evaluate(() => window.__spoken.at(-1));
  check(last?.voice === 'com.apple.voice.enhanced.en-US.Samantha' && /Average pace/.test(last.text), 'the play button speaks a sample cue in that voice');
  check(await list.locator('.voice-row.on .voice-name').innerText() === 'Automatic', 'playing a voice does not choose it');

  await list.locator('.voice-pick', { hasText: 'Samantha' }).click();
  check(await list.locator('.voice-row.on .voice-name').innerText() === 'Samantha', 'tapping a voice chooses it (and plays it)');
  await page.getByRole('radio', { name: 'Faster' }).or(page.getByRole('button', { name: 'Faster' })).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:run:settings')));
  check(saved.voiceURI === 'com.apple.voice.enhanced.en-US.Samantha' && saved.rate === 1.1, 'the voice and speed are remembered on this device');

  await page.reload(); await page.getByRole('button', { name: 'Run settings' }).click();
  check(await page.getByRole('list', { name: 'Voices' }).locator('.voice-row.on .voice-name').innerText() === 'Samantha', 'after reopening, Samantha is still chosen');

  // One place for the voice: Profile links to Run settings instead of repeating it
  await page.goto(`${APP}/profile`);
  const link = page.getByRole('link', { name: /^Run settings/ });
  check(await link.waitFor({ timeout: 8000 }).then(() => true, () => false) && await page.getByRole('list', { name: 'Voices' }).count() === 0, 'Profile links to Run settings and does not repeat the voice list');
  await link.click(); await page.waitForURL(/\/run/);
  const card = page.getByRole('dialog', { name: 'Run settings' });
  await card.locator('.voice-row.on').waitFor();
  check(await card.locator('.voice-row.on .voice-name').innerText() === 'Samantha', 'the link opens Run settings with the chosen voice');
  await card.locator('.voice-pick', { has: page.locator('.voice-name', { hasText: /^Serena$/ }) }).click();
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:run:settings')))).voiceURI === 'com.apple.voice.premium.en-GB.Serena', 'choosing another voice there changes the voice used on runs');
  await card.locator('.voice-pick', { has: page.locator('.voice-name', { hasText: /^Samantha$/ }) }).click();
  await page.keyboard.press('Escape');

  // The run's spoken countdown uses the chosen voice and speed
  await page.evaluate(() => { window.__spoken.length = 0; });
  await page.getByRole('tab', { name: 'Free run' }).click().catch(() => {});
  await page.getByText(/GPS ready/).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Start', exact: true }).click(); await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.run-live').waitFor({ timeout: 8000 });
  const spoken = await page.evaluate(() => window.__spoken);
  check(spoken.length >= 3 && spoken.every((x) => x.voice === 'com.apple.voice.enhanced.en-US.Samantha' && x.rate === 1.1), `the run's cues use the chosen voice and speed (${spoken.map((x) => x.text).join(' | ')})`);

  // iPhone: the voice list is empty for a moment. The first cue must wait for the chosen voice, not use the default one
  await page.goto(`${APP}/run`); await page.getByRole('tab', { name: 'Free run' }).click().catch(() => {});
  await page.getByText(/GPS ready/).waitFor({ timeout: 10000 });
  await page.evaluate(() => { window.__spoken.length = 0; window.__voicesHidden = true; setTimeout(() => { window.__voicesHidden = false; }, 400); });
  await page.getByRole('button', { name: 'Start', exact: true }).click(); await page.getByRole('button', { name: 'Start run' }).click();
  await page.locator('.run-live').waitFor({ timeout: 10000 }); await page.waitForTimeout(1600);
  const late = await page.evaluate(() => window.__spoken.filter((x) => x.text));
  check(late.length >= 3 && late.every((x) => x.voice === 'com.apple.voice.enhanced.en-US.Samantha'), `when the phone lists its voices late, no cue is spoken in the default voice (${late.map((x) => `${x.text}:${x.voice ? 'chosen' : 'DEFAULT'}`).join(' | ')})`);

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
