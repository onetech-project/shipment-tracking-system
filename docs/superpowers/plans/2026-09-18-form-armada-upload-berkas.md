# Upload Berkas dari Form Armada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operator memilih foto kendaraan dan softcopy dokumen langsung di form tambah/ubah armada, dan satu klik Simpan menyimpan data beserta berkasnya.

**Architecture:** Berkas ditahan di memori browser (`useVehicleBerkas`) sampai Simpan, lalu diunggah berurutan lewat tiga langkah yang sudah ada (`upload-intent` → PUT presigned → `confirm`) memakai id armada yang baru tersimpan. Backend menegakkan aturan per-slot (foto: 5 MB, gambar saja) di service, tempat baris slot sudah ada di tangan. Empat slot foto di-seed lewat migrasi.

**Tech Stack:** NestJS + TypeORM + Postgres (backend), Next.js 14 App Router + React Query + Tailwind (frontend), Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-18-form-armada-upload-berkas-design.md`

## Global Constraints

- Batas foto: `5 * 1024 * 1024` bytes; mime `image/jpeg`, `image/png`, `image/webp`. Prefiks kode slot foto: `foto_`.
- Batas berkas non-foto tidak berubah: `MAX_UPLOAD_BYTES` = 10 MB, allow-list `ALLOWED_MIME_TYPES` (jpeg, png, webp, pdf).
- Slot foto yang di-seed: `foto_depan`/Foto Depan/40, `foto_belakang`/Foto Belakang/50, `foto_kiri`/Foto Kiri/60, `foto_kanan`/Foto Kanan/70 — semua `is_required = FALSE`.
- Backend test: `cd apps/backend && pnpm test -- --runInBand <pattern>` untuk run terfokus. Suite penuh: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`.
- Frontend test: `cd apps/frontend && pnpm test <pattern>` — tanpa flag apa pun.
- Semua teks yang dilihat operator berbahasa Indonesia.
- Komentar kode berbahasa Inggris, menjelaskan *kenapa*, mengikuti gaya berkas di sekitarnya.

## File Structure

**Backend**
- Create `apps/backend/src/database/migrations/20260918000001-fleet-photo-slots.ts` — seed 4 slot foto.
- Modify `apps/backend/src/modules/storage/storage.constants.ts` — konstanta foto.
- Modify `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.ts` — aturan per-slot di `createIntent` dan `confirm`.
- Modify `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts:628-640` — `berkasCount` disaring ke slot wajib.

**Frontend**
- Create `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleBerkas.ts` — state berkas tertunda + `uploadAll`.
- Create `apps/frontend/src/features/fleet/components/vehicle-form/BerkasFormSection.tsx` — satu section, dipakai dua kali.
- Modify `apps/frontend/src/features/fleet/components/vehicle-form/form-primitives.tsx:16-20` — `GRID_COLS` entri 4.
- Modify `apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx` — dua section baru + alur simpan.
- Modify `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx` — `onSubmit` mengembalikan armada, prop `slots`.

Tugas dipisah agar tiap satu berakhir pada deliverable yang bisa diuji sendiri: backend (1–3) bisa di-review tanpa frontend ada, dan frontend (4–7) menumpuk dari hook murni ke integrasi halaman.

---

### Task 1: Konstanta dan aturan per-slot di backend

**Files:**
- Modify: `apps/backend/src/modules/storage/storage.constants.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.ts`
- Test: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.spec.ts`

**Interfaces:**
- Consumes: `assertSlot(slotId): Promise<FleetMasterDataEntity>` yang sudah ada di service; ia mengembalikan baris dengan `.code`.
- Produces: `PHOTO_MAX_UPLOAD_BYTES: number`, `PHOTO_MIME_TYPES: readonly string[]`, `PHOTO_SLOT_PREFIX: string`, `isPhotoSlot(code: string): boolean` — semuanya diekspor dari `storage.constants.ts`.

- [ ] **Step 1: Write the failing tests**

Tambahkan blok ini di `fleet-vehicle-files.service.spec.ts`, setelah `describe('createIntent', ...)` yang sudah ada. Perhatikan `build()` sudah menyediakan `overrides.master` untuk mengganti slot yang dikembalikan `assertSlot`.

```ts
const PHOTO_SLOT = { id: 'slot-foto', category: 'jenis_berkas', code: 'foto_depan', label: 'Foto Depan' }

