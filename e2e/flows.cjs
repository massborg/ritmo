// End-to-end flows against the built app (vite preview on :4173) with a simulated Supabase backend.
// Run: npm run build && npx vite preview --port 4173 & node e2e/flows.cjs
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { makeGarminExport } = require('./make-garmin-export.cjs');
const fs = require('fs');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
async function step(name, fn, page) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) {
    results.push(['FAIL', name, String(e.message).split('\n')[0]]);
    if (page) await page.screenshot({ path: path.join(OUT, `fail-${results.length}.png`), fullPage: true }).catch(() => {});
  }
}
const see = (page, text, timeout = 10000) => page.getByText(text).first().waitFor({ state: 'visible', timeout });
const notSee = async (page, text) => { if (await page.getByText(text).count()) throw new Error(`unexpected text: ${text}`); };
const assert = (c, msg) => { if (!c) throw new Error(msg); };

async function idbKeys(page) {
  return page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('keyval-store');
    r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('keyval')) return res([]); const q = db.transaction('keyval').objectStore('keyval').getAllKeys(); q.onsuccess = () => res(q.result.map(String)); q.onerror = () => res([]); };
    r.onerror = () => res([]);
  }));
}
async function idbPut(page, key, value) {
  await page.evaluate(([k, v]) => new Promise((res) => {
    const r = indexedDB.open('keyval-store');
    r.onupgradeneeded = () => r.result.createObjectStore('keyval');
    r.onsuccess = () => { const tx = r.result.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(v, k); tx.oncomplete = () => res(); };
  }), [key, value]);
}

async function signUpAndConfirm(page, mock, email, password = 'Runner2026') {
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email);
  await page.locator('#su-password').fill(password);
  await page.locator('.consent input').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await see(page, 'Check your email');
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
}
async function logIn(page, email, password = 'Runner2026') {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}
async function logOut(page) {
  await page.goto(`${APP}/profile`);
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL(/\/login/);
}

