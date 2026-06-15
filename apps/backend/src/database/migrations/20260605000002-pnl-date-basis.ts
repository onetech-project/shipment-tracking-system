import { MigrationInterface, QueryRunner } from 'typeorm'

// Makes the PnL date basis user-selectable: cycle/period and date-range filtering can run off any
// of completed_time / ata_vendor_wh_destination / atd_origin (default ata, chosen in the service).
// The three raw date fields differ in format — atd_origin is ISO 'YYYY-MM-DD HH:MI' while the
// others are 'DD-Mon-YYYY HH:MI' / 'D Mon YYYY H:MI' — so a single tolerant parser is used.
//
// Each basis gets its own STORED generated cycle_/date_ column (raw value, no fallback) plus a
// matching v_pnl_to column. The legacy cycle_period column (completed→ata fallback) is left intact
// for backward compatibility but is no longer used by PnL queries.
export class PnlDateBasis20260605000002 implements MigrationInterface {
  name = 'PnlDateBasis20260605000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tolerant date parser: ISO, DD-Mon-YYYY, and D Mon YYYY (with/without time). NULL on failure.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION pnl_parse_date(txt TEXT) RETURNS TIMESTAMP AS $$
      DECLARE
        s TEXT := NULLIF(BTRIM(txt), '');
      BEGIN
        IF s IS NULL THEN RETURN NULL; END IF;
        IF s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
          RETURN s::TIMESTAMP;                                  -- ISO 'YYYY-MM-DD[ HH:MI]'
        END IF;
        RETURN to_timestamp(s, 'DD-Mon-YYYY HH24:MI');          -- 'DD-Mon-YYYY' / 'D Mon YYYY'
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `)

    // Cycle label: YYYY-MM-1H (day 1–15) / YYYY-MM-2H (day 16+). NULL when the date won't parse.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION pnl_cycle(txt TEXT) RETURNS TEXT AS $$
      DECLARE
        d TIMESTAMP := pnl_parse_date(txt);
      BEGIN
        IF d IS NULL THEN RETURN NULL; END IF;
        RETURN to_char(d, 'YYYY-MM') || CASE WHEN EXTRACT(DAY FROM d) <= 15 THEN '-1H' ELSE '-2H' END;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `)

    // Per-basis generated columns (raw value, no fallback).
    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        ADD COLUMN IF NOT EXISTS cycle_completed TEXT      GENERATED ALWAYS AS (pnl_cycle(extra_fields->>'completed_time')) STORED,
        ADD COLUMN IF NOT EXISTS cycle_ata       TEXT      GENERATED ALWAYS AS (pnl_cycle(extra_fields->>'ata_vendor_wh_destination')) STORED,
        ADD COLUMN IF NOT EXISTS cycle_atd       TEXT      GENERATED ALWAYS AS (pnl_cycle(extra_fields->>'atd_origin')) STORED,
        ADD COLUMN IF NOT EXISTS date_completed  TIMESTAMP GENERATED ALWAYS AS (pnl_parse_date(extra_fields->>'completed_time')) STORED,
        ADD COLUMN IF NOT EXISTS date_ata        TIMESTAMP GENERATED ALWAYS AS (pnl_parse_date(extra_fields->>'ata_vendor_wh_destination')) STORED,
        ADD COLUMN IF NOT EXISTS date_atd        TIMESTAMP GENERATED ALWAYS AS (pnl_parse_date(extra_fields->>'atd_origin')) STORED
    `)

    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(true))
    await this.createIndexes(queryRunner, true)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)
    await queryRunner.query(this.viewSql(false))
    await this.createIndexes(queryRunner, false)

    await queryRunner.query(`
      ALTER TABLE air_shipments_compileaircgk
        DROP COLUMN IF EXISTS cycle_completed,
        DROP COLUMN IF EXISTS cycle_ata,
        DROP COLUMN IF EXISTS cycle_atd,
        DROP COLUMN IF EXISTS date_completed,
        DROP COLUMN IF EXISTS date_ata,
        DROP COLUMN IF EXISTS date_atd
    `)
    await queryRunner.query(`DROP FUNCTION IF EXISTS pnl_cycle(TEXT)`)
    await queryRunner.query(`DROP FUNCTION IF EXISTS pnl_parse_date(TEXT)`)
  }

  private async createIndexes(queryRunner: QueryRunner, withBasis: boolean): Promise<void> {
    await queryRunner.query(`CREATE UNIQUE INDEX idx_v_pnl_to_id ON v_pnl_to(id)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle ON v_pnl_to(cycle_period)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_awb ON v_pnl_to(awb)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_completed_time ON v_pnl_to(completed_time)`)
    await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_awb ON v_pnl_to(cycle_period, awb)`)
    if (withBasis) {
      await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_completed ON v_pnl_to(cycle_completed)`)
      await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_ata ON v_pnl_to(cycle_ata)`)
      await queryRunner.query(`CREATE INDEX idx_v_pnl_to_cycle_atd ON v_pnl_to(cycle_atd)`)
    }
  }

  // The v_pnl_to body is identical to 20260605000001 except, when withBasis, the per-basis
  // cycle_/date_ columns are surfaced from air_shipments_compileaircgk (c).
  private viewSql(withBasis: boolean): string {
    const basisBaseCols = withBasis
      ? `c.cycle_completed, c.cycle_ata, c.cycle_atd, c.date_completed, c.date_ata, c.date_atd,`
      : ``
    const basisOutCols = withBasis
      ? `cycle_completed, cycle_ata, cycle_atd, date_completed, date_ata, date_atd,`
      : ``
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
          ${basisBaseCols}
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
        ${basisOutCols}
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
          WHEN sg_inc          IS NULL THEN 'sg_in_rate_missing'
          ELSE NULL
        END                                                                 AS issue
      FROM base
    `
  }
}
