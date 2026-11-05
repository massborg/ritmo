// Phone-fit check: run 'npm run build && npx vite preview --port 4173' first, then 'node scripts/phone-fit.cjs'. Reports overflow and small tap targets on seven phone sizes.
const { chromium, devices } = require('playwright');
const B = 'http://localhost:4173';
const DEV = ['iPhone SE', 'iPhone 13 mini', 'iPhone 15', 'iPhone 15 Pro Max', 'Pixel 7', 'Galaxy S9+', 'Galaxy A55'];
const ROUTES = ['/', '/calendar', '/progress', '/coach', '/profile', '/profile/data', '/profile/privacy', '/profile/health', '/goals', '/story', '/review/2026-10', '/race/race-valencia', '/race/new', '/welcome'];
(async () => {
  const b = await chromium.launch();
  const out = [];
  for (const name of DEV) {
    const d = devices[name] || { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent };
    const c = await b.newContext({ ...d });
    const p = await c.newPage();
    await p.goto(B + '/welcome'); await p.waitForTimeout(2600);
    await p.getByRole('button', { name: 'Explore with sample data' }).click(); await p.waitForTimeout(1800);
    const routes = [...ROUTES];
    // add an activity and a session page
    const act = await p.evaluate(() => [...document.querySelectorAll('a[href^="/activity/"]')].map(a => a.getAttribute('href'))[0]);
    if (act) routes.push(act);
    await p.goto(B + '/calendar'); await p.waitForTimeout(1500);
    const sess = await p.evaluate(() => [...document.querySelectorAll('a[href^="/session/"]')].map(a => a.getAttribute('href'))[0]);
    if (sess) routes.push(sess);
    for (const r of routes) {
      await p.goto(B + r); await p.waitForTimeout(2600);
      const res = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        const bad = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || el.classList.contains('sr-only') || el.closest('.tiles') || el.closest('.table-scroll') || el.closest('.weekstrip') && false) continue;
          const rc = el.getBoundingClientRect();
          if (rc.width === 0) continue;
          if (rc.right > vw + 0.5 || rc.left < -0.5) {
            // ignore children of overflow-hidden ancestors
            let a = el.parentElement, clipped = false;
            while (a && a !== document.body) { const s = getComputedStyle(a); if (s.overflowX === 'hidden' || s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflow === 'hidden') { const ar = a.getBoundingClientRect(); if (ar.right <= vw + 0.5 && ar.left >= -0.5) { clipped = true; break; } } a = a.parentElement; }
            if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ').slice(0,2).join('.')} [${Math.round(rc.left)}..${Math.round(rc.right)}] "${(el.textContent||'').trim().slice(0,30)}"`);
          }
        }
        const small = [...document.querySelectorAll('button, a, input, select, [role=button]')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.height < 43.5 || r.width < 43.5) && !e.closest('.sr-only') && !e.classList.contains('tag') && e.tagName !== 'INPUT'; }).map(e => `${e.tagName.toLowerCase()} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)} "${(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,24)}"`);
        return { vw, sw, bad: bad.slice(0, 6), small: small.slice(0, 8) };
      });
      if (res.sw > res.vw || res.bad.length) out.push(`${name} ${r}: scrollW ${res.sw} vs ${res.vw}\n   ${res.bad.join('\n   ')}`);
      if (res.small.length && name === 'iPhone SE') out.push(`SMALL TAPS ${r}: ${res.small.join(' | ')}`);
    }
    await c.close();
  }
  console.log(out.join('\n') || 'ALL CLEAN');
  await b.close();
})();
