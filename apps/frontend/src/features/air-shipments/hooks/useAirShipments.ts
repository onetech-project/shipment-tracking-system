'use client'
import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { AirShipmentsResponse, SortOrder } from '../types'

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
