const { defineConfig } = require('@playwright/test');
const { existsSync, readFileSync } = require('node:fs');

function normalizeEnvValue(value) {
  const raw = String(value || '').trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = normalizeEnvValue(trimmed.slice(index + 1).trim());
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const configuredBaseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
let baseURL = configuredBaseURL;
let webServer;
try {
  const parsedBaseURL = new URL(configuredBaseURL);
  const isLocalHost =
    parsedBaseURL.hostname === 'localhost' || parsedBaseURL.hostname === '127.0.0.1';
  if (isLocalHost) {
    const managedPort = process.env.E2E_SERVER_PORT || '3100';
    baseURL = `http://127.0.0.1:${managedPort}`;
    webServer = {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${managedPort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120000,
    };
  }
} catch {
  webServer = undefined;
}

module.exports = defineConfig({
  testDir: './e2e',
  retries: 0,
  workers: 1,
  reporter: 'list',
  webServer,
  use: {
    baseURL,
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
