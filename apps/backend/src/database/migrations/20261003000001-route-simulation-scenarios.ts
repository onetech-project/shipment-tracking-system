import { MigrationInterface, QueryRunner } from 'typeorm'

// Named scenarios for the Route Simulation page. The payload is the frontend engine's
// ScenarioPayload (accounts, capital tranches, lane/route edits, Coba-coba settings) stored as
// jsonb: the backend never reads inside it, so its shape can evolve with the engine alone. The
// payload carries its own `version` for that purpose.
//
// `revision` is an optimistic-concurrency counter. Two planners editing the same scenario would
// otherwise silently overwrite each other's capital figures; PATCH must quote the revision it
// loaded and gets a 409 when someone saved in between.
export class RouteSimulationScenarios20261003000001 implements MigrationInterface {
  name = 'RouteSimulationScenarios20261003000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS route_simulation_scenarios (
        id          UUID         NOT NULL DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        payload     JSONB        NOT NULL,
        revision    INTEGER      NOT NULL DEFAULT 1,
        updated_by  UUID,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_route_simulation_scenarios"      PRIMARY KEY (id),
        CONSTRAINT "uq_route_simulation_scenarios_name" UNIQUE (name),
        CONSTRAINT "fk_route_simulation_scenarios_user"
          FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS route_simulation_scenarios`)
  }
}
