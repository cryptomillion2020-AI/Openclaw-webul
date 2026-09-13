// Backtest-results ingest (PART B, directive 20260912-160705). Per strategy VERSION/test-run
// upload of TradingView Strategy Tester exports, or a manual self-reported summary.
//
// SECURITY CONTRACT (untrusted upload):
//   - Uploaded bytes are DATA, never code. This module NEVER executes, evals, imports, or
//     dynamically loads any uploaded content. It only read/writes bytes and parses text.
//   - Size cap + extension/type allowlist + safe-name derivation (client filename is never a path).
//   - Every write path is realpath-contained inside the run directory (traversal + symlink defense).
//   - CSV formula-injection: cells beginning = + - @ TAB CR are flagged; any value re-emitted for
//     display/CSV is prefixed with a quote guard. Numeric parsing is separate and unaffected.
//   - Best-effort credential/secret rejection: obvious cookie/authorization/private-key material is
//     refused with an actionable error. This surface never asks for and never stores credentials.
//   - Immutable original + sha256 retained ALONGSIDE the parsed projection + provenance. No
//     overwrites. Re-upload of identical bytes for the same version is idempotent (same run id).
//   - Missing run metadata is recorded as UNKNOWN, never invented.
//   - Stored artifact content can NEVER instruct agents or grant authority; it is inert evidence.
import { mkdir, writeFile, readFile, readdir, stat, realpath, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export class IngestError extends Error {
  constructor(code, status, detail) { super(code); this.code = code; this.status = status; this.detail = detail || null; }
}

// Parse-capable text formats vs stored-but-not-trade-evidence attachments.
const TRADE_TEXT_EXT = new Set(['.csv', '.txt']);
const ATTACHMENT_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.xlsx']);
const MAX_TEXT_BYTES = 5 * 1024 * 1024;       // trade/performance CSVs are small
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024; // report PDF / screenshot / xlsx
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

// Fixed required-metadata keys. Anything the uploader does not supply is UNKNOWN, never guessed.
export const REQUIRED_METADATA_KEYS = Object.freeze([
  'strategy_hash', 'strategy_version', 'symbol', 'venue', 'instrument_class',
  'timeframe', 'period', 'method', 'parameters', 'fees_assumption',
  'slippage_assumption', 'sample_designation',
]);

export const LIFECYCLE_STATES = Object.freeze([
  'Received', 'Validating', 'Queued', 'Analyzing', 'Complete', 'Needs-information',
]);

// ---- helpers ---------------------------------------------------------------

// Derive a safe on-disk filename from an untrusted client name. Never used as a path segment
// beyond a single basename; strips directories, control chars, and traversal tokens.
export function safeName(input) {
  const base = path.basename(String(input || '').replace(/\\/g, '/'));
  let s = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 128);
  if (!s || s === '_' ) s = 'upload';
  return s;
}

// Neutralize a cell for safe re-emission (display/CSV round-trip). Numeric parsing does NOT use this.
export function sanitizeCell(value) {
  const s = String(value);
  return FORMULA_PREFIX.test(s) ? `'${s}` : s;
}

// Conservative secret/credential scan on decoded text. Refuses obvious credential material.
function scanForSecrets(text) {
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bauthorization\s*:\s*bearer\s+[A-Za-z0-9._\-]{12,}/i,
    /\bset-cookie\s*:/i,
    /\bcookie\s*:\s*\S+=\S+/i,
    /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\b\s*[:=]\s*['"]?[A-Za-z0-9._\-]{16,}/i,
  ];
  return patterns.some(rx => rx.test(text));
}

// Strip a leading UTF-8 BOM.
const stripBom = (s) => (s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s);

// Sniff the delimiter from the header line: whichever of , ; \t occurs most.
function sniffDelimiter(headerLine) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of headerLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// RFC-ish CSV row split honoring double-quote quoting and "" escapes.
function splitRow(line, delim) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Parse a locale-formatted number. decimalComma=true when the delimiter is ';' (EU export).
// Strips currency symbols / thousands separators / spaces. Returns { value, raw, injection }.
function parseNumber(raw, decimalComma) {
  const rawStr = String(raw ?? '').trim();
  const injection = FORMULA_PREFIX.test(rawStr);
  if (rawStr === '' || /^(n\/?a|—|-)$/i.test(rawStr)) return { value: null, raw: rawStr, injection };
  let s = rawStr.replace(/[^\d.,\-]/g, ''); // drop currency symbols, %, spaces, letters
  if (decimalComma) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const v = Number(s);
  return { value: Number.isFinite(v) ? v : null, raw: rawStr, injection };
}

