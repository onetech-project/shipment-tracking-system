import { MigrationInterface, QueryRunner } from 'typeorm'

// Named sets of vendor names, used by the PnL vendor-comparison tab.
//
// The vendor is stored as raw text rather than a foreign key for the same reason route_group_routes
// stores station text: no table has the vendor name as a primary key. air_shipments_smu is a
// Google-Sheet-synced rate card whose rows are rewritten on every sync, so its ids are not stable —
// but the name itself is exactly the key v_pnl_to.vendor carries and the comparison query joins on.
//
// The name is stored with no normalisation of any kind. Trimming or case-folding here would make
// the stored value differ from v_pnl_to.vendor, and the join would quietly miss.
export class VendorGroups20260822000001 implements MigrationInterface {
  name = 'VendorGroups20260822000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vendor_groups (
        id          UUID         NOT NULL DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_vendor_groups"      PRIMARY KEY (id),
        CONSTRAINT "uq_vendor_groups_name" UNIQUE (name)
      )
    `)

    // VARCHAR(200), not 100: vendor names are free text from a spreadsheet. 200 gives an over-long
    // name a clean 400 from the DTO's MaxLength rather than a row-size error from the primary-key
    // btree at insert time.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vendor_group_vendors (
        vendor_group_id UUID         NOT NULL,
        vendor          VARCHAR(200) NOT NULL,
        CONSTRAINT "pk_vendor_group_vendors" PRIMARY KEY (vendor_group_id, vendor),
        CONSTRAINT "fk_vendor_group_vendors_group"
          FOREIGN KEY (vendor_group_id) REFERENCES vendor_groups(id) ON DELETE CASCADE
      )
    `)

    // Serves the reverse lookup only — "which groups contain this vendor", which is what the
    // overlap banner asks. The forward direction is already covered by vendor_group_id being the
    // leading column of the primary key, so an index on vendor_group_id would be dead weight.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_group_vendors_vendor
        ON vendor_group_vendors (vendor)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Child first: the FK would block the parent drop.
    await queryRunner.query(`DROP TABLE IF EXISTS vendor_group_vendors`)
    await queryRunner.query(`DROP TABLE IF EXISTS vendor_groups`)
  }
}
