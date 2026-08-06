'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { BarhalRecapPerTanggalItem, BarhalRecapPerRuteItem } from '../types'
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

function RecapMetricCells({ row }: { row: RecapMetricFields }) {
  return (
    <>
      <td className="px-3 py-2">{row.totalTo}</td>
      <td className="px-3 py-2">{row.totalKoli}</td>
      <td className="px-3 py-2">{fmt.format(row.weightBefore)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.weightAfter)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.chwt)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.variance)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.variancePercent)}%</td>
      <td className="px-3 py-2">{idr.format(row.addRevenue)}</td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.status === 'completed' ? 'bg-green-500/15 text-green-600' : 'bg-amber-500/15 text-amber-600'
          }`}
        >
          {row.status === 'completed' ? 'Completed' : 'Incomplete'}
        </span>
      </td>
    </>
  )
}

/** Membangun parameter drilldown untuk satu baris, memakai sumbu yang berlawanan dari tabel induk. */
function drilldownParamsFor(
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
  const { data, isLoading, isError, refetch } = useBarhalRecapDrilldown(params, true)

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
    <table className="w-full text-xs">
      <thead className="text-left uppercase text-muted-foreground">
        <tr>
          <th className="px-2 py-1 font-medium">{groupBy === 'date' ? 'Rute' : 'Tanggal'}</th>
          <th className="px-2 py-1 font-medium">Total TO</th>
          <th className="px-2 py-1 font-medium">Total Koli</th>
          <th className="px-2 py-1 font-medium">Weight Before</th>
          <th className="px-2 py-1 font-medium">Weight After</th>
          <th className="px-2 py-1 font-medium">chWt Airlines</th>
          <th className="px-2 py-1 font-medium">Variance</th>
          <th className="px-2 py-1 font-medium">Variance %</th>
          <th className="px-2 py-1 font-medium">Add. Revenue</th>
          <th className="px-2 py-1 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {(data as RecapItem[]).map((child) => {
          const { key, groupLabel } = groupKeyAndLabel(child)
          return (
            <tr key={key}>
              <td className="px-2 py-1">{groupLabel}</td>
              <RecapMetricCells row={child} />
            </tr>
          )
        })}
      </tbody>
    </table>
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
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{groupColumnLabel}</th>
            <th className="px-3 py-2 font-medium">Total TO</th>
            <th className="px-3 py-2 font-medium">Total Koli</th>
            <th className="px-3 py-2 font-medium">Weight Before</th>
            <th className="px-3 py-2 font-medium">Weight After</th>
            <th className="px-3 py-2 font-medium">chWt Airlines</th>
            <th className="px-3 py-2 font-medium">Variance</th>
            <th className="px-3 py-2 font-medium">Variance %</th>
            <th className="px-3 py-2 font-medium">Add. Revenue</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                No data for this range.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const { key, groupLabel } = groupKeyAndLabel(row)
              const isOpen = expanded.has(key)
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => toggle(key)}
                    className={`cursor-pointer hover:bg-accent/30 ${
                      row.totalTo === 0 && row.totalKoli === 0 ? 'text-muted-foreground' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {groupLabel}
                      </span>
                    </td>
                    <RecapMetricCells row={row} />
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={COLUMN_COUNT} className="bg-muted/20 px-3 py-3">
                        <DrilldownBody row={row} groupBy={groupBy} filters={filters} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
