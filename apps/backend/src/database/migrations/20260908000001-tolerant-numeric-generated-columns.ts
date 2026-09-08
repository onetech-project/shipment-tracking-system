import { MigrationInterface, QueryRunner } from 'typeorm'

// Makes every numeric generated column on the sheet tables tolerant of unparseable text.
//
// The columns were defined as a bare `REPLACE(extra_fields->>'x', ',', '')::NUMERIC`. Sheet
// cells are free text, so a single operator typo reaches the cast and Postgres rejects the
// whole statement:
//
//   invalid input syntax for type numeric: "16.660kg"
//
// Because the sync upserts in 500-row chunks, one such value fails the entire chunk and the
// service falls back to row-by-row inserts — 500 roundtrips instead of one, on every tick,
// for as long as the bad cell exists in the sheet.
//
// `pnl_parse_numeric` (20260604000001) already solves this for the columns added later: it
// strips thousands separators and returns NULL via an EXCEPTION handler instead of aborting.
// This migration extends it to strip a trailing mass unit ("16.660kg" -> 16.660) and then
// switches the 12 remaining bare-cast columns over to it.
//
// The unit is stripped rather than rejected because the value is a real measurement — the
// operator just typed the unit into the cell. Weights are recorded in kilograms (an implied
// revenue/weight rate of ~24k IDR matches rate_spx, which is per kg), so "16.660kg" is 16.66
// kg and the number is kept verbatim. Anything still unparseable becomes NULL, matching the
// existing behaviour for label values like "DO".
//
// The sanitizing is deliberately in two places. The coercer (air-shipments/coercer.ts) cleans
// the value on the way in, so new syncs never store the suffix; this migration is the backstop
// for rows already in the table and for any malformed shape the coercer does not anticipate.
//
// Postgres 16 has no `ALTER COLUMN ... SET EXPRESSION`, so each column must be dropped and
// re-added. v_pnl_to depends on several of them, so the matview is captured, dropped, and
// rebuilt from its own catalog definition — that keeps this migration correct no matter which
// of the many matview migrations last defined it.
export class TolerantNumericGeneratedColumns20260908000001 implements MigrationInterface {
  name = 'TolerantNumericGeneratedColumns20260908000001'

  // [table, column, extra_fields key, wrap in COALESCE(...,0)]
  private static readonly COLUMNS: [string, string, string, boolean][] = [
    ['air_shipments_compileaircgk', 'gross_weight', 'gross_weight', false],
    ['air_shipments_compileaircgk', 'amount_revenue', 'amount_revenue', false],
    ['air_shipments_compileaircgk', 'packing_kayu', 'additional_amount_packing_kayu', true],
    ['air_shipments_ra', 'rate', 'rate', false],
    ['air_shipments_ra', 'admin', 'admin', false],
    ['air_shipments_ra', 'ppn', 'ppn', false],
    ['air_shipments_sg_incoming', 'sg_inc', 'sg_inc', false],
    ['air_shipments_sg_outgoing', 'rate', 'rate', false],
    ['air_shipments_sg_outgoing', 'admin', 'admin', false],
    ['air_shipments_sg_outgoing', 'ppn', 'ppn', false],
    ['air_shipments_smu', 'total_cost_smu_per_kg', 'total_cost_smukg', false],
    ['air_shipments_smu', 'admin_smu', 'admin_smu', false],
  ]

  // The tolerant parser, now also stripping a trailing mass unit. CREATE OR REPLACE, so the
  // columns already using it (chwt, freight_rate, sc_per_kg, …) pick the improvement up too.
  private static readonly PARSER_WITH_UNIT = `
    CREATE OR REPLACE FUNCTION pnl_parse_numeric(txt TEXT) RETURNS NUMERIC AS $$
    DECLARE
      s TEXT := BTRIM(txt);
    BEGIN
      -- "16.660kg", "1,234.5 KG", "16.66 kilograms." -> drop the unit, keep the number
      s := regexp_replace(s, '[[:space:]]*(kgs?|kilograms?)\\.?$', '', 'i');
      s := NULLIF(REPLACE(BTRIM(s), ',', ''), '');
      IF s IS NULL THEN RETURN NULL; END IF;
      RETURN s::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `

  // The original parser, without unit stripping — restored by down().
  private static readonly PARSER_ORIGINAL = `
    CREATE OR REPLACE FUNCTION pnl_parse_numeric(txt TEXT) RETURNS NUMERIC AS $$
    DECLARE
      s TEXT := NULLIF(REPLACE(BTRIM(txt), ',', ''), '');
    BEGIN
      IF s IS NULL THEN RETURN NULL; END IF;
      RETURN s::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `

  private tolerantExpr(key: string, coalesce: boolean): string {
    const inner = `pnl_parse_numeric(extra_fields->>'${key}')`
    return coalesce ? `COALESCE(${inner}, 0)` : inner
  }

  private bareExpr(key: string, coalesce: boolean): string {
    const inner = `REPLACE(extra_fields->>'${key}', ',', '')::NUMERIC`
    return coalesce ? `COALESCE(${inner}, 0)` : inner
  }

  // Rebuilds each generated column with `build`, restoring v_pnl_to afterwards. Both up() and
  // down() need exactly this dance, so it lives in one place.
  private async rebuild(
    queryRunner: QueryRunner,
    build: (key: string, coalesce: boolean) => string
  ): Promise<void> {
    const [{ definition }] = await queryRunner.query(
      `SELECT definition FROM pg_matviews WHERE matviewname = 'v_pnl_to'`
    )
    const indexes: { indexdef: string }[] = await queryRunner.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'v_pnl_to'`
    )

    await queryRunner.query(`DROP MATERIALIZED VIEW IF EXISTS v_pnl_to`)

    for (const [table, column, key, coalesce] of TolerantNumericGeneratedColumns20260908000001.COLUMNS) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column}`)
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN ${column} NUMERIC GENERATED ALWAYS AS (${build(key, coalesce)}) STORED`
      )
    }

    await queryRunner.query(`CREATE MATERIALIZED VIEW v_pnl_to AS ${definition}`)
    for (const { indexdef } of indexes) {
      await queryRunner.query(indexdef)
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(TolerantNumericGeneratedColumns20260908000001.PARSER_WITH_UNIT)
    await this.rebuild(queryRunner, (k, c) => this.tolerantExpr(k, c))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(queryRunner, (k, c) => this.bareExpr(k, c))
    await queryRunner.query(TolerantNumericGeneratedColumns20260908000001.PARSER_ORIGINAL)
  }
}
