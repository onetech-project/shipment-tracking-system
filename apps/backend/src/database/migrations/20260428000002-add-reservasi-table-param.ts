import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddReservasiTableParam20260428000002 implements MigrationInterface {
  name = 'AddReservasiTableParam20260428000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "general_params" ("key", "label", "value")
      VALUES ('reservasi_table_name', 'Nama Tabel Sheet Reservasi', 'air_shipments_smu_rate_cgk_spx')
      ON CONFLICT ("key") DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "general_params" WHERE "key" = 'reservasi_table_name'`)
  }
}
