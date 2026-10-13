'use client'

import React, { useMemo, useState } from 'react'
import { FileClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { FilterBar } from '@/components/shared/filter-bar'
import { DAYS_PER_PERIOD, Sum, UNBOOKED_LABEL, consolidateHistory, defaultScope, historyDetailByPeriod, periodShort, vendorLabel } from '../../engine'
import { Scope } from '../../types'
import { fmtIdr, fmtNum, fmtPct } from '../../utils/format'
import { exportHistoryPdf, Unit, unitVal } from '../../utils/historyPdf'
import { FIELD, Hint, RouteChip, ScopePicker, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW, ROW_BAND, ROW_GRAND, ROW_SUBTOTAL } from '../ui'

const UNITS: [Unit, string][] = [['total', 'Total'], ['per_kg', 'Per kg'], ['per_day', 'Per hari'], ['per_period', 'Per periode']]

export function HistoryTab({ source, sim }: TabProps) {
  const allVendors = useMemo(() => [...new Set(source.history.map(vendorLabel))].sort((a, b) => (a === UNBOOKED_LABEL ? 1 : b === UNBOOKED_LABEL ? -1 : a.localeCompare(b))), [source])
  const [start, setStart] = useState(source.cycles[0])
  const [end, setEnd] = useState(source.cycles[source.cycles.length - 1])
  const [vendors, setVendors] = useState(() => new Set(allVendors))
  const [units, setUnits] = useState(() => new Set<Unit>(['total', 'per_kg']))
  const [scope, setScope] = useState<Scope>(() => defaultScope(source, sim))

  let i = source.cycles.indexOf(start)
  let j = source.cycles.indexOf(end)
  if (i > j) [i, j] = [j, i]
  const filter = { periods: source.cycles.slice(i, j + 1), vendors, scope }
  const c = useMemo(() => consolidateHistory(source, sim, filter), [source, sim, start, end, vendors, scope]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = c.numPeriods
  const shown = UNITS.filter(([u]) => units.has(u))
  const span = 3 + shown.length * 3

  const toggle = <T,>(set: Set<T>, v: T, on: boolean, apply: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (on) next.add(v)
    else next.delete(v)
    apply(next)
  }
  const cells = (o: Sum) => (
    <>
      <td className={TDN}>{fmtNum(o.weight)}</td>
      {shown.map(([u]) => <td key={'r' + u} className={TDN}>{fmtIdr(unitVal(o.revenue, o.weight, n, u))}</td>)}
      {shown.map(([u]) => <td key={'c' + u} className={TDN}>{fmtIdr(unitVal(o.cost, o.weight, n, u))}</td>)}
      {shown.map(([u]) => <td key={'m' + u} className={TDN}><Signed value={unitVal(o.margin, o.weight, n, u)} /></td>)}
      <td className={TDN}>{fmtPct(o.revenue > 0 ? o.margin / o.revenue : 0)}</td>
    </>
  )

  let empty: string | null = null
  if (!scope.groups.size && !scope.routes.size) empty = 'Pilih minimal satu grup rute atau rute.'
  else if (!vendors.size) empty = 'Pilih minimal satu vendor.'
  else if (!shown.length) empty = 'Pilih minimal satu satuan.'
  else if (!c.groups.length) empty = 'Tidak ada data pada filter ini.'

  const pdf = () => {
    if (!c.groups.length) return
    exportHistoryPdf({ consolidated: c, detail: historyDetailByPeriod(source, sim, filter), periods: filter.periods, vendors: [...vendors] })
  }

  return (
    <>
      <Card>
        <CardHead
          icon={FileClock}
          tone="info"
          title="Historical PnL"
          actions={<Button size="sm" onClick={pdf}>Download PDF</Button>}
        />
        <CardContent className="pt-4">
          <Hint>Consolidate per rute: gabungan vendor yang dicentang selama {n} periode ({n * DAYS_PER_PERIOD} hari). Pilih per grup rute, per rute satu-satu, atau keduanya; tiap grup punya subtotal. Detail per periode ada di PDF.</Hint>
        </CardContent>
      </Card>
      <FilterBar className="gap-x-5 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Periode</span>
          <select aria-label="Periode mulai" className={FIELD} value={start} onChange={(e) => setStart(e.target.value)}>
            {source.cycles.map((x) => <option key={x} value={x}>{periodShort(x)}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">s.d.</span>
          <select aria-label="Periode akhir" className={FIELD} value={end} onChange={(e) => setEnd(e.target.value)}>
            {source.cycles.map((x) => <option key={x} value={x}>{periodShort(x)}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Vendor</span>
          {allVendors.map((v) => (
            <label key={v} className="inline-flex items-center gap-1.5 font-medium">
              <input type="checkbox" className="accent-brand-2" aria-label={v} checked={vendors.has(v)} onChange={(e) => toggle(vendors, v, e.target.checked, setVendors)} /> {v}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Satuan</span>
          {UNITS.map(([u, label]) => (
            <label key={u} className="inline-flex items-center gap-1.5 font-medium">
              <input type="checkbox" className="accent-brand-2" checked={units.has(u)} onChange={(e) => toggle(units, u, e.target.checked, setUnits)} /> {label}
            </label>
          ))}
        </div>
        <ScopePicker source={source} sim={sim} scope={scope} onChange={setScope} />
      </FilterBar>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th rowSpan={2} className={`${TH} sticky left-0 z-[1]`}>Rute</th><th rowSpan={2} className={THN}>Tonase (kg)</th>
              {shown.length > 0 && ['Revenue', 'Cost', 'Margin'].map((h) => <th key={h} colSpan={shown.length} className={`${TH} border-l text-center`}>{h}</th>)}
              <th rowSpan={2} className={THN}>Margin %</th>
            </tr>
            <tr>{[0, 1, 2].flatMap((k) => shown.map(([u, label]) => <th key={k + u} className={THN}>{label}</th>))}</tr>
          </thead>
          <tbody>
            {empty ? <tr><td colSpan={span} className={TD}><Hint>{empty}</Hint></td></tr> : (
              <>
                {c.groups.map((g) => (
                  <React.Fragment key={g.id}>
                    <tr className={ROW_BAND}><td colSpan={span} className={TD}>{g.name} <span className="text-xs font-normal text-muted-foreground">{g.kind === 'group' ? 'Grup rute' : 'Dipilih satu-satu'} · {g.rows.length} rute</span></td></tr>
                    {g.rows.map((r) => (
                      <tr key={r.route.key} className={ROW}><td className={`${TD} sticky left-0 bg-card pl-7`}><RouteChip route={r.route} />{r.dupe && <> <Tag>juga di grup lain</Tag></>}</td>{cells(r)}</tr>
                    ))}
                    <tr className={ROW_SUBTOTAL}><td className={TD}>Subtotal {g.name}</td>{cells(g.subtotal)}</tr>
                  </React.Fragment>
                ))}
                <tr className={ROW_GRAND}><td className={TD}>Grand Total</td>{cells(c.grand)}</tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <Hint>Margin % dihitung terhadap revenue.{c.dupes ? ` ${c.dupes} rute tampil di lebih dari satu grup. Grand total menghitung tiap rute satu kali, jadi tidak sama dengan jumlah subtotal.` : ''}</Hint>
    </>
  )
}
