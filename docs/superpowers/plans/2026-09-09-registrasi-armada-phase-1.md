# Registrasi Armada Phase 1 — Master Data & Sopir

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun master data dropdown (8 kategori) dan data sopir sebagai fondasi modul Registrasi Armada, lengkap dengan entri sidebar dan sub-nav yang akan dipakai Phase 2-4.

**Architecture:** Dua modul NestJS (`fleet-master-data`, `fleet-drivers`) mengikuti pola `vendor-groups` persis — entity TypeORM, service dengan repository injection, controller ber-`@Authorize`, DTO `class-validator`. Frontend: satu feature `fleet/` dengan React Query hooks, satu entri sidebar `/fleet` yang membuka `layout.tsx` berisi sub-nav (pola `air-shipments`).

**Tech Stack:** NestJS 10 · TypeORM · PostgreSQL 16 · Next.js App Router · React Query v5 · Tailwind · jest + ts-jest (backend) · jest + Testing Library (frontend)

**Spec:** `docs/superpowers/specs/2026-09-09-registrasi-armada-design.md` §2.1, §2.2, §2.3, §2.6, §2.8, §3.1, §3.2, §5, §6, §7, §9

## Global Constraints

- **Bahasa kode & komentar: Inggris.** Seluruh repo berbahasa Inggris; hanya label UI yang tampil ke operator berbahasa Indonesia. Ikuti itu — jangan menulis komentar berbahasa Indonesia.
- **Komentar menjelaskan *kenapa*, bukan *apa*.** Repo ini konsisten begitu (lihat `vendor-groups.service.ts`). Komentar yang hanya mengulang kode akan ditolak saat review.
- **Gaya kode: ikuti file tetangga, bukan aturan global.** Repo ini tidak punya konfigurasi Prettier sama sekali, dan gayanya campur per area: modul backend baru (`vendor-groups`) dan seluruh `apps/frontend/src/features/**` ditulis **tanpa semicolon**; komponen lama di `apps/frontend/src/components/**` (termasuk `data-table.tsx`, `form-field.tsx`) **memakai semicolon**. Semua contoh kode di plan ini sudah mengikuti aturan itu — salin apa adanya. Jalankan `pnpm lint` sebelum commit.
- **Perintah test backend WAJIB:** `cd apps/backend && pnpm test -- --runInBand <pattern>` untuk run terfokus. Untuk suite penuh: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`. Tanpa flag ini box kehabisan RAM dan suite mati tanpa satu test pun gagal.
- **Perintah test frontend:** `cd apps/frontend && pnpm test <pattern>` — tanpa flag tambahan.
- **Migration:** `migrationsTransactionMode: 'all'`, jadi **jangan** pakai `CREATE INDEX CONCURRENTLY` (TypeORM menolaknya dengan `ForbiddenTransactionModeOverrideError` dan memblokir seluruh migration pending).
- **Entity auto-load:** `autoLoadEntities: true` di `app.module.ts` — entity terdaftar lewat `TypeOrmModule.forFeature` di module, tidak perlu didaftarkan manual.
- **Permission auto-seed:** cukup tambahkan ke enum `Permission` di `packages/shared/src/auth/index.ts`; `PermissionsService.onApplicationBootstrap` menyeed ke DB otomatis. Nama wajib berbentuk `<read|create|update|delete>.<module>` — dijaga CHECK constraint.
- **Setelah mengubah `packages/shared`:** jalankan `pnpm --filter @esp/shared build` (atau `pnpm -r run build`) sebelum backend/frontend bisa meng-import perubahannya.

---

## File Structure

**Backend — modul baru**
```
apps/backend/src/modules/fleet-master-data/
  entities/fleet-master-data.entity.ts     tabel fleet_master_data
  dto/create-fleet-master-data.dto.ts      validasi create
  dto/update-fleet-master-data.dto.ts      validasi update (semua opsional)
  dto/query-fleet-master-data.dto.ts       query param ?category=&includeInactive=
  fleet-master-data.constants.ts           daftar kategori + tipe kategori
  fleet-master-data.service.ts             CRUD + guard hapus-sedang-dipakai
  fleet-master-data.controller.ts          REST + @Authorize
  fleet-master-data.module.ts

apps/backend/src/modules/fleet-drivers/
  entities/fleet-driver.entity.ts          tabel fleet_drivers
  dto/create-fleet-driver.dto.ts
  dto/update-fleet-driver.dto.ts
  fleet-drivers.service.ts
  fleet-drivers.controller.ts
  fleet-drivers.module.ts
```

**Backend — dimodifikasi**
```
apps/backend/src/database/migrations/20260909000001-fleet-master-data.ts   (baru)
apps/backend/src/database/migrations/20260909000002-fleet-drivers.ts       (baru)
apps/backend/src/app.module.ts                     daftarkan 2 module
packages/shared/src/auth/index.ts                  8 permission baru
```

**Frontend — baru**
```
apps/frontend/src/features/fleet/
  types.ts                                  tipe domain + kategori
  hooks/useFleetMasterData.ts               query + 3 mutation
  hooks/useFleetDrivers.ts                  query + 3 mutation
  components/MasterDataFormDialog.tsx       form create/edit master data
  components/DriverFormDialog.tsx           form create/edit sopir

apps/frontend/src/app/(dashboard)/fleet/layout.tsx        sub-nav
apps/frontend/src/app/(dashboard)/fleet/page.tsx          redirect → /fleet/drivers
apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx
apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx
```

**Frontend — dimodifikasi**
```
apps/frontend/src/components/layout/sidebar.tsx    entri "Registrasi Armada"
```

Kenapa dipecah begini: hanya form yang jadi komponen sendiri — dipakai untuk create *dan* edit,
dan punya state serta penanganan error sendiri. Tabelnya tidak: `DataTable` yang sudah ada di
`components/shared/` menerima definisi kolom sebagai prop, jadi membungkusnya lagi cuma menambah
lapisan tanpa isi. Hooks dipisah per entitas karena query key-nya beda dan invalidasinya
independen.

---

## Task 1: Migration & entity `fleet_master_data`

Membuat tabel master data generik beserta seed 8 kategori.

**Files:**
- Create: `apps/backend/src/database/migrations/20260909000001-fleet-master-data.ts`
- Create: `apps/backend/src/modules/fleet-master-data/entities/fleet-master-data.entity.ts`
- Create: `apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.ts`

**Interfaces:**
- Produces: `FleetMasterDataEntity` (kolom: `id`, `category`, `code`, `label`, `sortOrder`, `isActive`, `warnDays`, `defaultValidMonths`, `isRequired`, `createdAt`, `updatedAt`); `FLEET_MASTER_CATEGORIES` (readonly tuple 8 string); tipe `FleetMasterCategory`.
- Consumes: —

- [ ] **Step 1: Tulis file konstanta kategori**

`apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.ts`:

```ts
// The eight dropdowns the fleet module drives. Kept as one list so the DTO's @IsIn, the
// controller's query validation and the seed migration cannot drift apart.
export const FLEET_MASTER_CATEGORIES = [
  'jenis_armada',
  'kepemilikan',
  'leasing',
  'status_kendaraan',
  'pool',
  'jenis_dokumen',
  'jenis_berkas',
  'jenis_sim',
] as const

export type FleetMasterCategory = (typeof FLEET_MASTER_CATEGORIES)[number]

// warn_days is meaningful for the two categories that carry an expiry date; the rest leave it null.
export const CATEGORIES_WITH_WARN_DAYS: readonly FleetMasterCategory[] = [
  'jenis_dokumen',
  'jenis_sim',
]

export const DEFAULT_WARN_DAYS = 30
```

- [ ] **Step 2: Tulis migration**

`apps/backend/src/database/migrations/20260909000001-fleet-master-data.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// Generic lookup table behind every dropdown in the fleet module, keyed by `category`.
//
// One table rather than eight: all eight lists are ordered label sets with no structural
// difference between them, so eight entities/services/controllers would be boilerplate unpaid
// for by anything. Adding a ninth dropdown later needs no migration at all.
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
```

- [ ] **Step 3: Tulis entity**

`apps/backend/src/modules/fleet-master-data/entities/fleet-master-data.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterCategory } from '../fleet-master-data.constants'

@Entity('fleet_master_data')
@Unique('uq_fleet_master_data_cat_code', ['category', 'code'])
@Index('idx_fleet_master_data_cat_sort', ['category', 'sortOrder'])
export class FleetMasterDataEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // Explicit `type` because the property is a string-union: reflect-metadata cannot infer a
  // column type from it on its own.
  @Column({ type: 'varchar', length: 40 })
  category: FleetMasterCategory

  @Column({ length: 60 })
  code: string

  @Column({ length: 120 })
  label: string

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean

  @Column({ name: 'warn_days', type: 'int', nullable: true })
  warnDays: number | null

  @Column({ name: 'default_valid_months', type: 'int', nullable: true })
  defaultValidMonths: number | null

  @Column({ name: 'is_required', type: 'boolean', nullable: true })
  isRequired: boolean | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 4: Jalankan migration, verifikasi tabel & seed**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm migration:run
```

Expected: log TypeORM menampilkan `FleetMasterData20260909000001` berhasil.

Verifikasi isi seed. `DATABASE_URL` ada di `apps/backend/.env`, bukan di environment shell, jadi ambil dari sana:
```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" \
  -c "SELECT category, count(*) FROM fleet_master_data GROUP BY category ORDER BY category"
