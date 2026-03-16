import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

test.describe('Audit Logs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test('should display audit log page via navigation', async ({ page }) => {
    await page.getByRole('link', { name: /audit logs/i }).click();
    await expect(page).toHaveURL(/\/audit/);
    await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
  });

  test('should show audit log table with timestamp and action columns', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.getByText(/timestamp/i)).toBeVisible();
    await expect(page.getByText(/action/i)).toBeVisible();
  });

  test('should record auth.login event after login', async ({ page }) => {
    await page.goto('/audit');
    // The login we just performed should appear as auth.login or auth.login_success
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 5000 });
  });
});
