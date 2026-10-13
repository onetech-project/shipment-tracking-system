'use client'

import React, { useMemo } from 'react'
import { History } from 'lucide-react'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { UNBOOKED_LABEL, accountOf, actualDistribution, groupNames, histDays, periodShort, sumRow } from '../../engine'
import { fmtIdr, fmtNum } from '../../utils/format'
import { EspTag, Hint, RouteChip, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW, ROW_BAND } from '../ui'

export function ActualTab({ source, sim }: TabProps) {
  const actual = useMemo(() => actualDistribution(source, sim), [source, sim])
  const days = histDays(sim)
  const body = sim.routes.flatMap((route) => {
    const rows = actual.filter((r) => r.route.key === route.key)
    if (!rows.length) return []
    const t = sumRow(rows)
    return [
      <tr key={route.key} className={ROW_BAND}><td colSpan={6} className={TD}><RouteChip route={route} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, route.key)} · {rows.length} pilihan · {fmtNum(t.weight / days)} kg/hari · margin {fmtIdr(t.margin / days)}/hari</span></td></tr>,
      ...rows.map((r) => (
        <tr key={route.key + r.vendor + r.airline} className={ROW}>
          <td className={`${TD} pl-7`}>{r.vendor === UNBOOKED_LABEL ? <Tag>{UNBOOKED_LABEL}</Tag> : <>{r.vendor}<EspTag account={accountOf(sim, r.vendor)} /></>}</td>
          <td className={TD}>{r.airline}</td>
          <td className={TDN}>{fmtNum(r.kgDay)}</td><td className={TDN}>{fmtIdr(r.costDay)}</td>
          <td className={TDN}><Signed value={r.marginDay} /></td><td className={TDN}><Signed value={r.marginKg} /></td>
        </tr>
      )),
    ]
  })
  return (
    <>
      <Card>
        <CardHead icon={History} tone="info" title="Distribusi Aktual" />
        <CardContent className="pt-4">
          <Hint>Tiap rute dijalankan vendor mana dan naik airlines apa, dirata-rata per hari dari histori {periodShort(sim.histStart)} s.d. {periodShort(sim.histEnd)} ({days} hari). Cost all-in (SMU + RA + SG). Baris &quot;{UNBOOKED_LABEL}&quot; = AWB yang belum punya booking vendor. Bandingkan dengan tab 8 untuk melihat yang paling optimal.</Hint>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Vendor</th><th className={TH}>Airlines</th><th className={THN}>Kg / hari</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / hari</th><th className={THN}>Margin / kg</th></tr></thead>
          <tbody>{body.length ? body : <tr><td colSpan={6} className={TD}><Hint>Tidak ada data aktual pada rentang histori.</Hint></td></tr>}</tbody>
        </table>
      </div>
    </>
  )
}
