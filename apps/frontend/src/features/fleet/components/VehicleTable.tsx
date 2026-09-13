'use client'

import { useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, DataTableColumn } from '@/components/shared/data-table'
import { cn } from '@/lib/utils'
import { FleetMasterRow, FleetVehicle, FleetVehicleSort } from '../types'
import { formatTanggal } from '../utils/format-date'
import { SeverityBadge } from './SeverityBadge'

interface VehicleTableProps {
  rows: FleetVehicle[]
  docTypes: FleetMasterRow[]
  isLoading: boolean
  sort: FleetVehicleSort
  onSortChange: (sort: FleetVehicleSort) => void
  onEdit: (row: FleetVehicle) => void
  onDocuments: (row: FleetVehicle) => void
  onArchive: (row: FleetVehicle) => void
  onRestore: (row: FleetVehicle) => void
  showActions?: { edit: boolean; documents: boolean; archive: boolean }
}

// Each sortable column names its ascending key and the descending key it toggles to, so the
// header knows both which arrow to draw and what to ask for next.
const SORT_PAIRS: Record<string, [FleetVehicleSort, FleetVehicleSort]> = {
  nopol: ['nopol', '-nopol'],
  tahun: ['tahun', '-tahun'],
}

// Pinned because the table scrolls sideways with a column per document type (spec §7.1): a row
// whose plate has scrolled off has lost the only thing identifying it. Applied to the header and
// the body cell alike, via DataTableColumn.className.
const STICKY_PLATE = 'sticky left-0 z-10 bg-background'

// The badge spells out its severity and day count in full ("Kadaluarsa · Lewat 300 hari"), which
// in an auto-sized column wraps onto two or three lines and bulges the row. The table already
// scrolls sideways (spec §7.1), so trading width for a readable single-line badge costs nothing
// that was not already being paid.
const DOC_COLUMN = 'min-w-[9.5rem] align-top'

// The prototype's status chip: green for a vehicle on the road, amber for one in the workshop,
// plain for anything else (spec §7.1 follows the prototype's docCell colours). Keyed on the master
// row's code, not its label — an admin renaming "Aktif" must not silently drop the colour. An
// unknown code lands on plain rather than a guessed colour, which is the honest reading of a
// status this table has never seen.
const STATUS_TONE: Record<string, string> = {
  aktif: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  servis: 'bg-amber-50 text-amber-800 ring-amber-600/20',
}
const STATUS_TONE_FALLBACK = 'bg-slate-100 text-slate-600 ring-slate-500/20'

// Archived is the row's own state and outranks whatever status it was archived with: a unit in the
// bin is not "Aktif", whatever the column says.
function StatusChip({ row }: { row: FleetVehicle }) {
  const label = row.isActive ? (row.status?.label ?? '—') : 'Arsip'
  const tone = row.isActive
    ? (STATUS_TONE[row.status?.code ?? ''] ?? STATUS_TONE_FALLBACK)
    : STATUS_TONE_FALLBACK
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tone,
      )}
    >
      {label}
    </span>
  )
}

// Names the document behind the row's nearest expiry. minDaysLeft is the backend's own aggregate
// (spec §5.2), so this matches on that number rather than deriving one — no date is read here.
// Several documents can share the nearest day; they are all named, because picking one arbitrarily
// would point the operator at a document that is no more urgent than the ones left unmentioned.
function NearestDocLabel({ row }: { row: FleetVehicle }) {
  if (row.minDaysLeft === null) return null
  const nearest = row.documents.filter((d) => d.daysLeft === row.minDaysLeft)
  if (nearest.length === 0) return null
  return (
    <span className="text-xs text-muted-foreground">
      {nearest.map((d) => d.label).join(' · ')}
    </span>
  )
}

