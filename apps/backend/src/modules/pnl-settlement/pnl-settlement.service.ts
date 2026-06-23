import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { buildFilter } from '../pnl/pnl-filter.util'
import {
  parseSettlementWorkbook,
  ParsedSettlementRow,
  ParseError,
  SheetSummary,
} from './settlement-parser'

const CHUNK = 500

export interface SettlementPreview {
  totalParsed: number
  matched: number
  unmatched: number
  errorRows: number
  duplicateRows: number
  sheetSummary: SheetSummary[]
  errors: ParseError[]
  warnings: string[]
  // A handful of unmatched (lt,to) keys for the user to eyeball typos.
  unmatchedSample: { ltNumber: string; toNumber: string }[]
}

export interface SettlementCommitResult {
  totalParsed: number
  updated: number
  unmatched: number
  errorRows: number
}

export interface SettlementSummary {
  label: string
  totalTos: number
  settledTos: number
  coveragePct: number
  estRevenue: number // estimate over every TO in the filter
  estRevenueSettled: number // estimate restricted to settled TOs (apples-to-apples with actual)
  actRevenue: number // actual over settled TOs
  varRevenue: number // actRevenue − estRevenueSettled
  varRevenuePct: number | null
}

export interface SettlementToRow {
  toNumber: string
  ltNumber: string | null
  awb: string | null
  originStation: string | null
  destStation: string | null
  estRevenue: number | null
  actRevenue: number | null
  varRevenue: number | null
  varRevenuePct: number | null
  isSettled: boolean
}

@Injectable()
export class PnlSettlementService {
  constructor(private readonly dataSource: DataSource) {}

  // ── Upload ────────────────────────────────────────────────────────────────

  async preview(buffer: Buffer): Promise<SettlementPreview> {
    const parsed = parseSettlementWorkbook(buffer)
    const matchedKeys = await this.matchedKeySet(parsed.rows)
    const unmatchedRows = parsed.rows.filter((r) => !matchedKeys.has(key(r)))
    return {
      totalParsed: parsed.rows.length,
      matched: parsed.rows.length - unmatchedRows.length,
      unmatched: unmatchedRows.length,
      errorRows: parsed.errors.length,
      duplicateRows: parsed.duplicateCount,
      sheetSummary: parsed.sheetSummary,
      errors: parsed.errors.slice(0, 100),
      warnings: parsed.warnings,
      unmatchedSample: unmatchedRows
        .slice(0, 20)
        .map((r) => ({ ltNumber: r.ltNumber, toNumber: r.toNumber })),
    }
  }

