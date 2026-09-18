# Registrasi Armada Phase 3 — Berkas, Angsuran, Ringkasan, Ekspor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Berkas kendaraan dan softcopy SIM sopir terunggah ke MinIO lewat presigned URL dan bisa dilihat kembali; tab Kepemilikan & Angsuran menampilkan sisa kewajiban; kartu ringkasan dan Ekspor CSV berjalan.

**Architecture:** Satu modul shared baru (`StorageModule`) di atas `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, dengan antarmuka sempit sehingga modul fleet tidak tahu-menahu soal S3. Alur unggah tiga langkah — `upload-intent` → browser PUT langsung ke MinIO → `confirm` yang memverifikasi lewat `HEAD` — sehingga byte berkas tidak pernah melewati backend dan tidak pernah menjadi string yang dirender ke DOM. Satu migration menambah `fleet_vehicle_files` dan kolom softcopy SIM di `fleet_drivers`; `fleet_lease_contracts` sudah ada sejak `20260912000002`. Frontend menambah dua tab di dalam `/fleet/vehicles`, kartu ringkasan di atasnya, dan tombol Ekspor CSV.

**Tech Stack:** NestJS 10 · TypeORM · PostgreSQL 16 · MinIO (S3-compatible) · `@aws-sdk/client-s3` v3 · Next.js App Router · React Query v5 · Tailwind · jest + ts-jest (backend) · jest + Testing Library (frontend)

**Spec:** `docs/superpowers/specs/2026-09-09-registrasi-armada-design.md` §3.5, §3.6, §4 (seluruhnya), §5 (Berkas & kontrak), §6.2, §6.3 (Phase 3), §6.4, §8, §9 (Phase 3)

## Global Constraints

- **Bahasa kode & komentar: Inggris.** Seluruh repo berbahasa Inggris; hanya label UI yang tampil ke operator berbahasa Indonesia. Jangan menulis komentar berbahasa Indonesia di dalam kode.
- **Komentar menjelaskan *kenapa*, bukan *apa*.** Komentar yang hanya mengulang kode akan ditolak saat review.
- **Gaya kode: ikuti file tetangga.** Repo ini tidak punya konfigurasi Prettier. Modul backend `fleet-*` dan seluruh `apps/frontend/src/features/**` + `apps/frontend/src/app/(dashboard)/fleet/**` ditulis **tanpa semicolon**; komponen lama di `apps/frontend/src/components/**` memakai semicolon. Semua contoh kode di plan ini sudah mengikuti aturan itu — salin apa adanya. Jalankan `pnpm lint` sebelum commit.
- **Aturan yang mengikat setiap subagent:** `/home/faris/code/esp/esp-dashboard/.superpowers/sdd/FLEET-RULES.md` — baca lewat path absolut itu sebelum menjalankan perintah apa pun. Aturan memori, gaya, dan database di sana menang atas apa pun di plan ini.
- **Setiap perintah jest WAJIB membatasi worker, dan dinilai dari EXIT CODE, bukan stdout.** Box ini 16 core tapi hanya ~4 GB bebas; jest menghitung jumlah worker dari core, jadi `pnpm test` polos memunculkan ~15 proses ts-jest dan OOM killer menghabisinya. Tandanya: "N suites failed" sementara **0 test** gagal — suite-nya tidak pernah jalan. Wrapper `rtk` juga mengubah urutan stdout, jadi grep "failed" sudah pernah menghasilkan laporan hijau palsu.

  ```bash
  # Backend, terfokus (hampir selalu ini):
  cd /home/faris/code/esp/esp-dashboard/apps/backend && \
    pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB <pattern> \
    >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"

  # Frontend, terfokus:
  cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
    pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB <path> \
    >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"
  ```

  `echo "EXIT=$?"` harus jadi perintah **persis berikutnya** — pipe atau perintah kedua menimpanya. EXIT=0 hijau, EXIT!=0 merah, lalu `tail -40 /tmp/fleet-$$.log` untuk melihat sebabnya. Jangan pernah menaikkan `--maxWorkers` di atas 1. Suite penuh hanya dijalankan bila brief task secara eksplisit memintanya.
- **Migration:** `migrationsTransactionMode: 'all'`, jadi **jangan** pakai `CREATE INDEX CONCURRENTLY` (TypeORM menolaknya dengan `ForbiddenTransactionModeOverrideError` dan memblokir seluruh migration pending).
- **Entity auto-load:** `autoLoadEntities: true` di `app.module.ts` — entity terdaftar lewat `TypeOrmModule.forFeature` di module, tidak perlu didaftarkan manual.
- **`ValidationPipe` global:** `whitelist: true, forbidNonWhitelisted: true, transform: true`. Properti yang tidak dideklarasikan di DTO menghasilkan 400 yang menyebut namanya.
- **Permission sudah ada.** Keempat `*.fleet_vehicle` sudah di enum `Permission` sejak Phase 1 — Phase 3 tidak menambah permission baru dan tidak perlu me-rebuild `@esp/shared`. Berkas dan kontrak ikut permission kendaraan (spec §7).
- **Tidak ada kalkulasi tanggal atau uang di frontend.** Setiap `daysLeft`, `severity`, `angsuranTerbayar`, `sisaAngsuran`, dan `sisaKewajiban` datang dari backend. Frontend hanya memformat.
- **`fleet_lease_contracts` sudah ada.** Migration `20260912000002-fleet-lease-contracts.ts`, entity `FleetLeaseContractEntity`, helper `computeLease()` di `fleet-lease.ts`, dan penulisan kontrak lewat `POST/PATCH /fleet/vehicles` sudah mendarat bersama pekerjaan form. Phase 3 **tidak** membuat ulang semua itu — yang ditambahkan hanya endpoint baca/tutup kontrak dan UI-nya.
- **Jangan pernah merender byte berkas ke DOM.** Semua pratinjau menunjuk URL presigned; `external_url` divalidasi harus `http`/`https` (spec §4.3). Ini alasan modul ini ada dalam bentuk sekarang.

---

## File Structure

**Infrastruktur — baru / diubah**
```
.devcontainer/docker-compose.yml               + service minio, minio-init, volume minio-data
apps/backend/.env.example                      + blok S3
apps/backend/package.json                      + @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
```

**Backend — baru**
```
apps/backend/src/database/migrations/20260916000001-fleet-vehicle-files.ts
    tabel fleet_vehicle_files + kolom sim_* di fleet_drivers

apps/backend/src/modules/storage/
  storage.constants.ts          MIME yang diterima, batas ukuran, ekstensi per MIME
  storage.constants.spec.ts
  storage.service.ts            createUploadUrl / createDownloadUrl / statObject / deleteObject
  storage.service.spec.ts
  storage.module.ts             global module, mengekspor StorageService

apps/backend/src/modules/fleet-vehicles/
  entities/fleet-vehicle-file.entity.ts        tabel fleet_vehicle_files
  fleet-files.ts                               buildStorageKey / assertExternalUrl (murni, mudah dites)
  fleet-files.spec.ts
  fleet-vehicle-files.service.ts               intent / confirm / externalUrl / downloadUrl / remove
  fleet-vehicle-files.service.spec.ts
  fleet-vehicle-files.controller.ts            /fleet/vehicles/:id/files/*
  fleet-vehicle-files.controller.spec.ts
  fleet-contracts.service.ts                   list kontrak per unit + close
  fleet-contracts.service.spec.ts
  fleet-contracts.controller.ts                /fleet/vehicles/:id/contracts, /fleet/contracts/:id
  fleet-contracts.controller.spec.ts
  fleet-summary.service.ts                     GET /fleet/summary + GET /fleet/export.csv
  fleet-summary.service.spec.ts
  fleet-csv.ts                                 toCsv() murni
  fleet-csv.spec.ts
  dto/upload-intent.dto.ts + .spec.ts
  dto/confirm-upload.dto.ts + .spec.ts
  dto/external-url.dto.ts + .spec.ts
  dto/close-contract.dto.ts + .spec.ts

apps/backend/src/modules/fleet-drivers/
  fleet-driver-files.service.ts                softcopy SIM, memakai StorageService yang sama
  fleet-driver-files.service.spec.ts
  fleet-driver-files.controller.ts             /fleet/drivers/:id/sim-file/*
  fleet-driver-files.controller.spec.ts
```

**Backend — diubah**
```
apps/backend/src/app.module.ts                          + StorageModule
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts
    + FleetVehicleFileEntity, tiga service & controller baru
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts
    + FleetVehicleFileView, berkasCount di FleetVehicleView
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts
    + berkasCount di loadViews/toView
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.ts
    + GET /fleet/vehicles/summary dan /fleet/vehicles/export.csv (lihat catatan urutan route di Task 9)
apps/backend/src/modules/fleet-drivers/entities/fleet-driver.entity.ts
    + kolom sim_storage_key / sim_original_name / sim_mime_type / sim_size_bytes
apps/backend/src/modules/fleet-drivers/fleet-drivers.module.ts
    + controller & service berkas SIM
```

**Frontend — baru**
```
apps/frontend/src/features/fleet/
  hooks/useFleetVehicleFiles.ts + .spec.tsx
  hooks/useFleetSummary.ts + .spec.tsx
  hooks/useFleetExport.ts + .spec.tsx
  hooks/useDriverSimFile.ts + .spec.tsx
  components/FleetSummaryCards.tsx + .spec.tsx
  components/BerkasTab.tsx + .spec.tsx
  components/BerkasSlotCard.tsx + .spec.tsx
  components/BerkasUploadDialog.tsx + .spec.tsx
  components/AngsuranTab.tsx + .spec.tsx
  components/VehiclesTabs.tsx + .spec.tsx        tab bar di dalam halaman armada
  utils/format-rupiah.ts + .spec.ts
  utils/format-bytes.ts + .spec.ts
```

**Frontend — diubah**
```
apps/frontend/src/features/fleet/types.ts                      + tipe berkas, summary, file wire
apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx      + kartu ringkasan, tab, tombol ekspor
apps/frontend/src/features/fleet/components/DriverFormDialog.tsx  + slot softcopy SIM
```

## Task Overview

| Task | Deliverable | Bisa dites sendiri |
|---|---|---|
| 1 | MinIO di devcontainer + env + dependency | `mc` membuat bucket, backend boot |
| 2 | `StorageModule` + `StorageService` | unit test dengan S3 client di-mock |
| 3 | Migration `fleet_vehicle_files` + kolom SIM | migration up/down bersih |
| 4 | `fleet-files.ts` (key builder + validator URL) | unit test murni |
| 5 | DTO berkas | `.dto.spec.ts` |
| 6 | `FleetVehicleFilesService` + controller | service + controller spec |
| 7 | Softcopy SIM sopir | service + controller spec |
| 8 | `berkasCount` masuk response daftar | `fleet-vehicles.service.spec.ts` |
| 9 | `GET /fleet/summary` + kontrak endpoint | service spec |
| 10 | `fleet-csv.ts` + `GET /fleet/export.csv` | unit test murni + controller spec |
| 11 | Frontend: tipe, util format, hooks berkas | hook spec |
| 12 | Frontend: `FleetSummaryCards` + tombol Ekspor | component spec |
| 13 | Frontend: tab bar + `BerkasTab` + slot card | component spec |
| 14 | Frontend: `BerkasUploadDialog` (intent→PUT→confirm) | component spec |
| 15 | Frontend: `AngsuranTab` | component spec |
| 16 | Frontend: softcopy SIM di `DriverFormDialog` | component spec |

---

### Task 1: MinIO di devcontainer, env, dan dependency

**Files:**
- Modify: `.devcontainer/docker-compose.yml`
- Modify: `apps/backend/.env.example`
- Modify: `apps/backend/.env`
- Modify: `apps/backend/package.json`

**Interfaces:**
- Consumes: tidak ada (task pertama)
- Produces: env var `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` yang dibaca Task 2; paket `@aws-sdk/client-s3` dan `@aws-sdk/s3-request-presigner`.

- [ ] **Step 1: Tambahkan service minio dan minio-init ke docker-compose**

Sisipkan dua service ini setelah blok `mailhog:` di `.devcontainer/docker-compose.yml`:

```yaml
  minio:
    image: minio/minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000" # S3 API
      - "9001:9001" # console
    volumes:
      - minio-data:/data

  # One-shot: creates the bucket and opens CORS so the browser's direct PUT is not rejected by a
  # preflight. Without the CORS rule the upload fails in the browser while curl from the backend
  # succeeds, which is a confusing way to spend an afternoon.
  minio-init:
    image: minio/mc
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 minioadmin minioadmin; do sleep 1; done;
      mc mb --ignore-existing local/esp-fleet;
      mc anonymous set none local/esp-fleet;
      echo done
      "
```

Lalu ubah blok `workspace:` — tambahkan `minio` ke `depends_on` dan env var S3:

```yaml
  workspace:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ..:/workspace:cached
    command: sleep infinity
    depends_on:
      - postgres
      - redis
      - minio
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/app
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      S3_PUBLIC_ENDPOINT: http://localhost:9000
      S3_REGION: us-east-1
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
      S3_BUCKET: esp-fleet
      S3_FORCE_PATH_STYLE: "true"
    ports:
      - "3000:3000"
      - "4000:4000"
```

Dan tambahkan volume di blok `volumes:` paling bawah:

```yaml
volumes:
  postgres-data:
  minio-data:
```

- [ ] **Step 2: Tambahkan blok S3 ke .env.example dan .env**

Tambahkan di akhir `apps/backend/.env.example`:

```
# ── Object storage (MinIO / S3) ───────────────────────────
# S3_PUBLIC_ENDPOINT is what the BROWSER reaches; S3_ENDPOINT is what the backend reaches.
# A presigned URL must be signed for the host the browser will use, or MinIO answers
# SignatureDoesNotMatch.
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=esp-fleet
S3_FORCE_PATH_STYLE=true
```

Salin blok yang sama ke `apps/backend/.env` (file lokal, tidak di-commit).

- [ ] **Step 3: Pasang dependency AWS SDK**

Run: `cd apps/backend && pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

Expected: kedua paket muncul di `dependencies` `apps/backend/package.json`, `pnpm-lock.yaml` berubah.

- [ ] **Step 4: JANGAN menyalakan MinIO**

Keputusan partner saat pre-flight: task ini **hanya menulis konfigurasi**. Jangan menjalankan
`docker compose up`. Pekerjaan berlangsung di host, bukan di dalam devcontainer, dan box hanya
punya ~4 GB bebas. Seluruh test storage me-mock klien S3, jadi tidak ada satu pun test di plan ini
yang butuh MinIO hidup — partner yang akan menyalakannya sendiri saat verifikasi manual di akhir.

- [ ] **Step 5: Verifikasi backend masih boot**

Run: `cd apps/backend && pnpm build`
Expected: selesai tanpa error TypeScript.

- [ ] **Step 6: Commit**

```bash
git add .devcontainer/docker-compose.yml apps/backend/.env.example apps/backend/package.json pnpm-lock.yaml
git commit -m "chore(fleet): stand up MinIO for vehicle file storage

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: StorageModule dan StorageService

**Files:**
- Create: `apps/backend/src/modules/storage/storage.constants.ts`
- Create: `apps/backend/src/modules/storage/storage.constants.spec.ts`
- Create: `apps/backend/src/modules/storage/storage.service.ts`
- Create: `apps/backend/src/modules/storage/storage.service.spec.ts`
- Create: `apps/backend/src/modules/storage/storage.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: env var dari Task 1.
- Produces:
  - `ALLOWED_MIME_TYPES: readonly string[]`, `MAX_UPLOAD_BYTES: number`, `extensionFor(mime: string): string | null` — dipakai Task 4, 5, 6, 7.
  - `class StorageService` dengan `createUploadUrl(key: string, mime: string, maxBytes: number): Promise<string>`, `createDownloadUrl(key: string, filename: string): Promise<string>`, `statObject(key: string): Promise<{ size: number; mime: string } | null>`, `deleteObject(key: string): Promise<void>` — dipakai Task 6 dan 7.

- [ ] **Step 1: Tulis test untuk konstanta**

Create `apps/backend/src/modules/storage/storage.constants.spec.ts`:

```ts
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, extensionFor } from './storage.constants'

describe('storage constants', () => {
  it('accepts exactly the four types the spec names', () => {
    expect([...ALLOWED_MIME_TYPES].sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
  })

  it('caps an upload at 10 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
  })

  it('derives the extension from the mime type', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg')
    expect(extensionFor('image/png')).toBe('png')
    expect(extensionFor('image/webp')).toBe('webp')
    expect(extensionFor('application/pdf')).toBe('pdf')
  })

  // The extension is derived rather than taken from the submitted filename, so a file called
  // "photo.jpg.exe" cannot dictate what lands in the bucket.
  it('refuses a type it does not know', () => {
    expect(extensionFor('application/x-msdownload')).toBeNull()
    expect(extensionFor('image/svg+xml')).toBeNull()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB storage.constants \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `Cannot find module './storage.constants'`

- [ ] **Step 3: Tulis konstanta**

Create `apps/backend/src/modules/storage/storage.constants.ts`:

```ts
// The allow-list is a map rather than a bare array because the extension is derived from the
// verified MIME type, never from the filename the client sent (spec §4.2): a client that names
// its upload "stnk.pdf.exe" must still land in the bucket as .pdf or be refused outright.
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export const ALLOWED_MIME_TYPES: readonly string[] = Object.keys(EXTENSION_BY_MIME)

// 10 MB, far above the prototype's ~190 KB ceiling — that limit existed only because base64 had
// to fit in localStorage, a constraint this port does not have.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export function extensionFor(mime: string): string | null {
  return EXTENSION_BY_MIME[mime] ?? null
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB storage.constants \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 4 test.

- [ ] **Step 5: Tulis test untuk StorageService**

Create `apps/backend/src/modules/storage/storage.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config'
import { StorageService } from './storage.service'

const getSignedUrl = jest.fn()
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
}))

const send = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: (...a: unknown[]) => send(...a) })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'put', input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'get', input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'head', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'delete', input })),
}))

function build(): StorageService {
  const config = {
    get: (key: string) =>
      ({
        S3_ENDPOINT: 'http://minio:9000',
        S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY: 'minioadmin',
        S3_SECRET_KEY: 'minioadmin',
        S3_BUCKET: 'esp-fleet',
        S3_FORCE_PATH_STYLE: 'true',
      })[key],
  } as unknown as ConfigService
  return new StorageService(config)
}

beforeEach(() => {
  getSignedUrl.mockReset()
  send.mockReset()
  getSignedUrl.mockResolvedValue('https://signed.example/url')
})

describe('StorageService', () => {
  it('signs a PUT that pins the content type and length', async () => {
    const service = build()
    await service.createUploadUrl('fleet/v1/stnk/abc.pdf', 'application/pdf', 1234)

    const [, command, options] = getSignedUrl.mock.calls[0]
    expect(command.input).toMatchObject({
      Bucket: 'esp-fleet',
      Key: 'fleet/v1/stnk/abc.pdf',
      ContentType: 'application/pdf',
      ContentLength: 1234,
    })
    // Five minutes: long enough for a slow connection, short enough that a leaked URL is not a
    // standing write grant on the bucket.
    expect(options).toMatchObject({ expiresIn: 300 })
  })

  it('signs a GET that names the file for the download', async () => {
    const service = build()
    await service.createDownloadUrl('fleet/v1/stnk/abc.pdf', 'STNK B 9114 KYZ.pdf')

    const [, command, options] = getSignedUrl.mock.calls[0]
    expect(command.input.ResponseContentDisposition).toContain('STNK B 9114 KYZ.pdf')
    expect(options).toMatchObject({ expiresIn: 120 })
  })

  it('reports an object size and type', async () => {
    send.mockResolvedValue({ ContentLength: 2048, ContentType: 'image/png' })
    const service = build()
    await expect(service.statObject('fleet/v1/stnk/abc.png')).resolves.toEqual({
      size: 2048,
      mime: 'image/png',
    })
  })

  // A missing object is an ordinary answer here, not a fault: confirm() asks precisely because it
  // does not trust the client's claim that an upload happened.
  it('answers null when the object is not there', async () => {
    send.mockRejectedValue(Object.assign(new Error('not found'), { name: 'NotFound' }))
    const service = build()
    await expect(service.statObject('missing')).resolves.toBeNull()
  })

  it('rethrows a stat failure that is not a missing object', async () => {
    send.mockRejectedValue(Object.assign(new Error('boom'), { name: 'AccessDenied' }))
    const service = build()
    await expect(service.statObject('any')).rejects.toThrow('boom')
  })

  it('deletes by key', async () => {
    send.mockResolvedValue({})
    const service = build()
    await service.deleteObject('fleet/v1/stnk/abc.pdf')
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'esp-fleet',
      Key: 'fleet/v1/stnk/abc.pdf',
    })
  })
})
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB storage.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `Cannot find module './storage.service'`

- [ ] **Step 7: Tulis StorageService**

Create `apps/backend/src/modules/storage/storage.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const UPLOAD_URL_TTL_SECONDS = 300
const DOWNLOAD_URL_TTL_SECONDS = 120

// The exported surface is deliberately narrow: the fleet module asks for a URL and gets one, and
// never learns that S3 is behind it. Swapping MinIO for real S3 is then an env change.
@Injectable()
export class StorageService {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'esp-fleet'
    // Signed against the endpoint the BROWSER will call, not the one the backend uses to reach
    // MinIO over the compose network. Signing for 'minio:9000' and handing that URL to a browser
    // produces SignatureDoesNotMatch even though the credentials are right.
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint:
        this.config.get<string>('S3_PUBLIC_ENDPOINT') ?? this.config.get<string>('S3_ENDPOINT'),
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? '',
      },
    })
  }

  // ContentType and ContentLength are part of the signature, so the browser cannot upload a
  // different type or a larger file than the intent was granted for — the size limit is enforced
  // by MinIO itself rather than by our trust in the client.
  async createUploadUrl(key: string, mime: string, maxBytes: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mime,
      ContentLength: maxBytes,
    })
    return getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS })
  }

  async createDownloadUrl(key: string, filename: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // Quotes escaped so a filename containing one cannot terminate the header value early.
      ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
    })
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS })
  }

  // null means "no such object", which is the answer confirm() acts on. Any other failure is a
  // real fault and is rethrown: treating an AccessDenied as "missing" would let a confirm quietly
  // succeed against a bucket we cannot actually read.
  async statObject(key: string): Promise<{ size: number; mime: string } | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return { size: Number(out.ContentLength ?? 0), mime: out.ContentType ?? '' }
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name
      if (name === 'NotFound' || name === 'NoSuchKey') return null
      throw err
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
```

- [ ] **Step 8: Tulis StorageModule**

Create `apps/backend/src/modules/storage/storage.module.ts`:

```ts
import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'

// Global: both the vehicle-files module and the driver SIM module need it, and neither owns it.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 9: Daftarkan di app.module.ts**

Tambahkan import di `apps/backend/src/app.module.ts` bersama import modul lain:

```ts
import { StorageModule } from './modules/storage/storage.module'
```

dan tambahkan `StorageModule,` ke array `imports`, tepat sebelum `FleetMasterDataModule,`.

- [ ] **Step 10: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB storage \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 10 test (4 konstanta + 6 service).

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/storage apps/backend/src/app.module.ts
git commit -m "feat(storage): hand out presigned URLs instead of carrying bytes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Migration `fleet_vehicle_files` dan kolom softcopy SIM

**Files:**
- Create: `apps/backend/src/database/migrations/20260916000001-fleet-vehicle-files.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/entities/fleet-vehicle-file.entity.ts`
- Modify: `apps/backend/src/modules/fleet-drivers/entities/fleet-driver.entity.ts`

**Interfaces:**
- Consumes: tabel `fleet_vehicles` dan `fleet_master_data` (Phase 1–2), `fleet_drivers` (Phase 1).
- Produces: `FleetVehicleFileEntity` dengan properti `id`, `vehicleId`, `slotId`, `storageKey`, `originalName`, `mimeType`, `sizeBytes`, `externalUrl`, `uploadedBy`, `uploadedAt`, dan relasi `slot?: FleetMasterDataEntity` — dipakai Task 6 dan 8. `FleetDriverEntity` bertambah `simStorageKey`, `simOriginalName`, `simMimeType`, `simSizeBytes` — dipakai Task 7.

- [ ] **Step 1: Tulis migration**

Create `apps/backend/src/database/migrations/20260916000001-fleet-vehicle-files.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// One row per (vehicle, slot). Replacing a file updates the row to a new storage key rather than
// inserting a second one — an operator who re-uploads a STNK means "this is the STNK now", not
// "keep both and guess".
export class FleetVehicleFiles20260916000001 implements MigrationInterface {
  name = 'FleetVehicleFiles20260916000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fleet_vehicle_files" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vehicle_id" uuid NOT NULL,
        "slot_id" uuid NOT NULL,
        "storage_key" character varying(255),
        "original_name" character varying(255),
        "mime_type" character varying(100),
        "size_bytes" bigint,
        "external_url" text,
        "uploaded_by" uuid,
        "uploaded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_vehicle_files" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "fk_fleet_vehicle_files_vehicle"
        FOREIGN KEY ("vehicle_id") REFERENCES "fleet_vehicles"("id") ON DELETE CASCADE
    `)
    // RESTRICT, matching the lease contract's leasing_id: a jenis_berkas row still holding files
    // must not be deletable from the Master Data screen.
    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "fk_fleet_vehicle_files_slot"
        FOREIGN KEY ("slot_id") REFERENCES "fleet_master_data"("id") ON DELETE RESTRICT
    `)
    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "fk_fleet_vehicle_files_uploader"
        FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_fleet_vehicle_files_slot"
        ON "fleet_vehicle_files" ("vehicle_id", "slot_id")
    `)

    // Exactly one source. A row with both would make "where does this file live" ambiguous, and a
    // row with neither is a slot that claims to hold a file and does not.
    await queryRunner.query(`
      ALTER TABLE "fleet_vehicle_files"
        ADD CONSTRAINT "ck_fleet_vehicle_files_one_source"
        CHECK (("storage_key" IS NOT NULL) <> ("external_url" IS NOT NULL))
    `)

    // The driver's licence scan lives on the driver, not in this table: a driver has exactly one
    // such file and no indication of more (spec §4.5). Extracting it later is straightforward.
    await queryRunner.query(`
      ALTER TABLE "fleet_drivers"
        ADD COLUMN "sim_storage_key" character varying(255),
        ADD COLUMN "sim_original_name" character varying(255),
        ADD COLUMN "sim_mime_type" character varying(100),
        ADD COLUMN "sim_size_bytes" bigint
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fleet_drivers"
        DROP COLUMN "sim_storage_key",
        DROP COLUMN "sim_original_name",
        DROP COLUMN "sim_mime_type",
        DROP COLUMN "sim_size_bytes"
    `)
    await queryRunner.query(`DROP TABLE "fleet_vehicle_files"`)
  }
}
```

- [ ] **Step 2: Jalankan migration**

Run: `cd apps/backend && pnpm migration:run`
Expected: `FleetVehicleFiles20260916000001` tercatat sebagai executed, tanpa error.

Jika perintah `migration:run` tidak ada di `package.json`, periksa nama script dengan `cd apps/backend && node -e "console.log(Object.keys(require('./package.json').scripts).join('\n'))"` dan pakai script migration yang terdaftar.

- [ ] **Step 3: Verifikasi down bersih lalu naikkan lagi**

Run: `cd apps/backend && pnpm migration:revert && pnpm migration:run`
Expected: revert menghapus tabel dan keempat kolom tanpa error, lalu up berjalan lagi bersih.

- [ ] **Step 4: Tulis entity berkas**

Create `apps/backend/src/modules/fleet-vehicles/entities/fleet-vehicle-file.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehicleEntity } from './fleet-vehicle.entity'

@Entity('fleet_vehicle_files')
export class FleetVehicleFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(() => FleetVehicleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: FleetVehicleEntity

  @Column({ name: 'slot_id', type: 'uuid' })
  slotId: string

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'slot_id' })
  slot?: FleetMasterDataEntity

  @Column({ name: 'storage_key', length: 255, nullable: true })
  storageKey: string | null

  @Column({ name: 'original_name', length: 255, nullable: true })
  originalName: string | null

  @Column({ name: 'mime_type', length: 100, nullable: true })
  mimeType: string | null

  // The real byte count, not the length of a base64 string. The prototype stored the latter for
  // images and the former for PDFs, so its size column overstated every image by about a third
  // and showed two different units side by side (spec §3.6).
  //
  // bigint reads back as a string in pg; the service parses it at the view boundary.
  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes: string | null

  @Column({ name: 'external_url', type: 'text', nullable: true })
  externalUrl: string | null

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null

  @CreateDateColumn({ name: 'uploaded_at' })
  uploadedAt: Date
}
```

- [ ] **Step 5: Tambahkan kolom SIM ke entity sopir**

Di `apps/backend/src/modules/fleet-drivers/entities/fleet-driver.entity.ts`, tepat setelah properti `simExpiresAt`, tambahkan:

```ts
  // The licence scan, stored the same way a vehicle file is (spec §4.5) — four columns rather
  // than a fleet_driver_files table, because a driver has exactly one such file.
  @Column({ name: 'sim_storage_key', length: 255, nullable: true })
  simStorageKey: string | null

  @Column({ name: 'sim_original_name', length: 255, nullable: true })
  simOriginalName: string | null

  @Column({ name: 'sim_mime_type', length: 100, nullable: true })
  simMimeType: string | null

  @Column({ name: 'sim_size_bytes', type: 'bigint', nullable: true })
  simSizeBytes: string | null
```

- [ ] **Step 6: Verifikasi kompilasi**

Run: `cd apps/backend && pnpm build`
Expected: selesai tanpa error TypeScript.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/database/migrations/20260916000001-fleet-vehicle-files.ts apps/backend/src/modules/fleet-vehicles/entities/fleet-vehicle-file.entity.ts apps/backend/src/modules/fleet-drivers/entities/fleet-driver.entity.ts
git commit -m "feat(fleet): give each vehicle slot a file row and each driver a licence scan

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Helper murni untuk key dan URL eksternal

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-files.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-files.spec.ts`

**Interfaces:**
- Consumes: `extensionFor` dari `storage.constants` (Task 2).
- Produces:
  - `buildVehicleFileKey(vehicleId: string, slotCode: string, mime: string): string`
  - `buildDriverSimKey(driverId: string, mime: string): string`
  - `isSafeExternalUrl(url: string): boolean`
  - dipakai Task 5, 6, 7.

- [ ] **Step 1: Tulis test**

Create `apps/backend/src/modules/fleet-vehicles/fleet-files.spec.ts`:

```ts
import { buildDriverSimKey, buildVehicleFileKey, isSafeExternalUrl } from './fleet-files'

describe('buildVehicleFileKey', () => {
  it('lays the key out by vehicle and slot', () => {
    const key = buildVehicleFileKey('11111111-1111-1111-1111-111111111111', 'stnk', 'image/png')
    expect(key).toMatch(
      /^fleet\/11111111-1111-1111-1111-111111111111\/stnk\/[0-9a-f-]{36}\.png$/,
    )
  })

  // The extension comes from the verified MIME type, never from the submitted filename.
  it('names the extension after the mime type', () => {
    expect(buildVehicleFileKey('v', 'bpkb', 'application/pdf')).toMatch(/\.pdf$/)
    expect(buildVehicleFileKey('v', 'bpkb', 'image/jpeg')).toMatch(/\.jpg$/)
  })

  it('refuses a mime type outside the allow-list', () => {
    expect(() => buildVehicleFileKey('v', 'stnk', 'image/svg+xml')).toThrow(/mime/i)
  })

  // Two uploads into the same slot must not collide, because the old object is deleted only after
  // the row has been repointed — reusing the key would delete the file that just replaced it.
  it('gives every upload its own key', () => {
    const a = buildVehicleFileKey('v', 'stnk', 'image/png')
    const b = buildVehicleFileKey('v', 'stnk', 'image/png')
    expect(a).not.toBe(b)
  })

  // A slot code reaches the key, and master data lets an admin type one. Anything that could
  // climb out of the prefix is refused rather than sanitised, so a surprising code is a visible
  // error instead of a silently rewritten path.
  it('refuses a slot code that is not a plain identifier', () => {
    expect(() => buildVehicleFileKey('v', '../../etc', 'image/png')).toThrow(/slot/i)
    expect(() => buildVehicleFileKey('v', 'a/b', 'image/png')).toThrow(/slot/i)
    expect(() => buildVehicleFileKey('v', '', 'image/png')).toThrow(/slot/i)
  })
})

describe('buildDriverSimKey', () => {
  it('lays the key out under the driver', () => {
    const key = buildDriverSimKey('22222222-2222-2222-2222-222222222222', 'application/pdf')
    expect(key).toMatch(
      /^fleet\/drivers\/22222222-2222-2222-2222-222222222222\/sim\/[0-9a-f-]{36}\.pdf$/,
    )
  })
})

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('https://arsip.example/stnk.pdf')).toBe(true)
    expect(isSafeExternalUrl('http://arsip.example/stnk.pdf')).toBe(true)
  })

  // The prototype rendered f.url into an anchor with no scheme check (line 802), so a stored
  // javascript: URL executed on click. This is the check that closes it.
  it('refuses every other scheme', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('JavaScript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('refuses something that is not a URL at all', () => {
    expect(isSafeExternalUrl('arsip.example/stnk.pdf')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-files \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `Cannot find module './fleet-files'`

- [ ] **Step 3: Tulis helper**

Create `apps/backend/src/modules/fleet-vehicles/fleet-files.ts`:

```ts
import { randomUUID } from 'crypto'
import { extensionFor } from '../storage/storage.constants'

// A slot code comes from master data, which an admin types. It reaches the object key, so it is
// held to a plain identifier: refusing an odd code is a visible error, while silently rewriting
// it would put the file somewhere the operator did not ask for.
const SLOT_CODE = /^[a-z0-9_-]+$/i

function assertSlotCode(slotCode: string): void {
  if (!SLOT_CODE.test(slotCode)) {
    throw new Error(`slot code must be a plain identifier, got "${slotCode}"`)
  }
}

function extensionOrThrow(mime: string): string {
  const ext = extensionFor(mime)
  if (!ext) throw new Error(`unsupported mime type: ${mime}`)
  return ext
}

// A fresh uuid per upload, never the slot code alone: replacing a file repoints the row first and
// deletes the old object second, so reusing a key would delete the replacement.
export function buildVehicleFileKey(vehicleId: string, slotCode: string, mime: string): string {
  assertSlotCode(slotCode)
  return `fleet/${vehicleId}/${slotCode}/${randomUUID()}.${extensionOrThrow(mime)}`
}

export function buildDriverSimKey(driverId: string, mime: string): string {
  return `fleet/drivers/${driverId}/sim/${randomUUID()}.${extensionOrThrow(mime)}`
}

// Parsed rather than pattern-matched, so scheme detection matches what the browser will do with
// the string. Only http and https are allowed: the prototype stored whatever was typed and put it
// straight into an anchor, which made javascript: a working payload (spec §4.3).
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-files \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/fleet-files.ts apps/backend/src/modules/fleet-vehicles/fleet-files.spec.ts
git commit -m "feat(fleet): derive storage keys from the verified type, not the filename

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: DTO untuk berkas dan kontrak

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/dto/upload-intent.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/upload-intent.dto.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/confirm-upload.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/confirm-upload.dto.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/external-url.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/external-url.dto.spec.ts`

**Interfaces:**
- Consumes: `ALLOWED_MIME_TYPES`, `MAX_UPLOAD_BYTES` (Task 2); `isSafeExternalUrl` (Task 4).
- Produces: `UploadIntentDto { filename: string; mimeType: string; sizeBytes: number }`, `ConfirmUploadDto { storageKey: string; originalName: string; mimeType: string; sizeBytes: number }`, `ExternalUrlDto { url: string; label?: string | null }` — dipakai Task 6 dan 7.

- [ ] **Step 1: Tulis test DTO intent**

Create `apps/backend/src/modules/fleet-vehicles/dto/upload-intent.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UploadIntentDto } from './upload-intent.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(UploadIntentDto, {
    filename: 'stnk-b9114kyz.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 524288,
    ...overrides,
  })

describe('UploadIntentDto', () => {
  it('accepts a well-formed intent', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('refuses a mime type outside the allow-list', async () => {
    const errors = await validate(build({ mimeType: 'image/svg+xml' }))
    expect(errors.map((e) => e.property)).toContain('mimeType')
  })

  // 10 MB is the ceiling (spec §4.2). Refused here rather than after the browser has spent five
  // minutes uploading.
  it('refuses a file over the size limit', async () => {
    const errors = await validate(build({ sizeBytes: 10 * 1024 * 1024 + 1 }))
    expect(errors.map((e) => e.property)).toContain('sizeBytes')
  })

  it('refuses a zero-byte file', async () => {
    const errors = await validate(build({ sizeBytes: 0 }))
    expect(errors.map((e) => e.property)).toContain('sizeBytes')
  })

  it('demands a filename', async () => {
    const errors = await validate(build({ filename: '   ' }))
    expect(errors.map((e) => e.property)).toContain('filename')
  })
})
```

- [ ] **Step 2: Tulis test DTO confirm dan external-url**

Create `apps/backend/src/modules/fleet-vehicles/dto/confirm-upload.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ConfirmUploadDto } from './confirm-upload.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ConfirmUploadDto, {
    storageKey: 'fleet/11111111-1111-1111-1111-111111111111/stnk/abc.pdf',
    originalName: 'stnk-b9114kyz.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 524288,
    ...overrides,
  })

describe('ConfirmUploadDto', () => {
  it('accepts a well-formed confirmation', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('demands a storage key', async () => {
    const errors = await validate(build({ storageKey: '' }))
    expect(errors.map((e) => e.property)).toContain('storageKey')
  })

  it('holds the mime type to the same allow-list as the intent', async () => {
    const errors = await validate(build({ mimeType: 'text/html' }))
    expect(errors.map((e) => e.property)).toContain('mimeType')
  })
})
```

Create `apps/backend/src/modules/fleet-vehicles/dto/external-url.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ExternalUrlDto } from './external-url.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ExternalUrlDto, { url: 'https://arsip.example/stnk.pdf', ...overrides })

describe('ExternalUrlDto', () => {
  it('accepts an https link', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  it('accepts an http link', async () => {
    expect(await validate(build({ url: 'http://arsip.example/stnk.pdf' }))).toHaveLength(0)
  })

  // The prototype put f.url into an anchor with no scheme check, which made this a working XSS
  // payload (spec §4.3). It is refused at the DTO so it can never reach a row.
  it('refuses a javascript: URL', async () => {
    const errors = await validate(build({ url: 'javascript:alert(1)' }))
    expect(errors.map((e) => e.property)).toContain('url')
  })

  it('refuses a data: URL', async () => {
    const errors = await validate(build({ url: 'data:text/html,<script>alert(1)</script>' }))
    expect(errors.map((e) => e.property)).toContain('url')
  })

  it('refuses something that is not a URL', async () => {
    const errors = await validate(build({ url: 'arsip.example/stnk.pdf' }))
    expect(errors.map((e) => e.property)).toContain('url')
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "dto/(upload-intent|confirm-upload|external-url)" \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — ketiga modul belum ada.

- [ ] **Step 4: Tulis ketiga DTO**

Create `apps/backend/src/modules/fleet-vehicles/dto/upload-intent.dto.ts`:

```ts
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator'
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../storage/storage.constants'

// The declared size is what the presigned PUT is signed for, so an oversized file is refused by
// MinIO as well as here. Declaring it up front also means a 10 MB refusal costs one request
// rather than a full upload.
export class UploadIntentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string

  @IsIn(ALLOWED_MIME_TYPES as string[])
  mimeType: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes: number
}
```

Create `apps/backend/src/modules/fleet-vehicles/dto/confirm-upload.dto.ts`:

```ts
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator'
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../../storage/storage.constants'

// Shaped like the intent because the service compares the two against what MinIO actually holds:
// a confirm whose numbers disagree with the object is refused (spec §4.2 step 3).
export class ConfirmUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  storageKey: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originalName: string

  @IsIn(ALLOWED_MIME_TYPES as string[])
  mimeType: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes: number
}
```

Create `apps/backend/src/modules/fleet-vehicles/dto/external-url.dto.ts`:

```ts
import { registerDecorator, IsNotEmpty, IsString, MaxLength, ValidationOptions } from 'class-validator'
import { isSafeExternalUrl } from '../fleet-files'

// A custom decorator rather than @IsUrl: the check that matters here is the scheme, and it must
// be the same parse the storage helper performs. Two different notions of "safe URL" is how one
// of them ends up wrong.
function IsHttpUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHttpUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isSafeExternalUrl(value),
        defaultMessage: () => 'url must be an http or https link',
      },
    })
  }
}

export class ExternalUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  @IsHttpUrl()
  url: string
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "dto/(upload-intent|confirm-upload|external-url)" \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 13 test.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/dto
git commit -m "feat(fleet): refuse an unsupported type or scheme at the entry point

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: FleetVehicleFilesService dan controller

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.spec.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`

**Interfaces:**
- Consumes: `StorageService` (Task 2), `FleetVehicleFileEntity` (Task 3), `buildVehicleFileKey`/`isSafeExternalUrl` (Task 4), `UploadIntentDto`/`ConfirmUploadDto`/`ExternalUrlDto` (Task 5).
- Produces:
  - `FleetVehicleFileView { id, slotId, slotCode, slotLabel, originalName, mimeType, sizeBytes, externalUrl, uploadedAt }` di `fleet-vehicles.types.ts` — dipakai Task 8 dan 11.
  - `FleetVehicleFilesService` dengan `list(vehicleId)`, `createIntent(vehicleId, slotId, dto)`, `confirm(vehicleId, slotId, dto, userId)`, `setExternalUrl(vehicleId, slotId, dto, userId)`, `downloadUrl(vehicleId, fileId)`, `remove(vehicleId, fileId)`.

- [ ] **Step 1: Tulis test service**

Create `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'

type Repo = Record<string, jest.Mock>

const SLOT = { id: 'slot-1', category: 'jenis_berkas', code: 'stnk', label: 'STNK' }
const VEHICLE = { id: 'veh-1', nopol: 'B 9114 KYZ' }

function build(overrides: { file?: Repo; vehicle?: Repo; master?: Repo; storage?: Repo } = {}) {
  const fileRepo: Repo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (row) => ({ id: 'file-1', ...row })),
    delete: jest.fn(async () => ({ affected: 1 })),
    ...overrides.file,
  }
  const vehicleRepo: Repo = {
    findOne: jest.fn(async () => VEHICLE),
    ...overrides.vehicle,
  }
  const masterRepo: Repo = {
    findOne: jest.fn(async () => SLOT),
    ...overrides.master,
  }
  const storage: Repo = {
    createUploadUrl: jest.fn(async () => 'https://signed.example/put'),
    createDownloadUrl: jest.fn(async () => 'https://signed.example/get'),
    statObject: jest.fn(async () => ({ size: 524288, mime: 'application/pdf' })),
    deleteObject: jest.fn(async () => undefined),
    ...overrides.storage,
  }
  const service = new FleetVehicleFilesService(
    fileRepo as never,
    vehicleRepo as never,
    masterRepo as never,
    storage as never,
  )
  return { service, fileRepo, vehicleRepo, masterRepo, storage }
}

const INTENT = { filename: 'stnk.pdf', mimeType: 'application/pdf', sizeBytes: 524288 }
const CONFIRM = {
  storageKey: 'fleet/veh-1/stnk/abc.pdf',
  originalName: 'stnk.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 524288,
}

describe('createIntent', () => {
  it('returns a presigned PUT and the key the confirm must quote', async () => {
    const { service, storage } = build()
    const out = await service.createIntent('veh-1', 'slot-1', INTENT)

    expect(out.uploadUrl).toBe('https://signed.example/put')
    expect(out.storageKey).toMatch(/^fleet\/veh-1\/stnk\/[0-9a-f-]{36}\.pdf$/)
    expect(storage.createUploadUrl).toHaveBeenCalledWith(out.storageKey, 'application/pdf', 524288)
  })

  it('refuses a slot that is not a jenis_berkas row', async () => {
    const { service } = build({ master: { findOne: jest.fn(async () => null) } })
    await expect(service.createIntent('veh-1', 'slot-1', INTENT)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('refuses an unknown vehicle', async () => {
    const { service } = build({ vehicle: { findOne: jest.fn(async () => null) } })
    await expect(service.createIntent('veh-1', 'slot-1', INTENT)).rejects.toThrow(NotFoundException)
  })
})

describe('confirm', () => {
  it('writes the row once MinIO confirms the object is there', async () => {
    const { service, fileRepo } = build()
    await service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')

    expect(fileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 'veh-1',
        slotId: 'slot-1',
        storageKey: CONFIRM.storageKey,
        originalName: 'stnk.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '524288',
        externalUrl: null,
        uploadedBy: 'user-1',
      }),
    )
  })

  // Without this HEAD a client could confirm an upload it never performed, leaving a row that
  // points at nothing and a slot that claims to hold a file (spec §4.2 step 3).
  it('refuses a confirm for an object that is not in the bucket', async () => {
    const { service, fileRepo } = build({ storage: { statObject: jest.fn(async () => null) } })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).rejects.toThrow(
      BadRequestException,
    )
    expect(fileRepo.save).not.toHaveBeenCalled()
  })

  it('refuses a confirm whose size disagrees with the stored object', async () => {
    const { service, fileRepo } = build({
      storage: { statObject: jest.fn(async () => ({ size: 999, mime: 'application/pdf' })) },
    })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).rejects.toThrow(
      BadRequestException,
    )
    expect(fileRepo.save).not.toHaveBeenCalled()
  })

  it('refuses a confirm whose type disagrees with the stored object', async () => {
    const { service } = build({
      storage: { statObject: jest.fn(async () => ({ size: 524288, mime: 'text/html' })) },
    })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).rejects.toThrow(
      BadRequestException,
    )
  })

  // A key belonging to another vehicle would let one unit's confirm attach another unit's file.
  it('refuses a key that does not belong to this vehicle and slot', async () => {
    const { service } = build()
    await expect(
      service.confirm('veh-1', 'slot-1', { ...CONFIRM, storageKey: 'fleet/veh-2/stnk/x.pdf' }, 'u'),
    ).rejects.toThrow(BadRequestException)
  })

  it('replaces the row and drops the old object when a slot already holds a file', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service, fileRepo, storage } = build({
      file: { findOne: jest.fn(async () => existing) },
    })
    await service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')

    expect(fileRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }))
    expect(storage.deleteObject).toHaveBeenCalledWith('fleet/veh-1/stnk/old.pdf')
  })

  // An orphaned object costs storage; a row pointing at a deleted object costs the operator a
  // broken slot they cannot fix from the UI. The cheaper failure is the one we accept.
  it('keeps the new row when deleting the old object fails', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service, fileRepo } = build({
      file: { findOne: jest.fn(async () => existing) },
      storage: { deleteObject: jest.fn(async () => { throw new Error('minio down') }) },
    })
    await expect(service.confirm('veh-1', 'slot-1', CONFIRM, 'user-1')).resolves.toBeDefined()
    expect(fileRepo.save).toHaveBeenCalled()
  })
})

describe('setExternalUrl', () => {
  it('stores the link with no storage key', async () => {
    const { service, fileRepo } = build()
    await service.setExternalUrl('veh-1', 'slot-1', { url: 'https://arsip.example/a.pdf' }, 'user-1')

    expect(fileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        externalUrl: 'https://arsip.example/a.pdf',
        storageKey: null,
        sizeBytes: null,
      }),
    )
  })

  // Defence in depth: the DTO refuses this too, but the service is also reachable from tests and
  // future callers, and the check constraint cannot see a scheme.
  it('refuses a non-http scheme', async () => {
    const { service } = build()
    await expect(
      service.setExternalUrl('veh-1', 'slot-1', { url: 'javascript:alert(1)' }, 'user-1'),
    ).rejects.toThrow(BadRequestException)
  })

  it('drops the uploaded object when a slot switches to a link', async () => {
    const existing = { id: 'file-1', storageKey: 'fleet/veh-1/stnk/old.pdf', externalUrl: null }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => existing) } })
    await service.setExternalUrl('veh-1', 'slot-1', { url: 'https://a.example/b.pdf' }, 'user-1')
    expect(storage.deleteObject).toHaveBeenCalledWith('fleet/veh-1/stnk/old.pdf')
  })
})

describe('downloadUrl', () => {
  it('signs a GET named after the slot and the plate', async () => {
    const file = {
      id: 'file-1',
      vehicleId: 'veh-1',
      storageKey: 'fleet/veh-1/stnk/abc.pdf',
      originalName: 'stnk.pdf',
      externalUrl: null,
      slot: SLOT,
    }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    const out = await service.downloadUrl('veh-1', 'file-1')

    expect(out.url).toBe('https://signed.example/get')
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('fleet/veh-1/stnk/abc.pdf', 'stnk.pdf')
  })

  // An external link is already a URL; re-signing it is meaningless and calling S3 would fail.
  it('hands back an external link unchanged', async () => {
    const file = {
      id: 'file-1',
      vehicleId: 'veh-1',
      storageKey: null,
      externalUrl: 'https://arsip.example/a.pdf',
      slot: SLOT,
    }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    const out = await service.downloadUrl('veh-1', 'file-1')

    expect(out.url).toBe('https://arsip.example/a.pdf')
    expect(storage.createDownloadUrl).not.toHaveBeenCalled()
  })

  it('refuses a file id belonging to another vehicle', async () => {
    const { service } = build({ file: { findOne: jest.fn(async () => null) } })
    await expect(service.downloadUrl('veh-1', 'file-1')).rejects.toThrow(NotFoundException)
  })
})

describe('remove', () => {
  it('deletes the row and the object', async () => {
    const file = { id: 'file-1', vehicleId: 'veh-1', storageKey: 'k', externalUrl: null }
    const { service, fileRepo, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    await service.remove('veh-1', 'file-1')

    expect(fileRepo.delete).toHaveBeenCalledWith('file-1')
    expect(storage.deleteObject).toHaveBeenCalledWith('k')
  })

  it('deletes a link row without calling storage', async () => {
    const file = { id: 'file-1', vehicleId: 'veh-1', storageKey: null, externalUrl: 'https://a/b' }
    const { service, storage } = build({ file: { findOne: jest.fn(async () => file) } })
    await service.remove('veh-1', 'file-1')
    expect(storage.deleteObject).not.toHaveBeenCalled()
  })
})

describe('list', () => {
  it('reports the byte count as a number', async () => {
    const rows = [
      {
        id: 'file-1',
        slotId: 'slot-1',
        slot: SLOT,
        storageKey: 'k',
        originalName: 'stnk.pdf',
        mimeType: 'application/pdf',
        // bigint comes back from pg as a string; no consumer should have to decide how to parse it.
        sizeBytes: '524288',
        externalUrl: null,
        uploadedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]
    const { service } = build({ file: { find: jest.fn(async () => rows) } })
    const out = await service.list('veh-1')

    expect(out[0]).toMatchObject({
      id: 'file-1',
      slotCode: 'stnk',
      slotLabel: 'STNK',
      sizeBytes: 524288,
    })
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-vehicle-files.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `Cannot find module './fleet-vehicle-files.service'`

- [ ] **Step 3: Tambahkan FleetVehicleFileView ke types**

Tambahkan di `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`, setelah `FleetVehicleLeaseView`:

```ts
// sizeBytes is a number here even though the column is bigint and pg hands it back as a string —
// parsed once at this boundary, the same way cicilanPerBulan is.
export interface FleetVehicleFileView {
  id: string
  slotId: string
  slotCode: string
  slotLabel: string
  originalName: string | null
  mimeType: string | null
  sizeBytes: number | null
  externalUrl: string | null
  uploadedAt: string
}
```

- [ ] **Step 4: Tulis service**

Create `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.service.ts`:

```ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetVehicleFileEntity } from './entities/fleet-vehicle-file.entity'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { StorageService } from '../storage/storage.service'
import { buildVehicleFileKey, isSafeExternalUrl } from './fleet-files'
import { FleetVehicleFileView } from './fleet-vehicles.types'

export interface UploadIntentInput {
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface ConfirmUploadInput {
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
}

@Injectable()
export class FleetVehicleFilesService {
  private readonly logger = new Logger(FleetVehicleFilesService.name)

  constructor(
    @InjectRepository(FleetVehicleFileEntity)
    private readonly fileRepo: Repository<FleetVehicleFileEntity>,
    @InjectRepository(FleetVehicleEntity)
    private readonly vehicleRepo: Repository<FleetVehicleEntity>,
    @InjectRepository(FleetMasterDataEntity)
    private readonly masterRepo: Repository<FleetMasterDataEntity>,
    private readonly storage: StorageService,
  ) {}

  async list(vehicleId: string): Promise<FleetVehicleFileView[]> {
    const rows = await this.fileRepo.find({
      where: { vehicleId },
      relations: { slot: true },
      order: { uploadedAt: 'DESC' },
    })
    return rows.map((row) => this.toView(row))
  }

  // Step 1 of the three-step upload (spec §4.2). The key is built here, not by the browser: the
  // client chooses neither where the object lands nor what extension it gets.
  async createIntent(
    vehicleId: string,
    slotId: string,
    dto: UploadIntentInput,
  ): Promise<{ uploadUrl: string; storageKey: string }> {
    await this.assertVehicle(vehicleId)
    const slot = await this.assertSlot(slotId)

    const storageKey = buildVehicleFileKey(vehicleId, slot.code, dto.mimeType)
    const uploadUrl = await this.storage.createUploadUrl(storageKey, dto.mimeType, dto.sizeBytes)
    return { uploadUrl, storageKey }
  }

  // Step 3. The HEAD is the point of this method: without it a client could confirm an upload it
  // never performed and leave a row pointing at nothing. The client's own numbers are checked
  // against what the bucket actually holds rather than taken on trust.
  async confirm(
    vehicleId: string,
    slotId: string,
    dto: ConfirmUploadInput,
    userId: string | null,
  ): Promise<FleetVehicleFileView> {
    await this.assertVehicle(vehicleId)
    const slot = await this.assertSlot(slotId)

    // The key must be one this vehicle and slot could have been granted, or a confirm could
    // attach another unit's object to this slot.
    if (!dto.storageKey.startsWith(`fleet/${vehicleId}/${slot.code}/`)) {
      throw new BadRequestException('storageKey does not belong to this vehicle and slot')
    }

    const stat = await this.storage.statObject(dto.storageKey)
    if (!stat) throw new BadRequestException('No object was uploaded for that key')
    if (stat.size !== dto.sizeBytes) {
      throw new BadRequestException('Uploaded object size does not match the confirmation')
    }
    if (stat.mime !== dto.mimeType) {
      throw new BadRequestException('Uploaded object type does not match the confirmation')
    }

    const existing = await this.fileRepo.findOne({ where: { vehicleId, slotId } })
    const saved = await this.fileRepo.save({
      ...(existing ? { id: existing.id } : {}),
      vehicleId,
      slotId,
      storageKey: dto.storageKey,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      // bigint columns take a string; passing a number works today but rounds above 2^53.
      sizeBytes: String(dto.sizeBytes),
      externalUrl: null,
      uploadedBy: userId,
    })

    await this.dropObject(existing?.storageKey ?? null)
    return this.toView(await this.reload(saved.id))
  }

  async setExternalUrl(
    vehicleId: string,
    slotId: string,
    dto: { url: string },
    userId: string | null,
  ): Promise<FleetVehicleFileView> {
    await this.assertVehicle(vehicleId)
    await this.assertSlot(slotId)
    // Checked again here even though the DTO checks it: this method is also reachable from other
    // callers, and the CHECK constraint cannot see a scheme.
    if (!isSafeExternalUrl(dto.url)) {
      throw new BadRequestException('url must be an http or https link')
    }

    const existing = await this.fileRepo.findOne({ where: { vehicleId, slotId } })
    const saved = await this.fileRepo.save({
      ...(existing ? { id: existing.id } : {}),
      vehicleId,
      slotId,
      storageKey: null,
      originalName: null,
      mimeType: null,
      sizeBytes: null,
      externalUrl: dto.url,
      uploadedBy: userId,
    })

    await this.dropObject(existing?.storageKey ?? null)
    return this.toView(await this.reload(saved.id))
  }

  async downloadUrl(vehicleId: string, fileId: string): Promise<{ url: string }> {
    const file = await this.fileRepo.findOne({
      where: { id: fileId, vehicleId },
      relations: { slot: true },
    })
    if (!file) throw new NotFoundException('File not found')

    // Already a URL. Signing it would be meaningless and the S3 call would fail.
    if (file.externalUrl) return { url: file.externalUrl }
    if (!file.storageKey) throw new NotFoundException('File has no content')

    const filename = file.originalName ?? `${file.slot?.code ?? 'berkas'}`
    return { url: await this.storage.createDownloadUrl(file.storageKey, filename) }
  }

  async remove(vehicleId: string, fileId: string): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId, vehicleId } })
    if (!file) throw new NotFoundException('File not found')

    await this.fileRepo.delete(fileId)
    await this.dropObject(file.storageKey)
  }

  // Failing to delete the superseded object is logged, not thrown: an orphaned object costs
  // storage, while a failed request would leave the operator with a slot they cannot replace
  // (spec §4.2). The row already points at the new object by the time this runs.
  private async dropObject(key: string | null): Promise<void> {
    if (!key) return
    try {
      await this.storage.deleteObject(key)
    } catch (err: unknown) {
      this.logger.warn(`Failed to delete superseded object ${key}: ${String(err)}`)
    }
  }

  private async reload(id: string): Promise<FleetVehicleFileEntity> {
    const row = await this.fileRepo.findOne({ where: { id }, relations: { slot: true } })
    if (!row) throw new NotFoundException('File not found')
    return row
  }

  private async assertVehicle(vehicleId: string): Promise<void> {
    const found = await this.vehicleRepo.findOne({ where: { id: vehicleId } })
    if (!found) throw new NotFoundException('Vehicle not found')
  }

  // The FK proves the row exists; only this proves it is a jenis_berkas row, without which a file
  // could be filed under "Mitsubishi Fuso".
  private async assertSlot(slotId: string): Promise<FleetMasterDataEntity> {
    const slot = await this.masterRepo.findOne({
      where: { id: slotId, category: 'jenis_berkas' },
    })
    if (!slot) throw new BadRequestException('slotId must reference a jenis_berkas master row')
    return slot
  }

  private toView(row: FleetVehicleFileEntity): FleetVehicleFileView {
    return {
      id: row.id,
      slotId: row.slotId,
      slotCode: row.slot?.code ?? '',
      slotLabel: row.slot?.label ?? '',
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
      externalUrl: row.externalUrl,
      uploadedAt:
        row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : String(row.uploadedAt),
    }
  }
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-vehicle-files.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 18 test.

- [ ] **Step 6: Tulis controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'
import { UploadIntentDto } from './dto/upload-intent.dto'
import { ConfirmUploadDto } from './dto/confirm-upload.dto'
import { ExternalUrlDto } from './dto/external-url.dto'

// Files ride the vehicle's permissions (spec §7): whoever may edit a unit may attach its papers.
@ApiTags('Fleet Vehicle Files')
@Controller('fleet/vehicles/:id/files')
@UseGuards(JwtAuthGuard)
export class FleetVehicleFilesController {
  constructor(private readonly service: FleetVehicleFilesService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_VEHICLE)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.list(id)
  }

  @Post(':slotId/upload-intent')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  createIntent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: UploadIntentDto,
  ) {
    return this.service.createIntent(id, slotId, dto)
  }

  @Post(':slotId/confirm')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.confirm(id, slotId, dto, user?.id ?? null)
  }

  @Post(':slotId/external-url')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  setExternalUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: ExternalUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.setExternalUrl(id, slotId, dto, user?.id ?? null)
  }

  @Get(':fileId/download-url')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  downloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.service.downloadUrl(id, fileId)
  }

  @Delete(':fileId')
  @HttpCode(204)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.service.remove(id, fileId)
  }
}
```

- [ ] **Step 7: Tulis test controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-vehicle-files.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetVehicleFilesController } from './fleet-vehicle-files.controller'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'

describe('FleetVehicleFilesController', () => {
  let controller: FleetVehicleFilesController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      list: jest.fn(async () => []),
      createIntent: jest.fn(async () => ({ uploadUrl: 'u', storageKey: 'k' })),
      confirm: jest.fn(async () => ({ id: 'file-1' })),
      setExternalUrl: jest.fn(async () => ({ id: 'file-1' })),
      downloadUrl: jest.fn(async () => ({ url: 'u' })),
      remove: jest.fn(async () => undefined),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetVehicleFilesController],
      providers: [{ provide: FleetVehicleFilesService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetVehicleFilesController)
  })

  it('passes the intent through', async () => {
    await controller.createIntent('v1', 's1', {
      filename: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    })
    expect(service.createIntent).toHaveBeenCalledWith('v1', 's1', {
      filename: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    })
  })

  // The uploader is taken from the token, never from the body: a client that could name the
  // uploader could attribute its upload to someone else.
  it('stamps the confirm with the caller from the token', async () => {
    await controller.confirm('v1', 's1', { storageKey: 'k' } as never, { id: 'user-9' } as never)
    expect(service.confirm).toHaveBeenCalledWith('v1', 's1', { storageKey: 'k' }, 'user-9')
  })

  it('stamps an external link with the caller too', async () => {
    await controller.setExternalUrl(
      'v1',
      's1',
      { url: 'https://a/b' } as never,
      { id: 'user-9' } as never,
    )
    expect(service.setExternalUrl).toHaveBeenCalledWith('v1', 's1', { url: 'https://a/b' }, 'user-9')
  })

  it('signs a download', async () => {
    await controller.downloadUrl('v1', 'f1')
    expect(service.downloadUrl).toHaveBeenCalledWith('v1', 'f1')
  })

  it('removes a file', async () => {
    await controller.remove('v1', 'f1')
    expect(service.remove).toHaveBeenCalledWith('v1', 'f1')
  })

  // Permission metadata is invisible at runtime in unit tests and is the only thing between an
  // authenticated user and someone else's files — assert it explicitly.
  it.each([
    ['list', Permission.READ_FLEET_VEHICLE],
    ['createIntent', Permission.UPDATE_FLEET_VEHICLE],
    ['confirm', Permission.UPDATE_FLEET_VEHICLE],
    ['setExternalUrl', Permission.UPDATE_FLEET_VEHICLE],
    ['downloadUrl', Permission.READ_FLEET_VEHICLE],
    ['remove', Permission.UPDATE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const handler = (FleetVehicleFilesController.prototype as Record<string, unknown>)[method]
    expect(Reflect.getMetadata(PERMISSION_KEY, handler as object)).toEqual([permission])
  })
})
```

- [ ] **Step 8: Daftarkan di module**

Di `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`, tambahkan import dan daftarkan:

```ts
import { FleetVehicleFileEntity } from './entities/fleet-vehicle-file.entity'
import { FleetVehicleFilesService } from './fleet-vehicle-files.service'
import { FleetVehicleFilesController } from './fleet-vehicle-files.controller'
```

Tambahkan `FleetVehicleFileEntity,` ke array `TypeOrmModule.forFeature([...])`, `FleetVehicleFilesService,` ke `providers`, dan `FleetVehicleFilesController,` ke `controllers`. `StorageService` tidak perlu di-import — `StorageModule` global.

- [ ] **Step 9: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-vehicle-files \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 24 test (18 service + 6 controller).

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles
git commit -m "feat(fleet): verify the object exists before recording the upload

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Softcopy SIM sopir

**Files:**
- Create: `apps/backend/src/modules/fleet-drivers/fleet-driver-files.service.ts`
- Create: `apps/backend/src/modules/fleet-drivers/fleet-driver-files.service.spec.ts`
- Create: `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.ts`
- Create: `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.spec.ts`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-drivers.module.ts`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.ts`

**Interfaces:**
- Consumes: `StorageService` (Task 2), kolom `sim_*` di `FleetDriverEntity` (Task 3), `buildDriverSimKey` (Task 4), `UploadIntentDto`/`ConfirmUploadDto` (Task 5).
- Produces: `FleetDriverSimFileView { originalName: string | null; mimeType: string | null; sizeBytes: number | null }` — dipakai Task 16. Response sopir bertambah field `simFile: FleetDriverSimFileView | null`.

- [ ] **Step 1: Tulis test service**

Create `apps/backend/src/modules/fleet-drivers/fleet-driver-files.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { FleetDriverFilesService } from './fleet-driver-files.service'

type Repo = Record<string, jest.Mock>

const DRIVER = {
  id: 'drv-1',
  nama: 'Ahmad Fauzi',
  simStorageKey: null,
  simOriginalName: null,
  simMimeType: null,
  simSizeBytes: null,
}

function build(overrides: { driver?: Repo; storage?: Repo } = {}) {
  const driverRepo: Repo = {
    findOne: jest.fn(async () => ({ ...DRIVER })),
    update: jest.fn(async () => ({ affected: 1 })),
    ...overrides.driver,
  }
  const storage: Repo = {
    createUploadUrl: jest.fn(async () => 'https://signed.example/put'),
    createDownloadUrl: jest.fn(async () => 'https://signed.example/get'),
    statObject: jest.fn(async () => ({ size: 1024, mime: 'image/png' })),
    deleteObject: jest.fn(async () => undefined),
    ...overrides.storage,
  }
  return {
    service: new FleetDriverFilesService(driverRepo as never, storage as never),
    driverRepo,
    storage,
  }
}

const INTENT = { filename: 'sim.png', mimeType: 'image/png', sizeBytes: 1024 }
const CONFIRM = {
  storageKey: 'fleet/drivers/drv-1/sim/abc.png',
  originalName: 'sim.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
}

describe('FleetDriverFilesService', () => {
  it('signs a PUT under the driver prefix', async () => {
    const { service, storage } = build()
    const out = await service.createIntent('drv-1', INTENT)

    expect(out.storageKey).toMatch(/^fleet\/drivers\/drv-1\/sim\/[0-9a-f-]{36}\.png$/)
    expect(storage.createUploadUrl).toHaveBeenCalledWith(out.storageKey, 'image/png', 1024)
  })

  it('refuses an unknown driver', async () => {
    const { service } = build({ driver: { findOne: jest.fn(async () => null) } })
    await expect(service.createIntent('drv-1', INTENT)).rejects.toThrow(NotFoundException)
  })

  it('writes the columns once MinIO confirms the object', async () => {
    const { service, driverRepo } = build()
    await service.confirm('drv-1', CONFIRM)

    expect(driverRepo.update).toHaveBeenCalledWith('drv-1', {
      simStorageKey: CONFIRM.storageKey,
      simOriginalName: 'sim.png',
      simMimeType: 'image/png',
      simSizeBytes: '1024',
    })
  })

  // Same reasoning as the vehicle confirm: the client's claim that it uploaded is not evidence.
  it('refuses a confirm for an object that is not in the bucket', async () => {
    const { service, driverRepo } = build({ storage: { statObject: jest.fn(async () => null) } })
    await expect(service.confirm('drv-1', CONFIRM)).rejects.toThrow(BadRequestException)
    expect(driverRepo.update).not.toHaveBeenCalled()
  })

  it('refuses a confirm whose size disagrees with the object', async () => {
    const { service } = build({
      storage: { statObject: jest.fn(async () => ({ size: 5, mime: 'image/png' })) },
    })
    await expect(service.confirm('drv-1', CONFIRM)).rejects.toThrow(BadRequestException)
  })

  it('refuses a key belonging to another driver', async () => {
    const { service } = build()
    await expect(
      service.confirm('drv-1', { ...CONFIRM, storageKey: 'fleet/drivers/drv-2/sim/x.png' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('drops the superseded scan when a driver re-uploads', async () => {
    const { service, storage } = build({
      driver: {
        findOne: jest.fn(async () => ({ ...DRIVER, simStorageKey: 'fleet/drivers/drv-1/sim/old.png' })),
        update: jest.fn(async () => ({ affected: 1 })),
      },
    })
    await service.confirm('drv-1', CONFIRM)
    expect(storage.deleteObject).toHaveBeenCalledWith('fleet/drivers/drv-1/sim/old.png')
  })

  it('signs a download named after the driver', async () => {
    const { service, storage } = build({
      driver: {
        findOne: jest.fn(async () => ({
          ...DRIVER,
          simStorageKey: 'fleet/drivers/drv-1/sim/a.png',
          simOriginalName: 'sim.png',
        })),
      },
    })
    const out = await service.downloadUrl('drv-1')

    expect(out.url).toBe('https://signed.example/get')
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('fleet/drivers/drv-1/sim/a.png', 'sim.png')
  })

  it('refuses a download when the driver has no scan', async () => {
    const { service } = build()
    await expect(service.downloadUrl('drv-1')).rejects.toThrow(NotFoundException)
  })

  it('clears the columns and the object on remove', async () => {
    const { service, driverRepo, storage } = build({
      driver: {
        findOne: jest.fn(async () => ({ ...DRIVER, simStorageKey: 'k' })),
        update: jest.fn(async () => ({ affected: 1 })),
      },
    })
    await service.remove('drv-1')

    expect(driverRepo.update).toHaveBeenCalledWith('drv-1', {
      simStorageKey: null,
      simOriginalName: null,
      simMimeType: null,
      simSizeBytes: null,
    })
    expect(storage.deleteObject).toHaveBeenCalledWith('k')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-driver-files.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Tulis service**

Create `apps/backend/src/modules/fleet-drivers/fleet-driver-files.service.ts`:

```ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { StorageService } from '../storage/storage.service'
import { buildDriverSimKey } from '../fleet-vehicles/fleet-files'

export interface DriverUploadIntentInput {
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface DriverConfirmUploadInput {
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
}

// The same three-step flow as vehicle files, against four columns instead of a table: a driver
// has exactly one scan and no sign of gaining more (spec §4.5).
@Injectable()
export class FleetDriverFilesService {
  private readonly logger = new Logger(FleetDriverFilesService.name)

  constructor(
    @InjectRepository(FleetDriverEntity)
    private readonly driverRepo: Repository<FleetDriverEntity>,
    private readonly storage: StorageService,
  ) {}

  async createIntent(
    driverId: string,
    dto: DriverUploadIntentInput,
  ): Promise<{ uploadUrl: string; storageKey: string }> {
    await this.assertDriver(driverId)
    const storageKey = buildDriverSimKey(driverId, dto.mimeType)
    const uploadUrl = await this.storage.createUploadUrl(storageKey, dto.mimeType, dto.sizeBytes)
    return { uploadUrl, storageKey }
  }

  async confirm(driverId: string, dto: DriverConfirmUploadInput): Promise<void> {
    const driver = await this.assertDriver(driverId)

    if (!dto.storageKey.startsWith(`fleet/drivers/${driverId}/sim/`)) {
      throw new BadRequestException('storageKey does not belong to this driver')
    }

    const stat = await this.storage.statObject(dto.storageKey)
    if (!stat) throw new BadRequestException('No object was uploaded for that key')
    if (stat.size !== dto.sizeBytes) {
      throw new BadRequestException('Uploaded object size does not match the confirmation')
    }
    if (stat.mime !== dto.mimeType) {
      throw new BadRequestException('Uploaded object type does not match the confirmation')
    }

    await this.driverRepo.update(driverId, {
      simStorageKey: dto.storageKey,
      simOriginalName: dto.originalName,
      simMimeType: dto.mimeType,
      simSizeBytes: String(dto.sizeBytes),
    })
    await this.dropObject(driver.simStorageKey)
  }

  async downloadUrl(driverId: string): Promise<{ url: string }> {
    const driver = await this.assertDriver(driverId)
    if (!driver.simStorageKey) throw new NotFoundException('Driver has no licence scan')
    const filename = driver.simOriginalName ?? `sim-${driver.nama}`
    return { url: await this.storage.createDownloadUrl(driver.simStorageKey, filename) }
  }

  async remove(driverId: string): Promise<void> {
    const driver = await this.assertDriver(driverId)
    await this.driverRepo.update(driverId, {
      simStorageKey: null,
      simOriginalName: null,
      simMimeType: null,
      simSizeBytes: null,
    })
    await this.dropObject(driver.simStorageKey)
  }

  // Logged rather than thrown, for the reason the vehicle service gives: an orphaned object is
  // cheaper than a slot the operator cannot repair.
  private async dropObject(key: string | null): Promise<void> {
    if (!key) return
    try {
      await this.storage.deleteObject(key)
    } catch (err: unknown) {
      this.logger.warn(`Failed to delete superseded object ${key}: ${String(err)}`)
    }
  }

  private async assertDriver(driverId: string): Promise<FleetDriverEntity> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } })
    if (!driver) throw new NotFoundException('Driver not found')
    return driver
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-driver-files.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 10 test.

- [ ] **Step 5: Tulis controller**

Create `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetDriverFilesService } from './fleet-driver-files.service'
import { UploadIntentDto } from '../fleet-vehicles/dto/upload-intent.dto'
import { ConfirmUploadDto } from '../fleet-vehicles/dto/confirm-upload.dto'

// Drivers ride the vehicle permissions, the same way documents and contracts do (spec §7).
@ApiTags('Fleet Driver Files')
@Controller('fleet/drivers/:id/sim-file')
@UseGuards(JwtAuthGuard)
export class FleetDriverFilesController {
  constructor(private readonly service: FleetDriverFilesService) {}

  @Post('upload-intent')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  createIntent(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UploadIntentDto) {
    return this.service.createIntent(id, dto)
  }

  @Post('confirm')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmUploadDto) {
    return this.service.confirm(id, dto)
  }

  @Get('download-url')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  downloadUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.downloadUrl(id)
  }

  @Delete()
  @HttpCode(204)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
```

- [ ] **Step 6: Tulis test controller**

Create `apps/backend/src/modules/fleet-drivers/fleet-driver-files.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetDriverFilesController } from './fleet-driver-files.controller'
import { FleetDriverFilesService } from './fleet-driver-files.service'

describe('FleetDriverFilesController', () => {
  let controller: FleetDriverFilesController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      createIntent: jest.fn(async () => ({ uploadUrl: 'u', storageKey: 'k' })),
      confirm: jest.fn(async () => undefined),
      downloadUrl: jest.fn(async () => ({ url: 'u' })),
      remove: jest.fn(async () => undefined),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetDriverFilesController],
      providers: [{ provide: FleetDriverFilesService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetDriverFilesController)
  })

  it('passes the intent through', async () => {
    await controller.createIntent('d1', { filename: 'a.png' } as never)
    expect(service.createIntent).toHaveBeenCalledWith('d1', { filename: 'a.png' })
  })

  it('passes the confirm through', async () => {
    await controller.confirm('d1', { storageKey: 'k' } as never)
    expect(service.confirm).toHaveBeenCalledWith('d1', { storageKey: 'k' })
  })

  it('signs a download', async () => {
    await controller.downloadUrl('d1')
    expect(service.downloadUrl).toHaveBeenCalledWith('d1')
  })

  it('removes the scan', async () => {
    await controller.remove('d1')
    expect(service.remove).toHaveBeenCalledWith('d1')
  })

  it.each([
    ['createIntent', Permission.UPDATE_FLEET_VEHICLE],
    ['confirm', Permission.UPDATE_FLEET_VEHICLE],
    ['downloadUrl', Permission.READ_FLEET_VEHICLE],
    ['remove', Permission.UPDATE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const handler = (FleetDriverFilesController.prototype as Record<string, unknown>)[method]
    expect(Reflect.getMetadata(PERMISSION_KEY, handler as object)).toEqual([permission])
  })
})
```

- [ ] **Step 7: Laporkan simFile di response sopir**

Di `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.ts`, temukan method yang memetakan entity sopir ke view (cari `nama:` di dalam `map(` atau method `toView`). Tambahkan field ini ke objek yang dikembalikan:

```ts
      // Reported so the form can show "sim.png · 412 KB" instead of an upload button over a file
      // that is already there. The key itself is never sent: the browser reaches the object
      // through a presigned URL, never by path.
      simFile: e.simStorageKey
        ? {
            originalName: e.simOriginalName,
            mimeType: e.simMimeType,
            sizeBytes: e.simSizeBytes == null ? null : Number(e.simSizeBytes),
          }
        : null,
```

Jika file itu tidak punya method `toView` dan memetakan entity langsung, tambahkan pemetaan eksplisit yang sama di tempat entity dikembalikan, dan pastikan `simStorageKey` **tidak** ikut terkirim.

- [ ] **Step 8: Daftarkan di module**

Di `apps/backend/src/modules/fleet-drivers/fleet-drivers.module.ts`, tambahkan:

```ts
import { FleetDriverFilesService } from './fleet-driver-files.service'
import { FleetDriverFilesController } from './fleet-driver-files.controller'
```

Tambahkan `FleetDriverFilesService,` ke `providers` dan `FleetDriverFilesController,` ke `controllers`.

- [ ] **Step 9: Jalankan seluruh test sopir**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-driver \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — 10 test baru service, 5 test baru controller, dan seluruh test sopir yang sudah ada tetap hijau.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/fleet-drivers
git commit -m "feat(fleet): keep the licence scan with the driver who holds it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `berkasCount` di response daftar kendaraan

**Files:**
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts`

**Interfaces:**
- Consumes: `FleetVehicleFileEntity` (Task 3).
- Produces: `FleetVehicleView.berkasCount: { ada: number; wajib: number }` — dipakai Task 10, 11, 13.

- [ ] **Step 1: Tulis test**

Tambahkan blok ini ke `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts`. Ikuti gaya harness yang sudah dipakai file itu — `findAll`/`find` di-mock per repository; salin cara test terdekat membangun service dan tambahkan `fileRepo` sebagai repository keempat.

```ts
describe('berkasCount', () => {
  // "wajib" is how many jenis_berkas slots are active, not a constant: an admin who adds a fifth
  // slot must see 2/5, not 2/4. The prototype hardcoded four (BERKAS at line 331) and had no way
  // to add a fifth.
  it('counts filled slots against the number of active jenis_berkas rows', async () => {
    // Arrange: one vehicle, two files, three active jenis_berkas rows.
    // Expect: rows[0].berkasCount === { ada: 2, wajib: 3 }
  })

  it('reports zero filled when a vehicle has no files at all', async () => {
    // Expect: { ada: 0, wajib: 3 }
  })

  // A deactivated slot is retired policy; counting it would leave every unit permanently short.
  it('leaves a deactivated slot out of the required count', async () => {
    // Arrange: three jenis_berkas rows, one with isActive false.
    // Expect: wajib === 2
  })
})
```

Ganti komentar Arrange/Expect dengan mock dan assert konkret sesuai harness file tersebut — bentuk persisnya bergantung pada helper yang sudah ada di sana, yang harus dibaca lebih dulu.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-vehicles.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `berkasCount` undefined pada view.

- [ ] **Step 3: Tambahkan berkasCount ke tipe view**

Di `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`, ganti komentar "berkasCount is deliberately absent until Phase 3" dengan:

```ts
// ada / wajib rather than a ratio string, so the frontend can colour the chip on the comparison
// without parsing text back apart. wajib counts ACTIVE jenis_berkas rows: deactivating a slot
// retires the requirement rather than leaving every unit permanently short.
export interface FleetVehicleBerkasCount {
  ada: number
  wajib: number
}
```

dan tambahkan ke `FleetVehicleView`, setelah `minDaysLeft`:

```ts
  berkasCount: FleetVehicleBerkasCount
```

- [ ] **Step 4: Hitung di loadViews**

Di `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts`:

Tambahkan import:

```ts
import { FleetVehicleFileEntity } from './entities/fleet-vehicle-file.entity'
```

Tambahkan repository ke constructor, setelah `leaseRepo`:

```ts
    @InjectRepository(FleetVehicleFileEntity)
    private readonly fileRepo: Repository<FleetVehicleFileEntity>,
```

Di `loadViews`, setelah blok `leaseByVehicle`, tambahkan:

```ts
    // One grouped query for the page rather than one per row, the same shape the documents
    // load uses.
    const fileRows = (await this.fileRepo
      .createQueryBuilder('f')
      .select('f.vehicle_id', 'vehicleId')
      .addSelect('COUNT(*)', 'count')
      .where('f.vehicle_id IN (:...ids)', { ids })
      .groupBy('f.vehicle_id')
      .getRawMany()) as { vehicleId: string; count: string }[]
    const filesByVehicle = new Map(fileRows.map((r) => [r.vehicleId, Number(r.count)]))

    const wajibBerkas = await this.masterRepo.count({
      where: { category: 'jenis_berkas', isActive: true },
    })
```

Ubah pemanggilan `toView` di akhir `loadViews` menjadi:

```ts
      .map((e) =>
        this.toView(e, docsByVehicle.get(e.id) ?? [], today, leaseByVehicle.get(e.id) ?? null, {
          ada: filesByVehicle.get(e.id) ?? 0,
          wajib: wajibBerkas,
        }),
      )
```

Ubah signature `toView` dan objek yang dikembalikannya:

```ts
  private toView(
    e: FleetVehicleEntity,
    docs: FleetVehicleDocumentEntity[],
    today: string,
    lease: FleetLeaseContractEntity | null,
    berkasCount: FleetVehicleBerkasCount,
  ): FleetVehicleView {
```

dan tambahkan `berkasCount,` ke objek return, setelah `minDaysLeft`. Tambahkan `FleetVehicleBerkasCount` ke daftar import dari `./fleet-vehicles.types`.

- [ ] **Step 5: Daftarkan entity di module**

`FleetVehicleFileEntity` sudah ditambahkan ke `TypeOrmModule.forFeature` di Task 6 Step 8 — tidak ada perubahan module yang diperlukan di sini. Verifikasi saja bahwa entry-nya ada.

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-vehicles.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — tiga test baru lulus dan seluruh test yang sudah ada tetap hijau.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles
git commit -m "feat(fleet): report how many file slots each unit has filled

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `GET /fleet/summary` dan endpoint kontrak

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-summary.service.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-summary.service.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-contracts.service.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-contracts.service.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-contracts.controller.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-contracts.controller.spec.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`

**Interfaces:**
- Consumes: `FleetVehiclesService.findAll` (Phase 2), `computeLease` (`fleet-lease.ts`), `FleetLeaseContractEntity` (sudah ada).
- Produces:
  - `FleetSummary { totalUnit: number; dokumenKedaluwarsa: number; jatuhTempo30Hari: number; cicilanPerBulan: number; sisaKewajiban: number }` di `fleet-vehicles.types.ts` — dipakai Task 12.
  - `FleetSummaryService.summary(): Promise<FleetSummary>`, `FleetContractsService.list(vehicleId)`, `FleetContractsService.close(contractId)`.

- [ ] **Step 1: Tulis test summary**

Create `apps/backend/src/modules/fleet-vehicles/fleet-summary.service.spec.ts`:

```ts
import { FleetSummaryService } from './fleet-summary.service'

function vehicle(over: Record<string, unknown> = {}) {
  return {
    id: 'v',
    nopol: 'B 1 A',
    worstSeverity: 'ok',
    isActive: true,
    lease: null,
    ...over,
  }
}

function build(rows: unknown[]) {
  const vehicles = { findAll: jest.fn(async () => ({ rows, total: rows.length, page: 1, pageSize: 1000 })) }
  return { service: new FleetSummaryService(vehicles as never), vehicles }
}

describe('FleetSummaryService', () => {
  it('counts registered units and the two severity buckets', async () => {
    const { service } = build([
      vehicle({ worstSeverity: 'crit' }),
      vehicle({ worstSeverity: 'crit' }),
      vehicle({ worstSeverity: 'warn' }),
      vehicle({ worstSeverity: 'ok' }),
      vehicle({ worstSeverity: 'none' }),
    ])
    await expect(service.summary()).resolves.toMatchObject({
      totalUnit: 5,
      dokumenKedaluwarsa: 2,
      jatuhTempo30Hari: 1,
    })
  })

  it('totals the monthly instalment and the remaining obligation', async () => {
    const { service } = build([
      vehicle({ lease: { cicilanPerBulan: 8750000, sisaAngsuran: 18, sisaKewajiban: 157500000 } }),
      vehicle({ lease: { cicilanPerBulan: 5000000, sisaAngsuran: 4, sisaKewajiban: 20000000 } }),
    ])
    await expect(service.summary()).resolves.toMatchObject({
      cicilanPerBulan: 13750000,
      sisaKewajiban: 177500000,
    })
  })

  // A settled contract is history: counting it would report an obligation the company no longer
  // has. The prototype applied the same rule (a.aktif && a.sisa > 0 in renderTiles).
  it('leaves a fully paid contract out of both money totals', async () => {
    const { service } = build([
      vehicle({ lease: { cicilanPerBulan: 8750000, sisaAngsuran: 0, sisaKewajiban: 0 } }),
    ])
    await expect(service.summary()).resolves.toMatchObject({
      cicilanPerBulan: 0,
      sisaKewajiban: 0,
    })
  })

  it('reports zeroes for an empty register', async () => {
    const { service } = build([])
    await expect(service.summary()).resolves.toEqual({
      totalUnit: 0,
      dokumenKedaluwarsa: 0,
      jatuhTempo30Hari: 0,
      cicilanPerBulan: 0,
      sisaKewajiban: 0,
    })
  })

  // Archived units are out of the register (spec §8): a sold truck must not inflate the count or
  // the obligation. findAll's default already excludes them, which is why it is reused rather
  // than queried afresh.
  it('asks for active units only', async () => {
    const { service, vehicles } = build([])
    await service.summary()
    expect(vehicles.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: false }),
    )
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-summary \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Tulis summary service**

Tambahkan ke `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`:

```ts
// The five tiles above the register. Every figure is settled here rather than summed in the
// browser, for the reason every other figure in this module is: two operators must not disagree.
export interface FleetSummary {
  totalUnit: number
  dokumenKedaluwarsa: number
  jatuhTempo30Hari: number
  cicilanPerBulan: number
  sisaKewajiban: number
}
```

Create `apps/backend/src/modules/fleet-vehicles/fleet-summary.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetSummary } from './fleet-vehicles.types'

// Large enough to cover the whole register in one pass. This is a summary of every unit, not of a
// page, and the register is in the hundreds — a fleet that outgrows this wants a SQL aggregate,
// and the tests above pin the arithmetic so that swap stays honest.
const SUMMARY_PAGE_SIZE = 1000

@Injectable()
export class FleetSummaryService {
  constructor(private readonly vehicles: FleetVehiclesService) {}

  // Built from the same views the list renders, so a tile and the rows beneath it can never
  // disagree about a unit's severity — a second query with its own severity ladder is exactly how
  // that drift starts.
  async summary(): Promise<FleetSummary> {
    const { rows } = await this.vehicles.findAll({
      page: 1,
      pageSize: SUMMARY_PAGE_SIZE,
      includeArchived: false,
    })

    let dokumenKedaluwarsa = 0
    let jatuhTempo30Hari = 0
    let cicilanPerBulan = 0
    let sisaKewajiban = 0

    for (const row of rows) {
      if (row.worstSeverity === 'crit') dokumenKedaluwarsa += 1
      else if (row.worstSeverity === 'warn') jatuhTempo30Hari += 1

      // Only a contract with instalments still to run. A settled one is history and reporting it
      // would overstate what the company owes.
      if (row.lease && row.lease.sisaAngsuran > 0) {
        cicilanPerBulan += row.lease.cicilanPerBulan ?? 0
        sisaKewajiban += row.lease.sisaKewajiban
      }
    }

    return {
      totalUnit: rows.length,
      dokumenKedaluwarsa,
      jatuhTempo30Hari,
      cicilanPerBulan,
      sisaKewajiban,
    }
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-summary \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 5 test.

- [ ] **Step 5: Tulis test kontrak**

Create `apps/backend/src/modules/fleet-vehicles/fleet-contracts.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common'
import { FleetContractsService } from './fleet-contracts.service'

const OPEN = {
  id: 'c-1',
  vehicleId: 'v-1',
  leasing: { id: 'm-1', code: 'mtf', label: 'MTF' },
  nomorKontrak: 'MTF-2024-03-11872',
  cicilanPerBulan: '8750000.00',
  tenorBulan: 48,
  angsuranMulai: '2024-03-11',
  angsuranTerbayarOverride: null,
  closedAt: null,
}

function build(rows: unknown[] = [OPEN], one: unknown = OPEN) {
  const repo = {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async () => one),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  return { service: new FleetContractsService(repo as never), repo }
}

describe('list', () => {
  it('reports the open contract with its arithmetic settled', async () => {
    const { service } = build()
    const [row] = await service.list('v-1')

    expect(row).toMatchObject({
      id: 'c-1',
      leasing: { label: 'MTF' },
      // Parsed from the numeric string pg returns, so no consumer has to decide how.
      cicilanPerBulan: 8750000,
      tenorBulan: 48,
    })
    expect(typeof row.sisaKewajiban).toBe('number')
  })

  // Closed contracts are the whole reason this table exists rather than columns on the vehicle:
  // a refinanced unit keeps what it used to pay.
  it('reports closed contracts too, newest first', async () => {
    const closed = { ...OPEN, id: 'c-0', closedAt: '2024-02-28' }
    const { service } = build([OPEN, closed])
    const rows = await service.list('v-1')
    expect(rows.map((r) => r.id)).toEqual(['c-1', 'c-0'])
  })
})

describe('close', () => {
  it('stamps closedAt with today', async () => {
    const { service, repo } = build()
    await service.close('c-1')
    expect(repo.update).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ closedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    )
  })

  it('refuses an unknown contract', async () => {
    const { service } = build([], null)
    await expect(service.close('c-1')).rejects.toThrow(NotFoundException)
  })

  // Closing twice would move the date and rewrite when the obligation ended.
  it('refuses a contract that is already closed', async () => {
    const { service } = build([], { ...OPEN, closedAt: '2026-01-01' })
    await expect(service.close('c-1')).rejects.toThrow(ConflictException)
  })
})
```

- [ ] **Step 6: Tulis contracts service**

Create `apps/backend/src/modules/fleet-vehicles/fleet-contracts.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetLeaseContractEntity } from './entities/fleet-lease-contract.entity'
import { computeLease } from './fleet-lease'
import { todayISO } from './fleet-severity'
import { FleetVehicleLeaseView } from './fleet-vehicles.types'

// Reading and closing only. Contracts are OPENED through the vehicle form, so that the vehicle,
// its papers and its financing land in one transaction — a second way to open one would let a
// unit acquire two open contracts through two endpoints racing the partial unique index.
@Injectable()
export class FleetContractsService {
  constructor(
    @InjectRepository(FleetLeaseContractEntity)
    private readonly repo: Repository<FleetLeaseContractEntity>,
  ) {}

  // Open first, then closed newest-first: the current obligation is what the operator opened the
  // panel for, and the history sits beneath it.
  async list(vehicleId: string): Promise<FleetVehicleLeaseView[]> {
    const rows = await this.repo.find({
      where: { vehicleId },
      relations: { leasing: true },
      order: { closedAt: 'ASC', createdAt: 'DESC' },
    })
    return rows.map((row) => this.toView(row))
  }

  async close(id: string): Promise<FleetVehicleLeaseView> {
    const row = await this.repo.findOne({ where: { id }, relations: { leasing: true } })
    if (!row) throw new NotFoundException('Contract not found')
    // Closing an already-closed contract would move the date and rewrite when the obligation
    // actually ended.
    if (row.closedAt) throw new ConflictException('Contract is already closed')

    await this.repo.update(id, { closedAt: todayISO() })
    const reloaded = await this.repo.findOne({ where: { id }, relations: { leasing: true } })
    if (!reloaded) throw new NotFoundException('Contract not found')
    return this.toView(reloaded)
  }

  // Deliberately the same shape and the same arithmetic as the lease block on the vehicle view:
  // two ways to compute an instalment count is how the two screens start disagreeing.
  private toView(row: FleetLeaseContractEntity): FleetVehicleLeaseView {
    const cicilan = row.cicilanPerBulan == null ? null : Number(row.cicilanPerBulan)
    const totals = computeLease({
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
    })
    return {
      id: row.id,
      leasing: row.leasing
        ? { id: row.leasing.id, code: row.leasing.code, label: row.leasing.label }
        : null,
      nomorKontrak: row.nomorKontrak,
      cicilanPerBulan: cicilan,
      tenorBulan: row.tenorBulan,
      angsuranMulai: row.angsuranMulai,
      angsuranTerbayarOverride: row.angsuranTerbayarOverride,
      ...totals,
    }
  }
}
```

Catatan: `FleetVehicleLeaseView` tidak punya field `closedAt`. Tambahkan ke interface itu di `fleet-vehicles.types.ts`:

```ts
  // null on the unit's current financing. A dated one is history, which is what the panel beneath
  // the open contract lists.
  closedAt: string | null
```

dan sertakan `closedAt: row.closedAt,` di **kedua** pemetaan — `toLeaseView` di `fleet-vehicles.service.ts` dan `toView` di atas.

- [ ] **Step 7: Tulis contracts controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-contracts.controller.ts`:

```ts
import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetContractsService } from './fleet-contracts.service'

@ApiTags('Fleet Contracts')
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetContractsController {
  constructor(private readonly service: FleetContractsService) {}

  @Get('vehicles/:id/contracts')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.list(id)
  }

  // POST rather than DELETE: closing a contract records that an obligation ended, it does not
  // remove the contract.
  @Post('contracts/:id/close')
  @HttpCode(200)
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.close(id)
  }
}
```

- [ ] **Step 8: Tulis test controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-contracts.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetContractsController } from './fleet-contracts.controller'
import { FleetContractsService } from './fleet-contracts.service'

describe('FleetContractsController', () => {
  let controller: FleetContractsController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = { list: jest.fn(async () => []), close: jest.fn(async () => ({ id: 'c1' })) }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetContractsController],
      providers: [{ provide: FleetContractsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetContractsController)
  })

  it('lists a vehicle contracts', async () => {
    await controller.list('v1')
    expect(service.list).toHaveBeenCalledWith('v1')
  })

  it('closes a contract', async () => {
    await controller.close('c1')
    expect(service.close).toHaveBeenCalledWith('c1')
  })

  it.each([
    ['list', Permission.READ_FLEET_VEHICLE],
    ['close', Permission.UPDATE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const handler = (FleetContractsController.prototype as Record<string, unknown>)[method]
    expect(Reflect.getMetadata(PERMISSION_KEY, handler as object)).toEqual([permission])
  })
})
```

- [ ] **Step 9: Daftarkan di module**

Di `fleet-vehicles.module.ts` tambahkan `FleetSummaryService` dan `FleetContractsService` ke `providers`, dan `FleetContractsController` ke `controllers`. Endpoint `/fleet/summary` sendiri dipasang di Task 10 bersama `/fleet/export.csv`, karena keduanya hidup di controller yang sama.

- [ ] **Step 10: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "fleet-(summary|contracts)" \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 12 test.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles
git commit -m "feat(fleet): total the register and let a contract be closed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Ekspor CSV dan controller ringkasan

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-csv.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-csv.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-reports.controller.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-reports.controller.spec.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-summary.service.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`

**Interfaces:**
- Consumes: `FleetVehicleView` (Phase 2 + Task 8), `FleetSummaryService` (Task 9).
- Produces: `toCsv(rows: FleetVehicleView[]): string`; `FleetSummaryService.exportCsv(): Promise<string>`; route `GET /fleet/summary` dan `GET /fleet/export.csv`.

- [ ] **Step 1: Tulis test CSV**

Create `apps/backend/src/modules/fleet-vehicles/fleet-csv.spec.ts`:

```ts
import { toCsv } from './fleet-csv'
import { FleetVehicleView } from './fleet-vehicles.types'

function row(over: Partial<FleetVehicleView> = {}): FleetVehicleView {
  return {
    id: 'v-1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    tahun: 2021,
    kapasitas: '8 ton',
    noRangka: 'MHMFE74P5MK123456',
    noMesin: '4D34T-99887',
    noBpkb: 'N-04512233',
    pemilikUnit: null,
    odometer: 184320,
    catatan: null,
    jenisArmada: { id: 'a', code: 'cdd', label: 'Colt Diesel Double' },
    kepemilikan: { id: 'b', code: 'milik_esp', label: 'Milik ESP' },
    pool: { id: 'c', code: 'cakung', label: 'Pool Cakung' },
    status: { id: 'd', code: 'aktif', label: 'Aktif' },
    driver: {
      id: 'dr',
      nama: 'Ahmad Fauzi',
      simExpiresAt: '2027-03-14',
      simDaysLeft: 186,
      simSeverity: 'ok',
    },
    lease: null,
    documents: [],
    worstSeverity: 'ok',
    minDaysLeft: 186,
    berkasCount: { ada: 2, wajib: 4 },
    isActive: true,
    ...over,
  } as FleetVehicleView
}

describe('toCsv', () => {
  it('opens with a header row', () => {
    const [header] = toCsv([row()]).split('\r\n')
    expect(header).toContain('Nomor Polisi')
    expect(header).toContain('Sisa Kewajiban')
    expect(header).toContain('Status Dokumen')
  })

  // Excel on a Windows box reads a bare UTF-8 file as Latin-1 and turns every Indonesian name
  // with an accent into mojibake. The BOM is what makes it open correctly on a double click.
  it('starts with a UTF-8 BOM', () => {
    expect(toCsv([row()]).charCodeAt(0)).toBe(0xfeff)
  })

  it('separates rows with CRLF', () => {
    const csv = toCsv([row(), row({ id: 'v-2', nopol: 'B 9222 XYZ' })])
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('writes the plate, make and master labels', () => {
    const [, first] = toCsv([row()]).split('\r\n')
    expect(first).toContain('B 9114 KYZ')
    expect(first).toContain('Mitsubishi')
    expect(first).toContain('Pool Cakung')
    expect(first).toContain('Ahmad Fauzi')
  })

  // A comma inside a field would otherwise shift every column after it by one.
  it('quotes a field containing a comma, a quote or a newline', () => {
    const csv = toCsv([row({ catatan: 'Rusak, menunggu suku cadang' })])
    expect(csv).toContain('"Rusak, menunggu suku cadang"')

    const quoted = toCsv([row({ catatan: 'Ban 22" bekas' })])
    expect(quoted).toContain('"Ban 22"" bekas"')

    const multiline = toCsv([row({ catatan: 'baris satu\nbaris dua' })])
    expect(multiline).toContain('"baris satu\nbaris dua"')
  })

  it('writes the lease figures the backend settled', () => {
    const csv = toCsv([
      row({
        lease: {
          id: 'c',
          leasing: { id: 'l', code: 'mtf', label: 'MTF' },
          nomorKontrak: 'MTF-2024-03-11872',
          cicilanPerBulan: 8750000,
          tenorBulan: 48,
          angsuranMulai: '2024-03-11',
          angsuranTerbayarOverride: null,
          angsuranTerbayar: 30,
          sisaAngsuran: 18,
          sisaKewajiban: 157500000,
          closedAt: null,
        },
      }),
    ])
    expect(csv).toContain('8750000')
    expect(csv).toContain('157500000')
    expect(csv).toContain('MTF')
  })

  it('leaves the lease columns empty for a unit with no contract', () => {
    const csv = toCsv([row({ lease: null })])
    expect(csv).toContain(',,')
  })

  it('writes the file count as a ratio', () => {
    expect(toCsv([row({ berkasCount: { ada: 2, wajib: 4 } })])).toContain('2/4')
  })

  it('translates severity into words an operator reads', () => {
    expect(toCsv([row({ worstSeverity: 'crit' })])).toContain('Kedaluwarsa')
    expect(toCsv([row({ worstSeverity: 'warn' })])).toContain('Segera')
    expect(toCsv([row({ worstSeverity: 'ok' })])).toContain('Aman')
    expect(toCsv([row({ worstSeverity: 'none' })])).toContain('Belum lengkap')
  })

  // One column per document type, filled from whatever that unit actually holds: the type list
  // is master data and the export must follow it rather than a hardcoded set of twelve.
  it('gives every document type met in the data its own expiry column', () => {
    const csv = toCsv([
      row({
        documents: [
          {
            docTypeId: 'dt-1',
            code: 'kir',
            label: 'KIR',
            nomor: 'JKT-II/778812',
            issuedAt: '2026-03-02',
            expiresAt: '2026-09-02',
            daysLeft: -7,
            severity: 'crit',
          },
        ],
      }),
    ])
    const [header, first] = csv.split('\r\n')
    expect(header).toContain('KIR Berlaku Sampai')
    expect(first).toContain('2026-09-02')
  })

  it('returns a header-only file for an empty register', () => {
    const csv = toCsv([])
    expect(csv.split('\r\n')).toHaveLength(1)
    expect(csv).toContain('Nomor Polisi')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-csv \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `Cannot find module './fleet-csv'`

- [ ] **Step 3: Tulis fleet-csv.ts**

Create `apps/backend/src/modules/fleet-vehicles/fleet-csv.ts`:

```ts
import { FleetSeverity } from './fleet-vehicles.constants'
import { FleetVehicleView } from './fleet-vehicles.types'

const SEVERITY_LABEL: Record<FleetSeverity, string> = {
  crit: 'Kedaluwarsa',
  warn: 'Segera',
  ok: 'Aman',
  none: 'Belum lengkap',
}

// Header labels are Indonesian because this file is opened by operators, unlike everything else
// in the codebase.
const BASE_COLUMNS: [string, (v: FleetVehicleView) => unknown][] = [
  ['Nomor Polisi', (v) => v.nopol],
  ['Jenis Armada', (v) => v.jenisArmada?.label],
  ['Merk', (v) => v.merk],
  ['Tipe', (v) => v.tipe],
  ['Tahun', (v) => v.tahun],
  ['Kapasitas', (v) => v.kapasitas],
  ['No Rangka', (v) => v.noRangka],
  ['No Mesin', (v) => v.noMesin],
  ['No BPKB', (v) => v.noBpkb],
  ['Status Kepemilikan', (v) => v.kepemilikan?.label],
  ['Pemilik/Vendor', (v) => v.pemilikUnit],
  ['Leasing', (v) => v.lease?.leasing?.label],
  ['No Kontrak', (v) => v.lease?.nomorKontrak],
  ['Sopir', (v) => v.driver?.nama],
  ['SIM Berlaku', (v) => v.driver?.simExpiresAt],
  ['Pool', (v) => v.pool?.label],
  ['Status', (v) => v.status?.label],
  ['Odometer', (v) => v.odometer],
]

const TRAILING_COLUMNS: [string, (v: FleetVehicleView) => unknown][] = [
  ['Cicilan per Bulan', (v) => v.lease?.cicilanPerBulan],
  ['Tenor (bulan)', (v) => v.lease?.tenorBulan],
  ['Angsuran Terbayar', (v) => v.lease?.angsuranTerbayar],
  ['Sisa Angsuran', (v) => v.lease?.sisaAngsuran],
  ['Sisa Kewajiban', (v) => (v.lease && v.lease.sisaAngsuran > 0 ? v.lease.sisaKewajiban : null)],
  ['Berkas Tersimpan', (v) => `${v.berkasCount.ada}/${v.berkasCount.wajib}`],
  ['Dokumen Terdekat (hari)', (v) => v.minDaysLeft],
  ['Status Dokumen', (v) => SEVERITY_LABEL[v.worstSeverity]],
  ['Catatan', (v) => v.catatan],
]

// A field holding a comma, a quote or a newline is quoted and its quotes doubled — RFC 4180.
// Without this one comma in a note shifts every column after it by one, silently.
function escape(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// The document columns are derived from the data rather than fixed, because the type list is
// master data: an admin who adds "Izin Bongkar Muat" must see it in the export without a code
// change. The prototype hardcoded twelve date columns and could not.
function documentColumns(rows: FleetVehicleView[]): { code: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const row of rows) {
    for (const doc of row.documents) {
      if (!seen.has(doc.code)) seen.set(doc.code, doc.label)
    }
  }
  return [...seen.entries()].map(([code, label]) => ({ code, label }))
}

export function toCsv(rows: FleetVehicleView[]): string {
  const docCols = documentColumns(rows)

  const header = [
    ...BASE_COLUMNS.map(([label]) => label),
    ...docCols.map((c) => `${c.label} Berlaku Sampai`),
    ...TRAILING_COLUMNS.map(([label]) => label),
  ]

  const lines = [header.map(escape).join(',')]
  for (const row of rows) {
    const byCode = new Map(row.documents.map((d) => [d.code, d]))
    const line = [
      ...BASE_COLUMNS.map(([, read]) => read(row)),
      ...docCols.map((c) => byCode.get(c.code)?.expiresAt ?? null),
      ...TRAILING_COLUMNS.map(([, read]) => read(row)),
    ]
    lines.push(line.map(escape).join(','))
  }

  // BOM + CRLF so Excel opens the file as UTF-8 on a double click instead of mangling every
  // accented name into Latin-1.
  return `﻿${lines.join('\r\n')}`
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-csv \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 11 test.

- [ ] **Step 5: Tambahkan exportCsv ke summary service**

Di `apps/backend/src/modules/fleet-vehicles/fleet-summary.service.ts`, tambahkan import:

```ts
import { toCsv } from './fleet-csv'
```

dan method:

```ts
  // The same rows the register shows, so an export can never contain a unit the operator cannot
  // see on screen — archived units included (spec §8).
  async exportCsv(): Promise<string> {
    const { rows } = await this.vehicles.findAll({
      page: 1,
      pageSize: SUMMARY_PAGE_SIZE,
      includeArchived: false,
      sort: 'nopol',
    })
    return toCsv(rows)
  }
```

- [ ] **Step 6: Tulis reports controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-reports.controller.ts`:

```ts
import { Controller, Get, Res, StreamableFile, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetSummaryService } from './fleet-summary.service'
import { todayISO } from './fleet-severity'

// A controller of its own rather than two more routes on FleetVehiclesController: both of these
// live at /fleet, not /fleet/vehicles, and a GET 'summary' added under the vehicles controller
// would be shadowed by its own GET ':id' route.
@ApiTags('Fleet Reports')
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetReportsController {
  constructor(private readonly service: FleetSummaryService) {}

  @Get('summary')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  summary() {
    return this.service.summary()
  }

  @Get('export.csv')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  async exportCsv(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const csv = await this.service.exportCsv()
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="armada-${todayISO()}.csv"`,
    })
    return new StreamableFile(Buffer.from(csv, 'utf-8'))
  }
}
```

- [ ] **Step 7: Tulis test controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-reports.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetReportsController } from './fleet-reports.controller'
import { FleetSummaryService } from './fleet-summary.service'

describe('FleetReportsController', () => {
  let controller: FleetReportsController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      summary: jest.fn(async () => ({ totalUnit: 8 })),
      exportCsv: jest.fn(async () => '﻿Nomor Polisi\r\nB 1 A'),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetReportsController],
      providers: [{ provide: FleetSummaryService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetReportsController)
  })

  it('reports the summary', async () => {
    await expect(controller.summary()).resolves.toEqual({ totalUnit: 8 })
  })

  it('sends the CSV as a dated attachment', async () => {
    const set = jest.fn()
    const file = await controller.exportCsv({ set } as never)

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': expect.stringMatching(
          /attachment; filename="armada-\d{4}-\d{2}-\d{2}\.csv"/,
        ),
      }),
    )
    expect(file.getStream).toBeDefined()
  })

  it.each([
    ['summary', Permission.READ_FLEET_VEHICLE],
    ['exportCsv', Permission.READ_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const handler = (FleetReportsController.prototype as Record<string, unknown>)[method]
    expect(Reflect.getMetadata(PERMISSION_KEY, handler as object)).toEqual([permission])
  })
})
```

- [ ] **Step 8: Daftarkan controller**

Tambahkan `FleetReportsController,` ke array `controllers` di `fleet-vehicles.module.ts`.

- [ ] **Step 9: Jalankan seluruh test backend fleet**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — seluruh test fleet hijau, termasuk yang sudah ada dari Phase 1 dan 2.

- [ ] **Step 10: Jalankan suite backend penuh**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS. Kedua flag wajib — tanpa keduanya box kehabisan RAM dan suite mati tanpa satu test pun gagal.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles
git commit -m "feat(fleet): export the register as a CSV Excel opens correctly

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Frontend — tipe, util format, dan hooks berkas

**Files:**
- Modify: `apps/frontend/src/features/fleet/types.ts`
- Create: `apps/frontend/src/features/fleet/utils/format-rupiah.ts`
- Create: `apps/frontend/src/features/fleet/utils/format-rupiah.spec.ts`
- Create: `apps/frontend/src/features/fleet/utils/format-bytes.ts`
- Create: `apps/frontend/src/features/fleet/utils/format-bytes.spec.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.spec.tsx`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetSummary.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetSummary.spec.tsx`
- Modify: `apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts`

**Interfaces:**
- Consumes: endpoint dari Task 6, 9, 10.
- Produces:
  - Tipe `FleetVehicleFile`, `FleetBerkasCount`, `FleetSummary`, `FleetSimFile` di `types.ts`.
  - `formatRupiah(value: number | null): string`, `formatBytes(value: number | null): string`.
  - `useVehicleFiles(vehicleId?: string)`, `useUploadVehicleFile()`, `useSetExternalUrl()`, `useDeleteVehicleFile()`, `useFileDownloadUrl()`, `useFleetSummary()` — dipakai Task 12, 13, 14.

- [ ] **Step 1: Tulis test util**

Create `apps/frontend/src/features/fleet/utils/format-rupiah.spec.ts`:

```ts
import { formatRupiah } from './format-rupiah'

describe('formatRupiah', () => {
  it('groups thousands the Indonesian way', () => {
    // Non-breaking space is what Intl emits after the currency symbol; normalised so the
    // assertion does not depend on which space the runtime picked.
    expect(formatRupiah(8750000).replace(/ /g, ' ')).toBe('Rp 8.750.000')
  })

  it('drops the decimals operators never type', () => {
    expect(formatRupiah(1500.75)).not.toContain(',')
  })

  it('writes zero as a figure, not a dash', () => {
    expect(formatRupiah(0)).toContain('0')
  })

  // A missing figure and a zero figure mean different things: one is "nothing owed", the other
  // is "we do not know".
  it('writes an em dash for a missing figure', () => {
    expect(formatRupiah(null)).toBe('—')
  })
})
```

Create `apps/frontend/src/features/fleet/utils/format-bytes.spec.ts`:

```ts
import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('reports small files in KB', () => {
    expect(formatBytes(524288)).toBe('512 KB')
  })

  it('reports large files in MB with one decimal', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB')
  })

  it('reports a tiny file in bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('writes an em dash for a missing size', () => {
    expect(formatBytes(null)).toBe('—')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB format- \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — kedua modul belum ada.

- [ ] **Step 3: Tulis util**

Create `apps/frontend/src/features/fleet/utils/format-rupiah.ts`:

```ts
// Whole rupiah: instalments are typed and read as whole numbers, and two decimal places on eight
// figures is noise in a table of them. The stored value keeps its scale; only the display rounds.
const FORMATTER = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

// An em dash, not 'Rp 0': a unit with no contract owes nothing, which is not the same as a unit
// whose instalment is zero.
export function formatRupiah(value: number | null | undefined): string {
  if (value == null) return '—'
  return FORMATTER.format(value)
}
```

Create `apps/frontend/src/features/fleet/utils/format-bytes.ts`:

```ts
const KB = 1024
const MB = KB * 1024

// One unit per magnitude, so a card never shows "0,5 MB" next to "512 KB" for the same size. The
// prototype showed base64 length for images and real bytes for PDFs, which made two files of the
// same size read differently.
export function formatBytes(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= MB) return `${(value / MB).toLocaleString('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`
  if (value >= KB) return `${Math.round(value / KB)} KB`
  return `${value} B`
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB format- \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 8 test.

- [ ] **Step 5: Tambahkan tipe**

Tambahkan ke `apps/frontend/src/features/fleet/types.ts`:

```ts
// ada / wajib rather than a ratio string, so the chip can colour on the comparison without
// parsing text apart.
export interface FleetBerkasCount {
  ada: number
  wajib: number
}

export interface FleetVehicleFile {
  id: string
  slotId: string
  slotCode: string
  slotLabel: string
  originalName: string | null
  mimeType: string | null
  sizeBytes: number | null
  // Set when the slot holds a link to an archive elsewhere instead of an uploaded file. Exactly
  // one of this and an uploaded object is ever present.
  externalUrl: string | null
  uploadedAt: string
}

export interface FleetSummary {
  totalUnit: number
  dokumenKedaluwarsa: number
  jatuhTempo30Hari: number
  cicilanPerBulan: number
  sisaKewajiban: number
}

// The storage key is deliberately absent: the browser reaches an object through a presigned URL,
// never by path.
export interface FleetSimFile {
  originalName: string | null
  mimeType: string | null
  sizeBytes: number | null
}
```

Tambahkan ke interface `FleetVehicle`, setelah `minDaysLeft`:

```ts
  berkasCount: FleetBerkasCount
```

Tambahkan ke interface `FleetDriver`, setelah `simExpiresAt`:

```ts
  simFile: FleetSimFile | null
```

Tambahkan ke interface `FleetVehicleLease`, setelah `angsuranTerbayarOverride`:

```ts
  // null on the unit's current financing; a date means the contract is history.
  closedAt: string | null
```

- [ ] **Step 6: Default berkasCount di normalizer kendaraan**

Di `apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts`, dalam `normalizeVehicle`, tambahkan setelah `minDaysLeft`:

```ts
    // Defaulted rather than required, following the wire-type convention this file already
    // documents: a backend that predates Phase 3 must still render, and 0/0 renders as a neutral
    // chip rather than a false claim that files are missing.
    berkasCount: row.berkasCount ?? { ada: 0, wajib: 0 },
```

Tambahkan `FleetBerkasCount` ke daftar import dari `../types`.

- [ ] **Step 7: Tulis test hook berkas**

Create `apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.spec.tsx`. Salin harness `QueryClientProvider` dan mock `apiClient` dari `useFleetVehicles.spec.tsx` yang sudah ada di folder yang sama — bacalah file itu dulu dan ikuti bentuknya persis.

```tsx
describe('useVehicleFiles', () => {
  it('reads a vehicle files', async () => {
    // apiClient.get resolves [{ id: 'f1', slotId: 's1', slotCode: 'stnk', slotLabel: 'STNK',
    //   originalName: 'stnk.pdf', mimeType: 'application/pdf', sizeBytes: 524288,
    //   externalUrl: null, uploadedAt: '2026-09-01T00:00:00Z' }]
    // Expect: apiClient.get called with '/fleet/vehicles/v1/files'; data[0].slotCode === 'stnk'
  })

  it('does not fire without a vehicle id', () => {
    // Expect: apiClient.get not called when the hook is rendered with undefined
  })

  it('defaults a field the backend did not send', async () => {
    // apiClient.get resolves [{ id: 'f1', slotId: 's1' }]
    // Expect: data[0].sizeBytes === null, data[0].slotLabel === ''
  })
})

describe('useUploadVehicleFile', () => {
  // The order is the contract: a confirm sent before the PUT completes records a file that is not
  // in the bucket, which is exactly what the backend HEAD refuses.
  it('runs intent, then PUT, then confirm, in that order', async () => {
    // apiClient.post resolves { uploadUrl: 'https://signed/put', storageKey: 'k' } for the intent
    // global.fetch is mocked to resolve { ok: true }
    // Act: mutateAsync({ vehicleId: 'v1', slotId: 's1', file })
    // Expect the call order: POST .../upload-intent, fetch PUT to 'https://signed/put',
    //   POST .../confirm with { storageKey: 'k', originalName, mimeType, sizeBytes }
  })

  it('sends the PUT with the file body and its content type', async () => {
    // Expect: fetch called with method 'PUT', body === file, headers['Content-Type'] === file.type
  })

  // A failed PUT must not be confirmed: confirming would claim an upload that did not happen.
  it('does not confirm when the PUT fails', async () => {
    // global.fetch resolves { ok: false, status: 403 }
    // Expect: mutateAsync rejects and no POST to .../confirm was made
  })

  it('invalidates the vehicle queries on success', async () => {
    // Expect: queryClient.invalidateQueries called with a key starting ['fleet', 'vehicles']
  })
})

describe('useDeleteVehicleFile', () => {
  it('deletes by file id and invalidates', async () => {
    // Expect: apiClient.delete called with '/fleet/vehicles/v1/files/f1'
  })
})

describe('useSetExternalUrl', () => {
  it('posts the link to the slot', async () => {
    // Expect: apiClient.post called with '/fleet/vehicles/v1/files/s1/external-url',
    //   { url: 'https://arsip.example/a.pdf' }
  })
})
```

Ganti setiap komentar dengan kode nyata mengikuti harness `useFleetVehicles.spec.tsx`.

- [ ] **Step 8: Tulis hook berkas**

Create `apps/frontend/src/features/fleet/hooks/useFleetVehicleFiles.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetVehicleFile } from '../types'

// Looser than the domain type, the same convention useFleetVehicles documents: frontend and
// backend deploy in parallel.
interface FleetVehicleFileWire extends Partial<FleetVehicleFile> {
  id: string
  slotId: string
}

const VEHICLES_KEY = ['fleet', 'vehicles']

function normalizeFile(row: FleetVehicleFileWire): FleetVehicleFile {
  return {
    id: row.id,
    slotId: row.slotId,
    slotCode: row.slotCode ?? '',
    slotLabel: row.slotLabel ?? '',
    originalName: row.originalName ?? null,
    mimeType: row.mimeType ?? null,
    sizeBytes: row.sizeBytes ?? null,
    externalUrl: row.externalUrl ?? null,
    uploadedAt: row.uploadedAt ?? '',
  }
}

export function useVehicleFiles(vehicleId?: string) {
  return useQuery<FleetVehicleFileWire[], Error, FleetVehicleFile[]>({
    queryKey: [...VEHICLES_KEY, 'files', vehicleId],
    queryFn: () => apiClient.get(`/fleet/vehicles/${vehicleId}/files`).then((r) => r.data),
    select: (rows) => (rows ?? []).map(normalizeFile),
    // The panel mounts before a unit is chosen.
    enabled: Boolean(vehicleId),
  })
}

// The three steps of spec §4.2, kept in one mutation so a caller cannot perform them out of
// order. The PUT goes straight to MinIO with fetch rather than apiClient: apiClient attaches our
// Authorization header, and an unexpected header is not part of the presigned signature, so MinIO
// would reject the upload.
export function useUploadVehicleFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      vehicleId,
      slotId,
      file,
    }: {
      vehicleId: string
      slotId: string
      file: File
    }) => {
      const intent = await apiClient
        .post(`/fleet/vehicles/${vehicleId}/files/${slotId}/upload-intent`, {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
        .then((r) => r.data as { uploadUrl: string; storageKey: string })

      const put = await fetch(intent.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      // Confirming after a failed PUT would record a file that is not in the bucket. The backend
      // HEAD refuses it anyway; stopping here gives the operator the real error instead.
      if (!put.ok) throw new Error(`Gagal mengunggah berkas (${put.status})`)

      return apiClient
        .post(`/fleet/vehicles/${vehicleId}/files/${slotId}/confirm`, {
          storageKey: intent.storageKey,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
        .then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useSetExternalUrl() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vehicleId, slotId, url }: { vehicleId: string; slotId: string; url: string }) =>
      apiClient
        .post(`/fleet/vehicles/${vehicleId}/files/${slotId}/external-url`, { url })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useDeleteVehicleFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ vehicleId, fileId }: { vehicleId: string; fileId: string }) =>
      apiClient.delete(`/fleet/vehicles/${vehicleId}/files/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

// Fetched on demand rather than cached with the row: a presigned GET expires in two minutes, and
// a cached one would be dead by the time an operator clicked it.
export function useFileDownloadUrl() {
  return useMutation({
    mutationFn: ({ vehicleId, fileId }: { vehicleId: string; fileId: string }) =>
      apiClient
        .get(`/fleet/vehicles/${vehicleId}/files/${fileId}/download-url`)
        .then((r) => (r.data as { url: string }).url),
  })
}
```

- [ ] **Step 9: Tulis hook summary**

Create `apps/frontend/src/features/fleet/hooks/useFleetSummary.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetSummary } from '../types'

export function useFleetSummary() {
  return useQuery<Partial<FleetSummary>, Error, FleetSummary>({
    queryKey: ['fleet', 'summary'],
    queryFn: () => apiClient.get('/fleet/summary').then((r) => r.data),
    // Zeroed rather than left undefined, so a tile renders a figure instead of "NaN" against a
    // backend that has not shipped this endpoint yet.
    select: (d) => ({
      totalUnit: d.totalUnit ?? 0,
      dokumenKedaluwarsa: d.dokumenKedaluwarsa ?? 0,
      jatuhTempo30Hari: d.jatuhTempo30Hari ?? 0,
      cicilanPerBulan: d.cicilanPerBulan ?? 0,
      sisaKewajiban: d.sisaKewajiban ?? 0,
    }),
    staleTime: 30 * 1000,
  })
}
```

Create `apps/frontend/src/features/fleet/hooks/useFleetSummary.spec.tsx` mengikuti harness yang sama:

```tsx
describe('useFleetSummary', () => {
  it('reads the summary', async () => {
    // apiClient.get resolves { totalUnit: 8, dokumenKedaluwarsa: 2, jatuhTempo30Hari: 1,
    //   cicilanPerBulan: 13750000, sisaKewajiban: 177500000 }
    // Expect: apiClient.get called with '/fleet/summary'; data.totalUnit === 8
  })

  it('zeroes a figure the backend did not send', async () => {
    // apiClient.get resolves {}
    // Expect: data === { totalUnit: 0, dokumenKedaluwarsa: 0, jatuhTempo30Hari: 0,
    //   cicilanPerBulan: 0, sisaKewajiban: 0 }
  })
})
```

- [ ] **Step 10: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "useFleetVehicleFiles|useFleetSummary|format-" \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — seluruh test util dan hook baru hijau.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/features/fleet
git commit -m "feat(fleet): drive uploads through intent, PUT and confirm

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Kartu ringkasan dan tombol Ekspor CSV

**Files:**
- Create: `apps/frontend/src/features/fleet/components/FleetSummaryCards.tsx`
- Create: `apps/frontend/src/features/fleet/components/FleetSummaryCards.spec.tsx`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetExport.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetExport.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`

**Interfaces:**
- Consumes: `useFleetSummary` (Task 11), `formatRupiah` (Task 11), `GET /fleet/export.csv` (Task 10).
- Produces: `<FleetSummaryCards />`, `useFleetExport()` dengan `download()`.

- [ ] **Step 1: Tulis test kartu**

Create `apps/frontend/src/features/fleet/components/FleetSummaryCards.spec.tsx`. Ikuti harness render komponen yang sudah dipakai `SeverityBadge.spec.tsx` di folder yang sama.

```tsx
import { render, screen } from '@testing-library/react'
import { FleetSummaryCards } from './FleetSummaryCards'

const SUMMARY = {
  totalUnit: 8,
  dokumenKedaluwarsa: 2,
  jatuhTempo30Hari: 1,
  cicilanPerBulan: 13750000,
  sisaKewajiban: 177500000,
}

describe('FleetSummaryCards', () => {
  it('shows the five figures the prototype showed', () => {
    render(<FleetSummaryCards summary={SUMMARY} isLoading={false} />)

    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText(/kendaraan terdaftar/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/dokumen kedaluwarsa/i)).toBeInTheDocument()
    expect(screen.getByText(/jatuh tempo/i)).toBeInTheDocument()
    expect(screen.getByText(/13\.750\.000/)).toBeInTheDocument()
    expect(screen.getByText(/177\.500\.000/)).toBeInTheDocument()
  })

  // A figure of zero is a real answer; a skeleton is what "we do not know yet" looks like.
  it('shows a skeleton rather than zeroes while loading', () => {
    render(<FleetSummaryCards summary={undefined} isLoading />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByTestId('summary-skeleton')).toBeInTheDocument()
  })

  it('renders nothing when the summary could not be read', () => {
    const { container } = render(<FleetSummaryCards summary={undefined} isLoading={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB FleetSummaryCards \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Tulis komponen**

Create `apps/frontend/src/features/fleet/components/FleetSummaryCards.tsx`:

```tsx
'use client'

import { FleetSummary } from '../types'
import { formatRupiah } from '../utils/format-rupiah'

interface Props {
  summary: FleetSummary | undefined
  isLoading: boolean
}

// The prototype's five tiles, in its order and with its wording, so the operator meets the same
// figures they signed off on.
export function FleetSummaryCards({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div
        data-testid="summary-skeleton"
        className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    )
  }

  // Nothing rather than zeroes: a tile reading "0 dokumen kedaluwarsa" during an outage is an
  // affirmative claim that the papers are in order, and an operator who believes it stops
  // checking.
  if (!summary) return null

  const tiles = [
    { value: String(summary.totalUnit), caption: 'kendaraan terdaftar', tone: '' },
    {
      value: String(summary.dokumenKedaluwarsa),
      caption: 'dokumen kedaluwarsa',
      tone: 'border-destructive/40 bg-destructive/5 text-destructive',
    },
    {
      value: String(summary.jatuhTempo30Hari),
      caption: 'jatuh tempo ≤ 30 hari',
      tone: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400',
    },
    { value: formatRupiah(summary.cicilanPerBulan), caption: 'cicilan & sewa per bulan', tone: '' },
    { value: formatRupiah(summary.sisaKewajiban), caption: 'sisa kewajiban leasing', tone: '' },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.caption} className={`rounded-lg border bg-card p-4 ${tile.tone}`}>
          <div className="text-2xl font-semibold tabular-nums">{tile.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{tile.caption}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB FleetSummaryCards \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 3 test.

- [ ] **Step 5: Tulis hook ekspor**

Create `apps/frontend/src/features/fleet/hooks/useFleetExport.ts`:

```ts
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

// Fetched through apiClient rather than opened as a plain link: the route is behind the bearer
// token, and a window.open would arrive unauthenticated and download a 401 page as a .csv.
export function useFleetExport() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.get('/fleet/export.csv', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `armada-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      // Revoked immediately: the click has already handed the blob to the browser, and leaving
      // the URL alive pins the whole file in memory for the life of the document.
      URL.revokeObjectURL(url)
    },
  })
}
```

Create `apps/frontend/src/features/fleet/hooks/useFleetExport.spec.tsx` mengikuti harness hook yang sama:

```tsx
describe('useFleetExport', () => {
  it('asks for the CSV as a blob', async () => {
    // Expect: apiClient.get called with '/fleet/export.csv', { responseType: 'blob' }
  })

  it('clicks a dated download link', async () => {
    // Spy on HTMLAnchorElement.prototype.click
    // Expect: click called once, and the anchor download attribute matches /^armada-\d{4}-\d{2}-\d{2}\.csv$/
  })

  // Leaving the object URL alive pins the file in memory for the life of the document.
  it('revokes the object URL', async () => {
    // Spy on URL.revokeObjectURL
    // Expect: called once
  })
})
```

Catatan: `URL.createObjectURL` tidak ada di jsdom — stub di `beforeEach` dengan `URL.createObjectURL = jest.fn(() => 'blob:x')` dan `URL.revokeObjectURL = jest.fn()`.

- [ ] **Step 6: Pasang kartu dan tombol di halaman**

Di `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`:

Tambahkan import:

```ts
import { FleetSummaryCards } from '@/features/fleet/components/FleetSummaryCards'
import { useFleetSummary } from '@/features/fleet/hooks/useFleetSummary'
import { useFleetExport } from '@/features/fleet/hooks/useFleetExport'
```

Tambahkan di dalam komponen, bersama hook lain:

```ts
  const { data: summary, isLoading: summaryLoading } = useFleetSummary()
  const exportCsv = useFleetExport()

  const handleExport = async () => {
    setActionError(null)
    try {
      await exportCsv.mutateAsync()
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Gagal mengunduh CSV.'))
    }
  }
```

Ganti prop `action` pada `<PageHeader>` menjadi:

```tsx
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={exportCsv.isPending}>
              {exportCsv.isPending ? 'Menyiapkan…' : 'Ekspor CSV'}
            </Button>
            {canCreate && <Button onClick={() => setModal({ type: 'create' })}>+ Tambah armada</Button>}
          </div>
        }
```

Sisipkan kartu tepat setelah blok `actionError` dan sebelum blok `!canReadMaster`:

```tsx
      <FleetSummaryCards summary={summary} isLoading={summaryLoading} />
```

- [ ] **Step 7: Jalankan test halaman**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "fleet/vehicles|FleetSummaryCards|useFleetExport" \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — test baru hijau dan `page.spec.tsx` yang sudah ada tetap lulus. Jika `page.spec.tsx` gagal karena hook baru tidak ter-mock, tambahkan mock `useFleetSummary` dan `useFleetExport` mengikuti cara file itu sudah me-mock `useFleetVehicles`.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/fleet "apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx"
git commit -m "feat(fleet): head the register with its five figures and a CSV button

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Tab bar dan tab Softcopy Berkas

**Files:**
- Create: `apps/frontend/src/features/fleet/components/VehiclesTabs.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehiclesTabs.spec.tsx`
- Create: `apps/frontend/src/features/fleet/components/BerkasSlotCard.tsx`
- Create: `apps/frontend/src/features/fleet/components/BerkasSlotCard.spec.tsx`
- Create: `apps/frontend/src/features/fleet/components/BerkasTab.tsx`
- Create: `apps/frontend/src/features/fleet/components/BerkasTab.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`

**Interfaces:**
- Consumes: `useFleetVehicles` (Phase 2), `useVehicleFiles`, `useFileDownloadUrl`, `useDeleteVehicleFile` (Task 11), `formatBytes` (Task 11).
- Produces: `<VehiclesTabs value onChange />` dengan nilai `'armada' | 'berkas' | 'angsuran'`; `<BerkasTab />`; `<BerkasSlotCard />`.

- [ ] **Step 1: Tulis test tab bar**

Create `apps/frontend/src/features/fleet/components/VehiclesTabs.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VehiclesTabs } from './VehiclesTabs'

describe('VehiclesTabs', () => {
  it('shows the prototype three tabs', () => {
    render(<VehiclesTabs value="armada" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /armada & dokumen/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /softcopy berkas/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /kepemilikan & angsuran/i })).toBeInTheDocument()
  })

  it('marks the active tab for assistive technology', () => {
    render(<VehiclesTabs value="berkas" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /softcopy berkas/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /armada & dokumen/i })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('reports the tab the operator picked', async () => {
    const onChange = jest.fn()
    render(<VehiclesTabs value="armada" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: /kepemilikan & angsuran/i }))
    expect(onChange).toHaveBeenCalledWith('angsuran')
  })
})
```

- [ ] **Step 2: Tulis tab bar**

Create `apps/frontend/src/features/fleet/components/VehiclesTabs.tsx`:

```tsx
'use client'

export type VehiclesTab = 'armada' | 'berkas' | 'angsuran'

const TABS: { value: VehiclesTab; label: string }[] = [
  { value: 'armada', label: 'Armada & dokumen' },
  { value: 'berkas', label: 'Softcopy berkas' },
  { value: 'angsuran', label: 'Kepemilikan & angsuran' },
]

interface Props {
  value: VehiclesTab
  onChange: (tab: VehiclesTab) => void
}

// Tabs inside the vehicles page, not entries in the fleet sub-nav: in the prototype these are
// three views of the same register, and the spec keeps them that way (§6.3).
export function VehiclesTabs({ value, onChange }: Props) {
  return (
    <nav role="tablist" aria-label="Tampilan" className="mb-4 flex gap-1 border-b">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
            value === tab.value
              ? 'border-primary font-medium text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Tulis test slot card**

Create `apps/frontend/src/features/fleet/components/BerkasSlotCard.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BerkasSlotCard } from './BerkasSlotCard'

const SLOT = { id: 's1', code: 'stnk', label: 'STNK' }

const FILE = {
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

const noop = () => {}

describe('BerkasSlotCard', () => {
  it('names the slot and says when it is empty', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={null} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByText('STNK')).toBeInTheDocument()
    expect(screen.getByText(/belum ada berkas/i)).toBeInTheDocument()
  })

  it('reports the filename and its size when a file is there', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByText(/stnk\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/512 KB/)).toBeInTheDocument()
  })

  it('calls the slot an external link when that is what it holds', () => {
    const link = { ...FILE, storageKeyless: true, originalName: null, sizeBytes: null, externalUrl: 'https://arsip.example/a.pdf' }
    render(
      <BerkasSlotCard slot={SLOT} file={link} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByText(/tautan eksternal/i)).toBeInTheDocument()
  })

  it('offers Unggah on an empty slot and Ganti on a filled one', () => {
    const { rerender } = render(
      <BerkasSlotCard slot={SLOT} file={null} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByRole('button', { name: /unggah/i })).toBeInTheDocument()

    rerender(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByRole('button', { name: /ganti/i })).toBeInTheDocument()
  })

  it('offers Lihat and Hapus only when a file is there', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={null} canEdit onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.queryByRole('button', { name: /lihat/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hapus/i })).not.toBeInTheDocument()
  })

  it('reports the view and delete the operator asked for', async () => {
    const onView = jest.fn()
    const onDelete = jest.fn()
    render(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit onUpload={noop} onView={onView} onDelete={onDelete} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /lihat/i }))
    expect(onView).toHaveBeenCalledWith(FILE)

    await userEvent.click(screen.getByRole('button', { name: /hapus/i }))
    expect(onDelete).toHaveBeenCalledWith(FILE)
  })

  // A read-only operator sees what is on file and can open it; they must not be shown controls
  // that would 403.
  it('hides the editing buttons without permission', () => {
    render(
      <BerkasSlotCard slot={SLOT} file={FILE} canEdit={false} onUpload={noop} onView={noop} onDelete={noop} />,
    )
    expect(screen.getByRole('button', { name: /lihat/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ganti/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hapus/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Tulis slot card**

Create `apps/frontend/src/features/fleet/components/BerkasSlotCard.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { FleetMasterRow, FleetVehicleFile } from '../types'
import { formatBytes } from '../utils/format-bytes'

interface Props {
  slot: Pick<FleetMasterRow, 'id' | 'code' | 'label'>
  file: FleetVehicleFile | null
  canEdit: boolean
  onUpload: (slotId: string) => void
  onView: (file: FleetVehicleFile) => void
  onDelete: (file: FleetVehicleFile) => void
}

// No preview thumbnail is rendered from file content. The prototype put the raw data URI into an
// <img src> (lines 585, 754), which is precisely the XSS this port removes: a file is reached
// only through a presigned URL, opened on demand (spec §4.3).
export function BerkasSlotCard({ slot, file, canEdit, onUpload, onView, onDelete }: Props) {
  const status = !file
    ? 'belum ada berkas'
    : file.externalUrl
      ? 'tautan eksternal'
      : `${file.originalName ?? 'berkas'} · ${formatBytes(file.sizeBytes)}`

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-sm font-medium">{slot.label}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground" title={status}>
        {status}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {file && (
          <Button variant="outline" size="sm" onClick={() => onView(file)}>
            Lihat
          </Button>
        )}
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => onUpload(slot.id)}>
            {file ? 'Ganti' : 'Unggah'}
          </Button>
        )}
        {canEdit && file && (
          <Button variant="outline" size="sm" onClick={() => onDelete(file)}>
            Hapus
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Tulis test BerkasTab**

Create `apps/frontend/src/features/fleet/components/BerkasTab.spec.tsx`. `BerkasVehicleCard` memanggil `useVehicleFiles` sendiri, jadi mock modul `../hooks/useFleetVehicleFiles` dengan `jest.mock` dan buat `useVehicleFiles` mengembalikan `{ data: filesFor[vehicleId] ?? [] }` — ikuti cara `VehicleTable.spec.tsx` me-mock hook-nya. `BerkasTab` sendiri hanya menerima prop `vehicles`, `slots`, `canEdit`, `onUpload`, `onView`, `onDelete`.

```tsx
describe('BerkasTab', () => {
  it('renders a card per vehicle with a slot for every active jenis_berkas', () => {
    // Arrange: two vehicles, three jenis_berkas slots
    // Expect: both plates rendered; six slot labels in total
  })

  it('chips the filled count against the number of slots', () => {
    // Arrange: a vehicle whose berkasCount is { ada: 2, wajib: 3 }
    // Expect: text '2/3' rendered
  })

  it('filters to units with missing files', async () => {
    // Act: click the 'Belum lengkap' filter
    // Expect: only the vehicle with ada < wajib remains
  })

  // Spec §6.4: the prototype's row button only filled the search box, so with the "Lengkap"
  // filter active the operator landed on an empty state for the unit they had just clicked.
  it('clears the completeness filter when a vehicle is opened from elsewhere', () => {
    // Arrange: render with filter 'lengkap' and focusVehicleId pointing at an incomplete unit
    // Expect: that vehicle is visible
  })

  it('says so when no vehicle matches', () => {
    // Expect: /tidak ada kendaraan yang cocok/i
  })

  it('tells a read-only operator why there is nothing to upload', () => {
    // Arrange: canEdit false
    // Expect: no 'Unggah' button anywhere
  })

  // A slot list built from an empty master-data response would render zero slots over a live
  // page and look like the files had vanished.
  it('explains an empty slot list instead of rendering a blank tab', () => {
    // Arrange: slots = []
    // Expect: /belum ada jenis berkas/i
  })
})
```

- [ ] **Step 6: Tulis BerkasTab**

Create `apps/frontend/src/features/fleet/components/BerkasTab.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { FleetMasterRow, FleetVehicle, FleetVehicleFile } from '../types'
import { useVehicleFiles } from '../hooks/useFleetVehicleFiles'
import { BerkasSlotCard } from './BerkasSlotCard'

type Completeness = 'all' | 'lengkap' | 'kurang'

interface Props {
  vehicles: FleetVehicle[]
  slots: FleetMasterRow[]
  canEdit: boolean
  onUpload: (vehicle: FleetVehicle, slotId: string) => void
  onView: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
  onDelete: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
}

export function BerkasTab({ vehicles, slots, canEdit, onUpload, onView, onDelete }: Props) {
  const [completeness, setCompleteness] = useState<Completeness>('all')
  const [q, setQ] = useState('')

  // Without slots there is nothing to fill, and rendering zero slots over a live page reads as
  // "the files are gone" rather than "the list has not loaded".
  if (slots.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Belum ada jenis berkas di master data. Tambahkan dulu di tab Master Data.
      </div>
    )
  }

  const term = q.trim().toLowerCase()
  const rows = vehicles.filter((v) => {
    if (term) {
      const hay = [v.nopol, v.merk, v.tipe, v.driver?.nama, v.pool?.label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(term)) return false
    }
    const { ada, wajib } = v.berkasCount
    if (completeness === 'lengkap' && ada < wajib) return false
    if (completeness === 'kurang' && ada >= wajib) return false
    return true
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nopol, merk, sopir, atau pool…"
          aria-label="Cari kendaraan"
          className="h-9 min-w-56 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <div role="group" aria-label="Saring kelengkapan berkas" className="flex gap-1">
          {(
            [
              ['all', 'Semua'],
              ['lengkap', 'Lengkap'],
              ['kurang', 'Belum lengkap'],
            ] as [Completeness, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={completeness === value}
              onClick={() => setCompleteness(value)}
              className={`h-9 rounded-md border px-3 text-sm ${
                completeness === value ? 'bg-primary text-primary-foreground' : 'bg-background'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Tidak ada kendaraan yang cocok.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((vehicle) => (
            <BerkasVehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              slots={slots}
              canEdit={canEdit}
              onUpload={onUpload}
              onView={onView}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// A component per vehicle, so each one calls useVehicleFiles for itself: a hook cannot be called
// inside a .map(), and lifting every unit's files into the page would mean one query per row
// fired from a single component.
function BerkasVehicleCard({
  vehicle,
  slots,
  canEdit,
  onUpload,
  onView,
  onDelete,
}: {
  vehicle: FleetVehicle
  slots: FleetMasterRow[]
  canEdit: boolean
  onUpload: (vehicle: FleetVehicle, slotId: string) => void
  onView: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
  onDelete: (vehicle: FleetVehicle, file: FleetVehicleFile) => void
}) {
  const { data: files } = useVehicleFiles(vehicle.id)
  const bySlot = new Map((files ?? []).map((f) => [f.slotId, f]))
  // The chip comes from the list response rather than from the rows just fetched, so it reads the
  // same number as the Armada tab does for the same unit.
  const { ada, wajib } = vehicle.berkasCount
  const tone =
    ada >= wajib
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : ada === 0
        ? 'bg-destructive/10 text-destructive'
        : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'

  return (
    <article className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-medium tabular-nums">{vehicle.nopol}</div>
          <div className="text-xs text-muted-foreground">
            {[vehicle.merk, vehicle.tipe].filter(Boolean).join(' ')}
            {' · '}
            {vehicle.driver?.nama ?? 'tanpa sopir'}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
          {ada}/{wajib}
        </span>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {slots.map((slot) => (
          <BerkasSlotCard
            key={slot.id}
            slot={slot}
            file={bySlot.get(slot.id) ?? null}
            canEdit={canEdit}
            onUpload={(slotId) => onUpload(vehicle, slotId)}
            onView={(file) => onView(vehicle, file)}
            onDelete={(file) => onDelete(vehicle, file)}
          />
        ))}
      </div>
    </article>
  )
}
```

- [ ] **Step 7: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "VehiclesTabs|BerkasSlotCard|BerkasTab" \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — seluruh test tab, slot card, dan BerkasTab hijau.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/fleet/components
git commit -m "feat(fleet): show each unit's file slots without rendering their bytes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: BerkasUploadDialog

**Files:**
- Create: `apps/frontend/src/features/fleet/components/BerkasUploadDialog.tsx`
- Create: `apps/frontend/src/features/fleet/components/BerkasUploadDialog.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`

**Interfaces:**
- Consumes: `useUploadVehicleFile`, `useSetExternalUrl` (Task 11), `ALLOWED_MIME_TYPES` yang dicerminkan di frontend.
- Produces: `<BerkasUploadDialog open vehicle slot onClose />`.

- [ ] **Step 1: Tulis test**

Create `apps/frontend/src/features/fleet/components/BerkasUploadDialog.spec.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BerkasUploadDialog } from './BerkasUploadDialog'

const VEHICLE = { id: 'v1', nopol: 'B 9114 KYZ' }
const SLOT = { id: 's1', code: 'stnk', label: 'STNK' }

function pdf(name = 'stnk.pdf', size = 1024) {
  const file = new File(['x'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('BerkasUploadDialog', () => {
  it('names the vehicle and the slot being filled', () => {
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={jest.fn()}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    expect(screen.getByText(/STNK/)).toBeInTheDocument()
    expect(screen.getByText(/B 9114 KYZ/)).toBeInTheDocument()
  })

  it('hands the chosen file to the uploader', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined)
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    const file = pdf()
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), file)
    await userEvent.click(screen.getByRole('button', { name: /unggah/i }))

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
  })

  // Refused in the browser so a doomed 10 MB upload is not started; the backend refuses it too.
  it('refuses a file over 10 MB without calling the uploader', async () => {
    const onUpload = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), pdf('big.pdf', 11 * 1024 * 1024))
    expect(await screen.findByText(/maksimal 10 MB/i)).toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('refuses a type outside the allow-list', async () => {
    const onUpload = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    const exe = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' })
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), exe)
    expect(await screen.findByText(/jpg, png, webp, atau pdf/i)).toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  // Spec §6.4: the prototype showed its success toast before the promise settled, then swallowed
  // the failure. Here the dialog stays open until the server has actually answered.
  it('closes only after the upload resolves', async () => {
    let resolve: () => void = () => {}
    const onUpload = jest.fn(() => new Promise<void>((r) => { resolve = r }))
    const onClose = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={onClose}
      />,
    )
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), pdf())
    await userEvent.click(screen.getByRole('button', { name: /unggah/i }))

    expect(onClose).not.toHaveBeenCalled()
    resolve()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('reports a failed upload and stays open', async () => {
    const onUpload = jest.fn().mockRejectedValue(new Error('Gagal mengunggah berkas (403)'))
    const onClose = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={onUpload}
        onSetUrl={jest.fn()}
        onClose={onClose}
      />,
    )
    await userEvent.upload(screen.getByLabelText(/pilih berkas/i), pdf())
    await userEvent.click(screen.getByRole('button', { name: /unggah/i }))

    expect(await screen.findByText(/gagal mengunggah/i)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stores an external link instead of a file', async () => {
    const onSetUrl = jest.fn().mockResolvedValue(undefined)
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={jest.fn()}
        onSetUrl={onSetUrl}
        onClose={jest.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(/tautan/i), 'https://arsip.example/stnk.pdf')
    await userEvent.click(screen.getByRole('button', { name: /simpan tautan/i }))

    await waitFor(() => expect(onSetUrl).toHaveBeenCalledWith('https://arsip.example/stnk.pdf'))
  })

  // The backend and the DTO both refuse this; refusing it here as well means the operator is told
  // why rather than shown a 400.
  it('refuses a link that is not http or https', async () => {
    const onSetUrl = jest.fn()
    render(
      <BerkasUploadDialog
        open
        vehicle={VEHICLE as never}
        slot={SLOT}
        onUpload={jest.fn()}
        onSetUrl={onSetUrl}
        onClose={jest.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText(/tautan/i), 'javascript:alert(1)')
    await userEvent.click(screen.getByRole('button', { name: /simpan tautan/i }))

    expect(await screen.findByText(/harus diawali http/i)).toBeInTheDocument()
    expect(onSetUrl).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB BerkasUploadDialog \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Tulis dialog**

Create `apps/frontend/src/features/fleet/components/BerkasUploadDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FleetMasterRow, FleetVehicle } from '../types'

// Mirrors the backend allow-list (storage.constants.ts). Duplicated deliberately rather than
// fetched: this is a courtesy check that saves a doomed upload, and the backend remains the
// authority that actually refuses one.
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

interface Props {
  open: boolean
  vehicle: FleetVehicle
  slot: Pick<FleetMasterRow, 'id' | 'code' | 'label'>
  onUpload: (file: File) => Promise<unknown>
  onSetUrl: (url: string) => Promise<unknown>
  onClose: () => void
}

export function BerkasUploadDialog({ open, vehicle, slot, onUpload, onSetUrl, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const chooseFile = (chosen: File | null) => {
    setError(null)
    if (!chosen) {
      setFile(null)
      return
    }
    if (!ACCEPTED.includes(chosen.type)) {
      setFile(null)
      setError('Format tidak didukung. Pilih jpg, png, webp, atau pdf.')
      return
    }
    if (chosen.size > MAX_BYTES) {
      setFile(null)
      setError('Ukuran berkas maksimal 10 MB.')
      return
    }
    setFile(chosen)
  }

  // The dialog closes on the server's answer, never before it. The prototype toasted success
  // synchronously and then swallowed the failure (spec §6.4), so an operator could walk away
  // believing a file was saved that never was.
  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan berkas.')
    } finally {
      setBusy(false)
    }
  }

  const submitUrl = () => {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Tautan harus diawali http:// atau https://')
      return
    }
    void run(() => onSetUrl(trimmed))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Softcopy {slot.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{vehicle.nopol}</p>

        {error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4">
          <label htmlFor="berkas-file" className="text-sm font-medium">
            Pilih berkas
          </label>
          <input
            id="berkas-file"
            type="file"
            accept={ACCEPTED.join(',')}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            jpg, png, webp, atau pdf · maksimal 10 MB
          </p>
          <Button
            className="mt-2"
            disabled={!file || busy}
            onClick={() => file && void run(() => onUpload(file))}
          >
            {busy ? 'Mengunggah…' : 'Unggah'}
          </Button>
        </div>

        <div className="mt-5 border-t pt-4">
          <label htmlFor="berkas-url" className="text-sm font-medium">
            Atau tautan ke arsip
          </label>
          <input
            id="berkas-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://arsip.example/stnk.pdf"
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
          <Button variant="outline" className="mt-2" disabled={!url.trim() || busy} onClick={submitUrl}>
            Simpan tautan
          </Button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB BerkasUploadDialog \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/fleet/components/BerkasUploadDialog.tsx apps/frontend/src/features/fleet/components/BerkasUploadDialog.spec.tsx
git commit -m "feat(fleet): close the upload dialog only once the server has answered

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Tab Kepemilikan & Angsuran

**Files:**
- Create: `apps/frontend/src/features/fleet/components/AngsuranTab.tsx`
- Create: `apps/frontend/src/features/fleet/components/AngsuranTab.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`

**Interfaces:**
- Consumes: `FleetVehicle.lease` (Phase 2), `formatRupiah` (Task 11).
- Produces: `<AngsuranTab vehicles totals />`.

- [ ] **Step 1: Tulis test**

Create `apps/frontend/src/features/fleet/components/AngsuranTab.spec.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { AngsuranTab } from './AngsuranTab'
import { FleetVehicle } from '../types'

function vehicle(over: Partial<FleetVehicle> = {}): FleetVehicle {
  return {
    id: 'v1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter',
    kepemilikan: { id: 'k', code: 'milik_esp', label: 'Milik ESP' },
    pemilikUnit: null,
    jenisArmada: { id: 'a', code: 'cdd', label: 'Colt Diesel Double' },
    lease: null,
    berkasCount: { ada: 0, wajib: 0 },
    documents: [],
    worstSeverity: 'ok',
    ...over,
  } as FleetVehicle
}

const LEASE = {
  id: 'c1',
  leasing: { id: 'l', code: 'mtf', label: 'MTF' },
  nomorKontrak: 'MTF-2024-03-11872',
  cicilanPerBulan: 8750000,
  tenorBulan: 48,
  angsuranMulai: '2024-03-11',
  angsuranTerbayarOverride: null,
  angsuranTerbayar: 30,
  sisaAngsuran: 18,
  sisaKewajiban: 157500000,
  closedAt: null,
}

describe('AngsuranTab', () => {
  it('lists the ownership and contract columns', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: LEASE })]} />)
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
    expect(screen.getByText('Milik ESP')).toBeInTheDocument()
    expect(screen.getByText('MTF')).toBeInTheDocument()
    expect(screen.getByText('MTF-2024-03-11872')).toBeInTheDocument()
  })

  // Every figure arrives settled from the backend; the table formats and never recomputes.
  it('shows the instalment figures the backend settled', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: LEASE })]} />)
    expect(screen.getByText(/8\.750\.000/)).toBeInTheDocument()
    expect(screen.getByText(/48 bln/)).toBeInTheDocument()
    expect(screen.getByText(/30 bln/)).toBeInTheDocument()
    expect(screen.getByText(/18 bln/)).toBeInTheDocument()
    expect(screen.getByText(/157\.500\.000/)).toBeInTheDocument()
  })

  it('shows progress as a percentage of the tenor', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: LEASE })]} />)
    expect(screen.getByText(/63%/)).toBeInTheDocument()
  })

  it('marks a settled contract as lunas', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: { ...LEASE, sisaAngsuran: 0, sisaKewajiban: 0 } })]} />)
    expect(screen.getByText(/lunas/i)).toBeInTheDocument()
  })

  it('dashes the columns for a unit with no contract', () => {
    render(<AngsuranTab vehicles={[vehicle({ lease: null })]} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('names the outside owner of a rented unit', () => {
    render(
      <AngsuranTab
        vehicles={[
          vehicle({
            kepemilikan: { id: 'k', code: 'sewa_lepas_kunci', label: 'Sewa lepas kunci' },
            pemilikUnit: 'CV Rejeki Transport',
          }),
        ]}
      />,
    )
    expect(screen.getByText('CV Rejeki Transport')).toBeInTheDocument()
  })

  // A settled contract is no longer an obligation, so it must not reach the footer totals — the
  // same rule the summary tiles apply.
  it('totals only the contracts still running', () => {
    render(
      <AngsuranTab
        vehicles={[
          vehicle({ id: 'a', lease: LEASE }),
          vehicle({ id: 'b', nopol: 'B 1 B', lease: { ...LEASE, sisaAngsuran: 0, sisaKewajiban: 0 } }),
        ]}
      />,
    )
    const footer = screen.getByRole('rowgroup', { name: /total/i })
    expect(within(footer).getByText(/8\.750\.000/)).toBeInTheDocument()
    expect(within(footer).getByText(/157\.500\.000/)).toBeInTheDocument()
  })

  it('says so when the register is empty', () => {
    render(<AngsuranTab vehicles={[]} />)
    expect(screen.getByText(/belum ada data/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB AngsuranTab \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Tulis komponen**

Create `apps/frontend/src/features/fleet/components/AngsuranTab.tsx`:

```tsx
'use client'

import { FleetVehicle } from '../types'
import { formatRupiah } from '../utils/format-rupiah'

interface Props {
  vehicles: FleetVehicle[]
}

const COLUMNS = [
  'Nopol',
  'Kendaraan',
  'Kepemilikan',
  'Leasing',
  'Cicilan/bulan',
  'Tenor',
  'Terbayar',
  'Sisa',
  'Sisa kewajiban',
]

// A table of what the company still owes. Every figure comes from the backend already settled —
// this component formats and totals, and computes no instalment of its own.
export function AngsuranTab({ vehicles }: Props) {
  // Heaviest obligation first: the operator opens this tab to see what is owed, not to read an
  // alphabetical list.
  const rows = [...vehicles].sort(
    (a, b) => (b.lease?.sisaKewajiban ?? 0) - (a.lease?.sisaKewajiban ?? 0) || a.nopol.localeCompare(b.nopol),
  )

  let totalCicilan = 0
  let totalSisa = 0
  for (const v of rows) {
    // A settled contract is history, not an obligation — the same rule the summary tiles apply.
    if (v.lease && v.lease.sisaAngsuran > 0) {
      totalCicilan += v.lease.cicilanPerBulan ?? 0
      totalSisa += v.lease.sisaKewajiban
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Belum ada data.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            {COLUMNS.map((label, i) => (
              <th key={label} className={`px-3 py-2 font-medium ${i >= 4 ? 'text-right' : 'text-left'}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const lease = v.lease
            const tenor = lease?.tenorBulan ?? 0
            const pct = tenor > 0 ? Math.round(((lease?.angsuranTerbayar ?? 0) / tenor) * 100) : 0
            const lunas = tenor > 0 && lease?.sisaAngsuran === 0

            return (
              <tr key={v.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium tabular-nums">{v.nopol}</td>
                <td className="px-3 py-2">
                  {[v.merk, v.tipe].filter(Boolean).join(' ') || '—'}
                  <div className="text-xs text-muted-foreground">{v.jenisArmada?.label ?? ''}</div>
                </td>
                <td className="px-3 py-2">
                  {v.kepemilikan?.label ?? '—'}
                  {v.pemilikUnit && (
                    <div className="text-xs text-muted-foreground">{v.pemilikUnit}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {lease?.leasing?.label ?? '—'}
                  {lease?.nomorKontrak && (
                    <div className="text-xs text-muted-foreground">{lease.nomorKontrak}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {lease ? formatRupiah(lease.cicilanPerBulan) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{tenor ? `${tenor} bln` : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {tenor ? `${lease?.angsuranTerbayar ?? 0} bln (${pct}%)` : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {!tenor ? (
                    '—'
                  ) : lunas ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      lunas
                    </span>
                  ) : (
                    `${lease?.sisaAngsuran ?? 0} bln`
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {lease && lease.sisaAngsuran > 0 ? formatRupiah(lease.sisaKewajiban) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot aria-label="Total kewajiban berjalan" className="border-t bg-muted/40 font-medium">
          <tr>
            <td className="px-3 py-2" colSpan={4}>
              Total kewajiban berjalan
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(totalCicilan)}</td>
            <td colSpan={3} />
            <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(totalSisa)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB AngsuranTab \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 8 test.

- [ ] **Step 5: Rangkai semuanya di halaman**

Di `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`, tambahkan import:

```ts
import { VehiclesTabs, VehiclesTab } from '@/features/fleet/components/VehiclesTabs'
import { BerkasTab } from '@/features/fleet/components/BerkasTab'
import { BerkasUploadDialog } from '@/features/fleet/components/BerkasUploadDialog'
import { AngsuranTab } from '@/features/fleet/components/AngsuranTab'
import {
  useDeleteVehicleFile,
  useFileDownloadUrl,
  useSetExternalUrl,
  useUploadVehicleFile,
  useVehicleFiles,
} from '@/features/fleet/hooks/useFleetVehicleFiles'
import { FleetVehicleFile } from '@/features/fleet/types'
```

Tambahkan ke union `Modal`:

```ts
  | { type: 'upload'; vehicle: FleetVehicle; slotId: string }
  | { type: 'deleteFile'; vehicle: FleetVehicle; file: FleetVehicleFile }
```

Tambahkan state dan hook:

```ts
  const [tab, setTab] = useState<VehiclesTab>('armada')
  const { data: jenisBerkas } = useFleetMasterDataByCategory('jenis_berkas', master)

  const uploadFile = useUploadVehicleFile()
  const setExternalUrl = useSetExternalUrl()
  const deleteFile = useDeleteVehicleFile()
  const downloadUrl = useFileDownloadUrl()

  // Opening a file fetches a fresh presigned URL rather than reusing a cached one: a GET expires
  // in two minutes, so a URL cached with the row would be dead by the time it was clicked.
  const handleViewFile = async (vehicle: FleetVehicle, file: FleetVehicleFile) => {
    setActionError(null)
    try {
      const url = file.externalUrl
        ? file.externalUrl
        : await downloadUrl.mutateAsync({ vehicleId: vehicle.id, fileId: file.id })
      // noopener so the opened document cannot reach back through window.opener.
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Gagal membuka berkas.'))
    }
  }
```

Sisipkan tab bar tepat setelah `<FleetSummaryCards …/>`:

```tsx
      <VehiclesTabs value={tab} onChange={setTab} />
```

Bungkus blok `<VehicleFilters …/>` sampai blok pagination yang sudah ada dalam `{tab === 'armada' && ( … )}`, lalu tambahkan dua tab lain sesudahnya:

```tsx
      {tab === 'berkas' && (
        <BerkasTab
          vehicles={rows}
          slots={jenisBerkas ?? []}
          canEdit={canUpdate}
          onUpload={(vehicle, slotId) => setModal({ type: 'upload', vehicle, slotId })}
          onView={handleViewFile}
          onDelete={(vehicle, file) => setModal({ type: 'deleteFile', vehicle, file })}
        />
      )}

      {tab === 'angsuran' && <AngsuranTab vehicles={rows} />}
```

`BerkasTab` tidak menerima berkas lewat prop: setiap `BerkasVehicleCard` memanggil `useVehicleFiles(vehicle.id)` sendiri (Task 13), karena hook React tidak boleh dipanggil di dalam `.map()`. Halaman cukup mengoper daftar unit dan daftar slot.

Tambahkan dialog upload dan konfirmasi hapus di akhir JSX:

```tsx
      {modal?.type === 'upload' && (
        <BerkasUploadDialog
          open
          vehicle={modal.vehicle}
          slot={
            (jenisBerkas ?? []).find((s) => s.id === modal.slotId) ?? {
              id: modal.slotId,
              code: '',
              label: 'Berkas',
            }
          }
          onUpload={(file) =>
            uploadFile.mutateAsync({ vehicleId: modal.vehicle.id, slotId: modal.slotId, file })
          }
          onSetUrl={(url) =>
            setExternalUrl.mutateAsync({ vehicleId: modal.vehicle.id, slotId: modal.slotId, url })
          }
          onClose={() => setModal(null)}
        />
      )}

      {/* Spec §6.4: every deletion goes through a confirmation. The prototype deleted straight
          from the edit modal, so one mis-click removed a vehicle and its four files. */}
      <ConfirmDialog
        open={modal?.type === 'deleteFile'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Hapus berkas"
        description={
          modal?.type === 'deleteFile'
            ? `Hapus ${modal.file.originalName ?? 'berkas'} dari ${modal.vehicle.nopol}?`
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'deleteFile') return
          setActionError(null)
          try {
            await deleteFile.mutateAsync({ vehicleId: modal.vehicle.id, fileId: modal.file.id })
          } catch (err: unknown) {
            setActionError(apiErrorMessage(err, 'Gagal menghapus berkas.'))
          }
        }}
      />
