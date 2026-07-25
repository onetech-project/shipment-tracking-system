'use client'

import { useState } from 'react'
import { useBulkUpdateSmu } from '../hooks/useBarhal'
import { BarhalStations } from '../types'
import { TimeSelect } from './TimeSelect'

interface BulkSmuFormProps {
  stations: BarhalStations
  onApplied: () => void
}

const inputClass =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

function combineDateTime(date: string, time: string): string | undefined {
  if (!date || !time) return undefined
  return `${date}T${time}`
}

export function BulkSmuForm({ stations, onApplied }: BulkSmuFormProps) {
  const [koliDate, setKoliDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [airlines, setAirlines] = useState('')
  const [flightNo, setFlightNo] = useState('')
  const [stdDate, setStdDate] = useState('')
  const [stdTime, setStdTime] = useState('')
  const [staDate, setStaDate] = useState('')
  const [staTime, setStaTime] = useState('')
  const [smuNumber, setSmuNumber] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const bulkUpdateSmu = useBulkUpdateSmu()

  const canSubmit = !!koliDate && !!dest && !bulkUpdateSmu.isPending

  const handleApply = async () => {
    setResult(null)
    const res = await bulkUpdateSmu.mutateAsync({
      koliDate,
      dest,
      smuNumber: smuNumber || undefined,
      airlines: airlines || undefined,
      flightNo: flightNo || undefined,
      std: combineDateTime(stdDate, stdTime),
      sta: combineDateTime(staDate, staTime),
    })
    setResult(`Diterapkan ke ${res.updated} Koli (${koliDate} → ${dest})`)
    onApplied()
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium">Input Bulk SMU</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Date + Destinasi menentukan Koli mana yang menerima data ini. Kolom kosong tidak akan menimpa data yang sudah ada.
      </p>
      <div className="grid grid-cols-4 gap-3">
        <input type="date" value={koliDate} onChange={(e) => setKoliDate(e.target.value)} className={inputClass} />
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={inputClass}>
          <option value="">Origin</option>
          {stations.origins.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select value={dest} onChange={(e) => setDest(e.target.value)} className={inputClass}>
          <option value="">Destination</option>
          {stations.dests.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <input placeholder="Airlines" value={airlines} onChange={(e) => setAirlines(e.target.value)} className={inputClass} />
        <input placeholder="Flight No" value={flightNo} onChange={(e) => setFlightNo(e.target.value)} className={inputClass} />
        <div className="flex gap-1">
          <input type="date" value={stdDate} onChange={(e) => setStdDate(e.target.value)} className={inputClass} />
          <TimeSelect value={stdTime} onChange={setStdTime} className={inputClass} />
        </div>
        <div className="flex gap-1">
          <input type="date" value={staDate} onChange={(e) => setStaDate(e.target.value)} className={inputClass} />
          <TimeSelect value={staTime} onChange={setStaTime} className={inputClass} />
        </div>
        <input placeholder="No. SMU" value={smuNumber} onChange={(e) => setSmuNumber(e.target.value)} className={inputClass} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {bulkUpdateSmu.isPending ? 'Menerapkan…' : 'Terapkan'}
        </button>
        {result && <p className="text-sm text-muted-foreground">{result}</p>}
      </div>
    </div>
  )
}