```
Expected 8 baris: `jenis_armada` 10, `jenis_berkas` 3, `jenis_dokumen` 7, `jenis_sim` 3, `kepemilikan` 3, `leasing` 5, `pool` 3, `status_kendaraan` 3.

- [ ] **Step 5: Verifikasi `down()` bersih, lalu ulangi `up`**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm migration:revert && pnpm migration:run
```
Expected: keduanya sukses tanpa error. Ini membuktikan migration bisa diputar ulang.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/database/migrations/20260909000001-fleet-master-data.ts \
        apps/backend/src/modules/fleet-master-data/
git commit -m "feat(fleet): add fleet_master_data table and entity

Generic lookup table behind all eight fleet dropdowns, keyed by category.
Seeded from the prototype's hardcoded constants.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Service `fleet-master-data` (TDD)

CRUD dengan satu aturan domain: baris yang sedang dipakai tidak boleh dihapus.

**Files:**
- Create: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts`
- Test: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`

**Interfaces:**
- Consumes: `FleetMasterDataEntity`, `FLEET_MASTER_CATEGORIES`, `FleetMasterCategory` (Task 1)
- Produces: `FleetMasterDataService` dengan
  `findAll(category?: FleetMasterCategory, includeInactive?: boolean): Promise<FleetMasterDataEntity[]>`,
  `create(dto: CreateFleetMasterDataDto): Promise<FleetMasterDataEntity>`,
  `update(id: string, dto: UpdateFleetMasterDataDto): Promise<FleetMasterDataEntity>`,
  `remove(id: string): Promise<void>`.
  Konstanta modul `REFERENCING_COLUMNS: { table: string; column: string }[]` — private ke file service, kosong di Phase 1, dan satu-satunya tempat Phase 2/3 mendaftarkan kolom baru yang menunjuk ke tabel ini.

**Catatan penting untuk implementer:** DTO-nya dibuat di Task 3. Di task ini cukup deklarasikan
interface minimal di file service supaya test bisa jalan; Task 3 menggantinya dengan import DTO
sungguhan. Ini disengaja: service diuji lebih dulu, validasi menyusul.

- [ ] **Step 1: Tulis test yang gagal**

`apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FleetMasterDataService } from './fleet-master-data.service'
import { FleetMasterDataEntity } from './entities/fleet-master-data.entity'

describe('FleetMasterDataService', () => {
  let service: FleetMasterDataService
  let repo: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
  let dataSource: { query: jest.Mock }

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
    }
    dataSource = { query: jest.fn(async () => [{ count: '0' }]) }

    const module = await Test.createTestingModule({
      providers: [
        FleetMasterDataService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(FleetMasterDataEntity), useValue: repo },
      ],
    }).compile()
    service = module.get(FleetMasterDataService)
  })

  describe('findAll', () => {
    it('filters by category and hides inactive rows by default', async () => {
      repo.find.mockResolvedValue([])
      await service.findAll('leasing')
      expect(repo.find).toHaveBeenCalledWith({
        where: { category: 'leasing', isActive: true },
        order: { sortOrder: 'ASC', label: 'ASC' },
      })
    })

    it('includes inactive rows when asked', async () => {
      repo.find.mockResolvedValue([])
      await service.findAll('leasing', true)
      expect(repo.find).toHaveBeenCalledWith({
        where: { category: 'leasing' },
        order: { sortOrder: 'ASC', label: 'ASC' },
      })
    })

    it('returns every category when none is given', async () => {
      repo.find.mockResolvedValue([])
      await service.findAll()
      expect(repo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { sortOrder: 'ASC', label: 'ASC' },
      })
    })
  })

  describe('create', () => {
    it('rejects a code already used in the same category', async () => {
      repo.findOne.mockResolvedValue({ id: 'existing' })
      await expect(
        service.create({ category: 'leasing', code: 'mtf', label: 'MTF' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })

    // The unique constraint is (category, code) — the same code under a different category is
    // a different row and must be allowed.
    it('allows the same code under a different category', async () => {
      repo.findOne.mockResolvedValue(null)
      const row = await service.create({ category: 'jenis_berkas', code: 'kir', label: 'Buku Uji' })
      expect(row).toMatchObject({ category: 'jenis_berkas', code: 'kir' })
    })

    it('reshapes a racing unique violation into a ConflictException', async () => {
      repo.findOne.mockResolvedValue(null)
      repo.save.mockRejectedValue({ code: '23505', constraint: 'uq_fleet_master_data_cat_code' })
      await expect(
        service.create({ category: 'leasing', code: 'mtf', label: 'MTF' }),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('update', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.update('missing', { label: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    // Category is the row's identity as far as the unique constraint goes; letting it move would
    // silently relabel a dropdown entry that vehicles already point at.
    it('ignores an attempt to change category', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'r1', category: 'leasing', code: 'mtf' })
      repo.findOne.mockResolvedValueOnce({ id: 'r1', category: 'leasing', code: 'mtf', label: 'X' })
      await service.update('r1', { label: 'X', category: 'pool' } as never)
      expect(repo.update).toHaveBeenCalledWith('r1', { label: 'X' })
    })

    it('deactivating is always allowed even when the row is in use', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'r1', category: 'leasing', code: 'mtf' })
      repo.findOne.mockResolvedValueOnce({ id: 'r1', isActive: false })
      dataSource.query.mockResolvedValue([{ count: '7' }])
      await expect(service.update('r1', { isActive: false })).resolves.toBeDefined()
    })
  })

  describe('remove', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('deletes a row nothing references', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'leasing', label: 'MTF' })
      dataSource.query.mockResolvedValue([{ count: '0' }])
      await service.remove('r1')
      expect(repo.delete).toHaveBeenCalledWith('r1')
    })

    // The 409 carries the count so the admin knows the size of what they would have broken,
    // and is told to deactivate instead.
    it('refuses to delete a row in use and reports how many reference it', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'leasing', label: 'MTF' })
      dataSource.query.mockResolvedValue([{ count: '3' }])
      await expect(service.remove('r1')).rejects.toThrow(/3/)
      expect(repo.delete).not.toHaveBeenCalled()
    })

    // Phase 1 has no referencing tables yet. The usage probe must therefore be a no-op that
    // reports zero, not a query against fleet_vehicles — which does not exist until Phase 2.
    it('reports zero usage without querying the database at all', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'leasing', label: 'MTF' })
      await service.remove('r1')
      expect(dataSource.query).not.toHaveBeenCalled()
      expect(repo.delete).toHaveBeenCalledWith('r1')
    })
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm test -- --runInBand fleet-master-data.service
```
Expected: FAIL — `Cannot find module './fleet-master-data.service'`.

- [ ] **Step 3: Implementasi service**

`apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, FindOptionsWhere, Repository } from 'typeorm'
import { FleetMasterDataEntity } from './entities/fleet-master-data.entity'
import { FleetMasterCategory } from './fleet-master-data.constants'

const UNIQUE_VIOLATION = '23505'
const CAT_CODE_UNIQUE_CONSTRAINT = 'uq_fleet_master_data_cat_code'

// Every column that points at fleet_master_data.id, so `remove` can tell an admin what they are
// about to break. Phase 1 ships this empty: fleet_vehicles does not exist yet, and probing a
// missing table would turn every delete into a 500. Phase 2 and 3 append their columns here —
// that is the single place a new reference has to be registered.
const REFERENCING_COLUMNS: { table: string; column: string }[] = []

interface CreateInput {
  category: FleetMasterCategory
  code: string
  label: string
  sortOrder?: number
  warnDays?: number | null
  defaultValidMonths?: number | null
  isRequired?: boolean | null
}

interface UpdateInput {
  label?: string
  sortOrder?: number
  isActive?: boolean
  warnDays?: number | null
  defaultValidMonths?: number | null
  isRequired?: boolean | null
}

@Injectable()
export class FleetMasterDataService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FleetMasterDataEntity)
    private readonly repo: Repository<FleetMasterDataEntity>,
  ) {}

  // Ordered by sort_order then label so an admin who leaves every sort_order at 0 still gets a
  // stable alphabetical list rather than insertion order.
  async findAll(
    category?: FleetMasterCategory,
    includeInactive = false,
  ): Promise<FleetMasterDataEntity[]> {
    const where: FindOptionsWhere<FleetMasterDataEntity> = {}
    if (category) where.category = category
    if (!includeInactive) where.isActive = true
    return this.repo.find({ where, order: { sortOrder: 'ASC', label: 'ASC' } })
  }

  async create(dto: CreateInput): Promise<FleetMasterDataEntity> {
    await this.assertCodeFree(dto.category, dto.code)
    try {
      return await this.repo.save(this.repo.create(dto as Partial<FleetMasterDataEntity>))
    } catch (err: unknown) {
      this.throwIfCodeUniqueViolation(err, dto.category, dto.code)
      throw err
    }
  }

  // `category` and `code` are deliberately not updatable. Both are the row's identity: vehicles
  // reference the row by id, but the seed migration and any future code path find it by
  // (category, code). Letting either move would relabel a dropdown entry out from under them.
  async update(id: string, dto: UpdateInput): Promise<FleetMasterDataEntity> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Master data row not found')

    const patch: UpdateInput = {}
    if (dto.label !== undefined) patch.label = dto.label
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder
    if (dto.isActive !== undefined) patch.isActive = dto.isActive
    if (dto.warnDays !== undefined) patch.warnDays = dto.warnDays
    if (dto.defaultValidMonths !== undefined) patch.defaultValidMonths = dto.defaultValidMonths
    if (dto.isRequired !== undefined) patch.isRequired = dto.isRequired

    if (Object.keys(patch).length > 0) await this.repo.update(id, patch)

    const updated = await this.repo.findOne({ where: { id } })
    if (!updated) throw new NotFoundException('Master data row not found')
    return updated
  }

  // Deleting a row a vehicle points at would either violate the FK or, worse, leave the vehicle
  // showing a blank dropdown. Deactivating is the answer and is always allowed, so the message
  // says so — the admin's actual goal is almost always "stop offering this", not "erase it".
  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Master data row not found')

    const usage = await this.countUsage(id)
    if (usage > 0) {
      throw new ConflictException(
        `"${existing.label}" is still used by ${usage} record(s). Deactivate it instead of deleting.`,
      )
    }
    await this.repo.delete(id)
  }

  private async countUsage(id: string): Promise<number> {
    if (REFERENCING_COLUMNS.length === 0) return 0

    const unions = REFERENCING_COLUMNS.map(
      (r) => `SELECT count(*) AS c FROM ${r.table} WHERE ${r.column} = $1`,
    ).join(' UNION ALL ')
    const rows = (await this.dataSource.query(
      `SELECT COALESCE(SUM(c), 0) AS count FROM (${unions}) t`,
      [id],
    )) as { count: string }[]
    return Number(rows[0]?.count ?? 0)
  }

  private async assertCodeFree(category: FleetMasterCategory, code: string): Promise<void> {
    const clash = await this.repo.findOne({ where: { category, code } })
    if (clash) {
      throw new ConflictException(`Code "${code}" already exists under category "${category}"`)
    }
  }

  // assertCodeFree is a check-then-act and still races two concurrent creates. Catching the
  // loser's constraint violation here makes both paths look identical to the caller instead of
  // surfacing a raw 500.
  private throwIfCodeUniqueViolation(err: unknown, category: FleetMasterCategory, code: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === CAT_CODE_UNIQUE_CONSTRAINT) {
      throw new ConflictException(`Code "${code}" already exists under category "${category}"`)
    }
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm test -- --runInBand fleet-master-data.service
```
Expected: PASS, 13 test.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/fleet-master-data/
git commit -m "feat(fleet): add FleetMasterDataService with in-use delete guard

