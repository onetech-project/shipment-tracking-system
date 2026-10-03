'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DAYS_PER_MONTH, cycleDays, histDays, periodShort, trancheBudget, trancheCofPerDay } from '../../engine'
import { Account } from '../../types'
import { fmtIdr, fmtShort } from '../../utils/format'
import { Hint, NumInput, Tag, TabProps, TD, TDN, TH, THN, ROW_SUBTOTAL } from '../ui'

let seq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`

function AccountCard({ account: a, dispatch }: { account: Account } & Pick<TabProps, 'dispatch'>) {
  const totalModal = a.tranches.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const totalCof = a.tranches.reduce((s, t) => s + trancheCofPerDay(t) * DAYS_PER_MONTH, 0)
  const set = (trancheId: string, field: 'label' | 'amount' | 'cofType' | 'cofValue' | 'cofUnit' | 'cycleDays', value: string | number) =>
    dispatch({ type: 'trSet', trancheId, field, value })
  return (
    <div className="rounded-md border bg-card" style={a.enabled ? undefined : { opacity: 0.6 }}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{a.name}</h3>
        {a.isEsp && <Tag tone="esp">ESP · cashback 2% (tetap)</Tag>}
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={a.enabled} onChange={(e) => dispatch({ type: 'acctSet', id: a.id, field: 'enabled', value: e.target.checked })} /> Ikut simulasi
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={a.isEsp} onChange={(e) => dispatch({ type: 'acctSet', id: a.id, field: 'isEsp', value: e.target.checked })} /> Akun ESP
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{a.tranches.length} modal, total {fmtIdr(totalModal)}</span>
        <Button
          variant="outline"
          size="sm"
          className="text-red-700 dark:text-red-400"
          onClick={() => {
            if (window.confirm(`Hapus akun ${a.name}? Airlines miliknya di tab 2 tetap tampil dari data AWB tetapi tidak ikut dihitung.`)) dispatch({ type: 'acctDel', id: a.id })
          }}
        >
          Hapus Akun
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>Label modal</th><th className={THN}>Modal (Rp)</th><th className={TH}>Tipe COF</th><th className={THN}>Nilai COF</th>
              <th className={TH}>Satuan COF</th><th className={THN}>Siklus bayar (hari)</th><th className={THN}>COF / 30 hari</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            {a.tranches.length ? a.tranches.map((t) => (
              <tr key={t.id}>
                <td className={TD}>
                  <input key={`${t.id}:${t.label}`} aria-label="Label modal" className="h-8 w-40 rounded border border-input bg-background px-2 text-sm" defaultValue={t.label} onBlur={(e) => set(t.id, 'label', e.target.value)} />
                </td>
                <td className={TDN}>
                  <NumInput ariaLabel="Nominal modal" className="w-36" step={1_000_000} value={t.amount} onCommit={(v) => set(t.id, 'amount', v ?? 0)} />
                  <div className="text-xs text-muted-foreground">Rp {fmtShort(t.amount)}</div>
                </td>
                <td className={TD}>
                  <select aria-label="Tipe COF" className="h-8 rounded border border-input bg-background px-2 text-sm" value={t.cofType} onChange={(e) => set(t.id, 'cofType', e.target.value)}>
                    <option value="percent">Persen (%)</option><option value="nominal">Nominal (Rp)</option>
                  </select>
                </td>
                <td className={TDN}><NumInput ariaLabel="Nilai COF" className="w-24" step={0.01} value={t.cofValue} onCommit={(v) => set(t.id, 'cofValue', v ?? 0)} /></td>
                <td className={TD}>
                  <select aria-label="Satuan COF" className="h-8 rounded border border-input bg-background px-2 text-sm" value={t.cofUnit} onChange={(e) => set(t.id, 'cofUnit', e.target.value)}>
                    <option value="month">per bulan</option><option value="day">per hari</option>
                  </select>
                </td>
                <td className={TDN}>
                  <NumInput ariaLabel="Siklus bayar dalam hari" className="w-16" min={1} value={cycleDays(t)} onCommit={(v) => set(t.id, 'cycleDays', v ?? 1)} />
                  <div className="text-xs text-muted-foreground">boleh dipakai {fmtIdr(trancheBudget(t).perDay)} / hari</div>
                </td>
                <td className={TDN}>{fmtIdr(trancheCofPerDay(t) * DAYS_PER_MONTH)}</td>
                <td className={TDN}>
                  <Button variant="outline" size="sm" className="text-red-700 dark:text-red-400" onClick={() => {
                    if (window.confirm(`Hapus modal "${t.label}" dari akun ${a.name}?`)) dispatch({ type: 'trDel', trancheId: t.id })
                  }}>Hapus</Button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className={TD}><Hint>Belum ada modal. Akun tanpa modal tidak mendapat alokasi.</Hint></td></tr>
            )}
            <tr className={ROW_SUBTOTAL}>
              <td className={TD}>Total {a.name}</td><td className={TDN}>{fmtIdr(totalModal)}</td><td colSpan={4} className={TD} /><td className={TDN}>{fmtIdr(totalCof)}</td><td className={TD} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'trAdd', accountId: a.id, trancheId: newId(a.id) })}>+ Tambah Modal</Button>
      </div>
    </div>
  )
}

export function SetupTab({ source, sim, dispatch }: TabProps) {
  const unused = source.vendors.filter((v) => !sim.accounts.some((a) => a.id === v.vendor))
  const [pick, setPick] = useState(unused[0]?.vendor ?? '')
  const vendor = unused.some((v) => v.vendor === pick) ? pick : unused[0]?.vendor ?? ''
  return (
    <>
      <div className="rounded-md border bg-card p-4">
        <h2 className="text-base font-semibold">Rentang histori</h2>
        <Hint className="mb-3">
          Histori dipakai untuk rata-rata tonase rute per hari (tab 5) dan distribusi aktual (tab 7). Rentang sekarang {histDays(sim)} hari. Simulasi tidak memakai tanggal mulai atau horizon: semua dihitung per hari, dan modal berputar mengikuti siklus bayarnya.
        </Hint>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['histStart', 'histEnd'] as const).map((field) => (
            <label key={field} className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{field === 'histStart' ? 'Histori mulai' : 'Histori akhir'}</span>
              <select className="h-8 w-full rounded border border-input bg-background px-2 text-sm" value={sim[field]} onChange={(e) => dispatch({ type: 'setPeriod', field, value: e.target.value })}>
                {source.cycles.map((c) => <option key={c} value={c}>{periodShort(c)}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Akun & Modal</h2>
          <Hint>Satu akun bisa punya banyak modal, masing-masing dengan COF dan siklus bayar sendiri. Siklus bayar = berapa hari sampai uang yang dipakai kembali. Modal yang boleh dipakai per hari = modal dibagi siklus bayar. Cashback akun ESP tetap 2% dari revenue.</Hint>
        </div>
        <div className="flex gap-2">
          <select aria-label="Vendor untuk akun baru" className="h-8 rounded border border-input bg-background px-2 text-sm" disabled={!unused.length} value={vendor} onChange={(e) => setPick(e.target.value)}>
            {unused.length ? unused.map((v) => <option key={v.vendor} value={v.vendor}>{v.vendor}</option>) : <option>Semua vendor sudah jadi akun</option>}
          </select>
          <Button size="sm" disabled={!unused.length} onClick={() => dispatch({ type: 'acctAdd', vendor, trancheId: newId(vendor) })}>+ Tambah Akun</Button>
        </div>
      </div>
      {sim.accounts.length
        ? sim.accounts.map((a) => <AccountCard key={a.id} account={a} dispatch={dispatch} />)
        : <div className="rounded-md border bg-card p-4"><Hint>Belum ada akun. Tambah akun untuk mulai simulasi.</Hint></div>}
    </>
  )
}
