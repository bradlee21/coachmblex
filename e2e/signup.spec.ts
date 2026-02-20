import { expect, test } from '@playwright/test';

const SIGNUP_ENABLED = process.env.E2E_SIGNUP === '1';
const E2E_SIGNUP_PASSWORD = process.env.E2E_SIGNUP_PASSWORD || '';
const E2E_SIGNUP_EMAIL_DOMAIN = process.env.E2E_SIGNUP_EMAIL_DOMAIN || 'example.com';
const STEP_TIMEOUT_MS = 20000;

if (SIGNUP_ENABLED && !String(E2E_SIGNUP_PASSWORD).trim()) {
  throw new Error(
    'E2E_SIGNUP=1 requires E2E_SIGNUP_PASSWORD. Set E2E_SIGNUP_PASSWORD in your env before running e2e.'
  );
}

test('gated signup flow (email confirmation off)', async ({ page }) => {
  test.skip(
    !SIGNUP_ENABLED,
    'Skipping signup e2e. Set E2E_SIGNUP=1 to enable this test.'
  );

  const signupEmail = `e2e+${Date.now()}@${E2E_SIGNUP_EMAIL_DOMAIN}`;

  await page.goto('/auth/sign-up', { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Sign up' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });

  await page.getByLabel('Email').fill(signupEmail, { timeout: STEP_TIMEOUT_MS });
  await page.getByLabel('Password').fill(E2E_SIGNUP_PASSWORD, { timeout: STEP_TIMEOUT_MS });
  await page.getByRole('button', { name: /Create account/i }).click({
    timeout: STEP_TIMEOUT_MS,
  });

  const signOutButton = page.getByRole('button', { name: 'Sign out' });
  const signupOutcome = await Promise.race([
    page
      .waitForURL(/\/today$/, { timeout: STEP_TIMEOUT_MS })
      .then(() => 'today')
      .catch(() => null),
    signOutButton
      .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
      .then(() => 'signed-in')
      .catch(() => null),
    page
      .locator('.status.error')
      .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
      .then(async () => `error:${((await page.locator('.status.error').first().textContent()) || '').trim()}`)
      .catch(() => null),
  ]);

  expect(signupOutcome).toBeTruthy();
  expect(String(signupOutcome || '')).not.toMatch(/^error:/);

  if (await signOutButton.isVisible({ timeout: 4000 }).catch(() => false)) {
    await signOutButton.click({ timeout: STEP_TIMEOUT_MS });
    await expect(page).toHaveURL(/\/auth\/sign-in$/, { timeout: STEP_TIMEOUT_MS });
  }
});