describe('photo slot rules', () => {
  const photo = (over: Record<string, unknown> = {}) =>
    build({ master: { findOne: jest.fn(async () => PHOTO_SLOT) }, ...over })

  it('refuses a pdf on a photo slot', async () => {
    const { service } = photo()
    await expect(
      service.createIntent('veh-1', 'slot-foto', {
        filename: 'stnk.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepts a jpeg on a photo slot', async () => {
    const { service } = photo()
    const res = await service.createIntent('veh-1', 'slot-foto', {
      filename: 'depan.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    })
    expect(res.uploadUrl).toBe('https://signed.example/put')
  })

  it('refuses a photo above 5 MB', async () => {
    const { service } = photo()
    await expect(
      service.createIntent('veh-1', 'slot-foto', {
        filename: 'depan.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 6 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  // The same 6 MB is fine on a document slot: the global DTO ceiling is 10 MB, and the
  // per-slot rule must not leak beyond the slots it belongs to.
  it('leaves document slots on the 10 MB ceiling', async () => {
    const { service } = build()
    const res = await service.createIntent('veh-1', 'slot-1', {
      filename: 'stnk.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 6 * 1024 * 1024,
    })
    expect(res.uploadUrl).toBe('https://signed.example/put')
  })

  // createIntent only sees numbers the client claims. confirm sees what the bucket actually
  // holds, so the rule has to be applied there too or a client can declare a small jpeg and
  // upload a large one.
  it('refuses a confirm whose stored object breaks the photo rule', async () => {
    const { service } = photo({
      storage: {
        createUploadUrl: jest.fn(async () => 'https://signed.example/put'),
        createDownloadUrl: jest.fn(async () => 'https://signed.example/get'),
        statObject: jest.fn(async () => ({ size: 6 * 1024 * 1024, mime: 'image/jpeg' })),
        deleteObject: jest.fn(async () => undefined),
      },
    })
    await expect(
      service.confirm(
        'veh-1',
        'slot-foto',
        {
          storageKey: 'fleet/veh-1/foto_depan/abc.jpg',
          originalName: 'depan.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 6 * 1024 * 1024,
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicle-files.service`
Expected: FAIL — "photo slot rules" gagal karena service belum menolak apa pun (pdf dan 6 MB lolos).

- [ ] **Step 3: Add the constants**

Tambahkan di akhir `apps/backend/src/modules/storage/storage.constants.ts`:

```ts
// Requirement §5 caps vehicle photos at 5 MB and expects images, not scans: a photo slot is
// where an operator puts a picture of the unit, and a pdf there is a mis-drop rather than a
// document. The global ceiling above still applies first — this narrows, never widens.
export const PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const PHOTO_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

// Photo slots are recognised by their code, not by an id list: ids differ per environment and
// an admin may add a fifth photo slot from the Master Data screen without a deploy. The
// frontend mirrors this prefix in useVehicleBerkas.ts for the same reason ACCEPTED is
// duplicated in BerkasUploadDialog — the browser saves a doomed upload, this refuses one.
export const PHOTO_SLOT_PREFIX = 'foto_'

export function isPhotoSlot(code: string): boolean {
  return code.startsWith(PHOTO_SLOT_PREFIX)
}
```

- [ ] **Step 4: Enforce the rule in the service**

Di `fleet-vehicle-files.service.ts`, tambahkan import:

```ts
import {
  PHOTO_MAX_UPLOAD_BYTES,
  PHOTO_MIME_TYPES,
  isPhotoSlot,
} from '../storage/storage.constants'
```

Tambahkan private method, letakkan tepat di bawah `assertSlot`:

```ts
// Applied at both ends of the upload: createIntent sees only what the client claims, confirm
// sees what the bucket actually holds. Checking one without the other leaves a client free to
// declare a 1 MB jpeg and then PUT a 6 MB one.
private assertSlotRules(slot: FleetMasterDataEntity, mime: string, size: number): void {
  if (!isPhotoSlot(slot.code)) return

  if (!PHOTO_MIME_TYPES.includes(mime)) {
    throw new BadRequestException(
      `Slot ${slot.label} hanya menerima foto (jpg, png, atau webp).`,
    )
  }
  if (size > PHOTO_MAX_UPLOAD_BYTES) {
    throw new BadRequestException(`Ukuran foto ${slot.label} maksimal 5 MB.`)
  }
}
```

Di `createIntent`, tepat setelah `const slot = await this.assertSlot(slotId)`:

```ts
    this.assertSlotRules(slot, dto.mimeType, dto.sizeBytes)
```

Di `confirm`, setelah blok `statObject` yang mencocokkan size dan mime (setelah baris `if (stat.mime !== dto.mimeType) { ... }`):

```ts
    // Checked against the stored object's own numbers, which the three lines above have just
    // proven equal to the client's.
    this.assertSlotRules(slot, stat.mime, stat.size)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicle-files.service`
Expected: PASS — seluruh suite berkas ini hijau, termasuk tes lama.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/storage/storage.constants.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.spec.ts
git commit -m "feat(fleet): hold photo slots to a photo's size and format

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migrasi seed empat slot foto

**Files:**
- Create: `apps/backend/src/database/migrations/20260918000001-fleet-photo-slots.ts`

**Interfaces:**
- Consumes: tabel `fleet_master_data` dengan kolom `(category, code, label, sort_order, warn_days, default_valid_months, is_required)` dan unique `(category, code)`.
- Produces: empat baris `jenis_berkas` yang dibaca Task 5 dan 6 sebagai slot foto.

- [ ] **Step 1: Write the migration**

Buat `apps/backend/src/database/migrations/20260918000001-fleet-photo-slots.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// Requirement §5 asks for four vehicle photos alongside the document scans. They are seeded as
// jenis_berkas rows rather than as a new table: a photo is a file attached to a slot, which is
// exactly what that table already models, and seeding them means the form has something to show
// on the day it ships instead of an empty section waiting for an admin.
//
// is_required FALSE — the requirement calls photos an attachment, not a condition of
// registration. That flag is also what keeps berkasCount honest: the completeness chip counts
// required slots only (see fleet-vehicles.service.ts), so four optional photos do not turn every
// "3/3 lengkap" unit into "3/7".
export class FleetPhotoSlots20260918000001 implements MigrationInterface {
  name = 'FleetPhotoSlots20260918000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ON CONFLICT DO NOTHING for the same reason the seed migration uses it: a re-run is
    // idempotent, and a label an admin has since edited is never overwritten.
    await queryRunner.query(`
      INSERT INTO fleet_master_data
        (category, code, label, sort_order, warn_days, default_valid_months, is_required)
      VALUES
        ('jenis_berkas','foto_depan','Foto Depan',40,NULL,NULL,FALSE),
        ('jenis_berkas','foto_belakang','Foto Belakang',50,NULL,NULL,FALSE),
        ('jenis_berkas','foto_kiri','Foto Kiri',60,NULL,NULL,FALSE),
        ('jenis_berkas','foto_kanan','Foto Kanan',70,NULL,NULL,FALSE)
      ON CONFLICT (category, code) DO NOTHING
    `)
  }

  // fk_fleet_vehicle_files_slot is ON DELETE RESTRICT, so this fails rather than succeeds once a
  // unit has photos filed against these slots. That is the behaviour we want: a migration going
  // down must not silently discard an operator's uploads.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM fleet_master_data
      WHERE category = 'jenis_berkas'
        AND code IN ('foto_depan','foto_belakang','foto_kiri','foto_kanan')
    `)
  }
}
```

- [ ] **Step 2: Verify it compiles and is discovered**

Run: `cd apps/backend && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: selesai tanpa galat.

Run: `cd apps/backend && pnpm migration:show 2>&1 | tail -20`
Expected: baris `[ ] FleetPhotoSlots20260918000001` muncul di daftar. Bila database tidak berjalan di lingkungan ini, perintah gagal menyambung — itu bukan kegagalan migrasinya; lanjut setelah `tsc` bersih.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/database/migrations/20260918000001-fleet-photo-slots.ts
git commit -m "feat(fleet): give the four vehicle photos a slot to live in

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `berkasCount` menghitung slot wajib saja

**Files:**
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts` (sekitar baris 628–640)
- Test: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts` (blok `describe('berkasCount', ...)` sekitar baris 1053)

**Interfaces:**
- Consumes: `fileRepo.createQueryBuilder('f')` dan `masterRepo.count(...)` yang sudah dipakai.
- Produces: `berkasCount: { ada, wajib }` dengan arti baru — keduanya dibatasi pada slot `is_required = TRUE`.

- [ ] **Step 1: Write the failing tests**

Di `fleet-vehicles.service.spec.ts`, tambahkan dua tes di dalam `describe('berkasCount', ...)` yang sudah ada. Tes lama yang menegaskan `masterRepo.count` dipanggil dengan `{ category: 'jenis_berkas', isActive: true }` akan ikut berubah di Step 3 — jangan hapus, perbarui argumennya di sana.

```ts
    // Photo slots are is_required FALSE. Counting them as required would turn every unit that
    // holds all three documents from "3/3 lengkap" into "3/7", and the Belum lengkap filter in
    // the Berkas tab would surface the entire fleet.
    it('leaves optional slots out of the required count', async () => {
      const catalogue: Record<string, unknown>[] = [
        { id: 'jb-1', category: 'jenis_berkas', isActive: true, isRequired: true },
        { id: 'jb-2', category: 'jenis_berkas', isActive: true, isRequired: true },
        { id: 'jb-3', category: 'jenis_berkas', isActive: true, isRequired: true },
        { id: 'jb-foto-1', category: 'jenis_berkas', isActive: true, isRequired: false },
        { id: 'jb-foto-2', category: 'jenis_berkas', isActive: true, isRequired: false },
      ]
      masterRepo.count.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        catalogue.filter((row) =>
          Object.entries(opts?.where ?? {}).every(([key, value]) => row[key] === value),
        ).length,
      )
      fileQb.getRawMany.mockResolvedValue([])
      const res = await service.findAll({})
      expect(res.rows[0].berkasCount.wajib).toBe(3)
    })

    // The filled side has to match the required side, or a unit with four photos and no STNK
    // reads "4/3" — complete, while its mandatory document is missing.
    it('counts only files sitting in a required slot', async () => {
      fileQb.getRawMany.mockResolvedValue([{ vehicleId: 'v1', count: '2' }])
      masterRepo.count.mockResolvedValue(3)
      await service.findAll({})
      expect(fileQb.innerJoin).toHaveBeenCalledWith(
        'fleet_master_data',
        's',
        's.id = f.slot_id AND s.is_required = TRUE',
      )
    })
```

Tambahkan `innerJoin` ke mock `fileQb` (sekitar baris 127) supaya rantai query builder tidak putus:

```ts
    fileQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: FAIL — "leaves optional slots out" mendapat 5 bukan 3, dan "counts only files sitting in a required slot" gagal karena `innerJoin` tidak pernah dipanggil.

- [ ] **Step 3: Narrow both sides of the count**

Ganti blok di `fleet-vehicles.service.ts` (sekitar baris 628–640):

```ts
    // One grouped query for the page rather than one per row, the same shape the documents
    // load uses. The join is what makes the number mean something: photo slots are optional
    // (is_required FALSE), and counting them here would let four photos cover for a missing
    // STNK — the chip would read 4/3 on a unit whose mandatory document is not there.
    const fileRows = (await this.fileRepo
      .createQueryBuilder('f')
      .select('f.vehicle_id', 'vehicleId')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('fleet_master_data', 's', 's.id = f.slot_id AND s.is_required = TRUE')
      .where('f.vehicle_id IN (:...ids)', { ids })
      .groupBy('f.vehicle_id')
      .getRawMany()) as { vehicleId: string; count: string }[]
    const filesByVehicle = new Map(fileRows.map((r) => [r.vehicleId, Number(r.count)]))

    // Required slots only, matching the join above. Both sides move together or the ratio
    // stops being a ratio.
    const wajibBerkas = await this.masterRepo.count({
      where: { category: 'jenis_berkas', isActive: true, isRequired: true },
    })
```

- [ ] **Step 4: Update the existing assertion**

Tes lama "counts filled slots against the number of active jenis_berkas rows" menegaskan argumen `masterRepo.count`. Perbarui ekspektasinya:

```ts
      expect(masterRepo.count).toHaveBeenCalledWith({
        where: { category: 'jenis_berkas', isActive: true, isRequired: true },
      })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: PASS — seluruh berkas hijau.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts
git commit -m "fix(fleet): let the completeness chip count what is actually required

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `useVehicleBerkas`

**Files:**
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleBerkas.ts`
- Test: `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleBerkas.spec.ts`

**Interfaces:**
- Consumes: `FleetMasterRow` dari `../../types`.
- Produces:

```ts
export type SlotState =
  | { status: 'idle' }
  | { status: 'picked'; file: File; previewUrl: string | null }
  | { status: 'uploading' }
  | { status: 'failed'; file: File; previewUrl: string | null; message: string }

export interface UploadFailure { slotLabel: string; message: string }

export interface VehicleBerkasApi {
  slotState: (slotId: string) => SlotState
  pick: (slot: FleetMasterRow, file: File) => string | null
  clear: (slotId: string) => void
  pendingCount: number
  uploadedCount: number
  uploadAll: (vehicleId: string) => Promise<UploadFailure[]>
}

export interface UseVehicleBerkasOptions {
  upload: (args: { vehicleId: string; slotId: string; file: File }) => Promise<unknown>
}

export function useVehicleBerkas(options: UseVehicleBerkasOptions): VehicleBerkasApi

export const PHOTO_SLOT_PREFIX = 'foto_'
export function isPhotoSlot(code: string): boolean
```

- [ ] **Step 1: Write the failing tests**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleBerkas.spec.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { FleetMasterRow } from '../../types'
import { useVehicleBerkas } from './useVehicleBerkas'

const slot = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 's1',
  category: 'jenis_berkas',
  code: 'stnk',
  label: 'STNK',
  sortOrder: 10,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: true,
  ...over,
})

const DOC = slot({})
const PHOTO = slot({ id: 's-foto', code: 'foto_depan', label: 'Foto Depan', isRequired: false })

// jsdom has no File.size control beyond the blob's real length, so a 6 MB fixture would mean
// allocating 6 MB. Overriding the property is cheaper and is what the hook actually reads.
const fileOf = (name: string, type: string, size: number): File => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const setup = (upload = jest.fn(async () => undefined)) => {
  const view = renderHook(() => useVehicleBerkas({ upload }))
  return { view, upload }
}

beforeEach(() => {
  // jsdom implements neither, and the hook calls both.
  global.URL.createObjectURL = jest.fn(() => 'blob:preview')
  global.URL.revokeObjectURL = jest.fn()
})

describe('pick', () => {
  it('refuses a pdf on a photo slot and keeps the slot empty', () => {
    const { view } = setup()
    let message: string | null = null
    act(() => {
      message = view.result.current.pick(PHOTO, fileOf('a.pdf', 'application/pdf', 1024))
    })
    expect(message).toMatch(/jpg, png, atau webp/i)
    expect(view.result.current.slotState('s-foto').status).toBe('idle')
  })

  it('accepts a pdf on a document slot', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    expect(view.result.current.slotState('s1').status).toBe('picked')
  })

  it('refuses a photo above 5 MB but allows the same size as a document', () => {
    const { view } = setup()
    let photoMessage: string | null = null
    act(() => {
      photoMessage = view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 6 * 1024 * 1024))
    })
    expect(photoMessage).toMatch(/5 MB/)

    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 6 * 1024 * 1024))
    })
    expect(view.result.current.slotState('s1').status).toBe('picked')
  })

  it('refuses anything above 10 MB even on a document slot', () => {
    const { view } = setup()
    let message: string | null = null
    act(() => {
      message = view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 11 * 1024 * 1024))
    })
    expect(message).toMatch(/10 MB/)
    expect(view.result.current.slotState('s1').status).toBe('idle')
  })

  it('makes a preview URL for a photo and none for a document', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    const photo = view.result.current.slotState('s-foto')
    const doc = view.result.current.slotState('s1')
    expect(photo.status === 'picked' && photo.previewUrl).toBe('blob:preview')
    expect(doc.status === 'picked' && doc.previewUrl).toBeNull()
  })

  // Five replacements must not leave four live blobs behind for the lifetime of the tab.
  it('revokes the old preview when a photo slot is picked again', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    act(() => {
      view.result.current.pick(PHOTO, fileOf('b.jpg', 'image/jpeg', 1024))
    })
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('revokes the preview when a slot is cleared', () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    act(() => {
      view.result.current.clear('s-foto')
    })
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(view.result.current.slotState('s-foto').status).toBe('idle')
  })
})

describe('uploadAll', () => {
  it('uploads every picked slot and reports no failures', async () => {
    const { view, upload } = setup()
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })

    let failures: { slotLabel: string; message: string }[] = []
    await act(async () => {
      failures = await view.result.current.uploadAll('veh-1')
    })

    expect(failures).toEqual([])
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenCalledWith({
      vehicleId: 'veh-1',
      slotId: 's1',
      file: expect.any(File),
    })
  })

  // An operator who picked five files is better served by four uploads than by zero.
  it('carries on after a failure and names the slot that failed', async () => {
    const upload = jest
      .fn()
      .mockRejectedValueOnce(new Error('koneksi terputus'))
      .mockResolvedValueOnce(undefined)
    const { view } = setup(upload)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })

    let failures: { slotLabel: string; message: string }[] = []
    await act(async () => {
      failures = await view.result.current.uploadAll('veh-1')
    })

    expect(upload).toHaveBeenCalledTimes(2)
    expect(failures).toEqual([{ slotLabel: 'STNK', message: 'koneksi terputus' }])
  })

  it('keeps the File on a failed slot so a retry needs no second pick', async () => {
    const upload = jest.fn().mockRejectedValue(new Error('gagal'))
    const { view } = setup(upload)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })

    const state = view.result.current.slotState('s1')
    expect(state.status).toBe('failed')
    expect(state.status === 'failed' && state.file.name).toBe('stnk.pdf')
  })

  it('empties a slot and revokes its preview once it has landed', async () => {
    const { view } = setup()
    act(() => {
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })

    expect(view.result.current.slotState('s-foto').status).toBe('idle')
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  // The retry path: only slots still holding a file are sent, so a second click after a partial
  // failure does not re-upload what already landed.
  it('sends only the slots still holding a file on a second run', async () => {
    const upload = jest
      .fn()
      .mockRejectedValueOnce(new Error('gagal'))
      .mockResolvedValue(undefined)
    const { view } = setup(upload)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
      view.result.current.pick(PHOTO, fileOf('a.jpg', 'image/jpeg', 1024))
    })
    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })
    upload.mockClear()

    await act(async () => {
      await view.result.current.uploadAll('veh-1')
    })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith({
      vehicleId: 'veh-1',
      slotId: 's1',
      file: expect.any(File),
    })
  })

  it('counts pending slots for the caller', () => {
    const { view } = setup()
    expect(view.result.current.pendingCount).toBe(0)
    act(() => {
      view.result.current.pick(DOC, fileOf('stnk.pdf', 'application/pdf', 1024))
    })
    expect(view.result.current.pendingCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend && pnpm test useVehicleBerkas`
Expected: FAIL — "Cannot find module './useVehicleBerkas'".

- [ ] **Step 3: Write the hook**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/useVehicleBerkas.ts`:

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FleetMasterRow } from '../../types'

// Mirrors storage.constants.ts on the backend, duplicated for the same reason ACCEPTED is in
// BerkasUploadDialog: this is a courtesy check that saves a doomed upload, and the backend
// remains the authority that actually refuses one.
const DOC_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const DOC_MAX_BYTES = 10 * 1024 * 1024
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

// Mirrors PHOTO_SLOT_PREFIX in storage.constants.ts. Matched on the code rather than on an id
// list because ids differ per environment, and an admin may add a fifth photo slot from the
// Master Data screen without a deploy.
export const PHOTO_SLOT_PREFIX = 'foto_'

export function isPhotoSlot(code: string): boolean {
  return code.startsWith(PHOTO_SLOT_PREFIX)
}

export type SlotState =
  | { status: 'idle' }
  | { status: 'picked'; file: File; previewUrl: string | null }
  | { status: 'uploading' }
  | { status: 'failed'; file: File; previewUrl: string | null; message: string }

export interface UploadFailure {
  slotLabel: string
  message: string
}

export interface VehicleBerkasApi {
  slotState: (slotId: string) => SlotState
  // Returns the operator-facing reason the file was refused, or null when it was accepted.
  // A rejected pick is an ordinary event on this form, not an exceptional one, so it is a
  // return value rather than a throw.
  pick: (slot: FleetMasterRow, file: File) => string | null
  clear: (slotId: string) => void
  pendingCount: number
  uploadAll: (vehicleId: string) => Promise<UploadFailure[]>
}

export interface UseVehicleBerkasOptions {
  upload: (args: { vehicleId: string; slotId: string; file: File }) => Promise<unknown>
}

interface Pending {
  slot: FleetMasterRow
  file: File
  previewUrl: string | null
}

const IDLE: SlotState = { status: 'idle' }

const limitsFor = (code: string) =>
  isPhotoSlot(code)
    ? { types: PHOTO_MIME_TYPES, max: PHOTO_MAX_BYTES, label: 'jpg, png, atau webp', maxLabel: '5 MB' }
    : { types: DOC_MIME_TYPES, max: DOC_MAX_BYTES, label: 'jpg, png, webp, atau pdf', maxLabel: '10 MB' }

export function useVehicleBerkas({ upload }: UseVehicleBerkasOptions): VehicleBerkasApi {
  const [pending, setPending] = useState<Record<string, Pending>>({})
  const [uploading, setUploading] = useState<Record<string, true>>({})
  const [failures, setFailures] = useState<Record<string, string>>({})

  // uploadAll reads the picks as they are at the moment it runs, not as they were when the
  // callback was created. Without the ref it would close over a stale map and upload whatever
  // had been picked at first render.
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  // Revoking on unmount as well as on replace: a dialog closed mid-edit would otherwise leave
  // its previews alive for as long as the tab is open.
  const previewsRef = useRef<Set<string>>(new Set())
  useEffect(
    () => () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url)
      previewsRef.current.clear()
    },
    [],
  )

  const revoke = useCallback((url: string | null) => {
    if (!url) return
    URL.revokeObjectURL(url)
    previewsRef.current.delete(url)
  }, [])

  const pick = useCallback(
    (slot: FleetMasterRow, file: File): string | null => {
      const limits = limitsFor(slot.code)
      if (!limits.types.includes(file.type)) {
        return `Format tidak didukung. Pilih ${limits.label}.`
      }
      if (file.size > limits.max) {
        return `Ukuran berkas maksimal ${limits.maxLabel}.`
      }

      // Only photos get a preview: a pdf has no thumbnail worth the object URL, and the
      // document cards do not render one.
      let previewUrl: string | null = null
      if (isPhotoSlot(slot.code)) {
        previewUrl = URL.createObjectURL(file)
        previewsRef.current.add(previewUrl)
      }

      setPending((current) => {
        revoke(current[slot.id]?.previewUrl ?? null)
        return { ...current, [slot.id]: { slot, file, previewUrl } }
      })
      setFailures((current) => {
        if (!(slot.id in current)) return current
        const next = { ...current }
        delete next[slot.id]
        return next
      })
      return null
    },
    [revoke],
  )

  const clear = useCallback(
    (slotId: string) => {
      setPending((current) => {
        if (!(slotId in current)) return current
        revoke(current[slotId].previewUrl)
        const next = { ...current }
        delete next[slotId]
        return next
      })
      setFailures((current) => {
        if (!(slotId in current)) return current
        const next = { ...current }
        delete next[slotId]
        return next
      })
    },
    [revoke],
  )

  const slotState = useCallback(
    (slotId: string): SlotState => {
      if (uploading[slotId]) return { status: 'uploading' }
      const row = pending[slotId]
      if (!row) return IDLE
      const message = failures[slotId]
      if (message) {
        return { status: 'failed', file: row.file, previewUrl: row.previewUrl, message }
      }
      return { status: 'picked', file: row.file, previewUrl: row.previewUrl }
    },
    [pending, uploading, failures],
  )

  // Sequential, not parallel: one file is three requests (intent, PUT, confirm), so seven files
  // at once would be twenty-one requests from a single click. A slot that fails does not stop
  // the ones after it — an operator who picked five files is better served by four uploads than
  // by none.
  const uploadAll = useCallback(
    async (vehicleId: string): Promise<UploadFailure[]> => {
      const rows = Object.values(pendingRef.current)
      const failed: UploadFailure[] = []

      for (const row of rows) {
        setUploading((current) => ({ ...current, [row.slot.id]: true }))
        try {
          await upload({ vehicleId, slotId: row.slot.id, file: row.file })
          revoke(row.previewUrl)
          setPending((current) => {
            const next = { ...current }
            delete next[row.slot.id]
            return next
          })
          setFailures((current) => {
            if (!(row.slot.id in current)) return current
            const next = { ...current }
            delete next[row.slot.id]
            return next
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Gagal mengunggah berkas.'
          failed.push({ slotLabel: row.slot.label, message })
          // The File stays in `pending` on purpose: Coba lagi must not send the operator back
          // to the file picker for something they already chose.
          setFailures((current) => ({ ...current, [row.slot.id]: message }))
        } finally {
          setUploading((current) => {
            const next = { ...current }
            delete next[row.slot.id]
            return next
          })
        }
      }

      return failed
    },
    [upload, revoke],
  )

  return {
    slotState,
    pick,
    clear,
    pendingCount: Object.keys(pending).length,
    uploadAll,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend && pnpm test useVehicleBerkas`
Expected: PASS — seluruh tes hijau.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/fleet/components/vehicle-form/useVehicleBerkas.ts \
        apps/frontend/src/features/fleet/components/vehicle-form/useVehicleBerkas.spec.ts
git commit -m "feat(fleet): hold a form's files until the operator says save

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `BerkasFormSection`

**Files:**
- Create: `apps/frontend/src/features/fleet/components/vehicle-form/BerkasFormSection.tsx`
- Test: `apps/frontend/src/features/fleet/components/vehicle-form/BerkasFormSection.spec.tsx`
- Modify: `apps/frontend/src/features/fleet/components/vehicle-form/form-primitives.tsx`

**Interfaces:**
- Consumes: `VehicleBerkasApi` dan `SlotState` dari Task 4; `Section` dari `./form-primitives`; `formatBytes` dari `../../utils/format-bytes`; `FleetVehicleFile` dari `../../types`.
- Produces:

```ts
interface BerkasFormSectionProps {
  title: string
  slots: FleetMasterRow[]
  existing: FleetVehicleFile[]
  berkas: VehicleBerkasApi
  cols: number
  accept: string
  hint: string
  showThumbnail: boolean
}
export function BerkasFormSection(props: BerkasFormSectionProps): JSX.Element | null
```

- [ ] **Step 1: Add the four-column grid class**

Di `form-primitives.tsx`, tambahkan satu entri ke `GRID_COLS`:

```ts
const GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
}
```

- [ ] **Step 2: Write the failing tests**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/BerkasFormSection.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { BerkasFormSection } from './BerkasFormSection'
import { SlotState, VehicleBerkasApi } from './useVehicleBerkas'
import { FleetMasterRow, FleetVehicleFile } from '../../types'

const slot = (over: Partial<FleetMasterRow>): FleetMasterRow => ({
  id: 's1',
  category: 'jenis_berkas',
  code: 'stnk',
  label: 'STNK',
  sortOrder: 10,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: true,
  ...over,
})

const DOC = slot({})
const PHOTO = slot({ id: 's-foto', code: 'foto_depan', label: 'Foto Depan', isRequired: false })

const fileOf = (name: string, type: string, size: number): File => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const EXISTING: FleetVehicleFile = {
  id: 'f1',
  slotId: 's1',
  slotCode: 'stnk',
  slotLabel: 'STNK',
  originalName: 'stnk.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 524288,
  externalUrl: null,
  uploadedAt: '2026-09-01T00:00:00Z',
}

const api = (states: Record<string, SlotState>, over: Partial<VehicleBerkasApi> = {}): VehicleBerkasApi => ({
  slotState: (id) => states[id] ?? { status: 'idle' },
  pick: jest.fn(() => null),
  clear: jest.fn(),
  pendingCount: 0,
  uploadAll: jest.fn(async () => []),
  ...over,
})

const renderSection = (
  berkas: VehicleBerkasApi,
  over: Record<string, unknown> = {},
) =>
  render(
    <BerkasFormSection
      title="Softcopy Berkas"
      slots={[DOC]}
      existing={[]}
      berkas={berkas}
      cols={3}
      accept="image/jpeg,image/png,image/webp,application/pdf"
      hint="jpg, png, webp, atau pdf · maksimal 10 MB"
      showThumbnail={false}
      {...over}
    />,
  )

describe('BerkasFormSection', () => {
  it('renders nothing when there are no slots of its kind', () => {
    const { container } = renderSection(api({}), { slots: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('says a slot is empty and offers to pick a file', () => {
    renderSection(api({}))
    expect(screen.getByText('STNK')).toBeInTheDocument()
    expect(screen.getByText(/belum ada berkas/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pilih berkas stnk/i)).toBeInTheDocument()
  })

  it('reports what is already on the server', () => {
    renderSection(api({}), { existing: [EXISTING] })
    expect(screen.getByText(/stnk\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/512 KB/)).toBeInTheDocument()
  })

  it('calls a slot an external link when that is what it holds', () => {
    const link = { ...EXISTING, originalName: null, sizeBytes: null, externalUrl: 'https://arsip.example/a.pdf' }
    renderSection(api({}), { existing: [link] })
    expect(screen.getByText(/tautan eksternal/i)).toBeInTheDocument()
  })

  it('marks a picked file as not yet uploaded and offers to cancel it', () => {
    const state: SlotState = { status: 'picked', file: fileOf('baru.pdf', 'application/pdf', 1024), previewUrl: null }
    renderSection(api({ s1: state }))
    expect(screen.getByText(/baru\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/belum diunggah/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /batalkan pilihan/i })).toBeInTheDocument()
  })

  it('says it is uploading and disables the picker while it does', () => {
    renderSection(api({ s1: { status: 'uploading' } }))
    expect(screen.getByText(/mengunggah/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pilih berkas stnk/i)).toBeDisabled()
  })

  it('shows the failure and offers a retry', () => {
    const state: SlotState = {
      status: 'failed',
      file: fileOf('baru.pdf', 'application/pdf', 1024),
      previewUrl: null,
      message: 'koneksi terputus',
    }
    renderSection(api({ s1: state }))
    expect(screen.getByText(/koneksi terputus/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pilih berkas stnk/i)).toBeInTheDocument()
  })

  it('hands a chosen file to pick and shows the reason when it is refused', async () => {
    const pick = jest.fn(() => 'Format tidak didukung. Pilih jpg, png, webp, atau pdf.')
    renderSection(api({}, { pick }))

    const input = screen.getByLabelText(/pilih berkas stnk/i)
    await userEvent.upload(input, fileOf('a.txt', 'text/plain', 10))

    expect(pick).toHaveBeenCalledWith(DOC, expect.any(File))
    expect(screen.getByText(/format tidak didukung/i)).toBeInTheDocument()
  })

  it('clears the slot when the operator cancels the pick', async () => {
    const clear = jest.fn()
    const state: SlotState = { status: 'picked', file: fileOf('baru.pdf', 'application/pdf', 1024), previewUrl: null }
    renderSection(api({ s1: state }, { clear }))

    await userEvent.click(screen.getByRole('button', { name: /batalkan pilihan/i }))
    expect(clear).toHaveBeenCalledWith('s1')
  })

  // The bytes came off the operator's own disk a moment ago, which is a different thing from
  // rendering content a row carries — see the note on BerkasSlotCard.
  it('renders a thumbnail for a freshly picked photo when asked to', () => {
    const state: SlotState = { status: 'picked', file: fileOf('a.jpg', 'image/jpeg', 1024), previewUrl: 'blob:preview' }
    renderSection(api({ 's-foto': state }), {
      title: 'Foto Kendaraan',
      slots: [PHOTO],
      cols: 4,
      accept: 'image/jpeg,image/png,image/webp',
      hint: 'jpg, png, atau webp · maksimal 5 MB',
      showThumbnail: true,
    })
    expect(screen.getByRole('img', { name: /foto depan/i })).toHaveAttribute('src', 'blob:preview')
  })

  it('renders no thumbnail on a document slot', () => {
    const state: SlotState = { status: 'picked', file: fileOf('a.pdf', 'application/pdf', 1024), previewUrl: null }
    renderSection(api({ s1: state }))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/frontend && pnpm test BerkasFormSection`
Expected: FAIL — "Cannot find module './BerkasFormSection'".

- [ ] **Step 4: Write the component**

Buat `apps/frontend/src/features/fleet/components/vehicle-form/BerkasFormSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FleetMasterRow, FleetVehicleFile } from '../../types'
import { formatBytes } from '../../utils/format-bytes'
import { Section } from './form-primitives'
import { VehicleBerkasApi } from './useVehicleBerkas'

interface BerkasFormSectionProps {
  title: string
  slots: FleetMasterRow[]
  // What the server already holds for this unit. Empty on a create, where nothing is filed yet.
  existing: FleetVehicleFile[]
  berkas: VehicleBerkasApi
  cols: number
  accept: string
  hint: string
  showThumbnail: boolean
}

// One component for both photos and documents. They differ only in their limits, their column
// count and whether a thumbnail is drawn — two near-identical components would drift apart on
// the first change, the same reason DocumentSection serves three sections at once.
export function BerkasFormSection({
  title,
  slots,
  existing,
  berkas,
  cols,
  accept,
  hint,
  showThumbnail,
}: BerkasFormSectionProps) {
  // Per-slot, not per-section: a rejected photo says nothing about the slot next to it.
  const [pickErrors, setPickErrors] = useState<Record<string, string>>({})

  // An empty section is worse than no section: a fieldset with no cards reads as a list that
  // failed to load rather than a kind of file this deployment does not have.
  if (slots.length === 0) return null

  const bySlot = new Map(existing.map((f) => [f.slotId, f]))

  const choose = (slot: FleetMasterRow, file: File | null) => {
    if (!file) return
    const message = berkas.pick(slot, file)
    setPickErrors((current) => {
      const next = { ...current }
      if (message) next[slot.id] = message
      else delete next[slot.id]
      return next
    })
  }

  return (
    <Section title={title} cols={cols}>
      {slots.map((slot) => {
        const state = berkas.slotState(slot.id)
        const onFile = bySlot.get(slot.id) ?? null
        const busy = state.status === 'uploading'
        const inputId = `vf-berkas-${slot.id}`

        return (
          <div key={slot.id} className="rounded-md border bg-card p-3">
            <div className="text-sm font-medium">{slot.label}</div>

            {showThumbnail && (state.status === 'picked' || state.status === 'failed') && state.previewUrl && (
              // A blob URL the operator's own pick produced a moment ago, not bytes a row
              // carries — the ban noted on BerkasSlotCard is about raw data URIs from the
              // prototype and does not reach this.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.previewUrl}
                alt={slot.label}
                className="mt-2 h-24 w-full rounded object-cover"
              />
            )}

            <div className="mt-1 text-xs text-muted-foreground">
              <SlotStatus state={state} file={onFile} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1">
              <label
                htmlFor={inputId}
                className={`inline-flex h-8 items-center rounded-md border px-3 text-sm ${
                  busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
              >
                {pickLabel(state, onFile)}
              </label>
              <input
                id={inputId}
                type="file"
                accept={accept}
                disabled={busy}
                aria-label={`Pilih berkas ${slot.label}`}
                className="sr-only"
                onChange={(e) => {
                  choose(slot, e.target.files?.[0] ?? null)
                  // Cleared so picking the same filename twice in a row still fires a change.
                  e.target.value = ''
                }}
              />
              {(state.status === 'picked' || state.status === 'failed') && (
                <Button type="button" variant="ghost" size="sm" onClick={() => berkas.clear(slot.id)}>
                  Batalkan pilihan
                </Button>
              )}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

            {state.status === 'failed' && (
              <p className="mt-1 text-xs text-destructive">{state.message}</p>
            )}
            {pickErrors[slot.id] && (
              <p className="mt-1 text-xs text-destructive">{pickErrors[slot.id]}</p>
            )}
          </div>
        )
      })}
    </Section>
  )
}