```

- [ ] **Step 6: Jalankan seluruh test fleet frontend**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — seluruh test fleet hijau, termasuk `page.spec.tsx` dari Phase 2.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(fleet): give the register its files and instalments tabs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Softcopy SIM di form sopir

**Files:**
- Create: `apps/frontend/src/features/fleet/hooks/useDriverSimFile.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useDriverSimFile.spec.tsx`
- Modify: `apps/frontend/src/features/fleet/components/DriverFormDialog.tsx`
- Modify: `apps/frontend/src/features/fleet/components/DriverFormDialog.spec.tsx`
- Modify: `apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts`

**Interfaces:**
- Consumes: endpoint SIM dari Task 7, `formatBytes` (Task 11).
- Produces: `useUploadDriverSim()`, `useDriverSimDownloadUrl()`, `useDeleteDriverSim()`.

- [ ] **Step 1: Tulis hook**

Create `apps/frontend/src/features/fleet/hooks/useDriverSimFile.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

const DRIVERS_KEY = ['fleet', 'drivers']

// The same three steps as a vehicle file, against the driver routes. fetch rather than apiClient
// for the PUT, for the same reason: our Authorization header is not part of the presigned
// signature and MinIO would reject the request.
export function useUploadDriverSim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ driverId, file }: { driverId: string; file: File }) => {
      const intent = await apiClient
        .post(`/fleet/drivers/${driverId}/sim-file/upload-intent`, {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
        .then((r) => r.data as { uploadUrl: string; storageKey: string })

      const put = await fetch(intent.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!put.ok) throw new Error(`Gagal mengunggah berkas (${put.status})`)

      return apiClient
        .post(`/fleet/drivers/${driverId}/sim-file/confirm`, {
          storageKey: intent.storageKey,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })
        .then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVERS_KEY }),
  })
}

