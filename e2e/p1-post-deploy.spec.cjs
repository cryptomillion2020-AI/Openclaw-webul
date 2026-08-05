/**
 * P1 Post-Deploy Validation — Steps 5-7
 * Run against: http://127.0.0.1:4173
 * 2026-06-27
 */
const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';

test.describe('WEBUI-P1 Post-Deploy Validation', () => {
  test('7a — 4 hero cards render in order: Active | Queued | Decisions | Trading', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.stat-cards-row');

    const cards = await page.$$('.stat-cards-row .stat-card');
    expect(cards.length).toBe(4);

    const labels = await Promise.all(cards.map(c => c.$eval('.stat-card-label', el => el.textContent)));
    expect(labels[0]).toBe('Active');
    expect(labels[1]).toBe('Queued');
    expect(labels[2]).toBe('Decisions');
    expect(labels[3]).toBe('Trading');
  });

  test('7b — Card values are readable (non-blank)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.stat-cards-row');

    const values = await page.$$eval('.stat-card-value', els => els.map(el => el.textContent.trim()));
    for (const v of values) {
      expect(v.length).toBeGreaterThan(0);
    }
  });

  test('7c — Bottom panel header reads 📌 Currently Active Tasks', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.dashboard-page');

    // The tasks panel is the bottom-card AFTER the dashboard-bottom-grid
    const headers = await page.$$eval('.bottom-card .section-title', els => els.map(e => e.textContent));
    const tasksHeader = headers.find(h => h.includes('Currently Active Tasks'));
    expect(tasksHeader).toBeTruthy();
    expect(tasksHeader).toBe('📌 Currently Active Tasks');
  });

  test('7d — Decisions card shows 3 (mock)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.stat-cards-row');

    const cardValues = await page.$$eval('.stat-card-value', els => els.map(el => el.textContent.trim()));
    expect(cardValues[2]).toBe('3');
  });

  test('7e — Trading card shows OFF', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.stat-cards-row');

    const cardValues = await page.$$eval('.stat-card-value', els => els.map(el => el.textContent.trim()));
    expect(cardValues[3]).toBe('OFF');
  });

  test('7f — ArchitectMenu opens dropdown with Settings + Logout', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.architect-menu-trigger');

    // Click to open
    await page.click('.architect-menu-trigger');
    await page.waitForSelector('.architect-menu-dropdown', { state: 'visible' });

    const items = await page.$$('.architect-menu-item');
    expect(items.length).toBe(2);

    const texts = await Promise.all(items.map(i => i.textContent()));
    expect(texts[0]).toContain('Settings');
    expect(texts[1]).toContain('Logout');
  });

  test('7g — Sidebar collapse toggle narrows sidebar', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('.sidebar');

    // Verify initial state — sidebar should have nav labels visible
    const navLabelsBefore = await page.$$('.nav-item span:not(.nav-item-icon)');
    expect(navLabelsBefore.length).toBeGreaterThan(0);

    // Click collapse toggle
    await page.click('.sidebar-collapse-toggle');
    await page.waitForTimeout(300); // wait for transition

    // Sidebar should have 'collapsed' class
    const sidebarClass = await page.$eval('.sidebar', el => el.className);
    expect(sidebarClass).toContain('collapsed');
  });

  test('7h — Console errors check (zero new runtime errors)', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(BASE);
    await page.waitForSelector('.app-layout');
    await page.waitForTimeout(2000);

    // Navigate between pages to trigger console errors
    const navLinks = await page.$$('.nav-item');
    for (let i = 0; i < Math.min(navLinks.length, 4); i++) {
      await navLinks[i].click();
      await page.waitForTimeout(300);
    }

    expect(errors.length).toBe(0);
  });
});
