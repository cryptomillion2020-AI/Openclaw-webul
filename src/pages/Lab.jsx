/**
 * Lab.jsx — Pass 3 P3.1 Tier 5 — Team Research rebrand
 * ConstellationScene background + bento layout:
 * query composer, route chips, active queries, recent results, held research.
 */
import { useState } from 'react';
import { ConstellationScene } from '../three/ConstellationScene';

const MOCK_ROUTES = [
  { id: 'tika',      label: 'TIKA — Research Authority' },
  { id: 'nexus',     label: 'NEXUS — Synthesizer' },
  { id: 'navigator', label: 'NAVIGATOR — Pathfinder' },
  { id: 'cosmos',    label: 'COSMOS — Artist' },
  { id: 'axis',      label: 'AXIS — Aide' },
];

const MOCK_ACTIVE = [
  { id: 'q3001', topic: 'BTC volatility regime classification', route: 'tika',      eta: '12m' },
  { id: 'q3002', topic: 'Pinia vs Zustand for Pass 4 webui',    route: 'navigator', eta: '4m'  },
  { id: 'q3003', topic: 'Brand kit refinement v2',              route: 'cosmos',    eta: '22m' },
];

const MOCK_RESULTS = [
  { id: 'r2945', topic: 'TradingView color conventions',       route: 'tika',      lines: 142, age: '2h' },
  { id: 'r2944', topic: 'Air-gapped Ollama setup playbook',    route: 'tika',      lines: 318, age: '4h' },
  { id: 'r2943', topic: 'Dashboard inverted-pyramid concepts', route: 'tika',      lines: 96,  age: '7h' },
  { id: 'r2942', topic: 'CC0 sound library survey',            route: 'navigator', lines: 54,  age: '9h' },
];

const MOCK_HELD = [
  { id: 'h17', topic: 'Phase 6 trading model bake-off design', reason: 'HOLD — model selection gate' },
  { id: 'h16', topic: 'R-3 SIT-024 investigation Phase 4-6',   reason: 'DEFERRED post-Pass-3' },
];

const ROUTE_LABEL = Object.fromEntries(MOCK_ROUTES.map(r => [r.id, r.label.split(' — ')[0]]));

export function Lab({ busActivity }) {
  const [activeRoutes, setActiveRoutes] = useState(['tika']);
  const [query, setQuery] = useState('');

  const toggleRoute = (id) => {
    setActiveRoutes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

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
              Routes: {activeRoutes.length} selected
            </span>
            <button className="composer-send" onClick={() => setQuery('')}>Dispatch</button>
          </div>
        </div>

        <div className="bento-card lab-routes">
          <div className="bento-card-label">Available Routes</div>
          <div>
            {MOCK_ROUTES.map(r => (
              <span
                key={r.id}
                className={`route-chip ${activeRoutes.includes(r.id) ? 'active' : ''}`}
                onClick={() => toggleRoute(r.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && toggleRoute(r.id)}
              >
                {r.label}
              </span>
            ))}
          </div>
          <div className="bento-card-sub" style={{ marginTop: 12 }}>
            Multi-select for parallel dispatch. VAULT excluded (air-gapped).
          </div>
        </div>

        <div className="bento-card lab-active">
          <div className="bento-card-label">Active Queries ({MOCK_ACTIVE.length})</div>
          {MOCK_ACTIVE.map(q => (
            <div key={q.id} className="lab-query-row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{q.id}</span>
              <span style={{ flex: 1 }}>{q.topic}</span>
              <span className="lab-query-meta">{ROUTE_LABEL[q.route]}</span>
              <span className="bento-card-timeframe">ETA {q.eta}</span>
            </div>
          ))}
        </div>

        <div className="bento-card lab-results">
          <div className="bento-card-label">Recent Results</div>
          {MOCK_RESULTS.map(r => (
            <div key={r.id} className="lab-query-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.id}</span>
              <span style={{ flex: 1 }}>{r.topic}</span>
              <span className="lab-query-meta">{r.lines} lines</span>
              <span className="bento-card-timeframe">{r.age}</span>
            </div>
          ))}
        </div>

        <div className="bento-card lab-held">
          <div className="bento-card-label">Held Research</div>
          {MOCK_HELD.map(h => (
            <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 13 }}>{h.topic}</div>
              <div className="lab-query-meta" style={{ marginTop: 4 }}>{h.reason}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
