import * as XLSX from 'xlsx'
import { AlertType } from './alert-evaluator'

/**
 * Pure helpers + workbook assembly for the SLA Monitoring Excel export.
 * Kept free of NestJS/DB dependencies so it can be unit-tested in isolation.
 */

/** One sheet's full layout: a title, an active-filter summary, headers, and rows. */
export interface SlaSheetSpec {
  /** Excel tab name (≤31 chars). */
  name: string
  /** Title printed on the first row. */
  title: string
  /** Active-filter summary — one [label, value] pair per row. */
  filterLines: Array<[string, string]>
  /** Column header row. */
  headers: string[]
  /** Data rows, aligned to `headers`. */
  rows: unknown[][]
}

/**
 * Alert key → label, matching the FRONTEND `ALERT_OPTIONS` (English) so the export
 * reads identically to the on-screen UI. Intentionally distinct from the backend's
 * `ALERT_TYPE_LABELS` (which uses Indonesian phrasing).
 */
export const SLA_ALERT_LABELS: Record<AlertType, string> = {
  reservasiPenerbangan: 'Flight Reservations',
  flightTracking: 'Flight Tracking',
  potensiMelebihiSla: 'Potential SLA Breach',
  melewatiSla: 'SLA Breach',
  potensiMelebihiTjph: 'Potential TJPH Breach',
  melewatiTjph: 'TJPH Breach',
  spxTjphAlert: 'SPX TJPH Alert',
  spxSlaAlert: 'SPX SLA Alert',
}

export const alertLabel = (key: string): string =>
  SLA_ALERT_LABELS[key as AlertType] ?? key

/** snake_case column key → human header, matching the frontend `colLabel`. */
export const colLabel = (key: string): string => key.replace(/_/g, ' ').toUpperCase()

/** Resolve a column value: own property first, then `extra_fields` (mirrors the table render + alert-evaluator). */
export function cellValue(row: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key]
  const extra = row.extra_fields
  if (extra && typeof extra === 'object') return (extra as Record<string, unknown>)[key]
  return undefined
}

/** Coerce any value into an Excel-friendly cell (keeps numbers/booleans, stringifies objects, null→''). */
export function toExportCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  return JSON.stringify(value)
}

/** Map per-TO active rows to the requested visible columns, in order. */
export function mapActiveRows(rows: Record<string, unknown>[], columns: string[]): unknown[][] {
  return rows.map((row) => columns.map((key) => toExportCell(cellValue(row, key))))
}

export const EXCLUDE_HEADERS = ['TO Number', 'LT Number', 'Alert Type', 'Evidence']

/**
 * Expand each excluded row into one line per excluded alert type (mirrors the
 * Excluded tab's UI). Applies the chip filter when `alertTypeFilter` is set.
 */
export function expandExcludedRows(
  rows: Record<string, unknown>[],
  alertTypeFilter?: string,
): unknown[][] {
  const out: unknown[][] = []
  for (const row of rows) {
    const reasons = row['excluded_reasons'] as Record<string, string> | null
    if (!reasons) continue
    for (const [alertType, reason] of Object.entries(reasons)) {
      if (alertTypeFilter && alertType !== alertTypeFilter) continue
      out.push([
        toExportCell(row['to_number']),
        toExportCell(row['lt_number']),
        alertLabel(alertType),
        toExportCell(reason),
      ])
    }
  }
  return out
}

// ── Flight Tracking (AWB) sheet ────────────────────────────────────────────────

/** AWB columns = OffloadedAwbTable headers minus the Actions column. */
export const AWB_HEADERS = [
  'AWB',
  'Source',
  'Airline',
  'STD Booking',
  'Actual (DEP)',
  'DEP2',
  'DEP3',
  'DEP4',
  'DEP5',
  'Remarks',
  'Evidence',
]

/** A flight value + its flight number, stacked like the on-screen Leg cell. */
function leg(value: unknown, flightNo: unknown): string {
  const v = value != null && String(value).trim() ? String(value).trim() : ''
  const fn = flightNo != null && String(flightNo).trim() ? String(flightNo).trim() : ''
  if (!v) return ''
  return fn ? `${v} (${fn})` : v
}

export function mapAwbRows(rows: Record<string, unknown>[]): unknown[][] {
  return rows.map((r) => [
    toExportCell(r.awb),
    String(r.source ?? '').toLowerCase() === 'api' ? 'API' : 'Sheet',
    toExportCell(r.airline),
    leg(r.std_booking, r.std_flight_no),
    leg(r.actual_flight_dep, r.dep_flight_no),
    leg(r.dep2, r.dep2_flight_no),
    leg(r.dep3, r.dep3_flight_no),
    leg(r.dep4, r.dep4_flight_no),
    leg(r.dep5, r.dep5_flight_no),
    toExportCell(r.remarks_offload),
    toExportCell(r.evidence),
  ])
}

// ── Workbook assembly ──────────────────────────────────────────────────────────

function sheetToAoa(spec: SlaSheetSpec): unknown[][] {
  const aoa: unknown[][] = [[spec.title]]
  for (const [label, value] of spec.filterLines) aoa.push([label, value])
  aoa.push([]) // blank spacer between the filter block and the table
  aoa.push(spec.headers)
  for (const row of spec.rows) aoa.push(row)
  return aoa
}

/** Build a 2-sheet `.xlsx` (Active Alert + Exclude) as a Buffer. */
export function buildSlaWorkbook(activeSheet: SlaSheetSpec, excludeSheet: SlaSheetSpec): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetToAoa(activeSheet)), activeSheet.name)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetToAoa(excludeSheet)), excludeSheet.name)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
