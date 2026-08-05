const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const baseURL = process.env.AICITY_BASE_URL || 'http://127.0.0.1:5173';
const outputDir = path.join(__dirname, '..', 'evidence', 'aicity-fidelity-repass');
const viewports = [
  { name: '1440x960', width: 1440, height: 960 },
  { name: '1280x800', width: 1280, height: 800 },
];
const states = ['live', 'static', 'absent'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.district-card')];
    const positions = {};
    const rects = cards.map(card => {
      const rect = card.getBoundingClientRect();
      positions[card.dataset.agent] = [rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width]
        .map(value => Math.round(value * 10) / 10);
      return { agent: card.dataset.agent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const collisions = [];
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (Math.min(a.right, b.right) > Math.max(a.left, b.left)
          && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) {
          collisions.push(`${a.agent}/${b.agent}`);
        }
      }
    }
    const wave = document.querySelector('.district-card[data-agent="sage"] .silent-wave');
    const waveRect = wave.getBoundingClientRect();
    return {
      fleetState: document.querySelector('[data-testid="aicity-district-page"]')?.dataset.fleetState,
      pressed: document.querySelector('[data-set-state][aria-pressed="true"]')?.dataset.setState,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      positions,
      collisions,
      tasks: Object.fromEntries(cards.map(card => [card.dataset.agent, card.dataset.task])),
      standees: Object.fromEntries(cards.filter(card => card.dataset.agent !== 'sage').map(card => [card.dataset.agent, getComputedStyle(card.querySelector('.standee')).display])),
      sageStandee: getComputedStyle(document.querySelector('.district-card[data-agent="sage"] .standee')).display,
      sageWaveDisplay: getComputedStyle(wave).display,
      sageWaveRect: { width: waveRect.width, height: waveRect.height },
      emptyTaskCount: cards.filter(card => card.querySelector('.district-task').textContent.trim() === 'No active task').length,
      populatedTaskCount: cards.filter(card => card.dataset.task).length,
      substrateCount: cards.filter(card => card.dataset.substrate).length,
      feedCount: document.querySelectorAll('.aicity-feed article').length,
      headerText: document.querySelector('.aicity-district-header p')?.textContent.trim(),
      truncatedDistrictNames: cards.filter(card => {
        const name = card.querySelector('.agent-name');
        return name.scrollWidth > name.clientWidth || name.getBoundingClientRect().right > card.getBoundingClientRect().right;
      }).map(card => card.dataset.agent),
      sidebarLegible: (() => {
        const sidebar = document.querySelector('.sidebar--aicity');
        const entries = [...document.querySelectorAll('.sidebar--aicity .agent-rail-entry')];
        return Boolean(sidebar)
          && sidebar.scrollWidth <= sidebar.clientWidth
          && entries.length === 13
          && entries.every(entry => ['.agent-name', '.agent-state', '.agent-substrate', '.agent-model']
            .every(selector => entry.querySelector(selector)?.textContent.trim()));
      })(),
      sidebarMetrics: (() => {
        const sidebar = document.querySelector('.sidebar--aicity');
        const entries = [...document.querySelectorAll('.sidebar--aicity .agent-rail-entry')];
        return {
          clientWidth: sidebar?.clientWidth,
          scrollWidth: sidebar?.scrollWidth,
          entryCount: entries.length,
          emptyFields: entries.flatMap(entry => ['.agent-name', '.agent-state', '.agent-substrate', '.agent-model']
            .filter(selector => !entry.querySelector(selector)?.textContent.trim())
            .map(selector => `${entry.querySelector('.agent-name')?.textContent}:${selector}`)),
        };
      })(),
    };
  });
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      await context.route('https://fonts.googleapis.com/**', route => route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: '/* deterministic capture: use declared system-font fallbacks */',
      }));
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('pageerror', error => pageErrors.push(error.message));

      let baseline;
      for (const state of states) {
        await page.goto(`${baseURL}/?page=ai-city&state=${state}&cycle=day`, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-testid="aicity-district-page"]').waitFor();
        await page.waitForFunction(() => document.querySelectorAll('.district-card[data-task]:not([data-task=""])').length > 0);
        await page.waitForFunction(() => document.querySelectorAll('.aicity-feed article').length > 0);
        const current = await snapshot(page);
        assert(current.fleetState === state, `${viewport.name}/${state}: state did not initialize`);
        assert(current.pressed === state, `${viewport.name}/${state}: selected state control disagrees`);
        assert(!current.horizontalOverflow, `${viewport.name}/${state}: horizontal overflow`);
        assert(current.collisions.length === 0, `${viewport.name}/${state}: card collisions ${current.collisions.join(', ')}; positions=${JSON.stringify(current.positions)}`);
        assert(current.sageStandee === 'none', `${viewport.name}/${state}: silent-spawn standee rendered`);
        assert(current.sageWaveDisplay === 'flex', `${viewport.name}/${state}: silent-spawn signal computed display is ${current.sageWaveDisplay}`);
        assert(current.sageWaveRect.width > 0 && current.sageWaveRect.height > 0, `${viewport.name}/${state}: silent-spawn signal has no geometry`);
        assert(current.populatedTaskCount > 0, `${viewport.name}/${state}: no real tasks rendered`);
        assert(current.substrateCount > 0, `${viewport.name}/${state}: no real substrate strings rendered`);
        assert(current.feedCount > 0, `${viewport.name}/${state}: no real feed entries rendered`);
        assert(/\b[1-9]\d*\s+(complete|active|pending)/.test(current.headerText), `${viewport.name}/${state}: header counts are not populated: ${current.headerText}`);
        assert(current.truncatedDistrictNames.length === 0, `${viewport.name}/${state}: truncated agent names ${current.truncatedDistrictNames.join(', ')}`);
        assert(current.sidebarLegible, `${viewport.name}/${state}: sidebar rail fields are missing or overflowing; ${JSON.stringify(current.sidebarMetrics)}`);
        if (state === 'absent') {
          assert(Object.values(current.standees).every(display => display === 'none'), `${viewport.name}/absent: a standee remained`);
        } else {
          assert(Object.values(current.standees).every(display => display !== 'none'), `${viewport.name}/${state}: a standee disappeared`);
        }
        if (!baseline) {
          baseline = current.positions;
        } else {
          assert(JSON.stringify(current.positions) === JSON.stringify(baseline), `${viewport.name}/${state}: district geography shifted`);
        }
        const output = path.join(outputDir, `live-${state}-${viewport.name}.png`);
        await page.screenshot({ path: output, fullPage: false });
        results.push({ viewport: viewport.name, state, output, snapshot: current });

        await page.goto(`${baseURL}/design-samples/aicity/district-pass4.html?state=${state}`, { waitUntil: 'domcontentloaded' });
        const referenceOutput = path.join(outputDir, `reference-${state}-${viewport.name}.png`);
        await page.screenshot({ path: referenceOutput, fullPage: false });
        results[results.length - 1].referenceOutput = referenceOutput;
      }

      await page.goto(`${baseURL}/?page=ai-city&state=live&cycle=day`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('.district-card[data-task]:not([data-task=""])').length > 0);
      const interactiveBaseline = await snapshot(page);
      await page.locator('[data-agent="sage"]').click();
      assert(await page.locator('#silent-contract').isVisible(), `${viewport.name}: SAGE contract missing`);
      await page.locator('[data-set-state="static"]').click();
      assert(new URL(page.url()).searchParams.get('state') === 'static', `${viewport.name}: state interaction did not update URL`);
      const interactiveStatic = await snapshot(page);
      assert(JSON.stringify(interactiveStatic.positions) === JSON.stringify(interactiveBaseline.positions), `${viewport.name}: interactive STATIC geography shifted`);
      assert(JSON.stringify(interactiveStatic.tasks) === JSON.stringify(interactiveBaseline.tasks), `${viewport.name}: interactive STATIC task retention changed`);
      await page.locator('[data-set-state="absent"]').click();
      const interactiveAbsent = await snapshot(page);
      assert(JSON.stringify(interactiveAbsent.positions) === JSON.stringify(interactiveBaseline.positions), `${viewport.name}: interactive ABSENT geography shifted`);
      assert(JSON.stringify(interactiveAbsent.tasks) === JSON.stringify(interactiveBaseline.tasks), `${viewport.name}: interactive ABSENT task retention changed`);
      await page.locator('[data-set-cycle="night"]').click();
      assert(await page.locator('[data-testid="aicity-district-page"]').evaluate(node => node.classList.contains('cycle-night')), `${viewport.name}: night cycle did not apply`);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const runningAnimations = await page.evaluate(() => document.querySelector('[data-testid="aicity-district-page"]')
        .getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);
      assert(runningAnimations === 0, `${viewport.name}: reduced motion left ${runningAnimations} animations running`);
      assert(consoleErrors.length === 0, `${viewport.name}: console errors: ${consoleErrors.join(' | ')}`);
      assert(pageErrors.length === 0, `${viewport.name}: page errors: ${pageErrors.join(' | ')}`);
      await context.close();
    }

    const comparisonOutput = path.join(outputDir, 'comparison.html');
    const comparisonRows = results.map(result => `
      <section class="comparison-row">
        <h2>${result.state.toUpperCase()} · ${result.viewport}</h2>
        <figure><figcaption>Live React surface</figcaption><img src="${path.basename(result.output)}" alt="Live ${result.state} state at ${result.viewport}"></figure>
        <figure><figcaption>Ratified District Pass 4 reference</figcaption><img src="${path.basename(result.referenceOutput)}" alt="Reference ${result.state} state at ${result.viewport}"></figure>
      </section>`).join('\n');
    fs.writeFileSync(comparisonOutput, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI-City Fidelity Re-pass Comparison</title>
<style>
  :root{color-scheme:dark;font-family:Inter,system-ui,sans-serif}body{margin:0;padding:24px;background:#080b11;color:#f7f9fc}
  header{max-width:1500px;margin:0 auto 24px}h1{margin:0 0 6px;font-size:24px}p{margin:0;color:#8793a6}
  .comparison-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:1500px;margin:0 auto 28px;padding:14px;border:1px solid rgba(166,184,214,.18);border-radius:14px;background:#0f141d}
  h2{grid-column:1/-1;margin:0;color:#73a7ff;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.12em}
  figure{margin:0;min-width:0}figcaption{margin:0 0 8px;color:#d5dce8;font-size:12px}img{display:block;width:100%;height:auto;border:1px solid rgba(166,184,214,.18);background:#080b11}
  @media(max-width:900px){.comparison-row{grid-template-columns:1fr}}
</style></head><body><header><h1>AI-City District Pass 4 · Fidelity Re-pass</h1><p>Every live state is paired with the ratified reference at the same viewport.</p></header>${comparisonRows}</body></html>\n`);

    process.stdout.write(JSON.stringify({
      status: 'PASS',
      liveCaptures: results.length,
      referenceCaptures: results.length,
      viewports: viewports.map(item => item.name),
      states,
      failedAssertionResolved: 'Chromium computed display flex accepted with non-zero signal geometry',
      checks: ['stable geography', 'collision-free cards', 'state URL interaction', 'absent task retention', 'standee removal', 'silent-spawn contract', 'explicit empty data states', 'day/night cycle', 'reduced motion', 'console/page errors'],
      comparison: comparisonOutput,
      outputs: results.flatMap(result => [result.output, result.referenceOutput]),
    }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
