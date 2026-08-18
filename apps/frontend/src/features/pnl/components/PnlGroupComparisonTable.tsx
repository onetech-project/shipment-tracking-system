'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatDayLabel } from '../utils/dailyMatrix'
import { COST_COMPONENTS, ComparisonTableModel } from '../utils/groupComparison'
import { num } from '../utils/format'
import { CellWarning, hasWarning, warningTooltip, WARNING_TINT } from '../utils/cellWarning'
import { PnlGroupComparisonColumn } from '../hooks/usePnl'

interface PnlGroupComparisonTableProps {
  model: ComparisonTableModel
  // When given, every value cell becomes a button — including empty ones, which are a valid answer
  // ("nothing flew these routes that day"). Footer cells stay inert: they span the whole period.
  onCellClick?: (column: PnlGroupComparisonColumn, date: string) => void
}

// The Total footer row expands like a body row; this is the key it occupies in the open set.
const FOOTER_KEY = '__footer__'

// A missing value is marked, not left blank: an empty cell and a real 0 read the same at a glance,
// and a clickable cell needs something to aim at. Same rule as PnlMatrixTable.
function formatValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return num(Math.round(value))
}

// Revenue and Cost cells now do the same thing — drill into the AWBs behind them — so they share
// one title rather than two near-identical strings that could drift.
function cellTitle(warning: CellWarning | undefined): string {
  const hint = 'Lihat AWB kolom ini pada tanggal ini'
  const tooltip = warningTooltip(warning)
  return tooltip ? `${hint} — ${tooltip}` : hint
}

// The expand toggle lives on the date, not on a cost cell: the detail rows it opens always covered
// every column, so a per-cell toggle claimed a scope it never had.
function DateCell({
  label,
  open,
  onToggle,
  className,
}: {
  label: string
  open: boolean
  onToggle: () => void
  className: string
}) {
  return (
    <td className={`sticky left-0 z-10 whitespace-nowrap border-b border-r p-0 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Rincian cost ${label}`}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-left hover:bg-primary/10"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
    </td>
  )
}

export function PnlGroupComparisonTable({ model, onCellClick }: PnlGroupComparisonTableProps) {
  const [openDates, setOpenDates] = useState<Set<string>>(new Set())
  const groupCount = model.columns.length

  const toggle = (key: string) =>
    setOpenDates((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // One detail row per component, spanning the Revenue block (blank) and the Cost block (filled).
  const detailRows = (
    key: string,
    components: Record<string, (number | null)[]>,
    striped: boolean,
  ) =>
    COST_COMPONENTS.map(({ key: componentKey, label }) => (
      <tr
        key={`${key}-${componentKey}`}
        data-testid={`detail-${key}-${componentKey}`}
        className={striped ? 'bg-muted/30' : 'bg-muted/10'}
      >
        <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1 pl-6 text-xs text-muted-foreground">
          {label}
        </td>
        {Array.from({ length: groupCount }, (_, i) => (
          <td key={`rev-${i}`} className="border-b border-l" />
        ))}
        {components[componentKey].map((value, i) => (
          <td
            key={`cost-${i}`}
            className="whitespace-nowrap border-b border-l px-3 py-1 text-right text-xs text-muted-foreground"
          >
            {formatValue(value)}
          </td>
        ))}
      </tr>
    ))

  return (
    <div className="rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 border-b border-r bg-card px-3 py-2 text-left font-medium"
              >
                Date
              </th>
              <th
                colSpan={groupCount}
                className="border-b border-l bg-green-100 px-3 py-1.5 text-center font-semibold dark:bg-green-950/40"
              >
                Revenue
              </th>
              <th
                colSpan={groupCount}
                className="border-b border-l bg-blue-100 px-3 py-1.5 text-center font-semibold dark:bg-blue-950/40"
              >
                Cost
              </th>
            </tr>
            <tr>
              {model.columns.map((column) => (
                <th
                  key={`rev-${column.id}`}
                  className="whitespace-nowrap border-b border-l px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  {column.name}
                </th>
              ))}
              {model.columns.map((column) => (
                <th
                  key={`cost-${column.id}`}
                  className="whitespace-nowrap border-b border-l px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {model.rows.map((row, rowIndex) => {
              const striped = rowIndex % 2 === 1
              return (
                // A row and its detail rows are siblings, so the pair is wrapped in a keyed
                // Fragment — a bare <> cannot carry the key React needs inside a map.
                <React.Fragment key={row.date}>
                  <tr
                    data-testid={`row-${row.date}`}
                    className={striped ? 'bg-muted/30' : ''}
                  >
                    <DateCell
                      label={formatDayLabel(row.date)}
                      open={openDates.has(row.date)}
                      onToggle={() => toggle(row.date)}
                      className={striped ? 'bg-muted/30' : 'bg-card'}
                    />
                    {(['revenue', 'cost'] as const).flatMap((field) =>
                      row[field].map((value, i) => {
                        const warning = row.warnings[i]
                        const tint = hasWarning(warning) ? WARNING_TINT : ''
                        const testId = `${field}-${row.date}-${model.columns[i].id}`
                        return onCellClick ? (
                          <td key={testId} className={`border-b border-l p-0 ${tint}`}>
                            <button
                              type="button"
                              data-testid={testId}
                              title={cellTitle(warning)}
                              className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                              onClick={() => onCellClick(model.columns[i], row.date)}
                            >
                              {formatValue(value)}
                            </button>
                          </td>
                        ) : (
                          <td
                            key={testId}
                            data-testid={testId}
                            title={warningTooltip(warning)}
                            className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${tint}`}
                          >
                            {formatValue(value)}
                          </td>
                        )
                      }),
                    )}
                  </tr>
                  {openDates.has(row.date) && detailRows(row.date, row.components, striped)}
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            {model.footerRows.map((footerRow, i) => (
              <React.Fragment key={footerRow.label}>
                <tr className={i === 0 ? 'border-t-2 font-semibold' : 'font-semibold'}>
                  {footerRow.components ? (
                    <DateCell
                      label={footerRow.label}
                      open={openDates.has(FOOTER_KEY)}
                      onToggle={() => toggle(FOOTER_KEY)}
                      className="bg-card text-right"
                    />
                  ) : (
                    <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1.5 text-right">
                      {footerRow.label}
                    </td>
                  )}
                  {footerRow.revenue.map((value, ci) => (
                    <td
                      key={`rev-${ci}`}
                      title={warningTooltip(footerRow.warnings?.[ci])}
                      className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${hasWarning(footerRow.warnings?.[ci]) ? WARNING_TINT : ''}`}
                    >
                      {formatValue(value)}
                    </td>
                  ))}
                  {footerRow.cost.map((value, ci) => (
                    <td
                      key={`cost-${ci}`}
                      title={warningTooltip(footerRow.warnings?.[ci])}
                      className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${hasWarning(footerRow.warnings?.[ci]) ? WARNING_TINT : ''}`}
                    >
                      {formatValue(value)}
                    </td>
                  ))}
                </tr>
                {footerRow.components &&
                  openDates.has(FOOTER_KEY) &&
                  detailRows(FOOTER_KEY, footerRow.components, false)}
              </React.Fragment>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  )
}
