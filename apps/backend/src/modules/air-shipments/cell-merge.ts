/**
 * Merge a cell's FORMATTED and UNFORMATTED Google Sheets renderings.
 *
 * `FORMATTED_VALUE` honours each cell's display format, which silently truncates precision
 * on number-formatted columns — e.g. an "Other Charges" cell holding 2838.27 but formatted
 * with 0 decimals renders as "2,838", so the lost .27 drifts every downstream cost
 * (observed comparing AWB SMU cost vs. the source workbook).
 *
 * `UNFORMATTED_VALUE` keeps full numeric precision but renders percent-formatted cells as
 * their underlying fraction (0.011 instead of "1.1%"), which the rate pipeline does NOT
 * expect — it relies on the formatted "11%" → 11 conversion (see coercer percentage rule
 * and the *_pct generated columns that divide by 100).
 *
 * Resolution per cell:
 *  - formatted carries a "%"  → keep the formatted string (preserve percent semantics)
 *  - unformatted is a number  → use it (recovers precision the display format dropped)
 *  - otherwise                → keep the formatted rendering (dates as FORMATTED_STRING,
 *                               booleans, text, error strings, blanks)
 */
export function mergeRenderedCell(formatted: unknown, unformatted: unknown): unknown {
  if (typeof formatted === 'string' && formatted.includes('%')) return formatted
  if (typeof unformatted === 'number') return unformatted
  return formatted ?? unformatted ?? ''
}

/**
 * Cell-wise merge of two parallel range value grids (formatted + unformatted) returned by
 * `spreadsheets.values.batchGet`. Grids may be ragged (Sheets trims trailing empties per
 * row, independently per render option), so dimensions are taken as the per-axis max.
 */
export function mergeRangeValues(
  formatted: unknown[][],
  unformatted: unknown[][]
): unknown[][] {
  const rowCount = Math.max(formatted.length, unformatted.length)
  const merged: unknown[][] = []
  for (let r = 0; r < rowCount; r++) {
    const fRow = formatted[r] ?? []
    const uRow = unformatted[r] ?? []
    const colCount = Math.max(fRow.length, uRow.length)
    const row: unknown[] = []
    for (let c = 0; c < colCount; c++) {
      row.push(mergeRenderedCell(fRow[c], uRow[c]))
    }
    merged.push(row)
  }
  return merged
}