export function useDriverSimDownloadUrl() {
  return useMutation({
    mutationFn: (driverId: string) =>
      apiClient
        .get(`/fleet/drivers/${driverId}/sim-file/download-url`)
        .then((r) => (r.data as { url: string }).url),
  })
}

export function useDeleteDriverSim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (driverId: string) => apiClient.delete(`/fleet/drivers/${driverId}/sim-file`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DRIVERS_KEY }),
  })
}
```

Create `apps/frontend/src/features/fleet/hooks/useDriverSimFile.spec.tsx` mengikuti harness `useFleetVehicleFiles.spec.tsx` dari Task 11, dengan test:

```tsx
describe('useUploadDriverSim', () => {
  it('runs intent, then PUT, then confirm, in that order', async () => {
    // Expect call order: POST /fleet/drivers/d1/sim-file/upload-intent,
    //   fetch PUT to the signed URL, POST /fleet/drivers/d1/sim-file/confirm
  })

  it('does not confirm when the PUT fails', async () => {
    // global.fetch resolves { ok: false, status: 403 }
    // Expect: rejects, and no POST to .../confirm
  })

  it('invalidates the drivers queries on success', async () => {
    // Expect: invalidateQueries called with a key starting ['fleet', 'drivers']
  })
})

describe('useDeleteDriverSim', () => {
  it('deletes the scan by driver id', async () => {
    // Expect: apiClient.delete called with '/fleet/drivers/d1/sim-file'
  })
})
```

- [ ] **Step 2: Default simFile di normalizer sopir**

Di `apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts`, dalam fungsi normalisasi sopir, tambahkan:

```ts
    simFile: row.simFile ?? null,
