// Authenticated, READ-ONLY strategy-library index over a FIXED server-side allowlist.
//
// Security contract (Item A, directive 20260912-155614):
//   - Roots are a fixed server-side constant. NEVER client-supplied, NEVER a query param.
//   - Every file request is realpath-resolved and re-checked for containment inside a root
//     (defeats ../ traversal AND symlink escape). A realpath that leaves the root is refused.
//   - A curation deny-list removes raw *_chunks, PRE-* drafts, FAILED-QA drafts, backups,
//     dotfiles and prompt files. Drafts are never surfaced as accepted.
//   - Only an intentionally-allowed extension set is viewable/downloadable, size-capped.
//   - No profitability claim is asserted anywhere; status is descriptive, evidence-stage only.
// This module performs NO writes and holds NO trading authority.
import { realpath, readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// FIXED allowlist — the only canonical strategy directories this surface will ever read.
// Add a directory here ONLY after it is explicitly verified. Not overridable by any request.
export const STRATEGY_LIBRARY_ROOTS = Object.freeze([
  '/home/k/.openclaw/workspace/knowledge/quant-crypto-pine-20260825',
]);

// Curation deny-list — applied to the path RELATIVE to a root.
const DENY = [
  /(^|\/)_chunks(\/|$)/i,      // raw research chunks
  /\.PRE-[^/]*\.pine$/i,       // pre-final / pre-correction strategy drafts
  /\.FAILED-QA-[^/]*/i,        // drafts that failed QA
  /\.bak(\.|$|-)/i,            // backups
  /(^|\/)\./,                  // dotfiles / dotdirs
  /prompt/i,                   // internal prompts
];

const ALLOWED_EXT = new Set(['.md', '.pine', '.json', '.txt', '.csv']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

class LibraryError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

const MIME = {
  '.md': 'text/plain; charset=utf-8',
  '.pine': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const isDenied = (rel) => DENY.some(rx => rx.test(rel));

// PINE panel deny-list: identical to DENY but WITHOUT the PRE-*.pine rule, because the versioned
// Pine panel (directive 20260912-160705 PART A) intentionally SHOWS draft/superseded versions,
// clearly labeled — unlike the general library index which curates drafts OUT. Everything else
// (_chunks, FAILED-QA, backups, dotfiles, prompts) stays denied on both surfaces.
const PINE_DENY = DENY.filter(rx => rx.source !== /\.PRE-[^/]*\.pine$/i.source);
const isPineDenied = (rel) => PINE_DENY.some(rx => rx.test(rel));

// Companion research docs surfaced as LINKS (not inlined) next to the Pine versions, when present
// in the same root. These carry the hypothesis / source / venue / test instructions the header
// comment does not machine-expose. Pointers into the existing curated read route, never fabricated.
const PINE_COMPANIONS = [
  'BRIEF.md', 'QUANT-CRYPTO-MARKET-ANALYSIS.md', 'TRADINGVIEW-TEST-STEPS.md',
  'SOURCE-CAPTURE.md', 'BACKTEST-AND-ROBUSTNESS-CONTRACT.md',
];

// Parse the machine-reliable header of a Pine script. Missing fields are returned as null and the
// caller renders UNKNOWN — never invented. Reads only the leading comment block + strategy() decl.
export function parsePineHeader(text) {
  const head = String(text).slice(0, 8192);
  const versionMatch = head.match(/^\s*\/\/@version\s*=\s*(\d+)/m);
  const field = (label) => {
    const m = head.match(new RegExp('^\\s*//\\s*' + label + '\\s*:\\s*(.+?)\\s*$', 'mi'));
    return m ? m[1].trim() : null;
  };
  // strategy(...) / indicator(...) — capture the declared kind, then the title whether it is a
  // positional first arg  strategy("Name", ...)  or a named arg  strategy(\n title = "Name", ...).
  const kindMatch = head.match(/\b(strategy|indicator)\s*\(/);
  let title = null;
  if (kindMatch) {
    const after = head.slice(kindMatch.index + kindMatch[0].length);
    const named = after.match(/^[\s\S]{0,400}?\btitle\s*=\s*(["'])([^"']+)\1/);
    const positional = after.match(/^\s*(["'])([^"']+)\1/);
    title = named ? named[2] : positional ? positional[2] : null;
  }
  return {
    pine_version: versionMatch ? `v${versionMatch[1]}` : null,   // e.g. "v6"
    title,
    declared_kind: kindMatch ? kindMatch[1] : null,              // "strategy" | "indicator"
    task_id: field('task_id'),
    author: field('author'),
    version_note: field('version'),
  };
}

// Draft/superseded vs current/tested, derived from the FILENAME lineage (not invented):
//   *.PRE-CORRECTION-*.pine / *.PRE-FINAL-*.pine  -> draft/superseded
//   the plain <name>.pine                          -> current/tested
function pineStatus(name) {
  if (/\.PRE-CORRECTION\b/i.test(name)) return { status: 'draft/superseded', label: 'DRAFT — pre-correction (superseded)' };
  if (/\.PRE-FINAL\b/i.test(name)) return { status: 'draft/superseded', label: 'DRAFT — pre-final (superseded)' };
  return { status: 'tested/accepted', label: 'Current — tested/accepted' };
}

// Descriptive evidence-stage classification. Never a profitability or "accepted" claim.
function classify(rel) {
  const lower = rel.toLowerCase();
  if (lower.endsWith('.pine')) return { category: 'strategy-code', stage: 'backtested (paper-design)' };
  if (lower.startsWith('verification/')) return { category: 'verification', stage: 'independently-verified' };
  if (lower.startsWith('wave2/')) return { category: 'reconciliation', stage: 'reconciliation' };
  if (lower.startsWith('synthesis/')) return { category: 'synthesis', stage: 'synthesis' };
  if (lower.startsWith('research/')) return { category: 'research', stage: 'research-input' };
  return { category: 'reference', stage: 'reference' };
}

async function walk(root, real, rel = '') {
  const abs = rel ? path.join(real, rel) : real;
  const entries = await readdir(abs, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (isDenied(childRel)) continue;
    if (e.isDirectory()) {
      out.push(...await walk(root, real, childRel));
    } else if (e.isFile() && ALLOWED_EXT.has(path.extname(e.name))) {
      let st; try { st = await stat(path.join(abs, e.name)); } catch { continue; }
      out.push({
        path: `${path.basename(root)}/${childRel}`,
        name: e.name,
        ...classify(childRel),
        bytes: st.size,
        modified: st.mtime.toISOString(),
      });
    }
  }
  return out;
}

// Resolve a client-supplied "<rootBasename>/<relative>" path to a real, contained, curated file.
// denyFn selects the curation surface: isDenied (general index, drafts OUT) or isPineDenied
// (Pine panel, labeled drafts IN). Containment (traversal + realpath + symlink) is identical.
async function resolveWithin(clientPath, roots, denyFn = isDenied) {
  if (typeof clientPath !== 'string' || !clientPath || clientPath.includes('\0')) {
    throw new LibraryError('invalid_path', 400);
  }
  const parts = clientPath.split('/');
  const rootName = parts.shift();
  const root = roots.find(r => path.basename(r) === rootName);
  if (!root) throw new LibraryError('not_in_allowlist', 404);
  const rel = parts.join('/');
  if (!rel || rel.split('/').some(s => s === '..' || s === '' || s === '.')) {
    throw new LibraryError('path_traversal_refused', 400);
  }
  if (denyFn(rel)) throw new LibraryError('curated_out', 403);
  if (!ALLOWED_EXT.has(path.extname(rel))) throw new LibraryError('unsupported_type', 415);

  const rootReal = await realpath(root);
  const target = path.resolve(rootReal, rel);
  // Lexical containment (defends against ../ before touching the FS)
  if (target !== rootReal && !target.startsWith(rootReal + path.sep)) {
    throw new LibraryError('path_escape_refused', 400);
  }
  let real;
  try { real = await realpath(target); } catch { throw new LibraryError('not_found', 404); }
  // realpath containment (defends against symlink escape)
  if (!real.startsWith(rootReal + path.sep)) throw new LibraryError('symlink_escape_refused', 400);
  const st = await stat(real);
  if (!st.isFile()) throw new LibraryError('not_found', 404);
  if (st.size > MAX_FILE_BYTES) throw new LibraryError('too_large', 413);
  return { real, rel, rootName };
}

export function createStrategyLibrary({ roots = STRATEGY_LIBRARY_ROOTS } = {}) {
  return {
    roots,
    async list() {
      const collections = [];
      for (const root of roots) {
        let real;
        try { real = await realpath(root); } catch { collections.push({ root: path.basename(root), available: false, files: [] }); continue; }
        let files = [];
        try { files = await walk(root, real); } catch { /* unreadable root → reported empty, not fabricated */ }
        files.sort((a, b) => a.path.localeCompare(b.path));
        collections.push({ root: path.basename(root), available: true, files });
      }
      return {
        schema: 'strategy-library-1',
        generated_at: new Date().toISOString(),
        disclaimer: 'Curated read-only research index. Evidence stages are descriptive only — no profitability is claimed or implied, and no auto-execution is available.',
        collections,
      };
    },
    async read(clientPath) {
      const { real, rel, rootName } = await resolveWithin(clientPath, roots);
      const bytes = await readFile(real);
      return {
        filename: path.basename(real),
        path: `${rootName}/${rel}`,
        mime: MIME[path.extname(real)] || 'application/octet-stream',
        bytes,
      };
    },

    // PART A — versioned Pine index. READ-ONLY. Includes draft/superseded versions (clearly
    // labeled), each with sha256 + parsed header metadata + companion-doc links. No profitability
    // claim; no execution. TradingView embed cannot run these — the UI states so explicitly.
    async pineVersions() {
      const collections = [];
      for (const root of roots) {
        let real;
        try { real = await realpath(root); }
        catch { collections.push({ root: path.basename(root), available: false, versions: [], companions: [] }); continue; }

        let entries = [];
        try { entries = await readdir(real, { withFileTypes: true }); } catch { /* unreadable → empty, not fabricated */ }

        const versions = [];
        for (const e of entries) {
          if (!e.isFile() || path.extname(e.name) !== '.pine') continue;
          if (isPineDenied(e.name)) continue;
          const abs = path.join(real, e.name);
          let st, bytes;
          try { st = await stat(abs); bytes = await readFile(abs); } catch { continue; }
          if (st.size > MAX_FILE_BYTES) continue;
          const meta = parsePineHeader(bytes.toString('utf8'));
          versions.push({
            path: `${path.basename(root)}/${e.name}`,
            name: e.name,
            ...pineStatus(e.name),
            sha256: createHash('sha256').update(bytes).digest('hex'),
            bytes: st.size,
            modified: st.mtime.toISOString(),
            // Machine-parsed header fields; null renders as UNKNOWN in the UI (never invented).
            pine_version: meta.pine_version,
            title: meta.title,
            declared_kind: meta.declared_kind,
            task_id: meta.task_id,
            author: meta.author,
            version_note: meta.version_note,
          });
        }
        // Current/tested first, then superseded; stable by name within a status.
        versions.sort((a, b) =>
          (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'tested/accepted' ? -1 : 1));

        const present = new Set(entries.filter(e => e.isFile()).map(e => e.name));
        const companions = PINE_COMPANIONS
          .filter(n => present.has(n))
          .map(n => ({ name: n, path: `${path.basename(root)}/${n}` }));

        collections.push({ root: path.basename(root), available: true, versions, companions });
      }
      return {
        schema: 'pine-versions-1',
        generated_at: new Date().toISOString(),
        disclaimer: 'Read-only versioned Pine index. Status is version lineage only — NOT a profitability or performance claim. The embedded TradingView chart CANNOT compile or run Pine/Strategy Tester; run scripts in your own TradingView Pine Editor / Strategy Tester and upload the exports.',
        collections,
      };
    },

    // Read a single Pine file for the panel/download. Restricted to .pine, PINE_DENY curation
    // (permits labeled drafts), same realpath containment as read().
    async readPine(clientPath) {
      if (path.extname(String(clientPath)) !== '.pine') throw new LibraryError('unsupported_type', 415);
      const { real, rel: rel2, rootName } = await resolveWithin(clientPath, roots, isPineDenied);
      const bytes = await readFile(real);
      return {
        filename: path.basename(real),
        path: `${rootName}/${rel2}`,
        mime: 'text/plain; charset=utf-8',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes,
      };
    },
  };
}

export const defaultStrategyLibrary = createStrategyLibrary();
