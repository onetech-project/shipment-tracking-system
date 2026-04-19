/**
 * Ordered column keys per table, matching the DB entity definitions exactly.
 * Labels are auto-derived as uppercase words; override via COLUMN_LABELS if needed.
 */

export const DEFAULT_HIDDEN = ['id', 'last_synced_at', 'created_at', 'updated_at']

/** Convert snake_case key to a human-readable uppercase label. */
export function colLabel(key: string): string {
  return key.replace(/_/g, ' ').toUpperCase()
}

// Always-visible (frozen) columns for CGK, SDA, SUB
export const FROZEN_KEYS = ['date', 'lt_number', 'to_number', 'awb', 'is_locked']
