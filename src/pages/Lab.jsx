/**
 * Lab.jsx — LIVE Research page (App.jsx:422 `case 'research'`).
 * Delta directive 20260912-155614 (append to BLOFIN-SEARCH-LEDGER-REWORK-20260912):
 *   Item A — authenticated same-origin Strategy-library view (curated, allowlisted corpus).
 *   Item B — active/results/held reflect the REAL research pipeline (busActivity), not mocks.
 *   Item C — QUANT + ROOTS real routes wired to the real dispatcher (research_query).
 * No mock rows, no invented ETAs, no profitability claim, no auto-spawn.
 */
import { useState, useEffect, useCallback } from 'react';
import { ConstellationScene } from '../three/ConstellationScene';
import { STRATEGY_CORPUS } from '../feeds/strategyCorpus.js';
import { RESEARCH_ROUTES, ROUTE_LABEL, MAX_DISPATCH_ROUTES } from '../feeds/researchRoutes.js';
import { PineScriptPanel } from '../components/PineScriptPanel.jsx';
import { PaperManagementPanel } from '../components/PaperManagementPanel.jsx';

// Relative age from an epoch-seconds mtime or ISO ts. Genuine, never a canned ETA.
function ago(mtime, ts) {
  const ms = typeof mtime === 'number' ? mtime * 1000 : Date.parse(ts);
  if (!ms || Number.isNaN(ms)) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Group query_id-tagged busActivity into pipeline cards (mirror of the proven
// TeamResearch grouping): research_delta (dispatched) → research_result / _blocked.
function derivePipeline(busActivity) {
  const byId = new Map();
  for (const e of busActivity || []) {
    if (!e.query_id) continue;
    const prev = byId.get(e.query_id) || { query_id: e.query_id };
    if (e.stage === 'dispatched' && e.preview !== undefined && e.routing !== undefined) {
      byId.set(e.query_id, {
        ...prev,
        queryText: e.preview,
        routing: e.routing,
        selectedAgents: e.selected_agents,
        mtime: e.mtime, ts: e.ts,
        stage: prev.stage && prev.stage !== 'dispatched' ? prev.stage : 'dispatched',
      });
    } else if (e.resultType === 'research_result' || e.resultType === 'research_result_blocked' || e.stage) {
      byId.set(e.query_id, {
        ...prev,
        stage: e.resultType === 'research_result_blocked' ? 'blocked' : (e.stage || 'result'),
        resultPreview: e.preview,
        sources: e.sources || [],
        artifactPath: e.artifact_path || null,
        reason: e.reason || null,
        from: e.from,
        mtime: e.mtime || prev.mtime, ts: e.ts || prev.ts,
      });
    }
  }
  const all = [...byId.values()];
  return {
    active: all.filter(q => q.stage === 'dispatched').sort((a, b) => (b.mtime || 0) - (a.mtime || 0)),
    results: all.filter(q => q.stage === 'result' || (q.stage && !['dispatched', 'blocked'].includes(q.stage))).sort((a, b) => (b.mtime || 0) - (a.mtime || 0)),
    held: all.filter(q => q.stage === 'blocked').sort((a, b) => (b.mtime || 0) - (a.mtime || 0)),
  };
}

export function Lab({ busActivity = [], onSend, connected = false }) {
  const [activeRoutes, setActiveRoutes] = useState(['tika']);
  const [query, setQuery] = useState('');
  const [dispatchNote, setDispatchNote] = useState(null);

  // ---- Item A: authenticated strategy library (fetched live, same-origin) ----
  const [lib, setLib] = useState({ status: 'loading', collections: [], error: null });
  const loadLibrary = useCallback(async () => {
    setLib(prev => ({ ...prev, status: 'loading' }));
    try {
      const res = await fetch('/api/research/strategy-library', { credentials: 'same-origin' });
      if (res.status === 401) { setLib({ status: 'unauthenticated', collections: [], error: null }); return; }
      if (!res.ok) { setLib({ status: 'error', collections: [], error: `HTTP ${res.status}` }); return; }
      const data = await res.json();
      setLib({ status: 'ready', collections: data.collections || [], disclaimer: data.disclaimer, error: null });
    } catch (e) {
      setLib({ status: 'offline', collections: [], error: String(e && e.message || e) });
    }
  }, []);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // ---- Item C: real dispatch (genuine user action only) ----
  const toggleRoute = (id) => {
    setActiveRoutes(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_DISPATCH_ROUTES) return prev; // bounded fan-out
      return [...prev, id];
    });
  };
  const canDispatch = !!onSend && connected && query.trim().length > 0 && activeRoutes.length > 0;
  const dispatch = () => {
    if (!canDispatch) return;
    onSend({
      type: 'research_query',
      text: query.trim(),
      routing: 'Select agents',
      selected_agents: activeRoutes,
    });
    setDispatchNote(`Dispatched to ${activeRoutes.map(id => ROUTE_LABEL[id] || id).join(', ')}`);
    setQuery('');
  };

  // ---- Item B: real pipeline state ----
  const { active, results, held } = derivePipeline(busActivity);
  const pipelineEmpty = active.length === 0 && results.length === 0 && held.length === 0;

  return (
    <div className="lab-page">
      <ConstellationScene busActivity={busActivity} />

      <div className="lab-grid">
        <div className="bento-card lab-query">
          <div className="bento-card-label">New Query</div>
          <textarea
            className="composer-textarea"
            placeholder="What do you want researched?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Research query"
            style={{ minHeight: 120 }}
          />
          <div className="composer-row">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Routes: {activeRoutes.length}/{MAX_DISPATCH_ROUTES} selected
              {!connected && <span style={{ color: 'var(--danger, #FF5252)', marginLeft: 8 }}>· offline</span>}
            </span>
            <button
              className="composer-send"
              onClick={dispatch}
              disabled={!canDispatch}
              aria-disabled={!canDispatch}
              title={!connected ? 'Backend offline — dispatch unavailable' : (activeRoutes.length === 0 ? 'Select at least one route' : (query.trim() ? 'Dispatch research query' : 'Enter a query'))}
            >
              Dispatch
            </button>
          </div>
          {dispatchNote && <div className="lab-query-meta" style={{ marginTop: 6 }} role="status">{dispatchNote}</div>}
          {!onSend && <div className="lab-query-meta" style={{ marginTop: 6, color: 'var(--danger, #FF5252)' }}>Dispatch transport unavailable in this view.</div>}
        </div>

        <div className="bento-card lab-routes" data-testid="lab-routes">
          <div className="bento-card-label">Available Routes</div>
          <div>
            {RESEARCH_ROUTES.map(r => {
              const selected = activeRoutes.includes(r.id);
              const atCap = !selected && activeRoutes.length >= MAX_DISPATCH_ROUTES;
              return (
                <span
                  key={r.id}
                  className={`route-chip ${selected ? 'active' : ''}`}
                  onClick={() => toggleRoute(r.id)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-disabled={atCap}
                  title={r.note || `${r.label} — ${r.role}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRoute(r.id); } }}
                  style={atCap ? { opacity: 0.45 } : undefined}
                >
                  {r.label} — {r.role}
                </span>
              );
            })}
          </div>
          <div className="bento-card-sub" style={{ marginTop: 12 }}>
            Multi-select (max {MAX_DISPATCH_ROUTES}) for bounded parallel dispatch. QUANT = trading-policy research (no auto-execution); ROOTS = health/info only. VAULT excluded (air-gapped).
          </div>
        </div>

        <div className="bento-card lab-active" data-testid="lab-active">
          <div className="bento-card-label">Active Research ({active.length})</div>
          {!connected && <div className="lab-query-meta">Offline — showing last known state; may be stale.</div>}
          {connected && active.length === 0 && <div className="lab-query-meta">No active research. Dispatch a query to begin.</div>}
          {active.map(q => (
            <div key={q.query_id} className="lab-query-row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{q.query_id}</span>
              <span style={{ flex: 1 }}>{q.queryText}</span>
              <span className="lab-query-meta">{(q.selectedAgents || []).map(a => ROUTE_LABEL[a] || a).join(', ') || q.routing}</span>
              <span className="bento-card-timeframe">{ago(q.mtime, q.ts) || 'awaiting result'}</span>
            </div>
          ))}
        </div>

        <div className="bento-card lab-results" data-testid="lab-results">
          <div className="bento-card-label">Recent Results ({results.length})</div>
          {connected && results.length === 0 && <div className="lab-query-meta">No completed results yet.</div>}
          {results.map(r => (
            <div key={r.query_id} className="lab-query-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.query_id}</span>
              <span style={{ flex: 1 }}>{r.resultPreview || r.queryText || '(result)'}</span>
              <span className="lab-query-meta">{r.from || ''}{(r.sources && r.sources.length) ? ` · ${r.sources.length} src` : ''}</span>
              <span className="bento-card-timeframe">{ago(r.mtime, r.ts)}</span>
            </div>
          ))}
        </div>

        <div className="bento-card lab-strategy" data-testid="strategy-library">
          <div className="bento-card-label">Strategy Library</div>
          <div style={{ fontSize: 13 }}>{STRATEGY_CORPUS.title}</div>
          <div className="lab-query-meta" style={{ marginTop: 4 }}>Authenticated, curated · Sourced {STRATEGY_CORPUS.sourced} · {STRATEGY_CORPUS.venue}</div>

          {lib.status === 'loading' && <div className="lab-query-meta" style={{ marginTop: 8 }} role="status">Loading library…</div>}
          {lib.status === 'unauthenticated' && <div className="lab-query-meta" style={{ marginTop: 8 }}>Sign in to view the strategy library.</div>}
          {lib.status === 'offline' && (
            <div className="lab-query-meta" style={{ marginTop: 8 }}>
              Offline — library unavailable. <button className="composer-send" style={{ marginLeft: 8 }} onClick={loadLibrary}>Retry</button>
            </div>
          )}
          {lib.status === 'error' && (
            <div className="lab-query-meta" style={{ marginTop: 8, color: 'var(--danger, #FF5252)' }}>
              Error loading library ({lib.error}). <button className="composer-send" style={{ marginLeft: 8 }} onClick={loadLibrary}>Retry</button>
            </div>
          )}
          {lib.status === 'ready' && lib.collections.every(c => !c.files || c.files.length === 0) && (
            <div className="lab-query-meta" style={{ marginTop: 8 }}>No curated files available.</div>
          )}
          {lib.status === 'ready' && lib.collections.map(c => (
            <div key={c.root} style={{ marginTop: 8 }}>
              {(c.files || []).map(f => (
                <div key={f.path} className="lab-query-row" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
                  <span className={`route-chip stage-${f.category}`} style={{ fontSize: 10, pointerEvents: 'none' }}>{f.stage}</span>
                  <a
                    href={`/api/research/strategy-library/file?path=${encodeURIComponent(f.path)}`}
                    target="_blank" rel="noreferrer"
                    style={{ flex: 1, color: 'var(--text)', textDecoration: 'none' }}
                    title={f.path}
                  >
                    {f.name}
                  </a>
                  <span className="lab-query-meta">{Math.round((f.bytes || 0) / 102.4) / 10}KB</span>
                </div>
              ))}
            </div>
          ))}

          <ul style={{ marginTop: 8, paddingLeft: 16, fontSize: 11, color: 'var(--text-muted)' }}>
            {STRATEGY_CORPUS.caveats.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
          </ul>
          <div className="lab-query-meta" style={{ marginTop: 6 }}><a href="?page=trading">Back to Trading</a></div>
        </div>

        <PineScriptPanel />

        <PaperManagementPanel />

        <div className="bento-card lab-held" data-testid="lab-held">
          <div className="bento-card-label">Held / Blocked ({held.length})</div>
          {connected && held.length === 0 && <div className="lab-query-meta">Nothing held or citation-blocked.</div>}
          {held.map(h => (
            <div key={h.query_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 13 }}>{h.queryText || h.resultPreview || h.query_id}</div>
              <div className="lab-query-meta" style={{ marginTop: 4 }}>{h.reason || 'Blocked — no citable source; withheld rather than shown as a claim.'}</div>
            </div>
          ))}
          {pipelineEmpty && connected && (
            <div className="lab-query-meta" style={{ marginTop: 8 }}>Pipeline empty — the UI reflects real state, not sample rows.</div>
          )}
        </div>
      </div>
    </div>
  );
}
