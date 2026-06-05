import { MigrationInterface, QueryRunner } from 'typeorm'

// Aligns SMU costing with the workbook "Origin CGK May All" (cols O–X) and recovers margins
// lost to name-join mismatches. Estimate-only model is preserved (no actual-invoice override).
//
//   WS1 — SMU cost is built from its components (which are already synced into
//         air_shipments_smu.extra_fields) instead of the precomputed total_cost_smukg, which was
//         ~1% off the sheet. Per AWB, with w = COALESCE(chwt, sum_gw_per_awb):
//           SMU = ((freight + sc + fbc + myc + other) * w + admin) * (1 + ppn%)
//                 - (freight * w) * komisi%
//         ppn and komisi are plain percent in the source (11 → 11%, 1.1 → 1.1%, 2.94 → 2.94%).
//   WS2 — SG-Out and RA joins use a punctuation/case-insensitive canonical key so e.g.
//         "SG GADOM" matches "SG GA-DOM". Genuinely-absent names stay NULL (flagged in audit).
//
// Generated columns cannot reference other generated columns, so every derived column reads
// straight from extra_fields (mirrors 20260503000002-pnl-generated-columns-pricing.ts).
export class PnlSmuComponents20260605000001 implements MigrationInterface {
  name = 'PnlSmuComponents20260605000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // WS1 — SMU component rates (already present in extra_fields, just not surfaced as columns).
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu
        ADD COLUMN IF NOT EXISTS freight_rate NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'freight_rate', ',', ''), '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS sc_per_kg NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'sc_250kg_pelita', ',', ''), '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS fbc_per_kg NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'fbc_citilink', ',', ''), '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS myc_per_kg NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'myc_fuel_surcharge', ',', ''), '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS other_per_kg NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'other_charges_ga_td_origin_sub', ',', ''), '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS ppn_pct NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'ppn', ',', ''), '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS komisi_pct NUMERIC GENERATED ALWAYS AS (
          NULLIF(REPLACE(extra_fields->>'komisi', ',', ''), '')::NUMERIC
        ) STORED
    `)

    // WS2 — canonical (punctuation/space/case-insensitive) name keys for join recovery.
    await queryRunner.query(`
      ALTER TABLE air_shipments_sg_outgoing
        ADD COLUMN IF NOT EXISTS sg_outgoing_name_norm TEXT GENERATED ALWAYS AS (
          LOWER(REGEXP_REPLACE(COALESCE(extra_fields->>'sg_outgoing_name', ''), '[^a-zA-Z0-9]', '', 'g'))
        ) STORED
    `)
    // ra_name lives in the real ra_name column (extra_fields->>'ra_name' is empty), mirroring
    // the existing ra_name_lower = lower(ra_name) generated column.
    await queryRunner.query(`
      ALTER TABLE air_shipments_ra
        ADD COLUMN IF NOT EXISTS ra_name_norm TEXT GENERATED ALWAYS AS (
          LOWER(REGEXP_REPLACE(COALESCE(ra_name, ''), '[^a-zA-Z0-9]', '', 'g'))
        ) STORED
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sg_outgoing_name_norm ON air_shipments_sg_outgoing(sg_outgoing_name_norm)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ra_name_norm ON air_shipments_ra(ra_name_norm)`)

    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql())
    await this.createIndexes(queryRunner)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the pre-component view from 20260604000001-pnl-align-with-sheet.ts (up()).
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.previousViewSql())
    await this.createIndexes(queryRunner)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_ra_name_norm`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sg_outgoing_name_norm`)
    await queryRunner.query(`ALTER TABLE air_shipments_ra DROP COLUMN IF EXISTS ra_name_norm`)
    await queryRunner.query(`ALTER TABLE air_shipments_sg_outgoing DROP COLUMN IF EXISTS sg_outgoing_name_norm`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu
        DROP COLUMN IF EXISTS freight_rate,
        DROP COLUMN IF EXISTS sc_per_kg,
        DROP COLUMN IF EXISTS fbc_per_kg,
        DROP COLUMN IF EXISTS myc_per_kg,
        DROP COLUMN IF EXISTS other_per_kg,
        DROP COLUMN IF EXISTS ppn_pct,
        DROP COLUMN IF EXISTS komisi_pct
    `)
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX idx_v_pnl_to_id ON v_pnl_to(id)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle ON v_pnl_to(cycle_period)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_awb ON v_pnl_to(awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_completed_time ON v_pnl_to(completed_time)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_awb ON v_pnl_to(cycle_period, awb)`)
  }

  private viewSql(): string {
    return `
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
         AND r.ra_name_norm <> ''   -- never match on the empty key (blank names would fan out)
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
          -- Chargeable weight basis; fall back to gross when chwt is missing.
          COALESCE(b.chwt, a.sum_gw_per_awb) AS aw_weight,
          -- SMU from components: ((freight+sc+fbc+myc+other)*w + admin)*(1+ppn%) - (freight*w)*komisi%
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
          -- RA: 0 for Surabaya; PPN charged on (amount + admin).
          CASE WHEN a.origin_station = 'Surabaya'  THEN 0
               WHEN b.ra_name IS NULL OR b.ra_name = '' THEN 0
               WHEN LOWER(rp.ra_name) LIKE 'include%'  THEN 0
               WHEN rp.ra_rate IS NULL                 THEN NULL
               ELSE (COALESCE(b.chwt, a.sum_gw_per_awb) * rp.ra_rate + COALESCE(rp.ra_admin, 0))
                    * (1 + COALESCE(rp.ra_ppn, 0) / 100.0)
          END AS cost_ra,
          -- SG-Out: Surabaya charges PPN on (amount + admin); CGK keeps amount-only.
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
          COALESCE(c.amount_revenue, 0) * 0.015                AS revenue_discount,
          ac.cost_smu                                          AS cost_smu_awb,
          ac.cost_ra                                           AS cost_ra_awb,
          ac.cost_sg_out                                       AS cost_sg_out_awb,
          ac.cost_smu + ac.cost_ra + ac.cost_sg_out            AS cost_total_awb,
          ac.aw_weight,
          sgi.sg_inc,
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
        CASE WHEN sg_inc IS NULL THEN NULL
             ELSE weight_share * (aw_weight * sg_inc + sg_in_admin)
        END                                                                 AS cost_sg_in_to,
        cost_total_awb * weight_share
          + COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS cost_to,
        (revenue_total - revenue_discount)
          - cost_total_awb * weight_share
          - COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS gross_profit_to,
        -- Canonical costing-failure reason (root cause first). NULL = fully costed.
        -- Source-data gaps must be fixed in the source Google Sheets, then re-synced.
        CASE
          WHEN vendor          IS NULL THEN 'no_booking'          -- AWB absent from smu_rate_cgk_spx
          WHEN cost_smu_awb    IS NULL THEN 'smu_rate_missing'    -- booking present, route not in rate master
          WHEN cost_ra_awb     IS NULL THEN 'ra_rate_missing'     -- RA name not matched / rate blank
          WHEN cost_sg_out_awb IS NULL THEN 'sgout_name_missing'  -- SG-Out name not matched
          WHEN revenue_total   IS NULL THEN 'revenue_missing'     -- amount_revenue / packing_kayu blank
          WHEN sg_inc          IS NULL THEN 'sg_in_rate_missing'  -- SG-In rate absent (does not block margin)
          ELSE NULL
        END                                                                 AS issue
      FROM base
    `
  }

  private previousViewSql(): string {
    return `
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
          COALESCE(b.chwt, a.sum_gw_per_awb) AS aw_weight,
          CASE WHEN sp.smu_rate_per_kg IS NULL THEN NULL
               ELSE COALESCE(b.chwt, a.sum_gw_per_awb) * sp.smu_rate_per_kg + COALESCE(sp.admin_smu, 0)
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
          c.origin_station, c.dest_station, b.vendor, b.airlines AS airline,
          c.gross_weight, ac.sum_gw_per_awb,
          c.gross_weight / NULLIF(ac.sum_gw_per_awb, 0)        AS weight_share,
          c.amount_revenue                                     AS revenue_freight,
          c.packing_kayu                                       AS revenue_packing,
          c.amount_revenue + c.packing_kayu                    AS revenue_total,
          COALESCE(c.amount_revenue, 0) * 0.015                AS revenue_discount,
          ac.cost_smu                                          AS cost_smu_awb,
          ac.cost_ra                                           AS cost_ra_awb,
          ac.cost_sg_out                                       AS cost_sg_out_awb,
          ac.cost_smu + ac.cost_ra + ac.cost_sg_out            AS cost_total_awb,
          ac.aw_weight,
          sgi.sg_inc,
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
        CASE WHEN sg_inc IS NULL THEN NULL
             ELSE weight_share * (aw_weight * sg_inc + sg_in_admin)
        END                                                                 AS cost_sg_in_to,
        cost_total_awb * weight_share
          + COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS cost_to,
        (revenue_total - revenue_discount)
          - cost_total_awb * weight_share
          - COALESCE(weight_share * (aw_weight * sg_inc + sg_in_admin), 0)   AS gross_profit_to
      FROM base
    `
  }
}
