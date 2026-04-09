import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateAirShipmentsSda20260408000003 implements MigrationInterface {
  name = 'CreateAirShipmentsSda20260408000003'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "air_shipments_sda" (
        -- System columns
        "id"                                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "to_number"                               VARCHAR(100) NOT NULL,
        "is_locked"                               BOOLEAN,
        "last_synced_at"                          TIMESTAMPTZ,
        "created_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        -- Application columns (SDA sheet, headerRow 4)
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
        CONSTRAINT "pk_air_shipments_sda" PRIMARY KEY ("id"),
        CONSTRAINT "uq_air_shipments_sda_to_number" UNIQUE ("lt_number", "to_number")
      );

      CREATE INDEX "idx_air_shipments_sda_to_number"   ON "air_shipments_sda" ("lt_number", "to_number");
      CREATE INDEX "idx_air_shipments_sda_last_synced" ON "air_shipments_sda" ("last_synced_at");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "air_shipments_sda"`)
  }
}