function pickLabel(state: ReturnType<VehicleBerkasApi['slotState']>, file: FleetVehicleFile | null): string {
  if (state.status === 'uploading') return 'Mengunggah…'
  if (state.status === 'failed') return 'Coba lagi'
  if (state.status === 'picked' || file) return 'Ganti'
  return 'Pilih berkas'
}

function SlotStatus({
  state,
  file,
}: {
  state: ReturnType<VehicleBerkasApi['slotState']>
  file: FleetVehicleFile | null
}) {
  if (state.status === 'uploading') return <>Mengunggah…</>

  // A pending pick describes the slot better than what the server still holds: it is what the
  // operator is about to replace it with.
  if (state.status === 'picked' || state.status === 'failed') {
    return (
      <>
        {state.file.name} · {formatBytes(state.file.size)} · belum diunggah
      </>
    )
  }

  if (!file) return <>Belum ada berkas</>
  if (file.externalUrl) return <>tautan eksternal</>
  return (
    <>
      {file.originalName ?? 'berkas'} · {formatBytes(file.sizeBytes)}
    </>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/frontend && pnpm test BerkasFormSection`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/fleet/components/vehicle-form/BerkasFormSection.tsx \
        apps/frontend/src/features/fleet/components/vehicle-form/BerkasFormSection.spec.tsx \
        apps/frontend/src/features/fleet/components/vehicle-form/form-primitives.tsx
git commit -m "feat(fleet): a file slot the operator can fill without leaving the form

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dua section baru dan alur simpan di `VehicleFormDialog`

**Files:**
- Modify: `apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx`
- Test: `apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx`

**Interfaces:**
- Consumes: `useVehicleBerkas`, `isPhotoSlot`, `BerkasFormSection` dari Task 4 dan 5.
- Produces: props baru pada `VehicleFormDialog` —

```ts
onSubmit: (payload: FleetVehiclePayload) => Promise<FleetVehicle>   // berubah dari Promise<void>
berkasSlots: FleetMasterRow[]
existingFiles?: FleetVehicleFile[]
onUploadBerkas?: (args: { vehicleId: string; slotId: string; file: File }) => Promise<unknown>
```

- [ ] **Step 1: Write the failing tests**

Tambahkan di akhir `VehicleFormDialog.spec.tsx`, di luar `describe` yang ada.

Berkas itu sudah punya helper `set(label, value)` dan `fillRequired()` di level modul — **pakai keduanya apa adanya**, jangan tulis ulang. `fillRequired()` bersifat sinkron dan mengisi seluruh field wajib termasuk yang leasing. Yang belum ada hanyalah `setupWithBerkas`, karena `setup()` yang lama mengembalikan `onSubmit` yang resolve `undefined` sementara alur baru butuh armada tersimpan sebagai hasilnya.

Ubah juga `setup()` yang lama agar `onSubmit`-nya resolve sebuah armada, bukan `undefined` — kontraknya kini `Promise<FleetVehicle>`, dan tes lama yang menekan Simpan akan menemui `saved?.id` yang undefined bila dibiarkan:

```tsx
const onSubmit = jest.fn().mockResolvedValue({ id: 'v-saved', nopol: 'B9114KYZ' })
```

```tsx
const berkasSlot = (over: Partial<FleetMasterRow>): FleetMasterRow =>
  master({ category: 'jenis_berkas', isRequired: false, ...over })

const BERKAS_SLOTS: FleetMasterRow[] = [
  berkasSlot({ id: 'jb-stnk', code: 'stnk', label: 'STNK', sortOrder: 10, isRequired: true }),
  berkasSlot({ id: 'jb-foto', code: 'foto_depan', label: 'Foto Depan', sortOrder: 40 }),
]

const SAVED_VEHICLE = { id: 'veh-9', nopol: 'B9114KYZ' } as FleetVehicle

const fileOf = (name: string, type: string): File => new File(['x'], name, { type })

const setupWithBerkas = (over: Record<string, unknown> = {}) => {
  const onSubmit = jest.fn().mockResolvedValue(SAVED_VEHICLE)
  const onUploadBerkas = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <VehicleFormDialog
      open
      masterData={masterData}
      drivers={[driver]}
      berkasSlots={BERKAS_SLOTS}
      existingFiles={[]}
      onSubmit={onSubmit}
      onUploadBerkas={onUploadBerkas}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSubmit, onUploadBerkas, onClose }
}

describe('berkas sections', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:preview')
    global.URL.revokeObjectURL = jest.fn()
  })

  it('splits photo slots from document slots by their code', () => {
    setupWithBerkas()
    expect(screen.getByText('Foto Kendaraan')).toBeInTheDocument()
    expect(screen.getByText('Softcopy Berkas')).toBeInTheDocument()
    expect(screen.getByLabelText(/pilih berkas foto depan/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pilih berkas stnk/i)).toBeInTheDocument()
  })

  it('saves without uploading anything when no file was picked', async () => {
    const { onSubmit, onUploadBerkas, onClose } = setupWithBerkas()
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onUploadBerkas).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('uploads picked files against the id the save returned', async () => {
    const { onSubmit, onUploadBerkas, onClose } = setupWithBerkas()
    fillRequired()
    await userEvent.upload(
      screen.getByLabelText(/pilih berkas stnk/i),
      fileOf('stnk.pdf', 'application/pdf'),
    )
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))

    await waitFor(() => expect(onUploadBerkas).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onUploadBerkas).toHaveBeenCalledWith({
      vehicleId: 'veh-9',
      slotId: 'jb-stnk',
      file: expect.any(File),
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // The vehicle is already saved by then; closing would send the operator hunting for the unit
  // they just typed in order to finish one file.
  it('keeps the dialog open and names the slot when an upload fails', async () => {
    const onUploadBerkas = jest.fn().mockRejectedValue(new Error('koneksi terputus'))
    const { onClose } = setupWithBerkas({ onUploadBerkas })
    fillRequired()
    await userEvent.upload(
      screen.getByLabelText(/pilih berkas stnk/i),
      fileOf('stnk.pdf', 'application/pdf'),
    )
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))

    await waitFor(() => expect(screen.getByText(/armada tersimpan/i)).toBeInTheDocument())
    expect(screen.getByText(/stnk/i)).toBeInTheDocument()
    expect(screen.getByText(/koneksi terputus/i)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  // Re-sending the vehicle would PATCH data that is already correct, and on a create it would
  // make a second unit on the same plate.
  it('retries only the files after a partial failure, never the vehicle', async () => {
    const onUploadBerkas = jest.fn().mockRejectedValueOnce(new Error('gagal')).mockResolvedValue(undefined)
    const { onSubmit } = setupWithBerkas({ onUploadBerkas })
    fillRequired()
    await userEvent.upload(
      screen.getByLabelText(/pilih berkas stnk/i),
      fileOf('stnk.pdf', 'application/pdf'),
    )
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))

    await waitFor(() => expect(screen.getByText(/armada tersimpan/i)).toBeInTheDocument())
    expect(onSubmit).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /unggah ulang/i }))
    await waitFor(() => expect(onUploadBerkas).toHaveBeenCalledTimes(2))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('uploads nothing when the form does not validate', async () => {
    const { onSubmit, onUploadBerkas } = setupWithBerkas()
    await userEvent.upload(
      screen.getByLabelText(/pilih berkas stnk/i),
      fileOf('stnk.pdf', 'application/pdf'),
    )
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))

    await waitFor(() => expect(screen.getByText(/wajib diisi/i)).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onUploadBerkas).not.toHaveBeenCalled()
  })

  it('renders neither section when the deployment has no berkas slots', () => {
    setupWithBerkas({ berkasSlots: [] })
    expect(screen.queryByText('Foto Kendaraan')).not.toBeInTheDocument()
    expect(screen.queryByText('Softcopy Berkas')).not.toBeInTheDocument()
  })
})
```

Tambahkan import `userEvent` di bagian atas berkas bila belum ada:

```tsx
import userEvent from '@testing-library/user-event'
```

Dan `FleetVehicleFile` ke import tipe bila dipakai — pada tes di atas tidak, jadi cukup `FleetMasterRow` dan `FleetVehicle` yang sudah diimpor.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/frontend && pnpm test VehicleFormDialog`
Expected: FAIL — section "Foto Kendaraan" tidak ada, dan `onUploadBerkas` tidak pernah dipanggil.