```

mengikuti konvensi wire type longgar yang sudah dipakai file itu.

- [ ] **Step 3: Tulis test slot SIM di form sopir**

Tambahkan ke `apps/frontend/src/features/fleet/components/DriverFormDialog.spec.tsx`:

```tsx
describe('softcopy SIM', () => {
  it('says the driver has no scan yet', () => {
    // Arrange: render with initial driver whose simFile is null
    // Expect: /belum ada softcopy/i
  })

  it('reports the filename and size of an existing scan', () => {
    // Arrange: simFile { originalName: 'sim.png', mimeType: 'image/png', sizeBytes: 524288 }
    // Expect: /sim\.png/ and /512 KB/
  })

  // A new driver has no id yet, so there is nowhere to attach a file to.
  it('offers no upload until the driver has been saved', () => {
    // Arrange: render with no initial driver
    // Expect: no 'Unggah SIM' button
  })

  it('refuses a file over 10 MB', async () => {
    // Expect: /maksimal 10 MB/i and the upload callback not called
  })
})
```

- [ ] **Step 4: Tambahkan slot SIM ke DriverFormDialog**

Di `apps/frontend/src/features/fleet/components/DriverFormDialog.tsx`, tambahkan blok ini di bawah field `simExpiresAt` yang sudah ada. Sesuaikan nama prop dengan yang dipakai file itu — bacalah dulu sebelum mengubah.

```tsx
      {/* Only for a saved driver: a new one has no id, so there is nothing to attach a file to.
          The scan is uploaded separately from the form fields rather than as part of the save,
          because it goes straight to storage and never through this form's payload. */}
      {initial?.id && (
        <div className="mt-4 border-t pt-4">
          <div className="text-sm font-medium">Softcopy SIM</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {initial.simFile
              ? `${initial.simFile.originalName ?? 'berkas'} · ${formatBytes(initial.simFile.sizeBytes)}`
              : 'Belum ada softcopy.'}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {initial.simFile && (
              <Button type="button" variant="outline" size="sm" onClick={() => onViewSim(initial.id)}>
                Lihat
              </Button>
            )}
            <label className="inline-flex">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 10 * 1024 * 1024) {
                    setSimError('Ukuran berkas maksimal 10 MB.')
                    return
                  }
                  setSimError(null)
                  void onUploadSim(initial.id, file)
                }}
              />
              <span className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm">
                {initial.simFile ? 'Ganti SIM' : 'Unggah SIM'}
              </span>
            </label>
            {initial.simFile && (
              <Button type="button" variant="outline" size="sm" onClick={() => onDeleteSim(initial.id)}>
                Hapus
              </Button>
            )}
          </div>
          {simError && <p className="mt-2 text-sm text-destructive">{simError}</p>}
        </div>
      )}
