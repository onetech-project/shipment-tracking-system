import { MigrationInterface, QueryRunner } from 'typeorm'

// Drivers as their own entity rather than a text column on the vehicle.
//
// A driving licence belongs to a person. The prototype stored the driver's name and licence
// expiry on the vehicle, so one driver holding two units meant the licence was typed twice and
// could disagree, and a driver moving between units left stale licence data on the old one.
//
// sim_jenis_id is RESTRICT rather than SET NULL: the licence class is not decoration, and a
// master row that drivers reference should be deactivated, not deleted — which is exactly what
// FleetMasterDataService.remove already enforces.
export class FleetDrivers20260909000002 implements MigrationInterface {
  name = 'FleetDrivers20260909000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fleet_drivers (
        id             UUID         NOT NULL DEFAULT gen_random_uuid(),
        nama           VARCHAR(120) NOT NULL,
        telepon        VARCHAR(30),
        sim_nomor      VARCHAR(40),
        sim_jenis_id   UUID,
        sim_expires_at DATE,
        is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_drivers" PRIMARY KEY (id),
        CONSTRAINT "fk_fleet_drivers_sim_jenis"
          FOREIGN KEY (sim_jenis_id) REFERENCES fleet_master_data(id) ON DELETE RESTRICT
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_drivers_active_nama
        ON fleet_drivers (is_active, nama)
    `)

    // Serves the Phase 4 alert query, which asks for licences expiring soon among active drivers
    // only. Partial so archived drivers cost nothing.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_drivers_sim_expiry
        ON fleet_drivers (sim_expires_at) WHERE is_active
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fleet_drivers`)
  }
}
