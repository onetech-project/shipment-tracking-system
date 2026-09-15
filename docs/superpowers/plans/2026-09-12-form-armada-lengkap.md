# Form Armada Lengkap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form tambah/ubah armada menampilkan enam section dalam satu dialog — identitas, kepemilikan & leasing, operasional & sopir, uji berkala, dokumen kendaraan, servis & perawatan — tersimpan lewat satu endpoint atomik, dan daftar armada memperlihatkan satu kolom per jenis dokumen di belakang menu aksi three-dots.

**Architecture:** Backend menambah satu tabel (`fleet_lease_contracts`) beserta entity dan helper aritmetika angsuran, lalu melebarkan `POST /fleet/vehicles` dan `PATCH /fleet/vehicles/:id` agar menerima `lease{}` dan `documents[]` dan menulis ketiganya dalam satu transaksi. Frontend memecah `VehicleFormDialog` menjadi satu hook state (`useVehicleForm`) plus empat komponen section di `components/vehicle-form/`, sehingga tiap file punya satu tanggung jawab dan muat dibaca sekaligus. Daftar armada membangun kolom dokumennya dari master data, bukan dari daftar kolom hardcode.

**Tech Stack:** NestJS 10 · TypeORM · PostgreSQL 16 · Next.js App Router · React Query v5 · Tailwind · Radix UI · jest + ts-jest (backend) · jest + Testing Library (frontend)

**Spec:** `docs/superpowers/specs/2026-09-12-form-armada-lengkap-design.md` (seluruh section)
**Spec induk:** `docs/superpowers/specs/2026-09-09-registrasi-armada-design.md`

## Global Constraints

- **Bahasa kode & komentar: Inggris.** Hanya label UI yang dibaca operator berbahasa Indonesia. Jangan menulis komentar berbahasa Indonesia di dalam kode.
- **Komentar menjelaskan *kenapa*, bukan *apa*.**
- **Gaya kode: ikuti file tetangga.** Modul backend `fleet-*`, seluruh `apps/frontend/src/features/**` dan `apps/frontend/src/app/(dashboard)/fleet/**` ditulis **tanpa semicolon**. Komponen di `apps/frontend/src/components/**` memakai **semicolon**. Semua contoh kode di plan ini sudah mengikuti aturan itu — salin apa adanya.
- **Test backend terfokus:** `cd apps/backend && pnpm test -- --runInBand <pattern>`. Suite penuh: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`. Tanpa **kedua** flag itu box kehabisan RAM dan suite mati tanpa satu test pun gagal.
- **Test frontend:** `cd apps/frontend && pnpm test <pattern>` — tanpa flag tambahan.
- **Migration:** `migrationsTransactionMode: 'all'` — **jangan** pakai `CREATE INDEX CONCURRENTLY`.
- **Migration tidak boleh mengimpor kode aplikasi.** Setiap file di `src/database/migrations/` hanya mengimpor `typeorm`. Helper murni yang perlu dites diekspor **dari file migration itu sendiri**.
- **Entity auto-load:** `autoLoadEntities: true` — entity didaftarkan lewat `TypeOrmModule.forFeature` di module.
- **QueryBuilder memakai nama properti untuk alias entity** (`v.isActive` → `"v"."is_active"`), dan nama kolom asli untuk alias non-entity (`vs.severity_rank`).
- **`ValidationPipe` global:** `whitelist: true, forbidNonWhitelisted: true, transform: true`. Properti yang tidak dideklarasikan di DTO menghasilkan 400.
- **Tidak ada kalkulasi tanggal di frontend untuk status.** Setiap `daysLeft`, `severity`, `sisaAngsuran` dan `sisaKewajiban` datang dari backend. Satu-satunya pengecualian yang plan ini izinkan adalah `addMonths` di Task 11: itu mengisi **nilai awal sebuah input** yang operator boleh timpa, bukan menampilkan status — dan nilainya disimpan apa adanya, jadi backend tetap satu-satunya yang menghitung.
- **Commit message wajib diakhiri trailer** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Kode wajib dokumen = punya `expiresAt`.** Spec §5.1 menyebut "dokumen yang `is_required = TRUE`" wajib; yang ditegakkan backend adalah **tanggal kedaluwarsanya** terisi, karena itulah yang dibaca sistem peringatan. `nomor` tetap opsional di semua jenis dokumen.

---

## File Structure

**Backend — baru**
```
apps/backend/src/database/migrations/20260912000001-fleet-nopol-normalize.ts   normalisasi plat lama, gagal bila bentrok
apps/backend/src/database/migrations/20260912000002-fleet-lease-contracts.ts   tabel kontrak leasing
apps/backend/src/database/migrations/20260912000003-fleet-doc-required-flags.ts  isi is_required untuk jenis_dokumen

apps/backend/src/modules/fleet-vehicles/
  entities/fleet-lease-contract.entity.ts   tabel fleet_lease_contracts
  fleet-lease.ts                            monthsBetween / computeLease
  fleet-lease.spec.ts
  dto/fleet-lease.dto.ts                    FleetLeaseDto
```

**Backend — dimodifikasi**
```
apps/backend/src/modules/fleet-vehicles/fleet-nopol.ts              buang spasi/titik/strip
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.constants.ts SEWA_LEPAS_KUNCI_CODE
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts     FleetVehicleLeaseView
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts   transaksi gabungan + guard
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts    daftarkan entity kontrak
apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.ts  field wajib + lease + documents
apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts  REFERENCING_COLUMNS
```

**Frontend — baru**
```
apps/frontend/src/components/ui/dropdown-menu.tsx        menu three-dots
apps/frontend/src/components/shared/data-table.spec.tsx  pin header ReactNode

apps/frontend/src/features/fleet/utils/nopol.ts          normalizeNopolInput
apps/frontend/src/features/fleet/utils/date-offset.ts    addMonths
apps/frontend/src/features/fleet/utils/doc-labels.ts     DOC_LABELS + docLabels()
apps/frontend/src/features/fleet/utils/format-date.ts    formatTanggal

apps/frontend/src/features/fleet/components/vehicle-form/
  useVehicleForm.ts        seluruh state form + payload + validasi
  form-primitives.tsx      Section, MasterSelect, SELECT_CLASS
  IdentitySection.tsx      section 1
  LeaseSection.tsx         section 2
  OperationalSection.tsx   section 3
  DocumentSection.tsx      section 4, 5, 6 (satu komponen, tiga pemakaian)
```

**Frontend — dimodifikasi**
```
apps/frontend/src/components/shared/data-table.tsx                       header: React.ReactNode
apps/frontend/src/features/fleet/types.ts                                FleetVehicleLease + payload gabungan
apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts               normalisasi lease
apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx        rakit enam section
apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.tsx   label kontekstual
apps/frontend/src/features/fleet/components/VehicleTable.tsx             kolom dinamis + three-dots
apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx                wiring
```

---

## Task 1: Nopol tersimpan rapat

Requirement §1 dan spec §4.3: `B 9114 KYZ` yang diketik operator harus tersimpan sebagai `B9114KYZ`.

**Files:**
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-nopol.ts`
- Test: `apps/backend/src/modules/fleet-vehicles/fleet-nopol.spec.ts`

**Interfaces:**
- Consumes: —
- Produces: `normalizeNopol(raw: string): string` — membuang seluruh whitespace, titik, dan strip, lalu meng-uppercase. Dipakai Task 4 dan Task 8.

- [ ] **Step 1: Tulis ulang test sehingga gagal**

Ganti seluruh isi `apps/backend/src/modules/fleet-vehicles/fleet-nopol.spec.ts`:

```ts
import { normalizeNopol } from './fleet-nopol'

describe('normalizeNopol', () => {
  it('uppercases and removes every space', () => {
    expect(normalizeNopol('b  9114   kyz')).toBe('B9114KYZ')
  })

  it('leaves an already-normalised plate untouched', () => {
    expect(normalizeNopol('B9114KYZ')).toBe('B9114KYZ')
  })

  it('trims the ends', () => {
    expect(normalizeNopol('  b 9114 kyz  ')).toBe('B9114KYZ')
  })

  // Tabs and newlines reach the field through copy-paste from a spreadsheet.
  it('treats tabs and newlines as whitespace', () => {
    expect(normalizeNopol('b\t9114\nkyz')).toBe('B9114KYZ')
  })

  // Operators type the plate three ways on the same day. All three are the same truck, and the
  // partial unique index only catches that if all three collapse to one string.
  it.each(['B.9114.KYZ', 'B-9114-KYZ', 'b 9114-kyz'])('strips dots and dashes from %s', (raw) => {
    expect(normalizeNopol(raw)).toBe('B9114KYZ')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeNopol('   ')).toBe('')
  })

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizeNopol(' - . ')).toBe('')
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-nopol`
Expected: FAIL — `Expected: "B9114KYZ"` / `Received: "B 9114 KYZ"`.

- [ ] **Step 3: Ubah normalizer**

Ganti seluruh isi `apps/backend/src/modules/fleet-vehicles/fleet-nopol.ts`:

```ts
// Normalised on write so the partial unique index actually catches duplicates. Without this
// "b 9114 kyz", "B-9114-KYZ" and "B9114KYZ" are three distinct rows and the register grows three
// copies of one truck. Requirement §1 asks for the closed-up form specifically, so every
// separator goes rather than collapsing to a single space. \s covers tabs and newlines, which
// arrive via spreadsheet paste.
export function normalizeNopol(raw: string): string {
  return raw.replace(/[\s.-]/g, '').toUpperCase()
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-nopol`
Expected: PASS, 9 test.

- [ ] **Step 5: Perbaiki fixture yang ikut berubah**

`fleet-vehicles.service.spec.ts` memberi makan plat berspasi ke service dan menuntut plat itu kembali apa adanya. Setelah Step 3 service menormalisasinya, jadi fixture-nya harus ikut rapat. Ganti keempat tempat:

```bash
cd apps/backend/src/modules/fleet-vehicles
sed -i "s/'B 9114 KYZ'/'B9114KYZ'/g; s/'B 1 A'/'B1A'/g" fleet-vehicles.service.spec.ts
sed -i "s/'B 9114 KYZ'/'B9114KYZ'/g; s/'B 1 A'/'B1A'/g" dto/create-fleet-vehicle.dto.spec.ts
sed -i "s/'B 9114 KYZ'/'B9114KYZ'/g" dto/update-fleet-vehicle.dto.spec.ts
sed -i "s/'B 1 A'/'B1A'/g" fleet-vehicles.controller.spec.ts
```

- [ ] **Step 6: Jalankan seluruh test fleet backend**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-`
Expected: PASS seluruhnya.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles
git commit -m "$(cat <<'EOF'
feat(fleet): store plates closed-up so separators cannot hide a duplicate

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration normalisasi plat lama

Spec §4.3: baris lama ikut dinormalisasi, dan migration **berhenti** bila dua unit aktif menjadi identik — memilih unit mana yang kalah adalah keputusan operator.

**Files:**
- Create: `apps/backend/src/database/migrations/20260912000001-fleet-nopol-normalize.ts`
- Test: `apps/backend/src/database/migrations/20260912000001-fleet-nopol-normalize.spec.ts`

**Interfaces:**
- Consumes: —
- Produces: `describeNopolClashes(rows: { nopol: string; count: string }[]): string | null` — diekspor dari file migration supaya pesan gagalnya bisa dites tanpa database. Migration tidak boleh mengimpor `normalizeNopol`; setiap migration di repo ini hanya mengimpor `typeorm`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/backend/src/database/migrations/20260912000001-fleet-nopol-normalize.spec.ts`:

```ts
import { describeNopolClashes } from './20260912000001-fleet-nopol-normalize'

describe('describeNopolClashes', () => {
  it('returns null when nothing collides', () => {
    expect(describeNopolClashes([])).toBeNull()
  })

  // The plate is the only handle the operator has on the two rows they must reconcile. A message
  // that says "some plates collide" sends them hunting through the whole register by hand.
  it('names every colliding plate and how many active rows carry it', () => {
    const msg = describeNopolClashes([
      { nopol: 'B9114KYZ', count: '2' },
      { nopol: 'D1234AB', count: '3' },
    ])
    expect(msg).toContain('B9114KYZ (2 active rows)')
    expect(msg).toContain('D1234AB (3 active rows)')
  })

  // Without the instruction the operator is told what broke but not what to do about it, and the
  // deploy stalls on a message nobody can act on.
  it('says what to do about it', () => {
    const msg = describeNopolClashes([{ nopol: 'B9114KYZ', count: '2' }])
    expect(msg).toMatch(/archive or correct/i)
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-nopol-normalize`
Expected: FAIL — `Cannot find module './20260912000001-fleet-nopol-normalize'`.

- [ ] **Step 3: Tulis migration-nya**

Buat `apps/backend/src/database/migrations/20260912000001-fleet-nopol-normalize.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// Mirrors normalizeNopol in the fleet-vehicles module, expressed in SQL because a migration may
// not import application code — every migration in this repo imports typeorm and nothing else,
// so that a file whose job is to describe one schema change never drifts when the module it
// mirrors is refactored. [[:space:].-] is a POSIX bracket expression: whitespace, a literal dot,
// and a trailing literal hyphen.
const STRIPPED = `upper(regexp_replace(nopol, '[[:space:].-]', '', 'g'))`

export function describeNopolClashes(rows: { nopol: string; count: string }[]): string | null {
  if (rows.length === 0) return null
  const list = rows.map((r) => `${r.nopol} (${r.count} active rows)`).join(', ')
  return (
    'Cannot normalise fleet_vehicles.nopol: these plates become identical once spaces, dots and ' +
    'dashes are removed, and uq_fleet_vehicles_nopol_active allows only one active row per ' +
    'plate. Archive or correct the duplicates, then run the migration again. Colliding plates: ' +
    list
  )
}

// Requirement §1 wants plates stored closed-up (B9114KYZ). Existing rows were written under the
// old rule that kept one space between groups, so they are rewritten here.
//
// This migration can legitimately fail. Deciding which of two colliding units keeps the plate is
// an operator's call about real trucks, not something a migration may guess at, so it stops and
// names them rather than quietly archiving one.
export class FleetNopolNormalize20260912000001 implements MigrationInterface {
  name = 'FleetNopolNormalize20260912000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const clashes: { nopol: string; count: string }[] = await queryRunner.query(`
      SELECT ${STRIPPED} AS nopol, count(*)::text AS count
      FROM fleet_vehicles
      WHERE is_active
      GROUP BY 1
      HAVING count(*) > 1
      ORDER BY 1
    `)
    const message = describeNopolClashes(clashes)
    if (message) throw new Error(message)

    await queryRunner.query(`
      UPDATE fleet_vehicles SET nopol = ${STRIPPED} WHERE nopol <> ${STRIPPED}
    `)
  }

  // Deliberately a no-op. The original spacing is recorded nowhere, so "B9114KYZ" cannot be put
  // back as "B 9114 KYZ" — and guessing where the spaces went would invent data. Reverting this
  // migration leaves the plates closed-up, which the old normalizer still accepts as valid input.
  public async down(): Promise<void> {}
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-nopol-normalize`
Expected: PASS, 3 test.

- [ ] **Step 5: Jalankan migration terhadap database lokal**

Run: `cd apps/backend && pnpm migration:run`
Expected: `Migration FleetNopolNormalize20260912000001 has been executed successfully.`

Bila gagal dengan pesan "Colliding plates: …", itu perilaku yang benar — perbaiki atau arsipkan unit yang disebut lewat UI, lalu jalankan ulang.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/database/migrations/20260912000001-fleet-nopol-normalize.ts apps/backend/src/database/migrations/20260912000001-fleet-nopol-normalize.spec.ts
git commit -m "$(cat <<'EOF'
feat(fleet): normalise stored plates, refusing to guess which duplicate loses

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Dokumen wajib ditandai di master data

Spec §4.2. Kolom `is_required` sudah ada — yang kurang hanya nilainya untuk kategori `jenis_dokumen`.

**Files:**
- Create: `apps/backend/src/database/migrations/20260912000003-fleet-doc-required-flags.ts`

**Interfaces:**
- Consumes: —
- Produces: baris `fleet_master_data` kategori `jenis_dokumen` punya `is_required` non-null. Task 7 membacanya untuk menegakkan dokumen wajib; Task 14 membacanya untuk menandai field di form.

- [ ] **Step 1: Tulis migration**

Buat `apps/backend/src/database/migrations/20260912000003-fleet-doc-required-flags.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// jenis_dokumen was seeded with is_required NULL because only jenis_berkas used the flag at the
// time. Requirement §5 makes the vehicle documents mandatory, so the flag is filled in here
// rather than hardcoded in the service: Kartu Pengawasan is explicitly excused for non-public
// transport units, and an admin who changes that policy should be able to flip it from the
// Master Data screen instead of waiting for a deploy.
export class FleetDocRequiredFlags20260912000003 implements MigrationInterface {
  name = 'FleetDocRequiredFlags20260912000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = TRUE
      WHERE category = 'jenis_dokumen' AND code IN ('stnk','pajak','asuransi','emisi')
    `)
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = FALSE
      WHERE category = 'jenis_dokumen' AND code IN ('kir','kartu_pengawasan','servis')
    `)
  }

  // Back to NULL, the state the seed migration left them in. Restoring TRUE/FALSE per row would
  // claim to know a policy this migration is the one that introduced.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fleet_master_data SET is_required = NULL WHERE category = 'jenis_dokumen'
    `)
  }
}
```

- [ ] **Step 2: Jalankan migration**

Run: `cd apps/backend && pnpm migration:run`
Expected: `Migration FleetDocRequiredFlags20260912000003 has been executed successfully.`

- [ ] **Step 3: Pastikan tidak ada baris yang terlewat**

Run:
```bash
cd apps/backend && pnpm typeorm-query 2>/dev/null || \
  psql "$DATABASE_URL" -c "SELECT code, is_required FROM fleet_master_data WHERE category='jenis_dokumen' ORDER BY sort_order"
```
Expected: tujuh baris, tidak satu pun `is_required` kosong — `kir f`, `stnk t`, `pajak t`, `asuransi t`, `kartu_pengawasan f`, `emisi t`, `servis f`.

Bila `psql` tidak tersedia di mesin ini, lewati langkah ini; Task 7 punya test yang gagal bila flag-nya salah.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/migrations/20260912000003-fleet-doc-required-flags.ts
git commit -m "$(cat <<'EOF'
feat(fleet): flag which vehicle documents are mandatory in master data

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pencarian tetap mengenali ketikan berspasi

Requirement §1 kalimat terakhir: "Kolom pencarian tetap mengenali ketikan berspasi." Setelah Task 1 plat tersimpan `B9114KYZ`, jadi `ILIKE '%B 9114%'` tidak lagi cocok.

**Files:**
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts` (predikat `q` di `findAll`)
- Test: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeNopol` (Task 1)
- Produces: —

- [ ] **Step 1: Tulis test yang gagal**

Di `fleet-vehicles.service.spec.ts`, ganti test `'searches plate, make, type, chassis, engine and driver name'` dengan tiga test berikut (tetap di dalam `describe('findAll')`):

```ts
    // The search spans the plate, the make/model, both chassis numbers and the driver's name —
    // an operator holding a delivery note has one of those, not a UUID.
    it('searches plate, make, type, chassis, engine and driver name', async () => {
      await service.findAll({ q: 'canter' })
      const clause = andWhereCall('ILIKE')
      const sql = String(clause?.[0])
      expect(sql).toContain('v.nopol')
      expect(sql).toContain('v.merk')
      expect(sql).toContain('v.tipe')
      expect(sql).toContain('v.noRangka')
      expect(sql).toContain('v.noMesin')
      expect(sql).toContain('dr.nama')
    })

    // Plates are stored closed-up but operators type them spaced, the way they read off the
    // vehicle. Comparing the stripped column against the stripped term is what keeps "B 9114"
    // finding B9114KYZ; without it the search box silently returns nothing for the one format
    // every operator actually types.
    it('matches the plate with separators stripped from both sides', async () => {
      await service.findAll({ q: 'b 9114' })
      const clause = andWhereCall('ILIKE')
      expect(String(clause?.[0])).toContain('regexp_replace')
      expect(clause?.[1]).toEqual({ q: '%b 9114%', qNopol: '%B9114%' })
    })

    // Only the plate is stripped. Doing it to merk as well would make "Colt Diesel" match
    // "ColtDiesel" and, worse, make the driver name search ignore the spaces that separate names.
    it('leaves the other columns matching the term as typed', async () => {
      await service.findAll({ q: 'b 9114' })
      const sql = String(andWhereCall('ILIKE')?.[0])
      expect(sql).toContain('v.merk ILIKE :q')
      expect(sql).toContain('dr.nama ILIKE :q')
    })
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: FAIL pada dua test baru — `Expected substring: "regexp_replace"`.

- [ ] **Step 3: Ubah predikat pencarian**

Di `fleet-vehicles.service.ts`, ganti blok `if (q) { … }` di dalam `findAll`:

```ts
    const q = dto.q?.trim()
    if (q) {
      // The plate is stored closed-up (see normalizeNopol) but read aloud and typed spaced, so
      // both sides of that one comparison are stripped. The remaining columns match the term as
      // typed: stripping a driver's name would join their given and family names together.
      idQb.andWhere(
        `(regexp_replace(v.nopol, '[[:space:].-]', '', 'g') ILIKE :qNopol
          OR v.merk ILIKE :q OR v.tipe ILIKE :q
          OR v.noRangka ILIKE :q OR v.noMesin ILIKE :q OR dr.nama ILIKE :q)`,
        { q: `%${q}%`, qNopol: `%${normalizeNopol(q)}%` },
      )
    }
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: PASS seluruhnya.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(fleet): keep the search box finding plates typed with spaces

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tabel dan entity kontrak leasing

Spec §4.1. Tabel, entity, pendaftaran di module, dan satu baris di `REFERENCING_COLUMNS` — satu deliverable yang berdiri sendiri: setelah task ini kontrak bisa disimpan, walau belum ada yang menyimpannya.

**Files:**
- Create: `apps/backend/src/database/migrations/20260912000002-fleet-lease-contracts.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/entities/fleet-lease-contract.entity.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`
- Modify: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts`
- Test: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`

**Interfaces:**
- Consumes: —
- Produces: `FleetLeaseContractEntity` dengan properti `id, vehicleId, leasingId, nomorKontrak, cicilanPerBulan, tenorBulan, angsuranMulai, angsuranTerbayarOverride, closedAt, createdAt, updatedAt`. Dipakai Task 8.

- [ ] **Step 1: Tulis migration**

Buat `apps/backend/src/database/migrations/20260912000002-fleet-lease-contracts.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// A separate table rather than columns on fleet_vehicles, because a unit can be refinanced: the
// prototype kept only the latest contract and lost the one before it. A new contract closes the
// old one (closed_at) instead of overwriting it, so the credit history survives.
export class FleetLeaseContracts20260912000002 implements MigrationInterface {
  name = 'FleetLeaseContracts20260912000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fleet_lease_contracts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vehicle_id" uuid NOT NULL,
        "leasing_id" uuid,
        "nomor_kontrak" character varying(60),
        "cicilan_per_bulan" numeric(14,2),
        "tenor_bulan" integer,
        "angsuran_mulai" date,
        "angsuran_terbayar_override" integer,
        "closed_at" date,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_lease_contracts" PRIMARY KEY ("id")
      )
    `)

    // CASCADE: a contract has no meaning once its vehicle row is gone. RESTRICT on leasing_id for
    // the opposite reason — a finance company still referenced by a live contract must not be
    // deletable from Master Data.
    await queryRunner.query(`
      ALTER TABLE "fleet_lease_contracts"
        ADD CONSTRAINT "fk_fleet_lease_contracts_vehicle"
        FOREIGN KEY ("vehicle_id") REFERENCES "fleet_vehicles"("id") ON DELETE CASCADE
    `)
    await queryRunner.query(`
      ALTER TABLE "fleet_lease_contracts"
        ADD CONSTRAINT "fk_fleet_lease_contracts_leasing"
        FOREIGN KEY ("leasing_id") REFERENCES "fleet_master_data"("id") ON DELETE RESTRICT
    `)

    // Partial, so closed contracts accumulate freely while only one may be open. This is what
    // lets the service say "the lease" for a vehicle without having to pick among several.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_fleet_lease_contracts_open"
        ON "fleet_lease_contracts" ("vehicle_id") WHERE "closed_at" IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fleet_lease_contracts"`)
  }
}
```

- [ ] **Step 2: Jalankan migration**

Run: `cd apps/backend && pnpm migration:run`
Expected: `Migration FleetLeaseContracts20260912000002 has been executed successfully.`

- [ ] **Step 3: Tulis entity**

Buat `apps/backend/src/modules/fleet-vehicles/entities/fleet-lease-contract.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehicleEntity } from './fleet-vehicle.entity'

