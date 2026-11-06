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

const PHOTO = path.join(OUT, 'photo.jpg');
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

const checkAll = async (page) => { for (const c of await page.locator('.consent input').all()) await c.check(); };
const cont = (page) => page.getByRole('button', { name: 'Continue', exact: true }).click();
const fieldset = (page, legend) => page.locator('fieldset').filter({ has: page.locator('legend', { hasText: legend }) });

/** Walks through setup. Stops before the plan preview when stopAt is given. */
async function doSetup(page, o = {}) {
  const { level = 'I am new to running', name = 'Sam', year = '1990', goal = 'Run 5K without stopping', weekly, runsFile, photo, ai = false } = o;
  await page.waitForURL(/\/setup/, { timeout: 10000 });
  await see(page, 'How Ritmo uses your data');
  await page.locator('#c-health').check();
  if (ai) await page.locator('#c-ai').check();
  await cont(page);
  await see(page, 'About you');
  await page.locator('#s-name').fill(name);
  await page.getByLabel('Day', { exact: true }).selectOption('15');
  await page.getByLabel('Month', { exact: true }).selectOption('4');
  await page.getByLabel('Year', { exact: true }).selectOption(year);
  if (photo) {
    await page.getByRole('button', { name: 'Add a photo' }).click();
    await page.locator('input[type=file][accept^="image/jpeg"]').setInputFiles(photo);
    await page.getByRole('button', { name: 'Save picture' }).click();
    await page.locator('.setup-body img.avatar-img').first().waitFor({ timeout: 8000 });
  }
  await cont(page);
  await see(page, 'Before you start');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'No', exact: true }).nth(i).click();
  await cont(page);
  await see(page, 'Your running so far');
  await page.getByRole('radio', { name: new RegExp(level) }).click();
  if (/new to running/.test(level)) {
    await fieldset(page, 'Can you run for 10 minutes').getByRole('button', { name: 'Not yet' }).click();
    await fieldset(page, 'Do you walk regularly').getByRole('button', { name: 'Yes' }).click();
  } else {
    if (weekly !== undefined) await page.locator('#s-weekly').fill(String(weekly));
    if (!(await page.locator('#s-weekly').inputValue())) await page.locator('#s-weekly').fill('30');
    await fieldset(page, 'A recent race').getByRole('button', { name: 'I do not have one' }).click();
  }
  await cont(page);
  await see(page, 'What would you like to achieve?');
  await page.getByRole('radio', { name: goal }).click();
  await cont(page);
  await see(page, 'Your training week');
  await cont(page);
  await see(page, 'Any injuries?');
  await page.getByRole('button', { name: /No injuries/ }).click();
  await see(page, /Add your past runs|Your first weeks/);
  if (await page.getByText('Your first weeks').count()) return;
  if (runsFile) {
    await page.locator('input[type=file][accept=".fit,.gpx,.tcx,.zip,.json"]').setInputFiles(runsFile);
    await see(page, /Imported \d+ new runs/, 60000);
    await page.getByRole('button', { name: /Continue with \d+ runs/ }).click();
  } else await page.getByRole('button', { name: 'Skip for now' }).click();
  await see(page, 'Your first weeks');
  // If the week asked for does not fit the days, take the recommended option
  if (await page.getByText('That week does not fit').count()) await page.getByRole('button', { name: /\(recommended\)/ }).click();
}
async function startPlan(page) {
  await page.getByRole('button', { name: 'Start my plan' }).click();
  await page.waitForURL(`${APP}/`, { timeout: 10000 });
}

