import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'

export interface PnlSummary {
  label: string
  totalTos: number
  totalAwbs: number
  totalRevenue: number
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
  totalRevenue: number
  costSmu: number | null
  costRa: number | null
  costSgOut: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
}

export interface PnlToRow {
  toNumber: string
  grossWeight: number
  revenue: number
  costSmu: number | null
  costRa: number | null
  costSg: number | null
  costSgIn: number | null
  totalCost: number | null
  grossProfit: number | null
  marginPct: number | null
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
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

// Builds a WHERE clause and its bound params for either cycle or date-range mode.
// Date range uses TO_TIMESTAMP since completed_time is stored as "DD-Mon-YYYY HH24:MI" text.
function buildFilter(
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
): { where: string; params: unknown[] } {
  if (cyclePeriod) {
    return { where: 'cycle_period = $1', params: [cyclePeriod] }
  }
  if (startDate && endDate) {
    return {
      where: `completed_time IS NOT NULL
              AND completed_time != ''
              AND TO_TIMESTAMP(completed_time, 'DD-Mon-YYYY HH24:MI') >= $1::DATE
              AND TO_TIMESTAMP(completed_time, 'DD-Mon-YYYY HH24:MI') <= $2::DATE`,
      params: [startDate, endDate],
    }
  }
  return { where: '1=0', params: [] }
}

// Number of calendar days the filter spans. Used as denominator for "per day" averages.
function calendarDaysForFilter(
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
): number {
  if (cyclePeriod) {
    // YYYY-MM-1H = 15 days (1–15); YYYY-MM-2H = remaining days of month.
    const m = /^(\d{4})-(\d{2})-(1H|2H)$/.exec(cyclePeriod)
    if (!m) return 15
    if (m[3] === '1H') return 15
    const year = Number(m[1])
    const month = Number(m[2])
    const lastDay = new Date(year, month, 0).getDate()
    return Math.max(1, lastDay - 15)
  }
  if (startDate && endDate) {
    const a = new Date(startDate)
    const b = new Date(endDate)
    const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
    return Math.max(1, diff)
  }
  return 1
}

@Injectable()
export class PnlService {
  constructor(private readonly dataSource: DataSource) {}

  async getCycles(): Promise<string[]> {
    const rows = await this.dataSource.query(`
      SELECT DISTINCT cycle_period
      FROM v_pnl_to
      WHERE cycle_period IS NOT NULL
      ORDER BY cycle_period DESC
    `)
    return rows.map((r: { cycle_period: string }) => r.cycle_period)
  }

