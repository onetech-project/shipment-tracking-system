# PnL Daily Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Daily Report" tab to the P&L page showing two pivot tables — Revenue and Profit Margin — with date rows and destination columns grouped by origin (CGK / SUB), mirroring the manual spreadsheet.

**Architecture:** One new read-only endpoint, `GET /pnl/breakdown/daily-matrix`, aggregates the existing `v_pnl_to` materialized view by `(date, origin_station, dest_station)` and returns a fully-shaped matrix including footer rows. The frontend renders it with a generic presentational table component used twice. All arithmetic lives in the backend service so the numbers have a single testable source of truth.

**Tech Stack:** NestJS + TypeORM raw SQL (PostgreSQL) on the backend; Next.js App Router + React + TanStack Query + Tailwind on the frontend; Jest (ts-jest) on both sides.

**Spec:** `docs/superpowers/specs/2026-08-08-pnl-daily-matrix-design.md`

**Branch:** `feature/pnl-daily-matrix` (already created from `development`; the spec commit is already on it).

## Global Constraints

- No database migration. `v_pnl_to` is used exactly as it exists today.
- Margin is always `revenue_total − revenue_discount − cost_to`, identical to `getSummary` and `getProfitByRoute`, so column totals reconcile with the KPI cards.
- Date filtering must go through the existing `buildFilter()` in `apps/backend/src/modules/pnl/pnl-filter.util.ts` so cycle/range mode and date basis behave identically to the rest of the module.
- Dates crossing the SQL boundary are strings in `YYYY-MM-DD` form, produced by `TO_CHAR(... , 'YYYY-MM-DD')`. Never a bare `::DATE`, because the `pg` driver converts `DATE` columns into JavaScript `Date` objects.
- Division by zero yields `null`, never `Infinity` or `NaN`.
- Origin labels: `Jabo` displays as `CGK`, `Surabaya` displays as `SUB`. Any other origin value displays as itself.
- Run Jest with `NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`. The default worker count exhausts memory on this machine, and `--runInBand` alone still aborts with "FATAL ERROR: Ineffective mark-compacts near heap limit" — the heap bump is required too. The per-step commands below omit it; prefer this form.
- Every task ends with a commit. Do not push.

---

### Task 1: Calendar date list for a filter

The matrix needs one row per calendar day in the period, including days with no shipments, so `Avg / Day = Total ÷ periodDays` stays consistent. `calendarDaysForFilter` already returns the *count*; this task adds the list of dates and redefines the count in terms of it, so period length has one source of truth.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl-filter.util.ts:52-75`
- Test: `apps/backend/src/modules/pnl/pnl-filter.util.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `calendarDatesForFilter(cyclePeriod?: string, startDate?: string, endDate?: string): string[]` — dates in `YYYY-MM-DD`, ascending. `calendarDaysForFilter` keeps its existing signature `(cyclePeriod?: string, startDate?: string, endDate?: string): number`.

**Behavior change to be aware of:** today `calendarDaysForFilter` returns `15` for a malformed cycle string. After this task it returns `1`, because the date list is empty. This is deliberate — a malformed cycle should not silently borrow a 15-day divisor — and is covered by a test below. The only caller affected is `getProfitByRoute`, which cannot receive a malformed cycle from the UI.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/pnl/pnl-filter.util.spec.ts`:

```ts
import { calendarDatesForFilter, calendarDaysForFilter } from './pnl-filter.util'

describe('calendarDatesForFilter', () => {
  it('returns days 1-15 for a 1H cycle', () => {
    const dates = calendarDatesForFilter('2026-07-1H')
    expect(dates).toHaveLength(15)
    expect(dates[0]).toBe('2026-07-01')
    expect(dates[14]).toBe('2026-07-15')
  })

  it('returns day 16 to month end for a 2H cycle in a 31-day month', () => {
    const dates = calendarDatesForFilter('2026-07-2H')
    expect(dates).toHaveLength(16)
    expect(dates[0]).toBe('2026-07-16')
    expect(dates[15]).toBe('2026-07-31')
  })

  it('returns day 16 to month end for a 2H cycle in a 30-day month', () => {
    const dates = calendarDatesForFilter('2026-06-2H')
    expect(dates).toHaveLength(15)
    expect(dates[14]).toBe('2026-06-30')
  })

  it('handles February in a non-leap year', () => {
    const dates = calendarDatesForFilter('2026-02-2H')
    expect(dates).toHaveLength(13)
    expect(dates[12]).toBe('2026-02-28')
  })

  it('handles February in a leap year', () => {
    const dates = calendarDatesForFilter('2028-02-2H')
    expect(dates).toHaveLength(14)
    expect(dates[13]).toBe('2028-02-29')
  })

  it('returns every date in a range, inclusive of both ends', () => {
    const dates = calendarDatesForFilter(undefined, '2026-07-30', '2026-08-02')
    expect(dates).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'])
  })

  it('returns a single date when start equals end', () => {
    expect(calendarDatesForFilter(undefined, '2026-07-05', '2026-07-05')).toEqual(['2026-07-05'])
  })

  it('returns empty for an end before the start', () => {
    expect(calendarDatesForFilter(undefined, '2026-07-05', '2026-07-01')).toEqual([])
  })

  it('returns empty when neither cycle nor range is given', () => {
    expect(calendarDatesForFilter()).toEqual([])
  })

  it('returns empty for a malformed cycle string', () => {
    expect(calendarDatesForFilter('not-a-cycle')).toEqual([])
  })
})