@Entity('fleet_lease_contracts')
export class FleetLeaseContractEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(() => FleetVehicleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: FleetVehicleEntity

  @Column({ name: 'leasing_id', type: 'uuid', nullable: true })
  leasingId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'leasing_id' })
  leasing?: FleetMasterDataEntity

  @Column({ name: 'nomor_kontrak', length: 60, nullable: true })
  nomorKontrak: string | null

  // numeric, not float: an instalment is money. TypeORM hands numeric back as a string, so the
  // service parses it once at the view boundary rather than letting a string leak into the sums.
  @Column({ name: 'cicilan_per_bulan', type: 'numeric', precision: 14, scale: 2, nullable: true })
  cicilanPerBulan: string | null

  @Column({ name: 'tenor_bulan', type: 'int', nullable: true })
  tenorBulan: number | null

  // date, not timestamptz — the same reasoning as the document columns: an instalment falls on a
  // calendar day, and an instant would shift it by timezone.
  @Column({ name: 'angsuran_mulai', type: 'date', nullable: true })
  angsuranMulai: string | null

  // Empty means "derive it from angsuran_mulai". Operators override it when a unit was taken
  // over mid-contract and the count no longer matches the start date.
  @Column({ name: 'angsuran_terbayar_override', type: 'int', nullable: true })
  angsuranTerbayarOverride: number | null

  @Column({ name: 'closed_at', type: 'date', nullable: true })
  closedAt: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 4: Daftarkan entity di module**

Di `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`, tambah import dan satu entry:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetVehiclesController } from './fleet-vehicles.controller'

@Module({
  // FleetMasterDataEntity is registered here so the service can check that a submitted id really
  // belongs to the category its column expects, the same way FleetDriversModule does for
  // jenis_sim.
  imports: [
    TypeOrmModule.forFeature([
      FleetVehicleEntity,
      FleetVehicleDocumentEntity,
      FleetLeaseContractEntity,
      FleetMasterDataEntity,
    ]),
  ],
  providers: [FleetVehiclesService],
  controllers: [FleetVehiclesController],
  exports: [FleetVehiclesService],
})
export class FleetVehiclesModule {}
```

- [ ] **Step 5: Tulis test untuk guard master data yang gagal**

Tambahkan di `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`, di dalam `describe` yang menguji `remove`:

```ts
  // Without this row in REFERENCING_COLUMNS, deleting a leasing company still used by an open
  // contract passes the service's own check and then fails on the FK as a 500. The operator sees
  // "Internal server error" instead of being told which rows still point at it.
  it('counts open lease contracts when deciding whether a leasing row is in use', async () => {
    await service.remove('m1')
    const sql = String(dataSource.query.mock.calls[0][0])
    expect(sql).toContain('fleet_lease_contracts')
    expect(sql).toContain('leasing_id')
  })
```

- [ ] **Step 6: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-master-data.service`
Expected: FAIL — `Expected substring: "fleet_lease_contracts"`.

- [ ] **Step 7: Daftarkan kolom referensi**

Di `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts`, tambah satu entry:

```ts
const REFERENCING_COLUMNS: { table: string; column: string }[] = [
  { table: 'fleet_drivers', column: 'sim_jenis_id' },
  { table: 'fleet_vehicles', column: 'jenis_armada_id' },
  { table: 'fleet_vehicles', column: 'kepemilikan_id' },
  { table: 'fleet_vehicles', column: 'pool_id' },
  { table: 'fleet_vehicles', column: 'status_id' },
  { table: 'fleet_vehicle_documents', column: 'doc_type_id' },
  { table: 'fleet_lease_contracts', column: 'leasing_id' },
]
```

- [ ] **Step 8: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-master-data.service`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/database/migrations/20260912000002-fleet-lease-contracts.ts apps/backend/src/modules/fleet-vehicles/entities/fleet-lease-contract.entity.ts apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts apps/backend/src/modules/fleet-master-data
git commit -m "$(cat <<'EOF'
feat(fleet): store lease contracts as rows so refinancing keeps its history

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Aritmetika angsuran

Spec §5.2. Backend menghitung `angsuranTerbayar`, `sisaAngsuran`, dan `sisaKewajiban` — frontend hanya menampilkan.

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-lease.ts`
- Test: `apps/backend/src/modules/fleet-vehicles/fleet-lease.spec.ts`

**Interfaces:**
- Consumes: `todayISO` dari `./fleet-severity` (Task 0, sudah ada)
- Produces:
  - `monthsBetween(fromISO: string, toISO: string): number`
  - `computeLease(input: LeaseMath, today?: string): LeaseTotals`
  - `interface LeaseMath { cicilanPerBulan: number | null; tenorBulan: number | null; angsuranMulai: string | null; angsuranTerbayarOverride: number | null }`
  - `interface LeaseTotals { angsuranTerbayar: number; sisaAngsuran: number; sisaKewajiban: number }`

  Dipakai Task 8.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/backend/src/modules/fleet-vehicles/fleet-lease.spec.ts`:

```ts
import { computeLease, monthsBetween } from './fleet-lease'

describe('monthsBetween', () => {
  it('counts whole months', () => {
    expect(monthsBetween('2026-01-10', '2026-04-10')).toBe(3)
  })

  // The day of month decides whether the month has actually elapsed. Counting it as whole would
  // bill the operator for an instalment a day before it is due.
  it('does not count a month that has not completed', () => {
    expect(monthsBetween('2026-01-10', '2026-04-09')).toBe(2)
  })

  it('counts a month that completed today', () => {
    expect(monthsBetween('2026-01-10', '2026-04-11')).toBe(3)
  })

  it('spans a year boundary', () => {
    expect(monthsBetween('2025-11-20', '2026-02-20')).toBe(3)
  })

  it('returns zero for the same day', () => {
    expect(monthsBetween('2026-01-10', '2026-01-10')).toBe(0)
  })

  // A start date in the future is a data-entry slip, not a negative instalment count.
  it('never goes negative', () => {
    expect(monthsBetween('2026-06-10', '2026-01-10')).toBe(0)
  })
})

