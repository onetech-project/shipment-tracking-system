# Barhal Dashboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seragamkan format tanggal di tabel Barhal, tambahkan drilldown pada dua tabel rekap dashboard, dan ambil Rute pada pemilihan TO wizard dari master `air_shipments_data`.

**Architecture:** Backend NestJS + TypeORM memakai raw SQL lewat `dataSource.query`. Dua query agregat rekap yang sekarang inline di `getDashboard` diekstrak menjadi method privat sehingga endpoint drilldown baru memakai SQL yang persis sama — angka drilldown otomatis rekonsiliasi dengan baris induknya. Frontend Next.js + React Query; drilldown di-fetch lazy hanya saat baris dibuka.

**Tech Stack:** NestJS 10, TypeORM, PostgreSQL, Jest 29 (backend), Next.js 14, React 18, React Query 5, moment 2.30, Jest 29 (frontend — dipasang di Task 1).

## Global Constraints

- Format tanggal: `DD-MMM-YYYY`. Format datetime: `DD-MMM-YYYY HH:mm`. Nilai kosong/tidak valid → `'—'`.
- Cakupan perubahan format tanggal **hanya** `apps/frontend/src/features/barhal/`. Jangan sentuh Air Shipments, PNL, Settlement, Settings, atau Audit.
- Backend: seluruh SQL memakai parameter terikat (`$1`, `$2`, …). Jangan pernah menyisipkan nilai dari DTO langsung ke string SQL.
- Permission untuk endpoint baru: `Permission.READ_BARHAL`.
- Urutan panggilan `dataSource.query` di dalam `getDashboard` **wajib** tetap: kpi → perTanggal → perRute → masterRoutes → recapBatangKayu. Test yang ada memakai `mockResolvedValueOnce` berurutan; mengubah urutan akan memecahkannya.
- Perintah test backend: `cd apps/backend && pnpm test`. Perintah test frontend: `cd apps/frontend && pnpm test` (tersedia setelah Task 1).
- Pesan UI berbahasa Indonesia, mengikuti komponen Barhal yang ada.

## Yang tidak menghasilkan task

Poin 1 dari spesifikasi (sorting `Detail TO` berdasarkan `Tanggal`) **sudah benar** dan tidak butuh
perubahan apa pun. `getToDetail` mengurutkan dengan `ORDER BY b.completed_date DESC, b.to_number`,
dan `completed_date` bertipe `DATE` sehingga pengurutannya kronologis. Jangan menambah sorting di sisi
klien pada `BarhalToDetailTable` — itu akan bertabrakan dengan paginasi server. Rinciannya ada di
bagian 1 spesifikasi.

---

### Task 1: Pasang runner unit test frontend

Frontend punya dependency Jest terpasang dan `"types": ["node", "jest"]` di tsconfig, tetapi **tidak** punya config Jest maupun script `test`. Akibatnya `src/features/barhal/utils/monthRange.spec.ts` yang sudah ada tidak pernah dijalankan. Task 2 butuh runner ini.

Catatan: `jest-environment-jsdom` terpasang di versi `30.3.0` sementara `jest` di `29.7.0` — beda major dan tidak dapat diandalkan. Task ini memakai `testEnvironment: 'node'` karena seluruh test dalam rencana ini menguji fungsi murni, sehingga jsdom tidak diperlukan sama sekali. Kalau nanti ada test komponen, `jest-environment-jsdom` harus di-pin ke `^29.7.0` lebih dulu.

**Files:**
- Create: `apps/frontend/jest.config.js`
- Modify: `apps/frontend/package.json:5-13` (blok `scripts`)

**Interfaces:**
- Consumes: tidak ada.
- Produces: perintah `pnpm test` di `apps/frontend` yang menjalankan seluruh `*.spec.ts` di bawah `src/`.

- [ ] **Step 1: Jalankan test yang ada untuk memastikan memang belum jalan**

Run: `cd apps/frontend && pnpm test`
Expected: FAIL — `Command "test" not found` (membuktikan runner-nya memang belum ada).

- [ ] **Step 2: Buat config Jest**

Create `apps/frontend/jest.config.js`:

```js
const nextJest = require('next/jest')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  // Seluruh unit test frontend saat ini menguji fungsi murni, jadi jsdom tidak diperlukan.
  // Ini juga menghindari jest-environment-jsdom@30 yang tidak cocok dengan jest@29.
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.spec.tsx'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/e2e/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
}

module.exports = createJestConfig(config)
```

`testMatch` sengaja dibatasi ke `src/` agar Playwright di `apps/frontend/e2e/` tidak ikut terambil.

- [ ] **Step 3: Tambahkan script `test`**

Di `apps/frontend/package.json`, dalam blok `"scripts"`, sisipkan dua baris tepat sebelum `"test:e2e"`:

```json
    "test": "jest",
    "test:watch": "jest --watch",
```

Sehingga blok `scripts` menjadi:

```json
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  },
```

- [ ] **Step 4: Jalankan test dan pastikan spec lama sekarang hijau**

Run: `cd apps/frontend && pnpm test`
Expected: PASS — 1 suite (`monthRange.spec.ts`), 5 test lulus.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/jest.config.js apps/frontend/package.json
git commit -m "test(frontend): wire up jest runner so unit specs actually execute"
```

---

### Task 2: Utility `dateFormat`

**Files:**
- Create: `apps/frontend/src/features/barhal/utils/dateFormat.ts`
- Test: `apps/frontend/src/features/barhal/utils/dateFormat.spec.ts`

**Interfaces:**
- Consumes: `pnpm test` dari Task 1.
- Produces:
  - `formatDate(value: string | null | undefined): string` → `DD-MMM-YYYY`, `'—'` bila kosong/tidak valid.
  - `formatDateTime(value: string | null | undefined): string` → `DD-MMM-YYYY HH:mm`, `'—'` bila kosong/tidak valid.

- [ ] **Step 1: Tulis test yang gagal**

Create `apps/frontend/src/features/barhal/utils/dateFormat.spec.ts`:

```ts
import { formatDate, formatDateTime } from './dateFormat'

describe('formatDate', () => {
  it('formats a plain YYYY-MM-DD date', () => {
    expect(formatDate('2026-08-06')).toBe('06-Aug-2026')
  })

  it('zero-pads single-digit days', () => {
    expect(formatDate('2026-01-02')).toBe('02-Jan-2026')
  })

  it('formats the date part of an ISO timestamp', () => {
    expect(formatDate('2026-12-25T10:30:00.000Z')).toBe('25-Dec-2026')
  })

  it('returns an em dash for empty input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('returns an em dash for unparseable input', () => {
    expect(formatDate('not a date')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats an ISO timestamp down to the minute', () => {
    // Dibangun dari komponen waktu lokal agar test tidak tergantung timezone runner.
    const local = new Date(2026, 7, 6, 14, 5).toISOString()
    expect(formatDateTime(local)).toBe('06-Aug-2026 14:05')
  })

  it('zero-pads hours and minutes', () => {
    const local = new Date(2026, 0, 2, 3, 7).toISOString()
    expect(formatDateTime(local)).toBe('02-Jan-2026 03:07')
  })

  it('returns an em dash for empty input', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('')).toBe('—')
  })

  it('returns an em dash for unparseable input', () => {
    expect(formatDateTime('not a date')).toBe('—')
  })
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `cd apps/frontend && pnpm test dateFormat`
Expected: FAIL — `Cannot find module './dateFormat'`.

- [ ] **Step 3: Implementasi minimal**

Create `apps/frontend/src/features/barhal/utils/dateFormat.ts`:

```ts
import moment from 'moment'

/**
 * Format tanggal & datetime untuk seluruh tabel Barhal.
 *
 * Backend mengirim dua bentuk: kolom `date` sebagai 'YYYY-MM-DD' (mis. koli_date,
 * completed_date) dan kolom `timestamptz` sebagai ISO-8601 berzona (std/sta).
 * Bentuk pertama diparse tanpa konversi zona; bentuk kedua ditampilkan dalam waktu
 * lokal browser.
 */

const EMPTY = '—'

const DATE_ONLY_FORMATS = ['YYYY-MM-DD', 'DD-MMM-YYYY', 'DD/MM/YYYY']

/** 'DD-MMM-YYYY', mis. '06-Aug-2026'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY
  // Tanggal polos diparse sebagai waktu lokal, bukan UTC, agar tidak bergeser satu hari.
  const dateOnly = moment(value, DATE_ONLY_FORMATS, true)
  if (dateOnly.isValid()) return dateOnly.format('DD-MMM-YYYY')
  const parsed = moment(value, moment.ISO_8601)
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY') : EMPTY
}

/** 'DD-MMM-YYYY HH:mm' dalam waktu lokal browser, mis. '06-Aug-2026 14:05'. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY
  const parsed = moment(value, moment.ISO_8601)
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY HH:mm') : EMPTY
}

/** Nilai untuk input `type="datetime-local"` ('YYYY-MM-DDTHH:mm'), waktu lokal browser. */
export function toDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = moment(value, moment.ISO_8601)
  return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm') : ''
}
```

- [ ] **Step 4: Jalankan test dan pastikan lulus**

Run: `cd apps/frontend && pnpm test dateFormat`
Expected: PASS — 9 test lulus.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/barhal/utils/dateFormat.ts apps/frontend/src/features/barhal/utils/dateFormat.spec.ts
git commit -m "feat(barhal): add shared date/datetime formatters"
```

---

### Task 3: Terapkan format tanggal ke tabel Barhal

**Files:**
- Modify: `apps/frontend/src/features/barhal/components/BarhalToDetailTable.tsx:103`
- Modify: `apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx:18`
- Modify: `apps/frontend/src/features/barhal/components/BarhalRecapBatangKayuTable.tsx:36`
- Modify: `apps/frontend/src/features/barhal/components/BarhalListTable.tsx:104`
- Modify: `apps/frontend/src/features/barhal/components/BarhalSmuInlineTable.tsx:17-18,40,53,60`
- Modify: `apps/frontend/src/features/barhal/components/BarhalSmuListTable.tsx:30,38`
- Modify: `apps/frontend/src/features/barhal/components/ToMultiSelect.tsx:13-22,71`
- Modify: `apps/frontend/src/features/barhal/components/wizard/Step1CreateKoli.tsx:63`

**Interfaces:**
- Consumes: `formatDate`, `formatDateTime`, `toDateTimeLocalInput` dari Task 2.
- Produces: tidak ada API baru.

- [ ] **Step 1: `BarhalToDetailTable` — kolom Tanggal**

Tambahkan import di bawah import yang ada:

```tsx
import { formatDate } from '../utils/dateFormat'
```

Ganti baris 103:

```tsx
                  <td className="px-3 py-2">{row.date}</td>
```

menjadi:

```tsx
                  <td className="px-3 py-2">{formatDate(row.date)}</td>
```

- [ ] **Step 2: `BarhalRecapBatangKayuTable` — kolom Date**

Tambahkan import:

```tsx
import { formatDate } from '../utils/dateFormat'
```

Ganti baris 36:

```tsx
                <td className="px-3 py-2">{row.date}</td>
```

menjadi:

```tsx
                <td className="px-3 py-2">{formatDate(row.date)}</td>
```

- [ ] **Step 3: `BarhalListTable` — kolom Tanggal pada sub-tabel TO**

Tambahkan import:

```tsx
import { formatDate } from '../utils/dateFormat'
```

Ganti baris 104:

```tsx
                      <td className="px-2 py-1">{koli.koli_date}</td>
```

menjadi:

```tsx
                      <td className="px-2 py-1">{formatDate(koli.koli_date)}</td>
```

- [ ] **Step 4: `BarhalSmuListTable` — kolom Date dan STD/STA**

Tambahkan import:

```tsx
import { formatDate, formatDateTime } from '../utils/dateFormat'
```

Ganti baris 30:

```tsx
      <td className="px-3 py-2">{item.date}</td>
```

menjadi:

```tsx
      <td className="px-3 py-2">{formatDate(item.date)}</td>
```

Ganti baris 38:

```tsx
      <td className="px-3 py-2">{item.std ? `${item.std.slice(0, 16)} / ${item.sta?.slice(0, 16) ?? '-'}` : '-'}</td>
```

menjadi:

```tsx
      <td className="px-3 py-2">
        {item.std ? `${formatDateTime(item.std)} / ${formatDateTime(item.sta)}` : '-'}
      </td>
```

`formatDateTime` sudah mengembalikan `'—'` saat `sta` null, jadi fallback `?? '-'` tidak lagi diperlukan.

- [ ] **Step 5: `BarhalSmuInlineTable` — tanggal, tampilan STD/STA, dan nilai input**

Tambahkan import:

```tsx
import { formatDate, formatDateTime, toDateTimeLocalInput } from '../utils/dateFormat'
```

Ganti baris 17-18:

```tsx
  const [std, setStd] = useState(koli.std ? koli.std.slice(0, 16) : '')
  const [sta, setSta] = useState(koli.sta ? koli.sta.slice(0, 16) : '')
```

menjadi:

```tsx
  // `.slice(0, 16)` dulu menghasilkan jam dinding UTC, sehingga input berselisih dengan
  // tampilan sebesar offset zona. Keduanya kini sama-sama waktu lokal browser.
  const [std, setStd] = useState(toDateTimeLocalInput(koli.std))
  const [sta, setSta] = useState(toDateTimeLocalInput(koli.sta))
```

Ganti baris 40:

```tsx
      <td className="px-3 py-2">{koli.koli_date}</td>
```

menjadi:

```tsx
      <td className="px-3 py-2">{formatDate(koli.koli_date)}</td>
```

Ganti baris 53 (cabang non-editing STD):

```tsx
          koli.std || '-'
```

menjadi:

```tsx
          formatDateTime(koli.std)
```

Ganti baris 60 (cabang non-editing STA):

```tsx
          koli.sta || '-'
```

menjadi:

```tsx
          formatDateTime(koli.sta)
```

- [ ] **Step 6: `ToMultiSelect` — hapus formatter lokal**

Hapus konstanta `MONTH_ABBR` (baris 15) dan seluruh fungsi `formatDate` lokal (baris 17-22), lalu tambahkan import:

```tsx
import { formatDate } from '../utils/dateFormat'
```

Sehingga bagian atas berkas menjadi:

```tsx
'use client'

import { useState } from 'react'
import { AvailableTo } from '../types'
import { formatDate } from '../utils/dateFormat'