Deleting a row a vehicle points at would leave that vehicle showing a
blank dropdown, so remove() refuses with the reference count and points
at deactivation instead. REFERENCING_COLUMNS ships empty — fleet_vehicles
does not exist until Phase 2, and probing a missing table would turn
every delete into a 500.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: DTO & controller `fleet-master-data`

**Files:**
- Create: `apps/backend/src/modules/fleet-master-data/dto/create-fleet-master-data.dto.ts`
- Create: `apps/backend/src/modules/fleet-master-data/dto/update-fleet-master-data.dto.ts`
- Create: `apps/backend/src/modules/fleet-master-data/dto/query-fleet-master-data.dto.ts`
- Create: `apps/backend/src/modules/fleet-master-data/fleet-master-data.controller.ts`
- Create: `apps/backend/src/modules/fleet-master-data/fleet-master-data.module.ts`
- Test: `apps/backend/src/modules/fleet-master-data/dto/create-fleet-master-data.dto.spec.ts`
- Modify: `packages/shared/src/auth/index.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `FleetMasterDataService` (Task 2), `FLEET_MASTER_CATEGORIES` (Task 1)
- Produces: `CreateFleetMasterDataDto`, `UpdateFleetMasterDataDto`, `QueryFleetMasterDataDto`, `FleetMasterDataModule`; permission `read|create|update|delete.fleet_master_data` dan `read|create|update|delete.fleet_vehicle` di enum `Permission`.

- [ ] **Step 1: Tambah 8 permission ke shared enum**

Di `packages/shared/src/auth/index.ts`, tambahkan sebelum penutup enum `Permission`:

```ts
  // Fleet registry (Registrasi Armada). Vehicles, drivers, documents, files and lease contracts
  // all sit behind the vehicle permissions; only the lookup lists are separate, so a field
  // operator can register a vehicle without being able to edit the leasing or pool list.
  READ_FLEET_VEHICLE = 'read.fleet_vehicle',
  CREATE_FLEET_VEHICLE = 'create.fleet_vehicle',
  UPDATE_FLEET_VEHICLE = 'update.fleet_vehicle',
  DELETE_FLEET_VEHICLE = 'delete.fleet_vehicle',

  READ_FLEET_MASTER_DATA = 'read.fleet_master_data',
  CREATE_FLEET_MASTER_DATA = 'create.fleet_master_data',
  UPDATE_FLEET_MASTER_DATA = 'update.fleet_master_data',
  DELETE_FLEET_MASTER_DATA = 'delete.fleet_master_data',
