import { MigrationInterface, QueryRunner } from 'typeorm'

// Aligns the v_pnl_to materialized view with the source-of-truth workbook
// "PNL Origin Java May 2026.xlsx" (sheets "Origin CGK May All" / "Origin SUB").
// Differences closed (estimate-only model is preserved — no actual-invoice override):
//   #1 Cost the AWB on CHARGEABLE weight (chwt_airlines) instead of gross weight.
//   #2 Subtract a 1.5% discount on freight revenue before margin.
//   #4 RA PPN is charged on (amount + admin), not amount alone.
//   #5 SG-Incoming adds a flat admin (5000 for CGK/Jabo, 0 for Surabaya) and costs on
//      chargeable weight; admin is prorated to TOs by weight share (once per AWB).
//   #7 RA cost is 0 for Surabaya origin.
//   #8 SG-Out PPN is charged on (amount + admin) for Surabaya (CGK keeps amount-only).
//
// NOTE: Surabaya shipments are not costed today (the booking/rate table
// air_shipments_smu_rate_cgk_spx is CGK-only), so the Surabaya branches below are
// future-proofing that activates only once SUB rate data is ingested.
export class PnlAlignWithSheet20260604000001 implements MigrationInterface {
  name = 'PnlAlignWithSheet20260604000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Chargeable weight (col M "ChWt Airlines" in the sheet) lives on the booking table.
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu_rate_cgk_spx
        ADD COLUMN IF NOT EXISTS chwt NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'chwt_airlines', ',', ''), '')::NUMERIC
        ) STORED
    `)

    // Optional per-route incoming admin; falls back to an origin default in the view.
    await queryRunner.query(`
      ALTER TABLE air_shipments_sg_incoming
        ADD COLUMN IF NOT EXISTS admin NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'admin', ',', ''), '')::NUMERIC
        ) STORED
    `)

    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW v_pnl_to AS
      WITH
      awb_totals AS (
        SELECT awb, SUM(gross_weight) AS sum_gw_per_awb, MAX(origin_station) AS origin_station
        FROM air_shipments_compileaircgk GROUP BY awb
      ),
      booking AS (
        SELECT awb, account AS vendor, airlines, via, dest, ra_name, chwt
        FROM air_shipments_smu_rate_cgk_spx
      ),
      smu_price AS (
        SELECT b.awb, s.total_cost_smu_per_kg AS smu_rate_per_kg, s.admin_smu, s.sg_out AS sg_out_name
        FROM booking b
        LEFT JOIN air_shipments_smu s
          ON s.vendor=b.vendor AND s.airlines=b.airlines AND s.origin=b.via AND s.destination=b.dest
      ),
      ra_price AS (
        SELECT b.awb, r.rate AS ra_rate, r.admin AS ra_admin, r.ppn AS ra_ppn, b.ra_name
        FROM booking b
        LEFT JOIN air_shipments_ra r ON r.ra_name_lower = LOWER(b.ra_name)
      ),
      sg_price AS (
        SELECT sp.awb, sg.rate AS sg_rate, sg.admin AS sg_admin, sg.ppn AS sg_ppn, sp.sg_out_name
        FROM smu_price sp
        LEFT JOIN air_shipments_sg_outgoing sg ON sg.sg_outgoing_name = sp.sg_out_name
      ),
      awb_cost AS (
        SELECT
          a.awb, a.sum_gw_per_awb, a.origin_station,
          -- Chargeable weight basis (#1); fall back to gross when chwt is missing.
          COALESCE(b.chwt, a.sum_gw_per_awb) AS aw_weight,
          CASE WHEN sp.smu_rate_per_kg IS NULL THEN NULL
               ELSE COALESCE(b.chwt, a.sum_gw_per_awb) * sp.smu_rate_per_kg + COALESCE(sp.admin_smu, 0)
          END AS cost_smu,
          -- RA: 0 for Surabaya (#7); PPN charged on (amount + admin) (#4).
          CASE WHEN a.origin_station = 'Surabaya'  THEN 0
               WHEN b.ra_name IS NULL OR b.ra_name = '' THEN 0
               WHEN LOWER(rp.ra_name) LIKE 'include%'  THEN 0
               WHEN rp.ra_rate IS NULL                 THEN NULL
               ELSE (COALESCE(b.chwt, a.sum_gw_per_awb) * rp.ra_rate + COALESCE(rp.ra_admin, 0))
                    * (1 + COALESCE(rp.ra_ppn, 0) / 100.0)
          END AS cost_ra,
          -- SG-Out: Surabaya charges PPN on (amount + admin) (#8); CGK keeps amount-only.
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
          c.origin_station, c.dest_station, b.vendor, b.airlines AS airline,
          c.gross_weight, ac.sum_gw_per_awb,
          c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)        AS weight_share,
          c.amount_revenue                                     AS revenue_freight,
          c.packing_kayu                                       AS revenue_packing,
          c.amount_revenue + c.packing_kayu                    AS revenue_total,
          -- 1.5% discount on freight revenue only (#2)
          COALESCE(c.amount_revenue, 0) * 0.015                AS revenue_discount,
          ac.cost_smu                                          AS cost_smu_awb,
          ac.cost_ra                                           AS cost_ra_awb,
          ac.cost_sg_out                                       AS cost_sg_out_awb,
          ac.cost_smu + ac.cost_ra + ac.cost_sg_out            AS cost_total_awb,
          ac.aw_weight,
          sgi.sg_inc,
          -- SG-Incoming admin: per-route value if present, else 5000 (CGK) / 0 (Surabaya) (#5)
          COALESCE(sgi.admin, CASE WHEN c.origin_station = 'Surabaya' THEN 0 ELSE 5000 END)
                                                               AS sg_in_admin
        FROM air_shipments_compileaircgk c
        LEFT JOIN booking  b  ON b.awb  = c.awb
        LEFT JOIN awb_cost ac ON ac.awb = c.awb
        LEFT JOIN air_shipments_sg_incoming sgi
          ON sgi.origin = c.origin_station
         AND sgi.destination = c.dest_station
      )
      SELECT
        id, to_number, awb, completed_time, cycle_period,
        origin_station, dest_station, vendor, airline,
        gross_weight, sum_gw_per_awb, weight_share,
        revenue_freight, revenue_packing, revenue_total, revenue_discount,
        cost_smu_awb, cost_ra_awb, cost_sg_out_awb, cost_total_awb,
        -- SG-Incoming per TO: chargeable weight + admin, prorated once per AWB by weight share (#5)
        CASE WHEN sg_inc IS NULL THEN NULL
             ELSE weight_share * (aw_weight * sg_inc + sg_in_admin)
        END                                                                 AS cost_sg_in_to,
        cost_total_awb * weight_share
          + COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS cost_to,
        -- Gross profit nets the 1.5% discount (#2)
        (revenue_total - revenue_discount)
          - cost_total_awb * weight_share
          - COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS gross_profit_to
      FROM base
    `)

    await queryRunner.query(`CREATE UNIQUE INDEX idx_v_pnl_to_id ON v_pnl_to(id)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle ON v_pnl_to(cycle_period)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_awb ON v_pnl_to(awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_completed_time ON v_pnl_to(completed_time)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_awb ON v_pnl_to(cycle_period, awb)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the pre-alignment view from 20260512000001-pnl-materialize-view.ts
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW v_pnl_to AS
      WITH
      awb_totals AS (
        SELECT awb, SUM(gross_weight) AS sum_gw_per_awb
        FROM air_shipments_compileaircgk GROUP BY awb
      ),
      booking AS (
        SELECT awb, account AS vendor, airlines, via, dest, ra_name
        FROM air_shipments_smu_rate_cgk_spx
      ),
      smu_price AS (
        SELECT b.awb, s.total_cost_smu_per_kg AS smu_rate_per_kg, s.admin_smu, s.sg_out AS sg_out_name
        FROM booking b
        LEFT JOIN air_shipments_smu s
          ON s.vendor=b.vendor AND s.airlines=b.airlines AND s.origin=b.via AND s.destination=b.dest
      ),
      ra_price AS (
        SELECT b.awb, r.rate AS ra_rate, r.admin AS ra_admin, r.ppn AS ra_ppn, b.ra_name
        FROM booking b
        LEFT JOIN air_shipments_ra r ON r.ra_name_lower = LOWER(b.ra_name)
      ),
      sg_price AS (
        SELECT sp.awb, sg.rate AS sg_rate, sg.admin AS sg_admin, sg.ppn AS sg_ppn, sp.sg_out_name
        FROM smu_price sp
        LEFT JOIN air_shipments_sg_outgoing sg ON sg.sg_outgoing_name = sp.sg_out_name
      ),
      awb_cost AS (
        SELECT
          a.awb, a.sum_gw_per_awb,
          CASE WHEN sp.smu_rate_per_kg IS NULL THEN NULL
               ELSE a.sum_gw_per_awb * sp.smu_rate_per_kg + COALESCE(sp.admin_smu, 0)
          END AS cost_smu,
          CASE WHEN b.ra_name IS NULL OR b.ra_name = '' THEN 0
               WHEN LOWER(rp.ra_name) LIKE 'include%'  THEN 0
               WHEN rp.ra_rate IS NULL                 THEN NULL
               ELSE a.sum_gw_per_awb * rp.ra_rate * (1 + COALESCE(rp.ra_ppn, 0) / 100.0) + COALESCE(rp.ra_admin, 0)
          END AS cost_ra,
          CASE WHEN sp.sg_out_name IS NULL OR sp.sg_out_name = '' THEN 0
               WHEN LOWER(sp.sg_out_name) LIKE 'include%'         THEN 0
               WHEN sgp.sg_rate IS NULL                           THEN NULL
               ELSE a.sum_gw_per_awb * sgp.sg_rate * (1 + COALESCE(sgp.sg_ppn, 0) / 100.0) + COALESCE(sgp.sg_admin, 0)
          END AS cost_sg_out
        FROM awb_totals a
        LEFT JOIN booking   b   ON b.awb   = a.awb
        LEFT JOIN smu_price sp  ON sp.awb  = a.awb
        LEFT JOIN ra_price  rp  ON rp.awb  = a.awb
        LEFT JOIN sg_price  sgp ON sgp.awb = a.awb
      )
      SELECT
        c.id,
        c.to_number, c.awb, c.completed_time, c.cycle_period,
        c.origin_station, c.dest_station, b.vendor, b.airlines AS airline,
        c.gross_weight, ac.sum_gw_per_awb,
        c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)                      AS weight_share,
        c.amount_revenue                                                    AS revenue_freight,
        c.packing_kayu                                                      AS revenue_packing,
        c.amount_revenue + c.packing_kayu                                   AS revenue_total,
        ac.cost_smu                                                         AS cost_smu_awb,
        ac.cost_ra                                                          AS cost_ra_awb,
        ac.cost_sg_out                                                      AS cost_sg_out_awb,
        ac.cost_smu + ac.cost_ra + ac.cost_sg_out                           AS cost_total_awb,
        CASE WHEN sgi.sg_inc IS NULL THEN NULL
             ELSE c.gross_weight * sgi.sg_inc
        END                                                                 AS cost_sg_in_to,
        (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
          * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))
          + COALESCE(c.gross_weight * sgi.sg_inc, 0)                        AS cost_to,
        (c.amount_revenue + c.packing_kayu)
          - (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
            * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))
          - COALESCE(c.gross_weight * sgi.sg_inc, 0)                        AS gross_profit_to
      FROM air_shipments_compileaircgk c
      LEFT JOIN booking  b  ON b.awb  = c.awb
      LEFT JOIN awb_cost ac ON ac.awb = c.awb
      LEFT JOIN air_shipments_sg_incoming sgi
        ON sgi.origin = c.origin_station
       AND sgi.destination = c.dest_station
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX idx_v_pnl_to_id ON v_pnl_to(id)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle ON v_pnl_to(cycle_period)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_awb ON v_pnl_to(awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_completed_time ON v_pnl_to(completed_time)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_awb ON v_pnl_to(cycle_period, awb)`)

    await queryRunner.query(`ALTER TABLE air_shipments_sg_incoming DROP COLUMN IF EXISTS admin`)
    await queryRunner.query(`ALTER TABLE air_shipments_smu_rate_cgk_spx DROP COLUMN IF EXISTS chwt`)
  }
}