export function VehicleTable({
  rows,
  docTypes,
  isLoading,
  sort,
  onSortChange,
  onEdit,
  onDocuments,
  onArchive,
  onRestore,
  showActions,
}: VehicleTableProps) {
  const show = showActions ?? { edit: true, documents: true, archive: true }

  const sortHeader = (label: string, key: keyof typeof SORT_PAIRS) => {
    const [asc, desc] = SORT_PAIRS[key]
    const active = sort === asc ? 'asc' : sort === desc ? 'desc' : null
    const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => onSortChange(active === 'asc' ? desc : asc)}
      >
        {label}
        <Icon size={13} aria-hidden="true" />
      </button>
    )
  }

  // Built from master data rather than from a fixed list (spec §7.1), so a document type the
  // admin adds gets its own column without a code change. Sorted by the admin's own sortOrder,
  // and the inactive ones left out — a retired type would be a heading with nothing under it.
  const documentColumns: DataTableColumn<FleetVehicle>[] = useMemo(
    () =>
      docTypes
        .filter((t) => t.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((type) => ({
          header: type.label,
          className: DOC_COLUMN,
          accessor: (row: FleetVehicle) => {
            // Matched by docTypeId, never by position: a unit missing one document would
            // otherwise shift every later column left and report plausible, wrong dates.
            const doc = row.documents.find((d) => d.docTypeId === type.id)
            if (!doc) return <span className="text-muted-foreground">—</span>
            return (
              <div className="flex flex-col items-start gap-1">
                <span className="whitespace-nowrap">{formatTanggal(doc.expiresAt)}</span>
                {/* severity and daysLeft arrive already computed; rendering them is the job.
                    The badge keeps its own wording rather than a blank label, so the cell's
                    meaning does not rest on colour alone for a screen reader or a red/green
                    deficient operator — the reason SeverityBadge carries an aria-label at all. */}
                <SeverityBadge
                  severity={doc.severity}
                  daysLeft={doc.daysLeft}
                  className="whitespace-nowrap"
                />
              </div>
            )
          },
        })),
    [docTypes],
  )

  const columns: DataTableColumn<FleetVehicle>[] = [
    {
      header: sortHeader('Nopol', 'nopol'),
      className: STICKY_PLATE,
      accessor: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-medium">{row.nopol}</span>
          <StatusChip row={row} />
        </div>
      ),
    },
    {
      header: 'Unit',
      accessor: (row) => (
        <div className="flex flex-col">
          <span>{[row.merk, row.tipe].filter(Boolean).join(' ') || '—'}</span>
          <span className="text-xs text-muted-foreground">
            {[row.jenisArmada?.label, row.tahun, row.kapasitas].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      header: 'Kepemilikan',
      accessor: (row) => (
        <div className="flex flex-col">
          <span>{row.kepemilikan?.label ?? '—'}</span>
          <span className="text-xs text-muted-foreground">
            {row.lease?.leasing?.label ?? '—'}
            {/* sisaAngsuran is the backend's figure (spec §5.2), printed as delivered. */}
            {row.lease && row.lease.sisaAngsuran > 0 && ` · sisa ${row.lease.sisaAngsuran}×`}
          </span>
        </div>
      ),
    },
    {
      header: sortHeader('Tahun', 'tahun'),
      accessor: (row) => row.tahun ?? '—',
    },
    {
      header: 'Sopir & SIM',
      className: 'min-w-[11rem] align-top',
      accessor: (row) =>
        row.driver ? (
          <div className="flex flex-col items-start gap-1">
            <span>{row.driver.nama}</span>
            <span className="text-xs text-muted-foreground">{row.pool?.label ?? '—'}</span>
            <SeverityBadge
              severity={row.driver.simSeverity}
              daysLeft={row.driver.simDaysLeft}
              label={`SIM ${formatTanggal(row.driver.simExpiresAt)}`}
              className="whitespace-nowrap"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Belum ada sopir</span>
            <span className="text-xs text-muted-foreground">{row.pool?.label ?? '—'}</span>
          </div>
        ),
    },
    ...documentColumns,
    {
      header: (
        <button
          type="button"
          aria-label="Urutkan dokumen"
          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
          onClick={() => onSortChange('severity')}
        >
          Terdekat
          <ArrowUpDown size={13} aria-hidden="true" />
        </button>
      ),
      className: DOC_COLUMN,
      // Tagged because the row now carries several badges — one per document column plus the
      // driver's SIM — and the tests for the two backend aggregates have to name this one.
      accessor: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span data-testid="worst-severity">
            <SeverityBadge
              severity={row.worstSeverity}
              daysLeft={row.minDaysLeft}
              className="whitespace-nowrap"
            />
          </span>
          {/* Which document the count belongs to. "5 hari lagi" alone sends the operator hunting
              across a dozen columns for the one that is expiring. Matched on the backend's own
              minDaysLeft rather than recomputed — nothing here reads a date. */}
          <NearestDocLabel row={row} />
        </div>
      ),
    },
    {
      header: 'Aksi',
      className: 'text-right',
      accessor: (row) => {
        const items = [
          show.edit && { key: 'edit', label: 'Ubah', run: () => onEdit(row) },
          show.documents && { key: 'documents', label: 'Dokumen', run: () => onDocuments(row) },
          show.archive &&
            (row.isActive
              ? { key: 'archive', label: 'Arsipkan', run: () => onArchive(row) }
              : { key: 'restore', label: 'Pulihkan', run: () => onRestore(row) }),
        ].filter(Boolean) as { key: string; label: string; run: () => void }[]

        // Spec §7.2: a menu whose items are all filtered out is not rendered at all. An empty ⋮
        // that opens onto nothing is worse than no button — the operator keeps trying it.
        if (items.length === 0) return null

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Aksi ${row.nopol}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <MoreVertical size={16} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={item.run}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      keyExtractor={(row) => row.id}
      emptyMessage="Belum ada armada yang cocok dengan filter ini."
      rowDataTestId="vehicle-row"
    />
  )
}
