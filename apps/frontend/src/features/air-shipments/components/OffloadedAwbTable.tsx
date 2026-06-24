'use client'

import { FileText, RotateCcw, Pencil } from 'lucide-react'
import { OffloadedAwbRow } from '@/features/air-shipments/types'

export interface OffloadedAwbTableProps {
  data: OffloadedAwbRow[]
  meta: { total: number; page: number; limit: number }
  mode: 'active' | 'excluded'
  onAddEvidence?: (row: OffloadedAwbRow) => void
  onEditEvidence?: (row: OffloadedAwbRow) => void
  onRestore?: (row: OffloadedAwbRow) => void
  onPageChange: (page: number) => void
}

/** A booked flight + its actual departure leg, stacked compactly in one cell. */
function Leg({ value, flightNo }: { value?: string | null; flightNo?: string | null }) {
  const v = value && String(value).trim() ? String(value) : '—'
  const fn = flightNo && String(flightNo).trim() ? String(flightNo) : null
  return (
    <div className="leading-tight">
      <span>{v}</span>
      {fn && <span className="block text-xs text-muted-foreground">{fn}</span>}
    </div>
  )
}

function EvidenceCell({ value }: { value?: string | null }) {
  const v = value ? String(value).trim() : ''
  if (!v) return <span className="text-muted-foreground">—</span>
  const isLink = /^https?:\/\//i.test(v)
  return isLink ? (
    <a
      href={v}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 break-all"
      title={v}
    >
      {v.length > 48 ? v.slice(0, 48) + '…' : v}
    </a>
  ) : (
    <span className="break-all" title={v}>
      {v.length > 48 ? v.slice(0, 48) + '…' : v}
    </span>
  )
}

const HEADERS = [
  'AWB',
  'Airline',
  'STD Booking',
  'Actual (DEP)',
  'DEP2',
  'DEP3',
  'DEP4',
  'DEP5',
  'Remarks',
  'Evidence',
  'Actions',
]

export function OffloadedAwbTable({
  data,
  meta,
  mode,
  onAddEvidence,
  onEditEvidence,
  onRestore,
  onPageChange,
}: OffloadedAwbTableProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
        {mode === 'active' ? 'No offloaded AWBs awaiting evidence' : 'No AWBs with evidence'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-border bg-panel p-4 shadow-sm overflow-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted">
            <tr>
              {HEADERS.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row, idx) => (
              <tr key={row.id ?? row.awb} className={idx % 2 === 1 ? 'bg-muted/70' : ''}>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{String(row.awb ?? '—')}</td>
                <td className="whitespace-nowrap px-3 py-2">{String(row.airline ?? '—')}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Leg value={row.std_booking} flightNo={row.std_flight_no} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Leg value={row.actual_flight_dep} flightNo={row.dep_flight_no} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Leg value={row.dep2} flightNo={row.dep2_flight_no} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Leg value={row.dep3} flightNo={row.dep3_flight_no} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Leg value={row.dep4} flightNo={row.dep4_flight_no} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Leg value={row.dep5} flightNo={row.dep5_flight_no} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">{String(row.remarks_offload ?? '—')}</td>
                <td className="px-3 py-2 max-w-[260px]">
                  <EvidenceCell value={row.evidence} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {mode === 'active' ? (
                    <button
                      type="button"
                      onClick={() => onAddEvidence?.(row)}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <FileText size={12} />
                      Add Evidence
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEditEvidence?.(row)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onRestore?.(row)}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <RotateCcw size={12} />
                        Restore
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta.total > meta.limit && (
        <div className="flex items-center justify-between text-sm">
          <span>
            {`${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, meta.page - 1))}
              disabled={meta.page <= 1}
              className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-muted"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(meta.page + 1)}
              disabled={meta.page * meta.limit >= meta.total}
              className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
