import { useEffect, useMemo, useState } from 'react';
import './tradingview-chart.css';
import { resolveInstrument, INSTRUMENT_CLASS } from '../feeds/blofinCatalog.js';

export const TRADINGVIEW_WIDGET_ORIGIN = 'https://www.tradingview-widget.com';

// Venue is BloFin. Perpetuals map to BLOFIN:<BASE><QUOTE>.P, spot to
// BLOFIN:<BASE><QUOTE>. No equity default and no cross-venue (Binance) fallback.
export const TRADINGVIEW_WIDGET_CONFIG = Object.freeze({
  symbol: 'BLOFIN:BTCUSDT.P',
  interval: 'D',
  timezone: 'Etc/UTC',
  theme: 'dark',
  style: '1',
  locale: 'en',
  backgroundColor: 'rgba(8, 13, 31, 1)',
  gridColor: 'rgba(255, 255, 255, 0.06)',
  hide_top_toolbar: false,
  hide_legend: false,
  save_image: false,
  support_host: 'https://www.tradingview.com',
});

export const TRADINGVIEW_WIDGET_URL =
  `${TRADINGVIEW_WIDGET_ORIGIN}/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify({
    ...TRADINGVIEW_WIDGET_CONFIG,
    width: '100%',
    height: '100%',
  }))}`;

export const TRADINGVIEW_TIMEOUT_MS = 10_000;

export const TRADINGVIEW_STATE = Object.freeze({
  LOADING: 'loading',
  LOADED: 'loaded',
  UNAVAILABLE: 'timeout-unavailable',
  REFUSED: 'refused-origin',
});

/** Map a BloFin catalog symbol (e.g. BTC-USDT) to its TradingView display
 *  symbol on the BloFin venue. Perp gets the .P contract suffix; spot does not. */
