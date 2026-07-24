'use client'

import { useState } from 'react'
import { useUpdatePacking } from '../../hooks/useBarhal'
import { BarhalKoli } from '../../types'

interface Step3PackingProps {
  koli: BarhalKoli
  onSaved: (koli: BarhalKoli) => void
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

export function Step3Packing({ koli, onSaved }: Step3PackingProps) {
  const [weightAfter, setWeightAfter] = useState(koli.weight_after != null ? String(koli.weight_after) : '')
  const [lengthCm, setLengthCm] = useState(koli.length_cm != null ? String(koli.length_cm) : '')
  const [widthCm, setWidthCm] = useState(koli.width_cm != null ? String(koli.width_cm) : '')
  const [heightCm, setHeightCm] = useState(koli.height_cm != null ? String(koli.height_cm) : '')
  const [batangKayu, setBatangKayu] = useState(koli.batang_kayu != null ? String(koli.batang_kayu) : '')
  const [error, setError] = useState<string | null>(null)

  const updatePacking = useUpdatePacking(koli.id)

  const weightBefore = koli.weight_before ?? 0
  const kenaikan = weightAfter ? Number(weightAfter) - weightBefore : null
  const volume =
    lengthCm && widthCm && heightCm
      ? (Number(lengthCm) * Number(widthCm) * Number(heightCm)) / 6000
      : null

  const canSubmit = !!weightAfter && !updatePacking.isPending

  const handleSubmit = async () => {
    setError(null)
    try {
      const updated = await updatePacking.mutateAsync({
        weightAfter: Number(weightAfter),
        lengthCm: lengthCm ? Number(lengthCm) : undefined,
        widthCm: widthCm ? Number(widthCm) : undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        batangKayu: batangKayu ? Number(batangKayu) : undefined,
      })
      onSaved(updated)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menyimpan. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Berat Sebelum</label>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            {fmt.format(weightBefore)} kg
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Berat Setelah Packing Kayu (kg)</label>
          <input
            type="number"
            min={0}
            value={weightAfter}
            onChange={(e) => setWeightAfter(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {kenaikan != null && (
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          Kenaikan Berat: <b>{kenaikan >= 0 ? '+' : ''}{fmt.format(kenaikan)} kg</b>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Panjang (cm)</label>
          <input type="number" min={0} value={lengthCm} onChange={(e) => setLengthCm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Lebar (cm)</label>
          <input type="number" min={0} value={widthCm} onChange={(e) => setWidthCm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tinggi (cm)</label>
          <input type="number" min={0} value={heightCm} onChange={(e) => setHeightCm(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Volume</label>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            {volume != null ? fmt.format(volume) : '—'}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Jumlah Batang Kayu</label>
        <input type="number" min={0} value={batangKayu} onChange={(e) => setBatangKayu(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {updatePacking.isPending ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  )
}
