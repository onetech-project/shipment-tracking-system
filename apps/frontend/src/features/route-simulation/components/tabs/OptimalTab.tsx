'use client'

import React, { useMemo, useState } from 'react'
import { Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { Banner } from '@/components/shared/banner'
import {
  EspVsPartner, LaneEconomics, clampHorizon, espVsPartner, evaluatePlan, groupNames, horizonDays, optimizePlan, periodShort, periodsForward, simStartOptions,
} from '../../engine'
import { fmtIdr, fmtNum, fmtPct } from '../../utils/format'
import { ReasonTag, TotalsBar } from '../Reason'
import { EspTag, FIELD, Hint, NumInput, RouteChip, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW, ROW_BAND, ROW_SUBTOTAL } from '../ui'

const LABEL = 'mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground'
const SUB = 'text-xs text-muted-foreground'
const CMP_HEAD = 'bg-info-soft/60'
const CMP_ROW = 'bg-surface-3'

function Verdict({ c }: { c: EspVsPartner }) {
  // One-sided cases: the prototype read bestPartner.account.name here and crashed (ESP only) or
  // printed "unggul Rp 0/kg" (partner only). Name the side that has no lane instead.
  if (c.winner === 'esp' && !c.bestPartner) return <Tag tone="best">Pakai ESP sendiri: vendor lain belum punya lane layak</Tag>
  if (c.winner === 'partner' && !c.esp) return <Tag tone="warn">Pakai {c.bestPartner!.account.name}: ESP belum punya lane layak</Tag>
  if (c.winner === 'esp') return <Tag tone="best">Pakai ESP sendiri unggul {fmtIdr(c.gap)}/kg vs {c.bestPartner!.account.name}</Tag>
  if (c.winner === 'partner') return <Tag tone="warn">Pakai {c.bestPartner!.account.name} unggul {fmtIdr(-c.gap)}/kg vs ESP</Tag>
  if (c.winner === 'tie') return <Tag>ESP dan vendor lain seimbang</Tag>
  return <span className={SUB}>Belum cukup data untuk membandingkan</span>
}

function CompareRow({ x }: { x: LaneEconomics }) {
  return (
    <tr className={CMP_ROW}>
      <td className={`${TD} pl-7`}>{x.account.isEsp ? <Tag tone="esp">ESP sendiri</Tag> : <Tag>Vendor lain</Tag>} {x.account.name}<EspTag account={x.account} /></td>
      <td className={TD}>{x.lane.airline}</td>
      <td className={TDN}>{fmtIdr(x.m.revPerKg)}<div className={SUB}>rate SPX</div></td>
      <td className={TDN}>{fmtIdr(x.m.costPerKg)}<div className={SUB}>cost/kg</div></td>
      <td className={TDN}>{x.account.isEsp ? <>{fmtIdr(x.m.cashbackPerKg)}<div className={SUB}>cashback 2%</div></> : <span className="text-muted-foreground">-</span>}</td>
      <td className={TDN}><Signed value={x.m.netPerKg} /><div className={SUB}>margin/kg</div></td>
    </tr>
  )
}

function LoadTag({ total, demand }: { total: number; demand: number }) {
  if (total < 1) return <Tag tone="warn">belum ada load</Tag>
  if (demand - total > 0) return <Tag tone="warn">kurang {fmtNum(demand - total)} kg</Tag>
  return <Tag tone="best">cukup</Tag>
}

// Start and horizon are drafted here and reach the scenario only on Run, as in the prototype. The
// plan is per day, so they scale the totals below and label the estimate.
function PeriodCard({ source, sim, dispatch }: TabProps) {
  const H = sim.horizonPeriods
  const range = periodsForward(sim.simStart, H)
  const rangeLabel = range.length ? `${periodShort(range[0])} s.d. ${periodShort(range[range.length - 1])}` : '-'
  const [draftStart, setDraftStart] = useState<string | null>(null)
  const [draftHorizon, setDraftHorizon] = useState<number | null>(null)
  const start = draftStart ?? sim.simStart
  const horizon = draftHorizon ?? H
  const dirty = start !== sim.simStart || horizon !== H
  const options = simStartOptions(source)
  // A scenario saved against older data may start before today's options; keep it selectable.
  const choices = !sim.simStart || options.includes(sim.simStart) ? options : [sim.simStart, ...options]
  const run = () => {
    dispatch({ type: 'setSimRange', simStart: start, horizonPeriods: horizon })
    setDraftStart(null)
    setDraftHorizon(null)
  }
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-1 font-display text-sm font-bold tracking-[-0.01em]">Periode estimasi</h3>
      <Hint className="mb-3">
        Pilih simulasi mulai dan jumlah periode, lalu tekan <b>Run</b> untuk menghitung hasil di bawah. 1 periode = setengah bulan (H1 tanggal 1 sampai 15, H2 tanggal 16 sampai akhir bulan). Rentang estimasi yang sedang ditampilkan: <b>{rangeLabel}</b> ({H} periode).
      </Hint>
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
        <label className="block">
          <span className={LABEL}>Simulasi mulai</span>
          <select aria-label="Simulasi mulai" className={`${FIELD} w-full`} disabled={!choices.length} value={start} onChange={(e) => setDraftStart(e.target.value)}>
            {choices.map((c) => <option key={c} value={c}>{periodShort(c)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Horizon simulasi (periode)</span>
          <NumInput ariaLabel="Horizon simulasi (periode)" className="w-full" min={1} value={horizon} onCommit={(v) => setDraftHorizon(clampHorizon(v))} />
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={run}>{dirty ? 'Run perubahan' : 'Run ulang'}</Button>
          {dirty && <Tag tone="esp">belum diterapkan</Tag>}
        </div>
      </div>
    </div>
  )
}

export function OptimalTab({ source, sim, dispatch, onOpenSim }: TabProps & { onOpenSim: () => void }) {
  const res = useMemo(() => evaluatePlan(source, sim, optimizePlan(source, sim)), [source, sim])
  const D = horizonDays(sim)
  const span = `${sim.horizonPeriods} periode`
  const count = (r: string) => res.perRoute.filter((x) => x.reason === r).length
  const short = res.perRoute.filter((x) => x.unmet >= 1 && x.served >= 1).length
  // createState seeds every account with one tranche of amount 0, so a brand-new scenario has no
  // capital anywhere: every route is 'idle' not because it is a bad trade, but because there is
  // nothing to allocate yet. Distinguish that case so the copy points at tab 1 instead of blaming
  // the route.
  const noCapital = res.totals.cash < 1
  return (
    <>
      <Card>
        <CardHead
          icon={Target}
          title="Distribusi Optimal"
          actions={<Button size="sm" onClick={onOpenSim}>Buka Coba-coba</Button>}
        />
        <CardContent className="space-y-1.5 pt-4">
          <Hint>Tiap rute: sebaiknya dijalankan vendor apa, naik airlines apa, dan berapa kg per hari, kalau modal dipakai terus-menerus. Faktor: tab 1 (modal, COF, siklus bayar), tab 2 (vendor dan airlines, cost, load), tab 3 (rate SPX), tab 5 (tonase rute).</Hint>
          <Hint>Cara hitung: dicari pembagian dengan margin harian terbesar (program linear, hasilnya eksak) dalam tiga batas: tonase rute per hari, load tiap airlines per hari, dan modal per hari = modal dibagi siklus bayar. Satu rute hanya dipecah bila lane terbaiknya penuh atau modal vendornya tidak cukup.</Hint>
          <Hint>Di tiap rute juga ditampilkan <b>Perbandingan ESP vs vendor lain</b>: lane terbaik milik ESP sendiri (termasuk cashback 2%) dibandingkan dengan lane terbaik tiap vendor lain, supaya kelihatan di rute mana ESP lebih untung pakai modal sendiri atau menitip ke vendor lain.</Hint>
        </CardContent>
      </Card>
      <PeriodCard key={`${sim.simStart}|${sim.horizonPeriods}`} source={source} sim={sim} dispatch={dispatch} />
      {noCapital && (
        <Banner tone="info" role="note">Belum ada modal. Isi nominal modal tiap akun di tab 1 · Setup Histori & Akun untuk melihat rekomendasi.</Banner>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border bg-card p-3 text-sm">
        <span><b>{count('single')}</b> rute cukup 1 vendor 1 airlines</span>
        <span><b>{count('load')}</b> rute lane terbaiknya penuh, sisanya ke lane berikutnya</span>
        <span><b>{count('modal')}</b> rute terbatas modal vendor</span>
        <span><b>{count('idle')}</b> rute tidak dijalankan</span>
        <span><b>{short}</b> rute tonasenya belum terlayani penuh</span>
      </div>
      <TotalsBar totals={res.totals} days={D} label={span} />
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Vendor</th><th className={TH}>Airlines</th><th className={THN}>Kg / hari</th><th className={THN}>Cost / hari</th><th className={THN}>Margin / hari</th><th className={THN}>Margin / {span}</th></tr></thead>
          <tbody>
            {res.perRoute.length ? res.perRoute.map((pr) => {
              const active = sim.lanes.filter((l) => l.route === pr.route.key && l.enabled)
              const totalLoad = active.reduce((s, l) => s + (Number(l.loadKg) || 0), 0)
              const vendorCount = new Set(active.map((l) => l.vendor)).size
              const cmp = espVsPartner(sim, pr.route.key)
              return (
                <React.Fragment key={pr.route.key}>
                  <tr className={ROW_BAND}>
                    <td colSpan={6} className={TD}>
                      <RouteChip route={pr.route} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, pr.route.key)} · Tonase {fmtNum(pr.demand)} kg/hari · Load/hari ({vendorCount} vendor) {fmtNum(totalLoad)} kg</span> <LoadTag total={totalLoad} demand={pr.demand} /> <span className="text-xs font-normal text-muted-foreground">· Terlayani {fmtNum(pr.served)} kg · Margin rute {fmtIdr(pr.net)}/hari</span> <ReasonTag pr={pr} />
                    </td>
                  </tr>
                  {pr.rows.length ? pr.rows.map((r) => (
                    <tr key={r.lane.id} className={ROW}>
                      <td className={`${TD} pl-7`}>{r.account.name}<EspTag account={r.account} /></td><td className={TD}>{r.lane.airline}</td>
                      <td className={TDN}>{fmtNum(r.kg)}</td><td className={TDN}>{fmtIdr(r.costDay)}</td><td className={TDN}><Signed value={r.netDay} /></td><td className={TDN}><Signed value={r.netDay * D} /></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className={`${TD} pl-7`}><Hint>{pr.reason === 'none' ? 'Belum ada airlines yang layak di rute ini. Cek centang Ikut dan cost di tab 2, serta tonase di tab 5.' : noCapital ? 'Belum ada modal untuk dialokasikan. Isi modal di tab 1.' : 'Modal vendor di rute ini lebih menguntungkan dipakai di rute lain.'}</Hint></td></tr>
                  )}
                  {(cmp.esp || cmp.partners.length > 0) && (
                    <>
                      <tr className={CMP_HEAD}>
                        <td colSpan={6} className={`${TD} pl-7`}>
                          <b>Perbandingan ESP vs vendor lain</b> · <Verdict c={cmp} />
                          <div className={SUB}>Lane terbaik tiap vendor, dasar: margin/kg = Rate SPX - Total Cost (+ cashback 2% jika ESP). Tidak memperhitungkan batas modal/load — murni ekonomi lane.</div>
                        </td>
                      </tr>
                      {cmp.esp ? <CompareRow x={cmp.esp} /> : <tr className={CMP_ROW}><td colSpan={6} className={`${TD} pl-7`}><Hint>ESP belum punya lane layak di rute ini (cek centang Ikut dan cost di tab 2).</Hint></td></tr>}
                      {cmp.partners.length ? cmp.partners.map((x) => <CompareRow key={x.lane.id} x={x} />) : <tr className={CMP_ROW}><td colSpan={6} className={`${TD} pl-7`}><Hint>Vendor lain belum punya lane layak di rute ini.</Hint></td></tr>}
                    </>
                  )}
                </React.Fragment>
              )
            }) : <tr><td colSpan={6} className={TD}><Hint>Belum ada rute. Tambah rute di tab 5.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <h3 className="px-4 pb-2 pt-3.5 font-display text-sm font-bold tracking-[-0.01em]">Pemakaian modal</h3>
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Akun</th><th className={TH}>Modal</th><th className={THN}>Nominal</th><th className={THN}>Terkunci</th><th className={THN}>Terpakai</th><th className={THN}>Siklus bayar</th><th className={THN}>COF / {span}</th><th className={THN}>Net akun / {span}</th></tr></thead>
          <tbody>
            {res.perAccount.length ? res.perAccount.map((pa) => (
              <React.Fragment key={pa.account.id}>
                {res.perTranche.filter((x) => x.account.id === pa.account.id).map((x) => (
                  <tr key={x.tranche.id} className={ROW}>
                    <td className={`${TD} whitespace-nowrap`}>{x.account.name}<EspTag account={x.account} /></td><td className={`${TD} whitespace-nowrap`}>{x.tranche.label}</td>
                    <td className={TDN}>{fmtIdr(x.cash)}</td><td className={TDN}>{fmtIdr(x.locked)}</td>
                    <td className={TDN}>{x.cash < 1 ? <Hint>Belum ada modal</Hint> : x.locked < 1 ? <Tag tone="warn">Menganggur</Tag> : fmtPct(x.locked / x.cash)}</td>
                    <td className={TDN}>{x.refillDay} hari</td><td className={TDN}>{fmtIdr(x.cofDay * D)}</td><td className={TD} />
                  </tr>
                ))}
                <tr className={ROW_SUBTOTAL}>
                  <td colSpan={2} className={TD}>Total {pa.account.name}</td><td className={TDN}>{fmtIdr(pa.modal)}</td><td className={TDN}>{fmtIdr(pa.locked)}</td><td colSpan={2} className={TD} />
                  <td className={TDN}>{fmtIdr(pa.cof * D)}</td><td className={TDN}><Signed value={pa.net * D} /></td>
                </tr>
              </React.Fragment>
            )) : <tr><td colSpan={8} className={TD}><Hint>Tidak ada akun aktif.</Hint></td></tr>}
          </tbody>
        </table>
        <Hint className="px-4 py-2">Terkunci = belanja per hari × siklus bayar, yaitu uang yang sedang menunggu dibayar. Net akun = margin dari rute yang dijalankan, ditambah cashback untuk akun ESP, dikurangi COF semua modalnya.</Hint>
      </div>
    </>
  )
}
