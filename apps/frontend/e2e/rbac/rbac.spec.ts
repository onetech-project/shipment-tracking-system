import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

/**
 * RBAC Access Control E2E tests:
 * Validates that non-admin users cannot access admin-only areas.
 * These tests rely on seeded non-admin users or create them runtime.
 */
test.describe('RBAC access control', () => {
  test('super admin can access /settings/organizations', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/settings/organizations');
    await expect(page.getByRole('heading', { name: /organizations/i })).toBeVisible();
  });

  test('redirects to /settings/forbidden for non-admin user', async ({ page }) => {
    // Non-admin login (would need a seeded non-admin user in the E2E environment)
    // Skipped dynamically if non-admin user is not configured
    const nonAdminEmail = process.env.E2E_NON_ADMIN_EMAIL;
    const nonAdminPassword = process.env.E2E_NON_ADMIN_PASSWORD;
    if (!nonAdminEmail || !nonAdminPassword) {
      test.skip();
      return;
    }
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(nonAdminEmail);
    await page.getByLabel(/password/i).fill(nonAdminPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/settings/organizations');
    await expect(page).toHaveURL(/\/settings\/forbidden|\/dashboard/);
  });

  test('non-super-admin should not see Organizations link in navigation', async ({ page }) => {
    const nonAdminEmail = process.env.E2E_NON_ADMIN_EMAIL;
    const nonAdminPassword = process.env.E2E_NON_ADMIN_PASSWORD;
    if (!nonAdminEmail || !nonAdminPassword) {
      test.skip();
      return;
    }
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(nonAdminEmail);
    await page.getByLabel(/password/i).fill(nonAdminPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole('link', { name: /^organizations$/i })).not.toBeVisible();
  });
});
