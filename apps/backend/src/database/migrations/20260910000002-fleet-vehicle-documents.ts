import { MigrationInterface, QueryRunner } from 'typeorm'

// Documents as rows rather than the prototype's twelve date columns (kir_exp, stnk_exp, …).
//
// Two things fall out of it. Document types become master data, so adding "Kartu Pengawasan"
// needs no migration. And a renewal becomes a new row with the old one flipped to
// is_current = FALSE, so the renewal history survives — the prototype overwrote the old date
// and lost it.
//
// The status view exists so the severity filter can be a SQL predicate. Filtering severity in
// the client is only correct once every row is loaded, which is exactly what pagination
// prevents; computing it here also guarantees the list and the CSV export in Phase 3 read the
// same numbers.
export class FleetVehicleDocuments20260910000002 implements MigrationInterface {
  name = 'FleetVehicleDocuments20260910000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fleet_vehicle_documents (
        id          UUID        NOT NULL DEFAULT gen_random_uuid(),
        vehicle_id  UUID        NOT NULL,
        doc_type_id UUID        NOT NULL,
        nomor       VARCHAR(80),
        issued_at   DATE,
        expires_at  DATE,
        is_current  BOOLEAN     NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_vehicle_documents" PRIMARY KEY (id),
        CONSTRAINT "fk_fleet_vehicle_documents_vehicle"
          FOREIGN KEY (vehicle_id)  REFERENCES fleet_vehicles(id)    ON DELETE CASCADE,
        CONSTRAINT "fk_fleet_vehicle_documents_doc_type"
          FOREIGN KEY (doc_type_id) REFERENCES fleet_master_data(id) ON DELETE RESTRICT
      )
    `)

    // At most one live row per (vehicle, document type). Superseded rows are unconstrained, so a
    // vehicle can accumulate as many past KIR certificates as it has had.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_fleet_vehicle_documents_current"
        ON fleet_vehicle_documents (vehicle_id, doc_type_id) WHERE is_current
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_documents_expiry
        ON fleet_vehicle_documents (expires_at) WHERE is_current
    `)

    // severity_rank is numeric rather than a label so MIN() yields the worst severity and
    // ORDER BY sorts correctly with no CASE at the call site. 30 is the same fallback
    // DEFAULT_WARN_DAYS carries in fleet-master-data.constants.ts; fleet-severity.ts repeats
    // this ladder in TypeScript and the two must stay in step.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW fleet_vehicle_document_status AS
      SELECT
        d.vehicle_id,
        MIN(d.expires_at - CURRENT_DATE) AS min_days_left,
        MIN(CASE
              WHEN d.expires_at < CURRENT_DATE                                 THEN 0
              WHEN d.expires_at - CURRENT_DATE <= COALESCE(m.warn_days, 30)    THEN 1
              ELSE 2
            END) AS severity_rank
      FROM fleet_vehicle_documents d
      JOIN fleet_master_data m ON m.id = d.doc_type_id
      WHERE d.is_current AND d.expires_at IS NOT NULL
      GROUP BY d.vehicle_id
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS fleet_vehicle_document_status`)
    await queryRunner.query(`DROP TABLE IF EXISTS fleet_vehicle_documents`)
  }
}
