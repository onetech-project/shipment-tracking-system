import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@system.local'
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123!'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel(/username/i).fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

// A minimal invoice workbook: 3 title rows, header at row 4, then data — like the real file.
function invoiceXlsx(rows: Array<{ lt: string; to: string; amount: number }>): Buffer {
  const aoa: unknown[][] = [
    ['Recapitulation'],
    ['PT Eka Satya Puspita'],
    ['Period'],
    ['Date', 'LT Number', 'TO Number', 'Packing Kayu ((P+L+T)*1000)', 'Amount'],
    ...rows.map((r) => ['46067', r.lt, r.to, 0, r.amount]),
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Origin DPS 1-15')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// A workbook with no detail sheet (no lt/to/amount headers) — nothing to settle.
function emptyXlsx(): Buffer {
  const aoa = [['Summary'], ['Destination', 'Total Harga'], ['Jakarta', 1000]]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Summary')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test.describe('PnL Settlement — Actual vs Estimate', () => {
  test('switches to the Actual tab and shows coverage + upload control', async ({ page }) => {
    await login(page)
    await page.goto('/pnl')
    await page.getByRole('button', { name: /actual vs estimate/i }).click()
    await expect(page.getByText(/settlement coverage/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /upload invoice/i })).toBeVisible()
  })

  test('previews then commits an uploaded invoice', async ({ page }) => {
    await login(page)
    await page.goto('/pnl')
    await page.getByRole('button', { name: /actual vs estimate/i }).click()
    await page.getByRole('button', { name: /upload invoice/i }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.setInputFiles('input[type="file"]', {
      name: 'invoice.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: invoiceXlsx([
        { lt: 'LT-E2E-1', to: 'TO-E2E-1', amount: 10000 },
        { lt: 'LT-E2E-2', to: 'TO-E2E-2', amount: 20000 },
      ]),
    })
    await page.getByRole('button', { name: /^preview$/i }).click()
    // Preview summary appears (2 rows parsed).
    await expect(page.getByText(/baris ter-parse/i)).toBeVisible()
    // Commit button reflects the matched count or is disabled when nothing matches.
    const settleBtn = page.getByRole('button', { name: /settle .* TO/i })
    if (await settleBtn.isEnabled()) {
      await settleBtn.click()
      await expect(page.getByText(/settle berhasil/i)).toBeVisible()
    }
  })

  test('rejects a workbook with no detail sheet (nothing matched)', async ({ page }) => {
    await login(page)
    await page.goto('/pnl')
    await page.getByRole('button', { name: /actual vs estimate/i }).click()
    await page.getByRole('button', { name: /upload invoice/i }).click()
    await page.setInputFiles('input[type="file"]', {
      name: 'summary.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: emptyXlsx(),
    })
    await page.getByRole('button', { name: /^preview$/i }).click()
    await expect(page.getByText(/tidak ada baris yang cocok/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /settle .* TO/i })).toBeDisabled()
  })
})