```

**Tidak ada langkah build.** `packages/shared` di-`main`-kan langsung ke `src/index.ts` dan dikonsumsi dari source: backend lewat `tsconfig.json` `paths` (`@shared/*` → `../../packages/shared/src/*`) dan lewat `moduleNameMapper` jest. Paket itu bahkan tidak punya script `build`. Perubahan enum langsung terbaca begitu file disimpan.

Verifikasi enum terbaca (backend tidak punya script `type-check`; `shared` punya):
```bash
cd /home/faris/code/esp/esp-dashboard && pnpm --filter shared type-check && pnpm --filter backend build
```

- [ ] **Step 2: Tulis test DTO yang gagal**

`apps/backend/src/modules/fleet-master-data/dto/create-fleet-master-data.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateFleetMasterDataDto } from './create-fleet-master-data.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(CreateFleetMasterDataDto, {
    category: 'leasing',
    code: 'bca_finance',
    label: 'BCA Finance',
    ...overrides,
  })

describe('CreateFleetMasterDataDto', () => {
  it('accepts a well-formed row', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('rejects a category outside the known eight', async () => {
    const errors = await validate(build({ category: 'warna_favorit' }))
    expect(errors.map((e) => e.property)).toContain('category')
  })

  // The code is a slug the seed migration and future code paths look rows up by, so it is held
  // to a strict shape rather than accepting whatever an admin types.
  it('rejects a code with spaces or uppercase', async () => {
    expect(await validate(build({ code: 'BCA Finance' }))).not.toHaveLength(0)
  })

  it('accepts a code with underscores and digits', async () => {
    expect(await validate(build({ code: 'bca_finance_2' }))).toHaveLength(0)
  })

  it('rejects an empty label', async () => {
    expect(await validate(build({ label: '' }))).not.toHaveLength(0)
  })

  it('rejects a negative warnDays', async () => {
    expect(await validate(build({ warnDays: -1 }))).not.toHaveLength(0)
  })

  it('accepts warnDays of zero — same-day expiry warning is legitimate', async () => {
    expect(await validate(build({ warnDays: 0 }))).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm test -- --runInBand create-fleet-master-data.dto
```
Expected: FAIL — module tidak ditemukan.

- [ ] **Step 4: Tulis ketiga DTO**

`dto/create-fleet-master-data.dto.ts`:

```ts
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { FLEET_MASTER_CATEGORIES, FleetMasterCategory } from '../fleet-master-data.constants'

export class CreateFleetMasterDataDto {
  @IsIn(FLEET_MASTER_CATEGORIES as unknown as string[])
  category: FleetMasterCategory

  // Lowercase slug, not free text: this is the stable key the seed migration and any future code
  // path find a row by, while `label` is the part an admin is free to reword.
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'code must contain only lowercase letters, digits and underscores',
  })
  code: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  // 0 is valid and means "warn on the expiry date itself". Capped at 365 so a typo cannot make
  // every document permanently amber.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  warnDays?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  defaultValidMonths?: number | null

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean | null
}
```

`dto/update-fleet-master-data.dto.ts`:

```ts
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

// No `category` and no `code`: both are the row's identity (see FleetMasterDataService.update).
// main.ts runs ValidationPipe with forbidNonWhitelisted: true, so a client that sends either gets
// a 400 naming the property — the row cannot be moved between categories even by accident.
export class UpdateFleetMasterDataDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  warnDays?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  defaultValidMonths?: number | null

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean | null
}
```

`dto/query-fleet-master-data.dto.ts`:

```ts
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional } from 'class-validator'
import { FLEET_MASTER_CATEGORIES, FleetMasterCategory } from '../fleet-master-data.constants'

export class QueryFleetMasterDataDto {
  @IsOptional()
  @IsIn(FLEET_MASTER_CATEGORIES as unknown as string[])
  category?: FleetMasterCategory

  // Query strings arrive as text; without this transform `?includeInactive=false` would be the
  // truthy string 'false'.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean
}
```

- [ ] **Step 5: Jalankan test DTO, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm test -- --runInBand create-fleet-master-data.dto
```
Expected: PASS, 7 test.

- [ ] **Step 6: Tulis controller & module**

`fleet-master-data.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetMasterDataService } from './fleet-master-data.service'
import { CreateFleetMasterDataDto } from './dto/create-fleet-master-data.dto'
import { UpdateFleetMasterDataDto } from './dto/update-fleet-master-data.dto'
import { QueryFleetMasterDataDto } from './dto/query-fleet-master-data.dto'

@ApiTags('Fleet Master Data')
@Controller('fleet/master-data')
@UseGuards(JwtAuthGuard)
export class FleetMasterDataController {
  constructor(private readonly service: FleetMasterDataService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_MASTER_DATA)
  findAll(@Query() query: QueryFleetMasterDataDto) {
    return this.service.findAll(query.category, query.includeInactive)
  }

  @Post()
  @Authorize(Permission.CREATE_FLEET_MASTER_DATA)
  create(@Body() dto: CreateFleetMasterDataDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_FLEET_MASTER_DATA)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFleetMasterDataDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_FLEET_MASTER_DATA)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
```

`fleet-master-data.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetMasterDataEntity } from './entities/fleet-master-data.entity'
import { FleetMasterDataService } from './fleet-master-data.service'
import { FleetMasterDataController } from './fleet-master-data.controller'

@Module({
  imports: [TypeOrmModule.forFeature([FleetMasterDataEntity])],
  providers: [FleetMasterDataService],
  controllers: [FleetMasterDataController],
  // Exported for the vehicles module in Phase 2, which validates that a submitted
  // jenis_armada_id / kepemilikan_id / pool_id belongs to the right category.
  exports: [FleetMasterDataService],
})
export class FleetMasterDataModule {}
```

- [ ] **Step 7: Daftarkan module di `app.module.ts`**

Tambahkan import di dekat baris 31 (setelah `VendorGroupsModule`):
```ts
import { FleetMasterDataModule } from './modules/fleet-master-data/fleet-master-data.module'
```
Dan tambahkan `FleetMasterDataModule,` ke array `imports` setelah `VendorGroupsModule,` (sekitar baris 102).

- [ ] **Step 8: Verifikasi backend menyala & endpoint hidup**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm dev:backend
```
Expected: boot tanpa error; log Nest memetakan route `/fleet/master-data`.

Di terminal lain — ganti `$TOKEN` dengan JWT yang valid:
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:4000/api/fleet/master-data?category=leasing' | head -c 400
```
Expected: array JSON 5 baris leasing, terurut `sort_order`.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/fleet-master-data/ apps/backend/src/app.module.ts packages/shared/src/auth/index.ts
git commit -m "feat(fleet): expose fleet master data REST API

Adds the eight fleet permissions to the shared enum (auto-seeded on
bootstrap) and wires the module into app.module.

category and code are absent from the update DTO on purpose: both are the
row's identity, and the global whitelist pipe strips them rather than
letting a row move between categories.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Modul `fleet-drivers` (migration + service TDD + API)

**Files:**
- Create: `apps/backend/src/database/migrations/20260909000002-fleet-drivers.ts`
- Create: `apps/backend/src/modules/fleet-drivers/entities/fleet-driver.entity.ts`
- Create: `apps/backend/src/modules/fleet-drivers/dto/create-fleet-driver.dto.ts`
- Create: `apps/backend/src/modules/fleet-drivers/dto/update-fleet-driver.dto.ts`
- Create: `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.ts`
- Create: `apps/backend/src/modules/fleet-drivers/fleet-drivers.controller.ts`
- Create: `apps/backend/src/modules/fleet-drivers/fleet-drivers.module.ts`
- Test: `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.spec.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `FleetMasterDataEntity` (Task 1) lewat FK `sim_jenis_id`; permission `READ|CREATE|UPDATE|DELETE_FLEET_VEHICLE` (Task 3)
- Produces: `FleetDriverEntity` (`id`, `nama`, `telepon`, `simNomor`, `simJenisId`, `simExpiresAt`, `isActive`, timestamps); `FleetDriversService` dengan `findAll(q?: string, includeInactive?: boolean)`, `create`, `update`, `remove`; `FleetDriversModule`.

Kolom softcopy SIM (`sim_storage_key` dkk, spec §4.5) **tidak** dibuat di sini — itu Phase 3.

- [ ] **Step 1: Tulis migration**

`apps/backend/src/database/migrations/20260909000002-fleet-drivers.ts`:

```ts
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
```

- [ ] **Step 2: Tulis entity**

`apps/backend/src/modules/fleet-drivers/entities/fleet-driver.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'

@Entity('fleet_drivers')
@Index('idx_fleet_drivers_active_nama', ['isActive', 'nama'])
export class FleetDriverEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 120 })
  nama: string

  @Column({ length: 30, nullable: true })
  telepon: string | null

  @Column({ name: 'sim_nomor', length: 40, nullable: true })
  simNomor: string | null

  @Column({ name: 'sim_jenis_id', type: 'uuid', nullable: true })
  simJenisId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sim_jenis_id' })
  simJenis?: FleetMasterDataEntity

  // `date`, not `timestamptz`: a licence expires on a calendar day, and storing an instant would
  // make the expiry shift by timezone.
  @Column({ name: 'sim_expires_at', type: 'date', nullable: true })
  simExpiresAt: string | null

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 3: Tulis test service yang gagal**

`apps/backend/src/modules/fleet-drivers/fleet-drivers.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FleetDriversService } from './fleet-drivers.service'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'

describe('FleetDriversService', () => {
  let service: FleetDriversService
  let repo: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    createQueryBuilder: jest.Mock
  }
  let masterRepo: { findOne: jest.Mock }
  let qb: {
    where: jest.Mock
    andWhere: jest.Mock
    orderBy: jest.Mock
    addOrderBy: jest.Mock
    leftJoinAndSelect: jest.Mock
    getMany: jest.Mock
  }

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    }
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'new-id', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    }
    masterRepo = { findOne: jest.fn(async () => ({ id: 'sim-1', category: 'jenis_sim' })) }

    const module = await Test.createTestingModule({
      providers: [
        FleetDriversService,
        { provide: getRepositoryToken(FleetDriverEntity), useValue: repo },
        { provide: getRepositoryToken(FleetMasterDataEntity), useValue: masterRepo },
      ],
    }).compile()
    service = module.get(FleetDriversService)
  })

  describe('findAll', () => {
    it('hides inactive drivers by default', async () => {
      await service.findAll()
      expect(qb.andWhere).toHaveBeenCalledWith('d.isActive = TRUE')
    })

    it('searches name, phone and licence number case-insensitively', async () => {
      await service.findAll('budi')
      const clause = qb.andWhere.mock.calls.find((c) => String(c[0]).includes('ILIKE'))
      expect(clause).toBeDefined()
      expect(clause?.[1]).toEqual({ q: '%budi%' })
    })
  })

  describe('create', () => {
    // The FK only proves the id exists in fleet_master_data — it cannot prove the row is a
    // licence class rather than a pool. Without this check a driver could be saved with
    // sim_jenis_id pointing at "Pool Cakung".
    it('rejects a simJenisId that is not a jenis_sim row', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.create({ nama: 'Budi', simJenisId: '11111111-1111-1111-1111-111111111111' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('accepts a driver with no licence data at all', async () => {
      const row = await service.create({ nama: 'Budi' })
      expect(row).toMatchObject({ nama: 'Budi' })
      expect(masterRepo.findOne).not.toHaveBeenCalled()
    })

    it('trims the name', async () => {
      const row = await service.create({ nama: '  Budi Santoso  ' })
      expect(row).toMatchObject({ nama: 'Budi Santoso' })
    })
  })

  describe('update', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.update('missing', { nama: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    // null clears the licence class; an absent field leaves it alone. The service has to tell
    // those apart, which is why the DTO allows null explicitly.
    it('distinguishes clearing simJenisId from leaving it alone', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.update('d1', { simJenisId: null })
      expect(repo.update).toHaveBeenCalledWith('d1', { simJenisId: null })

      repo.update.mockClear()
      await service.update('d1', { nama: 'Budi B' })
      expect(repo.update).toHaveBeenCalledWith('d1', { nama: 'Budi B' })
    })
  })

  describe('remove', () => {
    it('throws NotFoundException for an unknown id', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException)
    })

    // Phase 1 has no vehicles yet, so a delete is a real delete. Phase 2 changes this to archive
    // when a vehicle points at the driver.
    it('deletes the driver', async () => {
      repo.findOne.mockResolvedValue({ id: 'd1', nama: 'Budi' })
      await service.remove('d1')
      expect(repo.delete).toHaveBeenCalledWith('d1')
    })
  })
})
```

- [ ] **Step 4: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm test -- --runInBand fleet-drivers.service
```
Expected: FAIL — module tidak ditemukan.

- [ ] **Step 5: Implementasi service**

`apps/backend/src/modules/fleet-drivers/fleet-drivers.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'

interface CreateInput {
  nama: string
  telepon?: string | null
  simNomor?: string | null
  simJenisId?: string | null
  simExpiresAt?: string | null
}

interface UpdateInput extends Partial<CreateInput> {
  isActive?: boolean
}

@Injectable()
export class FleetDriversService {
  constructor(
    @InjectRepository(FleetDriverEntity)
    private readonly repo: Repository<FleetDriverEntity>,
    @InjectRepository(FleetMasterDataEntity)
    private readonly masterRepo: Repository<FleetMasterDataEntity>,
  ) {}

  async findAll(q?: string, includeInactive = false): Promise<FleetDriverEntity[]> {
    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.simJenis', 'sim')
      .where('1 = 1')

    // Property names, not column names: the query builder maps d.isActive to "d"."is_active".
    if (!includeInactive) qb.andWhere('d.isActive = TRUE')
    if (q?.trim()) {
      qb.andWhere('(d.nama ILIKE :q OR d.telepon ILIKE :q OR d.simNomor ILIKE :q)', {
        q: `%${q.trim()}%`,
      })
    }
    return qb.orderBy('d.nama', 'ASC').getMany()
  }

  async create(dto: CreateInput): Promise<FleetDriverEntity> {
    await this.assertSimJenisValid(dto.simJenisId)
    return this.repo.save(
      this.repo.create({
        nama: dto.nama.trim(),
        telepon: this.blankToNull(dto.telepon),
        simNomor: this.blankToNull(dto.simNomor),
        simJenisId: dto.simJenisId ?? null,
        simExpiresAt: dto.simExpiresAt ?? null,
      }),
    )
  }

  async update(id: string, dto: UpdateInput): Promise<FleetDriverEntity> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Driver not found')

    if (dto.simJenisId) await this.assertSimJenisValid(dto.simJenisId)

    // Built key by key rather than spreading the DTO: an absent field must leave the column
    // alone, while an explicit null must clear it. Spreading would collapse that distinction.
    const patch: Record<string, unknown> = {}
    if (dto.nama !== undefined) patch.nama = dto.nama.trim()
    if (dto.telepon !== undefined) patch.telepon = this.blankToNull(dto.telepon)
    if (dto.simNomor !== undefined) patch.simNomor = this.blankToNull(dto.simNomor)
    if (dto.simJenisId !== undefined) patch.simJenisId = dto.simJenisId
    if (dto.simExpiresAt !== undefined) patch.simExpiresAt = dto.simExpiresAt
    if (dto.isActive !== undefined) patch.isActive = dto.isActive

    if (Object.keys(patch).length > 0) await this.repo.update(id, patch)

    const updated = await this.repo.findOne({ where: { id } })
    if (!updated) throw new NotFoundException('Driver not found')
    return updated
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Driver not found')
    // A hard delete is safe in Phase 1 because nothing references a driver yet. Phase 2 adds
    // fleet_vehicles.driver_id and turns this into an archive when the driver is assigned.
    await this.repo.delete(id)
  }

  // The foreign key proves the id exists in fleet_master_data; it cannot prove the row is a
  // licence class. Without this a driver could be saved pointing at "Pool Cakung".
  private async assertSimJenisValid(id?: string | null): Promise<void> {
    if (!id) return
    const row = await this.masterRepo.findOne({ where: { id, category: 'jenis_sim' } })
    if (!row) throw new BadRequestException('simJenisId must reference a jenis_sim master row')
  }

  // '' and whitespace-only collapse to null so each optional column has one empty state, not two.
  private blankToNull(v?: string | null): string | null {
    if (v == null) return null
    const trimmed = v.trim()
    return trimmed === '' ? null : trimmed
  }
}
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && pnpm test -- --runInBand fleet-drivers.service
```
Expected: PASS, 9 test.

- [ ] **Step 7: Tulis DTO**

`dto/create-fleet-driver.dto.ts`:

```ts
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'

export class CreateFleetDriverDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nama: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telepon?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  simNomor?: string | null

  @IsOptional()
  @IsUUID()
  simJenisId?: string | null

  // A calendar date, not an instant. The service stores it as-is into a DATE column.
  @IsOptional()
  @IsDateString()
  simExpiresAt?: string | null
}
```

`dto/update-fleet-driver.dto.ts`:

```ts
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'

// Every field nullable rather than merely optional: null clears the column, an absent field
// leaves it unchanged, and FleetDriversService.update depends on telling those apart.
export class UpdateFleetDriverDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nama?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telepon?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  simNomor?: string | null

  @IsOptional()
  @IsUUID()
  simJenisId?: string | null

  @IsOptional()
  @IsDateString()
  simExpiresAt?: string | null

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
```

- [ ] **Step 8: Tulis controller & module, daftarkan di `app.module.ts`**

`fleet-drivers.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetDriversService } from './fleet-drivers.service'
import { CreateFleetDriverDto } from './dto/create-fleet-driver.dto'
import { UpdateFleetDriverDto } from './dto/update-fleet-driver.dto'

// Drivers sit behind the vehicle permissions, not their own set: whoever registers a vehicle
// also assigns its driver.
@ApiTags('Fleet Drivers')
@Controller('fleet/drivers')
@UseGuards(JwtAuthGuard)
export class FleetDriversController {
  constructor(private readonly service: FleetDriversService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_VEHICLE)
  findAll(
    @Query('q') q?: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.service.findAll(q, includeInactive)
  }

  @Post()
  @Authorize(Permission.CREATE_FLEET_VEHICLE)
  create(@Body() dto: CreateFleetDriverDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFleetDriverDto) {
    return this.service.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
```

`fleet-drivers.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetDriversService } from './fleet-drivers.service'
import { FleetDriversController } from './fleet-drivers.controller'

@Module({
  // FleetMasterDataEntity is registered here so the service can validate that a submitted
  // simJenisId really is a jenis_sim row.
  imports: [TypeOrmModule.forFeature([FleetDriverEntity, FleetMasterDataEntity])],
  providers: [FleetDriversService],
  controllers: [FleetDriversController],
  exports: [FleetDriversService],
})
export class FleetDriversModule {}
```

Di `app.module.ts` tambahkan import dan masukkan `FleetDriversModule,` ke array `imports` tepat setelah `FleetMasterDataModule,`:
```ts
import { FleetDriversModule } from './modules/fleet-drivers/fleet-drivers.module'
```

- [ ] **Step 9: Jalankan migration & verifikasi endpoint**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm migration:run
```
Expected: `FleetDrivers20260909000002` sukses.

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm dev:backend
```
Lalu di terminal lain:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nama":"Budi Santoso","telepon":"08123456789"}' \
  http://localhost:4000/api/fleet/drivers
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/fleet/drivers
```
Expected: POST mengembalikan objek dengan `id`; GET mengembalikan array berisi Budi.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/database/migrations/20260909000002-fleet-drivers.ts \
        apps/backend/src/modules/fleet-drivers/ apps/backend/src/app.module.ts
git commit -m "feat(fleet): add fleet drivers module

Drivers get their own table because a licence belongs to a person. The
prototype kept driver name and licence expiry on the vehicle, so one
driver on two units meant the licence was typed twice and a driver moving
units left stale data behind.

The FK on sim_jenis_id proves the master row exists but not that it is a
licence class, so the service checks the category explicitly — otherwise
a driver could be saved pointing at a pool.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Sidebar, sub-nav & tipe frontend

**Files:**
- Create: `apps/frontend/src/features/fleet/types.ts`
- Create: `apps/frontend/src/app/(dashboard)/fleet/layout.tsx`
- Create: `apps/frontend/src/app/(dashboard)/fleet/page.tsx`
- Modify: `apps/frontend/src/components/layout/sidebar.tsx`
- Test: `apps/frontend/src/app/(dashboard)/fleet/layout.spec.tsx`

**Interfaces:**
- Consumes: —
- Produces: tipe `FleetMasterCategory`, `FleetMasterRow`, `FleetMasterPayload`, `FleetDriver`, `FleetDriverPayload`, `FLEET_CATEGORY_LABELS`; route `/fleet` dengan sub-nav.

- [ ] **Step 1: Tulis types.ts**

`apps/frontend/src/features/fleet/types.ts`:

```ts
export const FLEET_MASTER_CATEGORIES = [
  'jenis_armada',
  'kepemilikan',
  'leasing',
  'status_kendaraan',
  'pool',
  'jenis_dokumen',
  'jenis_berkas',
  'jenis_sim',
] as const

export type FleetMasterCategory = (typeof FLEET_MASTER_CATEGORIES)[number]

// The tab labels operators see. Indonesian because this is user-facing copy; everything else in
// the codebase stays English.
export const FLEET_CATEGORY_LABELS: Record<FleetMasterCategory, string> = {
  jenis_armada: 'Jenis Armada',
  kepemilikan: 'Kepemilikan',
  leasing: 'Leasing',
  status_kendaraan: 'Status Kendaraan',
  pool: 'Pool',
  jenis_dokumen: 'Jenis Dokumen',
  jenis_berkas: 'Jenis Berkas',
  jenis_sim: 'Jenis SIM',
}

// Only these two carry an expiry threshold, so the form shows warnDays for them alone.
export const CATEGORIES_WITH_WARN_DAYS: readonly FleetMasterCategory[] = [
  'jenis_dokumen',
  'jenis_sim',
]

export interface FleetMasterRow {
  id: string
  category: FleetMasterCategory
  code: string
  label: string
  sortOrder: number
  isActive: boolean
  warnDays: number | null
  defaultValidMonths: number | null
  isRequired: boolean | null
}

export interface FleetMasterPayload {
  category: FleetMasterCategory
  code: string
  label: string
  sortOrder?: number
  warnDays?: number | null
  defaultValidMonths?: number | null
  isRequired?: boolean | null
}

export type FleetMasterUpdatePayload = Partial<Omit<FleetMasterPayload, 'category' | 'code'>> & {
  isActive?: boolean
}

export interface FleetDriver {
  id: string
  nama: string
  telepon: string | null
  simNomor: string | null
  simJenisId: string | null
  simJenis?: { id: string; label: string } | null
  simExpiresAt: string | null
  isActive: boolean
}

export interface FleetDriverPayload {
  nama: string
  telepon?: string | null
  simNomor?: string | null
  simJenisId?: string | null
  simExpiresAt?: string | null
  isActive?: boolean
}
```

- [ ] **Step 2: Tulis test layout yang gagal**

`apps/frontend/src/app/(dashboard)/fleet/layout.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetLayout from './layout'

jest.mock('next/navigation', () => ({
  usePathname: () => '/fleet/drivers',
}))

const mockHasPermission = jest.fn()
jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: mockHasPermission }),
}))

describe('FleetLayout', () => {
  beforeEach(() => mockHasPermission.mockReset())

  it('renders the driver tab and the page content', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <FleetLayout>
        <p>isi halaman</p>
      </FleetLayout>,
    )
    expect(screen.getByRole('link', { name: 'Sopir' })).toBeInTheDocument()
    expect(screen.getByText('isi halaman')).toBeInTheDocument()
  })

  // Master data is a separate permission so a field operator can register vehicles without being
  // able to edit the lookup lists. The tab must disappear, not merely 403 on click.
  it('hides the master data tab without read.fleet_master_data', () => {
    mockHasPermission.mockImplementation((p: string) => p !== 'read.fleet_master_data')
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.queryByRole('link', { name: 'Master Data' })).not.toBeInTheDocument()
  })

  it('marks the active tab with aria-current', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.getByRole('link', { name: 'Sopir' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Master Data' })).not.toHaveAttribute('aria-current')
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm test layout.spec
```
Expected: FAIL — `Cannot find module './layout'`.

- [ ] **Step 4: Tulis layout & page redirect**

`apps/frontend/src/app/(dashboard)/fleet/layout.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/shared/hooks/use-permissions'

// The sidebar's NavLink is flat, so the module's sections live here as a sub-nav — the same shape
// air-shipments uses. Static rather than fetched: unlike air-shipments' sheet tabs, these three
// are known at build time.
//
// The Armada tab lands in Phase 2; Phase 1 ships the two sections that exist.
export default function FleetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { hasPermission } = usePermissions()

  const tabs = [
    { href: '/fleet/drivers', label: 'Sopir', show: true },
    {
      href: '/fleet/master-data',
      label: 'Master Data',
      show: hasPermission('read.fleet_master_data'),
    },
  ].filter((t) => t.show)

  return (
    <div>
      <nav className="mb-6 flex gap-1 border-b" aria-label="Bagian registrasi armada">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname?.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium motion-safe:transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
```

`apps/frontend/src/app/(dashboard)/fleet/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

// /fleet itself has no content. Drivers is the landing section in Phase 1; Phase 2 repoints this
// at /fleet/vehicles, which is what the sidebar entry is really for.
export default function FleetIndexPage() {
  redirect('/fleet/drivers')
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm test layout.spec
```
Expected: PASS, 3 test.

- [ ] **Step 6: Tambahkan entri sidebar**

Di `apps/frontend/src/components/layout/sidebar.tsx`, tepat setelah blok `read.vendor_group` (sekitar baris 157-165), sisipkan:

```tsx
            {hasPermission('read.fleet_vehicle') && (
              <NavLink
                href="/fleet"
                icon={<Truck size={16} />}
                label="Registrasi Armada"
                onClick={onNavClick}
                collapsed={collapsed}
              />
            )}
```

`Truck` sudah di-import untuk Vendor Group, jadi tidak perlu import baru.

> **Catatan:** `NavLink` menandai aktif dengan `pathname.startsWith(href + '/')`, jadi entri `/fleet` ini menyala di ketiga sub-halaman — memang yang diinginkan.

- [ ] **Step 7: Verifikasi di browser**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm dev
```
Buka `http://localhost:3000/fleet` sebagai user yang punya permission fleet.
Expected: redirect ke `/fleet/drivers`, sub-nav menampilkan "Sopir" dan "Master Data", entri sidebar "Registrasi Armada" tersorot.

Halaman akan 404 karena `drivers/page.tsx` baru dibuat di Task 6 — itu wajar pada titik ini.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/fleet/types.ts \
        "apps/frontend/src/app/(dashboard)/fleet/" \
        apps/frontend/src/components/layout/sidebar.tsx
git commit -m "feat(fleet): add fleet route shell with sub-nav

One sidebar entry opening a sub-nav, following air-shipments: the
sidebar's NavLink has no nesting support. Static tabs rather than fetched
— unlike air-shipments' sheet tabs these are known at build time.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Halaman Sopir

**Files:**
- Create: `apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts`
- Create: `apps/frontend/src/features/fleet/components/DriverFormDialog.tsx`
- Create: `apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx`
- Test: `apps/frontend/src/features/fleet/components/DriverFormDialog.spec.tsx`

**Interfaces:**
- Consumes: `FleetDriver`, `FleetDriverPayload` (Task 5); endpoint `/fleet/drivers` (Task 4)
- Produces: `useFleetDrivers`, `useCreateFleetDriver`, `useUpdateFleetDriver`, `useDeleteFleetDriver`, `useFleetMasterDataByCategory`; komponen `DriverFormDialog`.

- [ ] **Step 1: Tulis hooks**

`apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetDriver, FleetDriverPayload, FleetMasterCategory, FleetMasterRow } from '../types'

// Wire shapes are looser than the domain types: frontend and backend deploy in parallel, so a
// response from a backend that predates a field must still parse. Same convention as
// useVendorGroups.
interface FleetDriverWire {
  id: string
  nama: string
  telepon?: string | null
  simNomor?: string | null
  simJenisId?: string | null
  simJenis?: { id: string; label: string } | null
  simExpiresAt?: string | null
  isActive?: boolean
}

export function useFleetDrivers(params: { q?: string; includeInactive?: boolean } = {}) {
  const { q = '', includeInactive = false } = params
  return useQuery<FleetDriverWire[], Error, FleetDriver[]>({
    queryKey: ['fleet', 'drivers', { q, includeInactive }],
    queryFn: () =>
      apiClient
        .get('/fleet/drivers', { params: { q: q || undefined, includeInactive } })
        .then((r) => r.data),
    select: (rows) =>
      rows.map((row) => ({
        id: row.id,
        nama: row.nama,
        telepon: row.telepon ?? null,
        simNomor: row.simNomor ?? null,
        simJenisId: row.simJenisId ?? null,
        simJenis: row.simJenis ?? null,
        simExpiresAt: row.simExpiresAt ?? null,
        // Defaults to true: a backend that cannot answer has not said the driver is archived.
        isActive: row.isActive ?? true,
      })),
    staleTime: 60 * 1000,
  })
}

// Shared by the driver form (jenis_sim) and, from Phase 2, the vehicle form. Cached longer than
// the lists it feeds — master data barely moves.
export function useFleetMasterDataByCategory(category: FleetMasterCategory) {
  return useQuery<FleetMasterRow[]>({
    queryKey: ['fleet', 'master-data', category],
    queryFn: () =>
      apiClient.get('/fleet/master-data', { params: { category } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateFleetDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FleetDriverPayload) =>
      apiClient.post('/fleet/drivers', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] }),
  })
}

export function useUpdateFleetDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<FleetDriverPayload> }) =>
      apiClient.patch(`/fleet/drivers/${id}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] }),
  })
}

export function useDeleteFleetDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/fleet/drivers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fleet', 'drivers'] }),
  })
}
```

- [ ] **Step 2: Tulis test form yang gagal**

`apps/frontend/src/features/fleet/components/DriverFormDialog.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DriverFormDialog } from './DriverFormDialog'
import { FleetMasterRow } from '../types'

const simTypes = [
  { id: 'sim-1', label: 'B1 Umum', category: 'jenis_sim' },
  { id: 'sim-2', label: 'B2 Umum', category: 'jenis_sim' },
] as FleetMasterRow[]

describe('DriverFormDialog', () => {
  it('refuses to submit without a name', async () => {
    const onSubmit = jest.fn()
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={jest.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Nama sopir wajib diisi.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the trimmed name with the chosen licence class', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={jest.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/Nama sopir/), {
      target: { value: '  Budi Santoso  ' },
    })
    fireEvent.change(screen.getByLabelText(/Jenis SIM/), { target: { value: 'sim-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ nama: 'Budi Santoso', simJenisId: 'sim-2' }),
      ),
    )
  })

  // The backend reads an omitted field as "leave unchanged", so a cleared optional field has to
  // travel as null or it becomes unremovable.
  it('sends null rather than an empty string for cleared optional fields', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <DriverFormDialog
        open
        simTypes={simTypes}
        initial={{
          id: 'd1',
          nama: 'Budi',
          telepon: '0812',
          simNomor: 'X',
          simJenisId: 'sim-1',
          simJenis: null,
          simExpiresAt: '2027-01-01',
          isActive: true,
        }}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Nomor telepon/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ telepon: null })),
    )
  })

  it('surfaces the backend error message', async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValue({ response: { data: { message: 'simJenisId must reference a jenis_sim master row' } } })
    render(
      <DriverFormDialog open simTypes={simTypes} onSubmit={onSubmit} onClose={jest.fn()} />,
    )
    fireEvent.change(screen.getByLabelText(/Nama sopir/), { target: { value: 'Budi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText(/must reference a jenis_sim/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm test DriverFormDialog
```
Expected: FAIL — module tidak ditemukan.

- [ ] **Step 4: Tulis DriverFormDialog**

`apps/frontend/src/features/fleet/components/DriverFormDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import { FleetDriver, FleetDriverPayload, FleetMasterRow } from '../types'

interface DriverFormDialogProps {
  open: boolean
  initial?: FleetDriver
  simTypes: FleetMasterRow[]
  onSubmit: (payload: FleetDriverPayload) => Promise<void>
  onClose: () => void
}

export function DriverFormDialog({
  open,
  initial,
  simTypes,
  onSubmit,
  onClose,
}: DriverFormDialogProps) {
  const [nama, setNama] = useState(initial?.nama ?? '')
  const [telepon, setTelepon] = useState(initial?.telepon ?? '')
  const [simNomor, setSimNomor] = useState(initial?.simNomor ?? '')
  const [simJenisId, setSimJenisId] = useState(initial?.simJenisId ?? '')
  const [simExpiresAt, setSimExpiresAt] = useState(initial?.simExpiresAt ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nama.trim()) {
      setError('Nama sopir wajib diisi.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // Optional fields travel as null, never '': the backend reads an absent field as "leave
      // unchanged", so an empty string would make a cleared field unremovable.
      await onSubmit({
        nama: nama.trim(),
        telepon: telepon.trim() || null,
        simNomor: simNomor.trim() || null,
        simJenisId: simJenisId || null,
        simExpiresAt: simExpiresAt || null,
      })
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Terjadi kesalahan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah sopir' : 'Tambah sopir'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Nama sopir" required htmlFor="driver-nama">
            <Input id="driver-nama" value={nama} onChange={(e) => setNama(e.target.value)} />
          </FormField>

          <FormField label="Nomor telepon" htmlFor="driver-telepon">
            <Input
              id="driver-telepon"
              value={telepon}
              onChange={(e) => setTelepon(e.target.value)}
            />
          </FormField>

          <FormField label="Nomor SIM" htmlFor="driver-sim-nomor">
            <Input
              id="driver-sim-nomor"
              value={simNomor}
              onChange={(e) => setSimNomor(e.target.value)}
            />
          </FormField>

          <FormField label="Jenis SIM" htmlFor="driver-sim-jenis">
            <select
              id="driver-sim-jenis"
              value={simJenisId}
              onChange={(e) => setSimJenisId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— pilih —</option>
              {simTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Masa berlaku SIM"
            htmlFor="driver-sim-exp"
            hint="Dipantau di daftar Perlu Tindakan."
          >
            <Input
              id="driver-sim-exp"
              type="date"
              value={simExpiresAt}
              onChange={(e) => setSimExpiresAt(e.target.value)}
            />
          </FormField>

          {error && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle size={14} aria-hidden="true" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm test DriverFormDialog
```
Expected: PASS, 4 test.

- [ ] **Step 6: Tulis halaman Sopir**

`apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable } from '@/components/shared/data-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { DriverFormDialog } from '@/features/fleet/components/DriverFormDialog'
import {
  useCreateFleetDriver,
  useDeleteFleetDriver,
  useFleetDrivers,
  useFleetMasterDataByCategory,
  useUpdateFleetDriver,
} from '@/features/fleet/hooks/useFleetDrivers'
import { FleetDriver, FleetDriverPayload } from '@/features/fleet/types'

type Modal = { type: 'create' } | { type: 'edit'; driver: FleetDriver } | { type: 'delete'; driver: FleetDriver } | null

export default function FleetDriversPage() {
  const { hasPermission } = usePermissions()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: drivers, isLoading } = useFleetDrivers({ q })
  const { data: simTypes } = useFleetMasterDataByCategory('jenis_sim')
  const createDriver = useCreateFleetDriver()
  const updateDriver = useUpdateFleetDriver()
  const deleteDriver = useDeleteFleetDriver()

  const canCreate = hasPermission('create.fleet_vehicle')
  const canUpdate = hasPermission('update.fleet_vehicle')
  const canDelete = hasPermission('delete.fleet_vehicle')

  const handleSubmit = async (payload: FleetDriverPayload) => {
    if (modal?.type === 'edit') {
      await updateDriver.mutateAsync({ id: modal.driver.id, payload })
    } else {
      await createDriver.mutateAsync(payload)
    }
  }

  return (
    <div>
      <PageHeader
        title="Sopir"
        subtitle="Data sopir dan masa berlaku SIM. Peringatan SIM mengikuti sopirnya, bukan kendaraan."
        action={
          canCreate ? <Button onClick={() => setModal({ type: 'create' })}>+ Tambah sopir</Button> : undefined
        }
      />

      {deleteError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </p>
      )}

      <div className="mb-4">
        <Input
          placeholder="Cari nama, telepon, atau nomor SIM…"
          aria-label="Cari sopir"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <DataTable
        rows={drivers ?? []}
        isLoading={isLoading}
        keyExtractor={(d) => d.id}
        emptyMessage="Belum ada sopir terdaftar."
        columns={[
          { header: 'Nama', accessor: (d) => d.nama },
          { header: 'Telepon', accessor: (d) => d.telepon ?? '—' },
          { header: 'Nomor SIM', accessor: (d) => d.simNomor ?? '—' },
          { header: 'Jenis SIM', accessor: (d) => d.simJenis?.label ?? '—' },
          { header: 'Berlaku sampai', accessor: (d) => d.simExpiresAt ?? '—' },
          {
            header: '',
            className: 'text-right',
            accessor: (d) => (
              <div className="flex justify-end gap-2">
                {canUpdate && (
                  <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'edit', driver: d })}>
                    Ubah
                  </Button>
                )}
                {canDelete && (
                  <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'delete', driver: d })}>
                    Hapus
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <DriverFormDialog
          open
          initial={modal.type === 'edit' ? modal.driver : undefined}
          simTypes={simTypes ?? []}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={modal?.type === 'delete'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Hapus sopir"
        description={
          modal?.type === 'delete'
            ? `Hapus ${modal.driver.nama}? Tindakan ini tidak bisa dibatalkan.`
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'delete') return
          // ConfirmDialog does not catch, so a rejected mutation would surface as an unhandled
          // rejection and the dialog would stay open with no explanation.
          try {
            await deleteDriver.mutateAsync(modal.driver.id)
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data
              ?.message
            setDeleteError(msg ?? 'Gagal menghapus sopir.')
          }
        }}
      />
    </div>
  )
}
```

- [ ] **Step 7: Verifikasi di browser**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm dev
```
Buka `http://localhost:3000/fleet/drivers`. Uji: tambah sopir, cari namanya, ubah, hapus lewat konfirmasi. Dropdown "Jenis SIM" harus berisi B1 Umum / B2 Umum / A Umum dari seed.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/fleet/ "apps/frontend/src/app/(dashboard)/fleet/drivers/"
git commit -m "feat(fleet): add drivers page

Optional fields submit as null rather than '': the backend reads an
absent field as leave-unchanged, so an empty string would make a cleared
field unremovable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Halaman Master Data

**Files:**
- Create: `apps/frontend/src/features/fleet/hooks/useFleetMasterData.ts`
- Create: `apps/frontend/src/features/fleet/components/MasterDataFormDialog.tsx`
- Create: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx`
- Test: `apps/frontend/src/features/fleet/components/MasterDataFormDialog.spec.tsx`

**Interfaces:**
- Consumes: `FleetMasterRow`, `FleetMasterPayload`, `FLEET_CATEGORY_LABELS`, `CATEGORIES_WITH_WARN_DAYS` (Task 5); endpoint `/fleet/master-data` (Task 3)
- Produces: `useFleetMasterData`, `useCreateFleetMasterData`, `useUpdateFleetMasterData`, `useDeleteFleetMasterData`; komponen `MasterDataFormDialog`.

- [ ] **Step 1: Tulis hooks**

`apps/frontend/src/features/fleet/hooks/useFleetMasterData.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  FleetMasterCategory,
  FleetMasterPayload,
  FleetMasterRow,
  FleetMasterUpdatePayload,
} from '../types'

interface FleetMasterRowWire {
  id: string
  category: FleetMasterCategory
  code: string
  label: string
  sortOrder?: number
  isActive?: boolean
  warnDays?: number | null
  defaultValidMonths?: number | null
  isRequired?: boolean | null
}

// includeInactive is true here, unlike useFleetMasterDataByCategory which feeds dropdowns: this
// is the management screen, where a deactivated row must stay visible to be reactivated.
export function useFleetMasterData(category: FleetMasterCategory) {
  return useQuery<FleetMasterRowWire[], Error, FleetMasterRow[]>({
    queryKey: ['fleet', 'master-data', 'manage', category],
    queryFn: () =>
      apiClient
        .get('/fleet/master-data', { params: { category, includeInactive: true } })
        .then((r) => r.data),
    select: (rows) =>
      rows.map((row) => ({
        id: row.id,
        category: row.category,
        code: row.code,
        label: row.label,
        sortOrder: row.sortOrder ?? 0,
        isActive: row.isActive ?? true,
        warnDays: row.warnDays ?? null,
        defaultValidMonths: row.defaultValidMonths ?? null,
        isRequired: row.isRequired ?? null,
      })),
    staleTime: 60 * 1000,
  })
}

// Invalidates the ['fleet'] prefix rather than one category: a new pool row has to reach both the
// management table and the dropdown caches that feed the vehicle form.
function useInvalidateFleet() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['fleet'] })
}

export function useCreateFleetMasterData() {
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: (payload: FleetMasterPayload) =>
      apiClient.post('/fleet/master-data', payload).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useUpdateFleetMasterData() {
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FleetMasterUpdatePayload }) =>
      apiClient.patch(`/fleet/master-data/${id}`, payload).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useDeleteFleetMasterData() {
  const invalidate = useInvalidateFleet()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/fleet/master-data/${id}`),
    onSuccess: invalidate,
  })
}
```

- [ ] **Step 2: Tulis test form yang gagal**

`apps/frontend/src/features/fleet/components/MasterDataFormDialog.spec.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MasterDataFormDialog } from './MasterDataFormDialog'

describe('MasterDataFormDialog', () => {
  const base = {
    open: true,
    category: 'leasing' as const,
    onSubmit: jest.fn(),
    onClose: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('derives a slug code from the label when creating', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'BCA Finance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ code: 'bca_finance' })),
    )
  })

  it('rejects an empty label', async () => {
    const onSubmit = jest.fn()
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Label wajib diisi.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // warnDays only means something for the two categories that carry an expiry date; showing it on
  // a pool would invite an admin to set a threshold that nothing reads.
  it('hides the warning-threshold field for categories without an expiry', () => {
    render(<MasterDataFormDialog {...base} category="pool" />)
    expect(screen.queryByLabelText(/Ambang peringatan/)).not.toBeInTheDocument()
  })

  it('shows the warning-threshold field for jenis_dokumen', () => {
    render(<MasterDataFormDialog {...base} category="jenis_dokumen" />)
    expect(screen.getByLabelText(/Ambang peringatan/)).toBeInTheDocument()
  })

  // code is the row's identity: the backend refuses to change it, so the form must not offer to.
  it('locks the code field when editing', () => {
    render(
      <MasterDataFormDialog
        {...base}
        initial={{
          id: 'r1',
          category: 'leasing',
          code: 'mtf',
          label: 'MTF',
          sortOrder: 10,
          isActive: true,
          warnDays: null,
          defaultValidMonths: null,
          isRequired: null,
        }}
      />,
    )
    expect(screen.getByLabelText(/Kode/)).toBeDisabled()
  })

  it('surfaces the backend conflict message', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'Code "mtf" already exists under category "leasing"' } },
    })
    render(<MasterDataFormDialog {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: 'MTF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm test MasterDataFormDialog
```
Expected: FAIL — module tidak ditemukan.

- [ ] **Step 4: Tulis MasterDataFormDialog**

`apps/frontend/src/features/fleet/components/MasterDataFormDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import {
  CATEGORIES_WITH_WARN_DAYS,
  FLEET_CATEGORY_LABELS,
  FleetMasterCategory,
  FleetMasterPayload,
  FleetMasterRow,
} from '../types'

interface MasterDataFormDialogProps {
  open: boolean
  category: FleetMasterCategory
  initial?: FleetMasterRow
  onSubmit: (payload: FleetMasterPayload) => Promise<void>
  onClose: () => void
}

// Mirrors the backend's /^[a-z0-9_]+$/ rule so an admin never has to think about the slug: the
// label they type produces it. Editing keeps the original — code is the row's identity.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function MasterDataFormDialog({
  open,
  category,
  initial,
  onSubmit,
  onClose,
}: MasterDataFormDialogProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0))
  const [warnDays, setWarnDays] = useState(
    initial?.warnDays == null ? '' : String(initial.warnDays),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const showWarnDays = CATEGORIES_WITH_WARN_DAYS.includes(category)
  const code = initial?.code ?? slugify(label)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) {
      setError('Label wajib diisi.')
      return
    }
    if (!code) {
      setError('Label harus memuat huruf atau angka.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        category,
        code,
        label: label.trim(),
        sortOrder: Number(sortOrder) || 0,
        warnDays: showWarnDays && warnDays !== '' ? Number(warnDays) : null,
      })
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Terjadi kesalahan. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? 'Ubah' : 'Tambah'} {FLEET_CATEGORY_LABELS[category]}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Label" required htmlFor="md-label">
            <Input id="md-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>

          <FormField
            label="Kode"
            htmlFor="md-code"
            hint={initial ? 'Kode tidak bisa diubah.' : 'Dibuat otomatis dari label.'}
          >
            <Input id="md-code" value={code} disabled readOnly />
          </FormField>

          <FormField label="Urutan tampil" htmlFor="md-sort" hint="Angka kecil tampil lebih dulu.">
            <Input
              id="md-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </FormField>

          {showWarnDays && (
            <FormField
              label="Ambang peringatan (hari)"
              htmlFor="md-warn"
              hint="Berapa hari sebelum jatuh tempo peringatan mulai muncul. Kosongkan untuk 30 hari."
            >
              <Input
                id="md-warn"
                type="number"
                min={0}
                max={365}
                value={warnDays}
                onChange={(e) => setWarnDays(e.target.value)}
              />
            </FormField>
          )}

          {error && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle size={14} aria-hidden="true" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm test MasterDataFormDialog
```
Expected: PASS, 6 test.

- [ ] **Step 6: Tulis halaman Master Data**

`apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable } from '@/components/shared/data-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { MasterDataFormDialog } from '@/features/fleet/components/MasterDataFormDialog'
import {
  useCreateFleetMasterData,
  useDeleteFleetMasterData,
  useFleetMasterData,
  useUpdateFleetMasterData,
} from '@/features/fleet/hooks/useFleetMasterData'
import {
  FLEET_CATEGORY_LABELS,
  FLEET_MASTER_CATEGORIES,
  FleetMasterCategory,
  FleetMasterPayload,
  FleetMasterRow,
} from '@/features/fleet/types'

type Modal =
  | { type: 'create' }
  | { type: 'edit'; row: FleetMasterRow }
  | { type: 'delete'; row: FleetMasterRow }
  | null

export default function FleetMasterDataPage() {
  const { hasPermission } = usePermissions()
  const [category, setCategory] = useState<FleetMasterCategory>('jenis_armada')
  const [modal, setModal] = useState<Modal>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: rows, isLoading } = useFleetMasterData(category)
  const createRow = useCreateFleetMasterData()
  const updateRow = useUpdateFleetMasterData()
  const deleteRow = useDeleteFleetMasterData()

  const canCreate = hasPermission('create.fleet_master_data')
  const canUpdate = hasPermission('update.fleet_master_data')
  const canDelete = hasPermission('delete.fleet_master_data')

  const handleSubmit = async (payload: FleetMasterPayload) => {
    if (modal?.type === 'edit') {
      await updateRow.mutateAsync({
        id: modal.row.id,
        payload: {
          label: payload.label,
          sortOrder: payload.sortOrder,
          warnDays: payload.warnDays,
        },
      })
    } else {
      await createRow.mutateAsync(payload)
    }
  }

  return (
    <div>
      <PageHeader
        title="Master Data Armada"
        subtitle="Daftar pilihan yang muncul di form kendaraan dan sopir."
        action={
          canCreate ? (
            <Button onClick={() => setModal({ type: 'create' })}>
              + Tambah {FLEET_CATEGORY_LABELS[category]}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b" role="tablist">
        {FLEET_MASTER_CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            onClick={() => setCategory(c)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium motion-safe:transition-colors',
              c === category
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {FLEET_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {deleteError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {deleteError}
        </p>
      )}

      <DataTable
        rows={rows ?? []}
        isLoading={isLoading}
        keyExtractor={(r) => r.id}
        emptyMessage="Belum ada data untuk kategori ini."
        columns={[
          {
            header: 'Label',
            accessor: (r) => (
              <span className="flex items-center gap-2">
                {r.label}
                {!r.isActive && <Badge variant="secondary">nonaktif</Badge>}
              </span>
            ),
          },
          { header: 'Kode', accessor: (r) => <code className="text-xs">{r.code}</code> },
          { header: 'Urutan', accessor: (r) => r.sortOrder },
          { header: 'Ambang (hari)', accessor: (r) => r.warnDays ?? '—' },
          {
            header: '',
            className: 'text-right',
            accessor: (r) => (
              <div className="flex justify-end gap-2">
                {canUpdate && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'edit', row: r })}>
                      Ubah
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateRow.mutate({ id: r.id, payload: { isActive: !r.isActive } })
                      }
                    >
                      {r.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </>
                )}
                {canDelete && (
                  <Button variant="ghost" size="sm" onClick={() => setModal({ type: 'delete', row: r })}>
                    Hapus
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <MasterDataFormDialog
          open
          category={category}
          initial={modal.type === 'edit' ? modal.row : undefined}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={modal?.type === 'delete'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Hapus data master"
        description={
          modal?.type === 'delete'
            ? `Hapus "${modal.row.label}"? Kalau masih dipakai kendaraan, sistem akan menolak — nonaktifkan saja.`
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'delete') return
          setDeleteError(null)
          try {
            await deleteRow.mutateAsync(modal.row.id)
          } catch (err: unknown) {
            // The 409 carries the reference count and the advice to deactivate. Surfacing it
            // verbatim is more useful than a generic failure toast.
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data
              ?.message
            setDeleteError(msg ?? 'Gagal menghapus data master.')
          }
        }}
      />
    </div>
  )
}
```

- [ ] **Step 7: Verifikasi di browser**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm dev
```
Buka `http://localhost:3000/fleet/master-data`. Uji:
- Kedelapan tab berpindah dan menampilkan seed masing-masing
- Tab "Jenis Dokumen" menampilkan kolom Ambang (KIR 30, Servis Berkala 14)
- Tambah baris leasing baru — kode terisi otomatis dari label
- Nonaktifkan satu baris — badge "nonaktif" muncul
- Buka `/fleet/drivers`, dropdown Jenis SIM tidak lagi menampilkan baris yang dinonaktifkan
- Hapus baris yang baru dibuat — berhasil (belum dipakai)

- [ ] **Step 8: Jalankan suite penuh kedua sisi**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand
```
Expected: seluruh suite hijau, termasuk 29 test fleet yang baru.

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm test
```
Expected: seluruh suite hijau, termasuk 13 test fleet yang baru.

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm lint
```
Expected: bersih.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/fleet/ "apps/frontend/src/app/(dashboard)/fleet/master-data/"
git commit -m "feat(fleet): add master data management page

Eight category tabs over one table. The warning-threshold field appears
only for jenis_dokumen and jenis_sim — offering it on a pool would invite
a threshold nothing reads.

A refused delete surfaces the backend's 409 verbatim: it carries the
reference count and the advice to deactivate instead, which is more
useful than a generic failure toast.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifikasi Phase 1 selesai

Semua harus benar sebelum Phase 1 dianggap selesai:

- [ ] `pnpm migration:run` bersih dari nol; `pnpm migration:revert` dua kali juga bersih
- [ ] `SELECT category, count(*) FROM fleet_master_data GROUP BY category` (lewat perintah psql di Task 1 Step 4) → 8 kategori dengan jumlah sesuai
- [ ] Suite backend hijau: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`
- [ ] Suite frontend hijau: `cd apps/frontend && pnpm test`
- [ ] `pnpm lint` bersih
- [ ] Sidebar menampilkan "Registrasi Armada" hanya untuk pemegang `read.fleet_vehicle`
- [ ] Tab "Master Data" hilang untuk user tanpa `read.fleet_master_data`
- [ ] CRUD sopir jalan penuh; dropdown Jenis SIM terisi dari master data
- [ ] CRUD master data jalan di kedelapan kategori
- [ ] Baris master data yang dinonaktifkan hilang dari dropdown tapi tetap ada di halaman kelola

**Yang sengaja ditinggal untuk phase berikutnya**, jangan dianggap kekurangan:
- `REFERENCING_COLUMNS` masih kosong — Phase 2 mengisinya dengan kolom `fleet_vehicles`
- Hapus sopir masih hard delete — Phase 2 mengubahnya jadi arsip saat sopir dipegang kendaraan
- Kolom softcopy SIM (`sim_storage_key` dkk, spec §4.5) — Phase 3
- Tab "Armada" di sub-nav — Phase 2
