import { MigrationInterface, QueryRunner } from 'typeorm'

// Named groups of origin→destination station pairs, used by the PnL group-comparison tab.
// The station pair is stored as text rather than a foreign key on purpose: no table has a
// station pair as its primary key. air_shipments_data is Google-Sheet-synced — its rows are
// DC pairs (55 Air rows collapse to 31 station pairs) and every row is rewritten on each sync,
// so its ids are not stable. The resolved station pair is the stable key, and it is exactly the
// key v_pnl_to aggregates on.
export class RouteGroups20260816000002 implements MigrationInterface {
  name = 'RouteGroups20260816000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS route_groups (
        id          UUID         NOT NULL DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_route_groups"   PRIMARY KEY (id),
        CONSTRAINT "uq_route_groups_name" UNIQUE (name)
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS route_group_routes (
        route_group_id UUID         NOT NULL,
        origin_station VARCHAR(100) NOT NULL,
        dest_station   VARCHAR(100) NOT NULL,
        CONSTRAINT "pk_route_group_routes"
          PRIMARY KEY (route_group_id, origin_station, dest_station),
        CONSTRAINT "fk_route_group_routes_group"
          FOREIGN KEY (route_group_id) REFERENCES route_groups(id) ON DELETE CASCADE
      )
    `)

    // Serves the join direction used by the comparison query: v_pnl_to → route_group_routes.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_route_group_routes_station
        ON route_group_routes (origin_station, dest_station)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS route_group_routes`)
    await queryRunner.query(`DROP TABLE IF EXISTS route_groups`)
  }
}
