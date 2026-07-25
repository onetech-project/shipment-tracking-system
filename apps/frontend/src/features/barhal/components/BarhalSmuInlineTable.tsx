'use client'

import { useState } from 'react'
import { useUpdateSmu } from '../hooks/useBarhal'
import { BarhalKoli } from '../types'

interface BarhalSmuInlineTableProps {
  data: BarhalKoli[]
  isLoading?: boolean
  onSaved: () => void
}

function splitDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const [date, time] = iso.slice(0, 16).split('T')
  return { date: date ?? '', time: time ?? '' }
}

function combineDateTime(date: string, time: string): string | undefined {
  if (!date || !time) return undefined
  return `${date}T${time}`
}

function SmuRow({ koli, onSaved }: { koli: BarhalKoli; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [airlines, setAirlines] = useState(koli.airlines ?? '')
  const [flightNo, setFlightNo] = useState(koli.flight_no ?? '')
  const [stdDate, setStdDate] = useState(splitDateTime(koli.std).date)
  const [stdTime, setStdTime] = useState(splitDateTime(koli.std).time)
  const [staDate, setStaDate] = useState(splitDateTime(koli.sta).date)
  const [staTime, setStaTime] = useState(splitDateTime(koli.sta).time)
  const [smuNumber, setSmuNumber] = useState(koli.smu_number ?? '')

  const updateSmu = useUpdateSmu(koli.id)

  const inputClass =
    'w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring'

  const handleSave = async () => {
    await updateSmu.mutateAsync({
      smuNumber: smuNumber || undefined,
      airlines: airlines || undefined,
      flightNo: flightNo || undefined,
      std: combineDateTime(stdDate, stdTime),
      sta: combineDateTime(staDate, staTime),
    })
    setEditing(false)
    onSaved()
  }

  return (
    <tr className="hover:bg-accent/30">
      <td className="px-3 py-2">{koli.koli_date}</td>
      <td className="px-3 py-2">{koli.dest_name}</td>
      <td className="px-3 py-2 font-medium">{koli.koli_number}</td>
      <td className="px-3 py-2">
        {editing ? <input value={airlines} onChange={(e) => setAirlines(e.target.value)} className={inputClass} /> : koli.airlines || '-'}
      </td>
      <td className="px-3 py-2">
        {editing ? <input value={flightNo} onChange={(e) => setFlightNo(e.target.value)} className={inputClass} /> : koli.flight_no || '-'}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex gap-1">
            <input type="date" value={stdDate} onChange={(e) => setStdDate(e.target.value)} className={inputClass} />
            <input type="time" value={stdTime} onChange={(e) => setStdTime(e.target.value)} className={inputClass} />
          </div>
        ) : (
          koli.std || '-'
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <div className="flex gap-1">
            <input type="date" value={staDate} onChange={(e) => setStaDate(e.target.value)} className={inputClass} />
            <input type="time" value={staTime} onChange={(e) => setStaTime(e.target.value)} className={inputClass} />
          </div>
        ) : (
          koli.sta || '-'
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? <input value={smuNumber} onChange={(e) => setSmuNumber(e.target.value)} className={inputClass} /> : koli.smu_number || '-'}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => (editing ? handleSave() : setEditing(true))}
          disabled={updateSmu.isPending}
          className="rounded-md border border-border px-3 py-1 text-xs font-medium transition hover:bg-accent/50 disabled:opacity-50"
        >
          {updateSmu.isPending ? 'Menyimpan…' : editing ? 'Save' : 'Edit'}
        </button>
      </td>
    </tr>
  )
}

export function BarhalSmuInlineTable({ data, isLoading, onSaved }: BarhalSmuInlineTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Destination</th>
            <th className="px-3 py-2 font-medium">No. Koli</th>
            <th className="px-3 py-2 font-medium">Airlines</th>
            <th className="px-3 py-2 font-medium">Flight No</th>
            <th className="px-3 py-2 font-medium">STD</th>
            <th className="px-3 py-2 font-medium">STA</th>
            <th className="px-3 py-2 font-medium">SMU</th>
            <th className="px-3 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                No Koli found.
              </td>
            </tr>
          ) : (
            data.map((koli) => <SmuRow key={koli.id} koli={koli} onSaved={onSaved} />)
          )}
        </tbody>
      </table>
    </div>
  )
}
