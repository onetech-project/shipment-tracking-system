import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

test.describe('Organizations management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/settings/organizations');
  });

  test('should display organizations list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /organizations/i })).toBeVisible();
  });

  test('should open create organization modal', async ({ page }) => {
    await page.getByRole('button', { name: /new organization/i }).click();
    await expect(page.getByRole('heading', { name: /new organization/i })).toBeVisible();
    await expect(page.getByLabel(/name/i)).toBeVisible();
  });

  test('should create a new organization', async ({ page }) => {
    const orgName = `E2E Org ${Date.now()}`;
    await page.getByRole('button', { name: /new organization/i }).click();
    await page.getByLabel(/name \*/i).fill(orgName);
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(orgName)).toBeVisible({ timeout: 5000 });
  });

  test('should show error when creating org with duplicate name', async ({ page }) => {
    // Try to create the same org twice
    const orgName = `Dup Org ${Date.now()}`;
    await page.getByRole('button', { name: /new organization/i }).click();
    await page.getByLabel(/name \*/i).fill(orgName);
    await page.getByRole('button', { name: /save/i }).click();
    await page.waitForTimeout(500);

    // Try again with same name
    await page.getByRole('button', { name: /new organization/i }).click();
    await page.getByLabel(/name \*/i).fill(orgName);
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/already exists|conflict/i)).toBeVisible({ timeout: 5000 });
  });
});
