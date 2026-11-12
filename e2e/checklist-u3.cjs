// Update 3 test checklist (brief §11), last item: the screens and sheets added or changed in update 3, in Giorno,
// Notte and Sole, at 390 px and on desktop: no sideways scrolling, every icon-only control labelled, tap targets at
// least 44 px, keyboard focus visible. Plus Fuego on another runner's strength post. The behaviour itself is covered
// by u3-consistency, u3-stage2 … u3-stage5 and the earlier suites.
// Usage: node e2e/checklist-u3.cjs (app on :4173). Writes e2e/out/checklist-u3/report.json and screenshots.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'checklist-u3');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let passed = 0, failed = 0;
const check = (ok, name, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); results.push({ ok: !!ok, name, detail }); ok ? passed++ : failed++; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const GEO = { geolocation: { latitude: 35.9, longitude: 14.5, accuracy: 5 }, permissions: ['geolocation'] };
const init = () => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:maps', 'off'); localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ }
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  const synth = { speaking: false, getVoices: () => [{ name: 'Daniel', lang: 'en-GB', voiceURI: 'd', localService: true }], speak(u) { setTimeout(() => u.onstart?.(), 0); }, cancel() {}, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth }); };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, ...GEO });
  await ctx.addInitScript(init);
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  const email = 'checklist-u3@test.ritmo';
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
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1500); } }
  await page.goto(`${APP}/hub`);
  await page.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
  await page.locator('#hub-name').fill('Sam Checklist');
  await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click();
  await page.waitForTimeout(2500);

  // State for every update 3 screen: a strength session today, an easy run tomorrow, a chosen week, a niggle with a
  // care plan, a recorded strength workout, a run with a GPS gap, and another runner's strength post
  const t0 = ymd(Date.now()), t1 = ymd(Date.now() + 86400e3);
  const P = mock.state.tables.plans[mock.state.tables.plans.length - 1].data;
  const put = (date, patch) => { let s = P.sessions.find((x) => x.date === date); if (!s) { s = { ...P.sessions[0], id: `ck-${date}`, date }; P.sessions.push(s); } Object.assign(s, patch); return s; };
  const today = put(t0, { type: 'easy', title: 'Easy run', status: 'planned', distanceM: 8000, durationS: 2640, steps: [{ kind: 'easy', label: '8 km easy', detail: '8 km easy', km: 8, durationS: 2640 }], strengthPlan: { routine: 'A', intensity: 'heavy', why: 'Builds strength.' } });
  const tom = put(t1, { type: 'easy', title: 'Easy run', status: 'planned', distanceM: 8000, durationS: 2640, steps: [{ kind: 'easy', label: '8 km easy', detail: '8 km easy', km: 8, durationS: 2640 }] });
  const prof = mock.state.tables.profiles.find((r) => r.user_id === uid).data.profile;
  prof.training = { ...prof.training, week: { mode: 'custom', days: ['threshold', 'strength', 'easy', 'intervals', 'rest', 'long', 'easy'], plusStrength: [false, false, false, false, false, true, false], adjustByPhase: false } };
  prof.body = { checkins: [{ id: 'ck1', at: new Date(Date.now() - 3600e3).toISOString(), area: 'Achilles', side: 'right', pain: 2, when: [], onset: 'gradual', trend: 'same', signs: [], redFlags: [] }],
    care: { area: 'achilles', side: 'right', stage: 0, startedAt: t0, stageSince: t0, checks: [], done: [] } };
  prof.log = [{ id: 'sl1', date: ymd(Date.now() - 2 * 86400e3), kind: 'strength', minutes: 32, rpe: 6, at: new Date(Date.now() - 2 * 86400e3).toISOString(), strength: { title: "Runner's strength A", source: 'ritmo', exercises: [{ id: 'bw-squat', name: 'Body-weight squat', planned: 3, sets: [{ reps: 12 }, { reps: 12 }, { reps: 12 }] }] } }];
  prof.strength = { progress: { 'bw-squat': { reps: 12, next: 'up', at: new Date().toISOString() } } };
  const start = new Date(Date.now() - 5 * 3600e3);
  const pts = []; for (let i = 0; i <= 60; i++) pts.push({ t: i * 4, d: i * 16.7, lat: 35.9 + (i * 16.7) / 111195, lon: 14.5 });
  for (let i = 0; i <= 60; i++) pts.push({ t: 240 + i * 4, d: 1002 + i * 16.7, lat: 35.9 + (2500 + i * 16.7) / 111195, lon: 14.502, ...(i === 0 ? { gap: true } : {}) });
  mock.state.tables.activities.push({ user_id: uid, id: 'gps-gap-ck', source: 'ritmo_gps', source_ids: { ritmo_gps: 'gps-gap-ck', gaps: [{ from: new Date(start.getTime() + 240e3).toISOString(), to: new Date(start.getTime() + 600e3).toISOString(), atM: 1002 }] }, start_time: start.toISOString(), name: 'Locked phone run', distance_m: 2004, duration_s: 840, moving_s: 480, detail_score: 6, streams: pts, laps: null, updated_at: new Date().toISOString() });
  const other = crypto.randomUUID();
  mock.state.tables.hub_profiles.push({ user_id: other, display_name: 'Ana Abela', search_name: 'ana abela', private: false });
  mock.state.tables.follows.push({ follower_id: uid, followee_id: other, status: 'accepted', created_at: new Date().toISOString() });
  mock.state.tables.posts.push({ id: crypto.randomUUID(), user_id: other, activity_id: null, title: 'Core and hips', body: null, visibility: 'followers', show_map: false, show_hr: false, route: null, city: null,
    stats: { distanceM: 0, paceS: 0, movingS: 1500, type: 'strength', typeLabel: 'Strength · as planned', device: 'Recorded in Ritmo', strength: { exercises: 5, sets: 12, top: [{ name: 'Plank', dose: '3 x 40 s' }, { name: 'Side plank', dose: '2 x 30 s' }, { name: 'Dead bug', dose: '3 x 10' }, { name: 'Bird dog', dose: '3 x 10' }] } }, ritmo_count: 0, comment_count: 0, created_at: new Date().toISOString() });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  // ---- Fuego on another runner's strength post ----
  await page.goto(`${APP}/hub`); await page.waitForTimeout(2500);
  const post = page.locator('.hub-post', { hasText: 'Core and hips' }).first();
  const fuego = post.getByRole('button', { name: 'Give a Fuego' });
  check(await fuego.isVisible().catch(() => false), "another runner's strength post has a Fuego button");
  await fuego.click().catch(() => {}); await page.waitForTimeout(1200);
  check(mock.state.tables.ritmos.some((r) => r.user_id === uid), 'and giving a Fuego works');
  await post.screenshot({ path: path.join(OUT, 'strength-post-fuego.png') }).catch(() => {});

  // ---- Every update 3 screen and sheet × theme × size ----
  const open = (fn) => fn;
  const screens = [
    ['Training (strength, care, week bar)', '/'],
    ['Goals (choose your week)', '/goals'],
    ['Session page (edit, strength)', `/session/${today.id}`],
    ['Edit a run (sheet)', `/session/${tom.id}`, open(async (p) => { await p.getByRole('button', { name: 'Edit', exact: true }).click(); await p.getByRole('dialog').waitFor(); })],
    ['Strength edit (sheet)', '/', open(async (p) => { await p.locator('.strength-card').first().getByRole('button', { name: 'Edit' }).click(); await p.getByRole('dialog').waitFor(); })],
    ['Swap an exercise (sheet)', '/', open(async (p) => { await p.locator('.strength-card').first().getByRole('button', { name: 'Edit' }).click(); await p.getByRole('dialog').getByRole('button', { name: 'Swap' }).first().click(); await p.getByRole('dialog', { name: /Instead of/ }).waitFor(); })],
    ['Strength player', `/strength/${today.id}`],
    ['Your strength plan', '/strength-plan'],
    ['Profile › Strength', '/profile/strength'],
    ['Care plan', '/care'],
    ['Run: Before you start (sheet)', '/run', open(async (p) => { await p.getByRole('tab', { name: 'Free run' }).click().catch(() => {}); await p.locator('.run-go').click(); await p.getByRole('dialog', { name: 'Before you start' }).waitFor(); })],
    ['Run with a GPS gap', '/activity/gps-gap-ck'],
    ['Coach (Based on)', '/coach'],
    ['Hub (strength post)', '/hub'],
  ];
  const sizes = [['390', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 860 }, false]];
  const themes = ['giorno', 'notte', 'sole'];
  const sweep = { overflow: [], unlabelled: [], small: [], focus: [], failedToOpen: [] };
  const st = await ctx.storageState();
  await page.close();
  for (const [sizeName, vp, mobile] of sizes) {
    const c2 = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, ...GEO });
    await c2.addInitScript(init);
    await c2.addCookies(await ctx.cookies());
    const p2 = await c2.newPage();
    p2.on('pageerror', (e) => errors.push(`${p2.url()}: ${e.message}`));
    await mock.install(c2, SUPA);
    await p2.goto(`${APP}/about`);
    await p2.evaluate((origins) => { for (const o of origins) for (const { name, value } of o.localStorage) localStorage.setItem(name, value); }, st.origins);
    for (const theme of themes) {
      for (const [name, url, act] of screens) {
        await p2.goto(`${APP}${url}`); await p2.waitForTimeout(1400);
        await p2.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await p2.waitForTimeout(150);
        if (act) { try { await act(p2); await p2.waitForTimeout(400); } catch (e) { sweep.failedToOpen.push(`${name} · ${theme} · ${sizeName}: ${String(e.message).split('\n')[0].slice(0, 80)}`); } }
        const r = await p2.evaluate(() => {
          const vis = (el) => { const s = getComputedStyle(el); const rc = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && rc.width > 0 && rc.height > 0 && !el.closest('[aria-hidden="true"]'); };
          const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          // With a sheet open, only the sheet counts (the page behind can't be reached)
          const root = document.querySelector('[role="dialog"]') ?? document;
          const ctrls = [...root.querySelectorAll('button, a[href], [role="button"], [role="tab"], input[type=checkbox], input[type=radio], select')].filter(vis);
          const unlabelled = ctrls.filter((el) => {
            const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('').trim();
            const lb = el.getAttribute('aria-labelledby'); const lbl = el.id && document.querySelector(`label[for="${el.id}"]`); const wrap = el.closest('label');
            return !name && !lb && !lbl && !wrap && el.tagName !== 'INPUT' ? true : (el.tagName === 'INPUT' && !lbl && !wrap && !el.getAttribute('aria-label') && !lb);
          }).map((el) => el.outerHTML.slice(0, 90));
          const small = ctrls.filter((el) => {
            if (el.closest('p, li > span, .caption, td') && el.tagName === 'A') return false;
            const r0 = el.getBoundingClientRect(); if (r0.width <= 2 || r0.height <= 2 || el.classList.contains('sr-only') || el.classList.contains('skip-link')) return false;
            if (el.tagName === 'INPUT') { const l = el.closest('label'); const rc = (l ?? el).getBoundingClientRect(); return rc.height < 44 && rc.width < 44; }
            if (el.tagName === 'SELECT') return el.getBoundingClientRect().height < 40;
            const rc = el.getBoundingClientRect(); return rc.height < 44 && rc.width < 44 || rc.height < 24;
          }).map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
          return { overflow, unlabelled, small };
        });
        let focusBad = 0, focused = 0;
        for (let i = 0; i < 5; i++) {
          await p2.keyboard.press('Tab');
          const f = await p2.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, ring: s.boxShadow !== 'none', what: `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}` }; });
          if (f) { focused++; if (!f.outline && !f.ring) focusBad++; }
        }
        const tag = `${name} · ${theme} · ${sizeName}`;
        if (r.overflow) sweep.overflow.push(tag);
        if (r.unlabelled.length) sweep.unlabelled.push(`${tag}: ${r.unlabelled.slice(0, 3).join(' ; ')}`);
        if (r.small.length) sweep.small.push(`${tag}: ${r.small.join(' ; ')}`);
        if (focusBad) sweep.focus.push(`${tag}: ${focusBad} of ${focused}`);
        await p2.screenshot({ path: path.join(OUT, `${sizeName}-${theme}-${name.replace(/\W+/g, '-').toLowerCase()}.png`) });
      }
    }
    await c2.close();
  }
  const n = screens.length * themes.length * sizes.length;
  check(!sweep.failedToOpen.length, `every screen and sheet opened (${n} views)`, sweep.failedToOpen.slice(0, 6).join(' | '));
  check(!sweep.overflow.length, `no sideways scrolling on ${n} views`, sweep.overflow.slice(0, 8).join(' | '));
  check(!sweep.unlabelled.length, 'every icon-only control has a label', sweep.unlabelled.slice(0, 8).join(' | '));
  check(!sweep.small.length, 'tap targets are at least 44 px', `${sweep.small.length} views: ${sweep.small.slice(0, 10).join(' | ')}`);
  check(!sweep.focus.length, 'keyboard focus is visible', sweep.focus.slice(0, 8).join(' | '));
  check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, sweep }, null, 2));
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
