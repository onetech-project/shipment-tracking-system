import { MigrationInterface, QueryRunner } from 'typeorm'

// Barhal (wood-packing / Koli tracking) schema: one header row per Koli, one line-item row per
// TO packed into it. sequence_no resets per (koli_date, route) — enforced by the unique
// constraint below, which also backstops concurrent Koli-number generation (see BarhalService).
// to_number is UNIQUE on the line-item table so a TO can never be packed into more than one Koli.
export class BarhalSchema20260720000002 implements MigrationInterface {
  name = 'BarhalSchema20260720000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS barhal_koli (
        id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
        koli_number          TEXT        NOT NULL,
        koli_date            DATE        NOT NULL,
        route                TEXT        NOT NULL,
        origin_code          TEXT        NOT NULL,
        dest_code            TEXT        NOT NULL,
        sequence_no          INTEGER     NOT NULL,
        weight_before        NUMERIC     NOT NULL DEFAULT 0,
        packing_kayu_weight  NUMERIC     NOT NULL DEFAULT 0,
        weight_after         NUMERIC     NOT NULL DEFAULT 0,
        length_cm            NUMERIC,
        width_cm             NUMERIC,
        height_cm            NUMERIC,
        volume               NUMERIC,
        total_to             INTEGER     NOT NULL DEFAULT 0,
        created_by           UUID        REFERENCES users(id),
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "barhal_koli_pkey" PRIMARY KEY (id),
        CONSTRAINT "uq_barhal_koli_number" UNIQUE (koli_number),
        CONSTRAINT "uq_barhal_koli_date_route_seq" UNIQUE (koli_date, route, sequence_no)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_barhal_koli_date  ON barhal_koli(koli_date)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_barhal_koli_route ON barhal_koli(route)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS barhal_koli_to (
        id                UUID        NOT NULL DEFAULT gen_random_uuid(),
        koli_id           UUID        NOT NULL REFERENCES barhal_koli(id) ON DELETE CASCADE,
        to_number         TEXT        NOT NULL,
        awb               TEXT,
        gross_weight      NUMERIC,
        smu_account       TEXT,
        smu_airlines      TEXT,
        smu_flight_date   TEXT,
        smu_flight_number TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "barhal_koli_to_pkey" PRIMARY KEY (id),
        CONSTRAINT "uq_barhal_koli_to_to_number" UNIQUE (to_number)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_barhal_koli_to_koli_id   ON barhal_koli_to(koli_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_barhal_koli_to_to_number ON barhal_koli_to(to_number)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS barhal_koli_to`)
    await queryRunner.query(`DROP TABLE IF EXISTS barhal_koli`)
  }
}
