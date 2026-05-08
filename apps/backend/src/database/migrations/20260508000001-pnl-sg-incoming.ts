import { MigrationInterface, QueryRunner } from 'typeorm'

export class PnlSgIncoming20260508000001 implements MigrationInterface {
  name = 'PnlSgIncoming20260508000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS air_shipments_sg_incoming (
        id             UUID        NOT NULL DEFAULT gen_random_uuid(),
        is_locked      BOOLEAN     NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_synced_at TIMESTAMPTZ,
        extra_fields   JSONB                DEFAULT '{}',
        CONSTRAINT "air_shipments_sg_incoming_pkey" PRIMARY KEY (id)
      )
    `)
    await queryRunner.query(`
      ALTER TABLE air_shipments_sg_incoming
        ADD COLUMN IF NOT EXISTS origin      TEXT    GENERATED ALWAYS AS (extra_fields->>'origin') STORED,
        ADD COLUMN IF NOT EXISTS destination TEXT    GENERATED ALWAYS AS (extra_fields->>'destination') STORED,
        ADD COLUMN IF NOT EXISTS sg_inc      NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'sg_inc', ',', '')::NUMERIC
        ) STORED
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_sg_incoming_lookup ON air_shipments_sg_incoming(origin, destination)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sg_incoming_lookup`)
    await queryRunner.query(`DROP TABLE IF EXISTS air_shipments_sg_incoming`)
  }
}
