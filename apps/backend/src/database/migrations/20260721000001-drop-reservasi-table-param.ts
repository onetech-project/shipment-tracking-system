import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropReservasiTableParam20260721000001 implements MigrationInterface {
  name = 'DropReservasiTableParam20260721000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "general_params" WHERE "key" = 'reservasi_table_name'`)
    await queryRunner.query(`DELETE FROM "general_params" WHERE "key" = 'days_range'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "general_params" ("key", "label", "value") VALUES
      ('reservasi_table_name', 'Nama Tabel Sheet Reservasi', 'air_shipments_smu_rate_cgk_spx'),
      ('days_range', 'Rentang Hari Data', '30')
      ON CONFLICT ("key") DO NOTHING
    `)
    await queryRunner.query(`
      INSERT INTO "general_params" ("key", "label", "value")
      VALUES ('days_range', 'Rentang Hari Data', '30')
      ON CONFLICT ("key") DO NOTHING
    `)
  }
}