async function signUpAndConfirm(page, mock, email, password = 'Runner2026') {
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email);
  await page.locator('#su-password').fill(password);
  await checkAll(page);
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
  if (!fs.existsSync(PHOTO)) require('child_process').execSync(`convert -size 900x700 gradient:'#E8480C'-'#1E1A17' -set comment 'test' ${PHOTO}`);
  const mock = createMock();
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...deviceOpts });
  await mock.install(context, SUPA);
  if (process.env.DEBUG) await context.addInitScript(() => { window.__puts = 0; const o = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { window.__puts++; return o.apply(this, a); }; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.DEBUG) page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && (process.env.DEBUG !== 'C' || globalThis.__inC)) console.log('console', m.type(), m.text().slice(0, 300)); });
  const A = `a-${label}@test.ritmo`, B = `b-${label}@test.ritmo`, C = `c-${label}@test.ritmo`, D = `d-${label}@test.ritmo`, E = `e-${label}@test.ritmo`;
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
    await checkAll(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'That password is too weak');
    await page.locator('#su-password').fill('longenough');
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'Use a mix of letters and numbers');
  }, page);
  await step(P('sign-up requires 18+ and the terms, separately from health consent'), async () => {
    await page.locator('#su-password').fill('Runner2026');
    const [adult, terms] = await page.locator('.consent input').all();
    await adult.uncheck();
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'Please confirm you are 18 or over');
    await adult.check(); await terms.uncheck();
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'Please agree to the terms and privacy notice');
    assert(await page.locator('.consent a[href="/privacy"]').count() === 1, 'no privacy link');
    assert(await page.locator('.consent a[href="/terms"]').count() === 1, 'no terms link');
    await notSee(page, 'health data, including heart rate');
  }, page);
  await step(P('sign-up sends a confirmation email and records the terms and age confirmation'), async () => {
    await page.locator('.consent input').nth(1).check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'Check your email');
    assert(mock.state.emails.some((e) => e.to === A && e.type === 'signup'), 'no signup email');
    const meta = mock.state.users.get(A).meta;
    assert(meta.terms_accepted_at && meta.adult_confirmed_at, 'agreement not stored');
    assert(!meta.health_consent_at, 'health consent should not be taken at sign-up');
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
    await checkAll(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await see(page, 'An account with this email already exists');
  }, page);
  await step(P('the confirmation link logs the new runner in and starts setup'), async () => {
    await page.goto(`${APP}/login?confirmed=1${mock.linkFor(A, 'signup')}`);
    await page.waitForURL(/\/setup/, { timeout: 10000 });
    await see(page, 'Step 1 of 9');
  }, page);
  await step(P('setup is required: other pages return to it, health consent is required'), async () => {
    await page.goto(`${APP}/progress`); await page.waitForURL(/\/setup/);
    await page.goto(`${APP}/welcome`); await page.waitForURL(/\/setup/);
    assert(!(await page.locator('#c-health').isChecked()), 'health consent pre-ticked');
    assert(!(await page.locator('#c-ai').isChecked()), 'AI consent pre-ticked');
    assert(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), 'can continue without consent');
  }, page);
  await step(P('under 18 is blocked and the date of birth is not saved'), async () => {
    await page.locator('#c-health').check(); await cont(page);
    await page.locator('#s-name').fill('Sam');
    await page.getByLabel('Day', { exact: true }).selectOption('1');
    await page.getByLabel('Month', { exact: true }).selectOption('1');
    await page.getByLabel('Year', { exact: true }).selectOption(String(new Date().getFullYear() - 15));
    await cont(page);
    await see(page, 'Ritmo is for adults 18 and over');
    await page.waitForTimeout(1500);
    assert(!rows('profiles', A)[0]?.data?.profile?.dateOfBirth, 'under-18 date of birth saved');
    assert(rows('profiles', A)[0]?.data?.profile?.consents?.healthData?.granted, 'consent step not saved to the account');
    await page.getByRole('button', { name: 'I entered the wrong date' }).click();
  }, page);
  await step(P('setup resumes on another device at the same step'), async () => {
    await page.getByLabel('Year', { exact: true }).selectOption('1990');
    await cont(page);
    await see(page, 'Before you start');
    await page.waitForTimeout(1600);
    const other = await browser.newContext({ ...deviceOpts });
    await mock.install(other, SUPA);
    const p2 = await other.newPage();
    await p2.goto(`${APP}/login`);
    await logIn(p2, A);
    await p2.waitForURL(/\/setup/, { timeout: 10000 });
    await see(p2, 'Before you start');
    await see(p2, 'Step 1 of 7');
    await other.close();
  }, page);
  await step(P('a "yes" in the health check asks to see a doctor and needs acknowledging; only the outcome is stored'), async () => {
    await page.getByRole('button', { name: 'Yes', exact: true }).nth(1).click();
    for (const i of [0, 2, 3, 4, 5]) await page.getByRole('button', { name: 'No', exact: true }).nth(i).click();
    await see(page, 'Please check with a doctor before you start');
    assert(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), 'continue allowed without acknowledging');
    await page.locator('#h-ack').check();
    await cont(page);
    await see(page, 'Your running so far');
    await page.waitForTimeout(1600);
    const hc = rows('profiles', A)[0].data.profile.healthCheck;
    assert(hc?.doctorAdvised && hc.acknowledgedAt, 'health outcome not stored');
    assert(!JSON.stringify(rows('profiles', A)[0].data).includes('chest'), 'individual health answers stored');
  }, page);
  await step(P('beginner: new to running gets a safer goal offer and a run/walk plan preview'), async () => {
    await page.getByRole('radio', { name: /new to running/ }).click();
    await cont(page);
    await see(page, 'Please say whether you can run for 10 minutes');
    await fieldset(page, 'Can you run for 10 minutes').getByRole('button', { name: 'Not yet' }).click();
    await fieldset(page, 'Do you walk regularly').getByRole('button', { name: 'Yes' }).click();
    await cont(page);
    await page.getByRole('radio', { name: 'My first 10K' }).click();
    await cont(page);
    await see(page, 'A safer option');
    await page.getByRole('button', { name: 'Run 5K without stopping first' }).click();
    await see(page, 'Your training week');
    await cont(page);
    await page.getByRole('button', { name: /No injuries/ }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await see(page, 'Your first weeks');
    await see(page, 'Set by effort, no paces yet');
    await see(page, /new to running/);
    await startPlan(page);
    await see(page, /Run\/walk: 8 x 1 min|Rest day|Nothing planned/);
    await page.waitForTimeout(1600);
    const prof = rows('profiles', A)[0].data.profile;
    assert(prof.setupCompletedAt && prof.goalType === '5k' && prof.experience === 'new', 'setup result not saved');
  }, page);
  await step(P('beginner sees no fitness numbers before they exist; details sit behind "See more"'), async () => {
    await notSee(page, 'Unlocking your fitness');
    await page.getByRole('button', { name: /See more/ }).click();
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
    await page.getByRole('button', { name: /See more/ }).click();
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
  await step(P('the AI coach is only used with consent, and the usage limit falls back politely'), async () => {
    const coachCalls = () => mock.state.calls.filter((c) => c.includes('/functions/v1/coach')).length;
    assert(coachCalls() === 0, 'AI coach called without consent');
    await see(page, "Answers come from Ritmo's built-in coach only");
    await page.getByRole('button', { name: 'Use the AI coach' }).click();
    mock.state.coachStatus = 429;
    await page.locator('#ask').fill('How was my week?');
    await page.getByRole('button', { name: 'Send' }).click();
    await see(page, 'You have asked the AI coach a lot of questions recently');
    assert(coachCalls() === 1, 'AI coach not called after consent');
    mock.state.coachStatus = undefined;
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
    await page.waitForURL(/\/setup/);
    await page.getByRole('button', { name: /Look around with sample data/ }).click();
    await page.waitForURL(`${APP}/`);
    await page.waitForTimeout(1500); // let the choice save before the next full page load
    await notSee(page, 'Run/walk: 8 x 1 min');
    await page.goto(`${APP}/coach`);
    await notSee(page, 'You have logged 1 run');
    assert(rows('activities', B).length === 0, 'sample runs uploaded');
    assert(rows('coach_messages', B).length === 0, 'B sees A chat');
    assert(rows('profiles', B)[0]?.data?.mode === 'sample', 'sample choice not saved');
  }, page);
  await step(P('switching back to the first account restores only their data'), async () => {
    await logOut(page);
    await logIn(page, A);
    await page.waitForURL(`${APP}/`);
    await page.waitForTimeout(1500);
    if (process.env.DEBUG) console.log('A cloud setupCompletedAt', rows('profiles', A)[0]?.data?.profile?.setupCompletedAt, 'url', page.url());
    await page.getByRole('button', { name: /See more/ }).click();
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
  await step(P('a regular runner with a Garmin export: runs fill in setup, plan uses measured paces, photo saved'), async () => {
    const { buffer, runCount } = await makeGarminExport();
    const file = path.join(OUT, `garmin-${label}.zip`);
    fs.writeFileSync(file, buffer);
    globalThis.__inC = true;
    await signUpAndConfirm(page, mock, C);
    await doSetup(page, { level: 'I run regularly', goal: 'Get faster', name: 'Cara', runsFile: file, photo: PHOTO });
    await see(page, 'Paces measured from your runs');
    await startPlan(page);
    assert(await page.locator('.avatar-photo img').count() === 1, 'photo not in the top bar');
    await page.goto(`${APP}/progress`);
    await see(page, 'Estimated race times');
    if (process.env.DEBUG) { const a = await page.evaluate(() => window.__puts); await page.waitForTimeout(3000); console.log('puts in 3s', (await page.evaluate(() => window.__puts)) - a, 'tsb'); }
    await page.waitForTimeout(4000);
    assert(rows('activities', C).length === runCount, `cloud has ${rows('activities', C).length} of ${runCount} runs; calls: ${mock.state.calls.slice(mock.state.calls.lastIndexOf('POST /auth/v1/signup 200')).join(', ')} banner: ${await page.locator('.sync-banner').textContent().catch(() => 'none')}`);
    assert(mock.state.files.has(`avatars/${userId(C)}/avatar.jpg`), 'photo not stored in the private folder');
    const jpg = mock.state.files.get(`avatars/${userId(C)}/avatar.jpg`);
    assert(jpg.indexOf(Buffer.from('Exif')) < 0, 'photo still has EXIF data');
  }, page);
  await step(P('a runner with no history gets estimated paces, clearly labelled'), async () => {
    await logOut(page);
    await signUpAndConfirm(page, mock, E);
    await doSetup(page, { level: 'I run regularly', goal: 'Get faster', weekly: 30 });
    await see(page, 'Paces are an estimate for now');
    await see(page, /estimated from your typical 30 km a week/);
    await startPlan(page);
  }, page);
  await step(P('two accounts with photos only ever see their own'), async () => {
    await page.goto(`${APP}/profile`);
    await page.getByRole('button', { name: 'Add a photo' }).click();
    await page.locator('input[type=file][accept^="image/jpeg"]').setInputFiles(PHOTO);
    await page.getByRole('button', { name: 'Save picture' }).click();
    await page.locator('.card img.avatar-img').first().waitFor();
    assert(mock.state.files.has(`avatars/${userId(E)}/avatar.jpg`) && mock.state.files.has(`avatars/${userId(C)}/avatar.jpg`), 'photos missing');
    // E's session cannot fetch C's photo
    const res = await page.evaluate(async ([u, key]) => {
      const tok = JSON.parse(localStorage.getItem('ritmo-auth')).access_token;
      const r = await fetch(`${u}/storage/v1/object/sign/avatars/${key}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, apikey: 'x', 'content-type': 'application/json' }, body: '{"expiresIn":60}' });
      return r.status;
    }, [SUPA, `${userId(C)}/avatar.jpg`]);
    assert(res >= 400, `other user's photo was reachable (${res})`);
    await page.getByRole('button', { name: 'Change or remove photo' }).click();
    await page.getByRole('button', { name: 'Remove picture' }).click();
    await page.waitForTimeout(500);
    assert(!mock.state.files.has(`avatars/${userId(E)}/avatar.jpg`), 'removed photo still stored');
    assert(await page.locator('.card img.avatar-img').count() === 0, 'removed photo still shown');
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
  await step(P('a user who brought runs with them skips the runs question'), async () => {
    await page.goto(`${APP}/setup`);
    await see(page, 'Step 1 of 8');
    await doSetup(page, { level: 'I run regularly', goal: 'Get faster', weekly: 20 });
    await notSee(page, 'Skip for now');
    await startPlan(page);
  }, page);
  await step(P('deleting the account removes the account, photo and all cloud data'), async () => {
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

module.exports = { doSetup, startPlan, signUpAndConfirm, see, PHOTO, APP, SUPA, OUT };
if (require.main === module) (async () => {
  await run('phone', devices['iPhone 13']);
  if (!process.env.PHONE_ONLY) await run('desktop', { viewport: { width: 1280, height: 900 } });
  const failed = results.filter((r) => r[0] === 'FAIL');
  for (const r of results) console.log(r.join('  '));
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
