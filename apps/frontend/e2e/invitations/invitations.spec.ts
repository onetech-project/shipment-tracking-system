import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

test.describe('Invitations management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto('/settings/invitations');
  });

  test('should display invitations list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /invitations/i })).toBeVisible();
  });

  test('should open send invitation modal', async ({ page }) => {
    await page.getByRole('button', { name: /send invitation/i }).click();
    await expect(page.getByRole('heading', { name: /send invitation/i })).toBeVisible();
    await expect(page.getByLabel(/email \*/i)).toBeVisible();
    await expect(page.getByLabel(/full name \*/i)).toBeVisible();
  });

  test('should send invitation to a new email', async ({ page }) => {
    const email = `e2einvite-${Date.now()}@example.com`;
    await page.getByRole('button', { name: /send invitation/i }).click();
    await page.getByLabel(/email \*/i).fill(email);
    await page.getByLabel(/full name \*/i).fill('E2E Test User');
    await page.getByRole('button', { name: /send invitation/i }).last().click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 5000 });
  });

  test('should allow filtering invitations by status', async ({ page }) => {
    await page.selectOption('select', 'pending');
    await page.waitForTimeout(500);
    // All visible status badges (if any) should say "pending"
    const statuses = page.locator('tbody span').filter({ hasText: /^(accepted|expired|revoked)$/ });
    await expect(statuses).toHaveCount(0);
  });
});
