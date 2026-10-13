'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/input'
import { TableWrap, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useUpdateSmu } from '../hooks/useBarhal'
import { BarhalKoli } from '../types'
import { formatDate, formatDateTime, toDateTimeLocalInput } from '../utils/dateFormat'

interface BarhalSmuInlineTableProps {
  data: BarhalKoli[]
  isLoading?: boolean
  onSaved: () => void
}

const COLUMN_COUNT = 9

function SmuRow({ koli, onSaved }: { koli: BarhalKoli; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [airlines, setAirlines] = useState(koli.airlines ?? '')
  const [flightNo, setFlightNo] = useState(koli.flight_no ?? '')
  // `.slice(0, 16)` dulu menghasilkan jam dinding UTC, sehingga input berselisih dengan
  // tampilan sebesar offset zona. Keduanya kini sama-sama waktu lokal browser.
  const [std, setStd] = useState(toDateTimeLocalInput(koli.std))
  const [sta, setSta] = useState(toDateTimeLocalInput(koli.sta))
  const [smuNumber, setSmuNumber] = useState(koli.smu_number ?? '')

  const updateSmu = useUpdateSmu(koli.id)

  const inputClass = `w-full ${fieldClass}`

  const handleSave = async () => {
    await updateSmu.mutateAsync({
      smuNumber: smuNumber || undefined,
      airlines: airlines || undefined,
      flightNo: flightNo || undefined,
      std: std || undefined,
      sta: sta || undefined,
    })
    setEditing(false)
    onSaved()
  }

  return (
    <TableRow>
      <TableCell>{formatDate(koli.koli_date)}</TableCell>
      <TableCell>{koli.dest_name}</TableCell>
      <TableCell className="font-medium">{koli.koli_number}</TableCell>
      <TableCell>
        {editing ? <input value={airlines} onChange={(e) => setAirlines(e.target.value)} className={inputClass} /> : koli.airlines || '-'}
      </TableCell>
      <TableCell>
        {editing ? <input value={flightNo} onChange={(e) => setFlightNo(e.target.value)} className={inputClass} /> : koli.flight_no || '-'}
      </TableCell>
      <TableCell>
        {editing ? (
          <input type="datetime-local" value={std} onChange={(e) => setStd(e.target.value)} className={inputClass} />
        ) : (
          formatDateTime(koli.std)
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <input type="datetime-local" value={sta} onChange={(e) => setSta(e.target.value)} className={inputClass} />
        ) : (
          formatDateTime(koli.sta)
        )}
      </TableCell>
      <TableCell>
        {editing ? <input value={smuNumber} onChange={(e) => setSmuNumber(e.target.value)} className={inputClass} /> : koli.smu_number || '-'}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => (editing ? handleSave() : setEditing(true))}
          disabled={updateSmu.isPending}
        >
          {updateSmu.isPending ? 'Menyimpan…' : editing ? 'Save' : 'Edit'}
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function BarhalSmuInlineTable({ data, isLoading, onSaved }: BarhalSmuInlineTableProps) {
  return (
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>No. Koli</TableHead>
            <TableHead>Airlines</TableHead>
            <TableHead>Flight No</TableHead>
            <TableHead>STD</TableHead>
            <TableHead>STA</TableHead>
            <TableHead>SMU</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-6 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-6 text-center text-muted-foreground">
                No Koli found.
              </TableCell>
            </TableRow>
          ) : (
            data.map((koli) => <SmuRow key={koli.id} koli={koli} onSaved={onSaved} />)
          )}
        </TableBody>
      </Table>
    </TableWrap>
  )
}
