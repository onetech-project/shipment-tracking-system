import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Narrow the Tracking_SMU offload rule to the ACTUAL departure only.
 *
 * Previously (20260624000001) an AWB was "offload" when the actual departure
 * (Actual Flight (DEP)) OR any later leg (DEP2…DEP5) differed from STD Booking.
 * The alert now flags offload solely on the actual departure:
 *
 *   offload  ⇔  actual_flight_dep is non-blank AND differs from std_booking
 *               (trimmed, case-insensitive). Later legs (DEP2…DEP5) are ignored.
 *
 * `offload_status` is a STORED generated column, which Postgres cannot ALTER in
 * place — so we drop and re-add it (re-adding backfills every existing row with
 * the new rule). The DEP2…DEP5 field columns stay: they remain display-only in
 * the drill-in table and SLA export.
 */
export class TrackingSmuOffloadActualDep20260706000001 implements MigrationInterface {
  name = 'TrackingSmuOffloadActualDep20260706000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_smu_offload_status`)
    await queryRunner.query(
      `ALTER TABLE air_shipments_tracking_smu DROP COLUMN IF EXISTS offload_status`
    )
    await queryRunner.query(`
      ALTER TABLE air_shipments_tracking_smu
        ADD COLUMN IF NOT EXISTS offload_status TEXT GENERATED ALWAYS AS (
          CASE WHEN (
            NULLIF(BTRIM(extra_fields->>'actual_flight_dep'), '') IS NOT NULL
            AND LOWER(BTRIM(extra_fields->>'actual_flight_dep')) IS DISTINCT FROM LOWER(BTRIM(COALESCE(extra_fields->>'std_booking', '')))
          ) THEN 'offload' ELSE 'onboard' END
        ) STORED
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tracking_smu_offload_status ON air_shipments_tracking_smu(offload_status)`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the prior rule: actual departure OR any of DEP2…DEP5 differs from STD Booking.
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_smu_offload_status`)
    await queryRunner.query(
      `ALTER TABLE air_shipments_tracking_smu DROP COLUMN IF EXISTS offload_status`
    )
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
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tracking_smu_offload_status ON air_shipments_tracking_smu(offload_status)`
    )
  }
}
