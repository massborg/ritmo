// Runs an e2e suite as if it were a fixed day, so the result is the same whatever day it is run on.
// Many suites build their data from "today" (this week's sessions, this month's challenge, a race N days away), and
// some checks only hold on some days: a Sunday has no "rest of the week", the 16th has already passed a monthly
// target. Preload this file and both the test process and every browser page see the same shifted clock:
//
//   node -r ./e2e/fixed-date.cjs e2e/<suite>.cjs
//
// The clock still runs (waits and timers work); it only starts at E2E_DATE (default: Thursday 12 Nov 2026, 10:00).
// Set E2E_DATE=real to switch it off, or to another date to try a different day.
const want = process.env.E2E_DATE || '2026-11-12T10:00:00';
if (want !== 'real') {
  const RealDate = Date;
  const offset = new RealDate(want).getTime() - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
    static now() { return RealDate.now() + offset; }
  }
  global.Date = ShiftedDate;

  // The same shift in every page, before any of the app's code runs
  const inPage = (ms) => {
    const R = Date;
    class D extends R {
      constructor(...a) { if (a.length === 0) super(R.now() + ms); else super(...a); }
      static now() { return R.now() + ms; }
    }
    // eslint-disable-next-line no-global-assign
    Date = D;
  };
  const pw = require('playwright');
  for (const type of [pw.chromium, pw.firefox, pw.webkit]) {
    const launch = type.launch.bind(type);
    type.launch = async (...args) => {
      const browser = await launch(...args);
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...a) => { const ctx = await newContext(...a); await ctx.addInitScript(inPage, offset); return ctx; };
      browser.newPage = async (...a) => (await browser.newContext(...a)).newPage();
      return browser;
    };
  }
}