describe('computeLease', () => {
  const base = {
    cicilanPerBulan: 8750000,
    tenorBulan: 36,
    angsuranMulai: '2026-01-10',
    angsuranTerbayarOverride: null,
  }

  // The instalment that falls on the start date is the first one paid, hence +1 — a contract
  // starting today has one instalment behind it, not zero.
  it('derives instalments paid from the start date, counting the first one', () => {
    expect(computeLease(base, '2026-04-10').angsuranTerbayar).toBe(4)
  })

  it('leaves the remaining count and value consistent with that', () => {
    const out = computeLease(base, '2026-04-10')
    expect(out.sisaAngsuran).toBe(32)
    expect(out.sisaKewajiban).toBe(32 * 8750000)
  })

  // A unit taken over mid-contract has a count that no longer matches its start date. The
  // override is the operator saying so, and it has to win.
  it('uses the override when one is given', () => {
    const out = computeLease({ ...base, angsuranTerbayarOverride: 12 }, '2026-04-10')
    expect(out.angsuranTerbayar).toBe(12)
    expect(out.sisaAngsuran).toBe(24)
  })

  it('treats an override of zero as a real answer, not as absent', () => {
    expect(computeLease({ ...base, angsuranTerbayarOverride: 0 }, '2026-04-10').angsuranTerbayar).toBe(0)
  })

  // Both directions clamped: a mistyped override must not report a negative remainder, and a
  // long-finished contract must not keep accruing instalments past its tenor.
  it('clamps an override above the tenor', () => {
    expect(computeLease({ ...base, angsuranTerbayarOverride: 99 }, '2026-04-10').angsuranTerbayar).toBe(36)
  })

  it('clamps a negative override to zero', () => {
    expect(computeLease({ ...base, angsuranTerbayarOverride: -5 }, '2026-04-10').angsuranTerbayar).toBe(0)
  })

  it('clamps a derived count at the tenor once the contract has run out', () => {
    const out = computeLease(base, '2030-01-10')
    expect(out.angsuranTerbayar).toBe(36)
    expect(out.sisaAngsuran).toBe(0)
    expect(out.sisaKewajiban).toBe(0)
  })

  // A contract with no start date and no override is one nobody has filled in yet. Reporting
  // "36 instalments outstanding" would be a guess dressed up as a figure.
  it('reports nothing paid when there is no start date and no override', () => {
    expect(computeLease({ ...base, angsuranMulai: null }, '2026-04-10').angsuranTerbayar).toBe(0)
  })

  it('treats a missing tenor as nothing outstanding', () => {
    const out = computeLease({ ...base, tenorBulan: null }, '2026-04-10')
    expect(out.sisaAngsuran).toBe(0)
    expect(out.sisaKewajiban).toBe(0)
  })

  it('treats a missing instalment amount as zero value outstanding', () => {
    const out = computeLease({ ...base, cicilanPerBulan: null }, '2026-04-10')
    expect(out.sisaAngsuran).toBe(32)
    expect(out.sisaKewajiban).toBe(0)
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-lease`
Expected: FAIL — `Cannot find module './fleet-lease'`.

- [ ] **Step 3: Tulis helper**

Buat `apps/backend/src/modules/fleet-vehicles/fleet-lease.ts`:

```ts
import { todayISO } from './fleet-severity'

export interface LeaseMath {
  cicilanPerBulan: number | null
  tenorBulan: number | null
  angsuranMulai: string | null
  angsuranTerbayarOverride: number | null
}

export interface LeaseTotals {
  angsuranTerbayar: number
  sisaAngsuran: number
  sisaKewajiban: number
}

// Calendar months, not elapsed days: instalments fall on a date, and 30-day arithmetic drifts a
// whole instalment over a three-year tenor. The day-of-month guard is what stops a month being
// counted before it has actually completed.
export function monthsBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`)
  const to = new Date(`${toISO}T00:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0

  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
  return Math.max(0, months)
}

// Every figure the lease section displays is computed here rather than in the browser, for the
// same reason document severity is: two clients in different timezones must not disagree about
// how much is left to pay.
export function computeLease(input: LeaseMath, today: string = todayISO()): LeaseTotals {
  const tenor = input.tenorBulan ?? 0
  const cicilan = input.cicilanPerBulan ?? 0

  let terbayar: number
  if (input.angsuranTerbayarOverride != null) {
    terbayar = input.angsuranTerbayarOverride
  } else if (input.angsuranMulai) {
    // +1 because the instalment due on the start date has been paid — a contract that started
    // today is one instalment in, not zero.
    terbayar = monthsBetween(input.angsuranMulai, today) + 1
  } else {
    terbayar = 0
  }
  terbayar = Math.max(0, Math.min(tenor, terbayar))

  const sisaAngsuran = Math.max(0, tenor - terbayar)
  return { angsuranTerbayar: terbayar, sisaAngsuran, sisaKewajiban: sisaAngsuran * cicilan }
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-lease`
Expected: PASS, 18 test.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/fleet-lease.ts apps/backend/src/modules/fleet-vehicles/fleet-lease.spec.ts
git commit -m "$(cat <<'EOF'
feat(fleet): compute instalments owed on the server, in calendar months

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: DTO — field wajib dan bentuk gabungan

Spec §5 dan §5.1. DTO menerima `lease` dan `documents`, dan menegakkan field wajib. `pemilikUnit` bersyarat tidak di sini — butuh baca master data, dikerjakan Task 8.

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/dto/fleet-lease.dto.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.ts`
- Test: `apps/backend/src/modules/fleet-vehicles/dto/fleet-lease.dto.spec.ts`
- Test: `apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.spec.ts`

**Interfaces:**
- Consumes: `FleetVehicleDocumentDto` dari `./replace-fleet-vehicle-documents.dto` (sudah ada)
- Produces: `FleetLeaseDto` dengan `leasingId, nomorKontrak, cicilanPerBulan, tenorBulan, angsuranMulai, angsuranTerbayar`; `CreateFleetVehicleDto` bertambah `lease?: FleetLeaseDto | null` dan `documents?: FleetVehicleDocumentDto[]`. Dipakai Task 8.

- [ ] **Step 1: Tulis test DTO leasing yang gagal**

Buat `apps/backend/src/modules/fleet-vehicles/dto/fleet-lease.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { FleetLeaseDto } from './fleet-lease.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(FleetLeaseDto, {
    leasingId: '3f2504e0-4f89-41d3-9a0c-0305e82c3401',
    nomorKontrak: 'MTF-2024-03-11872',
    cicilanPerBulan: 8750000,
    tenorBulan: 36,
    angsuranMulai: '2026-01-10',
    angsuranTerbayar: 4,
    ...overrides,
  })

describe('FleetLeaseDto', () => {
  it('accepts a fully specified contract', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // Requirement §2: every lease field is mandatory except the paid count, which the backend
  // derives when it is left blank.
  it.each(['leasingId', 'nomorKontrak', 'cicilanPerBulan', 'tenorBulan', 'angsuranMulai'])(
    'rejects a contract missing %s',
    async (field) => {
      const errors = await validate(build({ [field]: undefined }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )

  it('accepts a contract with no angsuranTerbayar', async () => {
    expect(await validate(build({ angsuranTerbayar: undefined }))).toHaveLength(0)
  })

  it('rejects a leasingId that is not a UUID', async () => {
    const errors = await validate(build({ leasingId: 'mtf' }))
    expect(errors.map((e) => e.property)).toContain('leasingId')
  })

  it('rejects a nomorKontrak longer than the 60-char column', async () => {
    const errors = await validate(build({ nomorKontrak: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('nomorKontrak')
  })

  // Requirement §2 spells out "bilangan bulat tanpa pemisah ribuan". A negative instalment is a
  // typo, and money owed is never negative.
  it('rejects a negative cicilanPerBulan', async () => {
    const errors = await validate(build({ cicilanPerBulan: -1 }))
    expect(errors.map((e) => e.property)).toContain('cicilanPerBulan')
  })

  it('rejects a non-numeric cicilanPerBulan', async () => {
    const errors = await validate(build({ cicilanPerBulan: 'delapan juta' }))
    expect(errors.map((e) => e.property)).toContain('cicilanPerBulan')
  })

  // A zero tenor would make sisaAngsuran zero for a contract that plainly has instalments left,
  // so the floor is 1 rather than 0.
  it('rejects a tenor of zero', async () => {
    const errors = await validate(build({ tenorBulan: 0 }))
    expect(errors.map((e) => e.property)).toContain('tenorBulan')
  })

  it('rejects a fractional tenor', async () => {
    const errors = await validate(build({ tenorBulan: 12.5 }))
    expect(errors.map((e) => e.property)).toContain('tenorBulan')
  })

  it('rejects an angsuranMulai that is not a date', async () => {
    const errors = await validate(build({ angsuranMulai: '10 Januari' }))
    expect(errors.map((e) => e.property)).toContain('angsuranMulai')
  })

  it('rejects a negative angsuranTerbayar', async () => {
    const errors = await validate(build({ angsuranTerbayar: -1 }))
    expect(errors.map((e) => e.property)).toContain('angsuranTerbayar')
  })

  it('accepts an angsuranTerbayar of zero', async () => {
    expect(await validate(build({ angsuranTerbayar: 0 }))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-lease.dto`
Expected: FAIL — `Cannot find module './fleet-lease.dto'`.

- [ ] **Step 3: Tulis DTO leasing**

Buat `apps/backend/src/modules/fleet-vehicles/dto/fleet-lease.dto.ts`:

```ts
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator'

// Requirement §2 makes every field here mandatory except angsuranTerbayar. The columns stay
// nullable so rows written before this rule existed remain readable; the rule lives at the entry
// point, where it applies to new writes only.
export class FleetLeaseDto {
  @IsUUID()
  leasingId: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nomorKontrak: string

  // numeric(14,2) in the column, so a decimal is accepted even though operators type whole
  // rupiah. maxDecimalPlaces guards the scale that column actually holds.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cicilanPerBulan: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  tenorBulan: number

  @IsDateString()
  angsuranMulai: string

  // The one optional field: blank means "work it out from angsuranMulai" (spec §5.2).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  angsuranTerbayar?: number | null
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-lease.dto`
Expected: PASS, 14 test.

- [ ] **Step 5: Tulis test field wajib kendaraan yang gagal**

Di `apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.spec.ts`:

Hapus test `'accepts a vehicle carrying only a plate'` (aturannya berubah: sebuah unit tidak lagi boleh didaftarkan hanya dengan plat), lalu tambahkan di dalam `describe('CreateFleetVehicleDto')`:

```ts
  // Requirement §1 and §3: the identity block plus the pool are what make a register row usable.
  // Enforced here rather than only in the form, so an API client cannot write the half-filled
  // rows the form refuses.
  it.each([
    'merk',
    'tipe',
    'jenisArmadaId',
    'tahun',
    'kapasitas',
    'noRangka',
    'noMesin',
    'noBpkb',
    'poolId',
  ])('rejects a vehicle missing %s', async (field) => {
    const errors = await validate(build({ [field]: undefined }))
    expect(errors.map((e) => e.property)).toContain(field)
  })

  it.each(['merk', 'tipe', 'kapasitas', 'noRangka', 'noMesin', 'noBpkb'])(
    'rejects an empty %s',
    async (field) => {
      const errors = await validate(build({ [field]: '   ' }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )

  // Requirement §3 keeps these optional: a unit can be registered before a driver is assigned to
  // it, and the odometer is read at the next service.
  it.each(['driverId', 'statusId', 'odometer', 'catatan'])(
    'accepts a vehicle with no %s',
    async (field) => {
      expect(await validate(build({ [field]: undefined }))).toHaveLength(0)
    },
  )

  // The nested rules only run with both @ValidateNested and @Type. Without them the lease and
  // documents reach the service unvalidated and fail at insert time as a 500.
  it('validates the nested lease', async () => {
    const errors = await validate(build({ lease: { leasingId: 'not-a-uuid' } }))
    expect(errors.map((e) => e.property)).toContain('lease')
  })

  it('accepts a vehicle with no lease at all', async () => {
    expect(await validate(build({ lease: undefined }))).toHaveLength(0)
  })

  it('validates the nested documents', async () => {
    const errors = await validate(build({ documents: [{ docTypeId: 'not-a-uuid' }] }))
    expect(errors.map((e) => e.property)).toContain('documents')
  })

  it('accepts a valid document list', async () => {
    const errors = await validate(
      build({
        documents: [
          {
            docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3501',
            nomor: 'STNK-1',
            issuedAt: '2026-01-10',
            expiresAt: '2031-01-10',
          },
        ],
      }),
    )
    expect(errors).toHaveLength(0)
  })
```

Dan di helper `build` di puncak file, tambahkan `lease` yang sah supaya tiap test hanya merusak satu hal:

```ts
const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(CreateFleetVehicleDto, {
    nopol: 'B9114KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter',
    tahun: 2021,
    kapasitas: '8 ton',
    noRangka: 'MHMFE74P5MK000111',
    noMesin: '4D34T-000111',
    noBpkb: 'M-01234567',
    pemilikUnit: 'PT Sumber Jaya',
    odometer: 120000,
    catatan: 'Servis rutin tiap 10.000 km',
    jenisArmadaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    kepemilikanId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
    poolId: '3f2504e0-4f89-41d3-9a0c-0305e82c3303',
    statusId: '3f2504e0-4f89-41d3-9a0c-0305e82c3304',
    driverId: '3f2504e0-4f89-41d3-9a0c-0305e82c3305',
    lease: {
      leasingId: '3f2504e0-4f89-41d3-9a0c-0305e82c3401',
      nomorKontrak: 'MTF-2024-03-11872',
      cicilanPerBulan: 8750000,
      tenorBulan: 36,
      angsuranMulai: '2026-01-10',
    },
    ...overrides,
  })
```

- [ ] **Step 6: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand create-fleet-vehicle.dto`
Expected: FAIL pada test `rejects a vehicle missing merk` dan seterusnya — field-nya masih `@IsOptional()`.

- [ ] **Step 7: Ubah DTO kendaraan**

Ganti seluruh isi `apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.ts`:

```ts
import { Type } from 'class-transformer'
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { FleetLeaseDto } from './fleet-lease.dto'
import { FleetVehicleDocumentDto } from './replace-fleet-vehicle-documents.dto'

// Requirement §1 makes the whole identity block mandatory and §3 adds the pool. The columns stay
// nullable so rows written before this rule existed still read back; the rule applies to writes.
export class CreateFleetVehicleDto {
  // The service normalises the plate before storing it, so validation only guards the column
  // width and rejects an outright empty string.
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nopol: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  merk: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  tipe: string

  // A model year, not a count. The bounds keep a mistyped 20021 out of the integer column while
  // staying wide enough for the oldest unit anyone still runs.
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  tahun: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  kapasitas: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  noRangka: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  noMesin: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  noBpkb: string

  // Conditional, not optional: required only for a sewa lepas kunci unit. The check needs the
  // kepemilikan row's code, which means a master-data read, so it lives in the service — a DTO
  // has no repository. See Task 8.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pemilikUnit?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometer?: number | null

  @IsOptional()
  @IsString()
  catatan?: string | null

  @IsUUID()
  jenisArmadaId: string

  @IsUUID()
  kepemilikanId: string

  @IsUUID()
  poolId: string

  @IsOptional()
  @IsUUID()
  statusId?: string | null

  @IsOptional()
  @IsUUID()
  driverId?: string | null

  // @ValidateNested with @Type is what makes the nested rules run at all. Without both, the lease
  // is accepted as-is and reaches the service unvalidated. @IsObject rejects a bare string before
  // the nested validator is handed something it cannot walk.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FleetLeaseDto)
  lease?: FleetLeaseDto | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FleetVehicleDocumentDto)
  documents?: FleetVehicleDocumentDto[]
}
```

- [ ] **Step 8: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand create-fleet-vehicle.dto`
Expected: PASS.

- [ ] **Step 9: Rapikan test yang ikut terdampak**

`update-fleet-vehicle.dto.spec.ts` memakai `PartialType`, jadi aturan wajib di atas menjadi opsional di sana — perilaku yang memang diinginkan untuk PATCH. Tambahkan satu test yang mengunci itu, di dalam `describe('UpdateFleetVehicleDto')`:

```ts
  // PartialType must keep every field optional even now that Create demands them: a PATCH that
  // renews one document has no business resending the chassis number.
  it('accepts a patch carrying only one field', async () => {
    const dto = plainToInstance(UpdateFleetVehicleDto, { odometer: 130000 })
    expect(await validate(dto)).toHaveLength(0)
  })
```

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicle.dto`
Expected: PASS seluruhnya.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/dto
git commit -m "$(cat <<'EOF'
feat(fleet): demand the identity block and accept lease and documents inline

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Satu transaksi untuk kendaraan, kontrak, dan dokumen

Spec §5, §5.1 (bersyarat `pemilikUnit`), §5.2, dan test wajib §8 ("transaksi gabungan membatalkan kendaraan bila dokumen gagal"). Task terbesar di plan ini, tetapi tidak bisa dipecah: transaksi, guard, dan view-nya hanya berarti bersama.

**Files:**
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.constants.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.ts`
- Test: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts`

**Interfaces:**
- Consumes: `FleetLeaseContractEntity` (Task 5), `computeLease`/`LeaseTotals` (Task 6), `FleetLeaseDto` (Task 7)
- Produces:
  - `SEWA_LEPAS_KUNCI_CODE = 'sewa_lepas_kunci'` di `fleet-vehicles.constants.ts`
  - `FleetVehicleLeaseView { id, leasing: FleetMasterRef | null, nomorKontrak, cicilanPerBulan: number | null, tenorBulan, angsuranMulai, angsuranTerbayar, sisaAngsuran, sisaKewajiban }`
  - `FleetVehicleView` bertambah `lease: FleetVehicleLeaseView | null`
  - `CreateInput` bertambah `lease?: LeaseInput | null` dan `documents?: DocumentInput[]`

  Dipakai Task 12 dan Task 18.

- [ ] **Step 1: Tambahkan tipe view leasing**

Di `fleet-vehicles.types.ts`, tambahkan interface berikut sebelum `FleetVehicleView`:

```ts
// Every figure here is settled by the backend (spec §5.2). cicilanPerBulan is a number, not the
// string TypeORM hands back from a numeric column, so the frontend never has to decide how to
// parse money.
export interface FleetVehicleLeaseView {
  id: string
  leasing: FleetMasterRef | null
  nomorKontrak: string | null
  cicilanPerBulan: number | null
  tenorBulan: number | null
  angsuranMulai: string | null
  // What the operator typed, or null when they left it blank — reported next to the figure the
  // backend worked out, because the edit form must be able to tell the two apart. Prefilling the
  // input from angsuranTerbayar would turn a derived count into a fixed one on the next save,
  // and the unit would stop counting up.
  angsuranTerbayarOverride: number | null
  angsuranTerbayar: number
  sisaAngsuran: number
  sisaKewajiban: number
}
```

Lalu di `FleetVehicleView`, tambahkan satu field tepat setelah `driver`:

```ts
  lease: FleetVehicleLeaseView | null
```

Dan ganti komentar di atas `FleetVehicleView` — `activeContract` kini ada:

```ts
// berkasCount is deliberately absent until Phase 3, when object storage exists. The frontend wire
// type marks it optional, so switching it on later adds a field rather than breaking the contract.
```

- [ ] **Step 2: Tambahkan konstanta kode kepemilikan**

Di akhir `fleet-vehicles.constants.ts`:

```ts
// The one kepemilikan code the service branches on: a rented unit has an owner outside the
// company, and requirement §2 makes naming them mandatory for exactly that case. Matched by code
// rather than by id because ids differ per environment while the seeded code does not.
export const SEWA_LEPAS_KUNCI_CODE = 'sewa_lepas_kunci'
```

- [ ] **Step 3: Tulis test yang gagal**

Tambahkan ke `fleet-vehicles.service.spec.ts`. Pertama, lengkapi harness-nya — `txManager` butuh `findOne` dan `delete`, dan `masterRepo.findOne` harus bisa membedakan kategori:

```ts
    masterRepo = {
      findOne: jest.fn(async (opts: { where: { id: string; category: string } }) => {
        const { id, category } = opts.where
        if (category === 'kepemilikan') return { id, category, code: 'milik_gms' }
        return { id, category }
      }),
    }
    txManager = {
      update: jest.fn(),
      insert: jest.fn(),
      save: jest.fn(async (_e, v) => ({ id: 'v-new', ...(v as object) })),
      create: jest.fn((_e, v) => v),
      findOne: jest.fn(async () => null),
    }
```

Lalu tambahkan satu `describe` baru di akhir file, sebelum kurung penutup terluar:

```ts
  describe('create with lease and documents', () => {
    const payload = () => ({
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      tipe: 'Canter',
      lease: {
        leasingId: 'ls-1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayar: 4,
      },
      documents: [{ docTypeId: 'dt-kir', nomor: 'JKT-II/1', expiresAt: inDays(30) }],
    })

    // The point of the combined endpoint: one operator action is one transaction. Saving the
    // vehicle outside it would leave a unit registered with no papers whenever the document
    // insert fails, and nothing on screen to say which half went in.
    it('writes the vehicle, the contract and the documents in one transaction', async () => {
      await service.create(payload())
      expect(dataSource.transaction).toHaveBeenCalledTimes(1)
      expect(repo.save).not.toHaveBeenCalled()
      expect(txManager.save).toHaveBeenCalled()
      expect(txManager.insert).toHaveBeenCalled()
    })

    // Spec §8 pins this explicitly. The assertion is that the failure propagates rather than
    // being swallowed — the rollback itself is the transaction's job, and letting the error out
    // is what triggers it.
    it('lets a document failure abort the whole save', async () => {
      txManager.insert.mockRejectedValueOnce(new Error('insert failed'))
      await expect(service.create(payload())).rejects.toThrow('insert failed')
    })

    it('stores the contract against the vehicle it just created', async () => {
      await service.create(payload())
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall?.[1]).toMatchObject({ vehicleId: 'v-new', leasingId: 'ls-1' })
    })

    // The override column carries the operator's answer; the DTO field is named for what the
    // operator sees. Wiring one to the other by the wrong name silently discards the override
    // and the figure reverts to the derived one on the next read.
    it('stores angsuranTerbayar in the override column', async () => {
      await service.create(payload())
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall?.[1]).toMatchObject({ angsuranTerbayarOverride: 4 })
    })

    it('leaves the override null when the operator left the field blank', async () => {
      const dto = payload()
      dto.lease.angsuranTerbayar = undefined as unknown as number
      await service.create(dto)
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall?.[1]).toMatchObject({ angsuranTerbayarOverride: null })
    })

    it('saves a vehicle with no lease at all', async () => {
      const dto = payload()
      dto.lease = null as never
      await service.create(dto)
      const contractCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(contractCall).toBeUndefined()
    })

    // Requirement §2: a rented unit's owner is someone outside the company, and a register that
    // does not name them cannot answer who to return the truck to.
    it('rejects a sewa lepas kunci unit with no pemilikUnit', async () => {
      masterRepo.findOne.mockImplementation(async (opts: { where: { id: string; category: string } }) =>
        opts.where.category === 'kepemilikan'
          ? { id: opts.where.id, category: 'kepemilikan', code: 'sewa_lepas_kunci' }
          : { id: opts.where.id, category: opts.where.category },
      )
      await expect(
        service.create({ ...payload(), kepemilikanId: 'kp-sewa', pemilikUnit: null }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('accepts a sewa lepas kunci unit that names its owner', async () => {
      masterRepo.findOne.mockImplementation(async (opts: { where: { id: string; category: string } }) =>
        opts.where.category === 'kepemilikan'
          ? { id: opts.where.id, category: 'kepemilikan', code: 'sewa_lepas_kunci' }
          : { id: opts.where.id, category: opts.where.category },
      )
      await expect(
        service.create({ ...payload(), kepemilikanId: 'kp-sewa', pemilikUnit: 'CV Andalan' }),
      ).resolves.toBeDefined()
    })

    // A company-owned unit has no external owner to name, so demanding one would block every
    // normal registration.
    it('does not demand pemilikUnit for a company-owned unit', async () => {
      await expect(service.create({ ...payload(), pemilikUnit: null })).resolves.toBeDefined()
    })
  })

  describe('update with a replacement lease', () => {
    // A refinanced unit gets a new contract; the old one is closed, not overwritten. Overwriting
    // is what the prototype did, and it is why no unit there could show what it used to pay.
    it('closes the open contract instead of overwriting it', async () => {
      txManager.findOne.mockResolvedValueOnce({ id: 'lc-old', vehicleId: 'v1', closedAt: null })
      await service.update('v1', {
        lease: {
          leasingId: 'ls-2',
          nomorKontrak: 'MTF-2',
          cicilanPerBulan: 9000000,
          tenorBulan: 24,
          angsuranMulai: '2026-06-01',
        },
      })
      const closeCall = txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])
      expect(closeCall?.[2].closedAt).toEqual(expect.any(String))
    })

    it('opens the replacement contract in the same transaction', async () => {
      txManager.findOne.mockResolvedValueOnce({ id: 'lc-old', vehicleId: 'v1', closedAt: null })
      await service.update('v1', {
        lease: {
          leasingId: 'ls-2',
          nomorKontrak: 'MTF-2',
          cicilanPerBulan: 9000000,
          tenorBulan: 24,
          angsuranMulai: '2026-06-01',
        },
      })
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall?.[1]).toMatchObject({ nomorKontrak: 'MTF-2', closedAt: null })
    })

    // An explicit null is the operator saying the unit is no longer financed. Leaving the old
    // contract open would keep reporting instalments on a truck that is paid off.
    it('closes the contract and opens no replacement when lease is null', async () => {
      txManager.findOne.mockResolvedValueOnce({ id: 'lc-old', vehicleId: 'v1', closedAt: null })
      await service.update('v1', { lease: null })
      expect(txManager.update.mock.calls.find((c) => c[2] && 'closedAt' in c[2])).toBeDefined()
      const openCall = txManager.save.mock.calls.find((c) =>
        Object.prototype.hasOwnProperty.call(c[1], 'nomorKontrak'),
      )
      expect(openCall).toBeUndefined()
    })

    // Absent means "leave it alone" — the same patch semantics every other field has. A PATCH
    // that only bumps the odometer must not close the lease.
    it('leaves the contract untouched when lease is absent', async () => {
      await service.update('v1', { odometer: 130000 })
      expect(txManager.findOne).not.toHaveBeenCalled()
    })
  })

  describe('lease view', () => {
    // The view carries figures, not raw columns: the frontend renders sisaKewajiban and must
    // never be the place that multiplies it out (spec §5.2).
    it('reports the instalments paid, remaining and still owed', async () => {
      leaseRepo.find.mockResolvedValueOnce([{
        id: 'lc-1',
        vehicleId: 'v1',
        leasingId: 'ls-1',
        leasing: { id: 'ls-1', label: 'MTF' },
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: '8750000.00',
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: 4,
        closedAt: null,
      }])
      const view = await service.findOne('v1')
      expect(view.lease).toMatchObject({
        nomorKontrak: 'MTF-1',
        angsuranTerbayar: 4,
        sisaAngsuran: 32,
        sisaKewajiban: 32 * 8750000,
      })
    })

    // numeric columns come back from pg as strings. Left as one, cicilanPerBulan * sisaAngsuran
    // in any consumer becomes string repetition or NaN.
    it('hands back the instalment amount as a number', async () => {
      leaseRepo.find.mockResolvedValueOnce([{
        id: 'lc-1',
        vehicleId: 'v1',
        leasingId: null,
        leasing: null,
        nomorKontrak: null,
        cicilanPerBulan: '8750000.00',
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: 4,
        closedAt: null,
      }])
      const view = await service.findOne('v1')
      expect(view.lease?.cicilanPerBulan).toBe(8750000)
    })

    // The derived count and the typed one are reported separately. Collapsed into one field, the
    // edit form cannot tell "the operator said four" from "four months have passed", and saving
    // an untouched form would pin a rising count in place.
    it('distinguishes an override the operator typed from a derived count', async () => {
      leaseRepo.find.mockResolvedValueOnce([{
        id: 'lc-1',
        vehicleId: 'v1',
        leasingId: null,
        leasing: null,
        nomorKontrak: null,
        cicilanPerBulan: '8750000.00',
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: null,
        closedAt: null,
      }])
      const view = await service.findOne('v1')
      expect(view.lease?.angsuranTerbayarOverride).toBeNull()
      expect(typeof view.lease?.angsuranTerbayar).toBe('number')
    })

    it('reports no lease for a unit that has no open contract', async () => {
      leaseRepo.find.mockResolvedValueOnce([])
      const view = await service.findOne('v1')
      expect(view.lease).toBeNull()
    })
  })
```

Harness-nya juga butuh repository kontrak. Tambahkan deklarasi di sisi `docRepo`:

```ts
  let leaseRepo: { find: jest.Mock }
```

inisialisasi di `beforeEach`:

```ts
    leaseRepo = { find: jest.fn(async () => []) }
```

dan provider-nya (impor `FleetLeaseContractEntity` di puncak file dari `./entities/fleet-lease-contract.entity`):

```ts
        { provide: getRepositoryToken(FleetLeaseContractEntity), useValue: leaseRepo },
```

- [ ] **Step 4: Jalankan dan pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: FAIL — `Nest can't resolve dependencies` hilang setelah provider ditambah, lalu gagal pada `expect(repo.save).not.toHaveBeenCalled()` karena `create` masih menulis di luar transaksi.

- [ ] **Step 5: Perluas input service**

Di `fleet-vehicles.service.ts`, tambahkan interface `LeaseInput` di bawah `DocumentInput` dan perluas `CreateInput`:

```ts
export interface LeaseInput {
  leasingId: string
  nomorKontrak: string
  cicilanPerBulan: number
  tenorBulan: number
  angsuranMulai: string
  angsuranTerbayar?: number | null
}
```

Lalu di `CreateInput`, tambahkan dua field di akhir:

```ts
  // Present means "make this the open contract". Explicit null means "this unit is no longer
  // financed" — the distinction update() relies on, which is why this is not just optional.
  lease?: LeaseInput | null
  documents?: DocumentInput[]
```

- [ ] **Step 6: Tulis implementasinya**

Tambahkan import di puncak `fleet-vehicles.service.ts`:

```ts
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { computeLease } from './fleet-lease'
import { SEWA_LEPAS_KUNCI_CODE } from './fleet-vehicles.constants'
import { FleetVehicleLeaseView } from './fleet-vehicles.types'
```

(`SEWA_LEPAS_KUNCI_CODE` ikut ke dalam blok import `./fleet-vehicles.constants` yang sudah ada; `FleetVehicleLeaseView` ke blok `./fleet-vehicles.types` yang sudah ada.)

Tambahkan repository di constructor, setelah `masterRepo`:

```ts
    @InjectRepository(FleetLeaseContractEntity)
    private readonly leaseRepo: Repository<FleetLeaseContractEntity>,
```

Ganti `create` seluruhnya:

```ts
  // Vehicle, contract and documents go in together or not at all. Splitting them would let a
  // unit land in the register with no papers whenever the second write fails, leaving the
  // operator to guess which half to redo.
  async create(dto: CreateInput): Promise<FleetVehicleView> {
    const nopol = normalizeNopol(dto.nopol)
    if (!nopol) throw new BadRequestException('nopol must not be blank')

    await this.assertMasterRefs(dto)
    await this.assertOwnerNamedWhenRented(dto.kepemilikanId, dto.pemilikUnit)
    await this.assertDocumentPayload(dto.documents)
    await this.assertNopolFree(nopol)

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const saved = (await manager.save(FleetVehicleEntity, {
          nopol,
          merk: this.blankToNull(dto.merk),
          tipe: this.blankToNull(dto.tipe),
          tahun: dto.tahun ?? null,
          kapasitas: this.blankToNull(dto.kapasitas),
          noRangka: this.blankToNull(dto.noRangka),
          noMesin: this.blankToNull(dto.noMesin),
          noBpkb: this.blankToNull(dto.noBpkb),
          pemilikUnit: this.blankToNull(dto.pemilikUnit),
          odometer: dto.odometer ?? null,
          catatan: this.blankToNull(dto.catatan),
          jenisArmadaId: dto.jenisArmadaId ?? null,
          kepemilikanId: dto.kepemilikanId ?? null,
          poolId: dto.poolId ?? null,
          statusId: dto.statusId ?? null,
          driverId: dto.driverId ?? null,
        })) as { id: string }

        if (dto.lease) await this.openContract(manager, saved.id, dto.lease)
        if (dto.documents) await this.writeDocuments(manager, saved.id, dto.documents)
        return saved.id
      })
      return this.findOne(id)
    } catch (err: unknown) {
      this.throwIfNopolViolation(err, nopol)
      throw err
    }
  }
```

Di `update`, sisipkan guard pemilik tepat setelah `await this.assertMasterRefs(dto)`:

```ts
    // The rented-unit rule is checked against whatever the row will hold after this patch, not
    // against the patch alone: changing only kepemilikan to sewa must still demand an owner, and
    // clearing only pemilikUnit on an already-rented unit must be refused.
    await this.assertOwnerNamedWhenRented(
      dto.kepemilikanId !== undefined ? dto.kepemilikanId : existing.kepemilikanId,
      dto.pemilikUnit !== undefined ? dto.pemilikUnit : existing.pemilikUnit,
    )
    await this.assertDocumentPayload(dto.documents)
```

lalu ganti blok penulisan di akhir `update` (mulai dari `if (Object.keys(patch).length > 0) {` sampai `return this.findOne(id)`):

```ts
    const touchesLease = dto.lease !== undefined
    const touchesDocs = dto.documents !== undefined

    if (Object.keys(patch).length > 0 || touchesLease || touchesDocs) {
      try {
        await this.dataSource.transaction(async (manager) => {
          if (Object.keys(patch).length > 0) {
            await manager.update(FleetVehicleEntity, id, patch)
          }
          if (touchesLease) {
            // Closed, never overwritten: a refinanced unit keeps what it used to pay. null means
            // the unit is no longer financed, so the old contract closes with no replacement.
            const open = await manager.findOne(FleetLeaseContractEntity, {
              where: { vehicleId: id, closedAt: IsNull() },
            })
            if (open) {
              await manager.update(FleetLeaseContractEntity, open.id, { closedAt: todayISO() })
            }
            if (dto.lease) await this.openContract(manager, id, dto.lease)
          }
          if (touchesDocs) await this.writeDocuments(manager, id, dto.documents ?? [])
        })
      } catch (err: unknown) {
        this.throwIfNopolViolation(err, String(patch.nopol ?? existing.nopol))
        throw err
      }
    }
    return this.findOne(id)
  }
```

Tambahkan `IsNull` ke import `typeorm` di puncak file:

```ts
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm'
```

Ganti isi `replaceDocuments` supaya memakai helper yang sama, sehingga kedua jalur menulis dokumen dengan aturan yang persis sama:

```ts
  // The whole document set replaces the old one, because that is the shape of the form. Kept
  // alongside the combined endpoint for quick renewals that do not need the full form open.
  async replaceDocuments(id: string, docs: DocumentInput[]): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    await this.assertDocumentPayload(docs)
    await this.dataSource.transaction((manager) => this.writeDocuments(manager, id, docs))
    return this.findOne(id)
  }
```

Tambahkan lima private method, sebelum `private applySort`:

```ts
  // A type present with an unchanged expiry keeps its row; a changed expiry supersedes the old
  // row rather than overwriting it, which is what preserves the renewal history the prototype
  // threw away. Everything is retired first, then the submitted set is inserted fresh: in that
  // order, inside one transaction, uq_fleet_vehicle_documents_current holds at commit time
  // without having to diff old against new.
  private async writeDocuments(
    manager: EntityManager,
    vehicleId: string,
    docs: DocumentInput[],
  ): Promise<void> {
    await manager.update(
      FleetVehicleDocumentEntity,
      { vehicleId, isCurrent: true },
      { isCurrent: false },
    )
    for (const doc of docs) {
      await manager.insert(FleetVehicleDocumentEntity, {
        vehicleId,
        docTypeId: doc.docTypeId,
        nomor: this.blankToNull(doc.nomor),
        issuedAt: doc.issuedAt || null,
        expiresAt: doc.expiresAt || null,
        isCurrent: true,
      })
    }
  }

  private async openContract(
    manager: EntityManager,
    vehicleId: string,
    lease: LeaseInput,
  ): Promise<void> {
    await manager.save(FleetLeaseContractEntity, {
      vehicleId,
      leasingId: lease.leasingId,
      nomorKontrak: this.blankToNull(lease.nomorKontrak),
      cicilanPerBulan: lease.cicilanPerBulan == null ? null : String(lease.cicilanPerBulan),
      tenorBulan: lease.tenorBulan ?? null,
      angsuranMulai: lease.angsuranMulai || null,
      // Blank means "derive it from the start date" (spec §5.2), so an absent value must reach
      // the column as null rather than as 0 — 0 is a real answer meaning nothing has been paid.
      angsuranTerbayarOverride: lease.angsuranTerbayar ?? null,
      closedAt: null,
    })
  }

  // Duplicate types and unknown types are both rejected before any write starts, so a bad payload
  // never gets as far as a half-applied transaction.
  private async assertDocumentPayload(docs?: DocumentInput[]): Promise<void> {
    if (!docs) return
    const seen = new Set<string>()
    for (const doc of docs) {
      if (seen.has(doc.docTypeId)) {
        throw new BadRequestException(`Duplicate document type in payload: ${doc.docTypeId}`)
      }
      seen.add(doc.docTypeId)
    }
    await this.assertDocTypes([...seen])
  }

  // Requirement §2: a rented unit belongs to someone outside the company, and a register that
  // does not name them cannot answer who the truck goes back to. Checked here rather than in the
  // DTO because it needs the kepemilikan row's code, and a DTO has no repository.
  private async assertOwnerNamedWhenRented(
    kepemilikanId?: string | null,
    pemilikUnit?: string | null,
  ): Promise<void> {
    if (!kepemilikanId) return
    if (this.blankToNull(pemilikUnit)) return
    const row = await this.masterRepo.findOne({
      where: { id: kepemilikanId, category: 'kepemilikan' },
    })
    if (row?.code === SEWA_LEPAS_KUNCI_CODE) {
      throw new BadRequestException('pemilikUnit is required for a sewa lepas kunci vehicle')
    }
  }

  private toLeaseView(row: FleetLeaseContractEntity | null): FleetVehicleLeaseView | null {
    if (!row) return null
    // pg hands numeric back as a string. Parsed once here so no consumer has to decide how.
    const cicilan = row.cicilanPerBulan == null ? null : Number(row.cicilanPerBulan)
    const totals = computeLease({
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
    })
    return {
      id: row.id,
      leasing: this.toRef(row.leasing),
      nomorKontrak: row.nomorKontrak,
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
      ...totals,
    }
  }
```

- [ ] **Step 7: Muat kontrak ke dalam view**

Di `loadViews`, tambahkan satu query setelah query `docs` dan index-nya:

```ts
    // Only the open contract. Closed ones are history and have no figures to report.
    const leases = await this.leaseRepo.find({
      where: { vehicleId: In(ids), closedAt: IsNull() },
      relations: { leasing: true },
    })
    const leaseByVehicle = new Map(leases.map((l) => [l.vehicleId, l]))
```

Ubah pemanggilan `toView` di akhir `loadViews`:

```ts
      .map((e) => this.toView(e, docsByVehicle.get(e.id) ?? [], today, leaseByVehicle.get(e.id) ?? null))
```

Ubah tanda tangan `toView` dan objek yang dikembalikannya:

```ts
  private toView(
    e: FleetVehicleEntity,
    docs: FleetVehicleDocumentEntity[],
    today: string,
    lease: FleetLeaseContractEntity | null,
  ): FleetVehicleView {
```

dan tambahkan satu baris tepat setelah `driver,` di objek return:

```ts
      lease: this.toLeaseView(lease),
```

- [ ] **Step 8: Teruskan payload gabungan dari controller**

Di `fleet-vehicles.controller.ts`, `create` dan `update` sudah meneruskan seluruh DTO apa adanya, jadi tidak ada perubahan yang diperlukan. Pastikan dengan:

Run: `cd apps/backend && grep -n "this.service.create\|this.service.update" src/modules/fleet-vehicles/fleet-vehicles.controller.ts`
Expected: `return this.service.create(dto)` dan `return this.service.update(id, dto)` — keduanya utuh.

- [ ] **Step 9: Jalankan dan pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles`
Expected: PASS seluruhnya.

- [ ] **Step 10: Jalankan seluruh suite backend**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`
Expected: PASS. Tanpa **kedua** flag itu box kehabisan RAM dan suite mati tanpa satu test pun gagal.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles
git commit -m "$(cat <<'EOF'
feat(fleet): save vehicle, lease and documents in one transaction

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Header tabel menerima ReactNode

Spec §7.1. Kontrol sort perlu masuk ke dalam `<th>`, yang mustahil selama `header` bertipe `string`.

**Files:**
- Modify: `apps/frontend/src/components/shared/data-table.tsx`
- Test: `apps/frontend/src/components/shared/data-table.spec.tsx`

**Interfaces:**
- Consumes: —
- Produces: `DataTableColumn<T>.header: React.ReactNode`. Dipakai Task 17.

File ini ada di `components/**`, jadi **memakai semicolon**.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/frontend/src/components/shared/data-table.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DataTable } from './data-table';

type Row = { id: string; nama: string };

const rows: Row[] = [
  { id: '1', nama: 'Ahmad' },
  { id: '2', nama: 'Budi' },
];

const renderTable = (over: Record<string, unknown> = {}) =>
  render(
    <DataTable<Row>
      columns={[{ header: 'Nama', accessor: (r) => r.nama }]}
      rows={rows}
      keyExtractor={(r) => r.id}
      {...over}
    />
  );

