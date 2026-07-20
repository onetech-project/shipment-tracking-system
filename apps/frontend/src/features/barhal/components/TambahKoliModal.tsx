'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAvailableTos, useBarhalRoutes, useCreateBarhalKoli } from '../hooks/useBarhal'
import { ToMultiSelect } from './ToMultiSelect'
import { SmuDataSection } from './SmuDataSection'

interface TambahKoliModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function TambahKoliModal({ open, onClose, onCreated }: TambahKoliModalProps) {
  const [koliDate, setKoliDate] = useState('')
  const [route, setRoute] = useState('')
  const [selectedTos, setSelectedTos] = useState<string[]>([])
  const [packingKayuWeight, setPackingKayuWeight] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [widthCm, setWidthCm] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: routes } = useBarhalRoutes()
  const { data: availableTos, isLoading: isLoadingTos } = useAvailableTos({ route: route || undefined })
  const createKoli = useCreateBarhalKoli()

  const selectedToRows = useMemo(
    () => (availableTos ?? []).filter((t) => selectedTos.includes(t.to_number)),
    [availableTos, selectedTos],
  )

  const weightBefore = useMemo(
    () => selectedToRows.reduce((sum, t) => sum + Number(t.gross_weight ?? 0), 0),
    [selectedToRows],
  )
  const packingKayu = Number(packingKayuWeight) || 0
  const weightAfter = weightBefore + packingKayu
  const volume =
    lengthCm && widthCm && heightCm ? Number(lengthCm) * Number(widthCm) * Number(heightCm) : null

  const canSubmit = !!koliDate && !!route && selectedTos.length > 0 && !createKoli.isPending

  const reset = () => {
    setKoliDate('')
    setRoute('')
    setSelectedTos([])
    setPackingKayuWeight('')
    setLengthCm('')
    setWidthCm('')
    setHeightCm('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    setError(null)
    try {
      await createKoli.mutateAsync({
        koliDate,
        route,
        toNumbers: selectedTos,
        packingKayuWeight: packingKayu || undefined,
        lengthCm: lengthCm ? Number(lengthCm) : undefined,
        widthCm: widthCm ? Number(widthCm) : undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
      })
      onCreated()
      handleClose()
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal membuat Koli. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tambah Koli</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto py-2">
          <div className="grid grid-cols-2 gap-3">
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
              <label className="text-sm font-medium">Rute</label>
              <select
                value={route}
                onChange={(e) => {
                  setRoute(e.target.value)
                  setSelectedTos([])
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Pilih rute —</option>
                {(routes ?? []).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Pilih TO</label>
            <ToMultiSelect
              options={availableTos ?? []}
              selected={selectedTos}
              onChange={setSelectedTos}
              isLoading={isLoadingTos}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Weight Before</label>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                {fmt.format(weightBefore)} kg
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Packing Kayu (kg)</label>
              <input
                type="number"
                min={0}
                value={packingKayuWeight}
                onChange={(e) => setPackingKayuWeight(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Weight After</label>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              {fmt.format(weightAfter)} kg
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Panjang (cm)</label>
              <input
                type="number"
                min={0}
                value={lengthCm}
                onChange={(e) => setLengthCm(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lebar (cm)</label>
              <input
                type="number"
                min={0}
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tinggi (cm)</label>
              <input
                type="number"
                min={0}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Volume</label>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                {volume != null ? `${fmt.format(volume)} cm³` : '—'}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Data SMU</label>
            <SmuDataSection selected={selectedToRows} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex gap-1">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition hover:bg-muted"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {createKoli.isPending ? 'Menyimpan…' : 'Simpan'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
