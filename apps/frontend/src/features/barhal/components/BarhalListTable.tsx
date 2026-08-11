'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useDeleteKoli } from '../hooks/useBarhal'
import { BarhalKoli } from '../types'
import { formatDate } from '../utils/dateFormat'
import { isKoliIncomplete } from './wizard/BarhalKoliWizard'

interface BarhalListTableProps {
  data: BarhalKoli[]
  page: number
  pageSize: number
  isLoading?: boolean
  onOpenKoli: (koli: BarhalKoli) => void
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const COLUMN_COUNT = 9

interface KoliRowProps {
  koli: BarhalKoli
  index: number
  page: number
  pageSize: number
  isExpanded: boolean
  onToggleExpanded: (id: string) => void
  onOpenKoli: (koli: BarhalKoli) => void
}

function KoliRow({ koli, index, page, pageSize, isExpanded, onToggleExpanded, onOpenKoli }: KoliRowProps) {
  const incomplete = isKoliIncomplete(koli)
  const deleteKoli = useDeleteKoli()

  const handleDelete = () => {
    if (!window.confirm(`Hapus Koli ${koli.koli_number}? TO yang sudah ditambahkan akan dilepas dan dapat dipilih lagi.`)) return
    deleteKoli.mutate(koli.id)
  }

  return (
    <Fragment>
      <tr className="hover:bg-accent/30">
        <td className="px-3 py-2 text-muted-foreground">{(page - 1) * pageSize + index + 1}</td>
        <td className="px-3 py-2 font-medium">
          <button
            type="button"
            onClick={() => onToggleExpanded(koli.id)}
            className="flex items-center gap-1 hover:underline"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {koli.koli_number}
          </button>
        </td>
        <td className="px-3 py-2">{koli.total_to}</td>
        <td className="px-3 py-2">
          {koli.weight_before != null ? `${fmt.format(koli.weight_before)} kg` : '-'}
        </td>
        <td className="px-3 py-2">
          {koli.weight_after != null ? `${fmt.format(koli.weight_after)} kg` : '-'}
        </td>
        <td className="px-3 py-2">{koli.origin_name}</td>
        <td className="px-3 py-2">{koli.dest_name}</td>
        <td className="px-3 py-2">{koli.komoditi}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenKoli(koli)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                incomplete
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'border border-border hover:bg-accent/50'
              }`}
            >
              {incomplete ? 'Lanjutkan' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteKoli.isPending}
              className="rounded-md border border-destructive/50 px-3 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            >
              {deleteKoli.isPending ? 'Menghapus…' : 'Hapus'}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="bg-muted/20 px-3 py-3">
            {koli.lines && koli.lines.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="text-left uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 font-medium">Tanggal</th>
                    <th className="px-2 py-1 font-medium">Origin</th>
                    <th className="px-2 py-1 font-medium">Destinasi</th>
                    <th className="px-2 py-1 font-medium">No. TO</th>
                    <th className="px-2 py-1 font-medium">Gross Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {koli.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-2 py-1">{formatDate(koli.koli_date)}</td>
                      <td className="px-2 py-1">{koli.origin_name}</td>
                      <td className="px-2 py-1">{koli.dest_name}</td>
                      <td className="px-2 py-1">{line.to_number}</td>
                      <td className="px-2 py-1">
                        {line.gross_weight != null ? `${fmt.format(line.gross_weight)} kg` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada TO yang ditambahkan.</p>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

export function BarhalListTable({ data, page, pageSize, isLoading, onOpenKoli }: BarhalListTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">No. Koli</th>
            <th className="px-3 py-2 font-medium">Total TO</th>
            <th className="px-3 py-2 font-medium">Weight Before</th>
            <th className="px-3 py-2 font-medium">Weight After</th>
            <th className="px-3 py-2 font-medium">Origin</th>
            <th className="px-3 py-2 font-medium">Destinasi</th>
            <th className="px-3 py-2 font-medium">Komoditi</th>
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
                No Koli found.
              </td>
            </tr>
          ) : (
            data.map((koli, i) => (
              <KoliRow
                key={koli.id}
                koli={koli}
                index={i}
                page={page}
                pageSize={pageSize}
                isExpanded={expanded.has(koli.id)}
                onToggleExpanded={toggleExpanded}
                onOpenKoli={onOpenKoli}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
