'use client'

import { Button } from '@/components/ui/button'
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useUnassignSmu } from '../hooks/useBarhal'
import { BarhalSmuListItem } from '../types'
import { formatDate, formatDateTime } from '../utils/dateFormat'

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
    <TableRow>
      <TableCell>{formatDate(item.date)}</TableCell>
      <TableCell>{item.originName}</TableCell>
      <TableCell>{item.destName}</TableCell>
      <TableCell num className="tabular">{item.totalKoli}</TableCell>
      <TableCell num className="tabular">{item.totalTo}</TableCell>
      <TableCell className="font-medium">{item.smuNumber}</TableCell>
      <TableCell>{item.airlines || '-'}</TableCell>
      <TableCell>{item.flightNo || '-'}</TableCell>
      <TableCell>
        {item.std ? `${formatDateTime(item.std)} / ${formatDateTime(item.sta)}` : '—'}
      </TableCell>
      <TableCell num className="tabular">
        {item.chwt != null ? (
          `${fmt.format(item.chwt)} kg`
        ) : (
          <span className="text-xs text-bad">SMU Rate belum diupdate</span>
        )}
      </TableCell>
      <TableCell>
        <Button type="button" variant="danger-soft" size="sm" onClick={handleUnassign} disabled={unassignSmu.isPending}>
          {unassignSmu.isPending ? 'Menghapus…' : 'Hapus'}
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function BarhalSmuListTable({ data, isLoading, onUnassigned }: BarhalSmuListTableProps) {
  return (
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead num>Total Koli</TableHead>
            <TableHead num>Total TO</TableHead>
            <TableHead>No. SMU</TableHead>
            <TableHead>Airlines</TableHead>
            <TableHead>Flight No</TableHead>
            <TableHead>STD / STA</TableHead>
            <TableHead num>chWt Airlines</TableHead>
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
                No SMU found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((item) => <SmuGroupRow key={item.smuNumber} item={item} onUnassigned={onUnassigned} />)
          )}
        </TableBody>
      </Table>
    </TableWrap>
  )
}
