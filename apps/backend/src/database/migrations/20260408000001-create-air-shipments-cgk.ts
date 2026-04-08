import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAirShipmentsCgk20260408000001 implements MigrationInterface {
  name = 'CreateAirShipmentsCgk20260408000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "air_shipments_cgk" (
        -- System columns
        "id"                                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "to_number"                               VARCHAR(100) NOT NULL,
        "is_locked"                               BOOLEAN,
        "last_synced_at"                          TIMESTAMPTZ,
        "created_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        -- Application columns (CompileAirCGK sheet, headerRow 1)
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
        "helper_ptpdtd_2"                         TEXT,
        -- Helper / revenue columns (right-hand section of CGK sheet)
        "origin_station"                          TEXT,
        "destination_station"                     TEXT,
        "concat"                                  TEXT,
        "rate_spx_after_pph_disc"                 TEXT,
        "amount_revenue"                          TEXT,
        "additional_amount_packing_kayu"          TEXT,
        "concat_route"                            TEXT,
        "sla"                                     TEXT,
        "tjph"                                    TEXT,
        "max_sla"                                 TEXT,
        "max_tjph"                                TEXT,
        "remarks_sla"                             TEXT,
        "remarks_tjph"                            TEXT,
        "late_duration_sla"                       TEXT,
        "late_duration_tjph"                      TEXT,
        CONSTRAINT "pk_air_shipments_cgk" PRIMARY KEY ("id"),
        CONSTRAINT "uq_air_shipments_cgk_to_number" UNIQUE ("to_number")
      );

      CREATE INDEX "idx_air_shipments_cgk_to_number"   ON "air_shipments_cgk" ("to_number");
      CREATE INDEX "idx_air_shipments_cgk_last_synced" ON "air_shipments_cgk" ("last_synced_at");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "air_shipments_cgk"`);
  }
}
