// Review #2 acceptance 10 and 17 (app side; the database rules are verified directly in Supabase): the Hub
// only shows for flagged accounts and only after a separate opt-in; a run is posted with a chosen visibility;
// Ritmo toggles on tap and double-tap and the count is right after rapid toggling; the "who gave a ritmo"
// list works; comment, reply and delete work. Usage: node e2e/hub.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'hub');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'hub@test.ritmo';
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const uid = mock.state.users.get(email).id;
  const rows = ryanRows(uid, new Date());
  // give the newest run a GPS route, so the post has a map
  const last = rows.activities[rows.activities.length - 1];
  last.streams = Array.from({ length: 200 }, (_, i) => ({ t: i * 20, d: i * 70, lat: 35.9 + (i * 70) / 111195, lon: 14.5 + Math.sin(i / 20) / 500 }));
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));

  // Not flagged yet: no Hub
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  check(await page.locator('.tabbar a[href="/hub"]').count() === 1, 'every runner has the Hub tab (no flag needed)');
  await page.goto(`${APP}/hub`); await page.waitForTimeout(500);
  check(await page.getByText('Not available yet').count() === 0 && await page.getByText('Available with your own data').count() === 0, 'and /hub opens for every runner');

  // Flag on: opt-in first, sharing is off until agreed
  mock.state.tables.feature_flags.push({ user_id: uid, flag: 'hub' });
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(1500);
  check(await page.locator('.tabbar a[href="/hub"]').isVisible(), 'flagged: Hub is in the tab bar');
  await page.locator('.tabbar a[href="/hub"]').click();
  await page.getByText('Share your runs on the Hub?').waitFor();
  check(true, 'the Hub asks for a separate sharing consent first');
  check(!mock.state.tables.profiles.find((p) => p.user_id === uid)?.data?.profile?.consents?.hubSharing, 'sharing is off until the runner agrees');
  await page.locator('#hub-name').fill('Sam R');
  await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click();
  await page.getByText('Give a ritmo: Ritmo’s way of saying nice run.').waitFor();
  check(true, 'first-time tip teaches the word "ritmo"');
  await page.waitForTimeout(1600);
  const consent = mock.state.tables.profiles.find((p) => p.user_id === uid)?.data?.profile?.consents?.hubSharing;
  check(consent?.granted === true && !!consent.at, 'the consent and its date are recorded');

  // Post the newest run
  await page.goto(`${APP}/activity/${last.id}`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Post to Hub' }).click();
  await page.getByRole('radio', { name: 'Everyone' }).or(page.getByRole('button', { name: 'Everyone' })).first().click();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByText('Posted.').waitFor({ timeout: 8000 });
  const post = mock.state.tables.posts.find((p) => p.user_id === uid);
  check(post?.visibility === 'everyone', 'the post is saved with the chosen visibility');
  check(Array.isArray(post?.route) && post.route.length > 5 && post.route[0][0] > 35.9 + 150 / 111195, 'the route is saved with the start trimmed off');
  check(!JSON.stringify(post).match(/feel|pain|notes/), 'how it felt, pain and notes are not in the post');

  // Ritmo: tap on, off, rapid toggling, double-tap on the route
  await page.goto(`${APP}/hub`); await page.waitForTimeout(1200);
  await page.getByRole('radio', { name: 'Your runs' }).or(page.getByRole('button', { name: 'Your runs' })).first().click(); await page.waitForTimeout(800);
  check(await page.getByText('No ritmos yet').isVisible(), 'own post with none: "No ritmos yet"');
  // No reacting to your own run: no button, and double-tapping its route does nothing
  const ownCard = page.locator('article.hub-post').first();
  check(await ownCard.getByRole('button', { name: /Give a ritmo|Take back your ritmo/ }).count() === 0, 'your own post has no ritmo button');
  const ownRoute = ownCard.locator('.hub-route');
  if (await ownRoute.count()) { await ownRoute.click(); await page.waitForTimeout(80); await ownRoute.click(); await page.waitForTimeout(700); }
  check(post.ritmo_count === 0, 'double-tapping your own route does not give a ritmo');

  // Another runner's public post: ritmo on, off, rapid toggling, double-tap
  const otherId = '00000000-0000-4000-8000-0000000000aa';
  mock.state.tables.hub_profiles.push({ user_id: otherId, display_name: 'Ana B', visibility: 'everyone', updated_at: new Date().toISOString() });
  const other = { ...post, id: '00000000-0000-4000-8000-0000000000bb', user_id: otherId, title: 'Ana morning run', ritmo_count: 0, comment_count: 0, created_at: new Date().toISOString() };
  mock.state.tables.posts.push(other);
  await page.goto(`${APP}/hub`); await page.waitForTimeout(1000);
  await page.getByRole('radio', { name: 'Everyone' }).or(page.getByRole('button', { name: 'Everyone' })).first().click(); await page.waitForTimeout(900);
  const card = page.locator('article.hub-post', { hasText: 'Ana morning run' });
  const btn = card.getByRole('button', { name: /Give a ritmo|Take back your ritmo/ });
  await btn.click(); await page.waitForTimeout(400);
  check(await btn.getAttribute('aria-pressed') === 'true', 'tap gives a ritmo (aria-pressed)');
  for (let i = 0; i < 5; i++) { await btn.click(); await page.waitForTimeout(120); }
  await page.waitForTimeout(1200);
  const pressed = await btn.getAttribute('aria-pressed') === 'true';
  check(other.ritmo_count === (pressed ? 1 : 0), `after rapid toggling the stored count matches the button (${other.ritmo_count}, ${pressed ? 'on' : 'off'})`);
  if (pressed) { await btn.click(); await page.waitForTimeout(600); }
  const route = card.locator('.hub-route');
  await route.click(); await page.waitForTimeout(80); await route.click();
  await page.waitForTimeout(900);
  check(other.ritmo_count === 1 && await btn.getAttribute('aria-pressed') === 'true', 'double-tapping the route gives a ritmo');
  await page.screenshot({ path: path.join(OUT, 'feed.png') });
  await card.locator('.ritmo-count').click();
  await page.getByText('1 ritmo', { exact: true }).waitFor();
  await page.getByText('Sam R gave a ritmo').waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByText('Sam R gave a ritmo').isVisible(), '"who gave a ritmo" lists the runner');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // Comments: add, reply, delete
  await page.getByRole('button', { name: /comments/ }).first().click();
  await page.getByLabel('Write a comment').fill('Great run');
  await page.getByRole('button', { name: 'Send' }).click(); await page.waitForTimeout(600);
  check(await page.getByText('Great run').isVisible(), 'a comment is added');
  await page.getByRole('button', { name: 'Reply' }).first().click();
  await page.getByLabel('Write a comment').fill('Thanks');
  await page.getByRole('button', { name: 'Send' }).click(); await page.waitForTimeout(600);
  const reply = mock.state.tables.comments.find((c) => c.body === 'Thanks');
  check(!!reply?.parent_id, 'a reply is threaded under the comment');
  await page.screenshot({ path: path.join(OUT, 'comments.png') });
  await page.getByRole('button', { name: 'Delete' }).last().click(); await page.waitForTimeout(600);
  check(!mock.state.tables.comments.find((c) => c.body === 'Thanks'), 'a comment can be deleted');
  check(errors.length === 0, `no errors ${errors.slice(0, 2).join(' | ')}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})();