- [ ] **Step 3: Wire the dialog**

Di `VehicleFormDialog.tsx`, perbarui import dan props:

```tsx
import { FleetDriver, FleetMasterRow, FleetVehicle, FleetVehicleFile, FleetVehiclePayload } from '../types'
import { BerkasFormSection } from './vehicle-form/BerkasFormSection'
import { isPhotoSlot, useVehicleBerkas } from './vehicle-form/useVehicleBerkas'
```

```tsx
interface VehicleFormDialogProps {
  open: boolean
  initial?: FleetVehicle
  masterData: VehicleMasterData
  drivers: FleetDriver[]
  // The jenis_berkas slots this deployment has. Empty for an operator without master-data
  // permission, which renders both file sections away rather than showing empty ones.
  berkasSlots?: FleetMasterRow[]
  existingFiles?: FleetVehicleFile[]
  // Returns the saved vehicle, not void: on a create its id is the only way the uploads that
  // follow know where to file themselves.
  onSubmit: (payload: FleetVehiclePayload) => Promise<FleetVehicle>
  onUploadBerkas?: (args: { vehicleId: string; slotId: string; file: File }) => Promise<unknown>
  onClose: () => void
}
```

Di dalam komponen, tambahkan state dan hook setelah `const [error, setError] = useState(...)`:

```tsx
  // The unit the pending files belong to. Starts as the vehicle being edited and is filled in
  // by a create's response, which is what lets a failed upload be retried without saving the
  // vehicle a second time.
  const [savedVehicleId, setSavedVehicleId] = useState<string | null>(initial?.id ?? null)
  const [uploadFailures, setUploadFailures] = useState<UploadFailure[] | null>(null)

  const berkas = useVehicleBerkas({
    upload: async ({ vehicleId, slotId, file }) => {
      if (!onUploadBerkas) throw new Error('Unggah berkas tidak tersedia.')
      return onUploadBerkas({ vehicleId, slotId, file })
    },
  })

  const { fotoSlots, dokumenSlots } = useMemo(() => {
    const slots = berkasSlots ?? []
    return {
      fotoSlots: slots.filter((s) => isPhotoSlot(s.code)),
      // Everything else, not a closed list of codes: a slot an admin adds later still lands
      // somewhere rather than disappearing from the form.
      dokumenSlots: slots.filter((s) => !isPhotoSlot(s.code)),
    }
  }, [berkasSlots])
```

Tambahkan `UploadFailure` ke import dari `useVehicleBerkas`:

```tsx
import { UploadFailure, isPhotoSlot, useVehicleBerkas } from './vehicle-form/useVehicleBerkas'
```

