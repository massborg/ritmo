// Update 2, stage 4 (§6, §7, §10), with two made-up runners in separate browsers:
// - Find runners: a full screen; typing a name letter by letter keeps the keyboard (focus) and shows results from the
//   first letter, accents ignored, with the right follow button
// - profile photos: the other runner sees the photo on posts; with "Only me" they see initials
// - automatic posting: an uploaded GPX run reaches the follower's feed without a tap; a Strava run never does and
//   offers "upload the original file"; turning automatic posting off stops new posts
// Usage: node e2e/update2-stage4.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path'); const os = require('os');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'update2-stage4');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const tap = async (loc) => { await loc.waitFor({ timeout: 15000 }); await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await loc.click(); };

function gpx(startIso, km, paceS) {
  const t0 = new Date(startIso).getTime(); const pts = [];
  for (let d = 0, t = 0; d <= km * 1000; d += 25, t += paceS * 0.025) pts.push(`<trkpt lat="${(35.9 + d / 111195).toFixed(7)}" lon="${(14.5 + Math.sin(d / 900) / 300).toFixed(6)}"><time>${new Date(t0 + t * 1000).toISOString()}</time></trkpt>`);
  return `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Lunch run</name><type>running</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const errors = [];
  const runner = async (email, name, setupRows) => {
    const ctx = await b.newContext({ ...devices['Pixel 7'] });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
    await mock.install(ctx, SUPA);
    await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 404, body: '' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${APP}/signup`);
    await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
    for (const c of await page.locator('.consent input').all()) await c.check();
    await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
    await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
    await page.waitForURL(/setup/);
    const uid = mock.state.users.get(email).id;
    const rows = ryanRows(uid, new Date());
    if (setupRows) setupRows(rows, uid);
    for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
    await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
    await page.goto(`${APP}/`); await page.waitForTimeout(1500);
    for (const n of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name: n }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
    return { page, uid };
  };
  const join = async (page, hubName) => {
    await page.goto(`${APP}/hub`);
    await page.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
    await page.locator('#hub-name').fill(hubName);
    const approve = page.getByRole('checkbox', { name: /Approve new followers/ });
    if (await approve.isChecked()) await approve.uncheck();
    await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click();
    await page.waitForTimeout(2500);
  };

  // A photo for Lena, made in the browser as a real JPEG
  const { page: A, uid: aId } = await runner('lena@test.ritmo', 'Lena', (rows) => { rows.profiles[0].data.profile.avatar = { path: '', updatedAt: new Date().toISOString() }; });
  const jpeg = Buffer.from((await A.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#2F5FB3'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#E9B91E'; g.beginPath(); g.arc(128, 110, 60, 0, 7); g.fill(); return c.toDataURL('image/jpeg', 0.9); })).split(',')[1], 'base64');
  mock.state.files.set(`avatars/${aId}/avatar.jpg`, jpeg);
  const profA = mock.state.tables.profiles.find((r) => r.user_id === aId);
  profA.data.profile.avatar = { path: `${aId}/avatar.jpg`, updatedAt: new Date().toISOString() };
  await A.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  // ---- Lena joins the Hub: automatic posting is explained and on ----
  await A.goto(`${APP}/hub`);
  await A.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
  const optText = await A.locator('main').innerText();
  check(/Your runs are posted automatically, to your followers\. Runs from Strava never are/.test(optText), 'joining explains automatic posting, and that Strava runs never are');
  check(await A.getByRole('checkbox', { name: 'Post my runs automatically' }).isChecked(), '"Post my runs automatically" is on by default');
  await join(A, 'Lena Żammit');
  await A.waitForTimeout(4000);
  const hubA = () => mock.state.tables.hub_profiles.find((h) => h.user_id === aId);
  check(hubA()?.search_name === 'lena zammit', `the Hub name is searchable without accents (${hubA()?.search_name})`);
  check(hubA()?.photo_path === `${aId}/avatar-small.jpg` && mock.state.files.has(`avatars/${aId}/avatar-small.jpg`), 'a small copy of the photo is made for lists');
  check((hubA()?.photo_visibility ?? 'everyone') === 'everyone', 'the photo is visible to everyone by default');

  // ---- Tom joins and finds Lena ----
  const { page: B, uid: bId } = await runner('tom@test.ritmo', 'Tom');
  await join(B, 'Tom Vella');
  await B.goto(`${APP}/hub`); await B.waitForTimeout(1200);
  await tap(B.getByRole('link', { name: 'Find runners' }));
  await B.waitForURL(/\/hub\/find/);
  check(await B.getByRole('heading', { name: 'Find runners' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'Find runners is a full screen');
  const box = B.getByRole('searchbox', { name: 'Search runners by name' });
  await B.waitForTimeout(300);
  check(await box.evaluate((e) => e === document.activeElement), 'the search box is focused on open');
  check(await box.getAttribute('autocapitalize') === 'none' && await box.getAttribute('autocorrect') === 'off' && await box.getAttribute('type') === 'search', 'search keyboard, no autocorrect or capitals');
  await box.pressSequentially('zam', { delay: 120 });
  check(await box.inputValue() === 'zam', `typing "zam" keeps every letter (${await box.inputValue()})`);
  check(await box.evaluate((e) => e === document.activeElement), 'and the box keeps focus (the keyboard stays open)');
  await B.waitForTimeout(900);
  const row = B.locator('.find-row', { hasText: 'Lena Żammit' });
  check(await row.isVisible(), '"zam" finds "Lena Żammit" (accents ignored)');
  check(await row.getByRole('button', { name: 'Follow' }).isVisible(), 'with a Follow button');
  check(await row.locator('img.hub-avatar-img').count() === 1, 'and her photo');
  await B.screenshot({ path: path.join(OUT, 'find-runners.png') });
  await box.fill(''); await box.pressSequentially('l', { delay: 50 }); await B.waitForTimeout(900);
  check(await B.locator('.find-row', { hasText: 'Lena Żammit' }).isVisible(), 'results start from the first letter');
  await tap(B.locator('.find-row', { hasText: 'Lena Żammit' }).getByRole('button', { name: 'Follow' }));
  await B.waitForTimeout(1200);
  check(await B.locator('.find-row', { hasText: 'Lena Żammit' }).getByRole('button', { name: 'Following' }).isVisible(), 'after following a public profile the button says Following');
  // Lena sees Tom as "Follow back"
  await A.goto(`${APP}/hub/find`); await A.waitForTimeout(1500);
  const sugg = A.locator('.find-row', { hasText: 'Tom Vella' });
  check(await sugg.isVisible() && /Follows you/.test(await sugg.innerText()), 'Lena gets Tom under "Suggested for you", saying "Follows you"');
  check(await sugg.getByRole('button', { name: 'Follow back' }).isVisible(), 'with "Follow back"');
  await A.screenshot({ path: path.join(OUT, 'suggested.png') });
  // Unfollowing asks first
  await B.goto(`${APP}/hub/find`); await B.waitForTimeout(600);
  await B.getByRole('searchbox').pressSequentially('lena', { delay: 40 }); await B.waitForTimeout(900);
  await tap(B.locator('.find-row', { hasText: 'Lena Żammit' }).getByRole('button', { name: 'Following' }));
  check(await B.getByRole('dialog', { name: 'Unfollow Lena Żammit?' }).isVisible(), '"Following" asks before unfollowing');
  await tap(B.getByRole('dialog', { name: 'Unfollow Lena Żammit?' }).getByRole('button', { name: 'Cancel' }));
  await B.getByRole('searchbox').fill('xyzq'); await B.waitForTimeout(900);
  check(await B.getByText("No runners found for 'xyzq'").isVisible() && await B.getByRole('button', { name: 'Invite friends' }).first().isVisible(), 'no results: "No runners found" with Invite friends');

  // ---- Lena uploads a run: it reaches Tom's feed without a tap ----
  const file = path.join(os.tmpdir(), `lena-${Date.now()}.gpx`);
  fs.writeFileSync(file, gpx(new Date(Date.now() - 3 * 3600e3).toISOString(), 6.4, 330));
  await A.goto(`${APP}/profile/data`); await A.waitForTimeout(1200);
  await A.locator('input[type=file]').first().setInputFiles(file);
  await A.waitForTimeout(7000);
  const auto = mock.state.tables.posts.filter((p) => p.user_id === aId);
  check(auto.length === 1, `the uploaded run is posted automatically (${auto.length} post)`);
  check(auto[0]?.visibility === 'followers', 'to followers, the default audience');
  check(Array.isArray(auto[0]?.route) && auto[0].route[0][0] > 35.9 + 150 / 111195, 'with the start of the route hidden');
  check(!mock.state.tables.posts.some((p) => p.user_id === aId && /strava/.test(p.activity_id ?? '')), 'no older run or Strava run was posted');
  await B.goto(`${APP}/hub`); await B.waitForTimeout(2500);
  const card = B.locator('article.hub-post', { hasText: 'Lena Żammit' }).first();
  check(await card.isVisible(), 'Tom sees it in his Following feed');
  check(await card.locator('img.hub-avatar-img').count() >= 1, 'with Lena\'s photo, not her initials');
  await card.screenshot({ path: path.join(OUT, 'post-with-photo.png') });

  // ---- A Strava run never posts, and offers the original file ----
  const sid = 'strava-77001';
  const t1 = new Date(Date.now() - 90 * 60e3);
  mock.state.tables.activities.push({ user_id: aId, id: sid, source: 'strava', source_ids: { strava: '77001' }, start_time: t1.toISOString(), name: 'Strava Harbour Run', distance_m: 9100, duration_s: 2900, moving_s: 2880, detail_score: 4, updated_at: new Date().toISOString() });
  await A.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await A.goto(`${APP}/activity/${sid}`); await A.waitForTimeout(6000);
  check(!mock.state.tables.posts.some((p) => p.activity_id === sid), 'a Strava run is never posted');
  check(await A.getByText(/Strava's rules don't let apps show it to anyone else/).isVisible(), 'its page explains why, kindly');
  const share = A.getByRole('button', { name: 'Share this run: upload the original file from Garmin Connect' });
  check(await share.isVisible(), 'and offers "Share this run: upload the original file from Garmin Connect"');
  await tap(share);
  check(await A.getByRole('dialog', { name: 'Share this run' }).getByText('Export Original').isVisible(), 'with a short guide and the upload');
  await A.screenshot({ path: path.join(OUT, 'strava-share.png') });
  await tap(A.getByRole('dialog', { name: 'Share this run' }).getByRole('button', { name: 'Close' }));

  // ---- Photo "Only me": Tom sees initials ----
  await A.goto(`${APP}/profile`); await A.waitForTimeout(1200);
  await tap(A.getByRole('radio', { name: 'Only me' }).or(A.getByRole('button', { name: 'Only me' })).first());
  await A.waitForTimeout(3500);
  check(hubA()?.photo_visibility === 'only_me', 'Profile has "Who can see your photo", saved to the Hub profile');
  const C = await b.newContext({ ...devices['Pixel 7'] }); // a fresh session for Tom, so nothing is cached
  await C.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(C, SUPA);
  const B2 = await C.newPage();
  await B2.goto(`${APP}/login`); await B2.locator('input[type=email]').fill('tom@test.ritmo'); await B2.locator('input[type=password]').fill('Runner2026');
  await B2.getByRole('button', { name: /Log in/ }).click(); await B2.waitForTimeout(2500);
  await B2.goto(`${APP}/hub`); await B2.waitForTimeout(2500);
  const card2 = B2.locator('article.hub-post', { hasText: 'Lena Żammit' }).first();
  check(await card2.isVisible() && await card2.locator('img.hub-avatar-img').count() === 0 && /LŻ|LZ/.test(await card2.locator('.hub-avatar').first().innerText()), 'with "Only me", Tom sees her initials instead');

  // ---- Turning automatic posting off stops new posts ----
  await A.goto(`${APP}/profile/hub`); await A.waitForTimeout(1200);
  await A.getByRole('checkbox', { name: /Post my runs to the Hub automatically/ }).uncheck();
  await A.waitForTimeout(1500);
  const file2 = path.join(os.tmpdir(), `lena2-${Date.now()}.gpx`);
  fs.writeFileSync(file2, gpx(new Date(Date.now() - 60 * 60e3).toISOString(), 4.2, 320));
  await A.goto(`${APP}/profile/data`); await A.waitForTimeout(1000);
  await A.locator('input[type=file]').first().setInputFiles(file2);
  await A.waitForTimeout(6000);
  check(mock.state.tables.posts.filter((p) => p.user_id === aId).length === 1, 'with automatic posting off, the next run is not posted');

  // ---- The run's ⋯ menu: Hide from Hub ----
  const postedRun = auto[0]?.activity_id;
  await A.goto(`${APP}/activity/${postedRun}`); await A.waitForTimeout(2500);
  await tap(A.getByRole('button', { name: 'Run options' }));
  const dlg = A.getByRole('dialog', { name: 'Run options' });
  check(await dlg.getByRole('button', { name: 'Hide from Hub' }).isVisible() && await dlg.getByRole('button', { name: 'Change audience' }).isVisible(), 'a posted run offers "Hide from Hub" and "Change audience"');
  await tap(dlg.getByRole('button', { name: 'Hide from Hub' }));
  await A.waitForTimeout(1200);
  check(mock.state.tables.posts.find((p) => p.activity_id === postedRun)?.visibility === 'only_me', 'Hide from Hub makes it visible only to her (and it is not posted again)');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
