import { MigrationInterface, QueryRunner } from 'typeorm'

// Requirement §5 asks for four vehicle photos alongside the document scans. They are seeded as
// jenis_berkas rows rather than given a table of their own: a photo is a file attached to a slot,
// which is exactly what that table already models, and seeding them means the form has something
// to show on the day it ships instead of an empty section waiting on an admin.
//
// is_required FALSE — the requirement calls photos an attachment, not a condition of
// registration. That flag is also what keeps berkasCount honest: the completeness chip counts
// required slots only, so four optional photos do not turn every "3/3 lengkap" unit into "3/7".
export class FleetPhotoSlots20260918000001 implements MigrationInterface {
  name = 'FleetPhotoSlots20260918000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ON CONFLICT DO NOTHING for the same reason the seed migration uses it: a re-run stays
    // idempotent, and a label an admin has since edited is never overwritten.
    await queryRunner.query(`
      INSERT INTO fleet_master_data
        (category, code, label, sort_order, warn_days, default_valid_months, is_required)
      VALUES
        ('jenis_berkas','foto_depan','Foto Depan',40,NULL,NULL,FALSE),
        ('jenis_berkas','foto_belakang','Foto Belakang',50,NULL,NULL,FALSE),
        ('jenis_berkas','foto_kiri','Foto Kiri',60,NULL,NULL,FALSE),
        ('jenis_berkas','foto_kanan','Foto Kanan',70,NULL,NULL,FALSE)
      ON CONFLICT (category, code) DO NOTHING
    `)
  }

  // fk_fleet_vehicle_files_slot is ON DELETE RESTRICT, so this fails rather than succeeds once a
  // unit has photos filed against these slots. That is the behaviour we want: a migration going
  // down must not quietly discard an operator's uploads.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM fleet_master_data
      WHERE category = 'jenis_berkas'
        AND code IN ('foto_depan','foto_belakang','foto_kiri','foto_kanan')
    `)
  }
}