describe('DataTable', () => {
  it('renders a plain string header', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Nama' })).toBeInTheDocument();
  });

  // The sort control belongs inside the header cell it sorts. While header was typed as string
  // it had to live in a separate row above the table, which left the two visually unconnected.
  it('renders an element header, controls and all', () => {
    renderTable({
      columns: [
        {
          header: (
            <button type="button" onClick={() => {}}>
              Nopol ▲
            </button>
          ),
          accessor: (r: Row) => r.nama,
        },
      ],
    });
    expect(screen.getByRole('button', { name: /nopol/i })).toBeInTheDocument();
  });

  it('renders one row per record', () => {
    renderTable({ rowDataTestId: 'row' });
    expect(screen.getAllByTestId('row')).toHaveLength(2);
  });

  it('shows the empty message when there are no rows', () => {
    renderTable({ rows: [], emptyMessage: 'Belum ada data.' });
    expect(screen.getByText('Belum ada data.')).toBeInTheDocument();
  });

  it('shows a loading state rather than the empty message', () => {
    renderTable({ rows: [], isLoading: true, emptyMessage: 'Belum ada data.' });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Belum ada data.')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test data-table`
Expected: FAIL — ts-jest menolak `header` bertipe elemen: `Type 'Element' is not assignable to type 'string'`.

- [ ] **Step 3: Lebarkan tipenya**

Di `apps/frontend/src/components/shared/data-table.tsx`, ubah satu baris:

```tsx
export interface DataTableColumn<T> {
  // ReactNode, not string, so a sort control can live inside the header cell it sorts rather
  // than in a separate row above the table. Existing string headers stay valid.
  header: React.ReactNode;
  accessor: (row: T) => React.ReactNode;
  className?: string;
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test data-table`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/shared/data-table.tsx apps/frontend/src/components/shared/data-table.spec.tsx
git commit -m "$(cat <<'EOF'
feat(ui): let a table header hold a control, not just a string

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Komponen DropdownMenu

Spec §7.2. `@radix-ui/react-dropdown-menu` sudah terpasang — yang belum ada hanya wrapper bergayanya.

**Files:**
- Create: `apps/frontend/src/components/ui/dropdown-menu.tsx`
- Test: `apps/frontend/src/components/ui/dropdown-menu.spec.tsx`

**Interfaces:**
- Consumes: —
- Produces: `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator`. Dipakai Task 17.

File ini ada di `components/**`, jadi **memakai semicolon**.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/frontend/src/components/ui/dropdown-menu.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

const setup = (onPick = jest.fn()) => {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Aksi">⋮</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onPick}>Ubah</DropdownMenuItem>
        <DropdownMenuItem>Arsipkan</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return { onPick };
};

describe('DropdownMenu', () => {
  // Closed by default: a table of 25 rows would otherwise render 25 open menus on top of each
  // other.
  it('keeps its items hidden until the trigger is used', () => {
    setup();
    expect(screen.queryByText('Ubah')).not.toBeInTheDocument();
  });

  it('shows the items when the trigger is clicked', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Aksi'));
    expect(screen.getByText('Ubah')).toBeInTheDocument();
    expect(screen.getByText('Arsipkan')).toBeInTheDocument();
  });

  it('calls the handler for the item that was chosen', () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByLabelText('Aksi'));
    fireEvent.click(screen.getByText('Ubah'));
    expect(onPick).toHaveBeenCalled();
  });

  // The menu is the only place some actions live, so it has to be reachable without a mouse.
  it('opens from the keyboard', () => {
    setup();
    const trigger = screen.getByLabelText('Aksi');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByText('Ubah')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test dropdown-menu`
Expected: FAIL — `Cannot find module './dropdown-menu'`.

- [ ] **Step 3: Tulis komponennya**

Buat `apps/frontend/src/components/ui/dropdown-menu.tsx`:

```tsx
'use client';
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPortal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    />
  </DropdownMenuPortal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive = false, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      destructive && 'text-destructive focus:bg-destructive/10 focus:text-destructive',
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test dropdown-menu`
Expected: PASS, 4 test.

Bila Radix menolak membuka menu di jsdom karena `ResizeObserver` tidak ada, tambahkan di puncak file spec — sebelum `describe`:

```tsx
// jsdom ships no ResizeObserver and Radix's positioning code constructs one on open.
global.ResizeObserver =
  global.ResizeObserver ??
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/ui/dropdown-menu.tsx apps/frontend/src/components/ui/dropdown-menu.spec.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add the dropdown menu the row actions collapse into

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Tiga utilitas frontend

Tiga fungsi murni yang dipakai section-section form: normalisasi plat saat diketik (requirement §1), offset bulan untuk pra-isi masa berlaku KIR (requirement §4), dan peta label dokumen kontekstual (requirement #2, spec §6.2). Digabung jadi satu task karena masing-masing hanya belasan baris dan tidak berarti sendiri-sendiri.

**Files:**
- Create: `apps/frontend/src/features/fleet/utils/nopol.ts`
- Create: `apps/frontend/src/features/fleet/utils/date-offset.ts`
- Create: `apps/frontend/src/features/fleet/utils/doc-labels.ts`
- Test: `apps/frontend/src/features/fleet/utils/fleet-form-utils.spec.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `normalizeNopolInput(raw: string): string`
  - `addMonths(iso: string, months: number): string`
  - `docLabels(code: string, label: string): { issued: string; expires: string }`

  Dipakai Task 13, 14, 15 dan 16.

File-file ini ada di `features/**`, jadi **tanpa semicolon**.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/frontend/src/features/fleet/utils/fleet-form-utils.spec.ts`:

```ts
import { normalizeNopolInput } from './nopol'
import { addMonths } from './date-offset'
import { docLabels } from './doc-labels'

describe('normalizeNopolInput', () => {
  // Requirement §1: separators are removed as the operator types, so the field shows exactly
  // what will be stored. Mirrors normalizeNopol on the backend — if the two disagree, the field
  // shows one plate and the register holds another.
  it.each([
    ['b 9114 kyz', 'B9114KYZ'],
    ['B.9114.KYZ', 'B9114KYZ'],
    ['B-9114-KYZ', 'B9114KYZ'],
    ['  b9114kyz  ', 'B9114KYZ'],
  ])('turns %s into %s', (raw, expected) => {
    expect(normalizeNopolInput(raw)).toBe(expected)
  })

  it('returns an empty string for separators alone', () => {
    expect(normalizeNopolInput(' - . ')).toBe('')
  })
})

describe('addMonths', () => {
  // Requirement §4: the KIR expiry pre-fills six months after the test date. This seeds an input
  // the operator may overwrite — it is not a status figure, which the backend still owns.
  it('adds whole months', () => {
    expect(addMonths('2026-03-10', 6)).toBe('2026-09-10')
  })

  it('rolls into the next year', () => {
    expect(addMonths('2026-10-10', 6)).toBe('2027-04-10')
  })

  // 31 August + 6 months is 28/29 February, which JS Date would silently roll to 2 or 3 March.
  // Clamping to the last day of the target month is what an operator means by "six months".
  it('clamps to the last day when the target month is shorter', () => {
    expect(addMonths('2025-08-31', 6)).toBe('2026-02-28')
  })

  it('clamps to 29 February in a leap year', () => {
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29')
  })

  it('returns an empty string for an empty date', () => {
    expect(addMonths('', 6)).toBe('')
  })

  it('returns an empty string for an unparseable date', () => {
    expect(addMonths('10 Maret', 6)).toBe('')
  })
})

describe('docLabels', () => {
  // Requirement #2: a service record has a last date and a next date, not an issue date and an
  // expiry. "Servis berkala terbit" reads as nonsense on the form.
  it('names the service dates for what they are', () => {
    expect(docLabels('servis', 'Servis Berkala')).toEqual({
      issued: 'Servis berkala terakhir',
      expires: 'Servis berkala berikutnya',
    })
  })

  it('names the KIR dates for what they are', () => {
    expect(docLabels('kir', 'KIR')).toEqual({
      issued: 'Tanggal uji KIR',
      expires: 'Masa berlaku KIR sampai',
    })
  })

  // An admin can add a document type from Master Data at any time. Falling back to the row's own
  // label keeps that type rendering sensibly without a code change.
  it('falls back to the master label for a type it does not know', () => {
    expect(docLabels('sertifikat_tera', 'Sertifikat Tera')).toEqual({
      issued: 'Sertifikat Tera terbit',
      expires: 'Sertifikat Tera berlaku sampai',
    })
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test fleet-form-utils`
Expected: FAIL — `Cannot find module './nopol'`.

- [ ] **Step 3: Tulis ketiga utilitas**

Buat `apps/frontend/src/features/fleet/utils/nopol.ts`:

```ts
// Mirrors normalizeNopol in the backend's fleet-vehicles module. Applied on every keystroke so
// the field shows exactly the string that will be stored — otherwise the operator types
// "B 9114 KYZ", the register holds "B9114KYZ", and the duplicate warning they get back names a
// plate they never typed.
export function normalizeNopolInput(raw: string): string {
  return raw.replace(/[\s.-]/g, '').toUpperCase()
}
```

Buat `apps/frontend/src/features/fleet/utils/date-offset.ts`:

```ts
// The one place the frontend does date arithmetic, and deliberately narrow: it seeds the value
// of an input the operator can overwrite (requirement §4), and whatever they leave there is
// stored as typed. Every figure that carries meaning — daysLeft, severity, instalments
// outstanding — is still computed by the backend.
//
// Built from the date parts rather than Date.setMonth, which rolls 31 August + 6 months into
// March. An operator who writes "six months" means the last day of February, not the third.
export function addMonths(iso: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match) return ''

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()

  const y = String(target.getUTCFullYear()).padStart(4, '0')
  const m = String(target.getUTCMonth() + 1).padStart(2, '0')
  const d = String(Math.min(day, lastDay)).padStart(2, '0')
  return `${y}-${m}-${d}`
}
```

Buat `apps/frontend/src/features/fleet/utils/doc-labels.ts`:

```ts
// Hardcoded here rather than stored on the master row: these are wording choices about the form,
// and an admin adding a document type should not have to compose two sentence fragments for it.
// A code that is not listed falls back to its own label, so new types still read sensibly.
const DOC_LABELS: Record<string, { issued: string; expires: string }> = {
  kir: { issued: 'Tanggal uji KIR', expires: 'Masa berlaku KIR sampai' },
  stnk: { issued: 'STNK terbit', expires: 'Masa berlaku STNK' },
  pajak: { issued: 'Pajak dibayar', expires: 'Jatuh tempo pajak tahunan' },
  asuransi: { issued: 'Asuransi mulai', expires: 'Masa berlaku asuransi' },
  kartu_pengawasan: {
    issued: 'Kartu pengawasan terbit',
    expires: 'Masa berlaku kartu pengawasan',
  },
  emisi: { issued: 'Uji emisi terakhir', expires: 'Masa berlaku uji emisi' },
  servis: { issued: 'Servis berkala terakhir', expires: 'Servis berkala berikutnya' },
}

export function docLabels(code: string, label: string): { issued: string; expires: string } {
  return DOC_LABELS[code] ?? { issued: `${label} terbit`, expires: `${label} berlaku sampai` }
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test fleet-form-utils`
Expected: PASS, 15 test.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/fleet/utils
git commit -m "$(cat <<'EOF'
feat(fleet): add plate, month-offset and document-label helpers for the form

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Tipe dan hook untuk payload gabungan

Frontend harus bisa mengirim `lease` dan `documents` bersama kendaraan, dan membaca `lease` yang sudah dihitung backend.

**Files:**
- Modify: `apps/frontend/src/features/fleet/types.ts`
- Modify: `apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts`
- Test: `apps/frontend/src/features/fleet/hooks/useFleetVehicles.spec.tsx`

**Interfaces:**
- Consumes: bentuk response dari Task 8
- Produces:
  - `FleetVehicleLease { id, leasing, nomorKontrak, cicilanPerBulan, tenorBulan, angsuranMulai, angsuranTerbayar, sisaAngsuran, sisaKewajiban }`
  - `FleetLeasePayload { leasingId, nomorKontrak, cicilanPerBulan, tenorBulan, angsuranMulai, angsuranTerbayar? }`
  - `FleetVehicle.lease: FleetVehicleLease | null`
  - `FleetVehiclePayload.lease?: FleetLeasePayload | null` dan `.documents?: FleetVehicleDocumentPayload[]`

  Dipakai Task 13, 15, 17 dan 18.

File-file ini ada di `features/**`, jadi **tanpa semicolon**.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `apps/frontend/src/features/fleet/hooks/useFleetVehicles.spec.tsx`, di dalam `describe` teratas:

```tsx
  // The lease arrives already worked out (spec §5.2). Defaulting it to null rather than to an
  // empty object keeps "no contract" distinguishable from "a contract with no figures".
  it('keeps the computed lease as the backend sent it', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        rows: [
          {
            id: 'v1',
            nopol: 'B9114KYZ',
            lease: {
              id: 'lc1',
              leasing: { id: 'ls1', label: 'MTF' },
              nomorKontrak: 'MTF-1',
              cicilanPerBulan: 8750000,
              tenorBulan: 36,
              angsuranMulai: '2026-01-10',
              angsuranTerbayar: 4,
              sisaAngsuran: 32,
              sisaKewajiban: 280000000,
            },
          },
        ],
        total: 1,
      },
    })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].lease).toMatchObject({
      nomorKontrak: 'MTF-1',
      sisaKewajiban: 280000000,
    })
  })

  // A backend that predates the lease field must still render a row, the same way every other
  // optional field on the wire type behaves.
  it('reports no lease when the response carries none', async () => {
    mockGet.mockResolvedValueOnce({ data: { rows: [{ id: 'v1', nopol: 'B9114KYZ' }], total: 1 } })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].lease).toBeNull()
  })

  // One POST carries all three parts, because the backend writes them in one transaction. Two
  // calls would put a unit in the register whose papers failed to save.
  it('posts the lease and documents alongside the vehicle', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'v1' } })
    const { result } = renderHook(() => useCreateFleetVehicle(), { wrapper })
    result.current.mutate({
      nopol: 'B9114KYZ',
      lease: {
        leasingId: 'ls1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
      },
      documents: [{ docTypeId: 'dt1', expiresAt: '2031-01-10' }],
    })
    await waitFor(() => expect(mockPost).toHaveBeenCalled())
    expect(mockPost.mock.calls[0][1]).toMatchObject({
      lease: { nomorKontrak: 'MTF-1' },
      documents: [{ docTypeId: 'dt1' }],
    })
  })
```

Sesuaikan nama mock (`mockGet`, `mockPost`, `wrapper`) dengan yang sudah dipakai di file itu, dan pastikan `useCreateFleetVehicle` ikut diimpor.

Ganti juga setiap `'B 9114 KYZ'` di file itu menjadi `'B9114KYZ'`:

```bash
cd apps/frontend/src/features/fleet && sed -i "s/'B 9114 KYZ'/'B9114KYZ'/g" hooks/useFleetVehicles.spec.tsx
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test useFleetVehicles`
Expected: FAIL — ts-jest menolak `lease` yang tidak ada di `FleetVehiclePayload`.

- [ ] **Step 3: Tambahkan tipenya**

Di `apps/frontend/src/features/fleet/types.ts`, tambahkan dua interface tepat sebelum `FleetVehicle`:

```ts
// Every figure here arrives computed, for the same reason daysLeft does: the browser clock
// belongs to the user, and two operators must not disagree about how much is left to pay.
export interface FleetVehicleLease {
  id: string
  leasing: FleetVehicleRef | null
  nomorKontrak: string | null
  cicilanPerBulan: number | null
  tenorBulan: number | null
  angsuranMulai: string | null
  // What the operator typed, or null when they left it blank. The form prefills its input from
  // this, never from angsuranTerbayar: prefilling from the computed figure would freeze a count
  // that is supposed to keep rising on its own.
  angsuranTerbayarOverride: number | null
  angsuranTerbayar: number
  sisaAngsuran: number
  sisaKewajiban: number
}

export interface FleetLeasePayload {
  leasingId: string
  nomorKontrak: string
  cicilanPerBulan: number
  tenorBulan: number
  angsuranMulai: string
  // The one optional field (requirement §2): blank means the backend derives it from the start
  // date.
  angsuranTerbayar?: number | null
}
```

Di `FleetVehicle`, tambahkan satu field setelah `driver`:

```ts
  lease: FleetVehicleLease | null
```

Di `FleetVehiclePayload`, tambahkan dua field di akhir:

```ts
  // Sent alongside the vehicle so the backend writes all three in one transaction. An explicit
  // null on lease means "this unit is no longer financed"; absent means "leave it alone".
  lease?: FleetLeasePayload | null
  documents?: FleetVehicleDocumentPayload[]
```

- [ ] **Step 4: Normalisasi lease di hook**

Di `apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts`, tambahkan satu baris di `normalizeVehicle`, tepat setelah `driver: row.driver ?? null,`:

```ts
    lease: row.lease ?? null,
```

- [ ] **Step 5: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test useFleetVehicles`
Expected: PASS seluruhnya.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/fleet/types.ts apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts apps/frontend/src/features/fleet/hooks/useFleetVehicles.spec.tsx
git commit -m "$(cat <<'EOF'
feat(fleet): carry the lease and documents in the vehicle payload

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: State form dalam satu hook

Form ini punya 22 field kendaraan ditambah satu baris per jenis dokumen. Ditaruh semuanya di komponen dialog, file itu jadi ~600 baris dan tiap perubahan tata letak mengancam logika payload-nya. Seluruh state, validasi dan pembentukan payload pindah ke satu hook; komponen-komponen section tinggal merender apa yang hook itu berikan.

Spec §5.1 (aturan wajib), §6.1 (auto-populate).

**Files:**
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleForm.ts`
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/form-primitives.tsx`
- Test: `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleForm.spec.ts`

**Interfaces:**
- Consumes: `normalizeNopolInput`, `addMonths` (Task 11); `FleetVehicle`, `FleetVehicleLease`, `FleetVehiclePayload` (Task 12)
- Produces:
  - `VehicleFormValues` — 22 field, **semuanya `string`**, karena itu yang dipegang input HTML. Konversi ke angka hanya terjadi di `buildPayload`.
  - `DocRowState { nomor: string; issuedAt: string; expiresAt: string }`
  - `useVehicleForm(opts: UseVehicleFormOptions): VehicleFormApi`
  - `VehicleFormApi { values, errors, docs, driver, isRented, setValue, setDocField, docRow, validate, buildPayload }`
  - `Section`, `MasterSelect`, `SELECT_CLASS` dari `form-primitives.tsx`

  Dipakai Task 14 dan Task 15.

File-file ini ada di `features/**`, jadi **tanpa semicolon**.

> **Catatan untuk reviewer:** spec §5.1 menyatakan seluruh field leasing wajib kecuali `angsuranTerbayar`, dan hook ini menegakkannya apa adanya. Konsekuensinya unit yang dibeli tunai tetap harus mengisi nomor kontrak, cicilan, tenor dan tanggal angsuran pertama — master data `leasing` punya baris "Lunas"/"Tanpa leasing", tetapi empat field sisanya tidak punya jalan keluar. Itu memang yang tertulis di requirement §2 dan disetujui di spec; bila ternyata tidak diinginkan, perubahannya satu baris di `REQUIRED_FIELDS` dan bukan bagian dari plan ini.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleForm.spec.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { useVehicleForm } from './useVehicleForm'
import { FleetDriver, FleetMasterRow, FleetVehicle } from '../../types'

const master = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 'm1',
  category: 'jenis_dokumen',
  code: 'stnk',
  label: 'STNK',
  sortOrder: 0,
  isActive: true,
  warnDays: 30,
  defaultValidMonths: null,
  isRequired: null,
  ...over,
})

const docTypes: FleetMasterRow[] = [
  master({ id: 'dt-stnk', code: 'stnk', label: 'STNK', isRequired: true }),
  master({ id: 'dt-kir', code: 'kir', label: 'KIR', isRequired: false, defaultValidMonths: 6 }),
  master({ id: 'dt-pajak', code: 'pajak', label: 'Pajak', isRequired: true, defaultValidMonths: 12 }),
]

const kepemilikan: FleetMasterRow[] = [
  master({ id: 'kp-esp', category: 'kepemilikan', code: 'milik_esp', label: 'Milik ESP' }),
  master({ id: 'kp-sewa', category: 'kepemilikan', code: 'sewa_lepas_kunci', label: 'Sewa Lepas Kunci' }),
]

const drivers: FleetDriver[] = [
  {
    id: 'dr1',
    nama: 'Ahmad Fauzi',
    telepon: null,
    simNomor: '3201-1122-3344',
    simJenisId: null,
    simExpiresAt: '2027-03-14',
    isActive: true,
  },
]

const setup = (initial?: FleetVehicle) =>
  renderHook(() => useVehicleForm({ initial, docTypes, kepemilikan, drivers }))

// Every field filled, so each test empties exactly one and sees only that error.
const fillValid = (api: { current: ReturnType<typeof useVehicleForm> }) =>
  act(() => {
    api.current.setValue('nopol', 'B9114KYZ')
    api.current.setValue('merk', 'Mitsubishi')
    api.current.setValue('tipe', 'Canter FE 74 HD')
    api.current.setValue('jenisArmadaId', 'ja1')
    api.current.setValue('tahun', '2021')
    api.current.setValue('kapasitas', '8 ton')
    api.current.setValue('noRangka', 'MHMFE74P5MK000111')
    api.current.setValue('noMesin', '4D34T-000111')
    api.current.setValue('noBpkb', 'M-01234567')
    api.current.setValue('kepemilikanId', 'kp-esp')
    api.current.setValue('leasingId', 'ls1')
    api.current.setValue('nomorKontrak', 'MTF-2024-03-11872')
    api.current.setValue('cicilanPerBulan', '8750000')
    api.current.setValue('tenorBulan', '36')
    api.current.setValue('angsuranMulai', '2026-01-10')
    api.current.setValue('poolId', 'p1')
    api.current.setDocField('dt-stnk', 'expiresAt', '2031-01-10')
    api.current.setDocField('dt-pajak', 'expiresAt', '2027-01-10')
  })

describe('useVehicleForm', () => {
  it('starts empty when adding a vehicle', () => {
    const { result } = setup()
    expect(result.current.values.nopol).toBe('')
    expect(result.current.values.cicilanPerBulan).toBe('')
    expect(result.current.docRow('dt-stnk')).toEqual({ nomor: '', issuedAt: '', expiresAt: '' })
  })

  // Requirement §1: the separators go as the operator types, so the field shows exactly what is
  // stored. Typed anywhere else the plate would be normalised only on submit, and the duplicate
  // warning would name a plate the operator never saw.
  it('strips separators from the plate as it is typed', () => {
    const { result } = setup()
    act(() => result.current.setValue('nopol', 'b 9114-kyz'))
    expect(result.current.values.nopol).toBe('B9114KYZ')
  })

  it('leaves every other field exactly as typed', () => {
    const { result } = setup()
    act(() => result.current.setValue('tipe', 'Canter FE 74 HD'))
    expect(result.current.values.tipe).toBe('Canter FE 74 HD')
  })

  // Spec §6.1: the expiry fills from the master row's default_valid_months. KIR is the six months
  // requirement §4 asks for, and it arrives from master data rather than from a constant here.
  it('fills the expiry from the document type default when the issue date is entered', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-kir', 'issuedAt', '2026-03-10'))
    expect(result.current.docRow('dt-kir').expiresAt).toBe('2026-09-10')
  })

  // "Hanya mengisi kolom yang masih kosong" — an operator who already typed the real expiry off
  // the document must not have it overwritten by an arithmetic guess.
  it('leaves an expiry the operator already typed alone', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-kir', 'expiresAt', '2026-12-31'))
    act(() => result.current.setDocField('dt-kir', 'issuedAt', '2026-03-10'))
    expect(result.current.docRow('dt-kir').expiresAt).toBe('2026-12-31')
  })

  it('fills nothing for a type with no default validity', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-stnk', 'issuedAt', '2026-03-10'))
    expect(result.current.docRow('dt-stnk').expiresAt).toBe('')
  })

  // Clearing the issue date must not leave a derived expiry behind claiming to know something.
  it('does not derive an expiry from a cleared issue date', () => {
    const { result } = setup()
    act(() => result.current.setDocField('dt-kir', 'issuedAt', ''))
    expect(result.current.docRow('dt-kir').expiresAt).toBe('')
  })

  // Spec §6: one source of truth for the licence. The form reads it off the chosen driver rather
  // than storing a copy, so a renewal in the Sopir module reaches every unit at once.
  it('exposes the chosen driver so the SIM fields can read from it', () => {
    const { result } = setup()
    act(() => result.current.setValue('driverId', 'dr1'))
    expect(result.current.driver).toMatchObject({
      simNomor: '3201-1122-3344',
      simExpiresAt: '2027-03-14',
    })
  })

  it('reports no driver when none is chosen', () => {
    const { result } = setup()
    expect(result.current.driver).toBeNull()
  })

  it('accepts a fully filled form', () => {
    const { result } = setup()
    fillValid(result)
    let ok = false
    act(() => {
      ok = result.current.validate()
    })
    expect(ok).toBe(true)
    expect(result.current.errors).toEqual({})
  })

  // Spec §5.1 lists these by name. Asserted one at a time, each against its own key: a validator
  // that writes every message to a single form-level string passes a "shows an error" test while
  // leaving the operator to hunt for which of 22 fields it means.
  it.each([
    ['nopol', 'nomor polisi'],
    ['merk', 'merk'],
    ['tipe', 'tipe'],
    ['jenisArmadaId', 'jenis armada'],
    ['tahun', 'tahun'],
    ['kapasitas', 'kapasitas'],
    ['noRangka', 'nomor rangka'],
    ['noMesin', 'nomor mesin'],
    ['noBpkb', 'nomor bpkb'],
    ['poolId', 'pool'],
    ['kepemilikanId', 'status kepemilikan'],
    ['leasingId', 'perusahaan leasing'],
    ['nomorKontrak', 'nomor kontrak'],
    ['cicilanPerBulan', 'cicilan'],
    ['tenorBulan', 'total angsuran'],
    ['angsuranMulai', 'tanggal angsuran pertama'],
  ])('refuses a form with no %s', (field, wording) => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue(field as keyof typeof result.current.values, '')
      result.current.validate()
    })
    expect(result.current.errors[field]?.toLowerCase()).toContain(wording)
  })

  // Requirement §2 marks this the one optional lease field: blank means the backend derives the
  // count from the start date (spec §5.2).
  it('accepts a form with no angsuranTerbayar', () => {
    const { result } = setup()
    fillValid(result)
    let ok = false
    act(() => {
      ok = result.current.validate()
    })
    expect(ok).toBe(true)
    expect(result.current.errors.angsuranTerbayar).toBeUndefined()
  })

  // Spec §5.1 bersyarat. A rented truck belongs to somebody outside the company, and a register
  // that cannot say who has lost the only fact that matters when the contract ends.
  it('demands the owner name for a sewa lepas kunci unit', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('kepemilikanId', 'kp-sewa')
      result.current.validate()
    })
    expect(result.current.errors.pemilikUnit).toBeTruthy()
  })

  it('accepts a sewa lepas kunci unit once the owner is named', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('kepemilikanId', 'kp-sewa')
      result.current.setValue('pemilikUnit', 'PT Sumber Jaya')
    })
    let ok = false
    act(() => {
      ok = result.current.validate()
    })
    expect(ok).toBe(true)
  })

  it('does not demand an owner name for a company-owned unit', () => {
    const { result } = setup()
    fillValid(result)
    act(() => result.current.validate())
    expect(result.current.errors.pemilikUnit).toBeUndefined()
  })

  // Spec §4.2 puts the mandatory list in master data, and what the warning system actually reads
  // is the expiry — a document number with no date warns nobody.
  it('demands an expiry for every document flagged required', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setDocField('dt-stnk', 'expiresAt', '')
      result.current.validate()
    })
    expect(result.current.errors['doc-dt-stnk']).toBeTruthy()
  })

  it('does not demand an expiry for an optional document', () => {
    const { result } = setup()
    fillValid(result)
    act(() => result.current.validate())
    expect(result.current.errors['doc-dt-kir']).toBeUndefined()
  })

  it('clears an error once the field is filled in', () => {
    const { result } = setup()
    act(() => result.current.validate())
    expect(result.current.errors.merk).toBeTruthy()
    fillValid(result)
    act(() => result.current.validate())
    expect(result.current.errors.merk).toBeUndefined()
  })

  // One distinct value per field, asserted as a whole object. Identical placeholders would let a
  // field cross-wired to its neighbour's key — the defect a 22-field form actually produces —
  // pass while writing the wrong column.
  it('builds a payload with every field under its own key', () => {
    const { result } = setup()
    fillValid(result)
    act(() => {
      result.current.setValue('pemilikUnit', 'PT Sumber Jaya')
      result.current.setValue('driverId', 'dr1')
      result.current.setValue('statusId', 's1')
      result.current.setValue('odometer', '120000')
      result.current.setValue('catatan', 'Servis rutin')
      result.current.setValue('angsuranTerbayar', '4')
    })
    expect(result.current.buildPayload()).toEqual({
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      tipe: 'Canter FE 74 HD',
      tahun: 2021,
      kapasitas: '8 ton',
      noRangka: 'MHMFE74P5MK000111',
      noMesin: '4D34T-000111',
      noBpkb: 'M-01234567',
      pemilikUnit: 'PT Sumber Jaya',
      odometer: 120000,
      catatan: 'Servis rutin',
      jenisArmadaId: 'ja1',
      kepemilikanId: 'kp-esp',
      poolId: 'p1',
      statusId: 's1',
      driverId: 'dr1',
      lease: {
        leasingId: 'ls1',
        nomorKontrak: 'MTF-2024-03-11872',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayar: 4,
      },
      documents: [
        { docTypeId: 'dt-stnk', nomor: null, issuedAt: null, expiresAt: '2031-01-10' },
        { docTypeId: 'dt-pajak', nomor: null, issuedAt: null, expiresAt: '2027-01-10' },
      ],
    })
  })

  // A blank number input reads as ''. Number('') is 0, which would register a zero odometer on a
  // used truck and a 1970 model year — both plausible enough to go unnoticed.
  it('sends null rather than zero for a blank odometer', () => {
    const { result } = setup()
    fillValid(result)
    expect(result.current.buildPayload().odometer).toBeNull()
  })

  it('sends a null angsuranTerbayar when the operator leaves it blank', () => {
    const { result } = setup()
    fillValid(result)
    expect(result.current.buildPayload().lease?.angsuranTerbayar).toBeNull()
  })

  // Trimmed, because ' B9114KYZ ' is a different string to the unique index and would register
  // the same truck twice.
  it('trims the free text it sends', () => {
    const { result } = setup()
    fillValid(result)
    act(() => result.current.setValue('merk', '  Hino  '))
    expect(result.current.buildPayload().merk).toBe('Hino')
  })

  it('sends null rather than an empty string for untouched optional text', () => {
    const { result } = setup()
    fillValid(result)
    const payload = result.current.buildPayload()
    expect(payload.catatan).toBeNull()
    expect(payload.pemilikUnit).toBeNull()
    expect(payload.statusId).toBeNull()
  })

  // An untouched row is not a document. Sent anyway it would create a live row with no data,
  // which the warning system then reports as a document with no expiry.
  it('leaves empty document rows out of the payload', () => {
    const { result } = setup()
    fillValid(result)
    expect(result.current.buildPayload().documents?.map((d) => d.docTypeId)).toEqual([
      'dt-stnk',
      'dt-pajak',
    ])
  })

  describe('editing an existing vehicle', () => {
    const existing = {
      id: 'v1',
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      tipe: 'Canter',
      tahun: 2021,
      kapasitas: '8 ton',
      noRangka: 'MHM111',
      noMesin: '4D34-1',
      noBpkb: 'M-01',
      pemilikUnit: 'PT Sumber Jaya',
      odometer: 120000,
      catatan: 'Servis rutin',
      jenisArmada: { id: 'ja1', label: 'CDE' },
      kepemilikan: { id: 'kp-esp', label: 'Milik ESP' },
      pool: { id: 'p1', label: 'Pool Cakung' },
      status: { id: 's1', label: 'Beroperasi' },
      driver: { id: 'dr1', nama: 'Ahmad Fauzi', simExpiresAt: '2027-03-14', simDaysLeft: 550, simSeverity: 'ok' },
      lease: {
        id: 'lc1',
        leasing: { id: 'ls1', label: 'MTF' },
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayarOverride: null,
        angsuranTerbayar: 9,
        sisaAngsuran: 27,
        sisaKewajiban: 236250000,
      },
      documents: [
        {
          docTypeId: 'dt-stnk',
          code: 'stnk',
          label: 'STNK',
          nomor: 'STNK-1',
          issuedAt: '2026-01-10',
          expiresAt: '2031-01-10',
          daysLeft: 1000,
          severity: 'ok',
        },
      ],
      worstSeverity: 'ok',
      minDaysLeft: 1000,
      isActive: true,
    } as FleetVehicle

    // The refs arrive as {id,label} objects and the selects need the bare id. A mismatch here
    // resets the dropdown to blank on every edit and quietly clears the column on save.
    it('prefills every field from the vehicle', () => {
      const { result } = setup(existing)
      expect(result.current.values).toMatchObject({
        nopol: 'B9114KYZ',
        merk: 'Mitsubishi',
        tipe: 'Canter',
        tahun: '2021',
        kapasitas: '8 ton',
        noRangka: 'MHM111',
        noMesin: '4D34-1',
        noBpkb: 'M-01',
        pemilikUnit: 'PT Sumber Jaya',
        odometer: '120000',
        catatan: 'Servis rutin',
        jenisArmadaId: 'ja1',
        kepemilikanId: 'kp-esp',
        poolId: 'p1',
        statusId: 's1',
        driverId: 'dr1',
      })
    })

    it('prefills the lease from the open contract', () => {
      const { result } = setup(existing)
      expect(result.current.values).toMatchObject({
        leasingId: 'ls1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: '8750000',
        tenorBulan: '36',
        angsuranMulai: '2026-01-10',
      })
    })

    // The computed count is NOT what goes in the box. Prefilled from angsuranTerbayar, an
    // untouched edit would save 9 as an override and the unit would stop counting up — the truck
    // would still read "9 paid" a year later.
    it('leaves the paid box blank when the backend derived the count', () => {
      const { result } = setup(existing)
      expect(result.current.values.angsuranTerbayar).toBe('')
    })

    it('prefills the paid box when the operator had typed a count', () => {
      const { result } = setup({
        ...existing,
        lease: { ...existing.lease!, angsuranTerbayarOverride: 4 },
      } as FleetVehicle)
      expect(result.current.values.angsuranTerbayar).toBe('4')
    })

    it('prefills the documents it already has', () => {
      const { result } = setup(existing)
      expect(result.current.docRow('dt-stnk')).toEqual({
        nomor: 'STNK-1',
        issuedAt: '2026-01-10',
        expiresAt: '2031-01-10',
      })
    })

    // Anything absent from the payload is retired by the backend. A document whose type was
    // deactivated in master data has no row on the form to edit, so it must ride along unchanged
    // rather than be deleted by a Simpan the operator pressed without ever seeing it.
    it('carries through a document whose type is no longer offered', () => {
      const { result } = renderHook(() =>
        useVehicleForm({
          initial: existing,
          docTypes: [master({ id: 'dt-kir', code: 'kir', label: 'KIR' })],
          kepemilikan,
          drivers,
        }),
      )
      expect(result.current.buildPayload().documents).toEqual([
        { docTypeId: 'dt-stnk', nomor: 'STNK-1', issuedAt: '2026-01-10', expiresAt: '2031-01-10' },
      ])
    })

    // Every document type is required while docTypes is still loading, because the flags have
    // not arrived — an empty list must not read as "nothing is mandatory" and wave a blank form
    // through.
    it('demands nothing extra while the document types are still loading', () => {
      const { result } = renderHook(() =>
        useVehicleForm({ initial: existing, docTypes: [], kepemilikan, drivers }),
      )
      let ok = false
      act(() => {
        ok = result.current.validate()
      })
      expect(ok).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test useVehicleForm`
Expected: FAIL — `Cannot find module './useVehicleForm'`.

- [ ] **Step 3: Tulis hook-nya**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleForm.ts`:

```ts
import { useMemo, useState } from 'react'
import {
  FleetDriver,
  FleetMasterRow,
  FleetVehicle,
  FleetVehicleDocumentPayload,
  FleetVehiclePayload,
} from '../../types'
import { addMonths } from '../../utils/date-offset'
import { normalizeNopolInput } from '../../utils/nopol'

// Matched by code rather than by id, because ids differ per environment while the seeded code
// does not. Mirrors SEWA_LEPAS_KUNCI_CODE on the backend.
const SEWA_LEPAS_KUNCI_CODE = 'sewa_lepas_kunci'

// Every value is a string, because that is what an HTML input holds. Keeping numbers as numbers
// here would mean every input needed its own "is this the empty string or a zero" branch;
// instead the conversion happens once, in buildPayload.
export interface VehicleFormValues {
  nopol: string
  merk: string
  tipe: string
  tahun: string
  kapasitas: string
  noRangka: string
  noMesin: string
  noBpkb: string
  jenisArmadaId: string
  kepemilikanId: string
  pemilikUnit: string
  leasingId: string
  nomorKontrak: string
  cicilanPerBulan: string
  tenorBulan: string
  angsuranMulai: string
  angsuranTerbayar: string
  driverId: string
  poolId: string
  statusId: string
  odometer: string
  catatan: string
}

export interface DocRowState {
  nomor: string
  issuedAt: string
  expiresAt: string
}

export interface UseVehicleFormOptions {
  initial?: FleetVehicle
  docTypes: FleetMasterRow[]
  kepemilikan: FleetMasterRow[]
  drivers: FleetDriver[]
}

export interface VehicleFormApi {
  values: VehicleFormValues
  errors: Record<string, string>
  driver: FleetDriver | null
  isRented: boolean
  setValue: (field: keyof VehicleFormValues, value: string) => void
  docRow: (docTypeId: string) => DocRowState
  setDocField: (docTypeId: string, field: keyof DocRowState, value: string) => void
  validate: () => boolean
  buildPayload: () => FleetVehiclePayload
}

const EMPTY_DOC: DocRowState = { nomor: '', issuedAt: '', expiresAt: '' }

// Spec §5.1, in the order the operator meets them on the form, so the first error they are sent
// to is the earliest one on screen. The label is the field's own caption: "Merk wajib diisi" is
// something an operator can act on, "field is required" is not.
const REQUIRED_FIELDS: { field: keyof VehicleFormValues; label: string }[] = [
  { field: 'nopol', label: 'Nomor polisi' },
  { field: 'merk', label: 'Merk' },
  { field: 'tipe', label: 'Tipe' },
  { field: 'jenisArmadaId', label: 'Jenis armada' },
  { field: 'tahun', label: 'Tahun pembuatan' },
  { field: 'kapasitas', label: 'Kapasitas muatan' },
  { field: 'noRangka', label: 'Nomor rangka' },
  { field: 'noMesin', label: 'Nomor mesin' },
  { field: 'noBpkb', label: 'Nomor BPKB' },
  { field: 'kepemilikanId', label: 'Status kepemilikan' },
  { field: 'leasingId', label: 'Perusahaan leasing' },
  { field: 'nomorKontrak', label: 'Nomor kontrak' },
  { field: 'cicilanPerBulan', label: 'Cicilan per bulan' },
  { field: 'tenorBulan', label: 'Total angsuran' },
  { field: 'angsuranMulai', label: 'Tanggal angsuran pertama' },
  { field: 'poolId', label: 'Pool/domisili' },
]

const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const textOrNull = (raw: string): string | null => raw.trim() || null

function initialValues(initial?: FleetVehicle): VehicleFormValues {
  return {
    nopol: initial?.nopol ?? '',
    merk: initial?.merk ?? '',
    tipe: initial?.tipe ?? '',
    tahun: initial?.tahun?.toString() ?? '',
    kapasitas: initial?.kapasitas ?? '',
    noRangka: initial?.noRangka ?? '',
    noMesin: initial?.noMesin ?? '',
    noBpkb: initial?.noBpkb ?? '',
    // The refs arrive as {id,label} objects; the selects need the bare id.
    jenisArmadaId: initial?.jenisArmada?.id ?? '',
    kepemilikanId: initial?.kepemilikan?.id ?? '',
    pemilikUnit: initial?.pemilikUnit ?? '',
    leasingId: initial?.lease?.leasing?.id ?? '',
    nomorKontrak: initial?.lease?.nomorKontrak ?? '',
    cicilanPerBulan: initial?.lease?.cicilanPerBulan?.toString() ?? '',
    tenorBulan: initial?.lease?.tenorBulan?.toString() ?? '',
    angsuranMulai: initial?.lease?.angsuranMulai ?? '',
    // The override, never the computed figure. Seeded from angsuranTerbayar, an untouched edit
    // would save today's derived count as a fixed one and the unit would stop counting up.
    angsuranTerbayar: initial?.lease?.angsuranTerbayarOverride?.toString() ?? '',
    driverId: initial?.driver?.id ?? '',
    poolId: initial?.pool?.id ?? '',
    statusId: initial?.status?.id ?? '',
    odometer: initial?.odometer?.toString() ?? '',
    catatan: initial?.catatan ?? '',
  }
}

export function useVehicleForm({
  initial,
  docTypes,
  kepemilikan,
  drivers,
}: UseVehicleFormOptions): VehicleFormApi {
  const [values, setValues] = useState<VehicleFormValues>(() => initialValues(initial))
  // Seeded from the vehicle's own documents, not from docTypes: docTypes can still be loading at
  // mount, and a row seeded from an empty list would leave the operator's existing documents
  // with nowhere to be carried from.
  const [docs, setDocs] = useState<Record<string, DocRowState>>(() =>
    Object.fromEntries(
      (initial?.documents ?? []).map((d) => [
        d.docTypeId,
        { nomor: d.nomor ?? '', issuedAt: d.issuedAt ?? '', expiresAt: d.expiresAt ?? '' },
      ]),
    ),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const driver = useMemo(
    () => drivers.find((d) => d.id === values.driverId) ?? null,
    [drivers, values.driverId],
  )

  const isRented = useMemo(
    () => kepemilikan.find((k) => k.id === values.kepemilikanId)?.code === SEWA_LEPAS_KUNCI_CODE,
    [kepemilikan, values.kepemilikanId],
  )

  const setValue = (field: keyof VehicleFormValues, value: string) => {
    // Requirement §1: the plate is tidied on every keystroke, so the field shows the exact string
    // that will be stored. Normalised only on submit, the operator would type "B 9114 KYZ" and
    // get back a duplicate warning naming a plate they never saw.
    const next = field === 'nopol' ? normalizeNopolInput(value) : value
    setValues((prev) => ({ ...prev, [field]: next }))
  }

  const docRow = (docTypeId: string): DocRowState => docs[docTypeId] ?? EMPTY_DOC

  const setDocField = (docTypeId: string, field: keyof DocRowState, value: string) => {
    setDocs((prev) => {
      const current = prev[docTypeId] ?? EMPTY_DOC
      const next: DocRowState = { ...current, [field]: value }
      // Spec §6.1: the expiry fills from the master row's default_valid_months, and only while
      // the box is still empty — a date the operator read off the paper document outranks one
      // this arithmetic guessed.
      if (field === 'issuedAt' && value && !current.expiresAt) {
        const months = docTypes.find((t) => t.id === docTypeId)?.defaultValidMonths
        if (months) next.expiresAt = addMonths(value, months)
      }
      return { ...prev, [docTypeId]: next }
    })
  }

  const validate = (): boolean => {
    const found: Record<string, string> = {}

    for (const { field, label } of REQUIRED_FIELDS) {
      if (!values[field].trim()) found[field] = `${label} wajib diisi.`
    }

    // Spec §5.1 bersyarat: a rented unit belongs to somebody outside the company, and the
    // register has to be able to say who the truck goes back to.
    if (isRented && !values.pemilikUnit.trim()) {
      found.pemilikUnit = 'Pemilik/vendor sewa wajib diisi untuk unit sewa lepas kunci.'
    }

    // The expiry, not the number: that is the field the warning system reads, and a document
    // number with no date warns nobody. While docTypes is still loading this loop is empty, and
    // the backend enforces the same rule on the way in.
    for (const type of docTypes) {
      if (type.isRequired === true && !docRow(type.id).expiresAt) {
        found[`doc-${type.id}`] = `Masa berlaku ${type.label} wajib diisi.`
      }
    }

    setErrors(found)
    return Object.keys(found).length === 0
  }

  const buildPayload = (): FleetVehiclePayload => {
    // An untouched row is not a document — sent anyway it would become a live row with no dates,
    // which the warning system then reports as a document about to expire. A row whose type is
    // not in docTypes still rides along here with the values it arrived with, because anything
    // absent from this payload is retired by the backend.
    const documents: FleetVehicleDocumentPayload[] = Object.entries(docs)
      .filter(([, row]) => row.nomor.trim() || row.issuedAt || row.expiresAt)
      .map(([docTypeId, row]) => ({
        docTypeId,
        nomor: textOrNull(row.nomor),
        issuedAt: row.issuedAt || null,
        expiresAt: row.expiresAt || null,
      }))

    return {
      nopol: values.nopol.trim(),
      merk: textOrNull(values.merk),
      tipe: textOrNull(values.tipe),
      tahun: numberOrNull(values.tahun),
      kapasitas: textOrNull(values.kapasitas),
      noRangka: textOrNull(values.noRangka),
      noMesin: textOrNull(values.noMesin),
      noBpkb: textOrNull(values.noBpkb),
      pemilikUnit: textOrNull(values.pemilikUnit),
      odometer: numberOrNull(values.odometer),
      catatan: textOrNull(values.catatan),
      jenisArmadaId: values.jenisArmadaId || null,
      kepemilikanId: values.kepemilikanId || null,
      poolId: values.poolId || null,
      statusId: values.statusId || null,
      driverId: values.driverId || null,
      lease: {
        leasingId: values.leasingId,
        nomorKontrak: values.nomorKontrak.trim(),
        cicilanPerBulan: Number(values.cicilanPerBulan),
        tenorBulan: Number(values.tenorBulan),
        angsuranMulai: values.angsuranMulai,
        // Blank means "work it out from the start date" (spec §5.2), which is why this is null
        // rather than 0 — zero is a real answer meaning nothing has been paid yet.
        angsuranTerbayar: numberOrNull(values.angsuranTerbayar),
      },
      documents,
    }
  }

  return { values, errors, driver, isRented, setValue, docRow, setDocField, validate, buildPayload }
}
```

- [ ] **Step 4: Tulis primitives**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/form-primitives.tsx`:

```tsx
'use client'

import * as React from 'react'
import { FormField } from '@/components/shared/form-field'
import { FleetMasterRow } from '../../types'

export const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

// A real <fieldset><legend>, not a styled div: the legend is what a screen reader announces when
// the operator tabs into the group, and on a 22-field form that announcement is the only thing
// telling them which of the six sections they are in.
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-md border px-4 pb-4 pt-2">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

interface MasterSelectProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: FleetMasterRow[]
  required?: boolean
  error?: string
  placeholder?: string
  className?: string
}

// Every dropdown on this form is a master-data list, so they all render through here — one place
// to fix when the empty option or the error wiring turns out wrong, rather than five.
export function MasterSelect({
  id,
  label,
  value,
  onChange,
  options,
  required,
  error,
  placeholder = '— pilih —',
  className,
}: MasterSelectProps) {
  return (
    <FormField label={label} htmlFor={id} required={required} error={error} className={className}>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  )
}
```

- [ ] **Step 5: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test useVehicleForm`
Expected: PASS seluruhnya (16 kasus `it.each` untuk field wajib plus sisanya).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/fleet/components/vehicle-form
git commit -m "$(cat <<'EOF'
feat(fleet): hold the whole vehicle form in one hook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Empat komponen section

Spec §6 memecah form menjadi enam section. Empat komponen cukup untuk semuanya: tiga section dokumen (Uji Berkala, Dokumen Kendaraan, Servis) berbentuk identik dan dilayani satu `DocumentSection` yang dipanggil tiga kali dengan daftar jenis dokumen berbeda.

Tiap komponen menerima `VehicleFormApi` utuh dari Task 13, bukan dua puluh prop terpisah. Section-nya tidak menyimpan state apa pun — semuanya milik hook.

Spec §6 (struktur section), §6.1 (auto-populate SIM), §6.2 (label kontekstual).

**Files:**
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/IdentitySection.tsx`
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/LeaseSection.tsx`
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/OperationalSection.tsx`
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/DocumentSection.tsx`
- Test: `apps/frontend/src/features/fleet/components/vehicle-form/sections.spec.tsx`

**Interfaces:**
- Consumes: `VehicleFormApi`, `Section`, `MasterSelect`, `SELECT_CLASS` (Task 13); `docLabels` (Task 11); `FleetDriver`, `FleetMasterRow` (types)
- Produces:
  - `IdentitySection({ form, jenisArmada })`
  - `LeaseSection({ form, kepemilikan, leasing })`
  - `OperationalSection({ form, pool, status, drivers })`
  - `DocumentSection({ title, form, types, showNomor? })` — `showNomor` default `true`

  Dipakai Task 15.

File-file ini ada di `features/**`, jadi **tanpa semicolon**.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/sections.spec.tsx`:

```tsx
import * as React from 'react'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { IdentitySection } from './IdentitySection'
import { LeaseSection } from './LeaseSection'
import { OperationalSection } from './OperationalSection'
import { DocumentSection } from './DocumentSection'
import { useVehicleForm, VehicleFormApi } from './useVehicleForm'
import { FleetDriver, FleetMasterRow } from '../../types'

const master = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 'm1',
  category: 'pool',
  code: 'm1',
  label: 'M1',
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
  ...over,
})

const jenisArmada = [master({ id: 'ja1', category: 'jenis_armada', label: 'Colt Diesel Engkel' })]
const kepemilikan = [
  master({ id: 'kp-esp', category: 'kepemilikan', code: 'milik_esp', label: 'Milik ESP' }),
  master({ id: 'kp-sewa', category: 'kepemilikan', code: 'sewa_lepas_kunci', label: 'Sewa Lepas Kunci' }),
]
const leasing = [master({ id: 'ls1', category: 'leasing', code: 'mtf', label: 'MTF' })]
const pool = [master({ id: 'p1', category: 'pool', label: 'Pool Cakung' })]
const status = [master({ id: 's1', category: 'status_kendaraan', label: 'Beroperasi' })]

const drivers: FleetDriver[] = [
  {
    id: 'dr1',
    nama: 'Ahmad Fauzi',
    telepon: null,
    simNomor: '3201-1122-3344',
    simJenisId: null,
    simExpiresAt: '2027-03-14',
    isActive: true,
  },
]

const docTypes = [
  master({ id: 'dt-stnk', category: 'jenis_dokumen', code: 'stnk', label: 'STNK', isRequired: true }),
  master({ id: 'dt-servis', category: 'jenis_dokumen', code: 'servis', label: 'Servis Berkala' }),
]

// The sections hold no state of their own, so the real hook drives them. A stub would let a
// section read the wrong key off the api and still pass.
const useForm = () =>
  renderHook(() => useVehicleForm({ docTypes, kepemilikan, drivers })).result

const renderWithForm = (
  render_: (form: VehicleFormApi) => React.ReactElement,
): { result: { current: VehicleFormApi } } => {
  const result = useForm()
  render(render_(result.current))
  return { result }
}

describe('IdentitySection', () => {
  it('renders every identity field', () => {
    renderWithForm((form) => <IdentitySection form={form} jenisArmada={jenisArmada} />)
    for (const label of [
      /nomor polisi/i,
      /merk/i,
      /^tipe/i,
      /jenis armada/i,
      /tahun pembuatan/i,
      /kapasitas muatan/i,
      /nomor rangka/i,
      /nomor mesin/i,
      /nomor bpkb/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('lists the jenis armada options it was given', () => {
    renderWithForm((form) => <IdentitySection form={form} jenisArmada={jenisArmada} />)
    expect(screen.getByRole('option', { name: 'Colt Diesel Engkel' })).toBeInTheDocument()
  })

  // Each field asserted against its own key: a caption wired to its neighbour's setter is the
  // defect a nine-field section actually produces, and it writes the wrong column in silence.
  it.each([
    [/nomor polisi/i, 'B9114KYZ', 'nopol', 'B9114KYZ'],
    [/merk/i, 'Mitsubishi', 'merk', 'Mitsubishi'],
    [/^tipe/i, 'Canter FE 74 HD', 'tipe', 'Canter FE 74 HD'],
    [/tahun pembuatan/i, '2021', 'tahun', '2021'],
    [/kapasitas muatan/i, '8 ton', 'kapasitas', '8 ton'],
    [/nomor rangka/i, 'MHM111', 'noRangka', 'MHM111'],
    [/nomor mesin/i, '4D34-1', 'noMesin', '4D34-1'],
    [/nomor bpkb/i, 'M-01', 'noBpkb', 'M-01'],
  ])('writes %s through to the form state', (label, typed, key, expected) => {
    const { result } = renderWithForm((form) => (
      <IdentitySection form={form} jenisArmada={jenisArmada} />
    ))
    fireEvent.change(screen.getByLabelText(label), { target: { value: typed } })
    expect(result.current.values[key as 'nopol']).toBe(expected)
  })

  // Requirement §1, seen from the operator's side: the separators disappear while they type.
  it('shows the plate tightened as it is typed', () => {
    renderWithForm((form) => <IdentitySection form={form} jenisArmada={jenisArmada} />)
    const input = screen.getByLabelText(/nomor polisi/i)
    fireEvent.change(input, { target: { value: 'b 9114-kyz' } })
    expect(input).toHaveValue('B9114KYZ')
  })

  it('shows the error the hook reported for a field', () => {
    const result = useForm()
    result.current.validate()
    render(<IdentitySection form={result.current} jenisArmada={jenisArmada} />)
    expect(screen.getByText(/nomor polisi wajib diisi/i)).toBeInTheDocument()
  })
})

describe('LeaseSection', () => {
  const renderLease = () =>
    renderWithForm((form) => (
      <LeaseSection form={form} kepemilikan={kepemilikan} leasing={leasing} />
    ))

  // Requirement §3: the section had two fields and needs eight.
  it('renders all eight ownership and lease fields', () => {
    renderLease()
    for (const label of [
      /status kepemilikan/i,
      /pemilik/i,
      /perusahaan leasing/i,
      /nomor kontrak/i,
      /cicilan/i,
      /total angsuran/i,
      /tanggal angsuran pertama/i,
      /angsuran sudah dibayar/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it.each([
    [/nomor kontrak/i, 'MTF-2024-03-11872', 'nomorKontrak'],
    [/cicilan/i, '8750000', 'cicilanPerBulan'],
    [/total angsuran/i, '36', 'tenorBulan'],
    [/tanggal angsuran pertama/i, '2026-01-10', 'angsuranMulai'],
    [/angsuran sudah dibayar/i, '4', 'angsuranTerbayar'],
  ])('writes %s through to the form state', (label, typed, key) => {
    const { result } = renderLease()
    fireEvent.change(screen.getByLabelText(label), { target: { value: typed } })
    expect(result.current.values[key as 'nomorKontrak']).toBe(typed)
  })

  // Requirement §2 marks this the one optional field on the section, and the asterisk is how an
  // operator knows it before pressing Simpan.
  it('marks angsuran sudah dibayar as the only optional field', () => {
    renderLease()
    expect(screen.getByText(/angsuran sudah dibayar/i).querySelector('[aria-hidden]')).toBeNull()
    expect(screen.getByText(/nomor kontrak/i).querySelector('[aria-hidden]')).not.toBeNull()
  })

  // Spec §5.1 bersyarat: the owner field only matters for a rented unit, and leaving it enabled
  // invites somebody to fill in a company that does not own the truck.
  it('disables the owner field until the unit is a rented one', () => {
    const { result } = renderLease()
    expect(screen.getByLabelText(/pemilik/i)).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/status kepemilikan/i), { target: { value: 'kp-sewa' } })
    render(<LeaseSection form={result.current} kepemilikan={kepemilikan} leasing={leasing} />)
    expect(screen.getAllByLabelText(/pemilik/i)[1]).toBeEnabled()
  })
})

describe('OperationalSection', () => {
  const renderOps = () =>
    renderWithForm((form) => (
      <OperationalSection form={form} pool={pool} status={status} drivers={drivers} />
    ))

  it('renders the operational fields', () => {
    renderOps()
    for (const label of [
      /sopir penanggung jawab/i,
      /nomor sim/i,
      /masa berlaku sim/i,
      /pool/i,
      /status kendaraan/i,
      /odometer/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('lists the drivers it was given', () => {
    renderOps()
    expect(screen.getByRole('option', { name: 'Ahmad Fauzi' })).toBeInTheDocument()
  })

  // Requirement #1 and spec §6: the licence is the driver's, held once in the Sopir module. The
  // form shows it and never stores a second copy.
  it('fills the SIM fields from the chosen driver', () => {
    const { result } = renderOps()
    fireEvent.change(screen.getByLabelText(/sopir penanggung jawab/i), {
      target: { value: 'dr1' },
    })
    render(<OperationalSection form={result.current} pool={pool} status={status} drivers={drivers} />)
    expect(screen.getAllByLabelText(/nomor sim/i)[1]).toHaveValue('3201-1122-3344')
    expect(screen.getAllByLabelText(/masa berlaku sim/i)[1]).toHaveValue('2027-03-14')
  })

  // Read-only, not merely unfilled: a licence typed per-vehicle is a second copy that drifts out
  // of step with the Sopir module the moment one of them is renewed.
  it('keeps the SIM fields read-only', () => {
    renderOps()
    expect(screen.getByLabelText(/nomor sim/i)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/masa berlaku sim/i)).toHaveAttribute('readonly')
  })

  it('shows empty SIM fields while no driver is chosen', () => {
    renderOps()
    expect(screen.getByLabelText(/nomor sim/i)).toHaveValue('')
  })

  it('writes the odometer through to the form state', () => {
    const { result } = renderOps()
    fireEvent.change(screen.getByLabelText(/odometer/i), { target: { value: '120000' } })
    expect(result.current.values.odometer).toBe('120000')
  })
})

describe('DocumentSection', () => {
  const stnk = [docTypes[0]]
  const servis = [docTypes[1]]

  it('renders a number, an issue date and an expiry per document type', () => {
    renderWithForm((form) => (
      <DocumentSection title="Dokumen Kendaraan" form={form} types={stnk} />
    ))
    expect(screen.getByLabelText(/stnk nomor/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/stnk terbit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/masa berlaku stnk/i)).toBeInTheDocument()
  })

  // Requirement #2, the whole point of docLabels: a service record has a last date and a next
  // one. "Servis berkala terbit" and "Servis berkala berlaku sampai" read as nonsense.
  it('names the service dates for what they are', () => {
    renderWithForm((form) => (
      <DocumentSection title="Servis dan Perawatan" form={form} types={servis} showNomor={false} />
    ))
    expect(screen.getByLabelText(/servis berkala terakhir/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/servis berkala berikutnya/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/terbit/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/berlaku sampai/i)).not.toBeInTheDocument()
  })

  // A service record has no document number to type. Rendering one anyway asks the operator a
  // question with no answer.
  it('leaves the number field out when the section does not want one', () => {
    renderWithForm((form) => (
      <DocumentSection title="Servis dan Perawatan" form={form} types={servis} showNomor={false} />
    ))
    expect(screen.queryByLabelText(/nomor/i)).not.toBeInTheDocument()
  })

  it('writes each document field through to the form state', () => {
    const { result } = renderWithForm((form) => (
      <DocumentSection title="Dokumen Kendaraan" form={form} types={stnk} />
    ))
    fireEvent.change(screen.getByLabelText(/stnk nomor/i), { target: { value: 'STNK-1' } })
    fireEvent.change(screen.getByLabelText(/stnk terbit/i), { target: { value: '2026-01-10' } })
    fireEvent.change(screen.getByLabelText(/masa berlaku stnk/i), {
      target: { value: '2031-01-10' },
    })
    expect(result.current.docRow('dt-stnk')).toEqual({
      nomor: 'STNK-1',
      issuedAt: '2026-01-10',
      expiresAt: '2031-01-10',
    })
  })

  // Spec §4.2: which documents are mandatory lives in master data, so the asterisk has to be read
  // off the row rather than hardcoded per section.
  it('marks the expiry required for a type flagged required', () => {
    renderWithForm((form) => (
      <DocumentSection title="Dokumen Kendaraan" form={form} types={docTypes} />
    ))
    expect(screen.getByText(/masa berlaku stnk/i).querySelector('[aria-hidden]')).not.toBeNull()
    expect(screen.getByText(/servis berkala berikutnya/i).querySelector('[aria-hidden]')).toBeNull()
  })

  it('shows the error the hook reported against a required document', () => {
    const result = useForm()
    result.current.validate()
    render(<DocumentSection title="Dokumen Kendaraan" form={result.current} types={docTypes} />)
    expect(screen.getByText(/masa berlaku stnk wajib diisi/i)).toBeInTheDocument()
  })

  // docTypes arrives from a query that has not resolved at first paint. A section that throws on
  // an empty list takes the whole dialog down with it.
  it('renders nothing but its heading while the types are still loading', () => {
    renderWithForm((form) => <DocumentSection title="Dokumen Kendaraan" form={form} types={[]} />)
    expect(screen.getByText('Dokumen Kendaraan')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test sections`
Expected: FAIL — `Cannot find module './IdentitySection'`.

- [ ] **Step 3: Tulis `IdentitySection`**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/IdentitySection.tsx`:

```tsx
'use client'

import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetMasterRow } from '../../types'
import { MasterSelect, Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface IdentitySectionProps {
  form: VehicleFormApi
  jenisArmada: FleetMasterRow[]
}

export function IdentitySection({ form, jenisArmada }: IdentitySectionProps) {
  const { values, errors, setValue } = form

  return (
    <Section title="Identitas Kendaraan">
      <FormField label="Nomor Polisi" htmlFor="vf-nopol" required error={errors.nopol}>
        <Input
          id="vf-nopol"
          value={values.nopol}
          onChange={(e) => setValue('nopol', e.target.value)}
          placeholder="B9114KYZ"
        />
      </FormField>

      <FormField label="Merk" htmlFor="vf-merk" required error={errors.merk}>
        <Input
          id="vf-merk"
          value={values.merk}
          onChange={(e) => setValue('merk', e.target.value)}
          placeholder="Mitsubishi"
        />
      </FormField>

      <FormField label="Tipe" htmlFor="vf-tipe" required error={errors.tipe}>
        <Input
          id="vf-tipe"
          value={values.tipe}
          onChange={(e) => setValue('tipe', e.target.value)}
          placeholder="Canter FE 74 HD"
        />
      </FormField>

      <MasterSelect
        id="vf-jenis-armada"
        label="Jenis Armada"
        required
        value={values.jenisArmadaId}
        onChange={(v) => setValue('jenisArmadaId', v)}
        options={jenisArmada}
        error={errors.jenisArmadaId}
      />

      <FormField label="Tahun Pembuatan" htmlFor="vf-tahun" required error={errors.tahun}>
        <Input
          id="vf-tahun"
          type="number"
          value={values.tahun}
          onChange={(e) => setValue('tahun', e.target.value)}
          placeholder="2021"
        />
      </FormField>

      {/* Free text on purpose: the unit can be tonnes, cubic metres, or both at once. */}
      <FormField
        label="Kapasitas Muatan"
        htmlFor="vf-kapasitas"
        required
        error={errors.kapasitas}
        hint="Contoh: 8 ton / 24 m3"
      >
        <Input
          id="vf-kapasitas"
          value={values.kapasitas}
          onChange={(e) => setValue('kapasitas', e.target.value)}
        />
      </FormField>

      <FormField label="Nomor Rangka" htmlFor="vf-rangka" required error={errors.noRangka}>
        <Input
          id="vf-rangka"
          value={values.noRangka}
          onChange={(e) => setValue('noRangka', e.target.value)}
          placeholder="MHMFE74P5MK000111"
        />
      </FormField>

      <FormField label="Nomor Mesin" htmlFor="vf-mesin" required error={errors.noMesin}>
        <Input
          id="vf-mesin"
          value={values.noMesin}
          onChange={(e) => setValue('noMesin', e.target.value)}
        />
      </FormField>

      <FormField label="Nomor BPKB" htmlFor="vf-bpkb" required error={errors.noBpkb}>
        <Input
          id="vf-bpkb"
          value={values.noBpkb}
          onChange={(e) => setValue('noBpkb', e.target.value)}
        />
      </FormField>
    </Section>
  )
}
```

- [ ] **Step 4: Tulis `LeaseSection`**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/LeaseSection.tsx`:

```tsx
'use client'

import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetMasterRow } from '../../types'
import { MasterSelect, Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface LeaseSectionProps {
  form: VehicleFormApi
  kepemilikan: FleetMasterRow[]
  leasing: FleetMasterRow[]
}

export function LeaseSection({ form, kepemilikan, leasing }: LeaseSectionProps) {
  const { values, errors, isRented, setValue } = form

  return (
    <Section title="Kepemilikan & Leasing">
      <MasterSelect
        id="vf-kepemilikan"
        label="Status Kepemilikan Unit"
        required
        value={values.kepemilikanId}
        onChange={(v) => setValue('kepemilikanId', v)}
        options={kepemilikan}
        error={errors.kepemilikanId}
      />

      {/* Disabled rather than hidden: a field that vanishes as the dropdown changes makes the
          section jump under the operator's cursor, and they lose their place in eight fields. */}
      <FormField
        label="Pemilik / Vendor Sewa"
        htmlFor="vf-pemilik"
        required={isRented}
        error={errors.pemilikUnit}
        hint={isRented ? undefined : 'Hanya untuk unit sewa lepas kunci'}
      >
        <Input
          id="vf-pemilik"
          value={values.pemilikUnit}
          disabled={!isRented}
          onChange={(e) => setValue('pemilikUnit', e.target.value)}
        />
      </FormField>

      <MasterSelect
        id="vf-leasing"
        label="Perusahaan Leasing"
        required
        value={values.leasingId}
        onChange={(v) => setValue('leasingId', v)}
        options={leasing}
        error={errors.leasingId}
      />

      <FormField label="Nomor Kontrak" htmlFor="vf-kontrak" required error={errors.nomorKontrak}>
        <Input
          id="vf-kontrak"
          value={values.nomorKontrak}
          onChange={(e) => setValue('nomorKontrak', e.target.value)}
          placeholder="MTF-2024-03-11872"
        />
      </FormField>

      {/* No thousands separators, per requirement §2: the operator types the figure the contract
          shows and the input parses it without a formatter standing in between. */}
      <FormField
        label="Cicilan / Sewa per Bulan (Rp)"
        htmlFor="vf-cicilan"
        required
        error={errors.cicilanPerBulan}
      >
        <Input
          id="vf-cicilan"
          type="number"
          value={values.cicilanPerBulan}
          onChange={(e) => setValue('cicilanPerBulan', e.target.value)}
          placeholder="8750000"
        />
      </FormField>

      <FormField
        label="Total Angsuran (bulan)"
        htmlFor="vf-tenor"
        required
        error={errors.tenorBulan}
      >
        <Input
          id="vf-tenor"
          type="number"
          value={values.tenorBulan}
          onChange={(e) => setValue('tenorBulan', e.target.value)}
          placeholder="36"
        />
      </FormField>

      <FormField
        label="Tanggal Angsuran Pertama"
        htmlFor="vf-angsuran-mulai"
        required
        error={errors.angsuranMulai}
      >
        <Input
          id="vf-angsuran-mulai"
          type="date"
          value={values.angsuranMulai}
          onChange={(e) => setValue('angsuranMulai', e.target.value)}
        />
      </FormField>

      {/* The one optional field on the section (requirement §2). Left blank the backend counts
          the months since the first instalment, and keeps counting as they pass. */}
      <FormField
        label="Angsuran Sudah Dibayar"
        htmlFor="vf-angsuran-terbayar"
        hint="Kosongkan untuk dihitung otomatis dari tanggal angsuran pertama"
      >
        <Input
          id="vf-angsuran-terbayar"
          type="number"
          value={values.angsuranTerbayar}
          onChange={(e) => setValue('angsuranTerbayar', e.target.value)}
        />
      </FormField>
    </Section>
  )
}
```

- [ ] **Step 5: Tulis `OperationalSection`**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/OperationalSection.tsx`:

```tsx
'use client'

import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetDriver, FleetMasterRow } from '../../types'
import { MasterSelect, SELECT_CLASS, Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface OperationalSectionProps {
  form: VehicleFormApi
  pool: FleetMasterRow[]
  status: FleetMasterRow[]
  drivers: FleetDriver[]
}

export function OperationalSection({ form, pool, status, drivers }: OperationalSectionProps) {
  const { values, errors, driver, setValue } = form

  return (
    <Section title="Operasional & Sopir">
      {/* Drivers are rows of fleet_drivers, not master data, so this select is written out rather
          than routed through MasterSelect — the option label is the driver's name. */}
      <FormField label="Sopir Penanggung Jawab" htmlFor="vf-sopir">
        <select
          id="vf-sopir"
          className={SELECT_CLASS}
          value={values.driverId}
          onChange={(e) => setValue('driverId', e.target.value)}
        >
          <option value="">— pilih —</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nama}
            </option>
          ))}
        </select>
      </FormField>

      {/* Read-only on purpose (spec §6). The licence belongs to the driver and is held once, in
          the Sopir module; a copy typed here would drift the moment either side is renewed. */}
      <FormField
        label="Nomor SIM Sopir"
        htmlFor="vf-sim-nomor"
        hint="Terisi dari data sopir — ubah di modul Sopir"
      >
        <Input id="vf-sim-nomor" value={driver?.simNomor ?? ''} readOnly />
      </FormField>

      <FormField
        label="Masa Berlaku SIM"
        htmlFor="vf-sim-expires"
        hint="Terisi dari data sopir — ubah di modul Sopir"
      >
        <Input id="vf-sim-expires" type="date" value={driver?.simExpiresAt ?? ''} readOnly />
      </FormField>

      <MasterSelect
        id="vf-pool"
        label="Pool / Domisili"
        required
        value={values.poolId}
        onChange={(v) => setValue('poolId', v)}
        options={pool}
        error={errors.poolId}
      />

      <MasterSelect
        id="vf-status"
        label="Status Kendaraan"
        value={values.statusId}
        onChange={(v) => setValue('statusId', v)}
        options={status}
        error={errors.statusId}
      />

      <FormField
        label="Odometer Terakhir (km)"
        htmlFor="vf-odometer"
        error={errors.odometer}
        hint="Dipakai menghitung biaya servis per 1.000 km"
      >
        <Input
          id="vf-odometer"
          type="number"
          value={values.odometer}
          onChange={(e) => setValue('odometer', e.target.value)}
        />
      </FormField>
    </Section>
  )
}
```

- [ ] **Step 6: Tulis `DocumentSection`**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/DocumentSection.tsx`:

