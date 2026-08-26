'use client'

import React, { useState } from 'react'
import { formatDayLabel } from '../utils/dailyMatrix'
import { COST_COMPONENTS, ComparisonTableModel } from '../utils/groupComparison'
import { num } from '../utils/format'

interface PnlGroupComparisonTableProps {
  model: ComparisonTableModel
}

// The Total footer row expands like a body row; this is the key it occupies in the open set.
const FOOTER_KEY = '__footer__'

// A missing value is marked, not left blank: an empty cell and a real 0 read the same at a glance,
// and a clickable cell needs something to aim at. Same rule as PnlMatrixTable.
function formatValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return num(Math.round(value))
}

function incompleteTooltip(count: number): string | undefined {
  return count > 0
    ? `${count} TO belum ada cost — cost di sel ini lebih rendah dari seharusnya`
    : undefined
}

function costCellTitle(incomplete: number): string {
  const hint = 'Lihat rincian SMU, RA, SG Out, SG In'
  const warning = incompleteTooltip(incomplete)
  return warning ? `${hint} — ${warning}` : hint
}

export function PnlGroupComparisonTable({ model }: PnlGroupComparisonTableProps) {
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
                    <td
                      className={`sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1.5 ${striped ? 'bg-muted/30' : 'bg-card'}`}
                    >
                      {formatDayLabel(row.date)}
                    </td>
                    {row.revenue.map((value, i) => (
                      <td
                        key={`rev-${i}`}
                        data-testid={`revenue-${row.date}-${model.columns[i].id}`}
                        className="whitespace-nowrap border-b border-l px-3 py-1.5 text-right"
                      >
                        {formatValue(value)}
                      </td>
                    ))}
                    {row.cost.map((value, i) => (
                      <td key={`cost-${i}`} className="border-b border-l p-0">
                        <button
                          type="button"
                          data-testid={`cost-${row.date}-${model.columns[i].id}`}
                          title={costCellTitle(row.incompleteTos[i])}
                          aria-expanded={openDates.has(row.date)}
                          className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                          onClick={() => toggle(row.date)}
                        >
                          {formatValue(value)}
                          {row.incompleteTos[i] > 0 && (
                            <span className="ml-1 text-amber-600">•</span>
                          )}
                        </button>
                      </td>
                    ))}
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
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1.5 text-right">
                    {footerRow.label}
                  </td>
                  {footerRow.revenue.map((value, ci) => (
                    <td
                      key={`rev-${ci}`}
                      className="whitespace-nowrap border-b border-l px-3 py-1.5 text-right"
                    >
                      {formatValue(value)}
                    </td>
                  ))}
                  {footerRow.cost.map((value, ci) =>
                    footerRow.components ? (
                      <td key={`cost-${ci}`} className="border-b border-l p-0">
                        <button
                          type="button"
                          data-testid={`cost-${FOOTER_KEY}-${model.columns[ci].id}`}
                          title={costCellTitle(footerRow.incompleteTos?.[ci] ?? 0)}
                          aria-expanded={openDates.has(FOOTER_KEY)}
                          className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                          onClick={() => toggle(FOOTER_KEY)}
                        >
                          {formatValue(value)}
                          {(footerRow.incompleteTos?.[ci] ?? 0) > 0 && (
                            <span className="ml-1 text-amber-600">•</span>
                          )}
                        </button>
                      </td>
                    ) : (
                      <td
                        key={`cost-${ci}`}
                        className="whitespace-nowrap border-b border-l px-3 py-1.5 text-right"
                      >
                        {formatValue(value)}
                      </td>
                    ),
                  )}
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
