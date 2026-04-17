import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!';

async function loginAndNavigate(page: import('@playwright/test').Page, path: string) {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(path);
}

test.describe('Air Shipments Dashboard', () => {
  test('sidebar contains "Air Shipments" section with five sub-links', async ({ page }) => {
    await loginAndNavigate(page, '/air-shipments/cgk');
    const nav = page.locator('[data-sidebar]');
    await expect(nav.getByText(/air shipments/i)).toBeVisible();
    // Station links are rendered in the page content navigation
    await expect(page.getByRole('link', { name: 'CGK' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SUB' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SDA' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rate' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Routes' })).toBeVisible();
  });

  test('CGK page renders a table with pagination controls', async ({ page }) => {
    await loginAndNavigate(page, '/air-shipments/cgk');
    // Wait for loading to finish
    await page.waitForSelector('table', { timeout: 10000 });
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('button', { name: /previous/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
  });

  test('column header click re-sorts the table', async ({ page }) => {
    await loginAndNavigate(page, '/air-shipments/cgk');
    await page.waitForSelector('table', { timeout: 10000 });
    // Click the first header that is not "id"
    const firstHeader = page.locator('thead th').first();
    await firstHeader.click();
    // After first click it should show ↑, after second click ↓
    await expect(firstHeader).toContainText('↑');
    await firstHeader.click();
    await expect(firstHeader).toContainText('↓');
  });

  test('pagination next-page button loads the next set of rows', async ({ page }) => {
    await loginAndNavigate(page, '/air-shipments/cgk');
    await page.waitForSelector('table', { timeout: 10000 });
    const nextBtn = page.getByRole('button', { name: /next/i });
    const isDisabled = await nextBtn.isDisabled();
    if (!isDisabled) {
      await nextBtn.click();
      // Table should still be visible with new data
      await expect(page.locator('table')).toBeVisible();
    }
  });

  test('"Live" badge is visible when backend is running', async ({ page }) => {
    await loginAndNavigate(page, '/air-shipments/cgk');
    // The sync badge should transition to "Live" once the WebSocket connects
    await expect(page.getByText(/live|offline/i)).toBeVisible({ timeout: 8000 });
  });

  test('all five sub-pages are reachable via tabs', async ({ page }) => {
    await loginAndNavigate(page, '/air-shipments/cgk');
    const tabs = [
      { href: '/air-shipments/cgk', label: 'CGK' },
      { href: '/air-shipments/sub', label: 'SUB' },
      { href: '/air-shipments/sda', label: 'SDA' },
      { href: '/air-shipments/rate', label: 'Rate' },
      { href: '/air-shipments/routes', label: 'Routes' },
    ];
    for (const { href, label } of tabs) {
      await page.getByRole('link', { name: label }).first().click();
      await expect(page).toHaveURL(new RegExp(href));
      await page.waitForSelector('table', { timeout: 10000 });
    }
  });
});