Ganti `handleSubmit` seluruhnya:

```tsx
  // Uploads the pending files and decides whether the dialog may close. Shared by the first
  // save and by the retry, so the two cannot drift apart.
  const runUploads = async (vehicleId: string): Promise<boolean> => {
    const failed = await berkas.uploadAll(vehicleId)
    setUploadFailures(failed.length > 0 ? failed : null)
    return failed.length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    // Without this the browser navigates away and the operator loses a 22-field form.
    e.preventDefault()
    setError(null)
    if (!form.validate()) return

    setSubmitting(true)
    try {
      // A retry after a partial failure: the vehicle is already saved, so re-sending it would
      // PATCH correct data — or, on a create, register a second unit on the same plate.
      if (savedVehicleId && uploadFailures) {
        if (await runUploads(savedVehicleId)) onClose()
        return
      }

      const saved = await onSubmit(form.buildPayload())
      const vehicleId = saved?.id ?? savedVehicleId
      setSavedVehicleId(vehicleId ?? null)

      if (berkas.pendingCount === 0 || !vehicleId) {
        onClose()
        return
      }
      if (await runUploads(vehicleId)) onClose()
    } catch (err) {
      // The backend's own message names the plate that clashed; the fallback only covers the
      // case where the request never reached it.
      setError(apiErrorMessage(err, 'Terjadi kesalahan saat menyimpan armada.'))
    } finally {
      setSubmitting(false)
    }
  }
```

