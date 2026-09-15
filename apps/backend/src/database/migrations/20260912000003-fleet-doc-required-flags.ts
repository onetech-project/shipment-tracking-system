import { MigrationInterface, QueryRunner } from 'typeorm'

// jenis_dokumen was seeded with is_required NULL because only jenis_berkas used the flag at the
// time. Requirement §5 makes the vehicle documents mandatory, so the flag is filled in here
// rather than hardcoded in the service: Kartu Pengawasan is explicitly excused for non-public
// transport units, and an admin who changes that policy should be able to flip it from the
// Master Data screen instead of waiting for a deploy.
export class FleetDocRequiredFlags20260912000003 implements MigrationInterface {
  name = 'FleetDocRequiredFlags20260912000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = TRUE
      WHERE category = 'jenis_dokumen' AND code IN ('stnk','pajak','asuransi','emisi')
    `)
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = FALSE
      WHERE category = 'jenis_dokumen' AND code IN ('kir','kartu_pengawasan','servis')
    `)
  }

  // Back to NULL, the state the seed migration left them in. Restoring TRUE/FALSE per row would
  // claim to know a policy this migration is the one that introduced.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = NULL WHERE category = 'jenis_dokumen'
    `)
  }
}
