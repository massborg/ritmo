// Drag and drop on Training's month calendar (and the rest-of-week list uses the same hook): mouse on desktop, press-and-hold on a phone, the hard-day check, the
// same-week rule, undo, and that a quick swipe still scrolls. Usage: node e2e/drag.cjs (app on :4173)
const { chromium, devices } = require('playwright');
const { createMock } = require('./mock-supabase.cjs');
const { ryanRows } = require('./fixtures/ryan.cjs');
const path = require('path'); const fs = require('fs');
const APP = process.env.APP_URL || 'http://localhost:4173';
const SUPA = 'https://gujuzacfqxbwfpprkgrx.supabase.co';
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out', 'drag');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0, failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HARD = ['long', 'threshold', 'vo2max', 'tempo', 'hills', 'race'];

async function setUp(label, ctxOpts) {
  const mock = createMock();
  const b = await chromium.launch();
  const ctx = await b.newContext(ctxOpts);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ritmo:splash-shown', '1'); } catch { /* */ } });
  await mock.install(ctx, SUPA);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const email = `drag-${label}@test.ritmo`;
  await page.goto(`${APP}/signup`);
  await page.locator('#su-email').fill(email); await page.locator('#su-password').fill('Runner2026');
  for (const c of await page.locator('.consent input').all()) await c.check();
  await page.getByRole('button', { name: 'Create account' }).click(); await page.getByText('Check your email').waitFor();
  await page.goto(`${APP}/login?confirmed=1${mock.linkFor(email, 'signup')}`);
  await page.waitForURL(/setup/);
  const rows = ryanRows(mock.state.users.get(email).id, new Date());
  rows.profiles[0].data.profile.daysAvailable = [0, 1, 3, 4, 5, 6];
  for (const t of Object.keys(rows)) mock.state.tables[t].push(...rows[t]);
  await page.evaluate(() => indexedDB.deleteDatabase('keyval-store'));
  await page.goto(`${APP}/`); await page.waitForTimeout(1200);
  for (const name of [/Build my plan/, /Train \d days a week/, /Start my plan/]) { const x = page.getByRole('button', { name }).first(); if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(1500); } }
  const plan = () => mock.state.tables.plans[mock.state.tables.plans.length - 1].data;
  return { b, page, plan, errors };
}

// The month calendar on Training, showing next week (it may be in next month's grid)
async function toMonth(page, days) {
  await page.goto(`${APP}/#month`); await page.waitForTimeout(1200);
  const cell = page.locator(`.mp-cell[data-drop-date="${days[6]}"]`);
  if (!(await cell.count())) { await page.getByRole('button', { name: 'Next month' }).click(); await page.waitForTimeout(300); }
}

// Next week's sessions, and a free (rest) day that is not next to a hard day, for an easy session to move to
function pick(plan) {
  const today = new Date(); const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7) + 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return ymd(d); });
  const on = (d) => plan.sessions.find((s) => s.date === d);
  const easy = plan.sessions.find((s) => days.includes(s.date) && s.type === 'easy');
  const hard = plan.sessions.find((s) => days.includes(s.date) && HARD.includes(s.type) && s.type !== 'race');
  // a day next to another hard day (not the hard session's own neighbour logic): target for the clash
  const clashDay = days.find((d) => d !== hard?.date && [-1, 1].some((k) => { const i = days.indexOf(d) + k; const o = on(days[i]); return o && HARD.includes(o.type) && o.id !== hard?.id; }));
  return { days, easy, hard, clashDay };
}

async function touchDrag(page, from, to, hold = 500) {
  const cdp = await page.context().newCDPSession(page);
  const tp = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(from.x, from.y) });
  await page.waitForTimeout(hold);
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8) });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const centre = async (loc) => { await loc.scrollIntoViewIfNeeded(); const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };

