# Barhal Recap — Rekap Per Tanggal & Per Rute Lengkap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Barhal dashboard's Rekap Per Tanggal show every date in the filtered range and Rekap Per Rute show every barhal route, with status decided purely by whether each packed AWB has a chWt.

**Architecture:** Recap row mapping and gap-filling move out of `BarhalService.getDashboard()` into a new pure module `barhal-recap.builder.ts`, mirroring the existing `barhal-csv.builder.ts` pattern so the logic is unit-testable without a database. The SQL keeps producing only rows that have data; the builder fills in the rest. The `groups` CTE is widened from `koli_scoped` to `scoped UNION koli_scoped` so a date/route with TOs but no Koli still carries its real `totalTo` instead of being zero-filled.

**Tech Stack:** NestJS + TypeORM raw SQL (PostgreSQL) on the backend, Jest + ts-jest for tests, Next.js App Router + React Query + Tailwind on the frontend.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-barhal-recap-dense-rows-design.md` (Approved)
- Status rule, verbatim: `completed ⟺ awbCount > 0 AND missingChwt === 0`
- `MAX_RECAP_DAYS = 366` — inclusive date count; 1 Jan–31 Dec of a leap year (366 dates) must pass
- Error message, verbatim: `Date range must not exceed 366 days`
- Date arithmetic uses UTC components (`Date.UTC`) only — never local-time `Date` arithmetic
- Rekap Per Tanggal is ascending (1 → 31); Rekap Per Rute is sorted by `originName` then `destName`
- Response shape and `apps/frontend/src/features/barhal/types.ts` do **not** change
- Backend tests: `pnpm --filter backend test -- <pattern>`
- Frontend tests: `cd apps/frontend && pnpm exec jest <pattern>`

## File Structure

| File | Responsibility |
|---|---|
| Create `apps/backend/src/modules/barhal/barhal-recap.builder.ts` | Pure recap logic: raw-row → metrics mapping, the status rule, empty rows, date enumeration, per-tanggal and per-rute gap filling. No NestJS/DB imports. |
| Create `apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts` | Unit tests for the above. |
| Modify `apps/backend/src/modules/barhal/barhal.service.ts` | `getDashboard()` only: widened `groups` CTEs, `awb_count` replacing `attached_to`, ascending date order, new master-routes query, range guard, delegation to the builder. |
| Modify `apps/backend/src/modules/barhal/barhal.service.spec.ts` | Update `getDashboard` mocks; add SQL-shape and wiring tests. |
| Create `apps/frontend/src/features/barhal/utils/monthRange.ts` | `currentMonthRange()` — the dashboard's default filter range. |
| Create `apps/frontend/src/features/barhal/utils/monthRange.spec.ts` | Unit tests for the above. |
| Modify `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx` | Default `startDate`/`endDate` to the current month. |
| Modify `apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx` | Mute zero rows so rows with data stand out. |

---

### Task 1: Recap metrics mapping and the status rule

**Files:**
- Create: `apps/backend/src/modules/barhal/barhal-recap.builder.ts`
- Test: `apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RecapAggregateRow`, `RecapMetrics`, `toRecapMetrics(row: RecapAggregateRow): RecapMetrics`, `emptyRecapMetrics(): RecapMetrics`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts`:

```ts
import { toRecapMetrics, emptyRecapMetrics, RecapAggregateRow } from './barhal-recap.builder'

function aggregateRow(overrides: Partial<RecapAggregateRow> = {}): RecapAggregateRow {
  return {
    total_to: 3,
    total_koli: 2,
    awb_count: 2,
    missing_chwt: 0,
    weight_before: '30',
    chwt: '25',
    weight_increase: '6',
    add_revenue: '500',
    ...overrides,
  }
}

describe('toRecapMetrics', () => {
  it('marks a group completed when every packed AWB has a chWt', () => {
    expect(toRecapMetrics(aggregateRow()).status).toBe('completed')
  })

  it('marks a group incomplete when no AWB has been packed into a Koli yet', () => {
    expect(toRecapMetrics(aggregateRow({ awb_count: 0, total_koli: 0 })).status).toBe('incomplete')
  })

  it('marks a group incomplete when a packed AWB is missing its chWt', () => {
    expect(toRecapMetrics(aggregateRow({ missing_chwt: 1 })).status).toBe('incomplete')
  })

  it('ignores barhal TOs that are not packed into a Koli when deciding status', () => {
    // 10 barhal TOs on this date but only 2 AWBs packed: chWt is the only check, so still completed
    expect(toRecapMetrics(aggregateRow({ total_to: 10 })).status).toBe('completed')
  })

  it('derives weightAfter and variance from the Koli weight increase', () => {
    const metrics = toRecapMetrics(aggregateRow())
    expect(metrics.weightBefore).toBe(30)
    expect(metrics.weightAfter).toBe(36)
    expect(metrics.variance).toBe(6)
    expect(metrics.variancePercent).toBeCloseTo(20)
    expect(metrics.chwt).toBe(25)
    expect(metrics.addRevenue).toBe(500)
  })

  it('reports variancePercent as 0 when weightBefore is 0 (no division by zero)', () => {
    const metrics = toRecapMetrics(aggregateRow({ weight_before: '0', weight_increase: '0' }))
    expect(metrics.variancePercent).toBe(0)
  })
})

describe('emptyRecapMetrics', () => {
  it('is all zeroes and incomplete', () => {
    expect(emptyRecapMetrics()).toEqual({
      totalTo: 0,
      totalKoli: 0,
      weightBefore: 0,
      weightAfter: 0,
      chwt: 0,
      variance: 0,
      variancePercent: 0,
      addRevenue: 0,
      status: 'incomplete',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend test -- barhal-recap.builder`
