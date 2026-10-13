'use client'

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { clampHorizon, evaluatePlan, groupNames, horizonDays, optimizePlan, periodShort, periodsForward, simStartOptions } from '../../engine'
import { fmtIdr, fmtNum, fmtPct } from '../../utils/format'
import { ReasonTag, TotalsBar } from '../Reason'
import { EspTag, Hint, NumInput, RouteChip, Signed, Tag, TabProps, TD, TDN, TH, THN, ROW_BAND, ROW_SUBTOTAL } from '../ui'

const LABEL = 'mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground'

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
    <div className="rounded-md border bg-card p-4">
      <h3 className="mb-1 text-sm font-semibold">Periode estimasi</h3>
      <Hint className="mb-3">
        Pilih simulasi mulai dan jumlah periode, lalu tekan <b>Run</b> untuk menghitung hasil di bawah. 1 periode = setengah bulan (H1 tanggal 1 sampai 15, H2 tanggal 16 sampai akhir bulan). Rentang estimasi yang sedang ditampilkan: <b>{rangeLabel}</b> ({H} periode).
      </Hint>
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
        <label className="block">
          <span className={LABEL}>Simulasi mulai</span>
          <select aria-label="Simulasi mulai" className="h-8 w-full rounded border border-input bg-background px-2 text-sm" disabled={!choices.length} value={start} onChange={(e) => setDraftStart(e.target.value)}>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-4xl">
          <h2 className="text-base font-semibold">Distribusi Optimal</h2>
          <Hint>Tiap rute: sebaiknya dijalankan vendor apa, naik airlines apa, dan berapa kg per hari, kalau modal dipakai terus-menerus. Faktor: tab 1 (modal, COF, siklus bayar), tab 2 (vendor dan airlines, cost, load), tab 3 (rate SPX), tab 5 (tonase rute).</Hint>
          <Hint>Cara hitung: dicari pembagian dengan margin harian terbesar (program linear, hasilnya eksak) dalam tiga batas: tonase rute per hari, load tiap airlines per hari, dan modal per hari = modal dibagi siklus bayar. Satu rute hanya dipecah bila lane terbaiknya penuh atau modal vendornya tidak cukup.</Hint>
        </div>
        <Button size="sm" onClick={onOpenSim}>Buka Coba-coba</Button>
      </div>
      <PeriodCard source={source} sim={sim} dispatch={dispatch} />
      {noCapital && (
        <div className="rounded-md border bg-card p-3">
          <Hint>Belum ada modal. Isi nominal modal tiap akun di tab 1 · Setup Histori & Akun untuk melihat rekomendasi.</Hint>
        </div>
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
            {res.perRoute.length ? res.perRoute.map((pr) => (
              <React.Fragment key={pr.route.key}>
                <tr className={ROW_BAND}>
                  <td colSpan={6} className={TD}>
                    <RouteChip route={pr.route} /> <span className="text-xs font-normal text-muted-foreground">{groupNames(source, pr.route.key)} · Tonase {fmtNum(pr.demand)} kg/hari · Terlayani {fmtNum(pr.served)} kg · Margin rute {fmtIdr(pr.net)}/hari</span> <ReasonTag pr={pr} />
                  </td>
                </tr>
                {pr.rows.length ? pr.rows.map((r) => (
                  <tr key={r.lane.id}>
                    <td className={`${TD} pl-7`}>{r.account.name}<EspTag account={r.account} /></td><td className={TD}>{r.lane.airline}</td>
                    <td className={TDN}>{fmtNum(r.kg)}</td><td className={TDN}>{fmtIdr(r.costDay)}</td><td className={TDN}><Signed value={r.netDay} /></td><td className={TDN}><Signed value={r.netDay * D} /></td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className={`${TD} pl-7`}><Hint>{pr.reason === 'none' ? 'Belum ada airlines yang layak di rute ini. Cek centang Ikut dan cost di tab 2, serta tonase di tab 5.' : noCapital ? 'Belum ada modal untuk dialokasikan. Isi modal di tab 1.' : 'Modal vendor di rute ini lebih menguntungkan dipakai di rute lain.'}</Hint></td></tr>
                )}
              </React.Fragment>
            )) : <tr><td colSpan={6} className={TD}><Hint>Belum ada rute. Tambah rute di tab 5.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-md border bg-card">
        <h3 className="px-4 pb-2 pt-3 text-sm font-semibold">Pemakaian modal</h3>
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Akun</th><th className={TH}>Modal</th><th className={THN}>Nominal</th><th className={THN}>Terkunci</th><th className={THN}>Terpakai</th><th className={THN}>Siklus bayar</th><th className={THN}>COF / {span}</th><th className={THN}>Net akun / {span}</th></tr></thead>
          <tbody>
            {res.perAccount.length ? res.perAccount.map((pa) => (
              <React.Fragment key={pa.account.id}>
                {res.perTranche.filter((x) => x.account.id === pa.account.id).map((x) => (
                  <tr key={x.tranche.id}>
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
