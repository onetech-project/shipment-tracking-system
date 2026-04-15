'use client'
import moment from 'moment'
import { AirShipmentRow, CellProps, PaginationMeta, SortOrder } from '../types'
import { colLabel, COLUMN_KEYS } from '../columns.config'

const DATETIME_COLS = new Set(['last_synced_at', 'created_at', 'updated_at'])

/** Format a cell value for display. */
function formatCell(props: CellProps): string | JSX.Element {
  const { id, col, value, additional } = props
  if (col === 'date' && value) {
    const parsed = moment(
      String(value),
      ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'D/M/YYYY', 'D-MMM-YYYY', moment.ISO_8601],
      true
    )
    if (parsed.isValid()) return parsed.format('DD-MMM-YYYY')
  }
  if (DATETIME_COLS.has(col) && value) {
    const parsed = moment(String(value))
    if (parsed.isValid()) return parsed.format('DD MMM YYYY HH:mm:ss')
  }
  if (col === 'is_locked') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/50"
        onChange={() => additional?.onToggleLock?.(id ?? '', !Boolean(value))}
      />
    )
  }
  return String(value ?? '')
}

/**
 * Columns frozen on horizontal scroll, in left-to-right order with fixed widths (px).
 * These columns must appear first in the rendered column list for offsets to be correct.
 */
const FROZEN_COLS: { key: string; width: number | undefined }[] = [
  { key: '#', width: undefined },
  { key: 'date', width: 110 },
  { key: 'lt_number', width: 150 },
  { key: 'to_number', width: 170 },
  { key: 'is_locked', width: undefined },
]

const FROZEN_LEFT: Record<string, number> = FROZEN_COLS.reduce(
  (acc, col, idx) => {
    acc[col.key] = FROZEN_COLS.slice(0, idx).reduce((s, c) => s + (c.width ?? 0), 0)
    return acc
  },
  {} as Record<string, number>
)

const FROZEN_WIDTH: Record<string, number | undefined> = Object.fromEntries(
  FROZEN_COLS.map((c) => [c.key, c.width])
)

function resolveColumns(
  tableName: string | undefined,
  rows: AirShipmentRow[],
  visibleColumns?: string[]
): string[] {
  let cols: string[] = []
  if (tableName && COLUMN_KEYS[tableName]) cols = [...COLUMN_KEYS[tableName]]
  else if (rows.length > 0) cols = Object.keys(rows[0])

  // Collect all unique extra_fields keys from all rows
  const extraFieldKeys = new Set<string>()
  for (const row of rows) {
    if (row.extra_fields && typeof row.extra_fields === 'object') {
      Object.keys(row.extra_fields).forEach((k) => extraFieldKeys.add(k))
    }
  }
  // Add extra_fields keys if not already present
  for (const key of extraFieldKeys) {
    if (!cols.includes(key)) cols.push(key)
  }

  if (visibleColumns) {
    cols = cols.filter((col) => visibleColumns.includes(col))
  }
  return ['#', ...cols]
}

const isFrozen = (col: string, tableName?: string): boolean =>
  (tableName?.startsWith('air_shipments_') ?? false) && col in FROZEN_LEFT

const scrollToTop = () => {
  const container = document.getElementById('table-container')
  if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
}

interface AirShipmentTableProps {
  data: AirShipmentRow[]
  meta: PaginationMeta
  sortBy: string
  sortOrder: SortOrder
  onSort: (col: string, order: SortOrder) => void
  onPageChange: (page: number) => void
  onToggleLock?: (id: string, locked: boolean) => void
  tableName?: string
  visibleColumns?: string[]
}

export function AirShipmentTable({
  data,
  meta,
  sortBy,
  sortOrder,
  onSort,
  onPageChange,
  onToggleLock,
  tableName,
  visibleColumns,
}: AirShipmentTableProps) {
  const columns = resolveColumns(tableName, data, visibleColumns)

  const handleHeaderClick = (col: string) => {
    if (col === sortBy) {
      onSort(col, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(col, 'asc')
    }
  }

  const sortIndicator = (col: string) => {
    if (col !== sortBy) return null
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="flex flex-col gap-4">
      <div id="table-container" className="overflow-auto rounded-md border max-h-[70vh]">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted sticky top-0 z-20">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleHeaderClick(col)}
                  style={
                    isFrozen(col, tableName)
                      ? {
                          left: FROZEN_LEFT[col],
                          minWidth: FROZEN_WIDTH[col],
                          maxWidth: FROZEN_WIDTH[col],
                          ...(col === FROZEN_COLS[FROZEN_COLS.length - 1].key
                            ? { boxShadow: '2px 0 0 0 hsl(var(--border))' }
                            : {}),
                        }
                      : undefined
                  }
                  className={[
                    'cursor-pointer select-none whitespace-nowrap px-4 py-2 text-left font-medium text-muted-foreground hover:text-foreground',
                    isFrozen(col, tableName) ? 'sticky z-30 bg-muted' : '',
                  ].join(' ')}
                >
                  {colLabel(col)}
                  {sortIndicator(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={
                        isFrozen(col, tableName)
                          ? {
                              left: FROZEN_LEFT[col],
                              minWidth: FROZEN_WIDTH[col],
                              maxWidth: FROZEN_WIDTH[col],
                              ...(col === FROZEN_COLS[FROZEN_COLS.length - 1].key
                                ? { boxShadow: '2px 0 0 0 hsl(var(--border))' }
                                : {}),
                            }
                          : undefined
                      }
                      className={[
                        'whitespace-nowrap px-4 py-2',
                        isFrozen(col, tableName) ? 'sticky z-10 bg-background' : '',
                        col === 'is_locked' ? 'text-center' : '',
                      ].join(' ')}
                    >
                      {col === '#' ? (meta.page - 1) * meta.limit + data.indexOf(row) + 1 : ''}
                      {row[col] !== undefined
                        ? formatCell({
                            id: row.id,
                            col,
                            value: row[col],
                            additional: { onToggleLock },
                          })
                        : row.extra_fields &&
                            typeof row.extra_fields === 'object' &&
                            row.extra_fields !== null &&
                            Object.prototype.hasOwnProperty.call(row.extra_fields, col)
                          ? formatCell({
                              id: row.id,
                              col,
                              value: (row.extra_fields as Record<string, unknown>)[col],
                              additional: { onToggleLock },
                            })
                          : ''}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span>
          {meta.total === 0
            ? 'No records'
            : `${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total}`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              scrollToTop()
              onPageChange(meta.page - 1)
            }}
            disabled={meta.page <= 1}
            className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-muted"
          >
            Previous
          </button>
          <button
            onClick={() => {
              scrollToTop()
              onPageChange(meta.page + 1)
            }}
            disabled={meta.page >= meta.totalPages}
            className="rounded border px-3 py-1 disabled:opacity-40 hover:bg-muted"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
