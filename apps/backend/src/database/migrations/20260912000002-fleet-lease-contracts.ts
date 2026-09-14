import { MigrationInterface, QueryRunner } from 'typeorm'

// A separate table rather than columns on fleet_vehicles, because a unit can be refinanced: the
// prototype kept only the latest contract and lost the one before it. A new contract closes the
// old one (closed_at) instead of overwriting it, so the credit history survives.
export class FleetLeaseContracts20260912000002 implements MigrationInterface {
  name = 'FleetLeaseContracts20260912000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fleet_lease_contracts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vehicle_id" uuid NOT NULL,
        "leasing_id" uuid,
        "nomor_kontrak" character varying(60),
        "cicilan_per_bulan" numeric(14,2),
        "tenor_bulan" integer,
        "angsuran_mulai" date,
        "angsuran_terbayar_override" integer,
        "closed_at" date,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_lease_contracts" PRIMARY KEY ("id")
      )
    `)

    // CASCADE: a contract has no meaning once its vehicle row is gone. RESTRICT on leasing_id for
    // the opposite reason — a finance company still referenced by a live contract must not be
    // deletable from Master Data.
    await queryRunner.query(`
      ALTER TABLE "fleet_lease_contracts"
        ADD CONSTRAINT "fk_fleet_lease_contracts_vehicle"
        FOREIGN KEY ("vehicle_id") REFERENCES "fleet_vehicles"("id") ON DELETE CASCADE
    `)
    await queryRunner.query(`
      ALTER TABLE "fleet_lease_contracts"
        ADD CONSTRAINT "fk_fleet_lease_contracts_leasing"
        FOREIGN KEY ("leasing_id") REFERENCES "fleet_master_data"("id") ON DELETE RESTRICT
    `)

    // Partial, so closed contracts accumulate freely while only one may be open. This is what
    // lets the service say "the lease" for a vehicle without having to pick among several.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_fleet_lease_contracts_open"
        ON "fleet_lease_contracts" ("vehicle_id") WHERE "closed_at" IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fleet_lease_contracts"`)
  }
}
