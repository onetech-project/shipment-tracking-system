'use client'

import { BarhalRecapBatangKayuItem } from '../types'
import { formatDate } from '../utils/dateFormat'

interface BarhalRecapBatangKayuTableProps {
  data: BarhalRecapBatangKayuItem[]
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function BarhalRecapBatangKayuTable({ data }: BarhalRecapBatangKayuTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Total Koli</th>
            <th className="px-3 py-2 font-medium">Total P</th>
            <th className="px-3 py-2 font-medium">Total L</th>
            <th className="px-3 py-2 font-medium">Total T</th>
            <th className="px-3 py-2 font-medium">Total Volume</th>
            <th className="px-3 py-2 font-medium">Total Batang Kayu</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                No data for this range.
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={row.date} className="hover:bg-accent/30">
                <td className="px-3 py-2">{formatDate(row.date)}</td>
                <td className="px-3 py-2">{row.totalKoli}</td>
                <td className="px-3 py-2">{fmt.format(row.totalP)}</td>
                <td className="px-3 py-2">{fmt.format(row.totalL)}</td>
                <td className="px-3 py-2">{fmt.format(row.totalT)}</td>
                <td className="px-3 py-2">{fmt.format(row.totalVolume)}</td>
                <td className="px-3 py-2">{row.totalBatangKayu}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
