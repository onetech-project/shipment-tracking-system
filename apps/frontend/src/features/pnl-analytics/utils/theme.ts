/**
 * Colour is a claim. A red bar on this tab must mean the same thing it means on the Daily Report's
 * margin chart, so the scale is copied from `PnlDailyMarginChart.tsx` rather than reinvented.
 */

import { CHART_COLORS, CHART_STATUS } from '@/lib/chart-colors'

export const MARGIN_GREY = CHART_STATUS.neutral

export function colorForMargin(marginPct: number | null, incomplete = false): string {
  if (incomplete) return CHART_STATUS.neutral
  if (marginPct == null) return CHART_STATUS.neutral
  if (marginPct < 0) return CHART_STATUS.bad
  if (marginPct < 10) return CHART_STATUS.warn
  return CHART_STATUS.good
}

/** Categorical series (airlines, vendors, weekdays) where no value judgement is implied. */
export const SERIES_COLORS: readonly string[] = CHART_COLORS

/**
 * Fixed per cost component so a stack keeps its colours across periods. Keyed by the `key` field
 * of `COST_COMPONENTS` ('smu' | 'ra' | 'sgOut' | 'sgIn'), NOT by the SeriesDay field name.
 * Picked from CHART_COLORS avoiding the indices `colorForMargin` uses for its value judgements
 * (good/warn/bad/neutral), so a cost-component swatch never reads as a margin signal.
 */
export const COMPONENT_COLORS: Record<string, string> = {
  smu: CHART_COLORS[1],
  ra: CHART_COLORS[2],
  sgOut: CHART_COLORS[3],
  sgIn: CHART_COLORS[5],
}

export function formatDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
  })
}
