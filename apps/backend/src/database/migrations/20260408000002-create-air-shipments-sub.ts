import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAirShipmentsSub20260408000002 implements MigrationInterface {
  name = 'CreateAirShipmentsSub20260408000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "air_shipments_sub" (
        -- System columns
        "id"                                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "to_number"                               VARCHAR(100) NOT NULL,
        "is_locked"                               BOOLEAN,
        "last_synced_at"                          TIMESTAMPTZ,
        "created_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        -- Application columns (SUB sheet, headerRow 4)
        "date"                                    TEXT,
        "vendor"                                  TEXT,
        "origin"                                  TEXT,
        "destination"                             TEXT,
        "lt_number"                               TEXT,
        "gross_weight"                            NUMERIC,
        "qty_parcel"                              INTEGER,
        "remarks"                                 TEXT,
        "slot"                                    INTEGER,
        "driver_name_pickup"                      TEXT,
        "nopol_pickup"                            TEXT,
        "vehicle_type_pickup"                     TEXT,
        "ata_origin"                              TEXT,
        "atd_origin"                              TEXT,
        "awb"                                     TEXT,
        "actual_airline_name"                     TEXT,
        "flight_no"                               TEXT,
        "stt"                                     TEXT,
        "p_panjang"                               NUMERIC,
        "l_lebar"                                 NUMERIC,
        "t_tinggi"                                NUMERIC,
        "chargeable_weight_btb_awb"               NUMERIC,
        "atd_flight"                              TEXT,
        "ata_flight"                              TEXT,
        "nopol_dooring"                           TEXT,
        "vehicle_type_dooring"                    TEXT,
        "ata_vendor_wh_destination"               TEXT,
        "link_evidence_of_arrival_wh_destination" TEXT,
        "issue"                                   TEXT,
        "remarks_mandatory"                       TEXT,
        "dooring_activity_vendor"                 TEXT,
        "arrival_status_vendor"                   TEXT,
        "eta_spx_wh_destination"                  TEXT,
        "completed_time"                          TEXT,
        "helper_time_departure"                   NUMERIC,
        "helper_ptpdtd"                           TEXT,
        CONSTRAINT "pk_air_shipments_sub" PRIMARY KEY ("id"),
        CONSTRAINT "uq_air_shipments_sub_to_number" UNIQUE ("to_number")
      );

      CREATE INDEX "idx_air_shipments_sub_to_number"   ON "air_shipments_sub" ("to_number");
      CREATE INDEX "idx_air_shipments_sub_last_synced" ON "air_shipments_sub" ("last_synced_at");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "air_shipments_sub"`);
  }
}
