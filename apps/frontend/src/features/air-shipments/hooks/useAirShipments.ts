'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import {
  AirShipmentsResponse,
  AirShipmentRow,
  OffloadedAwbResponse,
  SlaColumnLayoutItem,
  SortOrder,
} from '../types'

// interface UseAirShipmentsOptions {
//   endpoint: string;
//   tableName: string;
//   affectedTables: string[];
// }

interface QueryState {
  page: number
  limit: number
  sortBy: string
  sortOrder: SortOrder
  search?: string
  alertFilter?: string
}

interface UseAirShipmentsResult {
  data: AirShipmentsResponse | null
  isLoading: boolean
  error: string | null
  query: QueryState
  setPage: (page: number) => void
  setSort: (sortBy: string, sortOrder: SortOrder) => void
  setSearch: (search: string) => void
  setAlertFilter: (alertFilter: string | null) => void
  refresh: () => void
}

export function useAirShipments(
  endpoint: string,
  tableName: string,
  affectedTables: string[],
  defaultSortBy = 'date'
): UseAirShipmentsResult {
  const [data, setData] = useState<AirShipmentsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<QueryState>({
    page: 1,
    limit: 50,
    sortBy: defaultSortBy,
    sortOrder: 'asc',
    search: '',
  })

  const fetchData = useCallback(
    async (q: QueryState) => {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          page: String(q.page),
          limit: String(q.limit),
          sortBy: q.sortBy,
          sortOrder: q.sortOrder,
        })
        if (q.search && q.search.trim()) {
          params.set('search', q.search.trim())
        }
        if (q.alertFilter && q.alertFilter.trim()) {
          params.set('alertFilter', q.alertFilter.trim())
        }
        const res = await apiClient.get<AirShipmentsResponse>(`${endpoint}?${params}`)
        setData(res.data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Fetch failed')
      } finally {
        setIsLoading(false)
      }
    },
    [endpoint]
  )

  // Fetch on mount and whenever query changes
  useEffect(() => {
    void fetchData(query)
  }, [fetchData, query])

  // Auto-refresh when this table was affected by a sync
  useEffect(() => {
    if (affectedTables.includes(tableName)) {
      void fetchData(query)
    }
  }, [affectedTables, tableName, fetchData, query])

  const setPage = useCallback((page: number) => setQuery((q) => ({ ...q, page })), [])
  const setSort = useCallback(
    (sortBy: string, sortOrder: SortOrder) =>
      setQuery((q) => ({ ...q, sortBy, sortOrder, page: 1 })),
    []
  )
  const setSearch = useCallback(
    (search: string) => setQuery((q) => ({ ...q, search, page: 1 })),
    []
  )

  const setAlertFilter = useCallback((alertFilter: string | null) => {
    setQuery((q) => ({
      ...q,
      alertFilter: alertFilter ?? undefined,
      page: 1,
    }))
  }, [])

  const refresh = useCallback(() => {
    void fetchData(query)
  }, [fetchData, query])

  return { data, isLoading, error, query, setPage, setSort, setSearch, setAlertFilter, refresh }
}

export async function lockAirShipmentRow(
  tableName: string,
  id: string,
  locked: boolean
): Promise<void> {
  await apiClient.patch(`/air-shipments/${tableName}/${id}/lock`, { locked })
}

export async function batchLockAirShipments(
  tableName: string,
  start: string,
  end: string,
  locked = true
): Promise<number> {
  const res = await apiClient.post(`/air-shipments/${tableName}/batch-lock`, {
    start,
    end,
    locked,
  })
  return res.data?.affected ?? 0
}

export async function batchDeleteAirShipments(
  tableName: string,
  start: string,
  end: string
): Promise<number> {
  const res = await apiClient.post(`/air-shipments/${tableName}/batch-delete`, {
    start,
    end,
  })
  return res.data?.deleted ?? 0
}

// Number of rows a batch lock/delete over [start, end] would affect — used to confirm before delete.
export async function batchCountAirShipments(
  tableName: string,
  start: string,
  end: string
): Promise<number> {
  const res = await apiClient.post(`/air-shipments/${tableName}/batch-count`, {
    start,
    end,
  })
  return res.data?.count ?? 0
}

