// `xlsx-js-style` is the SheetJS fork that WRITES cell styles (fills/fonts) — the
// stock `xlsx` CE build silently drops them. API is otherwise identical.
import * as XLSX from 'xlsx-js-style'
import moment from 'moment'
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

// ── Uniform date/datetime formatting ───────────────────────────────────────────
// Standardize any recognizable date/datetime value to:
//   date     → DD-MMM-YYYY            (e.g. 16-Jun-2026)
//   datetime → DD-MMM-YYYY HH:mm:ss   (e.g. 16-Jun-2026 13:20:30)
// Parsing mirrors the frontend table's accepted formats (AirShipmentTable.formatCell).
// `parseZone` keeps the source wall-clock (no timezone shift on ISO "Z"/offset values).

const OUT_DATE = 'DD-MMM-YYYY'
const OUT_DATETIME = 'DD-MMM-YYYY HH:mm:ss'

/** Operating timezone (WIB / Asia-Jakarta, UTC+7) — used for the export's "Exported" stamp. */
const WIB_OFFSET_MINUTES = 7 * 60

/** The given (or current) instant, rendered in WIB as DD-MMM-YYYY HH:mm:ss. */
export function nowWibTimestamp(now: Date = new Date()): string {
  return moment(now).utcOffset(WIB_OFFSET_MINUTES).format(OUT_DATETIME)
}

const DATE_FORMATS = ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'D/M/YYYY', 'D-MMM-YYYY', 'DD-MMM-YYYY']
const DATETIME_FORMATS: moment.MomentFormatSpecification = [
  moment.ISO_8601,
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'DD/MM/YYYY HH:mm:ss',
  'DD/MM/YYYY HH:mm',
  'MM/DD/YYYY HH:mm:ss',
  'MM/DD/YYYY HH:mm',
  'D/M/YYYY HH:mm',
  'D-MMM-YYYY HH:mm:ss',
  'D-MMM-YYYY HH:mm',
  'DD-MMM-YYYY HH:mm:ss',
  'DD-MMM-YYYY HH:mm',
]

/** Reformat a recognized date/datetime string; leave any non-date string untouched. */
export function formatMaybeDate(value: string): string {
  const s = value.trim()
  if (!s) return value
  // A clock component (HH:mm) disambiguates datetime from date and avoids misreading
  // duration strings like "24:00:00" as a date.
  const hasTime = /\d{1,2}:\d{2}/.test(s)
  // ISO values carrying an explicit zone (Z or ±HH:MM) are parsed with parseZone so the
  // SOURCE wall-clock is preserved (no shift into the server's timezone). Everything else
  // is parsed in local time with the strict format list — no offset, so no shift either.
  // (parseZone is NOT used with the format array: that overload injects a spurious offset.)
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s)
  const parsed =
    hasTime && hasExplicitZone
      ? moment.parseZone(s, moment.ISO_8601, true)
      : moment(s, hasTime ? DATETIME_FORMATS : DATE_FORMATS, true)
  if (!parsed.isValid()) return value
  // A date-only value still carries a "00:00:00" clock (text or a Date at midnight) — drop
  // the time so pure dates render as DD-MMM-YYYY. Real clock times are kept.
  const isMidnight = parsed.hour() === 0 && parsed.minute() === 0 && parsed.second() === 0
  return parsed.format(hasTime && !isMidnight ? OUT_DATETIME : OUT_DATE)
}

/** Coerce any value into an Excel-friendly cell (formats dates, keeps numbers/booleans, null→''). */
export function toExportCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatMaybeDate(moment(value).format('YYYY-MM-DD HH:mm:ss'))
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return formatMaybeDate(value)
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
  const raw = value != null && String(value).trim() ? String(value).trim() : ''
  const v = raw ? formatMaybeDate(raw) : '' // datetimes get unified; time-only legs stay as-is
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

/** Light-green fill applied to every sheet's column-header row. */
export const HEADER_FILL_RGB = 'C6EFCE'

/** A fresh header-cell style. Built per cell so XLSX.write can't mutate a shared object. */
const headerStyle = () => ({
  fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL_RGB } },
  font: { bold: true, color: { rgb: '006100' } },
})

function sheetToAoa(spec: SlaSheetSpec): unknown[][] {
  const aoa: unknown[][] = [[spec.title]]
  for (const [label, value] of spec.filterLines) aoa.push([label, value])
  aoa.push([]) // blank spacer between the filter block and the table
  aoa.push(spec.headers)
  for (const row of spec.rows) aoa.push(row)
  return aoa
}

/** Zero-based index of the column-header row: title + filterLines + blank spacer. */
export const headerRowIndex = (spec: SlaSheetSpec): number => spec.filterLines.length + 2

/** Build a worksheet for one sheet spec, with the header row painted light green. */
export function makeSheet(spec: SlaSheetSpec): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(sheetToAoa(spec))
  const r = headerRowIndex(spec)
  for (let c = 0; c < spec.headers.length; c++) {
    const ref = XLSX.utils.encode_cell({ r, c })
    if (ws[ref]) ws[ref].s = headerStyle()
  }
  return ws
}

/** Build a 2-sheet `.xlsx` (Active Alert + Exclude) as a Buffer. */
export function buildSlaWorkbook(activeSheet: SlaSheetSpec, excludeSheet: SlaSheetSpec): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, makeSheet(activeSheet), activeSheet.name)
  XLSX.utils.book_append_sheet(wb, makeSheet(excludeSheet), excludeSheet.name)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