Tambahkan kedua section tepat setelah `<DocumentSection title="Dokumen Kendaraan" ... />`:

```tsx
          <BerkasFormSection
            title="Foto Kendaraan"
            slots={fotoSlots}
            existing={existingFiles ?? []}
            berkas={berkas}
            cols={4}
            accept="image/jpeg,image/png,image/webp"
            hint="jpg, png, atau webp · maksimal 5 MB"
            showThumbnail
          />

          <BerkasFormSection
            title="Softcopy Berkas"
            slots={dokumenSlots}
            existing={existingFiles ?? []}
            berkas={berkas}
            cols={3}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            hint="jpg, png, webp, atau pdf · maksimal 10 MB"
            showThumbnail={false}
          />
```

Tambahkan pesan kegagalan tepat sebelum blok `{error && ...}`:

```tsx
          {uploadFailures && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <p className="font-medium">
                Armada tersimpan. {uploadFailures.length} berkas gagal diunggah:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {uploadFailures.map((f) => (
                  <li key={f.slotLabel}>
                    {f.slotLabel} — {f.message}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Berkas lain sudah tersimpan. Data armada tidak perlu diisi ulang.
              </p>
            </div>
          )}
```

Ganti label tombol submit:

```tsx
            <Button type="submit" disabled={submitting}>
              {submitLabel(submitting, berkas.pendingCount, uploadFailures !== null)}
            </Button>
```

