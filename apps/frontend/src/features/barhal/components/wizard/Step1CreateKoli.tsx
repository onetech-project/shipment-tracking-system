'use client'

import { useState } from 'react'
import { useBarhalList, useBarhalStations, useCreateKoliShell } from '../../hooks/useBarhal'
import { BarhalKoli } from '../../types'

interface Step1CreateKoliProps {
  koli?: BarhalKoli
  onCreated: (koli: BarhalKoli) => void
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function stripDc(name: string): string {
  return name.trim().replace(/\s+DC$/i, '').trim()
}

function previewKoliNumber(koliDate: string, origin: string, dest: string, nextSequence: number | undefined): string {
  if (!koliDate || !origin || !dest) return ''
  const [, month, day] = koliDate.split('-').map(Number)
  const sequence = nextSequence ?? '…'
  return `${day}${MONTH_ABBR[month - 1]}-${stripDc(origin)}-${stripDc(dest)}-Barhal${sequence}`
}

export function Step1CreateKoli({ koli: existingKoli, onCreated }: Step1CreateKoliProps) {
  const [koliDate, setKoliDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [komoditi, setKomoditi] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: stations } = useBarhalStations()
  const createShell = useCreateKoliShell()

  const previewFiltersReady = !!koliDate && !!origin && !!dest
  const { data: existingForRoute } = useBarhalList(
    { date: koliDate, origin, dest, page: 1, pageSize: 1 },
    { enabled: previewFiltersReady },
  )
  const nextSequenceDisplay = previewFiltersReady && existingForRoute ? existingForRoute.total + 1 : undefined

  const canSubmit = !!koliDate && !!origin && !!dest && !!komoditi && !createShell.isPending

  const handleSubmit = async () => {
    setError(null)
    try {
      const koli = await createShell.mutateAsync({ koliDate, origin, dest, komoditi })
      onCreated(koli)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal membuat Koli. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  if (existingKoli) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tanggal</label>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">{existingKoli.koli_date}</div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Origin</label>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">{existingKoli.origin_name}</div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Destinasi</label>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">{existingKoli.dest_name}</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Komoditi</label>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">{existingKoli.komoditi}</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">No. Koli</label>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-sm">{existingKoli.koli_number}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Tanggal, origin, dan destinasi tidak dapat diubah setelah Koli dibuat.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onCreated(existingKoli)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Lanjut
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tanggal</label>
          <input
            type="date"
            value={koliDate}
            onChange={(e) => setKoliDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Origin</label>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Pilih origin —</option>
            {(stations?.origins ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Destinasi</label>
          <select
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Pilih destinasi —</option>
            {(stations?.dests ?? []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Komoditi</label>
        <select
          value={komoditi}
          onChange={(e) => setKomoditi(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Pilih komoditi —</option>
          <option value="HP">HP</option>
          <option value="Bukan HP">Bukan HP</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Preview ID Koli</label>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 font-mono text-sm">
          {previewKoliNumber(koliDate, origin, dest, nextSequenceDisplay) || '—'}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {createShell.isPending ? 'Membuat…' : 'Buat Koli'}
        </button>
      </div>
    </div>
  )
}
