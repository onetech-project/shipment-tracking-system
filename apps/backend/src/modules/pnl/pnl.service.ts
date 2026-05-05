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

export interface PnlTrendItem {
  cyclePeriod: string
  totalRevenue: number
  totalCost: number
  grossProfit: number
  totalTos: number
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
  totalCost: number | null
  grossProfit: number | null
  grossMarginPct: number | null
  hasNullCost: boolean
}

export interface PnlDataQualityItem {
  toNumber: string | null
  awb: string
  issue: string
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
        COALESCE(SUM(cost_to), 0)               AS total_cost,
        COALESCE(SUM(gross_profit_to), 0)       AS gross_profit
      FROM v_pnl_to
      WHERE ${where}
      `,
      params,
    )
    const row = rows[0]
    const totalRevenue = Number(row.total_revenue)
    const grossProfit = Number(row.gross_profit)
    const label = cyclePeriod ?? `${startDate} to ${endDate}`
    return {
      label,
      totalTos: Number(row.total_tos),
      totalAwbs: Number(row.total_awbs),
      totalRevenue,
      totalCost: Number(row.total_cost),
      grossProfit,
      grossMarginPct: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    }
  }

  async getTrend(): Promise<PnlTrendItem[]> {
    const rows = await this.dataSource.query(`
      SELECT
        cycle_period,
        COALESCE(SUM(revenue_total), 0)   AS total_revenue,
        COALESCE(SUM(cost_to), 0)         AS total_cost,
        COALESCE(SUM(gross_profit_to), 0) AS gross_profit,
        COUNT(*)::int                     AS total_tos
      FROM v_pnl_to
      WHERE cycle_period IS NOT NULL
      GROUP BY cycle_period
      ORDER BY cycle_period
    `)
    return rows.map((r: Record<string, string>) => ({
      cyclePeriod: r.cycle_period,
      totalRevenue: Number(r.total_revenue),
      totalCost: Number(r.total_cost),
      grossProfit: Number(r.gross_profit),
      totalTos: Number(r.total_tos),
    }))
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
          MAX(cost_total_awb)                     AS total_cost,
          COALESCE(SUM(gross_profit_to), 0)       AS gross_profit,
          (MAX(cost_total_awb) IS NULL)            AS has_null_cost
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
          ELSE 'unknown'
        END AS issue
      FROM v_pnl_to
      WHERE cost_to IS NULL
      ORDER BY awb, to_number
      LIMIT 500
    `)
    return rows.map((r: Record<string, string>) => ({
      toNumber: r.to_number,
      awb: r.awb,
      issue: r.issue,
    }))
  }
}