  async getSummary(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PnlSummary> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int                           AS total_tos,
        COUNT(DISTINCT awb)::int                AS total_awbs,
        COALESCE(SUM(revenue_total), 0)         AS total_revenue,
        COALESCE(SUM(cost_to), 0)               AS total_cost
      FROM v_pnl_to
      WHERE ${where}
      `,
      params,
    )
    const row = rows[0]
    const totalRevenue = Number(row.total_revenue)
    const totalCost = Number(row.total_cost)
    const grossProfit = totalRevenue - totalCost
    const label = cyclePeriod ?? `${startDate} to ${endDate}`
    return {
      label,
      totalTos: Number(row.total_tos),
      totalAwbs: Number(row.total_awbs),
      totalRevenue,
      totalCost,
      grossProfit,
      grossMarginPct: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    }
  }

  async getDailyMargin(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PnlDailyMarginItem[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        TO_CHAR(TO_TIMESTAMP(completed_time, 'DD-Mon-YYYY HH24:MI')::DATE, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(revenue_total), 0) AS revenue,
        COALESCE(SUM(cost_to), 0)       AS cost,
        BOOL_OR(cost_to IS NULL)        AS has_incomplete_cost
      FROM v_pnl_to
      WHERE ${where}
        AND completed_time IS NOT NULL
        AND completed_time != ''
      GROUP BY 1
      ORDER BY 1
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => {
      const revenue = Number(r.revenue)
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
  ): Promise<{ data: PnlAwbRow[]; total: number }> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
    const offset = (page - 1) * limit
    const dataParams = [...params, limit, offset]
    const countParams = [...params]
    const p = params.length

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          awb,
          vendor,
          airline,
          COUNT(*)::int                           AS to_count,
          SUM(gross_weight)                       AS sum_gw,
          COALESCE(SUM(revenue_total), 0)         AS total_revenue,
          MAX(cost_smu_awb)                       AS cost_smu,
          MAX(cost_ra_awb)                        AS cost_ra,
          MAX(cost_sg_out_awb)                    AS cost_sg_out,
          SUM(cost_sg_in_to)                      AS cost_sg_in,
          MAX(cost_total_awb) + COALESCE(SUM(cost_sg_in_to), 0) AS total_cost,
          COALESCE(SUM(gross_profit_to), 0)       AS gross_profit,
          (MAX(cost_total_awb) IS NULL OR MAX(cost_sg_in_to) IS NULL) AS has_null_cost
        FROM v_pnl_to
        WHERE ${where}
        GROUP BY awb, vendor, airline
        ORDER BY SUM(revenue_total) DESC NULLS LAST
        LIMIT $${p + 1} OFFSET $${p + 2}
        `,
        dataParams,
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to WHERE ${where}`,
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
        totalRevenue: rev,
        costSmu: r.cost_smu != null ? Number(r.cost_smu) : null,
        costRa: r.cost_ra != null ? Number(r.cost_ra) : null,
        costSgOut: r.cost_sg_out != null ? Number(r.cost_sg_out) : null,
        costSgIn: r.cost_sg_in != null ? Number(r.cost_sg_in) : null,
        totalCost,
        grossProfit: gp,
        grossMarginPct: rev > 0 ? (gp / rev) * 100 : null,
        hasNullCost: r.has_null_cost === true || r.has_null_cost === 't',
      }
    })
    return { data, total }
  }

  async getDataQuality(): Promise<PnlDataQualityItem[]> {
    const rows = await this.dataSource.query(`
      SELECT
        to_number,
        awb,
        CASE
          WHEN cost_smu_awb IS NULL AND cost_ra_awb IS NULL AND cost_sg_out_awb IS NULL
            THEN 'all_cost_lookup_failed'
          WHEN cost_smu_awb IS NULL THEN 'smu_lookup_failed'
          WHEN cost_ra_awb IS NULL  THEN 'ra_lookup_failed'
          WHEN cost_sg_out_awb IS NULL THEN 'sg_lookup_failed'
          WHEN cost_sg_in_to IS NULL THEN 'sg_in_lookup_failed'
          ELSE 'unknown'
        END AS issue
      FROM v_pnl_to
      WHERE cost_smu_awb IS NULL
         OR cost_ra_awb  IS NULL
         OR cost_sg_out_awb IS NULL
         OR cost_sg_in_to IS NULL
      ORDER BY awb, to_number
      LIMIT 500
    `)
    return rows.map((r: Record<string, string>) => ({
      toNumber: r.to_number,
      awb: r.awb,
      issue: r.issue,
    }))
  }

  async getAwbTos(
    awb: string,
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PnlToRow[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        to_number,
        gross_weight,
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
        END AS margin_pct
      FROM v_pnl_to
      WHERE awb = $1 AND ${where.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`)}
      ORDER BY to_number
      `,
      [awb, ...params],
    )
    return rows.map((r: Record<string, unknown>) => ({
      toNumber: r.to_number as string,
      grossWeight: Number(r.gross_weight),
      revenue: Number(r.revenue_total),
      costSmu: r.cost_smu != null ? Number(r.cost_smu) : null,
      costRa: r.cost_ra != null ? Number(r.cost_ra) : null,
      costSg: r.cost_sg != null ? Number(r.cost_sg) : null,
      costSgIn: r.cost_sg_in != null ? Number(r.cost_sg_in) : null,
      totalCost: r.cost_to != null ? Number(r.cost_to) : null,
      grossProfit: r.gross_profit_to != null ? Number(r.gross_profit_to) : null,
      marginPct: r.margin_pct != null ? Number(r.margin_pct) : null,
    }))
  }

  async getRevenueByRoute(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PnlRevenueByRouteItem[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
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
  ): Promise<PnlCostTotals> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
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
  ): Promise<PnlVendorCostItem[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
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
  ): Promise<PnlNamedCostItem[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      WITH per_awb AS (
        SELECT
          v.awb,
          COALESCE(NULLIF(srx.ra_name, ''), '—') AS name,
          MAX(v.cost_ra_awb)   AS cost_ra,
          MAX(v.sum_gw_per_awb) AS sum_gw
        FROM v_pnl_to v
        LEFT JOIN air_shipments_smu_rate_cgk_spx srx ON srx.awb = v.awb
        WHERE ${where.replace(/\bcompleted_time\b/g, 'v.completed_time').replace(/\bcycle_period\b/g, 'v.cycle_period')}
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
  ): Promise<PnlNamedCostItem[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
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
        LEFT JOIN air_shipments_smu_rate_cgk_spx srx ON srx.awb = v.awb
        LEFT JOIN air_shipments_smu s
          ON  s.vendor      = srx.account
          AND s.airlines    = srx.airlines
          AND s.origin      = srx.via
          AND s.destination = srx.dest
        WHERE ${where.replace(/\bcompleted_time\b/g, 'v.completed_time').replace(/\bcycle_period\b/g, 'v.cycle_period')}
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
  ): Promise<PnlSgInRouteCostItem[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
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
  ): Promise<PnlProfitByRouteItem[]> {
    const { where, params } = buildFilter(cyclePeriod, startDate, endDate)
    const days = calendarDaysForFilter(cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        COALESCE(NULLIF(origin_station, ''), '?') || ' → ' ||
        COALESCE(NULLIF(dest_station,   ''), '?') AS route,
        COALESCE(SUM(revenue_total), 0)           AS total_revenue,
        COALESCE(SUM(gross_profit_to), 0)         AS total_margin,
        COALESCE(SUM(gross_weight), 0)            AS total_weight,
        COALESCE(SUM(cost_to), 0)                 AS total_cost
      FROM v_pnl_to
      WHERE ${where}
      GROUP BY 1
      ORDER BY total_margin DESC NULLS LAST
      `,
      params,
    )
    return rows.map((r: Record<string, unknown>) => {
      const totalRevenue = Number(r.total_revenue)
      const totalMargin = Number(r.total_margin)
      const totalWeight = Number(r.total_weight)
      const totalCost = Number(r.total_cost)
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
}
