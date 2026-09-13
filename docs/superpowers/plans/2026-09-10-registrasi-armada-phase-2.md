# Registrasi Armada Phase 2 — Registrasi Armada

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kendaraan bisa didaftarkan lengkap dengan dokumen dan masa berlakunya, dicari, disaring per severity, diurutkan, dipaginasi, dan diarsipkan — dengan seluruh perhitungan tanggal dikerjakan backend.

**Architecture:** Satu modul NestJS baru (`fleet-vehicles`) mengikuti pola `fleet-drivers` persis: entity TypeORM, service dengan repository injection, controller ber-`@Authorize`, DTO `class-validator`. Dua tabel (`fleet_vehicles`, `fleet_vehicle_documents`) plus satu view (`fleet_vehicle_document_status`) yang membuat filter severity jadi predikat SQL sehingga bekerja bersama pagination. Frontend menambah tab Armada ke `layout.tsx` yang sudah ada, dengan hooks React Query berprefiks `['fleet', 'vehicles', …]`.

**Tech Stack:** NestJS 10 · TypeORM · PostgreSQL 16 · Next.js App Router · React Query v5 · Tailwind · jest + ts-jest (backend) · jest + Testing Library (frontend)

**Spec:** `docs/superpowers/specs/2026-09-09-registrasi-armada-design.md` §2.4, §2.7, §2.8, §2.9, §3.3, §3.4, §3.7, §5 (Kendaraan), §6.2, §6.3, §6.4, §8, §9 (Phase 2)

## Global Constraints

- **Bahasa kode & komentar: Inggris.** Seluruh repo berbahasa Inggris; hanya label UI yang tampil ke operator berbahasa Indonesia. Jangan menulis komentar berbahasa Indonesia di dalam kode.
- **Komentar menjelaskan *kenapa*, bukan *apa*.** Komentar yang hanya mengulang kode akan ditolak saat review.
- **Gaya kode: ikuti file tetangga.** Repo ini tidak punya konfigurasi Prettier. Modul backend `fleet-*` dan seluruh `apps/frontend/src/features/**` + `apps/frontend/src/app/(dashboard)/fleet/**` ditulis **tanpa semicolon**; komponen lama di `apps/frontend/src/components/**` memakai semicolon. Semua contoh kode di plan ini sudah mengikuti aturan itu — salin apa adanya. Jalankan `pnpm lint` sebelum commit.
- **Perintah test backend WAJIB:** `cd apps/backend && pnpm test -- --runInBand <pattern>` untuk run terfokus. Untuk suite penuh: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`. Tanpa kedua flag ini box kehabisan RAM dan suite mati tanpa satu test pun gagal.
- **Perintah test frontend:** `cd apps/frontend && pnpm test <pattern>` — tanpa flag tambahan.
- **Migration:** `migrationsTransactionMode: 'all'`, jadi **jangan** pakai `CREATE INDEX CONCURRENTLY` (TypeORM menolaknya dengan `ForbiddenTransactionModeOverrideError` dan memblokir seluruh migration pending).
- **Entity auto-load:** `autoLoadEntities: true` di `app.module.ts` — entity terdaftar lewat `TypeOrmModule.forFeature` di module, tidak perlu didaftarkan manual.
- **QueryBuilder memakai nama properti, bukan nama kolom,** untuk alias entity: `v.isActive` diterjemahkan jadi `"v"."is_active"`. Alias non-entity (view `vs`) memakai nama kolom asli: `vs.severity_rank`.
- **`ValidationPipe` global:** `whitelist: true, forbidNonWhitelisted: true, transform: true`. Properti yang tidak dideklarasikan di DTO menghasilkan 400 yang menyebut namanya.
- **Permission sudah ada.** Keempat `*.fleet_vehicle` sudah di enum `Permission` sejak Phase 1 — Phase 2 tidak menambah permission baru dan tidak perlu me-rebuild `@esp/shared`.
- **Tidak ada kalkulasi tanggal di frontend.** Setiap `daysLeft` dan `severity` datang dari backend (§2.7). Frontend hanya memetakan severity ke warna dan label.

---

## File Structure

**Backend — baru**
```
apps/backend/src/database/migrations/20260910000001-fleet-vehicles.ts
apps/backend/src/database/migrations/20260910000002-fleet-vehicle-documents.ts

apps/backend/src/modules/fleet-vehicles/
  entities/fleet-vehicle.entity.ts            tabel fleet_vehicles
  entities/fleet-vehicle-document.entity.ts   tabel fleet_vehicle_documents
  fleet-vehicles.constants.ts                 severity + daftar sort yang sah
  fleet-severity.ts                           todayISO / daysUntil / severityFor / worstSeverity
  fleet-nopol.ts                              normalizeNopol
  fleet-vehicles.types.ts                     bentuk response (view model)
  dto/create-fleet-vehicle.dto.ts
  dto/update-fleet-vehicle.dto.ts
  dto/list-fleet-vehicles.dto.ts
  dto/replace-fleet-vehicle-documents.dto.ts
  fleet-vehicles.service.ts
  fleet-vehicles.controller.ts
  fleet-vehicles.module.ts
```

**Backend — dimodifikasi**
```
apps/backend/src/app.module.ts                                       daftarkan FleetVehiclesModule
apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts   5 kolom baru di REFERENCING_COLUMNS
apps/backend/src/modules/fleet-drivers/fleet-drivers.service.ts      hapus jadi arsip bila sopir dipakai
apps/backend/src/modules/fleet-drivers/fleet-drivers.module.ts       —  (tidak berubah; DataSource global)
```

**Frontend — baru**
```
apps/frontend/src/features/fleet/utils/severity.ts
apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts
apps/frontend/src/features/fleet/components/VehicleFilters.tsx
apps/frontend/src/features/fleet/components/VehicleTable.tsx
apps/frontend/src/features/fleet/components/VehicleDocumentsFieldset.tsx
apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx
apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx
```

**Frontend — dimodifikasi**
```
apps/frontend/src/features/fleet/types.ts                    tipe kendaraan + dokumen
apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts    opsi `enabled` (Task 0)
apps/frontend/src/features/fleet/components/DriverFormDialog.tsx  catatan master data tak tersedia (Task 0)
apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx     gate master data, cabang error, reset banner (Task 0)
apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx bersihkan banner saat ganti tab (Task 0)
apps/frontend/src/app/(dashboard)/fleet/layout.tsx           tab Armada
apps/frontend/src/app/(dashboard)/fleet/layout.spec.tsx      assertion tab Armada
apps/frontend/src/app/(dashboard)/fleet/page.tsx             redirect ke /fleet/vehicles
```

**Backend — Task 0**
```
apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.spec.ts   baru: pin 8 kategori
apps/backend/src/database/migrations/20260909000001-fleet-master-data.ts         komentar menyesatkan
```

---

## Task 0: Bayar utang Phase 1 (I2, I3, I4, M2)

Empat temuan yang di-carry dari review akhir Phase 1. Dikerjakan lebih dulu karena Task 6 dan Task 9 membangun di atas hook dan halaman yang sama — memperbaikinya belakangan berarti menulis ulang kode yang baru saja ditulis.

**I2 adalah yang paling mahal:** `useFleetMasterDataByCategory` dipanggil tanpa syarat, padahal `GET /fleet/master-data` dijaga `READ_FLEET_MASTER_DATA`. Operator lapangan yang hanya punya `read.fleet_vehicle` — persona yang justru menjadi alasan pemisahan permission di spec §7 — mendapat 403 diam-diam dan dropdown kosong tanpa penjelasan.

**Files:**
- Modify: `apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts` (`useFleetMasterDataByCategory`)
- Modify: `apps/frontend/src/features/fleet/hooks/useFleetDrivers.spec.ts`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/drivers/page.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx`
- Create: `apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.spec.ts`

**Interfaces:**
- Produces: `useFleetMasterDataByCategory(category, opts?: { enabled?: boolean })` — Task 6 dan Task 9 memakai bentuk dua-argumen ini.

- [ ] **Step 1: Tulis test hook `enabled` yang gagal**

Di `apps/frontend/src/features/fleet/hooks/useFleetDrivers.spec.ts`, tambahkan di dalam `describe` yang sudah menguji `useFleetMasterDataByCategory` (kalau belum ada, buat `describe('useFleetMasterDataByCategory')` baru):

```tsx
  // The endpoint is gated by READ_FLEET_MASTER_DATA while the page is gated by
  // READ_FLEET_VEHICLE. Firing the query for someone who lacks the master-data permission
  // spends a guaranteed 403 and leaves the dropdown silently empty.
  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useFleetMasterDataByCategory('jenis_sim', { enabled: false }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mocked.get).not.toHaveBeenCalled()
  })

  it('fetches when enabled is not given', async () => {
    mocked.get.mockResolvedValue({ data: [] })
    const { result } = renderHook(() => useFleetMasterDataByCategory('jenis_sim'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/master-data', {
      params: { category: 'jenis_sim' },
    })
  })

  it('fetches when explicitly enabled', async () => {
    mocked.get.mockResolvedValue({ data: [] })
    const { result } = renderHook(
      () => useFleetMasterDataByCategory('jenis_sim', { enabled: true }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalled()
  })
```

Sesuaikan nama `mocked` / `wrapper` dengan yang sudah dipakai file itu; jangan buat helper baru kalau sudah ada.

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB useFleetDrivers \
  >/tmp/t0-s2.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT!=0 — `'does not fetch when disabled'` gagal karena argumen kedua diabaikan, jadi query tetap jalan.

- [ ] **Step 3: Tambahkan opsi `enabled` ke hook**

Di `apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts`, ganti `useFleetMasterDataByCategory`:

```ts
// GET /fleet/master-data is gated by READ_FLEET_MASTER_DATA, but the pages that need these
// dropdowns are gated by READ_FLEET_VEHICLE — spec §7 splits them on purpose so a field
// operator can register vehicles without editing the lookup lists. Callers pass enabled so
// that persona spends no request and can be told the lists are unavailable, instead of
// staring at an empty dropdown.
export function useFleetMasterDataByCategory(
  category: FleetMasterCategory,
  opts: { enabled?: boolean } = {},
) {
  return useQuery<FleetMasterRow[]>({
    queryKey: ['fleet', 'master-data', category],
    queryFn: () =>
      apiClient.get('/fleet/master-data', { params: { category } }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: opts.enabled ?? true,
  })
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB useFleetDrivers \
  >/tmp/t0-s4.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT=0.

- [ ] **Step 5: Tulis test halaman Sopir yang gagal (I2, I3, M2)**

Di `apps/frontend/src/app/(dashboard)/fleet/drivers/page.spec.tsx`, tambahkan tiga kelompok test. Ikuti cara file itu sudah memalsukan `usePermissions` dan hook-nya — jangan buat pola mock baru.

```tsx
  // I2 — the persona spec §7 designs the split for. Without the gate this operator sends a
  // request that is guaranteed to 403 and gets an empty dropdown with no explanation.
  it('does not query master data without read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle', 'create.fleet_vehicle']
    render(<FleetDriversPage />)
    expect(mockUseFleetMasterDataByCategory).toHaveBeenCalledWith('jenis_sim', { enabled: false })
  })

  it('queries master data with read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle', 'read.fleet_master_data']
    render(<FleetDriversPage />)
    expect(mockUseFleetMasterDataByCategory).toHaveBeenCalledWith('jenis_sim', { enabled: true })
  })

  // Silence is the bug: an operator who cannot see why the licence-class field is empty will
  // report the form as broken.
  it('explains why the licence class list is unavailable', () => {
    permissions = ['read.fleet_vehicle', 'create.fleet_vehicle']
    render(<FleetDriversPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah sopir/i }))
    expect(screen.getByText(/jenis sim tidak tersedia/i)).toBeInTheDocument()
  })

  // I3 — "Belum ada sopir terdaftar." during an outage is an affirmative false statement. The
  // operator concludes the register is empty and starts re-entering data that already exists.
  it('reports a failed load instead of showing an empty register', () => {
    driversResult = { data: undefined, isLoading: false, isError: true, refetch: jest.fn() }
    render(<FleetDriversPage />)
    expect(screen.getByText(/gagal memuat data sopir/i)).toBeInTheDocument()
    expect(screen.queryByText(/belum ada sopir terdaftar/i)).not.toBeInTheDocument()
  })

  it('retries the load on demand', () => {
    const refetch = jest.fn()
    driversResult = { data: undefined, isLoading: false, isError: true, refetch }
    render(<FleetDriversPage />)
    fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }))
    expect(refetch).toHaveBeenCalled()
  })

  // M2 — a SUCCESSFUL retry after a failed delete must not leave the old error on screen; the
  // operator reads it as "it failed again".
  it('clears a stale delete error when the retry succeeds', async () => {
    mutations.remove.mockRejectedValueOnce({
      response: { data: { message: 'Sopir masih ditugaskan' } },
    })
    render(<FleetDriversPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hapus' }))
    expect(await screen.findByText(/masih ditugaskan/i)).toBeInTheDocument()

    mutations.remove.mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hapus' }))
    await waitFor(() => expect(screen.queryByText(/masih ditugaskan/i)).not.toBeInTheDocument())
  })
```

Tiga hal yang mungkin perlu disesuaikan di bagian mock file itu, dan semuanya wajib:
- `useFleetMasterDataByCategory` harus dimock lewat variabel `jest.fn()` yang bisa di-assert (`mockUseFleetMasterDataByCategory`), bukan arrow function anonim.
- `useFleetDrivers` harus mengembalikan objek yang bisa diganti per test (`driversResult`), dan objek default-nya sekarang menyertakan `isError: false` dan `refetch: jest.fn()`.
- `within` diimpor dari `@testing-library/react` kalau belum.

- [ ] **Step 6: Jalankan test, pastikan gagal**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB 'fleet/drivers/page' \
  >/tmp/t0-s6.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT!=0. Konfirmasi `Test Suites: 1 failed` — pola tanpa tanda kurung ini aman, tapi tetap cek jumlah suite-nya.

- [ ] **Step 7: Perbaiki halaman Sopir**

Di `apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx`:

Tambahkan `canReadMaster` bersama boolean permission lainnya, dan teruskan ke hook:

```tsx
  const canCreate = hasPermission('create.fleet_vehicle')
  const canUpdate = hasPermission('update.fleet_vehicle')
  const canDelete = hasPermission('delete.fleet_vehicle')
  // Spec §7 keeps master data behind its own permission, so this list is not guaranteed to the
  // operator looking at this page.
  const canReadMaster = hasPermission('read.fleet_master_data')

  const { data: drivers, isLoading, isError, refetch } = useFleetDrivers({ q })
  const { data: simTypes } = useFleetMasterDataByCategory('jenis_sim', { enabled: canReadMaster })
```

Perhatikan urutannya: `canReadMaster` harus dideklarasikan sebelum baris hook yang memakainya, jadi pindahkan blok permission ke atas blok hook.

Teruskan catatan ketidaktersediaan ke dialog:

```tsx
      <DriverFormDialog
        …
        simTypes={simTypes ?? []}
        simTypesUnavailable={!canReadMaster}
      />
```

Bungkus tabel dengan cabang error, mengikuti preseden `barhal/dashboard/page.tsx`:

```tsx
      {isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Gagal memuat data sopir.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Coba lagi
          </button>
        </div>
      ) : (
        <DataTable
          …
        />
      )}
```

Dan tambahkan reset banner di `onConfirm`, tepat sebelum `try`:

```tsx
        onConfirm={async () => {
          if (modal?.type !== 'delete') return
          // A successful retry must not leave the previous failure on screen — the operator
          // reads a stale banner as "it failed again".
          setDeleteError(null)
          // ConfirmDialog does not catch, so a rejected mutation would surface as an unhandled
          // rejection and the dialog would stay open with no explanation.
          try {
```

- [ ] **Step 8: Tambahkan catatan ketidaktersediaan ke `DriverFormDialog`**

Di `apps/frontend/src/features/fleet/components/DriverFormDialog.tsx`, tambahkan prop opsional ke interface props-nya:

```tsx
  simTypesUnavailable?: boolean
```

destrukturisasi dengan default `false`, dan render tepat di bawah field Jenis SIM:

```tsx
        {simTypesUnavailable && (
          <p className="text-xs text-muted-foreground">
            Daftar Jenis SIM tidak tersedia — butuh izin akses master data.
          </p>
        )}
```

Prop opsional dengan default `false` supaya pemanggil lain tidak berubah.

- [ ] **Step 9: Jalankan test halaman Sopir dan dialog, pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  'fleet/drivers/page' DriverFormDialog useFleetDrivers \
  >/tmp/t0-s9.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT=0, `Test Suites: 3 passed`.

- [ ] **Step 10: Tulis test M2 untuk halaman Master Data**

`master-data/page.tsx` sudah memanggil `setDeleteError(null)` sebelum retry, jadi sisi itu benar. Yang belum: banner tidak dibersihkan saat berpindah tab, sehingga error dari kategori lain menempel di kategori baru.

Di `apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx`:

```tsx
  // The banner names a row in the category the operator just left. Carrying it into a new tab
  // attributes the failure to the wrong data.
  it('clears the delete error when switching category', async () => {
    mutations.remove.mockRejectedValueOnce({
      response: { data: { message: 'Masih dipakai 3 kendaraan' } },
    })
    render(<FleetMasterDataPage />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Hapus' })[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hapus' }))
    expect(await screen.findByText(/masih dipakai/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Pool' }))
    expect(screen.queryByText(/masih dipakai/i)).not.toBeInTheDocument()
  })
```

Sesuaikan nama mock mutasi dengan yang dipakai file itu.

- [ ] **Step 11: Jalankan test, pastikan gagal, lalu perbaiki**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB 'fleet/master-data/page' \
  >/tmp/t0-s11.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT!=0.

Lalu di `apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx`, ganti handler tab-nya:

```tsx
            onClick={() => {
              setCategory(c)
              // The banner names a row in the category being left behind.
              setDeleteError(null)
            }}
```

Jalankan lagi perintah yang sama; Expected: EXIT=0.

- [ ] **Step 12: Tulis test I4 yang gagal**

`apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.spec.ts`:

```ts
import { FLEET_MASTER_CATEGORIES } from './fleet-master-data.constants'

// The eight categories are stated three times: this constant, the CHECK constraint in
// 20260909000001-fleet-master-data.ts, and the frontend's own copy in features/fleet/types.ts.
// Only the frontend copy is protected, and only by tsc. Adding a ninth here leaves jest and tsc
// green while @IsIn accepts it, the insert hits the CHECK, and the admin gets a 500 — and the
// migration's header comment actively invites that edit by claiming a ninth dropdown needs no
// migration. This test is the tripwire: changing the list without changing the constraint fails
// here first.
describe('FLEET_MASTER_CATEGORIES', () => {
  it('matches ck_fleet_master_data_category exactly', () => {
    expect([...FLEET_MASTER_CATEGORIES]).toEqual([
      'jenis_armada',
      'kepemilikan',
      'leasing',
      'status_kendaraan',
      'pool',
      'jenis_dokumen',
      'jenis_berkas',
      'jenis_sim',
    ])
  })
})
```

- [ ] **Step 13: Jalankan dan pastikan lulus**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet-master-data.constants \
  >/tmp/t0-s13.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT=0, 1 test. Test ini lulus sejak awal — itu memang gunanya sebuah tripwire; nilainya ada pada kegagalannya nanti, bukan sekarang. Buktikan gigitannya di Step 14.

- [ ] **Step 14: Perbarui komentar migration yang menyesatkan**

Di `apps/backend/src/database/migrations/20260909000001-fleet-master-data.ts`, klaim "adding a ninth dropdown later needs no migration at all" itu salah — CHECK constraint-nya justru butuh migration. Cari kalimat itu dan ganti menjadi:

```
     * Adding a ninth dropdown needs BOTH this CHECK constraint altered by a new migration and
     * FLEET_MASTER_CATEGORIES extended; fleet-master-data.constants.spec.ts fails first if only
     * one side moves.
```

Sesuaikan indentasi dan gaya komentar dengan blok di sekitarnya.

Lalu buktikan test Step 12 menggigit — tambahkan kategori kesembilan ke konstanta, jalankan, konfirmasi EXIT!=0, lalu `git checkout --` file konstanta itu:

```bash
cd /home/faris/code/esp/esp-dashboard && \
  sed -i "s/^  'jenis_sim',$/  'jenis_sim',\n  'jenis_tempel',/" \
  apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.ts && \
  git diff --numstat apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.ts
```

Expected: `1 0`. Lalu jalankan test-nya (Expected: EXIT!=0), lalu:

```bash
cd /home/faris/code/esp/esp-dashboard && \
  git checkout -- apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.ts && \
  git diff --numstat apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.ts
```

Expected: tidak ada output — pohon kerja bersih lagi.

- [ ] **Step 15: Jalankan seluruh suite fleet kedua app**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet \
  >/tmp/t0-fe.log 2>&1; echo "EXIT=$?"
```

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB fleet \
  >/tmp/t0-be.log 2>&1; echo "EXIT=$?"
```

Expected: keduanya EXIT=0. Tidak ada suite Phase 1 yang boleh merah — kalau ada, hook dua-argumen itu memutus pemanggil yang belum diperbarui.

- [ ] **Step 16: Typecheck**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm exec tsc --noEmit; echo "EXIT=$?"
```

Expected: EXIT=0.

- [ ] **Step 17: Commit**

```bash
cd /home/faris/code/esp/esp-dashboard
git add apps/frontend/src/features/fleet/hooks/useFleetDrivers.ts \
        apps/frontend/src/features/fleet/hooks/useFleetDrivers.spec.ts \
        apps/frontend/src/features/fleet/components/DriverFormDialog.tsx \
        "apps/frontend/src/app/(dashboard)/fleet/drivers/page.tsx" \
        "apps/frontend/src/app/(dashboard)/fleet/drivers/page.spec.tsx" \
        "apps/frontend/src/app/(dashboard)/fleet/master-data/page.tsx" \
        "apps/frontend/src/app/(dashboard)/fleet/master-data/page.spec.tsx" \
        apps/backend/src/modules/fleet-master-data/fleet-master-data.constants.spec.ts \
        apps/backend/src/database/migrations/20260909000001-fleet-master-data.ts
git commit -m "fix(fleet): gate master-data queries and surface load failures

Pays four findings carried from the Phase 1 review: the master-data dropdown
queries now respect read.fleet_master_data instead of spending a guaranteed
403, a failed list load says so instead of claiming the register is empty,
stale delete banners clear on retry and on tab switch, and the eight master
categories are pinned against the CHECK constraint they must match.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 1: Migration, entity & konstanta

Dua tabel, satu view, dua entity, dan tiga file kecil berisi tipe + helper murni yang dipakai task berikutnya.

**Files:**
- Create: `apps/backend/src/database/migrations/20260910000001-fleet-vehicles.ts`
- Create: `apps/backend/src/database/migrations/20260910000002-fleet-vehicle-documents.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/entities/fleet-vehicle.entity.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/entities/fleet-vehicle-document.entity.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.constants.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`

**Interfaces:**
- Consumes: `FleetMasterDataEntity`, `FleetDriverEntity` (Phase 1).
- Produces: `FleetVehicleEntity`, `FleetVehicleDocumentEntity`, `FLEET_SEVERITIES`, `FleetSeverity`, `FLEET_VEHICLE_SORTS`, `FleetVehicleSort`, `FleetMasterRef`, `FleetVehicleDocumentView`, `FleetVehicleDriverView`, `FleetVehicleView`, `FleetVehicleListResult`.

- [ ] **Step 1: Tulis migration `fleet_vehicles`**

`apps/backend/src/database/migrations/20260910000001-fleet-vehicles.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

// The vehicle register itself.
//
// The partial unique index on nopol is the point of interest. `is_active` is the *registration*
// status, not the operational one: a unit parked waiting for its KIR renewal has
// status_id -> "Nonaktif" but is still is_active = TRUE and still holds its plate. Only an
// archived unit — sold, or handed back at the end of a rental — releases the plate for another
// vehicle to take. Modelling both as one column would mean a parked unit's plate could be
// reused underneath it.
//
// Master-data FKs are RESTRICT, matching the 409 FleetMasterDataService.remove already raises.
// driver_id is SET NULL instead: a driver leaving the company should not block archiving, and a
// vehicle with no driver is a legitimate state the form already allows.
export class FleetVehicles20260910000001 implements MigrationInterface {
  name = 'FleetVehicles20260910000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fleet_vehicles (
        id              UUID         NOT NULL DEFAULT gen_random_uuid(),
        nopol           VARCHAR(20)  NOT NULL,
        merk            VARCHAR(60),
        tipe            VARCHAR(60),
        tahun           INT,
        kapasitas       VARCHAR(60),
        no_rangka       VARCHAR(60),
        no_mesin        VARCHAR(60),
        no_bpkb         VARCHAR(60),
        pemilik_unit    VARCHAR(120),
        odometer        INT,
        catatan         TEXT,
        jenis_armada_id UUID,
        kepemilikan_id  UUID,
        pool_id         UUID,
        status_id       UUID,
        driver_id       UUID,
        is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_fleet_vehicles" PRIMARY KEY (id),
        CONSTRAINT "fk_fleet_vehicles_jenis_armada"
          FOREIGN KEY (jenis_armada_id) REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_kepemilikan"
          FOREIGN KEY (kepemilikan_id)  REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_pool"
          FOREIGN KEY (pool_id)         REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_status"
          FOREIGN KEY (status_id)       REFERENCES fleet_master_data(id) ON DELETE RESTRICT,
        CONSTRAINT "fk_fleet_vehicles_driver"
          FOREIGN KEY (driver_id)       REFERENCES fleet_drivers(id)     ON DELETE SET NULL
      )
    `)

    // Follows uq_invitations_org_email_pending: the constraint only binds rows that are still
    // live, so an archived unit's plate stops colliding the moment it is archived.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_fleet_vehicles_nopol_active"
        ON fleet_vehicles (nopol) WHERE is_active
    `)

    // The default list: active units ordered by plate.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_active_nopol
        ON fleet_vehicles (is_active, nopol)
    `)

    // Serves the driver-archive probe in FleetDriversService.remove, which asks whether any
    // vehicle still points at a driver.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_driver
        ON fleet_vehicles (driver_id) WHERE driver_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fleet_vehicles`)
  }
}
```

- [ ] **Step 2: Tulis migration `fleet_vehicle_documents` + view**

`apps/backend/src/database/migrations/20260910000002-fleet-vehicle-documents.ts`:

```ts
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

    // uq_fleet_vehicle_documents_current covers the current-document lookup, but the renewal
    // history — every row for one vehicle, is_current or not — is the reason this table keeps
    // superseded rows at all, and without this index that query is a sequential scan. Matches
    // the @Index on FleetVehicleDocumentEntity; the decorator alone creates nothing under
    // synchronize: false.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fleet_vehicle_documents_vehicle
        ON fleet_vehicle_documents (vehicle_id, is_current)
    `)

    // severity_rank is numeric rather than a label so MIN() yields the worst severity and
    // ORDER BY sorts correctly with no CASE at the call site. 30 is the same fallback
    // DEFAULT_WARN_DAYS carries in fleet-master-data.constants.ts; fleet-severity.ts repeats
    // this ladder in TypeScript and the two must stay in step.
    //
    // NOT CURRENT_DATE. node-postgres negotiates the session at Etc/UTC regardless of the
    // container's TZ, so CURRENT_DATE would be the UTC day: every morning from 00:00 to 07:00
    // WIB it still reads yesterday, and an operator checking a certificate that expires today
    // would be told it expires tomorrow. The fleet runs on the Jakarta business day, so the
    // comparison names that zone explicitly instead of depending on a server setting no
    // reader of this file can see. fleet-severity.ts's todayISO() resolves the same day.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW fleet_vehicle_document_status AS
      SELECT
        d.vehicle_id,
        MIN(d.expires_at - (now() AT TIME ZONE 'Asia/Jakarta')::date) AS min_days_left,
        MIN(CASE
              WHEN d.expires_at < (now() AT TIME ZONE 'Asia/Jakarta')::date THEN 0
              WHEN d.expires_at - (now() AT TIME ZONE 'Asia/Jakarta')::date
                     <= COALESCE(m.warn_days, 30)                          THEN 1
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
```

