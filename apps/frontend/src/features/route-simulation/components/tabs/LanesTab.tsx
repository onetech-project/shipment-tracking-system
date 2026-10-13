'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { FilterBar } from '@/components/shared/filter-bar'
import { ListChecks } from 'lucide-react'
import { COST_FIELDS, COST_LABELS, accountOf, groupNames, laneMargin, routeDemand } from '../../engine'
import { Lane } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import {
  EspTag, Hint, NumInput, RouteChip, RouteFilter, RouteFilterBar, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW, ROW_BAND, visibleRoutes,
} from '../ui'

const COLS = 11
const SUB = 'text-xs text-muted-foreground'

export function LanesTab({ source, sim, dispatch }: TabProps) {
  const [filter, setFilter] = useState<RouteFilter>({ group: 'all', q: '' })
  const routes = visibleRoutes(source, sim, filter)

  const laneRow = (l: Lane) => {
    const account = accountOf(sim, l.vendor)
    return (
      <tr key={l.id} className={ROW} style={l.enabled ? undefined : { opacity: 0.55 }}>
        <td className={`${TD} whitespace-nowrap pl-[46px]`}>
          {l.airline}
          {!l.hasData && <> <Tag>tidak ada data di rentang histori</Tag></>}
          {!l.costKnown && <> <Tag tone="warn">cost belum ada di data</Tag></>}
        </td>
        <td className={TD}>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={l.enabled} aria-label={`Ikut simulasi ${l.vendor} ${l.airline}`} onChange={(e) => dispatch({ type: 'laneToggle', id: l.id, enabled: e.target.checked })} /> Ikut
          </label>
        </td>
        {COST_FIELDS.map((f) => (
          <td key={f} className={TDN}>
            <NumInput ariaLabel={`Cost ${COST_LABELS[f]} per kg ${l.vendor} ${l.airline}`} className="w-24" step={100} edited={l.edited[f]} value={l[f]} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: f, value: v })} />
            <div className={SUB}>data {fmtIdr(l.db[f])}</div>
          </td>
        ))}
        <td className={TDN}>
          {fmtIdr(l.costPerKg)}
          <div className={SUB}>data {fmtIdr(l.db.costPerKg)}</div>
        </td>
        <td className={TDN}>
          <NumInput ariaLabel={`Load per hari ${l.vendor} ${l.airline}`} className="w-24" step={10} edited={l.edited.loadKg} value={l.loadKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'loadKg', value: v })} />
          <div className={SUB}>data {fmtNum(l.db.loadKg)} kg</div>
        </td>
        <td className={TDN}>{fmtNum(l.actualKgDay)}</td>
        <td className={TDN}>{account ? <Signed value={laneMargin(sim, l).netPerKg} /> : <span className="text-muted-foreground">-</span>}</td>
        <td className={TDN}>
          {(l.edited.costPerKg || l.edited.loadKg) && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'laneReset', id: l.id })}>Kembali ke data</Button>}
        </td>
      </tr>
    )
  }

  return (
    <>
      <Card>
        <CardHead icon={ListChecks} title="SMU Rute" />
        <CardContent className="space-y-1.5 pt-4">
          <Hint>Patokan rute. Daftar vendor dan airlines di tiap rute diambil dari seluruh histori AWB (vendor, airlines, berat, cost), jadi tidak perlu ditambah manual; cost/kg, load, dan tag &quot;tidak ada data&quot; memakai rentang histori di kepala halaman. Cost/kg tiap komponen dari data = total cost komponen itu (SG Outgoing, SG Incoming, RA, SMU) dibagi total berat, hanya dari AWB yang sudah dibooking dan cost-nya bukan estimasi. Data AWB tidak memuat kapasitas maskapai, jadi load awal = kg per hari tertinggi dalam satu periode pada rentang histori.</Hint>
          <Hint>Tiap komponen cost dan load boleh diubah untuk mencoba; nilai yang diubah bergaris oranye dan bisa dikembalikan ke data. Total Cost = Cost SG Outgoing + Cost SG Incoming + Cost RA + Cost SMU (otomatis). Hapus centang Ikut bila suatu airlines tidak boleh dipakai. Margin/kg = Rate SPX - Total Cost, ditambah cashback 2% untuk akun ESP.</Hint>
        </CardContent>
      </Card>
      <FilterBar>
        <RouteFilterBar source={source} value={filter} onChange={setFilter} />
      </FilterBar>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Vendor / Airlines</th><th className={TH}>Ikut simulasi</th>
              {COST_FIELDS.map((f) => <th key={f} className={THN}>Cost {COST_LABELS[f]}</th>)}
              <th className={THN}>Total Cost / kg</th><th className={THN}>Load / hari (kg)</th><th className={THN}>Aktual / hari (kg)</th><th className={THN}>Margin / kg</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            {routes.length ? routes.map((r) => {
              const lanes = sim.lanes.filter((l) => l.route === r.key)
              const vendors = [...new Set(lanes.map((l) => l.vendor))]
              return (
                <React.Fragment key={r.key}>
                  <tr className={ROW_BAND}>
                    <td colSpan={COLS} className={TD}>
                      <RouteChip route={r} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, r.key)} · Rate SPX {fmtIdr(r.rateSpx)}/kg · Tonase {fmtNum(routeDemand(source, sim, r.key))} kg/hari · {vendors.length} vendor, {lanes.length} airlines</span>
                    </td>
                  </tr>
                  {vendors.length ? vendors.map((v) => {
                    const account = accountOf(sim, v)
                    const mine = lanes.filter((l) => l.vendor === v)
                    return (
                      <React.Fragment key={v}>
                        <tr className="font-semibold">
                          <td colSpan={COLS} className={`${TD} pl-7`}>
                            {account?.name ?? v}<EspTag account={account} /> <span className="text-xs font-normal text-muted-foreground">{mine.length} airlines</span>
                            {!account && <> <Tag tone="warn">belum ada akun di tab 1, tidak ikut dihitung</Tag></>}
                            {account && !account.enabled && <> <Tag>akun tidak ikut simulasi</Tag></>}
                          </td>
                        </tr>
                        {mine.map(laneRow)}
                      </React.Fragment>
                    )
                  }) : <tr><td colSpan={COLS} className={`${TD} pl-7`}><Hint>Belum ada data AWB untuk rute ini.</Hint></td></tr>}
                </React.Fragment>
              )
            }) : <tr><td colSpan={COLS} className={TD}><Hint>Tidak ada rute pada filter ini.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
