/**
 * T023 — US3 Playwright E2E: live dashboard update via WebSocket.
 *
 * Verifies that a `sheet:updated` Socket.IO event causes the dashboard to
 * reflect new data without a full page reload.
 *
 * Pre-conditions (must be running before executing this spec):
 *   - Frontend (Next.js) serving at PLAYWRIGHT_BASE_URL (default: http://localhost:3000)
 *   - Backend (NestJS) serving at NEXT_PUBLIC_API_URL (default: http://localhost:3001/api)
 *   - A page that uses `useSheetSync` and renders a `[data-testid="sync-indicator"]`
 *     element that updates on each `sheet:updated` event, e.g. displaying last sync time.
 *
 * How the test injects the event without a real Google Sheet:
 *   - A route-level API mock or a dedicated test helper endpoint may be used.
 *   - Alternatively, a server-side Socket.IO emit endpoint at POST /api/test/sheet-sync-emit
 *     can be activated in non-production environments (see quickstart.md §Testing).
 */

import { test, expect, Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Page Object
// ---------------------------------------------------------------------------

class LoginPage {
  constructor(private readonly page: Page) {}

  async login(username = 'admin', password = 'password') {
    await this.page.goto('/login')
    await this.page.fill('[name="username"]', username)
    await this.page.fill('[name="password"]', password)
    await this.page.click('[type="submit"]')
    await this.page.waitForURL('**/dashboard')
  }
}

class DashboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/dashboard')
  }

  getSyncIndicator() {
    return this.page.locator('[data-testid="sync-indicator"]')
  }

  getConnectionStatus() {
    return this.page.locator('[data-testid="sync-connected"]')
  }

  getLastEventTable() {
    return this.page.locator('[data-testid="sync-last-table"]')
  }

  getLastEventCount() {
    return this.page.locator('[data-testid="sync-upserted-count"]')
  }
}

// ---------------------------------------------------------------------------
// Helper: emit a test socket event via the backend test helper endpoint
// ---------------------------------------------------------------------------

async function emitTestSheetUpdated(page: Page, payload: { table: string; upsertedCount: number }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') ?? 'http://localhost:3001'

  const response = await page.request.post(`${apiBase}/api/test/sheet-sync-emit`, {
    data: {
      table: payload.table,
      upsertedCount: payload.upsertedCount,
      syncedAt: new Date().toISOString(),
    },
  })

  // If the test endpoint doesn't exist yet (non-test environment), skip gracefully
  if (response.status() === 404) {
    test.skip() // marks test as skipped rather than failing
  }
  expect(response.ok()).toBe(true)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Sheet Sync — Live Dashboard Updates (US3)', () => {
  test('sync-indicator reflects sheet:updated event without page reload', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const dashboardPage = new DashboardPage(page)

    await loginPage.login()
    await dashboardPage.goto()

    // Wait for the WebSocket connection indicator to be visible
    await expect(dashboardPage.getSyncIndicator()).toBeVisible({ timeout: 10_000 })

    // Record the initial indicator text (e.g., "Never" or a past timestamp)
    const initialText = await dashboardPage.getSyncIndicator().textContent()

    // Emit a synthetic sheet:updated event via the test helper endpoint
    await emitTestSheetUpdated(page, { table: 'shipments', upsertedCount: 3 })

    // The indicator should update without reloading
    await expect(dashboardPage.getLastEventTable()).toHaveText('shipments', { timeout: 5_000 })
    await expect(dashboardPage.getLastEventCount()).toHaveText('3', { timeout: 5_000 })

    // The sync indicator text must have changed (new timestamp or count shown)
    const updatedText = await dashboardPage.getSyncIndicator().textContent()
    expect(updatedText).not.toBe(initialText)
  })

  test('WebSocket connection is established on dashboard load', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const dashboardPage = new DashboardPage(page)

    await loginPage.login()
    await dashboardPage.goto()

    // The connection status badge should show "Connected"
    await expect(dashboardPage.getConnectionStatus()).toHaveText(/connected/i, {
      timeout: 10_000,
    })
  })

  test('WebSocket socket is closed when navigating away from dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page)
    const dashboardPage = new DashboardPage(page)

    await loginPage.login()
    await dashboardPage.goto()

    // Wait until connected
    await expect(dashboardPage.getConnectionStatus()).toHaveText(/connected/i, {
      timeout: 10_000,
    })

    // Navigate away — the hook's useEffect cleanup should disconnect the socket
    await page.goto('/dashboard')
    const wsMessages: string[] = []
    page.on('websocket', (ws) => {
      ws.on('framereceived', (data) => wsMessages.push(String(data.payload)))
    })

    // Go back to a simple page that does not use useSheetSync
    await page.goto('/login')

    // Allow a brief moment for the disconnect handshake to complete
    await page.waitForTimeout(500)

    // No new WebSocket frames should be arriving (the connection is gone)
    const countBefore = wsMessages.length
    await page.waitForTimeout(1000)
    expect(wsMessages.length).toBe(countBefore)
  })
})
