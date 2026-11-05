const { chromium } = require('playwright');
const jobs = require(process.argv[2]);
const only = process.argv[3];
(async () => {
  const browser = await chromium.launch();
  for (const j of jobs) {
    if (only && !j.out.includes(only)) continue;
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await page.goto('file://' + j.html, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await document.fonts.ready; });
    const ok = await page.evaluate(() => ['Bricolage Grotesque', 'Instrument Sans', 'DM Mono'].map(f => document.fonts.check(`700 16px "${f}"`) || document.fonts.check(`400 16px "${f}"`)));
    await page.waitForTimeout(150);
    await page.screenshot({ path: j.out });
    console.log(j.out.split('/').pop(), ok.join(','));
    await page.close();
  }
  await browser.close();
})();