export function toTradingViewSymbol(catalogSymbol, instrumentClass) {
  const ticker = String(catalogSymbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return instrumentClass === INSTRUMENT_CLASS.SPOT ? `BLOFIN:${ticker}` : `BLOFIN:${ticker}.P`;
}

function hasQualifiedOrigin(url) {
  try {
    return new URL(url).origin === TRADINGVIEW_WIDGET_ORIGIN;
  } catch {
    return false;
  }
}

export function TradingViewChart() {
  const [instrumentDraft,setInstrumentDraft] = useState('BTC-USDT');
  const [chartClass,setChartClass] = useState(INSTRUMENT_CLASS.PERP);
  const [displaySymbol,setDisplaySymbol] = useState(TRADINGVIEW_WIDGET_CONFIG.symbol);
  const [displayLabel,setDisplayLabel] = useState('BTC-USDT · PERPETUAL');
  const [interval,setInterval] = useState(TRADINGVIEW_WIDGET_CONFIG.interval);
  const [selectionError,setSelectionError] = useState('');
  const widgetUrl = useMemo(()=>`${TRADINGVIEW_WIDGET_ORIGIN}/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify({...TRADINGVIEW_WIDGET_CONFIG,symbol:displaySymbol,interval,width:'100%',height:'100%'}))}`,[displaySymbol,interval]);
  const qualifiedOrigin = useMemo(() => hasQualifiedOrigin(TRADINGVIEW_WIDGET_URL), []);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(
    qualifiedOrigin ? TRADINGVIEW_STATE.LOADING : TRADINGVIEW_STATE.REFUSED,
  );

  useEffect(() => {
    if (!qualifiedOrigin || state !== TRADINGVIEW_STATE.LOADING) return undefined;
    const timeout = window.setTimeout(() => {
      setState(current => current === TRADINGVIEW_STATE.LOADING
        ? TRADINGVIEW_STATE.UNAVAILABLE
        : current);
    }, TRADINGVIEW_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [qualifiedOrigin, state]);

  useEffect(() => {
    if (!qualifiedOrigin) return undefined;

    const handlePolicyRefusal = event => {
      if (!String(event.violatedDirective || '').startsWith('frame-src')) return;
      if (!hasQualifiedOrigin(event.blockedURI || '')) return;
      setState(current => current === TRADINGVIEW_STATE.LOADING
        ? TRADINGVIEW_STATE.REFUSED
        : current);
    };

    document.addEventListener('securitypolicyviolation', handlePolicyRefusal);
    return () => document.removeEventListener('securitypolicyviolation', handlePolicyRefusal);
  }, [qualifiedOrigin]);

  const statusCopy = {
    [TRADINGVIEW_STATE.LOADING]: 'Loading TradingView display…',
    [TRADINGVIEW_STATE.LOADED]: 'TradingView display loaded · frame only; chart data unverified',
    [TRADINGVIEW_STATE.UNAVAILABLE]: 'TradingView unavailable · loading timed out',
    [TRADINGVIEW_STATE.REFUSED]: 'TradingView refused · qualified origin did not load',
  }[state];

  const applySelection = event => {
    event.preventDefault();
    // Resolve against the BloFin catalog for the chosen class. Only a real
    // BloFin listing maps to a chart symbol; nothing else is substituted.
    const row = resolveInstrument(instrumentDraft, chartClass);
    if (!row) {
      setSelectionError(`Not available on BloFin — no ${chartClass === INSTRUMENT_CLASS.SPOT ? 'spot' : 'perpetual'} instrument "${String(instrumentDraft).toUpperCase()}" in the BloFin catalog. No other venue is substituted.`);
      return;
    }
    setSelectionError('');
    setDisplaySymbol(toTradingViewSymbol(row.symbol, chartClass));
    setDisplayLabel(`${row.symbol} · ${chartClass === INSTRUMENT_CLASS.SPOT ? 'SPOT' : 'PERPETUAL'}`);
    setAttempt(n => n + 1);
    setState(TRADINGVIEW_STATE.LOADING);
  };

  return (
    <section
      className="tradingview-surface wsroom-station--wide"
      aria-labelledby="tradingview-heading"
      data-testid="tradingview-surface"
      data-widget-state={state}
      data-display-symbol={displaySymbol}
    >
      <header className="tradingview-provenance">
        <div>
          <span className="tradingview-kicker">Third-party visualization</span>
          <h3 id="tradingview-heading">TradingView chart · BloFin</h3>
        </div>
        <span className="tradingview-boundary">Visualization only · not quote authority</span>
      </header>

      <p className="tradingview-disclosure" data-testid="tradingview-disclosure">
        Third-party chart visualization by TradingView, pointed at the BloFin venue
        (BLOFIN:&lt;TICKER&gt;.P for perpetuals, BLOFIN:&lt;TICKER&gt; for spot). Perpetual quotes come
        from the independent BloFin public publisher. TradingView is not our quote backend, and no
        other exchange is substituted.
      </p>
      <p className="tradingview-privacy-note">
        TradingView may show real-time, delayed, or end-of-day data. Chart timing and values may
        differ from Market Context. No TradingView account, login, API key, or webhook is connected.
      </p>

      <form className="tradingview-selector" onSubmit={applySelection}>
        <div className="tradingview-class" role="group" aria-label="Chart instrument class">
          {[[INSTRUMENT_CLASS.PERP,'Perpetual'],[INSTRUMENT_CLASS.SPOT,'Spot']].map(([cls,label])=>
            <button type="button" key={cls} aria-pressed={chartClass===cls} onClick={()=>setChartClass(cls)}>{label}</button>)}
        </div>
        <label>BloFin instrument — display only<input aria-label="BloFin chart instrument" value={instrumentDraft} onChange={e=>setInstrumentDraft(e.target.value)} placeholder="e.g. BTC-USDT" maxLength={24}/></label>
        <label>Chart interval<select value={interval} onChange={e=>{setInterval(e.target.value);setState(TRADINGVIEW_STATE.LOADING);}}>{[['5','5 minutes'],['15','15 minutes'],['60','1 hour'],['240','4 hours'],['D','Daily'],['W','Weekly']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <button type="submit">Apply chart symbol</button>
        <p data-testid="tradingview-current">Charting <strong>{displayLabel}</strong> → <code>{displaySymbol}</code>. This selects only the third-party chart. It does not select a paper instrument, establish venue support, or provide execution prices.</p>
        {selectionError&&<p role="alert" data-testid="tradingview-venue-error">{selectionError}</p>}
      </form>

      <div className="tradingview-status" role="status" aria-live="polite" data-testid="tradingview-status">
        <span className="tradingview-status-dot" aria-hidden="true" />
        <span>{statusCopy}</span>
      </div>

      <div className="tradingview-widget-container" data-testid="tradingview-widget" data-state={state}>
        {state === TRADINGVIEW_STATE.UNAVAILABLE || state === TRADINGVIEW_STATE.REFUSED ? (
          <div className="tradingview-fallback">
            <strong>Third-party chart unavailable</strong>
            <span>Local Market Context and paper safeguards are unchanged. No widget value is cached or substituted.</span>
            <button type="button" onClick={() => { setAttempt(n => n + 1); setState(TRADINGVIEW_STATE.LOADING); }}>Retry chart display</button>
          </div>
        ) : (
          <iframe
            key={`${attempt}:${displaySymbol}:${interval}`}
            src={widgetUrl}
            title="TradingView third-party chart"
            loading="eager"
            referrerPolicy="no-referrer"
            credentialless=""
            sandbox="allow-scripts allow-same-origin"
            allow="fullscreen"
            onLoad={() => setState(current => current === TRADINGVIEW_STATE.LOADING
              ? TRADINGVIEW_STATE.LOADED
              : current)}
            onError={() => setState(current => current === TRADINGVIEW_STATE.LOADING
              ? TRADINGVIEW_STATE.REFUSED
              : current)}
          />
        )}
      </div>
    </section>
  );
}
