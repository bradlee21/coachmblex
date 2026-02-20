import { expect, test } from '@playwright/test';
import { requireEnv } from './helpers/requireEnv';

const envCheck = requireEnv(['E2E_EMAIL', 'E2E_PASSWORD']);
const E2E_EMAIL = process.env.E2E_EMAIL || '';
const E2E_PASSWORD = process.env.E2E_PASSWORD || '';
const STEP_TIMEOUT_MS = 20000;

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

test('critical path study night single-user host flow', async ({ page }) => {
  test.skip(
    envCheck.mode === 'skip',
    `Skipping study night e2e (E2E_ALLOW_SKIP=1). Missing: ${envCheck.missing.join(', ')}`
  );

  await login(page);

  await page.goto('/game/study-night', { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Study Night' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });

  const createButton = page.getByTestId('study-night-create');
  await expect(createButton).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await createButton.click({ timeout: STEP_TIMEOUT_MS });

  await expect(page).toHaveURL(/\/game\/study-night\/room\/[A-Z0-9]+$/, {
    timeout: STEP_TIMEOUT_MS,
  });

  const roomCode = page.url().split('/').pop()?.split('?')[0] || '';
  const roomHeading = page.getByRole('heading', { name: /Study Night Room/i });
  await expect(roomHeading).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await expect(page.getByText(new RegExp(`Share code\\s+${roomCode}\\s+with friends\\.`))).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });

  const phaseLabel = page.getByTestId('study-night-phase');
  await expect(phaseLabel).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await expect(phaseLabel).toContainText('Status: lobby', { timeout: STEP_TIMEOUT_MS });

  const startButton = page.getByTestId('study-night-start');
  await expect(startButton).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await startButton.click({ timeout: STEP_TIMEOUT_MS });

  await expect(phaseLabel).toContainText('Status: running', { timeout: STEP_TIMEOUT_MS });
  await expect(phaseLabel).toContainText('Phase: pick', { timeout: STEP_TIMEOUT_MS });

  const categoryTiles = page.getByTestId('category-tile');
  const tileCount = await categoryTiles.count();
  let advancedToQuestion = false;
  let sawNoQuestionSignal = false;
  let enabledTileCount = 0;
  const noQuestionMessage = page.getByText(
    /No questions available for this category yet\.|No .* question found for category/i
  );

  for (let i = 0; i < tileCount; i += 1) {
    const tile = categoryTiles.nth(i);
    if (await tile.isDisabled()) continue;
    enabledTileCount += 1;

    await tile.click({ timeout: STEP_TIMEOUT_MS });

    const outcome = await Promise.race([
      page
        .getByTestId('study-night-question')
        .waitFor({ state: 'visible', timeout: 12000 })
        .then(() => 'question')
        .catch(() => null),
      noQuestionMessage
        .waitFor({ state: 'visible', timeout: 12000 })
        .then(() => 'no-question')
        .catch(() => null),
    ]);

    if (outcome === 'question') {
      advancedToQuestion = true;
      break;
    }

    if (outcome === 'no-question') {
      sawNoQuestionSignal = true;
    }
  }

  test.skip(
    enabledTileCount === 0,
    'Skipping study night e2e: no enabled category tiles available.'
  );
  test.skip(
    !advancedToQuestion && sawNoQuestionSignal,
    'Skipping study night e2e: no questions available for enabled categories.'
  );

  await expect(page.getByTestId('study-night-question')).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
});
