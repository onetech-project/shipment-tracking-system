import { MigrationInterface, QueryRunner } from 'typeorm'

// Converts v_pnl_to from a plain VIEW to a MATERIALIZED VIEW so that all PnL
// queries read pre-joined rows instead of re-evaluating 6 CTEs on every request.
// Adds c.id (source primary key) to satisfy the UNIQUE index required by
// REFRESH MATERIALIZED VIEW CONCURRENTLY, plus indexes on the columns most
// used in WHERE / GROUP BY clauses.
export class PnlMaterializeView20260512000001 implements MigrationInterface {
  name = 'PnlMaterializeView20260512000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS v_pnl_to`)
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

    // Required for REFRESH MATERIALIZED VIEW CONCURRENTLY (no read locks during refresh)
    await queryRunner.query(`CREATE UNIQUE INDEX idx_v_pnl_to_id ON v_pnl_to(id)`)

    // Query performance indexes
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle ON v_pnl_to(cycle_period)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_awb ON v_pnl_to(awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_completed_time ON v_pnl_to(completed_time)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_awb ON v_pnl_to(cycle_period, awb)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_pnl_to AS
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
  }
}