  async commit(buffer: Buffer): Promise<SettlementCommitResult> {
    const parsed = parseSettlementWorkbook(buffer)
    let updated = 0

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK)
        const params: unknown[] = []
        const values = chunk
          .map((r, j) => {
            const b = j * 3
            params.push(r.ltNumber, r.toNumber, r.actualRevenue)
            return `($${b + 1}, $${b + 2}, $${b + 3}::numeric)`
          })
          .join(', ')
        // Settle only revenue for now (actual_cost stays NULL until vendor invoices land).
        const res = await manager.query(
          `
          UPDATE air_shipments_compileaircgk c
          SET actual_revenue = v.rev, settled_at = NOW()
          FROM (VALUES ${values}) AS v(lt, to_num, rev)
          WHERE c.lt_number = v.lt AND c.to_number = v.to_num
          `,
          params,
        )
        // node-postgres returns [rows, rowCount] via TypeORM as an array; rowCount is on result[1].
        updated += Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0
      }
    })

    // v_pnl_to reads actual_revenue from the fact table, so refresh after settling.
    await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY v_pnl_to')

    return {
      totalParsed: parsed.rows.length,
      updated,
      unmatched: parsed.rows.length - updated,
      errorRows: parsed.errors.length,
    }
  }

  /** Returns the set of (lt|to) keys (from the parsed rows) that exist in the fact table. */
  private async matchedKeySet(rows: ParsedSettlementRow[]): Promise<Set<string>> {
    const found = new Set<string>()
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const params: unknown[] = []
      const values = chunk
        .map((r, j) => {
          const b = j * 2
          params.push(r.ltNumber, r.toNumber)
          return `($${b + 1}, $${b + 2})`
        })
        .join(', ')
      const matched = await this.dataSource.query(
        `
        SELECT c.lt_number AS lt, c.to_number AS to_num
        FROM air_shipments_compileaircgk c
        JOIN (VALUES ${values}) AS v(lt, to_num)
          ON c.lt_number = v.lt AND c.to_number = v.to_num
        `,
        params,
      )
      for (const m of matched) found.add(`${m.lt}|${m.to_num}`)
    }
    return found
  }

  // ── Comparison reads ────────────────────────────────────────────────────────

  async getSummary(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<SettlementSummary> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int                                                      AS total_tos,
        COUNT(*) FILTER (WHERE is_settled)::int                            AS settled_tos,
        COALESCE(SUM(revenue_total), 0)                                    AS est_revenue,
        COALESCE(SUM(revenue_total) FILTER (WHERE is_settled), 0)          AS est_revenue_settled,
        COALESCE(SUM(actual_revenue), 0)                                   AS act_revenue
      FROM v_pnl_to
      WHERE ${where}
      `,
      params,
    )
    const r = rows[0]
    const totalTos = Number(r.total_tos)
    const settledTos = Number(r.settled_tos)
    const estRevenueSettled = Number(r.est_revenue_settled)
    const actRevenue = Number(r.act_revenue)
    const varRevenue = actRevenue - estRevenueSettled
    return {
      label: cyclePeriod ?? `${startDate} to ${endDate}`,
      totalTos,
      settledTos,
      coveragePct: totalTos > 0 ? (settledTos / totalTos) * 100 : 0,
      estRevenue: Number(r.est_revenue),
      estRevenueSettled,
      actRevenue,
      varRevenue,
      varRevenuePct: estRevenueSettled !== 0 ? (varRevenue / estRevenueSettled) * 100 : null,
    }
  }

  async getToComparison(
    page: number,
    limit: number,
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    settled?: 'settled' | 'unsettled',
  ): Promise<{ data: SettlementToRow[]; total: number }> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const settledClause =
      settled === 'settled' ? 'AND is_settled' : settled === 'unsettled' ? 'AND NOT is_settled' : ''
    const offset = (page - 1) * limit
    const dataRows = await this.dataSource.query(
      `
      SELECT to_number, lt_number, awb, origin_station, dest_station,
             revenue_total AS est_revenue, actual_revenue AS act_revenue,
             var_revenue, is_settled
      FROM v_pnl_to
      WHERE ${where} ${settledClause}
      ORDER BY is_settled DESC, ABS(COALESCE(var_revenue, 0)) DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset],
    )
    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM v_pnl_to WHERE ${where} ${settledClause}`,
      params,
    )
    return {
      data: dataRows.map((r: Record<string, unknown>) => {
        const est = r.est_revenue === null ? null : Number(r.est_revenue)
        const act = r.act_revenue === null ? null : Number(r.act_revenue)
        const varRev = r.var_revenue === null ? null : Number(r.var_revenue)
        return {
          toNumber: r.to_number as string,
          ltNumber: (r.lt_number as string) ?? null,
          awb: (r.awb as string) ?? null,
          originStation: (r.origin_station as string) ?? null,
          destStation: (r.dest_station as string) ?? null,
          estRevenue: est,
          actRevenue: act,
          varRevenue: varRev,
          varRevenuePct: varRev !== null && est ? (varRev / est) * 100 : null,
          isSettled: r.is_settled === true || r.is_settled === 't',
        }
      }),
      total: Number(countRows[0].total),
    }
  }

  async getUnsettledTos(
    page: number,
    limit: number,
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<{ data: SettlementToRow[]; total: number }> {
    return this.getToComparison(page, limit, cyclePeriod, startDate, endDate, basis, 'unsettled')
  }
}

function key(r: ParsedSettlementRow): string {
  return `${r.ltNumber}|${r.toNumber}`
}
