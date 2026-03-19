import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Page Object Model
// ---------------------------------------------------------------------------

class LoginPage {
  constructor(private readonly page: Page) {}

  async login(username = 'admin', password = 'password') {
    await this.page.goto('/login');
    await this.page.fill('[name="username"]', username);
    await this.page.fill('[name="password"]', password);
    await this.page.click('[type="submit"]');
    await this.page.waitForURL('**/dashboard');
  }
}

class ScanPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/shipments/scan');
  }

  async clickStart() {
    await this.page.click('[data-testid="start-scanner"]');
  }

  async getStatusText() {
    return this.page.locator('[data-testid="scanner-status"]').textContent();
  }

  async getShipmentDetail() {
    return this.page.locator('[data-testid="shipment-detail"]');
  }

  async getNotFoundMessage() {
    return this.page.locator('[data-testid="shipment-not-found"]');
  }

  async getPermissionDeniedMessage() {
    return this.page.locator('[data-testid="permission-denied"]');
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('QR Code Scanner', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login();
  });

  test('scan page renders Start Scanner button before permission', async ({ page }) => {
    const scanPage = new ScanPage(page);
    await scanPage.goto();
    await expect(page.locator('[data-testid="start-scanner"]')).toBeVisible();
    // Video feed should NOT be visible before permission is granted
    await expect(page.locator('video')).not.toBeVisible();
  });

  test('shows camera feed after permission is granted', async ({ page, context }) => {
    // Grant camera permission in test context
    await context.grantPermissions(['camera']);
    const scanPage = new ScanPage(page);
    await scanPage.goto();
    await scanPage.clickStart();
    // After granting permission, video element should appear
    await expect(page.locator('video')).toBeVisible({ timeout: 5000 });
  });

  test('shows permission denied message when camera is denied', async ({ page }) => {
    // Deny camera — do NOT grant permissions (default is denied in Playwright)
    const scanPage = new ScanPage(page);
    await scanPage.goto();
    await scanPage.clickStart();
    await expect(page.locator('[data-testid="permission-denied"]')).toBeVisible({ timeout: 5000 });
  });

  test('shows shipment detail after successful QR decode (mocked)', async ({ page, context }) => {
    // This test uses page.evaluate to simulate a successful scan result
    // by triggering the onScanResult callback directly, bypassing camera hardware
    await context.grantPermissions(['camera']);
    const scanPage = new ScanPage(page);
    await scanPage.goto();

    // Linehaul lookup returns 404 → falls back to shipment lookup
    await page.route('**/api/shipments/linehaul/items/SHP-001', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'TRIP_ITEM_NOT_FOUND' }) }),
    );

    // Intercept the shipment API lookup to return a canned response
    await page.route('**/api/shipments/SHP-001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'f0000000-0000-4000-8000-000000000001',
          shipmentId: 'SHP-001',
          origin: 'Jakarta',
          destination: 'Bandung',
          status: 'in_transit',
          carrier: 'JNE Express',
          estimatedDeliveryDate: null,
          contentsDescription: null,
        }),
      }),
    );

    // Trigger the shipment lookup via the hook's exposed setter (simulated via storage event)
    // In the real component, the QR result triggers lookupShipment('SHP-001').
    // We expose the shipment detail view by setting __mockScanResult in window.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('__mock_qr_scan', { detail: 'SHP-001' }));
    });

    await expect(scanPage.getShipmentDetail()).toBeVisible({ timeout: 5000 });
  });

  test('shows not-found message for unknown shipment ID', async ({ page }) => {
    await page.route('**/api/shipments/linehaul/items/SHP-UNKNOWN', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'TRIP_ITEM_NOT_FOUND' }) }),
    );
    await page.route('**/api/shipments/SHP-UNKNOWN', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'SHIPMENT_NOT_FOUND' }) }),
    );
    await page.goto('/shipments/scan');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('__mock_qr_scan', { detail: 'SHP-UNKNOWN' }));
    });

    await expect(page.locator('[data-testid="shipment-not-found"]')).toBeVisible({ timeout: 5000 });
  });

  test('shows unrecognised message for invalid format QR', async ({ page }) => {
    await page.goto('/shipments/scan');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('__mock_qr_scan', { detail: '!! not a shipment id !!' }));
    });

    await expect(page.locator('[data-testid="invalid-qr-format"]')).toBeVisible({ timeout: 5000 });
  });

  test('scan page requires authentication', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/shipments/scan');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows linehaul detail when QR code matches a to_number', async ({ page }) => {
    await page.route('**/api/shipments/linehaul/items/TO-2026031900001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          item: {
            id: 'a1b2c3d4-0000-4000-8000-000000000001',
            toNumber: 'TO-2026031900001',
            weight: 12.5,
            destination: 'Bandung',
            dgType: 'non-dg',
            toType: 'REGULAR',
          },
          trip: {
            id: 'e5f6g7h8-0000-4000-8000-000000000001',
            tripCode: 'LT2026031901',
            schedule: 'SCH-001',
            origin: 'Jakarta',
            destination: 'Bandung',
            vendor: 'PT Vendor Logistics',
            plateNumber: 'B1234XYZ',
            driverName: 'Ahmad Bayu',
            std: '2026-03-19T08:00:00.000Z',
            sta: '2026-03-19T14:00:00.000Z',
            ata: null,
            totalWeight: 1250.0,
          },
        }),
      }),
    );

    await page.goto('/shipments/scan');
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('__mock_qr_scan', { detail: 'TO-2026031900001' }));
    });

    await expect(page.locator('[data-testid="linehaul-detail"]')).toBeVisible({ timeout: 5000 });
  });

  test('falls back to shipment lookup when linehaul returns 404', async ({ page }) => {
    await page.route('**/api/shipments/linehaul/items/SHP-001', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'TRIP_ITEM_NOT_FOUND' }) }),
    );
    await page.route('**/api/shipments/SHP-001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'f0000000-0000-4000-8000-000000000001',
          shipmentId: 'SHP-001',
          origin: 'Jakarta',
          destination: 'Bandung',
          status: 'pending',
          carrier: null,
          estimatedDeliveryDate: null,
          contentsDescription: null,
        }),
      }),
    );

    await page.goto('/shipments/scan');
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('__mock_qr_scan', { detail: 'SHP-001' }));
    });

    await expect(page.locator('[data-testid="shipment-detail"]')).toBeVisible({ timeout: 5000 });
  });
});
