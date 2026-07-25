'use client'

import { BarhalSmuListItem } from '../types'

interface BarhalSmuListTableProps {
  data: BarhalSmuListItem[]
  isLoading?: boolean
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const COLUMN_COUNT = 10

export function BarhalSmuListTable({ data, isLoading }: BarhalSmuListTableProps) {
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
            data.map((item) => (
              <tr key={item.smuNumber} className="hover:bg-accent/30">
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
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
