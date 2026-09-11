'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, DataTableColumn } from '@/components/shared/data-table'
import { FleetVehicle, FleetVehicleSort } from '../types'
import { SeverityBadge } from './SeverityBadge'

interface VehicleTableProps {
  rows: FleetVehicle[]
  isLoading: boolean
  sort: FleetVehicleSort
  onSortChange: (sort: FleetVehicleSort) => void
  onEdit: (row: FleetVehicle) => void
  onDocuments: (row: FleetVehicle) => void
  onArchive: (row: FleetVehicle) => void
  onRestore: (row: FleetVehicle) => void
}

// Each sortable column names its ascending key and the descending key it toggles to, so the
// header knows both which arrow to draw and what to ask for next.
const SORT_PAIRS: Record<string, [FleetVehicleSort, FleetVehicleSort]> = {
  nopol: ['nopol', '-nopol'],
  tahun: ['tahun', '-tahun'],
}

export function VehicleTable({
  rows,
  isLoading,
  sort,
  onSortChange,
  onEdit,
  onDocuments,
  onArchive,
  onRestore,
}: VehicleTableProps) {
  const sortHeader = (label: string, key: keyof typeof SORT_PAIRS, ariaLabel?: string) => {
    const [asc, desc] = SORT_PAIRS[key]
    const active = sort === asc ? 'asc' : sort === desc ? 'desc' : null
    const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => onSortChange(active === 'asc' ? desc : asc)}
      >
        {label}
        <Icon size={13} aria-hidden="true" />
      </button>
    )
  }

  const columns: DataTableColumn<FleetVehicle>[] = [
    {
      header: 'Nopol',
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.nopol}</span>
          {!row.isActive && <span className="text-xs text-muted-foreground">Arsip</span>}
        </div>
      ),
    },
    {
      header: 'Unit',
      accessor: (row) => (
        <div className="flex flex-col">
          <span>{[row.merk, row.tipe].filter(Boolean).join(' ') || '—'}</span>
          <span className="text-xs text-muted-foreground">
            {[row.tahun, row.jenisArmada?.label].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      header: 'Sopir',
      accessor: (row) =>
        row.driver ? (
          <span>{row.driver.nama}</span>
        ) : (
          <span className="text-muted-foreground">Belum ada sopir</span>
        ),
    },
    {
      header: 'Pool',
      accessor: (row) => row.pool?.label ?? '—',
    },
    {
      header: 'Status',
      accessor: (row) => row.status?.label ?? '—',
    },
    {
      header: 'Dokumen',
      accessor: (row) => (
        // daysLeft comes from the backend already computed; passing it through is the whole job.
        <SeverityBadge severity={row.worstSeverity} daysLeft={row.minDaysLeft} />
      ),
    },
    {
      header: 'Aksi',
      className: 'text-right',
      accessor: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
            Ubah
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDocuments(row)}>
            Dokumen
          </Button>
          {row.isActive ? (
            <Button size="sm" variant="ghost" onClick={() => onArchive(row)}>
              Arsipkan
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onRestore(row)}>
              Pulihkan
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      {/* DataTableColumn.header is typed as a string, so the sort controls live in their own
          row above the table rather than inside <th>. Keeping them here avoids widening the
          shared component's contract for this one caller. */}
      <div className="mb-2 flex items-center gap-4 px-1 text-sm text-muted-foreground">
        <span>Urutkan:</span>
        {sortHeader('Nopol', 'nopol')}
        {sortHeader('Tahun', 'tahun')}
        <button
          type="button"
          aria-label="Urutkan dokumen"
          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
          onClick={() => onSortChange('severity')}
        >
          Dokumen
          <ArrowUpDown size={13} aria-hidden="true" />
        </button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        keyExtractor={(row) => row.id}
        emptyMessage="Belum ada armada yang cocok dengan filter ini."
        rowDataTestId="vehicle-row"
      />
    </>
  )
}