- [ ] **Step 3: Tulis entity kendaraan**

`apps/backend/src/modules/fleet-vehicles/entities/fleet-vehicle.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'
import { FleetDriverEntity } from '../../fleet-drivers/entities/fleet-driver.entity'
import { FleetVehicleDocumentEntity } from './fleet-vehicle-document.entity'

@Entity('fleet_vehicles')
@Index('idx_fleet_vehicles_active_nopol', ['isActive', 'nopol'])
export class FleetVehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 20 })
  nopol: string

  @Column({ length: 60, nullable: true })
  merk: string | null

  @Column({ length: 60, nullable: true })
  tipe: string | null

  @Column({ type: 'int', nullable: true })
  tahun: number | null

  // Free text on purpose: operators write "8 ton / 24 m3", which no numeric column captures.
  @Column({ length: 60, nullable: true })
  kapasitas: string | null

  @Column({ name: 'no_rangka', length: 60, nullable: true })
  noRangka: string | null

  @Column({ name: 'no_mesin', length: 60, nullable: true })
  noMesin: string | null

  @Column({ name: 'no_bpkb', length: 60, nullable: true })
  noBpkb: string | null

  @Column({ name: 'pemilik_unit', length: 120, nullable: true })
  pemilikUnit: string | null

  @Column({ type: 'int', nullable: true })
  odometer: number | null

  @Column({ type: 'text', nullable: true })
  catatan: string | null

  @Column({ name: 'jenis_armada_id', type: 'uuid', nullable: true })
  jenisArmadaId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'jenis_armada_id' })
  jenisArmada?: FleetMasterDataEntity | null

  @Column({ name: 'kepemilikan_id', type: 'uuid', nullable: true })
  kepemilikanId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'kepemilikan_id' })
  kepemilikan?: FleetMasterDataEntity | null

  @Column({ name: 'pool_id', type: 'uuid', nullable: true })
  poolId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pool_id' })
  pool?: FleetMasterDataEntity | null

  @Column({ name: 'status_id', type: 'uuid', nullable: true })
  statusId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'status_id' })
  status?: FleetMasterDataEntity | null

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null

  @ManyToOne(() => FleetDriverEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driver_id' })
  driver?: FleetDriverEntity | null

  // Registration status, not operational status — see the migration's comment.
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean

  @OneToMany(() => FleetVehicleDocumentEntity, (doc) => doc.vehicle)
  documents?: FleetVehicleDocumentEntity[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 4: Tulis entity dokumen**

`apps/backend/src/modules/fleet-vehicles/entities/fleet-vehicle-document.entity.ts`:

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
import { FleetVehicleEntity } from './fleet-vehicle.entity'

@Entity('fleet_vehicle_documents')
@Index('idx_fleet_vehicle_documents_vehicle', ['vehicleId', 'isCurrent'])
export class FleetVehicleDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(() => FleetVehicleEntity, (v) => v.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: FleetVehicleEntity

  @Column({ name: 'doc_type_id', type: 'uuid' })
  docTypeId: string

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doc_type_id' })
  docType?: FleetMasterDataEntity

  @Column({ length: 80, nullable: true })
  nomor: string | null

  // `date`, not `timestamptz`: a certificate expires on a calendar day, and storing an instant
  // would shift the expiry by timezone. TypeORM hands these back as 'YYYY-MM-DD' strings.
  @Column({ name: 'issued_at', type: 'date', nullable: true })
  issuedAt: string | null

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt: string | null

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 5: Tulis konstanta**

`apps/backend/src/modules/fleet-vehicles/fleet-vehicles.constants.ts`:

```ts
// 'none' is a vehicle with no dated current document at all — distinct from 'ok', which means
// every document is dated and comfortably in the future.
export const FLEET_SEVERITIES = ['crit', 'warn', 'ok', 'none'] as const

export type FleetSeverity = (typeof FLEET_SEVERITIES)[number]

// A closed list, not free text: ?sort= reaches ORDER BY, so anything unlisted must be rejected
// by the DTO rather than interpolated.
export const FLEET_VEHICLE_SORTS = ['nopol', '-nopol', 'severity', 'tahun', '-tahun'] as const

export type FleetVehicleSort = (typeof FLEET_VEHICLE_SORTS)[number]

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
```

- [ ] **Step 6: Tulis tipe response**

`apps/backend/src/modules/fleet-vehicles/fleet-vehicles.types.ts`:

```ts
import { FleetSeverity } from './fleet-vehicles.constants'

export interface FleetMasterRef {
  id: string
  label: string
}

export interface FleetVehicleDocumentView {
  docTypeId: string
  code: string
  label: string
  nomor: string | null
  issuedAt: string | null
  expiresAt: string | null
  daysLeft: number | null
  severity: FleetSeverity
}

export interface FleetVehicleDriverView {
  id: string
  nama: string
  simExpiresAt: string | null
  simDaysLeft: number | null
  simSeverity: FleetSeverity
}

// berkasCount and activeContract are deliberately absent until Phase 3, when their tables
// exist. The frontend wire type marks them optional, so switching them on later adds a field
// rather than breaking the contract.
export interface FleetVehicleView {
  id: string
  nopol: string
  merk: string | null
  tipe: string | null
  tahun: number | null
  kapasitas: string | null
  noRangka: string | null
  noMesin: string | null
  noBpkb: string | null
  pemilikUnit: string | null
  odometer: number | null
  catatan: string | null
  jenisArmada: FleetMasterRef | null
  kepemilikan: FleetMasterRef | null
  pool: FleetMasterRef | null
  status: FleetMasterRef | null
  driver: FleetVehicleDriverView | null
  documents: FleetVehicleDocumentView[]
  worstSeverity: FleetSeverity
  minDaysLeft: number | null
  isActive: boolean
}

export interface FleetVehicleListResult {
  rows: FleetVehicleView[]
  total: number
  page: number
  pageSize: number
}
```

- [ ] **Step 7: Pastikan TypeScript bersih**

Run: `cd apps/backend && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: exit 0, tidak ada error.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/database/migrations/20260910000001-fleet-vehicles.ts \
        apps/backend/src/database/migrations/20260910000002-fleet-vehicle-documents.ts \
        apps/backend/src/modules/fleet-vehicles/
git commit -m "feat(fleet): add vehicle and document tables with status view

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Helper murni — normalisasi nopol & severity (TDD)

Dua file tanpa dependency apa pun, ditulis test-first. Keduanya adalah tempat bug paling mudah menyelinap dan paling murah dikunci.

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-nopol.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-nopol.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-severity.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-severity.spec.ts`

**Interfaces:**
- Consumes: `FleetSeverity`, `FLEET_SEVERITIES` dari `fleet-vehicles.constants.ts` (Task 1).
- Produces:
  - `normalizeNopol(raw: string): string`
  - `todayISO(): string`
  - `daysUntil(dateISO: string | null, todayISOValue?: string): number | null`
  - `severityFor(daysLeft: number | null, warnDays: number | null): FleetSeverity`
  - `worstSeverity(list: FleetSeverity[]): FleetSeverity`
  - `SEVERITY_RANK: Record<FleetSeverity, number>`

- [ ] **Step 1: Tulis test normalisasi nopol yang gagal**

`apps/backend/src/modules/fleet-vehicles/fleet-nopol.spec.ts`:

```ts
import { normalizeNopol } from './fleet-nopol'

