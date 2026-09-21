import { MigrationInterface, QueryRunner } from 'typeorm'

// is_required is nullable with no default, so every row created through the Master Data form was
// born NULL. The service reads the flag as `isRequired: true`, which means NULL and FALSE are
// already indistinguishable to it — this backfill changes no behaviour, it only stops the column
// carrying two spellings of the same answer now that an operator can set it from the UI.
//
// Scoped to the two categories that actually read the flag. The other six would be claiming a
// policy that does not apply to them.
export class FleetRequiredFlagsBackfill20260922000001 implements MigrationInterface {
  name = 'FleetRequiredFlagsBackfill20260922000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = FALSE
      WHERE is_required IS NULL AND category IN ('jenis_berkas','jenis_dokumen')
    `)
  }

  // Deliberately not symmetric: this also nulls the rows 20260912000003 set to FALSE on purpose,
  // because nothing distinguishes those from the ones up() just wrote. Restoring them per code
  // would duplicate that migration's policy table here and leave two places to keep in step. The
  // same trade-off, for the same reason, is why 20260912000003's own down() resets to NULL.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = NULL
      WHERE is_required = FALSE AND category IN ('jenis_berkas','jenis_dokumen')
    `)
  }
}
