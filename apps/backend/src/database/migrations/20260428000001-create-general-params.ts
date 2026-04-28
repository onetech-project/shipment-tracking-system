import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateGeneralParams20260428000001 implements MigrationInterface {
  name = 'CreateGeneralParams20260428000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "general_params" (
        "id" SERIAL PRIMARY KEY,
        "key" text NOT NULL UNIQUE,
        "label" text NOT NULL,
        "value" text NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now()
      )
    `)

    await queryRunner.query(`
      INSERT INTO "general_params" ("key", "label", "value") VALUES
        ('n_hours', 'Prediksi Waktu Tempuh Gudang asal → Bandara asal', '5'),
        ('m_hours', 'Prediksi Waktu Tempuh Bandara tujuan → Gudang Tujuan', '5'),
        ('days_range', 'Rentang Hari Data', '30')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "general_params"')
  }
}