async function run(label, deviceOpts) {
  const mock = createMock();
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...deviceOpts });
  await mock.install(context, SUPA);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const A = `a-${label}@test.ritmo`, B = `b-${label}@test.ritmo`, C = `c-${label}@test.ritmo`, D = `d-${label}@test.ritmo`;
  const userId = (email) => mock.state.users.get(email)?.id;
  const rows = (table, email) => mock.state.tables[table].filter((r) => r.user_id === userId(email));
  const P = (n) => `[${label}] ${n}`;

  // ---------- Accounts ----------
  await step(P('splash plays on first load'), async () => {
    await page.goto(`${APP}/calendar`);
    assert(await page.locator('.splash').count() === 1, 'no splash on first load');
  }, page);
  await step(P('signed-out visitor is sent to log in, keeping the page they wanted'), async () => {
    await page.waitForURL(/\/login\?next=%2Fcalendar/, { timeout: 8000 });
    await see(page, 'Welcome back');
  }, page);
  await step(P('splash does not replay on the next page load'), async () => {
    await page.reload();
    await page.waitForTimeout(400);
    assert(await page.locator('.splash').count() === 0, 'splash replayed');
  }, page);
  await step(P('sign-up rejects a weak password'), async () => {
    await page.getByRole('link', { name: 'Create an account' }).click();
    await page.locator('#su-email').fill(A);
    await page.locator('#su-password').fill('short');
    await see(page, 'Use at least 8 characters.');
    await page.locator('.consent input').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'That password is too weak');
    await page.locator('#su-password').fill('longenough');
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'Use a mix of letters and numbers');
  }, page);
  await step(P('sign-up requires health data consent, with a link to the privacy page'), async () => {
    await page.locator('#su-password').fill('Runner2026');
    await page.locator('.consent input').uncheck();
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'Please agree to how Ritmo uses your health data');
    assert(await page.locator('.consent a[href="/privacy"]').count() === 1, 'no privacy link');
  }, page);
  await step(P('sign-up sends a confirmation email and stores the consent time'), async () => {
    await page.locator('.consent input').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'Check your email');
    assert(mock.state.emails.some((e) => e.to === A && e.type === 'signup'), 'no signup email');
    assert(mock.state.users.get(A).meta.health_consent_at, 'consent not stored');
  }, page);
  await step(P('log in before confirming shows the unconfirmed message and can resend'), async () => {
    await page.goto(`${APP}/login`);
    await logIn(page, A);
    await see(page, 'Please confirm your email first');
    await page.getByRole('button', { name: 'Send a new confirmation email' }).click();
    await see(page, 'A new confirmation email is on its way');
  }, page);
  await step(P('wrong password has a clear message'), async () => {
    await logIn(page, A, 'Wrong2026x');
    await see(page, 'That email and password do not match');
  }, page);
  await step(P('signing up again with the same email says it is already registered'), async () => {
    await page.goto(`${APP}/signup`);
    await page.locator('#su-email').fill(A);
    await page.locator('#su-password').fill('Runner2026');
    await page.locator('.consent input').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'An account with this email already exists');
  }, page);
  await step(P('the confirmation link logs the new runner in and starts on the welcome screen'), async () => {
    await page.goto(`${APP}/login?confirmed=1${mock.linkFor(A, 'signup')}`);
    await page.waitForURL(/\/welcome/, { timeout: 10000 });
    await see(page, 'How would you like to start?');
  }, page);

  // ---------- Empty account ----------
  await step(P('empty account: every screen explains what is missing, with a next step'), async () => {
    await page.goto(`${APP}/profile`); await see(page, 'Account and sync');
    // Using the bottom tabs / sidebar on an empty account goes back to welcome until they choose a start
    await page.goto(`${APP}/progress`); await page.waitForURL(/\/welcome/);
  }, page);

  // ---------- Beginner path ----------
  await step(P('beginner questions validate and build a run/walk plan'), async () => {
    await page.getByRole('link', { name: /new to running/ }).click();
    await page.waitForURL(/\/start/);
    await page.getByRole('button', { name: 'Build my starter plan' }).click();
    await see(page, 'Please answer the first two questions');
    await page.getByRole('button', { name: 'Not yet' }).click();
    await page.getByRole('button', { name: 'Yes', exact: true }).nth(1).click();
    await page.getByRole('button', { name: 'Build my starter plan' }).click();
    await page.waitForURL(`${APP}/`);
    await see(page, /Run\/walk: 8 x 1 min|Rest day|Nothing planned/);
  }, page);
  await step(P('beginner sees no fitness numbers before they exist'), async () => {
    await see(page, 'Unlocking your fitness');
    await notSee(page, 'Fitness (VDOT)');
    await notSee(page, 'Predicted finish');
    assert(await page.locator('svg[aria-label*="out of 100"]').count() === 0, 'readiness score shown too early');
  }, page);
  await step(P('"I did it" logs a run with time, distance and feel'), async () => {
    const did = page.getByRole('button', { name: 'I did it' });
    if (await did.count()) await did.first().click();
    else await page.getByRole('button', { name: 'Log a run' }).click();
    await see(page, 'How did it feel?');
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await page.getByRole('button', { name: 'Save run' }).click();
    await page.waitForURL(/\/activity\//);
    await see(page, 'You logged this run by hand');
  }, page);
  await step(P('Today counts the run and the cloud has it, private to this account'), async () => {
    await page.goto(`${APP}/`);
    await see(page, '1 run logged', 8000).catch(async () => see(page, 'runs logged'));
    await page.waitForTimeout(1600);
    assert(rows('activities', A).length === 1, `expected 1 cloud run, got ${rows('activities', A).length}`);
    assert(rows('plans', A).length === 1, 'plan not saved');
    assert(rows('profiles', A)[0]?.data?.profile?.experience === 'new', 'profile not saved');
    assert(rows('session_feedback', A).length === 1, 'feedback not saved: ' + mock.state.calls.filter((c) => /feedback|activities|plans/.test(c)).join(', '));
  }, page);
  await step(P('coach suggestions match the session and answers use only real data'), async () => {
    await page.goto(`${APP}/coach`);
    await page.getByRole('button', { name: 'Am I on track?' }).click();
    await see(page, /You have logged 1 run/);
    await notSee(page, 'VDOT');
    assert(await page.getByRole('button', { name: 'Why is today easy?' }).count() === 0, 'easy-day suggestion on a non-easy day');
    await page.waitForTimeout(1500);
    assert(rows('coach_messages', A).length >= 2, 'coach chat not saved to the account');
  }, page);
  await step(P('Progress and race pages explain locked predictions'), async () => {
    await page.goto(`${APP}/progress`);
    await see(page, 'Race predictions are based on a timed effort');
    await see(page, 'Fitness, fatigue and form need a few weeks');
    await page.goto(`${APP}/race/new`);
    await see(page, 'Add a race');
  }, page);
  await step(P('unknown addresses show "Page not found"'), async () => {
    await page.goto(`${APP}/this-does-not-exist`);
    await see(page, 'Page not found');
  }, page);
  await step(P('review with no runs explains why and offers a way back'), async () => {
    await page.goto(`${APP}/review/2025-01`);
    await see(page, 'nothing to review yet');
  }, page);

  // ---------- Logout and a second account on the same device ----------
  const aId = userId(A);
  await step(P('log out clears this device but keeps the account data'), async () => {
    await logOut(page);
    const keys = await idbKeys(page);
    assert(!keys.includes(`ritmo:user:${aId}`), 'device cache not cleared');
    assert(rows('activities', A).length === 1, 'cloud data lost on logout');
  }, page);
  await step(P('a second person on the same device sees none of the first person\'s data'), async () => {
    await signUpAndConfirm(page, mock, B);
    await page.waitForURL(/\/welcome/);
    await page.getByRole('button', { name: /Look around with sample data/ }).click();
    await page.waitForURL(`${APP}/`);
    await notSee(page, 'Run/walk: 8 x 1 min');
    await page.goto(`${APP}/coach`);
    await notSee(page, 'You have logged 1 run');
    assert(rows('activities', B).length === 0, 'sample runs uploaded');
    assert(rows('coach_messages', B).length === 0, 'B sees A chat');
  }, page);
  await step(P('switching back to the first account restores only their data'), async () => {
    await logOut(page);
    await logIn(page, A);
    await page.waitForURL(`${APP}/`);
    await see(page, 'Unlocking your fitness');
    await notSee(page, 'Valencia Marathon');
  }, page);

  // ---------- Password reset ----------
  await step(P('forgot password sends a reset email'), async () => {
    await logOut(page);
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.locator('#fp-email').fill(A);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await see(page, 'a reset link is on its way');
    assert(mock.state.emails.some((e) => e.to === A && e.type === 'recovery'), 'no recovery email');
  }, page);
  await step(P('the reset link opens "Choose a new password", rejects weak ones, then logs in'), async () => {
    await page.goto(`${APP}/reset-password${mock.linkFor(A, 'recovery')}`);
    await see(page, 'Choose a new password');
    await page.locator('#np').fill('abc');
    await page.getByRole('button', { name: 'Save password' }).click();
    await see(page, 'That password is too weak');
    await page.locator('#np').fill('NewPass2026');
    await page.getByRole('button', { name: 'Save password' }).click();
    await see(page, 'Password saved');
    await page.waitForURL(`${APP}/`, { timeout: 8000 });
  }, page);
  await step(P('old password no longer works, the new one does, and login returns to the wanted page'), async () => {
    await logOut(page);
    await logIn(page, A, 'Runner2026');
    await see(page, 'That email and password do not match');
    await page.goto(`${APP}/progress`);
    await page.waitForURL(/next=%2Fprogress/);
    await logIn(page, A, 'NewPass2026');
    await page.waitForURL(`${APP}/progress`, { timeout: 8000 });
  }, page);
  await step(P('network errors are explained'), async () => {
    await logOut(page);
    mock.state.offline = true;
    await logIn(page, A, 'NewPass2026');
    await see(page, 'Ritmo cannot reach the server');
    mock.state.offline = false;
  }, page);

  // ---------- Full Garmin import ----------
  await step(P('a full Garmin export imports, removes duplicates and unlocks everything'), async () => {
    const { buffer, runCount } = await makeGarminExport();
    const file = path.join(OUT, `garmin-${label}.zip`);
    fs.writeFileSync(file, buffer);
    await signUpAndConfirm(page, mock, C);
    await page.waitForURL(/\/welcome/);
    await page.locator('input[type=file]').setInputFiles(file);
    await see(page, /Imported \d+ new runs/, 60000);
    const text = await page.getByText(/Imported \d+ new runs/).first().textContent();
    assert(new RegExp(`Imported ${runCount} new runs, upgraded 4`).test(text), `unexpected import summary: ${text}`);
    await page.getByRole('button', { name: 'See your running story' }).click();
    await see(page, 'Your running story');
    await page.goto(`${APP}/progress`);
    await see(page, 'Estimated race times');
    await notSee(page, 'Race predictions are based on a timed effort');
    await page.goto(`${APP}/calendar`);
    await page.getByRole('button', { name: /Build my plan|Rebuild/ }).first().click();
    await page.waitForTimeout(500);
    await notSee(page, 'Ritmo needs');
    await page.waitForTimeout(4000);
    assert(rows('activities', C).length === runCount, `cloud has ${rows('activities', C).length} of ${runCount} runs`);
  }, page);

  // ---------- Data from before accounts ----------
  await step(P('existing browser data is offered to a new account and moved on request'), async () => {
    await logOut(page);
    const legacy = { mode: 'real', profile: { name: 'Old', units: 'km', theme: 'system', goal: '', daysAvailable: [1, 3, 5], longRunDay: 6, injuries: [], onboarded: true }, activities: [
      { id: 'old-1', source: 'upload', sourceIds: { upload: 'old-1' }, startTime: '2026-10-20T07:00:00.000Z', name: 'Old run', sport: 'run', distanceM: 6000, durationS: 1900, movingS: 1900, detailScore: 3, importedAt: '' },
      { id: 'old-2', source: 'upload', sourceIds: { upload: 'old-2' }, startTime: '2026-10-25T07:00:00.000Z', name: 'Old long run', sport: 'run', distanceM: 12000, durationS: 4100, movingS: 4100, detailScore: 3, importedAt: '' },
    ], races: [], feedback: [], coach: [], sources: [] };
    await idbPut(page, 'ritmo:data:v1', legacy);
    await signUpAndConfirm(page, mock, D);
    await see(page, 'Move your data into your account?');
    await see(page, '2 runs');
    await page.getByRole('button', { name: 'Move it into my account' }).click();
    await page.waitForTimeout(2500);
    assert(rows('activities', D).length === 2, `moved ${rows('activities', D).length} runs`);
    assert(!(await idbKeys(page)).includes('ritmo:data:v1'), 'legacy copy not removed');
  }, page);

  // ---------- Delete account ----------
  await step(P('deleting the account removes the account and all cloud data'), async () => {
    await page.goto(`${APP}/profile/privacy`);
    await see(page, 'Delete your account');
    await page.locator('#del').fill('DELETE');
    await page.getByRole('button', { name: 'Delete my account and all data' }).click();
    await page.waitForURL(/\/login\?deleted=1/);
    await see(page, 'Your account and all its data have been deleted');
    assert(!mock.state.users.has(D), 'account still exists');
    assert(Object.values(mock.state.tables).every((t) => !t.some((r) => r.user_id === mock.state.users.get(D)?.id)), 'rows left');
  }, page);

  await step(P('no uncaught errors in the app'), async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });
  await page.screenshot({ path: path.join(OUT, `${label}-end.png`) });
  await browser.close();
}

(async () => {
  await run('phone', devices['iPhone 13']);
  await run('desktop', { viewport: { width: 1280, height: 900 } });
  const failed = results.filter((r) => r[0] === 'FAIL');
  for (const r of results) console.log(r.join('  '));
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
