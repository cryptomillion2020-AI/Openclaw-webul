/**
 * capture-world.cjs — approval stills sampled ALONG the scroll.
 * A scroll-bound world cannot be judged from one frame; this walks the scroll
 * and captures what the Architect would actually see at each point.
 */
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || '/tmp/world-renders';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:5199';
const STOPS = [0.00, 0.16, 0.33, 0.50, 0.67, 0.84, 1.00];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/capture-world.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sw-stage', { timeout: 20000 });
  // Videos must be decodable before seeking, or every capture is the poster.
  await page.waitForFunction(
    () => [...document.querySelectorAll('video')].every(v => v.readyState >= 2),
    { timeout: 30000 },
  ).catch(() => errors.push('videos did not reach readyState>=2'));

  for (const p of STOPS) {
    await page.evaluate(pp => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.round(max * pp));
    }, p);
    await page.waitForTimeout(700);          // let the seek land and the fade settle
    const label = String(Math.round(p * 100)).padStart(3, '0');
    await page.screenshot({ path: path.join(OUT, `world-scroll-${label}.png`) });
    const state = await page.evaluate(() => {
      const active = document.querySelector('.sw-scene[data-active] video, .sw-scene[data-active] img');
      const mark = document.querySelector('.sw-mark[data-active]');
      return { tag: active?.tagName, t: active?.currentTime ?? null, scene: mark?.textContent };
    });
    console.log(`${label}%  scene="${state.scene}"  ${state.tag}  t=${state.t == null ? '—' : state.t.toFixed(2)}`);
  }
  console.log(`console_errors=${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join('\n'));
  await browser.close();
})();
