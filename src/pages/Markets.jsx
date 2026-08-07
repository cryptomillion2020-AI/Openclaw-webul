/**
 * Markets.jsx — QUANT's floor, rebuilt to the approved Workshop room.
 *
 * Authority: Architect approval 2026-08-04 of the Bridge Workshop emulation,
 * plus the standing data contract of the same date:
 *   1. An empty feed stays empty. No mock, sample, or last-known substitution.
 *   2. Degradation is per feed. One dead feed does not blank the others.
 *   3. A dead feed names itself and says how long it has been dark.
 *
 * WHAT THIS REPLACED, AND WHY IT MATTERED
 * The prior page rendered MOCK_PNL ($1,248.32 open P&L), MOCK_POSITIONS
 * (three sized crypto positions with entry and mark), MOCK_TRADES (five
 * timestamped fills) and MOCK_GATES (four of six gates green). None of it had
 * a data source. The gate figures were also simply wrong: the real
 * mode3-conditions.json has ONE of five conditions true, so the page showed a
 * near-cleared trading authorisation that does not exist.
 *
 * Invented financial figures are the most dangerous class of substitution on
 * this site, because they are indistinguishable from a real book. Every mock
 * in this file is deleted, not relocated.
 *
 * SOURCES, ALL REAL
 *   marketContext  <- shared/state/market-context/current.json (schema 1.3),
 *                     pushed as market_context_update by the WS server.
 *   mode3          <- shared/state/mode3-conditions.json.
 *   positions / P&L / fills — NO SOURCE EXISTS. QUANT is Mode 2 (proposal);
 *                     nothing trades, so there is no book to render. Those
 *                     stations state that plainly instead of inventing one.
 */
import { useMemo } from 'react';
import { MARKET_FEED_INVENTORY, normalizeMarketFeed, marketFeedState } from '../feeds/marketFeeds';
import './workshop-room.css';

/* The five Mode 3 conditions, in the order they appear in the state file.
   Labels are canon; the values are read live and never defaulted to true. */
const MODE3 = [
  ['kill_switch_inactive',    'Kill switch inactive'],
  ['paper_mode_confirmed',    'Paper mode confirmed'],
  ['stan_audit_passed',       'STAN audit passed'],
  ['quant_proposal_approved', 'QUANT proposal approved'],
  ['architect_authorized',    'Architect authorised'],
];

function ago(seconds) {
  if (seconds == null || !isFinite(seconds)) return null;
  if (seconds < 60)    return `${Math.floor(seconds)}s`;
  if (seconds < 3600)  return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function fmt(n, dp = 2) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/* Compact form for the large absolute figures the context carries (market cap,
   open interest). Never applied to a price — a mark is shown at full precision
   or not at all. */
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e12) return `${fmt(n / 1e12)}T`;
  if (a >= 1e9)  return `${fmt(n / 1e9)}B`;
  if (a >= 1e6)  return `${fmt(n / 1e6)}M`;
  return fmt(n);
}

/* A value we cannot read renders as a dash, never as zero. Zero is a
   measurement; a dash is the absence of one, and they must not look alike.
   A per-instrument map is summarised by its breadth, not silently flattened
   to one arbitrary member — and an EMPTY map says so rather than reading as
   a healthy zero. */
function val(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') {
    if (!isFinite(v)) return '—';
    return Math.abs(v) >= 1e6 ? compact(v) : fmt(v, Number.isInteger(v) ? 0 : 2);
  }
  if (Array.isArray(v)) return v.length ? `${v.length} entries` : 'none reported';
  if (typeof v === 'object') {
    const n = Object.keys(v).length;
    return n ? `${n} instruments` : 'none reported';
  }
  return String(v);
}

function Empty({ what, why }) {
  return (
    <div className="wsroom-empty">
      <strong>{what}</strong>
      {why}
    </div>
  );
}

function Row({ name, meta, state }) {
  return (
    <div className="wsroom-row" data-state={state}>
      <span className="wsroom-row-mark" />
      <span className="wsroom-row-name">{name}</span>
      <span className="wsroom-row-meta">{meta}</span>
    </div>
  );
}

