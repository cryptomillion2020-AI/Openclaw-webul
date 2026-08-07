/**
 * capture-teamresearch-verify.cjs — A4 verification: confirms the query-card
 * pipeline (intake -> assignment -> result) actually renders, including the
 * citation gate (blocked reply must not show as a claim) and dedup advisory.
 * Not a shipped route. Mirrors tools/capture-agentcomms-room.cjs.
 */
const { chromium } = require('playwright');

const OUT  = process.argv[2] || '/tmp/teamresearch-renders';
const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  page.on('console',   m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(`${BASE}/capture-teamresearch.html?state=loaded`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.research-page', { timeout: 15000 });
  await page.waitForTimeout(500);

  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/teamresearch-loaded.png`, fullPage: true });

  const bodyText = await page.evaluate(() => document.body.innerText);
  const checks = {
    'awaiting badge (q1, no result yet)':        bodyText.includes('Awaiting result'),
    'complete badge (q2)':                       bodyText.includes('Result received'),
    'blocked badge (q3)':                        bodyText.includes('Withheld'),
    'dedup advisory shown':                      bodyText.includes('researched') && bodyText.includes('2.3d ago'),
    'sources list rendered':                     bodyText.includes('salesforce.com'),
    'artifact path rendered':                    bodyText.includes('TIKA-SALESFORCE-TEARDOWN.md'),
    'no-claim-without-source copy present':      bodyText.includes('No claim without a source'),
    'TIKA shown as replying agent':              bodyText.includes('TIKA replied'),
    'ELEVIN shown on blocked reply':             bodyText.includes('ELEVIN replied'),
    'blocked reply body text NOT rendered':      !bodyText.includes('uncited') && !bodyText.includes('reply contained no detectable citation') || bodyText.includes('(reply contained no detectable citation'),
  };
  for (const [label, ok] of Object.entries(checks)) {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`);
  }

  console.log(`console_errors=${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 10).join('\n'));

  await page.close();
  await browser.close();
})();