```tsx
'use client'

// React is imported by name because each document renders as a keyed React.Fragment.
import * as React from 'react'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/form-field'
import { FleetMasterRow } from '../../types'
import { docLabels } from '../../utils/doc-labels'
import { Section } from './form-primitives'
import { VehicleFormApi } from './useVehicleForm'

interface DocumentSectionProps {
  title: string
  form: VehicleFormApi
  types: FleetMasterRow[]
  // Section 6 sets this false: a service record has no document number to type, and asking for
  // one puts a question on the form that has no answer.
  showNomor?: boolean
}

// Serves sections 4, 5 and 6 — they differ only in which document types they list and in what
// their dates are called. Three near-identical components would drift apart on the first change.
export function DocumentSection({ title, form, types, showNomor = true }: DocumentSectionProps) {
  const { docRow, setDocField, errors } = form

  return (
    <Section title={title}>
      {types.map((type) => {
        const labels = docLabels(type.code, type.label)
        const row = docRow(type.id)
        // Read off the master row rather than hardcoded here (spec §4.2), so the asterisk follows
        // whatever the admin has set on the Master Data page.
        const required = type.isRequired === true

        return (
          <React.Fragment key={type.id}>
            {showNomor && (
              <FormField label={`${type.label} Nomor`} htmlFor={`vf-doc-${type.id}-nomor`}>
                <Input
                  id={`vf-doc-${type.id}-nomor`}
                  value={row.nomor}
                  onChange={(e) => setDocField(type.id, 'nomor', e.target.value)}
                />
              </FormField>
            )}

            <FormField label={labels.issued} htmlFor={`vf-doc-${type.id}-issued`}>
              <Input
                id={`vf-doc-${type.id}-issued`}
                type="date"
                value={row.issuedAt}
                onChange={(e) => setDocField(type.id, 'issuedAt', e.target.value)}
              />
            </FormField>

            <FormField
              label={labels.expires}
              htmlFor={`vf-doc-${type.id}-expires`}
              required={required}
              error={errors[`doc-${type.id}`]}
            >
              <Input
                id={`vf-doc-${type.id}-expires`}
                type="date"
                value={row.expiresAt}
                onChange={(e) => setDocField(type.id, 'expiresAt', e.target.value)}
              />
            </FormField>
          </React.Fragment>
        )
      })}
    </Section>
  )
}
```

