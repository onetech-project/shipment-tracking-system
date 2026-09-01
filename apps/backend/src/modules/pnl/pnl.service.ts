import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  DateBasis,
  BASIS_COLS,
  resolveBasis,
  buildFilter,
  calendarDaysForFilter,
  calendarDatesForFilter,
} from './pnl-filter.util'
import { originLabel } from '../../common/utils/origin-labels.util'
import { indexIssueRows, ISSUE_BY_RANK, PnlCellIssue } from './pnl-cell-issues.util'
import { RoutePair, ColumnPick } from './pnl-columns.util'
import { VendorColumnPick } from './pnl-vendor-columns.util'

// ── NET REVENUE ──────────────────────────────────────────────────────────────────────────────
// v_pnl_to stores revenue GROSS and carries pph_2 + disc_15 beside it in revenue_discount
// (20260829000001-pnl-rate-spx-revenue). Margin always netted the discount; the revenue figures
// did not, so on every screen Revenue - Cost overshot Margin by exactly the discount and two tabs
// carried a note explaining the gap.
//
// Every revenue value this service returns for DISPLAY is now net: revenue_total - revenue_discount,
// which is gross_weight * (rate_spx - pph_2 - disc_15) + packing_kayu. The view is untouched — this
// is presentation only — and each net figure is derived where the discount is already selected, so
// no query grew a join. Margin and cost are unchanged; only the revenue side and the marginPct
// denominators moved.
//
// Adding a new revenue-returning query? Select COALESCE(SUM(revenue_discount), 0) with it and
// subtract, or the new surface will disagree with every existing one.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export interface PnlSummary {
  label: string
  totalTos: number
  totalAwbs: number
  // Net of revenue_discount — this is the figure the KPI card shows, so that on screen
  // totalRevenue - totalCost === grossProfit. See NET REVENUE below.
  totalRevenue: number
  totalRevenueGross: number // SUM(revenue_total), before the discount
  totalDiscount: number
  totalCost: number
  grossProfit: number
  grossMarginPct: number // over net revenue
}

export interface PnlDailyMarginItem {
  date: string
  revenue: number
  cost: number
  marginPct: number | null
  hasIncompleteCost: boolean
}

export interface PnlAwbRow {
  awb: string
  vendor: string | null
  airline: string | null
  origin: string | null // dominant origin_station across the AWB's TOs
  dest: string | null
  date: string | null // YYYY-MM-DD on the active date basis
  originVaries: boolean // TOs of this AWB disagree on origin
  destVaries: boolean
  dateVaries: boolean
  toCount: number
  sumGw: number
  chwt: number | null
  totalRevenue: number
  totalDiscount: number
  costSmu: number | null
  costRa: number | null
  costSgOut: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
  // TRUE when any TO under this AWB was costed by the route-level fallback rather than a booking.
  isCostEstimated: boolean
  issue: string | null
}

// Optional narrowing for the AWB drilldown. Every field is independent; supplying none leaves the
// query exactly as it was before route filtering existed.
export interface PnlRouteFilter {
  routes?: RoutePair[]
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
  // Raw vendor names, as stored in v_pnl_to.vendor. Unlike routes and dates, this narrows the
  // OUTER aggregate rather than the EXISTS that selects AWBs — see getAwbDrilldown.
  vendors?: string[]
}

export interface PnlToRow {
  toNumber: string
  grossWeight: number
  chwt: number | null
  revenue: number
  costSmu: number | null
  costRa: number | null
  costSg: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  marginPct: number | null
  issue: string | null
  // TRUE when the cost came from the route-level fallback (no reservation yet, or its vendor/
  // airline pair has no SMU rate) rather than the TO's own booking — the figures are an estimate.
  isCostEstimated: boolean
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
}

export interface PnlDataQualitySummaryItem {
  issue: string
  rows: number
  awbs: number
}

export interface PnlRevenueByRouteItem {
  route: string
  totalWeight: number
  totalRevenue: number
}

export interface PnlCostTotals {
  smu: number
  ra: number
  sgOut: number
  sgIn: number
}

export interface PnlAirlineCostItem {
  airline: string
  totalWeight: number
  totalCost: number
}

export interface PnlVendorCostItem {
  vendor: string
  totalWeight: number
  totalCost: number
  airlines: PnlAirlineCostItem[]
}

export interface PnlNamedCostItem {
  name: string
  totalWeight: number
  totalCost: number
}

export interface PnlSgInRouteCostItem {
  route: string
  totalWeight: number
  totalCost: number
}

export interface PnlProfitByRouteItem {
  route: string
  totalRevenue: number
  totalMargin: number
  avgWeightPerDay: number
  avgCostPerKg: number
  avgMarginPerKg: number
  avgMarginPerDay: number
}

