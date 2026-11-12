// Update 3, §9 and §10:
// - Your strength plan: block and week bars, this week's focus, how exercises progress, the last session and next change
// - a good session (all sets, effort 7 or less) progresses the next one (+1 rep); a hard one repeats
// - a new block (after the lighter week) brings harder versions of the movements
// - care plans: offered for a niggle or pain after a run; stages with exercises (dose, how often, cues); Done today;
//   the morning pain check (0–2 forward after the minimum days, 3–5 stay, 6+ step back and rest), running adjusted
//   with undo on Training; a physio's own programme; the safety text and physio and urgent advice
// Usage: node e2e/u3-stage5.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u3-stage5');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const monday = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'progress@test.ritmo';
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
  await page.waitForTimeout(1500);
  const planRow = () => mock.state.tables.plans[mock.state.tables.plans.length - 1];
  const profRow = () => mock.state.tables.profiles.find((r) => r.user_id === uid);
  const prof = () => profRow().data.profile;
  const t0 = ymd(Date.now());
  const reload = async (to = '/') => { await page.evaluate(() => indexedDB.deleteDatabase('keyval-store')); await page.goto(`${APP}${to}`); await page.waitForTimeout(2500); };
  // Today: Runner's strength A on its own; this is week 1 of block 1
  const setWeeks = (list) => { planRow().data.weeks = list; };
  const wk0 = monday(Date.now());
  setWeeks([{ start: wk0, targetKm: 60, phase: 'build' }]);
  const P = planRow().data;
  let s = P.sessions.find((x) => x.date === t0);
  if (!s) { s = { ...P.sessions[0], id: 'today-s', date: t0 }; P.sessions.push(s); }
  Object.assign(s, { type: 'rest', title: 'Strength (no run)', focus: 'Strength', status: 'planned', distanceM: 0, durationS: 0, steps: [], strengthPlan: { routine: 'A', intensity: 'heavy', why: 'Builds strength.' } });
  P.sessions = P.sessions.map((x) => (x.date < t0 && x.strengthPlan ? { ...x, strengthPlan: undefined } : x));
  await reload('/');

  // ---- 1. Your strength plan ----
  check(/Block 1, week 1: Learn/.test(await page.locator('.strength-card').first().innerText()), 'the strength card says "Block 1, week 1: Learn"');
  await page.goto(`${APP}/strength-plan`); await page.waitForTimeout(1200);
  const sp = await page.locator('main').innerText();
  check(/Block 1, week 1: Learn/.test(sp) && await page.locator('.block-bar').count() === 4 && await page.locator('.block-bar.now').count() === 1, 'Your strength plan: the block and a bar for each week, this one highlighted');
  check(/This week: Learn the movements/.test(sp), "this week's focus");
  check(/Block 1\s*Block 2\s*Block 3/.test(sp) && /Glute bridge|Single-leg glute bridge/.test(sp) && /Single-leg hip thrust/.test(sp), 'a table of how exercises progress across blocks');
  check(/No strength session recorded yet/.test(sp), 'no last session yet');
  await page.screenshot({ path: path.join(OUT, 'strength-plan.png'), fullPage: true });

  // ---- 2. Session to session ----
  const doWorkout = async (rpe) => {
    await page.goto(`${APP}/strength/${s.id}`); await page.getByText(/Exercise 1 of/).waitFor();
    const n = await page.locator('.set-row').count();
    for (let i = 0; i < n; i++) { await page.getByRole('button', { name: 'Set done' }).click(); if (await page.getByRole('button', { name: 'Skip' }).isVisible().catch(() => false)) await page.getByRole('button', { name: 'Skip' }).click(); }
    await page.getByRole('button', { name: 'Finish workout' }).click().catch(() => {});
    await page.getByRole('button', { name: String(rpe), exact: true }).click();
    await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(2500);
  };
  await doWorkout(6);
  check(prof().strength?.progress?.['bw-squat']?.next === 'up', 'all sets done at effort 6: the squat progresses');
  await page.goto(`${APP}/strength-plan`); await page.waitForTimeout(1200);
  const last = await page.locator('section', { hasText: 'Last session' }).innerText();
  check(/Body-weight squat[\s\S]*3 of 3 sets · 12 reps[\s\S]*Progress[\s\S]*Next: \+1 reps \(to 13\)/.test(last), `the last session's result and the next change ("+1 reps (to 13)")`);
  // The next session starts at 13 reps
  mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.log = [];
  await reload(`/strength/${s.id}`); await page.getByText(/Exercise 1 of/).waitFor();
  check(/13 reps/.test(await page.locator('.set-row.now').innerText()) && /Today: \+1 reps \(to 13\)/.test(await page.locator('main').innerText()), 'the next session pre-fills 13 reps and says "+1 reps (to 13)"');
  await doWorkout(9);
  check(prof().strength?.progress?.['bw-squat']?.next === 'repeat', 'rated hard (9): the next session repeats');

  // ---- 3. A new block after the lighter week ----
  const w = (n) => ymd(new Date(new Date(`${wk0}T12:00:00`).getTime() + n * 7 * 86400e3));
  setWeeks([w(-4), w(-3), w(-2), w(-1), w(0)].map((start, i) => ({ start, targetKm: 60, phase: 'build', cutback: i === 3 })));
  mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile.log = [];
  await reload('/');
  const card = await page.locator('.strength-card').first().innerText();
  check(/Block 2, week 1: Learn/.test(card), 'after the lighter week, block 2 starts');
  await page.locator('.strength-card').first().getByRole('button', { name: 'Edit' }).click();
  const ed = await page.getByRole('dialog', { name: /Edit:/ }).innerText();
  check(/Bulgarian split squat/.test(ed) && /Single-leg hip thrust/.test(ed), 'block 2 brings harder versions: Bulgarian split squat, single-leg hip thrust');
  await page.keyboard.press('Escape');

  // ---- 4. Care plans ----
  // Pain logged after a run: a care plan is offered
  mock.state.tables.session_feedback.push({ user_id: uid, activity_id: rows.activities[rows.activities.length - 1].id, data: { activityId: rows.activities[rows.activities.length - 1].id, feel: 3, pain: [{ area: 'Knee', severity: 2 }], loggedAt: new Date().toISOString() } });
  await reload('/');
  check(/You logged knee pain after a run/.test(await page.locator('main').innerText()), 'pain after a run: a care plan is offered');
  // A niggle: right Achilles 2/10
  profRow().data.profile.body = { checkins: [{ id: 'ck1', at: new Date(Date.now() - 3600e3).toISOString(), area: 'Achilles', side: 'right', pain: 2, when: [], onset: 'gradual', trend: 'same', signs: [], redFlags: [] }] };
  await reload('/');
  await page.getByRole('link', { name: 'Start a care plan' }).first().click();
  await page.waitForURL(/\/care/); await page.waitForTimeout(800);
  check(await page.getByRole('button', { name: 'Achilles' }).getAttribute('aria-pressed') === 'true' && await page.getByRole('button', { name: 'Right' }).getAttribute('aria-pressed') === 'true', 'the care plan starts from the niggle: right Achilles');
  check(/Guidance, not a diagnosis/.test(await page.locator('main').innerText()), '"Guidance, not a diagnosis" before starting');
  await page.getByRole('button', { name: 'Start the care plan' }).click(); await page.waitForTimeout(1200);
  const cp = await page.locator('main').innerText();
  check(/Stage 1: Calm it down/.test(cp) && /Isometric calf hold\s*5 x 45 s · every day/.test(cp) && /Rise halfway onto the toes and hold/.test(cp), 'stage 1 exercises with dose, how often and cues (Achilles: isometric calf holds)');
  check(/Hills, spikes and fast strides/.test(cp), 'what to avoid for now');
  check(/See a physio if the pain is sharp, getting worse, makes you limp, or lasts more than 2 weeks/.test(cp) && /Chest pain, dizziness or fainting: stop everything/.test(cp), 'the safety text, always');
  await page.screenshot({ path: path.join(OUT, 'care-plan.png'), fullPage: true });
  await page.getByRole('button', { name: 'Done today' }).click(); await page.waitForTimeout(1200);
  check((prof().body?.care?.done ?? []).includes(t0), '"Done today" is saved');
  // Pain check 1/10 on day 1: good, but the stage needs 3 days
  await page.locator('#care-morning').fill('1');
  await page.getByRole('button', { name: 'Save the check' }).click(); await page.waitForTimeout(1500);
  check(/Pain 1\/10: good\. 3 more days at "Calm it down"/.test(await page.locator('main').innerText()), 'pain 1/10 on day 1: stay until the minimum days are done');
  check(/Running: Keep running easy and flat/.test(await page.locator('main').innerText()), 'and running follows the same rules (easy and flat)');
  check(prof().body.checkins.length === 2, 'the check is a Body check-in too');
  // Three days later, 1/10: move forward
  const care = prof().body.care; care.stageSince = ymd(Date.now() - 3 * 86400e3); care.startedAt = care.stageSince; care.checks = [];
  await reload('/care');
  await page.locator('#care-morning').fill('1');
  await page.getByRole('button', { name: 'Save the check' }).click(); await page.waitForTimeout(1500);
  check(/move forward to "Build"/.test(await page.locator('main').innerText()) && prof().body.care.stage === 1, 'three days at 0–2: move forward to "Build"');
  check(/Slow bent-knee heel drops/.test(await page.locator('main').innerText()), 'the build stage exercises (slow bent-knee heel drops)');
  // 4/10 tomorrow: stay; 6/10: step back and rest that area
  prof().body.care.checks = [];
  await reload('/care');
  await page.locator('#care-morning').fill('4');
  await page.getByRole('button', { name: 'Save the check' }).click(); await page.waitForTimeout(1500);
  check(/Pain 4\/10: stay at "Build"/.test(await page.locator('main').innerText()), '3–5: stay at this stage');
  check(/Running: Cross-train instead of running/.test(await page.locator('main').innerText()), 'and running is replaced with cross-training (3–5)');
  // Training: the change, with undo
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  check(/Care plan · stage 2 of 3/.test(await page.locator('main').innerText()), 'Training shows the care plan');
  check(/Right achilles pain 4\/10: cross-train instead of running/.test(await page.locator('.plan-changes').innerText().catch(() => '')), 'before undo: Plan changes says cross-train instead of running');
  await page.getByRole('button', { name: 'Undo the change to my runs' }).click(); await page.waitForTimeout(1500);
  check(/You kept your plan as it was/.test(await page.locator('.body-rule').innerText()) && prof().body.undone, 'the running change can be undone on Training');
  check(/you chose to keep your plan as it was/.test(await page.locator('.plan-changes').innerText().catch(() => '')), 'after undo: Plan changes says the plan was kept as it was');
  await page.getByRole('button', { name: "Use Ritmo's change again" }).click(); await page.waitForTimeout(800);
  prof().body.care.checks = [];
  await reload('/care');
  await page.locator('#care-morning').fill('6');
  await page.getByRole('checkbox', { name: 'The pain is sharp' }).check();
  await page.getByRole('button', { name: 'Save the check' }).click(); await page.waitForTimeout(1500);
  const m6 = await page.locator('main').innerText();
  check(/Pain 6\/10: step back to "Calm it down" and rest that area/.test(m6) && prof().body.care.stage === 0, '6+: step back and rest that area');
  check(/Sharp pain is a reason to see a physio/.test(m6), 'sharp pain: see a physio');
  // A physio's own programme
  await page.getByRole('button', { name: "Use my physio's programme instead" }).click();
  await page.locator('#physio').fill('Eccentric heel drops | 3 x 15 | twice a day\nCalf stretch | 3 x 30 s | every day');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(1200);
  const ph = await page.locator('main').innerText();
  check(/Your physio's exercises/.test(ph) && /Eccentric heel drops\s*3 x 15 · twice a day/.test(ph), "a physio's own programme replaces Ritmo's exercises and is tracked");
  // Urgent
  prof().body.care.checks = [];
  await reload('/care');
  await page.getByRole('checkbox', { name: 'Chest pain, dizziness or fainting' }).check();
  await page.getByRole('button', { name: 'Save the check' }).click(); await page.waitForTimeout(1500);
  check(/Stop all exercise/.test(await page.locator('main').innerText()) && /call your local emergency number/.test(await page.locator('main').innerText()) && !!prof().body.redFlagAt, 'chest pain, dizziness or fainting: stop everything, urgent advice, training paused');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
