/**
 * PineScriptPanel.jsx — PART A of directive 20260912-160705.
 * Versioned, READ-ONLY Pine-script panel. Served from the authenticated curated route
 * (/api/research/pine-versions). Shows the current tested version + labeled draft/superseded
 * versions, each with parsed header metadata + sha256 + status. Copy + download .pine.
 *
 * Safety:
 *  - Read-only. This panel NEVER executes Pine. Highlighting is a pure token→<span> mapping,
 *    never dangerouslySetInnerHTML, so uploaded/served text cannot inject markup.
 *  - Explicit UI instruction that the embedded TradingView chart cannot run Pine.
 *  - Missing header fields render as UNKNOWN (never invented).
 */
import { useState, useEffect, useCallback } from 'react';
import { BacktestUploadPanel } from './BacktestUploadPanel.jsx';

const PINE_KEYWORDS = new Set([
  'strategy','indicator','library','import','export','method','type','var','varip','if','else',
  'for','while','switch','to','by','and','or','not','true','false','na','continue','break','return',
  'series','simple','const','input','float','int','bool','string','color','line','label','box','table',
]);
const TOKEN_STYLE = {
  comment: { color: '#6a9955', fontStyle: 'italic' },
  string:  { color: '#ce9178' },
  number:  { color: '#b5cea8' },
  keyword: { color: '#569cd6', fontWeight: 600 },
  plain:   { color: 'var(--text, #d4d4d4)' },
};

