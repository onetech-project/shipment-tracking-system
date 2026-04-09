/**
 * Cell value type-coercion pipeline (FR-016–FR-021).
 *
 * Applies coercion rules in priority order:
 *  1. Spreadsheet error strings → null  (FR-016)
 *  2. Numeric strings → number          (FR-017)
 *  3. Boolean strings → boolean         (FR-018)
 *  4. Duration strings → integer secs   (FR-020)
 *  5. Date/datetime strings → Date      (FR-019)
 *  6. Fallback → plain string           (FR-021)
 */

const SPREADSHEET_ERRORS = new Set(['#REF!', '#VALUE!', '#N/A', '#NAME?', '#DIV/0!'])

/** Matches: "1 day, 4:00:00" or "2 days, 0:30:00" */
const DURATION_RE = /^(\d+)\s+days?,\s+(\d+):(\d+):(\d+)$/i

/** Matches dd-mmm-yyyy (e.g. 08-Apr-2026) */
const DMY_ALPHA_RE = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/

/** Matches dd/mm/yyyy hh:mm  */
const DMY_HMS_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

export interface CoercionContext {
  sheet: string
  row: number
  col: string
}

/**
 * Coerce a raw cell value string to the most appropriate JS type.
 * Logs a warning (to stderr) when an error-string value is encountered.
 */
export function coerceValue(value: string, context: CoercionContext): unknown {
  // 0. Empty / whitespace-only cells → null
  if (value.trim() === '') {
    return null
  }

  // 1. Spreadsheet error strings
  if (SPREADSHEET_ERRORS.has(value)) {
    // process.stderr.write(
    //   `[coercer] WARN spreadsheet error "${value}" in sheet "${context.sheet}" row ${context.row} col "${context.col}" — stored as null\n`,
    // );
    return null
  }

  // 2. Numeric strings (integer or decimal, optional leading minus)
  if (!isNaN(Number(value))) {
    return Number(value)
  }

  // 3. Boolean strings
  const lower = value.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false

  // 4. Duration strings: "N day(s), HH:MM:SS" → total seconds
  const durationMatch = DURATION_RE.exec(value)
  if (durationMatch) {
    const days = parseInt(durationMatch[1], 10)
    const hours = parseInt(durationMatch[2], 10)
    const minutes = parseInt(durationMatch[3], 10)
    const seconds = parseInt(durationMatch[4], 10)
    return days * 86400 + hours * 3600 + minutes * 60 + seconds
  }

  // 5a. dd-mmm-yyyy
  const dmyAlpha = DMY_ALPHA_RE.exec(value)
  if (dmyAlpha) {
    const day = parseInt(dmyAlpha[1], 10)
    const monthStr = dmyAlpha[2].toLowerCase()
    const year = parseInt(dmyAlpha[3], 10)
    const month = MONTH_MAP[monthStr]
    if (month !== undefined) {
      const d = new Date(Date.UTC(year, month, day))
      if (!isNaN(d.getTime())) return d
    }
  }

  // 5b. dd/mm/yyyy hh:mm
  const dmyHms = DMY_HMS_RE.exec(value)
  if (dmyHms) {
    const day = parseInt(dmyHms[1], 10)
    const month = parseInt(dmyHms[2], 10) - 1
    const year = parseInt(dmyHms[3], 10)
    const hour = parseInt(dmyHms[4], 10)
    const min = parseInt(dmyHms[5], 10)
    const d = new Date(Date.UTC(year, month, day, hour, min))
    if (!isNaN(d.getTime())) return d
  }

  // 5c. ISO 8601 date or datetime
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/.test(value)) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d
  }

  // 6. Fallback — plain string (FR-021)
  return value
}
