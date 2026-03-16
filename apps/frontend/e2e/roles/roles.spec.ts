import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

test.describe('Roles management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/settings/roles');
  });

  test('should display roles list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^roles$/i })).toBeVisible();
  });

  test('should open create role modal', async ({ page }) => {
    await page.getByRole('button', { name: /new role/i }).click();
    await expect(page.getByRole('heading', { name: /new role/i })).toBeVisible();
    await expect(page.getByLabel(/role name/i)).toBeVisible();
  });

  test('should create a new role', async ({ page }) => {
    const roleName = `e2e-role-${Date.now()}`;
    await page.getByRole('button', { name: /new role/i }).click();
    await page.getByLabel(/role name/i).fill(roleName);
    await page.getByRole('button', { name: /create role/i }).click();
    await expect(page.getByText(roleName)).toBeVisible({ timeout: 5000 });
  });

  test('should open permissions panel for a role', async ({ page }) => {
    const permButton = page.getByRole('button', { name: /permissions/i }).first();
    await expect(permButton).toBeVisible();
    await permButton.click();
    await expect(page.getByRole('heading', { name: /edit role permissions/i })).toBeVisible();
  });
});
