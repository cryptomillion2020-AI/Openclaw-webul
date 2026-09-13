// Unit tests for the strategy-library surface: allowlist, realpath containment,
// curation deny-list, traversal + symlink escape rejection. No network, no writes to real corpus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStrategyLibrary, STRATEGY_LIBRARY_ROOTS, parsePineHeader } from './strategy-library.mjs';

// A realistic Pine header using a NAMED title arg on a continued line, plus header comment fields.
const PINE_TESTED = `//@version=6
// task_id : QUANT-CRYPTO-STRATEGY-20260825
// author  : QUANT
// version : v1.2 (final)
strategy(
    title = "QUANT Crypto Breakout Trend-Follow (paper)",
    overlay = true)
plot(close)
`;
const PINE_DRAFT = `//@version=5
strategy("Old Draft", overlay=false)
`;

async function fixtureRoot() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'strat-lib-test-'));
  const root = path.join(base, 'quant-crypto-pine-20260825');
  await mkdir(path.join(root, '_chunks'), { recursive: true });
  await mkdir(path.join(root, 'research'), { recursive: true });
  await mkdir(path.join(root, 'verification'), { recursive: true });
  await writeFile(path.join(root, 'QUANT-CRYPTO-STRATEGY.pine'), 'strategy("x")');
  await writeFile(path.join(root, 'QUANT-CRYPTO-STRATEGY.PRE-FINAL-20260826.pine'), 'draft');
  await writeFile(path.join(root, 'BRIEF.md'), '# brief');
  await writeFile(path.join(root, '_chunks/QUANT-WAVE1-CHUNK.md'), 'raw chunk');
  await writeFile(path.join(root, 'research/ROOTS-RISK.md'), 'ok');
  await writeFile(path.join(root, 'research/ROOTS-RISK.FAILED-QA-bb9dbcda.md'), 'failed');
  await writeFile(path.join(root, 'verification/ELEVIN-VERIFY.md'), 'verified');
  // a secret OUTSIDE the root, plus a symlink inside the root pointing to it
  const secret = path.join(base, 'secret.md');
  await writeFile(secret, 'SECRET');
  await symlink(secret, path.join(root, 'escape.md'));
  return { base, root, secret };
}

test('allowlist is a frozen server-side constant, not client-supplied', () => {
  assert.ok(Object.isFrozen(STRATEGY_LIBRARY_ROOTS));
  assert.ok(STRATEGY_LIBRARY_ROOTS.includes('/home/k/.openclaw/workspace/knowledge/quant-crypto-pine-20260825'));
});

