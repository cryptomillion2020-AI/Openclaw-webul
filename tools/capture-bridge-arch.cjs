/**
 * capture-bridge-arch.cjs — architectural variant renderings for Architect
 * selection. Captures the real running page, not a mockup.
 */
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || '/tmp/bridge-arch';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:5199';

const SHOTS = [
  ['00-FLAT-baseline-loaded', '?state=loaded'],
  ['A-arcade-loaded',         '?state=loaded&arch=A'],
  ['A-arcade-quiet',          '?arch=A'],
  ['B-mezzanine-loaded',      '?state=loaded&arch=B'],
  ['B-mezzanine-quiet',       '?arch=B'],
  ['C-window-loaded',         '?state=loaded&arch=C'],
  ['C-window-quiet',          '?arch=C'],
];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, q] of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${name}: ${e}`));
    await page.goto(`${BASE}/capture.html${q}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.bridge', { timeout: 15000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `bridge-${name}.png`), fullPage: true });
    const of = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${name}: horizontal_overflow=${of}`);
    await page.close();
  }
  console.log(`console_errors=${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 8).join('\n'));
  await browser.close();
})();
