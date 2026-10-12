'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
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
      <TableRow>
        <TableCell num className="text-muted-foreground">{(page - 1) * pageSize + index + 1}</TableCell>
        <TableCell className="font-medium">
          <button type="button" onClick={() => onToggleExpanded(koli.id)} className="group flex items-center gap-1 hover:underline">
            <span className="text-faint group-hover:text-brand-2">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            {koli.koli_number}
          </button>
        </TableCell>
        <TableCell num>{koli.total_to}</TableCell>
        <TableCell num>
          {koli.weight_before != null ? `${fmt.format(koli.weight_before)} kg` : '-'}
        </TableCell>
        <TableCell num>
          {koli.weight_after != null ? `${fmt.format(koli.weight_after)} kg` : '-'}
        </TableCell>
        <TableCell>{koli.origin_name}</TableCell>
        <TableCell>{koli.dest_name}</TableCell>
        <TableCell>{koli.komoditi}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={incomplete ? 'default' : 'outline'}
              size="sm"
              onClick={() => onOpenKoli(koli)}
            >
              {incomplete ? 'Lanjutkan' : 'Edit'}
            </Button>
            <Button type="button" variant="danger-soft" size="sm" onClick={handleDelete} disabled={deleteKoli.isPending}>
              {deleteKoli.isPending ? 'Menghapus…' : 'Hapus'}
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="bg-surface-2 py-3">
            {koli.lines && koli.lines.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destinasi</TableHead>
                    <TableHead>No. TO</TableHead>
                    <TableHead num>Gross Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {koli.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{formatDate(koli.koli_date)}</TableCell>
                      <TableCell>{koli.origin_name}</TableCell>
                      <TableCell>{koli.dest_name}</TableCell>
                      <TableCell>{line.to_number}</TableCell>
                      <TableCell num>
                        {line.gross_weight != null ? `${fmt.format(line.gross_weight)} kg` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada TO yang ditambahkan.</p>
            )}
          </TableCell>
        </TableRow>
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
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>No. Koli</TableHead>
            <TableHead num>Total TO</TableHead>
            <TableHead num>Weight Before</TableHead>
            <TableHead num>Weight After</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Destinasi</TableHead>
            <TableHead>Komoditi</TableHead>
            <TableHead>Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-6 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-6 text-center text-muted-foreground">
                No Koli found.
              </TableCell>
            </TableRow>
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
        </TableBody>
      </Table>
    </TableWrap>
  )
}
