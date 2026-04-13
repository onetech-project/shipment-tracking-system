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
}

interface UseAirShipmentsResult {
  data: AirShipmentsResponse | null
  isLoading: boolean
  error: string | null
  query: QueryState
  setPage: (page: number) => void
  setSort: (sortBy: string, sortOrder: SortOrder) => void
  setSearch: (search: string) => void
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

  return { data, isLoading, error, query, setPage, setSort, setSearch }
}

export async function lockAirShipmentRow(
  tableName: string,
  id: string,
  locked: boolean
): Promise<void> {
  await apiClient.patch(`/air-shipments/${tableName}/${id}/lock`, { locked })
}
