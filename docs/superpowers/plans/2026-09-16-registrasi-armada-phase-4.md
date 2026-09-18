# Registrasi Armada Phase 4 — Perlu Tindakan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokumen kendaraan dan SIM sopir yang jatuh tempo dalam ambangnya masing-masing tampil terurut dari yang paling mendesak di atas tabel armada, dan mengkliknya membuka kendaraan terkait.

**Architecture:** Satu endpoint baru `GET /fleet/alerts` yang menggabungkan dua sumber — dokumen kendaraan dan SIM sopir — dalam satu daftar terurut, masing-masing memakai `warn_days` jenisnya sendiri dari master data sehingga tidak ada ambang yang di-hardcode. Satu query SQL per sumber, bukan iterasi atas daftar kendaraan, supaya endpoint ini tidak ikut membesar seiring armada. Frontend menambah satu section di atas tabel armada; seluruh perhitungan hari tetap di backend.

**Tech Stack:** NestJS 10 · TypeORM · PostgreSQL 16 · Next.js App Router · React Query v5 · Tailwind · jest + ts-jest (backend) · jest + Testing Library (frontend)

**Spec:** `docs/superpowers/specs/2026-09-09-registrasi-armada-design.md` §2.7, §2.8, §5 (Alert), §6.2, §6.3 (Phase 4), §9 (Phase 4)

## Global Constraints

- **Bahasa kode & komentar: Inggris.** Seluruh repo berbahasa Inggris; hanya label UI yang tampil ke operator berbahasa Indonesia. Jangan menulis komentar berbahasa Indonesia di dalam kode.
- **Komentar menjelaskan *kenapa*, bukan *apa*.** Komentar yang hanya mengulang kode akan ditolak saat review.
- **Gaya kode: ikuti file tetangga.** Modul backend `fleet-*` dan seluruh `apps/frontend/src/features/**` + `apps/frontend/src/app/(dashboard)/fleet/**` ditulis **tanpa semicolon**. Semua contoh kode di plan ini sudah mengikuti aturan itu — salin apa adanya. Jalankan `pnpm lint` sebelum commit.
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
- **`ValidationPipe` global:** `whitelist: true, forbidNonWhitelisted: true, transform: true`. Properti yang tidak dideklarasikan di DTO menghasilkan 400 yang menyebut namanya.
- **Permission sudah ada.** `read.fleet_vehicle` sudah di enum `Permission` sejak Phase 1 — Phase 4 tidak menambah permission baru.
- **Tidak ada ambang di kode.** Setiap `warnDays` dibaca dari baris master data jenisnya — `jenis_dokumen` untuk dokumen kendaraan, `jenis_sim` milik sopir yang bersangkutan untuk SIM. Tidak ada konstanta 30 hari di mana pun kecuali fallback yang sudah ada di `fleet-severity.ts` untuk baris yang `warn_days`-nya NULL.
- **Tidak ada kalkulasi tanggal di frontend.** `daysLeft` dan `severity` datang dari backend. Frontend hanya memetakan severity ke warna dan menyusun kalimat sisa hari dari angka yang diterimanya.
- **Bergantung pada Phase 2 saja.** Phase 4 tidak menyentuh berkas, kontrak, ringkasan, atau MinIO. Bisa dikerjakan dan di-merge tanpa menunggu Phase 3.

---

## File Structure

**Backend — baru**
```
apps/backend/src/modules/fleet-vehicles/
  fleet-alerts.service.ts           menggabungkan dokumen kendaraan dan SIM sopir
  fleet-alerts.service.spec.ts
  fleet-alerts.controller.ts        GET /fleet/alerts
  fleet-alerts.controller.spec.ts
  dto/list-fleet-alerts.dto.ts      ?limit=
  dto/list-fleet-alerts.dto.spec.ts
```

**Backend — diubah**
```
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts   + FleetAlertView
apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts  + service & controller
```

**Frontend — baru**
```
apps/frontend/src/features/fleet/
  hooks/useFleetAlerts.ts + .spec.tsx
  components/FleetAlertList.tsx + .spec.tsx
```

**Frontend — diubah**
```
apps/frontend/src/features/fleet/types.ts                       + FleetAlert
apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx       + section "Perlu tindakan"
```

## Task Overview

| Task | Deliverable | Bisa dites sendiri |
|---|---|---|
| 1 | `FleetAlertsService` — query dan penggabungan | service spec |
| 2 | DTO + controller `GET /fleet/alerts` | dto spec + controller spec |
| 3 | Frontend: tipe + `useFleetAlerts` | hook spec |
| 4 | Frontend: `FleetAlertList` + pemasangan di halaman | component spec |

---

