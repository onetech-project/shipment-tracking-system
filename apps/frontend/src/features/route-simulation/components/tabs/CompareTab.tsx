'use client'

import React, { useMemo, useState } from 'react'
import { GitCompare } from 'lucide-react'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { FilterBar } from '@/components/shared/filter-bar'
import { compareRoutes, defaultScope, groupNames, resolveScope, routeLabel } from '../../engine'
import { Scope } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import { EspTag, FIELD, Hint, RouteChip, ScopePicker, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW, ROW_BAND, ROW_GROUP } from '../ui'

export function CompareTab({ source, sim }: TabProps) {
  const enabled = sim.accounts.filter((a) => a.enabled)
  const [vendors, setVendors] = useState(() => new Set(enabled.map((a) => a.id)))
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>(() => defaultScope(source, sim))
  const { sections } = resolveScope(source, sim, scope)
  const byKey = useMemo(
    () => Object.fromEntries(compareRoutes(source, { ...sim, lanes: sim.lanes.filter((l) => vendors.has(l.vendor)) }).map((x) => [x.route.key, x])),
    [source, sim, vendors],
  )
  const needle = q.trim().toLowerCase()
  const empty = !scope.groups.size && !scope.routes.size ? 'Pilih minimal satu grup rute atau rute.' : 'Tidak ada rute pada filter ini.'
  const body = sections.flatMap((sec) => {
    const routes = sec.routes.filter((r) => !needle || routeLabel(r).toLowerCase().includes(needle))
    if (!routes.length) return []
    return [
      <tr key={sec.id} className={ROW_GROUP}><td colSpan={6} className={TD}>{sec.name} <span className="text-xs font-normal text-muted-foreground">{sec.kind === 'group' ? 'Grup rute' : 'Dipilih satu-satu'} · {routes.length} rute</span></td></tr>,
      ...routes.map((r) => {
        const x = byKey[r.key]
        return (
          <React.Fragment key={sec.id + r.key}>
            <tr className={ROW_BAND}><td colSpan={6} className={TD}><RouteChip route={r} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, r.key)} · Rata-rata tonase {fmtNum(x.demand)} kg/hari · Rate SPX {fmtIdr(r.rateSpx)}/kg</span></td></tr>
            {x.vendors.length ? x.vendors.map((v) => (
              <React.Fragment key={v.account.id}>
                <tr className="font-semibold"><td colSpan={6} className={`${TD} pl-7`}>{v.account.name}<EspTag account={v.account} /> <span className="text-xs font-normal text-muted-foreground">{v.lanes.length} airlines · margin terbaik {fmtIdr(v.bestKg)}/kg</span></td></tr>
                {v.lanes.map((l) => (
                  <tr key={l.lane.id} className={ROW}>
                    <td className={`${TD} pl-[46px]`}>{l.lane.airline}</td>
                    <td className={TDN}>{fmtIdr(l.costKg)}</td><td className={TDN}>{fmtIdr(l.costDay)}</td>
                    <td className={TDN}><Signed value={l.marginKg} /></td><td className={TDN}><Signed value={l.marginDay} /></td>
                    <td className={TDN}>{l.isBest ? <Tag tone="best">Optimal</Tag> : <><span className="text-bad">{fmtIdr(l.deltaDay)}</span> <span className="text-xs text-muted-foreground">{fmtIdr(l.deltaKg)}/kg</span></>}</td>
                  </tr>
                ))}
              </React.Fragment>
            )) : <tr><td colSpan={6} className={`${TD} pl-7`}><Hint>Belum ada data AWB untuk vendor terpilih di rute ini.</Hint></td></tr>}
          </React.Fragment>
        )
      }),
    ]
  })
  return (
    <>
      <Card>
        <CardHead icon={GitCompare} title="Perbandingan per Rute" />
        <CardContent className="space-y-1.5 pt-4">
          <Hint>Patokan rute. Di bawah tiap rute ada vendor, dan di bawah tiap vendor ada airlines yang bisa dipakainya, masing-masing dengan detailnya sendiri. Pilih per grup rute, per rute satu-satu, atau keduanya; rute yang ada di dua grup tampil di tiap grupnya.</Hint>
          <Hint>Margin/kg = Rate SPX - cost maskapai, ditambah cashback 2% untuk akun ESP. Cost dan margin per hari = nilai per kg × rata-rata tonase rute per hari. Selisih dari optimal = selisih margin/kg × rata-rata tonase rute per hari.</Hint>
        </CardContent>
      </Card>
      <FilterBar className="text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Vendor</span>
          {enabled.length ? enabled.map((a) => (
            <label key={a.id} className="inline-flex items-center gap-1.5 font-medium">
              <input type="checkbox" className="accent-brand-2" aria-label={a.name} checked={vendors.has(a.id)} onChange={(e) => {
                const next = new Set(vendors)
                if (e.target.checked) next.add(a.id)
                else next.delete(a.id)
                setVendors(next)
              }} /> {a.name}
            </label>
          )) : <Hint>Tidak ada akun aktif</Hint>}
        </div>
        <input type="search" aria-label="Cari rute" placeholder="Cari rute" className={FIELD} value={q} onChange={(e) => setQ(e.target.value)} />
        <ScopePicker source={source} sim={sim} scope={scope} onChange={setScope} />
      </FilterBar>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Vendor / Airlines</th><th className={THN}>Cost / kg</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / kg</th><th className={THN}>Margin / hari</th><th className={THN}>Selisih dari optimal / hari</th></tr></thead>
          <tbody>{body.length ? body : <tr><td colSpan={6} className={TD}><Hint>{empty}</Hint></td></tr>}</tbody>
        </table>
      </div>
    </>
  )
}