export interface PnlStation {
  origin: string // raw v_pnl_to value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}

// A daily matrix column is exactly one station pair, so the two share a definition.
export type PnlDailyMatrixColumn = PnlStation

export interface PnlDailyMatrixCell {
  revenue: number
  margin: number
  weight: number
  incompleteTos: number // TOs whose cost could not be computed; margin here is optimistic
  issues: PnlCellIssue[] // empty = clean; never null, so the frontend has one shape to read
}

export interface PnlDailyMatrixRow {
  date: string // YYYY-MM-DD
  cells: (PnlDailyMatrixCell | null)[] // index-aligned with columns; null = no shipment at all
}

export interface PnlDailyMatrixFooter {
  totalRevenue: number
  totalMargin: number
  totalWeight: number
  avgRevenuePerDay: number
  avgMarginPerDay: number
  marginPct: number | null // null when totalRevenue is 0
  spacePerKg: number | null // null when totalWeight is 0
  incompleteTos: number
  // Distinct AWBs for the whole period, from its own grouping set — NOT the sum of the day cells,
  // which would count an AWB once per day it shipped.
  issues: PnlCellIssue[]
}

export interface PnlDailyMatrix {
  columns: PnlDailyMatrixColumn[]
  rows: PnlDailyMatrixRow[]
  footer: PnlDailyMatrixFooter[] // index-aligned with columns
  periodDays: number
}

export interface PnlRouteComparisonColumn {
  // A group column's id is its uuid; a route column's is `r:<origin>|<dest>`, which is also the
  // descriptor the frontend sends back, so the id round-trips.
  id: string
  name: string
  routeCount: number
  kind: 'group' | 'route'
  // The pairs this column aggregates. Sent to the client so a clicked cell can build the AWB
  // drilldown filter, and so overlap between columns is computed off the same list the numbers
  // came from rather than a second, drifting copy.
  routes: { origin: string; originLabel: string; dest: string }[]
}

export interface PnlRouteComparisonCell {
  revenue: number
  cost: number
  // revenue_total - revenue_discount - cost_to, exactly the expression getDailyMatrix uses, so the
  // same route and period reads the same in both tabs. NOT SUM(gross_profit_to): that view column
  // is NULL-propagating while COALESCE(SUM(...)) skips NULL rows, and the two differ by ~75x on
  // current data because most TOs have no computable cost.
  margin: number
  // The four components are prorated to TO level, each behind the same FILTER (WHERE cost_to IS
  // NOT NULL) clause as `cost`, so they sum exactly to `cost`. Measured against the live view
  // today, the SMU and SG Out filters happen to be no-ops (every null-cost row already has a null
  // cost_smu_awb, and cost_sg_out_awb * weight_share sums to 0 across those rows) — RA and SG In
  // are the two that currently change value when the filter is applied. All four are kept
  // filtered anyway for defensive correctness; this is not a claim that all four carry weight now.
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number // TOs with no computable cost; `cost` here is understated
  issues: PnlCellIssue[] // empty = clean; never null, so the frontend has one shape to read
}

export interface PnlRouteComparisonRow {
  date: string // YYYY-MM-DD
  cells: (PnlRouteComparisonCell | null)[] // index-aligned with columns; null = no shipment at all
}

export interface PnlRouteComparisonFooter {
  totalRevenue: number
  totalCost: number
  totalMargin: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  avgRevenuePerDay: number
  avgCostPerDay: number
  avgMarginPerDay: number
  incompleteTos: number
  // Distinct AWBs for the period, from its own grouping set — NOT the sum of the day cells.
  issues: PnlCellIssue[]
}

export interface PnlRouteComparison {
  columns: PnlRouteComparisonColumn[]
  rows: PnlRouteComparisonRow[]
  footer: PnlRouteComparisonFooter[] // index-aligned with columns
  periodDays: number
}

export interface PnlVendorComparisonColumn {
  // 'vg:<uuid>' for a saved vendor group, 'v:<raw name>' for a single vendor. Identical to the
  // descriptor the frontend sent, so the id round-trips and the client can match columns to picks.
  id: string
  name: string
  kind: 'group' | 'vendor'
  // The vendor names this column aggregates, raw. Sent to the client so a clicked cell can build
  // the drilldown filter, and so overlap between columns is computed off the same list the numbers
  // came from rather than a second, drifting copy.
  vendors: string[]
  vendorCount: number
}

export interface PnlVendorComparisonCell {
  revenue: number // net of revenue_discount, like every other displayed revenue figure
  cost: number
  // revenue_total - revenue_discount - cost_to, the same expression getDailyMatrix uses, so one
  // route and period reads the same in both tabs. NOT SUM(gross_profit_to), which is
  // NULL-propagating where COALESCE(SUM(...)) skips NULL rows.
  margin: number
  // Three of these four are AWB-grain and are prorated by weight_share here; cost_sg_in_to already
  // carries weight_share inside the view definition and is therefore summed as-is. All four sit
  // behind the same FILTER (WHERE cost_to IS NOT NULL) clause as `cost`, so they sum exactly to it.
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number // TOs with no computable cost; `cost` here is understated
  issues: PnlCellIssue[] // empty = clean; never null, so the frontend has one shape to read
}

export interface PnlVendorComparisonRow {
  origin: string
  originLabel: string
  dest: string
  cells: (PnlVendorComparisonCell | null)[] // index-aligned with columns; null = nothing flew
}

export interface PnlVendorComparisonFooter {
  totalRevenue: number
  totalCost: number
  totalMargin: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  // The divisor behind the three averages below, sent explicitly rather than recomputed on the
  // client: the Route Comparison footer divides by calendar days, this one divides by routes, and
  // the two tabs share one renderer. A slot that means two different things must say which.
  routesWithData: number
  avgRevenuePerRoute: number | null // null when routesWithData is 0
  avgCostPerRoute: number | null
  avgMarginPerRoute: number | null
  incompleteTos: number
  // Distinct AWBs for the whole period, from its own grouping set — NOT the sum of the row cells.
  issues: PnlCellIssue[]
}

export interface PnlVendorComparison {
  columns: PnlVendorComparisonColumn[]
  rows: PnlVendorComparisonRow[]
  footer: PnlVendorComparisonFooter[] // index-aligned with columns
  // Drives a permanent banner. Only about a third of period revenue is attributable to a vendor at
  // all, so without this the table reads as a decomposition of the period and quietly loses 70%.
  coverage: { revenueInColumns: number; revenuePeriod: number }
}

@Injectable()
export class PnlService {
  constructor(private readonly dataSource: DataSource) {}

  async getCycles(basis?: string): Promise<string[]> {
    const cycleCol = BASIS_COLS[resolveBasis(basis)].cycle
    const rows = await this.dataSource.query(`
      SELECT DISTINCT ${cycleCol} AS cycle_period
      FROM v_pnl_to
      WHERE ${cycleCol} IS NOT NULL
      ORDER BY cycle_period DESC
    `)
    return rows.map((r: { cycle_period: string }) => r.cycle_period)
  }

  // Distinct origin→destination pairs across the whole view, not just the selected period, so the
  // daily matrix columns and the drilldown route dropdowns stay stable as the user changes cycle.
  async getStations(): Promise<PnlStation[]> {
    const rows = await this.dataSource.query(`
      SELECT DISTINCT origin_station, dest_station
      FROM v_pnl_to
      WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
      ORDER BY 1, 2
    `)
    return (rows as Record<string, string>[]).map((r) => ({
      origin: r.origin_station,
      originLabel: originLabel(r.origin_station),
      dest: r.dest_station,
    }))
  }

  // Selectable routes for the Daily Report's route filter. Reads the DC-pair master rather than
  // v_pnl_to, so a route can be picked before its first shipment ever lands — a picked route with
  // no shipments in the period renders as an all-em-dash column, which is a real answer.
  //
  // RouteGroupsService.getAvailableRoutes runs the same master query, but its endpoint is guarded
  // by READ_ROUTE_GROUP while the Daily Report tab is not, so a user allowed to see the tab but
  // not route groups would get a 403 and an empty filter. Duplicating a stable SELECT is cheaper
  // than either having one module import the other's service or inventing a multi-permission
  // guard. What is deliberately NOT duplicated is that method's hasData join: marking never-flown
  // routes only serves the route picker, and here the em-dash column already says it.
  async getRoutes(): Promise<PnlStation[]> {
    const rows = await this.dataSource.query(`
      SELECT DISTINCT
        NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin,
        NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest
      FROM air_shipments_data
      WHERE service = 'Air'
        AND NULLIF(BTRIM(extra_fields->>'origin_station'), '')      IS NOT NULL
        AND NULLIF(BTRIM(extra_fields->>'destination_station'), '') IS NOT NULL
      ORDER BY 1, 2
    `)
    return (rows as Record<string, string>[]).map((r) => ({
      origin: r.origin,
      originLabel: originLabel(r.origin),
      dest: r.dest,
    }))
  }

