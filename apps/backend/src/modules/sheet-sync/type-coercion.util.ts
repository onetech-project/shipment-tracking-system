/**
 * T009 (tests) - T013 (implementation)
 *
 * Coerces a raw string value from Google Sheets into a typed JavaScript value.
 *
 * Coercion order:
 *  1. Boolean  — case-insensitive "true" / "false"
 *  2. Integer  — string of only digits (optionally prefixed with -)
 *  3. Float    — string parseable as a finite floating-point number
 *  4. ISO 8601 date — starts with YYYY-MM-DD and yields a valid Date
 *  5. Fallback — return original string unchanged
 */

// Regex patterns compiled once for performance
const INTEGER_RE = /^-?\d+$/
const FLOAT_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/

export function coerceValue(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined || raw === '') return null

  const trimmed = raw.trim()

  // 1. Boolean
  const lower = trimmed.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false

  // 2. Integer
  if (INTEGER_RE.test(trimmed)) {
    const n = parseInt(trimmed, 10)
    if (!isNaN(n)) return n
  }

  // 3. Float
  if (FLOAT_RE.test(trimmed)) {
    const n = parseFloat(trimmed)
    if (isFinite(n)) return n
  }

  // 4. ISO 8601 date
  if (ISO_DATE_RE.test(trimmed)) {
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) return d
  }

  // 5. Fallback
  return trimmed
}