### Task 1: FleetAlertsService

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-alerts.service.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-alerts.service.spec.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`

**Interfaces:**
- Consumes: `FleetVehicleDocumentEntity`, `FleetDriverEntity`, `FleetMasterDataEntity` (Phase 1–2), `daysUntil`/`severityFor`/`todayISO` dari `fleet-severity.ts`.
- Produces:
  - `FleetAlertView { kind: 'document' | 'sim'; vehicleId: string | null; nopol: string | null; merk: string | null; tipe: string | null; pool: string | null; subjectId: string; label: string; expiresAt: string; daysLeft: number; severity: FleetSeverity; driverName: string | null }` di `fleet-vehicles.types.ts` — dipakai Task 2 dan 3.
  - `FleetAlertsService.list(limit?: number): Promise<FleetAlertView[]>`.

- [ ] **Step 1: Tulis test**

Create `apps/backend/src/modules/fleet-vehicles/fleet-alerts.service.spec.ts`:

```ts
import { FleetAlertsService } from './fleet-alerts.service'

// Every case fixes 'today' so the assertions do not drift as the calendar moves.
const TODAY = '2026-09-16'

function docRow(over: Record<string, unknown> = {}) {
  return {
    vehicleId: 'v-1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    pool: 'Pool Cakung',
    driverName: 'Ahmad Fauzi',
    docTypeId: 'dt-kir',
    label: 'KIR',
    expiresAt: '2026-09-20',
    warnDays: 30,
    ...over,
  }
}

function simRow(over: Record<string, unknown> = {}) {
  return {
    driverId: 'dr-1',
    driverName: 'Ahmad Fauzi',
    nopol: 'B 9114 KYZ',
    vehicleId: 'v-1',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    pool: 'Pool Cakung',
    label: 'SIM B2 Umum',
    expiresAt: '2026-09-25',
    warnDays: 30,
    ...over,
  }
}

function build(docs: unknown[] = [], sims: unknown[] = []) {
  const qb = (rows: unknown[]) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => rows),
  })
  const docRepo = { createQueryBuilder: jest.fn(() => qb(docs)) }
  const driverRepo = { createQueryBuilder: jest.fn(() => qb(sims)) }
  return {
    service: new FleetAlertsService(docRepo as never, driverRepo as never),
    docRepo,
    driverRepo,
  }
}