```

Tambahkan `const [simError, setSimError] = useState<string | null>(null)` ke komponen, import `formatBytes` dari `../utils/format-bytes`, dan tambahkan prop `onUploadSim`, `onViewSim`, `onDeleteSim` ke interface props-nya. Sambungkan ketiganya di halaman Sopir (`apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx`) ke hook dari Step 1, mengikuti cara halaman itu sudah menyambungkan mutation lain, dengan `window.open(url, '_blank', 'noopener,noreferrer')` untuk view.

- [ ] **Step 5: Jalankan seluruh test frontend**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — seluruh suite frontend hijau.

- [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: bersih, tanpa error baru.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/fleet "apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx"
git commit -m "feat(fleet): let a driver's licence scan be uploaded from their form

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verifikasi akhir Phase 3

- [ ] **Backend penuh:** `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"` → PASS
- [ ] **Frontend penuh:** `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"` → PASS
- [ ] **Lint:** `pnpm lint` → bersih
- [ ] **Build:** `pnpm build` → sukses
- [ ] **Manual, dengan MinIO hidup:** unggah sebuah PDF ke slot STNK sebuah unit, muat ulang halaman, klik **Lihat** — berkas terbuka lewat URL presigned. Ganti dengan berkas lain, pastikan slot menunjuk berkas baru. Hapus, pastikan slot kosong lagi.
- [ ] **Manual:** unggah softcopy SIM seorang sopir dan buka kembali dari form sopir.
- [ ] **Manual:** tab Kepemilikan & Angsuran menampilkan sisa kewajiban, dan totalnya cocok dengan kartu ringkasan di atas.
- [ ] **Manual:** klik Ekspor CSV, buka file-nya di spreadsheet — nama berhuruf aksen tampil benar (BOM bekerja), kolom tidak bergeser.

**Phase 3 selesai bila:** berkas kendaraan dan softcopy SIM terunggah ke MinIO lewat presigned URL dan bisa dilihat kembali; tab angsuran menampilkan sisa kewajiban; CSV terunduh.
