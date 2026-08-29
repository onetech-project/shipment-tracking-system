// Human labels for the canonical v_pnl_to.issue values (root cause of a missing cost / margin).
// Most of these are fixed by correcting the SOURCE Google Sheets, then re-syncing.
// station_mapping_missing is the exception: it is fixed by adding the DC pair to the
// air_shipments_data master table, not by editing a sheet.
export const ISSUE_LABELS: Record<string, string> = {
  // Since the route-level cost fallback, a missing booking alone no longer blocks costing — this
  // fires only when the route ALSO has no DC pair in air_shipments_data to fall back on.
  no_booking: 'No booking and no route fallback (DC pair missing in air_shipments_data)',
  smu_rate_missing: 'SMU rate missing for route',
  ra_rate_missing: 'RA rate not found',
  sgout_name_missing: 'SG Outgoing name not matched',
  revenue_missing: 'Revenue missing',
  sg_in_rate_missing: 'SG Incoming rate missing',
  station_mapping_missing: 'Station mapping missing (DC pair not in air_shipments_data)',
  // legacy values (pre-component view) — kept so older payloads still render
  smu_lookup_failed: 'SMU rate not found',
  ra_lookup_failed: 'RA rate not found',
  sg_lookup_failed: 'SG Outgoing rate not found',
  sg_in_lookup_failed: 'SG Incoming rate not found',
  all_cost_lookup_failed: 'All cost lookups failed',
  unknown: 'Unknown cost issue',
}

export function issueLabel(issue: string | null | undefined): string {
  if (!issue) return '—'
  return ISSUE_LABELS[issue] ?? issue
}

// Severity order, root cause first — the same order the backend applies when it collapses an AWB's
// TOs down to one issue. Mirrored here rather than fetched so a tooltip can sort without a request.
export const ISSUE_RANK: Record<string, number> = {
  no_booking: 1,
  smu_rate_missing: 2,
  ra_rate_missing: 3,
  sgout_name_missing: 4,
  revenue_missing: 5,
  station_mapping_missing: 6,
  sg_in_rate_missing: 7,
}

// An issue the view starts emitting before this map is updated sorts last rather than disappearing.
export function issueRank(issue: string): number {
  return ISSUE_RANK[issue] ?? Number.MAX_SAFE_INTEGER
}
