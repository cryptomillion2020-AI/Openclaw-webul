const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DISPATCH_LOG = path.join(os.tmpdir(), 'research-dispatch-log.jsonl');
const ROOT = 'quant-crypto-pine-20260825';
const enc = (p) => encodeURIComponent(p);

function dispatchedQueries() {
  if (!fs.existsSync(DISPATCH_LOG)) return [];
  return fs.readFileSync(DISPATCH_LOG, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l).msg; } catch { return null; } })
    .filter(m => m && m.type === 'research_query');
}

test.beforeEach(async ({ context, page }) => {
  page.on('dialog', d => d.accept());
  await context.route('**/*', r => {
    const u = new URL(r.request().url());
    return u.origin === 'http://127.0.0.1:5198' ? r.continue() : r.abort();
  });
});

// ---- Item A: authenticated strategy library curates + contains (server surface) ----
test('strategy-library lists only curated files; withholds chunks/drafts/failed-QA', async ({ request }) => {
  const res = await request.get('/api/research/strategy-library');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.disclaimer).toMatch(/no profitability/i);
  const names = body.collections.flatMap(c => (c.files || []).map(f => f.name));
  expect(names).toContain('QUANT-CRYPTO-STRATEGY.pine');
  expect(names).toContain('BRIEF.md');
  expect(names).toContain('ELEVIN-VERIFY.md');
  expect(names.some(n => n.includes('CHUNK'))).toBe(false);
  expect(names.some(n => n.includes('PRE-FINAL'))).toBe(false);
  expect(names.some(n => n.includes('FAILED-QA'))).toBe(false);
});

test('strategy-library serves an allowed file and refuses traversal, symlink escape, curated-out, and non-allowlist roots', async ({ request }) => {
  const ok = await request.get(`/api/research/strategy-library/file?path=${enc(`${ROOT}/BRIEF.md`)}`);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toMatch(/evidence-backed/);

  expect((await request.get(`/api/research/strategy-library/file?path=${enc(`${ROOT}/../secret.md`)}`)).status()).toBe(400);
  expect((await request.get(`/api/research/strategy-library/file?path=${enc(`${ROOT}/escape.md`)}`)).status()).toBe(400);
  expect((await request.get(`/api/research/strategy-library/file?path=${enc(`${ROOT}/_chunks/WAVE1-CHUNK.md`)}`)).status()).toBe(403);
  expect((await request.get(`/api/research/strategy-library/file?path=${enc('other-dir/BRIEF.md')}`)).status()).toBe(404);
});

test('research page renders the curated library, not mock rows', async ({ page }, info) => {
  await page.goto('/?page=research');
  await page.waitForLoadState('networkidle');
  const lib = page.getByTestId('strategy-library');
  await expect(lib).toBeVisible();
  await expect(lib).toContainText('QUANT-CRYPTO-STRATEGY.pine');
  await expect(lib).toContainText('No performance, profitability');
  // Empty-pipeline honesty: no fabricated active rows when the bus is silent.
  await expect(page.getByTestId('lab-active')).toContainText('No active research');
  await page.screenshot({ path: path.resolve('../revision-v2-evidence/' + info.project.name + '-research-lab.png'), fullPage: true });
});

// ---- Item C: QUANT + ROOTS real routes, keyboard-accessible, genuine dispatch only ----
test('QUANT and ROOTS are selectable routes, keyboard-accessible, and dispatch the real research_query transport', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?page=research');
  await page.waitForLoadState('networkidle');

  // Baseline: the dispatch log is shared across projects, so measure a delta.
  const before = dispatchedQueries().length;

  // Scope to the Available Routes card — the consolidated page also carries a Pine version chip
  // named "QUANT-CRYPTO-STRATEGY.pine", so an unscoped /QUANT/ match is ambiguous by design.
  const routes = page.getByTestId('lab-routes');
  const quant = routes.getByRole('button', { name: /QUANT/ });
  const roots = routes.getByRole('button', { name: /ROOTS/ });
  await expect(quant).toBeVisible();
  await expect(roots).toBeVisible();

  // Keyboard a11y: focus + Space toggles aria-pressed.
  await quant.focus();
  await page.keyboard.press('Space');
  await expect(quant).toHaveAttribute('aria-pressed', 'true');
  await roots.focus();
  await page.keyboard.press('Enter');
  await expect(roots).toHaveAttribute('aria-pressed', 'true');

  // No dispatch has happened from mere selection.
  expect(dispatchedQueries().length).toBe(before);

  // Genuine user Dispatch action.
  await page.getByLabel('Research query').fill('crypto perp funding-rate regime scan');
  await page.getByRole('button', { name: 'Dispatch' }).click();

  await expect.poll(() => dispatchedQueries().length, { timeout: 8000 }).toBeGreaterThan(before);
  const q = dispatchedQueries().at(-1);
  expect(q.type).toBe('research_query');
  expect(q.text).toContain('funding-rate regime');
  expect(q.selected_agents).toEqual(expect.arrayContaining(['quant', 'roots']));
  expect(errors).toEqual([]);
});
