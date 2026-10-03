'use client'

import React from 'react'
import { groupNames, routeLabel } from '../../engine'
import { Hint, NumInput, RouteChip, TabProps, TD, TDN, TH, THN } from '../ui'

export function RateTab({ source, sim, dispatch }: TabProps) {
  return (
    <>
      <div>
        <h2 className="text-base font-semibold">Rate Card SPX</h2>
        <Hint>Rate per kg yang dibayar SPX, sudah dipotong PPh 2% dan diskon 1,5% dari master rute. Dipakai sebagai revenue per kg di tab 2, 6, 8, dan 9.</Hint>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Rute</th><th className={TH}>Grup rute</th><th className={THN}>Rate SPX (Rp/kg)</th></tr></thead>
          <tbody>
            {sim.routes.map((r) => {
              const master = source.routes.find((x) => x.origin === r.origin && x.dest === r.dest)
              return (
                <tr key={r.key}>
                  <td className={TD}><RouteChip route={r} /></td>
                  <td className={`${TD} text-xs text-muted-foreground`}>{groupNames(source, r.key)}</td>
                  <td className={TDN}>
                    <NumInput ariaLabel={`Rate SPX ${routeLabel(r)}`} className="w-32" step={100} value={r.rateSpx} onCommit={(v) => dispatch({ type: 'rateSet', key: r.key, value: v ?? 0 })} />
                    {master?.rateSpx == null && !r.custom && <div className="text-xs text-red-700 dark:text-red-400">rate belum ada di master rute</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
