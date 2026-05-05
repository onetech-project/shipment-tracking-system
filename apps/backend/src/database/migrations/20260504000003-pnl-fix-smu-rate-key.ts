import { MigrationInterface, QueryRunner } from 'typeorm'

// The SMU sheet stores the rate in extra_fields->>'total_cost_smukg',
// not 'total_cost_smu_per_kg'. Fix the generated column key name.
export class PnlFixSmuRateKey20260504000003 implements MigrationInterface {
  name = 'PnlFixSmuRateKey20260504000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(`ALTER TABLE air_shipments_smu DROP COLUMN IF EXISTS total_cost_smu_per_kg`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu
        ADD COLUMN total_cost_smu_per_kg NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'total_cost_smukg', ',', '')::NUMERIC
        ) STORED
    `)
    await this.createView(queryRunner)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(`ALTER TABLE air_shipments_smu DROP COLUMN IF EXISTS total_cost_smu_per_kg`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu
        ADD COLUMN total_cost_smu_per_kg NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'total_cost_smu_per_kg', ',', '')::NUMERIC
        ) STORED
    `)
    await this.createView(queryRunner)
  }

  private async createView(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_pnl_to AS
      WITH
      awb_totals AS (
        SELECT awb, SUM(gross_weight) AS sum_gw_per_awb
        FROM air_shipments_compileaircgk
        GROUP BY awb
      ),
      booking AS (
        SELECT awb, account AS vendor, airlines, via, dest, ra_name
        FROM air_shipments_smu_rate_cgk_spx
      ),
      smu_price AS (
        SELECT
          b.awb,
          s.total_cost_smu_per_kg AS smu_rate_per_kg,
          s.admin_smu,
          s.sg_out                AS sg_out_name
        FROM booking b
        LEFT JOIN air_shipments_smu s
          ON  s.vendor      = b.vendor
          AND s.airlines    = b.airlines
          AND s.origin      = b.via
          AND s.destination = b.dest
      ),
      ra_price AS (
        SELECT
          b.awb,
          r.rate  AS ra_rate,
          r.admin AS ra_admin,
          r.ppn   AS ra_ppn,
          b.ra_name
        FROM booking b
        LEFT JOIN air_shipments_ra r
          ON r.ra_name_lower = LOWER(b.ra_name)
      ),
      sg_price AS (
        SELECT
          sp.awb,
          sg.rate  AS sg_rate,
          sg.admin AS sg_admin,
          sg.ppn   AS sg_ppn,
          sp.sg_out_name
        FROM smu_price sp
        LEFT JOIN air_shipments_sg_outgoing sg
          ON sg.sg_outgoing_name = sp.sg_out_name
      ),
      awb_cost AS (
        SELECT
          a.awb,
          a.sum_gw_per_awb,
          CASE
            WHEN sp.smu_rate_per_kg IS NULL THEN NULL
            ELSE a.sum_gw_per_awb * sp.smu_rate_per_kg + COALESCE(sp.admin_smu, 0)
          END AS cost_smu,
          CASE
            WHEN b.ra_name IS NULL OR b.ra_name = ''           THEN 0
            WHEN LOWER(rp.ra_name) LIKE 'include%'             THEN 0
            WHEN rp.ra_rate IS NULL                            THEN NULL
            ELSE a.sum_gw_per_awb * rp.ra_rate * (1 + COALESCE(rp.ra_ppn, 0)) + COALESCE(rp.ra_admin, 0)
          END AS cost_ra,
          CASE
            WHEN sp.sg_out_name IS NULL OR sp.sg_out_name = '' THEN 0
            WHEN LOWER(sp.sg_out_name) LIKE 'include%'         THEN 0
            WHEN sgp.sg_rate IS NULL                           THEN NULL
            ELSE a.sum_gw_per_awb * sgp.sg_rate * (1 + COALESCE(sgp.sg_ppn, 0)) + COALESCE(sgp.sg_admin, 0)
          END AS cost_sg_out
        FROM awb_totals a
        LEFT JOIN booking  b    ON b.awb   = a.awb
        LEFT JOIN smu_price sp  ON sp.awb  = a.awb
        LEFT JOIN ra_price  rp  ON rp.awb  = a.awb
        LEFT JOIN sg_price  sgp ON sgp.awb = a.awb
      )
      SELECT
        c.to_number,
        c.awb,
        c.completed_time,
        c.cycle_period,
        c.origin_station,
        c.dest_station,
        b.vendor,
        b.airlines                                                            AS airline,

        c.gross_weight,
        ac.sum_gw_per_awb,
        c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)                        AS weight_share,

        c.amount_revenue                                                      AS revenue_freight,
        c.packing_kayu                                                        AS revenue_packing,
        c.amount_revenue + c.packing_kayu                                     AS revenue_total,

        ac.cost_smu                                                           AS cost_smu_awb,
        ac.cost_ra                                                            AS cost_ra_awb,
        ac.cost_sg_out                                                        AS cost_sg_out_awb,
        ac.cost_smu + ac.cost_ra + ac.cost_sg_out                             AS cost_total_awb,

        (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
          * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))                   AS cost_to,

        (c.amount_revenue + c.packing_kayu)
          - (ac.cost_smu + ac.cost_ra + ac.cost_sg_out)
            * (c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0))                 AS gross_profit_to

      FROM air_shipments_compileaircgk c
      JOIN awb_totals at ON at.awb = c.awb
      LEFT JOIN booking  b  ON b.awb  = c.awb
      LEFT JOIN awb_cost ac ON ac.awb = c.awb
    `)
  }
}