- [ ] **Step 7: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test sections`
Expected: PASS seluruhnya.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/fleet/components/vehicle-form
git commit -m "$(cat <<'EOF'
feat(fleet): split the vehicle form into its six sections

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Dialog enam section

`VehicleFormDialog` ditulis ulang: state pindah ke hook Task 13, tata letak pindah ke section-section Task 14, dan yang tersisa di file ini hanya kerangka dialog, pembagian jenis dokumen ke tiga section, serta penanganan submit. Lebarnya naik ke `sm:max-w-4xl` (spec §6).

Pembagian jenis dokumen: `kir` masuk section 4, `servis` masuk section 6, sisanya section 5. Dipecah dari daftar master data, jadi jenis dokumen baru yang ditambah admin otomatis mendarat di section 5 tanpa perubahan kode.

**Files:**
- Modify: `apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx` (tulis ulang)
- Modify: `apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx` (tulis ulang)

**Interfaces:**
- Consumes: `useVehicleForm` (Task 13); keempat section (Task 14); `apiErrorMessage`
- Produces: `VehicleFormDialog` dengan props baru —

  ```ts
  interface VehicleMasterData {
    jenisArmada: FleetMasterRow[]
    kepemilikan: FleetMasterRow[]
    leasing: FleetMasterRow[]   // baru
    pool: FleetMasterRow[]
    status: FleetMasterRow[]
    jenisDokumen: FleetMasterRow[]   // baru
  }
  ```

  `onSubmit` sekarang menerima `FleetVehiclePayload` yang membawa `lease` dan `documents`. Dipakai Task 18.

File ini ada di `features/**`, jadi **tanpa semicolon**.

- [ ] **Step 1: Tulis ulang spec-nya**

Ganti seluruh isi `apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx`. Spec lama menguji state per-field yang sekarang sudah dipin di `useVehicleForm.spec.ts` dan di `sections.spec.tsx`; yang tersisa di sini adalah apa yang hanya dialog ini yang tahu — keenam legend, pembagian dokumen ke section, dan siklus submit.

```tsx
import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VehicleFormDialog } from './VehicleFormDialog'
import { FleetDriver, FleetMasterRow, FleetVehicle } from '../types'

const master = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 'm1',
  category: 'pool',
  code: 'm1',
  label: 'M1',
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
  ...over,
})

const docTypes: FleetMasterRow[] = [
  master({ id: 'dt-stnk', category: 'jenis_dokumen', code: 'stnk', label: 'STNK', sortOrder: 1, isRequired: true }),
  master({ id: 'dt-kir', category: 'jenis_dokumen', code: 'kir', label: 'KIR', sortOrder: 2, defaultValidMonths: 6 }),
  master({ id: 'dt-servis', category: 'jenis_dokumen', code: 'servis', label: 'Servis Berkala', sortOrder: 3 }),
]

const masterData = {
  jenisArmada: [master({ id: 'ja1', category: 'jenis_armada', label: 'Colt Diesel Engkel' })],
  kepemilikan: [
    master({ id: 'kp-esp', category: 'kepemilikan', code: 'milik_esp', label: 'Milik ESP' }),
    master({ id: 'kp-sewa', category: 'kepemilikan', code: 'sewa_lepas_kunci', label: 'Sewa Lepas Kunci' }),
  ],
  leasing: [master({ id: 'ls1', category: 'leasing', code: 'mtf', label: 'MTF' })],
  pool: [master({ id: 'p1', category: 'pool', label: 'Pool Cakung' })],
  status: [master({ id: 's1', category: 'status_kendaraan', label: 'Beroperasi' })],
  jenisDokumen: docTypes,
}

const driver: FleetDriver = {
  id: 'dr1',
  nama: 'Ahmad Fauzi',
  telepon: null,
  simNomor: '3201-1122-3344',
  simJenisId: null,
  simExpiresAt: '2027-03-14',
  isActive: true,
}

const setup = (over: Record<string, unknown> = {}) => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <VehicleFormDialog
      open
      masterData={masterData}
      drivers={[driver]}
      onSubmit={onSubmit}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSubmit, onClose }
}

const set = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

// Fills only what spec §5.1 makes mandatory, so a test that adds nothing gets past validation
// and a test that clears one field sees exactly one error.
const fillRequired = () => {
  set(/nomor polisi/i, 'B9114KYZ')
  set(/merk/i, 'Mitsubishi')
  set(/^tipe/i, 'Canter FE 74 HD')
  set(/jenis armada/i, 'ja1')
  set(/tahun pembuatan/i, '2021')
  set(/kapasitas muatan/i, '8 ton')
  set(/nomor rangka/i, 'MHM111')
  set(/nomor mesin/i, '4D34-1')
  set(/nomor bpkb/i, 'M-01')
  set(/status kepemilikan/i, 'kp-esp')
  set(/perusahaan leasing/i, 'ls1')
  set(/nomor kontrak/i, 'MTF-1')
  set(/cicilan/i, '8750000')
  set(/total angsuran/i, '36')
  set(/tanggal angsuran pertama/i, '2026-01-10')
  set(/pool/i, 'p1')
  set(/masa berlaku stnk/i, '2031-01-10')
}

describe('VehicleFormDialog', () => {
  // Requirement #1: all six sections in one form, each a real fieldset so a screen reader
  // announces which one the operator has tabbed into.
  it('renders all six sections', () => {
    setup()
    for (const name of [
      /identitas kendaraan/i,
      /kepemilikan & leasing/i,
      /operasional & sopir/i,
      /uji berkala/i,
      /dokumen kendaraan/i,
      /servis dan perawatan/i,
    ]) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument()
    }
  })

  it('names the dialog for what it is doing', () => {
    setup()
    expect(screen.getByRole('heading', { name: /tambah armada/i })).toBeInTheDocument()
  })

  it('names the dialog Ubah when editing', () => {
    setup({ initial: { id: 'v1', nopol: 'B9114KYZ', documents: [] } as unknown as FleetVehicle })
    expect(screen.getByRole('heading', { name: /ubah armada/i })).toBeInTheDocument()
  })

  // The split is by code, and it decides which of three sections each document lands in. Wrong,
  // and KIR appears among the general documents with the wrong labels around it.
  it('puts KIR in its own section', () => {
    setup()
    const kir = screen.getByRole('group', { name: /uji berkala/i })
    expect(kir).toContainElement(screen.getByLabelText(/tanggal uji kir/i))
    expect(kir).toContainElement(screen.getByLabelText(/masa berlaku kir sampai/i))
  })

  it('puts the service record in the servis section', () => {
    setup()
    const servis = screen.getByRole('group', { name: /servis dan perawatan/i })
    expect(servis).toContainElement(screen.getByLabelText(/servis berkala terakhir/i))
    expect(servis).toContainElement(screen.getByLabelText(/servis berkala berikutnya/i))
  })

  it('puts every other document type in the dokumen section', () => {
    setup()
    const dokumen = screen.getByRole('group', { name: /dokumen kendaraan/i })
    expect(dokumen).toContainElement(screen.getByLabelText(/masa berlaku stnk/i))
  })

  // An admin can add a document type at any time; it must land somewhere rather than vanish.
  it('puts an unknown document type in the dokumen section', () => {
    setup({
      masterData: {
        ...masterData,
        jenisDokumen: [
          ...docTypes,
          master({ id: 'dt-tera', category: 'jenis_dokumen', code: 'sertifikat_tera', label: 'Sertifikat Tera' }),
        ],
      },
    })
    const dokumen = screen.getByRole('group', { name: /dokumen kendaraan/i })
    expect(dokumen).toContainElement(screen.getByLabelText(/sertifikat tera berlaku sampai/i))
  })

  // Section 6 writes to fleet_vehicles.catatan, not to a document row — it is the one field on
  // that section that is not a date.
  it('keeps the free-text note in the servis section', () => {
    setup()
    expect(screen.getByRole('group', { name: /servis dan perawatan/i })).toContainElement(
      screen.getByLabelText(/catatan/i),
    )
  })

  // Requirement §4: six months after the test date, from the master row's defaultValidMonths.
  it('pre-fills the KIR expiry six months after the test date', () => {
    setup()
    set(/tanggal uji kir/i, '2026-03-10')
    expect(screen.getByLabelText(/masa berlaku kir sampai/i)).toHaveValue('2026-09-10')
  })

  it('refuses to submit an empty form and says which field', async () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/nomor polisi wajib diisi/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses to submit without the mandatory documents', async () => {
    const { onSubmit } = setup()
    fillRequired()
    set(/masa berlaku stnk/i, '')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/masa berlaku stnk wajib diisi/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // The whole form arrives as one payload, so the backend can write the vehicle, its contract
  // and its documents in one transaction (spec §5).
  it('sends the vehicle, the lease and the documents together', async () => {
    const { onSubmit } = setup()
    fillRequired()
    set(/tanggal uji kir/i, '2026-03-10')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).toMatchObject({
      nopol: 'B9114KYZ',
      merk: 'Mitsubishi',
      poolId: 'p1',
      lease: {
        leasingId: 'ls1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
        angsuranTerbayar: null,
      },
    })
    expect(payload.documents).toEqual(
      expect.arrayContaining([
        { docTypeId: 'dt-stnk', nomor: null, issuedAt: null, expiresAt: '2031-01-10' },
        { docTypeId: 'dt-kir', nomor: null, issuedAt: '2026-03-10', expiresAt: '2026-09-10' },
      ]),
    )
  })

  it('leaves untouched document rows out of the payload', async () => {
    const { onSubmit } = setup()
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].documents).toEqual([
      { docTypeId: 'dt-stnk', nomor: null, issuedAt: null, expiresAt: '2031-01-10' },
    ])
  })

  it('closes after a successful save', async () => {
    const { onClose } = setup()
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // The 409 from a duplicate plate is the likeliest error here and the backend's message names
  // the plate. Swallowing it for a generic string loses the only useful part.
  it('shows the backend message when the save is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'Plate "B9114KYZ" is already registered' } },
    })
    setup({ onSubmit })
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
  })

  it('stays open when the save fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'))
    const { onClose } = setup({ onSubmit })
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await screen.findByText(/terjadi kesalahan/i)
    expect(onClose).not.toHaveBeenCalled()
  })

  // Without this a double-click sends two POSTs and registers the vehicle twice — or fails the
  // second with a 409 that looks like the first one failed.
  it('disables the submit button while saving', async () => {
    let resolve: () => void = () => {}
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)))
    setup({ onSubmit })
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /menyimpan/i })).toBeDisabled())
    resolve()
  })

  // Without preventDefault the browser navigates away on submit and the operator loses a
  // 22-field form. Nothing else in the suite notices, because jsdom does not navigate.
  it('prevents the browser default form submit', () => {
    setup()
    const form = document.querySelector('form') as HTMLFormElement
    const submitEvent = createEvent.submit(form)
    fireEvent(form, submitEvent)
    expect(submitEvent.defaultPrevented).toBe(true)
  })

  it('closes without saving when cancelled', () => {
    const { onSubmit, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /batal/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Escape is the only keyboard way out of this dialog; a regression in onOpenChange strands the
  // operator inside it with no exit.
  it('closes without saving when dismissed with Escape', async () => {
    const { onSubmit, onClose } = setup()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // jenisDokumen arrives from a query that has not resolved at first paint. The three document
  // sections must render empty rather than throw and take the dialog down with them.
  it('still opens while the document types are loading', () => {
    setup({ masterData: { ...masterData, jenisDokumen: [] } })
    expect(screen.getByRole('group', { name: /dokumen kendaraan/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/nomor polisi/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test VehicleFormDialog`
Expected: FAIL — enam section belum ada, `masterData.leasing` belum dikenali.

- [ ] **Step 3: Tulis ulang dialognya**

Ganti seluruh isi `apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/form-field'
import { FleetDriver, FleetMasterRow, FleetVehicle, FleetVehiclePayload } from '../types'
import { apiErrorMessage } from '../utils/api-error'
import { DocumentSection } from './vehicle-form/DocumentSection'
import { IdentitySection } from './vehicle-form/IdentitySection'
import { LeaseSection } from './vehicle-form/LeaseSection'
import { OperationalSection } from './vehicle-form/OperationalSection'
import { Section } from './vehicle-form/form-primitives'
import { useVehicleForm } from './vehicle-form/useVehicleForm'

interface VehicleMasterData {
  jenisArmada: FleetMasterRow[]
  kepemilikan: FleetMasterRow[]
  leasing: FleetMasterRow[]
  pool: FleetMasterRow[]
  status: FleetMasterRow[]
  jenisDokumen: FleetMasterRow[]
}

interface VehicleFormDialogProps {
  open: boolean
  initial?: FleetVehicle
  masterData: VehicleMasterData
  drivers: FleetDriver[]
  onSubmit: (payload: FleetVehiclePayload) => Promise<void>
  onClose: () => void
}

// Sections 4 and 6 each own one document type; everything else collects in section 5. Split by
// code rather than by a list of ids, so a type an admin adds later still lands somewhere.
const KIR_CODE = 'kir'
const SERVIS_CODE = 'servis'

export function VehicleFormDialog({
  open,
  initial,
  masterData,
  drivers,
  onSubmit,
  onClose,
}: VehicleFormDialogProps) {
  const form = useVehicleForm({
    initial,
    docTypes: masterData.jenisDokumen,
    kepemilikan: masterData.kepemilikan,
    drivers,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { kir, servis, lainnya } = useMemo(() => {
    const types = masterData.jenisDokumen
    return {
      kir: types.filter((t) => t.code === KIR_CODE),
      servis: types.filter((t) => t.code === SERVIS_CODE),
      lainnya: types.filter((t) => t.code !== KIR_CODE && t.code !== SERVIS_CODE),
    }
  }, [masterData.jenisDokumen])

  const handleSubmit = async (e: React.FormEvent) => {
    // Without this the browser navigates away and the operator loses a 22-field form.
    e.preventDefault()
    setError(null)
    if (!form.validate()) return

    setSubmitting(true)
    try {
      await onSubmit(form.buildPayload())
      onClose()
    } catch (err) {
      // The backend's own message names the plate that clashed; the fallback only covers the
      // case where the request never reached it.
      setError(apiErrorMessage(err, 'Terjadi kesalahan saat menyimpan armada.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* Wider than the two-column dialogs elsewhere (spec §6): six sections at sm:max-w-2xl
          turn into a column the operator has to scroll for a minute. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah armada' : 'Tambah armada'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <IdentitySection form={form} jenisArmada={masterData.jenisArmada} />

          <LeaseSection
            form={form}
            kepemilikan={masterData.kepemilikan}
            leasing={masterData.leasing}
          />

          <OperationalSection
            form={form}
            pool={masterData.pool}
            status={masterData.status}
            drivers={drivers}
          />

          <DocumentSection title="Uji Berkala (KIR)" form={form} types={kir} />

          <DocumentSection title="Dokumen Kendaraan" form={form} types={lainnya} />

          {/* The only section with a field that is not a document: catatan belongs to the
              vehicle row, so it is rendered here rather than inside DocumentSection. */}
          <DocumentSection
            title="Servis dan Perawatan"
            form={form}
            types={servis}
            showNomor={false}
          />

          <Section title="Catatan">
            <FormField label="Catatan" htmlFor="vf-catatan" className="sm:col-span-2">
              <textarea
                id="vf-catatan"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.values.catatan}
                onChange={(e) => form.setValue('catatan', e.target.value)}
              />
            </FormField>
          </Section>

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle size={16} aria-hidden="true" />
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

