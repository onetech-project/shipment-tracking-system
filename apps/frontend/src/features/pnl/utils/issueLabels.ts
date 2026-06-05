// Human labels for the canonical v_pnl_to.issue values (root cause of a missing cost / margin).
// All of these are fixed by correcting the SOURCE Google Sheets, then re-syncing.
export const ISSUE_LABELS: Record<string, string> = {
  no_booking: 'No booking row (AWB missing in SMU rate sheet)',
  smu_rate_missing: 'SMU rate missing for route',
  ra_rate_missing: 'RA rate not found',
  sgout_name_missing: 'SG Outgoing name not matched',
  revenue_missing: 'Revenue missing',
  sg_in_rate_missing: 'SG Incoming rate missing',
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
