import { MigrationInterface, QueryRunner } from 'typeorm'

// The vehicle register itself.
//
// The partial unique index on nopol is the point of interest. `is_active` is the *registration*
// status, not the operational one: a unit parked waiting for its KIR renewal has
// status_id -> "Nonaktif" but is still is_active = TRUE and still holds its plate. Only an
// archived unit — sold, or handed back at the end of a rental — releases the plate for another
// vehicle to take. Modelling both as one column would mean a parked unit's plate could be
// reused underneath it.
//
// Master-data FKs are RESTRICT, matching the 409 FleetMasterDataService.remove already raises.
// driver_id is SET NULL instead: a driver leaving the company should not block archiving, and a
// vehicle with no driver is a legitimate state the form already allows.
export class FleetVehicles20260910000001 implements MigrationInterface {
  name = 'FleetVehicles20260910000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fleet_vehicles (
        id              UUID         NOT NULL DEFAULT gen_random_uuid(),
        nopol           VARCHAR(20)  NOT NULL,
        merk            VARCHAR(60),
        tipe            VARCHAR(60),
        tahun           INT,
        kapasitas       VARCHAR(60),
        no_rangka       VARCHAR(60),
        no_mesin        VARCHAR(60),
        no_bpkb         VARCHAR(60),
        pemilik_unit    VARCHAR(120),
        odometer        INT,
        catatan         TEXT,
        jenis_armada_id UUID,
        kepemilikan_id  UUID,
        pool_id         UUID,
        status_id       UUID,
        driver_id       UUID,
        is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_vehicles" PRIMARY KEY (id),
        CONSTRAINT "fk_fleet_vehicles_jenis_armada"
          FOREIGN KEY (jenis_armada_id) REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_kepemilikan"
          FOREIGN KEY (kepemilikan_id)  REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_pool"
          FOREIGN KEY (pool_id)         REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_status"
          FOREIGN KEY (status_id)       REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_driver"
          FOREIGN KEY (driver_id)       REFERENCES fleet_drivers(id)     ON DELETE SET NULL
      )
    `)

    // Follows uq_invitations_org_email_pending: the constraint only binds rows that are still
    // live, so an archived unit's plate stops colliding the moment it is archived.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_fleet_vehicles_nopol_active"
        ON fleet_vehicles (nopol) WHERE is_active
    `)

    // The default list: active units ordered by plate.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_active_nopol
        ON fleet_vehicles (is_active, nopol)
    `)

    // Serves the driver-archive probe in FleetDriversService.remove, which asks whether any
    // vehicle still points at a driver.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_driver
        ON fleet_vehicles (driver_id) WHERE driver_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fleet_vehicles`)
  }
}
