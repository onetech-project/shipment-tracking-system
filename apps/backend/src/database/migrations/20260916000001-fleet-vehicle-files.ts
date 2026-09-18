import { MigrationInterface, QueryRunner } from 'typeorm'

// One row per (vehicle, slot). Replacing a file updates the row to a new storage key rather than
// inserting a second one — an operator who re-uploads a STNK means "this is the STNK now", not
// "keep both and guess".
export class FleetVehicleFiles20260916000001 implements MigrationInterface {
  name = 'FleetVehicleFiles20260916000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fleet_vehicle_files" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vehicle_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "storage_key" character varying(255),
        "original_name" character varying(255),
        "mime_type" character varying(100),
        "size_bytes" bigint,
        "external_url" text,
        "uploaded_by" uuid,
        "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_vehicle_files" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "fk_fleet_vehicle_files_vehicle"
        FOREIGN KEY ("vehicle_id") REFERENCES "fleet_vehicles"("id") ON DELETE CASCADE
    `)
    // RESTRICT, matching the lease contract's leasing_id: a jenis_berkas row still holding files
    // must not be deletable from the Master Data screen.
    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "fk_fleet_vehicle_files_slot"
        FOREIGN KEY ("slot_id") REFERENCES "fleet_master_data"("id") ON DELETE RESTRICT
    `)
    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "fk_fleet_vehicle_files_uploader"
        FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_fleet_vehicle_files_slot"
        ON "fleet_vehicle_files" ("vehicle_id", "slot_id")
    `)

    // Exactly one source. A row with both would make "where does this file live" ambiguous, and a
    // row with neither is a slot that claims to hold a file and does not.
    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "ck_fleet_vehicle_files_one_source"
        CHECK (("storage_key" IS NOT NULL) <> ("external_url" IS NOT NULL))
    `)

    // The driver's licence scan lives on the driver, not in this table: a driver has exactly one
    // such file and no indication of more (spec §4.5). Extracting it later is straightforward.
    await queryRunner.query(`
      ALTER TABLE "fleet_drivers"
        ADD COLUMN "sim_storage_key" character varying(255),
        ADD COLUMN "sim_original_name" character varying(255),
        ADD COLUMN "sim_mime_type" character varying(100),
        ADD COLUMN "sim_size_bytes" bigint
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fleet_drivers"
        DROP COLUMN "sim_storage_key",
        DROP COLUMN "sim_original_name",
        DROP COLUMN "sim_mime_type",
        DROP COLUMN "sim_size_bytes"
    `)
    await queryRunner.query(`DROP TABLE "fleet_vehicle_files"`)
  }
}
