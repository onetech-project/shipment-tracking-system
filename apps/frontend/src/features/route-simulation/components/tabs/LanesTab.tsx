'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { accountOf, groupNames, laneMargin, routeDemand } from '../../engine'
import { Lane } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import {
  EspTag, Hint, NumInput, RouteChip, RouteFilter, RouteFilterBar, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, visibleRoutes,
} from '../ui'

export function LanesTab({ source, sim, dispatch }: TabProps) {
  const [filter, setFilter] = useState<RouteFilter>({ group: 'all', q: '' })
  const routes = visibleRoutes(source, sim, filter)

  const laneRow = (l: Lane) => {
    const account = accountOf(sim, l.vendor)
    return (
      <tr key={l.id} style={l.enabled ? undefined : { opacity: 0.55 }}>
        <td className={`${TD} whitespace-nowrap pl-[46px]`}>
          {l.airline}
          {!l.hasData && <> <Tag>tidak ada data di rentang histori</Tag></>}
          {!l.costKnown && <> <Tag tone="warn">cost belum ada di basis ini</Tag></>}
        </td>
        <td className={TD}>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={l.enabled} aria-label={`Ikut simulasi ${l.vendor} ${l.airline}`} onChange={(e) => dispatch({ type: 'laneToggle', id: l.id, enabled: e.target.checked })} /> Ikut
          </label>
        </td>
        <td className={TDN}>
          <NumInput ariaLabel={`Cost per kg ${l.vendor} ${l.airline}`} className="w-28" step={100} edited={l.edited.costPerKg} value={l.costPerKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'costPerKg', value: v })} />
          <div className="text-xs text-muted-foreground">data {fmtIdr(l.db.costPerKg)}</div>
        </td>
        <td className={TDN}>
          <NumInput ariaLabel={`Load per hari ${l.vendor} ${l.airline}`} className="w-24" step={10} edited={l.edited.loadKg} value={l.loadKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'loadKg', value: v })} />
          <div className="text-xs text-muted-foreground">data {fmtNum(l.db.loadKg)} kg</div>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-4xl">
          <h2 className="text-base font-semibold">SMU Rute</h2>
          <Hint>Patokan rute. Daftar vendor dan airlines di tiap rute diambil dari data AWB (vendor, airlines, berat, cost) pada rentang histori tab 1, jadi tidak perlu ditambah manual. Cost/kg dari data = total cost dibagi total berat, hanya dari AWB yang sudah dibooking dan cost-nya bukan estimasi. Data AWB tidak memuat kapasitas maskapai, jadi load awal = kg per hari tertinggi yang pernah tercapai dalam satu periode.</Hint>
          <Hint>Cost dan load boleh diubah untuk mencoba; nilai yang diubah bergaris oranye dan bisa dikembalikan ke data. Hapus centang Ikut bila suatu airlines tidak boleh dipakai. Margin/kg = Rate SPX - cost maskapai, ditambah cashback 2% untuk akun ESP.</Hint>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <fieldset className="flex items-center gap-3 text-sm">
            <legend className="sr-only">Basis cost</legend>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Basis cost</span>
            <label className="inline-flex items-center gap-1"><input type="radio" name="cost-basis" checked={sim.costBasis === 'smu'} onChange={() => dispatch({ type: 'setCostBasis', value: 'smu' })} /> SMU saja</label>
            <label className="inline-flex items-center gap-1"><input type="radio" name="cost-basis" checked={sim.costBasis === 'all'} onChange={() => dispatch({ type: 'setCostBasis', value: 'all' })} /> All-in (SMU + RA + SG)</label>
          </fieldset>
          <RouteFilterBar source={source} value={filter} onChange={setFilter} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr><th className={TH}>Vendor / Airlines</th><th className={TH}>Ikut simulasi</th><th className={THN}>Cost / kg</th><th className={THN}>Load / hari (kg)</th><th className={THN}>Aktual / hari (kg)</th><th className={THN}>Margin / kg</th><th className={TH} /></tr>
          </thead>
          <tbody>
            {routes.length ? routes.map((r) => {
              const lanes = sim.lanes.filter((l) => l.route === r.key)
              const vendors = [...new Set(lanes.map((l) => l.vendor))]
              return (
                <React.Fragment key={r.key}>
                  <tr className={ROW_BAND}>
                    <td colSpan={7} className={TD}>
                      <RouteChip route={r} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, r.key)} · Rate SPX {fmtIdr(r.rateSpx)}/kg · Tonase {fmtNum(routeDemand(source, sim, r.key))} kg/hari · {vendors.length} vendor, {lanes.length} airlines</span>
                    </td>
                  </tr>
                  {vendors.length ? vendors.map((v) => {
                    const account = accountOf(sim, v)
                    const mine = lanes.filter((l) => l.vendor === v)
                    return (
                      <React.Fragment key={v}>
                        <tr className="font-semibold">
                          <td colSpan={7} className={`${TD} pl-7`}>
                            {account?.name ?? v}<EspTag account={account} /> <span className="text-xs font-normal text-muted-foreground">{mine.length} airlines</span>
                            {!account && <> <Tag tone="warn">belum ada akun di tab 1, tidak ikut dihitung</Tag></>}
                            {account && !account.enabled && <> <Tag>akun tidak ikut simulasi</Tag></>}
                          </td>
                        </tr>
                        {mine.map(laneRow)}
                      </React.Fragment>
                    )
                  }) : <tr><td colSpan={7} className={`${TD} pl-7`}><Hint>Belum ada data AWB untuk rute ini.</Hint></td></tr>}
                </React.Fragment>
              )
            }) : <tr><td colSpan={7} className={TD}><Hint>Tidak ada rute pada filter ini.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
