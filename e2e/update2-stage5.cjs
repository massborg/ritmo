// Update 2, stage 5 (§11–§14), with two made-up runners in separate browsers:
// - a private profile shows its header and counts to non-followers, with "This account is private"
// - a follow request appears under Follow requests; Accept shows "You accepted…" with Follow back, and a toast
// - Follow back updates the counts on both profiles
// - the Hub profile: photo ring, name, Fuego received, counts, Edit and Share; tapping your photo in the Hub opens it
// - PBs: off by default; Half + Marathon with a self-reported time; the preview matches the profile
// - Followers list with "Not following back", and Remove follower
// Usage: node e2e/update2-stage5.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const fs = require('fs'); const path = require('path');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = path.join(__dirname, 'out', 'update2-stage5');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const tap = async (loc) => { await loc.waitFor({ timeout: 15000 }); await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await loc.click(); };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const errors = [];
  const runner = async (email, label) => {
    const ctx = await b.newContext({ ...devices['Pixel 7'] });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
    await mock.install(ctx, SUPA);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    await page.goto(`${APP}/signup`);
    await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
    for (const c of await page.locator('.consent input').all()) await c.check();
    await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
    await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
    await page.waitForURL(/setup/);
    const uid = mock.state.users.get(email).id;
    const rows = ryanRows(uid, new Date());
    for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
    await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
    await page.goto(`${APP}/`); await page.waitForTimeout(1500);
    for (const n of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name: n }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1200); } }
    return { page, uid };
  };
  const join = async (page, hubName, approve) => {
    await page.goto(`${APP}/hub`);
    await page.getByText('Share your runs on the Hub?').waitFor({ timeout: 15000 });
    await page.locator('#hub-name').fill(hubName);
    const box = page.getByRole('checkbox', { name: /Approve new followers/ });
    if ((await box.isChecked()) !== approve) await box.click();
    await page.getByRole('button', { name: 'Yes, share my runs on the Hub' }).click();
    await page.waitForTimeout(2500);
  };
  const countOf = async (page, label) => Number((await page.locator('.profile-count', { hasText: label }).locator('.stat').innerText()).replace(/,/g, ''));

  const { page: A, uid: aId } = await runner('lena5@test.ritmo', 'Lena');
  await join(A, 'Lena Żammit', true); // private: approves followers
  const { page: B, uid: bId } = await runner('tom5@test.ritmo', 'Tom');
  await join(B, 'Tom Vella', false);
  // Lena has a post with 3 Fuego
  mock.state.tables.posts.push({ id: 'p-lena-1', user_id: aId, activity_id: 'x1', title: 'Harbour loop', visibility: 'followers', show_map: false, show_hr: false, stats: { distanceM: 10000, movingS: 2700, paceS: 270, startedAt: new Date().toISOString() }, ritmo_count: 3, comment_count: 0, created_at: new Date().toISOString() });

  // ---- Tom asks to follow Lena; her profile is private to him ----
  await B.goto(`${APP}/hub/find`); await B.waitForTimeout(800);
  await B.getByRole('searchbox').pressSequentially('lena', { delay: 40 }); await B.waitForTimeout(900);
  await tap(B.locator('.find-row', { hasText: 'Lena Żammit' }).getByRole('button', { name: 'Follow' }));
  await B.waitForTimeout(800);
  check(await B.locator('.find-row', { hasText: 'Lena Żammit' }).getByRole('button', { name: /Requested/ }).isVisible(), 'following a private account shows Requested');
  await tap(B.locator('.find-row', { hasText: 'Lena Żammit' }).getByRole('link'));
  await B.waitForURL(/\/hub\/runner\//); await B.waitForTimeout(1500);
  check(await B.getByText('This account is private').isVisible(), 'her profile says "This account is private"');
  check(await B.locator('.profile-count', { hasText: 'Followers' }).isVisible() && await B.locator('.profile-count', { hasText: 'Requests' }).count() === 0, 'with the counts (Requests only on your own profile)');
  check(await B.getByText('Harbour loop').count() === 0, 'and none of her runs');
  await B.screenshot({ path: path.join(OUT, 'private-profile.png') });

  // ---- Lena accepts from Notifications, then follows back ----
  await A.goto(`${APP}/hub`); await A.waitForTimeout(1500);
  await tap(A.getByRole('link', { name: /Notifications/ }));
  await A.waitForURL(/\/hub\/notifications/); await A.waitForTimeout(1500);
  const reqs = A.getByRole('region', { name: 'Follow requests' });
  check(await reqs.isVisible() && /Tom Vella asked to follow you/.test(await reqs.innerText()), 'Notifications: "Follow requests" lists Tom');
  check(await reqs.locator('.note-row.is-unread').count() === 1 && await reqs.locator('img.hub-avatar-img, .hub-avatar').count() >= 1, 'unread rows are tinted and show a photo or initials');
  await A.screenshot({ path: path.join(OUT, 'notifications-request.png') });
  await tap(reqs.getByRole('button', { name: 'Accept' }));
  await A.waitForTimeout(1200);
  check(/You accepted Tom Vella\. They can now see your runs\./.test(await A.locator('main').innerText()), 'after Accept: "You accepted Tom Vella. They can now see your runs."');
  check(await A.getByRole('button', { name: 'Follow back' }).first().isVisible() && await A.getByRole('link', { name: 'View profile' }).first().isVisible(), 'with Follow back and View profile');
  check(await A.locator('.toast-action', { hasText: 'Tom Vella can now follow you.' }).isVisible(), 'and a toast: "Tom Vella can now follow you." with Follow back');
  await A.screenshot({ path: path.join(OUT, 'accepted.png') });
  await tap(A.locator('.note-row').getByRole('button', { name: 'Follow back' }).first());
  await A.waitForTimeout(1500);
  check(await A.locator('.note-row').getByRole('button', { name: 'Following' }).first().isVisible(), 'Follow back follows Tom straight away (public account): the button says Following');

  // ---- Counts on both profiles ----
  await A.goto(`${APP}/hub`); await A.waitForTimeout(1500);
  await tap(A.getByRole('link', { name: 'Your Hub profile' }));
  await A.waitForURL(/\/hub\/runner\/me/); await A.waitForTimeout(1800);
  check(await countOf(A, 'Followers') === 1 && await countOf(A, 'Following') === 1, 'tapping your photo in the Hub opens your profile: 1 follower, 1 following');
  check(/3\s*Fuego received/.test(await A.locator('.profile-flames').innerText()), 'Fuego received counts all her posts (3)');
  check(await A.getByRole('link', { name: 'Edit profile' }).isVisible() && await A.getByRole('button', { name: 'Share profile' }).isVisible(), 'own profile: Edit profile and Share profile');
  check(await A.locator('.profile-ring').isVisible(), 'the photo has a brand ring');
  check(await A.locator('.pb-strip').count() === 0, 'no PBs are shown until chosen');
  await A.screenshot({ path: path.join(OUT, 'own-profile.png'), fullPage: true });
  await B.reload(); await B.waitForTimeout(2000);
  check(await countOf(B, 'Followers') === 1 && await countOf(B, 'Following') === 1, 'Tom sees the same counts on Lena\'s profile');
  check(await B.getByText('Harbour loop').isVisible(), 'and, now accepted, her runs');

  // ---- PBs: Half + Marathon (self-reported) ----
  await tap(A.getByRole('link', { name: 'Edit profile' }));
  await A.waitForURL(/\/hub\/edit/); await A.waitForTimeout(1000);
  const show = A.getByRole('checkbox', { name: 'Show PBs on my profile' });
  check(!(await show.isChecked()), '"Show PBs on my profile" is off by default');
  await show.check();
  await tap(A.getByRole('button', { name: 'Half', exact: true }));
  await tap(A.getByRole('button', { name: 'Marathon', exact: true }));
  const marathon = A.locator('.pb-choice', { hasText: 'Marathon' });
  if (await marathon.getByRole('radio', { name: 'Enter my own' }).getAttribute('aria-checked') !== 'true') await tap(marathon.getByRole('radio', { name: 'Enter my own' }));
  await marathon.getByRole('textbox', { name: 'Marathon time' }).fill('3:05:00');
  await marathon.getByRole('textbox', { name: /race or date/ }).fill('Valletta Marathon');
  const half = A.locator('.pb-choice', { hasText: 'Half' });
  if (await half.getByRole('radio', { name: 'Enter my own' }).getAttribute('aria-checked') !== 'true' && await half.getByRole('radio', { name: /Ritmo best/ }).isDisabled()) await tap(half.getByRole('radio', { name: 'Enter my own' }));
  if (await half.getByRole('textbox', { name: 'Half time' }).count()) await half.getByRole('textbox', { name: 'Half time' }).fill('1:24:10');
  await A.waitForTimeout(300);
  const preview = await A.locator('.pb-strip').innerText();
  check(/Half/.test(preview) && /Marathon/.test(preview) && /3:05:00/.test(preview) && /Self-reported/.test(preview), 'the live preview shows Half and Marathon, the typed time marked self-reported');
  await A.screenshot({ path: path.join(OUT, 'edit-pbs.png'), fullPage: true });
  await tap(A.getByRole('button', { name: 'Save' }));
  await A.waitForURL(/\/hub\/runner\/me/, { timeout: 8000 }); await A.waitForTimeout(1500);
  const strip = await A.locator('.pb-strip').first().innerText().catch(() => '');
  check(strip === preview, 'the profile shows exactly the preview');
  const saved = mock.state.tables.hub_profiles.find((h) => h.user_id === aId)?.pbs ?? [];
  check(saved.length === 2 && saved.some((x) => x.label === 'Marathon' && x.self === true && x.timeS === 11100), 'saved: two PBs, the marathon self-reported');

  // ---- Lists: Followers, Not following back, Remove follower ----
  await tap(A.locator('.profile-count', { hasText: 'Followers' }));
  await A.waitForURL(/people\/followers/); await A.waitForTimeout(1500);
  const tomRow = A.locator('.find-row', { hasText: 'Tom Vella' });
  check(/Follows you · you follow back/.test(await tomRow.innerText()) && await tomRow.getByRole('button', { name: 'Following' }).isVisible(), 'Followers: "Follows you · you follow back" with Following');
  await tap(A.getByRole('button', { name: 'Not following back' }));
  check(await A.locator('.find-row', { hasText: 'Tom Vella' }).count() === 0, '"Not following back" hides people you follow back');
  await tap(A.getByRole('button', { name: 'All', exact: true }));
  await A.screenshot({ path: path.join(OUT, 'followers.png') });
  await tap(A.locator('.find-row', { hasText: 'Tom Vella' }).getByRole('button', { name: /More for Tom Vella/ }));
  const rm = A.getByRole('dialog', { name: 'Remove Tom Vella?' });
  check(/won't be told/.test(await rm.innerText()), 'Remove follower asks first, and says they won\'t be told');
  await tap(rm.getByRole('button', { name: 'Remove follower' }));
  await A.waitForTimeout(1200);
  check(!mock.state.tables.follows.some((f) => f.follower_id === bId && f.followee_id === aId), 'Remove follower removes Tom');
  check(!mock.state.tables.notifications.some((n) => n.user_id === bId && /remove/.test(n.kind)), 'and Tom is not notified');
  await B.reload(); await B.waitForTimeout(2000);
  check(await B.getByText('This account is private').isVisible(), 'Tom no longer sees her runs');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
