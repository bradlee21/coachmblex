const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
