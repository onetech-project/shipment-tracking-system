'use client'

import { useState } from 'react'
import { useUpdateSmu, useBulkUpdateSmu } from '../../hooks/useBarhal'
import { BarhalKoli } from '../../types'

interface Step4SmuProps {
  koli: BarhalKoli
  onSaved: (koli: BarhalKoli) => void
}

export function Step4Smu({ koli, onSaved }: Step4SmuProps) {
  const [smuNumber, setSmuNumber] = useState(koli.smu_number ?? '')
  const [airlines, setAirlines] = useState(koli.airlines ?? '')
  const [flightNo, setFlightNo] = useState(koli.flight_no ?? '')
  const [std, setStd] = useState(koli.std ? koli.std.slice(0, 16) : '')
  const [sta, setSta] = useState(koli.sta ? koli.sta.slice(0, 16) : '')
  const [error, setError] = useState<string | null>(null)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSmuNumber, setBulkSmuNumber] = useState('')
  const [bulkAirlines, setBulkAirlines] = useState('')
  const [bulkFlightNo, setBulkFlightNo] = useState('')
  const [bulkStd, setBulkStd] = useState('')
  const [bulkSta, setBulkSta] = useState('')
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const updateSmu = useUpdateSmu(koli.id)
  const bulkUpdateSmu = useBulkUpdateSmu()

  const handleSave = async () => {
    setError(null)
    try {
      const updated = await updateSmu.mutateAsync({
        smuNumber: smuNumber || undefined,
        airlines: airlines || undefined,
        flightNo: flightNo || undefined,
        std: std || undefined,
        sta: sta || undefined,
      })
      onSaved(updated)
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Gagal menyimpan SMU. Silakan coba lagi.'
      setError(Array.isArray(message) ? message.join(', ') : message)
    }
  }

  const handleBulkApply = async () => {
    setBulkResult(null)
    const result = await bulkUpdateSmu.mutateAsync({
      koliDate: koli.koli_date,
      dest: koli.dest_name,
      smuNumber: bulkSmuNumber || undefined,
      airlines: bulkAirlines || undefined,
      flightNo: bulkFlightNo || undefined,
      std: bulkStd || undefined,
      sta: bulkSta || undefined,
    })
    setBulkResult(`Diterapkan ke ${result.updated} Koli (${koli.koli_date} → ${koli.dest_name})`)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nomor SMU</label>
          <input value={smuNumber} onChange={(e) => setSmuNumber(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Airlines</label>
          <input value={airlines} onChange={(e) => setAirlines(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Flight No</label>
          <input value={flightNo} onChange={(e) => setFlightNo(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">STD</label>
          <input type="datetime-local" value={std} onChange={(e) => setStd(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">STA</label>
          <input type="datetime-local" value={sta} onChange={(e) => setSta(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateSmu.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {updateSmu.isPending ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>

      <div className="rounded-lg border border-border p-4">
        <button type="button" onClick={() => setBulkOpen((v) => !v)} className="text-sm font-medium text-primary underline">
          {bulkOpen ? '▾' : '▸'} Isi SMU Massal ({koli.koli_date} → {koli.dest_name})
        </button>
        {bulkOpen && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Diterapkan ke semua Koli dengan Tanggal + Destinasi yang sama. Kolom kosong tidak akan menimpa data yang sudah ada.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <input placeholder="Nomor SMU" value={bulkSmuNumber} onChange={(e) => setBulkSmuNumber(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input placeholder="Airlines" value={bulkAirlines} onChange={(e) => setBulkAirlines(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input placeholder="Flight No" value={bulkFlightNo} onChange={(e) => setBulkFlightNo(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input type="datetime-local" value={bulkStd} onChange={(e) => setBulkStd(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <input type="datetime-local" value={bulkSta} onChange={(e) => setBulkSta(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <button type="button" onClick={handleBulkApply} disabled={bulkUpdateSmu.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {bulkUpdateSmu.isPending ? 'Menerapkan…' : 'Terapkan'}
              </button>
            </div>
            {bulkResult && <p className="text-sm text-muted-foreground">{bulkResult}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
