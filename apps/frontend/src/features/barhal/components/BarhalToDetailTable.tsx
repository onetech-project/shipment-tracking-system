'use client'

import { useEffect, useState } from 'react'
import { SubTabs } from '@/components/ui/segmented'
import { Button } from '@/components/ui/button'
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useBarhalToDetail } from '../hooks/useBarhalDashboard'
import { BarhalToDetailTab } from '../types'
import { formatDate } from '../utils/dateFormat'

const TABS: { value: BarhalToDetailTab; label: string }[] = [
  { value: 'in-koli', label: 'TO dalam koli' },
  { value: 'not-in-koli', label: 'TO belum masuk koli' },
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
      <SubTabs aria-label="Filter TO" value={tab} onValueChange={setTab} items={TABS} />

      <TableWrap>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Destinasi</TableHead>
              <TableHead>No. TO</TableHead>
              {inKoli && <TableHead>No. Koli</TableHead>}
              <TableHead num>Gross Weight</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">
                  Failed to load.{' '}
                  <button type="button" onClick={() => refetch()} className="text-primary underline">
                    Retry
                  </button>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (data?.data.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">
                  No data for this range.
                </TableCell>
              </TableRow>
            ) : (
              data!.data.map((row) => (
                <TableRow key={row.toNumber}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.originName}</TableCell>
                  <TableCell>{row.destName}</TableCell>
                  <TableCell>{row.toNumber}</TableCell>
                  {inKoli && <TableCell>{row.koliNumber ?? '—'}</TableCell>}
                  <TableCell num className="tabular">
                    {row.grossWeight != null ? `${fmt.format(row.grossWeight)} kg` : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableWrap>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} TO · Halaman {page} dari {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
