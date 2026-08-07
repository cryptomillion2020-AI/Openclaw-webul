/**
 * capture-dashboard-canon.cjs — approval renderings for Command Central.
 *
 * Captures both states, because the quiet state is the one that proves the page
 * tells the truth when there is nothing to show. A dashboard that only looks
 * right when full is a dashboard that lies on a slow day.
 */
const { chromium } = require('playwright');
const path = require('path');

const OUT  = process.argv[2] || '/tmp/dashboard-renders';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:5199';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, q] of [['A-quiet', ''], ['B-loaded', '?state=loaded']]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
    page.on('console',   m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${name}: ${e}`));
    await page.goto(`${BASE}/capture-dashboard.html${q}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.wsroom', { timeout: 15000 });
    await page.waitForTimeout(700);

    /* Resize the viewport to the full content height and capture WITHOUT
       fullPage. At deviceScaleFactor 2, Chromium's fullPage path stitches
       tiles and leaves a bright seam across whichever row lands on the
       boundary — it reads exactly like a styling defect and it is not one.
       Sizing the viewport to the content avoids the stitch entirely. */
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 1600, height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `dashboard-${name}.png`) });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    console.log(`${name}: horizontal_overflow=${overflow}`);
    await page.close();
  }
  console.log(`console_errors=${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 6).join('\n'));
  await browser.close();
})();
