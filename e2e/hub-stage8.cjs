// Stage 8 (brief §9): Hub sections Feed | Challenges | Clubs, the "Your week" card, joining a challenge and seeing
// progress move after a run (a Strava import counts), the badge on Profile, and clubs: start, join, Going, the
// leaderboard (Strava runs never count) and an admin adding a group run. Usage: node e2e/hub-stage8.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'hub-stage8');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

async function signUp(page, mock, email) {
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  return mock.state.users.get(email).id;
}

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:hub:tip', '1'); localStorage.setItem('ritmo:maps', 'off'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const uid = await signUp(page, mock, 'stage8@test.ritmo');
  const rows = ryanRows(uid, new Date());
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  // ---- Sections and Challenges (no sharing needed) ----
  await page.goto(`${APP}/hub`); await page.waitForTimeout(1500);
  for (const s of ['Feed', 'Challenges', 'Clubs']) check(await page.getByRole('group', { name: 'Hub sections' }).getByRole('button', { name: s }).isVisible(), `Hub section "${s}"`);
  await page.getByRole('button', { name: 'Challenges', exact: true }).click();
  await page.getByText('Join a challenge').waitFor();
  check(page.url().includes('tab=challenges'), 'the section is kept in the address');
  const month = new Date().toLocaleDateString('en-GB', { month: 'long' });
  const big = `200 km in ${month}`;
  check(await page.getByRole('article', { name: big }).isVisible(), `"${big}" is offered`);
  await page.getByRole('button', { name: `Join ${big}` }).click(); await page.waitForTimeout(400);
  const card = page.getByRole('article', { name: big }).first();
  check(await card.getByText('Joined', { exact: true }).isVisible(), 'joined: the card shows "Joined"');
  const line1 = await card.locator('.challenge-line').innerText();
  check(/ of 200 km · (\d+ days left|Last day)/.test(line1), `status line "${line1}"`);
  const bar1 = Number(await card.getByRole('progressbar').getAttribute('aria-valuenow'));
  await page.screenshot({ path: path.join(OUT, 'challenges.png') });
  await page.waitForTimeout(2000); // let the profile save to the account

  // A run arrives from Strava: it counts toward the challenge even though it is never posted
  const today = new Date(); today.setHours(7, 0, 0, 0);
  mock.state.tables.activities.push({ user_id: uid, id: 'strava-test-1', source: 'strava', source_ids: { strava: '1' }, start_time: today.toISOString(), name: 'Morning run', distance_m: 40000, duration_s: 14400, moving_s: 14400, avg_hr: 140, updated_at: new Date().toISOString() });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.reload(); await page.waitForTimeout(2000);
  const bar2 = Number(await page.getByRole('article', { name: big }).first().getByRole('progressbar').getAttribute('aria-valuenow'));
  check(bar2 >= bar1 + 19, `progress moves after a run, Strava included (${bar1}% → ${bar2}%)`);
  // Finish a challenge: the 100 km one with today's 40 km and the month's runs
  const small = `100 km in ${month}`;
  mock.state.tables.activities.push({ user_id: uid, id: 'strava-test-2', source: 'strava', source_ids: { strava: '2' }, start_time: today.toISOString(), name: 'Long run', distance_m: 100000, duration_s: 36000, moving_s: 36000, updated_at: new Date().toISOString() });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.reload(); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: `Join ${small}` }).click(); await page.waitForTimeout(1200);
  check(await page.getByRole('article', { name: small }).first().getByText('Complete', { exact: true }).isVisible(), 'a finished challenge shows "Complete"');
  check(await page.locator('.badge-shelf').getByText(small).isVisible(), 'and its badge is on the shelf');
  await page.waitForTimeout(1500);
  await page.goto(`${APP}/profile`); await page.waitForTimeout(1500);
  check(await page.locator('.badge-shelf').getByText(small).isVisible(), 'the badge shows on Profile');

  // ---- Feed: opt in, Your week, chips ----
  await page.goto(`${APP}/hub`); await page.waitForTimeout(1200);
  await page.locator('#hub-name').fill('Sam R');
  await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click(); await page.waitForTimeout(1200);
  for (const c of ['Following', 'Everyone', 'Your runs']) check(await page.getByRole('group', { name: 'Show runs from' }).getByRole('button', { name: c }).isVisible(), `feed filter "${c}"`);
  const week = page.locator('.hub-week');
  check(await week.isVisible() && /Your week/.test(await week.innerText()), 'the "Your week" card shows');
  check(await week.locator('.hub-week-bar.today').count() === 1, 'today is the orange bar');
  for (const n of ['Find runners', 'Hub settings']) check(await page.getByRole('button', { name: n }).isVisible(), `header: ${n}`);
  check(await page.getByRole('button', { name: /^Notifications/ }).isVisible(), 'header: Notifications');
  await page.screenshot({ path: path.join(OUT, 'feed.png') });

  // Share the finished challenge to the Feed (only when chosen)
  await page.getByRole('button', { name: 'Challenges', exact: true }).click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Share to Feed' }).first().click(); await page.waitForTimeout(800);
  const cp = mock.state.tables.posts.find((p) => p.user_id === uid && p.stats?.type === 'challenge');
  check(!!cp && cp.visibility === 'followers' && !cp.activity_id, 'the badge is posted to followers when shared');
  await page.getByRole('button', { name: 'Feed', exact: true }).click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Your runs' }).click(); await page.waitForTimeout(900);
  check(await page.locator('article.hub-post .hub-badge-post').count() === 1, 'the challenge post shows as a badge');

  // ---- Clubs ----
  await page.getByRole('button', { name: 'Clubs', exact: true }).click(); await page.waitForTimeout(900);
  await page.getByText('You are not in a club yet').waitFor();
  check(true, 'no club yet: an empty state with Find a club');
  await page.getByRole('button', { name: 'Find a club' }).click();
  await page.getByRole('button', { name: 'Start a club' }).click();
  await page.locator('#club-name').fill('Valletta Runners'); await page.locator('#club-area').fill('Valletta');
  await page.getByRole('button', { name: 'Start the club' }).click(); await page.waitForTimeout(1200);
  const club = mock.state.tables.clubs[0];
  check(club?.name === 'Valletta Runners', 'a club is started');
  check(mock.state.tables.club_members.some((m) => m.club_id === club.id && m.user_id === uid && m.role === 'admin'), 'the creator is its admin');
  check(await page.locator('.club-card').getByText('Valletta Runners').isVisible(), 'the club card shows');

  // Another member with a Ritmo run and a Strava run this week; one more who chose not to be on the leaderboard
  const ana = '00000000-0000-4000-8000-0000000000a1', ben = '00000000-0000-4000-8000-0000000000b2';
  mock.state.tables.hub_profiles.push({ user_id: ana, display_name: 'Ana B', private: false }, { user_id: ben, display_name: 'Ben C', private: false });
  mock.state.tables.club_members.push({ club_id: club.id, user_id: ana, role: 'member', on_leaderboard: true, joined_at: new Date().toISOString() }, { club_id: club.id, user_id: ben, role: 'member', on_leaderboard: false, joined_at: new Date().toISOString() });
  club.member_count = 3;
  mock.state.tables.activities.push({ user_id: ana, id: 'ana-1', source: 'ritmo_gps', start_time: today.toISOString(), distance_m: 300000, moving_s: 90000 }, { user_id: ana, id: 'ana-2', source: 'strava', start_time: today.toISOString(), distance_m: 999000, moving_s: 9000 }, { user_id: ben, id: 'ben-1', source: 'ritmo_gps', start_time: today.toISOString(), distance_m: 500000, moving_s: 90000 });

  // Admin adds a group run from the club page
  await page.locator('.club-card .club-row').first().click(); await page.waitForURL(/hub\/club\//);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.locator('#gr-title').fill('Saturday long run'); await page.locator('#gr-meet').fill('Upper Barrakka');
  await page.getByRole('button', { name: 'Add group run' }).click(); await page.waitForTimeout(1200);
  check(mock.state.tables.group_runs.some((g) => g.title === 'Saturday long run'), 'the admin adds a group run');
  const going = page.getByRole('button', { name: /^Going/ }).first();
  await going.click(); await page.waitForTimeout(800);
  check(await going.getAttribute('aria-pressed') === 'true' && mock.state.tables.group_run_going.length === 1, 'Going is marked and saved');
  check(await page.getByText('1 going').first().isVisible(), '"1 going" shows');
  const board = await page.locator('.leaderboard').innerText();
  check(/Ana B/.test(board), 'the leaderboard lists a member who allows it');
  check(!/Ben C/.test(board), 'a member who did not allow it is not listed');
  check(/300(\.0)? km/.test(board) && !/1,?299|1299/.test(board), `Strava runs never count on the leaderboard (${board.replace(/\n/g, ' ')})`);
  check(await page.locator('.leader-row.me').count() === 1, 'your own row is highlighted');
  await page.screenshot({ path: path.join(OUT, 'club.png'), fullPage: true });
  await page.goto(`${APP}/hub?tab=clubs`); await page.waitForTimeout(1500);
  check(await page.locator('.club-card .date-block').isVisible(), 'the club card shows the next group run with a date block');
  await page.screenshot({ path: path.join(OUT, 'clubs.png') });

  // Another runner can find and join the club
  const ctx2 = await b.newContext({ ...devices['Pixel 7'] });
  await ctx2.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ } });
  await mock.install(ctx2, SUPA);
  const p2 = await ctx2.newPage();
  const uid2 = await signUp(p2, mock, 'stage8b@test.ritmo');
  const rows2 = ryanRows(uid2, new Date());
  for (const t of Object.keys(rows2)) mock.state.tables[t].push(...rows2[t]);
  await p2.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await p2.goto(`${APP}/hub?tab=clubs`); await p2.waitForTimeout(1800);
  await p2.locator('#hub-name').fill('Cara D');
  await p2.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click(); await p2.waitForTimeout(1200);
  await p2.getByRole('button', { name: 'Find a club' }).click();
  await p2.getByLabel('Search clubs by name or area').fill('vallet'); await p2.waitForTimeout(800);
  await p2.getByRole('button', { name: 'Join Valletta Runners' }).click(); await p2.waitForTimeout(1200);
  check(mock.state.tables.club_members.some((m) => m.club_id === club.id && m.user_id === uid2 && m.role === 'member'), 'another runner finds the club by area and joins as a member');
  check(await p2.locator('.club-card').getByText('Valletta Runners').isVisible(), 'and sees the club card');

  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
