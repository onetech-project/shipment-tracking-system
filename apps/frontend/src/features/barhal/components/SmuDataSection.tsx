'use client'

import { AvailableTo } from '../types'

interface SmuDataSectionProps {
  selected: AvailableTo[]
}

export function SmuDataSection({ selected }: SmuDataSectionProps) {
  if (selected.length === 0) {
    return <p className="text-xs text-muted-foreground">Pilih TO untuk melihat data SMU.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-left uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-medium">No. TO</th>
            <th className="px-2 py-1.5 font-medium">AWB</th>
            <th className="px-2 py-1.5 font-medium">Account</th>
            <th className="px-2 py-1.5 font-medium">Airlines</th>
            <th className="px-2 py-1.5 font-medium">Flight Date</th>
            <th className="px-2 py-1.5 font-medium">Flight Number</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {selected.map((to) => (
            <tr key={to.to_number}>
              <td className="px-2 py-1.5 font-medium">{to.to_number}</td>
              <td className="px-2 py-1.5">{to.awb ?? '—'}</td>
              <td className="px-2 py-1.5">{to.smu_account ?? '—'}</td>
              <td className="px-2 py-1.5">{to.smu_airlines ?? '—'}</td>
              <td className="px-2 py-1.5">{to.smu_flight_date ?? '—'}</td>
              <td className="px-2 py-1.5">{to.smu_flight_number ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
