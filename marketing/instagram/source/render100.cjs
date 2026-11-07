// Renders jobs100.json and reports cards where text overlaps the illustration, the list or the footer.
const { chromium } = require('playwright');
const jobs = require(process.argv[2]);
const only = process.argv[3];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const issues = [];
  for (const j of jobs) {
    if (only && !j.out.includes(only)) continue;
    await page.goto('file://' + j.html, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await document.fonts.ready; });
    const r = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const copy = box('.copy'), art = box('svg.art'), pts = box('.pts'), feel = box('.feel'), foot = box('.foot');
      const fonts = ['Bricolage Grotesque', 'Instrument Sans', 'DM Mono'].every(f => (document.fonts.check(`700 16px "${f}"`) || document.fonts.check(`400 16px "${f}"`)));
      const out = [];
      // the illustration may sit a little under the copy's empty top; real text must clear it by a margin
      const textBottom = Math.max(...[...document.querySelectorAll('.copy h1,.copy p,.copy .def,.copy .big,.copy h2')].map(e => e.getBoundingClientRect().bottom));
      if (art && textBottom > art.top + 40) out.push(`text ${Math.round(textBottom)} over art ${Math.round(art.top)}`);
      for (const [n, b] of [['list', pts], ['feel', feel]]) if (b && textBottom > b.top - 30) out.push(`text ${Math.round(textBottom)} over ${n} ${Math.round(b.top)}`);
      if (foot && textBottom > foot.top - 20) out.push('text over footer');
      if (document.documentElement.scrollWidth > 1080) out.push('horizontal overflow');
      if (!fonts) out.push('fonts missing');
      return out;
    });
    await page.waitForTimeout(80);
    await page.screenshot({ path: j.out });
    if (r.length) issues.push(j.out.split('/').pop() + ': ' + r.join('; '));
  }
  await browser.close();
  console.log(issues.length ? issues.join('\n') : 'no layout issues');
})();