export function Markets({ marketContext, mode3, feedHealth }) {
  /* Freshness is judged against the context's OWN declared TTL, not a number
     invented here. A context past its TTL is stale even if the socket is up. */
  const snapshot = useMemo(() => normalizeMarketFeed(marketContext), [marketContext]);
  const ctx = snapshot.raw;

  const ctxAge = useMemo(() => {
    if (!ctx?.generated_at) return null;
    const t = Date.parse(ctx.generated_at);
    return isFinite(t) ? (Date.now() - t) / 1000 : null;
  }, [ctx]);

  const ttl = ctx?.freshness_ttl_seconds ?? null;
  const ctxState = marketFeedState(snapshot).state;

  const gates = MODE3.map(([key, label]) => ({ key, label, value: mode3 ? mode3[key] : null }));
  const cleared = gates.filter(g => g.value === true).length;
  const readable = mode3 != null;

  const feeds = [
    { key: 'market_context', label: 'context',   state: ctxState,                    age: ctxAge },
    { key: 'mode3',          label: 'gates',     state: readable ? 'LIVE' : 'DEAD',  age: null },
    { key: 'book',           label: 'positions', state: 'NO_SOURCE',                 age: null },
    { key: 'fills',          label: 'fills',     state: 'NO_SOURCE',                 age: null },
  ];

  const quotes = ctx?.equity_prices && typeof ctx.equity_prices === 'object'
    ? Object.entries(ctx.equity_prices)
    : [];

  const stale = ctx?.data_quality?.stale_feeds;
  const staleList = Array.isArray(stale) ? stale : [];

  return (
    <div className="wsroom">
      <div className="wsroom-env" aria-hidden="true">
        <div className="wsroom-wall" />
        <div className="wsroom-window">
          <img src="/ai-city/workshop-establishing.png" alt="" style={{ objectPosition: '76% 44%' }} />
        </div>
        <div className="wsroom-keystone" />
        <div className="wsroom-floor" />
        <div className="wsroom-lamp" />
        <div className="wsroom-vignette" />
      </div>

      <header className="wsroom-masthead">
        <div>
          <div className="wsroom-eyebrow">QUANT · Financial Intelligence</div>
          <h1 className="wsroom-title">The floor,<br />and what it may do.</h1>
        </div>
        <div className="wsroom-standing">
          <div className={`wsroom-standing-value${cleared < MODE3.length ? ' is-held' : ''}`}>
            {readable ? `${cleared}/${MODE3.length}` : '—'}
          </div>
          <div className="wsroom-standing-label">
            {readable && cleared < MODE3.length ? 'gates cleared · trading held' : 'mode 3 gates'}
          </div>
        </div>
      </header>

      <div className="wsroom-rail">
        {feeds.map(f => (
          <div className="wsroom-rail-item" data-state={f.state} key={f.key}>
            <span className="wsroom-rail-dot" />
            <span className="wsroom-rail-name">{f.label}</span>
            <span className="wsroom-rail-state">{f.state.replace('_', ' ')}</span>
            {f.age != null && <span className="wsroom-rail-age">{ago(f.age)} ago</span>}
          </div>
        ))}
      </div>

      <div className="wsroom-stations">

        <section className="wsroom-station wsroom-station--wide">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Feed inventory</span>
            <span className="wsroom-station-count">zero autonomous spend</span>
          </div>
          {MARKET_FEED_INVENTORY.map(feed => (
            <Row
              key={feed.id}
              name={`${feed.name} · ${feed.tier.toUpperCase()}`}
              state={feed.status === 'live' ? 'active' : 'unknown'}
              meta={`${feed.role} · ${feed.cost} · ${feed.auth} · ${feed.rateLimit}`}
            />
          ))}
        </section>

        {/* ── Mode 3 gate board ─────────────────────────────────── */}
        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Mode 3 authorisation</span>
            <span className="wsroom-station-count">
              {readable ? `${cleared} of ${MODE3.length} cleared` : 'unreadable'}
            </span>
          </div>
          {!readable ? (
            <Empty
              what="Gate state unreadable"
              why="mode3-conditions.json did not reach this page. No gate is shown as cleared on an unread file."
            />
          ) : gates.map(g => (
            <Row
              key={g.key}
              name={g.label}
              state={g.value === true ? 'pass' : g.value === false ? 'fail' : 'unknown'}
              meta={g.value === true ? 'cleared' : g.value === false ? 'held' : 'unknown'}
            />
          ))}
        </section>

        {/* ── Macro regime ──────────────────────────────────────── */}
        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Macro regime</span>
            <span className="wsroom-station-count">
              {ctx?.schema_version ? `schema ${ctx.schema_version}` : '—'}
            </span>
          </div>
          {!ctx ? (
            <Empty
              what="No market context"
              why="The context feed is dark. Nothing is being substituted, and no prior context is held over."
            />
          ) : (
            <>
              <Row name="Regime"            meta={val(ctx.macro?.regime)}            state="active" />
              <Row name="Yield curve 10y2y" meta={val(ctx.macro?.yield_curve_10y2y)} state="active" />
              <Row name="Yield curve 10y3m" meta={val(ctx.macro?.yield_curve_10y3m)} state="active" />
              <Row name="PCE inflation"     meta={val(ctx.macro?.pce_inflation)}     state="active" />
              <Row name="Sahm rule"         meta={val(ctx.macro?.sahm_rule_value)}   state="active" />
              <Row name="Equity session"    meta={val(ctx.equity_market_status)}     state="active" />
            </>
          )}
        </section>

        {/* ── Equity marks — the glazed case ────────────────────── */}
        <section className="wsroom-station wsroom-station--glass wsroom-station--wide">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Equity marks</span>
            <span className="wsroom-station-count">
              {ctx?.generated_at ? `as of ${ctx.generated_at}` : 'no context'}
            </span>
          </div>
          {quotes.length === 0 ? (
            <Empty
              what="No marks"
              why="The context feed carries no equity prices right now. These are reference marks, not a position book."
            />
          ) : (
            <div className="wsroom-quotes">
              {quotes.map(([sym, q]) => {
                const px  = (q && typeof q === 'object') ? (q.price ?? q.last ?? q.close ?? null) : q;
                const chg = (q && typeof q === 'object') ? (q.change_pct ?? q.pct_change ?? null) : null;
                return (
                  <div className="wsroom-quote" key={sym}>
                    <div className="wsroom-quote-sym">{sym}</div>
                    <div className="wsroom-quote-px">{px == null ? '—' : fmt(px)}</div>
                    <div className={`wsroom-quote-chg${chg == null ? '' : chg >= 0 ? ' up' : ' down'}`}>
                      {chg == null ? 'change unreported' : `${chg >= 0 ? '+' : ''}${fmt(chg)}%`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Crypto orderflow ──────────────────────────────────── */}
        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Crypto orderflow</span>
            <span className="wsroom-station-count">{ctxState.toLowerCase()}</span>
          </div>
          {!ctx?.crypto_orderflow ? (
            <Empty what="No orderflow" why="The context feed carries no crypto orderflow block." />
          ) : (
            <>
              <Row name="BTC dominance"  meta={val(ctx.crypto_orderflow.btc_dominance_pct)}     state="active" />
              <Row name="Global mkt cap" meta={val(ctx.crypto_orderflow.global_market_cap_usd)} state="active" />
              <Row name="Long/short"     meta={val(ctx.crypto_orderflow.long_short_ratio)}      state="active" />
              <Row name="Open interest"  meta={val(ctx.crypto_orderflow.open_interest)}         state="active" />
              <Row name="Crypto vol"     meta={val(ctx.volatility?.crypto_vol_state)}           state="active" />
              <Row name="Equity vol"     meta={val(ctx.volatility?.equity_vol_state)}           state="active" />
            </>
          )}
        </section>

        {/* ── Feed integrity ────────────────────────────────────── */}
        <section className="wsroom-station">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Feed integrity</span>
            <span className="wsroom-station-count">{ttl != null ? `ttl ${ttl}s` : 'no ttl declared'}</span>
          </div>
          {!ctx?.data_quality ? (
            <Empty what="Integrity unreported" why="The context feed declares no data-quality block, so freshness cannot be asserted." />
          ) : (
            <>
              <Row
                name="All feeds fresh"
                state={ctx.data_quality.all_feeds_fresh === true ? 'pass' : 'fail'}
                meta={ctx.data_quality.all_feeds_fresh === true ? 'yes' : 'no'}
              />
              <Row
                name="Fabrication guard"
                state={ctx.data_quality.fabrication_guard ? 'pass' : 'unknown'}
                meta={val(ctx.data_quality.fabrication_guard)}
              />
              <Row
                name="Context age"
                state={ctxState === 'LIVE' ? 'pass' : 'fail'}
                meta={ctxAge == null ? 'unknown' : `${ago(ctxAge)} old`}
              />
              <Row
                name="Stale feeds"
                state={staleList.length ? 'fail' : 'pass'}
                meta={staleList.length ? staleList.join(', ') : 'none'}
              />
            </>
          )}
        </section>

        {/* ── The book: no source, stated plainly ───────────────── */}
        <section className="wsroom-station wsroom-station--wide">
          <div className="wsroom-station-head">
            <span className="wsroom-station-title">Positions · P&amp;L · fills</span>
            <span className="wsroom-station-count">no source</span>
          </div>
          <Empty
            what="There is no book"
            why={
              <>
                QUANT is at Mode 2 (proposal). Nothing executes, so there are no positions,
                no realised or unrealised P&amp;L and no fills to report — and no service on
                this host publishes any. This station stays empty until an execution feed
                exists and the Mode 3 gates above are cleared by the Architect.
                <br /><br />
                The previous version of this page displayed an open P&amp;L, three sized
                positions and five timestamped fills. None of it was real.
              </>
            }
          />
        </section>
      </div>

      <div className="wsroom-colophon">
        <span>QUANT · Mode 2 · proposal only</span>
        <span>Empty means empty</span>
      </div>
    </div>
  );
}
