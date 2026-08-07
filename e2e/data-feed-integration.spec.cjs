const { test, expect } = require('@playwright/test');

test('renders normalized live feed, inventory, and mode3 state', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.addInitScript(() => {
    class FakeWebSocket {
      static OPEN = 1;
      constructor() { this.readyState = 1; window.__socket = this; setTimeout(() => this.onopen?.(), 0); }
      send() {}
      close() { this.readyState = 3; }
      emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    }
    window.WebSocket = FakeWebSocket;
  });
  await page.goto('/?page=trading');
  await page.waitForFunction(() => Boolean(window.__socket));
  await page.evaluate(() => {
    window.__socket.emit({
      type: 'market_context_update',
      context: {
        generated_at: new Date().toISOString(), freshness_ttl_seconds: 600,
        equity_prices: { SPY: 769.79, NVDA: 219.22 },
        macro: { regime: 'RISK_NEUTRAL', yield_curve_10y2y: 0.45 },
        crypto_orderflow: { btc_dominance_pct: 56.59, funding_rates: { BTC: 0.001 } },
        data_quality: { all_feeds_fresh: true, stale_feeds: [] },
      },
    });
    window.__socket.emit({
      type: 'mode3_conditions_update',
      mode3_conditions: {
        kill_switch_inactive: true, paper_mode_confirmed: false,
        stan_audit_passed: false, quant_proposal_approved: false,
        architect_authorized: false,
      }, mode3_enabled: false,
    });
  });
  await expect(page.getByText('Feed inventory')).toBeVisible();
  await expect(page.getByText('FRED · FREE')).toBeVisible();
  const apiNinjas = page.getByText('API Ninjas · FREE');
  await expect(apiNinjas).toHaveCount(1);
  await expect(page.getByText('769.79')).toBeVisible();
  await expect(page.getByText('1/5')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
