// Coach (update brief, section 5): history menu with the AI setting and Clear, Coach | Body, the readiness card with a
// status chip, the same sentence as Training and this week's numbers, suggested questions from today's plan in a
// scrolling row, runner bubbles on the right, coach answers ending with a collapsed "Based on" line, and the composer
// fixed above the tab bar.
const { chromium } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };

(async () => {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = 'coach@test.ritmo';
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
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  const trainingLine = await page.locator('.rd-strip .rd-strip-line .caption').first().innerText();

  await page.goto(`${APP}/coach`); await page.waitForTimeout(1500);
  check(await page.getByRole('heading', { name: 'Coach', exact: true }).isVisible() && await page.getByRole('button', { name: 'Past chats and settings' }).isVisible(), 'header: Coach with the history button');
  const card = page.locator('.coach-ready');
  const ct = await card.innerText();
  check(/Readiness\s+\d+/.test(ct) && await card.locator('.rd-bar').isVisible(), 'readiness score and bar');
  check(await card.locator('.status-chip').isVisible() && /Ready to train|Take it easy|Recover today/.test(await card.locator('.status-chip').innerText()), 'a status chip with icon and word');
  check(ct.includes(trainingLine), `the same sentence as Training ("${trainingLine}")`);
  check(/km this week/.test(ct) && /sessions/.test(ct) && /days to Safi 5K AM/.test(ct), "this week's km, sessions and days to the race");
  const chips = await page.locator('.suggest-row .chip').allInnerTexts();
  check(chips.some((x) => x === 'Am I on track for Safi 5K AM?'), `suggestions follow the plan and race (${chips.join(' | ')})`);
  check(await page.locator('.suggest-row').evaluate((el) => getComputedStyle(el).overflowX) === 'auto', 'suggestions scroll sideways');
  const comp = await page.locator('.coach-composer').boundingBox(), bar = await page.locator('.tabbar').boundingBox();
  check(comp.y + comp.height <= bar.y + 1 && comp.y + comp.height > bar.y - 20, 'the composer sits just above the tab bar');

  // Ask: built-in answers only
  await page.locator('#ask').fill('How did my last run go?');
  await page.getByRole('button', { name: 'Send' }).click();
  const sheet = page.getByRole('dialog', { name: 'Use the AI coach?' });
  if (await sheet.isVisible().catch(() => false)) await sheet.getByRole('button', { name: 'No, built-in answers only' }).click();
  await page.locator('.bubble-coach').nth(0).waitFor(); await page.waitForTimeout(1500);
  const runner = page.locator('.bubble-runner').last();
  const rb = await runner.boundingBox();
  check(rb.x + rb.width > 360, 'your message sits on the right');
  check(await runner.evaluate((el) => getComputedStyle(el).backgroundColor) === await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--graphite)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }), 'in a graphite bubble');
  const based = page.locator('.bubble-coach details').last();
  check(await based.locator('summary').innerText().then((x) => /^Based on: /.test(x)) && !(await based.getAttribute('open')), 'the answer ends with a collapsed "Based on" line');

  // Menu: AI setting and Clear
  await page.getByRole('button', { name: 'Past chats and settings' }).click();
  const menu = page.getByRole('dialog', { name: 'Past chats and settings' });
  check(await menu.getByRole('button', { name: 'Use the AI coach' }).isVisible() && await menu.getByRole('button', { name: 'Clear this chat' }).isVisible(), 'the menu holds the AI setting and Clear');
  check(!(await page.locator('.chat ~ p', { hasText: 'Stop using AI' }).count()) && !(await page.locator('main > div > p.caption', { hasText: 'built-in coach only' }).count()), 'the AI setting is no longer under the chat');
  await menu.getByRole('button', { name: 'Clear this chat' }).click(); await page.waitForTimeout(500);
  check(await page.locator('.bubble-runner').count() === 0, 'Clear empties the chat');

  // Body hides the readiness card
  await page.getByRole('radio', { name: 'Body' }).or(page.getByRole('button', { name: 'Body', exact: true })).first().click(); await page.waitForTimeout(400);
  check(await page.locator('.coach-ready').count() === 0, 'Body mode has its own chat, without the readiness card');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0]}` : ''}`);
  await b.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