describe('normalizeNopol', () => {
  it('uppercases and collapses runs of whitespace to one space', () => {
    expect(normalizeNopol('b  9114   kyz')).toBe('B 9114 KYZ')
  })

  it('leaves an already-normalised plate untouched', () => {
    expect(normalizeNopol('B 9114 KYZ')).toBe('B 9114 KYZ')
  })

  it('trims the ends', () => {
    expect(normalizeNopol('  b 9114 kyz  ')).toBe('B 9114 KYZ')
  })

  // Tabs and newlines reach the field through copy-paste from a spreadsheet. Collapsing only
  // literal spaces would let "B\t9114" past the unique index as a different plate.
  it('treats tabs and newlines as whitespace', () => {
    expect(normalizeNopol('b\t9114\nkyz')).toBe('B 9114 KYZ')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeNopol('   ')).toBe('')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-nopol`
Expected: FAIL — `Cannot find module './fleet-nopol'`.

- [ ] **Step 3: Tulis implementasi minimal**

`apps/backend/src/modules/fleet-vehicles/fleet-nopol.ts`:

```ts
// Normalised on write so the partial unique index actually catches duplicates. Without this
// "b  9114 kyz" and "B 9114 KYZ" are two distinct rows and the register grows a second copy of
// a truck it already has. \s covers tabs and newlines, which arrive via spreadsheet paste.
export function normalizeNopol(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-nopol`
Expected: PASS, 5 test.

- [ ] **Step 5: Tulis test severity yang gagal**

`apps/backend/src/modules/fleet-vehicles/fleet-severity.spec.ts`:

```ts
import { daysUntil, severityFor, todayISO, worstSeverity } from './fleet-severity'

describe('todayISO', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // The whole point of this function is the zone. A UTC implementation passes the shape test
  // above and is still wrong for seven hours of every Jakarta day, so pin the zone directly:
  // 17:30 UTC is already the next day in WIB (UTC+7).
  it('uses the Jakarta day, not the UTC day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T17:30:00Z'))
    try {
      expect(todayISO()).toBe('2026-09-11')
    } finally {
      jest.useRealTimers()
    }
  })

  it('agrees with UTC when the two zones are on the same day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T03:00:00Z'))
    try {
      expect(todayISO()).toBe('2026-09-10')
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('daysUntil', () => {
  it('counts whole days forward', () => {
    expect(daysUntil('2026-09-20', '2026-09-10')).toBe(10)
  })

  it('returns zero on the expiry date itself', () => {
    expect(daysUntil('2026-09-10', '2026-09-10')).toBe(0)
  })

  it('goes negative once the date has passed', () => {
    expect(daysUntil('2026-09-03', '2026-09-10')).toBe(-7)
  })

  it('returns null for a document with no expiry date', () => {
    expect(daysUntil(null, '2026-09-10')).toBeNull()
  })

  // Both endpoints are parsed as UTC midnight, so a month boundary and a DST shift in the
  // server's local zone cannot round the difference to 9 or 11 days.
  it('crosses a month boundary exactly', () => {
    expect(daysUntil('2026-10-01', '2026-09-30')).toBe(1)
  })
})

describe('severityFor', () => {
  it('marks a past date critical', () => {
    expect(severityFor(-1, 30)).toBe('crit')
  })

  // The expiry day itself is still a valid day: the view says `WHEN d.expires_at < today THEN 0`,
  // so a document expiring today lands on rank 1, not 0. If this flipped to crit, ?severity=crit
  // would hide the very rows the badge paints red.
  it('warns on the expiry day itself rather than marking it critical', () => {
    expect(severityFor(0, 30)).toBe('warn')
  })

  // The boundary the spec calls out: warnDays is inclusive, so exactly warnDays away is amber,
  // and one day further out is green.
  it('warns exactly on the warnDays boundary', () => {
    expect(severityFor(30, 30)).toBe('warn')
  })

  it('is ok one day beyond the boundary', () => {
    expect(severityFor(31, 30)).toBe('ok')
  })

  it('honours a per-type threshold shorter than the default', () => {
    expect(severityFor(20, 14)).toBe('ok')
    expect(severityFor(14, 14)).toBe('warn')
  })

  // A document type whose warn_days was never set falls back to 30 — the same constant the
  // status view's COALESCE uses. If the two drift the list and the filter disagree.
  it('falls back to 30 days when the type has no threshold', () => {
    expect(severityFor(30, null)).toBe('warn')
    expect(severityFor(31, null)).toBe('ok')
  })

  it('reports a document with no expiry date as none', () => {
    expect(severityFor(null, 30)).toBe('none')
  })
})

describe('worstSeverity', () => {
  it('picks crit over everything', () => {
    expect(worstSeverity(['ok', 'crit', 'warn'])).toBe('crit')
  })

  it('picks warn over ok', () => {
    expect(worstSeverity(['ok', 'warn', 'ok'])).toBe('warn')
  })

  // A vehicle with no dated documents is not "fine", it is "unknown" — the list shows a dash
  // rather than a green badge, and the ?severity=none filter is what finds these.
  it('reports none for a vehicle with no dated documents', () => {
    expect(worstSeverity([])).toBe('none')
    expect(worstSeverity(['none', 'none'])).toBe('none')
  })

  // 'ok' must beat 'none': one dated healthy document means the vehicle is not unknown.
  it('prefers ok over none when at least one document is dated', () => {
    expect(worstSeverity(['none', 'ok'])).toBe('ok')
  })
})
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-severity`
Expected: FAIL — `Cannot find module './fleet-severity'`.

- [ ] **Step 7: Tulis implementasi minimal**

`apps/backend/src/modules/fleet-vehicles/fleet-severity.ts`:

```ts
import { FleetSeverity } from './fleet-vehicles.constants'

// Mirrors COALESCE(m.warn_days, 30) in fleet_vehicle_document_status. The view decides which
// rows a ?severity= filter returns and this decides the badge each row shows; if the two
// disagree an operator filters for "expiring" and gets back a page of green rows.
const FALLBACK_WARN_DAYS = 30

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Lower is worse, so Math.min picks the worst — the same ordering severity_rank uses in the
// view, which is what makes ORDER BY severity agree with the badge.
export const SEVERITY_RANK: Record<FleetSeverity, number> = {
  crit: 0,
  warn: 1,
  ok: 2,
  none: 3,
}

// The Jakarta business day, which is what the operator means by "today" — NOT the UTC day
// toISOString() would give, which reads as yesterday every morning until 07:00 WIB. The view
// names the same zone in its own severity ladder; if these two ever disagree, a row's badge and
// the ?severity= filter that hides or shows it disagree too. Thresholds move once a day, not
// once an hour, so day precision is the right resolution.
//
// en-CA because it formats as YYYY-MM-DD, the shape the rest of this module passes around.
export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

// Both dates are parsed as UTC midnight (Date.parse of a bare YYYY-MM-DD does exactly that), so
// the difference is a whole number of days no matter what zone the server runs in. Subtracting
// two local-midnight Dates would come out at 9.958 days across a DST boundary and floor wrong.
export function daysUntil(dateISO: string | null, todayISOValue: string = todayISO()): number | null {
  if (!dateISO) return null
  const target = Date.parse(`${dateISO}T00:00:00Z`)
  const base = Date.parse(`${todayISOValue}T00:00:00Z`)
  if (Number.isNaN(target) || Number.isNaN(base)) return null
  return Math.round((target - base) / MS_PER_DAY)
}

export function severityFor(daysLeft: number | null, warnDays: number | null): FleetSeverity {
  if (daysLeft === null) return 'none'
  // Strictly less than zero, mirroring the view's `WHEN d.expires_at < today THEN 0`. A document
  // whose expiry date IS today is still valid for the rest of the business day, so it is warn
  // (rank 1) with daysLeft 0; crit starts the day after.
  if (daysLeft < 0) return 'crit'
  return daysLeft <= (warnDays ?? FALLBACK_WARN_DAYS) ? 'warn' : 'ok'
}

export function worstSeverity(list: FleetSeverity[]): FleetSeverity {
  return list.reduce<FleetSeverity>(
    (worst, s) => (SEVERITY_RANK[s] < SEVERITY_RANK[worst] ? s : worst),
    'none',
  )
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-severity`
Expected: PASS, 21 test. (19 dari daftar di atas, plus 2 penjaga NaN pada `daysUntil` yang ditambahkan saat mutation testing menemukan guard-nya tidak teruji.)

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/fleet-nopol.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-nopol.spec.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-severity.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-severity.spec.ts
git commit -m "feat(fleet): add plate normalisation and document severity helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Service `fleet-vehicles` (TDD)

CRUD, list terpaginasi dengan filter severity sebagai predikat SQL, arsip/restore, dan penggantian set dokumen dalam satu transaksi.

**Catatan desain — kenapa list dikerjakan dua langkah.** `skip`/`take` di atas query yang punya join membuat TypeORM beralih ke strategi subquery `SELECT DISTINCT`, yang berinteraksi dengan `ORDER BY` pada kolom view secara tidak jelas. Jadi list mengambil id-nya dulu (satu query berisi seluruh filter, sort, dan pagination), lalu memuat entity untuk id-id tersebut. Efek sampingnya bagus: dokumen ikut dimuat satu query untuk seluruh halaman, jadi tidak ada N+1.

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts`

**Interfaces:**
- Consumes: `FleetVehicleEntity`, `FleetVehicleDocumentEntity`, `FleetMasterDataEntity`, `FleetVehicleView`, `FleetVehicleListResult`, `FleetSeverity`, `FleetVehicleSort`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `normalizeNopol`, `daysUntil`, `severityFor`, `worstSeverity`, `todayISO`.
- Produces: `FleetVehiclesService` dengan method:
  - `findAll(dto: ListInput): Promise<FleetVehicleListResult>`
  - `findOne(id: string): Promise<FleetVehicleView>`
  - `create(dto: CreateInput): Promise<FleetVehicleView>`
  - `update(id: string, dto: UpdateInput): Promise<FleetVehicleView>`
  - `archive(id: string): Promise<FleetVehicleView>`
  - `restore(id: string): Promise<FleetVehicleView>`
  - `remove(id: string): Promise<void>`
  - `replaceDocuments(id: string, docs: DocumentInput[]): Promise<FleetVehicleView>`
  - tipe `ListInput`, `CreateInput`, `UpdateInput`, `DocumentInput` diekspor dari file ini.

- [ ] **Step 1: Tulis test yang gagal — list, filter, sort**

`apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'

// One live KIR, expiring in 5 days, on a type whose threshold is the default 30.
const docRow = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  vehicleId: 'v1',
  docTypeId: 'dt-kir',
  nomor: 'JKT-II/1',
  issuedAt: '2026-03-10',
  expiresAt: '2026-09-15',
  isCurrent: true,
  docType: { id: 'dt-kir', code: 'kir', label: 'KIR', warnDays: 30, sortOrder: 10 },
  ...over,
})

const vehicleRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  nopol: 'B 9114 KYZ',
  merk: 'Mitsubishi',
  tipe: 'Canter',
  tahun: 2021,
  kapasitas: '8 ton',
  noRangka: null,
  noMesin: null,
  noBpkb: null,
  pemilikUnit: null,
  odometer: 120000,
  catatan: null,
  jenisArmadaId: 'ja-1',
  jenisArmada: { id: 'ja-1', label: 'Colt Diesel Engkel' },
  kepemilikanId: null,
  kepemilikan: null,
  poolId: null,
  pool: null,
  statusId: null,
  status: null,
  driverId: 'dr-1',
  driver: {
    id: 'dr-1',
    nama: 'Ahmad Fauzi',
    simExpiresAt: '2027-03-14',
    simJenis: { id: 'sj-1', label: 'B2 Umum', warnDays: 30 },
  },
  isActive: true,
  ...over,
})

describe('FleetVehiclesService', () => {
  let service: FleetVehiclesService
  let repo: {
    find: jest.Mock
    findOne: jest.Mock
    create: jest.Mock
    save: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    count: jest.Mock
    createQueryBuilder: jest.Mock
  }
  let docRepo: { find: jest.Mock; count: jest.Mock; createQueryBuilder: jest.Mock }
  let masterRepo: { findOne: jest.Mock }
  let dataSource: { transaction: jest.Mock }
  let idQb: Record<string, jest.Mock>
  let docQb: Record<string, jest.Mock>
  let txManager: { update: jest.Mock; insert: jest.Mock; save: jest.Mock; create: jest.Mock }

  beforeEach(async () => {
    idQb = {
      select: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => 1),
      getRawMany: jest.fn(async () => [{ id: 'v1' }]),
    }
    docQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [docRow()]),
    }
    repo = {
      find: jest.fn(async () => [vehicleRow()]),
      findOne: jest.fn(async () => vehicleRow()),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 'v-new', ...v })),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(async () => 0),
      createQueryBuilder: jest.fn(() => idQb),
    }
    docRepo = {
      find: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      createQueryBuilder: jest.fn(() => docQb),
    }
    masterRepo = { findOne: jest.fn(async () => ({ id: 'ja-1', category: 'jenis_armada' })) }
    txManager = {
      update: jest.fn(),
      insert: jest.fn(),
      save: jest.fn(async (_e, v) => v),
      create: jest.fn((_e, v) => v),
    }
    dataSource = { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(txManager)) }

    const module = await Test.createTestingModule({
      providers: [
        FleetVehiclesService,
        { provide: getRepositoryToken(FleetVehicleEntity), useValue: repo },
        { provide: getRepositoryToken(FleetVehicleDocumentEntity), useValue: docRepo },
        { provide: getRepositoryToken(FleetMasterDataEntity), useValue: masterRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile()
    service = module.get(FleetVehiclesService)
  })

  const andWhereCall = (needle: string) =>
    idQb.andWhere.mock.calls.find((c) => String(c[0]).includes(needle))

  describe('findAll', () => {
    it('hides archived units by default', async () => {
      await service.findAll({})
      expect(andWhereCall('v.isActive')).toBeDefined()
    })

    it('includes archived units when asked', async () => {
      await service.findAll({ includeArchived: true })
      expect(andWhereCall('v.isActive')).toBeUndefined()
    })

    // The search spans the plate, the make/model, both chassis numbers and the driver's name —
    // an operator holding a delivery note has one of those, not a UUID.
    it('searches plate, make, type, chassis, engine and driver name', async () => {
      await service.findAll({ q: 'canter' })
      const clause = andWhereCall('ILIKE')
      expect(clause?.[1]).toEqual({ q: '%canter%' })
      const sql = String(clause?.[0])
      expect(sql).toContain('v.nopol')
      expect(sql).toContain('v.merk')
      expect(sql).toContain('v.tipe')
      expect(sql).toContain('v.noRangka')
      expect(sql).toContain('v.noMesin')
      expect(sql).toContain('dr.nama')
    })

    it('ignores a whitespace-only search term', async () => {
      await service.findAll({ q: '   ' })
      expect(andWhereCall('ILIKE')).toBeUndefined()
    })

    // Severity has to be a SQL predicate, not a client-side filter: filtering after pagination
    // would return "3 of 8" on a page that happens to hold three expired units and hide the rest.
    it('filters crit as severity_rank 0', async () => {
      await service.findAll({ severity: 'crit' })
      expect(andWhereCall('severity_rank')?.[0]).toContain('= 0')
    })

    it('filters warn as severity_rank 1', async () => {
      await service.findAll({ severity: 'warn' })
      expect(andWhereCall('severity_rank')?.[0]).toContain('= 1')
    })

    it('filters ok as severity_rank 2', async () => {
      await service.findAll({ severity: 'ok' })
      expect(andWhereCall('severity_rank')?.[0]).toContain('= 2')
    })

    // A vehicle with no dated document produces no row in the view at all, so "none" is an
    // IS NULL test rather than a fourth rank. Getting this wrong returns an empty page and
    // looks like there are no such vehicles.
    it('filters none as a missing view row', async () => {
      await service.findAll({ severity: 'none' })
      expect(andWhereCall('vs.vehicle_id IS NULL')).toBeDefined()
    })

    it('filters by ownership, pool and status ids', async () => {
      await service.findAll({ kepemilikanId: 'k1', poolId: 'p1', statusId: 's1' })
      expect(andWhereCall('v.kepemilikanId')?.[1]).toEqual({ kepemilikanId: 'k1' })
      expect(andWhereCall('v.poolId')?.[1]).toEqual({ poolId: 'p1' })
      expect(andWhereCall('v.statusId')?.[1]).toEqual({ statusId: 's1' })
    })

    it('defaults to ordering by plate', async () => {
      await service.findAll({})
      expect(idQb.orderBy).toHaveBeenCalledWith('v.nopol', 'ASC')
    })

    it('sorts by plate descending', async () => {
      await service.findAll({ sort: '-nopol' })
      expect(idQb.orderBy).toHaveBeenCalledWith('v.nopol', 'DESC')
    })

    // Vehicles with no view row must sort last, not first: COALESCE to 3 puts 'none' behind
    // 'ok'. Without it NULLs would lead the list and bury the expired units the sort exists for.
    it('sorts by severity worst-first with unknown units last', async () => {
      await service.findAll({ sort: 'severity' })
      const [expr, dir] = idQb.orderBy.mock.calls[0]
      expect(String(expr)).toContain('COALESCE(vs.severity_rank, 3)')
      expect(dir).toBe('ASC')
    })

    it('paginates with the requested page and size', async () => {
      await service.findAll({ page: 3, pageSize: 10 })
      expect(idQb.offset).toHaveBeenCalledWith(20)
      expect(idQb.limit).toHaveBeenCalledWith(10)
    })

    it('defaults to page 1 of 25', async () => {
      const res = await service.findAll({})
      expect(idQb.offset).toHaveBeenCalledWith(0)
      expect(idQb.limit).toHaveBeenCalledWith(25)
      expect(res.page).toBe(1)
      expect(res.pageSize).toBe(25)
    })

    // Without the cap a client asking for pageSize=100000 makes the server materialise the
    // whole register and every document on it in one response.
    it('caps the page size at 100', async () => {
      await service.findAll({ pageSize: 5000 })
      expect(idQb.limit).toHaveBeenCalledWith(100)
    })

    it('reports the unpaginated total', async () => {
      idQb.getCount.mockResolvedValue(87)
      const res = await service.findAll({})
      expect(res.total).toBe(87)
    })

    // The id query answers "which vehicles and in what order"; loading them by id would lose
    // that order, so the mapper reorders to match. Without it the severity sort silently
    // degrades to whatever order Postgres returns.
    it('returns rows in the order the id query produced', async () => {
      idQb.getRawMany.mockResolvedValue([{ id: 'v2' }, { id: 'v1' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v1' }), vehicleRow({ id: 'v2' })])
      docQb.getMany.mockResolvedValue([])
      const res = await service.findAll({})
      expect(res.rows.map((r) => r.id)).toEqual(['v2', 'v1'])
    })

    it('skips both follow-up queries when no vehicle matched', async () => {
      idQb.getRawMany.mockResolvedValue([])
      const res = await service.findAll({})
      expect(res.rows).toEqual([])
      expect(repo.find).not.toHaveBeenCalled()
      expect(docRepo.createQueryBuilder).not.toHaveBeenCalled()
    })

    // One document query for the whole page. Per-vehicle loading is 25 extra round trips on the
    // default page and gets worse as the register grows.
    it('loads the whole page of documents in a single query', async () => {
      idQb.getRawMany.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v1' }), vehicleRow({ id: 'v2' })])
      await service.findAll({})
      expect(docRepo.createQueryBuilder).toHaveBeenCalledTimes(1)
      expect(docQb.where.mock.calls[0][1]).toEqual({ ids: ['v1', 'v2'] })
    })

    it('asks only for live documents', async () => {
      await service.findAll({})
      expect(docQb.andWhere).toHaveBeenCalledWith('d.isCurrent = TRUE')
    })
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: FAIL — `Cannot find module './fleet-vehicles.service'`.

- [ ] **Step 3: Tulis service**

`apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Not, Repository } from 'typeorm'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { FleetMasterCategory } from '../fleet-master-data/fleet-master-data.constants'
import {
  DEFAULT_PAGE_SIZE,
  FleetSeverity,
  FleetVehicleSort,
  MAX_PAGE_SIZE,
} from './fleet-vehicles.constants'
import { normalizeNopol } from './fleet-nopol'
import { daysUntil, severityFor, todayISO, worstSeverity } from './fleet-severity'
import {
  FleetMasterRef,
  FleetVehicleDocumentView,
  FleetVehicleListResult,
  FleetVehicleView,
} from './fleet-vehicles.types'

export interface ListInput {
  q?: string
  page?: number
  pageSize?: number
  sort?: FleetVehicleSort
  severity?: FleetSeverity
  kepemilikanId?: string
  poolId?: string
  statusId?: string
  includeArchived?: boolean
}

export interface CreateInput {
  nopol: string
  merk?: string | null
  tipe?: string | null
  tahun?: number | null
  kapasitas?: string | null
  noRangka?: string | null
  noMesin?: string | null
  noBpkb?: string | null
  pemilikUnit?: string | null
  odometer?: number | null
  catatan?: string | null
  jenisArmadaId?: string | null
  kepemilikanId?: string | null
  poolId?: string | null
  statusId?: string | null
  driverId?: string | null
}

export type UpdateInput = Partial<CreateInput>

export interface DocumentInput {
  docTypeId: string
  nomor?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
}

const UNIQUE_VIOLATION = '23505'
const NOPOL_UNIQUE_INDEX = 'uq_fleet_vehicles_nopol_active'

// Which master-data category each foreign key must point at. The FK proves the row exists; only
// this proves it is the right kind of row, without which a vehicle could be saved with
// pool_id -> "Mitsubishi Fuso".
const MASTER_FIELD_CATEGORIES: Record<string, FleetMasterCategory> = {
  jenisArmadaId: 'jenis_armada',
  kepemilikanId: 'kepemilikan',
  poolId: 'pool',
  statusId: 'status_kendaraan',
}

@Injectable()
export class FleetVehiclesService {
  constructor(
    @InjectRepository(FleetVehicleEntity)
    private readonly repo: Repository<FleetVehicleEntity>,
    @InjectRepository(FleetVehicleDocumentEntity)
    private readonly docRepo: Repository<FleetVehicleDocumentEntity>,
    @InjectRepository(FleetMasterDataEntity)
    private readonly masterRepo: Repository<FleetMasterDataEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(dto: ListInput): Promise<FleetVehicleListResult> {
    const page = dto.page ?? 1
    const pageSize = Math.min(dto.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    // Ids first, entities second. skip/take over a query that carries joins makes TypeORM switch
    // to a DISTINCT subquery whose interaction with an ORDER BY on the view's columns is not
    // something to rely on; two explicit queries are predictable and let the documents for the
    // whole page load in one more.
    const idQb = this.repo
      .createQueryBuilder('v')
      .select('v.id', 'id')
      .leftJoin('v.driver', 'dr')
      .leftJoin('fleet_vehicle_document_status', 'vs', 'vs.vehicle_id = v.id')

    if (!dto.includeArchived) idQb.andWhere('v.isActive = TRUE')

    const q = dto.q?.trim()
    if (q) {
      idQb.andWhere(
        `(v.nopol ILIKE :q OR v.merk ILIKE :q OR v.tipe ILIKE :q
          OR v.noRangka ILIKE :q OR v.noMesin ILIKE :q OR dr.nama ILIKE :q)`,
        { q: `%${q}%` },
      )
    }

    // 'none' is the absence of a view row, not a fourth rank — a vehicle with no dated document
    // never reaches the GROUP BY.
    if (dto.severity === 'none') idQb.andWhere('vs.vehicle_id IS NULL')
    else if (dto.severity === 'crit') idQb.andWhere('vs.severity_rank = 0')
    else if (dto.severity === 'warn') idQb.andWhere('vs.severity_rank = 1')
    else if (dto.severity === 'ok') idQb.andWhere('vs.severity_rank = 2')

    if (dto.kepemilikanId) {
      idQb.andWhere('v.kepemilikanId = :kepemilikanId', { kepemilikanId: dto.kepemilikanId })
    }
    if (dto.poolId) idQb.andWhere('v.poolId = :poolId', { poolId: dto.poolId })
    if (dto.statusId) idQb.andWhere('v.statusId = :statusId', { statusId: dto.statusId })

    this.applySort(idQb, dto.sort)

    const total = await idQb.getCount()
    const idRows = (await idQb
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany()) as { id: string }[]
    const ids = idRows.map((r) => r.id)

    if (ids.length === 0) return { rows: [], total, page, pageSize }

    const rows = await this.loadViews(ids)
    return { rows, total, page, pageSize }
  }

  async findOne(id: string): Promise<FleetVehicleView> {
    const [view] = await this.loadViews([id])
    if (!view) throw new NotFoundException('Vehicle not found')
    return view
  }

  async create(dto: CreateInput): Promise<FleetVehicleView> {
    const nopol = normalizeNopol(dto.nopol)
    if (!nopol) throw new BadRequestException('nopol must not be blank')

    await this.assertMasterRefs(dto)
    await this.assertNopolFree(nopol)

    try {
      const saved = await this.repo.save(
        this.repo.create({
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
        }),
      )
      return this.findOne(saved.id)
    } catch (err: unknown) {
      this.throwIfNopolViolation(err, nopol)
      throw err
    }
  }

  async update(id: string, dto: UpdateInput): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    await this.assertMasterRefs(dto)

    // Built key by key rather than spread: an absent field must leave the column alone while an
    // explicit null clears it, and spreading collapses that distinction.
    const patch: Record<string, unknown> = {}
    if (dto.nopol !== undefined) {
      const nopol = normalizeNopol(dto.nopol)
      if (!nopol) throw new BadRequestException('nopol must not be blank')
      if (nopol !== existing.nopol) await this.assertNopolFree(nopol, id)
      patch.nopol = nopol
    }
    if (dto.merk !== undefined) patch.merk = this.blankToNull(dto.merk)
    if (dto.tipe !== undefined) patch.tipe = this.blankToNull(dto.tipe)
    if (dto.tahun !== undefined) patch.tahun = dto.tahun
    if (dto.kapasitas !== undefined) patch.kapasitas = this.blankToNull(dto.kapasitas)
    if (dto.noRangka !== undefined) patch.noRangka = this.blankToNull(dto.noRangka)
    if (dto.noMesin !== undefined) patch.noMesin = this.blankToNull(dto.noMesin)
    if (dto.noBpkb !== undefined) patch.noBpkb = this.blankToNull(dto.noBpkb)
    if (dto.pemilikUnit !== undefined) patch.pemilikUnit = this.blankToNull(dto.pemilikUnit)
    if (dto.odometer !== undefined) patch.odometer = dto.odometer
    if (dto.catatan !== undefined) patch.catatan = this.blankToNull(dto.catatan)
    if (dto.jenisArmadaId !== undefined) patch.jenisArmadaId = dto.jenisArmadaId
    if (dto.kepemilikanId !== undefined) patch.kepemilikanId = dto.kepemilikanId
    if (dto.poolId !== undefined) patch.poolId = dto.poolId
    if (dto.statusId !== undefined) patch.statusId = dto.statusId
    if (dto.driverId !== undefined) patch.driverId = dto.driverId

    if (Object.keys(patch).length > 0) {
      try {
        await this.repo.update(id, patch)
      } catch (err: unknown) {
        this.throwIfNopolViolation(err, String(patch.nopol ?? existing.nopol))
        throw err
      }
    }
    return this.findOne(id)
  }

  // The Hapus button lands here, not on remove(): a unit that has been sold keeps its documents
  // and its history, it just stops appearing in the register.
  async archive(id: string): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')
    await this.repo.update(id, { isActive: false })
    return this.findOne(id)
  }

  // Restoring re-enters the partial unique index, so the plate has to be free again — another
  // unit may have taken it while this one was archived.
  async restore(id: string): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')
    await this.assertNopolFree(existing.nopol, id)
    try {
      await this.repo.update(id, { isActive: true })
    } catch (err: unknown) {
      this.throwIfNopolViolation(err, existing.nopol)
      throw err
    }
    return this.findOne(id)
  }

  // Hard delete stays available so a mistyped entry can be cleaned up, but a unit that has
  // accumulated history cannot vanish — archiving is what that case wants.
  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    const docs = await this.docRepo.count({ where: { vehicleId: id } })
    if (docs > 0) {
      throw new ConflictException(
        `"${existing.nopol}" has ${docs} document record(s). Archive it instead of deleting.`,
      )
    }
    await this.repo.delete(id)
  }

  // The whole document set arrives at once because that is the shape of the form. A type present
  // in the payload with an unchanged expiry keeps its row; a changed expiry supersedes the old
  // row rather than overwriting it, which is what preserves the renewal history the prototype
  // threw away. A type absent from the payload is retired.
  async replaceDocuments(id: string, docs: DocumentInput[]): Promise<FleetVehicleView> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Vehicle not found')

    const seen = new Set<string>()
    for (const doc of docs) {
      if (seen.has(doc.docTypeId)) {
        throw new BadRequestException(`Duplicate document type in payload: ${doc.docTypeId}`)
      }
      seen.add(doc.docTypeId)
    }
    await this.assertDocTypes([...seen])

    await this.dataSource.transaction(async (manager) => {
      // Everything is retired first, then the submitted set is inserted fresh. Doing it in this
      // order inside one transaction keeps uq_fleet_vehicle_documents_current satisfied at
      // commit time without needing to diff old against new.
      await manager.update(
        FleetVehicleDocumentEntity,
        { vehicleId: id, isCurrent: true },
        { isCurrent: false },
      )
      for (const doc of docs) {
        await manager.insert(FleetVehicleDocumentEntity, {
          vehicleId: id,
          docTypeId: doc.docTypeId,
          nomor: this.blankToNull(doc.nomor),
          issuedAt: doc.issuedAt || null,
          expiresAt: doc.expiresAt || null,
          isCurrent: true,
        })
      }
    })

    return this.findOne(id)
  }

  private applySort(
    qb: ReturnType<Repository<FleetVehicleEntity>['createQueryBuilder']>,
    sort?: FleetVehicleSort,
  ): void {
    switch (sort) {
      case '-nopol':
        qb.orderBy('v.nopol', 'DESC')
        break
      case 'tahun':
        qb.orderBy('v.tahun', 'ASC').addOrderBy('v.nopol', 'ASC')
        break
      case '-tahun':
        // COALESCE to 0 for the same reason the severity sort coalesces: tahun is nullable, and
        // Postgres puts NULLs FIRST on DESC, so "tahun terbaru" would open on every unit whose
        // year was never recorded. Ascending needs no guard — NULLs land last there already.
        qb.orderBy('COALESCE(v.tahun, 0)', 'DESC').addOrderBy('v.nopol', 'ASC')
        break
      case 'severity':
        // COALESCE to 3 so units with no dated document sort behind 'ok' rather than leading the
        // list as NULLs and burying the expired units this sort exists to surface.
        qb.orderBy('COALESCE(vs.severity_rank, 3)', 'ASC')
          .addOrderBy('vs.min_days_left', 'ASC')
          .addOrderBy('v.nopol', 'ASC')
        break
      default:
        qb.orderBy('v.nopol', 'ASC')
    }
  }

  private async loadViews(ids: string[]): Promise<FleetVehicleView[]> {
    const entities = await this.repo.find({
      where: { id: In(ids) },
      relations: {
        jenisArmada: true,
        kepemilikan: true,
        pool: true,
        status: true,
        driver: { simJenis: true },
      },
    })

    const docs = await this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.docType', 'dt')
      .where('d.vehicleId IN (:...ids)', { ids })
      .andWhere('d.isCurrent = TRUE')
      .orderBy('dt.sortOrder', 'ASC')
      .getMany()

    const docsByVehicle = new Map<string, FleetVehicleDocumentEntity[]>()
    for (const doc of docs) {
      const list = docsByVehicle.get(doc.vehicleId) ?? []
      list.push(doc)
      docsByVehicle.set(doc.vehicleId, list)
    }

    // One `today` for the whole page so two rows on the same response can never be measured
    // against different days, which is possible if the request straddles midnight.
    const today = todayISO()
    const byId = new Map(entities.map((e) => [e.id, e]))

    // find() does not preserve the id order, and that order is the sort the caller asked for.
    return ids
      .map((id) => byId.get(id))
      .filter((e): e is FleetVehicleEntity => e !== undefined)
      .map((e) => this.toView(e, docsByVehicle.get(e.id) ?? [], today))
  }

  private toView(
    e: FleetVehicleEntity,
    docs: FleetVehicleDocumentEntity[],
    today: string,
  ): FleetVehicleView {
    const documents: FleetVehicleDocumentView[] = docs.map((d) => {
      const daysLeft = daysUntil(d.expiresAt, today)
      return {
        docTypeId: d.docTypeId,
        code: d.docType?.code ?? '',
        label: d.docType?.label ?? '',
        nomor: d.nomor,
        issuedAt: d.issuedAt,
        expiresAt: d.expiresAt,
        daysLeft,
        severity: severityFor(daysLeft, d.docType?.warnDays ?? null),
      }
    })

    const dated = documents.filter((d) => d.daysLeft !== null)

    // The driver's licence is deliberately left out of worstSeverity: it belongs to the person,
    // and the vehicle badge answers "are this unit's papers in order". Phase 4's alert list is
    // where the two are merged.
    const driver = e.driver
      ? {
          id: e.driver.id,
          nama: e.driver.nama,
          simExpiresAt: e.driver.simExpiresAt,
          simDaysLeft: daysUntil(e.driver.simExpiresAt, today),
          simSeverity: severityFor(
            daysUntil(e.driver.simExpiresAt, today),
            e.driver.simJenis?.warnDays ?? null,
          ),
        }
      : null

    return {
      id: e.id,
      nopol: e.nopol,
      merk: e.merk,
      tipe: e.tipe,
      tahun: e.tahun,
      kapasitas: e.kapasitas,
      noRangka: e.noRangka,
      noMesin: e.noMesin,
      noBpkb: e.noBpkb,
      pemilikUnit: e.pemilikUnit,
      odometer: e.odometer,
      catatan: e.catatan,
      jenisArmada: this.toRef(e.jenisArmada),
      kepemilikan: this.toRef(e.kepemilikan),
      pool: this.toRef(e.pool),
      status: this.toRef(e.status),
      driver,
      documents,
      worstSeverity: worstSeverity(documents.map((d) => d.severity)),
      minDaysLeft: dated.length > 0 ? Math.min(...dated.map((d) => d.daysLeft as number)) : null,
      isActive: e.isActive,
    }
  }

  private toRef(row?: FleetMasterDataEntity | null): FleetMasterRef | null {
    return row ? { id: row.id, label: row.label } : null
  }

  private async assertMasterRefs(dto: UpdateInput): Promise<void> {
    for (const [field, category] of Object.entries(MASTER_FIELD_CATEGORIES)) {
      const id = (dto as Record<string, unknown>)[field]
      if (typeof id !== 'string' || id === '') continue
      const row = await this.masterRepo.findOne({ where: { id, category } })
      if (!row) throw new BadRequestException(`${field} must reference a ${category} master row`)
    }
  }

  private async assertDocTypes(ids: string[]): Promise<void> {
    for (const id of ids) {
      const row = await this.masterRepo.findOne({ where: { id, category: 'jenis_dokumen' } })
      if (!row) throw new BadRequestException(`${id} is not a jenis_dokumen master row`)
    }
  }

  // Only live units hold a plate, matching uq_fleet_vehicles_nopol_active. An archived unit's
  // plate is free for reuse, which is the whole reason the index is partial.
  private async assertNopolFree(nopol: string, exceptId?: string): Promise<void> {
    const clash = await this.repo.findOne({
      where: exceptId
        ? { nopol, isActive: true, id: Not(exceptId) }
        : { nopol, isActive: true },
    })
    if (clash) {
      throw new ConflictException(`Plate "${nopol}" is already registered to an active vehicle`)
    }
  }

  // assertNopolFree is a check-then-act and still races a concurrent create. Translating the
  // loser's constraint violation makes both paths look the same to the caller instead of a 500.
  private throwIfNopolViolation(err: unknown, nopol: string): void {
    const pgErr = err as { code?: string; constraint?: string }
    if (pgErr?.code === UNIQUE_VIOLATION && pgErr?.constraint === NOPOL_UNIQUE_INDEX) {
      throw new ConflictException(`Plate "${nopol}" is already registered to an active vehicle`)
    }
  }

  // '' and whitespace-only collapse to null so each optional column has one empty state, not two.
  private blankToNull(v?: string | null): string | null {
    if (v == null) return null
    const trimmed = v.trim()
    return trimmed === '' ? null : trimmed
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: PASS, 21 test.

- [ ] **Step 5: Tambahkan test CRUD, arsip, dan dokumen**

Tambahkan blok berikut di dalam `describe('FleetVehiclesService', …)`, setelah `describe('findAll', …)`, di `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts`:

```ts
  describe('create', () => {
    beforeEach(() => {
      repo.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        opts?.where?.nopol ? null : vehicleRow(),
      )
      idQb.getRawMany.mockResolvedValue([{ id: 'v-new' }])
      repo.find.mockResolvedValue([vehicleRow({ id: 'v-new' })])
    })

    it('stores the plate normalised', async () => {
      await service.create({ nopol: 'b  9114   kyz' })
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ nopol: 'B 9114 KYZ' }))
    })

    it('rejects a blank plate', async () => {
      await expect(service.create({ nopol: '   ' })).rejects.toBeInstanceOf(BadRequestException)
    })

    // The plate is what an operator recognises a unit by; two live rows sharing one make the
    // register ambiguous at exactly the moment it is consulted.
    it('refuses a plate an active vehicle already holds', async () => {
      repo.findOne.mockResolvedValue(vehicleRow({ id: 'other' }))
      await expect(service.create({ nopol: 'B 9114 KYZ' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('checks the clash against live units only', async () => {
      await service.create({ nopol: 'B 9114 KYZ' })
      const clashCall = repo.findOne.mock.calls.find(
        (c) => (c[0] as { where?: Record<string, unknown> })?.where?.nopol !== undefined,
      )
      expect((clashCall?.[0] as { where: Record<string, unknown> }).where).toMatchObject({
        nopol: 'B 9114 KYZ',
        isActive: true,
      })
    })

    // The FK only proves the row exists. Without the category check a vehicle saves happily with
    // pool_id pointing at a leasing company, and the pool filter then never finds it.
    it('rejects a master id from the wrong category', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.create({ nopol: 'B 1 A', poolId: 'not-a-pool' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('checks each master field against its own category', async () => {
      await service.create({
        nopol: 'B 1 A',
        jenisArmadaId: 'ja-1',
        kepemilikanId: 'kp-1',
        poolId: 'pl-1',
        statusId: 'st-1',
      })
      const categories = masterRepo.findOne.mock.calls.map(
        (c) => (c[0] as { where: { category: string } }).where.category,
      )
      expect(categories).toEqual([
        'jenis_armada',
        'kepemilikan',
        'pool',
        'status_kendaraan',
      ])
    })

    it('collapses blank optional text to null', async () => {
      await service.create({ nopol: 'B 1 A', merk: '   ', catatan: '' })
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ merk: null, catatan: null }),
      )
    })

    // The check-then-act above still loses a race. Surfacing the constraint violation as the same
    // 409 keeps the two paths indistinguishable to the client rather than leaking a 500.
    it('translates a concurrent unique violation into a conflict', async () => {
      repo.save.mockRejectedValue({ code: '23505', constraint: 'uq_fleet_vehicles_nopol_active' })
      await expect(service.create({ nopol: 'B 9114 KYZ' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('rethrows an unrelated database error untouched', async () => {
      repo.save.mockRejectedValue({ code: '23503', constraint: 'fk_fleet_vehicles_pool' })
      await expect(service.create({ nopol: 'B 9114 KYZ' })).rejects.not.toBeInstanceOf(
        ConflictException,
      )
    })
  })

  describe('update', () => {
    it('404s on a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.update('nope', { merk: 'Hino' })).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    // An absent key means "leave it alone" and an explicit null means "clear it". A spread of the
    // DTO would write undefined over every untouched column.
    it('patches only the fields present in the payload', async () => {
      await service.update('v1', { merk: 'Hino' })
      expect(repo.update).toHaveBeenCalledWith('v1', { merk: 'Hino' })
    })

    it('clears a column when the payload sends null', async () => {
      await service.update('v1', { odometer: null })
      expect(repo.update).toHaveBeenCalledWith('v1', { odometer: null })
    })

    it('skips the write entirely for an empty payload', async () => {
      await service.update('v1', {})
      expect(repo.update).not.toHaveBeenCalled()
    })

    // Re-checking on every update would reject a vehicle for colliding with itself. Only a
    // changed plate needs the probe.
    it('does not re-check the plate when it is unchanged', async () => {
      repo.findOne.mockResolvedValue(vehicleRow({ nopol: 'B 9114 KYZ' }))
      await service.update('v1', { nopol: 'b 9114 kyz' })
      const clashCall = repo.findOne.mock.calls.find(
        (c) => (c[0] as { where?: Record<string, unknown> })?.where?.nopol !== undefined,
      )
      expect(clashCall).toBeUndefined()
    })

    it('checks a changed plate against other live units', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ nopol: 'B 9114 KYZ' }))
        .mockResolvedValueOnce(vehicleRow({ id: 'other', nopol: 'B 2 XX' }))
      await expect(service.update('v1', { nopol: 'B 2 XX' })).rejects.toBeInstanceOf(
        ConflictException,
      )
    })

    it('normalises a changed plate before storing it', async () => {
      repo.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) =>
        opts?.where?.nopol ? null : vehicleRow({ nopol: 'B 9114 KYZ' }),
      )
      await service.update('v1', { nopol: 'b   2   xx' })
      expect(repo.update).toHaveBeenCalledWith('v1', { nopol: 'B 2 XX' })
    })
  })

  describe('archive and restore', () => {
    it('archives by clearing the registration flag', async () => {
      await service.archive('v1')
      expect(repo.update).toHaveBeenCalledWith('v1', { isActive: false })
    })

    it('404s when archiving a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.archive('nope')).rejects.toBeInstanceOf(NotFoundException)
    })

    // While a unit sat archived another may have taken its plate. Restoring blindly would hit
    // the partial unique index and surface as a 500.
    it('refuses to restore into a plate another live unit has taken', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ isActive: false }))
        .mockResolvedValueOnce(vehicleRow({ id: 'other' }))
      await expect(service.restore('v1')).rejects.toBeInstanceOf(ConflictException)
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('restores when the plate is still free', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ isActive: false }))
        .mockResolvedValueOnce(null)
      await service.restore('v1')
      expect(repo.update).toHaveBeenCalledWith('v1', { isActive: true })
    })

    // The exclusion is what stops a vehicle colliding with its own row.
    it('excludes the vehicle itself from the restore probe', async () => {
      repo.findOne
        .mockResolvedValueOnce(vehicleRow({ isActive: false }))
        .mockResolvedValueOnce(null)
      await service.restore('v1')
      const probe = repo.findOne.mock.calls[1][0] as { where: Record<string, unknown> }
      expect(probe.where.id).toBeDefined()
    })
  })

  describe('remove', () => {
    it('hard-deletes a vehicle with no history', async () => {
      docRepo.count.mockResolvedValue(0)
      await service.remove('v1')
      expect(repo.delete).toHaveBeenCalledWith('v1')
    })

    // A mistyped row should be cleanable, but a unit with documents disappearing takes its
    // renewal history with it — archiving is what that case wants.
    it('refuses to delete a vehicle that has documents', async () => {
      docRepo.count.mockResolvedValue(3)
      await expect(service.remove('v1')).rejects.toBeInstanceOf(ConflictException)
      expect(repo.delete).not.toHaveBeenCalled()
    })

    it('404s on a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('replaceDocuments', () => {
    beforeEach(() => {
      masterRepo.findOne.mockResolvedValue({ id: 'dt-kir', category: 'jenis_dokumen' })
    })

    // Retire-then-insert has to be atomic: a crash between the two halves would leave the vehicle
    // with no live documents at all and every badge reading 'none'.
    it('runs the swap inside one transaction', async () => {
      await service.replaceDocuments('v1', [{ docTypeId: 'dt-kir', expiresAt: '2027-01-01' }])
      expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    })

    it('retires the existing live rows before inserting', async () => {
      await service.replaceDocuments('v1', [{ docTypeId: 'dt-kir', expiresAt: '2027-01-01' }])
      expect(txManager.update).toHaveBeenCalledWith(
        expect.anything(),
        { vehicleId: 'v1', isCurrent: true },
        { isCurrent: false },
      )
      const updateOrder = txManager.update.mock.invocationCallOrder[0]
      const insertOrder = txManager.insert.mock.invocationCallOrder[0]
      expect(updateOrder).toBeLessThan(insertOrder)
    })

    it('inserts each submitted document as the live row', async () => {
      await service.replaceDocuments('v1', [
        { docTypeId: 'dt-kir', nomor: 'JKT-1', issuedAt: '2026-03-10', expiresAt: '2026-09-15' },
      ])
      expect(txManager.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          vehicleId: 'v1',
          docTypeId: 'dt-kir',
          nomor: 'JKT-1',
          issuedAt: '2026-03-10',
          expiresAt: '2026-09-15',
          isCurrent: true,
        }),
      )
    })

    // Two rows of the same type in one payload would both insert as current and violate
    // uq_fleet_vehicle_documents_current — a 500 where a 400 naming the type is the right answer.
    it('rejects a payload carrying the same type twice', async () => {
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'dt-kir' }, { docTypeId: 'dt-kir' }]),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('rejects a doc type id that is not a jenis_dokumen row', async () => {
      masterRepo.findOne.mockResolvedValue(null)
      await expect(
        service.replaceDocuments('v1', [{ docTypeId: 'pool-1' }]),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    // An empty set is a legitimate submission — it retires everything and leaves the vehicle
    // with no live documents.
    it('accepts an empty set and only retires', async () => {
      await service.replaceDocuments('v1', [])
      expect(txManager.update).toHaveBeenCalled()
      expect(txManager.insert).not.toHaveBeenCalled()
    })

    it('404s on a vehicle that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.replaceDocuments('nope', [])).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('view mapping', () => {
    it('computes severity per document from its own threshold', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ expiresAt: '2026-09-15', docType: { id: 'dt-kir', code: 'kir', label: 'KIR', warnDays: 30, sortOrder: 10 } }),
      ])
      const res = await service.findAll({})
      const doc = res.rows[0].documents[0]
      expect(doc.severity).toBe(severityFromDays(doc.daysLeft))
    })

    // The worst document decides the row badge — an operator scanning the list needs the row to
    // shout when any single paper has lapsed.
    it('reports the worst document severity on the row', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ id: 'd1', expiresAt: '2020-01-01' }),
        docRow({ id: 'd2', expiresAt: '2030-01-01' }),
      ])
      const res = await service.findAll({})
      expect(res.rows[0].worstSeverity).toBe('crit')
    })

    it('reports none and a null minDaysLeft for a vehicle with no dated documents', async () => {
      docQb.getMany.mockResolvedValue([])
      const res = await service.findAll({})
      expect(res.rows[0].worstSeverity).toBe('none')
      expect(res.rows[0].minDaysLeft).toBeNull()
    })

    it('reports the nearest expiry as minDaysLeft', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ id: 'd1', expiresAt: '2030-01-01' }),
        docRow({ id: 'd2', expiresAt: '2020-01-01' }),
      ])
      const res = await service.findAll({})
      const nearest = Math.min(...res.rows[0].documents.map((d) => d.daysLeft as number))
      expect(res.rows[0].minDaysLeft).toBe(nearest)
    })

    // Documents with no expiry date must not drag minDaysLeft to null or to a bogus number.
    it('ignores undated documents when computing minDaysLeft', async () => {
      docQb.getMany.mockResolvedValue([
        docRow({ id: 'd1', expiresAt: null }),
        docRow({ id: 'd2', expiresAt: '2030-01-01' }),
      ])
      const res = await service.findAll({})
      expect(res.rows[0].minDaysLeft).not.toBeNull()
    })

    it('projects the driver with its own licence severity', async () => {
      const res = await service.findAll({})
      expect(res.rows[0].driver).toMatchObject({ id: 'dr-1', nama: 'Ahmad Fauzi' })
      expect(res.rows[0].driver?.simSeverity).toBeDefined()
    })

    // The licence belongs to the person, so it must not colour the vehicle's document badge.
    // Phase 4's alert list is where the two streams merge.
    it('leaves the licence out of the vehicle badge', async () => {
      repo.find.mockResolvedValue([
        vehicleRow({
          driver: {
            id: 'dr-1',
            nama: 'Ahmad Fauzi',
            simExpiresAt: '2020-01-01',
            simJenis: { id: 'sj-1', label: 'B2', warnDays: 30 },
          },
        }),
      ])
      docQb.getMany.mockResolvedValue([docRow({ expiresAt: '2030-01-01' })])
      const res = await service.findAll({})
      expect(res.rows[0].worstSeverity).toBe('ok')
      expect(res.rows[0].driver?.simSeverity).toBe('crit')
    })

    it('emits null rather than an empty object for a vehicle with no driver', async () => {
      repo.find.mockResolvedValue([vehicleRow({ driverId: null, driver: null })])
      const res = await service.findAll({})
      expect(res.rows[0].driver).toBeNull()
    })

    it('flattens master rows to id and label', async () => {
      const res = await service.findAll({})
      expect(res.rows[0].jenisArmada).toEqual({ id: 'ja-1', label: 'Colt Diesel Engkel' })
      expect(res.rows[0].pool).toBeNull()
    })
  })

  describe('findOne', () => {
    it('404s when the id matches nothing', async () => {
      repo.find.mockResolvedValue([])
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
```

Tambahkan helper ini tepat di bawah `vehicleRow` (di luar `describe`), supaya assertion severity di atas tidak menghitung ulang ambangnya sendiri:

```ts
import { severityFor, daysUntil } from './fleet-severity'

const severityFromDays = (daysLeft: number | null) => severityFor(daysLeft, 30)
```

- [ ] **Step 6: Jalankan seluruh test service**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.service`
Expected: PASS, 55 test.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-vehicles.service.spec.ts
git commit -m "feat(fleet): add vehicles service with severity filtering and document swap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: DTO, controller & registrasi modul

Lapisan HTTP. DTO adalah satu-satunya penjaga bentuk payload karena `ValidationPipe` global memakai `forbidNonWhitelisted: true` — field yang tidak dideklarasikan di DTO membuat request ditolak 400, dan field yang dideklarasikan tapi tanpa dekorator justru lolos tanpa diperiksa.

**Files:**
- Create: `apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/update-fleet-vehicle.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/list-fleet-vehicles.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/replace-fleet-vehicle-documents.dto.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/list-fleet-vehicles.dto.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/dto/replace-fleet-vehicle-documents.dto.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.spec.ts`
- Create: `apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`
- Modify: `apps/backend/src/app.module.ts` (import + entri `imports`)

**Interfaces:**
- Consumes: `FleetVehiclesService` beserta tipe `ListInput`/`CreateInput`/`UpdateInput`/`DocumentInput` dari Task 3; `FLEET_SEVERITIES`, `FLEET_VEHICLE_SORTS`, `MAX_PAGE_SIZE` dari Task 1; `Permission` dari `@shared/auth`; `JwtAuthGuard`, `Authorize` seperti dipakai `FleetDriversController`.
- Produces: rute `GET /fleet/vehicles`, `GET /fleet/vehicles/:id`, `POST /fleet/vehicles`, `PATCH /fleet/vehicles/:id`, `POST /fleet/vehicles/:id/archive`, `POST /fleet/vehicles/:id/restore`, `DELETE /fleet/vehicles/:id`, `PUT /fleet/vehicles/:id/documents`; kelas `FleetVehiclesModule`.

- [ ] **Step 1: Tulis test DTO create yang gagal**

`apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateFleetVehicleDto } from './create-fleet-vehicle.dto'

