/**
 * Invoice-settlement workbook parser.
 *
 * Parses a raw multi-sheet invoice workbook (e.g. "INV.835.C05.SPX-AIR ALL...xlsx") into per-TO
 * actual-revenue rows keyed by (lt_number, to_number). The workbook has one detail sheet per
 * origin/destination plus non-detail sheets (Invoice, Summary*, Rate, Deduction). Column positions
 * and the packing-kayu header suffix vary between sheets, so detection and column mapping are done
 * by normalized header NAME, not position. Header normalization is shared with the Google-Sheets
 * sync pipeline (normalizeHeader).
 *
 * A sheet is treated as a detail sheet only if it has headers normalizing to lt_number, to_number
 * AND amount — which excludes Deduction (amount_claim) and Summary (no lt/to).
 *
 * actual_revenue per TO = amount (freight) + packing_kayu, matching the estimate's revenue_total.
 */
import { normalizeHeader } from '../air-shipments/normalizer'
import * as XLSX from 'xlsx'

export interface ParsedSettlementRow {
  ltNumber: string
  toNumber: string
  actualRevenue: number
  sheet: string
  rowNumber: number
}

export interface SheetSummary {
  sheet: string
  detected: boolean
  rowsParsed: number
  rowsError: number
}

export interface ParseError {
  sheet: string
  rowNumber: number
  message: string
}

export interface ParseResult {
  rows: ParsedSettlementRow[]
  sheetSummary: SheetSummary[]
  errors: ParseError[]
  warnings: string[]
  duplicateCount: number
}

const HEADER_SCAN_ROWS = 15

function asKey(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** Parse a cell that should be numeric. Accepts JS numbers and comma/percent-formatted strings. */
function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(/[, ]/g, '').replace(/%$/, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

interface ColMap {
  lt: number
  to: number
  amount: number
  packing: number | null
}

/** Locate the header row (within the first HEADER_SCAN_ROWS) and map the key columns by name. */
function findHeader(aoa: unknown[][]): { headerIdx: number; cols: ColMap } | null {
  const scan = Math.min(aoa.length, HEADER_SCAN_ROWS)
  for (let i = 0; i < scan; i++) {
    const row = aoa[i] ?? []
    let lt = -1
    let to = -1
    let amount = -1
    let packing = -1
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (cell === null || cell === undefined) continue
      const norm = normalizeHeader(String(cell))
      if (norm === 'lt_number') lt = c
      else if (norm === 'to_number') to = c
      else if (norm === 'amount') amount = c
      else if (packing === -1 && norm.startsWith('packing_kayu')) packing = c
    }
    if (lt >= 0 && to >= 0 && amount >= 0) {
      return { headerIdx: i, cols: { lt, to, amount, packing: packing >= 0 ? packing : null } }
    }
  }
  return null
}

export function parseSettlementWorkbook(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetSummary: SheetSummary[] = []
  const errors: ParseError[] = []
  // (lt|to) -> row. Last wins; we count overwrites as duplicates.
  const byKey = new Map<string, ParsedSettlementRow>()
  let duplicateCount = 0

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    })
    const found = findHeader(aoa)
    if (!found) {
      sheetSummary.push({ sheet: sheetName, detected: false, rowsParsed: 0, rowsError: 0 })
      continue
    }
    const { headerIdx, cols } = found
    let rowsParsed = 0
    let rowsError = 0
    for (let i = headerIdx + 1; i < aoa.length; i++) {
      const row = aoa[i] ?? []
      const lt = asKey(row[cols.lt])
      const to = asKey(row[cols.to])
      if (!lt || !to) continue // subtotal/blank rows have no key
      // Some sheets repeat the header block mid-data — skip those rather than flag them as errors.
      if (normalizeHeader(to) === 'to_number') continue
      const rowNumber = i + 1
      const amount = asNumber(row[cols.amount])
      if (amount === null) {
        errors.push({ sheet: sheetName, rowNumber, message: `Amount kosong/invalid untuk ${lt}/${to}` })
        rowsError++
        continue
      }
      const packing = cols.packing !== null ? asNumber(row[cols.packing]) ?? 0 : 0
      const parsed: ParsedSettlementRow = {
        ltNumber: lt,
        toNumber: to,
        actualRevenue: amount + packing,
        sheet: sheetName,
        rowNumber,
      }
      const key = `${lt}|${to}`
      if (byKey.has(key)) duplicateCount++
      byKey.set(key, parsed)
      rowsParsed++
    }
    sheetSummary.push({ sheet: sheetName, detected: true, rowsParsed, rowsError })
  }

  const warnings: string[] = []
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} baris duplikat (lt+to) — nilai terakhir yang dipakai.`)
  }

  return { rows: [...byKey.values()], sheetSummary, errors, warnings, duplicateCount }
}
