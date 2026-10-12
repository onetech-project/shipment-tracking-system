'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { COST_COMPONENTS, ComparisonColumn, ComparisonTableModel } from '../utils/comparison'
import { num } from '../utils/format'
import { CellWarning, hasWarning, warningTooltip, WARNING_TINT } from '../utils/cellWarning'
import { FROZEN_CELL_SUBTLE, frozenCell } from '../utils/frozenColumn'

interface PnlComparisonTableProps<TColumn extends ComparisonColumn> {
  model: ComparisonTableModel<TColumn>
  // 'Date' on the route axis, 'Route' on the vendor axis.
  firstColumnHeader: string
  // What a clickable cell drills into. The route tab's cells are one day; the vendor tab's cells
  // span the whole period, so a single hardcoded sentence would be false on one of them.
  cellHint: string
  // When given, every value cell becomes a button — including empty ones, which are a valid answer
  // ("nothing flew these routes that day"). Footer cells stay inert: they span the whole period.
  // The second argument is the opaque rowKey; only the caller knows what it means.
  onCellClick?: (column: TColumn, rowKey: string) => void
}

// The Total footer row expands like a body row; this is the key it occupies in the open set.
const FOOTER_KEY = '__footer__'

// The three value blocks, in render order. Every place that emits value cells loops over this, so
// body rows, detail rows and footer rows can never disagree about how wide a row is.
const FIELDS = ['revenue', 'cost', 'margin'] as const
type Field = (typeof FIELDS)[number]

function valueClass(field: Field, value: number | null): string {
  // Only the margin block is ever coloured — revenue and cost are sums of non-negative amounts.
  if (field !== 'margin' || value == null) return ''
  if (value < 0) return 'text-bad font-bold'
  if (value > 0) return 'text-good font-bold'
  return 'text-foreground font-bold'
}

// A missing value is marked, not left blank: an empty cell and a real 0 read the same at a glance,
// and a clickable cell needs something to aim at. Same rule as PnlMatrixTable.
function formatValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return num(Math.round(value))
}

// Revenue, Cost and Margin cells all do the same thing — drill into the AWBs behind them — so they
// share one title rather than near-identical strings that could drift.
function cellTitle(hint: string, warning: CellWarning | undefined): string {
  const tooltip = warningTooltip(warning)
  return tooltip ? `${hint} — ${tooltip}` : hint
}

