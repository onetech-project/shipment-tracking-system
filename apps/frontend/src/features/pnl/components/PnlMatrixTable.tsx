'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MatrixTableModel, formatDayLabel, groupOrigins } from '../utils/dailyMatrix'
import { PnlDailyMatrixColumn } from '../hooks/usePnl'
import { num, pct } from '../utils/format'
import { CellWarning, hasWarning, warningTooltip } from '../utils/cellWarning'

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

// A missing value is marked, not left blank: an empty cell and a real 0 read the same at a glance,
// and every clickable cell needs something to aim at. Matches num()/pct() and the AWB drilldown,
// which already render a missing value as an em-dash.
function formatValue(value: number | null, format: 'number' | 'percent'): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return format === 'percent' ? pct(value) : num(Math.round(value))
}

// The button fills the whole cell, so its title is the only tooltip the hovering user ever reaches —
// the warning must be merged into it, not left on the (now-covered) <td>.
function cellButtonTitle(warning: CellWarning | undefined): string {
  const clickHint = 'Lihat AWB rute dan tanggal ini'
  const tooltip = warningTooltip(warning)
  return tooltip ? `${clickHint} — ${tooltip}` : clickHint
}

// Amber wins the background: it says the number itself is unreliable, which outranks its sign.
// A negative value keeps its red text so a warned loss never reads as a warned profit.
function cellClass(value: number | null, highlightNegative: boolean, warned: boolean): string {
  const negative = value != null && value < 0 && highlightNegative
  if (warned) return `bg-amber-100 dark:bg-amber-950/40 ${negative ? 'text-red-700 dark:text-red-400 font-semibold' : ''}`
  return negative ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40' : ''
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
                    const warning = model.warnings[rowIndex]?.[colIndex]
                    const warned = hasWarning(warning)
                    const column = model.columns[colIndex]
                    const content = formatValue(value, 'number')
                    return (
                      <td
                        key={colIndex}
                        // The button below covers the whole cell and carries its own tooltip, so a
                        // <td> title here would be unreachable at best and, in the padding sliver
                        // the button doesn't cover, a conflicting one at worst.
                        title={onCellClick ? undefined : warningTooltip(warning)}
                        className={`whitespace-nowrap border-b border-l text-right ${cellClass(value, model.highlightNegative, warned)} ${onCellClick ? 'p-0' : 'px-3 py-1.5'}`}
                      >
                        {onCellClick ? (
                          <button
                            type="button"
                            title={cellButtonTitle(warning)}
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
                    const warning = row.warnings?.[colIndex]
                    return (
                      <td
                        key={colIndex}
                        title={warningTooltip(warning)}
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${cellClass(value, model.highlightNegative, hasWarning(warning))}`}
                      >
                        {formatValue(value, row.format)}
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
