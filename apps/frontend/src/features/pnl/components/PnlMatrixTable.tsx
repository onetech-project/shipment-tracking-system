'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MatrixTableModel, formatDayLabel, groupOrigins } from '../utils/dailyMatrix'
import { PnlDailyMatrixColumn } from '../hooks/usePnl'
import { num, pct } from '../utils/format'

interface PnlMatrixTableProps {
  title: string
  model: MatrixTableModel
  defaultOpen?: boolean
  // When given, every body cell becomes a button — including empty ones, which are a valid answer
  // ("nothing flew this route that day"). Footer cells stay inert: they span the whole period.
  onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
}

// Alternating group tints mirror the spreadsheet: the first origin block green, the next blue.
const GROUP_TINTS = [
  'bg-green-100 dark:bg-green-950/40',
  'bg-blue-100 dark:bg-blue-950/40',
]

function formatValue(value: number | null, format: 'number' | 'percent'): string {
  if (value == null || !Number.isFinite(value)) return ''
  return format === 'percent' ? pct(value) : num(Math.round(value))
}

// Shared by body and footer cells so an incomplete-cost warning reads identically wherever it appears.
function incompleteTooltip(count: number): string | undefined {
  return count > 0
    ? `${count} TO belum ada cost — margin di sel ini lebih tinggi dari seharusnya`
    : undefined
}

// The button fills the whole cell, so its title is the only tooltip the hovering user ever reaches —
// the incomplete-cost warning must be merged into it, not left on the (now-covered) <td>.
function cellButtonTitle(incomplete: number): string {
  const clickHint = 'Lihat AWB rute dan tanggal ini'
  const tooltip = incompleteTooltip(incomplete)
  return tooltip ? `${clickHint} — ${tooltip}` : clickHint
}

// Shared by body and footer cells so a negative total is styled the same way as a negative day.
function valueClass(value: number | null, highlightNegative: boolean): string {
  if (value == null || value >= 0 || !highlightNegative) return ''
  return 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40'
}

export function PnlMatrixTable({ title, model, defaultOpen = true, onCellClick }: PnlMatrixTableProps) {
  const [open, setOpen] = useState(defaultOpen)
  const groups = groupOrigins(model.columns)

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-2 border-b px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {model.columns.length} destinations · {model.dates.length} days
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 border-b border-r bg-card px-3 py-2 text-left font-medium"
                >
                  Tanggal
                </th>
                {groups.map((group, i) => (
                  <th
                    key={`${group.label}-${i}`}
                    colSpan={group.span}
                    className={`border-b border-l px-3 py-1.5 text-center font-semibold ${GROUP_TINTS[i % GROUP_TINTS.length]}`}
                  >
                    {group.label}
                  </th>
                ))}
              </tr>
              <tr>
                {model.columns.map((column) => (
                  <th
                    key={`${column.origin}-${column.dest}`}
                    className="whitespace-nowrap border-b border-l px-3 py-2 text-right font-medium text-muted-foreground"
                  >
                    {column.dest}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {model.dates.map((date, rowIndex) => (
                <tr key={date} className={rowIndex % 2 ? 'bg-muted/30' : ''}>
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1.5 ${rowIndex % 2 ? 'bg-muted/30' : 'bg-card'}`}
                  >
                    {formatDayLabel(date)}
                  </td>
                  {model.values[rowIndex].map((value, colIndex) => {
                    const incomplete = model.incompleteTos?.[rowIndex][colIndex] ?? 0
                    const column = model.columns[colIndex]
                    const content = (
                      <>
                        {formatValue(value, 'number')}
                        {incomplete > 0 && <span className="ml-1 text-amber-600">•</span>}
                      </>
                    )
                    return (
                      <td
                        key={colIndex}
                        // The button below covers the whole cell and carries its own tooltip, so a
                        // <td> title here would be unreachable at best and, in the padding sliver
                        // the button doesn't cover, a conflicting one at worst.
                        title={onCellClick ? undefined : incompleteTooltip(incomplete)}
                        className={`whitespace-nowrap border-b border-l text-right ${valueClass(value, model.highlightNegative)} ${onCellClick ? 'p-0' : 'px-3 py-1.5'}`}
                      >
                        {onCellClick ? (
                          <button
                            type="button"
                            title={cellButtonTitle(incomplete)}
                            aria-label={`Lihat AWB ${column.originLabel} → ${column.dest}, ${formatDayLabel(date)}`}
                            className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                            onClick={() => onCellClick(column, date)}
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              {model.footerRows.map((row, i) => (
                <tr key={row.label} className={i === 0 ? 'border-t-2 font-semibold' : 'font-semibold'}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1.5 text-right">
                    {row.label}
                  </td>
                  {row.values.map((value, colIndex) => {
                    const incomplete = row.incompleteTos?.[colIndex] ?? 0
                    return (
                      <td
                        key={colIndex}
                        title={incompleteTooltip(incomplete)}
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${valueClass(value, model.highlightNegative)}`}
                      >
                        {formatValue(value, row.format)}
                        {incomplete > 0 && <span className="ml-1 text-amber-600">•</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