interface ToMultiSelectProps {
  options: AvailableTo[]
  selected: string[]
  onChange: (toNumbers: string[]) => void
  isLoading?: boolean
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const AVAILABLE_TOS_LIMIT = 100
```

Pemanggilan di baris 71 (`{formatDate(to.date)}`) tidak berubah — keluarannya kini `06-Aug-2026`, bukan lagi `06 Aug 2026`.

- [ ] **Step 7: `Step1CreateKoli` — tanggal Koli yang sudah ada**

Tambahkan import:

```tsx
import { formatDate } from '../../utils/dateFormat'
```

Ganti baris 63:

```tsx
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">{existingKoli.koli_date}</div>
```

menjadi:

```tsx
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">{formatDate(existingKoli.koli_date)}</div>
```

- [ ] **Step 8: `BarhalRecapToTable` — label grup tanggal**

Tambahkan import:

```tsx
import { formatDate } from '../utils/dateFormat'
```

Ganti baris 18:

```tsx
  if ('date' in row) return { key: row.date, groupLabel: row.date }
```

menjadi:

```tsx
  if ('date' in row) return { key: row.date, groupLabel: formatDate(row.date) }
```

`key` sengaja tetap memakai tanggal ISO mentah — itu identitas baris, bukan teks tampilan.

- [ ] **Step 9: Verifikasi type-check dan test**

Run: `cd apps/frontend && pnpm type-check && pnpm test`
Expected: type-check bersih tanpa error; test PASS (14 test: 5 monthRange + 9 dateFormat).

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/barhal
git commit -m "feat(barhal): format all date/datetime columns as DD-MMM-YYYY[ HH:mm]"
```

---

### Task 4: Ekstrak SQL rekap menjadi method yang bisa dipakai ulang (refactor murni)

Tidak ada perubahan perilaku. Test `getDashboard` yang ada adalah jaring pengamannya dan harus tetap hijau tanpa diubah sedikit pun.

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts:402-466` (bagian pembangunan filter), `:468-507` (query per tanggal), `:516-556` (query per rute)

**Interfaces:**
- Consumes: tidak ada.
- Produces:
  - `private buildScopeSql(dto: BarhalDashboardQueryDto): { params: unknown[]; scopedCte: string; koliScopedCte: string }`
  - `private queryPerTanggal(scopedCte: string, koliScopedCte: string, params: unknown[]): Promise<(RecapAggregateRow & { date: string })[]>`
  - `private queryPerRute(scopedCte: string, koliScopedCte: string, params: unknown[]): Promise<(RecapAggregateRow & { originName: string; destName: string })[]>`

- [ ] **Step 1: Pastikan test yang ada hijau sebelum refactor**

Run: `cd apps/backend && pnpm test barhal.service`
Expected: PASS — seluruh suite `BarhalService` lulus. Catat jumlah test yang lulus; angka itu harus sama persis setelah refactor.

- [ ] **Step 2: Tambahkan `buildScopeSql`**

Di `barhal.service.ts`, tepat sebelum `async getDashboard(`, sisipkan:

```ts
  /**
   * Membangun parameter terikat dan dua CTE cakupan yang dipakai bersama oleh dashboard
   * dan drilldown. Tidak menjalankan query apa pun, sehingga urutan panggilan
   * dataSource.query di getDashboard tidak berubah.
   */
  private buildScopeSql(dto: BarhalDashboardQueryDto): {
    params: unknown[]
    scopedCte: string
    koliScopedCte: string
  } {
    const params: unknown[] = []
    const conditions: string[] = [`e.remarks ILIKE '%barhal%'`, `e.to_number IS NOT NULL`, `e.completed_date IS NOT NULL`]
    const koliConditions: string[] = []
    if (dto.startDate && dto.endDate) {
      params.push(dto.startDate, dto.endDate)
      const startIdx = params.length - 1
      const endIdx = params.length
      conditions.push(`e.completed_date BETWEEN $${startIdx} AND $${endIdx}`)
      koliConditions.push(`k.koli_date BETWEEN $${startIdx} AND $${endIdx}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`${this.normalizedStationSql('e.origin_station')} = $${params.length}`)
      koliConditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`${this.normalizedStationSql('e.dest_station')} = $${params.length}`)
      koliConditions.push(`k.dest_name = $${params.length}`)
    }
    const toWhere = `WHERE ${conditions.join(' AND ')}`
    const koliWhere = koliConditions.length ? `WHERE ${koliConditions.join(' AND ')}` : ''

    return {
      params,
      scopedCte: `
      scoped AS (
        SELECT
          e.to_number,
          e.gross_weight,
          e.awb,
          e.completed_date AS to_date,
          ${this.normalizedStationSql('e.origin_station')} AS origin_name,
          ${this.normalizedStationSql('e.dest_station')} AS dest_name
        FROM air_shipments_compileaircgk e
        ${toWhere}
      )
    `,
      koliScopedCte: `koli_scoped AS (SELECT * FROM barhal_koli k ${koliWhere})`,
    }
  }
```

- [ ] **Step 3: Tambahkan `queryPerTanggal` dan `queryPerRute`**

Tepat setelah `buildScopeSql`, sisipkan kedua method berikut. Isi SQL-nya disalin **persis** dari `getDashboard` yang ada — jangan diubah satu karakter pun.

```ts
  /** Agregat rekap per tanggal. Dipakai bersama oleh getDashboard dan getDrilldown. */
  private queryPerTanggal(
    scopedCte: string,
    koliScopedCte: string,
    params: unknown[],
  ): Promise<(RecapAggregateRow & { date: string })[]> {
    return this.dataSource.query(
      `
      WITH ${scopedCte},
      ${koliScopedCte},
      groups AS (
        SELECT to_date AS koli_date FROM scoped
        UNION
        SELECT koli_date FROM koli_scoped
      )
      SELECT
        g.koli_date::text AS date,
        (SELECT COUNT(DISTINCT to_number) FROM scoped s WHERE s.to_date = g.koli_date)::int AS total_to,
        (SELECT COUNT(*) FROM koli_scoped ks WHERE ks.koli_date = g.koli_date)::int AS total_koli,
        (SELECT COUNT(DISTINCT s.awb)
           FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
           WHERE ks.koli_date = g.koli_date AND s.awb IS NOT NULL)::int AS awb_count,
        (SELECT COALESCE(SUM(dt.gross_weight), 0)
           FROM (SELECT DISTINCT ON (bkt.to_number) bkt.to_number, s.gross_weight
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.koli_date = g.koli_date) dt)::numeric AS weight_before,
        (SELECT COALESCE(SUM(r.chwt), 0)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.koli_date = g.koli_date AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb)::numeric AS chwt,
        (SELECT COUNT(DISTINCT awbs.awb)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.koli_date = g.koli_date AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb
           WHERE r.chwt IS NULL)::int AS missing_chwt,
        (SELECT COALESCE(SUM(ks.weight_after - ks.weight_before), 0)
           FROM koli_scoped ks WHERE ks.koli_date = g.koli_date AND ks.weight_before IS NOT NULL AND ks.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM((ks.length_cm + ks.width_cm + ks.height_cm) * 1000), 0)
           FROM koli_scoped ks WHERE ks.koli_date = g.koli_date AND ks.length_cm IS NOT NULL AND ks.width_cm IS NOT NULL AND ks.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.koli_date ASC
      `,
      params,
    )
  }

  /** Agregat rekap per rute. Dipakai bersama oleh getDashboard dan getDrilldown. */
  private queryPerRute(
    scopedCte: string,
    koliScopedCte: string,
    params: unknown[],
  ): Promise<(RecapAggregateRow & { originName: string; destName: string })[]> {
    return this.dataSource.query(
      `
      WITH ${scopedCte},
      ${koliScopedCte},
      groups AS (
        SELECT origin_name, dest_name FROM scoped
        UNION
        SELECT origin_name, dest_name FROM koli_scoped
      )
      SELECT
        g.origin_name AS "originName",
        g.dest_name AS "destName",
        (SELECT COUNT(DISTINCT to_number) FROM scoped s WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name)::int AS total_to,
        (SELECT COUNT(*) FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name)::int AS total_koli,
        (SELECT COUNT(DISTINCT s.awb)
           FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
           WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND s.awb IS NOT NULL)::int AS awb_count,
        (SELECT COALESCE(SUM(dt.gross_weight), 0)
           FROM (SELECT DISTINCT ON (bkt.to_number) bkt.to_number, s.gross_weight
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name) dt)::numeric AS weight_before,
        (SELECT COALESCE(SUM(r.chwt), 0)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb)::numeric AS chwt,
        (SELECT COUNT(DISTINCT awbs.awb)
           FROM (SELECT DISTINCT s.awb
                 FROM koli_scoped ks JOIN barhal_koli_to bkt ON bkt.koli_id = ks.id JOIN scoped s ON s.to_number = bkt.to_number
                 WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb
           WHERE r.chwt IS NULL)::int AS missing_chwt,
        (SELECT COALESCE(SUM(ks.weight_after - ks.weight_before), 0)
           FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND ks.weight_before IS NOT NULL AND ks.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM((ks.length_cm + ks.width_cm + ks.height_cm) * 1000), 0)
           FROM koli_scoped ks WHERE ks.origin_name = g.origin_name AND ks.dest_name = g.dest_name AND ks.length_cm IS NOT NULL AND ks.width_cm IS NOT NULL AND ks.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.origin_name, g.dest_name
      `,
      params,
    )
  }
```

- [ ] **Step 4: Ganti isi `getDashboard` agar memakai method baru**

Di `getDashboard`, ganti blok pembangunan filter (dari `const params: unknown[] = []` sampai baris `const koliScopedCte = \`koli_scoped AS (...)\``) dengan satu baris:

```ts
    const { params, scopedCte, koliScopedCte } = this.buildScopeSql(dto)
```

Perhatikan: pemanggilan `kpiRow` berada di antara keduanya pada kode lama. Setelah perubahan, urutan di dalam `getDashboard` menjadi:

```ts
  async getDashboard(dto: BarhalDashboardQueryDto) {
    const hasRange = Boolean(dto.startDate && dto.endDate)
    if (hasRange && daysInRange(dto.startDate!, dto.endDate!) > MAX_RECAP_DAYS) {
      throw new BadRequestException(`Date range must not exceed ${MAX_RECAP_DAYS} days`)
    }

    const { params, scopedCte, koliScopedCte } = this.buildScopeSql(dto)

    const kpiRow = (
      await this.dataSource.query(
        `
        WITH ${scopedCte},
        koli_ids AS (
          SELECT DISTINCT bkt.koli_id FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number
        )
        SELECT
          (SELECT COUNT(*)::int FROM koli_ids) AS koli_count,
          (SELECT COUNT(DISTINCT to_number)::int FROM scoped) AS total_to,
          (SELECT COALESCE(SUM(gross_weight), 0)::numeric FROM scoped) AS weight_before,
          (SELECT COALESCE(SUM(k.weight_after - k.weight_before), 0)::numeric
             FROM koli_ids ki JOIN barhal_koli k ON k.id = ki.koli_id
             WHERE k.weight_before IS NOT NULL AND k.weight_after IS NOT NULL) AS weight_increase,
          (SELECT COALESCE(SUM(k.batang_kayu), 0)::int
             FROM koli_ids ki JOIN barhal_koli k ON k.id = ki.koli_id) AS batang_kayu
        `,
        params,
      )
    )[0]

    const perTanggalRows = await this.queryPerTanggal(scopedCte, koliScopedCte, params)
```

lalu sisa method (mulai `const perTanggalSparse = ...`) tidak berubah, kecuali:

```ts
    const perRuteRows = await this.queryPerRute(scopedCte, koliScopedCte, params)
```

menggantikan query per-rute yang tadinya inline.

Blok `recapBatangKayu` di bagian bawah `getDashboard` memakai variabel `koliWhere` yang kini hidup di dalam `buildScopeSql`. Ganti query itu agar memakai `koliScopedCte`:

```ts
    const recapBatangKayu = await this.dataSource.query(
      `
      WITH ${koliScopedCte}
      SELECT
        k.koli_date::text AS date,
        COUNT(*)::int AS "totalKoli",
        COALESCE(SUM(k.length_cm), 0)::numeric AS "totalP",
        COALESCE(SUM(k.width_cm), 0)::numeric AS "totalL",
        COALESCE(SUM(k.height_cm), 0)::numeric AS "totalT",
        COALESCE(SUM(k.volume), 0)::numeric AS "totalVolume",
        COALESCE(SUM(k.batang_kayu), 0)::int AS "totalBatangKayu"
      FROM koli_scoped k
      GROUP BY k.koli_date
      ORDER BY k.koli_date DESC
      `,
      params,
    )
```

`koli_scoped` sudah berisi `SELECT * FROM barhal_koli k <koliWhere>`, jadi hasilnya identik dengan `FROM barhal_koli k ${koliWhere}`.

- [ ] **Step 5: Jalankan test — harus hijau tanpa mengubah satu pun berkas test**

Run: `cd apps/backend && pnpm test barhal.service`
Expected: PASS dengan jumlah test yang sama persis seperti di Step 1. Kalau ada yang merah, refactor-nya mengubah perilaku — perbaiki service-nya, **jangan** ubah test-nya.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts
git commit -m "refactor(barhal): extract shared recap scope and aggregate queries"
```

---

### Task 5: Endpoint drilldown

**Files:**
- Create: `apps/backend/src/modules/barhal/dto/barhal-drilldown-query.dto.ts`
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts` (tambah `getDrilldown`)
- Modify: `apps/backend/src/modules/barhal/barhal.controller.ts:18` (import), `:98-102` (setelah route dashboard)
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts` (tambah `describe('getDrilldown')`)

**Interfaces:**
- Consumes: `buildScopeSql`, `queryPerTanggal`, `queryPerRute` dari Task 4; `toRecapMetrics`, `daysInRange`, `MAX_RECAP_DAYS` dari `barhal-recap.builder`.
- Produces:
  - `BarhalDrilldownQueryDto` dengan field `groupBy: 'route' | 'date'` plus field warisan `startDate`, `endDate`, `origin`, `dest`.
  - `getDrilldown(dto: BarhalDrilldownQueryDto): Promise<RecapPerTanggalRow[] | RecapPerRuteRow[]>`
  - Route `GET /barhal/dashboard/drilldown`.

- [ ] **Step 1: Tulis test yang gagal**

Pertama tambahkan import tipe di bagian atas `barhal.service.spec.ts` (dipakai oleh test rekonsiliasi):

```ts
import { RecapPerRuteRow } from './barhal-recap.builder'
```

Lalu tambahkan blok berikut di `barhal.service.spec.ts`, tepat sebelum `describe('getToDetail', ...)`:

```ts
  describe('getDrilldown', () => {
    it('groups by route for a single date, without zero-filling master routes', async () => {
      dataSource.query.mockResolvedValueOnce([
        { originName: 'Kosambi', destName: 'Badung', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 500 },
      ])

      const rows = await service.getDrilldown({ groupBy: 'route', startDate: '2026-06-01', endDate: '2026-06-01' })

      expect(dataSource.query).toHaveBeenCalledTimes(1)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        originName: 'Kosambi',
        destName: 'Badung',
        totalTo: 3,
        totalKoli: 2,
        weightBefore: 30,
        weightAfter: 36,
        chwt: 25,
        variance: 6,
        addRevenue: 500,
        status: 'completed',
      })
    })

    it('groups by date for a single route, without zero-filling the calendar', async () => {
      dataSource.query.mockResolvedValueOnce([
        { date: '2026-06-03', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 8, missing_chwt: 0, weight_increase: 2, add_revenue: 100 },
      ])

      const rows = await service.getDrilldown({
        groupBy: 'date',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        origin: 'Kosambi',
        dest: 'Badung',
      })

      // Rentangnya 30 hari, tapi drilldown hanya mengembalikan hari yang ada aktivitasnya.
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ date: '2026-06-03', totalTo: 1, status: 'completed' })
    })

    it('binds the date range, origin and dest as query parameters', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getDrilldown({
        groupBy: 'date',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        origin: 'Kosambi',
        dest: 'Badung',
      })

      const [, params] = dataSource.query.mock.calls[0]
      expect(params).toEqual(['2026-06-01', '2026-06-30', 'Kosambi', 'Badung'])
    })

    it('returns an empty array when the group has no activity', async () => {
      dataSource.query.mockResolvedValueOnce([])
      const rows = await service.getDrilldown({ groupBy: 'route', startDate: '2026-06-01', endDate: '2026-06-01' })
      expect(rows).toEqual([])
    })

    it('rejects a range longer than 366 days without running any query', async () => {
      await expect(
        service.getDrilldown({ groupBy: 'route', startDate: '2026-01-01', endDate: '2027-06-01' }),
      ).rejects.toThrow(/366/)
      expect(dataSource.query).not.toHaveBeenCalled()
    })

    it('reconciles: per-route drilldown totals for a date match that date\'s parent row', async () => {
      // Baris induk Rekap Per Tanggal untuk 2026-06-01.
      dataSource.query.mockResolvedValueOnce([
        { date: '2026-06-01', total_to: 5, awb_count: 2, total_koli: 3, weight_before: 50, chwt: 40, missing_chwt: 0, weight_increase: 10, add_revenue: 900 },
      ])
      const parent = await service.getDrilldown({ groupBy: 'date', startDate: '2026-06-01', endDate: '2026-06-01' })

      dataSource.query.mockResolvedValueOnce([
        { originName: 'Kosambi', destName: 'Badung', total_to: 2, awb_count: 1, total_koli: 1, weight_before: 20, chwt: 15, missing_chwt: 0, weight_increase: 4, add_revenue: 400 },
        { originName: 'Kosambi', destName: 'Batam', total_to: 3, awb_count: 1, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 500 },
      ])
      const children = await service.getDrilldown({ groupBy: 'route', startDate: '2026-06-01', endDate: '2026-06-01' })

      // Cast diperlukan: getDrilldown mengembalikan union dua tipe array, dan `.reduce`
      // tidak dapat dipanggil langsung di atas union seperti itu.
      const sum = (key: 'totalTo' | 'totalKoli' | 'weightBefore' | 'chwt' | 'addRevenue') =>
        (children as RecapPerRuteRow[]).reduce((acc, row) => acc + row[key], 0)

      expect(sum('totalTo')).toBe(parent[0].totalTo)
      expect(sum('totalKoli')).toBe(parent[0].totalKoli)
      expect(sum('weightBefore')).toBe(parent[0].weightBefore)
      expect(sum('chwt')).toBe(parent[0].chwt)
      expect(sum('addRevenue')).toBe(parent[0].addRevenue)
    })
  })
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `cd apps/backend && pnpm test barhal.service -t getDrilldown`
Expected: FAIL — `service.getDrilldown is not a function`.

- [ ] **Step 3: Buat DTO**

Create `apps/backend/src/modules/barhal/dto/barhal-drilldown-query.dto.ts`:

```ts
import { IsIn } from 'class-validator'
import { BarhalDashboardQueryDto } from './barhal-dashboard-query.dto'

/**
 * Identitas baris yang diklik dilebur ke parameter filter yang sudah ada:
 * - groupBy='route' → pemanggil menyetel startDate=endDate=<tanggal baris>
 * - groupBy='date'  → pemanggil menyetel origin/dest=<rute baris>
 */
export class BarhalDrilldownQueryDto extends BarhalDashboardQueryDto {
  @IsIn(['route', 'date'])
  groupBy!: 'route' | 'date'
}
```

- [ ] **Step 4: Implementasi `getDrilldown`**

Di `barhal.service.ts`, tambahkan import DTO di dekat import DTO lain:

```ts
import { BarhalDrilldownQueryDto } from './dto/barhal-drilldown-query.dto'
```

Tambahkan pula `RecapPerTanggalRow` dan `RecapPerRuteRow` ke daftar import dari `./barhal-recap.builder`, sehingga blok import itu menjadi:

```ts
import {
  toRecapMetrics,
  densifyPerTanggal,
  densifyPerRute,
  daysInRange,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
  RecapPerTanggalRow,
  RecapPerRuteRow,
  RouteKey,
} from './barhal-recap.builder'
```

Lalu tambahkan method berikut tepat setelah `getDashboard`:

```ts
  /**
   * Rincian satu baris rekap. Memakai SQL agregat yang sama persis dengan dashboard,
   * sehingga angkanya pasti rekonsiliasi dengan baris induknya.
   *
   * Densifikasi sengaja dilewati: mengisi seluruh tanggal kalender atau seluruh rute master
   * di dalam baris yang dibuka hanya menghasilkan puluhan baris nol. Drilldown hanya
   * menampilkan grup yang benar-benar ada aktivitasnya.
   */
  async getDrilldown(dto: BarhalDrilldownQueryDto): Promise<RecapPerTanggalRow[] | RecapPerRuteRow[]> {
    if (dto.startDate && dto.endDate && daysInRange(dto.startDate, dto.endDate) > MAX_RECAP_DAYS) {
      throw new BadRequestException(`Date range must not exceed ${MAX_RECAP_DAYS} days`)
    }

    const { params, scopedCte, koliScopedCte } = this.buildScopeSql(dto)

    if (dto.groupBy === 'route') {
      const rows = await this.queryPerRute(scopedCte, koliScopedCte, params)
      return rows.map((row) => ({ originName: row.originName, destName: row.destName, ...toRecapMetrics(row) }))
    }

    const rows = await this.queryPerTanggal(scopedCte, koliScopedCte, params)
    return rows.map((row) => ({ date: row.date, ...toRecapMetrics(row) }))
  }
```

- [ ] **Step 5: Jalankan test dan pastikan lulus**

Run: `cd apps/backend && pnpm test barhal.service -t getDrilldown`
Expected: PASS — 6 test lulus.

- [ ] **Step 6: Daftarkan route di controller**

Di `barhal.controller.ts`, tambahkan import setelah import `BarhalDashboardQueryDto`:

```ts
import { BarhalDrilldownQueryDto } from './dto/barhal-drilldown-query.dto'
```

Lalu tambahkan route tepat setelah handler `getDashboard`:

```ts
  @Get('dashboard/drilldown')
  @Authorize(Permission.READ_BARHAL)
  getDrilldown(@Query() dto: BarhalDrilldownQueryDto) {
    return this.service.getDrilldown(dto)
  }
```

- [ ] **Step 7: Jalankan seluruh test backend**

Run: `cd apps/backend && pnpm test`
Expected: PASS — seluruh suite hijau, tidak ada regresi di `getDashboard`.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal
git commit -m "feat(barhal): add recap drilldown endpoint"
```

---

### Task 6: Drilldown pada tabel rekap (frontend)

**Files:**
- Modify: `apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts` (tambah hook drilldown)
- Modify: `apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx` (tulis ulang)
- Modify: `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx:29-34,127-135`

**Interfaces:**
- Consumes: `GET /barhal/dashboard/drilldown` dari Task 5; `formatDate` dari Task 2.
- Produces:
  - `BarhalDrilldownParams extends BarhalDashboardParams { groupBy: 'route' | 'date' }`
  - `useBarhalRecapDrilldown(params: BarhalDrilldownParams, enabled: boolean)`
  - `BarhalRecapToTable` menerima prop tambahan `groupBy: 'date' | 'route'` dan `filters: BarhalDashboardParams`.

- [ ] **Step 1: Tambahkan hook drilldown**

Di akhir `apps/frontend/src/features/barhal/hooks/useBarhalDashboard.ts`, tambahkan:

```ts
export interface BarhalDrilldownParams extends BarhalDashboardParams {
  groupBy: 'route' | 'date'
}

/**
 * Rincian satu baris rekap. `enabled` bernilai false sampai barisnya dibuka, sehingga
 * tidak ada request yang terkirim saat halaman dimuat.
 */
export function useBarhalRecapDrilldown(params: BarhalDrilldownParams, enabled: boolean) {
  return useQuery<BarhalRecapPerTanggalItem[] | BarhalRecapPerRuteItem[]>({
    queryKey: ['barhal', 'drilldown', params],
    queryFn: () => apiClient.get('/barhal/dashboard/drilldown', { params }).then((r) => r.data),
    staleTime: 30 * 1000,
    enabled,
  })
}
```

Perbarui pula baris import di bagian atas berkas menjadi:

```ts
import {
  BarhalDashboardStats,
  BarhalRecapPerRuteItem,
  BarhalRecapPerTanggalItem,
  BarhalToDetailResponse,
  BarhalToDetailTab,
} from '../types'
```

- [ ] **Step 2: Tulis ulang `BarhalRecapToTable` dengan baris yang bisa dibuka**

Ganti seluruh isi `apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx` dengan:

```tsx
'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { BarhalRecapPerTanggalItem, BarhalRecapPerRuteItem } from '../types'
import { BarhalDashboardParams, useBarhalRecapDrilldown } from '../hooks/useBarhalDashboard'
import { formatDate } from '../utils/dateFormat'

type RecapItem = BarhalRecapPerTanggalItem | BarhalRecapPerRuteItem
/** Kolom angka yang sama persis dimiliki baris per-tanggal maupun per-rute. */
type RecapMetricFields = Omit<BarhalRecapPerTanggalItem, 'date'>

interface BarhalRecapToTableProps {
  rows: RecapItem[]
  groupColumnLabel: string
  /** Dikelompokkan berdasarkan apa tabel ini. Drilldown-nya memakai sumbu yang berlawanan. */
  groupBy: 'date' | 'route'
  /** Filter dashboard yang sedang aktif, diteruskan ke query drilldown. */
  filters: BarhalDashboardParams
}

const COLUMN_COUNT = 10
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function groupKeyAndLabel(row: RecapItem): { key: string; groupLabel: string } {
  // `key` memakai nilai mentah — itu identitas baris, bukan teks tampilan.
  if ('date' in row) return { key: row.date, groupLabel: formatDate(row.date) }
  return { key: `${row.originName}-${row.destName}`, groupLabel: `${row.originName} → ${row.destName}` }
}

function RecapMetricCells({ row }: { row: RecapMetricFields }) {
  return (
    <>
      <td className="px-3 py-2">{row.totalTo}</td>
      <td className="px-3 py-2">{row.totalKoli}</td>
      <td className="px-3 py-2">{fmt.format(row.weightBefore)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.weightAfter)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.chwt)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.variance)} kg</td>
      <td className="px-3 py-2">{fmt.format(row.variancePercent)}%</td>
      <td className="px-3 py-2">{idr.format(row.addRevenue)}</td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.status === 'completed' ? 'bg-green-500/15 text-green-600' : 'bg-amber-500/15 text-amber-600'
          }`}
        >
          {row.status === 'completed' ? 'Completed' : 'Incomplete'}
        </span>
      </td>
    </>
  )
}

/** Membangun parameter drilldown untuk satu baris, memakai sumbu yang berlawanan dari tabel induk. */
function drilldownParamsFor(
  row: RecapItem,
  groupBy: 'date' | 'route',
  filters: BarhalDashboardParams,
): { groupBy: 'route' | 'date'; startDate?: string; endDate?: string; origin?: string; dest?: string } {
  if (groupBy === 'date' && 'date' in row) {
    // Baris tanggal → rincian per rute pada tanggal itu saja.
    return { ...filters, startDate: row.date, endDate: row.date, groupBy: 'route' }
  }
  const route = row as BarhalRecapPerRuteItem
  // Baris rute → rincian per tanggal, rentang dashboard dipertahankan.
  return { ...filters, origin: route.originName, dest: route.destName, groupBy: 'date' }
}

function DrilldownBody({
  row,
  groupBy,
  filters,
}: {
  row: RecapItem
  groupBy: 'date' | 'route'
  filters: BarhalDashboardParams
}) {
  const params = drilldownParamsFor(row, groupBy, filters)
  const { data, isLoading, isError, refetch } = useBarhalRecapDrilldown(params, true)

  if (isError) {
    return (
      <p className="text-xs text-muted-foreground">
        Gagal memuat rincian.{' '}
        <button type="button" onClick={() => refetch()} className="text-primary underline">
          Coba lagi
        </button>
      </p>
    )
  }
  if (isLoading) return <p className="text-xs text-muted-foreground">Memuat rincian…</p>
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">Tidak ada aktivitas.</p>

  return (
    <table className="w-full text-xs">
      <thead className="text-left uppercase text-muted-foreground">
        <tr>
          <th className="px-2 py-1 font-medium">{groupBy === 'date' ? 'Rute' : 'Tanggal'}</th>
          <th className="px-2 py-1 font-medium">Total TO</th>
          <th className="px-2 py-1 font-medium">Total Koli</th>
          <th className="px-2 py-1 font-medium">Weight Before</th>
          <th className="px-2 py-1 font-medium">Weight After</th>
          <th className="px-2 py-1 font-medium">chWt Airlines</th>
          <th className="px-2 py-1 font-medium">Variance</th>
          <th className="px-2 py-1 font-medium">Variance %</th>
          <th className="px-2 py-1 font-medium">Add. Revenue</th>
          <th className="px-2 py-1 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {(data as RecapItem[]).map((child) => {
          const { key, groupLabel } = groupKeyAndLabel(child)
          return (
            <tr key={key}>
              <td className="px-2 py-1">{groupLabel}</td>
              <RecapMetricCells row={child} />
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function BarhalRecapToTable({ rows, groupColumnLabel, groupBy, filters }: BarhalRecapToTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Filter berubah berarti kumpulan barisnya berubah; baris yang terbuka bisa jadi
  // sudah tidak ada lagi.
  useEffect(() => {
    setExpanded(new Set())
  }, [filters.startDate, filters.endDate, filters.origin, filters.dest])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{groupColumnLabel}</th>
            <th className="px-3 py-2 font-medium">Total TO</th>
            <th className="px-3 py-2 font-medium">Total Koli</th>
            <th className="px-3 py-2 font-medium">Weight Before</th>
            <th className="px-3 py-2 font-medium">Weight After</th>
            <th className="px-3 py-2 font-medium">chWt Airlines</th>
            <th className="px-3 py-2 font-medium">Variance</th>
            <th className="px-3 py-2 font-medium">Variance %</th>
            <th className="px-3 py-2 font-medium">Add. Revenue</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                No data for this range.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const { key, groupLabel } = groupKeyAndLabel(row)
              const isOpen = expanded.has(key)
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => toggle(key)}
                    className={`cursor-pointer hover:bg-accent/30 ${
                      row.totalTo === 0 && row.totalKoli === 0 ? 'text-muted-foreground' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {groupLabel}
                      </span>
                    </td>
                    <RecapMetricCells row={row} />
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={COLUMN_COUNT} className="bg-muted/20 px-3 py-3">
                        <DrilldownBody row={row} groupBy={groupBy} filters={filters} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Teruskan `groupBy` dan `filters` dari halaman dashboard**

Di `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx`, ganti blok pemanggilan hook (baris 29-34) menjadi:

```tsx
  const { data: stations } = useBarhalStations()
  const filters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
  }
  const { data, isLoading, isError, refetch } = useBarhalDashboardStats(filters)
```

Lalu ganti kedua pemakaian `BarhalRecapToTable` (baris 127-135) menjadi:

```tsx
          <div>
            <p className="mb-2 text-sm font-medium">Rekap Per Tanggal</p>
            <BarhalRecapToTable
              rows={data.recapPerTanggal}
              groupColumnLabel="Date"
              groupBy="date"
              filters={filters}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Rekap Per Rute</p>
            <BarhalRecapToTable
              rows={data.recapPerRute}
              groupColumnLabel="Rute"
              groupBy="route"
              filters={filters}
            />
          </div>
```

- [ ] **Step 4: Verifikasi type-check dan test**

Run: `cd apps/frontend && pnpm type-check && pnpm test`
Expected: type-check bersih; test PASS (14 test).

- [ ] **Step 5: Verifikasi manual di aplikasi**

Jalankan backend dan frontend, buka `/barhal/dashboard`, lalu periksa:
1. Klik satu baris di `Rekap Per Tanggal` → muncul sub-tabel berisi rute-rute pada tanggal itu.
2. Klik satu baris di `Rekap Per Rute` → muncul sub-tabel berisi tanggal-tanggal untuk rute itu.
3. Buka dua baris sekaligus → keduanya tetap terbuka.
4. Ubah filter tanggal → seluruh baris yang terbuka tertutup kembali.
5. Buka tab Network: tidak ada request `drilldown` sampai baris pertama diklik.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/barhal apps/frontend/src/app/\(dashboard\)/barhal/dashboard/page.tsx
git commit -m "feat(barhal): make recap rows drillable by route and date"
```

---

### Task 7: Ambil Rute dari master `air_shipments_data` (backend)

> **Catatan urutan:** task ini mengubah bentuk respons `GET /barhal/available-tos`. Frontend baru menyesuaikan di Task 8, jadi kedua task ini harus dikerjakan berurutan tanpa jeda — di antara keduanya, wizard step 2 tidak akan menampilkan TO.

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts:43-53` (interface), `:82-99` (`getStations`), `:102-156` (`getAvailableTos`)
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts:40-53` (perbarui test yang ada, tambah test baru)

**Interfaces:**
- Consumes: tidak ada.
- Produces:
  - `getStations(): Promise<{ origins: string[]; dests: string[] }>` — tanda tangan tidak berubah, sumber datanya yang berubah.
  - `getAvailableTos(dto: AvailableToDto): Promise<{ data: AvailableToRow[]; unmatchedRouteCount: number }>` — **bentuk respons berubah**.

- [ ] **Step 1: Perbarui test yang ada dan tulis test baru yang gagal**

Di `barhal.service.spec.ts`, ganti seluruh blok `describe('getAvailableTos', ...)` yang ada dengan:

```ts
  describe('getAvailableTos', () => {
    it('filters to Barhal-only TOs and applies search/date/origin/dest params', async () => {
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: 'AWB1', gross_weight: 10, origin_station: 'Kosambi DC', dest_station: 'Badung DC', lt_number: 'LT1', remarks: 'BARHAL', date: '2026-06-01' },
      ])
      const result = await service.getAvailableTos({ search: 'TO1', date: '2026-06-01', origin: 'Kosambi', dest: 'Badung' })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].vendor).toBe('ESP')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/remarks ILIKE/i)
      expect(params).toContain('%barhal%')
      expect(params).toContain('%TO1%')
    })

    it('reads the route from air_shipments_data via the origin_dc/destination_dc join', async () => {
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: 'AWB1', gross_weight: 10, origin_station: 'Jabo', dest_station: 'Batam', lt_number: 'LT1', remarks: 'BARHAL', date: '2026-06-01' },
      ])
      const result = await service.getAvailableTos({})
      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/air_shipments_data/)
      expect(sql).toMatch(/rm\.origin_dc\s*=\s*c\.extra_fields->>'origin'/)
      expect(sql).toMatch(/rm\.destination_dc\s*=\s*c\.extra_fields->>'destination'/)
      expect(result.data[0].origin_station).toBe('Jabo')
      expect(result.data[0].dest_station).toBe('Batam')
    })

    it('de-duplicates the master so an Air+Sea pair cannot multiply TO rows', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await service.getAvailableTos({})
      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/DISTINCT ON \(origin_dc, destination_dc\)/)
    })

    it('drops TOs whose route is missing from the master and reports how many', async () => {
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: 'AWB1', gross_weight: 10, origin_station: 'Jabo', dest_station: 'Batam', lt_number: 'LT1', remarks: 'BARHAL', date: '2026-06-01' },
        { to_number: 'TO2', awb: 'AWB2', gross_weight: 5, origin_station: null, dest_station: null, lt_number: 'LT2', remarks: 'BARHAL', date: '2026-06-01' },
        { to_number: 'TO3', awb: 'AWB3', gross_weight: 5, origin_station: null, dest_station: null, lt_number: 'LT3', remarks: 'BARHAL', date: '2026-06-01' },
      ])
      const result = await service.getAvailableTos({})
      expect(result.data.map((r) => r.to_number)).toEqual(['TO1'])
      expect(result.unmatchedRouteCount).toBe(2)
    })

    it('does not narrow unmatchedRouteCount by the origin/dest filter', async () => {
      dataSource.query.mockResolvedValueOnce([
        { to_number: 'TO1', awb: null, gross_weight: 1, origin_station: 'Jabo', dest_station: 'Batam', lt_number: null, remarks: 'BARHAL', date: '2026-06-01' },
        { to_number: 'TO2', awb: null, gross_weight: 1, origin_station: 'Surabaya', dest_station: 'Makassar', lt_number: null, remarks: 'BARHAL', date: '2026-06-01' },
        { to_number: 'TO3', awb: null, gross_weight: 1, origin_station: null, dest_station: null, lt_number: null, remarks: 'BARHAL', date: '2026-06-01' },
      ])
      const result = await service.getAvailableTos({ origin: 'Jabo', dest: 'Batam' })
      expect(result.data.map((r) => r.to_number)).toEqual(['TO1'])
      // TO3 gagal dijoin sehingga tidak punya rute untuk dibandingkan dengan filter.
      expect(result.unmatchedRouteCount).toBe(1)
    })
  })

  describe('getStations', () => {
    it('sources dropdown options from the air_shipments_data master join', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin_station: 'Jabo', dest_station: 'Batam' },
        { origin_station: 'Surabaya', dest_station: 'Makassar' },
      ])
      const stations = await service.getStations()
      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/air_shipments_data/)
      expect(sql).toMatch(/rm\.origin_dc\s*=\s*c\.extra_fields->>'origin'/)
      expect(stations.origins).toEqual(['Jabo', 'Surabaya'])
      expect(stations.dests).toEqual(['Batam', 'Makassar'])
    })
  })
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `cd apps/backend && pnpm test barhal.service -t "getAvailableTos|getStations"`
Expected: FAIL — `result.data is undefined` dan SQL tidak mengandung `air_shipments_data`.

