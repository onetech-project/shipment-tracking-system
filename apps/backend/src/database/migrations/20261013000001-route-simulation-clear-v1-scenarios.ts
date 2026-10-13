import { MigrationInterface, QueryRunner } from 'typeorm'

// Scenario payload v2 drops the SMU/all-in cost basis, stores lane cost per component (SG Out,
// SG In, RA, SMU) and adds the simulation start + horizon. The frontend refuses any other version,
// and Route Simulation is not live yet, so older rows are deleted instead of converted.
export class RouteSimulationClearV1Scenarios20261013000001 implements MigrationInterface {
  name = 'RouteSimulationClearV1Scenarios20261013000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM route_simulation_scenarios
      WHERE (payload->>'version') IS DISTINCT FROM '2'
    `)
  }

  // Deleted payloads cannot be recreated.
  public async down(queryRunner: QueryRunner): Promise<void> {}
}
