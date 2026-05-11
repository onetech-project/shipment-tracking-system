'use client'

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  PnlFilter,
  usePnlCostByRa,
  usePnlCostBySgIn,
  usePnlCostBySgOut,
  usePnlCostByVendor,
  usePnlCostTotals,
  usePnlProfitByRoute,
  usePnlRevenueByRoute,
} from '../hooks/usePnl'
import { PnlKpiKey } from './PnlKpiCards'
import { fmt, num } from '../utils/format'

interface PnlBreakdownPanelProps {
  filter: PnlFilter
  activeKpi: PnlKpiKey | null
}

export function PnlBreakdownPanel({ filter, activeKpi }: PnlBreakdownPanelProps) {
  if (activeKpi == null) return null
  return (
    <div className="rounded-lg border bg-card">
      {activeKpi === 'revenue' && <RevenueByRouteSection filter={filter} />}
      {activeKpi === 'cost' && <CostBreakdownSection filter={filter} />}
      {activeKpi === 'gp' && <ProfitByRouteSection filter={filter} />}
    </div>
  )
}

// ------------------------- Revenue --------------------------------------

function RevenueByRouteSection({ filter }: { filter: PnlFilter }) {
  const { data, isLoading } = usePnlRevenueByRoute(filter)
  return (
    <div>
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">Est. Revenue — by Route</p>
        {data && <p className="text-xs text-muted-foreground">{data.length} routes</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">Route</th>
              <th className="px-3 py-2 text-right">Total Weight (kg)</th>
              <th className="px-3 py-2 text-right">Total Est. Revenue</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {data?.map((r, idx) => (
              <tr key={r.route} className={`border-b ${idx % 2 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs">{r.route}</td>
                <td className="px-3 py-2 text-right">{num(r.totalWeight)}</td>
                <td className="px-3 py-2 text-right">{fmt.format(r.totalRevenue)}</td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------- Cost ------------------------------------------

type CostKey = 'smu' | 'ra' | 'sgOut' | 'sgIn'

function CostBreakdownSection({ filter }: { filter: PnlFilter }) {
  const { data: totals, isLoading } = usePnlCostTotals(filter)
  const [active, setActive] = useState<CostKey | null>(null)

  const cards: { key: CostKey; label: string; value: number }[] = totals
    ? [
        { key: 'smu', label: 'Total Cost SMU', value: totals.smu },
        { key: 'ra', label: 'Total Cost RA', value: totals.ra },
        { key: 'sgOut', label: 'Total Cost SG Out', value: totals.sgOut },
        { key: 'sgIn', label: 'Total Cost SG In', value: totals.sgIn },
      ]
    : []

  return (
    <div>
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">Est. Cost — Breakdown</p>
      </div>
      <div className="p-4">
        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {totals && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((c) => {
              const isActive = active === c.key
              return (
                <button
                  key={c.key}
                  onClick={() => setActive((prev) => (prev === c.key ? null : c.key))}
                  className={`min-w-0 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 ${
                    isActive ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'bg-card'
                  }`}
                >
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {c.label}
                  </p>
                  <p className="mt-1 text-base font-bold leading-tight">{fmt.format(c.value)}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {active === 'smu' && <SmuVendorTable filter={filter} />}
      {active === 'ra' && <NamedCostTable filter={filter} kind="ra" />}
      {active === 'sgOut' && <NamedCostTable filter={filter} kind="sgOut" />}
      {active === 'sgIn' && <SgInRouteTable filter={filter} />}
    </div>
  )
}

function SmuVendorTable({ filter }: { filter: PnlFilter }) {
  const { data, isLoading } = usePnlCostByVendor(filter)
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="border-t">
      <div className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        SMU — by Vendor
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="w-6 px-2 py-2" />
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-right">Total Weight (kg)</th>
              <th className="px-3 py-2 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {data?.map((vendor, idx) => {
              const isExpanded = expanded === vendor.vendor
              return (
                <Fragment key={vendor.vendor}>
                  <tr
                    onClick={() =>
                      setExpanded((prev) => (prev === vendor.vendor ? null : vendor.vendor))
                    }
                    className={`border-b cursor-pointer hover:bg-muted/50 ${idx % 2 ? 'bg-muted/30' : ''}`}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </td>
                    <td className="px-3 py-2">{vendor.vendor}</td>
                    <td className="px-3 py-2 text-right">{num(vendor.totalWeight)}</td>
                    <td className="px-3 py-2 text-right">{fmt.format(vendor.totalCost)}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} className="border-b bg-muted/20 p-0">
                        <div className="px-6 py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="py-1 text-left">Airline</th>
                                <th className="py-1 text-right">Total Weight (kg)</th>
                                <th className="py-1 text-right">Total Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vendor.airlines.map((a, ai) => (
                                <tr
                                  key={`${vendor.vendor}-${a.airline}`}
                                  className={ai % 2 ? 'bg-muted/30' : ''}
                                >
                                  <td className="py-1">{a.airline}</td>
                                  <td className="py-1 text-right">{num(a.totalWeight)}</td>
                                  <td className="py-1 text-right">{fmt.format(a.totalCost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NamedCostTable({ filter, kind }: { filter: PnlFilter; kind: 'ra' | 'sgOut' }) {
  const ra = usePnlCostByRa(filter, kind === 'ra')
  const sgOut = usePnlCostBySgOut(filter, kind === 'sgOut')
  const { data, isLoading } = kind === 'ra' ? ra : sgOut
  const heading = kind === 'ra' ? 'RA — by Name' : 'SG Out — by Name'

  return (
    <div className="border-t">
      <div className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-right">Total Weight (kg)</th>
              <th className="px-3 py-2 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {data?.map((r, idx) => (
              <tr key={r.name} className={`border-b ${idx % 2 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right">{num(r.totalWeight)}</td>
                <td className="px-3 py-2 text-right">{fmt.format(r.totalCost)}</td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SgInRouteTable({ filter }: { filter: PnlFilter }) {
  const { data, isLoading } = usePnlCostBySgIn(filter)
  return (
    <div className="border-t">
      <div className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        SG In — by Route
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">Route</th>
              <th className="px-3 py-2 text-right">Total Weight (kg)</th>
              <th className="px-3 py-2 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {data?.map((r, idx) => (
              <tr key={r.route} className={`border-b ${idx % 2 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs">{r.route}</td>
                <td className="px-3 py-2 text-right">{num(r.totalWeight)}</td>
                <td className="px-3 py-2 text-right">{fmt.format(r.totalCost)}</td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------- Gross Profit ----------------------------------

function ProfitByRouteSection({ filter }: { filter: PnlFilter }) {
  const { data, isLoading } = usePnlProfitByRoute(filter)
  return (
    <div>
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">Est. Gross Profit — by Route</p>
        {data && <p className="text-xs text-muted-foreground">{data.length} routes</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">Route</th>
              <th className="px-3 py-2 text-right">Total Est. Revenue</th>
              <th className="px-3 py-2 text-right">Total Margin</th>
              <th className="px-3 py-2 text-right">Avg Weight/Day</th>
              <th className="px-3 py-2 text-right">Avg Cost/kg</th>
              <th className="px-3 py-2 text-right">Avg Margin/kg</th>
              <th className="px-3 py-2 text-right">Avg Margin/Day</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {data?.map((r, idx) => (
              <tr key={r.route} className={`border-b ${idx % 2 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs">{r.route}</td>
                <td className="px-3 py-2 text-right">{fmt.format(r.totalRevenue)}</td>
                <td
                  className={`px-3 py-2 text-right font-medium ${r.totalMargin < 0 ? 'text-red-600' : ''}`}
                >
                  {fmt.format(r.totalMargin)}
                </td>
                <td className="px-3 py-2 text-right">{num(Math.round(r.avgWeightPerDay))}</td>
                <td className="px-3 py-2 text-right">{fmt.format(r.avgCostPerKg)}</td>
                <td className="px-3 py-2 text-right">{fmt.format(r.avgMarginPerKg)}</td>
                <td className="px-3 py-2 text-right">{fmt.format(r.avgMarginPerDay)}</td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
