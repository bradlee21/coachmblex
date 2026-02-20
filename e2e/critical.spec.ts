import { expect, test } from '@playwright/test';
import { requireEnv } from './helpers/requireEnv';

const envCheck = requireEnv(['E2E_EMAIL', 'E2E_PASSWORD']);
const E2E_EMAIL = process.env.E2E_EMAIL || '';
const E2E_PASSWORD = process.env.E2E_PASSWORD || '';
const STEP_TIMEOUT_MS = 15000;

async function login(page) {
  await page.goto('/auth/sign-in', { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });

  await page.getByLabel('Email').fill(E2E_EMAIL, { timeout: STEP_TIMEOUT_MS });
  await page.getByLabel('Password').fill(E2E_PASSWORD, { timeout: STEP_TIMEOUT_MS });
  await page.getByRole('button', { name: 'Sign in' }).click({ timeout: STEP_TIMEOUT_MS });

  const errorStatus = page.locator('.status.error');
  let loginOutcome;
  try {
    loginOutcome = await Promise.race([
      page.waitForURL(/\/today$/, { timeout: STEP_TIMEOUT_MS }).then(() => ({
        kind: 'success',
      })),
      errorStatus.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS }).then(async () => ({
        kind: 'error',
        message: ((await errorStatus.textContent()) || '').trim(),
      })),
    ]);
  } catch {
    if (await errorStatus.isVisible().catch(() => false)) {
      const statusMessage = ((await errorStatus.textContent()) || '').trim();
      throw new Error(`Login failed: ${statusMessage || 'Unknown sign-in error.'}`);
    }
    throw new Error('Login did not complete before timeout.');
  }

  if (loginOutcome.kind === 'error') {
    throw new Error(`Login failed: ${loginOutcome.message || 'Unknown sign-in error.'}`);
  }

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
}

test('critical path login to protected page', async ({ page }) => {
  test.skip(
    envCheck.mode === 'skip',
    `Skipping e2e login test (E2E_ALLOW_SKIP=1). Missing: ${envCheck.missing.join(', ')}`
  );

  await login(page);
});
