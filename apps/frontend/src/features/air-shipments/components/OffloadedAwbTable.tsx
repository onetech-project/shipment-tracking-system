'use client'

import { FileText, RotateCcw, Pencil } from 'lucide-react'
import { OffloadedAwbRow } from '@/features/air-shipments/types'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import {
  TableWrap,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

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
  'Source',
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

function SourceBadge({ row }: { row: OffloadedAwbRow }) {
  const isApi = String(row.source ?? '').toLowerCase() === 'api'
  const label = isApi ? 'API' : 'Sheet'
  const title = isApi
    ? [row.fetched_at ? `fetched ${row.fetched_at}` : null, row.error ? `error: ${row.error}` : null]
        .filter(Boolean)
        .join(' · ') || 'Airline tracking API'
    : 'Tracking_SMU sheet'
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] ${
        isApi ? 'bg-info-soft text-info-ink' : 'bg-surface-2 text-faint'
      }`}
    >
      {label}
    </span>
  )
}

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
      <EmptyState
        title={mode === 'active' ? 'No offloaded AWBs awaiting evidence' : 'No AWBs with evidence'}
      />
    )
  }

  return (
    <div className="space-y-3">
      <TableWrap className="max-h-[70vh]">
        <Table>
          <TableHeader>
            <TableRow>
              {HEADERS.map((h) => (
                <TableHead key={h} className="whitespace-nowrap">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id ?? row.awb}>
                <TableCell className="whitespace-nowrap font-medium">{String(row.awb ?? '—')}</TableCell>
                <TableCell className="whitespace-nowrap"><SourceBadge row={row} /></TableCell>
                <TableCell className="whitespace-nowrap">{String(row.airline ?? '—')}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Leg value={row.std_booking} flightNo={row.std_flight_no} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Leg value={row.actual_flight_dep} flightNo={row.dep_flight_no} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Leg value={row.dep2} flightNo={row.dep2_flight_no} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Leg value={row.dep3} flightNo={row.dep3_flight_no} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Leg value={row.dep4} flightNo={row.dep4_flight_no} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Leg value={row.dep5} flightNo={row.dep5_flight_no} />
                </TableCell>
                <TableCell className="whitespace-nowrap">{String(row.remarks_offload ?? '—')}</TableCell>
                <TableCell className="max-w-[260px]">
                  <EvidenceCell value={row.evidence} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {mode === 'active' ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => onAddEvidence?.(row)}>
                      <FileText size={12} />
                      Add Evidence
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={() => onEditEvidence?.(row)}>
                        <Pencil size={12} />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => onRestore?.(row)}>
                        <RotateCcw size={12} />
                        Restore
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>

      {meta.total > meta.limit && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular">
            {`${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total}`}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, meta.page - 1))}
              disabled={meta.page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(meta.page + 1)}
              disabled={meta.page * meta.limit >= meta.total}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
