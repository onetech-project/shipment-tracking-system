import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Tracking_SMU sheet → air_shipments_tracking_smu.
 *
 * Tracks each AWB's booked flight (STD Booking) vs. its actual departure legs
 * (Actual Flight (DEP), DEP2…DEP5). An AWB is "offload" when any non-blank DEP
 * value differs from STD Booking (trimmed, case-insensitive); otherwise "onboard".
 *
 * - Field columns are GENERATED from extra_fields (the sync writes sheet cells there).
 * - `offload_status` is GENERATED from extra_fields only (Postgres forbids a stored
 *   generated column referencing another generated column).
 * - `evidence` is a plain, user-managed column: it is NOT a sheet header and NOT
 *   generated, so the sync (which only writes non-generated columns matching sheet
 *   headers) preserves it across re-syncs — identical to `excluded_reasons`.
 *
 * Idempotent: mirrors DynamicTableService.ensureTable so it converges with the
 * config-driven path regardless of which runs first.
 */
export class TrackingSmuOffload20260624000001 implements MigrationInterface {
  name = 'TrackingSmuOffload20260624000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Base table skeleton (matches DynamicTableService.ensureTable)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS air_shipments_tracking_smu (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        is_locked      BOOLEAN     NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_synced_at TIMESTAMPTZ,
        extra_fields   JSONB                DEFAULT '{}'::jsonb
      )
    `)

    // 2) Unique key column `awb` (plain TEXT — the sync writes it directly, since
    //    "AWB" is a sheet header and the configured unique key).
    await queryRunner.query(
      `ALTER TABLE air_shipments_tracking_smu ADD COLUMN IF NOT EXISTS awb TEXT`
    )

    // 3) UNIQUE constraint + GIN index (same names ensureTable would create)
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_air_shipments_tracking_smu_awb') THEN
        EXECUTE 'ALTER TABLE air_shipments_tracking_smu ADD CONSTRAINT uq_air_shipments_tracking_smu_awb UNIQUE (awb)';
      END IF;
    END$$;`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_air_shipments_tracking_smu_extra_gin ON air_shipments_tracking_smu USING GIN (extra_fields)`
    )

    // 4) Generated field-extraction columns from extra_fields
    //    (header normalization: "Actual Flight (DEP)" → actual_flight_dep, etc.)
    await queryRunner.query(`
      ALTER TABLE air_shipments_tracking_smu
        ADD COLUMN IF NOT EXISTS airline           TEXT GENERATED ALWAYS AS (extra_fields->>'airline') STORED,
        ADD COLUMN IF NOT EXISTS std_booking       TEXT GENERATED ALWAYS AS (extra_fields->>'std_booking') STORED,
        ADD COLUMN IF NOT EXISTS std_flight_no     TEXT GENERATED ALWAYS AS (extra_fields->>'std_flight_no') STORED,
        ADD COLUMN IF NOT EXISTS actual_flight_dep TEXT GENERATED ALWAYS AS (extra_fields->>'actual_flight_dep') STORED,
        ADD COLUMN IF NOT EXISTS dep_flight_no     TEXT GENERATED ALWAYS AS (extra_fields->>'dep_flight_no') STORED,
        ADD COLUMN IF NOT EXISTS dep2              TEXT GENERATED ALWAYS AS (extra_fields->>'dep2') STORED,
        ADD COLUMN IF NOT EXISTS dep2_flight_no    TEXT GENERATED ALWAYS AS (extra_fields->>'dep2_flight_no') STORED,
        ADD COLUMN IF NOT EXISTS dep3              TEXT GENERATED ALWAYS AS (extra_fields->>'dep3') STORED,
        ADD COLUMN IF NOT EXISTS dep3_flight_no    TEXT GENERATED ALWAYS AS (extra_fields->>'dep3_flight_no') STORED,
        ADD COLUMN IF NOT EXISTS dep4              TEXT GENERATED ALWAYS AS (extra_fields->>'dep4') STORED,
        ADD COLUMN IF NOT EXISTS dep4_flight_no    TEXT GENERATED ALWAYS AS (extra_fields->>'dep4_flight_no') STORED,
        ADD COLUMN IF NOT EXISTS dep5              TEXT GENERATED ALWAYS AS (extra_fields->>'dep5') STORED,
        ADD COLUMN IF NOT EXISTS dep5_flight_no    TEXT GENERATED ALWAYS AS (extra_fields->>'dep5_flight_no') STORED,
        ADD COLUMN IF NOT EXISTS remarks_offload   TEXT GENERATED ALWAYS AS (extra_fields->>'remarks_offload') STORED
    `)

    // 5) Computed offload status. Offload when ANY DEP value column is non-blank
    //    AND differs from STD Booking (trimmed, case-insensitive). Blank DEP = onboard.
    await queryRunner.query(`
      ALTER TABLE air_shipments_tracking_smu
        ADD COLUMN IF NOT EXISTS offload_status TEXT GENERATED ALWAYS AS (
          CASE WHEN (
            (NULLIF(BTRIM(extra_fields->>'actual_flight_dep'), '') IS NOT NULL
              AND LOWER(BTRIM(extra_fields->>'actual_flight_dep')) IS DISTINCT FROM LOWER(BTRIM(COALESCE(extra_fields->>'std_booking', ''))))
            OR (NULLIF(BTRIM(extra_fields->>'dep2'), '') IS NOT NULL
              AND LOWER(BTRIM(extra_fields->>'dep2')) IS DISTINCT FROM LOWER(BTRIM(COALESCE(extra_fields->>'std_booking', ''))))
            OR (NULLIF(BTRIM(extra_fields->>'dep3'), '') IS NOT NULL
              AND LOWER(BTRIM(extra_fields->>'dep3')) IS DISTINCT FROM LOWER(BTRIM(COALESCE(extra_fields->>'std_booking', ''))))
            OR (NULLIF(BTRIM(extra_fields->>'dep4'), '') IS NOT NULL
              AND LOWER(BTRIM(extra_fields->>'dep4')) IS DISTINCT FROM LOWER(BTRIM(COALESCE(extra_fields->>'std_booking', ''))))
            OR (NULLIF(BTRIM(extra_fields->>'dep5'), '') IS NOT NULL
              AND LOWER(BTRIM(extra_fields->>'dep5')) IS DISTINCT FROM LOWER(BTRIM(COALESCE(extra_fields->>'std_booking', ''))))
          ) THEN 'offload' ELSE 'onboard' END
        ) STORED
    `)

    // 6) User-managed evidence link (survives re-sync)
    await queryRunner.query(
      `ALTER TABLE air_shipments_tracking_smu ADD COLUMN IF NOT EXISTS evidence TEXT`
    )

    // 7) Lookup indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tracking_smu_offload_status ON air_shipments_tracking_smu(offload_status)`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_smu_offload_status`)
    await queryRunner.query(`
      ALTER TABLE air_shipments_tracking_smu
        DROP COLUMN IF EXISTS offload_status,
        DROP COLUMN IF EXISTS evidence,
        DROP COLUMN IF EXISTS airline,
        DROP COLUMN IF EXISTS std_booking,
        DROP COLUMN IF EXISTS std_flight_no,
        DROP COLUMN IF EXISTS actual_flight_dep,
        DROP COLUMN IF EXISTS dep_flight_no,
        DROP COLUMN IF EXISTS dep2,
        DROP COLUMN IF EXISTS dep2_flight_no,
        DROP COLUMN IF EXISTS dep3,
        DROP COLUMN IF EXISTS dep3_flight_no,
        DROP COLUMN IF EXISTS dep4,
        DROP COLUMN IF EXISTS dep4_flight_no,
        DROP COLUMN IF EXISTS dep5,
        DROP COLUMN IF EXISTS dep5_flight_no,
        DROP COLUMN IF EXISTS remarks_offload
    `)
  }
}
