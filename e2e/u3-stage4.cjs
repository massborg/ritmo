// Update 3, §4–6 and the strength half of §8:
// - a strength session in the plan: dumbbell on the week strip; Training's card with duration, exercise count,
//   equipment, the first 4 exercises and "+ N more", the why line, Start workout, Edit and Swap
// - Edit: swap an exercise (3+ alternatives with reasons, "Always use this instead"), change sets, logged; Profile ›
//   Strength: equipment, "Never give me…", the swaps
// - the guided player: Exercise x of y, demo, sets (now/done), −/+, Set done, rest timer, Up next, summary, "How
//   did it feel?"; saved with sets, pre-filled next time; the day counts as done
// - "Log strength session" by hand
// - the Hub: posted automatically, "Strength · as planned", Time · Exercises · Sets and the top 4; audience change
// Usage: node e2e/u3-stage4.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u3-stage4');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'strong@test.ritmo';
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
  // Join the Hub first, so the workout is posted automatically
  await page.goto(`${APP}/hub`);
  await page.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
  await page.locator('#hub-name').fill('Sam Strong');
  await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click(); await page.waitForTimeout(2500);

  const planRow = () => mock.state.tables.plans[mock.state.tables.plans.length - 1];
  const prof = () => mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  const t0 = ymd(Date.now());
  // Today: an easy run with Runner's strength A after it
  const P = planRow().data;
  let s = P.sessions.find((x) => x.date === t0);
  if (!s) { s = { ...P.sessions[0], id: 'today-s', date: t0 }; P.sessions.push(s); }
  Object.assign(s, { type: 'easy', title: 'Easy run', status: 'planned', distanceM: 8000, durationS: 2640, steps: [{ kind: 'easy', label: '8 km easy', detail: '8 km easy', km: 8, durationS: 2640 }],
    strengthPlan: { routine: 'A', intensity: 'heavy', why: 'Builds the strength in your legs, hips and core that lets you run more without injury.' }, strength: "Runner's strength A after the run" });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);

  // ---- 1. In the plan ----
  check(await page.locator('.daychip.is-today .daychip-strength-extra').count() === 1, 'the week strip shows a dumbbell on the strength day');
  const card = page.locator('.strength-card').first();
  const ct = await card.innerText();
  check(/Runner's strength A · after the run/.test(ct), 'Training shows "Runner\'s strength A · after the run"');
  check(/\d+ min · 7 exercises · No equipment/.test(ct), `duration, exercise count and equipment (${(ct.match(/\d+ min · \d+ exercises · [^\n]+/) || [''])[0]})`);
  check(/Body-weight squat\s*3 x 12/.test(ct) && /\+ 3 more/.test(ct), 'the first 4 exercises with their sets, and "+ 3 more"');
  check(/Why: Builds the strength/.test(ct), 'the why line');
  check(await card.getByRole('link', { name: 'Start workout' }).isVisible() && await card.getByRole('button', { name: 'Edit' }).isVisible() && await card.getByRole('button', { name: 'Swap' }).isVisible(), 'Start workout, Edit and Swap');
  await card.screenshot({ path: path.join(OUT, 'strength-card.png') });

  // ---- 2. Edit: swap with reasons, always use instead, sets ----
  await card.getByRole('button', { name: 'Edit' }).click();
  const ed = page.getByRole('dialog', { name: /Edit: Runner's strength A/ });
  await ed.waitFor();
  await ed.getByRole('button', { name: 'Swap' }).nth(1).click(); // Reverse lunge
  const sw = page.getByRole('dialog', { name: /Instead of Reverse lunge/ });
  await sw.waitFor();
  const opts = await sw.locator('.swap-list li').allInnerTexts();
  check(opts.length >= 3 && opts.every((o) => o.split('\n').length >= 2), `3+ alternatives, each with a reason (${opts.map((o) => o.replace(/\n/g, ': ')).slice(0, 3).join(' | ')})`);
  check(opts.some((o) => /knee-friendly|easier on balance/.test(o)), 'reasons like "knee-friendly" or "easier on balance"');
  await sw.screenshot({ path: path.join(OUT, 'swap-sheet.png') });
  await sw.getByRole('checkbox', { name: 'Always use this instead' }).check();
  await sw.locator('.swap-list button', { hasText: 'Split squat' }).first().click();
  await ed.getByRole('button', { name: 'More sets for Body-weight squat' }).click();
  await ed.getByRole('button', { name: 'Save for this day' }).click(); await page.waitForTimeout(2500);
  const sp = planRow().data.sessions.find((x) => x.id === s.id).strengthPlan;
  check(sp.custom?.[1]?.id === 'split-squat' && sp.custom?.[0]?.sets === 4, 'that day\'s list is saved: Split squat instead of Reverse lunge, 4 sets of squats');
  check(prof().strength?.swaps?.['reverse-lunge'] === 'split-squat', '"Always use this instead" is saved for future sessions');
  check(planRow().data.changes.some((c) => c.reason === 'edited' && /You changed \w+'s strength: Body-weight squat, Split squat/.test(c.summary)), 'the change is logged in Plan changes');
  // Never give me floor work
  await page.goto(`${APP}/profile/strength`); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Floor work' }).click(); await page.waitForTimeout(500);
  check(/Split squat\s*instead of Reverse lunge/.test(await page.locator('main').innerText()), 'Profile › Strength lists the swap');
  await page.screenshot({ path: path.join(OUT, 'profile-strength.png'), fullPage: true });
  await page.waitForTimeout(1500);
  check(prof().strength?.never?.includes('tag:floor'), '"Never give me… Floor work" is saved');
  // Reset the day's list so the plan's routine (now without floor work) is used
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  await page.locator('.strength-card').first().getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog', { name: /Edit:/ }).getByRole('button', { name: 'Reset to plan' }).click(); await page.waitForTimeout(1500);
  const list = await page.locator('.strength-card .strength-list').first().innerText();
  check(!/Glute bridge|Plank|Clamshell/.test(list) && /Split squat/.test(list), `the plan's routine leaves out floor work and uses Split squat (${list.replace(/\n/g, ', ').slice(0, 120)})`);

  // ---- 3. The guided player ----
  await page.locator('.strength-card').first().getByRole('link', { name: 'Start workout' }).click();
  await page.waitForURL(/\/strength\//);
  await page.getByText(/Exercise 1 of \d+/).waitFor();
  check(await page.locator('svg.exercise-demo').count() >= 1, 'a demo of the exercise');
  check(await page.locator('.set-row.now').count() === 1 && /Now/.test(await page.locator('.set-row.now').innerText()), 'the sets list shows the set to do now');
  check(await page.locator('[role=progressbar][aria-label="Workout progress"]').count() === 1 && /\d+:\d\d\s*0 of \d+ sets/.test(await page.locator('.strength-head').innerText()), 'a header with elapsed time and progress');
  await page.getByRole('button', { name: 'More: Reps' }).click();
  await page.getByRole('button', { name: 'Set done' }).click();
  check(await page.locator('.rest-timer').isVisible() && /Rest\s*\d+ s/.test(await page.locator('.rest-timer').innerText()), 'a rest timer starts after the set');
  check(await page.locator('.set-row.done').count() === 1, 'the set is marked done');
  check(/Up next/.test(await page.locator('main').innerText()), 'an Up next list');
  await page.screenshot({ path: path.join(OUT, 'player.png'), fullPage: true });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Set done' }).click(); await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const sum = await page.locator('main').innerText();
  check(/Time/.test(sum) && /Exercises\s*1/.test(sum) && /Sets\s*2/.test(sum) && /How did it feel/.test(sum), 'a summary: time, exercises, sets, and "How did it feel?"');
  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: 'Save workout' }).click(); await page.waitForTimeout(3000);
  const log = (prof().log ?? []).find((e) => e.kind === 'strength');
  check(!!log && log.rpe === 7 && log.strength.sessionId === s.id && log.strength.exercises[0].sets.length === 2 && log.strength.exercises[0].sets[0].reps === 13, 'saved with its sets (13 reps), effort and the planned session');
  check(prof().strength?.last?.['bw-squat']?.reps === 13, 'reps are remembered per exercise');
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  check(/Done/.test(await page.locator('.strength-card').first().innerText()), 'the strength card says Done');
  await page.goto(`${APP}/strength/free?routine=A`); await page.waitForTimeout(1200);
  check(/13 reps/.test(await page.locator('.set-row.now').innerText()), 'next time the reps are pre-filled (13)');

  // ---- 4. Logged by hand ----
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Add a run/ }).click();
  await page.getByText('Log strength session').click();
  await page.getByRole('button', { name: 'Class' }).click();
  await page.getByRole('dialog', { name: 'Log strength session' }).getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(2000);
  check((prof().log ?? []).some((e) => e.kind === 'strength' && e.strength.source === 'manual' && e.strength.type === 'class' && e.minutes === 45), '"Log strength session": a 45-minute class, saved');

  // ---- 5. On the Hub ----
  for (let i = 0; i < 20 && !mock.state.tables.posts.some((p) => p.user_id === uid && p.stats?.type === 'strength'); i++) await page.waitForTimeout(500);
  const post = mock.state.tables.posts.find((p) => p.user_id === uid && p.stats?.type === 'strength' && p.stats.typeLabel === 'Strength · as planned');
  check(!!post && post.visibility === 'followers' && post.stats.strength.exercises === 1 && post.stats.strength.sets === 2 && post.stats.device === 'Recorded in Ritmo', 'the workout is posted automatically, to followers, "recorded in Ritmo"');
  await page.waitForTimeout(3000);
  check(mock.state.tables.posts.filter((p) => p.user_id === uid && p.title === "Runner's strength A").length === 1 && mock.state.tables.posts.filter((p) => p.user_id === uid && p.title === 'Strength class').length === 1, 'exactly one post per workout');
  await page.goto(`${APP}/hub`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Mine|My posts/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const hp = page.locator('.hub-post', { hasText: "Runner's strength A" }).first();
  const ht = await hp.innerText().catch(() => '');
  check(/Strength · as planned/.test(ht) && /Exercises\s*1/.test(ht) && /Sets\s*2/.test(ht) && /Body-weight squat\s*2 x 13/.test(ht), 'the post: "Strength · as planned", Time · Exercises · Sets, and the exercises with sets x reps');
  check(/Recorded in Ritmo/.test(ht), 'and "Recorded in Ritmo"');
  await hp.screenshot({ path: path.join(OUT, 'hub-post.png') }).catch(() => {});
  await hp.getByRole('button', { name: 'More' }).click();
  await hp.getByRole('button', { name: 'Only me (hide)' }).click(); await page.waitForTimeout(1500);
  check(mock.state.tables.posts.find((p) => p.id === post?.id)?.visibility === 'only_me', 'the post can be hidden (audience changed to only me)');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