// The expand toggle lives on the row header, not on a cost cell: the detail rows it opens always
// covered every column, so a per-cell toggle claimed a scope it never had.
function RowHeaderCell({
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

export function PnlComparisonTable<TColumn extends ComparisonColumn>({
  model,
  firstColumnHeader,
  cellHint,
  onCellClick,
}: PnlComparisonTableProps<TColumn>) {
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const columnCount = model.columns.length

  const toggle = (key: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // One detail row per component, spanning the Revenue block (blank), the Cost block (filled) and
  // the Margin block (blank).
  const detailRows = (
    key: string,
    components: Record<string, (number | null)[]>,
    striped: boolean,
  ) =>
    COST_COMPONENTS.map(({ key: componentKey, label }) => (
      <tr
        key={`${key}-${componentKey}`}
        data-testid={`detail-${key}-${componentKey}`}
        className={striped ? 'bg-surface-2' : 'bg-surface-2/60'}
      >
        <td
          className={`sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1 pl-6 text-xs text-muted-foreground ${
            striped ? frozenCell(true) : FROZEN_CELL_SUBTLE
          }`}
        >
          {label}
        </td>
        {Array.from({ length: columnCount }, (_, i) => (
          <td key={`blank-revenue-${i}`} className="border-b border-l" />
        ))}
        {Array.from({ length: columnCount }, (_, i) => (
          <td
            key={`cost-${i}`}
            className="whitespace-nowrap border-b border-l px-3 py-1 text-right text-xs text-muted-foreground"
          >
            {formatValue(components[componentKey][i] ?? null)}
          </td>
        ))}
        {Array.from({ length: columnCount }, (_, i) => (
          <td key={`blank-margin-${i}`} className="border-b border-l" />
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
                className="sticky left-0 z-20 border-b border-r bg-table-head px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
              >
                {firstColumnHeader}
              </th>
              <th
                colSpan={columnCount}
                className="border-b border-l bg-good-soft px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.04em]"
              >
                Revenue
              </th>
              <th
                colSpan={columnCount}
                className="border-b border-l bg-info-soft px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.04em]"
              >
                Cost
              </th>
              {/* Margin is neither "info" nor "warning" — the third categorical block keeps its own
                  tint (chart-palette ink-2, Task 7's third hue) distinct from Revenue/Cost above. */}
              <th
                colSpan={columnCount}
                className="border-b border-l bg-ink-2/10 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.04em]"
              >
                Margin
              </th>
            </tr>
            <tr>
              {model.columns.map((column) => (
                <th
                  key={`rev-${column.id}`}
                  className="whitespace-nowrap border-b border-l bg-table-head px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  {column.name}
                </th>
              ))}
              {model.columns.map((column) => (
                <th
                  key={`cost-${column.id}`}
                  className="whitespace-nowrap border-b border-l bg-table-head px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
                >
                  {column.name}
                </th>
              ))}
              {model.columns.map((column) => (
                <th
                  key={`margin-${column.id}`}
                  className="whitespace-nowrap border-b border-l bg-table-head px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
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
                <React.Fragment key={row.rowKey}>
                  <tr
                    data-testid={`row-${row.rowKey}`}
                    className={`hover:bg-row-hover ${striped ? 'bg-surface-2' : ''}`}
                  >
                    <RowHeaderCell
                      label={row.rowLabel}
                      open={openRows.has(row.rowKey)}
                      onToggle={() => toggle(row.rowKey)}
                      className={frozenCell(striped)}
                    />
                    {FIELDS.flatMap((field) =>
                      row[field].map((value, i) => {
                        const warning = row.warnings[i]
                        // A warning tint outranks the negative-margin colour: an unreliable number
                        // should not be read as a confident loss.
                        const tint = hasWarning(warning) ? WARNING_TINT : valueClass(field, value)
                        const testId = `${field}-${row.rowKey}-${model.columns[i].id}`
                        return onCellClick ? (
                          <td key={testId} className={`border-b border-l p-0 ${tint}`}>
                            <button
                              type="button"
                              data-testid={testId}
                              title={cellTitle(cellHint, warning)}
                              className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                              onClick={() => onCellClick(model.columns[i], row.rowKey)}
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
                  {openRows.has(row.rowKey) && detailRows(row.rowKey, row.components, striped)}
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            {model.footerRows.map((footerRow, i) => (
              <React.Fragment key={footerRow.label}>
                <tr className={`bg-table-head font-semibold ${i === 0 ? 'border-t-2' : ''}`}>
                  {footerRow.components ? (
                    <RowHeaderCell
                      label={footerRow.label}
                      open={openRows.has(FOOTER_KEY)}
                      onToggle={() => toggle(FOOTER_KEY)}
                      className="bg-table-head text-right"
                    />
                  ) : (
                    <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-table-head px-3 py-1.5 text-right">
                      {footerRow.label}
                    </td>
                  )}
                  {FIELDS.flatMap((field) =>
                    footerRow[field].map((value, ci) => (
                      <td
                        key={`${field}-${ci}`}
                        title={warningTooltip(footerRow.warnings?.[ci])}
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${
                          hasWarning(footerRow.warnings?.[ci])
                            ? WARNING_TINT
                            : valueClass(field, value)
                        }`}
                      >
                        {formatValue(value)}
                      </td>
                    )),
                  )}
                </tr>
                {footerRow.components &&
                  openRows.has(FOOTER_KEY) &&
                  detailRows(FOOTER_KEY, footerRow.components, false)}
              </React.Fragment>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  )
}