- [ ] **Step 3: Tambahkan konstanta CTE master rute**

Di `barhal.service.ts`, tepat setelah `const UNIQUE_VIOLATION = '23505'`, tambahkan:

```ts
/**
 * Master rute: pasangan DC → nama stasiun. DISTINCT ON bersifat wajib, bukan kosmetik —
 * air_shipments_data unik pada (service, origin_dc, destination_dc), sehingga satu pasangan
 * DC bisa punya baris Air *dan* Sea. Tanpa ini, join akan menggandakan baris TO.
 */
const ROUTE_MASTER_CTE = `
  route_master AS (
    SELECT DISTINCT ON (origin_dc, destination_dc)
      origin_dc,
      destination_dc,
      extra_fields->>'origin_station'      AS origin_station,
      extra_fields->>'destination_station' AS dest_station
    FROM air_shipments_data
    WHERE origin_dc IS NOT NULL AND destination_dc IS NOT NULL
    ORDER BY origin_dc, destination_dc, service
  )
`
```

- [ ] **Step 4: Ubah `getStations`**

Ganti isi method `getStations` menjadi:

```ts
  /** Distinct normalized origin/destination names among Barhal-eligible TOs, for wizard/filter dropdowns. */
  async getStations(): Promise<{ origins: string[]; dests: string[] }> {
    const rows: { origin_station: string; dest_station: string }[] = await this.dataSource.query(`
      WITH ${ROUTE_MASTER_CTE}
      SELECT DISTINCT rm.origin_station, rm.dest_station
      FROM air_shipments_compileaircgk c
      JOIN route_master rm
        ON rm.origin_dc      = c.extra_fields->>'origin'
       AND rm.destination_dc = c.extra_fields->>'destination'
      WHERE c.remarks ILIKE '%barhal%'
        AND rm.origin_station IS NOT NULL AND rm.origin_station != ''
        AND rm.dest_station IS NOT NULL AND rm.dest_station != ''
    `)
    const origins = new Set<string>()
    const dests = new Set<string>()
    for (const row of rows) {
      const origin = normalizeStationName(row.origin_station)
      const dest = normalizeStationName(row.dest_station)
      if (origin) origins.add(origin)
      if (dest) dests.add(dest)
    }
    return { origins: Array.from(origins).sort(), dests: Array.from(dests).sort() }
  }
```

