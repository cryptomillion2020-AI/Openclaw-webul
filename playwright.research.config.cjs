module.exports = {
  testDir: './e2e',
  testMatch: 'research-lab.spec.cjs',
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['list']],
  outputDir: '../revision-v2-evidence/research-output',
  use: {
    baseURL: 'http://127.0.0.1:5198',
    headless: true,
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node e2e/research-fixture-server.mjs',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: false,
    timeout: 15000,
  },
};
