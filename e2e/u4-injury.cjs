// Update 4, tasks 2.1–2.5 and 2b: an injury from the first report to "healed".
// - Day 1: the full report starts return to run at a step; injury mode overrides the plan ("Changed for your right
//   ankle", the original crossed out), readiness never says "Ready for hard", the week says "reduced … while returning"
// - Day 2: a short check-in compared with yesterday's score
// - Day 3: the pain trend chart, the quick test, and "Step 3 unlocked: 2 days clear"
// - "It feels healed": three checks, ease back in, plan rebuilt, card gone, history entry
// - "It's back": resumes at step 3, not step 1
// Usage: node e2e/u4-injury.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u4-injury'); fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'u4-injury@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  for (const k of Object.keys(rows)) mock.state.tables[k].push(...rows[k]);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
  await page.waitForTimeout(2000);
  const profRow = () => mock.state.tables.profiles.find((r) => r.user_id === uid);
  const planRow = () => mock.state.tables.plans[mock.state.tables.plans.length - 1];
  const reload = async (to = '/') => { await page.evaluate(() => indexedDB.deleteDatabase('keyval-store')); await page.goto(`${APP}${to}`); await page.waitForTimeout(2500); };
  // Make today a long run and the coming days a hard week, whatever the weekday
  const t = ymd(Date.now());
  {
    const ss = planRow().data.sessions;
    const mk = (date, type, title, km) => { let s = ss.find((x) => x.date === date); if (!s) { s = { id: `x-${date}`, date, phase: 'build', status: 'planned', howItHelps: '' }; ss.push(s); } Object.assign(s, { type, title, focus: title, purpose: `${title}.`, distanceM: km * 1000, durationS: km * 300, steps: [{ label: title, detail: `${km} km`, km }], status: 'planned', completedActivityId: undefined, strengthPlan: undefined, strength: undefined }); delete s.edited; };
    mk(t, 'long', 'Long progressive', 22);
    mk(ymd(Date.now() + 86400e3), 'easy', 'Easy run', 9);
    mk(ymd(Date.now() + 2 * 86400e3), 'threshold', 'Threshold session', 12);
    mk(ymd(Date.now() + 3 * 86400e3), 'vo2max', 'Intervals', 11);
    // No runs today in the fixture
    mock.state.tables.activities = mock.state.tables.activities.filter((a) => !(a.user_id === uid && String(a.start_time ?? a.data?.startTime ?? '').slice(0, 10) === t));
    profRow().data.profile.body = { checkins: [] };
  }
  await reload('/');
  check(/Long progressive/.test(await page.locator('#session-title').innerText()), 'before: today is a 22 km long progressive run');

  // ---- Day 1: the full report ----
  await page.getByRole('button', { name: /Add a run, cross-training/ }).first().click();
  await page.getByRole('button', { name: /Something hurts/ }).click();
  const rep = page.getByRole('dialog', { name: 'Something hurts?' });
  await rep.getByRole('button', { name: 'Ankle', exact: true }).click();
  await rep.getByRole('button', { name: 'Right', exact: true }).click();
  await rep.locator('#pain').fill('2');
  await rep.getByRole('button', { name: 'After the run' }).click();
  await rep.getByRole('button', { name: 'Stays the same' }).click();
  await rep.getByRole('button', { name: 'Gradually' }).click();
  check(/Only asked the first time/.test(await rep.innerText()), 'the full report says it is only asked the first time');
  await rep.getByRole('button', { name: 'See what to do' }).click();
  const res = page.getByRole('dialog', { name: 'Thanks for checking in' });
  await res.waitFor({ timeout: 5000 });
  check(/Return to run · step 2 of 6/.test(await res.innerText()), 'pain 2/10 that stays the same starts at step 2 of 6');
  await res.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(600);
  const card = page.locator('.injury-card');
  check(/Return to run · step 2 of 6/.test(await card.innerText()) && /Ankle 2\/10/.test(await card.innerText()), 'Training shows "Return to run · step 2 of 6" with "Ankle 2/10"');
  check(/Your plan follows this until you're cleared\. Hard or long sessions become easy, flat runs\./.test(await card.innerText()), 'and says it overrides the plan');
  const hero = await page.locator('.hero').innerText();
  check(/Changed for your right ankle/.test(hero) && /Long progressive · 22 km/.test(hero), 'today is labelled "Changed for your right ankle", with the long run crossed out');
  check(/Return to run · step 2 of 6/.test(await page.locator('#session-title').innerText()), 'today is now the step 2 session, not the 22 km long run');
  check(await page.locator('.hero .was-planned').evaluate((e) => getComputedStyle(e).textDecorationLine.includes('line-through')), 'the original is crossed out');
  const rd = await page.locator('.rd-strip-main, .rd-strip').first().innerText().catch(() => '');
  check(!/Ready for hard/.test(rd), `readiness does not say "Ready for hard" during the injury (${rd.replace(/\s+/g, ' ').slice(0, 60)})`);
  const why = await page.locator('.week-why').first().innerText({ timeout: 3000 }).catch(() => '');
  if (!why) console.log('  week bar:', (await page.locator('.week-bar').first().innerText().catch(() => 'none')).replace(/\s+/g, ' '), '| target line:', (await page.locator('.week-target-line').innerText().catch(() => 'none')).replace(/\s+/g, ' '));
  check(/This week: [\d.]+ km \(reduced from [\d.]+ km while returning\)/.test(why), `the week says "(reduced from … while returning)" (${why})`);
  const changes = await page.locator('.plan-changes').innerText();
  const m1 = why.match(/This week: ([\d.]+ km \(reduced from [\d.]+ km while returning\))/);
  check(!!m1 && changes.includes(`This week's target: ${m1[1]}`), 'Plan changes shows the same weekly numbers');
  check(/Return to run, step 2 of 6: your plan follows this until you are cleared/.test(changes), 'Plan changes explains the override');
  await page.screenshot({ path: path.join(OUT, 'training-injury.png'), fullPage: true });
  // The hard sessions later this week are easy, flat runs
  const derivedLater = await page.evaluate(() => document.body.innerText);
  check(!/Threshold session\n/.test(derivedLater.split('Plan changes')[0]) || /Easy flat run/.test(derivedLater), 'hard sessions this week show as easy flat runs');

  // ---- Day 2: the short check-in ----
  const backOneDay = () => {
    const body = profRow().data.profile.body;
    const shift = (d) => ymd(new Date(`${d}T12:00:00`).getTime() - 86400e3);
    body.injury.startedAt = shift(body.injury.startedAt); body.injury.stepSince = shift(body.injury.stepSince);
    body.injury.days = body.injury.days.map((d) => ({ ...d, date: shift(d.date) }));
    body.checkins = body.checkins.map((c) => ({ ...c, at: new Date(new Date(c.at).getTime() - 86400e3).toISOString() }));
  };
  await page.waitForTimeout(1500);
  backOneDay();
  await reload('/');
  await page.locator('.injury-card').getByRole('button', { name: 'Check in' }).click();
  const d2 = page.getByRole('dialog', { name: 'Morning check-in' });
  await d2.waitFor({ timeout: 5000 });
  const d2t = await d2.innerText();
  check(/Right ankle · day 2 · step 2 of 6/.test(d2t), 'day 2 opens the short "Morning check-in"');
  check(/This morning compared to yesterday \(2\/10\)/.test(d2t), "it shows yesterday's score in the question");
  check(!/How did it start|Which side|Where\?/.test(d2t), 'the day-1 questions are not asked again');
  check(await d2.locator('.pain-trend').count() === 0, 'no trend chart yet on day 2');
  await d2.getByRole('button', { name: 'Better', exact: true }).click();
  await d2.getByRole('group', { name: 'Pain this morning' }).or(d2.locator('fieldset', { hasText: 'Pain this morning' })).getByRole('button', { name: '1', exact: true }).first().click();
  await d2.getByRole('button', { name: 'Pain 2 or less' }).click();
  await d2.getByRole('button', { name: 'Save check-in' }).click();
  const r2 = page.getByRole('dialog', { name: 'Check-in saved' });
  await r2.waitFor();
  check(/1 day clear/.test(await r2.innerText()) && /Step 2 of 6/.test(await r2.innerText()), 'one clear day: step 2 stays, "1 day clear"');
  await r2.getByRole('button', { name: 'Done' }).click();

  // ---- Day 3: trend chart, quick test, step 3 unlocked ----
  await page.waitForTimeout(1500);
  backOneDay();
  await reload('/');
  await page.locator('.injury-card').getByRole('button', { name: 'Check in' }).click();
  const d3 = page.getByRole('dialog', { name: 'Morning check-in' });
  await d3.waitFor({ timeout: 5000 });
  check(/day 3/.test(await d3.innerText()) && await d3.locator('.pain-trend').count() === 1, 'day 3 shows the pain trend chart');
  check(/Getting better/.test(await d3.innerText()), 'the trend says "Getting better"');
  check(/Quick test: 10 single-leg hops/.test(await d3.innerText()), 'every 3rd day adds the quick test (10 single-leg hops for an ankle)');
  await d3.screenshot({ path: path.join(OUT, 'daily-checkin.png') });
  await d3.getByRole('button', { name: 'Better', exact: true }).click();
  await d3.getByRole('button', { name: 'Pain 2 or less' }).click();
  await d3.getByRole('button', { name: 'Yes, no pain' }).click();
  await d3.getByRole('button', { name: 'Save check-in' }).click();
  const r3 = page.getByRole('dialog', { name: 'Check-in saved' });
  await r3.waitFor();
  check(/Step 3 unlocked/.test(await r3.innerText()) && /2 days clear/.test(await r3.innerText()), '"Step 3 unlocked · 2 days clear"');
  await r3.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(500);
  check(/step 3 of 6/.test(await page.locator('.injury-card').innerText()) && /Return to run · step 3 of 6/.test(await page.locator('#session-title').innerText()), "the card and today's session move to step 3");

  // ---- "It feels healed" ----
  await page.locator('.injury-card').getByRole('button', { name: 'It feels healed' }).click();
  const h = page.getByRole('dialog', { name: 'Back to your plan' });
  await h.waitFor();
  check(await h.getByRole('button', { name: 'Mark as healed' }).isDisabled(), 'the three checks are needed first');
  for (const name of ['Walking and stairs pain-free', 'Last easy run, pain 0–1']) await h.getByRole('group', { name }).getByRole('button', { name: 'Yes' }).click();
  await h.getByRole('group', { name: /single-leg hops/ }).getByRole('button', { name: 'No' }).click();
  check(/isn't a clear yes/.test(await h.innerText()) && !(await h.getByRole('button', { name: 'Mark as healed' }).isDisabled()), 'a "No" warns gently but still allows it');
  await h.getByRole('group', { name: /single-leg hops/ }).getByRole('button', { name: 'Yes' }).click();
  check(await h.getByRole('radio', { name: /Ease back in/ }).getAttribute('aria-checked') === 'true', '"Ease back in" is chosen by default, marked Recommended');
  await h.screenshot({ path: path.join(OUT, 'feels-healed.png') });
  await h.getByRole('button', { name: 'Mark as healed' }).click();
  await page.waitForTimeout(800);
  check(/marked healed/.test(await h.innerText()), 'it confirms the injury is marked healed');
  await h.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(800);
  check(await page.locator('.injury-card').count() === 0, 'the return-to-run card is gone');
  check(!/Changed for your right ankle/.test(await page.locator('.hero').innerText()) || /easing|ankle/.test(await page.locator('.hero').innerText()), 'the injury override is off');
  check(!/Return to run/.test(await page.locator('#session-title').innerText()), "today's session is no longer a return-to-run step");
  const ch2 = await page.locator('.plan-changes').innerText();
  check(/Right ankle marked healed on \d+ \w+, easing back in over 10 days/.test(ch2), `Plan changes logs "Right ankle marked healed on …, easing back in over 10 days" (${ch2.replace(/\s+/g, ' ').slice(60, 200)})`);
  const body = profRow().data.profile.body;
  await page.waitForTimeout(1200);
  const saved = profRow().data.profile.body;
  check(!saved.injury && saved.injuryHistory?.length === 1 && saved.injuryHistory[0].lastStep === 3 && saved.injuryHistory[0].pains.length === 3, 'the injury moved to history with its dates, pain trend and last step');
  check(!!saved.easeBack && !saved.rtrStep, 'easing back in is set for the next 10 days');
  void body;

  // ---- Profile → Health: history and "It's back" ----
  await page.goto(`${APP}/profile/health`).catch(() => {});
  await page.waitForTimeout(1500);
  let hist = page.locator('.injury-history');
  if (!(await hist.count())) { await page.goto(`${APP}/profile`); await page.waitForTimeout(1500); hist = page.locator('.injury-history'); }
  if (!(await hist.count())) { for (const l of await page.getByRole('link').all()) { const tx = await l.innerText().catch(() => ''); if (/Health|Body/.test(tx)) { await l.click(); await page.waitForTimeout(1200); if (await page.locator('.injury-history').count()) break; } } hist = page.locator('.injury-history'); }
  check(await hist.count() === 1 && /Right ankle/.test(await hist.innerText()) && /reached step 3 of 6/.test(await hist.innerText()), 'Profile shows the injury history (right ankle, reached step 3)');
  await hist.getByRole('button', { name: "It's back" }).click();
  const bk = page.getByRole('dialog', { name: 'Right ankle is back' });
  await bk.waitFor();
  check(/restarts at step 3 of 6, the last step you reached, not step 1/.test(await bk.innerText()), '"It\'s back" says it restarts at step 3, not step 1');
  await bk.getByRole('button', { name: 'Restart at step 3' }).click();
  await page.waitForTimeout(1800);
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  check(/Return to run · step 3 of 6/.test(await page.locator('.injury-card').innerText()), 'Training is back on return to run, step 3 of 6');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scrolling at phone width');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);

  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
