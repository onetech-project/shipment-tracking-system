/**
 * Per-cell data quality counts, shared by the daily matrix and the group comparison so a yellow
 * cell means exactly the same thing in both. Pure: the SQL that produces these rows lives beside
 * the query it belongs to in pnl.service.ts.
 */

// One issue type and how many distinct AWBs carry it inside one cell.
export interface PnlCellIssue {
  issue: string
  awbs: number
}

// Severity order for the canonical v_pnl_to.issue values (root cause first). Shared by the
// per-AWB drilldown (which aggregates the most-severe issue across an AWB's TOs) and by the
// per-cell warnings. This order must match the CASE chain in the v_pnl_to definition.
export const ISSUE_RANK: Record<string, number> = {
  no_booking: 1,
  smu_rate_missing: 2,
  ra_rate_missing: 3,
  sgout_name_missing: 4,
  revenue_missing: 5,
  // A blank station breaks the SG Incoming join, so it ranks as the cause of the rate miss below it.
  station_mapping_missing: 6,
  sg_in_rate_missing: 7,
}

export const ISSUE_BY_RANK: Record<number, string> = Object.fromEntries(
  Object.entries(ISSUE_RANK).map(([k, v]) => [v, k]),
)

// An issue the view starts emitting before this map is updated must still be visible, so it sorts
// last rather than being dropped or silently ranked first.
export function issueRank(issue: string): number {
  return ISSUE_RANK[issue] ?? Number.MAX_SAFE_INTEGER
}

// Copies rather than sorts in place: callers pass arrays they got from a Map and reuse them.
export function sortIssues(issues: PnlCellIssue[]): PnlCellIssue[] {
  return [...issues].sort(
    (a, b) => issueRank(a.issue) - issueRank(b.issue) || a.issue.localeCompare(b.issue),
  )
}

// Buckets raw issue-count rows by a caller-chosen key. A null key means "this row is not mine" —
// the GROUPING SETS queries return body and footer rows together, and each caller takes one half.
export function indexIssueRows(
  rows: Record<string, unknown>[],
  keyOf: (row: Record<string, unknown>) => string | null,
): Map<string, PnlCellIssue[]> {
  const index = new Map<string, PnlCellIssue[]>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    const bucket = index.get(key)
    const entry = { issue: row.issue as string, awbs: Number(row.awbs) }
    if (bucket) bucket.push(entry)
    else index.set(key, [entry])
  }
  for (const [key, bucket] of index) index.set(key, sortIssues(bucket))
  return index
}