// Pure, injection-safe tokenizer. Returns [{type,value}] per line; caller renders as <span>.
function tokenizeLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    // line comment: // to end of line
    const c = rest.indexOf('//');
    if (c === 0) { out.push({ type: 'comment', value: rest }); break; }
    // string literal (double or single)
    const strM = rest.match(/^(["'])(?:\\.|(?!\1).)*\1?/);
    if (strM) { out.push({ type: 'string', value: strM[0] }); i += strM[0].length; continue; }
    // number
    const numM = rest.match(/^\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/);
    if (numM) { out.push({ type: 'number', value: numM[0] }); i += numM[0].length; continue; }
    // identifier / keyword
    const idM = rest.match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (idM) { out.push({ type: PINE_KEYWORDS.has(idM[0]) ? 'keyword' : 'plain', value: idM[0] }); i += idM[0].length; continue; }
    // any other single char (operators, punctuation, whitespace)
    out.push({ type: 'plain', value: rest[0] }); i += 1;
  }
  return out;
}

const F = (v) => (v == null || v === '' ? 'UNKNOWN' : v);

export function PineScriptPanel() {
  const [index, setIndex] = useState({ status: 'loading', versions: [], companions: [], disclaimer: '', error: null });
  const [selected, setSelected] = useState(null); // {path,...meta}
  const [source, setSource] = useState({ status: 'idle', text: '', sha256: null, error: null });
  const [copied, setCopied] = useState(false);

  const loadIndex = useCallback(async () => {
    setIndex(prev => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/research/pine-versions', { credentials: 'same-origin' });
      if (res.status === 401) { setIndex({ status: 'unauthenticated', versions: [], companions: [], error: null }); return; }
      if (!res.ok) { setIndex({ status: 'error', versions: [], companions: [], error: `HTTP ${res.status}` }); return; }
      const data = await res.json();
      const col = (data.collections || []).find(c => c.available && (c.versions || []).length) || (data.collections || [])[0] || {};
      setIndex({ status: 'ready', versions: col.versions || [], companions: col.companions || [], disclaimer: data.disclaimer, error: null });
      const cur = (col.versions || []).find(v => v.status === 'tested/accepted') || (col.versions || [])[0] || null;
      if (cur) setSelected(cur);
    } catch (e) { setIndex({ status: 'offline', versions: [], companions: [], error: String(e && e.message || e) }); }
  }, []);
  useEffect(() => { loadIndex(); }, [loadIndex]);

  const loadSource = useCallback(async (v) => {
    if (!v) return;
    setSource({ status: 'loading', text: '', sha256: null, error: null });
    try {
      const res = await fetch(`/api/research/pine-versions/file?path=${encodeURIComponent(v.path)}`, { credentials: 'same-origin' });
      if (!res.ok) { setSource({ status: 'error', text: '', sha256: null, error: `HTTP ${res.status}` }); return; }
      const text = await res.text();
      setSource({ status: 'ready', text, sha256: res.headers.get('X-Content-SHA256'), error: null });
    } catch (e) { setSource({ status: 'offline', text: '', sha256: null, error: String(e && e.message || e) }); }
  }, []);
  useEffect(() => { if (selected) loadSource(selected); }, [selected, loadSource]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(source.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };

  // Client-side integrity note: if the server-declared sha256 doesn't match the served bytes'
  // stated hash, surface it rather than silently trusting the label.
  const shaMatch = selected && source.sha256 ? (selected.sha256 === source.sha256) : null;

  return (
    <div className="bento-card lab-pine" data-testid="pine-panel">
      <div className="bento-card-label">QUANT Pine Script — versioned (read-only)</div>

      {index.status === 'loading' && <div className="lab-query-meta" role="status">Loading Pine versions…</div>}
      {index.status === 'unauthenticated' && <div className="lab-query-meta">Sign in to view Pine scripts.</div>}
      {(index.status === 'offline' || index.status === 'error') && (
        <div className="lab-query-meta" style={{ color: 'var(--danger, #FF5252)' }}>
          {index.status === 'offline' ? 'Offline' : `Error (${index.error})`} — Pine index unavailable.
          <button className="composer-send" style={{ marginLeft: 8 }} onClick={loadIndex}>Retry</button>
        </div>
      )}
      {index.status === 'ready' && index.versions.length === 0 && <div className="lab-query-meta">No Pine versions available.</div>}

      {index.status === 'ready' && index.versions.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {index.versions.map(v => (
              <button
                key={v.path}
                className={`route-chip ${selected && selected.path === v.path ? 'active' : ''}`}
                onClick={() => setSelected(v)}
                aria-pressed={selected && selected.path === v.path}
                title={`${v.name} · ${v.label}`}
                style={v.status !== 'tested/accepted' ? { opacity: 0.8, borderStyle: 'dashed' } : undefined}
              >
                {v.version_note ? v.version_note.split(/[ (]/)[0] : v.name}
                {v.status === 'tested/accepted' ? ' ✓' : ' (draft)'}
              </button>
            ))}
          </div>

          {selected && (
            <>
              <div className="pine-meta" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 12 }}>
                <div><b>{F(selected.title)}</b></div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`route-chip stage-${selected.status === 'tested/accepted' ? 'verification' : 'reference'}`} style={{ fontSize: 10, pointerEvents: 'none' }}>{selected.label}</span>
                </div>
                <div>File: <code>{selected.name}</code></div>
                <div style={{ textAlign: 'right' }}>Pine: {F(selected.pine_version)}</div>
                <div>Version: {F(selected.version_note)}</div>
                <div style={{ textAlign: 'right' }}>Author: {F(selected.author)}</div>
                <div>task_id: {F(selected.task_id)}</div>
                <div style={{ textAlign: 'right' }}>{Math.round((selected.bytes || 0) / 102.4) / 10}KB · {new Date(selected.modified).toLocaleDateString()}</div>
                <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  sha256: {selected.sha256}
                  {shaMatch === false && <span style={{ color: 'var(--danger,#FF5252)', marginLeft: 6 }}>⚠ served-bytes hash mismatch</span>}
                  {shaMatch === true && <span style={{ color: '#6a9955', marginLeft: 6 }}>✓ verified</span>}
                </div>
              </div>

              <div className="composer-row" style={{ marginTop: 8, gap: 8 }}>
                <button className="composer-send" onClick={copy} disabled={source.status !== 'ready'}>{copied ? 'Copied ✓' : 'Copy'}</button>
                <a className="composer-send" href={`/api/research/pine-versions/file?path=${encodeURIComponent(selected.path)}&download=1`} download={selected.name} style={{ textDecoration: 'none' }}>Download .pine</a>
              </div>

              <div className="pine-source" style={{ marginTop: 8, maxHeight: 340, overflow: 'auto', background: 'var(--surface-1, #1e1e1e)', borderRadius: 6, padding: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5 }}>
                {source.status === 'loading' && <div className="lab-query-meta" role="status">Loading script…</div>}
                {(source.status === 'error' || source.status === 'offline') && <div className="lab-query-meta" style={{ color: 'var(--danger,#FF5252)' }}>Could not load script ({source.error}).</div>}
                {source.status === 'ready' && source.text.split('\n').map((line, li) => (
                  <div key={li} style={{ display: 'flex' }}>
                    <span style={{ width: 34, flexShrink: 0, textAlign: 'right', paddingRight: 10, color: 'var(--text-muted,#666)', userSelect: 'none' }}>{li + 1}</span>
                    <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {tokenizeLine(line).map((t, ti) => <span key={ti} style={TOKEN_STYLE[t.type]}>{t.value}</span>)}
                      {line === '' ? '​' : ''}
                    </code>
                  </div>
                ))}
              </div>
            </>
          )}

          {index.companions.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11 }}>
              <div className="bento-card-sub">Linked hypothesis / source / test instructions:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {index.companions.map(d => (
                  <a key={d.path} href={`/api/research/strategy-library/file?path=${encodeURIComponent(d.path)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #4EA1FF)' }}>{d.name}</a>
                ))}
              </div>
            </div>
          )}

          <div className="lab-query-meta" style={{ marginTop: 10, padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
            ⚠ The embedded TradingView chart <b>cannot compile or run Pine / Strategy Tester</b>. Copy or download this script, run it in your own <b>TradingView Pine Editor → Strategy Tester</b>, then upload the exported results below. No in-embed execution, automation, or login is offered, and no credentials are ever required here.
          </div>

          {selected && <BacktestUploadPanel strategyHash={selected.sha256} strategyVersion={selected.version_note || selected.name} />}
        </>
      )}
    </div>
  );
}