test('list curates OUT chunks, PRE-* drafts, and FAILED-QA drafts', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    const { collections } = await lib.list();
    const names = collections[0].files.map(f => f.name);
    assert.ok(names.includes('QUANT-CRYPTO-STRATEGY.pine'));
    assert.ok(names.includes('BRIEF.md'));
    assert.ok(names.includes('ELEVIN-VERIFY.md'));
    assert.ok(!names.includes('QUANT-WAVE1-CHUNK.md'), 'chunk must be curated out');
    assert.ok(!names.some(n => n.includes('PRE-FINAL')), 'PRE draft must be curated out');
    assert.ok(!names.some(n => n.includes('FAILED-QA')), 'failed-QA must be curated out');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('descriptive stage classification, no profitability claim', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    const { disclaimer, collections } = await lib.list();
    assert.match(disclaimer, /no profitability/i);
    const pine = collections[0].files.find(f => f.name.endsWith('.pine'));
    assert.equal(pine.category, 'strategy-code');
    assert.match(pine.stage, /backtested/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('read serves an allowed file', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    const f = await lib.read('quant-crypto-pine-20260825/BRIEF.md');
    assert.equal(f.bytes.toString(), '# brief');
    assert.match(f.mime, /text\/plain/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('read refuses ../ traversal', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    await assert.rejects(() => lib.read('quant-crypto-pine-20260825/../secret.md'), /path_traversal_refused/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('read refuses symlink escape (realpath leaves root)', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    await assert.rejects(() => lib.read('quant-crypto-pine-20260825/escape.md'), /symlink_escape_refused/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('read refuses a curated-out file even by direct path', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    await assert.rejects(() => lib.read('quant-crypto-pine-20260825/_chunks/QUANT-WAVE1-CHUNK.md'), /curated_out/);
    await assert.rejects(() => lib.read('quant-crypto-pine-20260825/QUANT-CRYPTO-STRATEGY.PRE-FINAL-20260826.pine'), /curated_out/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('read refuses a root not in the allowlist', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    await assert.rejects(() => lib.read('some-other-dir/BRIEF.md'), /not_in_allowlist/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('read refuses unsupported extension', async () => {
  const { base, root } = await fixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    await assert.rejects(() => lib.read('quant-crypto-pine-20260825/BRIEF.exe'), /unsupported_type/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

// ---- PART A (directive 20260912-160705): versioned Pine panel ----

test('parsePineHeader reads named-arg title, version, task_id, author, pine version', () => {
  const m = parsePineHeader(PINE_TESTED);
  assert.equal(m.pine_version, 'v6');
  assert.equal(m.declared_kind, 'strategy');
  assert.equal(m.title, 'QUANT Crypto Breakout Trend-Follow (paper)');
  assert.equal(m.task_id, 'QUANT-CRYPTO-STRATEGY-20260825');
  assert.equal(m.author, 'QUANT');
  assert.equal(m.version_note, 'v1.2 (final)');
});

test('parsePineHeader reads positional title and returns null for missing fields (not invented)', () => {
  const m = parsePineHeader(PINE_DRAFT);
  assert.equal(m.pine_version, 'v5');
  assert.equal(m.title, 'Old Draft');
  assert.equal(m.task_id, null);
  assert.equal(m.author, null);
  assert.equal(m.version_note, null);
});

test('parsePineHeader tolerates garbage without throwing', () => {
  const m = parsePineHeader('not a pine file at all');
  assert.equal(m.pine_version, null);
  assert.equal(m.title, null);
  assert.equal(m.declared_kind, null);
});

async function pineFixtureRoot() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'pine-test-'));
  const root = path.join(base, 'quant-crypto-pine-20260825');
  await mkdir(path.join(root, '_chunks'), { recursive: true });
  await writeFile(path.join(root, 'QUANT-CRYPTO-STRATEGY.pine'), PINE_TESTED);
  await writeFile(path.join(root, 'QUANT-CRYPTO-STRATEGY.PRE-CORRECTION-20260826.pine'), PINE_DRAFT);
  await writeFile(path.join(root, 'QUANT-CRYPTO-STRATEGY.PRE-FINAL-20260826.pine'), PINE_DRAFT);
  await writeFile(path.join(root, 'BRIEF.md'), '# brief');
  await writeFile(path.join(root, 'TRADINGVIEW-TEST-STEPS.md'), '# steps');
  await writeFile(path.join(root, '_chunks/RAW.pine'), 'strategy("leak")');
  return { base, root };
}

test('pineVersions surfaces tested + labeled drafts, tested first, curates chunks out', async () => {
  const { base, root } = await pineFixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    const { collections, disclaimer } = await lib.pineVersions();
    const v = collections[0].versions;
    assert.equal(v.length, 3, 'one tested + two drafts');
    assert.equal(v[0].status, 'tested/accepted', 'tested version sorts first');
    assert.equal(v[0].name, 'QUANT-CRYPTO-STRATEGY.pine');
    assert.equal(v.filter(x => x.status === 'draft/superseded').length, 2);
    assert.ok(!v.some(x => x.name === 'RAW.pine'), 'chunk pine must be curated out');
    assert.match(disclaimer, /CANNOT compile or run Pine/i);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('pineVersions computes sha256 and exposes companion links only when present', async () => {
  const { base, root } = await pineFixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    const { collections } = await lib.pineVersions();
    const tested = collections[0].versions[0];
    assert.match(tested.sha256, /^[0-9a-f]{64}$/);
    assert.equal(tested.title, 'QUANT Crypto Breakout Trend-Follow (paper)');
    const names = collections[0].companions.map(c => c.name);
    assert.ok(names.includes('BRIEF.md'));
    assert.ok(names.includes('TRADINGVIEW-TEST-STEPS.md'));
    assert.ok(!names.includes('QUANT-CRYPTO-MARKET-ANALYSIS.md'), 'absent companion not fabricated');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('readPine serves the tested version AND a labeled draft (drafts permitted on this surface)', async () => {
  const { base, root } = await pineFixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    const tested = await lib.readPine('quant-crypto-pine-20260825/QUANT-CRYPTO-STRATEGY.pine');
    assert.match(tested.mime, /text\/plain/);
    assert.match(tested.sha256, /^[0-9a-f]{64}$/);
    const draft = await lib.readPine('quant-crypto-pine-20260825/QUANT-CRYPTO-STRATEGY.PRE-FINAL-20260826.pine');
    assert.equal(draft.bytes.toString(), PINE_DRAFT);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('readPine refuses non-.pine, traversal, chunks, and non-allowlist roots', async () => {
  const { base, root } = await pineFixtureRoot();
  try {
    const lib = createStrategyLibrary({ roots: [root] });
    await assert.rejects(() => lib.readPine('quant-crypto-pine-20260825/BRIEF.md'), /unsupported_type/);
    await assert.rejects(() => lib.readPine('quant-crypto-pine-20260825/../secret.pine'), /path_traversal_refused/);
    await assert.rejects(() => lib.readPine('quant-crypto-pine-20260825/_chunks/RAW.pine'), /curated_out/);
    await assert.rejects(() => lib.readPine('other-root/QUANT-CRYPTO-STRATEGY.pine'), /not_in_allowlist/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