- [ ] **Step 4: Pindahkan catatan ke dalam section Servis**

Test `'keeps the free-text note in the servis section'` menuntut `catatan` berada di dalam group Servis, sementara kode di Step 3 menaruhnya di section terpisah. Kode itu sengaja ditulis begitu supaya langkah ini punya kegagalan yang nyata untuk diperbaiki, bukan diterima karena kebetulan lulus.

Hapus blok `<Section title="Catatan">` beserta isinya, dan ubah `DocumentSection` untuk menerima anak tambahan. Di `DocumentSection.tsx`, tambahkan prop:

```tsx
interface DocumentSectionProps {
  title: string
  form: VehicleFormApi
  types: FleetMasterRow[]
  showNomor?: boolean
  // Section 6 passes the vehicle's own catatan field down here. It is not a document, but it
  // belongs on that section — and a fieldset with two legends is not a thing.
  children?: React.ReactNode
}
```

Tambahkan `children` ke destructuring dan render setelah `types.map(...)`, masih di dalam `<Section>`:

```tsx
export function DocumentSection({
  title,
  form,
  types,
  showNomor = true,
  children,
}: DocumentSectionProps) {
```

```tsx
      })}
      {children}
    </Section>
```

Lalu di `VehicleFormDialog.tsx`, ganti blok Servis dan section Catatan dengan satu blok:

```tsx
          <DocumentSection
            title="Servis dan Perawatan"
            form={form}
            types={servis}
            showNomor={false}
          >
            <FormField label="Catatan" htmlFor="vf-catatan" className="sm:col-span-2">
              <textarea
                id="vf-catatan"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.values.catatan}
                onChange={(e) => form.setValue('catatan', e.target.value)}
              />
            </FormField>
          </DocumentSection>
```

Hapus juga import `Section` dari `VehicleFormDialog.tsx` — tidak lagi dipakai di file ini.

