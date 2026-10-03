import React from 'react'
import { Evaluation, RouteResult } from '../engine'
import { fmtIdr, fmtNum } from '../utils/format'
import { Kpi, Tag } from './ui'

const REASON: Record<RouteResult['reason'], ['plain' | 'best' | 'warn', string]> = {
  single: ['best', '1 vendor 1 airlines cukup'],
  load: ['plain', 'Lane terbaik penuh'],
  modal: ['warn', 'Modal vendor terbatas'],
  idle: ['warn', 'Tidak dijalankan'],
  none: ['plain', 'Belum ada lane yang layak'],
}

export function ReasonTag({ pr }: { pr: RouteResult }) {
  const [tone, label] = REASON[pr.reason]
  const split = pr.reason === 'load' && pr.rows.filter((r) => r.kg >= 1).length > 1
  return (
    <>
      <Tag tone={tone}>{split ? 'Dipecah: lane terbaik penuh' : label}</Tag>
      {pr.unmet >= 1 && pr.served >= 1 && <> <Tag tone="warn">Kurang {fmtNum(pr.unmet)} kg/hari</Tag></>}
    </>
  )
}

export function TotalsBar({ totals: t, days, label }: { totals: Evaluation['totals']; days: number; label: string }) {
  return (
    <div className="grid gap-4 rounded-md border bg-card p-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      <Kpi label={`Revenue / ${label}`} value={fmtIdr(t.revenue * days)} />
      <Kpi label={`Cost / ${label}`} value={fmtIdr(t.cost * days)} />
      <Kpi label={`Gross margin / ${label}`} value={fmtIdr(t.gross * days)} />
      <Kpi label={`COF / ${label}`} value={fmtIdr(-t.cof * days)} tone={-1} />
      <Kpi label={`Cashback ESP 2% / ${label}`} value={fmtIdr(t.cashback * days)} />
      <Kpi label={`Net margin / ${label}`} value={fmtIdr(t.net * days)} tone={t.net} />
    </div>
  )
}
