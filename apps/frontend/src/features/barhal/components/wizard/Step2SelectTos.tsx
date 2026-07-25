'use client'

import { useMemo, useState } from 'react'
import { useAvailableTos, useAttachTos, useBarhalStations } from '../../hooks/useBarhal'
import { ToMultiSelect } from '../ToMultiSelect'
import { BarhalKoli } from '../../types'

interface Step2SelectTosProps {
  koli: BarhalKoli
  onAttached: (koli: BarhalKoli) => void
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function Step2SelectTos({ koli, onAttached }: Step2SelectTosProps) {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [origin, setOrigin] = useState(koli.origin_name)
  const [dest, setDest] = useState(koli.dest_name)
  const [selected, setSelected] = useState<string[]>(() => koli.lines?.map((l) => l.to_number) ?? [])
  const [error, setError] = useState<string | null>(null)

  const { data: stations } = useBarhalStations()
  const { data: availableTos, isLoading } = useAvailableTos({
    search: search || undefined,
    date: date || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
    koliId: koli.id,
  })
  const attachTos = useAttachTos(koli.id)

  const selectedRows = useMemo(
    () => (availableTos ?? []).filter((t) => selected.includes(t.to_number)),
    [availableTos, selected],
  )
  const totalWeight = selectedRows.reduce((sum, t) => sum + Number(t.gross_weight ?? 0), 0)

  const handleSubmit = async () => {
    setError(null)
    try {
      const updated = await attachTos.mutateAsync({ toNumbers: selected })
      onAttached(updated)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menambahkan TO. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Cari TO / LT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Semua Origin</option>
          {(stations?.origins ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Semua Destinasi</option>
          {(stations?.dests ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <ToMultiSelect options={availableTos ?? []} selected={selected} onChange={setSelected} isLoading={isLoading} />

      <div className="flex items-center gap-3 text-sm">
        <span className="rounded-full bg-muted px-3 py-1">Dipilih: {selectedRows.length} TO</span>
        <span className="rounded-full bg-muted px-3 py-1">Total berat: {fmt.format(totalWeight)} kg</span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={attachTos.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {attachTos.isPending ? 'Menyimpan…' : 'Lanjut'}
        </button>
      </div>
    </div>
  )
}