- [ ] **Step 5: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleFormDialog sections`
Expected: PASS keduanya.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx \
        apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx \
        apps/frontend/src/features/fleet/components/vehicle-form/DocumentSection.tsx
git commit -m "$(cat <<'EOF'
feat(fleet): put all six sections in the vehicle form

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Label kontekstual di dialog dokumen

Dialog dokumen tetap ada — spec §5 mempertahankannya untuk perpanjangan cepat tanpa membuka form penuh. Yang berubah hanya labelnya: `{t.label} terbit` / `{t.label} berlaku sampai` diganti `docLabels()`, sehingga "Servis Berkala terbit" menjadi "Servis berkala terakhir" (requirement #2) dan kedua dialog menyebut hal yang sama dengan nama yang sama.

**Files:**
- Modify: `apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.tsx:151-168`
- Modify: `apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.spec.tsx`

**Interfaces:**
- Consumes: `docLabels` (Task 11)
- Produces: —

File ini ada di `features/**`, jadi **tanpa semicolon**.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan dua test di `VehicleDocumentsDialog.spec.tsx`, tepat setelah `it('shows a row for every configured document type', …)`:

```tsx
  // Requirement #2: the same document is called the same thing in both dialogs. "Servis Berkala
  // terbit" is not something an operator would say about a service record.
  it('names the KIR dates for what they are', () => {
    setup()
    expect(screen.getByLabelText(/tanggal uji KIR/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/masa berlaku KIR sampai/i)).toBeInTheDocument()
  })

  it('names a service record last and next, not issued and expiring', () => {
    setup({ docTypes: [docType('dt-servis', 'servis', 'Servis Berkala')] })
    expect(screen.getByLabelText(/servis berkala terakhir/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/servis berkala berikutnya/i)).toBeInTheDocument()
  })
```

Test yang sudah ada mencari label lama dan akan ikut gagal begitu labelnya berubah, jadi perbarui query-nya sekarang — masih di file yang sama:

```bash
cd apps/frontend/src/features/fleet/components
sed -i \
  -e 's#/STNK\.\*berlaku/i#/masa berlaku STNK/i#g' \
  -e 's#/KIR\.\*berlaku/i#/masa berlaku KIR sampai/i#g' \
  -e 's#/KIR\.\*terbit/i#/tanggal uji KIR/i#g' \
  VehicleDocumentsDialog.spec.tsx
```

`/STNK.*nomor/i` dan `/KIR.*nomor/i` tidak disentuh: label nomor tetap `{t.label} nomor`, dan `/STNK.*terbit/i` tetap cocok dengan "STNK terbit".

Sekalian normalisasi fixture platnya, karena setelah Task 2 tidak ada lagi nopol berspasi di database:

```bash
sed -i "s/B 9114 KYZ/B9114KYZ/g" VehicleDocumentsDialog.spec.tsx
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test VehicleDocumentsDialog`
Expected: FAIL — `Unable to find a label with the text of: /tanggal uji KIR/i`.

- [ ] **Step 3: Pakai `docLabels`**

Di `apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.tsx`, tambahkan import setelah `import { apiErrorMessage } from '../utils/api-error'`:

```tsx
import { docLabels } from '../utils/doc-labels'
```

Di dalam `docTypes.map((t) => { … })`, tepat setelah baris `const existing = existingFor(t.id)`, tambahkan:

```tsx
                // The same map the full form uses (spec §6.2), so a document is called the same
                // thing whichever dialog the operator opened it from.
                const labels = docLabels(t.code, t.label)
```

Ganti dua teks label:

```tsx
                      {t.label} terbit
```

menjadi

```tsx
                      {labels.issued}
```

dan

```tsx
                      {t.label} berlaku sampai
```

menjadi

```tsx
                      {labels.expires}
```

Label nomor (`{t.label} nomor`) dibiarkan apa adanya — "STNK nomor" sudah benar untuk setiap jenis dokumen, dan `docLabels` memang tidak memetakannya.

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleDocumentsDialog`
Expected: PASS seluruhnya.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.tsx \
        apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.spec.tsx
git commit -m "$(cat <<'EOF'
fix(fleet): call each document's dates what they actually are

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Tabel armada dengan kolom dokumen dinamis

Requirement #4 dan spec §7. Tabel berubah dari tujuh kolom tetap menjadi: Nopol · Unit · Kepemilikan · Sopir & SIM · **satu kolom per jenis dokumen aktif** · Servis · Aksi. Kolom dokumen dibangun dari master data urut `sortOrder`, jadi jenis dokumen yang ditambah admin muncul sendiri.

Tujuh jenis dokumen membuat tabel ~13 kolom dan pasti ber-scroll horizontal — itu memang bentuk prototipenya (spec §7.1), tetapi kolom Nopol dibuat sticky supaya baris tidak kehilangan identitasnya saat digeser.

Baris "Urutkan:" di atas tabel dihapus: `header` sudah `ReactNode` sejak Task 9, jadi kontrolnya masuk ke dalam `<th>` masing-masing. Tiga tombol inline di kolom Aksi diganti satu menu `⋮` (spec §7.2).

Task ini juga menambahkan `formatTanggal` — pengubahan bentuk string ISO menjadi `15 Sep 2026`. Bukan aritmetika tanggal: tidak ada selisih, tidak ada jam browser, hanya tiga bagian tanggal yang sudah ada di string-nya.

**Files:**
- Modify: `apps/frontend/src/features/fleet/components/VehicleTable.tsx` (tulis ulang)
- Modify: `apps/frontend/src/features/fleet/components/VehicleTable.spec.tsx`
- Create: `apps/frontend/src/features/fleet/utils/format-date.ts`
- Test: `apps/frontend/src/features/fleet/utils/format-date.spec.ts`

**Interfaces:**
- Consumes: `DataTableColumn.header: React.ReactNode` (Task 9); `DropdownMenu…` (Task 10); `FleetVehicle`, `FleetVehicleDocument` (Task 12)
- Produces:
  - `formatTanggal(iso: string | null): string`
  - `VehicleTable` bertambah satu prop wajib: `docTypes: FleetMasterRow[]`

  Dipakai Task 18.

File-file ini ada di `features/**`, jadi **tanpa semicolon**.

- [ ] **Step 1: Tulis test formatter yang gagal**

Buat `apps/frontend/src/features/fleet/utils/format-date.spec.ts`:

```ts
import { formatTanggal } from './format-date'

describe('formatTanggal', () => {
  // Reshaping, not arithmetic: the three parts come straight out of the string the backend sent.
  // Nothing here reads the browser clock, so two operators in different timezones read the same
  // date off the same row.
  it('writes an ISO date the way an Indonesian operator reads it', () => {
    expect(formatTanggal('2026-09-15')).toBe('15 Sep 2026')
  })

  it('keeps the leading zero off the day', () => {
    expect(formatTanggal('2026-01-05')).toBe('5 Jan 2026')
  })

  it.each([
    ['2026-01-01', '1 Jan 2026'],
    ['2026-12-31', '31 Des 2026'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatTanggal(iso)).toBe(expected)
  })

  // An em-dash, not an empty cell: a blank reads as a rendering hole, and this table has a lot of
  // legitimately empty document cells.
  it('shows an em-dash for a missing date', () => {
    expect(formatTanggal(null)).toBe('—')
  })

  it('shows an em-dash for an unparseable date', () => {
    expect(formatTanggal('kemarin')).toBe('—')
  })

  // A date-time would otherwise render as "15 Sep 2026" only by luck of the slice; pinned so a
  // backend that starts sending timestamps does not produce garbage.
  it('reads the date out of a timestamp', () => {
    expect(formatTanggal('2026-09-15T00:00:00.000Z')).toBe('15 Sep 2026')
  })
})
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test format-date`
Expected: FAIL — `Cannot find module './format-date'`.

- [ ] **Step 3: Tulis formatter-nya**

Buat `apps/frontend/src/features/fleet/utils/format-date.ts`:

```ts
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Reshapes the string the backend sent; it does not compute anything. Parsed with a regex rather
// than new Date(), because `new Date('2026-09-15')` is UTC midnight and renders as 14 September
// to anyone west of Greenwich — the row would show a different date to the one stored.
export function formatTanggal(iso: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim())
  if (!match) return '—'

  const month = Number(match[2])
  if (month < 1 || month > 12) return '—'

  return `${Number(match[3])} ${BULAN[month - 1]} ${match[1]}`
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test format-date`
Expected: PASS, 7 test.

- [ ] **Step 5: Perbarui spec tabel**

Di `apps/frontend/src/features/fleet/components/VehicleTable.spec.tsx`, normalisasi fixture plat dan tambahkan `docTypes` ke props:

```bash
cd apps/frontend/src/features/fleet/components
sed -i -e 's/B 9114 KYZ/B9114KYZ/g' -e 's/B 2000 XX/B2000XX/g' VehicleTable.spec.tsx
```

Tambahkan factory jenis dokumen tepat setelah `import { FleetVehicle } from '../types'` — sekalian perbarui import-nya:

```tsx
import { FleetMasterRow, FleetVehicle } from '../types'

const docType = (id: string, code: string, label: string, sortOrder: number): FleetMasterRow => ({
  id,
  category: 'jenis_dokumen',
  code,
  label,
  sortOrder,
  isActive: true,
  warnDays: 30,
  defaultValidMonths: null,
  isRequired: null,
})

const DOC_TYPES = [
  docType('dt1', 'kir', 'KIR', 1),
  docType('dt2', 'stnk', 'STNK', 2),
  docType('dt3', 'servis', 'Servis Berkala', 3),
]
```

Tambahkan `docTypes: DOC_TYPES,` ke objek `props` di dalam `setup`, dan ke objek `props` di dalam test `'keeps each row on its own DOM node when the list re-sorts'`.

Tiga test aksi sekarang harus membuka menunya lebih dulu. Ganti ketiganya:

```tsx
  // The three inline buttons are now one ⋮ menu (spec §7.2), so each action test opens the menu
  // for the row it means before choosing from it.
  const openMenu = (index = 0) =>
    fireEvent.click(screen.getAllByRole('button', { name: /aksi/i })[index])

  it('opens the edit dialog for a row', () => {
    const props = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ubah' }))
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('opens the documents dialog for a row', () => {
    const props = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dokumen' }))
    expect(props.onDocuments).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('archives a live row', () => {
    const props = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Arsipkan' }))
    expect(props.onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('offers restore instead of archive on an archived row', () => {
    const props = setup({ rows: [vehicle({ isActive: false })] })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Arsipkan' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pulihkan' }))
    expect(props.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('shows every action when showActions is not given', () => {
    setup()
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'Ubah' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Arsipkan' })).toBeInTheDocument()
  })

  it('hides the actions it is told to hide', () => {
    setup({ showActions: { edit: false, documents: true, archive: false } })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Ubah' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Arsipkan' })).not.toBeInTheDocument()
  })
```

Test `'shows the pool and the unit status in their own columns'` tidak lagi berlaku — Pool dan Status kini menumpang di kolom Sopir dan Nopol, mengikuti prototipe. Ganti dengan:

```tsx
  // Pool rides under the driver and the unit status under the plate, as in the prototype: with a
  // column per document type there is no room left for two columns holding one word each.
  it('shows the pool under the driver and the unit status under the plate', () => {
    setup({ rows: [vehicle({ pool: { id: 'p9', label: 'Pool Bekasi' } })] })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[0]).toHaveTextContent('Beroperasi')
    expect(cells[3]).toHaveTextContent('Pool Bekasi')
  })
```

Test `'shows an em-dash for a vehicle with no make, model, year, class or pool'` menghitung jumlah em-dash di seluruh baris, yang kini berubah karena setiap kolom dokumen kosong ikut menampilkannya. Persempit ke sel yang dimaksud saja:

```tsx
  // merk, tipe, tahun, jenisArmada and pool are all nullable: a unit registered with nothing but
  // a plate is a real state. Without the fallbacks those cells render empty and read as a
  // rendering hole rather than "not recorded yet". Asserted per cell, because the document
  // columns legitimately show an em-dash of their own and a page-wide count would drown this.
  it('shows an em-dash for a vehicle with no make, model, year, class or pool', () => {
    setup({
      rows: [vehicle({ merk: null, tipe: null, tahun: null, jenisArmada: null, pool: null })],
    })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[1].querySelectorAll('span')[0]).toHaveTextContent(/^—$/)
    expect(cells[1].querySelectorAll('span')[1]).toHaveTextContent(/^—$/)
  })
```

Terakhir, tambahkan test kolom dokumen di akhir `describe`, sebelum kurung penutupnya:

```tsx
  // Requirement #4: a column per document type, its dates visible on the row rather than hidden
  // behind one aggregate badge.
  it('renders a column per active document type, in master-data order', () => {
    setup()
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toEqual([
      expect.stringMatching(/Nopol/),
      'Unit',
      'Kepemilikan',
      expect.stringMatching(/Sopir/),
      'KIR',
      'STNK',
      'Servis Berkala',
      'Aksi',
    ])
  })

  it('shows the expiry date and the severity chip in a document cell', () => {
    setup()
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[4]).toHaveTextContent('15 Sep 2026')
    expect(cells[4]).toHaveTextContent(/5 hari lagi/)
  })

  // The cell is matched to its column by docTypeId. Matched by position, a unit missing its KIR
  // would shift every later document one column left and report the wrong dates under every
  // heading — all of them plausible.
  it('leaves a document cell empty when the unit has no such document', () => {
    setup({
      rows: [
        vehicle({
          documents: [
            {
              docTypeId: 'dt2',
              code: 'stnk',
              label: 'STNK',
              nomor: 'A-1',
              issuedAt: null,
              expiresAt: '2031-01-10',
              daysLeft: 1000,
              severity: 'ok',
            },
          ],
        }),
      ],
    })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[4]).toHaveTextContent('—')
    expect(cells[5]).toHaveTextContent('10 Jan 2031')
  })

  // Spec §8 pins this one by name: docTypes arrives from a query that has not resolved at first
  // paint, and a table that throws on an empty list takes the whole page down before the operator
  // sees a single row.
  it('renders its fixed columns while the document types are still loading', () => {
    setup({ docTypes: [] })
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toEqual([
      expect.stringMatching(/Nopol/),
      'Unit',
      'Kepemilikan',
      expect.stringMatching(/Sopir/),
      'Aksi',
    ])
    expect(screen.getByText('B9114KYZ')).toBeInTheDocument()
  })

  // An inactive type is one the admin has retired. Its column would be a heading with nothing
  // under it on every row.
  it('leaves out a document type that is no longer active', () => {
    const retired = { ...docType('dt9', 'lama', 'Dokumen Lama', 4), isActive: false }
    setup({ docTypes: [...DOC_TYPES, retired] })
    expect(screen.queryByText('Dokumen Lama')).not.toBeInTheDocument()
  })

  // The licence belongs to the driver and its severity is computed by the backend like every
  // other; showing it on the row is what makes an expiring SIM visible without opening the unit.
  it('shows the driver SIM expiry and its severity', () => {
    setup()
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[3]).toHaveTextContent('14 Mar 2027')
  })

  it('shows the ownership and the leasing company', () => {
    setup({
      rows: [
        vehicle({
          kepemilikan: { id: 'kp1', label: 'Milik ESP' },
          lease: {
            id: 'lc1',
            leasing: { id: 'ls1', label: 'MTF' },
            nomorKontrak: 'MTF-1',
            cicilanPerBulan: 8750000,
            tenorBulan: 36,
            angsuranMulai: '2026-01-10',
            angsuranTerbayarOverride: null,
            angsuranTerbayar: 9,
            sisaAngsuran: 27,
            sisaKewajiban: 236250000,
          },
        }),
      ],
    })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[2]).toHaveTextContent('Milik ESP')
    expect(cells[2]).toHaveTextContent('MTF')
    // sisaAngsuran is the backend's figure, rendered as delivered.
    expect(cells[2]).toHaveTextContent(/sisa 27/)
  })

  it('says so for a unit with no open lease contract', () => {
    setup({ rows: [vehicle({ kepemilikan: { id: 'kp1', label: 'Milik ESP' }, lease: null })] })
    const cells = screen.getByTestId('vehicle-row').querySelectorAll('td')
    expect(cells[2]).toHaveTextContent('Milik ESP')
    expect(cells[2]).not.toHaveTextContent(/sisa/)
  })

  // Spec §7.2: a menu with every item filtered out is not rendered at all. An empty ⋮ that opens
  // onto nothing is worse than no button, because the operator keeps trying it.
  it('renders no action menu at all when every action is hidden', () => {
    setup({ showActions: { edit: false, documents: false, archive: false } })
    expect(screen.queryByRole('button', { name: /aksi/i })).not.toBeInTheDocument()
  })

  // Spec §7.1: with ~13 columns the table scrolls sideways, and a row that has scrolled its plate
  // off the screen has lost the only thing identifying it.
  it('keeps the plate column pinned while the table scrolls sideways', () => {
    setup()
    const plateCell = screen.getByTestId('vehicle-row').querySelectorAll('td')[0]
    expect(plateCell.className).toMatch(/sticky/)
    expect(document.querySelectorAll('th')[0].className).toMatch(/sticky/)
  })
```

Tambahkan juga fixture `lease` ke factory `vehicle()` supaya tipenya lengkap — sisipkan `lease: null,` tepat setelah baris `driver: { … },`.

Empat test lama membaca lencana lewat seluruh halaman — `getByRole('img')`, `getByText(/Segera/)`, `getByText(/5 hari lagi/)`. Baris sekarang membawa banyak lencana (satu per kolom dokumen, ditambah SIM sopir), jadi query itu berhenti unik. Arahkan keempatnya ke lencana agregat lewat testid-nya:

```tsx
  // The row carries a badge per document column plus the driver's SIM, so the two backend
  // aggregates need naming rather than picking whichever badge the query happens to find first.
  const worstBadge = () => within(screen.getByTestId('worst-severity')).getByRole('img')

  it('shows the worst document severity on the row', () => {
    setup()
    expect(worstBadge()).toHaveTextContent(/Segera/)
  })

  // The number of days is the actionable part: "Segera" alone does not say whether to act today
  // or next month.
  it('shows how long the nearest document has left', () => {
    setup()
    expect(worstBadge()).toHaveTextContent(/5 hari lagi/)
  })
```

Di `'reads worstSeverity and minDaysLeft as two independent aggregates'` dan `'shows a distinct state for a vehicle with no documents'`, ganti `screen.getByRole('img')` menjadi `worstBadge()`; sisa kedua test tidak berubah.

`within` perlu ditambahkan ke import baris pertama:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
```

- [ ] **Step 6: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test VehicleTable`
Expected: FAIL — `docTypes` belum jadi prop, header masih tujuh kolom tetap.

- [ ] **Step 7: Tulis ulang tabelnya**

Ganti seluruh isi `apps/frontend/src/features/fleet/components/VehicleTable.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, DataTableColumn } from '@/components/shared/data-table'
import { FleetMasterRow, FleetVehicle, FleetVehicleSort } from '../types'
import { formatTanggal } from '../utils/format-date'
import { SeverityBadge } from './SeverityBadge'

interface VehicleTableProps {
  rows: FleetVehicle[]
  docTypes: FleetMasterRow[]
  isLoading: boolean
  sort: FleetVehicleSort
  onSortChange: (sort: FleetVehicleSort) => void
  onEdit: (row: FleetVehicle) => void
  onDocuments: (row: FleetVehicle) => void
  onArchive: (row: FleetVehicle) => void
  onRestore: (row: FleetVehicle) => void
  showActions?: { edit: boolean; documents: boolean; archive: boolean }
}

// Each sortable column names its ascending key and the descending key it toggles to, so the
// header knows both which arrow to draw and what to ask for next.
const SORT_PAIRS: Record<string, [FleetVehicleSort, FleetVehicleSort]> = {
  nopol: ['nopol', '-nopol'],
  tahun: ['tahun', '-tahun'],
}

// Pinned because the table scrolls sideways with a column per document type (spec §7.1): a row
// whose plate has scrolled off has lost the only thing identifying it. Applied to the header and
// the body cell alike, via DataTableColumn.className.
const STICKY_PLATE = 'sticky left-0 z-10 bg-background'

export function VehicleTable({
  rows,
  docTypes,
  isLoading,
  sort,
  onSortChange,
  onEdit,
  onDocuments,
  onArchive,
  onRestore,
  showActions,
}: VehicleTableProps) {
  const show = showActions ?? { edit: true, documents: true, archive: true }

  const sortHeader = (label: string, key: keyof typeof SORT_PAIRS) => {
    const [asc, desc] = SORT_PAIRS[key]
    const active = sort === asc ? 'asc' : sort === desc ? 'desc' : null
    const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => onSortChange(active === 'asc' ? desc : asc)}
      >
        {label}
        <Icon size={13} aria-hidden="true" />
      </button>
    )
  }

  // Built from master data rather than from a fixed list (spec §7.1), so a document type the
  // admin adds gets its own column without a code change. Sorted by the admin's own sortOrder,
  // and the inactive ones left out — a retired type would be a heading with nothing under it.
  const documentColumns: DataTableColumn<FleetVehicle>[] = useMemo(
    () =>
      docTypes
        .filter((t) => t.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((type) => ({
          header: type.label,
          accessor: (row: FleetVehicle) => {
            // Matched by docTypeId, never by position: a unit missing one document would
            // otherwise shift every later column left and report plausible, wrong dates.
            const doc = row.documents.find((d) => d.docTypeId === type.id)
            if (!doc) return <span className="text-muted-foreground">—</span>
            return (
              <div className="flex flex-col gap-1">
                <span className="whitespace-nowrap">{formatTanggal(doc.expiresAt)}</span>
                {/* severity and daysLeft arrive already computed; rendering them is the job.
                    The badge keeps its own wording rather than a blank label, so the cell's
                    meaning does not rest on colour alone for a screen reader or a red/green
                    deficient operator — the reason SeverityBadge carries an aria-label at all. */}
                <SeverityBadge severity={doc.severity} daysLeft={doc.daysLeft} />
              </div>
            )
          },
        })),
    [docTypes],
  )

  const columns: DataTableColumn<FleetVehicle>[] = [
    {
      header: sortHeader('Nopol', 'nopol'),
      className: STICKY_PLATE,
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.nopol}</span>
          <span className="text-xs text-muted-foreground">
            {row.isActive ? (row.status?.label ?? '—') : 'Arsip'}
          </span>
        </div>
      ),
    },
    {
      header: 'Unit',
      accessor: (row) => (
        <div className="flex flex-col">
          <span>{[row.merk, row.tipe].filter(Boolean).join(' ') || '—'}</span>
          <span className="text-xs text-muted-foreground">
            {[row.jenisArmada?.label, row.tahun, row.kapasitas].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      header: 'Kepemilikan',
      accessor: (row) => (
        <div className="flex flex-col">
          <span>{row.kepemilikan?.label ?? '—'}</span>
          <span className="text-xs text-muted-foreground">
            {row.lease?.leasing?.label ?? '—'}
            {/* sisaAngsuran is the backend's figure (spec §5.2), printed as delivered. */}
            {row.lease && row.lease.sisaAngsuran > 0 && ` · sisa ${row.lease.sisaAngsuran}×`}
          </span>
        </div>
      ),
    },
    {
      header: sortHeader('Tahun', 'tahun'),
      accessor: (row) => row.tahun ?? '—',
    },
    {
      header: 'Sopir & SIM',
      accessor: (row) =>
        row.driver ? (
          <div className="flex flex-col gap-1">
            <span>{row.driver.nama}</span>
            <span className="text-xs text-muted-foreground">{row.pool?.label ?? '—'}</span>
            <SeverityBadge
              severity={row.driver.simSeverity}
              daysLeft={row.driver.simDaysLeft}
              label={`SIM ${formatTanggal(row.driver.simExpiresAt)}`}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Belum ada sopir</span>
            <span className="text-xs text-muted-foreground">{row.pool?.label ?? '—'}</span>
          </div>
        ),
    },
    ...documentColumns,
    {
      header: (
        <button
          type="button"
          aria-label="Urutkan dokumen"
          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
          onClick={() => onSortChange('severity')}
        >
          Terdekat
          <ArrowUpDown size={13} aria-hidden="true" />
        </button>
      ),
      // Tagged because the row now carries several badges — one per document column plus the
      // driver's SIM — and the tests for the two backend aggregates have to name this one.
      accessor: (row) => (
        <span data-testid="worst-severity">
          <SeverityBadge severity={row.worstSeverity} daysLeft={row.minDaysLeft} />
        </span>
      ),
    },
    {
      header: 'Aksi',
      className: 'text-right',
      accessor: (row) => {
        const items = [
          show.edit && { key: 'edit', label: 'Ubah', run: () => onEdit(row) },
          show.documents && { key: 'documents', label: 'Dokumen', run: () => onDocuments(row) },
          show.archive &&
            (row.isActive
              ? { key: 'archive', label: 'Arsipkan', run: () => onArchive(row) }
              : { key: 'restore', label: 'Pulihkan', run: () => onRestore(row) }),
        ].filter(Boolean) as { key: string; label: string; run: () => void }[]

        // Spec §7.2: a menu whose items are all filtered out is not rendered at all. An empty ⋮
        // that opens onto nothing is worse than no button — the operator keeps trying it.
        if (items.length === 0) return null

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Aksi ${row.nopol}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <MoreVertical size={16} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={item.run}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      isLoading={isLoading}
      keyExtractor={(row) => row.id}
      emptyMessage="Belum ada armada yang cocok dengan filter ini."
      rowDataTestId="vehicle-row"
    />
  )
}
```

- [ ] **Step 8: Selaraskan test header dengan kolom Tahun dan Terdekat**

Kode di Step 7 mempertahankan kolom Tahun (kontrol sort-nya harus hidup di suatu `<th>`) dan kolom Terdekat, sementara test di Step 5 belum menghitung keduanya. Perbarui kedua assertion header:

```tsx
    expect(headers).toEqual([
      expect.stringMatching(/Nopol/),
      'Unit',
      'Kepemilikan',
      expect.stringMatching(/Tahun/),
      'Sopir & SIM',
      'KIR',
      'STNK',
      'Servis Berkala',
      expect.stringMatching(/Terdekat/),
      'Aksi',
    ])
```

dan untuk kasus `docTypes: []`:

```tsx
    expect(headers).toEqual([
      expect.stringMatching(/Nopol/),
      'Unit',
      'Kepemilikan',
      expect.stringMatching(/Tahun/),
      'Sopir & SIM',
      expect.stringMatching(/Terdekat/),
      'Aksi',
    ])
```

Indeks sel di test-test lain ikut bergeser karena kolom Tahun disisipkan di posisi 3. Perbaiki:

- `'shows the pool under the driver and the unit status under the plate'`: `cells[3]` → `cells[4]`.
- `'shows the driver SIM expiry and its severity'`: `cells[3]` → `cells[4]`.
- `'shows the expiry date and the severity chip in a document cell'`: `cells[4]` → `cells[5]`.
- `'leaves a document cell empty when the unit has no such document'`: `cells[4]` → `cells[5]`, `cells[5]` → `cells[6]`.

Test sort juga perlu diperbarui: tombol dokumen sekarang berlabel "Terdekat", tetapi `aria-label`-nya masih `Urutkan dokumen`, jadi `getByRole('button', { name: 'Urutkan dokumen' })` tetap cocok dan tidak perlu disentuh.

- [ ] **Step 9: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleTable format-date`
Expected: PASS keduanya.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/fleet/components/VehicleTable.tsx \
        apps/frontend/src/features/fleet/components/VehicleTable.spec.tsx \
        apps/frontend/src/features/fleet/utils/format-date.ts \
        apps/frontend/src/features/fleet/utils/format-date.spec.ts
git commit -m "$(cat <<'EOF'
feat(fleet): give every document type its own column on the list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Halaman Armada menyalurkan master data baru

Task terakhir. Halaman menambah satu query master data (`leasing`), menyalurkan `leasing` dan `jenisDokumen` ke form, dan `docTypes` ke tabel. Tanpa task ini seluruh Task 13–17 terpasang tetapi tidak tersambung ke apa pun.

Spec-nya juga perlu diperbaiki di luar penambahan: form sekarang menolak simpan sampai enam belas field wajib terisi (Task 13), jadi dua test yang menekan Simpan atas form kosong berhenti lulus — bukan karena regresi, melainkan karena validasinya memang baru ada. Keduanya diberi helper pengisi.

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx`

**Interfaces:**
- Consumes: `VehicleFormDialog` props `masterData.leasing` / `masterData.jenisDokumen` (Task 15); `VehicleTable` prop `docTypes` (Task 17); `FleetVehiclePayload.lease` / `.documents` (Task 12)
- Produces: tidak ada — ini konsumen terakhir.

File di `app/(dashboard)/fleet/**`, jadi **tanpa semicolon**.

- [ ] **Step 1: Perbarui fixture dan helper di spec halaman**

Di `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx`, normalisasi plat lebih dulu:

```bash
cd "apps/frontend/src/app/(dashboard)/fleet/vehicles"
sed -i -e 's/B 9114 KYZ/B9114KYZ/g' -e 's/D 4567 XY/D4567XY/g' page.spec.tsx
```

Lengkapi factory `vehicle()` supaya baris yang dibuka lewat Ubah sudah memenuhi seluruh field wajib — ganti isinya:

```tsx
const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle =>
  ({
    id: 'v1',
    nopol: 'B9114KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter',
    tahun: 2021,
    kapasitas: '8 ton',
    noRangka: 'MHM1234',
    noMesin: 'EN1234',
    noBpkb: 'BP1234',
    pemilikUnit: null,
    odometer: null,
    catatan: null,
    jenisArmada: { id: 'jenis_armada-1', label: 'jenis_armada satu' },
    kepemilikan: { id: 'kepemilikan-1', label: 'kepemilikan satu' },
    pool: { id: 'pool-1', label: 'pool satu' },
    status: null,
    driver: null,
    // The edit dialog seeds its lease fields from here, and Task 13 makes every one of them
    // except angsuranTerbayar required — an edit over a lease-less fixture could not be saved.
    lease: {
      id: 'lc1',
      leasing: { id: 'leasing-1', label: 'leasing satu' },
      nomorKontrak: 'MTF-1',
      cicilanPerBulan: 8750000,
      tenorBulan: 36,
      angsuranMulai: '2026-01-10',
      angsuranTerbayarOverride: null,
      angsuranTerbayar: 8,
      sisaAngsuran: 28,
      sisaKewajiban: 245000000,
    },
    documents: [],
    worstSeverity: 'none',
    minDaysLeft: null,
    isActive: true,
    ...over,
  }) as FleetVehicle
```

Tambahkan helper pengisi tepat setelah factory tersebut — dipakai oleh test create, yang membuka form kosong:

```tsx
// Task 13 gates Simpan behind sixteen required fields, so a create test can no longer type one
// plate and submit. Filled through the labels rather than by reaching into state, because what
// is being proven is that the dialog's own fields reach the mutation.
const fillRequired = (nopol = 'B1A') => {
  const dialog = within(screen.getByRole('dialog'))
  const type = (label: RegExp | string, value: string) =>
    fireEvent.change(dialog.getByLabelText(label), { target: { value } })
  type(/nomor polisi/i, nopol)
  type('Merk', 'Mitsubishi')
  type('Tipe', 'Canter')
  type('Jenis armada', 'jenis_armada-1')
  type(/tahun/i, '2021')
  type(/kapasitas/i, '8 ton')
  type(/nomor rangka/i, 'MHM1234')
  type(/nomor mesin/i, 'EN1234')
  type(/nomor bpkb/i, 'BP1234')
  type('Kepemilikan', 'kepemilikan-1')
  type('Perusahaan leasing', 'leasing-1')
  type(/nomor kontrak/i, 'MTF-1')
  type(/cicilan per bulan/i, '8750000')
  type(/total angsuran/i, '36')
  type(/tanggal angsuran pertama/i, '2026-01-10')
  type('Pool', 'pool-1')
  // The seeded jenis_dokumen row carries isRequired: null, so no document row blocks the save.
}
```

`within` sudah ter-import di baris 1 file ini, jadi tidak ada import baru.

- [ ] **Step 2: Perbarui test yang menekan Simpan**

Ganti kedua test mutasi:

```tsx
  it('saves a new vehicle through the create mutation', async () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    fillRequired('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      // Normalised on the way in (Task 11), so what reaches the mutation is the tight form.
      expect(mutations.create).toHaveBeenCalledWith(expect.objectContaining({ nopol: 'B1A' })),
    )
  })

  // The combined payload is the point of Task 8: one mutation carries the unit, its lease and
  // its documents, so a half-saved unit is not a state the operator can reach.
  it('sends the lease contract in the same create payload', async () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(mutations.create).toHaveBeenCalled())
    expect(mutations.create.mock.calls[0][0].lease).toEqual(
      expect.objectContaining({
        leasingId: 'leasing-1',
        nomorKontrak: 'MTF-1',
        cicilanPerBulan: 8750000,
        tenorBulan: 36,
        angsuranMulai: '2026-01-10',
      }),
    )
  })
```

Test edit membuka baris yang kini sudah lengkap, jadi hanya query tombolnya yang berubah (menu ⋮ dari Task 17):

```tsx
  // The row actions live in a ⋮ menu since Task 17, so every row-action test opens it first.
  const openRowMenu = (index = 0) =>
    fireEvent.click(screen.getAllByRole('button', { name: /aksi/i })[index])

  const clickRowAction = (name: string, index = 0) => {
    openRowMenu(index)
    fireEvent.click(screen.getByRole('menuitem', { name }))
  }

  it('saves an edit through the update mutation with the row id', async () => {
    render(<FleetVehiclesPage />)
    clickRowAction('Ubah')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(mutations.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' })),
    )
  })
```

Sisa test aksi memakai helper yang sama — ganti tiap `fireEvent.click(screen.getByRole('button', { name: 'X' }))` untuk X ∈ {Ubah, Dokumen, Arsipkan, Pulihkan} pada baris tabel:

```tsx
  it('seeds the edit dialog from the row that was opened, not the previous one', () => {
    listResult = {
      data: {
        rows: [vehicle(), vehicle({ id: 'v2', nopol: 'D4567XY' })],
        total: 2,
        page: 1,
        pageSize: 25,
      },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    clickRowAction('Ubah', 0)
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('B9114KYZ')
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    clickRowAction('Ubah', 1)
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('D4567XY')
  })

  it('saves documents through the replace mutation', async () => {
    render(<FleetVehiclesPage />)
    clickRowAction('Dokumen')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(mutations.documents).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'v1', documents: [] }),
      ),
    )
  })
```

`openArchiveDialog` ikut lewat menu, dan ambiguitas namanya hilang karena item menu ber-role `menuitem`:

```tsx
  const openArchiveDialog = () => {
    clickRowAction('Arsipkan')
    return within(screen.getByRole('dialog'))
  }
```

Di `'restores an archived row without confirming'` dan `'shows the backend message when restoring fails'`, ganti klik Pulihkan menjadi `clickRowAction('Pulihkan')`.

Di `'hides the row actions without the matching permissions'`, seluruh aksi tertapis sehingga menunya tidak dirender sama sekali (spec §7.2):

```tsx
  it('hides the row actions without the matching permissions', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(screen.queryByRole('button', { name: /aksi/i })).not.toBeInTheDocument()
  })
```

Di `'does not open the documents dialog when no document types are configured'`, klik Dokumen juga lewat menu — ganti baris kliknya dengan `clickRowAction('Dokumen')`.

- [ ] **Step 3: Tambahkan test penyaluran master data baru**

Tambahkan di akhir `describe`, sebelum kurung penutup:

```tsx
  // The leasing list is the sixth master-data query and the only new one. Without it the
  // Perusahaan leasing select renders empty and a required field has no reachable value.
  it('queries the leasing master data under the same permission', () => {
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('leasing', { enabled: true })
  })

  it('does not query the leasing list without read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('leasing', { enabled: false })
  })

  // jenis_dokumen already had a query, feeding the standalone documents dialog. What is new is
  // that the form dialog needs it too: sections 4-6 are built from it, so a form that does not
  // receive it renders three empty sections and silently drops every document on save.
  it('feeds the leasing and document lists to the form dialog', () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    const dialog = within(screen.getByRole('dialog'))
    const optionsOf = (label: string) =>
      Array.from(dialog.getByLabelText(label).querySelectorAll('option')).map((o) => o.textContent)
    expect(optionsOf('Perusahaan leasing')).toEqual(['— pilih —', 'leasing satu'])
    // The document type's own label proves jenisDokumen reached the dialog: its row is rendered
    // from the master row, not from anything the vehicle carries.
    expect(dialog.getByLabelText(/jenis_dokumen satu.*berlaku/i)).toBeInTheDocument()
  })

  // The table's document columns are built from the same list. Passed nothing it falls back to
  // its fixed columns and the operator loses every expiry date off the list — the one thing
  // requirement #4 asked for.
  it('feeds the document types to the table columns', () => {
    render(<FleetVehiclesPage />)
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent)
    expect(headers).toContain('jenis_dokumen satu')
  })
```

Terakhir, test `'feeds each master-data list to its own field in the create dialog'` masih menyebut lima daftar; tambahkan leasing ke dalamnya supaya satu test cross-wire mencakup keenamnya:

```tsx
    expect(optionsOf('Perusahaan leasing')).toEqual(['— pilih —', 'leasing satu'])
```

- [ ] **Step 4: Jalankan dan pastikan gagal**

Run: `cd apps/frontend && pnpm test "fleet/vehicles/page"`
Expected: FAIL — `leasing` belum pernah di-query, `docTypes` belum sampai ke tabel, dan `masterData` yang dikirim ke form belum punya `leasing`/`jenisDokumen`.

- [ ] **Step 5: Sambungkan halamannya**

Di `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`, tambahkan query leasing tepat setelah `kepemilikan`:

```tsx
  const { data: kepemilikan } = useFleetMasterDataByCategory('kepemilikan', master)
  const { data: leasing } = useFleetMasterDataByCategory('leasing', master)
```

Salurkan jenis dokumen ke tabel — ganti dua baris pertama `<VehicleTable …>`:

```tsx
          <VehicleTable
            rows={rows}
            docTypes={docTypes ?? []}
            isLoading={isLoading}
```

Dan lengkapi `masterData` pada form dialog:

```tsx
          masterData={{
            jenisArmada: jenisArmada ?? [],
            kepemilikan: kepemilikan ?? [],
            leasing: leasing ?? [],
            pool: pool ?? [],
            status: statusKendaraan ?? [],
            jenisDokumen: docTypes ?? [],
          }}
```

`handleSubmit` tidak berubah: tipenya sudah `FleetVehiclePayload`, yang sejak Task 12 membawa `lease` dan `documents`, jadi keduanya ikut apa adanya ke mutasi.

Terakhir, perbarui kalimat penjelas izin master data yang kini menyebut enam daftar, bukan tiga:

```tsx
        <p className="mb-4 text-sm text-muted-foreground">
          Daftar jenis armada, kepemilikan, leasing, pool, status dan jenis dokumen tidak tersedia
          — butuh izin akses master data. Filter dan pilihan terkait dikosongkan.
        </p>
```

- [ ] **Step 6: Jalankan dan pastikan lulus**

Run: `cd apps/frontend && pnpm test "fleet/vehicles/page"`
Expected: PASS.

- [ ] **Step 7: Jalankan seluruh suite frontend**

Run: `cd apps/frontend && pnpm test`
Expected: PASS. Test yang menyentuh armada di luar file-file di atas — misalnya navigasi modul — tidak mengubah plat maupun tombol aksi, jadi tidak ada yang tersisa untuk diperbaiki. Bila ada yang gagal, perbaiki di sini sebelum commit; task ini yang terakhir, jadi tidak ada task berikutnya yang menampungnya.

- [ ] **Step 8: Jalankan seluruh suite backend**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test --runInBand
```

Expected: PASS. Heap bump dan `--runInBand` keduanya wajib — `--runInBand` sendirian masih core-dump.

- [ ] **Step 9: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx" \
        "apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx"
git commit -m "$(cat <<'EOF'
feat(fleet): wire the leasing and document lists into the Armada page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
