'use client'

import { BarhalRecapPerTanggalItem, BarhalRecapPerRuteItem } from '../types'

type RecapRow =
  | (BarhalRecapPerTanggalItem & { key: string; groupLabel: string })
  | (BarhalRecapPerRuteItem & { key: string; groupLabel: string })

interface BarhalRecapToTableProps {
  rows: (BarhalRecapPerTanggalItem | BarhalRecapPerRuteItem)[]
  groupColumnLabel: string
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function groupKeyAndLabel(row: BarhalRecapPerTanggalItem | BarhalRecapPerRuteItem): { key: string; groupLabel: string } {
  if ('date' in row) return { key: row.date, groupLabel: row.date }
  return { key: `${row.originName}-${row.destName}`, groupLabel: `${row.originName} → ${row.destName}` }
}

export function BarhalRecapToTable({ rows, groupColumnLabel }: BarhalRecapToTableProps) {
  const withKeys: RecapRow[] = rows.map((row) => ({ ...row, ...groupKeyAndLabel(row) }))

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
          {withKeys.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                No data for this range.
              </td>
            </tr>
          ) : (
            withKeys.map((row) => (
              <tr key={row.key} className="hover:bg-accent/30">
                <td className="px-3 py-2">{row.groupLabel}</td>
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
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
