'use client'

import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { BarhalRecapBatangKayuItem } from '../types'
import { formatDate } from '../utils/dateFormat'

interface BarhalRecapBatangKayuTableProps {
  data: BarhalRecapBatangKayuItem[]
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const COLUMN_COUNT = 7

export function BarhalRecapBatangKayuTable({ data }: BarhalRecapBatangKayuTableProps) {
  return (
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead num>Total Koli</TableHead>
            <TableHead num>Total P</TableHead>
            <TableHead num>Total L</TableHead>
            <TableHead num>Total T</TableHead>
            <TableHead num>Total Volume</TableHead>
            <TableHead num>Total Batang Kayu</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-6 text-center text-muted-foreground">
                No data for this range.
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow key={row.date}>
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell num className="tabular">{row.totalKoli}</TableCell>
                <TableCell num className="tabular">{fmt.format(row.totalP)}</TableCell>
                <TableCell num className="tabular">{fmt.format(row.totalL)}</TableCell>
                <TableCell num className="tabular">{fmt.format(row.totalT)}</TableCell>
                <TableCell num className="tabular">{fmt.format(row.totalVolume)}</TableCell>
                <TableCell num className="tabular">{row.totalBatangKayu}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableWrap>
  )
}