- [ ] **Step 5: Ubah `getAvailableTos`**

Ganti isi method `getAvailableTos` menjadi:

```ts
  /**
   * Barhal-only TOs (remarks ILIKE '%barhal%') not yet packed into any Koli.
   *
   * Rute dibaca dari master air_shipments_data lewat pasangan DC, bukan dari kolom station
   * milik compileaircgk. LEFT JOIN dipakai agar baris yang tidak punya pasangan di master
   * masih bisa dihitung, lalu dibuang — operator perlu tahu berapa banyak yang tersaring.
   */
  async getAvailableTos(dto: AvailableToDto): Promise<{ data: AvailableToRow[]; unmatchedRouteCount: number }> {
    const params: unknown[] = []
    params.push('%barhal%')
    const conditions: string[] = [`c.remarks ILIKE $${params.length}`]

    if (dto.search) {
      params.push(`%${dto.search}%`)
      conditions.push(`(c.to_number ILIKE $${params.length} OR c.lt_number ILIKE $${params.length})`)
    }
    if (dto.date) {
      params.push(dto.date)
      conditions.push(`c.completed_date = $${params.length}`)
    }

    let excludeAttachedClause = 'NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number)'
    if (dto.koliId) {
      params.push(dto.koliId)
      excludeAttachedClause = `NOT EXISTS (SELECT 1 FROM barhal_koli_to bkt WHERE bkt.to_number = c.to_number AND bkt.koli_id != $${params.length})`
    }

    const rows: AvailableToRow[] = await this.dataSource.query(
      `
      WITH ${ROUTE_MASTER_CTE}
      SELECT
        c.to_number,
        c.awb,
        c.gross_weight,
        rm.origin_station,
        rm.dest_station AS dest_station,
        c.lt_number,
        c.remarks,
        c.completed_date AS date
      FROM air_shipments_compileaircgk c
      LEFT JOIN route_master rm
        ON rm.origin_dc      = c.extra_fields->>'origin'
       AND rm.destination_dc = c.extra_fields->>'destination'
      WHERE c.to_number IS NOT NULL
        AND ${excludeAttachedClause}
        AND ${conditions.join(' AND ')}
      ORDER BY c.to_number
      `,
      params,
    )

    // Baris tanpa pasangan di master tidak punya rute sama sekali, sehingga tidak mungkin
    // dipersempit filter origin/dest — hitungannya karena itu diambil sebelum filter itu.
    const matched = rows.filter((row) => row.origin_station && row.dest_station)
    const unmatchedRouteCount = rows.length - matched.length

    const originFilter = dto.origin ? normalizeStationName(dto.origin) : undefined
    const destFilter = dto.dest ? normalizeStationName(dto.dest) : undefined
    const filtered = matched.filter((row) => {
      if (originFilter && normalizeStationName(row.origin_station) !== originFilter) return false
      if (destFilter && normalizeStationName(row.dest_station) !== destFilter) return false
      return true
    })
    const AVAILABLE_TOS_LIMIT = 100
    return {
      data: filtered.slice(0, AVAILABLE_TOS_LIMIT).map((row) => ({
        ...row,
        origin_station: row.origin_station ? normalizeStationName(row.origin_station) : row.origin_station,
        dest_station: row.dest_station ? normalizeStationName(row.dest_station) : row.dest_station,
        vendor: 'ESP' as const,
      })),
      unmatchedRouteCount,
    }
  }
```