Dan tambahkan helper di bawah komponen:

```tsx
// The button says what the next click will actually do. After a partial failure that is no
// longer "save" — the vehicle is already saved, and only the files are outstanding.
function submitLabel(submitting: boolean, pending: number, retrying: boolean): string {
  if (submitting) return pending > 0 ? 'Mengunggah berkas…' : 'Menyimpan…'
  if (retrying) return 'Unggah ulang berkas yang gagal'
  return 'Simpan'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/frontend && pnpm test VehicleFormDialog`
Expected: PASS — termasuk tes lama di berkas itu.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx \
        apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx
git commit -m "feat(fleet): let one Simpan store a unit and its papers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Sambungkan halaman Armada

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`

**Interfaces:**
- Consumes: props baru `VehicleFormDialog` dari Task 6; `useUploadVehicleFile` dan `useVehicleFiles` yang sudah diimpor halaman ini.
- Produces: tidak ada; ini simpul terakhir.

- [ ] **Step 1: Return the saved vehicle from handleSubmit**

Di `page.tsx`, `handleSubmit` membuang hasil `mutateAsync`. Kembalikan:

```tsx
  // Returns the saved unit rather than void: VehicleFormDialog uploads the files the operator
  // picked against this id, and on a create there is no other way to learn it.
  const handleSubmit = async (payload: FleetVehiclePayload): Promise<FleetVehicle> => {
    if (modal?.type === 'edit') {
      return await updateVehicle.mutateAsync({ id: modal.vehicle.id, payload })
    }
    return await createVehicle.mutateAsync(payload)
  }
```

- [ ] **Step 2: Read the files of the unit being edited**

Tambahkan tepat di bawah hook query lain (setelah `const downloadUrl = useFileDownloadUrl()`):

```tsx
  // Only for an edit: a create has no unit whose files could be fetched, and the hook is
  // disabled without an id.
  const editingVehicleId = modal?.type === 'edit' ? modal.vehicle.id : undefined
  const { data: editingFiles } = useVehicleFiles(editingVehicleId)
```

- [ ] **Step 3: Pass the new props**

Di blok `{(modal?.type === 'create' || modal?.type === 'edit') && ( ... )}`:

```tsx
        <VehicleFormDialog
          open
          initial={modal.type === 'edit' ? modal.vehicle : undefined}
          masterData={{
            jenisArmada: jenisArmada ?? [],
            kepemilikan: kepemilikan ?? [],
            leasing: leasing ?? [],
            pool: pool ?? [],
            status: statusKendaraan ?? [],
            jenisDokumen: docTypes ?? [],
          }}
          drivers={drivers ?? []}
          berkasSlots={jenisBerkas ?? []}
          existingFiles={editingFiles ?? []}
          onSubmit={handleSubmit}
          onUploadBerkas={({ vehicleId, slotId, file }) =>
            uploadFile.mutateAsync({ vehicleId, slotId, file })
          }
          onClose={() => setModal(null)}
        />
```

- [ ] **Step 4: Type-check and run the frontend suite**

Run: `cd apps/frontend && pnpm type-check`
Expected: selesai tanpa galat.

Run: `cd apps/frontend && pnpm test`
Expected: PASS — seluruh suite frontend hijau.

- [ ] **Step 5: Lint**

Run: `cd apps/frontend && pnpm lint`
Expected: tanpa galat baru. Dua `eslint-disable-next-line @next/next/no-img-element` sudah ada di tempatnya.

- [ ] **Step 6: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx"
git commit -m "feat(fleet): hand the form the slots and the uploader it needs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Verifikasi penuh

**Files:** tidak ada perubahan kode; tugas ini menjalankan kedua suite sampai hijau.

- [ ] **Step 1: Run the full backend suite**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`
Expected: PASS. Heap bump **dan** `--runInBand` keduanya wajib — `--runInBand` sendirian masih core-dump di box ini.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd apps/frontend && pnpm test`
Expected: PASS, tanpa flag apa pun.

- [ ] **Step 3: Type-check both sides**

Run: `cd apps/backend && pnpm exec tsc --noEmit -p tsconfig.json`
Run: `cd apps/frontend && pnpm type-check`
Expected: keduanya selesai tanpa galat.

- [ ] **Step 4: Commit anything outstanding**

Bila langkah di atas menuntut perbaikan, commit terpisah dengan pesan yang menyebut apa yang diperbaiki. Bila semuanya hijau tanpa perubahan, tidak ada yang perlu di-commit.
