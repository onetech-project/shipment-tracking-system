'use client'

import React, { useMemo, useState } from 'react'
import { FlaskConical, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { Banner } from '@/components/shared/banner'
import {
  DAYS_PER_MONTH, RouteResult, TrancheUse, Violation, accountOf, actualDistribution, cycleDays, evaluatePlan,
  groupNames, hasOverride, histDays, laneMargin, optimizePlan, routeHistTon, routeLabel, routeOf, simOpts, simPlan, sumRow,
} from '../../engine'
import { Account, Lane, SimState } from '../../types'
import { fmtIdr, fmtNum } from '../../utils/format'
import { AddAccountForm } from '../AddAccountForm'
import { ReasonTag } from '../Reason'
import { EspTag, Hint, Kpi, NumInput, RouteChip, RouteFilter, RouteFilterBar, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW, visibleRoutes } from '../ui'
import { SlotEditor } from './RoutesTab'

const runoutText = (day: number) => (day < 1 ? 'tidak cukup untuk sehari' : `habis hari ke-${day}`)

// Mirrors usable's own checks (lane.enabled, account present+enabled, account has tranches) so the
// note always names the actual blocker instead of a generic "akun nonaktif" for every case.
function unusableLaneNote(l: Lane, account?: Account): string {
  if (!l.enabled) return 'tidak ikut simulasi'
  if (!account) return 'belum ada akun'
  if (!account.tranches.length) return 'akun tanpa modal'
  return 'akun nonaktif'
}

export function violationText(v: Violation, sim: SimState): string {
  if (v.type === 'modal') return `Modal ${v.account.name} (${v.tranche.label}) ${runoutText(v.runoutDay)}, uang baru balik hari ke-${cycleDays(v.tranche)}. Kurang ${fmtIdr(v.over)}`
  if (v.type === 'load') return `Load ${v.lane.airline} milik ${v.lane.vendor} di rute ${routeLabel(routeOf(sim, v.lane.route)!)} terlampaui ${fmtNum(v.over)} kg/hari`
  if (v.type === 'tonase') return `Tonase rute ${routeLabel(v.route)} terlampaui ${fmtNum(v.over)} kg/hari`
  return 'Ada isian yang menunjuk akun nonaktif atau akun tanpa modal'
}

function MoneyStatus({ x, days }: { x: TrancheUse; days: number | null }) {
  if (x.cash < 1) return <Hint>Tidak ada duit</Hint>
  if (x.runoutDay != null) return <><Tag tone="warn">{x.runoutDay < 1 ? 'Tidak cukup untuk sehari' : `Habis hari ke-${x.runoutDay}`}</Tag> <span className="text-xs text-muted-foreground">uang balik hari ke-{x.refillDay}</span></>
  if (x.spendDay < 1) return <Tag tone="warn">Menganggur</Tag>
  if (days && days < x.refillDay) return <><span className="font-medium text-brand-ink">Cukup untuk {days} hari</span> <span className="text-xs text-muted-foreground">sisa {fmtIdr(x.idle)}</span></>
  return <span className="font-medium text-brand-ink">Aman, berputar tiap {x.refillDay} hari</span>
}

export function SimTab({ source, sim, dispatch, onRun }: TabProps & { onRun: () => void }) {
  const [filter, setFilter] = useState<RouteFilter>({ group: 'all', q: '' })
  const [open, setOpen] = useState<Set<string>>(new Set())
  const opts = simOpts(sim)
  const days = opts.days
  const manual = !!sim.sim.kg
  const { rec, plan, res, recRes, actual } = useMemo(() => {
    const rec = optimizePlan(source, sim, opts)
    const plan = simPlan(source, sim)
    const res = evaluatePlan(source, sim, plan, opts)
    return { rec, plan, res, recRes: manual ? evaluatePlan(source, sim, rec, opts) : res, actual: actualDistribution(source, sim) }
  }, [source, sim]) // eslint-disable-line react-hooks/exhaustive-deps
  const kgOf = Object.fromEntries(plan.map((p) => [p.lane, p.kg]))
  const recKg = Object.fromEntries(rec.map((p) => [p.lane, p.kg]))
  const visible = new Set(visibleRoutes(source, sim, filter).map((r) => r.key))
  const t = res.totals
  const span = days ?? DAYS_PER_MONTH
  const run = res.perRoute.filter((x) => x.served >= 1)
  const skipped = res.perRoute.filter((x) => x.reason === 'idle')
  const diff = t.net - recRes.totals.net

  const toggleOpen = (key: string) => {
    const next = new Set(open)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setOpen(next)
  }

  const routeItem = (pr: RouteResult) => {
    const route = pr.route
    const key = route.key
    const isOpen = open.has(key)
    const who = pr.rows.filter((r) => r.kg >= 1).map((r) => `${r.account.name} · ${r.lane.airline} ${fmtNum(r.kg)} kg`).join(', ')
    const hist = Math.round(routeHistTon(source, sim, key))
    const over = hasOverride(route)
    const act = sumRow(actual.filter((r) => r.route.key === key))
    const lanes = sim.lanes
      .filter((l) => l.route === key)
      .map((lane) => ({ lane, account: accountOf(sim, lane.vendor), m: laneMargin(sim, lane) }))
      .sort((a, b) => sim.accounts.indexOf(a.account!) - sim.accounts.indexOf(b.account!) || b.m.netPerKg - a.m.netPerKg)
    return (
      <div key={key} className="border-t first:border-t-0">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => toggleOpen(key)}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-muted aria-expanded:bg-muted"
        >
          <span><span aria-hidden className={`inline-block w-4 text-muted-foreground ${isOpen ? 'rotate-90' : ''}`}>›</span> <RouteChip route={route} /></span>
          <span className="text-xs text-muted-foreground">{who || 'Belum ada yang menjalankan'}</span>
          <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-xs text-muted-foreground">Terisi {fmtNum(pr.served)} dari {fmtNum(pr.demand)} kg/hari</span>
            <span><Signed value={pr.net} /> <span className="text-xs text-muted-foreground">/ hari</span></span>
            <ReasonTag pr={pr} />
          </span>
        </button>
        {isOpen && (
          <div className="space-y-3 px-4 pb-4 pt-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Rate SPX (Rp/kg)</span>
                <NumInput ariaLabel={`Rate SPX ${routeLabel(route)}`} className="w-full" step={100} value={route.rateSpx} onCommit={(v) => dispatch({ type: 'rateSet', key, value: v ?? 0 })} />
              </label>
              <div>
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Tonase / hari (kg)</span>
                  <NumInput ariaLabel={`Tonase per hari ${routeLabel(route)}`} className="w-full" step={10} edited={over} value={over ? route.overrideTon : hist} onCommit={(v) => dispatch({ type: 'tonSet', key, value: v ?? 0 })} />
                </label>
                <div className="text-xs text-muted-foreground">Histori {fmtNum(hist)} kg/hari {over && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'tonReset', key })}>Reset ke histori</Button>}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Histori aktual</div>
                <div>{act.weight ? `${fmtNum(act.weight / histDays(sim))} kg/hari · margin ${fmtIdr(act.margin / act.weight)}/kg` : <span className="text-xs text-muted-foreground">Belum ada histori</span>}</div>
                <div className="text-xs text-muted-foreground">{groupNames(source, key)}</div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Slot time</div>
                <SlotEditor route={route} dispatch={dispatch} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead><tr><th className={TH}>Vendor</th><th className={TH}>Airlines</th><th className={THN}>Cost / kg</th><th className={THN}>Load / hari</th><th className={THN}>Margin / kg</th><th className={THN}>Kg / hari</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / hari</th></tr></thead>
                <tbody>
                  {lanes.length ? lanes.map((x, i) => {
                    const l = x.lane
                    const usable = l.enabled && !!x.account?.enabled && x.account.tranches.length > 0
                    const kg = kgOf[l.id] ?? 0
                    const r = recKg[l.id] ?? 0
                    const first = i === 0 || lanes[i - 1].lane.vendor !== l.vendor
                    return (
                      <tr key={l.id} className={ROW}>
                        <td className={`${TD} whitespace-nowrap`}>{first && <>{x.account?.name ?? l.vendor}<EspTag account={x.account} /></>}</td>
                        <td className={`${TD} whitespace-nowrap`}>{l.airline}</td>
                        <td className={TDN} title={`Rincian: SG Out ${fmtIdr(l.costSgOut)} + SG In ${fmtIdr(l.costSgIn)} + RA ${fmtIdr(l.costRa)} + SMU ${fmtIdr(l.costSmu)}`}>
                          {fmtIdr(l.costPerKg)}{l.edited.costPerKg && <span className="text-xs text-muted-foreground"> (edited)</span>}
                          <div className="text-xs text-muted-foreground">data {fmtIdr(l.db.costPerKg)}</div>
                        </td>
                        <td className={TDN}><NumInput ariaLabel={`Load per hari ${l.vendor} ${l.airline}`} className="w-20" step={10} edited={l.edited.loadKg} value={l.loadKg} onCommit={(v) => dispatch({ type: 'laneSet', id: l.id, field: 'loadKg', value: v })} /></td>
                        <td className={TDN}><Signed value={x.m.netPerKg} /></td>
                        <td className={TDN}>
                          <NumInput ariaLabel={`Kg per hari ${l.vendor} ${l.airline}`} className="w-20" disabled={!usable} value={kg} onCommit={(v) => dispatch({ type: 'simKg', id: l.id, value: v ?? 0 })} />
                          {!usable ? <div className="text-xs text-muted-foreground">{unusableLaneNote(l, x.account)}</div>
                            : manual ? (kg !== r && <div className="text-xs text-muted-foreground">saran {fmtNum(r)}</div>)
                            : r > 0 && <div><Tag tone="best">Disarankan</Tag></div>}
                        </td>
                        <td className={TDN}>{fmtIdr(kg * x.m.costPerKg)}</td>
                        <td className={TDN}><Signed value={kg * x.m.netPerKg} /></td>
                      </tr>
                    )
                  }) : <tr><td colSpan={8} className={TD}><Hint>Belum ada data AWB untuk rute ini.</Hint></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const changedCash = Object.keys(sim.sim.cash).length > 0
  const warnings = res.violations
  return (
    <>
      <Card>
        <CardHead icon={FlaskConical} title="Coba-coba" />
        <CardContent className="pt-4">
          <Hint>Satu menu untuk mencoba. Di atas: hal yang bukan per rute, yaitu duit sisa tiap modal, siklus bayar, COF, dan jangka hari. Di bawah: tiap rute dengan rate, tonase, slot, serta vendor dan airlines-nya. Rate, tonase, load, siklus bayar, dan COF yang diubah di sini adalah data yang sama dengan tab 1, 2, 3, dan 5.</Hint>
        </CardContent>
      </Card>

      <Card>
        <CardHead
          icon={UserPlus}
          title="Tambah vendor"
          actions={<AddAccountForm source={source} sim={sim} dispatch={dispatch} />}
        />
        <CardContent className="pt-4">
          <Hint>Tambah akun vendor langsung dari sini — vendor akan langsung muncul di tab 1 dan ikut dihitung di simulasi. Isi modal dan COF-nya setelah ditambahkan.</Hint>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b bg-surface-3 p-4">
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Untuk berapa hari ke depan</span>
            <NumInput ariaLabel="Untuk berapa hari ke depan" className="w-28" min={1} placeholder="terus" value={days} onCommit={(v) => dispatch({ type: 'simDays', value: v })} />
            <Hint>Kosongkan bila jalan terus</Hint>
          </label>
          <Kpi label="Total duit sisa" value={fmtIdr(res.totals.cash)} />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!changedCash} onClick={() => dispatch({ type: 'simCashReset' })}>Samakan dengan modal tab 1</Button>
            <Button size="sm" disabled={!manual} onClick={() => dispatch({ type: 'simAuto' })}>Pakai rekomendasi</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr><th className={TH}>Akun</th><th className={TH}>Modal</th><th className={THN}>Duit sisa (Rp)</th><th className={THN}>Siklus bayar (hari)</th><th className={THN}>COF</th><th className={THN}>Boleh dipakai / hari</th><th className={THN}>Dipakai / hari</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {res.perTranche.length ? res.perTranche.map((x, i) => {
                const first = i === 0 || res.perTranche[i - 1].account.id !== x.account.id
                const tr = x.tranche
                return (
                  <tr key={tr.id} className={ROW}>
                    <td className={`${TD} whitespace-nowrap`}>{first && <>{x.account.name}<EspTag account={x.account} /></>}</td>
                    <td className={`${TD} whitespace-nowrap`}>{tr.label}</td>
                    <td className={TDN}>
                      <NumInput ariaLabel={`Duit sisa ${tr.label}`} className="w-36" step={1_000_000} value={x.cash} onCommit={(v) => dispatch({ type: 'simCash', trancheId: tr.id, value: v })} />
                      <div className="text-xs text-muted-foreground">{x.cash === Number(tr.amount) ? 'sama dengan modal' : `modal ${fmtIdr(tr.amount)}`}</div>
                    </td>
                    <td className={TDN}><NumInput ariaLabel={`Siklus bayar ${tr.label} dalam hari`} className="w-16" min={1} value={cycleDays(tr)} onCommit={(v) => dispatch({ type: 'trSet', trancheId: tr.id, field: 'cycleDays', value: v ?? 1 })} /></td>
                    <td className={`${TDN} whitespace-nowrap`}>
                      <NumInput ariaLabel={`Nilai COF ${tr.label}`} className="w-20" step={0.01} value={tr.cofValue} onCommit={(v) => dispatch({ type: 'trSet', trancheId: tr.id, field: 'cofValue', value: v ?? 0 })} />{' '}
                      <span className="text-xs text-muted-foreground">{tr.cofType === 'percent' ? '%' : 'Rp'}{tr.cofUnit === 'day' ? ' / hari' : ' / bulan'}</span>
                    </td>
                    <td className={TDN}>{fmtIdr(x.budgetDay)}</td>
                    <td className={TDN}>{fmtIdr(x.spendDay)}</td>
                    <td className={TD}><MoneyStatus x={x} days={days} /></td>
                  </tr>
                )
              }) : <tr><td colSpan={8} className={TD}><Hint>Tidak ada akun aktif. Aktifkan akun di tab 1.</Hint></td></tr>}
            </tbody>
          </table>
        </div>
        <Hint className="px-4 py-2">Duit sisa hanya dipakai di tab ini dan tidak mengubah modal di tab 1. Boleh dipakai per hari = duit sisa dibagi jangka hari, atau dibagi siklus bayar bila jangkanya lebih panjang dari siklus. Siklus bayar dan COF di sini sama dengan tab 1.</Hint>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <Hint>Setelah mengubah field vendor di atas (duit sisa, siklus bayar, COF) atau menambah vendor baru, klik <b>Run</b> untuk melihat hasil estimasi di tab 8.</Hint>
        <Button size="sm" onClick={onRun}>Run estimasi →</Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b bg-surface-3 p-4">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{days ? `Duit ${fmtIdr(t.cash)} untuk ${days} hari ke depan` : `Duit ${fmtIdr(t.cash)}, dipakai terus-menerus`}</div>
          <div className="font-display text-base font-bold">Jalankan {run.length} dari {res.perRoute.length} rute, net {fmtIdr(t.net * span)} dalam {span} hari</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {manual
              ? (warnings.length
                ? <span className="font-medium text-bad">Isian manual ini melanggar batas, jadi angka di bawah tidak bisa dicapai. Lihat peringatan.</span>
                : <>Ini isian manual. Selisih dari rekomendasi: <span className={diff < 0 ? 'font-medium text-bad' : 'font-medium text-brand-ink'}>{fmtIdr(diff)}</span> per hari.</>)
              : 'Ini rekomendasi: pembagian dengan margin harian terbesar untuk duit dan jangka di atas. Ubah kg per hari di rute mana pun untuk mencoba sendiri.'}
            {skipped.length > 0 && ` Tidak dijalankan: ${skipped.map((x) => routeLabel(x.route)).join(', ')}.`}
          </p>
        </div>
        <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <Kpi label="Duit dipakai" value={fmtIdr(t.locked)} />
          <Kpi label="Duit menganggur" value={fmtIdr(t.idle)} />
          <Kpi label="Margin / hari" value={fmtIdr(t.gross + t.cashback)} />
          <Kpi label="COF / hari" value={fmtIdr(-t.cof)} tone={-1} />
          <Kpi label="Net / hari" value={fmtIdr(t.net)} tone={t.net} />
          <Kpi label={`Net / ${span} hari`} value={fmtIdr(t.net * span)} tone={t.net} />
        </div>
        {warnings.length > 0 && (
          <div className="px-4 pb-4">
            <Banner tone="danger" title="Peringatan">
              <ul className="list-disc pl-5">{warnings.map((v, i) => <li key={i}>{violationText(v, sim)}</li>)}</ul>
            </Banner>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-3 px-4 py-3">
          <h3 className="font-display text-sm font-bold">Per rute <span className="text-xs font-normal text-muted-foreground">klik rute untuk melihat dan mengubah detailnya</span></h3>
          <div className="flex flex-wrap gap-2">
            <RouteFilterBar source={source} value={filter} onChange={setFilter} />
            <Button variant="outline" size="sm" onClick={() => setOpen(new Set(visible))}>Buka semua</Button>
            <Button variant="outline" size="sm" disabled={!open.size} onClick={() => setOpen(new Set())}>Tutup semua</Button>
          </div>
        </div>
        {res.perRoute.filter((pr) => visible.has(pr.route.key)).map(routeItem)}
        {!res.perRoute.some((pr) => visible.has(pr.route.key)) && <Hint className="p-4">Tidak ada rute pada filter ini.</Hint>}
      </div>
    </>
  )
}
