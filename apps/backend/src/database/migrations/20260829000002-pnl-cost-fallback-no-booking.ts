import { MigrationInterface, QueryRunner } from 'typeorm'

// Costs used to require a booking row in air_shipments_smu_rate_cgk_spx: the booking supplies
// vendor/airlines/via/dest, and without it (or with those fields blank) every cost came out NULL and
// the TO showed only revenue. That left 57,006 of 66,203 TOs uncosted — you had to wait for the
// reservation before any margin estimate existed.
//
// This adds a per-route FALLBACK so revenue and cost can both be estimated immediately:
//   - Route: air_shipments_compileaircgk.origin/destination -> air_shipments_data.origin_dc/
//     destination_dc -> the pair's 3lc_origin / 3lc_destination airport codes.
//   - SMU: all air_shipments_smu rows on that 3LC route, taking the one with the HIGHEST all-in
//     cost per kg (freight + surcharges, PPN applied, komisi rebated) — the conservative estimate.
//     Its sg_out then drives SG Outgoing exactly as a real booking's would.
//   - RA: the highest RA rate in air_shipments_ra, used when there is no booking or the booking's
//     ra_name is blank.
//   - SG Incoming: unchanged formula, but it no longer needs a booking to resolve chargeable weight.
//
// Fallback rows carry no chwt_airlines (that lives on the booking), so they cost on gross weight.
// Admin fees are per-AWB flat charges, so they are prorated by weight share exactly as the booked
// path does — an AWB's admin is never charged more than once.
//
// Two new columns mark the estimate so the UI can badge it and aggregate separately:
//   cost_basis         'booking' | 'fallback_route' | NULL (no cost at all)
//   is_cost_estimated  TRUE when the cost came from the fallback
// The `issue` column keeps reporting data-quality gaps; 'no_booking' now means "no booking AND no
// usable fallback route", since a fallback-costed TO is no longer missing its cost.
export class PnlCostFallbackNoBooking20260829000002 implements MigrationInterface {
  name = 'PnlCostFallbackNoBooking20260829000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(true))
    await this.createIndexes(queryRunner)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(false))
    await this.createIndexes(queryRunner)
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX idx_v_pnl_to_id ON v_pnl_to(id)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle ON v_pnl_to(cycle_period)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_awb ON v_pnl_to(awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_completed_time ON v_pnl_to(completed_time)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_awb ON v_pnl_to(cycle_period, awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_completed ON v_pnl_to(cycle_completed)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_ata ON v_pnl_to(cycle_ata)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_atd ON v_pnl_to(cycle_atd)`)
  }

  private viewSql(withFallback: boolean): string {
    if (!withFallback) return this.previousViewSql()

    return `
      CREATE MATERIALIZED VIEW v_pnl_to AS
      WITH
      station_map AS (
        SELECT DISTINCT ON (BTRIM(origin_dc), BTRIM(destination_dc))
          BTRIM(origin_dc)      AS origin_dc,
          BTRIM(destination_dc) AS destination_dc,
          NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin_station,
          NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest_station,
          NULLIF(BTRIM(extra_fields->>'3lc_origin'), '')          AS lc_origin,
          NULLIF(BTRIM(extra_fields->>'3lc_destination'), '')     AS lc_dest,
          pnl_parse_numeric(extra_fields->>'rate_spx') AS rate_spx,
          pnl_parse_numeric(extra_fields->>'pph_2')    AS pph_2,
          pnl_parse_numeric(extra_fields->>'disc_15')  AS disc_15
        FROM air_shipments_data
        WHERE service = 'Air'
        ORDER BY BTRIM(origin_dc), BTRIM(destination_dc), updated_at DESC NULLS LAST, id DESC
      ),
      compile AS (
        SELECT
          c.id, c.awb, c.to_number, c.gross_weight, c.packing_kayu,
          c.completed_time, c.cycle_period, c.cycle_completed, c.cycle_ata, c.cycle_atd,
          c.date_completed, c.date_ata, c.date_atd,
          c.lt_number, c.actual_revenue, c.actual_cost, c.settled_at, c.invoice_period_label,
          COALESCE(sm.origin_station, NULLIF(BTRIM(c.origin_station), '')) AS origin_station,
          COALESCE(sm.dest_station,   NULLIF(BTRIM(c.dest_station),   '')) AS dest_station,
          sm.lc_origin, sm.lc_dest,
          c.gross_weight * sm.rate_spx                                       AS revenue_freight_gross,
          c.gross_weight * (COALESCE(sm.pph_2, 0) + COALESCE(sm.disc_15, 0)) AS revenue_deduction
        FROM air_shipments_compileaircgk c
        LEFT JOIN station_map sm
          ON sm.origin_dc      = BTRIM(c.extra_fields->>'origin')
         AND sm.destination_dc = BTRIM(c.extra_fields->>'destination')
      ),
      -- One 3LC route per AWB. An AWB's TOs should share a route; MIN pins a deterministic one.
      awb_totals AS (
        SELECT
          awb,
          SUM(gross_weight)  AS sum_gw_per_awb,
          MAX(origin_station) AS origin_station,
          MIN(lc_origin)      AS lc_origin,
          MIN(lc_dest)        AS lc_dest
        FROM compile GROUP BY awb
      ),
      booking AS (
        SELECT DISTINCT ON (awb)
          awb,
          NULLIF(BTRIM(account),  '') AS vendor,
          NULLIF(BTRIM(airlines), '') AS airlines,
          NULLIF(BTRIM(via),      '') AS via,
          NULLIF(BTRIM(dest),     '') AS dest,
          NULLIF(BTRIM(ra_name),  '') AS ra_name,
          chwt
        FROM air_shipments_smu_rate_cgk_spx
        ORDER BY awb,
          (NULLIF(BTRIM(account), '') IS NOT NULL
           AND NULLIF(BTRIM(via),  '') IS NOT NULL
           AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
          updated_at DESC NULLS LAST
      ),
      smu_price AS (
        SELECT
          b.awb,
          s.freight_rate, s.sc_per_kg, s.fbc_per_kg, s.myc_per_kg, s.other_per_kg,
          s.admin_smu, s.ppn_pct, s.komisi_pct,
          s.sg_out AS sg_out_name
        FROM booking b
        LEFT JOIN air_shipments_smu s
          ON s.vendor=b.vendor AND s.airlines=b.airlines AND s.origin=b.via AND s.destination=b.dest
      ),
      -- FALLBACK: per 3LC route, the SMU row with the highest all-in cost per kg.
      -- Ranking on the true per-kg cost (not bare freight_rate) picks a different row on 11 of 49
      -- routes, and that row's sg_out is what SG Outgoing keys off, so the choice matters twice.
      smu_route_max AS (
        SELECT DISTINCT ON (origin, destination)
          origin, destination,
          freight_rate, sc_per_kg, fbc_per_kg, myc_per_kg, other_per_kg,
          admin_smu, ppn_pct, komisi_pct, sg_out AS sg_out_name
        FROM air_shipments_smu
        WHERE freight_rate IS NOT NULL
        ORDER BY origin, destination,
          ( (freight_rate + COALESCE(sc_per_kg,0) + COALESCE(fbc_per_kg,0)
             + COALESCE(myc_per_kg,0) + COALESCE(other_per_kg,0))
            * (1 + COALESCE(ppn_pct,0)/100.0)
            - freight_rate * COALESCE(komisi_pct,0)/100.0 ) DESC,
          admin_smu DESC NULLS LAST
      ),
      -- FALLBACK: single most expensive RA, used when no booking names one.
      ra_max AS (
        SELECT rate AS ra_rate, admin AS ra_admin, ppn AS ra_ppn, ra_name
        FROM air_shipments_ra
        WHERE rate IS NOT NULL AND LOWER(COALESCE(ra_name,'')) NOT LIKE 'include%'
        ORDER BY rate DESC, ra_name
        LIMIT 1
      ),
      ra_price AS (
        SELECT b.awb, r.rate AS ra_rate, r.admin AS ra_admin, r.ppn AS ra_ppn, b.ra_name
        FROM booking b
        LEFT JOIN air_shipments_ra r
          ON r.ra_name_norm = LOWER(REGEXP_REPLACE(COALESCE(b.ra_name, ''), '[^a-zA-Z0-9]', '', 'g'))
         AND r.ra_name_norm <> ''
      ),
      sg_price AS (
        SELECT sp.awb, sg.rate AS sg_rate, sg.admin AS sg_admin, sg.ppn AS sg_ppn, sp.sg_out_name
        FROM smu_price sp
        LEFT JOIN air_shipments_sg_outgoing sg
          ON sg.sg_outgoing_name_norm = LOWER(REGEXP_REPLACE(COALESCE(sp.sg_out_name, ''), '[^a-zA-Z0-9]', '', 'g'))
         AND sg.sg_outgoing_name_norm <> ''
      ),
      -- SG Outgoing for the fallback, keyed off the chosen SMU row's sg_out (same join as booked).
      sg_fallback AS (
        SELECT srm.origin, srm.destination, srm.sg_out_name,
               sg.rate AS sg_rate, sg.admin AS sg_admin, sg.ppn AS sg_ppn
        FROM smu_route_max srm
        LEFT JOIN air_shipments_sg_outgoing sg
          ON sg.sg_outgoing_name_norm = LOWER(REGEXP_REPLACE(COALESCE(srm.sg_out_name, ''), '[^a-zA-Z0-9]', '', 'g'))
         AND sg.sg_outgoing_name_norm <> ''
      ),
      awb_cost AS (
        SELECT
          a.awb, a.sum_gw_per_awb, a.origin_station,
          -- A real booking supplies chargeable weight; the fallback has none, so it costs on gross.
          COALESCE(b.chwt, a.sum_gw_per_awb) AS aw_weight,
          (b.vendor IS NOT NULL AND sp.freight_rate IS NOT NULL) AS has_booked_smu,
          (srm.freight_rate IS NOT NULL)                          AS has_fallback_smu,
          CASE
            WHEN b.vendor IS NOT NULL AND sp.freight_rate IS NOT NULL THEN (
                   ( ( sp.freight_rate
                       + COALESCE(sp.sc_per_kg, 0)
                       + COALESCE(sp.fbc_per_kg, 0)
                       + COALESCE(sp.myc_per_kg, 0)
                       + COALESCE(sp.other_per_kg, 0)
                     ) * COALESCE(b.chwt, a.sum_gw_per_awb)
                     + COALESCE(sp.admin_smu, 0)
                   ) * (1 + COALESCE(sp.ppn_pct, 0) / 100.0)
                   - (sp.freight_rate * COALESCE(b.chwt, a.sum_gw_per_awb))
                     * (COALESCE(sp.komisi_pct, 0) / 100.0)
                 )
            WHEN srm.freight_rate IS NOT NULL THEN (
                   ( ( srm.freight_rate
                       + COALESCE(srm.sc_per_kg, 0)
                       + COALESCE(srm.fbc_per_kg, 0)
                       + COALESCE(srm.myc_per_kg, 0)
                       + COALESCE(srm.other_per_kg, 0)
                     ) * a.sum_gw_per_awb
                     + COALESCE(srm.admin_smu, 0)
                   ) * (1 + COALESCE(srm.ppn_pct, 0) / 100.0)
                   - (srm.freight_rate * a.sum_gw_per_awb)
                     * (COALESCE(srm.komisi_pct, 0) / 100.0)
                 )
            ELSE NULL
          END AS cost_smu,
          CASE
            WHEN a.origin_station = 'Surabaya' THEN 0
            -- Booked RA: honour the named RA, including the "include" = free case.
            WHEN b.ra_name IS NOT NULL THEN
              CASE WHEN LOWER(rp.ra_name) LIKE 'include%' THEN 0
                   WHEN rp.ra_rate IS NULL                THEN NULL
                   ELSE (COALESCE(b.chwt, a.sum_gw_per_awb) * rp.ra_rate + COALESCE(rp.ra_admin, 0))
                        * (1 + COALESCE(rp.ra_ppn, 0) / 100.0)
              END
            -- No booking, or booking with a blank RA: estimate on the dearest RA.
            WHEN rmax.ra_rate IS NOT NULL THEN
              (a.sum_gw_per_awb * rmax.ra_rate + COALESCE(rmax.ra_admin, 0))
              * (1 + COALESCE(rmax.ra_ppn, 0) / 100.0)
            ELSE 0
          END AS cost_ra,
          CASE
            WHEN b.vendor IS NOT NULL AND sp.freight_rate IS NOT NULL THEN
              CASE WHEN sp.sg_out_name IS NULL OR sp.sg_out_name = '' THEN 0
                   WHEN LOWER(sp.sg_out_name) LIKE 'include%'         THEN 0
                   WHEN sgp.sg_rate IS NULL                           THEN NULL
                   WHEN a.origin_station = 'Surabaya'
                     THEN (COALESCE(b.chwt, a.sum_gw_per_awb) * sgp.sg_rate + COALESCE(sgp.sg_admin, 0))
                          * (1 + COALESCE(sgp.sg_ppn, 0) / 100.0)
                   ELSE COALESCE(b.chwt, a.sum_gw_per_awb) * sgp.sg_rate
                          * (1 + COALESCE(sgp.sg_ppn, 0) / 100.0) + COALESCE(sgp.sg_admin, 0)
              END
            WHEN srm.freight_rate IS NOT NULL THEN
              CASE WHEN sgf.sg_out_name IS NULL OR sgf.sg_out_name = '' THEN 0
                   WHEN LOWER(sgf.sg_out_name) LIKE 'include%'          THEN 0
                   WHEN sgf.sg_rate IS NULL                             THEN 0
                   WHEN a.origin_station = 'Surabaya'
                     THEN (a.sum_gw_per_awb * sgf.sg_rate + COALESCE(sgf.sg_admin, 0))
                          * (1 + COALESCE(sgf.sg_ppn, 0) / 100.0)
                   ELSE a.sum_gw_per_awb * sgf.sg_rate
                          * (1 + COALESCE(sgf.sg_ppn, 0) / 100.0) + COALESCE(sgf.sg_admin, 0)
              END
            ELSE NULL
          END AS cost_sg_out
        FROM awb_totals a
        LEFT JOIN booking   b   ON b.awb  = a.awb
        LEFT JOIN smu_price sp  ON sp.awb = a.awb
        LEFT JOIN ra_price  rp  ON rp.awb = a.awb
        LEFT JOIN sg_price  sgp ON sgp.awb = a.awb
        LEFT JOIN smu_route_max srm ON srm.origin = a.lc_origin AND srm.destination = a.lc_dest
        LEFT JOIN sg_fallback   sgf ON sgf.origin = a.lc_origin AND sgf.destination = a.lc_dest
        LEFT JOIN ra_max rmax ON TRUE
      ),
      base AS (
        SELECT
          c.id,
          c.to_number, c.awb, c.completed_time, c.cycle_period,
          c.cycle_completed, c.cycle_ata, c.cycle_atd, c.date_completed, c.date_ata, c.date_atd,
          c.invoice_period_label                                AS invoice_period,
          c.lt_number, c.actual_revenue, c.actual_cost, c.settled_at, b.chwt AS chwt_awb,
          c.origin_station, c.dest_station, b.vendor, b.airlines AS airline,
          c.gross_weight, ac.sum_gw_per_awb,
          c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)        AS weight_share,
          c.revenue_freight_gross                              AS revenue_freight,
          c.packing_kayu                                       AS revenue_packing,
          c.revenue_freight_gross + c.packing_kayu             AS revenue_total,
          COALESCE(c.revenue_deduction, 0)                     AS revenue_discount,
          ac.cost_smu                                          AS cost_smu_awb,
          ac.cost_ra                                           AS cost_ra_awb,
          ac.cost_sg_out                                       AS cost_sg_out_awb,
          ac.cost_smu + ac.cost_ra + ac.cost_sg_out            AS cost_total_awb,
          ac.aw_weight,
          ac.has_booked_smu, ac.has_fallback_smu,
          CASE WHEN ac.has_booked_smu   THEN 'booking'
               WHEN ac.has_fallback_smu THEN 'fallback_route'
               ELSE NULL
          END                                                  AS cost_basis,
          sgi.sg_inc,
          COALESCE(sgi.admin, CASE WHEN c.origin_station = 'Surabaya' THEN 0 ELSE 5000 END)
                                                               AS sg_in_admin
        FROM compile c
        LEFT JOIN booking  b  ON b.awb  = c.awb
        LEFT JOIN awb_cost ac ON ac.awb = c.awb
        LEFT JOIN air_shipments_sg_incoming sgi
          ON sgi.origin = c.origin_station
         AND sgi.destination = c.dest_station
      )
      SELECT
        id, to_number, awb, completed_time, cycle_period,
        cycle_completed, cycle_ata, cycle_atd, date_completed, date_ata, date_atd,
        invoice_period,
        lt_number, actual_revenue, actual_cost,
        (settled_at IS NOT NULL)                          AS is_settled,
        (actual_revenue - revenue_total)                  AS var_revenue,
        chwt_awb,
        origin_station, dest_station, vendor, airline,
        gross_weight, sum_gw_per_awb, weight_share,
        revenue_freight, revenue_packing, revenue_total, revenue_discount,
        cost_smu_awb, cost_ra_awb, cost_sg_out_awb, cost_total_awb,
        cost_basis,
        (cost_basis = 'fallback_route')                   AS is_cost_estimated,
        CASE WHEN sg_inc IS NULL THEN NULL
             ELSE weight_share * (aw_weight * sg_inc + sg_in_admin)
        END                                                                 AS cost_sg_in_to,
        cost_total_awb * weight_share
          + COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS cost_to,
        (revenue_total - revenue_discount)
          - cost_total_awb * weight_share
          - COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS gross_profit_to,
        CASE
          -- 'no_booking' now means no booking AND no usable fallback route: a fallback-costed TO
          -- is no longer missing its cost, it is merely an estimate (see is_cost_estimated).
          WHEN cost_basis      IS NULL AND vendor IS NULL THEN 'no_booking'
          WHEN cost_smu_awb    IS NULL THEN 'smu_rate_missing'
          WHEN cost_ra_awb     IS NULL THEN 'ra_rate_missing'
          WHEN cost_sg_out_awb IS NULL THEN 'sgout_name_missing'
          WHEN revenue_total   IS NULL THEN 'revenue_missing'
          WHEN origin_station IS NULL OR dest_station IS NULL THEN 'station_mapping_missing'
          WHEN sg_inc          IS NULL THEN 'sg_in_rate_missing'
          ELSE NULL
        END                                                                 AS issue
      FROM base
    `
  }

  // Verbatim body of 20260829000001-pnl-rate-spx-revenue (rate_spx revenue, booking-only costs).
  private previousViewSql(): string {
    return `
      CREATE MATERIALIZED VIEW v_pnl_to AS
      WITH
      station_map AS (
        SELECT DISTINCT ON (BTRIM(origin_dc), BTRIM(destination_dc))
          BTRIM(origin_dc)      AS origin_dc,
          BTRIM(destination_dc) AS destination_dc,
          NULLIF(BTRIM(extra_fields->>'origin_station'), '')      AS origin_station,
          NULLIF(BTRIM(extra_fields->>'destination_station'), '') AS dest_station,
          pnl_parse_numeric(extra_fields->>'rate_spx') AS rate_spx,
          pnl_parse_numeric(extra_fields->>'pph_2')    AS pph_2,
          pnl_parse_numeric(extra_fields->>'disc_15')  AS disc_15
        FROM air_shipments_data
        WHERE service = 'Air'
        ORDER BY BTRIM(origin_dc), BTRIM(destination_dc), updated_at DESC NULLS LAST, id DESC
      ),
      compile AS (
        SELECT
          c.id, c.awb, c.to_number, c.gross_weight, c.packing_kayu,
          c.completed_time, c.cycle_period, c.cycle_completed, c.cycle_ata, c.cycle_atd,
          c.date_completed, c.date_ata, c.date_atd,
          c.lt_number, c.actual_revenue, c.actual_cost, c.settled_at, c.invoice_period_label,
          COALESCE(sm.origin_station, NULLIF(BTRIM(c.origin_station), '')) AS origin_station,
          COALESCE(sm.dest_station,   NULLIF(BTRIM(c.dest_station),   '')) AS dest_station,
          c.gross_weight * sm.rate_spx                                            AS revenue_freight_gross,
          c.gross_weight * (COALESCE(sm.pph_2, 0) + COALESCE(sm.disc_15, 0))      AS revenue_deduction
        FROM air_shipments_compileaircgk c
        LEFT JOIN station_map sm
          ON sm.origin_dc      = BTRIM(c.extra_fields->>'origin')
         AND sm.destination_dc = BTRIM(c.extra_fields->>'destination')
      ),
      awb_totals AS (
        SELECT awb, SUM(gross_weight) AS sum_gw_per_awb, MAX(origin_station) AS origin_station
        FROM compile GROUP BY awb
      ),
      booking AS (
        SELECT DISTINCT ON (awb)
          awb, account AS vendor, airlines, via, dest, ra_name, chwt
        FROM air_shipments_smu_rate_cgk_spx
        ORDER BY awb,
          (NULLIF(BTRIM(account), '') IS NOT NULL
           AND NULLIF(BTRIM(via),  '') IS NOT NULL
           AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
          updated_at DESC NULLS LAST
      ),
      smu_price AS (
        SELECT
          b.awb,
          s.freight_rate, s.sc_per_kg, s.fbc_per_kg, s.myc_per_kg, s.other_per_kg,
          s.admin_smu, s.ppn_pct, s.komisi_pct,
          s.sg_out AS sg_out_name
        FROM booking b
        LEFT JOIN air_shipments_smu s
          ON s.vendor=b.vendor AND s.airlines=b.airlines AND s.origin=b.via AND s.destination=b.dest
      ),
      ra_price AS (
        SELECT b.awb, r.rate AS ra_rate, r.admin AS ra_admin, r.ppn AS ra_ppn, b.ra_name
        FROM booking b
        LEFT JOIN air_shipments_ra r
          ON r.ra_name_norm = LOWER(REGEXP_REPLACE(COALESCE(b.ra_name, ''), '[^a-zA-Z0-9]', '', 'g'))
         AND r.ra_name_norm <> ''
      ),
      sg_price AS (
        SELECT sp.awb, sg.rate AS sg_rate, sg.admin AS sg_admin, sg.ppn AS sg_ppn, sp.sg_out_name
        FROM smu_price sp
        LEFT JOIN air_shipments_sg_outgoing sg
          ON sg.sg_outgoing_name_norm = LOWER(REGEXP_REPLACE(COALESCE(sp.sg_out_name, ''), '[^a-zA-Z0-9]', '', 'g'))
         AND sg.sg_outgoing_name_norm <> ''
      ),
      awb_cost AS (
        SELECT
          a.awb, a.sum_gw_per_awb, a.origin_station,
          COALESCE(b.chwt, a.sum_gw_per_awb) AS aw_weight,
          CASE WHEN sp.freight_rate IS NULL THEN NULL
               ELSE (
                      ( ( sp.freight_rate
                          + COALESCE(sp.sc_per_kg, 0)
                          + COALESCE(sp.fbc_per_kg, 0)
                          + COALESCE(sp.myc_per_kg, 0)
                          + COALESCE(sp.other_per_kg, 0)
                        ) * COALESCE(b.chwt, a.sum_gw_per_awb)
                        + COALESCE(sp.admin_smu, 0)
                      ) * (1 + COALESCE(sp.ppn_pct, 0) / 100.0)
                      - (sp.freight_rate * COALESCE(b.chwt, a.sum_gw_per_awb))
                        * (COALESCE(sp.komisi_pct, 0) / 100.0)
                    )
          END AS cost_smu,
          CASE WHEN a.origin_station = 'Surabaya'  THEN 0
               WHEN b.ra_name IS NULL OR b.ra_name = '' THEN 0
               WHEN LOWER(rp.ra_name) LIKE 'include%'  THEN 0
               WHEN rp.ra_rate IS NULL                 THEN NULL
               ELSE (COALESCE(b.chwt, a.sum_gw_per_awb) * rp.ra_rate + COALESCE(rp.ra_admin, 0))
                    * (1 + COALESCE(rp.ra_ppn, 0) / 100.0)
          END AS cost_ra,
          CASE WHEN sp.sg_out_name IS NULL OR sp.sg_out_name = '' THEN 0
               WHEN LOWER(sp.sg_out_name) LIKE 'include%'         THEN 0
               WHEN sgp.sg_rate IS NULL                           THEN NULL
               WHEN a.origin_station = 'Surabaya'
                 THEN (COALESCE(b.chwt, a.sum_gw_per_awb) * sgp.sg_rate + COALESCE(sgp.sg_admin, 0))
                      * (1 + COALESCE(sgp.sg_ppn, 0) / 100.0)
               ELSE COALESCE(b.chwt, a.sum_gw_per_awb) * sgp.sg_rate
                      * (1 + COALESCE(sgp.sg_ppn, 0) / 100.0) + COALESCE(sgp.sg_admin, 0)
          END AS cost_sg_out
        FROM awb_totals a
        LEFT JOIN booking   b   ON b.awb   = a.awb
        LEFT JOIN smu_price sp  ON sp.awb  = a.awb
        LEFT JOIN ra_price  rp  ON rp.awb  = a.awb
        LEFT JOIN sg_price  sgp ON sgp.awb = a.awb
      ),
      base AS (
        SELECT
          c.id,
          c.to_number, c.awb, c.completed_time, c.cycle_period,
          c.cycle_completed, c.cycle_ata, c.cycle_atd, c.date_completed, c.date_ata, c.date_atd,
          c.invoice_period_label                                AS invoice_period,
          c.lt_number, c.actual_revenue, c.actual_cost, c.settled_at, b.chwt AS chwt_awb,
          c.origin_station, c.dest_station, b.vendor, b.airlines AS airline,
          c.gross_weight, ac.sum_gw_per_awb,
          c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)        AS weight_share,
          c.revenue_freight_gross                              AS revenue_freight,
          c.packing_kayu                                        AS revenue_packing,
          c.revenue_freight_gross + c.packing_kayu              AS revenue_total,
          COALESCE(c.revenue_deduction, 0)                       AS revenue_discount,
          ac.cost_smu                                          AS cost_smu_awb,
          ac.cost_ra                                           AS cost_ra_awb,
          ac.cost_sg_out                                       AS cost_sg_out_awb,
          ac.cost_smu + ac.cost_ra + ac.cost_sg_out            AS cost_total_awb,
          ac.aw_weight,
          sgi.sg_inc,
          COALESCE(sgi.admin, CASE WHEN c.origin_station = 'Surabaya' THEN 0 ELSE 5000 END)
                                                               AS sg_in_admin
        FROM compile c
        LEFT JOIN booking  b  ON b.awb  = c.awb
        LEFT JOIN awb_cost ac ON ac.awb = c.awb
        LEFT JOIN air_shipments_sg_incoming sgi
          ON sgi.origin = c.origin_station
         AND sgi.destination = c.dest_station
      )
      SELECT
        id, to_number, awb, completed_time, cycle_period,
        cycle_completed, cycle_ata, cycle_atd, date_completed, date_ata, date_atd,
        invoice_period,
        lt_number, actual_revenue, actual_cost,
        (settled_at IS NOT NULL)                          AS is_settled,
        (actual_revenue - revenue_total)                  AS var_revenue,
        chwt_awb,
        origin_station, dest_station, vendor, airline,
        gross_weight, sum_gw_per_awb, weight_share,
        revenue_freight, revenue_packing, revenue_total, revenue_discount,
        cost_smu_awb, cost_ra_awb, cost_sg_out_awb, cost_total_awb,
        CASE WHEN sg_inc IS NULL THEN NULL
             ELSE weight_share * (aw_weight * sg_inc + sg_in_admin)
        END                                                                 AS cost_sg_in_to,
        cost_total_awb * weight_share
          + COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS cost_to,
        (revenue_total - revenue_discount)
          - cost_total_awb * weight_share
          - COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS gross_profit_to,
        CASE
          WHEN vendor          IS NULL THEN 'no_booking'
          WHEN cost_smu_awb    IS NULL THEN 'smu_rate_missing'
          WHEN cost_ra_awb     IS NULL THEN 'ra_rate_missing'
          WHEN cost_sg_out_awb IS NULL THEN 'sgout_name_missing'
          WHEN revenue_total   IS NULL THEN 'revenue_missing'
          WHEN origin_station IS NULL OR dest_station IS NULL THEN 'station_mapping_missing'
          WHEN sg_inc          IS NULL THEN 'sg_in_rate_missing'
          ELSE NULL
        END                                                                 AS issue
      FROM base
    `
  }
}
