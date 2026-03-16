import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

test.describe('Users management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/settings/users');
  });

  test('should display users list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^users$/i })).toBeVisible();
  });

  test('should show Edit button for each user', async ({ page }) => {
    const editButton = page.getByRole('button', { name: /^edit$/i }).first();
    await expect(editButton).toBeVisible();
  });

  test('should open edit user modal', async ({ page }) => {
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
  });

  test('should not show inactivate for the current logged-in user', async ({ page }) => {
    // The current user row should not have an Inactivate button (self-protection)
    // We verify this by checking there's no "Inactivate" button next to "superadmin" row
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const username = await row.locator('td').first().textContent();
      if (username?.includes(SUPER_ADMIN_EMAIL)) {
        await expect(row.getByRole('button', { name: /inactivate/i })).not.toBeVisible();
        break;
      }
    }
  });
});
