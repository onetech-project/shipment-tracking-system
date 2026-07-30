import { MigrationInterface, QueryRunner } from 'typeorm'

// Adds komoditi (HP / Bukan HP) classification to barhal_koli, selected during koli creation.
export class BarhalKoliKomoditi20260730000001 implements MigrationInterface {
  name = 'BarhalKoliKomoditi20260730000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE barhal_koli
        ADD COLUMN komoditi TEXT NOT NULL DEFAULT 'HP'
        CONSTRAINT chk_barhal_koli_komoditi CHECK (komoditi IN ('HP', 'Bukan HP'))
    `)
    await queryRunner.query(`ALTER TABLE barhal_koli ALTER COLUMN komoditi DROP DEFAULT`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE barhal_koli DROP COLUMN IF EXISTS komoditi`)
  }
}