- [ ] **Step 6: Jalankan test dan pastikan lulus**

Run: `cd apps/backend && pnpm test barhal.service`
Expected: PASS — seluruh suite hijau, termasuk 5 test `getAvailableTos` dan 1 test `getStations`.

- [ ] **Step 7: Verifikasi terhadap database sungguhan**

Run:

```bash
psql "postgres://postgres:postgres@localhost:5432/app" -c "
WITH route_master AS (
  SELECT DISTINCT ON (origin_dc, destination_dc)
    origin_dc, destination_dc,
    extra_fields->>'origin_station' AS origin_station,
    extra_fields->>'destination_station' AS dest_station
  FROM air_shipments_data
  WHERE origin_dc IS NOT NULL AND destination_dc IS NOT NULL
  ORDER BY origin_dc, destination_dc, service
)
SELECT count(*) FILTER (WHERE rm.origin_station IS NOT NULL) AS matched,
       count(*) FILTER (WHERE rm.origin_station IS NULL)     AS unmatched
FROM air_shipments_compileaircgk c
LEFT JOIN route_master rm
  ON rm.origin_dc = c.extra_fields->>'origin'
 AND rm.destination_dc = c.extra_fields->>'destination'
WHERE c.remarks ILIKE '%barhal%' AND c.to_number IS NOT NULL;"
```