describe('calendarDaysForFilter', () => {
  it('counts the dates a 1H cycle spans', () => {
    expect(calendarDaysForFilter('2026-07-1H')).toBe(15)
  })

  it('counts the dates a 2H cycle spans', () => {
    expect(calendarDaysForFilter('2026-07-2H')).toBe(16)
  })

  it('counts the dates a range spans', () => {
    expect(calendarDaysForFilter(undefined, '2026-07-01', '2026-07-10')).toBe(10)
  })

  it('never returns zero, so it is safe as a divisor', () => {
    expect(calendarDaysForFilter()).toBe(1)
    expect(calendarDaysForFilter('not-a-cycle')).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter backend exec jest pnl-filter.util --runInBand`
Expected: FAIL — `calendarDatesForFilter is not a function` (the export does not exist yet).

- [ ] **Step 3: Write the implementation**

In `apps/backend/src/modules/pnl/pnl-filter.util.ts`, replace the entire `calendarDaysForFilter` function (currently lines 52-75, from the `// Number of calendar days...` comment to the closing brace) with:

```ts
// The calendar dates a filter spans, ascending, as YYYY-MM-DD. Days with no shipments are still
// listed: the daily matrix renders one row per calendar day so "per day" averages stay consistent.
// UTC arithmetic throughout, so the result does not shift with the server timezone.
export function calendarDatesForFilter(
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
): string[] {
  if (cyclePeriod) {
    // YYYY-MM-1H = days 1–15; YYYY-MM-2H = day 16 through month end.
    const m = /^(\d{4})-(\d{2})-(1H|2H)$/.exec(cyclePeriod)
    if (!m) return []
    const [, year, month, half] = m
    const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
    const from = half === '1H' ? 1 : 16
    const to = half === '1H' ? 15 : lastDay
    const dates: string[] = []
    for (let day = from; day <= to; day++) {
      dates.push(`${year}-${month}-${String(day).padStart(2, '0')}`)
    }
    return dates
  }

  if (startDate && endDate) {
    const cursor = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return []
    const dates: string[] = []
    while (cursor.getTime() <= end.getTime()) {
      dates.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return dates
  }

  return []
}

// Number of calendar days the filter spans. Used as denominator for "per day" averages, so it
// never returns zero. Derived from calendarDatesForFilter to keep one definition of the period.
export function calendarDaysForFilter(
  cyclePeriod?: string,
  startDate?: string,
  endDate?: string,
): number {
  return Math.max(1, calendarDatesForFilter(cyclePeriod, startDate, endDate).length)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backend exec jest pnl-filter.util --runInBand`
Expected: PASS — 14 tests passed.

- [ ] **Step 5: Verify no existing test regressed**

Run: `pnpm --filter backend exec jest pnl --runInBand`
Expected: PASS — all existing `pnl.service.spec.ts` and `pnl.controller.spec.ts` tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl-filter.util.ts apps/backend/src/modules/pnl/pnl-filter.util.spec.ts
git commit -m "feat(pnl): add calendarDatesForFilter for calendar-complete rows"
```

---

### Task 2: `getDailyMatrix` service method

Aggregates `v_pnl_to` into the matrix and computes every footer value.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` (add types near the other exported interfaces around line 129; add the method after `getProfitByRoute`, which ends at line 705)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `calendarDatesForFilter(cyclePeriod?, startDate?, endDate?): string[]` from Task 1; `buildFilter(basis, cyclePeriod, startDate, endDate, alias?)` which returns `{ where, params, cycleCol, dateCol }`.
- Produces: `PnlService.getDailyMatrix(cyclePeriod?: string, startDate?: string, endDate?: string, basis?: string): Promise<PnlDailyMatrix>` and the exported interfaces `PnlDailyMatrixColumn`, `PnlDailyMatrixCell`, `PnlDailyMatrixRow`, `PnlDailyMatrixFooter`, `PnlDailyMatrix` shown in Step 3.

**Query order matters for the tests:** the two queries run inside a single `Promise.all` with the columns query first, so `mockResolvedValueOnce` calls line up as columns-then-facts.

- [ ] **Step 1: Write the failing test**

Append this `describe` block inside the top-level `describe('PnlService', ...)` in `apps/backend/src/modules/pnl/pnl.service.spec.ts`, just before its closing `})`:

```ts
  describe('getDailyMatrix', () => {
    // Two Jabo destinations and one Surabaya destination; facts cover only some (date, route) pairs.
    const columnRows = [
      { origin_station: 'Jabo', dest_station: 'Aceh' },
      { origin_station: 'Jabo', dest_station: 'Ambon' },
      { origin_station: 'Surabaya', dest_station: 'Pontianak' },
    ]

    function mockQueries(factRows: Record<string, string>[]) {
      dataSource.query
        .mockResolvedValueOnce(columnRows)
        .mockResolvedValueOnce(factRows)
    }

    it('labels Jabo as CGK and Surabaya as SUB, preserving query order', async () => {
      mockQueries([])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.columns).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Ambon' },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
      ])
    })

    it('emits one row per calendar day, including days with no shipments', async () => {
      mockQueries([])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows).toHaveLength(15)
      expect(result.periodDays).toBe(15)
      expect(result.rows[0].date).toBe('2026-07-01')
      expect(result.rows[14].date).toBe('2026-07-15')
      expect(result.rows[0].cells).toEqual([null, null, null])
    })

    it('places each fact in the cell matching its column index', async () => {
      mockQueries([
        { d: '2026-07-02', origin_station: 'Surabaya', dest_station: 'Pontianak',
          revenue: '300', margin: '30', weight: '3', incomplete_tos: '0' },
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Ambon',
          revenue: '200', margin: '20', weight: '2', incomplete_tos: '1' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')

      expect(result.rows[0].cells[0]).toBeNull()
      expect(result.rows[0].cells[1]).toEqual({ revenue: 200, margin: 20, weight: 2, incompleteTos: 1 })
      expect(result.rows[0].cells[2]).toBeNull()
      expect(result.rows[1].cells[2]).toEqual({ revenue: 300, margin: 30, weight: 3, incompleteTos: 0 })
    })

    it('distinguishes a zero-valued cell from an absent one', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '0', margin: '0', weight: '0', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows[0].cells[0]).toEqual({ revenue: 0, margin: 0, weight: 0, incompleteTos: 0 })
      expect(result.rows[0].cells[1]).toBeNull()
    })

    it('computes footer totals, averages, margin pct and space per kg per column', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '600', margin: '60', weight: '10', incomplete_tos: '1' },
        { d: '2026-07-02', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '400', margin: '40', weight: '10', incomplete_tos: '2' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')

      expect(result.footer[0]).toEqual({
        totalRevenue: 1000,
        totalMargin: 100,
        totalWeight: 20,
        avgRevenuePerDay: 1000 / 15,
        avgMarginPerDay: 100 / 15,
        marginPct: 10,      // 100 / 1000 × 100
        spacePerKg: 5,      // 100 / 20
        incompleteTos: 3,
      })
    })

    it('returns null rather than Infinity or NaN when a divisor is zero', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '0', margin: '-50', weight: '0', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.footer[0].marginPct).toBeNull()
      expect(result.footer[0].spacePerKg).toBeNull()
      expect(result.footer[0].totalMargin).toBe(-50)
    })

    it('keeps a column with no data at all, with zeroed footer', async () => {
      mockQueries([])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.footer).toHaveLength(3)
      expect(result.footer[2]).toEqual({
        totalRevenue: 0, totalMargin: 0, totalWeight: 0,
        avgRevenuePerDay: 0, avgMarginPerDay: 0,
        marginPct: null, spacePerKg: null, incompleteTos: 0,
      })
    })

    it('ignores a fact whose route is not among the columns', async () => {
      mockQueries([
        { d: '2026-07-01', origin_station: 'Jabo', dest_station: 'Nowhere',
          revenue: '999', margin: '999', weight: '9', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows[0].cells).toEqual([null, null, null])
      expect(result.footer[0].totalRevenue).toBe(0)
    })

    it('ignores a fact whose date falls outside the calendar rows', async () => {
      mockQueries([
        { d: '2026-07-20', origin_station: 'Jabo', dest_station: 'Aceh',
          revenue: '999', margin: '999', weight: '9', incomplete_tos: '0' },
      ])
      const result = await service.getDailyMatrix('2026-07-1H')
      expect(result.rows.every((r) => r.cells.every((c) => c === null))).toBe(true)
    })

    it('selects the date as text and filters on the chosen basis in range mode', async () => {
      mockQueries([])
      await service.getDailyMatrix(undefined, '2026-07-01', '2026-07-03', 'atd_origin')

      const [factSql, factParams] = dataSource.query.mock.calls[1]
      expect(factSql).toContain("TO_CHAR(date_atd::DATE, 'YYYY-MM-DD')")
      expect(factSql).toContain('cost_to IS NULL')
      expect(factParams).toEqual(['2026-07-01', '2026-07-03'])
    })

    it('reads the column list independently of the period filter', async () => {
      mockQueries([])
      await service.getDailyMatrix('2026-07-1H')

      const [columnSql, columnParams] = dataSource.query.mock.calls[0]
      expect(columnSql).toContain('SELECT DISTINCT origin_station, dest_station')
      expect(columnParams).toBeUndefined()
    })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter backend exec jest pnl.service --runInBand -t "getDailyMatrix"`
Expected: FAIL — `service.getDailyMatrix is not a function`.

- [ ] **Step 3: Add the types**

In `apps/backend/src/modules/pnl/pnl.service.ts`, insert after the `PnlProfitByRouteItem` interface (which ends at line 137, just before `@Injectable()`):

```ts
export interface PnlDailyMatrixColumn {
  origin: string // raw v_pnl_to value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}

export interface PnlDailyMatrixCell {
  revenue: number
  margin: number
  weight: number
  incompleteTos: number // TOs whose cost could not be computed; margin here is optimistic
}

export interface PnlDailyMatrixRow {
  date: string // YYYY-MM-DD
  cells: (PnlDailyMatrixCell | null)[] // index-aligned with columns; null = no shipment at all
}

export interface PnlDailyMatrixFooter {
  totalRevenue: number
  totalMargin: number
  totalWeight: number
  avgRevenuePerDay: number
  avgMarginPerDay: number
  marginPct: number | null // null when totalRevenue is 0
  spacePerKg: number | null // null when totalWeight is 0
  incompleteTos: number
}

export interface PnlDailyMatrix {
  columns: PnlDailyMatrixColumn[]
  rows: PnlDailyMatrixRow[]
  footer: PnlDailyMatrixFooter[] // index-aligned with columns
  periodDays: number
}

// The spreadsheet this report mirrors labels origins by airport code. Unknown origins fall back
// to their raw value so a newly opened station is visible rather than silently blank.
const ORIGIN_LABELS: Record<string, string> = {
  Jabo: 'CGK',
  Surabaya: 'SUB',
}
```

- [ ] **Step 4: Add the import**

In the same file, extend the import block at lines 3-9 so it reads:

```ts
import {
  DateBasis,
  BASIS_COLS,
  resolveBasis,
  buildFilter,
  calendarDaysForFilter,
  calendarDatesForFilter,
} from './pnl-filter.util'
```

- [ ] **Step 5: Write the method**

Append inside the `PnlService` class, after `getProfitByRoute` (before the class's closing brace at line 706):

```ts
  // Daily pivot behind the "Daily Report" tab: one row per calendar day, one column per
  // origin→destination pair. Columns come from the whole view rather than the selected period so
  // the layout stays stable as the user moves between cycles. All footer arithmetic lives here so
  // the numbers have a single testable definition.
  async getDailyMatrix(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlDailyMatrix> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const dates = calendarDatesForFilter(cyclePeriod, startDate, endDate)
    const periodDays = Math.max(1, dates.length)

    const [columnRows, factRows] = await Promise.all([
      this.dataSource.query(`
        SELECT DISTINCT origin_station, dest_station
        FROM v_pnl_to
        WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
        ORDER BY 1, 2
      `),
      this.dataSource.query(
        `
        SELECT
          TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD')                                AS d,
          origin_station,
          dest_station,
          COALESCE(SUM(revenue_total), 0)                                        AS revenue,
          COALESCE(SUM(revenue_total), 0) - COALESCE(SUM(revenue_discount), 0)
            - COALESCE(SUM(cost_to), 0)                                          AS margin,
          COALESCE(SUM(gross_weight), 0)                                         AS weight,
          COUNT(*) FILTER (WHERE cost_to IS NULL)::int                           AS incomplete_tos
        FROM v_pnl_to
        WHERE ${where}
          AND ${dateCol} IS NOT NULL
        GROUP BY 1, 2, 3
        `,
        params,
      ),
    ])

    const columns: PnlDailyMatrixColumn[] = (columnRows as Record<string, string>[]).map((r) => ({
      origin: r.origin_station,
      originLabel: ORIGIN_LABELS[r.origin_station] ?? r.origin_station,
      dest: r.dest_station,
    }))
    const columnIndex = new Map(columns.map((c, i) => [`${c.origin}|${c.dest}`, i]))

    const rows: PnlDailyMatrixRow[] = dates.map((date) => ({
      date,
      cells: columns.map(() => null),
    }))
    const rowIndex = new Map(rows.map((r, i) => [r.date, i]))

    for (const fact of factRows as Record<string, string>[]) {
      const ci = columnIndex.get(`${fact.origin_station}|${fact.dest_station}`)
      const ri = rowIndex.get(fact.d)
      if (ci === undefined || ri === undefined) continue
      rows[ri].cells[ci] = {
        revenue: Number(fact.revenue),
        margin: Number(fact.margin),
        weight: Number(fact.weight),
        incompleteTos: Number(fact.incomplete_tos),
      }
    }

    const footer: PnlDailyMatrixFooter[] = columns.map((_, ci) => {
      let totalRevenue = 0
      let totalMargin = 0
      let totalWeight = 0
      let incompleteTos = 0
      for (const row of rows) {
        const cell = row.cells[ci]
        if (!cell) continue
        totalRevenue += cell.revenue
        totalMargin += cell.margin
        totalWeight += cell.weight
        incompleteTos += cell.incompleteTos
      }
      return {
        totalRevenue,
        totalMargin,
        totalWeight,
        avgRevenuePerDay: totalRevenue / periodDays,
        avgMarginPerDay: totalMargin / periodDays,
        marginPct: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null,
        spacePerKg: totalWeight > 0 ? totalMargin / totalWeight : null,
        incompleteTos,
      }
    })

    return { columns, rows, footer, periodDays }
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter backend exec jest pnl.service --runInBand`
Expected: PASS — the 11 new `getDailyMatrix` tests plus all pre-existing ones.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): add getDailyMatrix aggregation for the daily report"
```

---

### Task 3: Expose the endpoint

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts:136-144` (add a handler after `getProfitByRoute`)
- Test: `apps/backend/src/modules/pnl/pnl.controller.spec.ts:7-13` and a new `it` block

**Interfaces:**
- Consumes: `PnlService.getDailyMatrix(cyclePeriod?, startDate?, endDate?, basis?)` from Task 2.
- Produces: `GET /pnl/breakdown/daily-matrix?cycle=&start=&end=&basis=`, guarded by `JwtAuthGuard` and `Permission.READ_PNL` inherited from the controller-level decorators.

- [ ] **Step 1: Write the failing test**

In `apps/backend/src/modules/pnl/pnl.controller.spec.ts`, add `getDailyMatrix: jest.fn(),` to the `mockService` object so it becomes:

```ts
const mockService = {
  getCycles: jest.fn(),
  getSummary: jest.fn(),
  getTrend: jest.fn(),
  getAwbDrilldown: jest.fn(),
  getDataQuality: jest.fn(),
  getDailyMatrix: jest.fn(),
}
```

Then add this test before the closing `})` of the `describe('PnlController', ...)` block:

```ts
  it('getDailyMatrix forwards cycle, range and basis to the service', async () => {
    mockService.getDailyMatrix.mockResolvedValueOnce({ columns: [], rows: [], footer: [], periodDays: 15 })
    const result = await controller.getDailyMatrix('2026-07-1H', undefined, undefined, 'atd_origin')
    expect(mockService.getDailyMatrix).toHaveBeenCalledWith('2026-07-1H', undefined, undefined, 'atd_origin')
    expect(result.periodDays).toBe(15)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter backend exec jest pnl.controller --runInBand`
Expected: FAIL — `controller.getDailyMatrix is not a function`.

- [ ] **Step 3: Add the handler**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, append inside the class after `getProfitByRoute` (before the closing brace on line 145):

```ts

  @Get('breakdown/daily-matrix')
  getDailyMatrix(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getDailyMatrix(cycle, start, end, basis)
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backend exec jest pnl --runInBand`
Expected: PASS — all backend PnL tests.

- [ ] **Step 5: Verify the backend compiles**

Run: `pnpm --filter backend exec tsc --noEmit -p tsconfig.json`
Expected: no output (exit code 0).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.controller.ts apps/backend/src/modules/pnl/pnl.controller.spec.ts
git commit -m "feat(pnl): expose GET /pnl/breakdown/daily-matrix"
```

---

### Task 4: Frontend data layer and table projections

The two tables differ only in which number they show and which footer rows they carry. That difference lives in two pure functions here, so the table component in Task 5 can stay ignorant of revenue and margin.

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts` (add types after `PnlProfitByRouteItem`; add the hook at the end of the file)
- Create: `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`
- Test: `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts` (create)

**Interfaces:**
- Consumes: the JSON shape produced by Task 3 — `{ columns, rows, footer, periodDays }`.
- Produces:
  - Types `PnlDailyMatrixColumn`, `PnlDailyMatrixCell`, `PnlDailyMatrixRow`, `PnlDailyMatrixFooter`, `PnlDailyMatrix` exported from `hooks/usePnl.ts`.
  - `usePnlDailyMatrix(filter: PnlFilter | undefined)` from `hooks/usePnl.ts`.
  - From `utils/dailyMatrix.ts`: `toRevenueTable(matrix: PnlDailyMatrix): MatrixTableModel`, `toMarginTable(matrix: PnlDailyMatrix): MatrixTableModel`, `groupOrigins(columns: PnlDailyMatrixColumn[]): OriginGroup[]`, `formatDayLabel(iso: string): string`, and the types `MatrixTableModel`, `MatrixFooterRow`, `OriginGroup`.

- [ ] **Step 1: Add the frontend types**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, add after the `PnlProfitByRouteItem` interface (search for `PnlProfitByRouteItem` — it sits with the other exported interfaces near the top):

```ts
export interface PnlDailyMatrixColumn {
  origin: string
  originLabel: string
  dest: string
}

export interface PnlDailyMatrixCell {
  revenue: number
  margin: number
  weight: number
  incompleteTos: number
}

export interface PnlDailyMatrixRow {
  date: string
  cells: (PnlDailyMatrixCell | null)[]
}

export interface PnlDailyMatrixFooter {
  totalRevenue: number
  totalMargin: number
  totalWeight: number
  avgRevenuePerDay: number
  avgMarginPerDay: number
  marginPct: number | null
  spacePerKg: number | null
  incompleteTos: number
}

export interface PnlDailyMatrix {
  columns: PnlDailyMatrixColumn[]
  rows: PnlDailyMatrixRow[]
  footer: PnlDailyMatrixFooter[]
  periodDays: number
}
```

- [ ] **Step 2: Add the hook**

At the end of `apps/frontend/src/features/pnl/hooks/usePnl.ts`, after `usePnlProfitByRoute`:

```ts

export function usePnlDailyMatrix(filter: PnlFilter | undefined) {
  return useQuery<PnlDailyMatrix>({
    queryKey: ['pnl', 'daily-matrix', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/daily-matrix', { params: filterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 3: Write the failing test**

Create `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`:

```ts
import { PnlDailyMatrix } from '../hooks/usePnl'
import { formatDayLabel, groupOrigins, toMarginTable, toRevenueTable } from './dailyMatrix'

const matrix: PnlDailyMatrix = {
  columns: [
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Ambon' },
    { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
  ],
  rows: [
    {
      date: '2026-07-01',
      cells: [
        { revenue: 1000, margin: 100, weight: 10, incompleteTos: 0 },
        null,
        { revenue: 0, margin: -50, weight: 5, incompleteTos: 2 },
      ],
    },
    { date: '2026-07-02', cells: [null, null, null] },
  ],
  footer: [
    {
      totalRevenue: 1000, totalMargin: 100, totalWeight: 10,
      avgRevenuePerDay: 500, avgMarginPerDay: 50,
      marginPct: 10, spacePerKg: 10, incompleteTos: 0,
    },
    {
      totalRevenue: 0, totalMargin: 0, totalWeight: 0,
      avgRevenuePerDay: 0, avgMarginPerDay: 0,
      marginPct: null, spacePerKg: null, incompleteTos: 0,
    },
    {
      totalRevenue: 0, totalMargin: -50, totalWeight: 5,
      avgRevenuePerDay: 0, avgMarginPerDay: -25,
      marginPct: null, spacePerKg: -10, incompleteTos: 2,
    },
  ],
  periodDays: 2,
}

describe('groupOrigins', () => {
  it('collapses consecutive columns sharing an origin label into spans', () => {
    expect(groupOrigins(matrix.columns)).toEqual([
      { label: 'CGK', span: 2 },
      { label: 'SUB', span: 1 },
    ])
  })

  it('returns no groups for no columns', () => {
    expect(groupOrigins([])).toEqual([])
  })
})

describe('formatDayLabel', () => {
  it('renders a YYYY-MM-DD date as d-Mon-YYYY', () => {
    expect(formatDayLabel('2026-07-01')).toBe('1-Jul-2026')
    expect(formatDayLabel('2026-12-25')).toBe('25-Dec-2026')
  })
})

describe('toRevenueTable', () => {
  const model = toRevenueTable(matrix)

  it('takes revenue from each cell and null from absent cells', () => {
    expect(model.values).toEqual([
      [1000, null, 0],
      [null, null, null],
    ])
  })

  it('carries the dates and columns through unchanged', () => {
    expect(model.dates).toEqual(['2026-07-01', '2026-07-02'])
    expect(model.columns).toBe(matrix.columns)
  })

  it('has exactly the Total and Avg / Day footer rows', () => {
    expect(model.footerRows.map((r) => r.label)).toEqual(['Total', 'Avg / Day'])
    expect(model.footerRows[0].values).toEqual([1000, 0, 0])
    expect(model.footerRows[1].values).toEqual([500, 0, 0])
    expect(model.footerRows.every((r) => r.format === 'number')).toBe(true)
  })

  it('does not flag incomplete cost, which does not affect revenue', () => {
    expect(model.incompleteTos).toBeNull()
    expect(model.highlightNegative).toBe(false)
  })
})

describe('toMarginTable', () => {
  const model = toMarginTable(matrix)

  it('takes margin from each cell and null from absent cells', () => {
    expect(model.values).toEqual([
      [100, null, -50],
      [null, null, null],
    ])
  })

  it('has the five spreadsheet footer rows in order', () => {
    expect(model.footerRows.map((r) => r.label)).toEqual([
      'Total',
      'Avg / Day',
      '% Margin',
      'Total Tonase',
      'Space per Kg',
    ])
  })

  it('maps each footer row to the matching footer field', () => {
    const [total, avg, pct, tonase, space] = model.footerRows
    expect(total.values).toEqual([100, 0, -50])
    expect(avg.values).toEqual([50, 0, -25])
    expect(pct.values).toEqual([10, null, null])
    expect(tonase.values).toEqual([10, 0, 5])
    expect(space.values).toEqual([10, null, -10])
  })

  it('marks only the percent row as a percentage', () => {
    expect(model.footerRows.map((r) => r.format)).toEqual([
      'number', 'number', 'percent', 'number', 'number',
    ])
  })

  it('exposes per-cell incomplete-cost counts and highlights negatives', () => {
    expect(model.incompleteTos).toEqual([
      [0, 0, 2],
      [0, 0, 0],
    ])
    expect(model.highlightNegative).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter frontend exec jest dailyMatrix --runInBand`
Expected: FAIL — `Cannot find module './dailyMatrix'`.

- [ ] **Step 5: Write the implementation**

Create `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`:

```ts
import { PnlDailyMatrix, PnlDailyMatrixColumn } from '../hooks/usePnl'

export interface OriginGroup {
  label: string
  span: number
}

export interface MatrixFooterRow {
  label: string
  values: (number | null)[] // index-aligned with columns
  format: 'number' | 'percent'
}

// Everything PnlMatrixTable needs to render, with no knowledge of revenue or margin. Both tables
// project into this same shape so they share one renderer and stay visually identical.
export interface MatrixTableModel {
  columns: PnlDailyMatrixColumn[]
  dates: string[]
  values: (number | null)[][] // [rowIndex][columnIndex]; null = no shipment, distinct from 0
  incompleteTos: number[][] | null // null = cost completeness is irrelevant to this table
  footerRows: MatrixFooterRow[]
  highlightNegative: boolean
}

// Fixed English abbreviations rather than a locale format, so the header reads the same as the
// spreadsheet this report replaces regardless of where it is rendered.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${Number(day)}-${MONTHS[Number(month) - 1]}-${year}`
}

// Consecutive columns sharing an origin label become one spanning header cell (CGK, then SUB).
export function groupOrigins(columns: PnlDailyMatrixColumn[]): OriginGroup[] {
  const groups: OriginGroup[] = []
  for (const column of columns) {
    const last = groups[groups.length - 1]
    if (last && last.label === column.originLabel) last.span += 1
    else groups.push({ label: column.originLabel, span: 1 })
  }
  return groups
}

export function toRevenueTable(matrix: PnlDailyMatrix): MatrixTableModel {
  return {
    columns: matrix.columns,
    dates: matrix.rows.map((r) => r.date),
    values: matrix.rows.map((r) => r.cells.map((c) => (c ? c.revenue : null))),
    incompleteTos: null,
    footerRows: [
      { label: 'Total', values: matrix.footer.map((f) => f.totalRevenue), format: 'number' },
      { label: 'Avg / Day', values: matrix.footer.map((f) => f.avgRevenuePerDay), format: 'number' },
    ],
    highlightNegative: false,
  }
}

export function toMarginTable(matrix: PnlDailyMatrix): MatrixTableModel {
  return {
    columns: matrix.columns,
    dates: matrix.rows.map((r) => r.date),
    values: matrix.rows.map((r) => r.cells.map((c) => (c ? c.margin : null))),
    incompleteTos: matrix.rows.map((r) => r.cells.map((c) => (c ? c.incompleteTos : 0))),
    footerRows: [
      { label: 'Total', values: matrix.footer.map((f) => f.totalMargin), format: 'number' },
      { label: 'Avg / Day', values: matrix.footer.map((f) => f.avgMarginPerDay), format: 'number' },
      { label: '% Margin', values: matrix.footer.map((f) => f.marginPct), format: 'percent' },
      { label: 'Total Tonase', values: matrix.footer.map((f) => f.totalWeight), format: 'number' },
      { label: 'Space per Kg', values: matrix.footer.map((f) => f.spacePerKg), format: 'number' },
    ],
    highlightNegative: true,
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter frontend exec jest dailyMatrix --runInBand`
Expected: PASS — 13 tests passed.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl/hooks/usePnl.ts apps/frontend/src/features/pnl/utils/dailyMatrix.ts apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts
git commit -m "feat(pnl): add daily matrix hook and table projections"
```

---

### Task 5: The matrix table component

A single presentational component rendered twice. It receives a `MatrixTableModel` and knows nothing about revenue or margin, which is what keeps both tables identical in layout.

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx`

**Interfaces:**
- Consumes: `MatrixTableModel`, `groupOrigins`, `formatDayLabel` from `../utils/dailyMatrix` (Task 4); `num` and `pct` from `../utils/format`.
- Produces: `PnlMatrixTable({ title, model, defaultOpen }: PnlMatrixTableProps)` — a default-exported-by-name React component. `defaultOpen` defaults to `true`.

Design notes the implementation must honour:
- The `Tanggal` column is `sticky left-0` so it survives horizontal scrolling of 18 columns.
- Group header spans come from `groupOrigins(model.columns)`, never a hardcoded 13 / 5.
- `null` renders as an empty cell; `0` renders as `0`. These mean different things.
- Negative values get red text on a light red background, but only when `model.highlightNegative` is set — a negative revenue would be a data error, not a business signal.
- A cell with `incompleteTos > 0` gets a small marker and a `title` tooltip naming the count.

- [ ] **Step 1: Write the component**

Create `apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MatrixTableModel, formatDayLabel, groupOrigins } from '../utils/dailyMatrix'
import { num, pct } from '../utils/format'

interface PnlMatrixTableProps {
  title: string
  model: MatrixTableModel
  defaultOpen?: boolean
}

// Alternating group tints mirror the spreadsheet: the first origin block green, the next blue.
const GROUP_TINTS = [
  'bg-green-100 dark:bg-green-950/40',
  'bg-blue-100 dark:bg-blue-950/40',
]

function formatValue(value: number | null, format: 'number' | 'percent'): string {
  if (value == null) return ''
  return format === 'percent' ? pct(value) : num(Math.round(value))
}

// Shared by body and footer cells so a negative total is styled the same way as a negative day.
function valueClass(value: number | null, highlightNegative: boolean): string {
  if (value == null || value >= 0 || !highlightNegative) return ''
  return 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40'
}

export function PnlMatrixTable({ title, model, defaultOpen = true }: PnlMatrixTableProps) {
  const [open, setOpen] = useState(defaultOpen)
  const groups = groupOrigins(model.columns)

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-2 border-b px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {model.columns.length} destinations · {model.dates.length} days
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 border-b border-r bg-card px-3 py-2 text-left font-medium"
                >
                  Tanggal
                </th>
                {groups.map((group, i) => (
                  <th
                    key={group.label}
                    colSpan={group.span}
                    className={`border-b border-l px-3 py-1.5 text-center font-semibold ${GROUP_TINTS[i % GROUP_TINTS.length]}`}
                  >
                    {group.label}
                  </th>
                ))}
              </tr>
              <tr>
                {model.columns.map((column) => (
                  <th
                    key={`${column.origin}-${column.dest}`}
                    className="whitespace-nowrap border-b border-l px-3 py-2 text-right font-medium text-muted-foreground"
                  >
                    {column.dest}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {model.dates.map((date, rowIndex) => (
                <tr key={date} className={rowIndex % 2 ? 'bg-muted/30' : ''}>
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1.5 ${rowIndex % 2 ? 'bg-muted/30' : 'bg-card'}`}
                  >
                    {formatDayLabel(date)}
                  </td>
                  {model.values[rowIndex].map((value, colIndex) => {
                    const incomplete = model.incompleteTos?.[rowIndex][colIndex] ?? 0
                    return (
                      <td
                        key={colIndex}
                        title={
                          incomplete > 0
                            ? `${incomplete} TO belum ada cost — margin di sel ini lebih tinggi dari seharusnya`
                            : undefined
                        }
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${valueClass(value, model.highlightNegative)}`}
                      >
                        {formatValue(value, 'number')}
                        {incomplete > 0 && <span className="ml-1 text-amber-600">•</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              {model.footerRows.map((row, i) => (
                <tr key={row.label} className={i === 0 ? 'border-t-2 font-semibold' : 'font-semibold'}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1.5 text-right">
                    {row.label}
                  </td>
                  {row.values.map((value, colIndex) => (
                    <td
                      key={colIndex}
                      className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${valueClass(value, model.highlightNegative)}`}
                    >
                      {formatValue(value, row.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm --filter frontend type-check`
Expected: no output (exit code 0).

- [ ] **Step 3: Verify it lints**

Run: `pnpm --filter frontend lint`
Expected: no errors reported for `PnlMatrixTable.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx
git commit -m "feat(pnl): add the reusable daily matrix table component"
```

---

### Task 6: Daily Report tab

Wires the pieces together and makes the feature visible.

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx` — imports at lines 1-14, the `view` state at line 61, the subtitle at lines 102-104, the toggle buttons at lines 106-119, and the render branch at lines 214-216

**Interfaces:**
- Consumes: `usePnlDailyMatrix` and `PnlFilter` from `../hooks/usePnl`; `toRevenueTable` / `toMarginTable` from `../utils/dailyMatrix`; `PnlMatrixTable` from `./PnlMatrixTable`.
- Produces: `PnlDailyMatrixView({ filter }: { filter: PnlFilter })`.

- [ ] **Step 1: Write the view container**

Create `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx`:

```tsx
'use client'

import { PnlFilter, usePnlDailyMatrix } from '../hooks/usePnl'
import { toMarginTable, toRevenueTable } from '../utils/dailyMatrix'
import { PnlMatrixTable } from './PnlMatrixTable'

export function PnlDailyMatrixView({ filter }: { filter: PnlFilter }) {
  const { data, isLoading, isError, refetch } = usePnlDailyMatrix(filter)

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-[320px] rounded-lg border bg-card" />
        <div className="h-[420px] rounded-lg border bg-card" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load the daily report.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
          Retry
        </button>
      </div>
    )
  }

  if (!data || data.columns.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No route data available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PnlMatrixTable title="Revenue — CGK/SUB" model={toRevenueTable(data)} />
      <PnlMatrixTable title="Profit Margin — CGK/SUB" model={toMarginTable(data)} />
    </div>
  )
}
```

- [ ] **Step 2: Import it into the page**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, add after the `PnlFormulaPanel` import on line 13:

```tsx
import { PnlDailyMatrixView } from '@/features/pnl/components/PnlDailyMatrixView'
```

- [ ] **Step 3: Add the view type and subtitles**

In the same file, add above `function PnlPageContent()` (which starts at line 52):

```tsx
type PnlView = 'estimate' | 'actual' | 'daily'

const VIEW_SUBTITLE: Record<PnlView, string> = {
  estimate: 'Estimated P&L based on arrival date — not yet billed',
  actual: 'Actual revenue from settled invoices vs estimate',
  daily: 'Daily revenue and profit margin per origin and destination',
}
```

Then change the `view` state declaration on line 61 from:

```tsx
  const [view, setView] = useState<'estimate' | 'actual'>('estimate')
```

to:

```tsx
  const [view, setView] = useState<PnlView>('estimate')
```

- [ ] **Step 4: Replace the subtitle and the toggle**

Replace lines 101-119 — the `<p className="text-muted-foreground text-sm">` block through the closing `</div>` of the toggle — with:

```tsx
          <p className="text-muted-foreground text-sm">{VIEW_SUBTITLE[view]}</p>
          <div className="mt-2 flex w-fit rounded-md border text-sm overflow-hidden">
            <button
              className={`px-3 py-1.5 ${view === 'estimate' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('estimate')}
            >
              Estimated
            </button>
            <button
              className={`px-3 py-1.5 border-l ${view === 'actual' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('actual')}
            >
              Actual vs Estimate
            </button>
            <button
              className={`px-3 py-1.5 border-l ${view === 'daily' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('daily')}
            >
              Daily Report
            </button>
          </div>
```

- [ ] **Step 5: Add the render branch**

In the same file, find:

```tsx
      ) : view === 'actual' ? (
        <SettlementView filter={filter} />
      ) : (
```

and change it to:

```tsx
      ) : view === 'actual' ? (
        <SettlementView filter={filter} />
      ) : view === 'daily' ? (
        filter && <PnlDailyMatrixView filter={filter} />
      ) : (
```

- [ ] **Step 6: Verify the frontend type-checks and lints**

Run: `pnpm --filter frontend type-check && pnpm --filter frontend lint`
Expected: no output from `type-check` (exit code 0); no lint errors in the changed files.

- [ ] **Step 7: Run the full frontend test suite**

Run: `pnpm --filter frontend exec jest --runInBand`
Expected: PASS — including the `dailyMatrix` tests from Task 4.

- [ ] **Step 8: Verify in the running app**

Run: `pnpm dev` from the repo root, then open `http://localhost:3000/pnl`, sign in, and click the **Daily Report** tab.

Confirm:
- Two tables appear, Revenue above Profit Margin, each collapsible from its header.
- The header has two tiers: `CGK` spanning 13 destination columns and `SUB` spanning 5.
- The `Tanggal` column stays fixed while scrolling right.
- Every calendar day of the selected cycle has a row, including days with no shipments.
- The Revenue table ends with `Total` and `Avg / Day`; the Profit Margin table ends with `Total`, `Avg / Day`, `% Margin`, `Total Tonase`, `Space per Kg`.
- Negative margin cells are red; cells with an amber dot show a tooltip about missing cost.
- Switching the Date Basis or the cycle refreshes both tables.
- The Revenue `Total` row sums to the same figure as the Est. Revenue KPI card on the Estimated tab for the same filter.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx "apps/frontend/src/app/(dashboard)/pnl/page.tsx"
git commit -m "feat(pnl): add the Daily Report tab with revenue and margin matrices"
```

---

## Done When

- `pnpm --filter backend exec jest pnl --runInBand` passes.
- `pnpm --filter frontend exec jest --runInBand` passes.
- `pnpm --filter frontend type-check` and `pnpm --filter backend exec tsc --noEmit -p tsconfig.json` are clean.
- The Daily Report tab renders both tables against real data, and the Revenue total reconciles with the Est. Revenue KPI card.
- Six commits sit on `feature/pnl-daily-matrix` on top of the spec commit. Nothing is pushed.
