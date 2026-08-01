# Barhal Dashboard — Tabel Detail TO (2 Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan tabel detail level-TO dengan dua tab (`TO dalam koli` / `TO belum masuk koli`) di halaman Barhal Dashboard, disuplai endpoint terpaginasi baru.

**Architecture:** Endpoint baru `GET /barhal/to-detail` membaca `air_shipments_compileaircgk` dengan predikat barhal yang sama seperti `getDashboard()`, lalu memfilter berdasarkan keterikatan ke `barhal_koli_to` sesuai tab. Frontend memakai satu komponen tabel dengan state tab + halaman lokal, mengonsumsi filter dashboard (tanggal/origin/dest) lewat props.

**Tech Stack:** NestJS + TypeORM (raw SQL via `DataSource.query`), PostgreSQL, Jest, Next.js App Router, React, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-01-barhal-dashboard-to-detail-table-design.md`

## Global Constraints

- Predikat barhal wajib persis seperti `getDashboard()`: `e.remarks ILIKE '%barhal%'`, `e.to_number IS NOT NULL`, `e.completed_date IS NOT NULL`.
- Semua nilai filter masuk sebagai bound parameter (`$1`, `$2`, …) — tidak boleh diinterpolasi ke string SQL.
- Normalisasi nama station memakai method privat `normalizedStationSql()` yang sudah ada di `BarhalService`.
- Rentang tanggal hanya diterapkan bila `startDate` **dan** `endDate` terisi (sama seperti `getDashboard()`).
- `pageSize` default 25, maksimal 100. `page` default 1.
- Tanggal yang ditampilkan adalah `completed_date` TO, bukan `koli_date`.
- Kolom Weight Before / Weight After **tidak** dipakai di tabel ini — hanya Gross Weight per TO.
- Guard endpoint: `JwtAuthGuard` + `@Authorize(Permission.READ_BARHAL)`.

## File Structure

| File | Aksi | Tanggung jawab |
|---|---|---|
| `apps/backend/src/modules/barhal/dto/barhal-to-detail-query.dto.ts` | Create | Validasi query param endpoint baru |
| `apps/backend/src/modules/barhal/barhal.service.ts` | Modify | Method `getToDetail()` |
| `apps/backend/src/modules/barhal/barhal.service.spec.ts` | Modify | Unit test `getToDetail()` |
| `apps/backend/src/modules/barhal/barhal.controller.ts` | Modify | Route `GET /barhal/to-detail` |
| `apps/frontend/src/features/barhal/types.ts` | Modify | `BarhalToDetailItem`, `BarhalToDetailResponse` |
| `apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts` | Modify | Hook `useBarhalToDetail()` |
| `apps/frontend/src/features/barhal/components/BarhalToDetailTable.tsx` | Create | Tab switcher + tabel + paginasi |
| `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx` | Modify | Menempatkan section "Detail TO" |

---

### Task 1: Backend — endpoint `GET /barhal/to-detail`

**Files:**
- Create: `apps/backend/src/modules/barhal/dto/barhal-to-detail-query.dto.ts`
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts` (tambah method setelah `getDashboard()`, sebelum `exportCsv()`)
- Modify: `apps/backend/src/modules/barhal/barhal.controller.ts` (tambah route setelah `getDashboard`)
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts` (tambah `describe('getToDetail')` setelah `describe('getDashboard')` bila ada, atau di akhir blok `describe('BarhalService')`)

**Interfaces:**
- Consumes: `BarhalService.normalizedStationSql(column: string): string` (privat, sudah ada); `Permission.READ_BARHAL`; `Authorize` decorator.
- Produces:
  - `class BarhalToDetailQueryDto { tab: 'in-koli' | 'not-in-koli'; startDate?: string; endDate?: string; origin?: string; dest?: string; page?: number; pageSize?: number }`
  - `BarhalService.getToDetail(dto: BarhalToDetailQueryDto): Promise<{ data: BarhalToDetailRow[]; total: number; page: number; pageSize: number }>`
  - `interface BarhalToDetailRow { date: string; originName: string; destName: string; toNumber: string; koliNumber: string | null; grossWeight: number | null }`
  - Route: `GET /barhal/to-detail`

- [ ] **Step 1: Buat DTO**

Buat `apps/backend/src/modules/barhal/dto/barhal-to-detail-query.dto.ts`:

```ts
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'

