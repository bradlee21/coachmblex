import { expect, test } from '@playwright/test';
import { requireEnv } from './helpers/requireEnv';

const envCheck = requireEnv(['E2E_EMAIL', 'E2E_PASSWORD']);
const E2E_EMAIL = process.env.E2E_EMAIL || '';
const E2E_PASSWORD = process.env.E2E_PASSWORD || '';
const E2E_PACK_ID = process.env.E2E_PACK_ID || 'physiology-mid-term';
const E2E_DRILL_QT = process.env.E2E_DRILL_QT || 'mcq';

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

test('critical path drill start and answer first question', async ({ page }) => {
  test.skip(
    envCheck.mode === 'skip',
    `Skipping drill e2e test (E2E_ALLOW_SKIP=1). Missing: ${envCheck.missing.join(', ')}`
  );

  await login(page);

  const pk = encodeURIComponent(E2E_PACK_ID);
  const qt = encodeURIComponent(E2E_DRILL_QT);
  await page.goto(`/drill?pk=${pk}&qt=${qt}`, { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Drill', exact: true })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });

  const subjectSelect = page.getByLabel('Subject', { exact: true });
  await expect(subjectSelect).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await expect(subjectSelect).toBeEnabled({ timeout: STEP_TIMEOUT_MS });
  const subjectOptions = await page.locator('#drill-pack-select option').evaluateAll((options) =>
    options
      .map((option) => ({ value: option.getAttribute('value') || '' }))
      .filter((option) => option.value)
  );
  test.skip(subjectOptions.length === 0, 'Skipping drill e2e: no drill subjects available.');
  await subjectSelect.selectOption(subjectOptions[0].value, { timeout: STEP_TIMEOUT_MS });

  await page.getByRole('button', { name: /Start Drill/i }).click({ timeout: STEP_TIMEOUT_MS });

  const noQuestions = page.getByText('No questions available yet.');
  const noQuestionsVisible = await noQuestions
    .isVisible({ timeout: 4000 })
    .catch(() => false);
  test.skip(
    noQuestionsVisible,
    `Skipping drill e2e: no questions found for pk=${E2E_PACK_ID} qt=${E2E_DRILL_QT}.`
  );

  const firstChoiceButton = page.getByRole('button', { name: /^1\.\s/ }).first();
  await expect(firstChoiceButton).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await firstChoiceButton.click({ timeout: STEP_TIMEOUT_MS });

  await expect(page.getByText(/^Answer:/)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
});