// Match a normalized header to a canonical field by substring patterns (localization/redesign safe).
function headerIndex(headers) {
  const norm = headers.map(h => stripBom(String(h)).trim().toLowerCase());
  const find = (rx) => norm.findIndex(h => rx.test(h));
  // English + redesigned names, plus common localized synonyms for the columns hardest to map by
  // pattern (price / P&L / size / date). Fully-localized exports outside these still fail loudly
  // with actionable guidance (re-export in English) rather than mis-mapping silently.
  return {
    trade: find(/trade\s*#|trade\s*number|^#$|^trade$/),
    type: find(/^type$|signal.*type|direction|typ/),
    datetime: find(/date|time|дата|zeit|fecha|datum|heure|ora/),
    price: find(/price|preis|prix|precio|prezzo|kurs|цена/),
    size: find(/position\s*size|contracts|quantity|qty|size|größe|grosse|taille|cantidad|contratos/),
    pnl: find(/net\s*p&?l|profit(?!\s*factor)|g&v|gewinn|perte|ganancia|profitto|прибыл/),
    cumulative: find(/cumulative|kumuliert|cumul|acumulad/),
    runup: find(/run-?up|anstieg/),
    drawdown: find(/draw-?down|rückgang|ruckgang/),
    _norm: norm,
  };
}

// ---- parsers ---------------------------------------------------------------

// Parse a TradingView "List of Trades" CSV. Tolerant of: BOM, , / ; / TAB delimiter, EU decimals,
// localized/renamed headers, dynamic currency suffix, non-ISO dates, and 2-rows-per-trade layout.
export function parseTradeListCsv(text) {
  const warnings = []; const errors = [];
  const clean = stripBom(String(text)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) { errors.push('empty_or_headerless'); return { schema: 'trade-list-1', trades: [], warnings, errors, delimiter: null }; }
  const delim = sniffDelimiter(lines[0]);
  const decimalComma = delim === ';';
  const headers = splitRow(lines[0], delim);
  const idx = headerIndex(headers);
  if (idx.trade < 0 || idx.type < 0 || (idx.price < 0 && idx.pnl < 0)) {
    errors.push('unrecognized_trade_list_header');
    return { schema: 'trade-list-1', trades: [], warnings, errors, delimiter: delim,
      detail: `Could not find the expected columns. Saw headers: [${headers.join(' | ')}]. Expected a "List of Trades" export with columns like Trade #, Type, Date/Time, Price, Net P&L. If your export is localized, re-export with TradingView language set to English.` };
  }
  let injectionCells = 0;
  const legs = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitRow(lines[r], delim);
    const at = (i) => (i >= 0 && i < cells.length ? cells[i] : '');
    for (const c of cells) if (FORMULA_PREFIX.test(String(c).trim())) injectionCells++;
    const typeRaw = String(at(idx.type)).trim();
    const dir = /short/i.test(typeRaw) ? 'short' : /long/i.test(typeRaw) ? 'long' : 'unknown';
    const leg = /entry/i.test(typeRaw) ? 'entry' : /exit/i.test(typeRaw) ? 'exit' : 'unknown';
    legs.push({
      trade_no: String(at(idx.trade)).trim(),
      type_raw: typeRaw, direction: dir, leg,
      datetime_raw: idx.datetime >= 0 ? String(at(idx.datetime)).trim() : '',
      datetime_ms: idx.datetime >= 0 ? (Date.parse(String(at(idx.datetime)).trim()) || null) : null,
      price: parseNumber(at(idx.price), decimalComma).value,
      size: parseNumber(at(idx.size), decimalComma).value,
      pnl: parseNumber(at(idx.pnl), decimalComma).value,
      cumulative: idx.cumulative >= 0 ? parseNumber(at(idx.cumulative), decimalComma).value : null,
      runup: idx.runup >= 0 ? parseNumber(at(idx.runup), decimalComma).value : null,
      drawdown: idx.drawdown >= 0 ? parseNumber(at(idx.drawdown), decimalComma).value : null,
    });
  }
  // Pair legs into trades by trade_no (entry + exit). P&L lives on the exit leg.
  const byNo = new Map();
  for (const l of legs) {
    const t = byNo.get(l.trade_no) || { trade_no: l.trade_no, direction: l.direction };
    if (l.leg === 'entry') t.entry = l;
    else if (l.leg === 'exit') t.exit = l;
    else (t.unpaired = t.unpaired || []).push(l);
    if (l.direction !== 'unknown') t.direction = l.direction;
    byNo.set(l.trade_no, t);
  }
  const trades = [...byNo.values()].map(t => ({
    trade_no: t.trade_no,
    direction: t.direction,
    entry_time: t.entry?.datetime_raw ?? null,
    entry_price: t.entry?.price ?? null,
    exit_time: t.exit?.datetime_raw ?? null,
    exit_price: t.exit?.price ?? null,
    size: t.exit?.size ?? t.entry?.size ?? null,
    pnl: t.exit?.pnl ?? null,
    cumulative: t.exit?.cumulative ?? null,
    complete: !!(t.entry && t.exit),
  }));
  const incomplete = trades.filter(t => !t.complete).length;
  if (incomplete) warnings.push(`incomplete_trades:${incomplete}`);
  if (injectionCells) warnings.push(`formula_injection_cells_flagged:${injectionCells}`);
  if (decimalComma) warnings.push('eu_locale_delimiter:semicolon');
  return {
    schema: 'trade-list-1', delimiter: delim, decimal_comma: decimalComma,
    trade_count: trades.length, incomplete_trades: incomplete,
    formula_injection_cells: injectionCells, trades, warnings, errors,
  };
}

