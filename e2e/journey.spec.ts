import { expect, test } from '@playwright/test';
import { requireEnv } from './helpers/requireEnv';

const envCheck = requireEnv(['E2E_EMAIL', 'E2E_PASSWORD']);
const E2E_EMAIL = process.env.E2E_EMAIL || '';
const E2E_PASSWORD = process.env.E2E_PASSWORD || '';
const E2E_DRILL_CODE = process.env.E2E_DRILL_CODE || '2.D';
const E2E_DRILL_TYPE = process.env.E2E_DRILL_TYPE || 'mcq';
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
}

test('journey across main routes with one core action each', async ({ page }) => {
  test.skip(
    envCheck.mode === 'skip',
    `Skipping journey e2e (E2E_ALLOW_SKIP=1). Missing: ${envCheck.missing.join(', ')}`
  );
  test.setTimeout(120000);

  await login(page);

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
  const todayOutcome = await Promise.race([
    page
      .getByRole('heading', { name: 'Today Session' })
      .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
      .then(() => 'session')
      .catch(() => null),
    page
      .getByText(/No questions available yet\./)
      .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
      .then(() => 'empty')
      .catch(() => null),
    page
      .locator('.status.error')
      .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
      .then(async () => `error:${((await page.locator('.status.error').first().textContent()) || '').trim()}`)
      .catch(() => null),
  ]);
  expect(todayOutcome).toBeTruthy();
  expect(String(todayOutcome || '')).not.toMatch(/^error:/);

  const code = encodeURIComponent(E2E_DRILL_CODE);
  const type = encodeURIComponent(E2E_DRILL_TYPE);
  await page.goto(`/drill?code=${code}&type=${type}`, { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Drill' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
  await page.getByRole('button', { name: /Start Drill/i }).click({ timeout: STEP_TIMEOUT_MS });
  const drillNoQuestions = page.getByText('No questions available yet.');
  if (await drillNoQuestions.isVisible({ timeout: 5000 }).catch(() => false)) {
    test.skip(true, `Skipping journey drill action: no questions for ${E2E_DRILL_CODE}/${E2E_DRILL_TYPE}.`);
  } else {
    const drillChoice = page.getByRole('button', { name: /^1\.\s/ }).first();
    await expect(drillChoice).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await drillChoice.click({ timeout: STEP_TIMEOUT_MS });
    await expect(page.getByText(/^Answer:/)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  }

  await page.getByTestId('nav-review').click({ timeout: STEP_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/review$/, { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
  const reviewStart = page.getByTestId('review-start');
  if (await reviewStart.isVisible({ timeout: 6000 }).catch(() => false)) {
    await reviewStart.click({ timeout: STEP_TIMEOUT_MS });
    const reviewOutcome = await Promise.race([
      page
        .getByRole('heading', { name: /Review Session/i })
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
        .then(() => 'running')
        .catch(() => null),
      page
        .getByTestId('review-empty')
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
        .then(() => 'empty')
        .catch(() => null),
    ]);
    expect(reviewOutcome).toBeTruthy();
  } else {
    await expect(page.getByTestId('review-empty')).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  }

  await page.getByTestId('nav-study-night').click({ timeout: STEP_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/game\/study-night$/, { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Study Night' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
  await page.getByTestId('study-night-create').click({ timeout: STEP_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/game\/study-night\/room\/[A-Z0-9]+$/, {
    timeout: STEP_TIMEOUT_MS,
  });
  const phaseLabel = page.getByTestId('study-night-phase');
  await expect(phaseLabel).toContainText('Status: lobby', { timeout: STEP_TIMEOUT_MS });
  const startButton = page.getByTestId('study-night-start');
  await expect(startButton).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await startButton.click({ timeout: STEP_TIMEOUT_MS });
  await expect(phaseLabel).toContainText('Status: running', { timeout: STEP_TIMEOUT_MS });

  await page.getByTestId('nav-anatomy').click({ timeout: STEP_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/anatomy$/, { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByTestId('anatomy-root')).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  const firstPack = page.getByTestId('anatomy-pack-0');
  if (await firstPack.isVisible({ timeout: 4000 }).catch(() => false)) {
    await firstPack.click({ timeout: STEP_TIMEOUT_MS });
    await expect(page).toHaveURL(/\/anatomy\/pelvis-hip$/, { timeout: STEP_TIMEOUT_MS });
    await expect(page.getByRole('heading', { name: /Pelvis \/ Hip/i })).toBeVisible({
      timeout: STEP_TIMEOUT_MS,
    });
    await expect(page.getByRole('heading', { name: 'Labels' })).toBeVisible({
      timeout: STEP_TIMEOUT_MS,
    });
  } else {
    await expect(page.getByText(/No anatomy packs available/i)).toBeVisible({
      timeout: STEP_TIMEOUT_MS,
    });
  }

  await page.getByTestId('nav-progress').click({ timeout: STEP_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/progress$/, { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
  await expect(page.getByTestId('progress-stats')).toBeVisible({ timeout: STEP_TIMEOUT_MS });

  await page.getByTestId('nav-settings').click({ timeout: STEP_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/settings$/, { timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
  await expect(page.getByTestId('settings-root')).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await expect(page.getByRole('button', { name: /Gentle|Push/i }).first()).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
});
