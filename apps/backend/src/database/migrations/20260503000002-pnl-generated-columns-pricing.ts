import { MigrationInterface, QueryRunner } from 'typeorm'

export class PnlGeneratedColumnsPricing20260503000002 implements MigrationInterface {
  name = 'PnlGeneratedColumnsPricing20260503000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // smu_rate_cgk_spx — table exists; awb is already a real column with unique constraint
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu_rate_cgk_spx
        ADD COLUMN IF NOT EXISTS account  TEXT GENERATED ALWAYS AS (extra_fields->>'account') STORED,
        ADD COLUMN IF NOT EXISTS airlines TEXT GENERATED ALWAYS AS (extra_fields->>'airlines') STORED,
        ADD COLUMN IF NOT EXISTS via      TEXT GENERATED ALWAYS AS (extra_fields->>'via') STORED,
        ADD COLUMN IF NOT EXISTS dest     TEXT GENERATED ALWAYS AS (extra_fields->>'dest') STORED,
        ADD COLUMN IF NOT EXISTS ra_name  TEXT GENERATED ALWAYS AS (extra_fields->>'ra') STORED
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_smurate_lookup ON air_shipments_smu_rate_cgk_spx(account, airlines, via, dest)`)

    // air_shipments_smu — create if not yet synced from Google Sheets
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS air_shipments_smu (
        id             UUID        NOT NULL DEFAULT gen_random_uuid(),
        is_locked      BOOLEAN     NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_synced_at TIMESTAMPTZ,
        extra_fields   JSONB                DEFAULT '{}',
        CONSTRAINT "air_shipments_smu_pkey" PRIMARY KEY (id)
      )
    `)
    await queryRunner.query(`
      ALTER TABLE air_shipments_smu
        ADD COLUMN IF NOT EXISTS vendor                TEXT    GENERATED ALWAYS AS (extra_fields->>'vendor') STORED,
        ADD COLUMN IF NOT EXISTS airlines              TEXT    GENERATED ALWAYS AS (extra_fields->>'airlines') STORED,
        ADD COLUMN IF NOT EXISTS origin                TEXT    GENERATED ALWAYS AS (extra_fields->>'origin') STORED,
        ADD COLUMN IF NOT EXISTS destination           TEXT    GENERATED ALWAYS AS (extra_fields->>'destination') STORED,
        ADD COLUMN IF NOT EXISTS total_cost_smu_per_kg NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'total_cost_smu_per_kg', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS admin_smu             NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'admin_smu', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS sg_out                TEXT    GENERATED ALWAYS AS (extra_fields->>'sg_out') STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_smu_lookup ON air_shipments_smu(vendor, airlines, origin, destination)`)

    // air_shipments_ra — create if not yet synced
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS air_shipments_ra (
        id             UUID        NOT NULL DEFAULT gen_random_uuid(),
        is_locked      BOOLEAN     NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_synced_at TIMESTAMPTZ,
        extra_fields   JSONB                DEFAULT '{}',
        CONSTRAINT "air_shipments_ra_pkey" PRIMARY KEY (id)
      )
    `)
    await queryRunner.query(`
      ALTER TABLE air_shipments_ra
        ADD COLUMN IF NOT EXISTS ra_name_lower TEXT    GENERATED ALWAYS AS (LOWER(extra_fields->>'ra_name')) STORED,
        ADD COLUMN IF NOT EXISTS rate          NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'rate', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS admin         NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'admin', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS ppn           NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'ppn', ',', '')::NUMERIC
        ) STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ra_name_lower ON air_shipments_ra(ra_name_lower)`)

    // air_shipments_sg_outgoing — create if not yet synced
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS air_shipments_sg_outgoing (
        id             UUID        NOT NULL DEFAULT gen_random_uuid(),
        is_locked      BOOLEAN     NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_synced_at TIMESTAMPTZ,
        extra_fields   JSONB                DEFAULT '{}',
        CONSTRAINT "air_shipments_sg_outgoing_pkey" PRIMARY KEY (id)
      )
    `)
    await queryRunner.query(`
      ALTER TABLE air_shipments_sg_outgoing
        ADD COLUMN IF NOT EXISTS sg_outgoing_name TEXT    GENERATED ALWAYS AS (extra_fields->>'sg_outgoing_name') STORED,
        ADD COLUMN IF NOT EXISTS rate             NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'rate', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS admin            NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'admin', ',', '')::NUMERIC
        ) STORED,
        ADD COLUMN IF NOT EXISTS ppn              NUMERIC GENERATED ALWAYS AS (
          REPLACE(extra_fields->>'ppn', ',', '')::NUMERIC
        ) STORED
    `)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sg_outgoing_name ON air_shipments_sg_outgoing(sg_outgoing_name)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sg_outgoing_name`)
    await queryRunner.query(`ALTER TABLE air_shipments_sg_outgoing DROP COLUMN IF EXISTS sg_outgoing_name, DROP COLUMN IF EXISTS rate, DROP COLUMN IF EXISTS admin, DROP COLUMN IF EXISTS ppn`)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_ra_name_lower`)
    await queryRunner.query(`ALTER TABLE air_shipments_ra DROP COLUMN IF EXISTS ra_name_lower, DROP COLUMN IF EXISTS rate, DROP COLUMN IF EXISTS admin, DROP COLUMN IF EXISTS ppn`)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_smu_lookup`)
    await queryRunner.query(`ALTER TABLE air_shipments_smu DROP COLUMN IF EXISTS vendor, DROP COLUMN IF EXISTS airlines, DROP COLUMN IF EXISTS origin, DROP COLUMN IF EXISTS destination, DROP COLUMN IF EXISTS total_cost_smu_per_kg, DROP COLUMN IF EXISTS admin_smu, DROP COLUMN IF EXISTS sg_out`)

    await queryRunner.query(`DROP INDEX IF EXISTS idx_smurate_lookup`)
    await queryRunner.query(`ALTER TABLE air_shipments_smu_rate_cgk_spx DROP COLUMN IF EXISTS account, DROP COLUMN IF EXISTS airlines, DROP COLUMN IF EXISTS via, DROP COLUMN IF EXISTS dest, DROP COLUMN IF EXISTS ra_name`)
  }
}