// Parse a Performance Summary export (label + value(s), possibly currency + percent columns).
export function parsePerformanceCsv(text) {
  const warnings = []; const errors = [];
  const clean = stripBom(String(text)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 1) { errors.push('empty'); return { schema: 'performance-1', metrics: [], warnings, errors }; }
  const delim = sniffDelimiter(lines[0]);
  const decimalComma = delim === ';';
  const metrics = [];
  let injectionCells = 0;
  const start = /title|metric|all|long|short/i.test(lines[0]) && !/[\d]/.test(lines[0]) ? 1 : 0;
  for (let r = start; r < lines.length; r++) {
    const cells = splitRow(lines[r], delim);
    for (const c of cells) if (FORMULA_PREFIX.test(String(c).trim())) injectionCells++;
    const label = stripBom(String(cells[0] || '')).trim();
    if (!label) continue;
    const values = cells.slice(1).map(v => ({ raw: String(v).trim(), ...parseNumber(v, decimalComma) }));
    metrics.push({ label, values });
  }
  if (injectionCells) warnings.push(`formula_injection_cells_flagged:${injectionCells}`);
  return { schema: 'performance-1', delimiter: delim, metric_count: metrics.length, formula_injection_cells: injectionCells, metrics, warnings, errors };
}

// ---- store -----------------------------------------------------------------

function normalizeMetadata(meta = {}) {
  const out = {};
  for (const k of REQUIRED_METADATA_KEYS) {
    const v = meta[k];
    out[k] = (v === undefined || v === null || String(v).trim() === '') ? 'UNKNOWN' : String(v).trim().slice(0, 512);
  }
  return out;
}

async function pathExists(p) { try { await access(p, FS.F_OK); return true; } catch { return false; } }