(async () => {
  // ---------- Desktop: mouse ----------
  {
    const { b, page, plan, errors } = await setUp('desk', { viewport: { width: 1280, height: 900 } });
    const { days, easy, hard, clashDay } = pick(plan());
    await toMonth(page, days);
    const row = (d) => page.locator(`.mp-cell[data-drop-date="${d}"]`);
    const freeDay = days.find((d) => d !== easy.date && !plan().sessions.find((s) => s.date === d && s.type !== 'rest'));
    const target = freeDay ?? days.find((d) => d !== easy.date);
    const a = await centre(row(easy.date)), z = await centre(row(target));
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(a.x, a.y + 20, { steps: 3 });
    await page.mouse.move(z.x, z.y, { steps: 10 });
    check(await page.locator('.drag-ghost').isVisible(), 'desktop: a ghost label follows the mouse');
    check(await page.locator('.drop-over').count() === 1, 'desktop: the day under the pointer is highlighted');
    await page.screenshot({ path: path.join(OUT, 'desktop-dragging.png') });
    await page.mouse.up(); await page.waitForTimeout(300);
    check(await page.getByText(new RegExp(`Moved ${easy.title.toLowerCase()} to`)).isVisible(), 'desktop: dropping moves the session and says so');
    check(await page.getByRole('dialog').count() === 0, 'desktop: dropping does not also open the day');
    await page.waitForTimeout(1800);
    check(plan().sessions.find((s) => s.id === easy.id).date === target, 'desktop: the move is saved');
    await page.getByRole('button', { name: 'Undo' }).click(); await page.waitForTimeout(1800);
    check(plan().sessions.find((s) => s.id === easy.id).date === easy.date, 'desktop: undo puts it back');
    if (hard && clashDay) {
      const h = await centre(row(hard.date)), c = await centre(row(clashDay));
      await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(c.x, c.y, { steps: 10 }); await page.mouse.up();
      check(await page.getByText('Two hard days in a row?').isVisible(), 'desktop: a hard session next to another hard day asks first');
      await page.screenshot({ path: path.join(OUT, 'desktop-clash.png') });
      await page.getByRole('button', { name: 'Keep it where it is' }).click(); await page.waitForTimeout(1500);
      check(plan().sessions.find((s) => s.id === hard.id).date === hard.date, 'desktop: keeping it leaves the plan unchanged');
    } else check(false, 'desktop: no hard session found to test the clash');
    // Same-week rule
    const cell = (d) => page.locator(`.mp-cell[data-drop-date="${d}"]`);
    const other = new Date(days[0]); other.setDate(other.getDate() + 9);
    if (await cell(ymd(other)).count()) {
      const m1 = await centre(cell(easy.date)), m2 = await centre(cell(ymd(other)));
      await page.mouse.move(m1.x, m1.y); await page.mouse.down(); await page.mouse.move(m2.x, m2.y, { steps: 10 }); await page.mouse.up();
      check(await page.getByText('Sessions can move to another day in the same week.').isVisible(), 'desktop: moving to another week is refused with a reason');
    }
    // A plain click still opens the day
    await page.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});
    await page.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});
    await cell(easy.date).click(); await page.waitForTimeout(300);
    check(await page.getByRole('dialog').getByRole('heading', { name: easy.title }).isVisible(), 'desktop: a plain click opens the day\'s session sheet');
    check(errors.length === 0, `desktop: no errors ${errors.join(' | ')}`);
    await b.close();
  }
  // ---------- Phone: touch ----------
  {
    const { b, page, plan, errors } = await setUp('phone', { ...devices['Pixel 7'] });
    const { days, easy } = pick(plan());
    await toMonth(page, days);
    const row = (d) => page.locator(`.mp-cell[data-drop-date="${d}"]`);
    const target = days.find((d) => d !== easy.date && !plan().sessions.find((s) => s.date === d && s.type !== 'rest')) ?? days.find((d) => d !== easy.date);
    // A quick swipe scrolls the page and moves nothing
    const s0 = await centre(row(days[6]));
    await touchDrag(page, s0, { x: s0.x, y: s0.y - 250 }, 0); await page.waitForTimeout(500);
    check(await page.locator('.drag-ghost').count() === 0 && !(await page.getByText(/^Moved /).count()), 'phone: a quick swipe does not start a drag');
    // Press and hold, then drag (both cells measured with the calendar in view, so neither scrolls in between)
    await page.locator('.month-plan').evaluate((el) => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    const box = async (loc) => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const a = await box(row(easy.date)), z = await box(row(target));
    await touchDrag(page, a, z, 500); await page.waitForTimeout(400);
    check(await page.getByText(new RegExp(`Moved ${easy.title.toLowerCase()} to`)).isVisible(), 'phone: press, hold and drag moves the session');
    check(await page.getByRole('dialog').count() === 0, 'phone: dropping does not also open the day');
    await page.screenshot({ path: path.join(OUT, 'phone-moved.png') });
    await page.waitForTimeout(1800);
    check(plan().sessions.find((s) => s.id === easy.id).date === target, 'phone: the move is saved');
    check(errors.length === 0, `phone: no errors ${errors.join(' | ')}`);
    await b.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