// Every field is filled by default so each test removes or corrupts exactly one. A helper that
// always fills everything would leave no test pinning any single field as required.
const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(CreateFleetVehicleDto, {
    nopol: 'B 9114 KYZ',
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
    ...overrides,
  })

describe('CreateFleetVehicleDto', () => {
  it('accepts a fully specified vehicle', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // The plate is the only thing the service insists on; a unit can be registered before anyone
  // has looked up its chassis number.
  it('accepts a vehicle carrying only a plate', async () => {
    const dto = plainToInstance(CreateFleetVehicleDto, { nopol: 'B 1 A' })
    expect(await validate(dto)).toHaveLength(0)
  })

  it('rejects a vehicle with no plate', async () => {
    const errors = await validate(build({ nopol: undefined }))
    expect(errors.map((e) => e.property)).toContain('nopol')
  })

  it('rejects an empty plate', async () => {
    const errors = await validate(build({ nopol: '' }))
    expect(errors.map((e) => e.property)).toContain('nopol')
  })

  // The MaxLength guards mirror the columns (nopol VARCHAR(20), merk/tipe VARCHAR(60),
  // no_rangka/no_mesin/no_bpkb VARCHAR(60), pemilik_unit VARCHAR(120)). A widened
  // DTO limit passes validation and then fails as a 500 at insert time, so these over-length
  // cases are the only thing pinning the DTO to the schema.
  it('rejects a plate longer than the 20-char column', async () => {
    const errors = await validate(build({ nopol: 'B'.repeat(21) }))
    expect(errors.map((e) => e.property)).toContain('nopol')
  })

  it('rejects a merk longer than the 60-char column', async () => {
    const errors = await validate(build({ merk: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('merk')
  })

  it('rejects a tipe longer than the 60-char column', async () => {
    const errors = await validate(build({ tipe: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('tipe')
  })

  it('rejects a noRangka longer than the 60-char column', async () => {
    const errors = await validate(build({ noRangka: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('noRangka')
  })

  it('rejects a noMesin longer than the 60-char column', async () => {
    const errors = await validate(build({ noMesin: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('noMesin')
  })

  it('rejects a noBpkb longer than the 60-char column', async () => {
    const errors = await validate(build({ noBpkb: 'a'.repeat(61) }))
    expect(errors.map((e) => e.property)).toContain('noBpkb')
  })

  it('rejects a pemilikUnit longer than the 120-char column', async () => {
    const errors = await validate(build({ pemilikUnit: 'a'.repeat(121) }))
    expect(errors.map((e) => e.property)).toContain('pemilikUnit')
  })

  // A four-digit year is what the column holds and what every form offers. Free text here means
  // "2021 (bekas)" reaches the integer column and 500s.
  it('rejects a non-numeric tahun', async () => {
    const errors = await validate(build({ tahun: 'dua ribu' }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  it('rejects a tahun before 1900', async () => {
    const errors = await validate(build({ tahun: 1899 }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  it('rejects a tahun beyond 2100', async () => {
    const errors = await validate(build({ tahun: 2101 }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  it('rejects a fractional tahun', async () => {
    const errors = await validate(build({ tahun: 2021.5 }))
    expect(errors.map((e) => e.property)).toContain('tahun')
  })

  // An odometer cannot run backwards; a negative reading is a typo, not a measurement.
  it('rejects a negative odometer', async () => {
    const errors = await validate(build({ odometer: -1 }))
    expect(errors.map((e) => e.property)).toContain('odometer')
  })

  it('accepts a zero odometer for a brand-new unit', async () => {
    expect(await validate(build({ odometer: 0 }))).toHaveLength(0)
  })

  // Each of these is a FK to a UUID primary key. A non-UUID reaches Postgres as an invalid
  // input syntax error rather than a 400 naming the field.
  it.each(['jenisArmadaId', 'kepemilikanId', 'poolId', 'statusId', 'driverId'])(
    'rejects a %s that is not a UUID',
    async (field) => {
      const errors = await validate(build({ [field]: 'pool-cakung' }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand create-fleet-vehicle.dto`
Expected: FAIL — `Cannot find module './create-fleet-vehicle.dto'`.

- [ ] **Step 3: Tulis DTO create dan update**

`apps/backend/src/modules/fleet-vehicles/dto/create-fleet-vehicle.dto.ts`:

```ts
import { Type } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class CreateFleetVehicleDto {
  // The service normalises the plate before storing it, so validation only guards the column
  // width and rejects an outright empty string.
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nopol: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  merk?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipe?: string | null

  // A model year, not a count. The bounds keep a mistyped 20021 out of the integer column while
  // staying wide enough for the oldest unit anyone still runs.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  tahun?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  kapasitas?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  noRangka?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  noMesin?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  noBpkb?: string | null

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

  @IsOptional()
  @IsUUID()
  jenisArmadaId?: string | null

  @IsOptional()
  @IsUUID()
  kepemilikanId?: string | null

  @IsOptional()
  @IsUUID()
  poolId?: string | null

  @IsOptional()
  @IsUUID()
  statusId?: string | null

  @IsOptional()
  @IsUUID()
  driverId?: string | null
}
```

`apps/backend/src/modules/fleet-vehicles/dto/update-fleet-vehicle.dto.ts`:

```ts
import { PartialType } from '@nestjs/swagger'
import { CreateFleetVehicleDto } from './create-fleet-vehicle.dto'

// PartialType keeps every rule above while making each field optional, which is exactly the
// patch semantics FleetVehiclesService.update expects: an absent field leaves the column alone.
// isActive is deliberately absent — archiving goes through POST :id/archive and :id/restore so the
// partial unique index on the plate is checked before the flag flips, which a blind patch of
// isActive would skip.
export class UpdateFleetVehicleDto extends PartialType(CreateFleetVehicleDto) {}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand create-fleet-vehicle.dto`
Expected: PASS, 21 test.

- [ ] **Step 5: Tulis test DTO list yang gagal**

`apps/backend/src/modules/fleet-vehicles/dto/list-fleet-vehicles.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ListFleetVehiclesDto } from './list-fleet-vehicles.dto'

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(ListFleetVehiclesDto, { ...overrides })

describe('ListFleetVehiclesDto', () => {
  it('accepts an empty query', async () => {
    expect(await validate(build())).toHaveLength(0)
  })

  // Query strings arrive as text. Without @Type(() => Number) the service compares '2' to a
  // number and paginates from NaN.
  it('coerces page and pageSize from their query-string form', async () => {
    const dto = build({ page: '3', pageSize: '50' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.page).toBe(3)
    expect(dto.pageSize).toBe(50)
  })

  it('rejects page zero', async () => {
    const errors = await validate(build({ page: '0' }))
    expect(errors.map((e) => e.property)).toContain('page')
  })

  it('rejects a negative page', async () => {
    const errors = await validate(build({ page: '-1' }))
    expect(errors.map((e) => e.property)).toContain('page')
  })

  it('rejects a non-numeric page', async () => {
    const errors = await validate(build({ page: 'dua' }))
    expect(errors.map((e) => e.property)).toContain('page')
  })

  // The service caps pageSize as well, but rejecting it here tells the caller their request was
  // wrong instead of silently serving a different page size than they asked for.
  it('rejects a pageSize above the cap', async () => {
    const errors = await validate(build({ pageSize: '5000' }))
    expect(errors.map((e) => e.property)).toContain('pageSize')
  })

  it('accepts a pageSize exactly at the cap', async () => {
    expect(await validate(build({ pageSize: '100' }))).toHaveLength(0)
  })

  it.each(['crit', 'warn', 'ok', 'none'])('accepts severity %s', async (severity) => {
    expect(await validate(build({ severity }))).toHaveLength(0)
  })

  // An unrecognised severity would fall through every branch in the service and silently return
  // an unfiltered list, which looks like the filter is broken rather than the input.
  it('rejects an unknown severity', async () => {
    const errors = await validate(build({ severity: 'merah' }))
    expect(errors.map((e) => e.property)).toContain('severity')
  })

  it.each(['nopol', '-nopol', 'severity', 'tahun', '-tahun'])(
    'accepts sort %s',
    async (sort) => {
      expect(await validate(build({ sort }))).toHaveLength(0)
    },
  )

  it('rejects an unknown sort key', async () => {
    const errors = await validate(build({ sort: 'merk' }))
    expect(errors.map((e) => e.property)).toContain('sort')
  })

  it.each(['kepemilikanId', 'poolId', 'statusId'])(
    'rejects a %s that is not a UUID',
    async (field) => {
      const errors = await validate(build({ [field]: 'pool-cakung' }))
      expect(errors.map((e) => e.property)).toContain(field)
    },
  )

  // Checkboxes send 'true'/'false' as text; without coercion 'false' is truthy and the archived
  // rows appear in a list that asked to hide them.
  it('coerces includeArchived from its query-string form', async () => {
    const dto = build({ includeArchived: 'true' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.includeArchived).toBe(true)
  })

  it('coerces the string false to false', async () => {
    const dto = build({ includeArchived: 'false' })
    expect(dto.includeArchived).toBe(false)
  })
})
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand list-fleet-vehicles.dto`
Expected: FAIL — `Cannot find module './list-fleet-vehicles.dto'`.

- [ ] **Step 7: Tulis DTO list**

`apps/backend/src/modules/fleet-vehicles/dto/list-fleet-vehicles.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'
import {
  FLEET_SEVERITIES,
  FLEET_VEHICLE_SORTS,
  FleetSeverity,
  FleetVehicleSort,
  MAX_PAGE_SIZE,
} from '../fleet-vehicles.constants'

export class ListFleetVehiclesDto {
  @IsOptional()
  @IsString()
  q?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  // Capped here as well as in the service so an over-large request is answered with a 400 the
  // caller can act on, rather than silently served a different page size than they asked for.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number

  @IsOptional()
  @IsIn(FLEET_VEHICLE_SORTS)
  sort?: FleetVehicleSort

  @IsOptional()
  @IsIn(FLEET_SEVERITIES)
  severity?: FleetSeverity

  @IsOptional()
  @IsUUID()
  kepemilikanId?: string

  @IsOptional()
  @IsUUID()
  poolId?: string

  @IsOptional()
  @IsUUID()
  statusId?: string

  // Query strings have no booleans. Without this the literal 'false' is truthy and archived rows
  // leak into a list that asked to hide them.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  includeArchived?: boolean
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand list-fleet-vehicles.dto`
Expected: PASS, 22 test.

- [ ] **Step 9: Tulis test DTO dokumen yang gagal**

`apps/backend/src/modules/fleet-vehicles/dto/replace-fleet-vehicle-documents.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ReplaceFleetVehicleDocumentsDto } from './replace-fleet-vehicle-documents.dto'

const build = (documents: unknown) =>
  plainToInstance(ReplaceFleetVehicleDocumentsDto, { documents })

const doc = (overrides: Record<string, unknown> = {}) => ({
  docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  nomor: 'JKT-II/1234',
  issuedAt: '2026-03-10',
  expiresAt: '2027-03-09',
  ...overrides,
})

describe('ReplaceFleetVehicleDocumentsDto', () => {
  it('accepts a well-formed document set', async () => {
    expect(await validate(build([doc()]))).toHaveLength(0)
  })

  // An empty set is a legitimate submission: it retires every live document and leaves the
  // vehicle with none.
  it('accepts an empty set', async () => {
    expect(await validate(build([]))).toHaveLength(0)
  })

  it('rejects a payload with no documents key', async () => {
    const errors = await validate(plainToInstance(ReplaceFleetVehicleDocumentsDto, {}))
    expect(errors.map((e) => e.property)).toContain('documents')
  })

  it('rejects documents that is not an array', async () => {
    const errors = await validate(build(doc()))
    expect(errors.map((e) => e.property)).toContain('documents')
  })

  // Without @ValidateNested + @Type the array is accepted as-is and every rule below is skipped,
  // which is the classic silent hole in a nested DTO.
  it('rejects an entry with no docTypeId', async () => {
    const errors = await validate(build([doc({ docTypeId: undefined })]))
    expect(errors).toHaveLength(1)
    expect(errors[0].children?.[0].children?.map((c) => c.property)).toContain('docTypeId')
  })

  it('rejects an entry whose docTypeId is not a UUID', async () => {
    const errors = await validate(build([doc({ docTypeId: 'kir' })]))
    expect(errors).toHaveLength(1)
  })

  it('rejects an entry whose expiresAt is not a date', async () => {
    const errors = await validate(build([doc({ expiresAt: 'besok' })]))
    expect(errors).toHaveLength(1)
  })

  it('rejects an entry whose issuedAt is not a date', async () => {
    const errors = await validate(build([doc({ issuedAt: 'kemarin' })]))
    expect(errors).toHaveLength(1)
  })

  it('rejects a nomor longer than the 80-char column', async () => {
    const errors = await validate(build([doc({ nomor: 'a'.repeat(81) })]))
    expect(errors).toHaveLength(1)
  })

  // A document whose number is not to hand yet still needs its expiry recorded — that expiry is
  // the whole point of the register.
  it('accepts an entry carrying only a doc type and an expiry', async () => {
    const errors = await validate(
      build([{ docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', expiresAt: '2027-03-09' }]),
    )
    expect(errors).toHaveLength(0)
  })

  it('accepts an entry with no dates at all', async () => {
    const errors = await validate(
      build([{ docTypeId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }]),
    )
    expect(errors).toHaveLength(0)
  })
})
```

- [ ] **Step 10: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand replace-fleet-vehicle-documents.dto`
Expected: FAIL — `Cannot find module './replace-fleet-vehicle-documents.dto'`.

- [ ] **Step 11: Tulis DTO dokumen**

`apps/backend/src/modules/fleet-vehicles/dto/replace-fleet-vehicle-documents.dto.ts`:

```ts
import { Type } from 'class-transformer'
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class FleetVehicleDocumentDto {
  @IsUUID()
  docTypeId: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nomor?: string | null

  // Calendar dates, not instants. The service stores them as-is into DATE columns.
  @IsOptional()
  @IsDateString()
  issuedAt?: string | null

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null
}

export class ReplaceFleetVehicleDocumentsDto {
  // @ValidateNested with @Type is what makes the rules above run at all. Without both, the array
  // is accepted as-is and every entry reaches the service unvalidated.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FleetVehicleDocumentDto)
  documents: FleetVehicleDocumentDto[]
}
```

- [ ] **Step 12: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand replace-fleet-vehicle-documents.dto`
Expected: PASS, 11 test.

- [ ] **Step 13: Tulis test controller yang gagal**

`apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing'
import { Permission } from '@shared/auth'
import { AUTHORIZE_KEY } from '../../common/decorators/authorize.decorator'
import { FleetVehiclesController } from './fleet-vehicles.controller'
import { FleetVehiclesService } from './fleet-vehicles.service'

describe('FleetVehiclesController', () => {
  let controller: FleetVehiclesController
  let service: Record<string, jest.Mock>

  beforeEach(async () => {
    service = {
      findAll: jest.fn(async () => ({ rows: [], total: 0, page: 1, pageSize: 25 })),
      findOne: jest.fn(async () => ({ id: 'v1' })),
      create: jest.fn(async () => ({ id: 'v1' })),
      update: jest.fn(async () => ({ id: 'v1' })),
      archive: jest.fn(async () => ({ id: 'v1' })),
      restore: jest.fn(async () => ({ id: 'v1' })),
      remove: jest.fn(async () => undefined),
      replaceDocuments: jest.fn(async () => ({ id: 'v1' })),
    }
    const module = await Test.createTestingModule({
      controllers: [FleetVehiclesController],
      providers: [{ provide: FleetVehiclesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = module.get(FleetVehiclesController)
  })

  // The whole query object is forwarded rather than unpacked field by field, so a filter added
  // to the DTO reaches the service without a controller change.
  it('forwards the parsed query straight to the service', async () => {
    const query = { q: 'canter', severity: 'crit' as const, page: 2 }
    await controller.findAll(query)
    expect(service.findAll).toHaveBeenCalledWith(query)
  })

  it('returns the paginated envelope untouched', async () => {
    service.findAll.mockResolvedValue({ rows: [{ id: 'v1' }], total: 87, page: 2, pageSize: 25 })
    const res = await controller.findAll({})
    expect(res).toEqual({ rows: [{ id: 'v1' }], total: 87, page: 2, pageSize: 25 })
  })

  it('reads one vehicle by id', async () => {
    await controller.findOne('v1')
    expect(service.findOne).toHaveBeenCalledWith('v1')
  })

  it('creates a vehicle', async () => {
    await controller.create({ nopol: 'B 1 A' } as never)
    expect(service.create).toHaveBeenCalledWith({ nopol: 'B 1 A' })
  })

  it('updates a vehicle', async () => {
    await controller.update('v1', { merk: 'Hino' } as never)
    expect(service.update).toHaveBeenCalledWith('v1', { merk: 'Hino' })
  })

  // Archiving is a state change, not a deletion — it must never reach the destructive path.
  it('archives without hard-deleting', async () => {
    await controller.archive('v1')
    expect(service.archive).toHaveBeenCalledWith('v1')
    expect(service.remove).not.toHaveBeenCalled()
  })

  it('restores an archived vehicle', async () => {
    await controller.restore('v1')
    expect(service.restore).toHaveBeenCalledWith('v1')
  })

  // DELETE is the genuinely destructive route; the service refuses it when history exists.
  it('hard-deletes on DELETE', async () => {
    await controller.remove('v1')
    expect(service.remove).toHaveBeenCalledWith('v1')
    expect(service.archive).not.toHaveBeenCalled()
  })

  it('unwraps the documents array before handing it to the service', async () => {
    await controller.replaceDocuments('v1', { documents: [{ docTypeId: 'dt-1' }] } as never)
    expect(service.replaceDocuments).toHaveBeenCalledWith('v1', [{ docTypeId: 'dt-1' }])
  })

  // Permission metadata is the only thing standing between an authenticated user and someone
  // else's data, and it is invisible at runtime in unit tests — assert it explicitly.
  it.each([
    ['findAll', Permission.READ_FLEET_VEHICLE],
    ['findOne', Permission.READ_FLEET_VEHICLE],
    ['create', Permission.CREATE_FLEET_VEHICLE],
    ['update', Permission.UPDATE_FLEET_VEHICLE],
    ['replaceDocuments', Permission.UPDATE_FLEET_VEHICLE],
    ['restore', Permission.UPDATE_FLEET_VEHICLE],
    ['archive', Permission.DELETE_FLEET_VEHICLE],
    ['remove', Permission.DELETE_FLEET_VEHICLE],
  ])('guards %s with %s', (method, permission) => {
    const meta = Reflect.getMetadata(
      AUTHORIZE_KEY,
      (FleetVehiclesController.prototype as Record<string, never>)[method],
    )
    expect(meta).toContain(permission)
  })
})
```

Sebelum menulis controller, buka `apps/backend/src/common/decorators/authorize.decorator.ts` dan pakai nama konstanta metadata yang benar-benar diekspor di sana. Jika file itu tidak mengekspor kunci metadata, ganti blok `it.each` terakhir dengan pembacaan lewat `Reflect.getMetadataKeys` pada method yang sama dan assert bahwa permission yang diharapkan ada pada salah satu nilainya — jangan menghapus test itu, karena metadata permission tidak terlihat di runtime unit test mana pun selain di sini.

- [ ] **Step 14: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles.controller`
Expected: FAIL — `Cannot find module './fleet-vehicles.controller'`.

- [ ] **Step 15: Tulis controller**

`apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.ts`:

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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { CreateFleetVehicleDto } from './dto/create-fleet-vehicle.dto'
import { UpdateFleetVehicleDto } from './dto/update-fleet-vehicle.dto'
import { ListFleetVehiclesDto } from './dto/list-fleet-vehicles.dto'
import { ReplaceFleetVehicleDocumentsDto } from './dto/replace-fleet-vehicle-documents.dto'

@ApiTags('Fleet Vehicles')
@Controller('fleet/vehicles')
@UseGuards(JwtAuthGuard)
export class FleetVehiclesController {
  constructor(private readonly service: FleetVehiclesService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_VEHICLE)
  findAll(@Query() query: ListFleetVehiclesDto) {
    return this.service.findAll(query)
  }

  @Get(':id')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  @Post()
  @Authorize(Permission.CREATE_FLEET_VEHICLE)
  create(@Body() dto: CreateFleetVehicleDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFleetVehicleDto) {
    return this.service.update(id, dto)
  }

  // The whole set replaces the old one in a single transaction because that is the shape of the
  // form: the operator sees every document at once and submits every document at once.
  @Put(':id/documents')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  replaceDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceFleetVehicleDocumentsDto,
  ) {
    return this.service.replaceDocuments(id, dto.documents)
  }

  @Post(':id/restore')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.restore(id)
  }

  // Archiving is a state change, not a deletion, so it is a POST — §5 of the spec, and the same
  // shape restore has. A unit that has been sold keeps its documents and its history and simply
  // stops appearing in the register, which is what the Arsipkan button in the UI means.
  @Post(':id/archive')
  @Authorize(Permission.DELETE_FLEET_VEHICLE)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(id)
  }

  // DELETE genuinely destroys the row. The service refuses with a 409 when the unit has any
  // document history, so this only ever removes a row created by mistake.
  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
```

- [ ] **Step 16: Tulis modul dan daftarkan**

`apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetVehicleDocumentEntity } from './entities/fleet-vehicle-document.entity'
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
      FleetMasterDataEntity,
    ]),
  ],
  providers: [FleetVehiclesService],
  controllers: [FleetVehiclesController],
  exports: [FleetVehiclesService],
})
export class FleetVehiclesModule {}
```

Di `apps/backend/src/app.module.ts`, tambahkan import setelah baris `FleetDriversModule`:

```ts
import { FleetVehiclesModule } from './modules/fleet-vehicles/fleet-vehicles.module'
```

dan entri di array `imports`, tepat setelah `FleetDriversModule,`:

```ts
    FleetVehiclesModule,
```

- [ ] **Step 17: Jalankan test controller dan seluruh suite fleet**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-vehicles`
Expected: PASS, seluruh file `fleet-vehicles.*` hijau (controller 18 test).

Run: `cd apps/backend && pnpm test -- --runInBand fleet-`
Expected: PASS — suite `fleet-master-data` dan `fleet-drivers` yang sudah ada tidak terpengaruh.

- [ ] **Step 18: Commit**

```bash
git add apps/backend/src/modules/fleet-vehicles/dto \
        apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-vehicles.controller.spec.ts \
        apps/backend/src/modules/fleet-vehicles/fleet-vehicles.module.ts \
        apps/backend/src/app.module.ts
git commit -m "feat(fleet): expose the vehicles module over HTTP

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Sambungkan tabel baru ke modul Phase 1

Dua utang yang ditinggalkan Phase 1 dengan komentar eksplisit, dan keduanya baru bisa dibayar sekarang karena tabelnya baru ada di Task 1.

Pertama, `FleetMasterDataService.countUsage` memprobe daftar kolom yang menunjuk ke `fleet_master_data.id`. Semua FK baru dari Task 1 adalah `ON DELETE RESTRICT`, jadi kalau kolomnya tidak terdaftar, probe menghitung nol, `repo.delete()` jalan, Postgres menolak, dan admin menerima 500 alih-alih 409 yang menyebut jumlah pemakainya.

Kedua, `FleetDriversService.remove` masih hard delete. `fleet_vehicles.driver_id` adalah `ON DELETE SET NULL`, jadi menghapus sopir yang sedang ditugaskan tidak akan error — kendaraannya diam-diam kehilangan sopir. Itu lebih buruk daripada 500: tidak ada yang tahu sampai ada yang mencari.

**Files:**
- Modify: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts` (`REFERENCING_COLUMNS`)
- Modify: `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.ts` (`remove`)
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.spec.ts`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-drivers.module.ts`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-drivers.controller.ts`
- Modify: `apps/backend/src/modules/fleet-drivers/fleet-drivers.controller.spec.ts`

**Interfaces:**
- Consumes: `FleetVehicleEntity` (Task 1) di dalam `FleetDriversModule`.
- Produces: `FleetDriversService.remove` yang sekarang mengarsipkan bila sopir terpasang, plus `FleetDriversService.restore(id)` dan rute `POST /fleet/drivers/:id/restore`.

- [ ] **Step 1: Tulis test yang gagal untuk registri master data**

Tambahkan di `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts`, di dalam `describe('remove', …)` — tepat setelah test `'probes fleet_drivers.sim_jenis_id — the FK that would otherwise 500'`:

```ts
    // Every FK below is ON DELETE RESTRICT, so an unregistered column means the probe counts
    // zero, the delete runs, Postgres refuses, and the admin gets a 500 where the 409 naming
    // the usage count belongs. One case per column so a dropped entry names itself.
    it.each([
      ['fleet_vehicles', 'jenis_armada_id'],
      ['fleet_vehicles', 'kepemilikan_id'],
      ['fleet_vehicles', 'pool_id'],
      ['fleet_vehicles', 'status_id'],
      ['fleet_vehicle_documents', 'doc_type_id'],
    ])('probes %s.%s', async (table, column) => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'pool', label: 'Pool Cakung' })
      dataSource.query.mockResolvedValue([{ count: '0' }])
      await service.remove('r1')
      const [sql] = dataSource.query.mock.calls[0] as [string, unknown[]]
      expect(sql.replace(/\s+/g, ' ')).toContain(
        `SELECT count(*) AS c FROM ${table} WHERE ${column} = $1`,
      )
    })

    // The probe sums one subquery per column. If a column is registered twice the count doubles
    // and a row nothing references reports usage, which blocks a legitimate delete.
    it('probes each column exactly once', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1', category: 'pool', label: 'Pool Cakung' })
      dataSource.query.mockResolvedValue([{ count: '0' }])
      await service.remove('r1')
      const [sql] = dataSource.query.mock.calls[0] as [string, unknown[]]
      const subqueries = sql.match(/SELECT count\(\*\)/g) ?? []
      expect(subqueries).toHaveLength(6)
    })
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-master-data.service`
Expected: FAIL — lima kasus `probes fleet_vehicles…`/`fleet_vehicle_documents…` gagal, dan `probes each column exactly once` melaporkan 1 bukan 6.

- [ ] **Step 3: Daftarkan kolom baru**

Di `apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts`, ganti seluruh blok `REFERENCING_COLUMNS` (termasuk komentarnya) dengan:

```ts
// Every column that points at fleet_master_data.id, so `remove` can tell an admin what they are
// about to break. All of them are ON DELETE RESTRICT, so without the entry here Postgres raises
// the violation after the guard has already waved the delete through and the admin gets a bare
// 500 instead of the 409 that names the count and says to deactivate. Phase 3 appends its
// columns as those tables arrive — this is the single place a new reference has to be registered.
const REFERENCING_COLUMNS: { table: string; column: string }[] = [
  { table: 'fleet_drivers', column: 'sim_jenis_id' },
  { table: 'fleet_vehicles', column: 'jenis_armada_id' },
  { table: 'fleet_vehicles', column: 'kepemilikan_id' },
  { table: 'fleet_vehicles', column: 'pool_id' },
  { table: 'fleet_vehicles', column: 'status_id' },
  { table: 'fleet_vehicle_documents', column: 'doc_type_id' },
]
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-master-data.service`
Expected: PASS.

- [ ] **Step 5: Tulis test yang gagal untuk arsip sopir**

Tambahkan di `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.spec.ts`, di dalam `describe('remove', …)`. Tambahkan juga mock repositori kendaraan pada `beforeEach` yang sudah ada — cari objek `providers` di file itu dan sisipkan provider baru:

```ts
        {
          provide: getRepositoryToken(FleetVehicleEntity),
          useValue: vehicleRepo,
        },
```

dengan deklarasi dan inisialisasi berikut di sisi `let`/`beforeEach` yang sama:

```ts
  let vehicleRepo: { count: jest.Mock }
  // …inside beforeEach, before createTestingModule:
  vehicleRepo = { count: jest.fn(async () => 0) }
```

dan import entity-nya di kepala file:

```ts
import { FleetVehicleEntity } from '../fleet-vehicles/entities/fleet-vehicle.entity'
```

Test-nya:

```ts
    // fleet_vehicles.driver_id is ON DELETE SET NULL, so deleting an assigned driver does not
    // error — the vehicle silently loses its driver and nobody finds out until someone goes
    // looking. Archiving keeps the row and the assignment intact.
    it('archives instead of deleting when a vehicle still points at the driver', async () => {
      vehicleRepo.count.mockResolvedValue(2)
      await service.remove('d1')
      expect(repo.delete).not.toHaveBeenCalled()
      expect(repo.update).toHaveBeenCalledWith('d1', { isActive: false })
    })

    it('counts only the vehicles assigned to this driver', async () => {
      vehicleRepo.count.mockResolvedValue(1)
      await service.remove('d1')
      expect(vehicleRepo.count).toHaveBeenCalledWith({ where: { driverId: 'd1' } })
    })

    // A driver added by mistake and never assigned should still be removable outright, otherwise
    // the list fills with archived typos.
    it('hard-deletes a driver no vehicle has ever been assigned to', async () => {
      vehicleRepo.count.mockResolvedValue(0)
      await service.remove('d1')
      expect(repo.delete).toHaveBeenCalledWith('d1')
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('404s on a driver that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
```

Dan blok baru untuk restore, setelah `describe('remove', …)`:

```ts
  describe('restore', () => {
    it('brings an archived driver back into the list', async () => {
      await service.restore('d1')
      expect(repo.update).toHaveBeenCalledWith('d1', { isActive: true })
    })

    it('404s on a driver that does not exist', async () => {
      repo.findOne.mockResolvedValue(null)
      await expect(service.restore('nope')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-drivers.service`
Expected: FAIL — `Nest can't resolve dependencies of the FleetDriversService` (argumen ketiga belum ada) dan `service.restore is not a function`.

- [ ] **Step 7: Ubah `remove` menjadi arsip dan tambahkan `restore`**

Di `apps/backend/src/modules/fleet-drivers/fleet-drivers.service.ts`, tambahkan import:

```ts
import { FleetVehicleEntity } from '../fleet-vehicles/entities/fleet-vehicle.entity'
```

Tambahkan parameter konstruktor setelah `masterRepo` yang sudah ada:

```ts
    @InjectRepository(FleetVehicleEntity)
    private readonly vehicleRepo: Repository<FleetVehicleEntity>,
```

Ganti seluruh method `remove` dengan:

```ts
  // fleet_vehicles.driver_id is ON DELETE SET NULL, so deleting an assigned driver would not
  // error — the vehicle would quietly lose its driver and nobody would find out until someone
  // went looking. An assigned driver is archived instead; one nobody has ever been assigned to
  // is still deletable outright, so a typo does not become a permanent archived row.
  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Driver not found')

    const assigned = await this.vehicleRepo.count({ where: { driverId: id } })
    if (assigned > 0) {
      await this.repo.update(id, { isActive: false })
      return
    }
    await this.repo.delete(id)
  }

  async restore(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } })
    if (!existing) throw new NotFoundException('Driver not found')
    await this.repo.update(id, { isActive: true })
  }
```

Di `apps/backend/src/modules/fleet-drivers/fleet-drivers.module.ts`, tambahkan entity ke `forFeature` dan perbarui komentarnya:

```ts
import { FleetVehicleEntity } from '../fleet-vehicles/entities/fleet-vehicle.entity'

// FleetMasterDataEntity is registered here so the service can validate that a submitted
// simJenisId really is a jenis_sim row; FleetVehicleEntity so remove() can tell an assigned
// driver from an unassigned one.
imports: [
  TypeOrmModule.forFeature([FleetDriverEntity, FleetMasterDataEntity, FleetVehicleEntity]),
],
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-drivers.service`
Expected: PASS.

- [ ] **Step 9: Ekspos rute restore sopir**

Tambahkan di `apps/backend/src/modules/fleet-drivers/fleet-drivers.controller.ts`, setelah method `update`:

```ts
  // The counterpart to DELETE, which now archives an assigned driver rather than removing them.
  @Post(':id/restore')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.restore(id)
  }
```

Tambahkan test di `apps/backend/src/modules/fleet-drivers/fleet-drivers.controller.spec.ts` — sisipkan `restore: jest.fn()` ke objek mock service yang sudah ada, lalu:

```ts
  it('restores an archived driver', async () => {
    await controller.restore('d1')
    expect(service.restore).toHaveBeenCalledWith('d1')
  })
```

- [ ] **Step 10: Jalankan seluruh suite fleet backend**

Run: `cd apps/backend && pnpm test -- --runInBand fleet-`
Expected: PASS — `fleet-master-data`, `fleet-drivers`, dan `fleet-vehicles` semuanya hijau.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/fleet-master-data/fleet-master-data.service.ts \
        apps/backend/src/modules/fleet-master-data/fleet-master-data.service.spec.ts \
        apps/backend/src/modules/fleet-drivers
git commit -m "feat(fleet): register the vehicle foreign keys and archive assigned drivers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Tipe, hook & helper severity frontend

Lapisan data frontend. Perhatikan satu aturan yang tidak boleh dilanggar: **tidak ada kalkulasi tanggal di sini**. `daysLeft` dan `severity` datang dari backend sudah jadi; helper di task ini hanya memetakan severity ke warna dan kata, tidak menghitung ulang.

**Files:**
- Modify: `apps/frontend/src/features/fleet/types.ts` (tambah tipe kendaraan)
- Create: `apps/frontend/src/features/fleet/utils/severity.ts`
- Create: `apps/frontend/src/features/fleet/utils/severity.spec.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts`
- Create: `apps/frontend/src/features/fleet/hooks/useFleetVehicles.spec.tsx`

**Interfaces:**
- Consumes: `apiClient` dari `@/shared/api/client`; `useFleetMasterDataByCategory(category, opts?)` dari `./useFleetDrivers` — bentuk dua-argumennya dibuat di Task 0; bentuk respons dari Task 3.
- Produces:
  - Tipe `FleetSeverity`, `FleetVehicleDocument`, `FleetVehicleDriver`, `FleetVehicle`, `FleetVehicleListResponse`, `FleetVehicleFilters`, `FleetVehiclePayload`, `FleetVehicleDocumentPayload`.
  - `severityMeta(severity)`, `expiryText(daysLeft)`, `SEVERITY_FILTER_OPTIONS`.
  - Hook `useFleetVehicles(filters)`, `useFleetVehicle(id)`, `useCreateFleetVehicle()`, `useUpdateFleetVehicle()`, `useArchiveFleetVehicle()`, `useRestoreFleetVehicle()`, `useReplaceVehicleDocuments()`.

- [ ] **Step 1: Tambahkan tipe kendaraan**

Tambahkan di akhir `apps/frontend/src/features/fleet/types.ts`:

```ts
export const FLEET_SEVERITIES = ['crit', 'warn', 'ok', 'none'] as const
export type FleetSeverity = (typeof FLEET_SEVERITIES)[number]

export const FLEET_VEHICLE_SORTS = ['nopol', '-nopol', 'severity', 'tahun', '-tahun'] as const
export type FleetVehicleSort = (typeof FLEET_VEHICLE_SORTS)[number]

// daysLeft and severity arrive computed. The frontend never derives them: the browser clock is
// the user's, and two operators in different timezones must not see different badges on the
// same row.
export interface FleetVehicleDocument {
  docTypeId: string
  code: string
  label: string
  nomor: string | null
  issuedAt: string | null
  expiresAt: string | null
  daysLeft: number | null
  severity: FleetSeverity
}

export interface FleetVehicleDriver {
  id: string
  nama: string
  simExpiresAt: string | null
  simDaysLeft: number | null
  simSeverity: FleetSeverity
}

export interface FleetVehicleRef {
  id: string
  label: string
}

export interface FleetVehicle {
  id: string
  nopol: string
  merk: string | null
  tipe: string | null
  tahun: number | null
  kapasitas: string | null
  noRangka: string | null
  noMesin: string | null
  noBpkb: string | null
  pemilikUnit: string | null
  odometer: number | null
  catatan: string | null
  jenisArmada: FleetVehicleRef | null
  kepemilikan: FleetVehicleRef | null
  pool: FleetVehicleRef | null
  status: FleetVehicleRef | null
  driver: FleetVehicleDriver | null
  documents: FleetVehicleDocument[]
  worstSeverity: FleetSeverity
  minDaysLeft: number | null
  isActive: boolean
}

export interface FleetVehicleListResponse {
  rows: FleetVehicle[]
  total: number
  page: number
  pageSize: number
}

export interface FleetVehicleFilters {
  q?: string
  page?: number
  pageSize?: number
  sort?: FleetVehicleSort
  severity?: FleetSeverity
  kepemilikanId?: string
  poolId?: string
  statusId?: string
  includeArchived?: boolean
}

export interface FleetVehiclePayload {
  nopol: string
  merk?: string | null
  tipe?: string | null
  tahun?: number | null
  kapasitas?: string | null
  noRangka?: string | null
  noMesin?: string | null
  noBpkb?: string | null
  pemilikUnit?: string | null
  odometer?: number | null
  catatan?: string | null
  jenisArmadaId?: string | null
  kepemilikanId?: string | null
  poolId?: string | null
  statusId?: string | null
  driverId?: string | null
}

export interface FleetVehicleDocumentPayload {
  docTypeId: string
  nomor?: string | null
  issuedAt?: string | null
  expiresAt?: string | null
}
```

- [ ] **Step 2: Tulis test helper severity yang gagal**

`apps/frontend/src/features/fleet/utils/severity.spec.ts`:

```ts
import { SEVERITY_FILTER_OPTIONS, expiryText, severityMeta } from './severity'
import { FLEET_SEVERITIES } from '../types'

describe('severityMeta', () => {
  // Every severity the backend can emit must map to something renderable. A missing entry
  // renders `undefined` into a className and the badge loses its colour silently.
  it.each(FLEET_SEVERITIES)('maps %s to a label and a tone', (severity) => {
    const meta = severityMeta(severity)
    expect(meta.label).toBeTruthy()
    expect(meta.tone).toBeTruthy()
  })

  it('labels crit as expired', () => {
    expect(severityMeta('crit').label).toBe('Kadaluarsa')
  })

  it('labels warn as approaching', () => {
    expect(severityMeta('warn').label).toBe('Segera')
  })

  it('labels ok as valid', () => {
    expect(severityMeta('ok').label).toBe('Aktif')
  })

  // 'none' means no dated document at all, which is different from a valid one and must not be
  // dressed up in green.
  it('distinguishes none from ok', () => {
    expect(severityMeta('none').label).not.toBe(severityMeta('ok').label)
    expect(severityMeta('none').tone).not.toBe(severityMeta('ok').tone)
  })

  it('gives crit, warn and ok three distinct tones', () => {
    const tones = new Set(['crit', 'warn', 'ok'].map((s) => severityMeta(s as never).tone))
    expect(tones.size).toBe(3)
  })
})

describe('expiryText', () => {
  it('reads out the remaining days', () => {
    expect(expiryText(12)).toBe('12 hari lagi')
  })

  // Today is the last valid day, not an expired one — an operator seeing "0 hari lagi" would
  // reasonably think there is still time.
  it('calls zero days today', () => {
    expect(expiryText(0)).toBe('Hari ini')
  })

  it('reports how long ago a document lapsed', () => {
    expect(expiryText(-3)).toBe('Lewat 3 hari')
  })

  it('says a document has no date rather than rendering null', () => {
    expect(expiryText(null)).toBe('Belum ada tanggal')
  })
})

describe('SEVERITY_FILTER_OPTIONS', () => {
  // The filter dropdown offers every severity plus an all-clear entry. Anything missing here is
  // a filter an operator cannot reach.
  it('offers every severity plus an unfiltered option', () => {
    expect(SEVERITY_FILTER_OPTIONS).toHaveLength(FLEET_SEVERITIES.length + 1)
  })

  it('uses an empty value for the unfiltered option', () => {
    expect(SEVERITY_FILTER_OPTIONS[0].value).toBe('')
  })

  it('covers every severity value', () => {
    const values = SEVERITY_FILTER_OPTIONS.map((o) => o.value)
    FLEET_SEVERITIES.forEach((s) => expect(values).toContain(s))
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test severity`
Expected: FAIL — `Cannot find module './severity'`.

- [ ] **Step 4: Tulis helper severity**

`apps/frontend/src/features/fleet/utils/severity.ts`:

```ts
import { FleetSeverity } from '../types'

export interface SeverityMeta {
  label: string
  tone: string
  dot: string
}

// Presentation only. daysLeft and severity arrive already computed from the backend — nothing
// here recomputes a date, because the browser clock belongs to the user and two operators in
// different timezones must not see different badges on the same row.
const META: Record<FleetSeverity, SeverityMeta> = {
  crit: {
    label: 'Kadaluarsa',
    tone: 'bg-red-50 text-red-700 ring-red-600/20',
    dot: 'bg-red-500',
  },
  warn: {
    label: 'Segera',
    tone: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  ok: {
    label: 'Aktif',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  // Grey, not green: no dated document is an absence of information, not a clean bill of health.
  none: {
    label: 'Belum ada',
    tone: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
  },
}

export function severityMeta(severity: FleetSeverity): SeverityMeta {
  return META[severity] ?? META.none
}

// Today is the last valid day. "0 hari lagi" reads like there is still time, so it gets its own
// wording.
export function expiryText(daysLeft: number | null): string {
  if (daysLeft === null) return 'Belum ada tanggal'
  if (daysLeft === 0) return 'Hari ini'
  if (daysLeft < 0) return `Lewat ${Math.abs(daysLeft)} hari`
  return `${daysLeft} hari lagi`
}

export const SEVERITY_FILTER_OPTIONS: { value: '' | FleetSeverity; label: string }[] = [
  { value: '', label: 'Semua dokumen' },
  { value: 'crit', label: 'Kadaluarsa' },
  { value: 'warn', label: 'Segera habis' },
  { value: 'ok', label: 'Aktif' },
  { value: 'none', label: 'Belum ada dokumen' },
]
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd apps/frontend && pnpm test severity`
Expected: PASS, 13 test.

- [ ] **Step 6: Tulis test hook yang gagal**

`apps/frontend/src/features/fleet/hooks/useFleetVehicles.spec.tsx`:

```tsx
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { apiClient } from '@/shared/api/client'
import {
  useArchiveFleetVehicle,
  useCreateFleetVehicle,
  useFleetVehicle,
  useFleetVehicles,
  useReplaceVehicleDocuments,
  useRestoreFleetVehicle,
  useUpdateFleetVehicle,
} from './useFleetVehicles'

jest.mock('@/shared/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

const mocked = apiClient as unknown as Record<string, jest.Mock>

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const wireRow = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  nopol: 'B 9114 KYZ',
  worstSeverity: 'warn',
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mocked.get.mockResolvedValue({
    data: { rows: [wireRow()], total: 1, page: 1, pageSize: 25 },
  })
})

describe('useFleetVehicles', () => {
  it('reads the vehicle list', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/vehicles', expect.anything())
  })

  it('forwards the filters as query params', async () => {
    const { result } = renderHook(
      () => useFleetVehicles({ q: 'canter', severity: 'crit', page: 2, poolId: 'p1' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params).toMatchObject({
      q: 'canter',
      severity: 'crit',
      page: 2,
      poolId: 'p1',
    })
  })

  // An empty search box must not send `q=`; the backend would treat it as a filter and the DTO
  // would carry a meaningless key on every request.
  it('omits an empty search term', async () => {
    const { result } = renderHook(() => useFleetVehicles({ q: '' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get.mock.calls[0][1].params.q).toBeUndefined()
  })

  it('omits filters that are not set', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const params = mocked.get.mock.calls[0][1].params
    expect(params.severity).toBeUndefined()
    expect(params.poolId).toBeUndefined()
  })

  // The filters are part of the cache key, otherwise switching a filter shows the previous
  // filter's rows from cache until the refetch lands.
  it('keys the cache by the filters', async () => {
    const { result } = renderHook(() => useFleetVehicles({ severity: 'crit' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    renderHook(() => useFleetVehicles({ severity: 'warn' }), { wrapper })
    await waitFor(() => expect(mocked.get).toHaveBeenCalledTimes(2))
  })

  // Frontend and backend deploy separately, so a response from an older backend must still
  // render rather than crashing on a missing array.
  it('defaults a missing documents array to empty', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].documents).toEqual([])
  })

  it('defaults a missing isActive to true', async () => {
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].isActive).toBe(true)
  })

  it('defaults a missing worstSeverity to none', async () => {
    mocked.get.mockResolvedValue({
      data: { rows: [{ id: 'v1', nopol: 'B 1 A' }], total: 1, page: 1, pageSize: 25 },
    })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows[0].worstSeverity).toBe('none')
  })

  it('passes the envelope totals through', async () => {
    mocked.get.mockResolvedValue({
      data: { rows: [], total: 87, page: 3, pageSize: 25 },
    })
    const { result } = renderHook(() => useFleetVehicles({ page: 3 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ total: 87, page: 3, pageSize: 25 })
  })

  // A backend that answers with a bare array (or nothing) must not crash the table.
  it('survives a response with no rows array', async () => {
    mocked.get.mockResolvedValue({ data: {} })
    const { result } = renderHook(() => useFleetVehicles({}), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.rows).toEqual([])
  })
})

describe('useFleetVehicle', () => {
  it('reads a single vehicle by id', async () => {
    mocked.get.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useFleetVehicle('v1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocked.get).toHaveBeenCalledWith('/fleet/vehicles/v1')
  })

  // The detail query is used by the edit dialog, which mounts before a row is chosen.
  it('stays idle without an id', () => {
    const { result } = renderHook(() => useFleetVehicle(undefined), { wrapper })
    expect(mocked.get).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('mutations', () => {
  it('creates a vehicle', async () => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useCreateFleetVehicle(), { wrapper })
    await result.current.mutateAsync({ nopol: 'B 1 A' })
    expect(mocked.post).toHaveBeenCalledWith('/fleet/vehicles', { nopol: 'B 1 A' })
  })

  it('updates a vehicle', async () => {
    mocked.patch.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useUpdateFleetVehicle(), { wrapper })
    await result.current.mutateAsync({ id: 'v1', payload: { merk: 'Hino' } })
    expect(mocked.patch).toHaveBeenCalledWith('/fleet/vehicles/v1', { merk: 'Hino' })
  })

  // A POST to the archive route, not a DELETE: the row survives and can be restored.
  it('archives through the archive route', async () => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useArchiveFleetVehicle(), { wrapper })
    await result.current.mutateAsync('v1')
    expect(mocked.post).toHaveBeenCalledWith('/fleet/vehicles/v1/archive')
  })

  it('restores through the restore route', async () => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useRestoreFleetVehicle(), { wrapper })
    await result.current.mutateAsync('v1')
    expect(mocked.post).toHaveBeenCalledWith('/fleet/vehicles/v1/restore')
  })

  // The whole set goes in one PUT so the backend can swap it in a single transaction; sending
  // documents one at a time would leave the vehicle half-updated if one call failed.
  it('replaces the document set in one PUT', async () => {
    mocked.put.mockResolvedValue({ data: wireRow() })
    const { result } = renderHook(() => useReplaceVehicleDocuments(), { wrapper })
    await result.current.mutateAsync({
      id: 'v1',
      documents: [{ docTypeId: 'dt-1', expiresAt: '2027-01-01' }],
    })
    expect(mocked.put).toHaveBeenCalledWith('/fleet/vehicles/v1/documents', {
      documents: [{ docTypeId: 'dt-1', expiresAt: '2027-01-01' }],
    })
  })

  // Without the invalidation the table keeps showing the pre-edit row until something else
  // triggers a refetch, which reads as "my change did not save".
  it.each([
    ['create', () => useCreateFleetVehicle(), { nopol: 'B 1 A' } as never],
    ['update', () => useUpdateFleetVehicle(), { id: 'v1', payload: {} } as never],
    ['archive', () => useArchiveFleetVehicle(), 'v1' as never],
    ['restore', () => useRestoreFleetVehicle(), 'v1' as never],
    ['documents', () => useReplaceVehicleDocuments(), { id: 'v1', documents: [] } as never],
  ])('invalidates the vehicles cache after %s', async (_name, hook, arg) => {
    mocked.post.mockResolvedValue({ data: wireRow() })
    mocked.patch.mockResolvedValue({ data: wireRow() })
    mocked.put.mockResolvedValue({ data: wireRow() })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const spy = jest.spyOn(client, 'invalidateQueries')
    const localWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(hook, { wrapper: localWrapper })
    await result.current.mutateAsync(arg)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['fleet', 'vehicles'] })
  })
})
```

- [ ] **Step 7: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test useFleetVehicles`
Expected: FAIL — `Cannot find module './useFleetVehicles'`.

- [ ] **Step 8: Tulis hook**

`apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import {
  FleetSeverity,
  FleetVehicle,
  FleetVehicleDocument,
  FleetVehicleDocumentPayload,
  FleetVehicleFilters,
  FleetVehicleListResponse,
  FleetVehiclePayload,
} from '../types'

// Wire shapes are looser than the domain types: frontend and backend deploy in parallel, so a
// response from a backend that predates a field must still render. Same convention as
// useFleetDrivers.
interface FleetVehicleWire extends Partial<Omit<FleetVehicle, 'id' | 'nopol' | 'documents'>> {
  id: string
  nopol: string
  documents?: Partial<FleetVehicleDocument>[]
}

interface FleetVehicleListWire {
  rows?: FleetVehicleWire[]
  total?: number
  page?: number
  pageSize?: number
}

const VEHICLES_KEY = ['fleet', 'vehicles']

function normalizeDocument(d: Partial<FleetVehicleDocument>): FleetVehicleDocument {
  return {
    docTypeId: d.docTypeId ?? '',
    code: d.code ?? '',
    label: d.label ?? '',
    nomor: d.nomor ?? null,
    issuedAt: d.issuedAt ?? null,
    expiresAt: d.expiresAt ?? null,
    daysLeft: d.daysLeft ?? null,
    severity: d.severity ?? 'none',
  }
}

function normalizeVehicle(row: FleetVehicleWire): FleetVehicle {
  return {
    id: row.id,
    nopol: row.nopol,
    merk: row.merk ?? null,
    tipe: row.tipe ?? null,
    tahun: row.tahun ?? null,
    kapasitas: row.kapasitas ?? null,
    noRangka: row.noRangka ?? null,
    noMesin: row.noMesin ?? null,
    noBpkb: row.noBpkb ?? null,
    pemilikUnit: row.pemilikUnit ?? null,
    odometer: row.odometer ?? null,
    catatan: row.catatan ?? null,
    jenisArmada: row.jenisArmada ?? null,
    kepemilikan: row.kepemilikan ?? null,
    pool: row.pool ?? null,
    status: row.status ?? null,
    driver: row.driver ?? null,
    documents: (row.documents ?? []).map(normalizeDocument),
    // 'none' rather than 'ok': a backend that did not answer has not said the papers are in
    // order, and a green badge on an unknown state is the one wrong answer here.
    worstSeverity: (row.worstSeverity as FleetSeverity) ?? 'none',
    minDaysLeft: row.minDaysLeft ?? null,
    isActive: row.isActive ?? true,
  }
}

export function useFleetVehicles(filters: FleetVehicleFilters) {
  return useQuery<FleetVehicleListWire, Error, FleetVehicleListResponse>({
    // The filters are part of the key: without them, switching a filter serves the previous
    // filter's rows from cache until the refetch lands.
    queryKey: [...VEHICLES_KEY, filters],
    queryFn: () =>
      apiClient
        .get('/fleet/vehicles', {
          params: {
            q: filters.q?.trim() || undefined,
            page: filters.page,
            pageSize: filters.pageSize,
            sort: filters.sort,
            severity: filters.severity || undefined,
            kepemilikanId: filters.kepemilikanId || undefined,
            poolId: filters.poolId || undefined,
            statusId: filters.statusId || undefined,
            includeArchived: filters.includeArchived || undefined,
          },
        })
        .then((r) => r.data),
    select: (data) => ({
      rows: (data.rows ?? []).map(normalizeVehicle),
      total: data.total ?? 0,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 25,
    }),
    staleTime: 30 * 1000,
  })
}

export function useFleetVehicle(id?: string) {
  return useQuery<FleetVehicleWire, Error, FleetVehicle>({
    queryKey: [...VEHICLES_KEY, 'detail', id],
    queryFn: () => apiClient.get(`/fleet/vehicles/${id}`).then((r) => r.data),
    select: normalizeVehicle,
    // The edit dialog mounts before a row is chosen.
    enabled: Boolean(id),
  })
}

export function useCreateFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FleetVehiclePayload) =>
      apiClient.post('/fleet/vehicles', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useUpdateFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<FleetVehiclePayload> }) =>
      apiClient.patch(`/fleet/vehicles/${id}`, payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

// Archiving is a state change, not a deletion — POST, matching the backend route. The UI never
// hard-deletes: DELETE /fleet/vehicles/:id exists but deliberately has no hook here.
export function useArchiveFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/fleet/vehicles/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

export function useRestoreFleetVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/fleet/vehicles/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}

// The whole set goes in one request so the backend can swap it in a single transaction; sending
// documents one at a time leaves the vehicle half-updated when one call fails.
export function useReplaceVehicleDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, documents }: { id: string; documents: FleetVehicleDocumentPayload[] }) =>
      apiClient.put(`/fleet/vehicles/${id}/documents`, { documents }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: VEHICLES_KEY }),
  })
}
```

- [ ] **Step 9: Jalankan test, pastikan lulus**

Run: `cd apps/frontend && pnpm test useFleetVehicles`
Expected: PASS, 21 test.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/fleet/types.ts \
        apps/frontend/src/features/fleet/utils/severity.ts \
        apps/frontend/src/features/fleet/utils/severity.spec.ts \
        apps/frontend/src/features/fleet/hooks/useFleetVehicles.ts \
        apps/frontend/src/features/fleet/hooks/useFleetVehicles.spec.tsx
git commit -m "feat(fleet): add vehicle types, data hooks and severity presentation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Komponen tampilan — badge, filter & tabel

Tiga komponen presentasi murni. Semuanya menerima data lewat props dan tidak memanggil hook data sendiri, supaya bisa diuji tanpa `QueryClientProvider` dan supaya halaman tetap satu-satunya tempat state hidup.

**Files:**
- Create: `apps/frontend/src/features/fleet/components/SeverityBadge.tsx`
- Create: `apps/frontend/src/features/fleet/components/SeverityBadge.spec.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehicleFilters.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehicleFilters.spec.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehicleTable.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehicleTable.spec.tsx`

**Interfaces:**
- Consumes: `severityMeta`, `expiryText`, `SEVERITY_FILTER_OPTIONS` (Task 6); `FleetVehicle`, `FleetSeverity`, `FleetVehicleFilters`, `FleetMasterRow` (Task 6); `DataTable`, `DataTableColumn` dari `@/components/shared/data-table`; `Input`, `Button` dari `@/components/ui/*`.
- Produces:
  - `<SeverityBadge severity daysLeft? label? />`
  - `<VehicleFilters value onChange kepemilikanOptions poolOptions statusOptions />`
  - `<VehicleTable rows isLoading sort onSortChange onEdit onDocuments onArchive onRestore />`

- [ ] **Step 1: Tulis test SeverityBadge yang gagal**

`apps/frontend/src/features/fleet/components/SeverityBadge.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { SeverityBadge } from './SeverityBadge'

describe('SeverityBadge', () => {
  it('renders the severity label', () => {
    render(<SeverityBadge severity="crit" />)
    expect(screen.getByText('Kadaluarsa')).toBeInTheDocument()
  })

  it('appends the remaining days when given', () => {
    render(<SeverityBadge severity="warn" daysLeft={12} />)
    expect(screen.getByText(/12 hari lagi/)).toBeInTheDocument()
  })

  it('shows only the label when no day count is given', () => {
    render(<SeverityBadge severity="ok" />)
    expect(screen.queryByText(/hari/)).not.toBeInTheDocument()
  })

  it('prefers an explicit label over the severity default', () => {
    render(<SeverityBadge severity="crit" label="STNK" />)
    expect(screen.getByText(/STNK/)).toBeInTheDocument()
  })

  // Colour alone is not an accessible signal, and a screen reader reading "Kadaluarsa" without
  // saying what expired tells the operator nothing actionable. role="img", not role="status":
  // a status is a live region, and one per row means 25 of them announcing at once on a full page.
  it('carries a text label a screen reader can read', () => {
    render(<SeverityBadge severity="crit" daysLeft={-3} label="KIR" />)
    expect(screen.getByRole('img')).toHaveTextContent('KIR')
    expect(screen.getByRole('img')).toHaveTextContent('Lewat 3 hari')
    expect(screen.getByRole('img')).toHaveAccessibleName('KIR · Lewat 3 hari')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test SeverityBadge`
Expected: FAIL — `Cannot find module './SeverityBadge'`.

- [ ] **Step 3: Tulis SeverityBadge**

`apps/frontend/src/features/fleet/components/SeverityBadge.tsx`:

```tsx
import { cn } from '@/lib/utils'
import { FleetSeverity } from '../types'
import { expiryText, severityMeta } from '../utils/severity'

interface SeverityBadgeProps {
  severity: FleetSeverity
  daysLeft?: number | null
  label?: string
  className?: string
}

// role="img" with an aria-label, deliberately not role="status": a status is an ARIA live region,
// and one badge per row means 25 live regions on a full page all announcing at once on every sort
// or filter, which is worse for a screen-reader operator than no announcement at all. The label
// spells out exactly what a sighted user reads — severity plus the written-out day count — so an
// operator using a screen reader, or one of the ~8% of men with a red/green deficiency, still gets
// the same information as everyone else and colour is never the only signal.
export function SeverityBadge({ severity, daysLeft, label, className }: SeverityBadgeProps) {
  const meta = severityMeta(severity)
  const text = label ?? meta.label
  const expiry = daysLeft !== undefined ? expiryText(daysLeft) : null
  return (
    <span
      role="img"
      aria-label={expiry === null ? text : `${text} · ${expiry}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        meta.tone,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {text}
      {expiry !== null && <span className="font-normal opacity-80">· {expiry}</span>}
    </span>
  )
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/frontend && pnpm test SeverityBadge`
Expected: PASS, 5 test.

- [ ] **Step 5: Tulis test VehicleFilters yang gagal**

`apps/frontend/src/features/fleet/components/VehicleFilters.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { VehicleFilters } from './VehicleFilters'
import { FleetMasterRow } from '../types'

const opt = (id: string, label: string): FleetMasterRow => ({
  id,
  category: 'pool',
  code: id,
  label,
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
})

const setup = (value = {}, onChange = jest.fn()) => {
  render(
    <VehicleFilters
      value={value}
      onChange={onChange}
      kepemilikanOptions={[opt('k1', 'Milik Sendiri')]}
      poolOptions={[opt('p1', 'Pool Cakung')]}
      statusOptions={[opt('s1', 'Beroperasi')]}
    />,
  )
  return onChange
}

describe('VehicleFilters', () => {
  it('renders the current search term', () => {
    setup({ q: 'canter' })
    expect(screen.getByLabelText(/cari/i)).toHaveValue('canter')
  })

  it('reports a typed search term', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(/cari/i), { target: { value: 'B 9114' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: 'B 9114' }))
  })

  // Every filter change has to reset to page 1. Staying on page 4 after narrowing to two results
  // shows an empty table and reads as "the filter found nothing".
  it('resets to the first page whenever a filter changes', () => {
    const onChange = setup({ page: 4, q: 'x' })
    fireEvent.change(screen.getByLabelText(/cari/i), { target: { value: 'y' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
  })

  it('offers every severity option', () => {
    setup()
    const select = screen.getByLabelText(/dokumen/i)
    expect(select.querySelectorAll('option')).toHaveLength(5)
  })

  it('reports a chosen severity', () => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(/dokumen/i), { target: { value: 'crit' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ severity: 'crit' }))
  })

  // Clearing a filter must send undefined, not ''. An empty string is a value the hook would
  // forward and the backend DTO would reject as a non-UUID.
  it('clears a filter to undefined rather than an empty string', () => {
    const onChange = setup({ severity: 'crit' })
    fireEvent.change(screen.getByLabelText(/dokumen/i), { target: { value: '' } })
    expect(onChange.mock.calls[0][0].severity).toBeUndefined()
  })

  it.each([
    [/kepemilikan/i, 'kepemilikanId', 'k1'],
    [/pool/i, 'poolId', 'p1'],
    [/status/i, 'statusId', 's1'],
  ])('reports the chosen %s', (labelRe, field, id) => {
    const onChange = setup()
    fireEvent.change(screen.getByLabelText(labelRe), { target: { value: id } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ [field]: id }))
  })

  it('lists the master options it was given', () => {
    setup()
    expect(screen.getByRole('option', { name: 'Pool Cakung' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Milik Sendiri' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Beroperasi' })).toBeInTheDocument()
  })

  it('toggles archived units into the list', () => {
    const onChange = setup()
    fireEvent.click(screen.getByLabelText(/arsip/i))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ includeArchived: true }))
  })

  // Without this the operator has to clear five controls one at a time to get back to the full
  // list, and the archived toggle is easy to forget.
  it('offers a reset that clears every filter at once', () => {
    const onChange = setup({ q: 'x', severity: 'crit', poolId: 'p1', includeArchived: true })
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(onChange).toHaveBeenCalledWith({ page: 1 })
  })

  it('hides the reset button when nothing is filtered', () => {
    setup()
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test VehicleFilters`
Expected: FAIL — `Cannot find module './VehicleFilters'`.

- [ ] **Step 7: Tulis VehicleFilters**

`apps/frontend/src/features/fleet/components/VehicleFilters.tsx`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FleetMasterRow, FleetSeverity, FleetVehicleFilters } from '../types'
import { SEVERITY_FILTER_OPTIONS } from '../utils/severity'

interface VehicleFiltersProps {
  value: FleetVehicleFilters
  onChange: (next: FleetVehicleFilters) => void
  kepemilikanOptions: FleetMasterRow[]
  poolOptions: FleetMasterRow[]
  statusOptions: FleetMasterRow[]
}

const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

export function VehicleFilters({
  value,
  onChange,
  kepemilikanOptions,
  poolOptions,
  statusOptions,
}: VehicleFiltersProps) {
  // Every change resets to page 1. Narrowing the filter while sitting on page 4 shows an empty
  // table, which reads as "the filter found nothing" rather than "you are past the end".
  const patch = (next: Partial<FleetVehicleFilters>) => onChange({ ...value, ...next, page: 1 })

  const isFiltered = Boolean(
    value.q ||
      value.severity ||
      value.kepemilikanId ||
      value.poolId ||
      value.statusId ||
      value.includeArchived,
  )

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/20 p-3 md:flex-row md:flex-wrap md:items-end">
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-q">
          Cari armada
        </label>
        <Input
          id="vehicle-q"
          value={value.q ?? ''}
          placeholder="Nopol, merk, no. rangka, sopir…"
          onChange={(e) => patch({ q: e.target.value })}
        />
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-severity">
          Status dokumen
        </label>
        <select
          id="vehicle-severity"
          className={SELECT_CLASS}
          value={value.severity ?? ''}
          // undefined, not '': an empty string would travel to the backend as a filter value and
          // the DTO would reject it.
          onChange={(e) =>
            patch({ severity: (e.target.value || undefined) as FleetSeverity | undefined })
          }
        >
          {SEVERITY_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-kepemilikan">
          Kepemilikan
        </label>
        <select
          id="vehicle-kepemilikan"
          className={SELECT_CLASS}
          value={value.kepemilikanId ?? ''}
          onChange={(e) => patch({ kepemilikanId: e.target.value || undefined })}
        >
          <option value="">Semua kepemilikan</option>
          {kepemilikanOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-pool">
          Pool
        </label>
        <select
          id="vehicle-pool"
          className={SELECT_CLASS}
          value={value.poolId ?? ''}
          onChange={(e) => patch({ poolId: e.target.value || undefined })}
        >
          <option value="">Semua pool</option>
          {poolOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicle-status">
          Status unit
        </label>
        <select
          id="vehicle-status"
          className={SELECT_CLASS}
          value={value.statusId ?? ''}
          onChange={(e) => patch({ statusId: e.target.value || undefined })}
        >
          <option value="">Semua status</option>
          {statusOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm" htmlFor="vehicle-archived">
        <input
          id="vehicle-archived"
          type="checkbox"
          className="h-4 w-4"
          checked={value.includeArchived ?? false}
          onChange={(e) => patch({ includeArchived: e.target.checked || undefined })}
        />
        Tampilkan arsip
      </label>

      {isFiltered && (
        <Button type="button" variant="ghost" onClick={() => onChange({ page: 1 })}>
          Reset filter
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleFilters`
Expected: PASS, 13 test.

- [ ] **Step 9: Tulis test VehicleTable yang gagal**

`apps/frontend/src/features/fleet/components/VehicleTable.spec.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { VehicleTable } from './VehicleTable'
import { FleetVehicle } from '../types'

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle => ({
  id: 'v1',
  nopol: 'B 9114 KYZ',
  merk: 'Mitsubishi',
  tipe: 'Canter',
  tahun: 2021,
  kapasitas: '8 ton',
  noRangka: null,
  noMesin: null,
  noBpkb: null,
  pemilikUnit: null,
  odometer: null,
  catatan: null,
  jenisArmada: { id: 'ja1', label: 'CDE' },
  kepemilikan: null,
  pool: { id: 'p1', label: 'Pool Cakung' },
  status: { id: 's1', label: 'Beroperasi' },
  driver: {
    id: 'dr1',
    nama: 'Ahmad Fauzi',
    simExpiresAt: '2027-03-14',
    simDaysLeft: 550,
    simSeverity: 'ok',
  },
  documents: [
    {
      docTypeId: 'dt1',
      code: 'kir',
      label: 'KIR',
      nomor: 'JKT-1',
      issuedAt: null,
      expiresAt: '2026-09-15',
      daysLeft: 5,
      severity: 'warn',
    },
  ],
  worstSeverity: 'warn',
  minDaysLeft: 5,
  isActive: true,
  ...over,
})

const setup = (over: Partial<Parameters<typeof VehicleTable>[0]> = {}) => {
  const props = {
    rows: [vehicle()],
    isLoading: false,
    sort: 'nopol' as const,
    onSortChange: jest.fn(),
    onEdit: jest.fn(),
    onDocuments: jest.fn(),
    onArchive: jest.fn(),
    onRestore: jest.fn(),
    ...over,
  }
  render(<VehicleTable {...props} />)
  return props
}

describe('VehicleTable', () => {
  it('shows the plate', () => {
    setup()
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
  })

  it('shows the make, model and year together', () => {
    setup()
    expect(screen.getByText(/Mitsubishi Canter/)).toBeInTheDocument()
    expect(screen.getByText(/2021/)).toBeInTheDocument()
  })

  it('shows the assigned driver', () => {
    setup()
    expect(screen.getByText('Ahmad Fauzi')).toBeInTheDocument()
  })

  // A vehicle with nobody assigned is a normal state, not a rendering hole.
  it('says so when no driver is assigned', () => {
    setup({ rows: [vehicle({ driver: null })] })
    expect(screen.getByText(/belum ada sopir/i)).toBeInTheDocument()
  })

  it('shows the worst document severity on the row', () => {
    setup()
    expect(screen.getByText(/Segera/)).toBeInTheDocument()
  })

  // The number of days is the actionable part: "Segera" alone does not say whether to act today
  // or next month.
  it('shows how long the nearest document has left', () => {
    setup()
    expect(screen.getByText(/5 hari lagi/)).toBeInTheDocument()
  })

  it('shows a distinct state for a vehicle with no documents', () => {
    setup({ rows: [vehicle({ documents: [], worstSeverity: 'none', minDaysLeft: null })] })
    expect(screen.getByText(/Belum ada/)).toBeInTheDocument()
  })

  it('renders the empty state when there are no rows', () => {
    setup({ rows: [] })
    expect(screen.getByText(/belum ada armada/i)).toBeInTheDocument()
  })

  it('renders the loading state', () => {
    setup({ rows: [], isLoading: true })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('opens the edit dialog for a row', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /ubah/i }))
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('opens the documents dialog for a row', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /dokumen/i }))
    expect(props.onDocuments).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('archives a live row', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /arsipkan/i }))
    expect(props.onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  // An archived row offers restore instead of archive — offering both, or neither, is what makes
  // the archive view unusable.
  it('offers restore instead of archive on an archived row', () => {
    const props = setup({ rows: [vehicle({ isActive: false })] })
    expect(screen.queryByRole('button', { name: /arsipkan/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pulihkan' }))
    expect(props.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('marks an archived row visibly', () => {
    setup({ rows: [vehicle({ isActive: false })] })
    expect(screen.getByText(/arsip/i)).toBeInTheDocument()
  })

  it('sorts by plate when the plate header is clicked', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /nopol/i }))
    expect(props.onSortChange).toHaveBeenCalledWith('-nopol')
  })

  // Clicking the active sort header flips its direction rather than re-applying the same order.
  it('flips the direction when the active sort header is clicked again', () => {
    const props = setup({ sort: '-nopol' })
    fireEvent.click(screen.getByRole('button', { name: /nopol/i }))
    expect(props.onSortChange).toHaveBeenCalledWith('nopol')
  })

  it('sorts by severity when the document header is clicked', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: /dokumen/i, exact: false }))
    expect(props.onSortChange).toHaveBeenCalled()
  })
})
```

Catatan: tombol aksi "Dokumen" dan header sort "Dokumen" sama-sama cocok dengan `/dokumen/i`. Beri header sort `aria-label="Urutkan dokumen"` dan tombol aksi teks polos `Dokumen`, lalu pakai `screen.getByRole('button', { name: 'Urutkan dokumen' })` di test sort dan `{ name: 'Dokumen' }` di test aksi. Perbaiki kedua test itu sesuai label yang benar-benar dipakai — jangan biarkan query ambigu.

- [ ] **Step 10: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test VehicleTable`
Expected: FAIL — `Cannot find module './VehicleTable'`.

- [ ] **Step 11: Tulis VehicleTable**

`apps/frontend/src/features/fleet/components/VehicleTable.tsx`:

```tsx
'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, DataTableColumn } from '@/components/shared/data-table'
import { FleetVehicle, FleetVehicleSort } from '../types'
import { SeverityBadge } from './SeverityBadge'

interface VehicleTableProps {
  rows: FleetVehicle[]
  isLoading: boolean
  sort: FleetVehicleSort
  onSortChange: (sort: FleetVehicleSort) => void
  onEdit: (row: FleetVehicle) => void
  onDocuments: (row: FleetVehicle) => void
  onArchive: (row: FleetVehicle) => void
  onRestore: (row: FleetVehicle) => void
}

// Each sortable column names its ascending key and the descending key it toggles to, so the
// header knows both which arrow to draw and what to ask for next.
const SORT_PAIRS: Record<string, [FleetVehicleSort, FleetVehicleSort]> = {
  nopol: ['nopol', '-nopol'],
  tahun: ['tahun', '-tahun'],
}

export function VehicleTable({
  rows,
  isLoading,
  sort,
  onSortChange,
  onEdit,
  onDocuments,
  onArchive,
  onRestore,
}: VehicleTableProps) {
  const sortHeader = (label: string, key: keyof typeof SORT_PAIRS, ariaLabel?: string) => {
    const [asc, desc] = SORT_PAIRS[key]
    const active = sort === asc ? 'asc' : sort === desc ? 'desc' : null
    const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => onSortChange(active === 'asc' ? desc : asc)}
      >
        {label}
        <Icon size={13} aria-hidden="true" />
      </button>
    )
  }

  const columns: DataTableColumn<FleetVehicle>[] = [
    {
      header: 'Nopol',
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.nopol}</span>
          {!row.isActive && <span className="text-xs text-muted-foreground">Arsip</span>}
        </div>
      ),
    },
    {
      header: 'Unit',
      accessor: (row) => (
        <div className="flex flex-col">
          <span>{[row.merk, row.tipe].filter(Boolean).join(' ') || '—'}</span>
          <span className="text-xs text-muted-foreground">
            {[row.tahun, row.jenisArmada?.label].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      header: 'Sopir',
      accessor: (row) =>
        row.driver ? (
          <span>{row.driver.nama}</span>
        ) : (
          <span className="text-muted-foreground">Belum ada sopir</span>
        ),
    },
    {
      header: 'Pool',
      accessor: (row) => row.pool?.label ?? '—',
    },
    {
      header: 'Status',
      accessor: (row) => row.status?.label ?? '—',
    },
    {
      header: 'Dokumen',
      accessor: (row) => (
        // daysLeft comes from the backend already computed; passing it through is the whole job.
        <SeverityBadge severity={row.worstSeverity} daysLeft={row.minDaysLeft} />
      ),
    },
    {
      header: 'Aksi',
      className: 'text-right',
      accessor: (row) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
            Ubah
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDocuments(row)}>
            Dokumen
          </Button>
          {row.isActive ? (
            <Button size="sm" variant="ghost" onClick={() => onArchive(row)}>
              Arsipkan
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onRestore(row)}>
              Pulihkan
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      {/* DataTableColumn.header is typed as a string, so the sort controls live in their own
          row above the table rather than inside <th>. Keeping them here avoids widening the
          shared component's contract for this one caller. */}
      <div className="mb-2 flex items-center gap-4 px-1 text-sm text-muted-foreground">
        <span>Urutkan:</span>
        {sortHeader('Nopol', 'nopol')}
        {sortHeader('Tahun', 'tahun')}
        <button
          type="button"
          aria-label="Urutkan dokumen"
          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
          onClick={() => onSortChange('severity')}
        >
          Dokumen
          <ArrowUpDown size={13} aria-hidden="true" />
        </button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        keyExtractor={(row) => row.id}
        emptyMessage="Belum ada armada yang cocok dengan filter ini."
        rowDataTestId="vehicle-row"
      />
    </>
  )
}
```

- [ ] **Step 12: Jalankan test, pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleTable`
Expected: PASS, 17 test.

- [ ] **Step 13: Commit**

```bash
git add apps/frontend/src/features/fleet/components/SeverityBadge.tsx \
        apps/frontend/src/features/fleet/components/SeverityBadge.spec.tsx \
        apps/frontend/src/features/fleet/components/VehicleFilters.tsx \
        apps/frontend/src/features/fleet/components/VehicleFilters.spec.tsx \
        apps/frontend/src/features/fleet/components/VehicleTable.tsx \
        apps/frontend/src/features/fleet/components/VehicleTable.spec.tsx
git commit -m "feat(fleet): add the vehicle badge, filter bar and table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Dialog form armada & dokumen

Dua dialog. `VehicleFormDialog` untuk data unit, `VehicleDocumentsDialog` untuk set dokumen. Keduanya dipisah karena disimpan lewat endpoint yang berbeda — data unit lewat `POST`/`PATCH`, dokumen lewat satu `PUT` transaksional — dan menggabungkannya berarti satu form dengan dua kegagalan parsial yang mungkin.

**Files:**
- Create: `apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.tsx`
- Create: `apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.spec.tsx`

**Interfaces:**
- Consumes: `FleetVehicle`, `FleetVehiclePayload`, `FleetVehicleDocumentPayload`, `FleetMasterRow`, `FleetDriver` (Task 6 & Phase 1); `apiErrorMessage` dari `../utils/api-error`; `expiryText`, `severityMeta` (Task 6); `FormField`, `Dialog*`, `Input`, `Button` seperti dipakai `DriverFormDialog`.
- Produces:
  - `<VehicleFormDialog open initial? masterData drivers onSubmit onClose />` dengan `masterData: { jenisArmada, kepemilikan, pool, status: FleetMasterRow[] }`
  - `<VehicleDocumentsDialog open vehicle docTypes onSubmit onClose />`

- [ ] **Step 1: Tulis test VehicleFormDialog yang gagal**

`apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VehicleFormDialog } from './VehicleFormDialog'
import { FleetDriver, FleetMasterRow, FleetVehicle } from '../types'

const master = (id: string, label: string): FleetMasterRow => ({
  id,
  category: 'pool',
  code: id,
  label,
  sortOrder: 0,
  isActive: true,
  warnDays: null,
  defaultValidMonths: null,
  isRequired: null,
})

const driver: FleetDriver = {
  id: 'dr1',
  nama: 'Ahmad Fauzi',
  telepon: null,
  simNomor: null,
  simJenisId: null,
  simExpiresAt: null,
  isActive: true,
}

const existing = {
  id: 'v1',
  nopol: 'B 9114 KYZ',
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
  kepemilikan: { id: 'kp1', label: 'Milik Sendiri' },
  pool: { id: 'p1', label: 'Pool Cakung' },
  status: { id: 's1', label: 'Beroperasi' },
  driver: null,
  documents: [],
  worstSeverity: 'none',
  minDaysLeft: null,
  isActive: true,
} as FleetVehicle

const setup = (over: Record<string, unknown> = {}) => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <VehicleFormDialog
      open
      masterData={{
        jenisArmada: [master('ja1', 'CDE')],
        kepemilikan: [master('kp1', 'Milik Sendiri')],
        pool: [master('p1', 'Pool Cakung')],
        status: [master('s1', 'Beroperasi')],
      }}
      drivers={[driver]}
      onSubmit={onSubmit}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSubmit, onClose }
}

const typePlate = (value: string) =>
  fireEvent.change(screen.getByLabelText(/nomor polisi/i), { target: { value } })

describe('VehicleFormDialog', () => {
  it('opens empty when adding a vehicle', () => {
    setup()
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('')
    expect(screen.getByRole('heading', { name: /tambah armada/i })).toBeInTheDocument()
  })

  it('prefills every field when editing', () => {
    setup({ initial: existing })
    expect(screen.getByLabelText(/nomor polisi/i)).toHaveValue('B 9114 KYZ')
    expect(screen.getByLabelText(/merk/i)).toHaveValue('Mitsubishi')
    expect(screen.getByLabelText(/tahun/i)).toHaveValue(2021)
    expect(screen.getByLabelText(/odometer/i)).toHaveValue(120000)
  })

  // The master refs arrive as {id,label} objects but the selects need the id — a mismatch here
  // silently resets the dropdown to blank on every edit and quietly clears the column on save.
  it('preselects the master dropdowns from the nested refs', () => {
    setup({ initial: existing })
    expect(screen.getByLabelText(/jenis armada/i)).toHaveValue('ja1')
    expect(screen.getByLabelText(/kepemilikan/i)).toHaveValue('kp1')
    expect(screen.getByLabelText(/pool/i)).toHaveValue('p1')
    expect(screen.getByLabelText(/status/i)).toHaveValue('s1')
  })

  it('refuses to submit without a plate', async () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/nomor polisi wajib/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses a plate that is only whitespace', async () => {
    const { onSubmit } = setup()
    typePlate('   ')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/nomor polisi wajib/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the plate the operator typed', async () => {
    const { onSubmit } = setup()
    typePlate('B 9114 KYZ')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nopol: 'B 9114 KYZ' })),
    )
  })

  // Optional text travels as null, never ''. The backend reads an absent value as "leave
  // unchanged", so an empty string would make a cleared field unclearable.
  it('sends null rather than an empty string for untouched optional text', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.merk).toBeNull()
    expect(payload.catatan).toBeNull()
    expect(payload.jenisArmadaId).toBeNull()
  })

  // A blank number input yields '' — Number('') is 0, which would silently register a 1970
  // model year and a zero odometer on a used truck.
  it('sends null rather than zero for a blank year and odometer', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].tahun).toBeNull()
    expect(onSubmit.mock.calls[0][0].odometer).toBeNull()
  })

  it('sends the year and odometer as numbers, not strings', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.change(screen.getByLabelText(/tahun/i), { target: { value: '2021' } })
    fireEvent.change(screen.getByLabelText(/odometer/i), { target: { value: '120000' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].tahun).toBe(2021)
    expect(onSubmit.mock.calls[0][0].odometer).toBe(120000)
  })

  it('sends the chosen driver', async () => {
    const { onSubmit } = setup()
    typePlate('B 1 A')
    fireEvent.change(screen.getByLabelText(/sopir/i), { target: { value: 'dr1' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].driverId).toBe('dr1')
  })

  it('lists the master options it was given', () => {
    setup()
    expect(screen.getByRole('option', { name: 'Pool Cakung' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ahmad Fauzi' })).toBeInTheDocument()
  })

  it('closes after a successful save', async () => {
    const { onClose } = setup()
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // The 409 from a duplicate plate is the single most likely error here, and the backend's
  // message names the plate. Swallowing it for a generic string loses that.
  it('shows the backend message when the save is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'Plate "B 9114 KYZ" is already registered' } },
    })
    setup({ onSubmit })
    typePlate('B 9114 KYZ')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
  })

  it('stays open when the save fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'))
    const { onClose } = setup({ onSubmit })
    typePlate('B 1 A')
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
    typePlate('B 1 A')
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /menyimpan/i })).toBeDisabled())
    resolve()
  })

  it('closes without saving when cancelled', () => {
    const { onSubmit, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /batal/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test VehicleFormDialog`
Expected: FAIL — `Cannot find module './VehicleFormDialog'`.

- [ ] **Step 3: Tulis VehicleFormDialog**

`apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx`:

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
import { FleetDriver, FleetMasterRow, FleetVehicle, FleetVehiclePayload } from '../types'
import { apiErrorMessage } from '../utils/api-error'

interface VehicleMasterData {
  jenisArmada: FleetMasterRow[]
  kepemilikan: FleetMasterRow[]
  pool: FleetMasterRow[]
  status: FleetMasterRow[]
}

interface VehicleFormDialogProps {
  open: boolean
  initial?: FleetVehicle
  masterData: VehicleMasterData
  drivers: FleetDriver[]
  onSubmit: (payload: FleetVehiclePayload) => Promise<void>
  onClose: () => void
}

const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

// A blank number input reads as ''. Number('') is 0, which would register a 1970 model year and
// a zero odometer on a used truck — both plausible enough to go unnoticed.
const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function VehicleFormDialog({
  open,
  initial,
  masterData,
  drivers,
  onSubmit,
  onClose,
}: VehicleFormDialogProps) {
  const [nopol, setNopol] = useState(initial?.nopol ?? '')
  const [merk, setMerk] = useState(initial?.merk ?? '')
  const [tipe, setTipe] = useState(initial?.tipe ?? '')
  const [tahun, setTahun] = useState(initial?.tahun?.toString() ?? '')
  const [kapasitas, setKapasitas] = useState(initial?.kapasitas ?? '')
  const [noRangka, setNoRangka] = useState(initial?.noRangka ?? '')
  const [noMesin, setNoMesin] = useState(initial?.noMesin ?? '')
  const [noBpkb, setNoBpkb] = useState(initial?.noBpkb ?? '')
  const [pemilikUnit, setPemilikUnit] = useState(initial?.pemilikUnit ?? '')
  const [odometer, setOdometer] = useState(initial?.odometer?.toString() ?? '')
  const [catatan, setCatatan] = useState(initial?.catatan ?? '')
  // The refs arrive as {id,label} objects; the selects need the bare id.
  const [jenisArmadaId, setJenisArmadaId] = useState(initial?.jenisArmada?.id ?? '')
  const [kepemilikanId, setKepemilikanId] = useState(initial?.kepemilikan?.id ?? '')
  const [poolId, setPoolId] = useState(initial?.pool?.id ?? '')
  const [statusId, setStatusId] = useState(initial?.status?.id ?? '')
  const [driverId, setDriverId] = useState(initial?.driver?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nopol.trim()) {
      setError('Nomor polisi wajib diisi.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      // Optional fields travel as null, never '': the backend reads an absent field as "leave
      // unchanged", so an empty string would make a cleared field unremovable.
      await onSubmit({
        nopol: nopol.trim(),
        merk: merk.trim() || null,
        tipe: tipe.trim() || null,
        tahun: numberOrNull(tahun),
        kapasitas: kapasitas.trim() || null,
        noRangka: noRangka.trim() || null,
        noMesin: noMesin.trim() || null,
        noBpkb: noBpkb.trim() || null,
        pemilikUnit: pemilikUnit.trim() || null,
        odometer: numberOrNull(odometer),
        catatan: catatan.trim() || null,
        jenisArmadaId: jenisArmadaId || null,
        kepemilikanId: kepemilikanId || null,
        poolId: poolId || null,
        statusId: statusId || null,
        driverId: driverId || null,
      })
      onClose()
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Terjadi kesalahan. Coba lagi.'))
    } finally {
      setSubmitting(false)
    }
  }

  const masterSelect = (
    id: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    options: FleetMasterRow[],
  ) => (
    <FormField label={label} htmlFor={id}>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">— pilih —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Ubah armada' : 'Tambah armada'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nomor polisi" required htmlFor="vf-nopol">
              <Input id="vf-nopol" value={nopol} onChange={(e) => setNopol(e.target.value)} />
            </FormField>

            <FormField label="Merk" htmlFor="vf-merk">
              <Input id="vf-merk" value={merk} onChange={(e) => setMerk(e.target.value)} />
            </FormField>

            <FormField label="Tipe" htmlFor="vf-tipe">
              <Input id="vf-tipe" value={tipe} onChange={(e) => setTipe(e.target.value)} />
            </FormField>

            <FormField label="Tahun" htmlFor="vf-tahun">
              <Input
                id="vf-tahun"
                type="number"
                value={tahun}
                onChange={(e) => setTahun(e.target.value)}
              />
            </FormField>

            <FormField label="Kapasitas" htmlFor="vf-kapasitas">
              <Input
                id="vf-kapasitas"
                value={kapasitas}
                onChange={(e) => setKapasitas(e.target.value)}
              />
            </FormField>

            <FormField label="Odometer" htmlFor="vf-odometer">
              <Input
                id="vf-odometer"
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
            </FormField>

            <FormField label="Nomor rangka" htmlFor="vf-rangka">
              <Input
                id="vf-rangka"
                value={noRangka}
                onChange={(e) => setNoRangka(e.target.value)}
              />
            </FormField>

            <FormField label="Nomor mesin" htmlFor="vf-mesin">
              <Input id="vf-mesin" value={noMesin} onChange={(e) => setNoMesin(e.target.value)} />
            </FormField>

            <FormField label="Nomor BPKB" htmlFor="vf-bpkb">
              <Input id="vf-bpkb" value={noBpkb} onChange={(e) => setNoBpkb(e.target.value)} />
            </FormField>

            <FormField label="Pemilik unit" htmlFor="vf-pemilik">
              <Input
                id="vf-pemilik"
                value={pemilikUnit}
                onChange={(e) => setPemilikUnit(e.target.value)}
              />
            </FormField>

            {masterSelect(
              'vf-jenis-armada',
              'Jenis armada',
              jenisArmadaId,
              setJenisArmadaId,
              masterData.jenisArmada,
            )}
            {masterSelect(
              'vf-kepemilikan',
              'Kepemilikan',
              kepemilikanId,
              setKepemilikanId,
              masterData.kepemilikan,
            )}
            {masterSelect('vf-pool', 'Pool', poolId, setPoolId, masterData.pool)}
            {masterSelect('vf-status', 'Status unit', statusId, setStatusId, masterData.status)}

            <FormField label="Sopir" htmlFor="vf-driver">
              <select
                id="vf-driver"
                className={SELECT_CLASS}
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">— belum ditugaskan —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nama}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Catatan" htmlFor="vf-catatan">
            <textarea
              id="vf-catatan"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
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

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleFormDialog`
Expected: PASS, 16 test.

- [ ] **Step 5: Tulis test VehicleDocumentsDialog yang gagal**

`apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VehicleDocumentsDialog } from './VehicleDocumentsDialog'
import { FleetMasterRow, FleetVehicle } from '../types'

const docType = (id: string, code: string, label: string, warnDays = 30): FleetMasterRow => ({
  id,
  category: 'jenis_dokumen',
  code,
  label,
  sortOrder: 0,
  isActive: true,
  warnDays,
  defaultValidMonths: null,
  isRequired: null,
})

const DOC_TYPES = [docType('dt-stnk', 'stnk', 'STNK'), docType('dt-kir', 'kir', 'KIR')]

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle =>
  ({
    id: 'v1',
    nopol: 'B 9114 KYZ',
    documents: [],
    worstSeverity: 'none',
    minDaysLeft: null,
    isActive: true,
    ...over,
  }) as FleetVehicle

const setup = (over: Record<string, unknown> = {}) => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(
    <VehicleDocumentsDialog
      open
      vehicle={vehicle()}
      docTypes={DOC_TYPES}
      onSubmit={onSubmit}
      onClose={onClose}
      {...over}
    />,
  )
  return { onSubmit, onClose }
}

describe('VehicleDocumentsDialog', () => {
  // One row per configured type, always. A form that only shows the documents already recorded
  // gives the operator no way to add the one that is missing, which is the common case.
  it('shows a row for every configured document type', () => {
    setup()
    expect(screen.getByLabelText(/STNK.*berlaku/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/KIR.*berlaku/i)).toBeInTheDocument()
  })

  it('names the vehicle it is editing', () => {
    setup()
    expect(screen.getByText(/B 9114 KYZ/)).toBeInTheDocument()
  })

  it('prefills the rows from the existing documents', () => {
    setup({
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: 'JKT-1',
            issuedAt: '2026-03-10',
            expiresAt: '2026-09-15',
            daysLeft: 5,
            severity: 'warn',
          },
        ],
      }),
    })
    expect(screen.getByLabelText(/KIR.*nomor/i)).toHaveValue('JKT-1')
    expect(screen.getByLabelText(/KIR.*berlaku/i)).toHaveValue('2026-09-15')
  })

  // The badge is the reason the operator opened this dialog; recomputing it in the browser is
  // exactly what the spec forbids, so it renders the backend's severity as delivered.
  it('shows the backend severity for a document that has one', () => {
    setup({
      vehicle: vehicle({
        documents: [
          {
            docTypeId: 'dt-kir',
            code: 'kir',
            label: 'KIR',
            nomor: null,
            issuedAt: null,
            expiresAt: '2020-01-01',
            daysLeft: -300,
            severity: 'crit',
          },
        ],
      }),
    })
    expect(screen.getByText(/Kadaluarsa/)).toBeInTheDocument()
  })

  // The whole set goes in one submit, including the types the operator left blank — the backend
  // retires anything absent, so omitting a filled row would silently delete that document.
  it('submits every type the operator filled in', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/STNK.*berlaku/i), {
      target: { value: '2027-05-01' },
    })
    fireEvent.change(screen.getByLabelText(/KIR.*berlaku/i), { target: { value: '2027-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const sent = onSubmit.mock.calls[0][0] as { docTypeId: string }[]
    expect(sent.map((d) => d.docTypeId).sort()).toEqual(['dt-kir', 'dt-stnk'])
  })

  // An empty row is not a document. Sending it would create a live row with no data and turn the
  // badge from 'none' into a permanent grey entry.
  it('leaves out rows the operator did not fill in', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/KIR.*berlaku/i), { target: { value: '2027-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toHaveLength(1)
  })

  // A number with no expiry is still worth recording — some documents do not expire.
  it('keeps a row that has a number but no dates', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/STNK.*nomor/i), { target: { value: 'A-1' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      expect.objectContaining({ docTypeId: 'dt-stnk', nomor: 'A-1' }),
    ])
  })

  it('sends blank optional values as null', async () => {
    const { onSubmit } = setup()
    fireEvent.change(screen.getByLabelText(/KIR.*berlaku/i), { target: { value: '2027-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0][0].nomor).toBeNull()
    expect(onSubmit.mock.calls[0][0][0].issuedAt).toBeNull()
  })

  // Clearing every row is a legitimate submission that retires the lot. Blocking it would leave
  // a wrongly-entered document with no way to remove it.
  it('allows submitting an empty set', async () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]))
  })

  it('closes after a successful save', async () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows the backend message when the save is rejected', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { message: 'dt-x is not a jenis_dokumen master row' } },
    })
    setup({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(await screen.findByText(/jenis_dokumen/)).toBeInTheDocument()
  })

  it('disables the submit button while saving', async () => {
    let resolve: () => void = () => {}
    const onSubmit = jest.fn(() => new Promise<void>((r) => (resolve = r)))
    setup({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /menyimpan/i })).toBeDisabled())
    resolve()
  })

  it('closes without saving when cancelled', () => {
    const { onSubmit, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /batal/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test VehicleDocumentsDialog`
Expected: FAIL — `Cannot find module './VehicleDocumentsDialog'`.

- [ ] **Step 7: Tulis VehicleDocumentsDialog**

`apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.tsx`:

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
import {
  FleetMasterRow,
  FleetVehicle,
  FleetVehicleDocument,
  FleetVehicleDocumentPayload,
} from '../types'
import { apiErrorMessage } from '../utils/api-error'
import { SeverityBadge } from './SeverityBadge'

interface VehicleDocumentsDialogProps {
  open: boolean
  vehicle: FleetVehicle
  docTypes: FleetMasterRow[]
  onSubmit: (documents: FleetVehicleDocumentPayload[]) => Promise<void>
  onClose: () => void
}

interface DocRowState {
  nomor: string
  issuedAt: string
  expiresAt: string
}

const emptyRow: DocRowState = { nomor: '', issuedAt: '', expiresAt: '' }

export function VehicleDocumentsDialog({
  open,
  vehicle,
  docTypes,
  onSubmit,
  onClose,
}: VehicleDocumentsDialogProps) {
  // A row per configured type, always — a form showing only the documents already recorded gives
  // the operator no way to add the one that is missing, which is the common case.
  const [rows, setRows] = useState<Record<string, DocRowState>>(() =>
    Object.fromEntries(
      docTypes.map((t) => {
        const existing = vehicle.documents.find((d) => d.docTypeId === t.id)
        return [
          t.id,
          existing
            ? {
                nomor: existing.nomor ?? '',
                issuedAt: existing.issuedAt ?? '',
                expiresAt: existing.expiresAt ?? '',
              }
            : { ...emptyRow },
        ]
      }),
    ),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const patchRow = (id: string, next: Partial<DocRowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }))

  const existingFor = (id: string): FleetVehicleDocument | undefined =>
    vehicle.documents.find((d) => d.docTypeId === id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // An untouched row is not a document — sending it would create a live row with no data.
      // Everything the operator did fill in goes in one submit, because the backend retires
      // whatever is absent and a dropped row would silently delete that document.
      const documents: FleetVehicleDocumentPayload[] = docTypes
        .map((t) => ({ id: t.id, row: rows[t.id] ?? emptyRow }))
        .filter(({ row }) => row.nomor.trim() || row.issuedAt || row.expiresAt)
        .map(({ id, row }) => ({
          docTypeId: id,
          nomor: row.nomor.trim() || null,
          issuedAt: row.issuedAt || null,
          expiresAt: row.expiresAt || null,
        }))
      await onSubmit(documents)
      onClose()
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Terjadi kesalahan. Coba lagi.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dokumen {vehicle.nopol}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Kosongkan baris untuk menghapus dokumen tersebut dari unit ini.
          </p>

          {docTypes.map((t) => {
            const row = rows[t.id] ?? emptyRow
            const existing = existingFor(t.id)
            return (
              <div key={t.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t.label}</span>
                  {/* severity and daysLeft come from the backend already computed — nothing here
                      derives a date from the browser clock. */}
                  {existing && (
                    <SeverityBadge severity={existing.severity} daysLeft={existing.daysLeft} />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground" htmlFor={`doc-${t.id}-nomor`}>
                      {t.label} nomor
                    </label>
                    <Input
                      id={`doc-${t.id}-nomor`}
                      value={row.nomor}
                      onChange={(e) => patchRow(t.id, { nomor: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor={`doc-${t.id}-issued`}
                    >
                      {t.label} terbit
                    </label>
                    <Input
                      id={`doc-${t.id}-issued`}
                      type="date"
                      value={row.issuedAt}
                      onChange={(e) => patchRow(t.id, { issuedAt: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs text-muted-foreground"
                      htmlFor={`doc-${t.id}-expires`}
                    >
                      {t.label} berlaku sampai
                    </label>
                    <Input
                      id={`doc-${t.id}-expires`}
                      type="date"
                      value={row.expiresAt}
                      onChange={(e) => patchRow(t.id, { expiresAt: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )
          })}

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

- [ ] **Step 8: Jalankan test, pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleDocumentsDialog`
Expected: PASS, 13 test.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/fleet/components/VehicleFormDialog.tsx \
        apps/frontend/src/features/fleet/components/VehicleFormDialog.spec.tsx \
        apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.tsx \
        apps/frontend/src/features/fleet/components/VehicleDocumentsDialog.spec.tsx
git commit -m "feat(fleet): add the vehicle and document form dialogs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Halaman Armada & navigasi

Halaman yang merakit semuanya, plus dua utang navigasi dari Phase 1: tab Armada di `layout.tsx` dan redirect `/fleet`.

**Files:**
- Create: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`
- Create: `apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/layout.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/layout.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/fleet/page.tsx`
- Create: `apps/frontend/src/app/(dashboard)/fleet/page.spec.tsx`

**Interfaces:**
- Consumes: seluruh hook dan komponen dari Task 6–8; `useFleetDrivers`, `useFleetMasterDataByCategory(category, opts?)` (Task 0); `usePermissions`; `PageHeader`, `ConfirmDialog`, `Button`.
- Produces: rute `/fleet/vehicles`; tab Armada sebagai tab pertama; `/fleet` mengarah ke `/fleet/vehicles`.

- [ ] **Step 1: Tulis test halaman yang gagal**

`apps/frontend/src/app/(dashboard)/fleet/vehicles/page.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetVehiclesPage from './page'
import { FleetVehicle } from '@/features/fleet/types'

const mutations = {
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  archive: jest.fn().mockResolvedValue({}),
  restore: jest.fn().mockResolvedValue({}),
  documents: jest.fn().mockResolvedValue({}),
}

const refetchVehicles = jest.fn()
// The three fields every non-error case shares, so each test states only what makes it
// different.
const ok = { isLoading: false, isError: false, refetch: refetchVehicles }
let listResult: {
  data?: { rows: FleetVehicle[]; total: number; page: number; pageSize: number }
  isLoading: boolean
  isError: boolean
  refetch: jest.Mock
} = { data: { rows: [], total: 0, page: 1, pageSize: 25 }, ...ok }

jest.mock('@/features/fleet/hooks/useFleetVehicles', () => ({
  useFleetVehicles: jest.fn(() => listResult),
  useFleetVehicle: jest.fn(() => ({ data: undefined })),
  useCreateFleetVehicle: () => ({ mutateAsync: mutations.create }),
  useUpdateFleetVehicle: () => ({ mutateAsync: mutations.update }),
  useArchiveFleetVehicle: () => ({ mutateAsync: mutations.archive }),
  useRestoreFleetVehicle: () => ({ mutateAsync: mutations.restore }),
  useReplaceVehicleDocuments: () => ({ mutateAsync: mutations.documents }),
}))

// A jest.fn rather than an inline arrow, because the permission-gating tests assert on the
// second argument this page passes.
const mockMasterData = jest.fn((category: string) => ({
  data: [{ id: `${category}-1`, category, code: 'c', label: `${category} satu`, sortOrder: 0, isActive: true, warnDays: 30, defaultValidMonths: null, isRequired: null }],
}))
jest.mock('@/features/fleet/hooks/useFleetDrivers', () => ({
  useFleetDrivers: () => ({ data: [{ id: 'dr1', nama: 'Ahmad Fauzi', isActive: true }] }),
  useFleetMasterDataByCategory: (category: string, opts?: { enabled?: boolean }) =>
    mockMasterData(category, opts),
}))

let permissions = [
  'read.fleet_vehicle',
  'create.fleet_vehicle',
  'update.fleet_vehicle',
  'delete.fleet_vehicle',
]
jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissions.includes(p) }),
}))

const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle =>
  ({
    id: 'v1',
    nopol: 'B 9114 KYZ',
    merk: 'Mitsubishi',
    tipe: 'Canter',
    tahun: 2021,
    jenisArmada: null,
    kepemilikan: null,
    pool: null,
    status: null,
    driver: null,
    documents: [],
    worstSeverity: 'none',
    minDaysLeft: null,
    isActive: true,
    ...over,
  }) as FleetVehicle

beforeEach(() => {
  jest.clearAllMocks()
  permissions = [
    'read.fleet_vehicle',
    'create.fleet_vehicle',
    'update.fleet_vehicle',
    'delete.fleet_vehicle',
  ]
  listResult = {
    data: { rows: [vehicle()], total: 1, page: 1, pageSize: 25 },
    ...ok,
  }
})

describe('FleetVehiclesPage', () => {
  it('renders the vehicle rows', () => {
    render(<FleetVehiclesPage />)
    expect(screen.getByText('B 9114 KYZ')).toBeInTheDocument()
  })

  it('shows the page title', () => {
    render(<FleetVehiclesPage />)
    expect(screen.getByRole('heading', { name: /armada/i })).toBeInTheDocument()
  })

  it('opens the create dialog from the header button', () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    expect(screen.getByRole('heading', { name: /tambah armada/i })).toBeInTheDocument()
  })

  // Hiding the button is the whole point of the permission — showing it and failing on submit
  // teaches the operator the app is broken rather than that they lack access.
  it('hides the add button without the create permission', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(screen.queryByRole('button', { name: /tambah armada/i })).not.toBeInTheDocument()
  })

  it('hides the row actions without the matching permissions', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arsipkan' })).not.toBeInTheDocument()
  })

  it('saves a new vehicle through the create mutation', async () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /tambah armada/i }))
    fireEvent.change(screen.getByLabelText(/nomor polisi/i), { target: { value: 'B 1 A' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith(expect.objectContaining({ nopol: 'B 1 A' })),
    )
  })

  it('saves an edit through the update mutation with the row id', async () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Ubah' }))
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(mutations.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'v1' }),
      ),
    )
  })

  it('saves documents through the replace mutation', async () => {
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Dokumen' }))
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    await waitFor(() =>
      expect(mutations.documents).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'v1', documents: [] }),
      ),
    )
  })

  // The row button and the dialog's confirm button are both called "Arsipkan", so the confirm
  // click is scoped to the dialog — the same shape the drivers page spec uses.
  const openArchiveDialog = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Arsipkan' }))
    return within(screen.getByRole('dialog'))
  }

  // Archiving is not undoable from the operator's seat without finding the row again, so it
  // asks first.
  it('confirms before archiving', async () => {
    render(<FleetVehiclesPage />)
    const dialog = openArchiveDialog()
    expect(mutations.archive).not.toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Arsipkan' }))
    await waitFor(() => expect(mutations.archive).toHaveBeenCalledWith('v1'))
  })

  it('names the vehicle in the confirmation', () => {
    render(<FleetVehiclesPage />)
    const dialog = openArchiveDialog()
    expect(dialog.getByText(/B 9114 KYZ/)).toBeInTheDocument()
  })

  // A failed archive must say why. The backend's 409 names the reason and the ConfirmDialog does
  // not catch, so an uncaught rejection would leave the operator with a dialog that just closed.
  it('shows the backend message when archiving fails', async () => {
    mutations.archive.mockRejectedValueOnce({
      response: { data: { message: 'Kendaraan masih terpakai' } },
    })
    render(<FleetVehiclesPage />)
    const dialog = openArchiveDialog()
    fireEvent.click(dialog.getByRole('button', { name: 'Arsipkan' }))
    expect(await screen.findByText(/masih terpakai/i)).toBeInTheDocument()
  })

  it('restores an archived row without confirming', async () => {
    listResult = {
      data: { rows: [vehicle({ isActive: false })], total: 1, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pulihkan' }))
    await waitFor(() => expect(mutations.restore).toHaveBeenCalledWith('v1'))
  })

  it('reports the total and the current page', () => {
    listResult = {
      data: { rows: [vehicle()], total: 87, page: 2, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/87/)).toBeInTheDocument()
    expect(screen.getByText(/halaman 2 dari 4/i)).toBeInTheDocument()
  })

  it('moves to the next page', () => {
    listResult = {
      data: { rows: [vehicle()], total: 87, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /berikutnya/i }))
    expect(screen.getByText(/halaman 2 dari 4/i)).toBeInTheDocument()
  })

  // Paging past either end asks the backend for a page that does not exist and shows an empty
  // table, which reads as data loss.
  it('disables Previous on the first page', () => {
    render(<FleetVehiclesPage />)
    expect(screen.getByRole('button', { name: /sebelumnya/i })).toBeDisabled()
  })

  it('disables Next on the last page', () => {
    listResult = {
      data: { rows: [vehicle()], total: 10, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    expect(screen.getByRole('button', { name: /berikutnya/i })).toBeDisabled()
  })

  it('shows at least one page even with no results', () => {
    listResult = {
      data: { rows: [], total: 0, page: 1, pageSize: 25 },
      ...ok,
    }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/halaman 1 dari 1/i)).toBeInTheDocument()
  })

  it('passes the loading state down to the table', () => {
    listResult = { data: undefined, isLoading: true, isError: false, refetch: refetchVehicles }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  // A failed load must not render the empty-state copy: "Belum ada armada yang cocok" is an
  // affirmative claim that no unit matches, and an operator who believes it during an outage
  // starts re-registering units that already exist.
  it('reports a failed load instead of an empty table', () => {
    listResult = { data: undefined, isLoading: false, isError: true, refetch: refetchVehicles }
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/gagal memuat data armada/i)).toBeInTheDocument()
    expect(screen.queryByText(/belum ada armada/i)).not.toBeInTheDocument()
  })

  it('retries a failed load on demand', () => {
    listResult = { data: undefined, isLoading: false, isError: true, refetch: refetchVehicles }
    render(<FleetVehiclesPage />)
    fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }))
    expect(refetchVehicles).toHaveBeenCalled()
  })

  // Spec §7's field-operator persona: read.fleet_vehicle without read.fleet_master_data. Five
  // unconditional master-data queries would be five guaranteed 403s and five empty dropdowns
  // with no explanation.
  it('does not query master data without read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('jenis_armada', { enabled: false })
    expect(mockMasterData).toHaveBeenCalledWith('jenis_dokumen', { enabled: false })
  })

  it('queries master data with read.fleet_master_data', () => {
    permissions = ['read.fleet_vehicle', 'read.fleet_master_data']
    render(<FleetVehiclesPage />)
    expect(mockMasterData).toHaveBeenCalledWith('jenis_armada', { enabled: true })
  })

  it('explains why the lookup lists are empty', () => {
    permissions = ['read.fleet_vehicle']
    render(<FleetVehiclesPage />)
    expect(screen.getByText(/butuh izin akses master data/i)).toBeInTheDocument()
  })

  it('does not explain anything when the lists are available', () => {
    permissions = ['read.fleet_vehicle', 'read.fleet_master_data']
    render(<FleetVehiclesPage />)
    expect(screen.queryByText(/butuh izin akses master data/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/frontend && pnpm test 'fleet/vehicles/page'`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Tulis halaman Armada**

`apps/frontend/src/app/(dashboard)/fleet/vehicles/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { VehicleFilters } from '@/features/fleet/components/VehicleFilters'
import { VehicleTable } from '@/features/fleet/components/VehicleTable'
import { VehicleFormDialog } from '@/features/fleet/components/VehicleFormDialog'
import { VehicleDocumentsDialog } from '@/features/fleet/components/VehicleDocumentsDialog'
import {
  useArchiveFleetVehicle,
  useCreateFleetVehicle,
  useFleetVehicles,
  useReplaceVehicleDocuments,
  useRestoreFleetVehicle,
  useUpdateFleetVehicle,
} from '@/features/fleet/hooks/useFleetVehicles'
import {
  useFleetDrivers,
  useFleetMasterDataByCategory,
} from '@/features/fleet/hooks/useFleetDrivers'
import { apiErrorMessage } from '@/features/fleet/utils/api-error'
import {
  FleetVehicle,
  FleetVehicleDocumentPayload,
  FleetVehicleFilters,
  FleetVehiclePayload,
  FleetVehicleSort,
} from '@/features/fleet/types'

type Modal =
  | { type: 'create' }
  | { type: 'edit'; vehicle: FleetVehicle }
  | { type: 'documents'; vehicle: FleetVehicle }
  | { type: 'archive'; vehicle: FleetVehicle }
  | null

export default function FleetVehiclesPage() {
  const { hasPermission } = usePermissions()
  const [filters, setFilters] = useState<FleetVehicleFilters>({ page: 1, sort: 'nopol' })
  const [modal, setModal] = useState<Modal>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const canCreate = hasPermission('create.fleet_vehicle')
  const canUpdate = hasPermission('update.fleet_vehicle')
  const canDelete = hasPermission('delete.fleet_vehicle')
  // Spec §7 keeps master data behind its own permission so a field operator can register
  // vehicles without editing the lookup lists. That operator reaches this page with
  // read.fleet_vehicle alone, so every master-data query here is conditional: firing them
  // anyway spends five guaranteed 403s and leaves five dropdowns silently empty.
  const canReadMaster = hasPermission('read.fleet_master_data')

  const { data, isLoading, isError, refetch } = useFleetVehicles(filters)
  const { data: drivers } = useFleetDrivers({})
  const master = { enabled: canReadMaster }
  const { data: jenisArmada } = useFleetMasterDataByCategory('jenis_armada', master)
  const { data: kepemilikan } = useFleetMasterDataByCategory('kepemilikan', master)
  const { data: pool } = useFleetMasterDataByCategory('pool', master)
  const { data: statusKendaraan } = useFleetMasterDataByCategory('status_kendaraan', master)
  const { data: docTypes } = useFleetMasterDataByCategory('jenis_dokumen', master)

  const createVehicle = useCreateFleetVehicle()
  const updateVehicle = useUpdateFleetVehicle()
  const archiveVehicle = useArchiveFleetVehicle()
  const restoreVehicle = useRestoreFleetVehicle()
  const replaceDocuments = useReplaceVehicleDocuments()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? filters.page ?? 1
  const pageSize = data?.pageSize ?? 25
  // Math.max(1, …) so an empty result still reads "halaman 1 dari 1" rather than "dari 0".
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleSubmit = async (payload: FleetVehiclePayload) => {
    if (modal?.type === 'edit') {
      await updateVehicle.mutateAsync({ id: modal.vehicle.id, payload })
    } else {
      await createVehicle.mutateAsync(payload)
    }
  }

  const handleDocuments = async (documents: FleetVehicleDocumentPayload[]) => {
    if (modal?.type !== 'documents') return
    await replaceDocuments.mutateAsync({ id: modal.vehicle.id, documents })
  }

  // Restore is a single reversible click, so it does not get a confirmation the way archiving
  // does — but it can still fail on a plate another unit has taken since.
  const handleRestore = async (vehicle: FleetVehicle) => {
    setActionError(null)
    try {
      await restoreVehicle.mutateAsync(vehicle.id)
    } catch (err: unknown) {
      setActionError(apiErrorMessage(err, 'Gagal memulihkan armada.'))
    }
  }

  return (
    <div>
      <PageHeader
        title="Armada"
        subtitle="Daftar unit beserta status dokumennya. Peringatan dihitung di server."
        action={
          canCreate ? (
            <Button onClick={() => setModal({ type: 'create' })}>+ Tambah armada</Button>
          ) : undefined
        }
      />

      {actionError && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {!canReadMaster && (
        <p className="mb-4 text-sm text-muted-foreground">
          Daftar kepemilikan, pool dan status tidak tersedia — butuh izin akses master data.
          Filter dan pilihan terkait dikosongkan.
        </p>
      )}

      <VehicleFilters
        value={filters}
        onChange={setFilters}
        kepemilikanOptions={kepemilikan ?? []}
        poolOptions={pool ?? []}
        statusOptions={statusKendaraan ?? []}
      />

      {isError ? (
        // The empty-state copy is an affirmative claim that no unit matches. During an outage
        // that claim is false, and an operator who believes it starts re-registering units that
        // already exist.
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Gagal memuat data armada.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          <VehicleTable
            rows={rows}
            isLoading={isLoading}
            sort={filters.sort ?? 'nopol'}
            onSortChange={(sort: FleetVehicleSort) => setFilters({ ...filters, sort, page: 1 })}
            onEdit={canUpdate ? (v) => setModal({ type: 'edit', vehicle: v }) : () => {}}
            onDocuments={canUpdate ? (v) => setModal({ type: 'documents', vehicle: v }) : () => {}}
            onArchive={canDelete ? (v) => setModal({ type: 'archive', vehicle: v }) : () => {}}
            onRestore={canDelete ? handleRestore : () => {}}
            showActions={{ edit: canUpdate, documents: canUpdate, archive: canDelete }}
          />

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} armada</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setFilters({ ...filters, page: page - 1 })}
              >
                Sebelumnya
              </Button>
              <span>
                Halaman {page} dari {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setFilters({ ...filters, page: page + 1 })}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <VehicleFormDialog
          open
          initial={modal.type === 'edit' ? modal.vehicle : undefined}
          masterData={{
            jenisArmada: jenisArmada ?? [],
            kepemilikan: kepemilikan ?? [],
            pool: pool ?? [],
            status: statusKendaraan ?? [],
          }}
          drivers={drivers ?? []}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      {/* Gated on docTypes being loaded, not just on the modal state: the dialog builds its
          submit payload from the rows it renders, and the backend's PUT retires every document
          that is absent from that payload. Opened with an empty docTypes it would render zero
          rows over a live Simpan button, and one click would retire every document on the unit. */}
      {modal?.type === 'documents' && docTypes && docTypes.length > 0 && (
        <VehicleDocumentsDialog
          open
          vehicle={modal.vehicle}
          docTypes={docTypes}
          onSubmit={handleDocuments}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={modal?.type === 'archive'}
        onOpenChange={(v) => !v && setModal(null)}
        title="Arsipkan armada"
        description={
          modal?.type === 'archive'
            ? `Arsipkan ${modal.vehicle.nopol}? Unit ini keluar dari daftar tapi dokumennya tetap tersimpan, dan bisa dipulihkan lagi.`
            : undefined
        }
        confirmLabel="Arsipkan"
        destructive
        onConfirm={async () => {
          if (modal?.type !== 'archive') return
          // ConfirmDialog does not catch, so a rejected mutation would surface as an unhandled
          // rejection and the dialog would close with no explanation.
          setActionError(null)
          try {
            await archiveVehicle.mutateAsync(modal.vehicle.id)
          } catch (err: unknown) {
            setActionError(apiErrorMessage(err, 'Gagal mengarsipkan armada.'))
          }
        }}
      />
    </div>
  )
}
```

Halaman ini memberi `VehicleTable` sebuah prop `showActions` yang belum ada di Task 7. Tambahkan sekarang ke `VehicleTable.tsx` — perluas `VehicleTableProps` dengan:

```tsx
  showActions?: { edit: boolean; documents: boolean; archive: boolean }
```

default-nya semua true, dan bungkus tiap tombol aksi:

```tsx
  const show = showActions ?? { edit: true, documents: true, archive: true }
```

lalu di kolom `Aksi`, ganti isinya dengan:

```tsx
        <div className="flex justify-end gap-1">
          {show.edit && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>
              Ubah
            </Button>
          )}
          {show.documents && (
            <Button size="sm" variant="ghost" onClick={() => onDocuments(row)}>
              Dokumen
            </Button>
          )}
          {show.archive &&
            (row.isActive ? (
              <Button size="sm" variant="ghost" onClick={() => onArchive(row)}>
                Arsipkan
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => onRestore(row)}>
                Pulihkan
              </Button>
            ))}
        </div>
```

Tambahkan juga dua test di `VehicleTable.spec.tsx` yang memagari default-nya:

```tsx
  // The page hides actions the operator lacks permission for. A default of "show everything"
  // keeps every existing caller working; a default of "hide" would blank the column silently.
  it('shows every action when showActions is not given', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Ubah' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arsipkan' })).toBeInTheDocument()
  })

  it('hides the actions it is told to hide', () => {
    setup({ showActions: { edit: false, documents: true, archive: false } })
    expect(screen.queryByRole('button', { name: 'Ubah' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dokumen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arsipkan' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 4: Jalankan test halaman dan tabel, pastikan lulus**

Run: `cd apps/frontend && pnpm test VehicleTable`
Expected: PASS, 17 test.

Run: `cd apps/frontend && pnpm test 'fleet/vehicles/page'`
Expected: PASS, 26 test.

- [ ] **Step 5: Tambahkan tab Armada**

Di `apps/frontend/src/app/(dashboard)/fleet/layout.tsx`, ganti komentar terakhir di blok header dan array `tabs`:

```tsx
// The sidebar's NavLink is flat, so the module's sections live here as a sub-nav — the same shape
// air-shipments uses. Static rather than fetched: unlike air-shipments' sheet tabs, these three
// are known at build time.
export default function FleetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { hasPermission } = usePermissions()

  // Armada leads: it is what the sidebar entry means and what an operator opens the module for.
  const tabs = [
    { href: '/fleet/vehicles', label: 'Armada', show: hasPermission('read.fleet_vehicle') },
    { href: '/fleet/drivers', label: 'Sopir', show: true },
    {
      href: '/fleet/master-data',
      label: 'Master Data',
      show: hasPermission('read.fleet_master_data'),
    },
  ].filter((t) => t.show)
```

Di `apps/frontend/src/app/(dashboard)/fleet/layout.spec.tsx`, ganti mock `next/navigation` yang
mengembalikan pathname tetap dengan yang bisa diatur per test — tiga test lama tetap lulus karena
nilai awalnya sama:

```tsx
let pathname = '/fleet/drivers'
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))
```

dan setel ulang di `beforeEach` yang sudah ada:

```tsx
  beforeEach(() => {
    mockHasPermission.mockReset()
    pathname = '/fleet/drivers'
  })
```

Lalu tambahkan tiga test di dalam `describe('FleetLayout')`:

```tsx
  // Armada is the section the sidebar entry means, so it has to be the first tab — not merely
  // present somewhere in the row.
  it('shows the Armada tab first', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    const tabs = screen.getAllByRole('link')
    expect(tabs[0]).toHaveTextContent('Armada')
    expect(tabs[0]).toHaveAttribute('href', '/fleet/vehicles')
  })

  // The tab is the only route into the register, so gating it on the wrong permission either
  // hides the module from someone who has access or dangles a link that 403s.
  it('hides the Armada tab without read.fleet_vehicle', () => {
    mockHasPermission.mockImplementation((p: string) => p !== 'read.fleet_vehicle')
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.queryByRole('link', { name: 'Armada' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sopir' })).toBeInTheDocument()
  })

  it('marks the Armada tab current on /fleet/vehicles', () => {
    mockHasPermission.mockReturnValue(true)
    pathname = '/fleet/vehicles'
    render(
      <FleetLayout>
        <p>isi</p>
      </FleetLayout>,
    )
    expect(screen.getByRole('link', { name: 'Armada' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Sopir' })).not.toHaveAttribute('aria-current')
  })
```

- [ ] **Step 6: Arahkan ulang `/fleet`**

Di `apps/frontend/src/app/(dashboard)/fleet/page.tsx`, ganti komentar dan target redirect:

```tsx
// /fleet itself has no content. Armada is the landing section — it is what the sidebar entry is
// really for.
//
// Client-side rather than a server redirect(): the whole dashboard sits behind a client auth gate
// in (dashboard)/layout.tsx, which a server redirect would fire ahead of.
export default function FleetIndexPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/fleet/vehicles')
  }, [router])

  return null
}
```

`/fleet` tidak punya spec sama sekali di Phase 1, jadi buat satu — redirect yang menunjuk rute
salah adalah kegagalan senyap yang hanya ketahuan dengan mengklik entri sidebar.

`apps/frontend/src/app/(dashboard)/fleet/page.spec.tsx`:

```tsx
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import FleetIndexPage from './page'

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

describe('FleetIndexPage', () => {
  beforeEach(() => replace.mockClear())

  it('redirects to the vehicles section', () => {
    render(<FleetIndexPage />)
    expect(replace).toHaveBeenCalledWith('/fleet/vehicles')
  })

  // replace(), not push(): /fleet is a signpost, and leaving it in history means Back from
  // /fleet/vehicles bounces the operator straight forward again.
  it('renders nothing of its own', () => {
    const { container } = render(<FleetIndexPage />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 7: Jalankan seluruh suite fleet frontend**

Run: `cd apps/frontend && pnpm test fleet`
Expected: PASS — semua suite fleet hijau, termasuk yang dari Phase 1.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/app/\(dashboard\)/fleet \
        apps/frontend/src/features/fleet/components/VehicleTable.tsx \
        apps/frontend/src/features/fleet/components/VehicleTable.spec.tsx
git commit -m "feat(fleet): add the Armada page and make it the module landing tab

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifikasi Phase 2 selesai

Jalankan semuanya sekali lagi dari akar repo sebelum menyatakan phase ini selesai.

- [ ] **Step 1: Seluruh test backend**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`
Expected: PASS. Heap bump plus `--runInBand` keduanya wajib untuk suite penuh — `--runInBand` sendirian masih core dump.

- [ ] **Step 2: Seluruh test frontend**

Run: `cd apps/frontend && pnpm test`
Expected: PASS.

- [ ] **Step 3: Typecheck kedua app**

Run: `cd apps/backend && pnpm exec tsc --noEmit`
Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 4: Lint berkas yang disentuh phase ini**

`pnpm lint` tidak bersih repo-wide dan sudah begitu sebelum phase ini — `apps/backend` tidak punya konfigurasi ESLint yang di-track, dan 16 berkas frontend lama gagal. Menuntut kebersihan repo-wide di sini berarti menuntut perbaikan yang bukan milik phase ini, jadi lint hanya berkas yang phase ini tambah atau ubah:

```bash
cd /home/faris/code/esp/esp-dashboard
git diff --name-only --diff-filter=ACM ff020e4a2d7cb79f64fe51d7f7c156ad27e4d254...HEAD \
  -- 'apps/frontend/src/**/*.ts' 'apps/frontend/src/**/*.tsx' > /tmp/phase2-lint-files.txt
cat /tmp/phase2-lint-files.txt
cd apps/frontend && xargs -a /tmp/phase2-lint-files.txt pnpm exec eslint \
  >/tmp/phase2-lint.log 2>&1; echo "EXIT=$?"
```

Expected: EXIT=0. Kalau daftar berkasnya kosong, `xargs` akan melint seluruh direktori — periksa `cat`-nya dulu sebelum percaya hasil hijau.

- [ ] **Step 5: Jalankan migrasi pada database sungguhan**

```bash
cd apps/backend
pnpm migration:run
```

Expected: dua migrasi Task 1 jalan bersih. Lalu verifikasi view-nya benar-benar ada dan bisa dikueri:

```bash
psql "$DATABASE_URL" -c "SELECT * FROM fleet_vehicle_document_status LIMIT 5;"
psql "$DATABASE_URL" -c "\d+ fleet_vehicles"
```

Expected: view mengembalikan nol baris tanpa error (belum ada data), dan `uq_fleet_vehicles_nopol_active` muncul sebagai partial unique index dengan predikat `WHERE is_active`.

- [ ] **Step 6: Uji balik migrasi**

```bash
pnpm migration:revert
pnpm migration:revert
pnpm migration:run
```

Expected: turun dua langkah lalu naik lagi tanpa error. Revert yang rusak baru ketahuan saat dibutuhkan, dan saat itu selalu terlambat.

- [ ] **Step 7: Cek asap manual**

Dengan backend dan frontend berjalan, buka `/fleet` di browser:

- Redirect mendarat di `/fleet/vehicles`, tab Armada aktif dan paling kiri.
- Tambah armada dengan nopol huruf kecil dan spasi ganda — tersimpan dengan nopol ternormalisasi.
- Tambah armada kedua dengan nopol yang sama — muncul pesan 409 yang menyebut nopolnya, bukan 500.
- Isi dokumen KIR yang kadaluarsa dan STNK yang masih lama — badge baris berwarna merah, bukan hijau.
- Filter `Kadaluarsa` — hanya unit tadi yang muncul, dan hitungan total ikut menyusut.
- Urutkan berdasarkan dokumen — unit kadaluarsa di atas, unit tanpa dokumen di paling bawah.
- Arsipkan unit — hilang dari daftar; centang `Tampilkan arsip` — muncul lagi dengan tombol Pulihkan.
- Daftarkan ulang nopol yang barusan diarsipkan — diterima, karena indeks uniknya parsial.
- Buka `/fleet/master-data`, coba hapus baris pool yang dipakai armada tadi — muncul 409 yang menyebut jumlah pemakainya.
- Buka `/fleet/drivers`, hapus sopir yang ditugaskan ke armada — sopirnya diarsipkan, dan armada tetap punya sopir itu.

- [ ] **Step 8: Perbarui spec**

Di `docs/superpowers/specs/2026-09-09-registrasi-armada-design.md`, tandai Phase 2 selesai pada bagian §9 "Urutan phase". Jangan ubah bagian lain — spec-nya sudah disetujui.

```bash
git add docs/superpowers/specs/2026-09-09-registrasi-armada-design.md \
        docs/superpowers/plans/2026-09-10-registrasi-armada-phase-2.md
git commit -m "docs(fleet): mark phase 2 complete in the registration spec

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
