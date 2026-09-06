/**
 * Colour is a claim. A red bar on this tab must mean the same thing it means on the Daily Report's
 * margin chart, so the scale is copied from `PnlDailyMarginChart.tsx` rather than reinvented.
 */

export const MARGIN_GREY = '#94A3B8'

export function colorForMargin(marginPct: number | null, incomplete = false): string {
  if (incomplete) return MARGIN_GREY
  if (marginPct == null) return MARGIN_GREY
  if (marginPct < 0) return '#EF4444'
  if (marginPct < 10) return '#F59E0B'
  return '#22C55E'
}

/** Categorical series (airlines, vendors, weekdays) where no value judgement is implied. */
export const SERIES_COLORS = [
  '#2563EB',
  '#0EA5E9',
  '#14B8A6',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#64748B',
]

/**
 * Fixed per cost component so a stack keeps its colours across periods. Keyed by the `key` field
 * of `COST_COMPONENTS` ('smu' | 'ra' | 'sgOut' | 'sgIn'), NOT by the SeriesDay field name.
 */
export const COMPONENT_COLORS: Record<string, string> = {
  smu: '#2563EB',
  ra: '#14B8A6',
  sgOut: '#F59E0B',
  sgIn: '#8B5CF6',
}

export function formatDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
  })
}
