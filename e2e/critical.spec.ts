import { expect, test } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_EMAIL || '';
const E2E_PASSWORD = process.env.E2E_PASSWORD || '';

test('critical path login to protected page', async ({ page }) => {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    'Skipping e2e login test: set E2E_EMAIL and E2E_PASSWORD.'
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Coach MBLEx' })).toBeVisible();

  await page.goto('/auth/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(E2E_EMAIL);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});
