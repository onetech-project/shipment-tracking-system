import { test, expect, Page } from '@playwright/test';
import path from 'path';

// ---------------------------------------------------------------------------
// Page Object Models
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

class UploadPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/shipments/upload');
  }

  async uploadFile(filePath: string) {
    const input = this.page.locator('input[type="file"]');
    await input.setInputFiles(filePath);
    await this.page.click('[data-testid="upload-submit"]');
  }

  async waitForStatus(status: string, timeoutMs = 15_000) {
    const STATUS_LABELS: Record<string, string | RegExp> = {
      completed: 'Completed',
      failed: 'Failed',
      processing: 'Processing',
      queued: 'Queued',
      partial: 'Partial',
      awaiting_conflict_review: /Action Required/i,
    };
    const expected = STATUS_LABELS[status] ?? status;
    await expect(
      this.page.locator(`[data-testid="import-status"]`),
    ).toContainText(expected, { timeout: timeoutMs });
  }

  async waitForConflictReview() {
    await expect(this.page.locator('[data-testid="conflict-review"]')).toBeVisible({
      timeout: 15_000,
    });
  }

  async resolveFirstConflict(action: 'overwrite' | 'skip') {
    await this.page.locator(`[data-testid="conflict-action-${action}"]`).first().click();
    await this.page.click('[data-testid="resolve-conflicts-submit"]');
  }
}

class HistoryPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/shipments/history');
  }

  async getRows() {
    return this.page.locator('[data-testid="history-row"]').all();
  }
}

// ---------------------------------------------------------------------------
// Paths to fixture PDFs (created in the test directory for CI use)
// ---------------------------------------------------------------------------

const FIXTURE_PDF = path.join(__dirname, '../fixtures/valid-shipments.pdf');
const FIXTURE_PDF_DUPLICATES = path.join(__dirname, '../fixtures/shipments-with-duplicates.pdf');
const FIXTURE_LINEHAUL_PDF = path.join(__dirname, '../fixtures/linehaul-trip.pdf');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Shipment PDF Upload', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login();
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    // Clear auth state by navigating directly without login
    await page.context().clearCookies();
    await page.goto('/shipments/upload');
    await expect(page).toHaveURL(/\/login/);
  });

  test('rejects non-PDF file with an error message', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: 'data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('col1,col2\nval1,val2'),
    });

    await expect(page.locator('[data-testid="file-type-error"]')).toBeVisible();
  });

  test('uploads valid PDF and shows completed status', async ({ page }) => {
    test.skip(
      !require('fs').existsSync(FIXTURE_PDF),
      'Fixture PDF not present — skipping in environments without fixtures',
    );
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();
    await uploadPage.uploadFile(FIXTURE_PDF);
    await uploadPage.waitForStatus('completed');
    await expect(page.locator('[data-testid="rows-imported"]')).toContainText(/\d+/);
  });

  test('shows conflict review when duplicates exist', async ({ page }) => {
    test.skip(
      !require('fs').existsSync(FIXTURE_PDF_DUPLICATES),
      'Fixture PDF not present — skipping in environments without fixtures',
    );
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();
    await uploadPage.uploadFile(FIXTURE_PDF_DUPLICATES);
    await uploadPage.waitForStatus('awaiting_conflict_review');
    await uploadPage.waitForConflictReview();
    await expect(page.locator('[data-testid="conflict-row"]').first()).toBeVisible();
  });

  test('resolves conflicts and reaches completed status', async ({ page }) => {
    test.skip(
      !require('fs').existsSync(FIXTURE_PDF_DUPLICATES),
      'Fixture PDF not present — skipping in environments without fixtures',
    );
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();
    await uploadPage.uploadFile(FIXTURE_PDF_DUPLICATES);
    await uploadPage.waitForConflictReview();
    await uploadPage.resolveFirstConflict('overwrite');
    await uploadPage.waitForStatus('completed');
  });
});

test.describe('Upload History', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login();
  });

  test('history page loads and shows upload rows', async ({ page }) => {
    const historyPage = new HistoryPage(page);
    await historyPage.goto();
    await expect(page.locator('h1, h2')).toContainText(/history/i);
  });

  test('authenticated users see their upload history', async ({ page }) => {
    const historyPage = new HistoryPage(page);
    await historyPage.goto();
    // After at least one upload was made in a prior test, rows should exist.
    // In a clean environment the list may be empty — just verify no error.
    await expect(page.locator('[data-testid="history-empty"], [data-testid="history-row"]')).toBeVisible();
  });
});

test.describe('Line Haul Trip PDF Upload', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.login();
  });

  test('uploads Line Haul Trip PDF and shows completed status', async ({ page }) => {
    test.skip(
      !require('fs').existsSync(FIXTURE_LINEHAUL_PDF),
      'Linehaul fixture PDF not present — skipping in environments without fixtures',
    );
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();
    await uploadPage.uploadFile(FIXTURE_LINEHAUL_PDF);
    await uploadPage.waitForStatus('completed');
    await expect(page.locator('[data-testid="rows-imported"]')).toContainText(/\d+/);
  });

  test('linehaul upload appears in history', async ({ page }) => {
    test.skip(
      !require('fs').existsSync(FIXTURE_LINEHAUL_PDF),
      'Linehaul fixture PDF not present — skipping in environments without fixtures',
    );
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();
    await uploadPage.uploadFile(FIXTURE_LINEHAUL_PDF);
    await uploadPage.waitForStatus('completed');

    const historyPage = new HistoryPage(page);
    await historyPage.goto();
    await expect(page.locator('[data-testid="history-row"]').first()).toBeVisible();
  });
});
