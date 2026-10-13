import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { BASIS_COLS, resolveBasis } from '../pnl/pnl-filter.util'
import { originLabel } from '../../common/utils/origin-labels.util'
import { RouteGroupsService } from '../route-groups/route-groups.service'
import {
  SimulationHistoryRow,
  SimulationRoute,
  SimulationSource,
  SimulationVendor,
} from './route-simulation.types'

const toNum = (v: unknown): number => Number(v ?? 0)
const toNumOrNull = (v: unknown): number | null => (v == null ? null : Number(v))

@Injectable()
export class RouteSimulationSourceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly routeGroups: RouteGroupsService,
  ) {}

  // Everything the simulation page reads, in one round trip. All cycles are returned rather than a
  // window: the payload is tiny (one row per cycle x route x vendor x airline — 81 rows on the dev
  // database) and the page re-folds it client-side whenever the user moves the history range.
  async getSource(basis?: string): Promise<SimulationSource> {
    const resolved = resolveBasis(basis)
    const [routes, vendors, history, routeGroups] = await Promise.all([
      this.getRoutes(),
      this.getVendors(),
      this.getHistory(BASIS_COLS[resolved].cycle),
      this.routeGroups.findAll(),
    ])
    const cycles = [...new Set(history.map((h) => h.cycle))].sort()
    return { basis: resolved, cycles, routes, routeGroups, vendors, history }
  }

  // DC-pair master FULL JOIN the pairs TOs carry. FULL rather than LEFT (unlike
  // RouteGroupsService.getAvailableRoutes) so a pair that flew but fell out of the master is
  // still simulated — with a null rate the user has to fill in, which beats a missing route.
  // One master row per station pair: the one that has a rate wins, then the newest. This is a
  // coarser grain than v_pnl_to's station_map (one row per DC pair), so if two DC pairs sharing a
  // station pair ever carry different rates, this shows one of them while billing used each. On the
  // data as of 2026-10-03 every station pair has a single rate, so the two agree.
  private async getRoutes(): Promise<SimulationRoute[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT ON (origin, dest) origin, dest, rate_spx, pph_2, disc_15
        FROM (
          SELECT
            NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin,
            NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest,
            pnl_parse_numeric(extra_fields->>'rate_spx')            AS rate_spx,
            pnl_parse_numeric(extra_fields->>'pph_2')               AS pph_2,
            pnl_parse_numeric(extra_fields->>'disc_15')             AS disc_15,
            updated_at, id
          FROM air_shipments_data
          WHERE service = 'Air'
        ) m
        WHERE origin IS NOT NULL AND dest IS NOT NULL
        ORDER BY origin, dest, (rate_spx IS NOT NULL) DESC, updated_at DESC NULLS LAST, id DESC
      ),
      used AS (
        SELECT DISTINCT origin_station AS origin, dest_station AS dest
        FROM v_pnl_to
        WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
      )
      SELECT
        COALESCE(m.origin, u.origin) AS origin,
        COALESCE(m.dest,   u.dest)   AS dest,
        m.rate_spx, m.pph_2, m.disc_15,
        (u.origin IS NOT NULL)       AS has_data
      FROM master m
      FULL OUTER JOIN used u ON u.origin = m.origin AND u.dest = m.dest
      ORDER BY 1, 2
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      origin: r.origin as string,
      originLabel: originLabel(r.origin as string),
      dest: r.dest as string,
      rateSpx: toNumOrNull(r.rate_spx),
      pph2: toNumOrNull(r.pph_2),
      disc15: toNumOrNull(r.disc_15),
      hasData: r.has_data === true || r.has_data === 't',
    }))
  }

  // Same union as VendorGroupsService.getAvailableVendors, re-run here because that endpoint is
  // gated on read.vendor_group and this page must not require it (see PnlService.getRoutes for the
  // same trade-off). Names are raw: only NULL and '' are excluded.
  private async getVendors(): Promise<SimulationVendor[]> {
    const rows = await this.dataSource.query(`
      WITH master AS (
        SELECT DISTINCT vendor FROM air_shipments_smu WHERE vendor IS NOT NULL AND vendor <> ''
      ),
      used AS (
        SELECT DISTINCT vendor FROM v_pnl_to WHERE vendor IS NOT NULL AND vendor <> ''
      )
      SELECT v.vendor,
             (v.vendor IN (SELECT vendor FROM master)) AS in_master,
             (v.vendor IN (SELECT vendor FROM used))   AS has_data
      FROM (SELECT vendor FROM master UNION SELECT vendor FROM used) v
      ORDER BY v.vendor
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      vendor: r.vendor as string,
      inMaster: r.in_master === true || r.in_master === 't',
      hasData: r.has_data === true || r.has_data === 't',
    }))
  }

  // TO grain, not AWB grain: every v_pnl_to column used here is either TO-level or prorated by
  // weight_share, so a TO-level SUM reconciles exactly with /pnl/summary (verified on dev: weight,
  // net revenue and cost_to all match to the rupiah). The lane_* columns are the subset whose cost
  // is known and booked — a fallback-costed TO is priced off the most expensive SMU row of its
  // route, which says nothing about what its vendor x airline actually costs. They are split into
  // the four parts of cost_to (SG Outgoing, SG Incoming, RA, SMU) so the planner can edit each one;
  // SG In is COALESCEd exactly as cost_to does, so the four add back up to cost_to.
  private async getHistory(cycleCol: string): Promise<SimulationHistoryRow[]> {
    const lane = 'NOT is_cost_estimated AND cost_to IS NOT NULL'
    const rows = await this.dataSource.query(`
      SELECT
        ${cycleCol}                                                            AS cycle,
        origin_station                                                         AS origin,
        dest_station                                                           AS dest,
        NULLIF(vendor, '')                                                     AS vendor,
        NULLIF(airline, '')                                                    AS airline,
        COUNT(DISTINCT awb)::int                                               AS awb_count,
        COALESCE(SUM(gross_weight), 0)                                         AS weight,
        COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0)   AS revenue,
        COALESCE(SUM(cost_to), 0)                                              AS cost_all,
        COALESCE(SUM(gross_weight) FILTER (WHERE ${lane}), 0)                  AS lane_weight,
        COALESCE(SUM(cost_sg_out_awb * weight_share) FILTER (WHERE ${lane}), 0) AS lane_cost_sg_out,
        COALESCE(SUM(COALESCE(cost_sg_in_to, 0)) FILTER (WHERE ${lane}), 0)    AS lane_cost_sg_in,
        COALESCE(SUM(cost_ra_awb * weight_share) FILTER (WHERE ${lane}), 0)    AS lane_cost_ra,
        COALESCE(SUM(cost_smu_awb * weight_share) FILTER (WHERE ${lane}), 0)   AS lane_cost_smu
      FROM v_pnl_to
      WHERE ${cycleCol} IS NOT NULL
        AND origin_station IS NOT NULL
        AND dest_station IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY 1, 2, 3, 4 NULLS LAST, 5 NULLS LAST
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      cycle: r.cycle as string,
      origin: r.origin as string,
      dest: r.dest as string,
      vendor: (r.vendor as string | null) ?? null,
      airline: (r.airline as string | null) ?? null,
      awbCount: toNum(r.awb_count),
      weight: toNum(r.weight),
      revenue: toNum(r.revenue),
      costAll: toNum(r.cost_all),
      laneWeight: toNum(r.lane_weight),
      laneCostSgOut: toNum(r.lane_cost_sg_out),
      laneCostSgIn: toNum(r.lane_cost_sg_in),
      laneCostRa: toNum(r.lane_cost_ra),
      laneCostSmu: toNum(r.lane_cost_smu),
    }))
  }
}