  async getSummary(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlSummary> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int                           AS total_tos,
        COUNT(DISTINCT awb)::int                AS total_awbs,
        COALESCE(SUM(revenue_total), 0)         AS total_revenue,
        COALESCE(SUM(revenue_discount), 0)      AS total_discount,
        COALESCE(SUM(cost_to), 0)               AS total_cost
      FROM v_pnl_to
      WHERE ${where}
      `,
      params,
    )
    const row = rows[0]
    const totalRevenueGross = Number(row.total_revenue)
    const totalDiscount = Number(row.total_discount)
    const totalCost = Number(row.total_cost)
    const totalRevenue = totalRevenueGross - totalDiscount
    // Unchanged: the discount was always netted here. What changed is that totalRevenue now carries
    // the same netting, so the card reads gross_weight * (rate_spx - pph_2 - disc_15) + packing.
    const grossProfit = totalRevenue - totalCost
    const label = cyclePeriod ?? `${startDate} to ${endDate}`
    return {
      label,
      totalTos: Number(row.total_tos),
      totalAwbs: Number(row.total_awbs),
      totalRevenue,
      totalRevenueGross,
      totalDiscount,
      totalCost,
      grossProfit,
      grossMarginPct: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    }
  }

  async getDailyMargin(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlDailyMarginItem[]> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(revenue_total), 0)    AS revenue,
        COALESCE(SUM(revenue_discount), 0) AS discount,
        COALESCE(SUM(cost_to), 0)          AS cost,
        BOOL_OR(cost_to IS NULL)           AS has_incomplete_cost
      FROM v_pnl_to
      WHERE ${where}
        AND ${dateCol} IS NOT NULL
      GROUP BY 1
      ORDER BY 1
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => {
      const revenue = Number(r.revenue) - Number(r.discount)
      const cost = Number(r.cost)
      const gp = revenue - cost
      return {
        date: r.date as string,
        revenue,
        cost,
        marginPct: revenue > 0 ? (gp / revenue) * 100 : null,
        hasIncompleteCost: r.has_incomplete_cost === true || r.has_incomplete_cost === 't',
      }
    })
  }

  async getAwbDrilldown(
    page: number,
    limit: number,
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    route?: PnlRouteFilter,
  ): Promise<{ data: PnlAwbRow[]; total: number }> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
    // Same clause against the subquery alias. It reuses $1/$2, so no params are bound twice.
    const inner = buildFilter(basis, cyclePeriod, startDate, endDate, 'm.')

    // The route filter decides which AWBs are listed, not which TOs are summed: cost columns are
    // MAX(cost_*_awb) over the whole AWB, so dropping TOs here would understate revenue against a
    // full-AWB cost and invent losses. An AWB qualifies when any one of its TOs matches.
    const routeParams: unknown[] = []
    const routeConds: string[] = []
    const bind = (value: unknown): string => {
      routeParams.push(value)
      return `$${params.length + routeParams.length}`
    }
    // Two parallel arrays rather than one interleaved list: UNNEST zips them, so the pairs stay
    // pairs. A flattened list would match any origin against any destination.
    if (route?.routes?.length) {
      const origins = bind(route.routes.map((r) => r.origin))
      const dests = bind(route.routes.map((r) => r.dest))
      routeConds.push(
        `(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST(${origins}::text[], ${dests}::text[]))`,
      )
    }
    if (route?.dateFrom) routeConds.push(`${inner.dateCol} >= ${bind(route.dateFrom)}::DATE`)
    if (route?.dateTo) {
      routeConds.push(`${inner.dateCol} < (${bind(route.dateTo)}::DATE + INTERVAL '1 day')`)
    }
    const routeWhere = routeConds.length
      ? `AND EXISTS (
           SELECT 1 FROM v_pnl_to m
           WHERE m.awb = v.awb
             AND ${inner.where}
             AND ${routeConds.join(' AND ')}
         )`
      : ''

    // Vendor is the one filter that belongs in the OUTER predicate. The route and date conditions
    // above sit inside an EXISTS on purpose: they decide which AWBs are listed while the aggregate
    // still sums the whole AWB, because the cost columns are MAX(cost_*_awb) over it. Vendor is
    // different — v_pnl_to.vendor comes from the AWB's booking, so it is constant across an AWB's
    // TOs, and the outer predicate is what has the same scope as the vendor column whose cell was
    // clicked. Putting it inside the EXISTS would produce a third number nobody asked for.
    const vendorWhere = route?.vendors?.length
      ? `AND v.vendor = ANY(${bind(route.vendors)}::text[])`
      : ''

    const offset = (page - 1) * limit
    const filterParams = [...params, ...routeParams]
    const dataParams = [...filterParams, limit, offset]
    const countParams = [...filterParams]
    const p = filterParams.length

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          awb,
          vendor,
          airline,
          MODE() WITHIN GROUP (ORDER BY origin_station)                        AS origin,
          MODE() WITHIN GROUP (ORDER BY dest_station)                          AS dest,
          TO_CHAR(MODE() WITHIN GROUP (ORDER BY ${dateCol}::DATE), 'YYYY-MM-DD') AS route_date,
          COUNT(DISTINCT origin_station) > 1                                   AS origin_varies,
          COUNT(DISTINCT dest_station)   > 1                                   AS dest_varies,
          COUNT(DISTINCT ${dateCol}::DATE) > 1                                 AS date_varies,
          COUNT(*)::int                           AS to_count,
          SUM(gross_weight)                       AS sum_gw,
          MAX(chwt_awb)                           AS chwt,
          COALESCE(SUM(revenue_total), 0)         AS total_revenue,
          COALESCE(SUM(revenue_discount), 0)      AS total_discount,
          MAX(cost_smu_awb)                       AS cost_smu,
          MAX(cost_ra_awb)                        AS cost_ra,
          MAX(cost_sg_out_awb)                    AS cost_sg_out,
          SUM(cost_sg_in_to)                      AS cost_sg_in,
          MAX(cost_total_awb) + COALESCE(SUM(cost_sg_in_to), 0) AS total_cost,
          COALESCE(SUM(gross_profit_to), 0)       AS gross_profit,
          (MAX(cost_total_awb) IS NULL OR MAX(cost_sg_in_to) IS NULL) AS has_null_cost,
          BOOL_OR(is_cost_estimated)              AS is_cost_estimated,
          MIN(CASE issue
                WHEN 'no_booking' THEN 1 WHEN 'smu_rate_missing' THEN 2
                WHEN 'ra_rate_missing' THEN 3 WHEN 'sgout_name_missing' THEN 4
                WHEN 'revenue_missing' THEN 5 WHEN 'station_mapping_missing' THEN 6
                WHEN 'sg_in_rate_missing' THEN 7
              END)                                  AS issue_rank
        FROM v_pnl_to v
        WHERE ${where}
        ${routeWhere}
        ${vendorWhere}
        GROUP BY awb, vendor, airline
        -- Ordered on the net figure, matching the Revenue column the table renders.
        ORDER BY (COALESCE(SUM(revenue_total), 0)
                  - COALESCE(SUM(revenue_discount), 0)) DESC NULLS LAST
        LIMIT $${p + 1} OFFSET $${p + 2}
        `,
        dataParams,
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to v WHERE ${where} ${routeWhere} ${vendorWhere}`,
        countParams,
      ),
    ])

    const total = Number(countRows[0].total)
    const data: PnlAwbRow[] = rows.map((r: Record<string, unknown>) => {
      const rev = Number(r.total_revenue) - Number(r.total_discount)
      const gp = Number(r.gross_profit)
      const totalCost = r.total_cost != null ? Number(r.total_cost) : null
      return {
        awb: r.awb as string,
        vendor: r.vendor as string | null,
        airline: r.airline as string | null,
        origin: (r.origin as string | null) ?? null,
        dest: (r.dest as string | null) ?? null,
        date: (r.route_date as string | null) ?? null,
        originVaries: r.origin_varies === true || r.origin_varies === 't',
        destVaries: r.dest_varies === true || r.dest_varies === 't',
        dateVaries: r.date_varies === true || r.date_varies === 't',
        toCount: Number(r.to_count),
        sumGw: Number(r.sum_gw),
        chwt: r.chwt != null ? Number(r.chwt) : null,
        totalRevenue: rev, // net; the gross figure stays in totalDiscount's sibling below
        totalDiscount: Number(r.total_discount),
        costSmu: r.cost_smu != null ? Number(r.cost_smu) : null,
        costRa: r.cost_ra != null ? Number(r.cost_ra) : null,
        costSgOut: r.cost_sg_out != null ? Number(r.cost_sg_out) : null,
        costSgIn: r.cost_sg_in != null ? Number(r.cost_sg_in) : null,
        totalCost,
        grossProfit: gp,
        grossMarginPct: rev > 0 ? (gp / rev) * 100 : null,
        hasNullCost: r.has_null_cost === true || r.has_null_cost === 't',
        isCostEstimated: r.is_cost_estimated === true || r.is_cost_estimated === 't',
        issue: r.issue_rank != null ? (ISSUE_BY_RANK[Number(r.issue_rank)] ?? null) : null,
      }
    })
    return { data, total }
  }

  // Per-AWB worklist of costing failures, using the canonical v_pnl_to.issue (root cause first).
  // One row per (awb, issue), paginated server-side.
  async getDataQuality(
    page = 1,
    limit = 25,
  ): Promise<{ data: PnlDataQualityItem[]; total: number }> {
    const offset = (page - 1) * limit
    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT awb, issue, MIN(to_number) AS to_number
        FROM v_pnl_to
        WHERE issue IS NOT NULL
        GROUP BY awb, issue
        ORDER BY issue, awb
        LIMIT $1 OFFSET $2
        `,
        [limit, offset],
      ),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS total
        FROM (SELECT 1 FROM v_pnl_to WHERE issue IS NOT NULL GROUP BY awb, issue) g
      `),
    ])
    const data: PnlDataQualityItem[] = rows.map((r: Record<string, string>) => ({
      toNumber: r.to_number,
      awb: r.awb,
      issue: r.issue,
    }))
    return { data, total: Number(countRows[0].total) }
  }

  // Headline costing-coverage counts: rows + distinct AWBs per failure reason. Drives the
  // frontend coverage panel so the team can fill the source sheets until 0% NULL.
  async getDataQualitySummary(): Promise<PnlDataQualitySummaryItem[]> {
    const rows = await this.dataSource.query(`
      SELECT issue, COUNT(*)::int AS rows, COUNT(DISTINCT awb)::int AS awbs
      FROM v_pnl_to
      WHERE issue IS NOT NULL
      GROUP BY issue
      ORDER BY rows DESC
    `)
    return rows.map((r: Record<string, string>) => ({
      issue: r.issue,
      rows: Number(r.rows),
      awbs: Number(r.awbs),
    }))
  }

  async getAwbTos(
    awb: string,
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlToRow[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        to_number,
        gross_weight,
        chwt_awb * weight_share                AS chwt,
        revenue_total,
        revenue_discount,
        cost_smu_awb  * weight_share          AS cost_smu,
        cost_ra_awb   * weight_share          AS cost_ra,
        cost_sg_out_awb * weight_share        AS cost_sg,
        cost_sg_in_to                          AS cost_sg_in,
        cost_to,
        gross_profit_to,
        -- Both sides of the ratio are net: gross_profit_to already subtracts revenue_discount,
        -- so dividing by the gross revenue would understate every TO's margin.
        CASE WHEN (revenue_total - revenue_discount) > 0 AND gross_profit_to IS NOT NULL
             THEN (gross_profit_to / (revenue_total - revenue_discount)) * 100
             ELSE NULL
        END AS margin_pct,
        issue,
        is_cost_estimated
      FROM v_pnl_to
      WHERE awb = $1 AND ${where.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`)}
      ORDER BY to_number
      `,
      [awb, ...params],
    )
    return rows.map((r: Record<string, unknown>) => ({
      toNumber: r.to_number as string,
      grossWeight: Number(r.gross_weight),
      chwt: r.chwt != null ? Number(r.chwt) : null,
      revenue: Number(r.revenue_total) - Number(r.revenue_discount),
      costSmu: r.cost_smu != null ? Number(r.cost_smu) : null,
      costRa: r.cost_ra != null ? Number(r.cost_ra) : null,
      costSg: r.cost_sg != null ? Number(r.cost_sg) : null,
      costSgIn: r.cost_sg_in != null ? Number(r.cost_sg_in) : null,
      totalCost: r.cost_to != null ? Number(r.cost_to) : null,
      grossProfit: r.gross_profit_to != null ? Number(r.gross_profit_to) : null,
      marginPct: r.margin_pct != null ? Number(r.margin_pct) : null,
      issue: (r.issue as string | null) ?? null,
      isCostEstimated: r.is_cost_estimated === true,
    }))
  }

  async getRevenueByRoute(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlRevenueByRouteItem[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        COALESCE(NULLIF(origin_station, ''), '?') || ' → ' ||
        COALESCE(NULLIF(dest_station,   ''), '?') AS route,
        COALESCE(SUM(gross_weight), 0)            AS total_weight,
        COALESCE(SUM(revenue_total), 0)           AS total_revenue,
        COALESCE(SUM(revenue_discount), 0)        AS total_discount
      FROM v_pnl_to
      WHERE ${where}
      GROUP BY 1
      -- Ordered on the net figure, so the breakdown ranks by what it displays.
      ORDER BY (COALESCE(SUM(revenue_total), 0)
                - COALESCE(SUM(revenue_discount), 0)) DESC NULLS LAST
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => ({
      route: r.route as string,
      totalWeight: Number(r.total_weight),
      totalRevenue: Number(r.total_revenue) - Number(r.total_discount),
    }))
  }

  async getCostTotals(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlCostTotals> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    // SMU/RA/SG Out are AWB-level → take MAX per AWB then sum.
    // SG In is per-TO → straight sum.
    const rows = await this.dataSource.query(
      `
      WITH per_awb AS (
        SELECT awb,
               MAX(cost_smu_awb)    AS smu,
               MAX(cost_ra_awb)     AS ra,
               MAX(cost_sg_out_awb) AS sg_out
        FROM v_pnl_to
        WHERE ${where}
        GROUP BY awb
      ),
      sg_in AS (
        SELECT COALESCE(SUM(cost_sg_in_to), 0) AS sg_in
        FROM v_pnl_to
        WHERE ${where}
      )
      SELECT
        COALESCE(SUM(per_awb.smu), 0)    AS smu,
        COALESCE(SUM(per_awb.ra), 0)     AS ra,
        COALESCE(SUM(per_awb.sg_out), 0) AS sg_out,
        (SELECT sg_in FROM sg_in)        AS sg_in
      FROM per_awb
      `,
      params,
    )
    const r = rows[0] ?? {}
    return {
      smu: Number(r.smu ?? 0),
      ra: Number(r.ra ?? 0),
      sgOut: Number(r.sg_out ?? 0),
      sgIn: Number(r.sg_in ?? 0),
    }
  }

  async getCostByVendor(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlVendorCostItem[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    // SMU is AWB-level: take per-AWB cost (MAX since identical across rows of same AWB)
    // and per-AWB sum_gw, then aggregate by vendor / airline.
    const rows = await this.dataSource.query(
      `
      WITH per_awb AS (
        SELECT
          awb,
          COALESCE(NULLIF(vendor, ''), '—')  AS vendor,
          COALESCE(NULLIF(airline, ''), '—') AS airline,
          MAX(cost_smu_awb)                  AS cost_smu,
          MAX(sum_gw_per_awb)                AS sum_gw
        FROM v_pnl_to
        WHERE ${where}
        GROUP BY awb, vendor, airline
      )
      SELECT
        vendor,
        airline,
        COALESCE(SUM(sum_gw), 0)   AS total_weight,
        COALESCE(SUM(cost_smu), 0) AS total_cost
      FROM per_awb
      GROUP BY vendor, airline
      ORDER BY vendor ASC, total_cost DESC
      `,
      params,
    )

    const byVendor = new Map<string, PnlVendorCostItem>()
    for (const r of rows as Record<string, unknown>[]) {
      const vendor = r.vendor as string
      const airlineItem: PnlAirlineCostItem = {
        airline: r.airline as string,
        totalWeight: Number(r.total_weight),
        totalCost: Number(r.total_cost),
      }
      const existing = byVendor.get(vendor)
      if (existing) {
        existing.totalWeight += airlineItem.totalWeight
        existing.totalCost += airlineItem.totalCost
        existing.airlines.push(airlineItem)
      } else {
        byVendor.set(vendor, {
          vendor,
          totalWeight: airlineItem.totalWeight,
          totalCost: airlineItem.totalCost,
          airlines: [airlineItem],
        })
      }
    }
    return [...byVendor.values()].sort((a, b) => b.totalCost - a.totalCost)
  }

  async getCostByRa(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlNamedCostItem[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
    const rows = await this.dataSource.query(
      `
      WITH per_awb AS (
        SELECT
          v.awb,
          COALESCE(NULLIF(srx.ra_name, ''), '—') AS name,
          MAX(v.cost_ra_awb)   AS cost_ra,
          MAX(v.sum_gw_per_awb) AS sum_gw
        FROM v_pnl_to v
        LEFT JOIN (
          -- one clean booking per awb (mirrors v_pnl_to's booking CTE) to avoid fan-out
          SELECT DISTINCT ON (awb) awb, ra_name
          FROM air_shipments_smu_rate_cgk_spx
          ORDER BY awb,
            (NULLIF(BTRIM(account), '') IS NOT NULL
             AND NULLIF(BTRIM(via),  '') IS NOT NULL
             AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
            updated_at DESC NULLS LAST
        ) srx ON srx.awb = v.awb
        WHERE ${where}
        GROUP BY v.awb, srx.ra_name
      )
      SELECT
        name,
        COALESCE(SUM(sum_gw), 0)  AS total_weight,
        COALESCE(SUM(cost_ra), 0) AS total_cost
      FROM per_awb
      GROUP BY name
      ORDER BY total_cost DESC NULLS LAST
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => ({
      name: r.name as string,
      totalWeight: Number(r.total_weight),
      totalCost: Number(r.total_cost),
    }))
  }

  async getCostBySgOut(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlNamedCostItem[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
    // sg_out (the name) lives on air_shipments_smu, looked up by booking key.
    const rows = await this.dataSource.query(
      `
      WITH per_awb AS (
        SELECT
          v.awb,
          COALESCE(NULLIF(s.sg_out, ''), '—') AS name,
          MAX(v.cost_sg_out_awb) AS cost_sg_out,
          MAX(v.sum_gw_per_awb)  AS sum_gw
        FROM v_pnl_to v
        LEFT JOIN (
          -- one clean booking per awb (mirrors v_pnl_to's booking CTE) to avoid fan-out
          SELECT DISTINCT ON (awb) awb, account, airlines, via, dest
          FROM air_shipments_smu_rate_cgk_spx
          ORDER BY awb,
            (NULLIF(BTRIM(account), '') IS NOT NULL
             AND NULLIF(BTRIM(via),  '') IS NOT NULL
             AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
            updated_at DESC NULLS LAST
        ) srx ON srx.awb = v.awb
        LEFT JOIN air_shipments_smu s
          ON  s.vendor      = srx.account
          AND s.airlines    = srx.airlines
          AND s.origin      = srx.via
          AND s.destination = srx.dest
        WHERE ${where}
        GROUP BY v.awb, s.sg_out
      )
      SELECT
        name,
        COALESCE(SUM(sum_gw), 0)      AS total_weight,
        COALESCE(SUM(cost_sg_out), 0) AS total_cost
      FROM per_awb
      GROUP BY name
      ORDER BY total_cost DESC NULLS LAST
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => ({
      name: r.name as string,
      totalWeight: Number(r.total_weight),
      totalCost: Number(r.total_cost),
    }))
  }

  async getCostBySgIn(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlSgInRouteCostItem[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        COALESCE(NULLIF(origin_station, ''), '?') || ' → ' ||
        COALESCE(NULLIF(dest_station,   ''), '?') AS route,
        COALESCE(SUM(gross_weight), 0)            AS total_weight,
        COALESCE(SUM(cost_sg_in_to), 0)           AS total_cost
      FROM v_pnl_to
      WHERE ${where}
      GROUP BY 1
      ORDER BY total_cost DESC NULLS LAST
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => ({
      route: r.route as string,
      totalWeight: Number(r.total_weight),
      totalCost: Number(r.total_cost),
    }))
  }

  async getProfitByRoute(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlProfitByRouteItem[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const days = calendarDaysForFilter(cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        COALESCE(NULLIF(origin_station, ''), '?') || ' → ' ||
        COALESCE(NULLIF(dest_station,   ''), '?') AS route,
        COALESCE(SUM(revenue_total), 0)           AS total_revenue,
        COALESCE(SUM(revenue_discount), 0)        AS total_discount,
        COALESCE(SUM(gross_weight), 0)            AS total_weight,
        COALESCE(SUM(cost_to), 0)                 AS total_cost
      FROM v_pnl_to
      WHERE ${where}
      GROUP BY 1
      -- Margin uses the KPI convention (revenue − discount − cost) so route totals reconcile
      -- with the headline Est. Gross Profit; uncosted TOs count revenue but not cost.
      ORDER BY (COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0)
                - COALESCE(SUM(cost_to), 0)) DESC NULLS LAST
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => {
      const totalRevenue = Number(r.total_revenue) - Number(r.total_discount)
      const totalWeight = Number(r.total_weight)
      const totalCost = Number(r.total_cost)
      const totalMargin = totalRevenue - totalCost
      return {
        route: r.route as string,
        totalRevenue,
        totalMargin,
        avgWeightPerDay: totalWeight / days,
        avgCostPerKg: totalWeight > 0 ? totalCost / totalWeight : 0,
        avgMarginPerKg: totalWeight > 0 ? totalMargin / totalWeight : 0,
        avgMarginPerDay: totalMargin / days,
      }
    })
  }

  // Daily pivot behind the "Daily Report" tab: one row per calendar day, one column per
  // origin→destination pair. Columns come from the whole view rather than the selected period so
  // the layout stays stable as the user moves between cycles. All footer arithmetic lives here so
  // the numbers have a single testable definition.
  async getDailyMatrix(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlDailyMatrix> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const dates = calendarDatesForFilter(cyclePeriod, startDate, endDate)
    const periodDays = Math.max(1, dates.length)

    const [columns, factRows, issueRows] = await Promise.all([
      this.getStations(),
      this.dataSource.query(
        `
        SELECT
          TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD')                                AS d,
          origin_station,
          dest_station,
          COALESCE(SUM(revenue_total), 0)
            - COALESCE(SUM(revenue_discount), 0)                                 AS revenue,
          COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0)
            - COALESCE(SUM(cost_to), 0)                                          AS margin,
          COALESCE(SUM(gross_weight), 0)                                         AS weight,
          COUNT(*) FILTER (WHERE cost_to IS NULL)::int                           AS incomplete_tos
        FROM v_pnl_to
        WHERE ${where}
          AND ${dateCol} IS NOT NULL
        GROUP BY 1, 2, 3
        `,
        params,
      ),
      this.dataSource.query(
        `
        SELECT d, origin_station, dest_station, issue, COUNT(DISTINCT awb)::int AS awbs
        FROM (
          SELECT
            TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD') AS d,
            origin_station, dest_station, issue, awb
          FROM v_pnl_to
          WHERE ${where}
            AND ${dateCol} IS NOT NULL
            AND issue IS NOT NULL
        ) s
        GROUP BY GROUPING SETS ((d, origin_station, dest_station, issue), (origin_station, dest_station, issue))
        `,
        params,
      ),
    ])

    const columnIndex = new Map(columns.map((c, i) => [`${c.origin}|${c.dest}`, i]))

    // The issues query is the fact query plus `issue IS NOT NULL`, so its grouping set is a subset:
    // an issue can never land on a (date, route) pair that produced no cell.
    const cellIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? null : `${r.d}|${r.origin_station}|${r.dest_station}`,
    )
    const columnIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? `${r.origin_station}|${r.dest_station}` : null,
    )

    const rows: PnlDailyMatrixRow[] = dates.map((date) => ({
      date,
      cells: columns.map(() => null),
    }))
    const rowIndex = new Map(rows.map((r, i) => [r.date, i]))

    for (const fact of factRows as Record<string, string>[]) {
      const ci = columnIndex.get(`${fact.origin_station}|${fact.dest_station}`)
      const ri = rowIndex.get(fact.d)
      if (ci === undefined || ri === undefined) continue
      rows[ri].cells[ci] = {
        revenue: Number(fact.revenue),
        margin: Number(fact.margin),
        weight: Number(fact.weight),
        incompleteTos: Number(fact.incomplete_tos),
        issues: cellIssues.get(`${fact.d}|${fact.origin_station}|${fact.dest_station}`) ?? [],
      }
    }

    const footer: PnlDailyMatrixFooter[] = columns.map((_, ci) => {
      let totalRevenue = 0
      let totalMargin = 0
      let totalWeight = 0
      let incompleteTos = 0
      for (const row of rows) {
        const cell = row.cells[ci]
        if (!cell) continue
        totalRevenue += cell.revenue
        totalMargin += cell.margin
        totalWeight += cell.weight
        incompleteTos += cell.incompleteTos
      }
      return {
        totalRevenue,
        totalMargin,
        totalWeight,
        avgRevenuePerDay: totalRevenue / periodDays,
        avgMarginPerDay: totalMargin / periodDays,
        marginPct: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null,
        spacePerKg: totalWeight > 0 ? totalMargin / totalWeight : null,
        incompleteTos,
        issues: columnIssues.get(`${columns[ci].origin}|${columns[ci].dest}`) ?? [],
      }
    })

    return { columns, rows, footer, periodDays }
  }

  // Revenue, cost and margin per calendar day for each selected comparison column, behind the
  // "Route Comparison" tab. A column is either a saved route group or a single route the user
  // picked ad hoc; both reduce to a list of origin→destination pairs, so both take the same path.
  //
  // Overlap is deliberate: a TO on a route held by three columns lands in all three. Each column
  // is an independent question, the columns are not a partition of the period, and they therefore
  // do not sum to a period total.
  async getRouteComparison(
    picks: ColumnPick[],
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlRouteComparison> {
    const dates = calendarDatesForFilter(cyclePeriod, startDate, endDate)
    const periodDays = Math.max(1, dates.length)

    if (picks.length === 0) {
      return { columns: [], rows: [], footer: [], periodDays }
    }

    const groupIds = picks.filter((p) => p.kind === 'group').map((p) => p.id)
    // Only asked for when a group was actually picked, so a route-only comparison costs one query
    // less rather than sending an empty uuid array to the database.
    const groupRouteRows: Record<string, string>[] = groupIds.length
      ? await this.dataSource.query(
          `
          SELECT g.id, g.name, r.origin_station, r.dest_station
          FROM route_groups g
          LEFT JOIN route_group_routes r ON r.route_group_id = g.id
          WHERE g.id = ANY($1::uuid[])
          ORDER BY g.id, r.origin_station, r.dest_station
          `,
          [groupIds],
        )
      : []

    const groupNames = new Map<string, string>()
    const groupRoutes = new Map<string, { origin: string; originLabel: string; dest: string }[]>()
    for (const row of groupRouteRows) {
      groupNames.set(row.id, row.name)
      if (!groupRoutes.has(row.id)) groupRoutes.set(row.id, [])
      // A group with no routes yet still LEFT JOINs to one row with null stations.
      if (row.origin_station && row.dest_station) {
        groupRoutes.get(row.id)!.push({
          origin: row.origin_station,
          originLabel: originLabel(row.origin_station),
          dest: row.dest_station,
        })
      }
    }

    // A group that was deleted between the picker loading and this request is dropped rather than
    // rendered as a permanently empty column with no name to explain itself.
    const columns: PnlRouteComparisonColumn[] = picks.flatMap((pick): PnlRouteComparisonColumn[] => {
      if (pick.kind === 'group') {
        if (!groupNames.has(pick.id)) return []
        const routes = groupRoutes.get(pick.id) ?? []
        return [{
          id: pick.id,
          name: groupNames.get(pick.id)!,
          routeCount: routes.length,
          kind: 'group' as const,
          routes,
        }]
      }
      const label = originLabel(pick.origin)
      return [{
        id: `r:${pick.origin}|${pick.dest}`,
        name: `${label} → ${pick.dest}`,
        routeCount: 1,
        kind: 'route' as const,
        routes: [{ origin: pick.origin, originLabel: label, dest: pick.dest }],
      }]
    })

    if (columns.length === 0) {
      return { columns: [], rows: [], footer: [], periodDays }
    }

    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')

    // One row per (column, route) pair, flattened into three parallel arrays. UNNEST zips them
    // back into the mapping table both queries below join against.
    const colIdx: number[] = []
    const colOrigins: string[] = []
    const colDests: string[] = []
    columns.forEach((column, index) => {
      for (const route of column.routes) {
        colIdx.push(index)
        colOrigins.push(route.origin)
        colDests.push(route.dest)
      }
    })

    const p = params.length
    const colRoutesCte = `
      WITH col_routes(col_idx, origin_station, dest_station) AS (
        SELECT * FROM UNNEST($${p + 1}::int[], $${p + 2}::text[], $${p + 3}::text[])
      )`
    const colParams = [...params, colIdx, colOrigins, colDests]

    const [factRows, issueRows] = await Promise.all([
      this.dataSource.query(
        `
        ${colRoutesCte}
        SELECT
          TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD')                      AS d,
          cr.col_idx                                                   AS col_idx,
          COALESCE(SUM(v.revenue_total), 0)
            - COALESCE(SUM(v.revenue_discount), 0)                     AS revenue,
          COALESCE(SUM(v.cost_to), 0)                                  AS cost,
          COALESCE(SUM(v.revenue_total), 0)
            - COALESCE(SUM(v.revenue_discount), 0)
            - COALESCE(SUM(v.cost_to), 0)                              AS margin,
          COALESCE(SUM(v.cost_smu_awb    * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_smu,
          COALESCE(SUM(v.cost_ra_awb     * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_ra,
          COALESCE(SUM(v.cost_sg_out_awb * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_out,
          COALESCE(SUM(COALESCE(v.cost_sg_in_to, 0))
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_in,
          COUNT(*) FILTER (WHERE v.cost_to IS NULL)::int               AS incomplete_tos
        FROM v_pnl_to v
        JOIN col_routes cr
          ON cr.origin_station = v.origin_station
         AND cr.dest_station   = v.dest_station
        WHERE ${where}
          AND ${dateCol} IS NOT NULL
        GROUP BY 1, 2
        `,
        colParams,
      ),
      this.dataSource.query(
        `
        ${colRoutesCte}, issue_rows AS (
          SELECT
            TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD') AS d,
            cr.col_idx                              AS col_idx,
            v.issue                                 AS issue,
            v.awb                                   AS awb
          FROM v_pnl_to v
          JOIN col_routes cr
            ON cr.origin_station = v.origin_station
           AND cr.dest_station   = v.dest_station
          WHERE ${where}
            AND ${dateCol} IS NOT NULL
            AND v.issue IS NOT NULL
        )
        SELECT d, col_idx, issue, COUNT(DISTINCT awb)::int AS awbs
        FROM issue_rows
        GROUP BY GROUPING SETS ((d, col_idx, issue), (col_idx, issue))
        `,
        colParams,
      ),
    ])

    const cellIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? null : `${r.d}|${r.col_idx}`,
    )
    const columnIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? String(r.col_idx) : null,
    )

    const rows: PnlRouteComparisonRow[] = dates.map((date) => ({
      date,
      cells: columns.map(() => null),
    }))
    const rowIndex = new Map(rows.map((r, i) => [r.date, i]))

    for (const factRow of factRows as Record<string, string>[]) {
      const ci = Number(factRow.col_idx)
      const ri = rowIndex.get(factRow.d)
      if (!Number.isInteger(ci) || ci < 0 || ci >= columns.length || ri === undefined) continue
      rows[ri].cells[ci] = {
        revenue: Number(factRow.revenue),
        cost: Number(factRow.cost),
        margin: Number(factRow.margin),
        costSmu: Number(factRow.cost_smu),
        costRa: Number(factRow.cost_ra),
        costSgOut: Number(factRow.cost_sg_out),
        costSgIn: Number(factRow.cost_sg_in),
        incompleteTos: Number(factRow.incomplete_tos),
        issues: cellIssues.get(`${factRow.d}|${ci}`) ?? [],
      }
    }

    const footer: PnlRouteComparisonFooter[] = columns.map((_column, ci) => {
      let totalRevenue = 0
      let totalCost = 0
      let totalMargin = 0
      let totalCostSmu = 0
      let totalCostRa = 0
      let totalCostSgOut = 0
      let totalCostSgIn = 0
      let incompleteTos = 0
      for (const row of rows) {
        const cell = row.cells[ci]
        if (!cell) continue
        totalRevenue += cell.revenue
        totalCost += cell.cost
        totalMargin += cell.margin
        totalCostSmu += cell.costSmu
        totalCostRa += cell.costRa
        totalCostSgOut += cell.costSgOut
        totalCostSgIn += cell.costSgIn
        incompleteTos += cell.incompleteTos
      }
      return {
        totalRevenue,
        totalCost,
        totalMargin,
        totalCostSmu,
        totalCostRa,
        totalCostSgOut,
        totalCostSgIn,
        // Divided by calendar days, not by days that happened to have shipments.
        avgRevenuePerDay: totalRevenue / periodDays,
        avgCostPerDay: totalCost / periodDays,
        avgMarginPerDay: totalMargin / periodDays,
        incompleteTos,
        issues: columnIssues.get(String(ci)) ?? [],
      }
    })

    return { columns, rows, footer, periodDays }
  }

  // Revenue, cost and margin per origin→destination route for each selected vendor column, behind
  // the "Vendor Comparison" tab. A column is either a saved vendor group or one raw vendor name;
  // both reduce to a list of vendor names, so both take the same path.
  //
  // Every TO carries at most one vendor, so two columns can only double-count when the same vendor
  // sits in both — surfaced by the client, not forbidden here. The columns still do not sum to the
  // period total: only TOs that have a booking carry a vendor at all.
  async getVendorComparison(
    picks: VendorColumnPick[],
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlVendorComparison> {
    // Zeroed rather than measured: with no columns there is no banner to draw, so a period-wide
    // revenue scan would be work nobody reads.
    const empty: PnlVendorComparison = {
      columns: [],
      rows: [],
      footer: [],
      coverage: { revenueInColumns: 0, revenuePeriod: 0 },
    }
    if (picks.length === 0) return empty

    const groupIds = picks.filter((p) => p.kind === 'group').map((p) => p.id)
    // Only asked for when a group was actually picked, so a vendor-only comparison costs one query
    // less rather than sending an empty uuid array to the database.
    const groupRows: Record<string, string | null>[] = groupIds.length
      ? await this.dataSource.query(
          `
          SELECT g.id, g.name, m.vendor
          FROM vendor_groups g
          LEFT JOIN vendor_group_vendors m ON m.vendor_group_id = g.id
          WHERE g.id = ANY($1::uuid[])
          ORDER BY g.id, m.vendor
          `,
          [groupIds],
        )
      : []

    const groupNames = new Map<string, string>()
    const groupVendors = new Map<string, string[]>()
    for (const row of groupRows) {
      const id = row.id as string
      groupNames.set(id, row.name as string)
      if (!groupVendors.has(id)) groupVendors.set(id, [])
      // A group with no members yet still LEFT JOINs to one row with a null vendor.
      if (row.vendor != null) groupVendors.get(id)!.push(row.vendor)
    }

    // A group deleted between the picker loading and this request is dropped rather than rendered
    // as a permanently empty column with no name to explain itself. A vendor *name* is never
    // dropped: names are free text from a sheet and can vanish at any time, and an empty column the
    // user can see and remove is more honest — and far less destructive — than a 400.
    const columns: PnlVendorComparisonColumn[] = picks.flatMap(
      (pick): PnlVendorComparisonColumn[] => {
        if (pick.kind === 'group') {
          if (!groupNames.has(pick.id)) return []
          const vendors = groupVendors.get(pick.id) ?? []
          return [
            {
              id: `vg:${pick.id}`,
              name: groupNames.get(pick.id)!,
              kind: 'group' as const,
              vendors,
              vendorCount: vendors.length,
            },
          ]
        }
        return [
          {
            id: `v:${pick.name}`,
            name: pick.name,
            kind: 'vendor' as const,
            vendors: [pick.name],
            vendorCount: 1,
          },
        ]
      },
    )

    if (columns.length === 0) return empty

    // Every station pair the view knows, not only the ones with data this period, so the rows stay
    // put as the user changes cycle — the same rule the daily matrix columns follow.
    const stations = await this.getStations()
    const rows: PnlVendorComparisonRow[] = stations.map((s) => ({
      origin: s.origin,
      originLabel: s.originLabel,
      dest: s.dest,
      cells: columns.map(() => null),
    }))

    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')

    // One entry per (column, vendor) pair, flattened into two parallel arrays. UNNEST zips them
    // back into the mapping table both queries below join against. Flattening into a single list
    // would let a vendor from one column answer for another.
    const colIdx: number[] = []
    const colVendors: string[] = []
    columns.forEach((column, index) => {
      for (const vendorName of column.vendors) {
        colIdx.push(index)
        colVendors.push(vendorName)
      }
    })

    const p = params.length
    const colVendorsCte = `
      WITH col_vendors(col_idx, vendor) AS (
        SELECT * FROM UNNEST($${p + 1}::int[], $${p + 2}::text[])
      )`
    const colParams = [...params, colIdx, colVendors]

    // Both queries carry `AND v.origin_station IS NOT NULL AND v.dest_station IS NOT NULL`, and it
    // is load-bearing rather than defensive. The footer half of the GROUPING SETS below identifies
    // itself by a NULL origin_station — and `station_mapping_missing` is an issue whose entire
    // meaning is "this TO has no station". Without the guard such a row is byte-identical to the
    // super-aggregate and indexIssueRows files it as a second footer, double-counting the column's
    // issue AWBs. Zero such rows exist right now, so the bug would be latent, not visible.
    const [factRows, issueRows, coverageRows] = await Promise.all([
      this.dataSource.query(
        `
        ${colVendorsCte}
        SELECT
          v.origin_station                                             AS origin_station,
          v.dest_station                                               AS dest_station,
          cv.col_idx                                                   AS col_idx,
          COALESCE(SUM(v.revenue_total), 0)
            - COALESCE(SUM(v.revenue_discount), 0)                     AS revenue,
          COALESCE(SUM(v.cost_to), 0)                                  AS cost,
          COALESCE(SUM(v.revenue_total), 0)
            - COALESCE(SUM(v.revenue_discount), 0)
            - COALESCE(SUM(v.cost_to), 0)                              AS margin,
          COALESCE(SUM(v.cost_smu_awb    * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_smu,
          COALESCE(SUM(v.cost_ra_awb     * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_ra,
          COALESCE(SUM(v.cost_sg_out_awb * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_out,
          COALESCE(SUM(COALESCE(v.cost_sg_in_to, 0))
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_in,
          COUNT(*) FILTER (WHERE v.cost_to IS NULL)::int               AS incomplete_tos
        FROM v_pnl_to v
        JOIN col_vendors cv ON cv.vendor = v.vendor
        WHERE ${where}
          AND v.origin_station IS NOT NULL
          AND v.dest_station   IS NOT NULL
        GROUP BY 1, 2, 3
        `,
        colParams,
      ),
      this.dataSource.query(
        `
        ${colVendorsCte}, issue_rows AS (
          SELECT
            v.origin_station AS origin_station,
            v.dest_station   AS dest_station,
            cv.col_idx       AS col_idx,
            v.issue          AS issue,
            v.awb            AS awb
          FROM v_pnl_to v
          JOIN col_vendors cv ON cv.vendor = v.vendor
          WHERE ${where}
            AND v.origin_station IS NOT NULL
            AND v.dest_station   IS NOT NULL
            AND v.issue IS NOT NULL
        )
        SELECT origin_station, dest_station, col_idx, issue, COUNT(DISTINCT awb)::int AS awbs
        FROM issue_rows
        GROUP BY GROUPING SETS ((origin_station, dest_station, col_idx, issue), (col_idx, issue))
        `,
        colParams,
      ),
      // The deduped union of every picked vendor: two columns holding the same vendor must not push
      // the covered share above 100%. The station guard applies only to revenue_in_columns (to match
      // table rows from getStations), not to revenue_period: a TO with revenue but no station mapping
      // cannot be shown by this table, so it stays in the denominator as unexplained revenue.
      this.dataSource.query(
        `
        -- Deliberately gross on both sides: this pair is only ever consumed as a RATIO
        -- (revenue_in_columns / revenue_period) for the coverage banner, and netting the discount
        -- out of both halves cancels. Nothing here reaches the screen as a rupiah figure.
        SELECT
          COALESCE(SUM(v.revenue_total), 0)                              AS revenue_period,
          COALESCE(SUM(v.revenue_total) FILTER (
            WHERE v.vendor = ANY($${p + 1}::text[])
              AND v.origin_station IS NOT NULL
              AND v.dest_station   IS NOT NULL
          ), 0)                                                          AS revenue_in_columns
        FROM v_pnl_to v
        WHERE ${where}
        `,
        [...params, [...new Set(colVendors)]],
      ),
    ])

    const cellIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.origin_station == null ? null : `${r.origin_station}|${r.dest_station}|${r.col_idx}`,
    )
    const columnIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.origin_station == null ? String(r.col_idx) : null,
    )

    // Station names are guaranteed free of '|' (the same guarantee that lets the route params use
    // a flat delimited encoding), so this composite key cannot collide.
    const rowIndex = new Map(rows.map((r, i) => [`${r.origin}|${r.dest}`, i]))

    for (const factRow of factRows as Record<string, string>[]) {
      const ci = Number(factRow.col_idx)
      const ri = rowIndex.get(`${factRow.origin_station}|${factRow.dest_station}`)
      if (!Number.isInteger(ci) || ci < 0 || ci >= columns.length || ri === undefined) continue
      rows[ri].cells[ci] = {
        revenue: Number(factRow.revenue),
        cost: Number(factRow.cost),
        margin: Number(factRow.margin),
        costSmu: Number(factRow.cost_smu),
        costRa: Number(factRow.cost_ra),
        costSgOut: Number(factRow.cost_sg_out),
        costSgIn: Number(factRow.cost_sg_in),
        incompleteTos: Number(factRow.incomplete_tos),
        issues: cellIssues.get(`${factRow.origin_station}|${factRow.dest_station}|${ci}`) ?? [],
      }
    }

    const footer: PnlVendorComparisonFooter[] = columns.map((_column, ci) => {
      let totalRevenue = 0
      let totalCost = 0
      let totalMargin = 0
      let totalCostSmu = 0
      let totalCostRa = 0
      let totalCostSgOut = 0
      let totalCostSgIn = 0
      let incompleteTos = 0
      // Non-null, not non-zero: a route that flew and made exactly nothing is still a route this
      // column covered, and dividing it away would inflate the average.
      let routesWithData = 0
      for (const row of rows) {
        const cell = row.cells[ci]
        if (!cell) continue
        routesWithData += 1
        totalRevenue += cell.revenue
        totalCost += cell.cost
        totalMargin += cell.margin
        totalCostSmu += cell.costSmu
        totalCostRa += cell.costRa
        totalCostSgOut += cell.costSgOut
        totalCostSgIn += cell.costSgIn
        incompleteTos += cell.incompleteTos
      }
      // null, not 0 and not NaN: "no routes to average over" is a different statement from "the
      // average is zero", and the client renders the first as an em dash.
      const perRoute = (total: number) => (routesWithData > 0 ? total / routesWithData : null)
      return {
        totalRevenue,
        totalCost,
        totalMargin,
        totalCostSmu,
        totalCostRa,
        totalCostSgOut,
        totalCostSgIn,
        routesWithData,
        avgRevenuePerRoute: perRoute(totalRevenue),
        avgCostPerRoute: perRoute(totalCost),
        avgMarginPerRoute: perRoute(totalMargin),
        incompleteTos,
        issues: columnIssues.get(String(ci)) ?? [],
      }
    })

    const coverageRow = (coverageRows as Record<string, string>[])[0]
    return {
      columns,
      rows,
      footer,
      coverage: {
        revenueInColumns: Number(coverageRow?.revenue_in_columns ?? 0),
        revenuePeriod: Number(coverageRow?.revenue_period ?? 0),
      },
    }
  }
}
