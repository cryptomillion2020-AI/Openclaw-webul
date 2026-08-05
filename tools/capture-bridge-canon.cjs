const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || '/tmp/bridge-renders';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:5199';
(async () => {
  const browser = await chromium.launch();
  let errors = [];
  for (const [name, q] of [['A-quiet',''],['B-loaded','?state=loaded']]) {
    const page = await browser.newPage({ viewport:{width:1600,height:1100}, deviceScaleFactor:2 });
    page.on('console', m => { if (m.type()==='error') errors.push(`${name}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${name}: ${e}`));
    await page.goto(`${BASE}/capture.html${q}`, { waitUntil:'networkidle' });
    await page.waitForSelector('.bridge', { timeout:15000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `bridge-${name}.png`), fullPage:true });
    const of = await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    console.log(`${name}: horizontal_overflow=${of}`);
    await page.close();
  }
  console.log(`console_errors=${errors.length}`);
  if (errors.length) console.log(errors.slice(0,6).join('\n'));
  await browser.close();
})();
