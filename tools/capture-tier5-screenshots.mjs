/**
 * capture-tier5-screenshots.mjs — Pass 3 P3.1 Tier 5 end-of-tier deliverable
 * Captures 4 new pages (Markets, Network, Lab, Vault) at desktop + phone widths.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE_URL = process.env.WEBUI_URL || 'http://localhost:5174';
const OUT_DIR = '/home/k/.openclaw/workspace/.openclaw-cli-images/pass3-tier5-screenshots';

const PAGES = [
  { key: 'bridge',  param: 'bridge'  },
  { key: 'markets', param: 'markets' },
  { key: 'network', param: 'network' },
  { key: 'lab',     param: 'lab'     },
  { key: 'vault',   param: 'vault'   },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone',   width: 390,  height: 844 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const stamp = Date.now();

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      const url = `${BASE_URL}/?page=${p.param}`;
      console.log(`[${vp.name}] capturing ${p.key} @ ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      } catch (e) {
        console.log(`  goto soft-failed (${e.message}); proceeding to capture anyway`);
      }
      // Let ConstellationScene animate a moment
      await page.waitForTimeout(2200);
      const file = `${OUT_DIR}/p3.1-${p.key}-${vp.name}-${stamp}.png`;
      await page.screenshot({ path: file, fullPage: false });
      console.log(`  → ${file}`);
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  console.log('DONE');
}

main().catch(err => { console.error(err); process.exit(1); });