Expected: FAIL — `Cannot find module './barhal-recap.builder'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/modules/barhal/barhal-recap.builder.ts`:

```ts
/**
 * Pure recap builders for the Barhal dashboard. Kept free of NestJS/DB dependencies so the status
 * rule and the "show every date/route" gap filling can be unit-tested without SQL, mirroring
 * barhal-csv.builder.ts.
 */

/** One aggregated group as returned by the per-tanggal / per-rute dashboard queries. */
export interface RecapAggregateRow {
  total_to: number
  total_koli: number
  awb_count: number
  missing_chwt: number
  weight_before: string
  chwt: string
  weight_increase: string
  add_revenue: string
}

export interface RecapMetrics {
  totalTo: number
  totalKoli: number
  weightBefore: number
  weightAfter: number
  chwt: number
  variance: number
  variancePercent: number
  addRevenue: number
  status: 'completed' | 'incomplete'
}

/**
 * chWt lives on the AWB, not the Koli, so a date/route counts as completed once every AWB already
 * packed into a Koli there has a chWt. Barhal TOs still waiting to be packed deliberately do NOT
 * affect the status. awb_count = 0 (nothing packed yet, or every packed TO has a null AWB) means
 * there is nothing to confirm, which is reported as incomplete.
 */
export function toRecapMetrics(row: RecapAggregateRow): RecapMetrics {
  const weightBefore = Number(row.weight_before)
  const weightAfter = weightBefore + Number(row.weight_increase)
  const variance = weightAfter - weightBefore
  return {
    totalTo: row.total_to,
    totalKoli: row.total_koli,
    weightBefore,
    weightAfter,
    chwt: Number(row.chwt),
    variance,
    variancePercent: weightBefore > 0 ? (variance / weightBefore) * 100 : 0,
    addRevenue: Number(row.add_revenue),
    status: row.awb_count > 0 && row.missing_chwt === 0 ? 'completed' : 'incomplete',
  }
}

/** Row shown for a date/route with no TOs and no Koli at all in the filtered range. */
export function emptyRecapMetrics(): RecapMetrics {
  return {
    totalTo: 0,
    totalKoli: 0,
    weightBefore: 0,
    weightAfter: 0,
    chwt: 0,
    variance: 0,
    variancePercent: 0,
    addRevenue: 0,
    status: 'incomplete',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend test -- barhal-recap.builder`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal-recap.builder.ts apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts
git commit -m "feat(barhal): add recap builder with chWt-only status rule"
```

---

### Task 2: Date enumeration and per-tanggal gap filling

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal-recap.builder.ts`
- Test: `apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts`

