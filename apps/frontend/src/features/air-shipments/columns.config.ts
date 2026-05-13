/**
 * Ordered column keys per table, matching the DB entity definitions exactly.
 * Labels are auto-derived as uppercase words; override via COLUMN_LABELS if needed.
 */

export const DEFAULT_HIDDEN = ['id', 'last_synced_at', 'created_at', 'updated_at']

/** Convert snake_case key to a human-readable uppercase label. */
export function colLabel(key: string): string {
  return key.replace(/_/g, ' ').toUpperCase()
}

export const FROZEN_KEYS = [
  { key: 'date', width: 150 },
  { key: 'lt_number', width: 170 },
  { key: 'to_number', width: 170 },
  { key: 'awb', width: 130 },
  { key: 'is_locked', width: 110 },
]

/** Frozen columns for the SLA Monitoring page only — awb and is_locked are toggleable there. */
export const SLA_FROZEN_KEYS = [
  { key: 'date', width: 150 },
  { key: 'lt_number', width: 170 },
  { key: 'to_number', width: 170 },
]

/** Default-visible columns for the SLA Monitoring page. All others start hidden. */
export const SLA_DEFAULT_VISIBLE = new Set([
  'date',
  'lt_number',
  'to_number',
  'sla',
  'tjph',
  'issue',
  'remarks',
  'ata_flight',
  'atd_flight',
  'atd_origin',
  'remarks_sla',
  'ata_vendor_wh_destination',
])
