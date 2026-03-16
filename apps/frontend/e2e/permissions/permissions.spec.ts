import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

test.describe('Permissions management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/settings/permissions');
  });

  test('should display permissions list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /permissions/i })).toBeVisible();
  });

  test('should show existing permissions', async ({ page }) => {
    // Permissions are seeded — at least one should appear
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 5000 });
  });

  test('should open create permission modal for super admin', async ({ page }) => {
    await page.getByRole('button', { name: /new permission/i }).click();
    await expect(page.getByRole('heading', { name: /new permission/i })).toBeVisible();
  });

  test('should filter permissions by name', async ({ page }) => {
    await page.getByPlaceholder(/filter by name/i).fill('read');
    const names = page.locator('tbody td code');
    const count = await names.count();
    for (let i = 0; i < count; i++) {
      const text = await names.nth(i).textContent();
      expect(text).toContain('read');
    }
  });
});