**Interfaces:**
- Consumes: `RecapMetrics`, `emptyRecapMetrics`, `toRecapMetrics` from Task 1.
- Produces: `MAX_RECAP_DAYS = 366`, `RecapPerTanggalRow` (= `RecapMetrics & { date: string }`), `enumerateDates(start: string, end: string): string[]`, `daysInRange(start: string, end: string): number`, `densifyPerTanggal(rows: RecapPerTanggalRow[], start: string, end: string): RecapPerTanggalRow[]`.

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts`, and extend the existing import at the top of the file to:

```ts
import {
  toRecapMetrics,
  emptyRecapMetrics,
  enumerateDates,
  daysInRange,
  densifyPerTanggal,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
} from './barhal-recap.builder'
```

```ts
describe('enumerateDates', () => {
  it('returns every day of a 31-day month', () => {
    const dates = enumerateDates('2026-08-01', '2026-08-31')
    expect(dates).toHaveLength(31)
    expect(dates[0]).toBe('2026-08-01')
    expect(dates[30]).toBe('2026-08-31')
  })

  it('includes 29 February in a leap year', () => {
    const dates = enumerateDates('2024-02-01', '2024-02-29')
    expect(dates).toHaveLength(29)
    expect(dates).toContain('2024-02-29')
  })

  it('returns a single date when start equals end', () => {
    expect(enumerateDates('2026-08-03', '2026-08-03')).toEqual(['2026-08-03'])
  })

  it('crosses month and year boundaries', () => {
    expect(enumerateDates('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ])
  })

  it('returns nothing when end precedes start', () => {
    expect(enumerateDates('2026-08-10', '2026-08-01')).toEqual([])
  })
})

describe('daysInRange', () => {
  it('counts both endpoints', () => {
    expect(daysInRange('2026-08-01', '2026-08-31')).toBe(31)
    expect(daysInRange('2026-08-03', '2026-08-03')).toBe(1)
  })

  it('lets a full leap year through the MAX_RECAP_DAYS ceiling', () => {
    expect(daysInRange('2024-01-01', '2024-12-31')).toBe(366)
    expect(daysInRange('2024-01-01', '2024-12-31')).toBeLessThanOrEqual(MAX_RECAP_DAYS)
    expect(daysInRange('2024-01-01', '2025-01-01')).toBeGreaterThan(MAX_RECAP_DAYS)
  })

  it('returns 0 when end precedes start', () => {
    expect(daysInRange('2026-08-10', '2026-08-01')).toBe(0)
  })
})

describe('densifyPerTanggal', () => {
  it('fills dates with no activity with a zeroed incomplete row', () => {
    const rows = [{ date: '2026-08-02', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerTanggal(rows, '2026-08-01', '2026-08-03')
    expect(result.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(result[0]).toEqual({ date: '2026-08-01', ...emptyRecapMetrics() })
    expect(result[1].status).toBe('completed')
    expect(result[2].status).toBe('incomplete')
  })

  it('keeps a date that has TOs but no Koli instead of zeroing its totalTo', () => {
    const rows = [
      {
        date: '2026-08-01',
        ...toRecapMetrics(
          aggregateRow({
            total_to: 5,
            total_koli: 0,
            awb_count: 0,
            weight_before: '0',
            weight_increase: '0',
            chwt: '0',
            add_revenue: '0',
          }),
        ),
      },
    ]
    const result = densifyPerTanggal(rows, '2026-08-01', '2026-08-02')
    expect(result[0].totalTo).toBe(5)
    expect(result[0].totalKoli).toBe(0)
    expect(result[0].status).toBe('incomplete')
  })

  it('returns dates ascending regardless of input order', () => {
    const rows = [
      { date: '2026-08-03', ...emptyRecapMetrics() },
      { date: '2026-08-01', ...emptyRecapMetrics() },
    ]
    expect(densifyPerTanggal(rows, '2026-08-01', '2026-08-03').map((r) => r.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend test -- barhal-recap.builder`
Expected: FAIL — TypeScript error, `enumerateDates`/`daysInRange`/`densifyPerTanggal`/`MAX_RECAP_DAYS` have no exported member

- [ ] **Step 3: Write minimal implementation**

Append to `apps/backend/src/modules/barhal/barhal-recap.builder.ts`:

```ts
/** Ceiling on how many dates one Rekap Per Tanggal may span. A full leap year (366) still passes. */
export const MAX_RECAP_DAYS = 366

const MS_PER_DAY = 86_400_000

export interface RecapPerTanggalRow extends RecapMetrics {
  date: string
}

function toUtcMillis(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * Inclusive YYYY-MM-DD series. Computed from UTC components rather than local-time Date
 * arithmetic so a DST transition can never skip or repeat a day.
 */
export function enumerateDates(start: string, end: string): string[] {
  const last = toUtcMillis(end)
  const dates: string[] = []
  for (let cursor = toUtcMillis(start); cursor <= last; cursor += MS_PER_DAY) {
    dates.push(new Date(cursor).toISOString().slice(0, 10))
  }
  return dates
}

/** Inclusive day count for the range, 0 when end precedes start. */
export function daysInRange(start: string, end: string): number {
  const diff = toUtcMillis(end) - toUtcMillis(start)
  return diff < 0 ? 0 : Math.floor(diff / MS_PER_DAY) + 1
}

/**
 * One row per calendar date in the range, ascending. Dates the query returned keep their real
 * numbers — including dates that have TOs but no Koli yet — everything else becomes a zero row.
 */
export function densifyPerTanggal(
  rows: RecapPerTanggalRow[],
  start: string,
  end: string,
): RecapPerTanggalRow[] {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  return enumerateDates(start, end).map((date) => byDate.get(date) ?? { date, ...emptyRecapMetrics() })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend test -- barhal-recap.builder`
Expected: PASS — 18 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal-recap.builder.ts apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts
git commit -m "feat(barhal): fill every calendar date in the per-tanggal recap"
```

---

### Task 3: Per-rute gap filling against the master route list

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal-recap.builder.ts`
- Test: `apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts`

**Interfaces:**
- Consumes: `RecapMetrics`, `emptyRecapMetrics`, `toRecapMetrics` from Task 1.
- Produces: `RouteKey` (= `{ originName: string; destName: string }`), `RecapPerRuteRow` (= `RecapMetrics & RouteKey`), `densifyPerRute(rows: RecapPerRuteRow[], masterRoutes: RouteKey[]): RecapPerRuteRow[]`.

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts`, and add `densifyPerRute` to the existing import list at the top of the file.

```ts
describe('densifyPerRute', () => {
  const master = [
    { originName: 'Kosambi', destName: 'Badung' },
    { originName: 'Kosambi', destName: 'Makassar' },
    { originName: 'Surabaya', destName: 'Badung' },
  ]

  it('adds every master route that had no activity as a zeroed incomplete row', () => {
    const rows = [{ originName: 'Kosambi', destName: 'Badung', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerRute(rows, master)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual({ originName: 'Kosambi', destName: 'Makassar', ...emptyRecapMetrics() })
    expect(result[2]).toEqual({ originName: 'Surabaya', destName: 'Badung', ...emptyRecapMetrics() })
  })

  it('keeps the queried numbers for routes that are in both sets', () => {
    const rows = [{ originName: 'Kosambi', destName: 'Badung', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerRute(rows, master)
    expect(result[0]).toMatchObject({ originName: 'Kosambi', destName: 'Badung', totalTo: 3, status: 'completed' })
  })

  it('keeps a route that only exists in the query result, not in the master list', () => {
    const rows = [{ originName: 'Denpasar', destName: 'Kosambi', ...toRecapMetrics(aggregateRow()) }]
    const result = densifyPerRute(rows, master)
    expect(result).toHaveLength(4)
    expect(result.map((r) => `${r.originName}-${r.destName}`)).toContain('Denpasar-Kosambi')
  })

  it('sorts by origin then destination', () => {
    const result = densifyPerRute([], [
      { originName: 'Surabaya', destName: 'Badung' },
      { originName: 'Kosambi', destName: 'Makassar' },
      { originName: 'Kosambi', destName: 'Badung' },
    ])
    expect(result.map((r) => `${r.originName}-${r.destName}`)).toEqual([
      'Kosambi-Badung',
      'Kosambi-Makassar',
      'Surabaya-Badung',
    ])
  })

  it('returns only master routes when the query returned nothing', () => {
    const result = densifyPerRute([], master)
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.status === 'incomplete' && r.totalKoli === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend test -- barhal-recap.builder`
Expected: FAIL — TypeScript error, `densifyPerRute` has no exported member

- [ ] **Step 3: Write minimal implementation**

Append to `apps/backend/src/modules/barhal/barhal-recap.builder.ts`:

```ts
export interface RouteKey {
  originName: string
  destName: string
}

export interface RecapPerRuteRow extends RecapMetrics, RouteKey {}

/** A NUL byte cannot appear in a station name, so it is a safe composite-key separator. */
function routeKey(route: RouteKey): string {
  return `${route.originName}\u0000${route.destName}`
}

/**
 * Every barhal route is listed, whether or not it saw activity in the filtered range. Routes present
 * only in the query result (e.g. a Koli whose route no longer appears in the source sheet) are kept
 * as well, so this is a union rather than a lookup over masterRoutes.
 */
export function densifyPerRute(rows: RecapPerRuteRow[], masterRoutes: RouteKey[]): RecapPerRuteRow[] {
  const byRoute = new Map(rows.map((row) => [routeKey(row), row]))
  for (const route of masterRoutes) {
    const key = routeKey(route)
    if (!byRoute.has(key)) {
      byRoute.set(key, { originName: route.originName, destName: route.destName, ...emptyRecapMetrics() })
    }
  }
  return Array.from(byRoute.values()).sort(
    (a, b) => a.originName.localeCompare(b.originName) || a.destName.localeCompare(b.destName),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend test -- barhal-recap.builder`
Expected: PASS — 23 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal-recap.builder.ts apps/backend/src/modules/barhal/barhal-recap.builder.spec.ts
git commit -m "feat(barhal): fill every barhal route in the per-rute recap"
```

---

### Task 4: Rework the dashboard SQL and delegate mapping to the builder

Replaces `attached_to` with `awb_count`, widens both `groups` CTEs so dates/routes that have TOs but no Koli keep their real numbers, flips the per-tanggal order to ascending, and drops the now-duplicated local `toRecapItem`.

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts:454-566`
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts:259-316`

**Interfaces:**
- Consumes: `toRecapMetrics`, `RecapAggregateRow` from Task 1.
- Produces: `getDashboard()` still returns the same response shape; `dataSource.query` call order is unchanged at kpi → recapPerTanggal → recapPerRute → recapBatangKayu.

- [ ] **Step 1: Update the existing tests and add the failing SQL-shape test**

In `apps/backend/src/modules/barhal/barhal.service.spec.ts`, replace the whole `describe('getDashboard', ...)` block (currently lines 259-316) with:

```ts
  describe('getDashboard', () => {
    it('returns TO-POV kpi/chartByDate/recapBatangKayu/recapPerTanggal/recapPerRute', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 2, total_to: 3, weight_before: 30, weight_increase: 6, batang_kayu: 10 }]) // kpi
        .mockResolvedValueOnce([
          { date: '2026-06-01', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerTanggal
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 1, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerRute
        .mockResolvedValueOnce([
          { date: '2026-06-01', totalKoli: 2, totalP: 100, totalL: 80, totalT: 60, totalVolume: 80, totalBatangKayu: 10 },
        ]) // recapBatangKayu

      const result = await service.getDashboard({})

      expect(result.kpi).toEqual({
        totalKoli: 2,
        totalTo: 3,
        totalWeightBefore: 30,
        totalWeightAfter: 36,
        totalVariance: 6,
        totalBatangKayu: 10,
      })
      expect(result.chartByDate).toEqual([{ date: '2026-06-01', weightBefore: 30, weightAfter: 36, chwt: 25 }])
      expect(result.recapPerTanggal[0]).toMatchObject({
        date: '2026-06-01',
        totalTo: 3,
        totalKoli: 2,
        weightBefore: 30,
        weightAfter: 36,
        chwt: 25,
        variance: 6,
        addRevenue: 500,
        status: 'completed',
      })
      expect(result.recapPerTanggal[0].variancePercent).toBeCloseTo(20)
      expect(result.recapPerRute[0]).toMatchObject({
        originName: 'Kosambi',
        destName: 'Badung',
        status: 'incomplete',
      })
      expect(result.recapBatangKayu).toEqual([
        { date: '2026-06-01', totalKoli: 2, totalP: 100, totalL: 80, totalT: 60, totalVolume: 80, totalBatangKayu: 10 },
      ])
    })

    it('reports variancePercent as 0 when weightBefore is 0 (no division by zero)', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([{ date: '2026-06-01', total_to: 0, awb_count: 0, total_koli: 0, weight_before: 0, chwt: 0, missing_chwt: 0, weight_increase: 0, add_revenue: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal[0].variancePercent).toBe(0)
    })

    it('keeps a date completed even when barhal TOs there are still unpacked', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 10, weight_before: 30, weight_increase: 6, batang_kayu: 0 }])
        .mockResolvedValueOnce([{ date: '2026-06-01', total_to: 10, awb_count: 2, total_koli: 1, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal[0].status).toBe('completed')
    })

    it('groups per tanggal over TO dates unioned with Koli dates, ascending, keyed on awb_count', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDashboard({})

      const perTanggalSql: string = dataSource.query.mock.calls[1][0]
      expect(perTanggalSql).toContain('SELECT to_date AS koli_date FROM scoped')
      expect(perTanggalSql).toContain('UNION')
      expect(perTanggalSql).toContain('AS awb_count')
      expect(perTanggalSql).toContain('ORDER BY g.koli_date ASC')
      expect(perTanggalSql).not.toContain('attached_to')
    })

    it('groups per rute over TO routes unioned with Koli routes, keyed on awb_count', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDashboard({})

      const perRuteSql: string = dataSource.query.mock.calls[2][0]
      expect(perRuteSql).toContain('SELECT origin_name, dest_name FROM scoped')
      expect(perRuteSql).toContain('UNION')
      expect(perRuteSql).toContain('AS awb_count')
      expect(perRuteSql).not.toContain('attached_to')
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend test -- barhal.service`
Expected: FAIL — the two SQL-shape tests fail on `Expected substring: "AS awb_count"`, and `keeps a date completed…` fails because the old rule sees `total_to (10) !== attached_to (undefined)`

- [ ] **Step 3: Import the builder and delete the local mapper**

In `apps/backend/src/modules/barhal/barhal.service.ts`, add after the existing `buildBarhalCsv` import (line 16):

```ts
import { toRecapMetrics, RecapAggregateRow } from './barhal-recap.builder'
```

Then delete the whole local `toRecapItem` constant (currently lines 499-514).

- [ ] **Step 4: Rework the per-tanggal query**

Replace the `perTanggalRows` declaration and query (currently lines 454-497) with:

```ts
    const perTanggalRows: (RecapAggregateRow & { date: string })[] = await this.dataSource.query(
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
```

- [ ] **Step 5: Rework the per-rute query**

Replace the `perRuteRows` declaration and query (currently lines 519-564) with:

```ts
    const perRuteRows: (RecapAggregateRow & { originName: string; destName: string })[] = await this.dataSource.query(
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
```

- [ ] **Step 6: Point the mappers at the builder**

Replace the `recapPerTanggal` / `chartByDate` lines (currently lines 516-517) with:

```ts
    const recapPerTanggal = perTanggalRows.map((row) => ({ date: row.date, ...toRecapMetrics(row) }))
    const chartByDate = recapPerTanggal.map((r) => ({ date: r.date, weightBefore: r.weightBefore, weightAfter: r.weightAfter, chwt: r.chwt }))
```

and the `recapPerRute` line (currently line 566) with:

```ts
    const recapPerRute = perRuteRows.map((row) => ({ originName: row.originName, destName: row.destName, ...toRecapMetrics(row) }))
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter backend test -- barhal`
Expected: PASS — both suites green, `barhal.service` at 25 tests

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "refactor(barhal): base recap status on packed AWB chWt only"
```

---

### Task 5: Fill every date in the range, guarded at 366 days

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts` (`getDashboard`)
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts` (`describe('getDashboard')`)

**Interfaces:**
- Consumes: `densifyPerTanggal`, `daysInRange`, `MAX_RECAP_DAYS` from Task 2.
- Produces: `getDashboard()` throws `BadRequestException` for ranges over 366 dates; `recapPerTanggal` is dense when both dates are given, sparse otherwise; `chartByDate` stays sparse.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('getDashboard', ...)` in `apps/backend/src/modules/barhal/barhal.service.spec.ts`:

```ts
    it('returns one row per calendar date when a full range is given', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([
          { date: '2026-06-02', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({ startDate: '2026-06-01', endDate: '2026-06-04' })

      expect(result.recapPerTanggal.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'])
      expect(result.recapPerTanggal[0]).toMatchObject({ totalTo: 0, totalKoli: 0, status: 'incomplete' })
      expect(result.recapPerTanggal[1]).toMatchObject({ totalTo: 1, status: 'completed' })
    })

    it('leaves recapPerTanggal sparse when no range is given', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([
          { date: '2026-06-02', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal.map((r) => r.date)).toEqual(['2026-06-02'])
    })

    it('keeps chartByDate on dates that have data, not the filled-in ones', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([
          { date: '2026-06-02', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({ startDate: '2026-06-01', endDate: '2026-06-04' })
      expect(result.chartByDate).toEqual([{ date: '2026-06-02', weightBefore: 10, weightAfter: 12, chwt: 9 }])
    })

    it('rejects a range longer than 366 dates without running any query', async () => {
      await expect(service.getDashboard({ startDate: '2024-01-01', endDate: '2025-01-01' })).rejects.toThrow(
        'Date range must not exceed 366 days',
      )
      expect(dataSource.query).not.toHaveBeenCalled()
    })

    it('accepts a full leap year', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({ startDate: '2024-01-01', endDate: '2024-12-31' })
      expect(result.recapPerTanggal).toHaveLength(366)
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter backend test -- barhal.service`
Expected: FAIL — `returns one row per calendar date…` gets `['2026-06-02']`, and `rejects a range longer than 366 dates…` resolves instead of throwing

- [ ] **Step 3: Extend the builder import**

In `apps/backend/src/modules/barhal/barhal.service.ts`, change the Task 4 import to:

```ts
import {
  toRecapMetrics,
  densifyPerTanggal,
  daysInRange,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
} from './barhal-recap.builder'
```

- [ ] **Step 4: Add the range guard**

Insert as the first statements inside `getDashboard(dto)`, above the existing `const params: unknown[] = []`:

```ts
    const hasRange = Boolean(dto.startDate && dto.endDate)
    if (hasRange && daysInRange(dto.startDate!, dto.endDate!) > MAX_RECAP_DAYS) {
      throw new BadRequestException(`Date range must not exceed ${MAX_RECAP_DAYS} days`)
    }
```

`BadRequestException` is already imported at line 1.

- [ ] **Step 5: Fill the dates after building the chart**

Replace the two lines added in Task 4 Step 6 for `recapPerTanggal` / `chartByDate` with:

```ts
    const perTanggalSparse = perTanggalRows.map((row) => ({ date: row.date, ...toRecapMetrics(row) }))
    // Built from the sparse rows on purpose: a filled-in future date would drag the chart down to 0.
    const chartByDate = perTanggalSparse.map((r) => ({ date: r.date, weightBefore: r.weightBefore, weightAfter: r.weightAfter, chwt: r.chwt }))
    const recapPerTanggal = hasRange
      ? densifyPerTanggal(perTanggalSparse, dto.startDate!, dto.endDate!)
      : perTanggalSparse
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter backend test -- barhal`
Expected: PASS — `barhal.service` at 30 tests

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): show every date of the filtered range in the recap"
```

---

### Task 6: Fetch the master route list and fill every route

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts` (`getDashboard`)
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts` (`describe('getDashboard')`)

**Interfaces:**
- Consumes: `densifyPerRute`, `RouteKey` from Task 3.
- Produces: `dataSource.query` call order becomes kpi → recapPerTanggal → recapPerRute → **masterRoutes** → recapBatangKayu. Every mock in `describe('getDashboard')` needs a 4th `mockResolvedValueOnce` inserted for masterRoutes.

- [ ] **Step 1: Insert the masterRoutes mock into every existing getDashboard test**

In `apps/backend/src/modules/barhal/barhal.service.spec.ts`, every test in `describe('getDashboard')` currently chains exactly four `mockResolvedValueOnce` calls (kpi, perTanggal, perRute, batangKayu). Insert one extra `.mockResolvedValueOnce([])` between the 3rd and 4th in each of them — that new 4th entry is the master route list, and `[]` keeps every existing expectation unchanged.

The `returns TO-POV kpi/...` test becomes:

```ts
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 2, total_to: 3, weight_before: 30, weight_increase: 6, batang_kayu: 10 }]) // kpi
        .mockResolvedValueOnce([
          { date: '2026-06-01', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 0, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerTanggal
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung', total_to: 3, awb_count: 2, total_koli: 2, weight_before: 30, chwt: 25, missing_chwt: 1, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerRute
        .mockResolvedValueOnce([]) // masterRoutes
        .mockResolvedValueOnce([
          { date: '2026-06-01', totalKoli: 2, totalP: 100, totalL: 80, totalT: 60, totalVolume: 80, totalBatangKayu: 10 },
        ]) // recapBatangKayu
```

- [ ] **Step 2: Add the failing tests**

Append inside `describe('getDashboard', ...)`:

```ts
    it('lists every barhal route, zero-filling the ones with no activity in range', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 1, total_to: 1, weight_before: 10, weight_increase: 2, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung', total_to: 1, awb_count: 1, total_koli: 1, weight_before: 10, chwt: 9, missing_chwt: 0, weight_increase: 2, add_revenue: 0 },
        ])
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung' },
          { originName: 'Kosambi', destName: 'Makassar' },
        ])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})

      expect(result.recapPerRute.map((r) => `${r.originName}-${r.destName}`)).toEqual([
        'Kosambi-Badung',
        'Kosambi-Makassar',
      ])
      expect(result.recapPerRute[0]).toMatchObject({ totalKoli: 1, status: 'completed' })
      expect(result.recapPerRute[1]).toMatchObject({ totalTo: 0, totalKoli: 0, chwt: 0, status: 'incomplete' })
    })

    it('queries master routes across all barhal TOs, unfiltered by date but narrowed by origin/dest', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 0, total_to: 0, weight_before: 0, weight_increase: 0, batang_kayu: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDashboard({ startDate: '2026-06-01', endDate: '2026-06-02', origin: 'Kosambi', dest: 'Badung' })

      const [sql, sqlParams] = dataSource.query.mock.calls[3]
      expect(sql).toContain('FROM air_shipments_compileaircgk e')
      expect(sql).toContain("e.remarks ILIKE '%barhal%'")
      expect(sql).not.toContain('completed_date BETWEEN')
      expect(sqlParams).toEqual(['Kosambi', 'Badung'])
    })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter backend test -- barhal.service`
Expected: FAIL — `lists every barhal route…` returns only `['Kosambi-Badung']`, and `dataSource.query.mock.calls[3]` is the batang-kayu SQL

- [ ] **Step 4: Extend the builder import**

In `apps/backend/src/modules/barhal/barhal.service.ts`, change the import to:

```ts
import {
  toRecapMetrics,
  densifyPerTanggal,
  densifyPerRute,
  daysInRange,
  MAX_RECAP_DAYS,
  RecapAggregateRow,
  RouteKey,
} from './barhal-recap.builder'
```

- [ ] **Step 5: Add the master-routes query**

Insert directly after the `perRuteRows` query and before the `recapBatangKayu` query:

```ts
    // Deliberately not date-filtered: the route list must stay the same from month to month, so a
    // route with no shipments in the selected range still shows up as an all-zero incomplete row.
    const routeParams: unknown[] = []
    const routeConditions: string[] = [
      `e.remarks ILIKE '%barhal%'`,
      `e.to_number IS NOT NULL`,
      `e.completed_date IS NOT NULL`,
      `e.origin_station IS NOT NULL`,
      `e.origin_station != ''`,
      `e.dest_station IS NOT NULL`,
      `e.dest_station != ''`,
    ]
    if (dto.origin) {
      routeParams.push(dto.origin)
      routeConditions.push(`${this.normalizedStationSql('e.origin_station')} = $${routeParams.length}`)
    }
    if (dto.dest) {
      routeParams.push(dto.dest)
      routeConditions.push(`${this.normalizedStationSql('e.dest_station')} = $${routeParams.length}`)
    }

    const masterRoutes: RouteKey[] = await this.dataSource.query(
      `
      SELECT DISTINCT
        ${this.normalizedStationSql('e.origin_station')} AS "originName",
        ${this.normalizedStationSql('e.dest_station')}   AS "destName"
      FROM air_shipments_compileaircgk e
      WHERE ${routeConditions.join(' AND ')}
      ORDER BY 1, 2
      `,
      routeParams,
    )
```

- [ ] **Step 6: Fill the routes**

Replace the `recapPerRute` line from Task 4 Step 6 with:

```ts
    const recapPerRute = densifyPerRute(
      perRuteRows.map((row) => ({ originName: row.originName, destName: row.destName, ...toRecapMetrics(row) })),
      masterRoutes,
    )
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter backend test -- barhal`
Expected: PASS — `barhal.service` at 32 tests

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): list every barhal route in the per-rute recap"
```

---

### Task 7: Default the dashboard filter to the current month

**Files:**
- Create: `apps/frontend/src/features/barhal/utils/monthRange.ts`
- Create: `apps/frontend/src/features/barhal/utils/monthRange.spec.ts`
- Modify: `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx:18-19`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `currentMonthRange(now?: Date): { start: string; end: string }` — both `YYYY-MM-DD`, built from the local calendar month.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/barhal/utils/monthRange.spec.ts`:

```ts
import { currentMonthRange } from './monthRange'

describe('currentMonthRange', () => {
  it('spans the first to the last day of a 31-day month', () => {
    expect(currentMonthRange(new Date(2026, 7, 3))).toEqual({ start: '2026-08-01', end: '2026-08-31' })
  })

  it('spans the first to the last day of a 30-day month', () => {
    expect(currentMonthRange(new Date(2026, 3, 15))).toEqual({ start: '2026-04-01', end: '2026-04-30' })
  })

  it('handles February in a leap year', () => {
    expect(currentMonthRange(new Date(2024, 1, 10))).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('handles February in a non-leap year', () => {
    expect(currentMonthRange(new Date(2026, 1, 10))).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('zero-pads single-digit months', () => {
    expect(currentMonthRange(new Date(2026, 0, 1))).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest monthRange`
Expected: FAIL — `Cannot find module './monthRange'`

- [ ] **Step 3: Write minimal implementation**

Create `apps/frontend/src/features/barhal/utils/monthRange.ts`:

```ts
/**
 * Default filter range for the Barhal dashboard. Rekap Per Tanggal renders one row per calendar
 * date in the range, so the dashboard opens on a whole month rather than an unbounded range.
 */
export function currentMonthRange(now: Date = new Date()): { start: string; end: string } {
  const year = now.getFullYear()
  const month = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest monthRange`
Expected: PASS — 5 tests

- [ ] **Step 5: Wire it into the dashboard page**

In `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx`, add to the imports:

```ts
import { currentMonthRange } from '@/features/barhal/utils/monthRange'
```

Then replace lines 18-19:

```ts
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
```

with:

```ts
  // Lazy initializer, and BarhalDashboardPage renders null while auth is loading, so this never
  // runs during SSR and cannot cause a hydration mismatch.
  const [defaultRange] = useState(currentMonthRange)
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
```

- [ ] **Step 6: Verify types and lint**

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/barhal/utils/monthRange.ts apps/frontend/src/features/barhal/utils/monthRange.spec.ts "apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx"
git commit -m "feat(barhal): default the dashboard filter to the current month"
```

---

### Task 8: Mute zero rows in the recap table

With a full month on screen most rows are zeroes, so the rows that carry data need to stand out.

**Files:**
- Modify: `apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx:50-51`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Apply the change**

In `apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx`, replace:

```tsx
            withKeys.map((row) => (
              <tr key={row.key} className="hover:bg-accent/30">
```

with:

```tsx
            withKeys.map((row) => (
              <tr
                key={row.key}
                className={`hover:bg-accent/30 ${
                  row.totalTo === 0 && row.totalKoli === 0 ? 'text-muted-foreground' : ''
                }`}
              >
```

- [ ] **Step 2: Verify types**

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the whole backend suite once more**

Run: `pnpm --filter backend test -- barhal`
Expected: PASS — both barhal suites green

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx
git commit -m "feat(barhal): mute empty rows in the recap table"
```

---

## Manual verification

After Task 8, with the backend and frontend running (`pnpm dev`):

1. Open `/barhal/dashboard`. The two date inputs are prefilled with the first and last day of the current month.
2. **Rekap Per Tanggal** lists every date of that month, ascending, including dates later in the month, each zero + Incomplete.
3. A date whose Koli have all their chWt filled reads Completed even if other barhal TOs on that date are still unpacked.
4. **Rekap Per Rute** lists every barhal route, including routes with no shipments that month (zero + Incomplete).
5. Picking an Origin narrows the route list to that origin.
6. The weight chart still only plots dates that have data.
7. Widening the range past 366 days surfaces the backend's `Date range must not exceed 366 days` error rather than a giant table.

## Out of scope

Per the spec: the cross-date chWt double count for one AWB, a dedicated month picker, pagination for the recap tables, `exportCsv` changes, and per-Koli status breakdown inside one AWB.
