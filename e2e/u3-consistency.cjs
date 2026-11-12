// Update 3, §1: make every number agree. One account shaped like the review account, with a right ankle niggle (1/10)
// and Strava runs:
// - each session this week reads the same on Training, the Run screen (distance and structure line) and the Coach
// - the weekly bar never overflows, says "+N km over", and explains a lowered target
// - the Coach's "Based on" line names the ankle and Training's readiness; suggested questions follow today's session
// - a pain 4/10 check-in turns today into cross-training on Training and in the Coach's questions
// - runs on the same day: the evening session in parts is "Matched plan", the morning run is extra; Split / Change plan
// - one PB value per distance, labelled; challenge state from a completed post; no Strava numbers in posts; "Race" only
// - run page: no "Next session" on an old race, effort empty until chosen, the title field named by the run
// Usage: node e2e/u3-consistency.cjs (app on :4173). Made-up runner only.
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'u3-consistency');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const num = (t) => { const m = (t || '').match(/(\d+(?:\.\d+)?)\s*(km|min)/); return m ? `${m[1]} ${m[2]}` : undefined; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'onetruth@test.ritmo';
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
  const profRow = () => mock.state.tables.profiles.find((r) => r.user_id === uid);
  const planRow = mock.state.tables.plans[mock.state.tables.plans.length - 1];
  check(!!planRow, 'a plan was built');
  // Today and tomorrow: easy runs of 9.2 km and a threshold session, as in the review week
  {
    const P = planRow.data, d0 = ymd(Date.now()), d1 = ymd(Date.now() + 86400e3);
    P.sessions = P.sessions.filter((x) => x.date !== d0 && x.date !== d1);
    P.sessions.push({ id: 'e-today', date: d0, type: 'easy', title: 'Easy run', focus: 'Aerobic base', purpose: 'Easy.', howItHelps: '', phase: 'build', status: 'planned', distanceM: 9200, durationS: 2900, steps: [{ kind: 'easy', label: '9.2 km easy', detail: '9.2 km at 4:40–5:00/km, Z2', km: 9.2, durationS: 2900 }] });
    P.sessions.push({ id: 't-tomorrow', date: d1, type: 'threshold', title: 'Threshold session', focus: 'Threshold', purpose: 'Threshold.', howItHelps: '', phase: 'build', status: 'planned', distanceM: 12000, durationS: 3000, steps: [{ kind: 'warmup', label: 'Warm up', detail: '3 km easy', km: 3 }, { kind: 'work', label: '3 x 2 km', detail: 'at 3:30/km', km: 6.6, pace: [208, 212] }, { kind: 'cooldown', label: 'Cool down', detail: '2.4 km easy', km: 2.4 }] });
    P.sessions.sort((a, z) => a.date.localeCompare(z.date));
    // No automatic trimming of the week for this test (extra runs this week would otherwise turn today into rest)
    P.noAutoAdjustUntil = ymd(Date.now() + 3 * 86400e3);
  }
  // Right ankle 1/10, as in the review (checked in an hour ago)
  profRow().data.profile.body = { checkins: [{ id: 'ck1', at: new Date(Date.now() - 3600e3).toISOString(), area: 'Ankle', side: 'right', pain: 1, when: ['after'], onset: 'gradual', trend: 'same', signs: [], redFlags: [] }] };
  // Strava runs this week (Training includes them; the AI never sees them)
  const strava = (id, daysAgo, h, km, min, extra = {}) => { const t = new Date(); t.setDate(t.getDate() - daysAgo); t.setHours(h, extra.m ?? 0, 0, 0); return { user_id: uid, id, source: 'strava', source_ids: { strava: id.replace(/\D/g, '') }, start_time: t.toISOString(), name: extra.name ?? 'Strava run', distance_m: Math.round(km * 1000), duration_s: Math.round(min * 60), moving_s: Math.round(min * 60), avg_hr: extra.hr ?? 140, detail_score: 3, updated_at: new Date().toISOString() }; };
  mock.state.tables.activities.push(strava('strava-7001', 2, 6, 12, 62));
  const reload = async (to = '/') => { await page.evaluate(() => indexedDB.deleteDatabase('keyval-store')); await page.goto(`${APP}${to}`); await page.waitForTimeout(2500); };

  // ---- 1. One session, one truth: Training, Run, Coach ----
  await reload('/');
  const training = new Map();
  for (const r of await page.locator('.rest-week .rw-row').all()) {
    const day = (await r.locator('.rw-day .label').innerText()).trim(), dom = (await r.locator('.rw-day .caption').innerText()).trim();
    const amount = await r.locator('.rw-main .caption').innerText().catch(() => '');
    if (amount) training.set(`${day} ${dom}`, { amount: amount.trim(), title: (await r.locator('.rw-main .label').innerText()).trim() });
  }
  if (process.env.DEBUG) console.log('main', (await page.locator('main').innerText()).slice(0, 900));
  const todayAmt = await page.locator('.stat-xl').first().evaluate((e) => e.parentElement.textContent).catch(() => '');
  { const d = new Date(); training.set(`${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()}`, { amount: todayAmt.trim(), title: 'today' }); }
  check(training.size > 0, `Training lists this week's sessions (${[...training.entries()].map(([k, v]) => `${k}: ${v.amount}`).join(', ')})`);
  await page.screenshot({ path: path.join(OUT, 'training.png'), fullPage: true });
  await page.goto(`${APP}/run`); await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'Ritmo plan' }).click(); await page.waitForTimeout(400);
  const dots = page.locator('.run-dots .run-dot');
  const n = await dots.count() || 1;
  let compared = 0, agree = 0, structOk = 0;
  const runCards = [];
  for (let i = 0; i < n; i++) {
    if (await dots.count()) { await dots.nth(i).click(); await page.waitForTimeout(150); }
    const card = page.locator('.run-card');
    if (!(await card.count())) break;
    const label = await card.getAttribute('aria-label');
    const m = label.match(/· (\w{3}) (\d+) /);
    if (process.env.DEBUG) console.log((await card.innerHTML()).slice(0, 800));
    const distance = await card.locator('.stat').first().innerText({ timeout: 4000 }).catch(() => '');
    const structure = await card.locator('.run-structure').innerText({ timeout: 2000 }).catch(() => '');
    runCards.push({ key: m ? `${m[1]} ${m[2]}` : '?', distance: distance.replace(/\s+/g, ' ').trim(), structure });
  }
  for (const c of runCards) {
    const t = training.get(c.key);
    if (!t) continue;
    compared++;
    if (num(t.amount) === num(c.distance)) agree++;
    else console.log(`  differs on ${c.key}: Training ${t.amount}, Run ${c.distance}`);
    // The structure line never names a distance other than the session's (an easy run reads "5.5 km easy")
    const kms = [...c.structure.matchAll(/(\d+(?:\.\d+)?) km (easy|steady)/g)].map((x) => Number(x[1]));
    if (!kms.length || kms.every((k) => k <= Number(num(c.distance)?.split(' ')[0] ?? 0) + 0.05)) structOk++;
    else console.log(`  structure on ${c.key}: "${c.structure}" vs ${c.distance}`);
  }
  check(compared > 0 && agree === compared, `the Run screen shows the same distance as Training for every session (${agree} of ${compared})`);
  check(compared > 0 && structOk === compared, `the structure line agrees with the distance on every card (${structOk} of ${compared})`);
  await page.locator('.run-card').screenshot({ path: path.join(OUT, 'run-card.png') }).catch(() => {});
  // The Coach (built-in, the AI is off for this runner) answers with the same number for a named day
  const ask = async (q) => {
    const before = await page.locator('.bubble-coach').count();
    await page.locator('#ask').fill(q);
    await page.getByRole('button', { name: 'Send' }).click();
    for (let i = 0; i < 30 && (await page.locator('.bubble-coach').count()) <= before; i++) await page.waitForTimeout(200);
    return page.locator('.bubble-coach').last();
  };
  await page.goto(`${APP}/coach`); await page.waitForTimeout(1500);
  const first = runCards.find((c) => training.has(c.key) && num(c.distance)?.endsWith('km'));
  if (first) {
    const dayName = DAY_LONG[DAYS.indexOf(first.key.split(' ')[0])];
    const bubble = await ask(`What is on ${dayName}?`);
    const text = await bubble.innerText();
    const km = num(text);
    check(km === num(first.distance), `the Coach names the same distance for ${dayName} (${km} vs ${num(first.distance)})`);
    // "Based on" line: the ankle and Training's readiness
    const based = await bubble.locator('.based-on-line').innerText().catch(() => '');
    check(/Right ankle 1\/10/.test(based), `the Coach answer is based on the right ankle 1/10 (${based})`);
    await page.goto(`${APP}/`); await page.waitForTimeout(1500);
    const score = (await page.locator('.rd-score').first().innerText().catch(() => '')).trim();
    check(!!score && based.includes(`readiness ${score}`), `and on the same readiness as Training (${score})`);
    check(!/Hamstring/i.test(text), 'the Coach does not talk about a hamstring');
    await page.goto(`${APP}/coach`); await page.waitForTimeout(1200);
    const sugg = (await page.locator('.suggest-row .chip').allInnerTexts()).join(' | ');
    check(/What can I do with my right ankle\?/.test(sugg), 'a suggested question is about the right ankle');
    await page.screenshot({ path: path.join(OUT, 'coach.png'), fullPage: true });
  } else check(false, 'found a session to ask the Coach about');

  // ---- 2. Weekly bar: never past 100%, "+N km over", and why the target was lowered ----
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  const bar = page.locator('.week-bar');
  if (await bar.count()) {
    const now = Number(await bar.locator('[role=progressbar]').getAttribute('aria-valuenow').catch(() => '0'));
    const width = await bar.locator('.week-bar-track > span').evaluate((e) => e.style.width).catch(() => '0%');
    check(now <= 100 && parseFloat(width) <= 100, `the weekly bar stops at 100% (${now}%, ${width})`);
    const [done, target] = (await bar.locator('.stat').innerText()).match(/[\d.]+/g).map(Number);
    if (done > target) check(/\+[\d.]+ km over this week's target/.test(await bar.innerText()), `more than the target shows "+${(done - target).toFixed(1)} km over" (${done} / ${target})`);
    else check(!/over this week's target/.test(await bar.innerText()), `under the target, no "over" line (${done} / ${target})`);
  } else check(false, 'Training shows the weekly bar');
  // A pain 4/10 check-in now: the 3–5 rule (cross-train), and the reason under the bar
  profRow().data.profile.body = { checkins: [{ id: 'ck2', at: new Date(Date.now() - 600e3).toISOString(), area: 'Ankle', side: 'right', pain: 4, when: [], onset: 'gradual', trend: 'same', signs: [], redFlags: [] }] };
  await reload('/');
  const rule = await page.locator('.body-rule').innerText().catch(() => '');
  check(/Cross-train instead of running for 2 days/.test(rule), `pain 4/10: Training says cross-train (${rule.slice(0, 70)})`);
  const why = await page.locator('.week-why').innerText().catch(() => '');
  check(/Lowered from [\d.]+ km on \d+ \w+ because of your right ankle\. Why\?/.test(why), `the lowered target is explained (${why})`);
  const changes = await page.locator('.plan-changes').innerText().catch(() => '');
  check(/This week's target: [\d.]+ km/.test(changes) && /Right ankle pain 4\/10: cross-train instead of running for 2 days/.test(changes), 'Plan changes shows the same target and the same message');
  await page.locator('.week-bar').screenshot({ path: path.join(OUT, 'week-bar.png') }).catch(() => {});
  await page.goto(`${APP}/coach`); await page.waitForTimeout(1500);
  const sugg2 = (await page.locator('.suggest-row .chip').allInnerTexts()).join(' | ');
  if (process.env.DEBUG) console.log('sugg2', sugg2);
  check(/Why cross-training today\?/.test(sugg2) && !/Why is today a rest day\?/.test(sugg2), 'on a cross-training day the Coach asks "Why cross-training today?", not "Why is today a rest day?"');
  const painAns = await (await ask('My ankle hurts, can I run?')).innerText();
  check(/Cross-train instead of running for 2 days/.test(painAns), 'the Coach gives the same rule for the ankle');
  // "Be more careful" is always there
  profRow().data.profile.body = { checkins: [{ id: 'ck3', at: new Date(Date.now() - 300e3).toISOString(), area: 'Ankle', side: 'right', pain: 1, when: [], onset: 'gradual', trend: 'same', signs: [], redFlags: [] }] };
  await reload('/');
  await page.getByRole('button', { name: 'Be more careful' }).click(); await page.waitForTimeout(800);
  check(/Cross-train instead of running/.test(await page.locator('.body-rule').innerText()), '"Be more careful" moves 1/10 to cross-training');

  // ---- 3. Runs on the same day are joined before judging ----
  const plan = mock.state.tables.plans[mock.state.tables.plans.length - 1].data;
  const yest = ymd(Date.now() - 86400e3);
  plan.sessions = plan.sessions.filter((s) => s.date !== yest);
  plan.sessions.unshift({ id: 'q-yest', date: yest, type: 'threshold', title: 'Threshold session', focus: 'Threshold', purpose: 'Threshold.', howItHelps: '', phase: 'build', status: 'planned', distanceM: 10500, durationS: 2700, steps: [{ kind: 'warmup', label: 'Warm up', detail: '1.5 km easy', km: 1.5 }, { kind: 'work', label: '5.7 km at threshold', detail: 'at 3:46/km', km: 5.7, pace: [222, 230] }, { kind: 'cooldown', label: 'Cool down', detail: '3.3 km easy', km: 3.3 }] });
  plan.startDate = yest;
  mock.state.tables.activities.push(
    strava('strava-8001', 1, 9, 16.29, 16.29 * 4.6, { name: 'Morning run', hr: 138, m: 30 }),
    strava('strava-8002', 1, 18, 1.46, 8, { name: 'Warm up', hr: 130 }),
    strava('strava-8003', 1, 18, 5.71, 5.71 * 3.7667, { name: 'Threshold session', hr: 172, m: 10 }),
    strava('strava-8004', 1, 18, 3.34, 18, { name: 'Cool down', hr: 135, m: 33 }),
  );
  await reload('/');
  // Open yesterday on the week strip
  const yd = new Date(Date.now() - 86400e3);
  await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {});
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(800);
  if (process.env.DEBUG) console.log('day', yd.getDate(), (await page.locator('main').innerText()).slice(0, 300));
  const ran = await page.locator('section[aria-labelledby="ran-here"]').innerText().catch(() => '');
  check(/Session of 3 parts[^\n]*Matched plan/.test(ran.replace(/\n/g, ' ').replace(/ +/g, ' ')) || /Session of 3 parts · \d\d:\d\d · Matched plan/.test(ran), `the evening session in parts is "Matched plan"`);
  check(/Morning run[\s\S]*extra/.test(ran), 'the morning 16.29 km is an extra run');
  await page.locator('section[aria-labelledby="ran-here"]').screenshot({ path: path.join(OUT, 'day-view.png') }).catch(() => {});
  check(await page.getByRole('button', { name: 'Change plan' }).isVisible().catch(() => false) && await page.getByRole('button', { name: 'Split into separate runs' }).isVisible().catch(() => false), 'the day view offers Split and Change plan');
  await page.getByRole('button', { name: 'Split into separate runs' }).click(); await page.waitForTimeout(1200);
  check(!/Session of 3 parts/.test(await page.locator('section[aria-labelledby="ran-here"]').innerText().catch(() => '')), 'Split shows the parts as separate runs');
  check((profRow().data.profile.splitRuns ?? []).length === 2, 'and is saved to the account');
  await page.getByRole('button', { name: 'Join runs again' }).click(); await page.waitForTimeout(1000);
  // Change plan: the runner says the morning run was the planned session
  await page.getByRole('button', { name: 'Change plan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Morning run/ }).click(); await page.waitForTimeout(1500);
  const after = (await page.locator('section[aria-labelledby="ran-here"]').innerText()).replace(/\s+/g, ' ');
  check(/Morning run \d\d:\d\d · [^·]+· swapped|Morning run \d\d:\d\d · [^·]+· Matched plan/.test(after) && /Session of 3 parts · \d\d:\d\d · extra/.test(after), `Change plan moves the match to the morning run (${after.slice(0, 160)})`);

  // ---- 4. One PB value per distance, labelled ----
  await page.goto(`${APP}/you`); await page.waitForTimeout(2000);
  const tile = page.locator('.pb-tile', { hasText: '5K' }).first();
  const tileText = await tile.innerText().catch(() => '');
  const tileTime = (tileText.match(/\d+:\d\d/) || [])[0];
  check(!!tileTime && /best effort|official race time/.test(tileText), `the 5K PB tile shows one labelled time (${tileText.replace(/\n/g, ' · ')})`);
  await page.goto(`${APP}/you/records`); await page.waitForTimeout(1500);
  const rec = await page.locator('li', { hasText: '5K' }).first().innerText().catch(() => '');
  check(rec.includes(tileTime) && /best effort|official race time/.test(rec), `Records shows the same 5K time, labelled (${rec.replace(/\n/g, ' · ').slice(0, 80)})`);

  // ---- 5. Challenge state and the Strava rule on the Hub ----
  await page.goto(`${APP}/hub`);
  await page.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
  await page.locator('#hub-name').fill('Sam Truth');
  await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click(); await page.waitForTimeout(2000);
  const monthTitle = `100 km in ${new Date().toLocaleDateString('en-GB', { month: 'long' })}`;
  profRow().data.profile.challenges = [];
  mock.state.tables.posts.push({ id: 'post-ch1', user_id: uid, activity_id: null, title: `Completed: ${monthTitle}`, body: null, visibility: 'followers', show_map: false, show_hr: false, route: null, city: null, stats: { distanceM: 212500, movingS: 60000, paceS: 282, type: 'challenge', typeLabel: 'Challenge complete', badges: [monthTitle], badgeId: 'distance-100km' }, ritmo_count: 0, comment_count: 0, created_at: new Date().toISOString() });
  mock.state.tables.posts.push({ id: 'post-race1', user_id: uid, activity_id: null, title: 'Harbour 10K', body: null, visibility: 'everyone', show_map: false, show_hr: false, route: null, city: null, stats: { distanceM: 10000, movingS: 1991, paceS: 199, type: 'race', typeLabel: 'Race' }, ritmo_count: 0, comment_count: 0, created_at: new Date().toISOString() });
  await reload('/hub?tab=challenges');
  const chText = await page.locator('main').innerText();
  check(/Complete/.test(chText) && !new RegExp(`Join ${monthTitle}`).test(await page.locator('button[aria-label^="Join"]').evaluateAll((x) => x.map((e) => e.getAttribute('aria-label')).join('|'))), `Challenges shows "${monthTitle}" as completed and doesn't offer it again`);
  check(await page.locator('.badge-shelf li', { hasText: monthTitle }).count() > 0 || /Badges/.test(chText), 'the badge is earned');
  await page.goto(`${APP}/hub`); await page.waitForTimeout(2500);
  const chPost = page.locator('.hub-post', { hasText: `Completed: ${monthTitle}` }).first();
  const chPostText = await chPost.innerText().catch(() => '');
  check(!!chPostText && !/212|run for it/.test(chPostText) && /Completed/.test(chPostText), 'a challenge post shows the badge and "Completed", never a distance (it can include Strava runs)');
  const raceChip = await page.locator('.hub-post', { hasText: 'Harbour 10K' }).locator('.zone-chip').first().evaluate((e) => e.textContent).catch(() => '');
  check(raceChip.trim() === 'Race', `a race post says only "Race" (${JSON.stringify(raceChip)})`);
  // A new challenge post carries no numbers
  await page.screenshot({ path: path.join(OUT, 'hub.png'), fullPage: true });

  // ---- 6. Run page details ----
  const race = mock.state.tables.activities.find((a) => a.user_id === uid && a.start_time.startsWith('2026-09-20'));
  if (race) {
    await page.goto(`${APP}/activity/${race.id}`); await page.waitForTimeout(2500);
    const main = await page.locator('main').innerText();
    check(!/Next session/.test(main), 'an old race page has no "Next session"');
    const titleField = page.locator('#run-title');
    check((await titleField.getAttribute('aria-label')) === (await titleField.inputValue()) && (await titleField.inputValue()).length > 0, `the title field is named by the run ("${await titleField.inputValue()}")`);
    const pressed = await page.locator('.effort-chip[aria-pressed="true"]').count();
    check(pressed === 0 && /not chosen/.test(main), 'Effort 1 to 10 is empty until chosen');
  } else check(false, 'found the 20 Sep race');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
