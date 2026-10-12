'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { BarhalRecapPerTanggalItem, BarhalRecapPerRuteItem, BarhalRecapStatus } from '../types'
import { BarhalDashboardParams, useBarhalRecapDrilldown } from '../hooks/useBarhalDashboard'
import { formatDate } from '../utils/dateFormat'

type RecapItem = BarhalRecapPerTanggalItem | BarhalRecapPerRuteItem
/** Kolom angka yang sama persis dimiliki baris per-tanggal maupun per-rute. */
type RecapMetricFields = Omit<BarhalRecapPerTanggalItem, 'date'>

interface BarhalRecapToTableProps {
  rows: RecapItem[]
  groupColumnLabel: string
  /** Dikelompokkan berdasarkan apa tabel ini. Drilldown-nya memakai sumbu yang berlawanan. */
  groupBy: 'date' | 'route'
  /** Filter dashboard yang sedang aktif, diteruskan ke query drilldown. */
  filters: BarhalDashboardParams
}

const COLUMN_COUNT = 10
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function groupKeyAndLabel(row: RecapItem): { key: string; groupLabel: string } {
  // `key` memakai nilai mentah — itu identitas baris, bukan teks tampilan.
  if ('date' in row) return { key: row.date, groupLabel: formatDate(row.date) }
  return { key: `${row.originName}-${row.destName}`, groupLabel: `${row.originName} → ${row.destName}` }
}

/**
 * `none` berarti barisnya nol semua — tidak ada aktivitas barhal sama sekali di tanggal/rute itu,
 * jadi tidak ada yang bisa disebut selesai atau belum. Baris yang punya TO tapi belum ada AWB tetap
 * "Incomplete": itu pekerjaan yang belum kelar, bukan pekerjaan yang tidak ada.
 */
function RecapStatusBadge({ status }: { status: BarhalRecapStatus }) {
  if (status === 'none') return <span className="text-muted-foreground">–</span>
  return (
    <Badge variant={status === 'completed' ? 'active' : 'pending'}>
      {status === 'completed' ? 'Completed' : 'Incomplete'}
    </Badge>
  )
}

function RecapMetricCells({ row }: { row: RecapMetricFields }) {
  return (
    <>
      <TableCell num>{row.totalTo}</TableCell>
      <TableCell num>{row.totalKoli}</TableCell>
      <TableCell num>{fmt.format(row.weightBefore)} kg</TableCell>
      <TableCell num>{fmt.format(row.weightAfter)} kg</TableCell>
      <TableCell num>{fmt.format(row.chwt)} kg</TableCell>
      <TableCell num>{fmt.format(row.variance)} kg</TableCell>
      <TableCell num>{fmt.format(row.variancePercent)}%</TableCell>
      <TableCell num>{idr.format(row.addRevenue)}</TableCell>
      <TableCell>
        <RecapStatusBadge status={row.status} />
      </TableCell>
    </>
  )
}

/** Membangun parameter drilldown untuk satu baris, memakai sumbu yang berlawanan dari tabel induk. */
export function drilldownParamsFor(
  row: RecapItem,
  groupBy: 'date' | 'route',
  filters: BarhalDashboardParams,
): { groupBy: 'route' | 'date'; startDate?: string; endDate?: string; origin?: string; dest?: string } {
  if (groupBy === 'date' && 'date' in row) {
    // Baris tanggal → rincian per rute pada tanggal itu saja.
    return { ...filters, startDate: row.date, endDate: row.date, groupBy: 'route' }
  }
  const route = row as BarhalRecapPerRuteItem
  // Baris rute → rincian per tanggal, rentang dashboard dipertahankan.
  return { ...filters, origin: route.originName, dest: route.destName, groupBy: 'date' }
}

function DrilldownBody({
  row,
  groupBy,
  filters,
}: {
  row: RecapItem
  groupBy: 'date' | 'route'
  filters: BarhalDashboardParams
}) {
  const params = drilldownParamsFor(row, groupBy, filters)
  const { data, isLoading, isError, refetch } = useBarhalRecapDrilldown(params)

  if (isError) {
    return (
      <p className="text-xs text-muted-foreground">
        Gagal memuat rincian.{' '}
        <button type="button" onClick={() => refetch()} className="text-primary underline">
          Coba lagi
        </button>
      </p>
    )
  }
  if (isLoading) return <p className="text-xs text-muted-foreground">Memuat rincian…</p>
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">Tidak ada aktivitas.</p>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{groupBy === 'date' ? 'Rute' : 'Tanggal'}</TableHead>
          <TableHead num>Total TO</TableHead>
          <TableHead num>Total Koli</TableHead>
          <TableHead num>Weight Before</TableHead>
          <TableHead num>Weight After</TableHead>
          <TableHead num>chWt Airlines</TableHead>
          <TableHead num>Variance</TableHead>
          <TableHead num>Variance %</TableHead>
          <TableHead num>Add. Revenue</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data as RecapItem[]).map((child) => {
          const { key, groupLabel } = groupKeyAndLabel(child)
          return (
            <TableRow key={key}>
              <TableCell>{groupLabel}</TableCell>
              <RecapMetricCells row={child} />
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function BarhalRecapToTable({ rows, groupColumnLabel, groupBy, filters }: BarhalRecapToTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Filter berubah berarti kumpulan barisnya berubah; baris yang terbuka bisa jadi
  // sudah tidak ada lagi.
  useEffect(() => {
    setExpanded(new Set())
  }, [filters.startDate, filters.endDate, filters.origin, filters.dest])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{groupColumnLabel}</TableHead>
            <TableHead num>Total TO</TableHead>
            <TableHead num>Total Koli</TableHead>
            <TableHead num>Weight Before</TableHead>
            <TableHead num>Weight After</TableHead>
            <TableHead num>chWt Airlines</TableHead>
            <TableHead num>Variance</TableHead>
            <TableHead num>Variance %</TableHead>
            <TableHead num>Add. Revenue</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-6 text-center text-muted-foreground">
                No data for this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const { key, groupLabel } = groupKeyAndLabel(row)
              const isOpen = expanded.has(key)
              const isEmptyRow = row.totalTo === 0 && row.totalKoli === 0
              return (
                <Fragment key={key}>
                  <TableRow className={isEmptyRow ? 'text-muted-foreground' : ''}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                        className="group flex items-center gap-1.5 hover:underline"
                      >
                        <span className="text-faint group-hover:text-brand-2">
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </span>
                        {groupLabel}
                      </button>
                    </TableCell>
                    <RecapMetricCells row={row} />
                  </TableRow>
                  {isOpen && (
                    <TableRow>
                      <TableCell colSpan={COLUMN_COUNT} className="bg-surface-2 py-3">
                        <DrilldownBody row={row} groupBy={groupBy} filters={filters} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })
          )}
        </TableBody>
      </Table>
    </TableWrap>
  )
}
