'use client'

import { useEffect, useState } from 'react'
import { useBarhalToDetail } from '../hooks/useBarhalDashboard'
import { BarhalToDetailTab } from '../types'

const TABS: { key: BarhalToDetailTab; label: string }[] = [
  { key: 'in-koli', label: 'TO dalam koli' },
  { key: 'not-in-koli', label: 'TO belum masuk koli' },
]

const PAGE_SIZE = 25
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

interface BarhalToDetailTableProps {
  startDate: string
  endDate: string
  origin: string
  dest: string
}

export function BarhalToDetailTable({ startDate, endDate, origin, dest }: BarhalToDetailTableProps) {
  const [tab, setTab] = useState<BarhalToDetailTab>('in-koli')
  const [page, setPage] = useState(1)

  // Filters live on the dashboard page, so a filter change can strand the user on a page
  // number that no longer exists in the new result set.
  useEffect(() => {
    setPage(1)
  }, [tab, startDate, endDate, origin, dest])

  const { data, isLoading, isError, refetch } = useBarhalToDetail({
    tab,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const inKoli = tab === 'in-koli'
  const colSpan = inKoli ? 6 : 5
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-2">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Tanggal</th>
              <th className="px-3 py-2 font-medium">Origin</th>
              <th className="px-3 py-2 font-medium">Destinasi</th>
              <th className="px-3 py-2 font-medium">No. TO</th>
              {inKoli && <th className="px-3 py-2 font-medium">No. Koli</th>}
              <th className="px-3 py-2 font-medium">Gross Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isError ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
                  Failed to load.{' '}
                  <button type="button" onClick={() => refetch()} className="text-primary underline">
                    Retry
                  </button>
                </td>
              </tr>
            ) : isLoading ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : (data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
                  No data for this range.
                </td>
              </tr>
            ) : (
              data!.data.map((row) => (
                <tr key={row.toNumber} className="hover:bg-accent/30">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.originName}</td>
                  <td className="px-3 py-2">{row.destName}</td>
                  <td className="px-3 py-2">{row.toNumber}</td>
                  {inKoli && <td className="px-3 py-2">{row.koliNumber ?? '—'}</td>}
                  <td className="px-3 py-2">
                    {row.grossWeight != null ? `${fmt.format(row.grossWeight)} kg` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} TO · Halaman {page} dari {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-border px-3 py-1 transition hover:bg-muted disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-border px-3 py-1 transition hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
