/**
 * "Who carried what" — one shape for every attribution table (airline, RA, SG, vendor), plus the
 * self-operate gap that prices third-party tonnage against ESP's own cost on the same airline.
 */

import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'
import { div, num, UNATTRIBUTED } from './series'

export interface ShareRow {
  name: string
  weight: number
  cost: number
  costPerKg: number
  weightPct: number
  costPct: number
  attributed: boolean
}

export interface ShareResult {
  rows: ShareRow[]
  attributedPct: number
}

/**
 * The unattributed bucket stays visible — hiding it would make the attributed shares look like
 * the whole picture — but sorts last so it never heads a ranking.
 */
export function buildShare(
  entries: Array<{ name: string | null; weight: number; cost: number }>,
): ShareResult {
  const totalWeight = entries.reduce((s, e) => s + num(e.weight), 0)
  const totalCost = entries.reduce((s, e) => s + num(e.cost), 0)
  const isAttributed = (name: string | null) => !!name && name !== UNATTRIBUTED
  const attributedWeight = entries
    .filter((e) => isAttributed(e.name))
    .reduce((s, e) => s + num(e.weight), 0)

  const rows = entries
    .map((e) => ({
      name: e.name ?? UNATTRIBUTED,
      weight: num(e.weight),
      cost: num(e.cost),
      costPerKg: div(num(e.cost), num(e.weight)),
      weightPct: div(num(e.weight), totalWeight) * 100,
      costPct: div(num(e.cost), totalCost) * 100,
      attributed: isAttributed(e.name),
    }))
    .sort((a, b) => {
      if (a.attributed !== b.attributed) return a.attributed ? -1 : 1
      return b.weight - a.weight
    })

  return { rows, attributedPct: div(attributedWeight, totalWeight) * 100 }
}

/** Adapts any `{ <nameField>, totalWeight, totalCost }` endpoint row onto `buildShare`. */
export function shareTable<T extends { totalWeight: number; totalCost: number }>(
  rows: T[] | undefined,
  nameField: keyof T & string,
): ShareResult {
  return buildShare(
    (rows ?? []).map((r) => ({
      name: (r[nameField] as string | null) ?? null,
      weight: num(r.totalWeight),
      cost: num(r.totalCost),
    })),
  )
}

export function vendorExecution(costByVendor: PnlVendorCostItem[] | undefined): ShareResult {
  return shareTable(costByVendor, 'vendor')
}

export function airlineShare(costByVendor: PnlVendorCostItem[] | undefined): ShareResult {
  const acc = new Map<string, { name: string; weight: number; cost: number }>()
  for (const v of costByVendor ?? []) {
    for (const a of v.airlines ?? []) {
      const cur = acc.get(a.airline) ?? { name: a.airline, weight: 0, cost: 0 }
      cur.weight += num(a.totalWeight)
      cur.cost += num(a.totalCost)
      acc.set(a.airline, cur)
    }
  }
  return buildShare(Array.from(acc.values()))
}

export interface SelfOperateRow {
  airline: string
  vendor: string
  vendorWeight: number
  vendorCostPerKg: number
  espCostPerKg: number
  gapPerKg: number
  impact: number
  capitalNeeded: number
}

export interface SelfOperateResult {
  rows: SelfOperateRow[]
  totalImpact: number
  totalCapital: number
}

/**
 * What would self-operating have cost? Each vendor's cost per kg on an airline against ESP's own
 * cost per kg on that same airline. Airline is the finest grain `cost-by-vendor` exposes for every
 * period.
 */
export function selfOperateGap(costByVendor: PnlVendorCostItem[] | undefined): SelfOperateResult {
  const esp = new Map<string, number>()
  for (const v of costByVendor ?? []) {
    if (v.vendor !== 'ESP') continue
    for (const a of v.airlines ?? []) {
      // A zero-weight ESP row carries no usable cost per kg. Recording it would present "ESP flies
      // this airline for free" as a comparable baseline and fabricate a saving.
      if (num(a.totalWeight) <= 0) continue
      esp.set(a.airline, div(num(a.totalCost), num(a.totalWeight)))
    }
  }

  const rows: SelfOperateRow[] = []
  for (const v of costByVendor ?? []) {
    if (!v.vendor || v.vendor === 'ESP' || v.vendor === UNATTRIBUTED) continue
    for (const a of v.airlines ?? []) {
      const espCostPerKg = esp.get(a.airline)
      if (espCostPerKg == null) continue // no ESP baseline: not comparable
      const vendorWeight = num(a.totalWeight)
      if (vendorWeight <= 0) continue // no vendor tonnage: not comparable
      const vendorCostPerKg = div(num(a.totalCost), vendorWeight)
      const gapPerKg = vendorCostPerKg - espCostPerKg
      rows.push({
        airline: a.airline,
        vendor: v.vendor,
        vendorWeight,
        vendorCostPerKg,
        espCostPerKg,
        gapPerKg,
        impact: vendorWeight * gapPerKg,
        capitalNeeded: vendorWeight * espCostPerKg,
      })
    }
  }
  rows.sort((a, b) => b.impact - a.impact)

  return {
    rows,
    totalImpact: rows.reduce((s, r) => s + r.impact, 0),
    totalCapital: rows.reduce((s, r) => s + r.capitalNeeded, 0),
  }
}
