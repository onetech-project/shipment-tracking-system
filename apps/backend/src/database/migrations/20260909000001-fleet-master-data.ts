import { MigrationInterface, QueryRunner } from 'typeorm'

// Generic lookup table behind every dropdown in the fleet module, keyed by `category`.
//
// One table rather than eight: all eight lists are ordered label sets with no structural
// difference between them, so eight entities/services/controllers would be boilerplate unpaid
// for by anything. Adding a ninth dropdown needs BOTH this CHECK constraint altered by a new
// migration and FLEET_MASTER_CATEGORIES extended; fleet-master-data.constants.spec.ts fails
// first if only one side moves.
//
// warn_days / default_valid_months / is_required are nullable and only meaningful for certain
// categories. A `config JSONB` column would avoid that, and was rejected: warn_days is read
// directly by the alert query's predicate in Phase 4, and (config->>'warnDays')::int is neither
// typed nor indexable.
export class FleetMasterData20260909000001 implements MigrationInterface {
  name = 'FleetMasterData20260909000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fleet_master_data (
        id                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        category             VARCHAR(40)  NOT NULL,
        code                 VARCHAR(60)  NOT NULL,
        label                VARCHAR(120) NOT NULL,
        sort_order           INT          NOT NULL DEFAULT 0,
        is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
        warn_days            INT,
        default_valid_months INT,
        is_required          BOOLEAN,
        created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_master_data"           PRIMARY KEY (id),
        CONSTRAINT "uq_fleet_master_data_cat_code"  UNIQUE (category, code),
        CONSTRAINT "ck_fleet_master_data_category"  CHECK (category IN (
          'jenis_armada','kepemilikan','leasing','status_kendaraan',
          'pool','jenis_dokumen','jenis_berkas','jenis_sim'
        ))
      )
    `)

    // Serves the only read shape the API has: "give me one category, in display order".
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_master_data_cat_sort
        ON fleet_master_data (category, sort_order)
    `)

    // Seed values carried over from the prototype's hardcoded constants. ON CONFLICT DO NOTHING
    // keeps a re-run idempotent and, more importantly, never overwrites a label an admin has
    // since edited.
    await queryRunner.query(`
      INSERT INTO fleet_master_data (category, code, label, sort_order, warn_days, default_valid_months, is_required)
      VALUES
        ('jenis_armada','pickup','Pickup',10,NULL,NULL,NULL),
        ('jenis_armada','cd_engkel','Colt Diesel Engkel',20,NULL,NULL,NULL),
        ('jenis_armada','cd_double','Colt Diesel Double',30,NULL,NULL,NULL),
        ('jenis_armada','fuso_6ban','Fuso 6 Ban',40,NULL,NULL,NULL),
        ('jenis_armada','tronton','Tronton',50,NULL,NULL,NULL),
        ('jenis_armada','wingbox','Wingbox',60,NULL,NULL,NULL),
        ('jenis_armada','trailer_20','Trailer 20ft',70,NULL,NULL,NULL),
        ('jenis_armada','trailer_40','Trailer 40ft',80,NULL,NULL,NULL),
        ('jenis_armada','dump_truck','Dump Truck',90,NULL,NULL,NULL),
        ('jenis_armada','operasional','Mobil Operasional',100,NULL,NULL,NULL),

        ('kepemilikan','milik_gms','Milik GMS',10,NULL,NULL,NULL),
        ('kepemilikan','milik_esp','Milik ESP',20,NULL,NULL,NULL),
        ('kepemilikan','sewa_lepas_kunci','Sewa Lepas Kunci',30,NULL,NULL,NULL),

        ('leasing','lunas','Lunas',10,NULL,NULL,NULL),
        ('leasing','mtf','MTF',20,NULL,NULL,NULL),
        ('leasing','mitsui','Mitsui',30,NULL,NULL,NULL),
        ('leasing','yusuf_finance','Yusuf Finance',40,NULL,NULL,NULL),
        ('leasing','tanpa_leasing','Tanpa leasing',50,NULL,NULL,NULL),

        ('status_kendaraan','aktif','Aktif',10,NULL,NULL,NULL),
        ('status_kendaraan','servis','Servis',20,NULL,NULL,NULL),
        ('status_kendaraan','nonaktif','Nonaktif',30,NULL,NULL,NULL),

        ('pool','cakung','Pool Cakung',10,NULL,NULL,NULL),
        ('pool','marunda','Pool Marunda',20,NULL,NULL,NULL),
        ('pool','bekasi','Pool Bekasi',30,NULL,NULL,NULL),

        ('jenis_dokumen','kir','KIR',10,30,6,NULL),
        ('jenis_dokumen','stnk','STNK',20,30,NULL,NULL),
        ('jenis_dokumen','pajak','Pajak Tahunan',30,30,12,NULL),
        ('jenis_dokumen','asuransi','Asuransi',40,30,NULL,NULL),
        ('jenis_dokumen','kartu_pengawasan','Kartu Pengawasan',50,30,NULL,NULL),
        ('jenis_dokumen','emisi','Uji Emisi',60,30,NULL,NULL),
        ('jenis_dokumen','servis','Servis Berkala',70,14,NULL,NULL),

        ('jenis_berkas','stnk','STNK',10,NULL,NULL,TRUE),
        ('jenis_berkas','kir','Buku Uji (KIR)',20,NULL,NULL,TRUE),
        ('jenis_berkas','bpkb','BPKB',30,NULL,NULL,TRUE),

        ('jenis_sim','b1_umum','B1 Umum',10,30,NULL,NULL),
        ('jenis_sim','b2_umum','B2 Umum',20,30,NULL,NULL),
        ('jenis_sim','a_umum','A Umum',30,30,NULL,NULL)
      ON CONFLICT (category, code) DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fleet_master_data`)
  }
}