describe('FleetAlertsService.list', () => {
  it('reports a vehicle document that is inside its threshold', async () => {
    const { service } = build([docRow()])
    const [alert] = await service.list(50, TODAY)

    expect(alert).toMatchObject({
      kind: 'document',
      vehicleId: 'v-1',
      nopol: 'B 9114 KYZ',
      label: 'KIR',
      expiresAt: '2026-09-20',
      daysLeft: 4,
      severity: 'warn',
    })
  })

  // The licence belongs to the person, not the unit, which is why it is left out of a vehicle's
  // worstSeverity — this list is where the two are merged (spec §5, Alert).
  it('reports a driver licence alongside vehicle documents', async () => {
    const { service } = build([], [simRow()])
    const [alert] = await service.list(50, TODAY)

    expect(alert).toMatchObject({
      kind: 'sim',
      label: 'SIM B2 Umum',
      driverName: 'Ahmad Fauzi',
      daysLeft: 9,
      severity: 'warn',
    })
  })

  // Most urgent first is the whole point of the section: an expired paper must never sit below
  // one that is merely due soon.
  it('sorts by days left, expired first', async () => {
    const { service } = build(
      [
        docRow({ docTypeId: 'a', label: 'STNK', expiresAt: '2026-09-30' }),
        docRow({ docTypeId: 'b', label: 'KIR', expiresAt: '2026-09-09' }),
      ],
      [simRow({ expiresAt: '2026-09-18' })],
    )
    const alerts = await service.list(50, TODAY)
    expect(alerts.map((a) => a.label)).toEqual(['KIR', 'SIM B2 Umum', 'STNK'])
    expect(alerts.map((a) => a.daysLeft)).toEqual([-7, 2, 14])
  })

  // The threshold is per type, read from master data (spec §2.8): a 14-day type must not be
  // reported at day 20 just because another type warns at 30.
  it('measures each row against its own type threshold', async () => {
    const { service } = build([
      docRow({ docTypeId: 'a', label: 'Uji Emisi', expiresAt: '2026-09-30', warnDays: 7 }),
      docRow({ docTypeId: 'b', label: 'KIR', expiresAt: '2026-09-30', warnDays: 30 }),
    ])
    const alerts = await service.list(50, TODAY)
    expect(alerts.map((a) => a.label)).toEqual(['KIR'])
  })

  it('reports a licence against the threshold of that driver own jenis_sim row', async () => {
    const { service } = build([], [simRow({ expiresAt: '2026-10-10', warnDays: 7 })])
    await expect(service.list(50, TODAY)).resolves.toEqual([])
  })

  // A type whose warn_days is NULL falls back to 30, matching both the view and severityFor. If
  // this drifted, a row could appear in the list with an 'ok' badge.
  it('falls back to thirty days when a type names no threshold', async () => {
    const { service } = build([docRow({ expiresAt: '2026-10-10', warnDays: null })])
    const alerts = await service.list(50, TODAY)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('warn')
  })

  it('marks an expired paper crit and reports a negative daysLeft', async () => {
    const { service } = build([docRow({ expiresAt: '2026-09-09' })])
    const [alert] = await service.list(50, TODAY)
    expect(alert).toMatchObject({ daysLeft: -7, severity: 'crit' })
  })

  // A paper expiring today is still valid for the rest of the business day — warn, not crit.
  // This mirrors severityFor and the SQL view; disagreeing would colour the row differently from
  // the badge on the same unit in the table below.
  it('calls a paper that expires today warn, not crit', async () => {
    const { service } = build([docRow({ expiresAt: TODAY })])
    const [alert] = await service.list(50, TODAY)
    expect(alert).toMatchObject({ daysLeft: 0, severity: 'warn' })
  })

  it('caps the list at the requested limit, keeping the most urgent', async () => {
    const { service } = build([
      docRow({ docTypeId: 'a', label: 'A', expiresAt: '2026-09-30' }),
      docRow({ docTypeId: 'b', label: 'B', expiresAt: '2026-09-09' }),
      docRow({ docTypeId: 'c', label: 'C', expiresAt: '2026-09-20' }),
    ])
    const alerts = await service.list(2, TODAY)
    expect(alerts.map((a) => a.label)).toEqual(['B', 'C'])
  })

  it('returns an empty list when nothing is due', async () => {
    const { service } = build([], [])
    await expect(service.list(50, TODAY)).resolves.toEqual([])
  })

  // An archived unit is out of the register; alerting on its papers would send an operator to
  // renew the KIR of a truck that was sold.
  it('asks only for live units and active drivers', async () => {
    const { service, docRepo, driverRepo } = build()
    await service.list(50, TODAY)

    const docQb = docRepo.createQueryBuilder.mock.results[0].value
    const docConditions = docQb.andWhere.mock.calls.map((c: unknown[]) => String(c[0])).join(' ')
    expect(docConditions).toContain('isActive')

    const simQb = driverRepo.createQueryBuilder.mock.results[0].value
    const simConditions = simQb.andWhere.mock.calls.map((c: unknown[]) => String(c[0])).join(' ')
    expect(simConditions).toContain('isActive')
  })

  // A driver with no vehicle still holds a licence, and it still expires. The row is reported
  // with no plate rather than dropped.
  it('reports a licence for a driver assigned to no vehicle', async () => {
    const { service } = build([], [simRow({ vehicleId: null, nopol: null })])
    const [alert] = await service.list(50, TODAY)
    expect(alert).toMatchObject({ kind: 'sim', vehicleId: null, nopol: null, driverName: 'Ahmad Fauzi' })
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-alerts.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `Cannot find module './fleet-alerts.service'`

- [ ] **Step 3: Tambahkan FleetAlertView ke types**

Tambahkan ke `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`:

```ts
// One row of the "Perlu tindakan" list. Documents and licences are reported in one shape so the
// frontend renders a single sorted list rather than merging two of its own — merging in the
// browser is how the ordering starts disagreeing with the badges.
export interface FleetAlertView {
  kind: 'document' | 'sim'
  // Null for a licence held by a driver assigned to no vehicle: the licence still expires.
  vehicleId: string | null
  nopol: string | null
  merk: string | null
  tipe: string | null
  pool: string | null
  // The document type id, or the driver id for a licence — what the row is about.
  subjectId: string
  label: string
  expiresAt: string
  daysLeft: number
  severity: FleetSeverity
  driverName: string | null
}
```

- [ ] **Step 4: Tulis service**

Create `apps/backend/src/modules/fleet-vehicles/fleet-alerts.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetDriverEntity } from '../fleet-drivers/entities/fleet-driver.entity'
import { daysUntil, severityFor, todayISO } from './fleet-severity'
import { FleetAlertView } from './fleet-vehicles.types'

export const DEFAULT_ALERT_LIMIT = 50
export const MAX_ALERT_LIMIT = 200

interface DocRow {
  vehicleId: string
  nopol: string
  merk: string | null
  tipe: string | null
  pool: string | null
  driverName: string | null
  docTypeId: string
  label: string
  expiresAt: string | Date
  warnDays: number | null
}

interface SimRow {
  driverId: string
  driverName: string
  vehicleId: string | null
  nopol: string | null
  merk: string | null
  tipe: string | null
  pool: string | null
  label: string
  expiresAt: string | Date
  warnDays: number | null
}

// Two queries and one merge, rather than a walk over the vehicle list: this endpoint must not
// grow a query per unit as the register does.
@Injectable()
export class FleetAlertsService {
  constructor(
    @InjectRepository(FleetVehicleDocumentEntity)
    private readonly docRepo: Repository<FleetVehicleDocumentEntity>,
    @InjectRepository(FleetDriverEntity)
    private readonly driverRepo: Repository<FleetDriverEntity>,
  ) {}

  // `today` is a parameter so the tests can fix it; callers use the default. One value for the
  // whole list, so two rows in the same response can never be measured against different days.
  async list(
    limit: number = DEFAULT_ALERT_LIMIT,
    today: string = todayISO(),
  ): Promise<FleetAlertView[]> {
    const [docs, sims] = await Promise.all([this.documentRows(), this.simRows()])

    const alerts: FleetAlertView[] = []

    for (const row of docs) {
      const alert = this.toAlert(row, today)
      if (alert) alerts.push(alert)
    }
    for (const row of sims) {
      const alert = this.toSimAlert(row, today)
      if (alert) alerts.push(alert)
    }

    // Sorted after merging rather than in SQL, because the two sources are ordered against each
    // other and only the merged list has the answer. Most urgent first: an expired paper must
    // never sit below one merely due soon.
    alerts.sort((a, b) => a.daysLeft - b.daysLeft || (a.nopol ?? '').localeCompare(b.nopol ?? ''))
    return alerts.slice(0, limit)
  }

  private async documentRows(): Promise<DocRow[]> {
    return (await this.docRepo
      .createQueryBuilder('d')
      .select('d.vehicle_id', 'vehicleId')
      .addSelect('v.nopol', 'nopol')
      .addSelect('v.merk', 'merk')
      .addSelect('v.tipe', 'tipe')
      .addSelect('p.label', 'pool')
      .addSelect('dr.nama', 'driverName')
      .addSelect('d.doc_type_id', 'docTypeId')
      .addSelect('dt.label', 'label')
      .addSelect('d.expires_at', 'expiresAt')
      .addSelect('dt.warn_days', 'warnDays')
      .innerJoin('d.vehicle', 'v')
      .innerJoin('d.docType', 'dt')
      .leftJoin('v.pool', 'p')
      .leftJoin('v.driver', 'dr')
      .where('d.isCurrent = TRUE')
      .andWhere('d.expiresAt IS NOT NULL')
      // Archived units are out of the register: alerting on one would send an operator to renew
      // the papers of a truck that has been sold.
      .andWhere('v.isActive = TRUE')
      .getRawMany()) as DocRow[]
  }

  private async simRows(): Promise<SimRow[]> {
    return (await this.driverRepo
      .createQueryBuilder('dr')
      .select('dr.id', 'driverId')
      .addSelect('dr.nama', 'driverName')
      .addSelect('v.id', 'vehicleId')
      .addSelect('v.nopol', 'nopol')
      .addSelect('v.merk', 'merk')
      .addSelect('v.tipe', 'tipe')
      .addSelect('p.label', 'pool')
      .addSelect('sj.label', 'label')
      .addSelect('dr.sim_expires_at', 'expiresAt')
      // The threshold comes from THIS driver's jenis_sim row, not a constant: spec §2.8 puts the
      // policy in master data so an admin can change it without a deploy.
      .addSelect('sj.warn_days', 'warnDays')
      .innerJoin('dr.simJenis', 'sj')
      .leftJoin('fleet_vehicles', 'v', 'v.driver_id = dr.id AND v.is_active = TRUE')
      .leftJoin('v.pool', 'p')
      .where('dr.simExpiresAt IS NOT NULL')
      .andWhere('dr.isActive = TRUE')
      .getRawMany()) as SimRow[]
  }

  private toAlert(row: DocRow, today: string): FleetAlertView | null {
    const expiresAt = this.toISO(row.expiresAt)
    const daysLeft = daysUntil(expiresAt, today)
    if (daysLeft === null) return null

    const severity = severityFor(daysLeft, row.warnDays)
    // 'ok' is not an alert. Filtering on severity rather than on a day count is what keeps this
    // list agreeing with the badge each row carries in the table below.
    if (severity === 'ok' || severity === 'none') return null

    return {
      kind: 'document',
      vehicleId: row.vehicleId,
      nopol: row.nopol,
      merk: row.merk,
      tipe: row.tipe,
      pool: row.pool,
      subjectId: row.docTypeId,
      label: row.label,
      expiresAt: expiresAt as string,
      daysLeft,
      severity,
      driverName: row.driverName,
    }
  }

  private toSimAlert(row: SimRow, today: string): FleetAlertView | null {
    const expiresAt = this.toISO(row.expiresAt)
    const daysLeft = daysUntil(expiresAt, today)
    if (daysLeft === null) return null

    const severity = severityFor(daysLeft, row.warnDays)
    if (severity === 'ok' || severity === 'none') return null

    return {
      kind: 'sim',
      vehicleId: row.vehicleId,
      nopol: row.nopol,
      merk: row.merk,
      tipe: row.tipe,
      pool: row.pool,
      subjectId: row.driverId,
      label: row.label,
      expiresAt: expiresAt as string,
      daysLeft,
      severity,
      driverName: row.driverName,
    }
  }

  // A date column surfaces as 'YYYY-MM-DD' or as a Date depending on the driver's parser, and a
  // Date is read off its LOCAL fields — toISOString() would report the previous day everywhere
  // east of Greenwich, which under Asia/Jakarta is every row.
  private toISO(value: string | Date | null): string | null {
    if (value == null) return null
    if (value instanceof Date) {
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      return `${value.getFullYear()}-${month}-${day}`
    }
    return value.slice(0, 10)
  }
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-alerts.service \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 12 test.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/fleet-alerts.service.ts apps/backend/src/modules/fleet-vehicles/fleet-alerts.service.spec.ts apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts
git commit -m "feat(fleet): merge expiring papers and licences into one ranked list

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DTO dan controller `GET /fleet/alerts`

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/dto/list-fleet-alerts.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/list-fleet-alerts.dto.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-alerts.controller.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-alerts.controller.spec.ts`
- Modify: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`

**Interfaces:**
- Consumes: `FleetAlertsService` (Task 1).
- Produces: route `GET /fleet/alerts?limit=` dijaga `read.fleet_vehicle`.

- [ ] **Step 1: Tulis test DTO**

Create `apps/backend/src/modules/fleet-vehicles/dto/list-fleet-alerts.dto.spec.ts`:

```ts
import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ListFleetAlertsDto } from './list-fleet-alerts.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ListFleetAlertsDto, { ...overrides })

describe('ListFleetAlertsDto', () => {
  it('accepts an empty query', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // Query strings arrive as text; without the transform the service would slice with a string.
  it('coerces limit from the query string', async () => {
    const dto = build({ limit: '25' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.limit).toBe(25)
  })

  it('refuses a limit below one', async () => {
    const errors = await validate(build({ limit: '0' }))
    expect(errors.map((e) => e.property)).toContain('limit')
  })

  // An unbounded limit makes this endpoint a way to pull the whole document table in one request.
  it('refuses a limit above the maximum', async () => {
    const errors = await validate(build({ limit: '500' }))
    expect(errors.map((e) => e.property)).toContain('limit')
  })

  it('refuses a limit that is not a number', async () => {
    const errors = await validate(build({ limit: 'semua' }))
    expect(errors.map((e) => e.property)).toContain('limit')
  })
})
```

- [ ] **Step 2: Tulis DTO**

Create `apps/backend/src/modules/fleet-vehicles/dto/list-fleet-alerts.dto.ts`:

```ts
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { MAX_ALERT_LIMIT } from '../fleet-alerts.service'

export class ListFleetAlertsDto {
  // Capped rather than open: without a ceiling this endpoint is a way to pull every dated
  // document in the register in one request.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ALERT_LIMIT)
  limit?: number
}
```

- [ ] **Step 3: Jalankan test DTO**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB list-fleet-alerts \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 5 test.

- [ ] **Step 4: Tulis controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-alerts.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetAlertsService } from './fleet-alerts.service'
import { ListFleetAlertsDto } from './dto/list-fleet-alerts.dto'

// At /fleet rather than /fleet/vehicles: the list covers driver licences too, and some of those
// belong to a driver assigned to no vehicle.
@ApiTags('Fleet Alerts')
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetAlertsController {
  constructor(private readonly service: FleetAlertsService) {}

  @Get('alerts')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  list(@Query() query: ListFleetAlertsDto) {
    return this.service.list(query.limit)
  }
}
```

- [ ] **Step 5: Tulis test controller**

Create `apps/backend/src/modules/fleet-vehicles/fleet-alerts.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { PERMISSION_KEY } from '../../common/decorators/authorize.decorator'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'
import { FleetAlertsController } from './fleet-alerts.controller'
import { FleetAlertsService } from './fleet-alerts.service'

describe('FleetAlertsController', () => {
  let controller: FleetAlertsController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = { list: jest.fn(async () => []) }
    const moduleRef = await Test.createTestingModule({
      controllers: [FleetAlertsController],
      providers: [{ provide: FleetAlertsService, useValue: service }],
    })
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()
    controller = moduleRef.get(FleetAlertsController)
  })

  it('passes the limit through', async () => {
    await controller.list({ limit: 10 })
    expect(service.list).toHaveBeenCalledWith(10)
  })

  // Undefined rather than a number the controller picked: the default belongs in one place, and
  // it is the service.
  it('leaves the default to the service when no limit is given', async () => {
    await controller.list({})
    expect(service.list).toHaveBeenCalledWith(undefined)
  })

  it('guards the route with read.fleet_vehicle', () => {
    const handler = (FleetAlertsController.prototype as Record<string, unknown>).list
    expect(Reflect.getMetadata(PERMISSION_KEY, handler as object)).toEqual([
      Permission.READ_FLEET_VEHICLE,
    ])
  })
})
```

- [ ] **Step 6: Daftarkan di module**

Di `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`:

```ts
import { FleetDriverEntity } from '../fleet-drivers/entities/fleet-driver.entity'
import { FleetAlertsService } from './fleet-alerts.service'
import { FleetAlertsController } from './fleet-alerts.controller'
```

Tambahkan `FleetDriverEntity,` ke array `TypeOrmModule.forFeature([...])` — service alert menanyakan repository sopir langsung. Tambahkan `FleetAlertsService,` ke `providers` dan `FleetAlertsController,` ke `controllers`.

- [ ] **Step 7: Jalankan seluruh test alert dan suite backend**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-alerts \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 15 test.

Run: `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS. Kedua flag wajib — tanpa keduanya box kehabisan RAM dan suite mati tanpa satu test pun gagal.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles
git commit -m "feat(fleet): serve the action list behind the vehicle read permission

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Frontend — tipe dan `useFleetAlerts`

**Files:**
- Modify: `apps/frontend/src/features/fleet/types.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetAlerts.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetAlerts.spec.tsx`

**Interfaces:**
- Consumes: `GET /fleet/alerts` (Task 2).
- Produces: tipe `FleetAlert`; `useFleetAlerts(limit?: number)` — dipakai Task 4.

- [ ] **Step 1: Tambahkan tipe**

Tambahkan ke `apps/frontend/src/features/fleet/types.ts`:

```ts
export const FLEET_ALERT_KINDS = ['document', 'sim'] as const
export type FleetAlertKind = (typeof FLEET_ALERT_KINDS)[number]

// daysLeft and severity arrive computed, for the reason every other date in this module does: the
// browser clock belongs to the user, and two operators must not see a different order.
export interface FleetAlert {
  kind: FleetAlertKind
  // Null for a licence held by a driver assigned to no vehicle — the row is still shown, it just
  // has nothing to open.
  vehicleId: string | null
  nopol: string | null
  merk: string | null
  tipe: string | null
  pool: string | null
  subjectId: string
  label: string
  expiresAt: string
  daysLeft: number
  severity: FleetSeverity
  driverName: string | null
}
```

- [ ] **Step 2: Tulis test hook**

Create `apps/frontend/src/features/fleet/hooks/useFleetAlerts.spec.tsx`. Salin harness `QueryClientProvider` dan mock `apiClient` dari `useFleetVehicles.spec.tsx` yang sudah ada — bacalah file itu dulu dan ikuti bentuknya persis.

```tsx
describe('useFleetAlerts', () => {
  it('reads the alert list', async () => {
    // apiClient.get resolves [{ kind: 'document', vehicleId: 'v1', nopol: 'B 9114 KYZ',
    //   subjectId: 'dt-1', label: 'KIR', expiresAt: '2026-09-20', daysLeft: 4, severity: 'warn' }]
    // Expect: apiClient.get called with '/fleet/alerts', { params: { limit: undefined } }
    //   and data[0].label === 'KIR'
  })

  it('passes the limit through', async () => {
    // Act: renderHook with limit 10
    // Expect: apiClient.get called with params { limit: 10 }
  })

  // Same wire-type convention the other fleet hooks document: frontend and backend deploy in
  // parallel, so a response missing a field must still render.
  it('defaults a field the backend did not send', async () => {
    // apiClient.get resolves [{ kind: 'document', subjectId: 's1', label: 'KIR',
    //   expiresAt: '2026-09-20', daysLeft: 4 }]
    // Expect: data[0].severity === 'warn', data[0].nopol === null, data[0].merk === null
  })

  it('reads an empty response as an empty list', async () => {
    // apiClient.get resolves undefined
    // Expect: data === []
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB useFleetAlerts \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — hook belum ada.

- [ ] **Step 4: Tulis hook**

Create `apps/frontend/src/features/fleet/hooks/useFleetAlerts.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { FleetAlert, FleetAlertKind, FleetSeverity } from '../types'

interface FleetAlertWire extends Partial<FleetAlert> {
  subjectId: string
  label: string
}

function normalizeAlert(row: FleetAlertWire): FleetAlert {
  return {
    kind: (row.kind as FleetAlertKind) ?? 'document',
    vehicleId: row.vehicleId ?? null,
    nopol: row.nopol ?? null,
    merk: row.merk ?? null,
    tipe: row.tipe ?? null,
    pool: row.pool ?? null,
    subjectId: row.subjectId,
    label: row.label,
    expiresAt: row.expiresAt ?? '',
    daysLeft: row.daysLeft ?? 0,
    // 'warn' rather than 'ok': the backend only ever puts a row in this list because it needs
    // attention, so a missing severity must not render as a green badge.
    severity: (row.severity as FleetSeverity) ?? 'warn',
    driverName: row.driverName ?? null,
  }
}

export function useFleetAlerts(limit?: number) {
  return useQuery<FleetAlertWire[], Error, FleetAlert[]>({
    queryKey: ['fleet', 'alerts', limit],
    queryFn: () => apiClient.get('/fleet/alerts', { params: { limit } }).then((r) => r.data),
    select: (rows) => (rows ?? []).map(normalizeAlert),
    staleTime: 30 * 1000,
  })
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB useFleetAlerts \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 4 test.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/fleet/types.ts apps/frontend/src/features/fleet/hooks/useFleetAlerts.ts apps/frontend/src/features/fleet/hooks/useFleetAlerts.spec.tsx
git commit -m "feat(fleet): read the action list without recomputing its dates

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `FleetAlertList` dan pemasangannya di halaman

**Files:**
- Create: `apps/frontend/src/features/fleet/components/FleetAlertList.tsx`
- Create: `apps/frontend/src/features/fleet/components/FleetAlertList.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`

**Interfaces:**
- Consumes: `useFleetAlerts` (Task 3), `formatTanggal` dari `utils/format-date.ts` (sudah ada).
- Produces: `<FleetAlertList alerts isLoading isError onOpen />`.

- [ ] **Step 1: Tulis test**

Create `apps/frontend/src/features/fleet/components/FleetAlertList.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FleetAlertList } from './FleetAlertList'
import { FleetAlert } from '../types'

function alert(over: Partial<FleetAlert> = {}): FleetAlert {
  return {
    kind: 'document',
    vehicleId: 'v1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter FE 74 HD',
    pool: 'Pool Cakung',
    subjectId: 'dt-1',
    label: 'KIR',
    expiresAt: '2026-09-20',
    daysLeft: 4,
    severity: 'warn',
    driverName: 'Ahmad Fauzi',
    ...over,
  }
}

const noop = () => {}

describe('FleetAlertList', () => {
  it('heads the section the way the prototype does', () => {
    render(<FleetAlertList alerts={[alert()]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByRole('heading', { name: /perlu tindakan/i })).toBeInTheDocument()
  })

  it('names the plate, the document and the unit beneath it', () => {
    render(<FleetAlertList alerts={[alert()]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
    expect(screen.getByText(/KIR/)).toBeInTheDocument()
    expect(screen.getByText(/Mitsubishi Canter FE 74 HD/)).toBeInTheDocument()
    expect(screen.getByText(/Pool Cakung/)).toBeInTheDocument()
  })

  // The count is what tells an operator whether the section is worth reading before they scroll.
  it('counts the rows in the subheading', () => {
    render(
      <FleetAlertList
        alerts={[alert(), alert({ subjectId: 'dt-2', label: 'STNK' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.getByText(/2 dokumen perlu diperpanjang/i)).toBeInTheDocument()
  })

  // Rendered from the server's number, never recomputed from the date in the browser.
  it('says how long is left, and how long it has been overdue', () => {
    const { rerender } = render(
      <FleetAlertList alerts={[alert({ daysLeft: 4 })]} isLoading={false} isError={false} onOpen={noop} />,
    )
    expect(screen.getByText(/4 hari lagi/i)).toBeInTheDocument()

    rerender(
      <FleetAlertList
        alerts={[alert({ daysLeft: -7, severity: 'crit' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.getByText(/lewat 7 hari/i)).toBeInTheDocument()
  })

  it('says today rather than zero days', () => {
    render(<FleetAlertList alerts={[alert({ daysLeft: 0 })]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByText(/hari ini/i)).toBeInTheDocument()
  })

  it('names the driver whose licence is expiring', () => {
    render(
      <FleetAlertList
        alerts={[alert({ kind: 'sim', label: 'SIM B2 Umum', subjectId: 'dr-1' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.getByText(/SIM B2 Umum/)).toBeInTheDocument()
    expect(screen.getByText(/Ahmad Fauzi/)).toBeInTheDocument()
  })

  it('opens the vehicle the row is about', async () => {
    const onOpen = jest.fn()
    render(<FleetAlertList alerts={[alert()]} isLoading={false} isError={false} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /B 9114 KYZ/ }))
    expect(onOpen).toHaveBeenCalledWith('v1')
  })

  // A licence with no unit attached has nothing to open, so it must not present itself as
  // clickable and then do nothing.
  it('does not offer to open a licence with no vehicle', () => {
    render(
      <FleetAlertList
        alerts={[alert({ kind: 'sim', vehicleId: null, nopol: null, subjectId: 'dr-1' })]}
        isLoading={false}
        isError={false}
        onOpen={noop}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says so when nothing needs attention', () => {
    render(<FleetAlertList alerts={[]} isLoading={false} isError={false} onOpen={noop} />)
    expect(screen.getByText(/tidak ada dokumen yang jatuh tempo/i)).toBeInTheDocument()
  })

  // The empty state is an affirmative claim that the papers are in order. During an outage that
  // claim is false, and an operator who believes it stops checking.
  it('reports a failure rather than claiming nothing is due', () => {
    render(<FleetAlertList alerts={[]} isLoading={false} isError onOpen={noop} />)
    expect(screen.queryByText(/tidak ada dokumen yang jatuh tempo/i)).not.toBeInTheDocument()
    expect(screen.getByText(/gagal memuat/i)).toBeInTheDocument()
  })

  it('shows a skeleton while loading, not an empty state', () => {
    render(<FleetAlertList alerts={[]} isLoading isError={false} onOpen={noop} />)
    expect(screen.queryByText(/tidak ada dokumen yang jatuh tempo/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('alert-skeleton')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB FleetAlertList \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Tulis komponen**

Create `apps/frontend/src/features/fleet/components/FleetAlertList.tsx`:

```tsx
'use client'

import { FleetAlert } from '../types'
import { formatTanggal } from '../utils/format-date'

interface Props {
  alerts: FleetAlert[]
  isLoading: boolean
  isError: boolean
  onOpen: (vehicleId: string) => void
}

// Built from the server's daysLeft, never from the date: the browser clock is the user's, and the
// whole module keeps date arithmetic on one side of the wire.
function sisaText(daysLeft: number): string {
  if (daysLeft < 0) return `lewat ${Math.abs(daysLeft)} hari`
  if (daysLeft === 0) return 'hari ini'
  return `${daysLeft} hari lagi`
}

export function FleetAlertList({ alerts, isLoading, isError, onOpen }: Props) {
  return (
    <section className="mb-6 rounded-lg border bg-card">
      <header className="flex items-baseline justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Perlu tindakan</h2>
        <span className="text-xs text-muted-foreground">
          {isLoading || isError
            ? ''
            : alerts.length > 0
              ? `${alerts.length} dokumen perlu diperpanjang`
              : 'ambang sesuai jenis dokumen'}
        </span>
      </header>

      {isLoading ? (
        <div data-testid="alert-skeleton" className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        // Never the empty state during an outage: "nothing is due" is an affirmative claim, and
        // an operator who believes it stops checking.
        <p className="p-4 text-sm text-muted-foreground">Gagal memuat daftar jatuh tempo.</p>
      ) : alerts.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Tidak ada dokumen yang jatuh tempo dalam ambang peringatan.
        </p>
      ) : (
        <ul className="divide-y">
          {alerts.map((alert) => {
            const tone =
              alert.severity === 'crit'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            const subtitle = [
              [alert.merk, alert.tipe].filter(Boolean).join(' '),
              alert.pool,
              alert.kind === 'sim' ? alert.driverName : null,
            ]
              .filter(Boolean)
              .join(' · ')

            const title = (
              <span className="font-medium tabular-nums">{alert.nopol ?? alert.driverName ?? '—'}</span>
            )

            return (
              <li
                key={`${alert.kind}-${alert.subjectId}-${alert.vehicleId ?? 'none'}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    alert.severity === 'crit' ? 'bg-destructive' : 'bg-amber-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  {/* A licence with no vehicle has nothing to open, so it is not made to look
                      clickable. */}
                  {alert.vehicleId ? (
                    <button
                      onClick={() => onOpen(alert.vehicleId as string)}
                      className="text-left hover:underline"
                    >
                      {title}
                      <span className="text-muted-foreground"> · {alert.label}</span>
                    </button>
                  ) : (
                    <span>
                      {title}
                      <span className="text-muted-foreground"> · {alert.label}</span>
                    </span>
                  )}
                  <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                </div>
                <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
                  {formatTanggal(alert.expiresAt)}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
                  {sisaText(alert.daysLeft)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB FleetAlertList \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS, 11 test.

- [ ] **Step 5: Pasang di halaman armada**

Di `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`, tambahkan import:

```ts
import { FleetAlertList } from '@/features/fleet/components/FleetAlertList'
import { useFleetAlerts } from '@/features/fleet/hooks/useFleetAlerts'
```

Tambahkan hook bersama hook lain:

```ts
  const { data: alerts, isLoading: alertsLoading, isError: alertsError } = useFleetAlerts(50)

  // Opens the unit the row is about. The vehicle may not be on the page the operator is looking
  // at, so the filters are reset to the plate rather than the row being looked up in `rows` —
  // searching finds it whatever page, filter or sort is active.
  const handleOpenAlert = (vehicleId: string) => {
    const match = rows.find((v) => v.id === vehicleId)
    if (match && canUpdate) {
      setModal({ type: 'edit', vehicle: match })
      return
    }
    setFilters({ page: 1, sort: 'severity', severity: undefined })
  }
```

Sisipkan section tepat di atas `<VehicleFilters …/>` (di dalam blok `tab === 'armada'` bila Phase 3 sudah mendarat; bila belum, langsung di atas `<VehicleFilters …/>`):

```tsx
      <FleetAlertList
        alerts={alerts ?? []}
        isLoading={alertsLoading}
        isError={alertsError}
        onOpen={handleOpenAlert}
      />
```

- [ ] **Step 6: Jalankan test halaman**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS — seluruh test fleet hijau. Jika `page.spec.tsx` gagal karena hook baru tidak ter-mock, tambahkan mock `useFleetAlerts` mengikuti cara file itu sudah me-mock `useFleetVehicles`.

- [ ] **Step 7: Jalankan seluruh test frontend dan lint**

Run: `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"`
Expected: PASS.

Run: `pnpm lint`
Expected: bersih, tanpa error baru.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(fleet): head the register with what needs renewing first

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verifikasi akhir Phase 4

- [ ] **Backend penuh:** `cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"` → PASS
- [ ] **Frontend penuh:** `cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/fleet-$$.log 2>&1; echo "EXIT=$?"` → PASS
- [ ] **Lint:** `pnpm lint` → bersih
- [ ] **Build:** `pnpm build` → sukses
- [ ] **Manual:** beri sebuah unit dokumen yang sudah lewat tanggal dan satu lagi yang jatuh tempo dalam seminggu — keduanya muncul di "Perlu tindakan", yang kedaluwarsa di atas.
- [ ] **Manual:** beri seorang sopir SIM yang hampir habis — barisnya muncul di daftar yang sama, tercampur berdasarkan urgensi, bukan dikelompokkan terpisah.
- [ ] **Manual:** ubah `warn_days` sebuah jenis dokumen di Master Data dari 30 ke 7 — dokumen yang jatuh tempo dalam 20 hari hilang dari daftar tanpa deploy.
- [ ] **Manual:** klik sebuah baris — kendaraan terkait terbuka.
- [ ] **Manual:** arsipkan sebuah unit yang dokumennya kedaluwarsa — barisnya hilang dari daftar.

**Phase 4 selesai bila:** dokumen dan SIM yang jatuh tempo dalam ambangnya masing-masing tampil terurut dari yang paling mendesak, dan mengkliknya membuka kendaraan terkait.