export async function excludeRow(
  tableName: string,
  id: string,
  alertType: string,
  reason: string
): Promise<void> {
  await apiClient.patch(`/air-shipments/${tableName}/${id}/exclude`, {
    alertType,
    reason,
  })
}

export async function restoreRow(
  tableName: string,
  id: string,
  alertType: string
): Promise<void> {
  await apiClient.patch(`/air-shipments/${tableName}/${id}/restore`, {
    alertType,
  })
}

/** Excludes every row matching the given LT number(s) from a specific alert type. */
export async function excludeByLt(
  tableName: string,
  ltNumbers: string[],
  alertType: string,
  reason: string
): Promise<number> {
  const res = await apiClient.patch(`/air-shipments/${tableName}/exclude-by-lt`, {
    ltNumbers,
    alertType,
    reason,
  })
  return res.data?.affected ?? 0
}

/** Reverses an exclude-by-LT for the given LT number(s) on a specific alert type. */
export async function restoreByLt(
  tableName: string,
  ltNumbers: string[],
  alertType: string
): Promise<number> {
  const res = await apiClient.patch(`/air-shipments/${tableName}/restore-by-lt`, {
    ltNumbers,
    alertType,
  })
  return res.data?.affected ?? 0
}

interface ExcludedResponse {
  data: AirShipmentRow[]
  meta: {
    total: number
    page: number
    limit: number
  }
}

export async function fetchExcluded(
  tableName: string,
  params: {
    alertType?: string
    page?: number
    limit?: number
    startDate?: string
    endDate?: string
  }
): Promise<{ data: AirShipmentRow[]; meta: { total: number; page: number; limit: number } }> {
  const queryParams = new URLSearchParams()
  if (params.alertType) queryParams.set('alertType', params.alertType)
  if (params.page !== undefined) queryParams.set('page', String(params.page))
  if (params.limit !== undefined) queryParams.set('limit', String(params.limit))
  if (params.startDate) queryParams.set('startDate', params.startDate)
  if (params.endDate) queryParams.set('endDate', params.endDate)

  const res = await apiClient.get<ExcludedResponse>(
    `/air-shipments/${tableName}/excluded?${queryParams}`
  )
  return res.data
}

// ── Tracking_SMU offload alert (per-AWB) ────────────────────────────────────────

export async function fetchOffloadedAwbs(params: {
  page?: number
  limit?: number
  search?: string
  withEvidence?: boolean
  startDate?: string
  endDate?: string
}): Promise<OffloadedAwbResponse> {
  const queryParams = new URLSearchParams()
  if (params.page !== undefined) queryParams.set('page', String(params.page))
  if (params.limit !== undefined) queryParams.set('limit', String(params.limit))
  if (params.search && params.search.trim()) queryParams.set('search', params.search.trim())
  if (params.withEvidence) queryParams.set('withEvidence', 'true')
  if (params.startDate) queryParams.set('startDate', params.startDate)
  if (params.endDate) queryParams.set('endDate', params.endDate)

  const res = await apiClient.get<OffloadedAwbResponse>(
    `/air-shipments/tracking-smu/offloaded?${queryParams}`
  )
  return res.data
}

export async function setAwbEvidence(awb: string, evidence: string): Promise<void> {
  await apiClient.patch(`/air-shipments/tracking-smu/awb/${encodeURIComponent(awb)}/evidence`, {
    evidence,
  })
}

export async function clearAwbEvidence(awb: string): Promise<void> {
  await apiClient.delete(`/air-shipments/tracking-smu/awb/${encodeURIComponent(awb)}/evidence`)
}

// ── SLA table column layout (single app-wide config, DB-backed + audited) ────────

export async function fetchSlaColumnLayout(): Promise<SlaColumnLayoutItem[]> {
  const res = await apiClient.get<{ layout: SlaColumnLayoutItem[] }>(
    '/air-shipments/sla-column-layout'
  )
  return Array.isArray(res.data?.layout) ? res.data.layout : []
}

export async function saveSlaColumnLayout(layout: SlaColumnLayoutItem[]): Promise<void> {
  await apiClient.put('/air-shipments/sla-column-layout', { layout })
}