Expected: `unmatched` bernilai 12 (rute `Sidoarjo DC → Banjarmasin / Banjarbaru / Banjarmasin 2 DC`), `matched` jauh lebih besar. Kalau `unmatched` jauh lebih besar dari 12, hentikan dan laporkan — kemungkinan join-nya salah.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal
git commit -m "feat(barhal): source wizard TO routes from air_shipments_data master"
```

---

### Task 8: Sesuaikan wizard dengan bentuk respons baru (frontend)

**Files:**
- Modify: `apps/frontend/src/features/barhal/types.ts:35-45` (tambah tipe respons)
- Modify: `apps/frontend/src/features/barhal/hooks/useBarhal.ts:1-13,49-55`
- Modify: `apps/frontend/src/features/barhal/components/wizard/Step2SelectTos.tsx:63-76,133`
- Modify: `apps/frontend/src/features/barhal/components/ToMultiSelect.tsx` (prop + catatan)
- Modify: `apps/frontend/src/features/barhal/components/wizard/Step1CreateKoli.tsx` (teks bantuan)

**Interfaces:**
- Consumes: `{ data, unmatchedRouteCount }` dari Task 7.
- Produces: `AvailableToResponse { data: AvailableTo[]; unmatchedRouteCount: number }`.

- [ ] **Step 1: Tambahkan tipe respons**

Di `apps/frontend/src/features/barhal/types.ts`, tepat setelah interface `AvailableTo` (baris 45), tambahkan:

```ts
export interface AvailableToResponse {
  data: AvailableTo[]
  /**
   * TO yang lolos pencarian tapi dibuang karena rutenya belum terdaftar di master
   * air_shipments_data. Tidak dipersempit filter origin/dest.
   */
  unmatchedRouteCount: number
}
```

- [ ] **Step 2: Perbarui hook `useAvailableTos`**

Di `apps/frontend/src/features/barhal/hooks/useBarhal.ts`, tambahkan `AvailableToResponse` ke daftar import dari `'../types'`, lalu ganti hook-nya (baris 49-55) menjadi:

```ts
export function useAvailableTos(params: { origin?: string; dest?: string; date?: string; search?: string; koliId?: string }) {
  return useQuery<AvailableToResponse>({
    queryKey: ['barhal', 'available-tos', params],
    queryFn: () => apiClient.get('/barhal/available-tos', { params }).then((r) => r.data),
    staleTime: 15 * 1000,
  })
}
```

Import `AvailableTo` tetap dipertahankan bila masih dipakai di berkas ini; kalau tidak, hapus.

- [ ] **Step 3: Tambahkan prop catatan di `ToMultiSelect`**

Di `apps/frontend/src/features/barhal/components/ToMultiSelect.tsx`, tambahkan satu field pada interface prop:

```tsx
interface ToMultiSelectProps {
  options: AvailableTo[]
  selected: string[]
  onChange: (toNumbers: string[]) => void
  isLoading?: boolean
  /** TO yang tersaring karena rutenya belum terdaftar di master air_shipments_data. */
  unmatchedRouteCount?: number
}
```

Perbarui tanda tangan komponennya:

```tsx
export function ToMultiSelect({ options, selected, onChange, isLoading, unmatchedRouteCount }: ToMultiSelectProps) {
```

Lalu tepat sebelum catatan `AVAILABLE_TOS_LIMIT` yang sudah ada di bagian bawah komponen, sisipkan:

```tsx
      {!isLoading && !!unmatchedRouteCount && unmatchedRouteCount > 0 && (
        <p className="border-t border-border px-3 py-2 text-center text-xs text-amber-600">
          {unmatchedRouteCount} TO disembunyikan — rutenya belum terdaftar di master air_shipments_data.
        </p>
      )}
```

- [ ] **Step 4: Sesuaikan `Step2SelectTos`**

Ganti blok `selectedRows` (baris 72-76) menjadi:

```tsx
  const toOptions = availableTos?.data ?? []

  const selectedRows = useMemo(
    () => toOptions.filter((t) => selected.includes(t.to_number)),
    [toOptions, selected],
  )
```

Lalu ganti pemakaian `ToMultiSelect` (baris 133) menjadi:

```tsx
      <ToMultiSelect
        options={toOptions}
        selected={selected}
        onChange={setSelected}
        isLoading={isLoading}
        unmatchedRouteCount={availableTos?.unmatchedRouteCount}
      />
```

- [ ] **Step 5: Tambahkan teks bantuan di `Step1CreateKoli`**

Di `Step1CreateKoli.tsx`, pada cabang pembuatan Koli baru, grid tiga kolom (Tanggal / Origin / Destinasi) ditutup oleh `</div>` di baris 140, dan blok Komoditi dimulai di baris 142. Sisipkan paragraf berikut di antara keduanya, sehingga bagian itu terbaca:

```tsx
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Hanya rute yang terdaftar di master air_shipments_data yang tersedia.
      </p>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Komoditi</label>
```

- [ ] **Step 6: Verifikasi type-check dan test**

Run: `cd apps/frontend && pnpm type-check && pnpm test`
Expected: type-check bersih; test PASS (14 test).

- [ ] **Step 7: Verifikasi manual di aplikasi**

Jalankan backend dan frontend, buka wizard Koli:
1. Step 1 — dropdown Origin/Destinasi terisi, teks bantuan tampil.
2. Step 2 — daftar TO tampil, kolom Rute terisi nama stasiun dari master.
3. Kalau ada TO yang tersaring, catatan kuning muncul dengan jumlah yang benar.
4. Filter Origin/Destinasi di step 2 tetap menyaring dengan benar.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/barhal
git commit -m "feat(barhal): adapt wizard to master-sourced TO routes"
```

---

## Verifikasi akhir

- [ ] **Jalankan seluruh test**

```bash
cd apps/backend && pnpm test
cd ../frontend && pnpm type-check && pnpm test
```

Expected: seluruh suite hijau.

- [ ] **Periksa bahwa tidak ada berkas di luar Barhal yang tersentuh**

```bash
git diff --stat main -- apps/frontend/src | grep -v "features/barhal\|app/(dashboard)/barhal"
```

Expected: tidak ada keluaran (kecuali `jest.config.js` dan `package.json` dari Task 1).
