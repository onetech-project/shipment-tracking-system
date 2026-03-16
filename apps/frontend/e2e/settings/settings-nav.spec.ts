import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

test.describe('Settings navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test('should show Settings section in navigation for super admin', async ({ page }) => {
    await expect(page.getByText(/settings/i)).toBeVisible();
  });

  test('should show Organizations link for super admin', async ({ page }) => {
    await expect(page.getByRole('link', { name: /organizations/i })).toBeVisible();
  });

  test('should show Roles link in navigation', async ({ page }) => {
    await expect(page.getByRole('link', { name: /roles/i })).toBeVisible();
  });

  test('should navigate to /settings/organizations', async ({ page }) => {
    await page.getByRole('link', { name: /organizations/i }).click();
    await expect(page).toHaveURL(/\/settings\/organizations/);
    await expect(page.getByRole('heading', { name: /organizations/i })).toBeVisible();
  });

  test('should navigate to /settings/roles', async ({ page }) => {
    await page.getByRole('link', { name: /roles/i }).click();
    await expect(page).toHaveURL(/\/settings\/roles/);
    await expect(page.getByRole('heading', { name: /roles/i })).toBeVisible();
  });

  test('should navigate to /settings/users', async ({ page }) => {
    await page.getByRole('link', { name: /users/i }).click();
    await expect(page).toHaveURL(/\/settings\/users/);
    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
  });

  test('should redirect /settings/forbidden for unauthenticated access attempt', async ({ page }) => {
    // Log out first
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.goto('/settings/organizations');
    await expect(page).toHaveURL(/\/login/);
  });
});
