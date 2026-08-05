const { test, expect } = require('@playwright/test');

async function installSocket(page) {
  await page.addInitScript(() => {
    class FakeWebSocket {
      static OPEN = 1;
      static instances = [];
      constructor() {
        this.readyState = FakeWebSocket.OPEN;
        this.sent = [];
        this.closeCalls = 0;
        FakeWebSocket.instances.push(this);
        window.__socket = this;
        setTimeout(() => this.onopen?.(), 0);
      }
      send(payload) { this.sent.push(JSON.parse(payload)); }
      close() { this.closeCalls += 1; this.readyState = 3; this.onclose?.(); }
      emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    }
    window.WebSocket = FakeWebSocket;
  });
}

test.beforeEach(async ({ page }) => installSocket(page));

test('subscribes to every current server message type', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?page=markets');
  await page.waitForFunction(() => window.__socket?.sent.length > 0);
  const channels = await page.evaluate(() => window.__socket.sent.find(message => message.type === 'subscribe').channels);
  expect(channels).toEqual(expect.arrayContaining([
    'full_state', 'active_projects_delta', 'task_update', 'kill_switch_update',
    'bus_activity_delta', 'comms_delta', 'research_delta', 'market_context_update',
    'comms_anomaly', 'idle_tick',
  ]));
});

test('market feed renders live data and identifies an empty dead feed', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?page=markets');
  await expect(page.getByText('Market Context · DEAD')).toBeVisible();
  await expect(page.getByText(/No current market-context data/)).toBeVisible();
  await page.evaluate(() => window.__socket.emit({
    type: 'market_context_update',
    context: {
      generated_at: '2026-08-04T20:00:00Z', freshness_ttl_seconds: 60,
      sentiment: { regime: 'Risk-on' }, macro: { regime: 'Expansion' },
      data_quality: { status: 'verified' },
    },
  }));
  await expect(page.getByText('Market Context · LIVE')).toBeVisible();
  await expect(page.getByText('Risk-on')).toBeVisible();
});

test('network surfaces a named communications anomaly', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?page=network');
  await expect(page.getByText('Comms Safety · MONITORING')).toBeVisible();
  await page.evaluate(() => window.__socket.emit({
    type: 'comms_anomaly', reason: 'bad-token', ts: '2026-08-04T20:01:00Z',
  }));
  await expect(page.getByText('bad-token')).toBeVisible();
  await expect(page.getByText('ANOMALY')).toBeVisible();
});

test('AI-City keeps client derivation when city_state is absent', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?page=ai-city');
  const city = page.getByTestId('aicity-district-page');
  await expect(city).toHaveAttribute('data-city-feed-state', 'DEAD');
  await expect(page.getByTestId('city-feed-health')).toContainText('AI-City state · DEAD · no message received');
  await expect(page.getByRole('heading', { name: 'The Workshop' })).toBeVisible();
});

test('AI-City consumes the production city_state contract when live', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?page=ai-city');
  await page.evaluate(() => window.__socket.emit({
    type: 'city_state',
    generated_at: '2026-08-04T20:01:00Z',
    expected_cadence_seconds: 5,
    agents: [{
      agent_id: 'elevin', presence: 'online', activity: 'active',
      task_id: 'WEBUI-LANE-A-C-20260804', task_label: 'Wire the dedicated city feed',
    }],
    stations: [{ station_id: 'station-elevin', agent_id: 'elevin', occupied: true, activity: 'active' }],
    bus_routes: [{ route_id: 'sevin-to-elevin', from: 'sevin', to: 'elevin', active: true, recent_messages: 1 }],
  }));
  const city = page.getByTestId('aicity-district-page');
  await expect(city).toHaveAttribute('data-city-feed-state', 'LIVE');
  await expect(page.locator('[data-agent="elevin"]')).toHaveAttribute('data-task', 'Wire the dedicated city feed');
  await expect(page.locator('[data-agent="elevin"]')).toHaveAttribute('data-status', 'active');
});

test('city feed degrades independently with bounded recovery and fallback', async ({ page }) => {
  test.setTimeout(35_000);
  await page.goto('http://127.0.0.1:4173/?page=ai-city');
  await page.evaluate(() => window.__socket.emit({
    type: 'city_state',
    generated_at: new Date().toISOString(),
    expected_cadence_seconds: 5,
    agents: [{
      agent_id: 'elevin', presence: 'online', activity: 'active',
      task_id: 'LIVE-CITY-TASK', task_label: 'Live city task',
    }],
    stations: [], bus_routes: [],
  }));
  const health = page.getByTestId('city-feed-health');
  await expect(health).toContainText('AI-City state · LIVE');
  await page.waitForTimeout(11_000);
  await expect(health).toContainText('AI-City state · STALE');
  await page.evaluate(() => window.__socket.emit({ type: 'idle_tick', ts: new Date().toISOString() }));
  await page.waitForTimeout(8_000);
  await page.evaluate(() => window.__socket.emit({ type: 'idle_tick', ts: new Date().toISOString() }));
  await page.waitForTimeout(2_500);
  await expect(health).toContainText('AI-City state · DEAD');
  await expect(health).not.toContainText('no message received');
  await expect(page.locator('[data-agent="elevin"]')).not.toHaveAttribute('data-task', 'Live city task');
  const recovery = await page.evaluate(() => ({
    subscriptions: window.__socket.sent.filter(message => message.type === 'subscribe'
      && message.channels?.length === 1 && message.channels[0] === 'city_state').length,
    closeCalls: window.__socket.closeCalls,
    readyState: window.__socket.readyState,
  }));
  expect(recovery.subscriptions).toBe(2);
  expect(recovery.closeCalls).toBe(0);
  expect(recovery.readyState).toBe(1);
});
