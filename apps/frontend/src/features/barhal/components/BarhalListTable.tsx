'use client'

import { BarhalKoli } from '../types'

interface BarhalListTableProps {
  data: BarhalKoli[]
  page: number
  pageSize: number
  isLoading?: boolean
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function BarhalListTable({ data, page, pageSize, isLoading }: BarhalListTableProps) {
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
            <th className="px-3 py-2 font-medium">Rute</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                No Koli found.
              </td>
            </tr>
          ) : (
            data.map((koli, i) => (
              <tr key={koli.id} className="hover:bg-accent/30">
                <td className="px-3 py-2 text-muted-foreground">{(page - 1) * pageSize + i + 1}</td>
                <td className="px-3 py-2 font-medium">{koli.koli_number}</td>
                <td className="px-3 py-2">{koli.total_to}</td>
                <td className="px-3 py-2">{fmt.format(koli.weight_before)} kg</td>
                <td className="px-3 py-2">{fmt.format(koli.weight_after)} kg</td>
                <td className="px-3 py-2">{koli.route}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
