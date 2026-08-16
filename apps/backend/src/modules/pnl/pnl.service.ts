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

export interface PnlSummary {
  label: string
  totalTos: number
  totalAwbs: number
  totalRevenue: number
  totalDiscount: number
  totalCost: number
  grossProfit: number
  grossMarginPct: number
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
  issue: string | null
}

// Optional narrowing for the AWB drilldown. Every field is independent; supplying none leaves the
// query exactly as it was before route filtering existed.
export interface PnlRouteFilter {
  origin?: string
  dest?: string
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
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

// Severity order for the canonical v_pnl_to.issue values (root cause first). Shared by the
// per-AWB drilldown (which aggregates the most-severe issue across an AWB's TOs).
const ISSUE_RANK: Record<string, number> = {
  no_booking: 1,
  smu_rate_missing: 2,
  ra_rate_missing: 3,
  sgout_name_missing: 4,
  revenue_missing: 5,
  sg_in_rate_missing: 6,
}
const ISSUE_BY_RANK: Record<number, string> = Object.fromEntries(
  Object.entries(ISSUE_RANK).map(([k, v]) => [v, k]),
)

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
}

export interface PnlDailyMatrix {
  columns: PnlDailyMatrixColumn[]
  rows: PnlDailyMatrixRow[]
  footer: PnlDailyMatrixFooter[] // index-aligned with columns
  periodDays: number
}

// The spreadsheet this report mirrors labels origins by airport code. Unknown origins fall back
// to their raw value so a newly opened station is visible rather than silently blank.
const ORIGIN_LABELS: Record<string, string> = {
  Jabo: 'CGK',
  Surabaya: 'SUB',
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
      originLabel: ORIGIN_LABELS[r.origin_station] ?? r.origin_station,
      dest: r.dest_station,
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
    const totalRevenue = Number(row.total_revenue)
    const totalDiscount = Number(row.total_discount)
    const totalCost = Number(row.total_cost)
    // Margin nets the 1.5% revenue discount, matching the sheet's Margin formula.
    const grossProfit = totalRevenue - totalDiscount - totalCost
    const label = cyclePeriod ?? `${startDate} to ${endDate}`
    return {
      label,
      totalTos: Number(row.total_tos),
      totalAwbs: Number(row.total_awbs),
      totalRevenue,
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
      const revenue = Number(r.revenue)
      const cost = Number(r.cost)
      const gp = revenue - Number(r.discount) - cost
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
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
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
    if (route?.origin) routeConds.push(`m.origin_station = ${bind(route.origin)}`)
    if (route?.dest) routeConds.push(`m.dest_station = ${bind(route.dest)}`)
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
          MIN(CASE issue
                WHEN 'no_booking' THEN 1 WHEN 'smu_rate_missing' THEN 2
                WHEN 'ra_rate_missing' THEN 3 WHEN 'sgout_name_missing' THEN 4
                WHEN 'revenue_missing' THEN 5 WHEN 'sg_in_rate_missing' THEN 6
              END)                                  AS issue_rank
        FROM v_pnl_to v
        WHERE ${where}
        ${routeWhere}
        GROUP BY awb, vendor, airline
        ORDER BY SUM(revenue_total) DESC NULLS LAST
        LIMIT $${p + 1} OFFSET $${p + 2}
        `,
        dataParams,
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to v WHERE ${where} ${routeWhere}`,
        countParams,
      ),
    ])

    const total = Number(countRows[0].total)
    const data: PnlAwbRow[] = rows.map((r: Record<string, unknown>) => {
      const rev = Number(r.total_revenue)
      const gp = Number(r.gross_profit)
      const totalCost = r.total_cost != null ? Number(r.total_cost) : null
      return {
        awb: r.awb as string,
        vendor: r.vendor as string | null,
        airline: r.airline as string | null,
        toCount: Number(r.to_count),
        sumGw: Number(r.sum_gw),
        chwt: r.chwt != null ? Number(r.chwt) : null,
        totalRevenue: rev,
        totalDiscount: Number(r.total_discount),
        costSmu: r.cost_smu != null ? Number(r.cost_smu) : null,
        costRa: r.cost_ra != null ? Number(r.cost_ra) : null,
        costSgOut: r.cost_sg_out != null ? Number(r.cost_sg_out) : null,
        costSgIn: r.cost_sg_in != null ? Number(r.cost_sg_in) : null,
        totalCost,
        grossProfit: gp,
        grossMarginPct: rev > 0 ? (gp / rev) * 100 : null,
        hasNullCost: r.has_null_cost === true || r.has_null_cost === 't',
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
        cost_smu_awb  * weight_share          AS cost_smu,
        cost_ra_awb   * weight_share          AS cost_ra,
        cost_sg_out_awb * weight_share        AS cost_sg,
        cost_sg_in_to                          AS cost_sg_in,
        cost_to,
        gross_profit_to,
        CASE WHEN revenue_total > 0 AND gross_profit_to IS NOT NULL
             THEN (gross_profit_to / revenue_total) * 100
             ELSE NULL
        END AS margin_pct,
        issue
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
      revenue: Number(r.revenue_total),
      costSmu: r.cost_smu != null ? Number(r.cost_smu) : null,
      costRa: r.cost_ra != null ? Number(r.cost_ra) : null,
      costSg: r.cost_sg != null ? Number(r.cost_sg) : null,
      costSgIn: r.cost_sg_in != null ? Number(r.cost_sg_in) : null,
      totalCost: r.cost_to != null ? Number(r.cost_to) : null,
      grossProfit: r.gross_profit_to != null ? Number(r.gross_profit_to) : null,
      marginPct: r.margin_pct != null ? Number(r.margin_pct) : null,
      issue: (r.issue as string | null) ?? null,
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
        COALESCE(SUM(revenue_total), 0)           AS total_revenue
      FROM v_pnl_to
      WHERE ${where}
      GROUP BY 1
      ORDER BY total_revenue DESC NULLS LAST
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => ({
      route: r.route as string,
      totalWeight: Number(r.total_weight),
      totalRevenue: Number(r.total_revenue),
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
      const totalRevenue = Number(r.total_revenue)
      const totalWeight = Number(r.total_weight)
      const totalCost = Number(r.total_cost)
      const totalMargin = totalRevenue - Number(r.total_discount) - totalCost
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

    const [columns, factRows] = await Promise.all([
      this.getStations(),
      this.dataSource.query(
        `
        SELECT
          TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD')                                AS d,
          origin_station,
          dest_station,
          COALESCE(SUM(revenue_total), 0)                                        AS revenue,
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
    ])

    const columnIndex = new Map(columns.map((c, i) => [`${c.origin}|${c.dest}`, i]))

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
      }
    })

    return { columns, rows, footer, periodDays }
  }
}