export function createBacktestStore({ baseDir, now = () => Date.now() } = {}) {
  if (!baseDir) throw new IngestError('baseDir_required', 500);
  const runsDir = path.join(baseDir, 'runs');

  // runId is deterministic on (strategy_hash, file/content sha) so identical re-uploads for the
  // same version resolve to the SAME record — idempotent, never a duplicate, never an overwrite.
  const deriveRunId = (strategyHash, contentSha) =>
    createHash('sha256').update(`${strategyHash || 'UNKNOWN'}:${contentSha}`).digest('hex').slice(0, 16);

  async function writeContained(runDir, rel, data) {
    const target = path.resolve(runDir, rel);
    if (target !== runDir && !target.startsWith(runDir + path.sep)) throw new IngestError('path_escape_refused', 400);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { flag: 'wx' }); // wx → never overwrite an existing artifact
  }

  return {
    baseDir,

    async ingestUpload({ strategyHash, strategyVersion, filename, content, contentType, metadata = {}, kind = 'auto' }) {
      if (!content || !(content instanceof Uint8Array || Buffer.isBuffer(content))) throw new IngestError('missing_content', 400);
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
      const ext = path.extname(safeName(filename)).toLowerCase();
      const isText = TRADE_TEXT_EXT.has(ext);
      const isAttachment = ATTACHMENT_EXT.has(ext);
      if (!isText && !isAttachment) throw new IngestError('unsupported_type', 415, `Extension ${ext || '(none)'} not accepted. Trade evidence: .csv/.txt. Reports/screenshots: ${[...ATTACHMENT_EXT].join(', ')}.`);
      const cap = isText ? MAX_TEXT_BYTES : MAX_ATTACHMENT_BYTES;
      if (buf.length === 0) throw new IngestError('empty_upload', 400);
      if (buf.length > cap) throw new IngestError('too_large', 413, `${buf.length} bytes exceeds ${cap} cap.`);

      const contentSha = createHash('sha256').update(buf).digest('hex');
      const runId = deriveRunId(strategyHash, contentSha);
      const runDir = path.join(runsDir, runId);

      // Idempotency: identical bytes for this strategy hash → return the existing immutable record.
      if (await pathExists(runDir)) {
        const existing = await this.getRun(runId);
        return { ...existing, idempotent: true };
      }

      let parsed = null; let secretRefused = false; let evidenceClass;
      if (isText) {
        const text = buf.toString('utf8');
        if (scanForSecrets(text)) secretRefused = true;
        if (secretRefused) throw new IngestError('credential_material_refused', 422, 'Upload appears to contain cookie/authorization/private-key material. This surface never accepts credentials. Re-export a plain trade list or performance CSV.');
        // Heuristic: which parser. A trade list has a Trade #/Type header; else treat as performance.
        const first = stripBom(text).split(/\r?\n/)[0] || '';
        const looksTradeList = /trade\s*#|trade\s*number/i.test(first) && /type|signal/i.test(first);
        parsed = (kind === 'performance' || (kind === 'auto' && !looksTradeList))
          ? parsePerformanceCsv(text) : parseTradeListCsv(text);
        evidenceClass = parsed.schema === 'trade-list-1' ? 'trade-level' : 'performance-summary';
      } else {
        // Attachments are stored immutably but are explicitly NOT trade-level evidence.
        evidenceClass = 'non-evidence-attachment';
      }

      const safe = safeName(filename);
      const receivedAt = new Date(now()).toISOString();
      await mkdir(runDir, { recursive: true });
      await writeContained(runDir, path.join('original', safe), buf); // immutable raw bytes
      const upload = { sha256: contentSha, original_filename: String(filename || ''), safe_filename: safe, bytes: buf.length, content_type: String(contentType || '') || null, ext, received_at: receivedAt };
      await writeContained(runDir, 'upload.json', JSON.stringify(upload, null, 2));

      const provenance = {
        source: 'uploaded', evidence_class: evidenceClass,
        strategy_hash: strategyHash || 'UNKNOWN', strategy_version: strategyVersion || 'UNKNOWN',
        metadata: normalizeMetadata({ ...metadata, strategy_hash: strategyHash, strategy_version: strategyVersion }),
        received_at: receivedAt,
        note: evidenceClass === 'non-evidence-attachment'
          ? 'Stored immutably as a report/screenshot. NOT trade-level evidence; upload the List of Trades CSV for trade-level analysis.'
          : 'Parsed projection retained alongside the immutable original. Original bytes are authoritative.',
      };
      await writeContained(runDir, 'provenance.json', JSON.stringify(provenance, null, 2));
      if (parsed) await writeContained(runDir, 'parsed.json', JSON.stringify(parsed, null, 2));

      // Lifecycle: real, evidence-backed. Parse failure → Needs-information (not fabricated ETA).
      const parseFailed = parsed && parsed.errors && parsed.errors.length > 0;
      const initialState = evidenceClass === 'non-evidence-attachment' ? 'Needs-information'
        : parseFailed ? 'Needs-information' : 'Queued';
      const lifecycle = { state: initialState, history: [
        { state: 'Received', at: receivedAt, evidence: `upload sha256 ${contentSha}` },
        { state: 'Validating', at: receivedAt, evidence: isText ? `parsed as ${parsed.schema}` : 'binary attachment; no parse' },
        { state: initialState, at: receivedAt, evidence: parseFailed ? `parser errors: ${parsed.errors.join(',')}` : evidenceClass === 'non-evidence-attachment' ? 'attachment is not trade-level evidence' : `queued for team analysis; ${parsed.trade_count ?? parsed.metric_count ?? 0} records parsed` },
      ] };
      await writeContained(runDir, 'lifecycle.json', JSON.stringify(lifecycle, null, 2));

      return { run_id: runId, upload, provenance, parsed, lifecycle, idempotent: false };
    },

    // Manual summary when no export exists. Explicitly SELF-REPORTED; never trade-level evidence.
    async ingestManualSummary({ strategyHash, strategyVersion, summary, metadata = {} }) {
      const text = String(summary || '').trim();
      if (!text) throw new IngestError('empty_summary', 400);
      if (text.length > 20000) throw new IngestError('summary_too_large', 413);
      const contentSha = createHash('sha256').update(`manual:${text}`).digest('hex');
      const runId = deriveRunId(strategyHash, contentSha);
      const runDir = path.join(runsDir, runId);
      if (await pathExists(runDir)) return { ...(await this.getRun(runId)), idempotent: true };
      const receivedAt = new Date(now()).toISOString();
      await mkdir(runDir, { recursive: true });
      const provenance = {
        source: 'self-reported', evidence_class: 'self-reported-summary',
        strategy_hash: strategyHash || 'UNKNOWN', strategy_version: strategyVersion || 'UNKNOWN',
        metadata: normalizeMetadata({ ...metadata, strategy_hash: strategyHash, strategy_version: strategyVersion }),
        received_at: receivedAt,
        note: 'SELF-REPORTED summary entered manually. This is NOT trade-level evidence and is not independently verified. A screenshot is likewise not trade-level evidence.',
        summary_sha256: contentSha,
      };
      await writeContained(runDir, 'provenance.json', JSON.stringify(provenance, null, 2));
      await writeContained(runDir, 'summary.txt', text); // stored verbatim (inert data)
      const lifecycle = { state: 'Needs-information', history: [
        { state: 'Received', at: receivedAt, evidence: `self-reported summary sha256 ${contentSha}` },
        { state: 'Needs-information', at: receivedAt, evidence: 'self-reported; upload the List of Trades CSV for trade-level analysis' },
      ] };
      await writeContained(runDir, 'lifecycle.json', JSON.stringify(lifecycle, null, 2));
      return { run_id: runId, provenance, summary_stored: true, lifecycle, idempotent: false };
    },

    async getRun(runId) {
      const runDir = path.join(runsDir, safeName(runId));
      if (!await pathExists(runDir)) throw new IngestError('not_found', 404);
      const read = async (f) => { try { return JSON.parse(await readFile(path.join(runDir, f), 'utf8')); } catch { return null; } };
      const upload = await read('upload.json');
      const provenance = await read('provenance.json');
      const parsed = await read('parsed.json');
      const lifecycle = await read('lifecycle.json');
      let summary = null;
      try { summary = await readFile(path.join(runDir, 'summary.txt'), 'utf8'); } catch { /* none */ }
      return { run_id: safeName(runId), upload, provenance, parsed, lifecycle, summary };
    },

    async listRuns({ strategyHash } = {}) {
      let ids = [];
      try { ids = await readdir(runsDir); } catch { return { runs: [] }; }
      const runs = [];
      for (const id of ids) {
        try {
          const r = await this.getRun(id);
          if (strategyHash && r.provenance?.strategy_hash !== strategyHash) continue;
          runs.push({ run_id: r.run_id, source: r.provenance?.source, evidence_class: r.provenance?.evidence_class,
            strategy_hash: r.provenance?.strategy_hash, strategy_version: r.provenance?.strategy_version,
            state: r.lifecycle?.state, received_at: r.provenance?.received_at,
            trade_count: r.parsed?.trade_count ?? null });
        } catch { /* skip unreadable */ }
      }
      runs.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
      return { runs };
    },

    // Advance lifecycle with REAL evidence. Complete requires explicit evidence; never auto-set,
    // never a fabricated ETA. Rejects unknown states and cannot regress to Received.
    async setLifecycle(runId, state, evidence) {
      if (!LIFECYCLE_STATES.includes(state)) throw new IngestError('invalid_state', 400, `state must be one of ${LIFECYCLE_STATES.join(', ')}`);
      if (state === 'Complete' && !String(evidence || '').trim()) throw new IngestError('evidence_required', 400, 'Complete requires evidence (analysis artifact reference).');
      const runDir = path.join(runsDir, safeName(runId));
      if (!await pathExists(runDir)) throw new IngestError('not_found', 404);
      const lcPath = path.join(runDir, 'lifecycle.json');
      let lc; try { lc = JSON.parse(await readFile(lcPath, 'utf8')); } catch { lc = { state: 'Received', history: [] }; }
      lc.history.push({ state, at: new Date(now()).toISOString(), evidence: String(evidence || '').slice(0, 1000) || null });
      lc.state = state;
      await writeFile(lcPath, JSON.stringify(lc, null, 2)); // lifecycle is the one mutable projection
      return lc;
    },
  };
}
