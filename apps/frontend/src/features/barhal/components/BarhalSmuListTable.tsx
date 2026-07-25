'use client'

import { useUnassignSmu } from '../hooks/useBarhal'
import { BarhalSmuListItem } from '../types'

interface BarhalSmuListTableProps {
  data: BarhalSmuListItem[]
  isLoading?: boolean
  onUnassigned: () => void
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const COLUMN_COUNT = 11

function SmuGroupRow({ item, onUnassigned }: { item: BarhalSmuListItem; onUnassigned: () => void }) {
  const unassignSmu = useUnassignSmu()

  const handleUnassign = () => {
    if (
      !window.confirm(
        `Lepaskan SMU ${item.smuNumber} dari ${item.totalKoli} Koli? Data Airlines/Flight No/STD/STA akan dikosongkan, Koli tidak akan dihapus.`,
      )
    )
      return
    unassignSmu.mutate(item.smuNumber, { onSuccess: onUnassigned })
  }

  return (
    <tr className="hover:bg-accent/30">
      <td className="px-3 py-2">{item.date}</td>
      <td className="px-3 py-2">{item.originName}</td>
      <td className="px-3 py-2">{item.destName}</td>
      <td className="px-3 py-2">{item.totalKoli}</td>
      <td className="px-3 py-2">{item.totalTo}</td>
      <td className="px-3 py-2 font-medium">{item.smuNumber}</td>
      <td className="px-3 py-2">{item.airlines || '-'}</td>
      <td className="px-3 py-2">{item.flightNo || '-'}</td>
      <td className="px-3 py-2">{item.std ? `${item.std.slice(0, 16)} / ${item.sta?.slice(0, 16) ?? '-'}` : '-'}</td>
      <td className="px-3 py-2">
        {item.chwt != null ? `${fmt.format(item.chwt)} kg` : (
          <span className="text-xs text-destructive">SMU Rate belum diupdate</span>
        )}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={handleUnassign}
          disabled={unassignSmu.isPending}
          className="rounded-md border border-destructive/50 px-3 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
        >
          {unassignSmu.isPending ? 'Menghapus…' : 'Hapus'}
        </button>
      </td>
    </tr>
  )
}

export function BarhalSmuListTable({ data, isLoading, onUnassigned }: BarhalSmuListTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Origin</th>
            <th className="px-3 py-2 font-medium">Destination</th>
            <th className="px-3 py-2 font-medium">Total Koli</th>
            <th className="px-3 py-2 font-medium">Total TO</th>
            <th className="px-3 py-2 font-medium">No. SMU</th>
            <th className="px-3 py-2 font-medium">Airlines</th>
            <th className="px-3 py-2 font-medium">Flight No</th>
            <th className="px-3 py-2 font-medium">STD / STA</th>
            <th className="px-3 py-2 font-medium">chWt Airlines</th>
            <th className="px-3 py-2 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                No SMU found.
              </td>
            </tr>
          ) : (
            data.map((item) => <SmuGroupRow key={item.smuNumber} item={item} onUnassigned={onUnassigned} />)
          )}
        </tbody>
      </table>
    </div>
  )
}