export type BarhalToDetailTab = 'in-koli' | 'not-in-koli'

export class BarhalToDetailQueryDto {
  @IsIn(['in-koli', 'not-in-koli'])
  tab!: BarhalToDetailTab

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25
}
```

- [ ] **Step 2: Tulis test yang gagal**

Tambahkan di `apps/backend/src/modules/barhal/barhal.service.spec.ts`, di dalam `describe('BarhalService', ...)`:

```ts
  describe('getToDetail', () => {
    it('joins barhal_koli_to and returns koliNumber for the in-koli tab', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          {
            date: '2026-07-26',
            originName: 'Makassar',
            destName: 'Kosambi',
            toNumber: 'TO1',
            koliNumber: '26Jul-Makassar-Kosambi-Barhal1',
            grossWeight: '12.5',
          },
        ])

      const result = await service.getToDetail({ tab: 'in-koli', page: 1, pageSize: 25 })

      expect(result.total).toBe(1)
      expect(result.data).toEqual([
        {
          date: '2026-07-26',
          originName: 'Makassar',
          destName: 'Kosambi',
          toNumber: 'TO1',
          koliNumber: '26Jul-Makassar-Kosambi-Barhal1',
          grossWeight: 12.5,
        },
      ])

      const [countSql] = dataSource.query.mock.calls[0]
      const [dataSql] = dataSource.query.mock.calls[1]
      expect(countSql).toMatch(/JOIN barhal_koli_to/i)
      expect(dataSql).toMatch(/JOIN barhal_koli k ON k\.id = bkt\.koli_id/i)
      expect(dataSql).toMatch(/remarks ILIKE '%barhal%'/i)
    })

    it('uses NOT EXISTS and yields a null koliNumber for the not-in-koli tab', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          {
            date: '2026-07-26',
            originName: 'Makassar',
            destName: 'Kosambi',
            toNumber: 'TO9',
            koliNumber: null,
            grossWeight: null,
          },
        ])

      const result = await service.getToDetail({ tab: 'not-in-koli', page: 1, pageSize: 25 })

      expect(result.data[0].koliNumber).toBeNull()
      expect(result.data[0].grossWeight).toBeNull()
      const [dataSql] = dataSource.query.mock.calls[1]
      expect(dataSql).toMatch(/NOT EXISTS/i)
      expect(dataSql).not.toMatch(/JOIN barhal_koli_to/i)
    })

    it('binds date range, origin and dest as parameters', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([])

      await service.getToDetail({
        tab: 'in-koli',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        origin: 'Makassar',
        dest: 'Kosambi',
        page: 1,
        pageSize: 25,
      })

      const [countSql, countParams] = dataSource.query.mock.calls[0]
      expect(countParams).toEqual(['2026-07-01', '2026-07-31', 'Makassar', 'Kosambi'])
      expect(countSql).toMatch(/completed_date BETWEEN \$1 AND \$2/i)
      expect(countSql).not.toMatch(/Makassar/)
    })

    it('translates page and pageSize into LIMIT and OFFSET', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 60 }]).mockResolvedValueOnce([])

      const result = await service.getToDetail({ tab: 'in-koli', page: 3, pageSize: 20 })

      const [dataSql, dataParams] = dataSource.query.mock.calls[1]
      expect(dataSql).toMatch(/LIMIT \$1 OFFSET \$2/i)
      expect(dataParams).toEqual([20, 40])
      expect(result.page).toBe(3)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(60)
    })
  })
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/backend && pnpm test -- barhal.service.spec.ts -t getToDetail`
Expected: FAIL — `service.getToDetail is not a function`

- [ ] **Step 4: Implementasi `getToDetail`**

Tambahkan di `apps/backend/src/modules/barhal/barhal.service.ts`. Import DTO-nya di bagian atas file:

```ts
import { BarhalToDetailQueryDto } from './dto/barhal-to-detail-query.dto'
```

Tambahkan interface di dekat `AvailableToRow` (setelah deklarasi interface tersebut):

```ts
interface BarhalToDetailRow {
  date: string
  originName: string
  destName: string
  toNumber: string
  koliNumber: string | null
  grossWeight: number | null
}
```

Tambahkan method di dalam class, di antara `getDashboard()` dan `exportCsv()`:

```ts
  /**
   * Per-TO detail rows for the dashboard, split by whether the TO has been packed into a Koli.
   * DISTINCT ON (to_number) guards against the source sheet carrying more than one row per TO,
   * which would otherwise duplicate rows and inflate the paginated total.
   */
  async getToDetail(dto: BarhalToDetailQueryDto): Promise<{
    data: BarhalToDetailRow[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 25

    const params: unknown[] = []
    const conditions: string[] = [
      `e.remarks ILIKE '%barhal%'`,
      `e.to_number IS NOT NULL`,
      `e.completed_date IS NOT NULL`,
    ]
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      conditions.push(`e.completed_date BETWEEN $${params.length - 1} AND $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`${this.normalizedStationSql('e.origin_station')} = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`${this.normalizedStationSql('e.dest_station')} = $${params.length}`)
    }

    const baseCte = `
      base AS (
        SELECT DISTINCT ON (e.to_number)
          e.to_number,
          e.completed_date,
          e.gross_weight,
          ${this.normalizedStationSql('e.origin_station')} AS origin_name,
          ${this.normalizedStationSql('e.dest_station')} AS dest_name
        FROM air_shipments_compileaircgk e
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.to_number, e.completed_date DESC
      )
    `

    const inKoli = dto.tab === 'in-koli'
    const tabClause = inKoli
      ? `JOIN barhal_koli_to bkt ON bkt.to_number = b.to_number
         JOIN barhal_koli k ON k.id = bkt.koli_id`
      : `WHERE NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = b.to_number)`

    const countRow = (
      await this.dataSource.query(
        `WITH ${baseCte} SELECT COUNT(*)::int AS total FROM base b ${tabClause}`,
        params,
      )
    )[0]

    const dataParams = [...params, pageSize, (page - 1) * pageSize]
    const rows: { date: string; originName: string; destName: string; toNumber: string; koliNumber: string | null; grossWeight: string | null }[] =
      await this.dataSource.query(
        `
        WITH ${baseCte}
        SELECT
          b.completed_date::text AS date,
          b.origin_name          AS "originName",
          b.dest_name            AS "destName",
          b.to_number            AS "toNumber",
          ${inKoli ? 'k.koli_number' : 'NULL::text'} AS "koliNumber",
          b.gross_weight::numeric AS "grossWeight"
        FROM base b
        ${tabClause}
        ORDER BY b.completed_date DESC, b.to_number
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        dataParams,
      )

    return {
      data: rows.map((row) => ({
        ...row,
        grossWeight: row.grossWeight != null ? Number(row.grossWeight) : null,
      })),
      total: countRow.total,
      page,
      pageSize,
    }
  }
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd apps/backend && pnpm test -- barhal.service.spec.ts -t getToDetail`
Expected: PASS — 4 test lulus

- [ ] **Step 6: Tambahkan route di controller**

Di `apps/backend/src/modules/barhal/barhal.controller.ts`, tambahkan import:

```ts
import { BarhalToDetailQueryDto } from './dto/barhal-to-detail-query.dto'
```

Tambahkan route setelah method `getDashboard`:

```ts
  @Get('to-detail')
  @Authorize(Permission.READ_BARHAL)
  getToDetail(@Query() dto: BarhalToDetailQueryDto) {
    return this.service.getToDetail(dto)
  }
```

- [ ] **Step 7: Jalankan seluruh test barhal + build backend**

Run: `cd apps/backend && pnpm test -- barhal && pnpm build`
Expected: seluruh test barhal PASS, build tanpa error TypeScript

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal
git commit -m "feat(barhal): add GET /barhal/to-detail paginated per-TO endpoint"
```

---

### Task 2: Frontend — types, hook, dan komponen tabel

**Files:**
- Modify: `apps/frontend/src/features/barhal/types.ts` (tambah di akhir file)
- Modify: `apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts`
- Create: `apps/frontend/src/features/barhal/components/BarhalToDetailTable.tsx`

**Interfaces:**
- Consumes: `BarhalService.getToDetail` lewat `GET /barhal/to-detail` (Task 1); `apiClient` dari `@/shared/api/client`.
- Produces:
  - `interface BarhalToDetailItem { date: string; originName: string; destName: string; toNumber: string; koliNumber: string | null; grossWeight: number | null }`
  - `interface BarhalToDetailResponse { data: BarhalToDetailItem[]; total: number; page: number; pageSize: number }`
  - `type BarhalToDetailTab = 'in-koli' | 'not-in-koli'`
  - `useBarhalToDetail(params: BarhalToDetailParams)` → `UseQueryResult<BarhalToDetailResponse>`
  - `<BarhalToDetailTable startDate={} endDate={} origin={} dest={} />` — semua props `string` (string kosong berarti tidak difilter)

- [ ] **Step 1: Tambahkan types**

Tambahkan di akhir `apps/frontend/src/features/barhal/types.ts`:

```ts
export type BarhalToDetailTab = 'in-koli' | 'not-in-koli'

export interface BarhalToDetailItem {
  date: string
  originName: string
  destName: string
  toNumber: string
  koliNumber: string | null
  grossWeight: number | null
}

export interface BarhalToDetailResponse {
  data: BarhalToDetailItem[]
  total: number
  page: number
  pageSize: number
}
```

- [ ] **Step 2: Tambahkan hook**

Di `apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts`, ubah baris import types menjadi:

```ts
import { BarhalDashboardStats, BarhalToDetailResponse, BarhalToDetailTab } from '../types'
```

Tambahkan di akhir file:

```ts
export interface BarhalToDetailParams {
  tab: BarhalToDetailTab
  startDate?: string
  endDate?: string
  origin?: string
  dest?: string
  page: number
  pageSize: number
}

export function useBarhalToDetail(params: BarhalToDetailParams) {
  return useQuery<BarhalToDetailResponse>({
    queryKey: ['barhal', 'to-detail', params],
    queryFn: () => apiClient.get('/barhal/to-detail', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
  })
}
```

- [ ] **Step 3: Buat komponen tabel**

Buat `apps/frontend/src/features/barhal/components/BarhalToDetailTable.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useBarhalToDetail } from '../hooks/useBarhalDashboard'
import { BarhalToDetailTab } from '../types'

const TABS: { key: BarhalToDetailTab; label: string }[] = [
  { key: 'in-koli', label: 'TO dalam koli' },
  { key: 'not-in-koli', label: 'TO belum masuk koli' },
]

const PAGE_SIZE = 25
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

interface BarhalToDetailTableProps {
  startDate: string
  endDate: string
  origin: string
  dest: string
}

export function BarhalToDetailTable({ startDate, endDate, origin, dest }: BarhalToDetailTableProps) {
  const [tab, setTab] = useState<BarhalToDetailTab>('in-koli')
  const [page, setPage] = useState(1)

  // Filters live on the dashboard page, so a filter change can strand the user on a page
  // number that no longer exists in the new result set.
  useEffect(() => {
    setPage(1)
  }, [tab, startDate, endDate, origin, dest])

  const { data, isLoading, isError, refetch } = useBarhalToDetail({
    tab,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const inKoli = tab === 'in-koli'
  const colSpan = inKoli ? 6 : 5
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-2">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Tanggal</th>
              <th className="px-3 py-2 font-medium">Origin</th>
              <th className="px-3 py-2 font-medium">Destinasi</th>
              <th className="px-3 py-2 font-medium">No. TO</th>
              {inKoli && <th className="px-3 py-2 font-medium">No. Koli</th>}
              <th className="px-3 py-2 font-medium">Gross Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isError ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
                  Failed to load.{' '}
                  <button type="button" onClick={() => refetch()} className="text-primary underline">
                    Retry
                  </button>
                </td>
              </tr>
            ) : isLoading ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : (data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground">
                  No data for this range.
                </td>
              </tr>
            ) : (
              data!.data.map((row) => (
                <tr key={row.toNumber} className="hover:bg-accent/30">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.originName}</td>
                  <td className="px-3 py-2">{row.destName}</td>
                  <td className="px-3 py-2">{row.toNumber}</td>
                  {inKoli && <td className="px-3 py-2">{row.koliNumber ?? '—'}</td>}
                  <td className="px-3 py-2">
                    {row.grossWeight != null ? `${fmt.format(row.grossWeight)} kg` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} TO · Halaman {page} dari {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-border px-3 py-1 transition hover:bg-muted disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-border px-3 py-1 transition hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verifikasi tipe & lint**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm lint`
Expected: tanpa error. (Komponen belum dirender di mana pun — itu normal pada langkah ini.)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/barhal
git commit -m "feat(barhal): add BarhalToDetailTable with in-koli/not-in-koli tabs"
```

---

### Task 3: Pasang tabel di halaman dashboard

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx`

**Interfaces:**
- Consumes: `<BarhalToDetailTable startDate endDate origin dest />` dari Task 2; state `startDate`/`endDate`/`origin`/`dest` yang sudah ada di `BarhalDashboardContent`.
- Produces: —

- [ ] **Step 1: Tambahkan import**

Di `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx`, setelah baris import `BarhalRecapToTable`:

```tsx
import { BarhalToDetailTable } from '@/features/barhal/components/BarhalToDetailTable'
```

- [ ] **Step 2: Render section baru**

Section ini berada **di luar** percabangan `isError / isLoading` supaya tabel tetap tampil walau agregat dashboard masih loading. Ganti blok penutup JSX — dari baris `)}` yang menutup ternary sampai `</div>` — menjadi:

```tsx
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Detail TO</p>
        <BarhalToDetailTable startDate={startDate} endDate={endDate} origin={origin} dest={dest} />
      </div>
    </div>
```

Setelah perubahan, ekor fungsi `BarhalDashboardContent` berbentuk:

```tsx
          <div>
            <p className="mb-2 text-sm font-medium">Rekap Per Rute</p>
            <BarhalRecapToTable rows={data.recapPerRute} groupColumnLabel="Rute" />
          </div>
        </>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Detail TO</p>
        <BarhalToDetailTable startDate={startDate} endDate={endDate} origin={origin} dest={dest} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verifikasi tipe, lint, dan build**

Run: `cd apps/frontend && npx tsc --noEmit && pnpm lint && pnpm build`
Expected: tanpa error

- [ ] **Step 4: Verifikasi manual**

Jalankan backend dan frontend, buka `/barhal/dashboard`:
1. Section "Detail TO" tampil di bawah "Rekap Per Rute", default tab `TO dalam koli` dengan kolom No. Koli terisi.
2. Klik `TO belum masuk koli` — kolom No. Koli hilang, baris yang tampil adalah TO tanpa koli.
3. Ubah filter tanggal/origin/destinasi — isi tabel ikut menyempit dan halaman kembali ke 1.
4. Klik Next/Prev — isi tabel berganti, Prev nonaktif di halaman 1 dan Next nonaktif di halaman terakhir.

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx"
git commit -m "feat(barhal): surface TO detail table on the dashboard page"
```
