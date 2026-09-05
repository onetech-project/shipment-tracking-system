import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'
import { OffloadedAwbRow } from '@/features/air-shipments/types'
import { cycleDateRange, previousCycle } from '../utils/cycle'
import { AnalyticsDailySeries, AnalyticsGwChwRow, AnalyticsJourneyRow, SlaOverview } from '../types'

/** The table the SLA and offload endpoints are scoped to. Air CGK is the only P&L table today. */
const SLA_TABLE = 'air_shipments_compileaircgk'

export function analyticsFilterToParams(filter: PnlFilter) {
  return filter.mode === 'cycle'
    ? { cycle: filter.cycle, basis: filter.basis }
    : { start: filter.start, end: filter.end, basis: filter.basis }
}

/**
 * The SLA and offload endpoints take plain dates, not cycles, so a cycle is expanded to the
 * calendar days it spans.
 */
export function slaRangeForFilter(filter: PnlFilter): { startDate: string; endDate: string } {
  if (filter.mode === 'range') return { startDate: filter.start, endDate: filter.end }
  const { start, end } = cycleDateRange(filter.cycle)
  return { startDate: start, endDate: end }
}

export function useAnalyticsDailySeries(filter: PnlFilter | undefined) {
  return useQuery<AnalyticsDailySeries>({
    queryKey: ['pnl', 'analytics', 'daily-series', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/daily-series', { params: analyticsFilterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

/**
 * The comparison period. In cycle mode it is the previous half-cycle; in range mode it is the
 * equally long range immediately before the selected one, so a range near the period start still
 * has something to compare against.
 */
export function useAnalyticsPrevDailySeries(filter: PnlFilter | undefined) {
  const prev = filter ? previousFilter(filter) : undefined
  return useQuery<AnalyticsDailySeries>({
    queryKey: ['pnl', 'analytics', 'daily-series', prev],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/daily-series', { params: analyticsFilterToParams(prev!) })
        .then((r) => r.data),
    enabled: !!prev,
    staleTime: 60 * 1000,
  })
}

function previousFilter(filter: PnlFilter): PnlFilter {
  if (filter.mode === 'cycle') {
    return { mode: 'cycle', cycle: previousCycle(filter.cycle), basis: filter.basis }
  }
  const shift = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const span =
    Math.round(
      (Date.parse(`${filter.end}T00:00:00Z`) - Date.parse(`${filter.start}T00:00:00Z`)) / 86400000,
    ) + 1
  return {
    mode: 'range',
    start: shift(filter.start, -span),
    end: shift(filter.start, -1),
    basis: filter.basis,
  }
}

export function useAnalyticsJourney(filter: PnlFilter | undefined) {
  return useQuery<AnalyticsJourneyRow[]>({
    queryKey: ['pnl', 'analytics', 'journey', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/journey', { params: analyticsFilterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function useAnalyticsGwChw(filter: PnlFilter | undefined) {
  return useQuery<AnalyticsGwChwRow[]>({
    queryKey: ['pnl', 'analytics', 'gw-chw', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/gw-chw', { params: analyticsFilterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

/**
 * Guarded by read.sla, not read.pnl. `enabled` is the permission gate: a user without it sends no
 * request at all, so no 403 ever reaches them — the Operations section renders a note instead.
 */
export function useAnalyticsSla(filter: PnlFilter | undefined, enabled: boolean) {
  const range = filter ? slaRangeForFilter(filter) : undefined
  return useQuery<SlaOverview>({
    queryKey: ['pnl', 'analytics', 'sla', range],
    queryFn: () =>
      apiClient
        .get(`/air-shipments/${SLA_TABLE}/sla-overview`, { params: range })
        .then((r) => r.data),
    enabled: !!range && enabled,
    staleTime: 60 * 1000,
  })
}

export function useAnalyticsOffloaded(filter: PnlFilter | undefined, enabled: boolean) {
  const range = filter ? slaRangeForFilter(filter) : undefined
  return useQuery<{ data: OffloadedAwbRow[]; meta: { total: number } }>({
    queryKey: ['pnl', 'analytics', 'offloaded', range],
    queryFn: () =>
      apiClient
        .get(`/air-shipments/tracking-smu/offloaded`, {
          params: { page: 1, limit: 200, ...range },
        })
        .then((r) => r.data),
    enabled: !!range && enabled,
    staleTime: 60 * 1000,
  })
}
