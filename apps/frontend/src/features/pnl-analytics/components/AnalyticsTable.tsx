'use client'

import { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  cell: (row: T, index: number) => ReactNode
}

interface AnalyticsTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  /** Shown instead of the table when there are no rows — never a bare header with no body. */
  empty?: string
  /** Applied to a row that carries a caveat (incomplete cost, unattributed bucket). */
  rowClassName?: (row: T) => string | undefined
  /** Optional `data-testid` per row, so a spec can assert on one row rather than a whole table. */
  rowTestId?: (row: T, index: number) => string
}

export function AnalyticsTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'No rows.',
  rowClassName,
  rowTestId,
}: AnalyticsTableProps<T>) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              data-testid={rowTestId?.(row, i)}
              className={`border-b last:border-0 ${rowClassName?.(row) ?? ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`py-1.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
