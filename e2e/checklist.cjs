// Brief §11 test checklist: the items the feature suites do not already check.
// - readiness wording identical on Training, Coach and the run feedback page
// - fitness (VDOT), run count and race goal identical on Coach, Profile and You
// - easy/hard balance, training-load axis, 15K PB under the half
// - changing max HR re-labels recent runs
// - Hub post titles use the run's weekday
// - You: Y period
// - a niggle can be logged; "How did it feel?" saves
// - every main screen in Giorno, Notte and Sole at 390 px and on desktop: no sideways scrolling, icon-only buttons
//   have labels, tap targets at least 44 px, keyboard focus visible
// Usage: node e2e/checklist.cjs (app on :4173). Writes e2e/out/checklist/report.json and screenshots.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'checklist');
fs.mkdirSync(OUT, { recursive: true });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const results = [];
let passed = 0, failed = 0;
const check = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); results.push({ ok: !!ok, name, detail }); ok ? passed++ : failed++; };
const clearCache = async (page) => { await page.goto(`${APP}/about`); await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keyval-store'); q.onsuccess = q.onerror = q.onblocked = () => r(); })); };
const toS = (t) => t.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  const email = 'checklist@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  const today = ymd(new Date());
  rows.activities = rows.activities.filter((r) => ymd(new Date(r.start_time)) !== today);
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  mock.state.tables.feature_flags.push({ user_id: uid, flag: 'body' });
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1500); } }
  await page.waitForTimeout(1500);

  // A run this morning, so its page shows "Readiness now"
  const base = [...rows.activities].sort((x, y) => y.start_time.localeCompare(x.start_time)).find((r) => r.distance_m >= 5000 && r.distance_m <= 12000);
  const morning = new Date(); morning.setHours(7, 0, 0, 0);
  const todayRun = { ...base, id: 'checklist-today', start_time: morning.toISOString(), updated_at: new Date().toISOString() };
  mock.state.tables.activities.push(todayRun);
  await clearCache(page);

  // ---- Readiness wording: Training, Coach, feedback ----
  await page.goto(`${APP}/`); await page.waitForTimeout(2500);
  const strip = (await page.locator('.rd-strip').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const trScore = (strip.match(/Readiness\s+(\d+)/) ?? [])[1];
  const trWord = (strip.match(/(Ready for hard|Easy day|Recover)(?! well)/) ?? [])[1];
  await page.goto(`${APP}/coach`); await page.waitForTimeout(1500);
  const coachReady = (await page.locator('.coach-ready').innerText().catch(() => '')).replace(/\s+/g, ' ');
  await page.goto(`${APP}/activity/${todayRun.id}`); await page.waitForTimeout(2000);
  const fbStrip = (await page.locator('.rd-strip').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const sentence = (strip.match(/[A-Z][^.]*\./g) ?? []).find((x) => !/Readiness/.test(x)) ?? '';
  check(!!trScore && coachReady.includes(`Readiness ${trScore}`) && fbStrip.includes(`Readiness ${trScore}`), 'readiness score identical on Training, Coach and the run feedback page', `${trScore}`);
  check(!!trWord && coachReady.includes(trWord) && fbStrip.includes(trWord), 'readiness word identical', trWord);
  check(!!sentence && coachReady.includes(sentence.trim()) && fbStrip.includes(sentence.trim()), 'readiness sentence identical', sentence.trim());

  // ---- VDOT, run count, goal: Coach, Profile, You ----
  await page.goto(`${APP}/profile`); await page.waitForTimeout(1500);
  const profText = await page.locator('main').innerText();
  const vdotProfile = (profText.match(/Fitness estimate \(VDOT\) ([\d.]+)/) ?? [])[1];
  const goalProfile = await page.getByRole('link', { name: /^Goals and availability/ }).innerText().catch(() => '');
  await page.goto(`${APP}/you`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'All', exact: true }).click().catch(() => {}); await page.waitForTimeout(600);
  const youText = await page.locator('main').innerText();
  const runsYou = Number((youText.match(/(\d+)\s*\n?\s*Runs/i) ?? youText.match(/Runs\s*\n?\s*(\d+)/i) ?? [])[1]);
  const totalRuns = mock.state.tables.activities.filter((a) => a.user_id === uid).length;
  await page.getByRole('button', { name: 'Races' }).click().catch(() => {}); await page.waitForTimeout(800);
  const racesText = await page.locator('main').innerText();
  // Coach: the "Based on" line of a local answer carries the fitness facts
  await page.goto(`${APP}/coach`); await page.waitForTimeout(1200);
  await page.getByRole('textbox').first().fill('How fit am I right now?');
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  for (const d of await page.locator('details').all()) await d.evaluate((x) => { x.open = true; }).catch(() => {});
  const coachText = await page.locator('main').innerText();
  const vdotCoach = (coachText.match(/VDOT ([\d.]+)/) ?? [])[1];
  check(!!vdotProfile && (!vdotCoach || vdotCoach === vdotProfile), 'fitness (VDOT) identical on Profile and Coach', `Profile ${vdotProfile}, Coach ${vdotCoach ?? 'not quoted in the answer'}`);
  check(runsYou === totalRuns, 'run count on You (All) matches every run on record', `${runsYou} of ${totalRuns}`);
  const goalTime = (goalProfile.match(/(\d{1,2}:\d{2}(?::\d{2})?)/) ?? [])[1];
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  const trainingText = await page.locator('main').innerText();
  check(!!goalTime && racesText.includes(goalTime) && trainingText.includes(goalTime) && (!/goal/i.test(coachText) || coachText.includes(goalTime) || !coachText.match(/goal[^.]*\d{1,2}:\d{2}/i)), 'race goal identical on Profile, You › Races, Training (and Coach when quoted)', goalTime);

  // ---- Insights and records ----
  await page.goto(`${APP}/you/insights`); await page.waitForTimeout(2000);
  const ins = await page.locator('main').innerText();
  const easy = Number((ins.match(/(\d+)%\s*\n?\s*easy/) ?? [])[1]);
  const planned = Number((ins.match(/Your plan for these weeks: (\d+)% easy/) ?? [])[1]);
  check(easy >= 0 && easy <= 100 && (!planned || (planned >= 60 && planned <= 95)), 'easy/hard balance is sensible', `${easy}% easy, plan ${planned || 'n/a'}% easy`);
  const axis = await page.locator('#load').locator('xpath=ancestor::section[1]').locator('svg text').evaluateAll((els) => els.map((e) => e.textContent ?? '')).catch(() => []);
  const nums = axis.map((t) => Number(t.replace('−', '-'))).filter((n) => !isNaN(n));
  check(nums.length >= 2 && nums.every((n) => Math.abs(n) < 500) && new Set(nums).size === nums.length, 'training-load axis is sensible', nums.join(', '));
  await page.goto(`${APP}/you/records`); await page.waitForTimeout(1500);
  const rec = await page.locator('main').innerText();
  const t15 = (rec.match(/15K\s*\n?\s*(\d{1,2}:\d{2}(?::\d{2})?)/) ?? [])[1];
  const tHalf = (rec.match(/Half(?: marathon)?\s*\n?\s*(\d{1,2}:\d{2}(?::\d{2})?)/) ?? [])[1];
  check(!t15 || !tHalf || toS(t15) < toS(tHalf), 'the 15K PB is under the half-marathon time', `15K ${t15 ?? 'none'}, Half ${tHalf ?? 'none'}`);

  // ---- Max HR re-labels runs ----
  const hrRun = [...mock.state.tables.activities].filter((a) => a.user_id === uid && a.avg_hr).sort((x, y) => y.start_time.localeCompare(x.start_time))[0];
  const prof = mock.state.tables.profiles.find((r) => r.user_id === uid);
  const zoneText = async () => { await page.goto(`${APP}/activity/${hrRun.id}`); await page.waitForTimeout(1800); return (await page.locator('main').innerText()).match(/Z[1-5]\b[^\n]*/g)?.join(' | ') ?? ''; };
  prof.data.profile.maxHr = 160; prof.data.profile.restHr = 50; await clearCache(page);
  const low = await zoneText();
  prof.data.profile.maxHr = 205; await clearCache(page);
  const high = await zoneText();
  check(!!low && !!high && low !== high, 'changing max HR re-labels the run', `${hrRun.avg_hr} bpm: max 160 → "${low.slice(0, 60)}", max 205 → "${high.slice(0, 60)}"`);
  delete prof.data.profile.maxHr; delete prof.data.profile.restHr; await clearCache(page);

  // ---- Hub post title weekday ----
  await page.goto(`${APP}/hub`); await page.waitForTimeout(1500);
  if (await page.locator('#hub-name').count()) { await page.locator('#hub-name').fill('Check R'); await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click(); await page.waitForTimeout(1500); }
  const runs = mock.state.tables.activities.filter((a) => a.user_id === uid && a.source !== 'strava').sort((x, y) => y.start_time.localeCompare(x.start_time)).slice(0, 3);
  let titlesOk = true; const titles = [];
  for (const r of runs) {
    await page.goto(`${APP}/activity/${r.id}`); await page.waitForTimeout(1500);
    const btn = page.getByRole('button', { name: 'Post to Hub' });
    if (!(await btn.count())) continue;
    await btn.click(); await page.waitForTimeout(400);
    const t = await page.locator('#ph-title').inputValue();
    const wd = new Date(r.start_time).toLocaleDateString('en-GB', { weekday: 'long' });
    titles.push(`${t} (${wd})`); if (!t.startsWith(wd)) titlesOk = false;
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  check(titles.length > 0 && titlesOk, 'Hub post titles use the weekday the run started', titles.join('; '));

  // ---- You: Y ----
  await page.goto(`${APP}/you`); await page.waitForTimeout(1500);
  const mTotal = await page.locator('.you-total, .stat-hero').first().innerText().catch(() => '');
  await page.getByRole('button', { name: 'Y', exact: true }).click().catch(() => {}); await page.waitForTimeout(700);
  const yTotal = await page.locator('.you-total, .stat-hero').first().innerText().catch(() => '');
  const bars = await page.locator('.period-bars rect, .pbars rect, svg rect').count();
  check(!!yTotal && yTotal !== mTotal && bars > 1, 'Y changes the total and the chart', `M ${mTotal.replace(/\s+/g, ' ')} → Y ${yTotal.replace(/\s+/g, ' ')}`);

  // ---- How did it feel, niggle ----
  await page.goto(`${APP}/activity/${todayRun.id}`); await page.waitForTimeout(1500);
  const feelSec = page.locator('section', { has: page.locator('#feel') });
  if (await feelSec.count()) { await feelSec.getByRole('button', { name: 'Good', exact: true }).click(); await feelSec.getByRole('button', { name: 'Save how it felt' }).click(); await page.waitForTimeout(2500); }
  const fb = mock.state.tables.session_feedback.find((f) => f.user_id === uid && f.activity_id === todayRun.id);
  check(!!fb?.data?.feel, '"How did it feel?" saves', fb?.data?.feel ? `feel ${fb.data.feel}` : 'not saved');
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Add a run/ }).click();
  await page.getByText('Something hurts').click();
  const tap = (name) => page.getByRole('radio', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first().click();
  await tap('Calf'); await tap('Left');
  await page.locator('#pain').fill('3');
  await page.getByRole('button', { name: 'After the run' }).click();
  await tap('Gradually');
  await page.getByRole('button', { name: 'See what to do' }).click();
  await page.getByText('What Ritmo changes in your plan').waitFor({ timeout: 5000 }).catch(() => {});
  await page.getByRole('button', { name: 'Done' }).click().catch(() => {}); await page.waitForTimeout(2500);
  const profNow = mock.state.tables.profiles.find((r) => r.user_id === uid);
  const niggle = (profNow.data.profile.body?.checkins ?? []).length > 0;
  check(niggle, 'a niggle can be logged from the + menu (Something hurts)');

  // ---- Every main screen × theme × size ----
  const screens = [['Training', '/'], ['Coach', '/coach'], ['Run', '/run'], ['Hub', '/hub'], ['Hub Challenges', '/hub?tab=challenges'], ['Hub Clubs', '/hub?tab=clubs'], ['You', '/you'], ['Insights', '/you/insights'], ['Records', '/you/records'], ['Readiness', '/readiness'], ['Run feedback', `/activity/${todayRun.id}`], ['Profile', '/profile'], ['Shoes', '/profile/shoes'], ['Body', '/profile/body']];
  const sizes = [['390', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 860 }, false]];
  const themes = ['giorno', 'notte', 'sole'];
  const sweep = { overflow: [], unlabelled: [], small: [], focus: [] };
  const st = await ctx.storageState();
  await page.close();
  for (const [sizeName, vp, mobile] of sizes) {
    const c2 = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    await c2.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ } });
    await c2.addCookies(await ctx.cookies());
    const p2 = await c2.newPage();
    p2.on('pageerror', (e) => errors.push(`${p2.url()}: ${e.message}`));
    await mock.install(c2, SUPA);
    await p2.goto(`${APP}/about`);
    await p2.evaluate((origins) => { for (const o of origins) for (const { name, value } of o.localStorage) localStorage.setItem(name, value); }, st.origins);
    for (const theme of themes) {
      for (const [name, url] of screens) {
        await p2.goto(`${APP}${url}`); await p2.waitForTimeout(1300);
        await p2.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await p2.waitForTimeout(150);
        const appliedTheme = await p2.evaluate(() => document.documentElement.dataset.theme ?? 'system');
        const r = await p2.evaluate(() => {
          const vis = (el) => { const s = getComputedStyle(el); const rc = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && rc.width > 0 && rc.height > 0 && !el.closest('[aria-hidden="true"]'); };
          const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          const ctrls = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input[type=checkbox], input[type=radio], select')].filter(vis);
          const unlabelled = ctrls.filter((el) => {
            const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('').trim();
            const lb = el.getAttribute('aria-labelledby'); const lbl = el.id && document.querySelector(`label[for="${el.id}"]`); const wrap = el.closest('label');
            return !name && !lb && !lbl && !wrap && el.tagName !== 'INPUT' ? true : (el.tagName === 'INPUT' && !lbl && !wrap && !el.getAttribute('aria-label') && !lb);
          }).map((el) => el.outerHTML.slice(0, 90));
          // Tap targets: controls outside running text, smaller than 44 px both ways (WCAG lets inline text links be smaller)
          const small = ctrls.filter((el) => {
            if (el.closest('p, li > span, .caption, td') && el.tagName === 'A') return false;
            const r0 = el.getBoundingClientRect(); if (r0.width <= 2 || r0.height <= 2 || el.classList.contains('sr-only') || el.classList.contains('skip-link')) return false;
            if (el.tagName === 'INPUT') { const l = el.closest('label'); const rc = (l ?? el).getBoundingClientRect(); return rc.height < 44 && rc.width < 44; }
            const rc = el.getBoundingClientRect(); return rc.height < 44 && rc.width < 44 || rc.height < 24;
          }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
          return { overflow, unlabelled, small };
        });
        // Keyboard focus: tab to the first few controls and check each shows an outline or ring
        let focusBad = 0, focused = 0;
        for (let i = 0; i < 4; i++) {
          await p2.keyboard.press('Tab');
          const f = await p2.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, ring: s.boxShadow !== 'none' }; });
          if (f) { focused++; if (!f.outline && !f.ring) focusBad++; }
        }
        const tag = `${name} · ${theme}${appliedTheme !== theme ? `(applied ${appliedTheme})` : ''} · ${sizeName}`;
        if (r.overflow) sweep.overflow.push(tag);
        if (r.unlabelled.length) sweep.unlabelled.push(`${tag}: ${r.unlabelled.slice(0, 3).join(' ; ')}`);
        if (r.small.length) sweep.small.push(`${tag}: ${r.small.join(' ; ')}`);
        if (focusBad) sweep.focus.push(`${tag}: ${focusBad} of ${focused}`);
        if (theme !== 'giorno' || sizeName === 'desktop') await p2.screenshot({ path: path.join(OUT, `${sizeName}-${theme}-${name.replace(/\W+/g, '-').toLowerCase()}.png`) });
        else await p2.screenshot({ path: path.join(OUT, `${sizeName}-${theme}-${name.replace(/\W+/g, '-').toLowerCase()}.png`) });
      }
    }
    await c2.close();
  }
  const n = screens.length * themes.length * sizes.length;
  check(!sweep.overflow.length, `no sideways scrolling on ${n} screen views`, sweep.overflow.slice(0, 6).join(' | '));
  check(!sweep.unlabelled.length, 'every icon-only control has a label', sweep.unlabelled.slice(0, 6).join(' | '));
  check(!sweep.small.length, 'tap targets are at least 44 px', `${sweep.small.length} views with small targets: ${sweep.small.slice(0, 8).join(' | ')}`);
  check(!sweep.focus.length, 'keyboard focus is visible', sweep.focus.slice(0, 6).join(' | '));
  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, sweep }, null, 2));
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
