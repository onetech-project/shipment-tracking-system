import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'

function filterToParams(filter: PnlFilter) {
  return filter.mode === 'cycle'
    ? { cycle: filter.cycle, basis: filter.basis }
    : { start: filter.start, end: filter.end, basis: filter.basis }
}

export interface SettlementSummary {
  label: string
  totalTos: number
  settledTos: number
  coveragePct: number
  estRevenue: number
  estRevenueSettled: number
  actRevenue: number
  varRevenue: number
  varRevenuePct: number | null
}

export interface SettlementToRow {
  toNumber: string
  ltNumber: string | null
  awb: string | null
  originStation: string | null
  destStation: string | null
  estRevenue: number | null
  actRevenue: number | null
  varRevenue: number | null
  varRevenuePct: number | null
  isSettled: boolean
}

export interface SheetSummary {
  sheet: string
  detected: boolean
  rowsParsed: number
  rowsError: number
}

export interface SettlementPreview {
  totalParsed: number
  matched: number
  unmatched: number
  errorRows: number
  duplicateRows: number
  sheetSummary: SheetSummary[]
  errors: { sheet: string; rowNumber: number; message: string }[]
  warnings: string[]
  unmatchedSample: { ltNumber: string; toNumber: string }[]
}

export interface SettlementCommitResult {
  totalParsed: number
  updated: number
  unmatched: number
  errorRows: number
}

export type SettledFilter = 'all' | 'settled' | 'unsettled'

export function useSettlementSummary(filter: PnlFilter | undefined) {
  return useQuery<SettlementSummary>({
    queryKey: ['pnl-settlement', 'summary', filter],
    queryFn: () =>
      apiClient.get('/pnl-settlement/summary', { params: filterToParams(filter!) }).then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function useToComparison(
  filter: PnlFilter | undefined,
  page: number,
  settled: SettledFilter,
  limit = 50,
) {
  return useQuery<{ data: SettlementToRow[]; total: number }>({
    queryKey: ['pnl-settlement', 'to-comparison', filter, page, settled, limit],
    queryFn: () =>
      apiClient
        .get('/pnl-settlement/to-comparison', {
          params: {
            ...filterToParams(filter!),
            page,
            limit,
            ...(settled === 'all' ? {} : { settled }),
          },
        })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function useSettlementPreview() {
  return useMutation<SettlementPreview, unknown, File>({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return apiClient
        .post('/pnl-settlement/preview', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data)
    },
  })
}

export function useSettlementCommit() {
  const qc = useQueryClient()
  return useMutation<SettlementCommitResult, unknown, File>({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return apiClient
        .post('/pnl-settlement/commit', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data)
    },
    onSuccess: () => {
      // Settling changes v_pnl_to, so both estimate and settlement views are stale.
      qc.invalidateQueries({ queryKey: ['pnl'] })
      qc.invalidateQueries({ queryKey: ['pnl-settlement'] })
    },
  })
}
