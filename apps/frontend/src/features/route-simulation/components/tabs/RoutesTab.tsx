'use client'

import React, { useState } from 'react'
import { Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHead } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { groupNames, hasOverride, routeHistTon, routeLabel } from '../../engine'
import { SimRoute } from '../../types'
import { fmtNum } from '../../utils/format'
import { FIELD, Hint, NumInput, RouteChip, Tag, TabProps, TD, TDN, TH, THN, ROW } from '../ui'

export function SlotEditor({ route: r, dispatch }: { route: SimRoute } & Pick<TabProps, 'dispatch'>) {
  return (
    <div className="flex flex-wrap items-center">
      {r.slots.length ? r.slots.map((sl, i) => {
        const bad = !!sl.start && !!sl.end && sl.end < sl.start
        const cls = cn(FIELD, bad && 'border-bad focus-visible:border-bad')
        return (
          <span key={i} className="mb-1 mr-2 inline-flex items-center gap-1">
            <input type="time" aria-label={`Jam mulai slot ${i + 1}`} className={cls} value={sl.start} onChange={(e) => dispatch({ type: 'slotSet', key: r.key, index: i, field: 'start', value: e.target.value })} />
            <span className="text-xs text-muted-foreground">s.d.</span>
            <input type="time" aria-label={`Jam selesai slot ${i + 1}`} className={cls} value={sl.end} onChange={(e) => dispatch({ type: 'slotSet', key: r.key, index: i, field: 'end', value: e.target.value })} />
            <Button variant="danger-soft" size="sm" aria-label={`Hapus rentang slot ${i + 1}`} onClick={() => dispatch({ type: 'slotDel', key: r.key, index: i })}>Hapus</Button>
            {bad && <Tag tone="warn">Jam selesai sebelum jam mulai</Tag>}
          </span>
        )
      }) : <span className="mr-2 text-xs text-muted-foreground">Belum ada slot.</span>}
      <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'slotAdd', key: r.key })}>+ Rentang</Button>
    </div>
  )
}

export function RoutesTab({ source, sim, dispatch }: TabProps) {
  const [form, setForm] = useState({ label: '', origin: '', dest: '', rate: '', ton: '' })
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    const originLabel = form.label.trim().toUpperCase()
    const origin = form.origin.trim()
    const dest = form.dest.trim()
    if (!originLabel || !origin || !dest) return setError('Kode asal, kota asal, dan tujuan wajib diisi')
    setError(null)
    dispatch({ type: 'routeAdd', route: { origin, originLabel, dest, rateSpx: Number(form.rate) || 0, overrideTon: Number(form.ton) || 0 } })
    setForm({ label: '', origin: '', dest: '', rate: '', ton: '' })
  }
  const field = (key: keyof typeof form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <input aria-label={label} className={`${FIELD} w-full`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...extra} />
    </label>
  )
  return (
    <>
      <Card>
        <CardHead icon={Route} title="Rute & Slot Time" />
        <CardContent className="pt-4">
          <Hint>Tonase per hari adalah kebutuhan angkut rute dan menjadi batas alokasi di tab 6, 8, dan 9. Nilai awal dari rata-rata histori per hari (termasuk AWB yang belum dibooking vendor), bisa diganti. Slot time boleh lebih dari satu rentang.</Hint>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={TH}>Rute</th><th className={THN}>Tonase / hari (kg)</th><th className={TH}>Slot time</th><th className={TH} /></tr></thead>
          <tbody>
            {sim.routes.length ? sim.routes.map((r) => {
              const hist = Math.round(routeHistTon(source, sim, r.key))
              const over = hasOverride(r)
              return (
                <tr key={r.key} className={ROW}>
                  <td className={TD}><RouteChip route={r} /><div className="text-xs text-muted-foreground">{groupNames(source, r.key)}</div></td>
                  <td className={TDN}>
                    <NumInput ariaLabel={`Tonase per hari ${routeLabel(r)}`} className="w-28" step={10} edited={over} value={over ? r.overrideTon : hist} onCommit={(v) => dispatch({ type: 'tonSet', key: r.key, value: v ?? 0 })} />
                    <div className="text-xs text-muted-foreground">Histori {fmtNum(hist)} kg/hari {over && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'tonReset', key: r.key })}>Reset ke histori</Button>}</div>
                  </td>
                  <td className={TD}><SlotEditor route={r} dispatch={dispatch} /></td>
                  <td className={TDN}>
                    <Button variant="danger-soft" size="sm" onClick={() => {
                      if (window.confirm(`Hapus rute ${routeLabel(r)}? Vendor, airlines, dan isian coba-coba di rute ini ikut hilang dari simulasi.`)) dispatch({ type: 'routeDel', key: r.key })
                    }}>Hapus Rute</Button>
                  </td>
                </tr>
              )
            }) : <tr><td colSpan={4} className={TD}><Hint>Belum ada rute.</Hint></td></tr>}
          </tbody>
        </table>
      </div>
      <Card>
        <CardHead title="Tambah rute" />
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-6">
            {field('label', 'Kode asal', { placeholder: 'CGK', maxLength: 12 })}
            {field('origin', 'Kota asal', { placeholder: 'Jabo', maxLength: 60 })}
            {field('dest', 'Tujuan', { placeholder: 'Manado', maxLength: 60 })}
            {field('rate', 'Rate SPX (Rp/kg)', { type: 'number', min: 0, step: 100 })}
            {field('ton', 'Tonase / hari (kg)', { type: 'number', min: 0, step: 10 })}
            <Button size="sm" onClick={add}>+ Tambah Rute</Button>
          </div>
          {error && <p className="mt-2 text-sm font-medium text-bad">{error}</p>}
        </CardContent>
      </Card>
    </>
  )
}
