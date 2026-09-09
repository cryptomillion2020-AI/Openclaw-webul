import { useEffect, useMemo, useState } from 'react';
import './tradingview-chart.css';

export const TRADINGVIEW_WIDGET_ORIGIN = 'https://www.tradingview-widget.com';

export const TRADINGVIEW_WIDGET_CONFIG = Object.freeze({
  symbol: 'NASDAQ:AAPL',
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

function hasQualifiedOrigin(url) {
  try {
    return new URL(url).origin === TRADINGVIEW_WIDGET_ORIGIN;
  } catch {
    return false;
  }
}

export function TradingViewChart() {
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

  return (
    <section
      className="tradingview-surface wsroom-station--wide"
      aria-labelledby="tradingview-heading"
      data-testid="tradingview-surface"
      data-widget-state={state}
    >
      <header className="tradingview-provenance">
        <div>
          <span className="tradingview-kicker">Third-party visualization</span>
          <h3 id="tradingview-heading">TradingView chart</h3>
        </div>
        <span className="tradingview-boundary">Visualization only · not quote authority</span>
      </header>

      <p className="tradingview-disclosure" data-testid="tradingview-disclosure">
        Third-party chart visualization by TradingView. Equity reference quotes come from local
        Market Context at equity_prices[symbol]; perpetual quotes come from the independent BloFin
        public publisher. TradingView is not our quote backend.
      </p>
      <p className="tradingview-privacy-note">
        TradingView may show real-time, delayed, or end-of-day data. Chart timing and values may
        differ from Market Context. No TradingView account, login, API key, or webhook is connected.
      </p>

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
            key={attempt}
            src={TRADINGVIEW_WIDGET_URL}
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
