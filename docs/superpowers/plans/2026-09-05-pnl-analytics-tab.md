# P&L Analytics Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sixth "Analytics" tab to the P&L page that renders all 14 sections of `dashboard-analytics.html` from live backend data.

**Architecture:** Three new aggregation endpoints on the existing `PnlController` (which already carries `read.pnl` at class level) do the per-AWB and per-(date × route) rollups in SQL. A new frontend feature module `features/pnl-analytics/` holds eight pure-function util modules — where all the arithmetic and all the tests live — one React Query hook module, and the section components, which only format. The per-(date × route) shape of `daily-series` is what lets every scoped and unscoped derivation happen client-side with zero extra requests.

**Tech Stack:** NestJS + TypeORM raw SQL against the `v_pnl_to` Postgres view; Next.js 14 App Router, React 18, React Query v5, recharts, Tailwind; jest + ts-jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-05-pnl-analytics-tab-design.md`

## Global Constraints

- **UI language is English.** The rest of the P&L page is English; no Indonesian strings in any component. (Code comments follow the surrounding file's convention.)
- **Cost is always the sum of the four components** (`costSmu + costRa + costSgOut + costSgIn`). Never `summary.totalCost` — the two disagree by up to 17% on some periods. `summary.totalCost` appears only in the Data Health section as a diagnostic.
- **Chargeable weight is an AWB attribute, not a TO attribute.** Always `MAX(chwt_awb)` per AWB then summed. `SUM(chwt_awb)` over TO rows multiplies it by `toCount`.
- **`COVERAGE_MIN = 95`**, and the gate is `completeDaysPct` (share of revenue on days with `incompleteTos === 0`), never `routeCoveragePct`.
- **The data-health gate is unscoped.** It is always computed over all routes regardless of the viewer's scope selection.
- **Absent ≠ empty.** A dataset that failed to load gets an explicit note; a dataset that loaded with no rows gets the normal empty-table treatment.
- Money is formatted with `fmt` / `fmtIdrCompact` from `@/features/pnl/utils/format`; percentages with `pct`; counts with `num`.
- No new npm dependencies. recharts is already a dependency (`PnlDailyMarginChart` uses it).
- Chart colors come from the `PnlDailyMarginChart` palette: `#94A3B8` incomplete, `#EF4444` negative, `#F59E0B` under 10%, `#22C55E` healthy.
- Route key format is `` `${origin}|${dest}` `` everywhere. Route label is `` `${ORIGIN_LABELS[origin] ?? origin} → ${dest}` ``.
- Dates are parsed as UTC (`new Date(iso + 'T00:00:00Z')`) so weekday and offset arithmetic never shift with the machine timezone.
- Backend tests: `cd apps/backend && pnpm exec jest <pattern>`. The full backend suite needs `NODE_OPTIONS="--max-old-space-size=5120" ... --runInBand`; single-file runs do not.
- Frontend tests: `cd apps/frontend && pnpm exec jest <path>`.
- Commit after every task.

## File Structure

**Backend** (`apps/backend/src/modules/pnl/`)

| File | Responsibility |
|---|---|
| `pnl.service.ts` (modify) | Three new methods + their result interfaces |
| `pnl.controller.ts` (modify) | Three new `@Get('analytics/...')` routes |
| `pnl.service.spec.ts` (modify) | Mocked-`dataSource.query` shape tests |
| `pnl-analytics.integration.spec.ts` (create) | Real-Postgres check that `daily-series` totals match `/pnl/summary` |

**Frontend** (`apps/frontend/src/features/pnl-analytics/`)

| File | Responsibility |
|---|---|
| `types.ts` | Response and derived types shared by utils, hooks and components |
| `utils/cycle.ts` | `previousCycle`, `cycleDateRange`, `routeKey`, `routeLabel`, `mapSlaRoutes`, `validCycles` |
| `utils/series.ts` | `foldByRoute`, `foldAll`, `kpis`, `kpisWithDelta`, `sliceSeries`, `completeRevenueShare`, `dailyOutliers`, `costComposition` |
| `utils/weekday.ts` | `weekdayProfile`, `campaignDates`, `campaignWindows`, `campaignSummary`, campaign rule parse/serialize |
| `utils/share.ts` | `buildShare`, `shareTable`, `vendorExecution`, `airlineShare`, `selfOperateGap` |
| `utils/journey.ts` | `bestCombination` |
| `utils/routes.ts` | `routeContribution`, `concentration`, `marginStability` |
| `utils/ops.ts` | `slaView`, `offloadView` |
| `utils/dq.ts` | `dqReport`, `COVERAGE_MIN` |
| `utils/context.ts` | `buildAnalyticsContext` — assembles series, scope, KPI deltas, `baselineIncomplete` |
| `hooks/useAnalytics.ts` | React Query hooks for the three new endpoints, SLA overview and offloaded AWBs |
| `components/PnlAnalyticsView.tsx` | Container: scope selector, section nav, all 14 sections |
| `components/AnalyticsSection.tsx` | Section frame (anchor id, heading, children) — shared chrome |
| `components/AnalyticsTable.tsx` | Generic column-driven table — shared by nine sections |
| `components/AnalyticsNotes.tsx` | `ScopeFallbackNote`, `RangeFallbackNote`, `AbsentNote` |
| `components/AnalyticsScopePicker.tsx` | All routes / route group / specific routes |
| `components/AnalyticsHealth.tsx` … `AnalyticsAppendix.tsx` | Sections 1–14 |

`AnalyticsSection.tsx` and `AnalyticsTable.tsx` are additions to the spec's component list. They exist so nine sections do not each hand-roll the same table and heading markup.

**Frontend** (existing files, modified)

| File | Change |
|---|---|
| `features/pnl/constants.ts` | `export const ANALYTICS_LABEL = 'Analytics'` |
| `app/(dashboard)/pnl/page.tsx` | `PnlView` gains `'analytics'`, a subtitle, a tab button, a ternary branch, and lifted `analyticsScope` state |

---

### Task 1: Backend — `GET /pnl/analytics/daily-series`

The foundation of five sections plus Routes & Groups. One row per (date × route), plus the calendar
dates the period spans so "per day" denominators stay right on days with no shipments.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts`
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts`
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: `buildFilter`, `calendarDatesForFilter` from `./pnl-filter.util` (already imported by `pnl.service.ts`).
- Produces: `PnlAnalyticsDailyRow`, `PnlAnalyticsDailySeries`, `PnlService.getAnalyticsDailySeries(cyclePeriod?, startDate?, endDate?, basis?): Promise<PnlAnalyticsDailySeries>`, route `GET /pnl/analytics/daily-series`.

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe('PnlService', ...)` block in `apps/backend/src/modules/pnl/pnl.service.spec.ts`:

```ts
  describe('getAnalyticsDailySeries', () => {
    it('returns the calendar dates and one row per date and route', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          d: '2026-05-02',
          origin_station: 'Jabo',
          dest_station: 'Denpasar',
          revenue: '1000',
          cost_smu: '400',
          cost_ra: '50',
          cost_sg_out: '30',
          cost_sg_in: '20',
          weight: '250',
          incomplete_tos: 2,
        },
      ])

      const result = await service.getAnalyticsDailySeries('2026-05-1H')

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('cost_smu_awb * weight_share'),
        ['2026-05-1H'],
      )
      // Every calendar day of the half-cycle is listed, not only the days with shipments: the
      // frontend divides by this length for "per day" figures.
      expect(result.dates).toHaveLength(15)
      expect(result.dates[0]).toBe('2026-05-01')
      expect(result.dates[14]).toBe('2026-05-15')
      expect(result.rows).toEqual([
        {
          date: '2026-05-02',
          origin: 'Jabo',
          dest: 'Denpasar',
          revenue: 1000,
          costSmu: 400,
          costRa: 50,
          costSgOut: 30,
          costSgIn: 20,
          weight: 250,
          incompleteTos: 2,
        },
      ])
    })

    it('filters by date range when no cycle is given', async () => {
      dataSource.query.mockResolvedValueOnce([])

      const result = await service.getAnalyticsDailySeries(
        undefined,
        '2026-05-01',
        '2026-05-03',
        'atd_origin',
      )

      expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('date_atd'), [
        '2026-05-01',
        '2026-05-03',
      ])
      expect(result.dates).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
      expect(result.rows).toEqual([])
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && pnpm exec jest pnl.service.spec -t getAnalyticsDailySeries`
Expected: FAIL — `service.getAnalyticsDailySeries is not a function`

- [ ] **Step 3: Add the interfaces and the service method**

Append to the interface block in `apps/backend/src/modules/pnl/pnl.service.ts` (after `PnlProfitByRouteItem`, around line 169):

```ts
// One (date × route) cell of the analytics tab's foundation series. Deliberately per-route rather
// than a daily total: the Routes & Groups section needs a per-route daily series for every route,
// and the scope selector must be able to re-fold the same response instead of refetching.
export interface PnlAnalyticsDailyRow {
  date: string // YYYY-MM-DD
  origin: string
  dest: string
  revenue: number // net: revenue_total - revenue_discount
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  weight: number // gross weight
  incompleteTos: number
}

export interface PnlAnalyticsDailySeries {
  // Every calendar day the period spans, ascending — including days with no shipments, which carry
  // no row below. The frontend divides by this length for "per day" figures.
  dates: string[]
  rows: PnlAnalyticsDailyRow[]
}
```

Append these methods to the `PnlService` class, before its closing brace:

```ts
  // Foundation of the Analytics tab: revenue, the four cost components, weight and the incomplete-TO
  // count, per calendar day and per route. The cost split uses the same weight-share expressions as
  // getRouteComparison, so a day's four components sum to the same cost both tabs report.
  async getAnalyticsDailySeries(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlAnalyticsDailySeries> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const dates = calendarDatesForFilter(cyclePeriod, startDate, endDate)

    const rows = await this.dataSource.query(
      `
      SELECT
        TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD')                                AS d,
        origin_station,
        dest_station,
        COALESCE(SUM(revenue_total), 0)
          - COALESCE(SUM(revenue_discount), 0)                                 AS revenue,
        COALESCE(SUM(cost_smu_awb    * weight_share)
                 FILTER (WHERE cost_to IS NOT NULL), 0)                        AS cost_smu,
        COALESCE(SUM(cost_ra_awb     * weight_share)
                 FILTER (WHERE cost_to IS NOT NULL), 0)                        AS cost_ra,
        COALESCE(SUM(cost_sg_out_awb * weight_share)
                 FILTER (WHERE cost_to IS NOT NULL), 0)                        AS cost_sg_out,
        COALESCE(SUM(COALESCE(cost_sg_in_to, 0))
                 FILTER (WHERE cost_to IS NOT NULL), 0)                        AS cost_sg_in,
        COALESCE(SUM(gross_weight), 0)                                         AS weight,
        COUNT(*) FILTER (WHERE cost_to IS NULL)::int                           AS incomplete_tos
      FROM v_pnl_to
      WHERE ${where}
        AND ${dateCol} IS NOT NULL
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3
      `,
      params,
    )

    return {
      dates,
      rows: (rows as Record<string, string>[]).map((r) => ({
        date: r.d,
        origin: r.origin_station,
        dest: r.dest_station,
        revenue: Number(r.revenue),
        costSmu: Number(r.cost_smu),
        costRa: Number(r.cost_ra),
        costSgOut: Number(r.cost_sg_out),
        costSgIn: Number(r.cost_sg_in),
        weight: Number(r.weight),
        incompleteTos: Number(r.incomplete_tos),
      })),
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && pnpm exec jest pnl.service.spec -t getAnalyticsDailySeries`
Expected: PASS, 2 tests

- [ ] **Step 5: Add the controller route**

Append to `apps/backend/src/modules/pnl/pnl.controller.ts`, before the class's closing brace:

```ts
  // The Analytics tab's three endpoints. No method-level @Authorize: RbacGuard resolves with
  // getAllAndOverride([handler, class]), so a method decorator would REPLACE the class-level
  // read.pnl rather than add to it.
  @Get('analytics/daily-series')
  getAnalyticsDailySeries(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getAnalyticsDailySeries(cycle, start, end, basis)
  }
```

- [ ] **Step 6: Run the full pnl module tests**

Run: `cd apps/backend && pnpm exec jest src/modules/pnl --testPathIgnorePatterns 'integration'`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts apps/backend/src/modules/pnl/pnl.controller.ts
git commit -m "feat(pnl): add analytics daily-series endpoint"
```

---

### Task 2: Backend — `GET /pnl/analytics/journey` and `GET /pnl/analytics/gw-chw`

Both roll up per AWB first, then group. They share that shape, so they ship together.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts`
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts`
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: `buildFilter` from `./pnl-filter.util`.
- Produces: `PnlAnalyticsJourneyRow`, `PnlAnalyticsGwChwRow`, `PnlService.getAnalyticsJourney(cyclePeriod?, startDate?, endDate?, basis?): Promise<PnlAnalyticsJourneyRow[]>`, `PnlService.getAnalyticsGwChw(...): Promise<PnlAnalyticsGwChwRow[]>`, routes `GET /pnl/analytics/journey` and `GET /pnl/analytics/gw-chw`.

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe('PnlService', ...)` block in `apps/backend/src/modules/pnl/pnl.service.spec.ts`:

```ts
  describe('getAnalyticsJourney', () => {
    it('returns one row per vendor, airline and route, sorted by margin per kg', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          vendor: 'ESP',
          airline: 'GA',
          origin: 'Jabo',
          dest: 'Denpasar',
          awb_count: 4,
          gw: '1000',
          chwt: '900',
          revenue: '5000',
          cost: '3000',
        },
        {
          vendor: 'Acme',
          airline: 'GA',
          origin: 'Jabo',
          dest: 'Denpasar',
          awb_count: 2,
          gw: '500',
          chwt: '480',
          revenue: '2000',
          cost: '1800',
        },
      ])

      const result = await service.getAnalyticsJourney('2026-05-1H')

      // Chargeable weight is an AWB attribute: it must be MAX(chwt_awb) per AWB before it is
      // summed, or every AWB's chwt is multiplied by its TO count.
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('MAX(chwt_awb)'),
        ['2026-05-1H'],
      )
      expect(result).toEqual([
        {
          vendor: 'ESP',
          airline: 'GA',
          origin: 'Jabo',
          dest: 'Denpasar',
          awbCount: 4,
          gw: 1000,
          chwt: 900,
          revenue: 5000,
          cost: 3000,
          margin: 2000,
          marginPerKg: 2,
        },
        {
          vendor: 'Acme',
          airline: 'GA',
          origin: 'Jabo',
          dest: 'Denpasar',
          awbCount: 2,
          gw: 500,
          chwt: 480,
          revenue: 2000,
          cost: 1800,
          margin: 200,
          marginPerKg: 0.4,
        },
      ])
    })

    it('reports marginPerKg as 0 rather than Infinity when a group has no weight', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          vendor: 'Acme',
          airline: null,
          origin: 'Jabo',
          dest: 'Batam',
          awb_count: 1,
          gw: '0',
          chwt: '0',
          revenue: '100',
          cost: '40',
        },
      ])

      const result = await service.getAnalyticsJourney('2026-05-1H')

      expect(result[0].marginPerKg).toBe(0)
    })
  })

  describe('getAnalyticsGwChw', () => {
    it('returns the gross-versus-chargeable gap per route, worst impact first', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin: 'Jabo', dest: 'Denpasar', gw: '1000', chwt: '1200', revenue: '5000' },
        { origin: 'Jabo', dest: 'Batam', gw: '800', chwt: '700', revenue: '4000' },
      ])

      const result = await service.getAnalyticsGwChw('2026-05-1H')

      // Revenue is billed on gross weight while cost is incurred on chargeable weight, so a
      // negative diff is money paid for weight that was never billed — sorted first.
      expect(result).toEqual([
        {
          origin: 'Jabo',
          dest: 'Denpasar',
          gw: 1000,
          chwt: 1200,
          diff: -200,
          revenuePerKg: 5,
          impact: -1000,
        },
        {
          origin: 'Jabo',
          dest: 'Batam',
          gw: 800,
          chwt: 700,
          diff: 100,
          revenuePerKg: 5,
          impact: 500,
        },
      ])
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && pnpm exec jest pnl.service.spec -t "getAnalytics"`
Expected: FAIL — `service.getAnalyticsJourney is not a function`

- [ ] **Step 3: Add the interfaces and the service methods**

Append to the interface block in `apps/backend/src/modules/pnl/pnl.service.ts`, directly after `PnlAnalyticsDailySeries`:

```ts
// One vendor × airline × route combination, for the "best journey" ranking. Only AWBs with fully
// attributed cost are counted: a row with no cost reads as infinitely profitable and would head
// every ranking it appears in.
export interface PnlAnalyticsJourneyRow {
  vendor: string | null
  airline: string | null
  origin: string
  dest: string
  awbCount: number
  gw: number
  chwt: number
  revenue: number
  cost: number
  margin: number
  marginPerKg: number
}

// Gross weight versus chargeable weight per route. Unlike the journey rollup this counts every AWB,
// including ones with no cost: the gap is a weight fact, not a margin fact.
export interface PnlAnalyticsGwChwRow {
  origin: string
  dest: string
  gw: number
  chwt: number
  diff: number // gw - chwt
  revenuePerKg: number
  impact: number // diff * revenuePerKg
}
```

Append these methods to the `PnlService` class, after `getAnalyticsDailySeries`:

```ts
  // Chargeable weight and the AWB-level cost columns are attributes of the AWB, not of the TO row:
  // both endpoints below therefore collapse to one row per AWB first (MAX over the AWB) and only
  // then group. Summing chwt_awb straight off v_pnl_to would multiply it by each AWB's TO count.
  private analyticsPerAwbCte(where: string): string {
    return `
      WITH per_awb AS (
        SELECT
          awb,
          vendor,
          airline,
          MODE() WITHIN GROUP (ORDER BY origin_station)                        AS origin,
          MODE() WITHIN GROUP (ORDER BY dest_station)                          AS dest,
          COALESCE(SUM(gross_weight), 0)                                       AS gw,
          COALESCE(MAX(chwt_awb), 0)                                           AS chwt,
          COALESCE(SUM(revenue_total), 0)
            - COALESCE(SUM(revenue_discount), 0)                               AS revenue,
          COALESCE(MAX(cost_smu_awb), 0)
            + COALESCE(MAX(cost_ra_awb), 0)
            + COALESCE(MAX(cost_sg_out_awb), 0)
            + COALESCE(SUM(cost_sg_in_to), 0)                                  AS cost,
          (MAX(cost_total_awb) IS NULL OR MAX(cost_sg_in_to) IS NULL)          AS has_null_cost
        FROM v_pnl_to
        WHERE ${where}
        GROUP BY awb, vendor, airline
      )`
  }

  async getAnalyticsJourney(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlAnalyticsJourneyRow[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)

    const rows = await this.dataSource.query(
      `
      ${this.analyticsPerAwbCte(where)}
      SELECT
        vendor,
        airline,
        origin,
        dest,
        COUNT(*)::int          AS awb_count,
        COALESCE(SUM(gw), 0)      AS gw,
        COALESCE(SUM(chwt), 0)    AS chwt,
        COALESCE(SUM(revenue), 0) AS revenue,
        COALESCE(SUM(cost), 0)    AS cost
      FROM per_awb
      WHERE has_null_cost = FALSE
        AND cost > 0
      GROUP BY vendor, airline, origin, dest
      `,
      params,
    )

    return (rows as Record<string, string>[])
      .map((r) => {
        const gw = Number(r.gw)
        const revenue = Number(r.revenue)
        const cost = Number(r.cost)
        const margin = revenue - cost
        return {
          vendor: (r.vendor as string | null) ?? null,
          airline: (r.airline as string | null) ?? null,
          origin: r.origin,
          dest: r.dest,
          awbCount: Number(r.awb_count),
          gw,
          chwt: Number(r.chwt),
          revenue,
          cost,
          margin,
          marginPerKg: gw > 0 ? margin / gw : 0,
        }
      })
      .sort((a, b) => b.marginPerKg - a.marginPerKg)
  }

  async getAnalyticsGwChw(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlAnalyticsGwChwRow[]> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate)

    const rows = await this.dataSource.query(
      `
      ${this.analyticsPerAwbCte(where)}
      SELECT
        origin,
        dest,
        COALESCE(SUM(gw), 0)      AS gw,
        COALESCE(SUM(chwt), 0)    AS chwt,
        COALESCE(SUM(revenue), 0) AS revenue
      FROM per_awb
      GROUP BY origin, dest
      `,
      params,
    )

    return (rows as Record<string, string>[])
      .map((r) => {
        const gw = Number(r.gw)
        const chwt = Number(r.chwt)
        const revenuePerKg = gw > 0 ? Number(r.revenue) / gw : 0
        const diff = gw - chwt
        return {
          origin: r.origin,
          dest: r.dest,
          gw,
          chwt,
          diff,
          revenuePerKg,
          impact: diff * revenuePerKg,
        }
      })
      .sort((a, b) => a.impact - b.impact)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && pnpm exec jest pnl.service.spec -t "getAnalytics"`
Expected: PASS, 5 tests (2 from Task 1, 3 new)

- [ ] **Step 5: Add the controller routes**

Append to `apps/backend/src/modules/pnl/pnl.controller.ts`, after `getAnalyticsDailySeries`:

```ts
  @Get('analytics/journey')
  getAnalyticsJourney(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getAnalyticsJourney(cycle, start, end, basis)
  }

  @Get('analytics/gw-chw')
  getAnalyticsGwChw(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getAnalyticsGwChw(cycle, start, end, basis)
  }
```

- [ ] **Step 6: Run the full pnl module tests**

Run: `cd apps/backend && pnpm exec jest src/modules/pnl --testPathIgnorePatterns 'integration'`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts apps/backend/src/modules/pnl/pnl.controller.ts
git commit -m "feat(pnl): add analytics journey and gw-chw endpoints"
```

---

### Task 3: Backend — integration spec against real Postgres

`pnl.service.spec.ts` mocks `dataSource.query`, so it cannot tell whether Postgres accepts the SQL.
This is where the invariant that matters gets pinned: the daily-series totals must equal
`/pnl/summary` for the same period and basis.

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl-analytics.integration.spec.ts`

**Interfaces:**
- Consumes: `PnlService.getAnalyticsDailySeries`, `getAnalyticsJourney`, `getAnalyticsGwChw`, `getSummary` from Tasks 1–2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the spec**

Create `apps/backend/src/modules/pnl/pnl-analytics.integration.spec.ts`:

```ts
/**
 * Integration test for the three /pnl/analytics endpoints.
 *
 * pnl.service.spec.ts mocks dataSource.query(), so it can assert what SQL text got sent but cannot
 * tell whether Postgres would accept it — that gap is how the `v.v.date_ata` double-prefix bug once
 * shipped behind 8 green tests. This spec runs the real queries against a real database.
 *
 * The assertion that matters most is the last one: daily-series is a second, independent path to
 * the same revenue /pnl/summary reports. If the two ever disagree, every number on the Analytics
 * tab is quietly wrong while nothing looks broken.
 *
 * Requires a reachable Postgres — DATABASE_URL if set, otherwise the local dev default documented
 * in apps/backend/.env. Skips (loudly, not silently) when unreachable.
 *
 * Run with:
 *   cd apps/backend && pnpm exec jest pnl-analytics.integration --runInBand
 */

import 'reflect-metadata'
import { execSync } from 'child_process'
import { DataSource } from 'typeorm'
import { PnlService } from './pnl.service'

const DATABASE_URL_EXPLICIT = !!process.env.DATABASE_URL
const CONNECTION_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/app'

function isDbReachable(url: string): boolean {
  try {
    const u = new URL(url)
    execSync(`pg_isready -h ${u.hostname} -p ${u.port || '5432'} -U ${u.username || 'postgres'}`, {
      stdio: 'ignore',
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

const DB_AVAILABLE = isDbReachable(CONNECTION_URL)

describe('PnlService analytics endpoints (integration)', () => {
  if (!DB_AVAILABLE) {
    if (DATABASE_URL_EXPLICIT) {
      it('FAILS LOUDLY — DATABASE_URL is set but pg_isready could not reach Postgres', () => {
        throw new Error(
          `DATABASE_URL=${CONNECTION_URL} is set, but pg_isready could not reach Postgres at it ` +
            `(or the pg_isready binary itself is missing from this host — install postgresql-client ` +
            `to find out which). Fix connectivity, or unset DATABASE_URL to allow this suite to skip.`,
        )
      })
      return
    }
    // eslint-disable-next-line no-console
    console.warn(
      `\n${'='.repeat(78)}\n` +
        `SKIPPED pnl-analytics.integration.spec.ts\n` +
        `Postgres unreachable at ${CONNECTION_URL} (pg_isready failed).\n` +
        `${'='.repeat(78)}\n`,
    )
    it.skip('SKIPPED — database unreachable, see console warning above', () => {})
    return
  }

  const CYCLE = '2026-05-1H'
  const RANGE_START = '2026-05-01'
  const RANGE_END = '2026-05-15'

  let dataSource: DataSource
  let service: PnlService

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: CONNECTION_URL,
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
    service = new PnlService(dataSource)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  it('runs daily-series in cycle mode and lists every calendar day', async () => {
    const result = await service.getAnalyticsDailySeries(CYCLE)
    expect(result.dates).toHaveLength(15)
    // Sanity: the fixture cycle actually has data, or every assertion below is vacuous.
    expect(result.rows.length).toBeGreaterThan(0)
    for (const row of result.rows) {
      expect(result.dates).toContain(row.date)
    }
  })

  it('runs daily-series in range mode and on a non-default basis', async () => {
    await expect(
      service.getAnalyticsDailySeries(undefined, RANGE_START, RANGE_END, 'atd_origin'),
    ).resolves.toBeDefined()
  })

  it('runs journey and gw-chw without throwing', async () => {
    const journey = await service.getAnalyticsJourney(CYCLE)
    const gwChw = await service.getAnalyticsGwChw(CYCLE)
    expect(journey.length).toBeGreaterThan(0)
    expect(gwChw.length).toBeGreaterThan(0)
    // Journey counts only fully-costed AWBs, so every row must carry cost.
    for (const row of journey) expect(row.cost).toBeGreaterThan(0)
  })

  it('keeps chargeable weight per AWB, not per TO', async () => {
    const gwChw = await service.getAnalyticsGwChw(CYCLE)
    const totalChwt = gwChw.reduce((s, r) => s + r.chwt, 0)

    // The naive query — SUM over TO rows — multiplies each AWB's chwt by its TO count. Comparing
    // against it proves the CTE actually collapses to one row per AWB rather than merely looking
    // like it does.
    const [naive] = await dataSource.query(
      `SELECT COALESCE(SUM(chwt_awb), 0) AS chwt FROM v_pnl_to WHERE cycle_ata = $1`,
      [CYCLE],
    )
    const [perAwb] = await dataSource.query(
      `SELECT COALESCE(SUM(chwt), 0) AS chwt
       FROM (SELECT awb, MAX(chwt_awb) AS chwt FROM v_pnl_to WHERE cycle_ata = $1 GROUP BY awb) s`,
      [CYCLE],
    )
    expect(totalChwt).toBeCloseTo(Number(perAwb.chwt), 4)
    // Sanity: some AWB in this cycle really does span multiple TOs, or the two numbers above
    // would agree even with the bug present and this test would prove nothing.
    expect(Number(naive.chwt)).toBeGreaterThan(Number(perAwb.chwt))
  })

  // The invariant most likely to break silently: daily-series is an independent path to the same
  // revenue the Estimated tab shows. If they drift, the whole Analytics tab is wrong with nothing
  // visibly broken.
  it('sums daily-series revenue to the same figure /pnl/summary reports', async () => {
    const [series, summary] = await Promise.all([
      service.getAnalyticsDailySeries(CYCLE),
      service.getSummary(CYCLE),
    ])
    const seriesRevenue = series.rows.reduce((s, r) => s + r.revenue, 0)
    expect(summary.totalRevenue).toBeGreaterThan(0)
    expect(seriesRevenue).toBeCloseTo(summary.totalRevenue, 2)
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd apps/backend && pnpm exec jest pnl-analytics.integration --runInBand`
Expected: PASS if Postgres is reachable; a loud SKIP banner otherwise. A failure on the
revenue-equality test means the daily-series `WHERE`/`GROUP BY` disagrees with `getSummary` — fix
the SQL, not the assertion.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl-analytics.integration.spec.ts
git commit -m "test(pnl): integration spec for analytics endpoints"
```

---

### Task 4: Frontend — types and data hooks

Everything downstream imports from here, so this task lands first and carries no arithmetic.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/types.ts`
- Create: `apps/frontend/src/features/pnl-analytics/hooks/useAnalytics.ts`
- Test: `apps/frontend/src/features/pnl-analytics/hooks/useAnalytics.spec.ts`

**Interfaces:**
- Consumes: `PnlFilter` from `@/features/pnl/hooks/usePnl`; `apiClient` from `@/shared/api/client`; `OffloadedAwbRow` from `@/features/air-shipments/types`.
- Produces: types `AnalyticsDailyRow`, `AnalyticsDailySeries`, `AnalyticsJourneyRow`, `AnalyticsGwChwRow`, `AnalyticsScope`, `SeriesDay`, `Kpis`, `KpiKey`, `KpiDelta`, `KpiSet`, `Campaign`, `CampaignRule`, `SlaOverview`, `SlaOtpSummary`; hooks `useAnalyticsDailySeries`, `useAnalyticsPrevDailySeries`, `useAnalyticsJourney`, `useAnalyticsGwChw`, `useAnalyticsSla`, `useAnalyticsOffloaded`; helper `analyticsFilterToParams`.

- [ ] **Step 1: Write `types.ts`**

Create `apps/frontend/src/features/pnl-analytics/types.ts`:

```ts
/** Wire shapes of the three /pnl/analytics endpoints, plus the types derived from them. */

/** One (date × route) cell straight off GET /pnl/analytics/daily-series. */
export interface AnalyticsDailyRow {
  date: string // YYYY-MM-DD
  origin: string
  dest: string
  revenue: number // net of discount
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  weight: number
  incompleteTos: number
}

export interface AnalyticsDailySeries {
  /** Every calendar day the period spans, including days with no rows below. */
  dates: string[]
  rows: AnalyticsDailyRow[]
}

export interface AnalyticsJourneyRow {
  vendor: string | null
  airline: string | null
  origin: string
  dest: string
  awbCount: number
  gw: number
  chwt: number
  revenue: number
  cost: number
  margin: number
  marginPerKg: number
}

export interface AnalyticsGwChwRow {
  origin: string
  dest: string
  gw: number
  chwt: number
  diff: number
  revenuePerKg: number
  impact: number
}

/** Which routes the viewer has narrowed to. 'all' means every route the period carries. */
export type AnalyticsScope =
  | { kind: 'all' }
  | { kind: 'group'; id: string }
  | { kind: 'routes'; keys: string[] } // route keys, `${origin}|${dest}`

/**
 * One day of the folded series. `cost` is ALWAYS the four components summed — never the
 * summary endpoint's totalCost, which disagrees with it by up to 17% on some periods.
 */
export interface SeriesDay {
  date: string
  revenue: number
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number
  cost: number
  margin: number
  weight: number
}

export const KPI_KEYS = [
  'days',
  'weight',
  'weightPerDay',
  'revenue',
  'revenuePerDay',
  'revenuePerKg',
  'cost',
  'costPerDay',
  'costPerKg',
  'margin',
  'marginPerDay',
  'marginPerKg',
  'marginPct',
] as const

export type KpiKey = (typeof KPI_KEYS)[number]

export type Kpis = Record<KpiKey, number>

export interface KpiDelta {
  value: number
  prev: number | null
  /** null when there is no usable baseline — never 0, which would read as "no change". */
  deltaPct: number | null
}

export type KpiSet = Record<KpiKey, KpiDelta>

export type CampaignRule = { type: 'doubleDate' } | { type: 'dayOfMonth'; day: number }

export interface Campaign {
  label: string
  rule: CampaignRule
}

/** The slice of the SLA overview response the Operations section reads. */
export interface SlaOtpSummary {
  percentage: number
  onTimeWeight: number
  lateWeight: number
  breakdown: Array<{
    route: string
    percentage: number
    onTimeWeight: number
    lateWeight: number
  }>
}

export interface SlaOverview {
  summary: {
    alerts: Record<string, { routes: number; tonnage: number }>
    otp?: SlaOtpSummary
  }
}
```

- [ ] **Step 2: Write the failing hook test**

Create `apps/frontend/src/features/pnl-analytics/hooks/useAnalytics.spec.ts`:

```ts
/**
 * The hooks are thin, but the request params are not: a wrong param name here produces a silently
 * empty tab rather than an error, so the mapping is pinned directly.
 */
import { analyticsFilterToParams, slaRangeForFilter } from './useAnalytics'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'

describe('analyticsFilterToParams', () => {
  it('sends the cycle in cycle mode', () => {
    const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' }
    expect(analyticsFilterToParams(filter)).toEqual({ cycle: '2026-05-1H', basis: 'atd_origin' })
  })

  it('sends start and end in range mode', () => {
    const filter: PnlFilter = {
      mode: 'range',
      start: '2026-05-01',
      end: '2026-05-09',
      basis: 'ata_vendor_wh_destination',
    }
    expect(analyticsFilterToParams(filter)).toEqual({
      start: '2026-05-01',
      end: '2026-05-09',
      basis: 'ata_vendor_wh_destination',
    })
  })
})

describe('slaRangeForFilter', () => {
  it('expands a first-half cycle to its calendar days', () => {
    const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' }
    expect(slaRangeForFilter(filter)).toEqual({ startDate: '2026-05-01', endDate: '2026-05-15' })
  })

  it('passes a custom range straight through', () => {
    const filter: PnlFilter = {
      mode: 'range',
      start: '2026-05-04',
      end: '2026-05-06',
      basis: 'atd_origin',
    }
    expect(slaRangeForFilter(filter)).toEqual({ startDate: '2026-05-04', endDate: '2026-05-06' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/hooks/useAnalytics.spec.ts`
Expected: FAIL — cannot find module `./useAnalytics`

- [ ] **Step 4: Write the hooks**

Create `apps/frontend/src/features/pnl-analytics/hooks/useAnalytics.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'
import { OffloadedAwbRow } from '@/features/air-shipments/types'
import { cycleDateRange, previousCycle } from '../utils/cycle'
import { AnalyticsDailySeries, AnalyticsGwChwRow, AnalyticsJourneyRow, SlaOverview } from '../types'

/** The table the SLA and offload endpoints are scoped to. Air CGK is the only P&L table today. */
const SLA_TABLE = 'air_shipments_compileaircgk'

export function analyticsFilterToParams(filter: PnlFilter) {
  return filter.mode === 'cycle'
    ? { cycle: filter.cycle, basis: filter.basis }
    : { start: filter.start, end: filter.end, basis: filter.basis }
}

/**
 * The SLA and offload endpoints take plain dates, not cycles, so a cycle is expanded to the
 * calendar days it spans.
 */
export function slaRangeForFilter(filter: PnlFilter): { startDate: string; endDate: string } {
  if (filter.mode === 'range') return { startDate: filter.start, endDate: filter.end }
  const { start, end } = cycleDateRange(filter.cycle)
  return { startDate: start, endDate: end }
}

export function useAnalyticsDailySeries(filter: PnlFilter | undefined) {
  return useQuery<AnalyticsDailySeries>({
    queryKey: ['pnl', 'analytics', 'daily-series', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/daily-series', { params: analyticsFilterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

/**
 * The comparison period. In cycle mode it is the previous half-cycle; in range mode it is the
 * equally long range immediately before the selected one, so a range near the period start still
 * has something to compare against.
 */
export function useAnalyticsPrevDailySeries(filter: PnlFilter | undefined) {
  const prev = filter ? previousFilter(filter) : undefined
  return useQuery<AnalyticsDailySeries>({
    queryKey: ['pnl', 'analytics', 'daily-series', prev],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/daily-series', { params: analyticsFilterToParams(prev!) })
        .then((r) => r.data),
    enabled: !!prev,
    staleTime: 60 * 1000,
  })
}

function previousFilter(filter: PnlFilter): PnlFilter {
  if (filter.mode === 'cycle') {
    return { mode: 'cycle', cycle: previousCycle(filter.cycle), basis: filter.basis }
  }
  const shift = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const span =
    Math.round(
      (Date.parse(`${filter.end}T00:00:00Z`) - Date.parse(`${filter.start}T00:00:00Z`)) / 86400000,
    ) + 1
  return {
    mode: 'range',
    start: shift(filter.start, -span),
    end: shift(filter.start, -1),
    basis: filter.basis,
  }
}

export function useAnalyticsJourney(filter: PnlFilter | undefined) {
  return useQuery<AnalyticsJourneyRow[]>({
    queryKey: ['pnl', 'analytics', 'journey', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/journey', { params: analyticsFilterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

export function useAnalyticsGwChw(filter: PnlFilter | undefined) {
  return useQuery<AnalyticsGwChwRow[]>({
    queryKey: ['pnl', 'analytics', 'gw-chw', filter],
    queryFn: () =>
      apiClient
        .get('/pnl/analytics/gw-chw', { params: analyticsFilterToParams(filter!) })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}

/**
 * Guarded by read.sla, not read.pnl. `enabled` is the permission gate: a user without it sends no
 * request at all, so no 403 ever reaches them — the Operations section renders a note instead.
 */
export function useAnalyticsSla(filter: PnlFilter | undefined, enabled: boolean) {
  const range = filter ? slaRangeForFilter(filter) : undefined
  return useQuery<SlaOverview>({
    queryKey: ['pnl', 'analytics', 'sla', range],
    queryFn: () =>
      apiClient
        .get(`/air-shipments/${SLA_TABLE}/sla-overview`, { params: range })
        .then((r) => r.data),
    enabled: !!range && enabled,
    staleTime: 60 * 1000,
  })
}

export function useAnalyticsOffloaded(filter: PnlFilter | undefined, enabled: boolean) {
  const range = filter ? slaRangeForFilter(filter) : undefined
  return useQuery<{ data: OffloadedAwbRow[]; meta: { total: number } }>({
    queryKey: ['pnl', 'analytics', 'offloaded', range],
    queryFn: () =>
      apiClient
        .get(`/air-shipments/tracking-smu/offloaded`, {
          params: { page: 1, limit: 200, ...range },
        })
        .then((r) => r.data),
    enabled: !!range && enabled,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/hooks/useAnalytics.spec.ts`
Expected: FAIL — `../utils/cycle` does not exist yet. That is expected; the import lands in Task 5.
Do not stub it. Move to Task 5 and re-run this test at the end of it.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/types.ts apps/frontend/src/features/pnl-analytics/hooks/
git commit -m "feat(pnl-analytics): types and data hooks"
```

---

### Task 5: Frontend util — `utils/cycle.ts`

Cycle arithmetic and route naming. Task 4's hooks already import from here.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/cycle.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/cycle.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCycle`, `isValidCycle`, `cycleDateRange`, `previousCycle`, `routeKey`, `routeLabel`, `splitRouteKey`, `slaRouteKey`, `mapSlaRoutes`, `ORIGIN_LABELS`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/cycle.spec.ts`:

```ts
import {
  cycleDateRange,
  isValidCycle,
  mapSlaRoutes,
  previousCycle,
  routeKey,
  routeLabel,
  slaRouteKey,
  splitRouteKey,
} from './cycle'

describe('cycle arithmetic', () => {
  it('splits a half-cycle into its calendar days', () => {
    expect(cycleDateRange('2026-05-1H')).toEqual({ start: '2026-05-01', end: '2026-05-15' })
    // The second half runs to the real month end, which February makes non-obvious.
    expect(cycleDateRange('2026-02-2H')).toEqual({ start: '2026-02-16', end: '2026-02-28' })
    expect(cycleDateRange('2026-05-2H')).toEqual({ start: '2026-05-16', end: '2026-05-31' })
  })

  it('steps back one half-cycle, crossing month and year boundaries', () => {
    expect(previousCycle('2026-05-2H')).toBe('2026-05-1H')
    expect(previousCycle('2026-05-1H')).toBe('2026-04-2H')
    expect(previousCycle('2026-01-1H')).toBe('2025-12-2H')
  })

  it('rejects labels that are not half-cycles', () => {
    expect(isValidCycle('2026-05-1H')).toBe(true)
    expect(isValidCycle('2026-13-1H')).toBe(false)
    expect(isValidCycle('2026-05')).toBe(false)
    expect(isValidCycle('')).toBe(false)
  })
})

describe('route naming', () => {
  it('builds and splits a route key', () => {
    expect(routeKey('Jabo', 'Denpasar')).toBe('Jabo|Denpasar')
    expect(splitRouteKey('Jabo|Denpasar')).toEqual({ origin: 'Jabo', dest: 'Denpasar' })
  })

  it('labels the Jakarta hub by its airport code', () => {
    expect(routeLabel('Jabo', 'Denpasar')).toBe('CGK → Denpasar')
    // Anything without a mapping keeps its own name rather than disappearing.
    expect(routeLabel('Surabaya', 'Batam')).toBe('Surabaya → Batam')
  })
})

describe('mapSlaRoutes', () => {
  it('maps SLA route strings onto P&L route keys', () => {
    // SLA names the Jakarta hub "Kosambi" and suffixes every station with " DC".
    expect(slaRouteKey('Kosambi DC - Aceh DC')).toBe('Jabo|Aceh')
  })

  it('reports the strings it could not map instead of dropping them', () => {
    const result = mapSlaRoutes([
      { route: 'Kosambi DC - Aceh DC', percentage: 90, onTimeWeight: 9, lateWeight: 1 },
      { route: 'nonsense', percentage: 50, onTimeWeight: 1, lateWeight: 1 },
    ])
    expect(Array.from(result.mapped.keys())).toEqual(['Jabo|Aceh'])
    expect(result.unmapped).toEqual(['nonsense'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/cycle.spec.ts`
Expected: FAIL — cannot find module `./cycle`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/cycle.ts`:

```ts
/** Billing-cycle arithmetic and route naming. Pure functions; no React, no network. */

const CYCLE_RE = /^(\d{4})-(\d{2})-([12])H$/

export function isValidCycle(label: string): boolean {
  const m = CYCLE_RE.exec(label ?? '')
  if (!m) return false
  const month = Number(m[2])
  return month >= 1 && month <= 12
}

export function parseCycle(label: string): { year: number; month: number; half: number } {
  const m = CYCLE_RE.exec(label ?? '')
  if (!m) throw new Error(`Invalid cycle label: ${label}`)
  return { year: Number(m[1]), month: Number(m[2]), half: Number(m[3]) }
}

const pad = (n: number) => String(n).padStart(2, '0')

// UTC arithmetic: Date.UTC(y, month, 0) is the last day of `month` (1-based), so this never
// shifts with the machine timezone.
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function cycleDateRange(label: string): { start: string; end: string } {
  const { year, month, half } = parseCycle(label)
  const prefix = `${year}-${pad(month)}-`
  return half === 1
    ? { start: `${prefix}01`, end: `${prefix}15` }
    : { start: `${prefix}16`, end: `${prefix}${pad(daysInMonth(year, month))}` }
}

export function previousCycle(label: string): string {
  const { year, month, half } = parseCycle(label)
  if (half === 2) return `${year}-${pad(month)}-1H`
  return month === 1 ? `${year - 1}-12-2H` : `${year}-${pad(month - 1)}-2H`
}

/** P&L station names → the short label the business uses. Anything absent maps to itself. */
export const ORIGIN_LABELS: Record<string, string> = {
  Jabo: 'CGK',
  Jabodetabek: 'Jabodetabek',
}

/** SLA names the Jakarta hub "Kosambi" where P&L names it "Jabo". */
const SLA_STATION_ALIASES: Record<string, string> = { Kosambi: 'Jabo' }

export const routeKey = (origin: string, dest: string) => `${origin}|${dest}`

export const routeLabel = (origin: string, dest: string) =>
  `${ORIGIN_LABELS[origin] ?? origin} → ${dest}`

export function splitRouteKey(key: string): { origin: string; dest: string } {
  const i = key.indexOf('|')
  return i < 0 ? { origin: key, dest: '' } : { origin: key.slice(0, i), dest: key.slice(i + 1) }
}

/** "Kosambi DC - Aceh DC" → "Jabo|Aceh". Returns null when the string is not a route pair. */
export function slaRouteKey(slaRoute: string): string | null {
  if (typeof slaRoute !== 'string') return null
  const parts = slaRoute.split(' - ')
  if (parts.length !== 2) return null
  const clean = (s: string) => {
    const name = s.trim().replace(/\s+DC$/i, '').trim()
    return SLA_STATION_ALIASES[name] ?? name
  }
  const origin = clean(parts[0])
  const dest = clean(parts[1])
  if (!origin || !dest) return null
  return routeKey(origin, dest)
}

export interface SlaBreakdownRow {
  route: string
  percentage: number
  onTimeWeight: number
  lateWeight: number
}

/**
 * Unmapped strings are reported rather than dropped: the two systems name stations differently,
 * and a silently missing route reads as "this route has no SLA problem".
 */
export function mapSlaRoutes(rows: SlaBreakdownRow[] | undefined): {
  mapped: Map<string, SlaBreakdownRow>
  unmapped: string[]
} {
  const mapped = new Map<string, SlaBreakdownRow>()
  const unmapped: string[] = []
  for (const row of rows ?? []) {
    const key = slaRouteKey(row.route)
    if (key) mapped.set(key, row)
    else unmapped.push(row.route)
  }
  return { mapped, unmapped }
}
```

- [ ] **Step 4: Run both tests to verify they pass**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics`
Expected: PASS — `cycle.spec.ts` and `useAnalytics.spec.ts` both green

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/cycle.ts apps/frontend/src/features/pnl-analytics/utils/cycle.spec.ts
git commit -m "feat(pnl-analytics): cycle and route-naming utils"
```

---

### Task 6: Frontend util — `utils/series.ts`

The heart of the tab: fold the per-(date × route) response into a daily series, scoped or not, and
derive KPIs from it. Every section downstream reads a `SeriesDay[]` produced here.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/series.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/series.spec.ts`

**Interfaces:**
- Consumes: `AnalyticsDailySeries`, `SeriesDay`, `Kpis`, `KpiSet`, `KPI_KEYS` from `../types`; `routeKey` from `./cycle`.
- Produces: `foldByRoute(series, routeKeys | null): SeriesDay[]`, `foldAll(series): SeriesDay[]`, `routeKeysIn(series): string[]`, `sliceSeries(days, start?, end?): SeriesDay[]`, `kpis(days): Kpis`, `withDelta(value, prev): KpiDelta`, `kpisWithDelta(curr, prev | null): KpiSet`, `completeRevenueShare(days): number`, `dailyOutliers(days, opts?): Outlier[]`, `costComposition(days): CostComposition`, `COST_COMPONENTS`, `UNATTRIBUTED`, `num`, `div`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/series.spec.ts`:

```ts
import {
  completeRevenueShare,
  costComposition,
  dailyOutliers,
  foldAll,
  foldByRoute,
  kpis,
  kpisWithDelta,
  routeKeysIn,
  sliceSeries,
} from './series'
import { AnalyticsDailyRow, AnalyticsDailySeries } from '../types'

const row = (over: Partial<AnalyticsDailyRow>): AnalyticsDailyRow => ({
  date: '2026-05-01',
  origin: 'Jabo',
  dest: 'Denpasar',
  revenue: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  weight: 0,
  incompleteTos: 0,
  ...over,
})

const series: AnalyticsDailySeries = {
  dates: ['2026-05-01', '2026-05-02', '2026-05-03'],
  rows: [
    row({ date: '2026-05-01', dest: 'Denpasar', revenue: 1000, costSmu: 400, costRa: 100, weight: 200 }),
    row({ date: '2026-05-01', dest: 'Batam', revenue: 500, costSmu: 300, weight: 100 }),
    row({ date: '2026-05-02', dest: 'Denpasar', revenue: 2000, costSmu: 800, costSgOut: 200, weight: 400, incompleteTos: 3 }),
    // 2026-05-03 carries no rows: a calendar day with no shipments.
  ],
}

describe('foldAll', () => {
  it('emits one day per calendar date, including days with no rows', () => {
    const days = foldAll(series)
    expect(days.map((d) => d.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
    expect(days[2]).toMatchObject({ revenue: 0, cost: 0, weight: 0, incompleteTos: 0 })
  })

  it('sums every route into each day, with cost as the four components', () => {
    const days = foldAll(series)
    expect(days[0]).toMatchObject({
      revenue: 1500,
      costSmu: 700,
      costRa: 100,
      cost: 800,
      margin: 700,
      weight: 300,
    })
  })
})

describe('foldByRoute', () => {
  it('sums only the selected routes and ignores the rest', () => {
    const days = foldByRoute(series, ['Jabo|Denpasar'])
    expect(days[0]).toMatchObject({ revenue: 1000, cost: 500, weight: 200 })
    // The Batam row is excluded entirely, not merely zeroed.
    expect(days[0].revenue).not.toBe(1500)
  })

  it('folds every route when given null', () => {
    expect(foldByRoute(series, null)).toEqual(foldAll(series))
  })

  it('returns zeroed days when the selection matches nothing', () => {
    const days = foldByRoute(series, ['Jabo|Nowhere'])
    expect(days).toHaveLength(3)
    expect(days.every((d) => d.revenue === 0 && d.weight === 0)).toBe(true)
  })
})

describe('routeKeysIn', () => {
  it('lists the distinct routes the period carries', () => {
    expect(routeKeysIn(series).sort()).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
  })
})

describe('kpis', () => {
  it('derives per-day and per-kg figures from the folded series', () => {
    const k = kpis(foldAll(series))
    expect(k.days).toBe(3)
    expect(k.revenue).toBe(3500)
    expect(k.cost).toBe(1800)
    expect(k.margin).toBe(1700)
    expect(k.weight).toBe(700)
    expect(k.revenuePerDay).toBeCloseTo(3500 / 3, 6)
    expect(k.marginPerKg).toBeCloseTo(1700 / 700, 6)
    expect(k.marginPct).toBeCloseTo((1700 / 3500) * 100, 6)
  })

  it('reports 0 rather than Infinity when there is no weight', () => {
    const k = kpis([])
    expect(k.revenuePerKg).toBe(0)
    expect(k.marginPct).toBe(0)
  })
})

describe('kpisWithDelta', () => {
  it('computes the percentage change against the baseline', () => {
    const curr = kpis(foldAll(series))
    const prev = kpis(foldByRoute(series, ['Jabo|Denpasar']))
    const set = kpisWithDelta(curr, prev)
    expect(set.revenue.value).toBe(curr.revenue)
    expect(set.revenue.prev).toBe(prev.revenue)
    expect(set.revenue.deltaPct).toBeCloseTo(((curr.revenue - prev.revenue) / prev.revenue) * 100, 6)
  })

  it('reports deltaPct as null, not 0, when there is no usable baseline', () => {
    const curr = kpis(foldAll(series))
    expect(kpisWithDelta(curr, null).revenue.deltaPct).toBeNull()
    // A zero baseline is not a usable one: (x - 0) / 0 is not a percentage change.
    const zero = kpis([])
    expect(kpisWithDelta(curr, zero).revenue.deltaPct).toBeNull()
  })
})

describe('completeRevenueShare', () => {
  it('is the share of revenue falling on days with no incomplete TOs', () => {
    // 1500 of 3500 sits on 2026-05-01, the only day with revenue and incompleteTos === 0.
    expect(completeRevenueShare(foldAll(series))).toBeCloseTo((1500 / 3500) * 100, 6)
  })

  it('is 0 for an empty series rather than NaN', () => {
    expect(completeRevenueShare([])).toBe(0)
  })
})

describe('dailyOutliers', () => {
  it('flags a day whose tonnage dwarfs the median — the signature of a bulk backfill', () => {
    const days = foldAll({
      dates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04'],
      rows: [
        row({ date: '2026-05-01', weight: 100 }),
        row({ date: '2026-05-02', weight: 110 }),
        row({ date: '2026-05-03', weight: 90 }),
        row({ date: '2026-05-04', weight: 5000 }),
      ],
    })
    const out = dailyOutliers(days)
    expect(out.map((o) => o.date)).toEqual(['2026-05-04'])
    expect(out[0].ratio).toBeGreaterThan(5)
  })

  it('reports nothing below four days with weight — too few to have a meaningful median', () => {
    const days = foldAll({
      dates: ['2026-05-01', '2026-05-02'],
      rows: [row({ date: '2026-05-01', weight: 10 }), row({ date: '2026-05-02', weight: 9000 })],
    })
    expect(dailyOutliers(days)).toEqual([])
  })
})

describe('costComposition', () => {
  it('splits total cost into the four components with shares and per-kg figures', () => {
    const c = costComposition(foldAll(series))
    expect(c.total).toBe(1800)
    const smu = c.components.find((x) => x.key === 'smu')!
    expect(smu.value).toBe(1500)
    expect(smu.pct).toBeCloseTo((1500 / 1800) * 100, 6)
    expect(smu.perKg).toBeCloseTo(1500 / 700, 6)
    // Every component is listed even at zero, so the stacked bar keeps a stable legend.
    expect(c.components.map((x) => x.key)).toEqual(['smu', 'ra', 'sgOut', 'sgIn'])
  })
})

describe('sliceSeries', () => {
  it('keeps only the days inside the bounds, inclusive', () => {
    const days = foldAll(series)
    expect(sliceSeries(days, '2026-05-02', '2026-05-03').map((d) => d.date)).toEqual([
      '2026-05-02',
      '2026-05-03',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/series.spec.ts`
Expected: FAIL — cannot find module `./series`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/series.ts`:

```ts
/**
 * Folding the per-(date × route) response into a daily series, and the KPIs derived from it.
 *
 * The response is per-route on purpose: the Routes & Groups section needs a daily series for every
 * route, and changing the scope selector must not cost a request. Everything below is a fold over
 * the same rows.
 */

import {
  AnalyticsDailySeries,
  KPI_KEYS,
  KpiDelta,
  KpiSet,
  Kpis,
  SeriesDay,
} from '../types'
import { routeKey } from './cycle'

export const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)
export const div = (a: number, b: number): number => (b ? a / b : 0)

/** The API's marker for "not attributed" — an em dash, not an empty string. */
export const UNATTRIBUTED = '—'

export const COST_COMPONENTS = [
  { key: 'smu', field: 'costSmu', label: 'SMU' },
  { key: 'ra', field: 'costRa', label: 'RA' },
  { key: 'sgOut', field: 'costSgOut', label: 'SG Outgoing' },
  { key: 'sgIn', field: 'costSgIn', label: 'Incoming (SG In)' },
] as const

function emptyDay(date: string): SeriesDay {
  return {
    date,
    revenue: 0,
    costSmu: 0,
    costRa: 0,
    costSgOut: 0,
    costSgIn: 0,
    incompleteTos: 0,
    cost: 0,
    margin: 0,
    weight: 0,
  }
}

/**
 * Folds the response into one day per calendar date. `keys` narrows to those route keys; null
 * folds every route. Days with no rows are still emitted at zero — the period's "per day" figures
 * divide by the calendar length, not by the number of days that happened to ship.
 */
export function foldByRoute(
  series: AnalyticsDailySeries | undefined,
  keys: string[] | null,
): SeriesDay[] {
  const dates = series?.dates ?? []
  const byDate = new Map(dates.map((d) => [d, emptyDay(d)]))
  const wanted = keys ? new Set(keys) : null

  for (const r of series?.rows ?? []) {
    if (wanted && !wanted.has(routeKey(r.origin, r.dest))) continue
    const day = byDate.get(r.date)
    // A row on a date the calendar does not list cannot be placed. It should not happen — the
    // backend derives both from the same filter — so it is dropped rather than invented into the
    // series, where it would show up as an unexplained extra day.
    if (!day) continue
    day.revenue += num(r.revenue)
    day.costSmu += num(r.costSmu)
    day.costRa += num(r.costRa)
    day.costSgOut += num(r.costSgOut)
    day.costSgIn += num(r.costSgIn)
    day.incompleteTos += num(r.incompleteTos)
    day.weight += num(r.weight)
  }

  return dates.map((d) => {
    const day = byDate.get(d)!
    // Cost is ALWAYS the component sum. The summary endpoint's totalCost disagrees with it and is
    // shown only in Data Health, as a diagnostic.
    day.cost = day.costSmu + day.costRa + day.costSgOut + day.costSgIn
    day.margin = day.revenue - day.cost
    return day
  })
}

export function foldAll(series: AnalyticsDailySeries | undefined): SeriesDay[] {
  return foldByRoute(series, null)
}

export function routeKeysIn(series: AnalyticsDailySeries | undefined): string[] {
  const keys = new Set<string>()
  for (const r of series?.rows ?? []) keys.add(routeKey(r.origin, r.dest))
  return Array.from(keys)
}

export function sliceSeries(days: SeriesDay[], start?: string, end?: string): SeriesDay[] {
  return days.filter((d) => (!start || d.date >= start) && (!end || d.date <= end))
}

export function kpis(days: SeriesDay[]): Kpis {
  const count = days.length
  const sum = (f: (d: SeriesDay) => number) => days.reduce((s, d) => s + num(f(d)), 0)
  const weight = sum((d) => d.weight)
  const revenue = sum((d) => d.revenue)
  const cost = sum((d) => d.cost)
  const margin = revenue - cost
  return {
    days: count,
    weight,
    weightPerDay: div(weight, count),
    revenue,
    revenuePerDay: div(revenue, count),
    revenuePerKg: div(revenue, weight),
    cost,
    costPerDay: div(cost, count),
    costPerKg: div(cost, weight),
    margin,
    marginPerDay: div(margin, count),
    marginPerKg: div(margin, weight),
    marginPct: div(margin, revenue) * 100,
  }
}

/**
 * `deltaPct` is null — never 0 — when there is no usable baseline. A zero baseline gives no
 * percentage change, and rendering that as 0% would claim the figure held steady.
 */
export function withDelta(value: number, prev: number | null): KpiDelta {
  const usable = typeof prev === 'number' && isFinite(prev) && prev !== 0
  return { value, prev: prev ?? null, deltaPct: usable ? ((value - prev!) / prev!) * 100 : null }
}

export function kpisWithDelta(curr: Kpis, prev: Kpis | null): KpiSet {
  const out = {} as KpiSet
  for (const k of KPI_KEYS) out[k] = withDelta(num(curr[k]), prev ? num(prev[k]) : null)
  return out
}

/**
 * Share of revenue falling on days whose cost is fully attributed. This is the measure the tab
 * gates on: whether a route has any cost at all cannot tell a real margin from an artifact.
 */
export function completeRevenueShare(days: SeriesDay[]): number {
  const total = days.reduce((s, d) => s + num(d.revenue), 0)
  const clean = days.filter((d) => !d.incompleteTos).reduce((s, d) => s + num(d.revenue), 0)
  return div(clean, total) * 100
}

export interface Outlier {
  date: string
  weight: number
  median: number
  ratio: number
  sharePct: number
}

/**
 * A single day holding a large share of a period's tonnage is almost always a bulk backfill rather
 * than a real shipping day. Named here so the health panel can report the cause, not the symptom.
 * The comparison is against the MEDIAN: one huge day drags a mean above every normal day, hiding
 * itself.
 */
export function dailyOutliers(days: SeriesDay[], opts?: { factor?: number }): Outlier[] {
  const factor = opts?.factor ?? 5
  const rows = days.filter((d) => num(d.weight) > 0)
  if (rows.length < 4) return []
  const sorted = rows.map((d) => num(d.weight)).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  if (!median) return []
  const total = rows.reduce((s, d) => s + num(d.weight), 0)
  return rows
    .filter((d) => num(d.weight) > median * factor)
    .map((d) => ({
      date: d.date,
      weight: num(d.weight),
      median,
      ratio: div(num(d.weight), median),
      sharePct: div(num(d.weight), total) * 100,
    }))
    .sort((a, b) => b.weight - a.weight)
}

export interface CostComponentShare {
  key: string
  label: string
  value: number
  pct: number
  perKg: number
}

export interface CostComposition {
  total: number
  totalPerKg: number
  components: CostComponentShare[]
}

export function costComposition(days: SeriesDay[]): CostComposition {
  const weight = days.reduce((s, d) => s + num(d.weight), 0)
  const values = COST_COMPONENTS.map((c) => ({
    key: c.key as string,
    label: c.label as string,
    value: days.reduce((s, d) => s + num(d[c.field] as number), 0),
  }))
  const total = values.reduce((s, v) => s + v.value, 0)
  return {
    total,
    totalPerKg: div(total, weight),
    components: values.map((v) => ({
      key: v.key,
      label: v.label,
      value: v.value,
      pct: div(v.value, total) * 100,
      perKg: div(v.value, weight),
    })),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/series.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/series.ts apps/frontend/src/features/pnl-analytics/utils/series.spec.ts
git commit -m "feat(pnl-analytics): series folding and KPI utils"
```

---

### Task 7: Frontend util — `utils/dq.ts`

The data-quality report and the coverage gate.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/dq.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/dq.spec.ts`

**Interfaces:**
- Consumes: `completeRevenueShare`, `num`, `div`, `UNATTRIBUTED` from `./series`; `mapSlaRoutes` from `./cycle`; `SeriesDay`, `SlaOverview` from `../types`.
- Produces: `COVERAGE_MIN`, `dqReport(input: DqInput): DqReport`, types `DqInput`, `DqReport`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/dq.spec.ts`:

```ts
import { COVERAGE_MIN, dqReport } from './dq'
import { SeriesDay } from '../types'

const day = (over: Partial<SeriesDay>): SeriesDay => ({
  date: '2026-05-01',
  revenue: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  cost: 0,
  margin: 0,
  weight: 0,
  ...over,
})

// Every route carries cost, so the route-level measure certifies this period as 100% covered —
// while 85% of its revenue sits on a day whose TO rows never completed. This is the exact shape
// of a real artifact period, and the reason the gate is day-level.
const artifactSeries: SeriesDay[] = [
  day({ date: '2026-05-01', revenue: 150, cost: 100 }),
  day({ date: '2026-05-02', revenue: 850, cost: 0, incompleteTos: 40 }),
]

const healthySeries: SeriesDay[] = [
  day({ date: '2026-05-01', revenue: 500, cost: 400 }),
  day({ date: '2026-05-02', revenue: 500, cost: 380 }),
]

const profitByRoute = [{ route: 'Jabo → Denpasar', totalRevenue: 1000, avgCostPerKg: 12 }]

describe('dqReport', () => {
  it('gates on the day-level measure, not route coverage', () => {
    const bad = dqReport({ profitByRoute, series: artifactSeries })
    // Route-level coverage calls this period fully covered...
    expect(bad.routeCoveragePct).toBe(100)
    // ...while the measure that gates says only 15% of revenue is trustworthy.
    expect(bad.completeDaysPct).toBeCloseTo(15, 6)
    expect(bad.coveragePct).toBeCloseTo(15, 6)
    expect(bad.coverageOk).toBe(false)
    expect(bad.level).toBe('bad')

    const good = dqReport({ profitByRoute, series: healthySeries })
    expect(good.coveragePct).toBe(100)
    expect(good.coverageOk).toBe(true)
  })

  it('falls back to route coverage when no series is supplied', () => {
    const report = dqReport({
      profitByRoute: [
        { route: 'Jabo → Denpasar', totalRevenue: 900, avgCostPerKg: 12 },
        { route: 'Jabo → Batam', totalRevenue: 100, avgCostPerKg: 0 },
      ],
    })
    expect(report.completeDaysPct).toBeNull()
    expect(report.coveragePct).toBeCloseTo(90, 6)
    expect(report.routesWithoutCost).toEqual(['Jabo → Batam'])
    expect(report.revenueWithoutCost).toBe(100)
  })

  it('reports the two cost sources as not comparable rather than as agreeing', () => {
    const report = dqReport({
      profitByRoute,
      series: healthySeries,
      costTotals: { smu: 500, ra: 100, sgOut: 100, sgIn: 80 },
      summary: { totalCost: 0 },
    })
    // A zero summary total gives no percentage to compare against — null, and not agreeing.
    expect(report.costSourceDelta.comparable).toBe(false)
    expect(report.costSourceDelta.deltaPct).toBeNull()
    expect(report.costSourceDelta.agrees).toBe(false)
    expect(report.level).toBe('bad')
  })

  it('treats two empty cost sources as agreeing', () => {
    const report = dqReport({
      profitByRoute,
      series: healthySeries,
      costTotals: { smu: 0, ra: 0, sgOut: 0, sgIn: 0 },
      summary: { totalCost: 0 },
    })
    expect(report.costSourceDelta.agrees).toBe(true)
    expect(report.level).toBe('ok')
  })

  it('warns when vendor or RA attribution is thin, or an SLA route will not map', () => {
    const report = dqReport({
      profitByRoute,
      series: healthySeries,
      costByVendor: [
        { vendor: 'ESP', totalWeight: 800 },
        { vendor: '—', totalWeight: 200 },
      ],
    })
    expect(report.vendorAttributedPct).toBeCloseTo(80, 6)
    expect(report.level).toBe('warn')

    const unmapped = dqReport({
      profitByRoute,
      series: healthySeries,
      sla: {
        summary: {
          alerts: {},
          otp: {
            percentage: 90,
            onTimeWeight: 9,
            lateWeight: 1,
            breakdown: [{ route: 'nonsense', percentage: 90, onTimeWeight: 9, lateWeight: 1 }],
          },
        },
      },
    })
    expect(unmapped.unmappedSlaRoutes).toEqual(['nonsense'])
    expect(unmapped.level).toBe('warn')
  })

  it('pins the coverage threshold', () => {
    expect(COVERAGE_MIN).toBe(95)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/dq.spec.ts`
Expected: FAIL — cannot find module `./dq`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/dq.ts`:

```ts
/**
 * Whether a period's numbers can be trusted, and why not when they cannot.
 *
 * The gate is day-level, not route-level. Every real period with a plausible margin has at least
 * 94% of its revenue on days whose cost is fully attributed; every artifact period has 15% or less
 * — while route-level coverage certifies both as "100% covered".
 */

import { SeriesDay, SlaOverview } from '../types'
import { mapSlaRoutes } from './cycle'
import { completeRevenueShare, div, num, UNATTRIBUTED } from './series'

export const COVERAGE_MIN = 95

const pct = (part: number, whole: number) => (whole ? (100 * part) / whole : 0)

function attributedPct(rows: Array<Record<string, unknown>>, nameField: string): number {
  const total = rows.reduce((s, r) => s + num(r.totalWeight), 0)
  const known = rows
    .filter((r) => r[nameField] && r[nameField] !== UNATTRIBUTED)
    .reduce((s, r) => s + num(r.totalWeight), 0)
  return pct(known, total)
}

export interface DqInput {
  profitByRoute?: Array<{ route: string; totalRevenue: number; avgCostPerKg: number }>
  series?: SeriesDay[]
  costTotals?: { smu: number; ra: number; sgOut: number; sgIn: number }
  summary?: { totalCost: number }
  costByVendor?: Array<{ vendor: string; totalWeight: number }>
  costByRa?: Array<{ name: string; totalWeight: number }>
  sla?: SlaOverview
  dataQuality?: Array<{ issue: string; rows: number; awbs: number }>
}

export interface DqReport {
  coveragePct: number
  coverageOk: boolean
  routeCoveragePct: number
  completeDaysPct: number | null
  cleanDays: number | null
  totalDays: number | null
  routesWithoutCost: string[]
  revenueWithoutCost: number
  costSourceDelta: {
    componentSum: number
    summaryTotal: number
    delta: number
    /** null means the two sources could not be compared — NOT that they agree. */
    deltaPct: number | null
    agrees: boolean
    comparable: boolean
  }
  vendorAttributedPct: number
  raAttributedPct: number
  unmappedSlaRoutes: string[]
  backendIssues: Array<{ issue: string; rows: number; awbs: number }>
  level: 'ok' | 'warn' | 'bad'
}

export function dqReport(input: DqInput): DqReport {
  const profitByRoute = input.profitByRoute ?? []
  const totalRevenue = profitByRoute.reduce((s, r) => s + num(r.totalRevenue), 0)
  const noCost = profitByRoute.filter((r) => !r.avgCostPerKg)
  const revenueWithoutCost = noCost.reduce((s, r) => s + num(r.totalRevenue), 0)
  // Whether a route has ANY cost attributed. Kept as a secondary diagnostic — which routes have no
  // rate card — but it cannot tell a healthy period from one whose "covered" revenue landed on days
  // that never completed.
  const routeCoveragePct = pct(totalRevenue - revenueWithoutCost, totalRevenue)

  const series = input.series ?? null
  let completeDaysPct: number | null = null
  let cleanDays: number | null = null
  let totalDays: number | null = null
  if (series) {
    totalDays = series.length
    cleanDays = series.filter((d) => !d.incompleteTos).length
    completeDaysPct = completeRevenueShare(series)
  }

  // Everything below gates on this. It is the day-level measure when a series is available, and
  // falls back to the route-level number for callers that have no day-level data.
  const coveragePct = series ? completeDaysPct! : routeCoveragePct

  const ct = input.costTotals ?? { smu: 0, ra: 0, sgOut: 0, sgIn: 0 }
  const componentSum = num(ct.smu) + num(ct.ra) + num(ct.sgOut) + num(ct.sgIn)
  const summaryTotal = num(input.summary?.totalCost)
  const delta = componentSum - summaryTotal
  const comparable = summaryTotal !== 0
  const bothEmpty = componentSum === 0 && summaryTotal === 0
  const deltaPct = comparable ? Math.abs(pct(delta, summaryTotal)) : null
  const agrees = bothEmpty ? true : comparable ? deltaPct! < 1 : false

  const unmapped = mapSlaRoutes(input.sla?.summary?.otp?.breakdown).unmapped
  const vendorAttributedPct = attributedPct(input.costByVendor ?? [], 'vendor')
  const raAttributedPct = attributedPct(input.costByRa ?? [], 'name')

  const coverageOk = coveragePct >= COVERAGE_MIN
  let level: DqReport['level'] = 'ok'
  if (!coverageOk || (comparable && deltaPct! >= 5) || (!comparable && !agrees)) level = 'bad'
  else if (
    (comparable && deltaPct! >= 1) ||
    vendorAttributedPct < 90 ||
    raAttributedPct < 90 ||
    unmapped.length
  ) {
    level = 'warn'
  }

  return {
    coveragePct,
    coverageOk,
    routeCoveragePct,
    completeDaysPct,
    cleanDays,
    totalDays,
    routesWithoutCost: noCost.map((r) => r.route),
    revenueWithoutCost,
    costSourceDelta: { componentSum, summaryTotal, delta, deltaPct, agrees, comparable },
    vendorAttributedPct,
    raAttributedPct,
    unmappedSlaRoutes: unmapped,
    backendIssues: input.dataQuality ?? [],
    level,
  }
}
```

Note on the empty-input case: `attributedPct([])` divides by zero and returns 0 via `pct`, which
would push `level` to `'warn'` for a period whose vendor breakdown simply has not loaded. That is
why the `costByVendor`/`costByRa` tests above pass real rows — and why `dqReport` is only called
from `buildAnalyticsContext` (Task 12) once those queries have resolved.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/dq.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/dq.ts apps/frontend/src/features/pnl-analytics/utils/dq.spec.ts
git commit -m "feat(pnl-analytics): data-quality report and coverage gate"
```

---

### Task 8: Frontend util — `utils/weekday.ts`

Day-of-week profile, campaign dates, and the campaign-rule storage format.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/weekday.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/weekday.spec.ts`

**Interfaces:**
- Consumes: `SeriesDay`, `Campaign`, `CampaignRule` from `../types`; `num`, `div` from `./series`.
- Produces: `WEEKDAY_LABELS`, `isoWeekday`, `weekdayProfile`, `DEFAULT_CAMPAIGNS`, `campaignDates`, `campaignWindows`, `campaignSummary`, `parseCampaignInput`, `serializeCampaigns`, `loadCampaigns`, `saveCampaigns`, `CAMPAIGN_STORAGE_KEY`, types `WeekdayBucket`, `CampaignWindow`, `CampaignSummaryRow`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/weekday.spec.ts`:

```ts
import {
  CAMPAIGN_STORAGE_KEY,
  DEFAULT_CAMPAIGNS,
  campaignDates,
  campaignSummary,
  campaignWindows,
  isoWeekday,
  loadCampaigns,
  parseCampaignInput,
  saveCampaigns,
  serializeCampaigns,
  weekdayProfile,
} from './weekday'
import { SeriesDay } from '../types'

const day = (date: string, weight: number, over: Partial<SeriesDay> = {}): SeriesDay => ({
  date,
  revenue: weight * 10,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  cost: weight * 6,
  margin: weight * 4,
  weight,
  ...over,
})

// 2026-08-01 is a Saturday, so this run covers every weekday at least once.
const series: SeriesDay[] = Array.from({ length: 14 }, (_, i) =>
  day(`2026-08-${String(i + 1).padStart(2, '0')}`, 100),
)

describe('isoWeekday', () => {
  it('numbers Monday as 0, parsing the date as UTC', () => {
    expect(isoWeekday('2026-08-03')).toBe(0) // Monday
    expect(isoWeekday('2026-08-09')).toBe(6) // Sunday
  })
})

describe('weekdayProfile', () => {
  it('returns all seven weekdays, even ones the period never saw', () => {
    const p = weekdayProfile([day('2026-08-03', 100)])
    expect(p).toHaveLength(7)
    expect(p[0]).toMatchObject({ weekday: 0, days: 1, weight: 100, avgWeight: 100 })
    // A weekday with no days averages 0, not NaN.
    expect(p[1]).toMatchObject({ days: 0, avgWeight: 0, avgMarginPct: 0 })
  })

  it('measures each weekday against the period average', () => {
    const heavy = series.map((d) => (isoWeekday(d.date) === 0 ? day(d.date, 300) : d))
    const p = weekdayProfile(heavy)
    expect(p[0].vsOverallPct).toBeGreaterThan(0)
    expect(p[1].vsOverallPct).toBeLessThan(0)
  })
})

describe('campaignDates', () => {
  it('matches double dates — 8.8 in August', () => {
    expect(campaignDates({ type: 'doubleDate' }, series)).toEqual(['2026-08-08'])
  })

  it('matches a fixed day of month, and returns nothing when the period misses it', () => {
    expect(campaignDates({ type: 'dayOfMonth', day: 3 }, series)).toEqual(['2026-08-03'])
    expect(campaignDates({ type: 'dayOfMonth', day: 25 }, series)).toEqual([])
  })
})

describe('campaignWindows', () => {
  it('excludes campaign-affected days from the baseline', () => {
    // Every day is 100 except the campaign day and its ±3 neighbours, which are 500. If the
    // baseline included those days it would be dragged upward and understate the lift.
    const inflated = series.map((d) =>
      d.date >= '2026-08-05' && d.date <= '2026-08-11' ? day(d.date, 500) : d,
    )
    const [w] = campaignWindows(inflated, [{ label: 'Double Date', rule: { type: 'doubleDate' } }])
    expect(w.baselineWeight).toBe(100)
    const peak = w.days.find((d) => d.offset === 0)!
    expect(peak.lift).toBeCloseTo(400, 6)
  })

  it('uses the median of quiet days, so one backfill does not swallow the lift', () => {
    const withBackfill = series.map((d) => (d.date === '2026-08-14' ? day(d.date, 100000) : d))
    const [w] = campaignWindows(withBackfill, [
      { label: 'Double Date', rule: { type: 'doubleDate' } },
    ])
    expect(w.baselineWeight).toBe(100)
  })

  it('returns nothing when no campaign date falls inside the period', () => {
    expect(campaignWindows(series, [{ label: 'X', rule: { type: 'dayOfMonth', day: 25 } }])).toEqual(
      [],
    )
  })

  it('drops window offsets that fall outside the period rather than inventing days', () => {
    const [w] = campaignWindows(series, [{ label: 'Day 2', rule: { type: 'dayOfMonth', day: 2 } }])
    // offsets -3 and -2 would land on 2026-07-30/31, outside the series.
    expect(w.days.map((d) => d.offset)).toEqual([-1, 0, 1, 2, 3])
  })
})

describe('campaignSummary', () => {
  it('averages the lift per offset across every occurrence of a label', () => {
    const spiky = series.map((d) =>
      d.date === '2026-08-08' || d.date === '2026-08-03' ? day(d.date, 300) : d,
    )
    const windows = campaignWindows(spiky, [
      { label: 'Double Date', rule: { type: 'doubleDate' } },
      { label: 'Day 3', rule: { type: 'dayOfMonth', day: 3 } },
    ])
    const summary = campaignSummary(windows)
    expect(summary.map((s) => s.label).sort()).toEqual(['Day 3', 'Double Date'])
    const dd = summary.find((s) => s.label === 'Double Date')!
    expect(dd.peakOffset).toBe(0)
  })
})

describe('campaign rule storage', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips through the text format the editor uses', () => {
    expect(serializeCampaigns(DEFAULT_CAMPAIGNS)).toBe('double,25')
    expect(parseCampaignInput('double, 25')).toEqual([
      { label: 'Double Date', rule: { type: 'doubleDate' } },
      { label: 'Day 25', rule: { type: 'dayOfMonth', day: 25 } },
    ])
  })

  it('drops entries that are neither "double" nor a day of the month', () => {
    expect(parseCampaignInput('double, banana, 40, 0, 25')).toEqual([
      { label: 'Double Date', rule: { type: 'doubleDate' } },
      { label: 'Day 25', rule: { type: 'dayOfMonth', day: 25 } },
    ])
  })

  it('falls back to the defaults rather than failing to render on unusable storage', () => {
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, 'not json')
    expect(loadCampaigns()).toEqual(DEFAULT_CAMPAIGNS)
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, '[{"label":"x","rule":{"type":"nope"}}]')
    expect(loadCampaigns()).toEqual(DEFAULT_CAMPAIGNS)
  })

  it('persists and reads back a saved list', () => {
    const custom = [{ label: 'Day 12', rule: { type: 'dayOfMonth' as const, day: 12 } }]
    saveCampaigns(custom)
    expect(loadCampaigns()).toEqual(custom)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/weekday.spec.ts`
Expected: FAIL — cannot find module `./weekday`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/weekday.ts`:

```ts
/**
 * Day-of-week shape and campaign impact.
 *
 * Both answer the same question in different frames: which days carry the tonnage, and does a
 * campaign date actually move it.
 */

import { Campaign, CampaignRule, SeriesDay } from '../types'
import { div, num } from './series'

export const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/** 0 = Monday. Parsed as UTC so the weekday never shifts with the machine's timezone. */
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return (d.getUTCDay() + 6) % 7
}

export interface WeekdayBucket {
  weekday: number
  label: string
  days: number
  weight: number
  avgWeight: number
  avgMargin: number
  avgMarginPct: number
  vsOverallPct: number
}

export function weekdayProfile(series: SeriesDay[]): WeekdayBucket[] {
  const buckets = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    days: 0,
    weight: 0,
    margin: 0,
    revenue: 0,
  }))
  for (const d of series) {
    const b = buckets[isoWeekday(d.date)]
    if (!b) continue
    b.days += 1
    b.weight += num(d.weight)
    b.margin += num(d.margin)
    b.revenue += num(d.revenue)
  }
  const overallAvg = div(
    series.reduce((s, d) => s + num(d.weight), 0),
    series.length,
  )
  return buckets.map((b) => ({
    weekday: b.weekday,
    label: b.label,
    days: b.days,
    weight: b.weight,
    avgWeight: div(b.weight, b.days),
    avgMargin: div(b.margin, b.days),
    avgMarginPct: div(b.margin, b.revenue) * 100,
    vsOverallPct: overallAvg ? ((div(b.weight, b.days) - overallAvg) / overallAvg) * 100 : 0,
  }))
}

export const DEFAULT_CAMPAIGNS: Campaign[] = [
  { label: 'Double Date', rule: { type: 'doubleDate' } },
  { label: 'Payday (25th)', rule: { type: 'dayOfMonth', day: 25 } },
]

export function campaignDates(rule: CampaignRule, series: SeriesDay[]): string[] {
  return series
    .map((d) => d.date)
    .filter((date) => {
      const month = Number(date.slice(5, 7))
      const day = Number(date.slice(8, 10))
      if (rule.type === 'doubleDate') return month === day
      if (rule.type === 'dayOfMonth') return day === rule.day
      return false
    })
}

function shiftDate(dateStr: string, offset: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

export interface CampaignWindow {
  label: string
  date: string
  baselineWeight: number
  days: Array<{ offset: number; date: string; weight: number; lift: number }>
}

export function campaignWindows(
  series: SeriesDay[],
  campaigns: Campaign[],
  opts?: { before?: number; after?: number },
): CampaignWindow[] {
  const before = opts?.before ?? 3
  const after = opts?.after ?? 3
  const byDate = new Map(series.map((d) => [d.date, d]))

  const hits: Array<{ label: string; date: string }> = []
  for (const c of campaigns ?? []) {
    for (const date of campaignDates(c.rule, series)) hits.push({ label: c.label, date })
  }
  if (!hits.length) return []

  // The baseline must exclude campaign-affected days, otherwise a big campaign inflates the very
  // number it is compared against. The baseline itself is the MEDIAN, not the mean, of those quiet
  // days: one backfilled day among them would drag a mean far above every normal day and
  // understate every lift.
  const inWindow = new Set<string>()
  for (const h of hits) {
    for (let o = -before; o <= after; o++) inWindow.add(shiftDate(h.date, o))
  }
  const quietWeights = series
    .filter((d) => !inWindow.has(d.date))
    .map((d) => num(d.weight))
    .sort((a, b) => a - b)
  const qmid = Math.floor(quietWeights.length / 2)
  const baselineWeight = quietWeights.length
    ? quietWeights.length % 2
      ? quietWeights[qmid]
      : (quietWeights[qmid - 1] + quietWeights[qmid]) / 2
    : 0

  return hits.map((h) => {
    const days: CampaignWindow['days'] = []
    for (let o = -before; o <= after; o++) {
      const date = shiftDate(h.date, o)
      const d = byDate.get(date)
      // A day outside the period is skipped, not zero-filled: a zero would read as "no shipments
      // that day" rather than "the period does not reach that far".
      if (!d) continue
      days.push({
        offset: o,
        date,
        weight: num(d.weight),
        lift: baselineWeight ? ((num(d.weight) - baselineWeight) / baselineWeight) * 100 : 0,
      })
    }
    return { label: h.label, date: h.date, baselineWeight, days }
  })
}

export interface CampaignSummaryRow {
  label: string
  byOffset: Array<{ offset: number; avgLift: number }>
  peakOffset: number | null
}

export function campaignSummary(windows: CampaignWindow[]): CampaignSummaryRow[] {
  const byLabel = new Map<string, CampaignWindow[]>()
  for (const w of windows ?? []) {
    const list = byLabel.get(w.label) ?? []
    list.push(w)
    byLabel.set(w.label, list)
  }

  const out: CampaignSummaryRow[] = []
  for (const [label, ws] of byLabel) {
    const acc = new Map<number, number[]>()
    for (const w of ws) {
      for (const d of w.days) {
        const list = acc.get(d.offset) ?? []
        list.push(d.lift)
        acc.set(d.offset, list)
      }
    }
    const byOffset = Array.from(acc.entries())
      .map(([offset, lifts]) => ({
        offset,
        avgLift: div(
          lifts.reduce((s, x) => s + x, 0),
          lifts.length,
        ),
      }))
      .sort((a, b) => a.offset - b.offset)
    const peak = byOffset.slice().sort((a, b) => b.avgLift - a.avgLift)[0]
    out.push({ label, byOffset, peakOffset: peak ? peak.offset : null })
  }
  return out
}

export const CAMPAIGN_STORAGE_KEY = 'esp.campaigns'

/** The editor's text format: comma-separated, "double" for twin dates, a number for a fixed day. */
export function serializeCampaigns(campaigns: Campaign[]): string {
  return campaigns
    .map((c) => (c.rule.type === 'doubleDate' ? 'double' : String(c.rule.day)))
    .join(',')
}

export function parseCampaignInput(text: string): Campaign[] {
  return (text ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t): Campaign | null => {
      if (t.toLowerCase() === 'double') return { label: 'Double Date', rule: { type: 'doubleDate' } }
      const day = Number(t)
      // Anything that is not a real day of the month is dropped rather than turned into a rule
      // that silently matches nothing.
      if (!Number.isInteger(day) || day < 1 || day > 31) return null
      return { label: `Day ${day}`, rule: { type: 'dayOfMonth', day } }
    })
    .filter((c): c is Campaign => c !== null)
}

function isCampaign(value: unknown): value is Campaign {
  if (!value || typeof value !== 'object') return false
  const c = value as Campaign
  if (typeof c.label !== 'string' || !c.rule || typeof c.rule !== 'object') return false
  if (c.rule.type === 'doubleDate') return true
  return c.rule.type === 'dayOfMonth' && Number.isInteger(c.rule.day)
}

/**
 * Stored values that cannot be parsed fall back to the defaults. A stale or hand-edited entry must
 * not take the section down with it.
 */
export function loadCampaigns(): Campaign[] {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_STORAGE_KEY)
    if (!raw) return DEFAULT_CAMPAIGNS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length || !parsed.every(isCampaign)) {
      return DEFAULT_CAMPAIGNS
    }
    return parsed as Campaign[]
  } catch {
    return DEFAULT_CAMPAIGNS
  }
}

export function saveCampaigns(campaigns: Campaign[]): void {
  try {
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaigns))
  } catch {
    // Private-mode browsers throw on write. The in-memory list still drives this session.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/weekday.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/weekday.ts apps/frontend/src/features/pnl-analytics/utils/weekday.spec.ts
git commit -m "feat(pnl-analytics): weekday profile and campaign windows"
```

---

### Task 9: Frontend util — `utils/share.ts`

The "who carried what" tables (sections 6–9) and the self-operate gap.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/share.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/share.spec.ts`

**Interfaces:**
- Consumes: `num`, `div`, `UNATTRIBUTED` from `./series`; `PnlVendorCostItem` from `@/features/pnl/hooks/usePnl`.
- Produces: `buildShare`, `shareTable`, `vendorExecution`, `airlineShare`, `selfOperateGap`, types `ShareRow`, `ShareResult`, `SelfOperateRow`, `SelfOperateResult`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/share.spec.ts`:

```ts
import { airlineShare, buildShare, selfOperateGap, shareTable, vendorExecution } from './share'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'

describe('buildShare', () => {
  it('ranks by weight but sorts the unattributed bucket last', () => {
    const { rows, attributedPct } = buildShare([
      { name: '—', weight: 500, cost: 5000 },
      { name: 'Lion', weight: 300, cost: 2400 },
      { name: 'Garuda', weight: 200, cost: 2000 },
    ])
    // The unattributed bucket is the heaviest, and still must not head the ranking.
    expect(rows.map((r) => r.name)).toEqual(['Lion', 'Garuda', '—'])
    expect(rows[0]).toMatchObject({ costPerKg: 8, attributed: true })
    expect(rows[0].weightPct).toBeCloseTo(30, 6)
    expect(attributedPct).toBeCloseTo(50, 6)
  })

  it('is empty rather than NaN-filled for no entries', () => {
    expect(buildShare([])).toEqual({ rows: [], attributedPct: 0 })
  })
})

describe('shareTable', () => {
  it('reads any endpoint row shape through its name field', () => {
    const { rows } = shareTable(
      [
        { name: 'RA Alpha', totalWeight: 100, totalCost: 900 },
        { name: 'RA Beta', totalWeight: 400, totalCost: 2000 },
      ],
      'name',
    )
    expect(rows.map((r) => r.name)).toEqual(['RA Beta', 'RA Alpha'])
    expect(rows[1].costPerKg).toBe(9)
  })
})

const vendors: PnlVendorCostItem[] = [
  {
    vendor: 'ESP',
    totalWeight: 1000,
    totalCost: 8000,
    airlines: [
      { airline: 'Lion', totalWeight: 600, totalCost: 4800 }, // 8/kg
      { airline: 'Garuda', totalWeight: 0, totalCost: 0 }, // no usable baseline
    ],
  },
  {
    vendor: 'PT Maju',
    totalWeight: 500,
    totalCost: 5500,
    airlines: [
      { airline: 'Lion', totalWeight: 400, totalCost: 4400 }, // 11/kg
      { airline: 'Garuda', totalWeight: 100, totalCost: 1100 },
    ],
  },
  {
    vendor: '—',
    totalWeight: 200,
    totalCost: 2200,
    airlines: [{ airline: 'Lion', totalWeight: 200, totalCost: 2200 }],
  },
]

describe('vendorExecution', () => {
  it('ranks vendors by tonnage with the unattributed bucket last', () => {
    expect(vendorExecution(vendors).rows.map((r) => r.name)).toEqual(['ESP', 'PT Maju', '—'])
  })
})

describe('airlineShare', () => {
  it('sums each airline across every vendor that flew it', () => {
    const { rows } = airlineShare(vendors)
    const lion = rows.find((r) => r.name === 'Lion')!
    expect(lion.weight).toBe(1200)
    expect(lion.cost).toBe(11400)
  })
})

describe('selfOperateGap', () => {
  it('prices third-party tonnage against ESP on the same airline', () => {
    const { rows, totalImpact, totalCapital } = selfOperateGap(vendors)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      vendor: 'PT Maju',
      airline: 'Lion',
      vendorWeight: 400,
      vendorCostPerKg: 11,
      espCostPerKg: 8,
      gapPerKg: 3,
      impact: 1200,
      capitalNeeded: 3200,
    })
    expect(totalImpact).toBe(1200)
    expect(totalCapital).toBe(3200)
  })

  it('skips a zero-weight ESP row rather than treating free flying as the baseline', () => {
    // PT Maju also flies Garuda, but ESP's Garuda row carries no tonnage, so its cost per kg is
    // not a real rate. Comparing against it would report a fabricated saving.
    expect(selfOperateGap(vendors).rows.some((r) => r.airline === 'Garuda')).toBe(false)
  })

  it('never compares ESP or the unattributed bucket against ESP', () => {
    const rows = selfOperateGap(vendors).rows
    expect(rows.some((r) => r.vendor === 'ESP' || r.vendor === '—')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/share.spec.ts`
Expected: FAIL — cannot find module `./share`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/share.ts`:

```ts
/**
 * "Who carried what" — one shape for every attribution table (airline, RA, SG, vendor), plus the
 * self-operate gap that prices third-party tonnage against ESP's own cost on the same airline.
 */

import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'
import { div, num, UNATTRIBUTED } from './series'

export interface ShareRow {
  name: string
  weight: number
  cost: number
  costPerKg: number
  weightPct: number
  costPct: number
  attributed: boolean
}

export interface ShareResult {
  rows: ShareRow[]
  attributedPct: number
}

/**
 * The unattributed bucket stays visible — hiding it would make the attributed shares look like
 * the whole picture — but sorts last so it never heads a ranking.
 */
export function buildShare(
  entries: Array<{ name: string | null; weight: number; cost: number }>,
): ShareResult {
  const totalWeight = entries.reduce((s, e) => s + num(e.weight), 0)
  const totalCost = entries.reduce((s, e) => s + num(e.cost), 0)
  const isAttributed = (name: string | null) => !!name && name !== UNATTRIBUTED
  const attributedWeight = entries
    .filter((e) => isAttributed(e.name))
    .reduce((s, e) => s + num(e.weight), 0)

  const rows = entries
    .map((e) => ({
      name: e.name ?? UNATTRIBUTED,
      weight: num(e.weight),
      cost: num(e.cost),
      costPerKg: div(num(e.cost), num(e.weight)),
      weightPct: div(num(e.weight), totalWeight) * 100,
      costPct: div(num(e.cost), totalCost) * 100,
      attributed: isAttributed(e.name),
    }))
    .sort((a, b) => {
      if (a.attributed !== b.attributed) return a.attributed ? -1 : 1
      return b.weight - a.weight
    })

  return { rows, attributedPct: div(attributedWeight, totalWeight) * 100 }
}

/** Adapts any `{ <nameField>, totalWeight, totalCost }` endpoint row onto `buildShare`. */
export function shareTable<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  nameField: keyof T & string,
): ShareResult {
  return buildShare(
    (rows ?? []).map((r) => ({
      name: (r[nameField] as string | null) ?? null,
      weight: num(r.totalWeight),
      cost: num(r.totalCost),
    })),
  )
}

export function vendorExecution(costByVendor: PnlVendorCostItem[] | undefined): ShareResult {
  return shareTable(costByVendor, 'vendor')
}

export function airlineShare(costByVendor: PnlVendorCostItem[] | undefined): ShareResult {
  const acc = new Map<string, { name: string; weight: number; cost: number }>()
  for (const v of costByVendor ?? []) {
    for (const a of v.airlines ?? []) {
      const cur = acc.get(a.airline) ?? { name: a.airline, weight: 0, cost: 0 }
      cur.weight += num(a.totalWeight)
      cur.cost += num(a.totalCost)
      acc.set(a.airline, cur)
    }
  }
  return buildShare(Array.from(acc.values()))
}

export interface SelfOperateRow {
  airline: string
  vendor: string
  vendorWeight: number
  vendorCostPerKg: number
  espCostPerKg: number
  gapPerKg: number
  impact: number
  capitalNeeded: number
}

export interface SelfOperateResult {
  rows: SelfOperateRow[]
  totalImpact: number
  totalCapital: number
}

/**
 * What would self-operating have cost? Each vendor's cost per kg on an airline against ESP's own
 * cost per kg on that same airline. Airline is the finest grain `cost-by-vendor` exposes for every
 * period.
 */
export function selfOperateGap(costByVendor: PnlVendorCostItem[] | undefined): SelfOperateResult {
  const esp = new Map<string, number>()
  for (const v of costByVendor ?? []) {
    if (v.vendor !== 'ESP') continue
    for (const a of v.airlines ?? []) {
      // A zero-weight ESP row carries no usable cost per kg. Recording it would present "ESP flies
      // this airline for free" as a comparable baseline and fabricate a saving.
      if (num(a.totalWeight) <= 0) continue
      esp.set(a.airline, div(num(a.totalCost), num(a.totalWeight)))
    }
  }

  const rows: SelfOperateRow[] = []
  for (const v of costByVendor ?? []) {
    if (!v.vendor || v.vendor === 'ESP' || v.vendor === UNATTRIBUTED) continue
    for (const a of v.airlines ?? []) {
      const espCostPerKg = esp.get(a.airline)
      if (espCostPerKg == null) continue // no ESP baseline: not comparable
      const vendorWeight = num(a.totalWeight)
      if (vendorWeight <= 0) continue // no vendor tonnage: not comparable
      const vendorCostPerKg = div(num(a.totalCost), vendorWeight)
      const gapPerKg = vendorCostPerKg - espCostPerKg
      rows.push({
        airline: a.airline,
        vendor: v.vendor,
        vendorWeight,
        vendorCostPerKg,
        espCostPerKg,
        gapPerKg,
        impact: vendorWeight * gapPerKg,
        capitalNeeded: vendorWeight * espCostPerKg,
      })
    }
  }
  rows.sort((a, b) => b.impact - a.impact)

  return {
    rows,
    totalImpact: rows.reduce((s, r) => s + r.impact, 0),
    totalCapital: rows.reduce((s, r) => s + r.capitalNeeded, 0),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/share.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/share.ts apps/frontend/src/features/pnl-analytics/utils/share.spec.ts
git commit -m "feat(pnl-analytics): attribution share tables and self-operate gap"
```

---

### Task 10: Frontend util — `utils/journey.ts`

The best vendor × airline combination per route, and the upside of moving tonnage onto it.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/journey.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/journey.spec.ts`

**Interfaces:**
- Consumes: `AnalyticsJourneyRow` from `../types`; `num`, `div` from `./series`; `routeKey`, `routeLabel` from `./cycle`.
- Produces: `bestCombination(journey, opts?)`, types `BestRouteRow`, `BestCombinationResult`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/journey.spec.ts`:

```ts
import { bestCombination } from './journey'
import { AnalyticsJourneyRow } from '../types'

const j = (over: Partial<AnalyticsJourneyRow>): AnalyticsJourneyRow => ({
  vendor: 'ESP',
  airline: 'Lion',
  origin: 'Jabo',
  dest: 'Denpasar',
  awbCount: 10,
  gw: 100,
  chwt: 110,
  revenue: 1000,
  cost: 600,
  margin: 400,
  marginPerKg: 4,
  ...over,
})

describe('bestCombination', () => {
  it('picks the highest margin per kg among combinations that carry a real share', () => {
    const rows = [
      j({ vendor: 'ESP', airline: 'Lion', gw: 800, margin: 2400, marginPerKg: 3 }),
      j({ vendor: 'PT Maju', airline: 'Garuda', gw: 200, margin: 1200, marginPerKg: 6 }),
    ]
    const { byRoute, overall } = bestCombination(rows)
    expect(byRoute).toHaveLength(1)
    const r = byRoute[0]
    expect(r.routeKey).toBe('Jabo|Denpasar')
    expect(r.label).toBe('CGK → Denpasar')
    expect(r.best.vendor).toBe('PT Maju')
    expect(r.floorCleared).toBe(true)
    expect(r.attributedTonnage).toBe(1000)
    expect(r.tonnageOnBest).toBe(200)
    expect(r.optimalPct).toBeCloseTo(20, 6)
    expect(r.actualMarginPerKg).toBeCloseTo(3.6, 6)
    // 800 kg not yet on the best combination × (6 - 3.6) per kg.
    expect(r.upside).toBeCloseTo(1920, 6)
    expect(overall.optimalPct).toBeCloseTo(20, 6)
    expect(overall.upside).toBeCloseTo(1920, 6)
  })

  it('ignores a sliver combination whose margin per kg is unrepresentative', () => {
    const rows = [
      j({ vendor: 'ESP', airline: 'Lion', gw: 990, margin: 2970, marginPerKg: 3 }),
      // 1% of the route: a single lucky AWB, not a repeatable rate.
      j({ vendor: 'Tiny', airline: 'Garuda', gw: 10, margin: 900, marginPerKg: 90 }),
    ]
    const r = bestCombination(rows).byRoute[0]
    expect(r.best.vendor).toBe('ESP')
    expect(r.floorCleared).toBe(true)
  })

  it('falls back to the unfiltered set and says the floor did not hold', () => {
    // Twenty-five combinations at 4% each: nothing clears the 5% floor. Having no benchmark at
    // all is worse than a caveated one, so the pool falls back — and says so.
    const rows = Array.from({ length: 25 }, (_, i) =>
      j({ vendor: `V${i}`, gw: 40, margin: 40 * (i + 1), marginPerKg: i + 1 }),
    )
    const r = bestCombination(rows).byRoute[0]
    expect(r.floorCleared).toBe(false)
    expect(r.best.vendor).toBe('V24')
  })

  it('never reports a negative upside', () => {
    // The only combination is already carrying everything, so there is nothing to move.
    const r = bestCombination([j({ gw: 500, margin: 1500, marginPerKg: 3 })]).byRoute[0]
    expect(r.upside).toBe(0)
    expect(r.optimalPct).toBeCloseTo(100, 6)
  })

  it('ranks routes by upside and returns nothing for no rows', () => {
    const rows = [
      j({ dest: 'Denpasar', vendor: 'A', gw: 500, margin: 500, marginPerKg: 1 }),
      j({ dest: 'Denpasar', vendor: 'B', gw: 500, margin: 2500, marginPerKg: 5 }),
      j({ dest: 'Batam', vendor: 'A', gw: 100, margin: 100, marginPerKg: 1 }),
      j({ dest: 'Batam', vendor: 'B', gw: 100, margin: 200, marginPerKg: 2 }),
    ]
    expect(bestCombination(rows).byRoute.map((r) => r.routeKey)).toEqual([
      'Jabo|Denpasar',
      'Jabo|Batam',
    ])
    expect(bestCombination([]).byRoute).toEqual([])
    expect(bestCombination([]).overall.upside).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/journey.spec.ts`
Expected: FAIL — cannot find module `./journey`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/journey.ts`:

```ts
/**
 * Which vendor × airline combination earns most per kg on a route, and what moving the rest of the
 * route's tonnage onto it would be worth.
 */

import { AnalyticsJourneyRow } from '../types'
import { routeKey, routeLabel } from './cycle'
import { div, num } from './series'

export interface BestRouteRow {
  routeKey: string
  label: string
  best: AnalyticsJourneyRow
  tonnageOnBest: number
  attributedTonnage: number
  actualMarginPerKg: number
  optimalPct: number
  upside: number
  /** false means no combination carried the minimum share, so `best` came from the whole set. */
  floorCleared: boolean
}

export interface BestCombinationResult {
  byRoute: BestRouteRow[]
  overall: { attributedTonnage: number; optimalPct: number; upside: number }
}

export function bestCombination(
  journey: AnalyticsJourneyRow[] | undefined,
  opts?: { minSharePct?: number },
): BestCombinationResult {
  const minSharePct = opts?.minSharePct ?? 5

  const byRouteMap = new Map<string, AnalyticsJourneyRow[]>()
  for (const r of journey ?? []) {
    const key = routeKey(r.origin, r.dest)
    const list = byRouteMap.get(key) ?? []
    list.push(r)
    byRouteMap.set(key, list)
  }

  const byRoute: BestRouteRow[] = []
  for (const [key, rows] of byRouteMap) {
    const attributedTonnage = rows.reduce((s, r) => s + num(r.gw), 0)
    const totalMargin = rows.reduce((s, r) => s + num(r.margin), 0)
    const actualMarginPerKg = div(totalMargin, attributedTonnage)

    // A combination must carry a real share of the route before it can set the benchmark: a single
    // lucky AWB at 1% of the tonnage is not a rate anyone can repeat.
    const eligible = rows.filter((r) => div(num(r.gw), attributedTonnage) * 100 >= minSharePct)
    // When nothing clears the floor, the unfiltered set beats having no benchmark at all — but the
    // caller must be able to tell the floor did not actually hold.
    const floorCleared = eligible.length > 0
    const pool = eligible.length ? eligible : rows
    const best = pool.slice().sort((a, b) => num(b.marginPerKg) - num(a.marginPerKg))[0]

    const tonnageOnBest = rows
      .filter((r) => r.vendor === best.vendor && r.airline === best.airline)
      .reduce((s, r) => s + num(r.gw), 0)
    // Clamped at zero: when the best combination already carries everything, or its rate is below
    // the route average because the floor forced a fallback, there is no upside to claim.
    const upside = Math.max(
      0,
      (attributedTonnage - tonnageOnBest) * (num(best.marginPerKg) - actualMarginPerKg),
    )

    byRoute.push({
      routeKey: key,
      label: routeLabel(best.origin, best.dest),
      best,
      tonnageOnBest,
      attributedTonnage,
      actualMarginPerKg,
      optimalPct: div(tonnageOnBest, attributedTonnage) * 100,
      upside,
      floorCleared,
    })
  }
  byRoute.sort((a, b) => b.upside - a.upside)

  const attributedTonnage = byRoute.reduce((s, r) => s + r.attributedTonnage, 0)
  const onBest = byRoute.reduce((s, r) => s + r.tonnageOnBest, 0)
  return {
    byRoute,
    overall: {
      attributedTonnage,
      optimalPct: div(onBest, attributedTonnage) * 100,
      upside: byRoute.reduce((s, r) => s + r.upside, 0),
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/journey.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/journey.ts apps/frontend/src/features/pnl-analytics/utils/journey.spec.ts
git commit -m "feat(pnl-analytics): best vendor-airline combination per route"
```

---

### Task 11: Frontend util — `utils/routes.ts`

Per-route contribution, margin concentration, and margin stability. All three fold the same
per-(date × route) series, so none of them costs a request.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/routes.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/routes.spec.ts`

**Interfaces:**
- Consumes: `AnalyticsDailySeries` from `../types`; `foldByRoute`, `kpis`, `routeKeysIn`, `num`, `div` from `./series`; `routeLabel`, `splitRouteKey` from `./cycle`.
- Produces: `routeContribution(series, keys?)`, `concentration(contribution)`, `marginStability(series, key)`, types `RouteContributionRow`, `Concentration`, `MarginStability`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/routes.spec.ts`:

```ts
import { concentration, marginStability, routeContribution } from './routes'
import { AnalyticsDailySeries, AnalyticsDailyRow } from '../types'

const row = (over: Partial<AnalyticsDailyRow>): AnalyticsDailyRow => ({
  date: '2026-05-01',
  origin: 'Jabo',
  dest: 'Denpasar',
  revenue: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  weight: 0,
  incompleteTos: 0,
  ...over,
})

const dates = Array.from({ length: 8 }, (_, i) => `2026-05-0${i + 1}`)

/** Eight clean days on Denpasar, plus one Batam day whose cost never landed. */
const series: AnalyticsDailySeries = {
  dates,
  rows: [
    ...dates.map((date, i) =>
      row({ date, dest: 'Denpasar', revenue: 1000, costSmu: 600 + i * 10, weight: 100 }),
    ),
    row({ date: '2026-05-01', dest: 'Batam', revenue: 5000, costSmu: 0, weight: 400, incompleteTos: 9 }),
  ],
}

describe('routeContribution', () => {
  it('reports every route with its margin share, ranked by margin', () => {
    const rows = routeContribution(series)
    expect(rows.map((r) => r.routeKey)).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
    expect(rows[0].label).toBe('CGK → Batam')
    const denpasar = rows.find((r) => r.routeKey === 'Jabo|Denpasar')!
    expect(denpasar.revenue).toBe(8000)
    expect(denpasar.cost).toBe(5080) // 600 + 610 + ... + 670
    expect(denpasar.costComplete).toBe(true)
  })

  it('flags a route whose cost never landed instead of dropping it', () => {
    const batam = routeContribution(series).find((r) => r.routeKey === 'Jabo|Batam')!
    // A route with zero attributed cost reads as a flawless 100% margin. It is kept visible and
    // flagged, so the table still shows every route and concentration can exclude it.
    expect(batam.marginPct).toBe(100)
    expect(batam.incompleteTos).toBe(9)
    expect(batam.costComplete).toBe(false)
  })

  it('narrows to the given route keys', () => {
    expect(routeContribution(series, ['Jabo|Denpasar']).map((r) => r.routeKey)).toEqual([
      'Jabo|Denpasar',
    ])
  })
})

describe('concentration', () => {
  it('excludes flagged routes and says how many were left out', () => {
    const c = concentration(routeContribution(series))
    expect(c.routesCounted).toBe(1)
    expect(c.routesExcluded).toBe(1)
    // With the artifact excluded, the one real route carries all the margin.
    expect(c.top1Pct).toBeCloseTo(100, 6)
    expect(c.hhi).toBeCloseTo(1, 6)
  })

  it('is zeroed, not NaN, when every route is excluded', () => {
    const c = concentration([
      { routeKey: 'a|b', label: 'a → b', revenue: 0, cost: 0, margin: 10, marginPct: 0, weight: 0, incompleteTos: 1, costComplete: false, sharePct: 0 },
    ])
    expect(c).toMatchObject({ routesCounted: 0, routesExcluded: 1, top1Pct: 0, top3Pct: 0, hhi: 0 })
  })

  it('measures share on absolute margin, so a loss-making route still counts as exposure', () => {
    const c = concentration([
      { routeKey: 'a|b', label: 'a → b', revenue: 0, cost: 0, margin: -100, marginPct: 0, weight: 0, incompleteTos: 0, costComplete: true, sharePct: 0 },
      { routeKey: 'c|d', label: 'c → d', revenue: 0, cost: 0, margin: 100, marginPct: 0, weight: 0, incompleteTos: 0, costComplete: true, sharePct: 0 },
    ])
    expect(c.routesCounted).toBe(2)
    expect(c.hhi).toBeCloseTo(0.5, 6)
  })
})

describe('marginStability', () => {
  it('returns the coefficient of variation of daily margin per kg', () => {
    const s = marginStability(series, 'Jabo|Denpasar')!
    expect(s.days).toBe(8)
    expect(s.cv).toBeGreaterThan(0)
    expect(s.cv).toBeLessThan(0.1) // 600..670 against a 1000 revenue is a steady route
  })

  it('returns null below five usable days rather than a number nobody should read', () => {
    const short: AnalyticsDailySeries = {
      dates: dates.slice(0, 4),
      rows: dates
        .slice(0, 4)
        .map((date) => row({ date, revenue: 1000, costSmu: 600, weight: 100 })),
    }
    expect(marginStability(short, 'Jabo|Denpasar')).toBeNull()
  })

  it('excludes days with incomplete cost from the count', () => {
    // Eight days, three of them incomplete: only five remain, which is exactly the floor.
    const mixed: AnalyticsDailySeries = {
      dates,
      rows: dates.map((date, i) =>
        row({
          date,
          revenue: 1000,
          costSmu: 600,
          weight: 100,
          incompleteTos: i < 3 ? 2 : 0,
        }),
      ),
    }
    expect(marginStability(mixed, 'Jabo|Denpasar')!.days).toBe(5)
  })

  it('returns null for a route the period never carried', () => {
    expect(marginStability(series, 'Jabo|Nowhere')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/routes.spec.ts`
Expected: FAIL — cannot find module `./routes`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/routes.ts`:

```ts
/**
 * Per-route views of the same daily series: who contributes the margin, how concentrated that is,
 * and how steady each route's margin per kg runs day to day.
 */

import { AnalyticsDailySeries } from '../types'
import { routeLabel, splitRouteKey } from './cycle'
import { div, foldByRoute, kpis, num, routeKeysIn } from './series'

export interface RouteContributionRow {
  routeKey: string
  label: string
  revenue: number
  cost: number
  margin: number
  marginPct: number
  weight: number
  incompleteTos: number
  /** false when the route's days carry incomplete cost, or it has no cost-bearing day at all. */
  costComplete: boolean
  sharePct: number
}

export function routeContribution(
  series: AnalyticsDailySeries | undefined,
  keys?: string[],
): RouteContributionRow[] {
  const routeKeys = keys?.length ? keys : routeKeysIn(series)
  const rows = routeKeys.map((key) => {
    const days = foldByRoute(series, [key])
    const k = kpis(days)
    const { origin, dest } = splitRouteKey(key)
    const incompleteTos = days.reduce((s, d) => s + num(d.incompleteTos), 0)
    const daysWithCost = days.filter((d) => d.cost > 0).length
    // A route whose days carry incomplete cost — or that has no cost-bearing day at all — cannot
    // be trusted as a margin figure. Flagged here rather than silently dropped, so the table still
    // shows every route and `concentration` can choose to exclude it.
    const costComplete = incompleteTos === 0 && daysWithCost > 0
    return {
      routeKey: key,
      label: routeLabel(origin, dest),
      revenue: k.revenue,
      cost: k.cost,
      margin: k.margin,
      marginPct: k.marginPct,
      weight: k.weight,
      incompleteTos,
      costComplete,
    }
  })

  const totalMargin = rows.reduce((s, r) => s + r.margin, 0)
  return rows
    .map((r) => ({ ...r, sharePct: div(r.margin, totalMargin) * 100 }))
    .sort((a, b) => b.margin - a.margin)
}

export interface Concentration {
  top1Pct: number
  top3Pct: number
  hhi: number
  routesCounted: number
  routesExcluded: number
}

/**
 * How much of the margin rests on how few routes? HHI on absolute margin share; above ~0.25 the
 * portfolio is concentrated. Rows flagged `costComplete: false` — a bulk backfill with no
 * attributed cost, reading as a false 100% margin — are excluded so a data artifact never
 * masquerades as a concentration risk. `routesExcluded` says how many, so the caller can show it.
 *
 * The share is on ABSOLUTE margin: a route losing money is exposure too, and signing it as
 * negative would let it cancel out a profitable one.
 */
export function concentration(contribution: RouteContributionRow[] | undefined): Concentration {
  const all = contribution ?? []
  const rows = all
    .filter((r) => r.costComplete !== false)
    .slice()
    .sort((a, b) => Math.abs(num(b.margin)) - Math.abs(num(a.margin)))
  const total = rows.reduce((s, r) => s + Math.abs(num(r.margin)), 0)
  const share = (r: RouteContributionRow) => div(Math.abs(num(r.margin)), total)
  return {
    top1Pct: rows.length ? share(rows[0]) * 100 : 0,
    top3Pct: rows.slice(0, 3).reduce((s, r) => s + share(r), 0) * 100,
    hhi: rows.reduce((s, r) => s + share(r) * share(r), 0),
    routesCounted: rows.length,
    routesExcluded: all.length - rows.length,
  }
}

export interface MarginStability {
  cv: number
  days: number
  mean: number
}

/**
 * Coefficient of variation of daily margin per kg — lower is steadier. Days with incomplete cost
 * are excluded, and below five usable days the number means nothing, so it returns null rather
 * than a figure someone would read as stability.
 */
export function marginStability(
  series: AnalyticsDailySeries | undefined,
  key: string,
): MarginStability | null {
  const days = foldByRoute(series, [key]).filter(
    (d) => d.weight > 0 && d.cost > 0 && !d.incompleteTos,
  )
  if (days.length < 5) return null
  const vals = days.map((d) => div(d.margin, d.weight))
  const mean = div(
    vals.reduce((s, v) => s + v, 0),
    vals.length,
  )
  if (!mean) return null
  const variance = div(
    vals.reduce((s, v) => s + (v - mean) * (v - mean), 0),
    vals.length,
  )
  return { cv: Math.sqrt(variance) / Math.abs(mean), days: vals.length, mean }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/routes.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/routes.ts apps/frontend/src/features/pnl-analytics/utils/routes.spec.ts
git commit -m "feat(pnl-analytics): route contribution, concentration and stability"
```

---

### Task 12: Frontend util — `utils/ops.ts`

The Operations section's two views: SLA on-time performance mapped onto P&L routes, and offloaded
AWBs joined to their route.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/ops.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/ops.spec.ts`

**Interfaces:**
- Consumes: `SlaOverview` from `../types`; `mapSlaRoutes`, `routeLabel`, `splitRouteKey`, `routeKey` from `./cycle`; `num`, `div` from `./series`.
- Produces: `ALERT_LABELS`, `slaView(sla, routeKeys?)`, `offloadView(offloaded, awbs)`, types `SlaView`, `SlaRouteRow`, `OffloadView`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/ops.spec.ts`:

```ts
import { offloadView, slaView } from './ops'
import { SlaOverview } from '../types'

const sla: SlaOverview = {
  summary: {
    alerts: {
      melewatiSla: { routes: 3, tonnage: 1200 },
      reservasiKapal: { routes: 0, tonnage: 0 },
      spxSlaAlert: { routes: 1, tonnage: 400 },
    },
    otp: {
      percentage: 88,
      onTimeWeight: 8800,
      lateWeight: 1200,
      breakdown: [
        { route: 'Kosambi DC - Denpasar DC', percentage: 95, onTimeWeight: 950, lateWeight: 50 },
        { route: 'Kosambi DC - Batam DC', percentage: 60, onTimeWeight: 600, lateWeight: 400 },
        // No measurement at all: its 0% is an upstream 0/0, not a failing route.
        { route: 'Kosambi DC - Aceh DC', percentage: 0, onTimeWeight: 0, lateWeight: 0 },
        { route: 'nonsense', percentage: 10, onTimeWeight: 1, lateWeight: 9 },
      ],
    },
  },
}

describe('slaView', () => {
  it('ranks routes worst-first — the table exists to surface failures', () => {
    const v = slaView(sla)
    expect(v.byRoute.map((r) => r.routeKey)).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
    expect(v.byRoute[0].label).toBe('CGK → Batam')
  })

  it('separates routes with no measurement from routes that are failing', () => {
    const v = slaView(sla)
    expect(v.byRoute.some((r) => r.routeKey === 'Jabo|Aceh')).toBe(false)
    expect(v.noDataRoutes.map((r) => r.routeKey)).toEqual(['Jabo|Aceh'])
  })

  it('reports route strings it could not map', () => {
    expect(slaView(sla).unmapped).toEqual(['nonsense'])
  })

  it("trusts the API's own headline when unscoped", () => {
    const v = slaView(sla)
    expect(v.scoped).toBe(false)
    expect(v.otpPct).toBe(88)
    expect(v.onTimeWeight).toBe(8800)
  })

  it('recomputes the headline from measured routes only when scoped', () => {
    const v = slaView(sla, ['Jabo|Denpasar', 'Jabo|Batam', 'Jabo|Aceh'])
    expect(v.scoped).toBe(true)
    expect(v.onTimeWeight).toBe(1550)
    expect(v.lateWeight).toBe(450)
    // The zero-weight Aceh route is not in the denominator, so it cannot drag the figure down.
    expect(v.otpPct).toBeCloseTo(77.5, 6)
  })

  it('lists only alerts that carry something, heaviest first', () => {
    expect(slaView(sla).alerts.map((a) => a.type)).toEqual(['melewatiSla', 'spxSlaAlert'])
    expect(slaView(sla).alerts[0].label).toBe('Past SLA')
  })

  it('returns an empty view for a missing response rather than throwing', () => {
    const v = slaView(undefined)
    expect(v).toMatchObject({ otpPct: 0, byRoute: [], noDataRoutes: [], alerts: [], unmapped: [] })
  })
})

describe('offloadView', () => {
  const offloaded = [
    { awb: 'A1', airline: 'Lion' },
    { awb: 'A2', airline: 'Lion' },
    { awb: 'A3', airline: 'Garuda' },
    { awb: 'UNKNOWN', airline: 'Garuda' },
  ]
  const awbs = [
    { awb: 'A1', origin: 'Jabo', dest: 'Denpasar' },
    { awb: 'A2', origin: 'Jabo', dest: 'Denpasar' },
    { awb: 'A3', origin: 'Jabo', dest: 'Batam' },
  ]

  it('counts by airline and, where the AWB joins, by route', () => {
    const v = offloadView(offloaded, awbs)
    expect(v.count).toBe(4)
    expect(v.byAirline).toEqual([
      { name: 'Lion', count: 2 },
      { name: 'Garuda', count: 2 },
    ])
    expect(v.byRoute).toEqual([
      { routeKey: 'Jabo|Denpasar', label: 'CGK → Denpasar', count: 2 },
      { routeKey: 'Jabo|Batam', label: 'CGK → Batam', count: 1 },
    ])
  })

  it('reports the join rate, because AWB formats differ between the two sources', () => {
    expect(offloadView(offloaded, awbs).joinRatePct).toBeCloseTo(75, 6)
    expect(offloadView([], awbs).joinRatePct).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/ops.spec.ts`
Expected: FAIL — cannot find module `./ops`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/ops.ts`:

```ts
/**
 * The operational side: SLA on-time performance mapped onto P&L route keys, and offloaded AWBs
 * joined to the routes they were flying.
 */

import { SlaOverview } from '../types'
import { mapSlaRoutes, routeKey, routeLabel, splitRouteKey } from './cycle'
import { div, num } from './series'

/** The SLA API's alert keys, in English to match the rest of the P&L page. */
export const ALERT_LABELS: Record<string, string> = {
  reservasiPenerbangan: 'Flight not reserved',
  reservasiKapal: 'Vessel not reserved',
  flightTracking: 'Flight tracking issue',
  potensiMelebihiSla: 'At risk of missing SLA',
  melewatiSla: 'Past SLA',
  potensiMelebihiTjph: 'At risk of missing TJPH',
  melewatiTjph: 'Past TJPH',
  spxSlaAlert: 'SLA alert (SPX)',
  spxTjphAlert: 'TJPH alert (SPX)',
}

export interface SlaRouteRow {
  routeKey: string
  label: string
  otpPct: number
  onTimeWeight: number
  lateWeight: number
}

export interface SlaView {
  otpPct: number
  onTimeWeight: number
  lateWeight: number
  byRoute: SlaRouteRow[]
  noDataRoutes: Array<{ routeKey: string; label: string }>
  alerts: Array<{ type: string; label: string; routes: number; tonnage: number }>
  unmapped: string[]
  scoped: boolean
}

export function slaView(sla: SlaOverview | undefined, routeKeys?: string[]): SlaView {
  const summary = sla?.summary ?? { alerts: {} }
  const otp = summary.otp ?? { percentage: 0, onTimeWeight: 0, lateWeight: 0, breakdown: [] }
  const mapping = mapSlaRoutes(otp.breakdown ?? [])

  const wanted = routeKeys?.length ? new Set(routeKeys) : null
  const byRoute: SlaRouteRow[] = []
  const noDataRoutes: SlaView['noDataRoutes'] = []
  for (const [key, row] of mapping.mapped) {
    if (wanted && !wanted.has(key)) continue
    const { origin, dest } = splitRouteKey(key)
    const label = routeLabel(origin, dest)
    const onTimeWeight = num(row.onTimeWeight)
    const lateWeight = num(row.lateWeight)
    // A route with zero on-time AND zero late weight has no measurement to rank: its 0.0% is an
    // upstream 0/0 artifact, not a real failure. Reported separately so the data-health panel can
    // name it, rather than letting it pose as the worst performer at the top of a worst-first table.
    if (onTimeWeight + lateWeight <= 0) {
      noDataRoutes.push({ routeKey: key, label })
      continue
    }
    byRoute.push({ routeKey: key, label, otpPct: num(row.percentage), onTimeWeight, lateWeight })
  }
  // Worst-first, deliberately: this table's purpose is to surface the routes that are failing.
  byRoute.sort((a, b) => a.otpPct - b.otpPct)

  // Unscoped, trust the API's own headline. Scoped, recompute from the ranked (measured) member
  // weights only, so a zero-weight route can never drag a scoped OTP toward zero.
  let onTimeWeight = num(otp.onTimeWeight)
  let lateWeight = num(otp.lateWeight)
  let otpPct = num(otp.percentage)
  if (wanted) {
    onTimeWeight = byRoute.reduce((s, r) => s + r.onTimeWeight, 0)
    lateWeight = byRoute.reduce((s, r) => s + r.lateWeight, 0)
    otpPct = div(onTimeWeight, onTimeWeight + lateWeight) * 100
  }

  const alerts = Object.entries(summary.alerts ?? {})
    .map(([type, a]) => ({
      type,
      label: ALERT_LABELS[type] ?? type,
      routes: num(a?.routes),
      tonnage: num(a?.tonnage),
    }))
    .filter((a) => a.tonnage > 0 || a.routes > 0)
    .sort((a, b) => b.tonnage - a.tonnage)

  return {
    otpPct,
    onTimeWeight,
    lateWeight,
    byRoute,
    noDataRoutes,
    alerts,
    unmapped: mapping.unmapped,
    scoped: !!wanted,
  }
}

export interface OffloadView {
  count: number
  byAirline: Array<{ name: string; count: number }>
  byRoute: Array<{ routeKey: string; label: string; count: number }>
  joinRatePct: number
}

/**
 * Offload rows carry only an AWB number, so the route comes from joining to the per-AWB data. The
 * join rate is reported because AWB formats differ between the two sources — a low rate means the
 * route breakdown below it is only a slice, not the whole picture.
 */
export function offloadView(
  offloaded: Array<{ awb: string; airline: string | null }> | undefined,
  awbs: Array<{ awb: string; origin: string | null; dest: string | null }> | undefined,
): OffloadView {
  const rows = offloaded ?? []
  const routeOf = new Map(
    (awbs ?? [])
      .filter((a) => a.origin && a.dest)
      .map((a) => [a.awb, routeKey(a.origin as string, a.dest as string)]),
  )
  const airlineAcc = new Map<string, number>()
  const routeAcc = new Map<string, number>()
  let joined = 0
  for (const r of rows) {
    const airline = r.airline ?? '—'
    airlineAcc.set(airline, (airlineAcc.get(airline) ?? 0) + 1)
    const rk = routeOf.get(r.awb)
    if (rk) {
      joined += 1
      routeAcc.set(rk, (routeAcc.get(rk) ?? 0) + 1)
    }
  }

  return {
    count: rows.length,
    byAirline: Array.from(airlineAcc.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    byRoute: Array.from(routeAcc.entries())
      .map(([key, count]) => {
        const { origin, dest } = splitRouteKey(key)
        return { routeKey: key, label: routeLabel(origin, dest), count }
      })
      .sort((a, b) => b.count - a.count),
    joinRatePct: div(joined, rows.length) * 100,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/ops.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/ops.ts apps/frontend/src/features/pnl-analytics/utils/ops.spec.ts
git commit -m "feat(pnl-analytics): SLA and offload operational views"
```

---

### Task 13: Frontend util — `utils/context.ts`

The one place that decides what the whole tab is looking at: the scoped series, the unscoped health
gate, the KPI deltas, and whether the baseline is trustworthy enough for those deltas to mean
anything.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/context.ts`
- Test: `apps/frontend/src/features/pnl-analytics/utils/context.spec.ts`

**Interfaces:**
- Consumes: `AnalyticsDailySeries`, `AnalyticsScope`, `Campaign`, `SeriesDay`, `Kpis`, `KpiSet` from `../types`; `foldAll`, `foldByRoute`, `routeKeysIn`, `kpis`, `kpisWithDelta`, `dailyOutliers` from `./series`; `dqReport`, `COVERAGE_MIN`, `DqReport` from `./dq`; `routeLabel`, `splitRouteKey` from `./cycle`.
- Produces: `scopeRouteKeys(series, scope, groupRoutes?)`, `scopeLabel(scope, groupName?)`, `buildAnalyticsContext(input)`, type `AnalyticsContext`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/utils/context.spec.ts`:

```ts
import { buildAnalyticsContext, scopeLabel, scopeRouteKeys } from './context'
import { AnalyticsDailyRow, AnalyticsDailySeries } from '../types'

const row = (over: Partial<AnalyticsDailyRow>): AnalyticsDailyRow => ({
  date: '2026-05-01',
  origin: 'Jabo',
  dest: 'Denpasar',
  revenue: 0,
  costSmu: 0,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  weight: 0,
  incompleteTos: 0,
  ...over,
})

const dates = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04']

/**
 * Denpasar is clean throughout. Batam's biggest day never had its cost attributed — the exact
 * shape that certifies as 100% covered route-level while most of the revenue is untrustworthy.
 */
const series: AnalyticsDailySeries = {
  dates,
  rows: [
    ...dates.map((date) => row({ date, dest: 'Denpasar', revenue: 100, costSmu: 60, weight: 10 })),
    row({ date: '2026-05-02', dest: 'Batam', revenue: 5000, costSmu: 0, weight: 500, incompleteTos: 30 }),
    row({ date: '2026-05-03', dest: 'Batam', revenue: 100, costSmu: 70, weight: 10 }),
  ],
}

const clean: AnalyticsDailySeries = {
  dates,
  rows: dates.map((date) => row({ date, revenue: 100, costSmu: 60, weight: 10 })),
}

describe('scopeRouteKeys', () => {
  it('returns every route for the "all" scope', () => {
    expect(scopeRouteKeys(series, { kind: 'all' }).sort()).toEqual(['Jabo|Batam', 'Jabo|Denpasar'])
  })

  it('returns the picked keys for a route scope', () => {
    expect(scopeRouteKeys(series, { kind: 'routes', keys: ['Jabo|Batam'] })).toEqual(['Jabo|Batam'])
  })

  it('uses the supplied group membership for a group scope', () => {
    expect(scopeRouteKeys(series, { kind: 'group', id: 'g1' }, ['Jabo|Denpasar'])).toEqual([
      'Jabo|Denpasar',
    ])
  })
})

describe('scopeLabel', () => {
  it('names the scope in the header', () => {
    expect(scopeLabel({ kind: 'all' })).toBe('All routes')
    expect(scopeLabel({ kind: 'routes', keys: ['a|b'] })).toBe('1 route selected')
    expect(scopeLabel({ kind: 'routes', keys: ['a|b', 'c|d'] })).toBe('2 routes selected')
    expect(scopeLabel({ kind: 'group', id: 'g1' }, 'Bali & Nusa')).toBe('Group: Bali & Nusa')
    expect(scopeLabel({ kind: 'group', id: 'g1' })).toBe('Route group')
  })
})

describe('buildAnalyticsContext', () => {
  it('scopes the series but never the health gate', () => {
    const ctx = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'routes', keys: ['Jabo|Denpasar'] },
    })
    // The scoped series carries only Denpasar.
    expect(ctx.kpi.revenue).toBe(400)
    // The gate is computed over every route, so picking a clean route cannot hide a broken period.
    expect(ctx.dq.coverageOk).toBe(false)
    expect(ctx.coverageOk).toBe(false)
    expect(ctx.dq.completeDaysPct).toBeLessThan(20)
  })

  it('kills every KPI delta when the baseline period is itself incomplete', () => {
    const ctx = buildAnalyticsContext({ series: clean, prevSeries: series, scope: { kind: 'all' } })
    expect(ctx.baselineIncomplete).toBe(true)
    expect(ctx.kpiDelta.revenue.deltaPct).toBeNull()
    expect(ctx.kpiDelta.marginPct.deltaPct).toBeNull()
    // The current-period values themselves are untouched — only the comparison is withdrawn.
    expect(ctx.kpiDelta.revenue.value).toBe(ctx.kpi.revenue)
  })

  it('computes deltas normally against a healthy baseline', () => {
    const richer: AnalyticsDailySeries = {
      dates,
      rows: dates.map((date) => row({ date, revenue: 200, costSmu: 120, weight: 20 })),
    }
    const ctx = buildAnalyticsContext({ series: richer, prevSeries: clean, scope: { kind: 'all' } })
    expect(ctx.baselineIncomplete).toBe(false)
    expect(ctx.kpiDelta.revenue.deltaPct).toBeCloseTo(100, 6)
  })

  it('leaves deltas absent, not zero, when there is no baseline at all', () => {
    const ctx = buildAnalyticsContext({ series: clean, prevSeries: undefined, scope: { kind: 'all' } })
    expect(ctx.prevKpi).toBeNull()
    expect(ctx.kpiDelta.revenue.deltaPct).toBeNull()
    expect(ctx.baselineIncomplete).toBe(false)
  })

  it('names the outlier date rather than only reporting bad coverage', () => {
    const ctx = buildAnalyticsContext({ series, prevSeries: clean, scope: { kind: 'all' } })
    expect(ctx.outliers.map((o) => o.date)).toEqual(['2026-05-02'])
  })

  it('flags the two notes from the scope and range it was given', () => {
    const all = buildAnalyticsContext({ series, prevSeries: clean, scope: { kind: 'all' } })
    expect(all.scoped).toBe(false)
    expect(all.ranged).toBe(false)

    const narrowed = buildAnalyticsContext({
      series,
      prevSeries: clean,
      scope: { kind: 'routes', keys: ['Jabo|Batam'] },
      ranged: true,
    })
    expect(narrowed.scoped).toBe(true)
    expect(narrowed.ranged).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/context.spec.ts`
Expected: FAIL — cannot find module `./context`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/utils/context.ts`:

```ts
/**
 * What the tab is looking at, assembled once and read by every section.
 *
 * Two rules live here and nowhere else:
 *  - the health gate is computed UNSCOPED, so narrowing to a clean route cannot certify a broken
 *    period;
 *  - KPI deltas are withdrawn entirely when the comparison period's own cost data is incomplete.
 */

import {
  AnalyticsDailySeries,
  AnalyticsScope,
  Campaign,
  Kpis,
  KpiSet,
  SeriesDay,
} from '../types'
import { COVERAGE_MIN, DqInput, DqReport, dqReport } from './dq'
import { DEFAULT_CAMPAIGNS } from './weekday'
import {
  Outlier,
  dailyOutliers,
  foldAll,
  foldByRoute,
  kpis,
  kpisWithDelta,
  routeKeysIn,
} from './series'

/** `groupRoutes` is the membership of a picked route group, resolved by the caller. */
export function scopeRouteKeys(
  series: AnalyticsDailySeries | undefined,
  scope: AnalyticsScope,
  groupRoutes?: string[],
): string[] {
  if (scope.kind === 'routes') return scope.keys
  if (scope.kind === 'group') return groupRoutes ?? []
  return routeKeysIn(series)
}

export function scopeLabel(scope: AnalyticsScope, groupName?: string): string {
  if (scope.kind === 'group') return groupName ? `Group: ${groupName}` : 'Route group'
  if (scope.kind === 'routes') {
    return `${scope.keys.length} route${scope.keys.length === 1 ? '' : 's'} selected`
  }
  return 'All routes'
}

export interface AnalyticsContext {
  scope: AnalyticsScope
  scopeLabel: string
  scoped: boolean
  ranged: boolean
  campaigns: Campaign[]
  routeKeys: string[]
  /** Folded to the viewer's scope. Everything the sections chart and total reads this. */
  series: SeriesDay[]
  /** Every route, always. The health gate and the outlier scan read this. */
  unscopedSeries: SeriesDay[]
  kpi: Kpis
  prevKpi: Kpis | null
  kpiDelta: KpiSet
  baselineIncomplete: boolean
  dq: DqReport
  coverageOk: boolean
  outliers: Outlier[]
}

export interface AnalyticsContextInput {
  series: AnalyticsDailySeries | undefined
  prevSeries: AnalyticsDailySeries | undefined
  scope: AnalyticsScope
  groupRoutes?: string[]
  groupName?: string
  campaigns?: Campaign[]
  /** True in custom-range mode, which drives the range-fallback note on period-aggregate sections. */
  ranged?: boolean
  /** The rest of the data-health inputs; the series fields are supplied here. */
  dq?: Omit<DqInput, 'series'>
}

export function buildAnalyticsContext(input: AnalyticsContextInput): AnalyticsContext {
  const scope = input.scope ?? { kind: 'all' }
  const routeKeys = scopeRouteKeys(input.series, scope, input.groupRoutes)
  const scoped = scope.kind !== 'all'

  const unscopedSeries = foldAll(input.series)
  const series = scoped ? foldByRoute(input.series, routeKeys) : unscopedSeries

  const kpi = kpis(series)
  const prevScoped = scoped ? foldByRoute(input.prevSeries, routeKeys) : foldAll(input.prevSeries)
  const hasPrev = prevScoped.length > 0
  const prevKpi = hasPrev ? kpis(prevScoped) : null

  // Day-level completeness across ALL routes, regardless of the viewer's scope. Route-level
  // coverage cannot tell a genuinely healthy period from one where most of a "covered" route's
  // revenue still lands on days its TO rows never completed.
  const dq = dqReport({ ...(input.dq ?? {}), series: unscopedSeries })

  // A delta against a period whose OWN cost data is incomplete is not a fact: the baseline reads
  // as 100% covered route-level while most of its revenue sits on incomplete days, so a naive
  // delta reports a real margin swing where the truth is "healthy period vs broken baseline".
  // Checked the same way — unscoped, day-level — independent of the viewer's scope.
  const baselineIncomplete =
    hasPrev && dqReport({ series: foldAll(input.prevSeries) }).coveragePct < COVERAGE_MIN

  const kpiDelta = kpisWithDelta(kpi, baselineIncomplete ? null : prevKpi)

  return {
    scope,
    scopeLabel: scopeLabel(scope, input.groupName),
    scoped,
    ranged: !!input.ranged,
    campaigns: input.campaigns ?? DEFAULT_CAMPAIGNS,
    routeKeys,
    series,
    unscopedSeries,
    kpi,
    prevKpi,
    kpiDelta,
    baselineIncomplete,
    dq,
    coverageOk: dq.coverageOk,
    // A bulk backfill on one date can hide behind an otherwise-plausible coverage number: the
    // health section needs to name the date, not just report the symptom.
    outliers: dailyOutliers(unscopedSeries),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/utils/context.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the whole util suite**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics`
Expected: PASS — every util spec green. All the tab's arithmetic is now covered.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/context.ts apps/frontend/src/features/pnl-analytics/utils/context.spec.ts
git commit -m "feat(pnl-analytics): analytics context with unscoped health gate"
```

---

### Task 14: Frontend — shared section chrome

Four small components nine sections lean on. Written once here so the sections that follow contain
only their own arithmetic and copy.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsSection.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsTable.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsNotes.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsScopePicker.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsNotes.spec.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsTable.spec.tsx`

**Interfaces:**
- Consumes: `AnalyticsScope` from `../types`; `routeLabel`, `splitRouteKey` from `../utils/cycle`; `useRouteGroups` from `@/features/route-groups/hooks/useRouteGroups`; `MultiRouteFilter` from `@/components/shared/multi-route-filter`.
- Produces: `AnalyticsSection`, `AnalyticsTable` + `Column<T>`, `ScopeFallbackNote`, `RangeFallbackNote`, `AbsentNote`, `EmptyNote`, `AnalyticsScopePicker`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsNotes.spec.tsx`:

```tsx
/**
 * An endpoint that failed to load and one that genuinely returned nothing are different facts.
 * Rendering the first as an empty table tells the reader "nothing happened this period", which is
 * a claim nobody made — so the two notes are pinned apart here.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AbsentNote, EmptyNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'

describe('AnalyticsNotes', () => {
  it('says the scope selector does not reach this section', () => {
    render(<ScopeFallbackNote />)
    expect(screen.getByText(/route scope selected above does not apply/i)).toBeInTheDocument()
  })

  it('says a custom range falls back to the full period', () => {
    render(<RangeFallbackNote />)
    expect(screen.getByText(/whole period/i)).toBeInTheDocument()
  })

  it('distinguishes a dataset that failed to load from one that is empty', () => {
    const { unmount } = render(<AbsentNote what="Vendor costs" />)
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    unmount()
    render(<EmptyNote what="Vendor costs" />)
    expect(screen.getByText(/no vendor costs in this period/i)).toBeInTheDocument()
  })
})
```

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsTable.spec.tsx`:

```tsx
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsTable } from './AnalyticsTable'

interface Row {
  name: string
  weight: number
}

const columns = [
  { key: 'name', header: 'Name', cell: (r: Row) => r.name },
  { key: 'weight', header: 'Weight', align: 'right' as const, cell: (r: Row) => r.weight },
]

describe('AnalyticsTable', () => {
  it('renders a header and one row per item', () => {
    render(<AnalyticsTable columns={columns} rows={[{ name: 'Lion', weight: 10 }]} rowKey={(r) => r.name} />)
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText('Lion')).toBeInTheDocument()
  })

  it('shows the empty message instead of a bare header when there are no rows', () => {
    render(
      <AnalyticsTable columns={columns} rows={[]} rowKey={(r) => r.name} empty="No airlines." />,
    )
    expect(screen.getByText('No airlines.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components`
Expected: FAIL — cannot find modules `./AnalyticsNotes` and `./AnalyticsTable`

- [ ] **Step 3: Write `AnalyticsSection.tsx`**

```tsx
'use client'

import { ReactNode } from 'react'

interface AnalyticsSectionProps {
  /** Anchor target for the section nav. */
  id: string
  title: string
  subtitle?: string
  /** Rendered on the heading row — a picker, a toggle, an edit button. */
  action?: ReactNode
  children: ReactNode
}

export function AnalyticsSection({ id, title, subtitle, action, children }: AnalyticsSectionProps) {
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
```

- [ ] **Step 4: Write `AnalyticsTable.tsx`**

```tsx
'use client'

import { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  cell: (row: T, index: number) => ReactNode
}

interface AnalyticsTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  /** Shown instead of the table when there are no rows — never a bare header with no body. */
  empty?: string
  /** Applied to a row that carries a caveat (incomplete cost, unattributed bucket). */
  rowClassName?: (row: T) => string | undefined
  /** Optional `data-testid` per row, so a spec can assert on one row rather than a whole table. */
  rowTestId?: (row: T, index: number) => string
}

export function AnalyticsTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'No rows.',
  rowClassName,
  rowTestId,
}: AnalyticsTableProps<T>) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              data-testid={rowTestId?.(row, i)}
              className={`border-b last:border-0 ${rowClassName?.(row) ?? ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`py-1.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Write `AnalyticsNotes.tsx`**

```tsx
'use client'

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      {children}
    </p>
  )
}

/**
 * Sections 6–9 read period-wide endpoints that carry no route dimension at all. When the viewer
 * has narrowed the scope, the numbers here are still every route — and must say so.
 */
export function ScopeFallbackNote() {
  return (
    <Note>
      The route scope selected above does not apply to this section: the API only provides these
      figures as a period-wide aggregate, with no per-route or per-group breakdown.
    </Note>
  )
}

/**
 * In custom-range mode, metrics that exist only as period aggregates keep using the whole period.
 */
export function RangeFallbackNote() {
  return (
    <Note>
      A custom date range is active. The figures in this section are only available as period
      aggregates, so they are still calculated over the whole period.
    </Note>
  )
}

/** The dataset failed to load. Not the same fact as "there was nothing this period". */
export function AbsentNote({ what }: { what: string }) {
  return <Note>{what} could not be loaded, so this section is incomplete.</Note>
}

/** The dataset loaded and genuinely had nothing in it. */
export function EmptyNote({ what }: { what: string }) {
  return <p className="text-sm text-muted-foreground">No {what.toLowerCase()} in this period.</p>
}
```

- [ ] **Step 6: Write `AnalyticsScopePicker.tsx`**

```tsx
'use client'

import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { AnalyticsScope } from '../types'
import { routeLabel, splitRouteKey } from '../utils/cycle'

interface AnalyticsScopePickerProps {
  /** Every route key the period actually carries — the picker never offers a route with no data. */
  routeKeys: string[]
  scope: AnalyticsScope
  onChange: (next: AnalyticsScope) => void
}

export function AnalyticsScopePicker({ routeKeys, scope, onChange }: AnalyticsScopePickerProps) {
  const { hasPermission } = usePermissions()
  const canReadGroups = hasPermission('read.route_group')
  // Not merely hidden when the permission is missing: `enabled` means no request is sent, so no
  // 403 ever reaches the user.
  const { data: groups } = useRouteGroups({ enabled: canReadGroups })

  const labelFor = (key: string) => {
    const { origin, dest } = splitRouteKey(key)
    return routeLabel(origin, dest)
  }
  const byLabel = new Map(routeKeys.map((k) => [labelFor(k), k]))
  const selectedLabels = scope.kind === 'routes' ? scope.keys.map(labelFor) : []

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={`rounded-md border px-3 py-1.5 text-sm ${scope.kind === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
        onClick={() => onChange({ kind: 'all' })}
      >
        All routes
      </button>

      {canReadGroups && (
        <select
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          value={scope.kind === 'group' ? scope.id : ''}
          onChange={(e) =>
            onChange(e.target.value ? { kind: 'group', id: e.target.value } : { kind: 'all' })
          }
        >
          <option value="">Route group…</option>
          {(groups ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}

      <MultiRouteFilter
        className="w-[240px]"
        routes={Array.from(byLabel.keys())}
        selected={selectedLabels}
        onChange={(labels) => {
          const keys = labels.map((l) => byLabel.get(l)).filter((k): k is string => !!k)
          onChange(keys.length ? { kind: 'routes', keys } : { kind: 'all' })
        }}
      />
    </div>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/components/
git commit -m "feat(pnl-analytics): shared section chrome, table and notes"
```

---

### Task 15: Frontend — chart theme + sections 1–2 (Data Health, Summary)

The two sections that decide whether the reader should trust the rest of the page. Everything they
show is already computed by `dq.ts`, `series.ts` and `context.ts` — these components only format.

A tiny `theme.ts` lands here too, because the next three tasks all need the same colours and the
colour scale must mean the same thing here as it does on the existing `PnlDailyMarginChart`.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/utils/theme.ts`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsHealth.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsSummary.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsHealth.spec.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsSummary.spec.tsx`

**Interfaces:**
- Consumes: `DqReport`, `COVERAGE_MIN` from `../utils/dq`; `Outlier` from `../utils/series`; `KPI_KEYS`, `KpiKey`, `KpiSet`, `Kpis` from `../types`; `AnalyticsSection`, `AnalyticsTable` from `./…`; `fmt`, `fmtIdrCompact`, `num`, `pct` from `@/features/pnl/utils/format`.
- Produces: `colorForMargin`, `MARGIN_GREY`, `SERIES_COLORS`, `COMPONENT_COLORS`, `formatDateLabel` from `../utils/theme`; components `AnalyticsHealth`, `AnalyticsSummary`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsHealth.spec.tsx`:

```tsx
/**
 * The health panel's whole job is to stop a reader trusting a broken period. These tests pin the
 * two ways it must not fail quietly: certifying an artifact period as healthy, and reporting the
 * two cost sources as agreeing when they could not be compared at all.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsHealth } from './AnalyticsHealth'
import { DqReport } from '../utils/dq'

const dq = (over: Partial<DqReport> = {}): DqReport => ({
  coveragePct: 99,
  coverageOk: true,
  routeCoveragePct: 100,
  completeDaysPct: 99,
  cleanDays: 15,
  totalDays: 15,
  routesWithoutCost: [],
  revenueWithoutCost: 0,
  costSourceDelta: {
    componentSum: 100,
    summaryTotal: 100,
    delta: 0,
    deltaPct: 0,
    agrees: true,
    comparable: true,
  },
  vendorAttributedPct: 100,
  raAttributedPct: 100,
  unmappedSlaRoutes: [],
  backendIssues: [],
  level: 'ok',
  ...over,
})

describe('AnalyticsHealth', () => {
  it('reports a healthy period without a warning banner', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete={false} />)
    expect(screen.getByTestId('analytics-health-level')).toHaveTextContent(/healthy/i)
    expect(screen.queryByTestId('analytics-health-warning')).not.toBeInTheDocument()
  })

  it('warns loudly when day-level completeness is below the threshold', () => {
    render(
      <AnalyticsHealth
        dq={dq({ coveragePct: 14.9, coverageOk: false, completeDaysPct: 14.9, level: 'bad' })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByTestId('analytics-health-warning')).toHaveTextContent('14.9%')
    // Route-level coverage says 100% for exactly this period; it must not be the headline.
    expect(screen.getByTestId('analytics-health-level')).toHaveTextContent(/unreliable/i)
  })

  it('says the two cost sources could not be compared rather than that they agree', () => {
    render(
      <AnalyticsHealth
        dq={dq({
          costSourceDelta: {
            componentSum: 100,
            summaryTotal: 0,
            delta: 100,
            deltaPct: null,
            agrees: false,
            comparable: false,
          },
        })}
        outliers={[]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByTestId('analytics-cost-sources')).toHaveTextContent(/could not be compared/i)
  })

  it('names the outlier date instead of only reporting the symptom', () => {
    render(
      <AnalyticsHealth
        dq={dq()}
        outliers={[{ date: '2026-05-02', weight: 5000, median: 100, ratio: 50, sharePct: 92 }]}
        baselineIncomplete={false}
      />,
    )
    expect(screen.getByTestId('analytics-outliers')).toHaveTextContent('2026-05-02')
  })

  it('says why the KPI deltas are missing when the baseline is broken', () => {
    render(<AnalyticsHealth dq={dq()} outliers={[]} baselineIncomplete />)
    expect(screen.getByTestId('analytics-baseline-note')).toHaveTextContent(/previous period/i)
  })
})
```

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsSummary.spec.tsx`:

```tsx
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsSummary } from './AnalyticsSummary'
import { KPI_KEYS, KpiSet, Kpis } from '../types'

const kpis: Kpis = {
  days: 4,
  weight: 40,
  weightPerDay: 10,
  revenue: 400,
  revenuePerDay: 100,
  revenuePerKg: 10,
  cost: 240,
  costPerDay: 60,
  costPerKg: 6,
  margin: 160,
  marginPerDay: 40,
  marginPerKg: 4,
  marginPct: 40,
}

const set = (deltaPct: number | null): KpiSet =>
  Object.fromEntries(
    KPI_KEYS.map((k) => [k, { value: kpis[k], prev: deltaPct == null ? null : kpis[k], deltaPct }]),
  ) as KpiSet

describe('AnalyticsSummary', () => {
  it('renders one card per KPI', () => {
    render(
      <AnalyticsSummary
        kpi={kpis}
        kpiDelta={set(null)}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(screen.getAllByTestId(/^kpi-/)).toHaveLength(KPI_KEYS.length)
  })

  it('shows a delta when there is a usable baseline', () => {
    render(
      <AnalyticsSummary
        kpi={kpis}
        kpiDelta={set(12.5)}
        baselineIncomplete={false}
        scopeLabel="All routes"
      />,
    )
    expect(within(screen.getByTestId('kpi-revenue')).getByText('+12.5%')).toBeInTheDocument()
  })

  it('shows no delta at all — not 0% — when there is no usable baseline', () => {
    render(
      <AnalyticsSummary kpi={kpis} kpiDelta={set(null)} baselineIncomplete scopeLabel="All routes" />,
    )
    expect(within(screen.getByTestId('kpi-revenue')).queryByText(/%$/)).not.toBeInTheDocument()
    expect(screen.getByTestId('analytics-summary-note')).toHaveTextContent(/baseline/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsHealth src/features/pnl-analytics/components/AnalyticsSummary`
Expected: FAIL — cannot find modules `./AnalyticsHealth` and `./AnalyticsSummary`

- [ ] **Step 3: Write `utils/theme.ts`**

Create `apps/frontend/src/features/pnl-analytics/utils/theme.ts`:

```ts
/**
 * Colour is a claim. A red bar on this tab must mean the same thing it means on the Daily Report's
 * margin chart, so the scale is copied from `PnlDailyMarginChart.tsx` rather than reinvented.
 */

export const MARGIN_GREY = '#94A3B8'

export function colorForMargin(marginPct: number | null, incomplete = false): string {
  if (incomplete) return MARGIN_GREY
  if (marginPct == null) return MARGIN_GREY
  if (marginPct < 0) return '#EF4444'
  if (marginPct < 10) return '#F59E0B'
  return '#22C55E'
}

/** Categorical series (airlines, vendors, weekdays) where no value judgement is implied. */
export const SERIES_COLORS = [
  '#2563EB',
  '#0EA5E9',
  '#14B8A6',
  '#8B5CF6',
  '#F59E0B',
  '#EC4899',
  '#64748B',
]

/**
 * Fixed per cost component so a stack keeps its colours across periods. Keyed by the `key` field
 * of `COST_COMPONENTS` ('smu' | 'ra' | 'sgOut' | 'sgIn'), NOT by the SeriesDay field name.
 */
export const COMPONENT_COLORS: Record<string, string> = {
  smu: '#2563EB',
  ra: '#14B8A6',
  sgOut: '#F59E0B',
  sgIn: '#8B5CF6',
}

export function formatDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
  })
}
```

- [ ] **Step 4: Write `AnalyticsHealth.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsHealth.tsx`:

```tsx
'use client'

import { fmt, num, pct } from '@/features/pnl/utils/format'
import { COVERAGE_MIN, DqReport } from '../utils/dq'
import { Outlier } from '../utils/series'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'

interface AnalyticsHealthProps {
  dq: DqReport
  outliers: Outlier[]
  baselineIncomplete: boolean
}

const LEVEL_TEXT: Record<DqReport['level'], string> = {
  ok: 'Healthy',
  warn: 'Use with care',
  bad: 'Unreliable',
}

const LEVEL_CLASS: Record<DqReport['level'], string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
  bad: 'bg-red-50 text-red-800 border-red-200',
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function AnalyticsHealth({ dq, outliers, baselineIncomplete }: AnalyticsHealthProps) {
  const src = dq.costSourceDelta

  return (
    <AnalyticsSection
      id="health"
      title="Data Health"
      subtitle="Read this before trusting anything below."
      action={
        <span
          data-testid="analytics-health-level"
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${LEVEL_CLASS[dq.level]}`}
        >
          {LEVEL_TEXT[dq.level]}
        </span>
      }
    >
      {!dq.coverageOk && (
        <p
          data-testid="analytics-health-warning"
          className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800"
        >
          Only {pct(dq.coveragePct)} of revenue falls on days whose cost is fully attributed
          (threshold {COVERAGE_MIN}%). Margin figures for this period are artifacts of missing cost
          data, not results.
        </p>
      )}

      {baselineIncomplete && (
        <p
          data-testid="analytics-baseline-note"
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          The previous period&apos;s own cost data is incomplete, so period-over-period deltas have
          been withdrawn rather than shown against a broken baseline.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Complete days"
          value={pct(dq.completeDaysPct)}
          hint={
            dq.totalDays != null ? `${num(dq.cleanDays)} of ${num(dq.totalDays)} days` : undefined
          }
        />
        <Stat
          label="Route coverage"
          value={pct(dq.routeCoveragePct)}
          hint="secondary — routes with any cost"
        />
        <Stat label="Vendor attributed" value={pct(dq.vendorAttributedPct)} hint="of tonnage" />
        <Stat label="RA attributed" value={pct(dq.raAttributedPct)} hint="of tonnage" />
      </div>

      <p data-testid="analytics-cost-sources" className="text-sm text-muted-foreground">
        {src.comparable ? (
          <>
            Cost sources {src.agrees ? 'agree' : 'disagree'}: components{' '}
            {fmt.format(src.componentSum)} vs summary {fmt.format(src.summaryTotal)} (
            {pct(src.deltaPct)}). Every figure on this tab uses the component sum.
          </>
        ) : (
          <>
            The two cost sources could not be compared — the summary total is missing. That is not a
            statement that they agree.
          </>
        )}
      </p>

      {dq.routesWithoutCost.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {dq.routesWithoutCost.length} route(s) carry revenue with no cost at all (
          {fmt.format(dq.revenueWithoutCost)}): {dq.routesWithoutCost.slice(0, 6).join(', ')}
          {dq.routesWithoutCost.length > 6 ? ', …' : ''}
        </p>
      )}

      {outliers.length > 0 && (
        <div data-testid="analytics-outliers">
          <p className="text-sm font-medium">Suspected backfill days</p>
          <AnalyticsTable<Outlier>
            columns={[
              { key: 'date', header: 'Date', cell: (o) => o.date },
              {
                key: 'weight',
                header: 'Weight',
                align: 'right',
                cell: (o) => num(Math.round(o.weight)),
              },
              { key: 'ratio', header: '× median', align: 'right', cell: (o) => `${o.ratio.toFixed(1)}×` },
              { key: 'share', header: 'Share of period', align: 'right', cell: (o) => pct(o.sharePct) },
            ]}
            rows={outliers}
            rowKey={(o) => o.date}
          />
        </div>
      )}

      {dq.unmappedSlaRoutes.length > 0 && (
        <p className="text-sm text-muted-foreground">
          SLA routes with no P&amp;L counterpart: {dq.unmappedSlaRoutes.join(', ')}
        </p>
      )}

      {dq.backendIssues.length > 0 && (
        <AnalyticsTable<DqReport['backendIssues'][number]>
          columns={[
            { key: 'issue', header: 'Backend data issue', cell: (i) => i.issue },
            { key: 'rows', header: 'Rows', align: 'right', cell: (i) => num(i.rows) },
            { key: 'awbs', header: 'AWBs', align: 'right', cell: (i) => num(i.awbs) },
          ]}
          rows={dq.backendIssues}
          rowKey={(i) => i.issue}
        />
      )}
    </AnalyticsSection>
  )
}
```

- [ ] **Step 5: Write `AnalyticsSummary.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsSummary.tsx`:

```tsx
'use client'

import { fmt, fmtIdrCompact, num, pct } from '@/features/pnl/utils/format'
import { KPI_KEYS, KpiKey, KpiSet, Kpis } from '../types'
import { AnalyticsSection } from './AnalyticsSection'

interface AnalyticsSummaryProps {
  kpi: Kpis
  kpiDelta: KpiSet
  baselineIncomplete: boolean
  scopeLabel: string
}

const KPI_LABELS: Record<KpiKey, string> = {
  days: 'Days',
  weight: 'Weight (kg)',
  weightPerDay: 'Weight / day',
  revenue: 'Revenue',
  revenuePerDay: 'Revenue / day',
  revenuePerKg: 'Revenue / kg',
  cost: 'Cost',
  costPerDay: 'Cost / day',
  costPerKg: 'Cost / kg',
  margin: 'Margin',
  marginPerDay: 'Margin / day',
  marginPerKg: 'Margin / kg',
  marginPct: 'Margin %',
}

// Full-precision rupiah would wrap on a 13-card grid; the per-kg figures keep the currency sign so
// they cannot be misread as kilograms.
const MONEY_COMPACT: KpiKey[] = [
  'revenue',
  'revenuePerDay',
  'cost',
  'costPerDay',
  'margin',
  'marginPerDay',
]
const MONEY_EXACT: KpiKey[] = ['revenuePerKg', 'costPerKg', 'marginPerKg']

function formatKpi(key: KpiKey, value: number): string {
  if (key === 'marginPct') return pct(value)
  if (MONEY_COMPACT.includes(key)) return fmtIdrCompact.format(value)
  if (MONEY_EXACT.includes(key)) return fmt.format(value)
  return num(Math.round(value))
}

export function AnalyticsSummary({
  kpi,
  kpiDelta,
  baselineIncomplete,
  scopeLabel,
}: AnalyticsSummaryProps) {
  return (
    <AnalyticsSection id="summary" title="Summary" subtitle={scopeLabel}>
      {baselineIncomplete && (
        <p
          data-testid="analytics-summary-note"
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
        >
          Period-over-period deltas are hidden: the baseline period&apos;s own cost data is
          incomplete, so a delta against it would not be a fact.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {KPI_KEYS.map((key) => {
          const d = kpiDelta[key]
          return (
            <div
              key={key}
              data-testid={`kpi-${key}`}
              className="min-w-0 rounded-lg border bg-card p-2.5"
            >
              <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                {KPI_LABELS[key]}
              </p>
              <p className="mt-1 truncate text-base font-bold tabular-nums">
                {formatKpi(key, kpi[key])}
              </p>
              {/* Absent, not zero: a 0% here would read as "unchanged". */}
              {d.deltaPct != null && (
                <p
                  className={`mt-0.5 text-xs tabular-nums ${d.deltaPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {d.deltaPct >= 0 ? '+' : ''}
                  {d.deltaPct.toFixed(1)}%
                </p>
              )}
            </div>
          )
        })}
      </div>
    </AnalyticsSection>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsHealth src/features/pnl-analytics/components/AnalyticsSummary`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/utils/theme.ts apps/frontend/src/features/pnl-analytics/components/
git commit -m "feat(pnl-analytics): data health and summary sections"
```

---

### Task 16: Frontend — sections 3–5 (Daily Trend, Time Patterns, Cost Structure)

The three chart sections. All three read only the scoped `SeriesDay[]` the context already folded,
so none of them does arithmetic beyond mapping a row to a chart datum.

Charts are wrapped in `ResponsiveContainer`, which measures its parent and renders nothing at zero
width — which is every jsdom test. The component tests therefore assert on the surrounding copy and
the table fallbacks, not on SVG.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsTrend.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsTimePatterns.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsCostStructure.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsTimePatterns.spec.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsCostStructure.spec.tsx`

**Interfaces:**
- Consumes: `SeriesDay`, `Campaign` from `../types`; `costComposition`, `CostComposition` from `../utils/series`; `weekdayProfile`, `campaignDates`, `campaignWindows`, `campaignSummary`, `parseCampaignInput`, `serializeCampaigns`, `DEFAULT_CAMPAIGNS` from `../utils/weekday`; `colorForMargin`, `COMPONENT_COLORS`, `SERIES_COLORS`, `formatDateLabel` from `../utils/theme`; `AnalyticsSection`, `AnalyticsTable` from `./…`.
- Produces: components `AnalyticsTrend`, `AnalyticsTimePatterns`, `AnalyticsCostStructure`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsTimePatterns.spec.tsx`:

```tsx
/**
 * The campaign editor replaces the original dashboard's `prompt()`. The behaviour that matters is
 * that unparseable input never takes the section down with it.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsTimePatterns } from './AnalyticsTimePatterns'
import { SeriesDay } from '../types'
import { DEFAULT_CAMPAIGNS } from '../utils/weekday'

const day = (date: string, weight: number): SeriesDay => ({
  date,
  revenue: weight * 10,
  costSmu: weight * 6,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  incompleteTos: 0,
  cost: weight * 6,
  margin: weight * 4,
  weight,
})

// 2026-05-01 is a Friday; nine consecutive days cover every weekday at least once.
const series: SeriesDay[] = Array.from({ length: 9 }, (_, i) =>
  day(`2026-05-0${i + 1}`, 100 + i * 10),
)

describe('AnalyticsTimePatterns', () => {
  it('renders one row per weekday present in the period', () => {
    render(
      <AnalyticsTimePatterns
        series={series}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={jest.fn()}
      />,
    )
    expect(screen.getByText('Friday')).toBeInTheDocument()
    expect(screen.getByText('Saturday')).toBeInTheDocument()
  })

  it('says so plainly when no campaign date falls inside the period', () => {
    render(
      <AnalyticsTimePatterns
        series={series}
        campaigns={[{ label: 'Payday (25th)', rule: { type: 'dayOfMonth', day: 25 } }]}
        onCampaignsChange={jest.fn()}
      />,
    )
    expect(screen.getByTestId('analytics-campaign-empty')).toBeInTheDocument()
  })

  it('hands the parsed campaigns back when the editor is saved', () => {
    const onCampaignsChange = jest.fn()
    render(
      <AnalyticsTimePatterns
        series={series}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={onCampaignsChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    fireEvent.change(screen.getByLabelText(/campaign rules/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onCampaignsChange).toHaveBeenCalledWith([
      { label: 'Day 10', rule: { type: 'dayOfMonth', day: 10 } },
    ])
  })

  it('rejects an unparseable rule instead of saving an empty campaign list', () => {
    const onCampaignsChange = jest.fn()
    render(
      <AnalyticsTimePatterns
        series={series}
        campaigns={DEFAULT_CAMPAIGNS}
        onCampaignsChange={onCampaignsChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /edit campaigns/i }))
    fireEvent.change(screen.getByLabelText(/campaign rules/i), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onCampaignsChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('analytics-campaign-error')).toBeInTheDocument()
  })
})
```

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsCostStructure.spec.tsx`:

```tsx
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsCostStructure } from './AnalyticsCostStructure'
import { SeriesDay } from '../types'

const series: SeriesDay[] = [
  {
    date: '2026-05-01',
    revenue: 1000,
    costSmu: 400,
    costRa: 100,
    costSgOut: 60,
    costSgIn: 40,
    incompleteTos: 0,
    cost: 600,
    margin: 400,
    weight: 100,
  },
]

describe('AnalyticsCostStructure', () => {
  it('shows every component with its share and per-kg cost', () => {
    render(<AnalyticsCostStructure series={series} />)
    const smu = screen.getByTestId('cost-component-smu')
    expect(within(smu).getByText('66.7%')).toBeInTheDocument()
  })

  it('says there is no cost rather than rendering an all-zero stack', () => {
    render(<AnalyticsCostStructure series={[{ ...series[0], costSmu: 0, costRa: 0, costSgOut: 0, costSgIn: 0, cost: 0 }]} />)
    expect(screen.getByTestId('analytics-cost-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('cost-component-smu')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsTimePatterns src/features/pnl-analytics/components/AnalyticsCostStructure`
Expected: FAIL — cannot find modules `./AnalyticsTimePatterns` and `./AnalyticsCostStructure`

- [ ] **Step 3: Write `AnalyticsTrend.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsTrend.tsx`:

```tsx
'use client'

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { Campaign, SeriesDay } from '../types'
import { campaignDates } from '../utils/weekday'
import { colorForMargin, formatDateLabel } from '../utils/theme'
import { AnalyticsSection } from './AnalyticsSection'

interface AnalyticsTrendProps {
  series: SeriesDay[]
  campaigns: Campaign[]
  scopeLabel: string
}

interface TrendDatum {
  date: string
  label: string
  weight: number
  marginPct: number | null
  revenue: number
  cost: number
  incomplete: boolean
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendDatum }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow">
      <p className="font-medium">{d.date}</p>
      <p>Weight: {num(Math.round(d.weight))} kg</p>
      <p>Revenue: {fmt.format(d.revenue)}</p>
      <p>Cost: {fmt.format(d.cost)}</p>
      <p>Margin: {pct(d.marginPct)}</p>
      {d.incomplete && <p className="text-amber-600">Cost incomplete on this day</p>}
    </div>
  )
}

export function AnalyticsTrend({ series, campaigns, scopeLabel }: AnalyticsTrendProps) {
  const data: TrendDatum[] = series.map((d) => ({
    date: d.date,
    label: formatDateLabel(d.date),
    weight: d.weight,
    // A day with incomplete cost gets no margin point at all: a line dipping to a fabricated
    // number reads as a bad day rather than as missing data.
    marginPct: d.incompleteTos || !d.revenue ? null : (d.margin / d.revenue) * 100,
    revenue: d.revenue,
    cost: d.cost,
    incomplete: d.incompleteTos > 0,
  }))

  const marks = new Set<string>()
  for (const c of campaigns) for (const date of campaignDates(c.rule, series)) marks.add(date)

  return (
    <AnalyticsSection
      id="trend"
      title="Daily Trend"
      subtitle={`${scopeLabel} — tonnage bars, margin % line, campaign days marked`}
    >
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No days in this period.</p>
      ) : (
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="weight" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="margin"
                orientation="right"
                unit="%"
                tick={{ fontSize: 11 }}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Array.from(marks).map((date) => (
                <ReferenceLine
                  key={date}
                  yAxisId="weight"
                  x={formatDateLabel(date)}
                  stroke="#EC4899"
                  strokeDasharray="4 4"
                />
              ))}
              <Bar yAxisId="weight" dataKey="weight" name="Weight (kg)">
                {data.map((d) => (
                  <Cell key={d.date} fill={colorForMargin(d.marginPct, d.incomplete)} />
                ))}
              </Bar>
              <Line
                yAxisId="margin"
                type="monotone"
                dataKey="marginPct"
                name="Margin %"
                stroke="#0F172A"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Bars are coloured by that day&apos;s margin — grey where cost is incomplete, and those days
        carry no margin point on the line. Dashed pink lines mark campaign dates.
      </p>
    </AnalyticsSection>
  )
}
```

- [ ] **Step 4: Write `AnalyticsTimePatterns.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsTimePatterns.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { Campaign, SeriesDay } from '../types'
import {
  CampaignSummaryRow,
  WeekdayBucket,
  campaignSummary,
  campaignWindows,
  parseCampaignInput,
  serializeCampaigns,
  weekdayProfile,
} from '../utils/weekday'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'

interface AnalyticsTimePatternsProps {
  series: SeriesDay[]
  campaigns: Campaign[]
  onCampaignsChange: (next: Campaign[]) => void
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

export function AnalyticsTimePatterns({
  series,
  campaigns,
  onCampaignsChange,
}: AnalyticsTimePatternsProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const profile = weekdayProfile(series)
  const windows = campaignWindows(series, campaigns)
  const summary = campaignSummary(windows)

  const openEditor = () => {
    setDraft(serializeCampaigns(campaigns))
    setError(null)
    setEditing(true)
  }

  const save = () => {
    const parsed = parseCampaignInput(draft)
    // Saving an empty list would silently erase the section rather than report bad input.
    if (!parsed.length) {
      setError('Could not read any rule. Use "double" for double dates, or a day number like 25.')
      return
    }
    onCampaignsChange(parsed)
    setEditing(false)
  }

  return (
    <AnalyticsSection
      id="time-patterns"
      title="Time Patterns"
      subtitle="Which weekdays carry the tonnage, and what campaigns do to it"
      action={
        <button
          className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
          onClick={openEditor}
        >
          Edit campaigns
        </button>
      }
    >
      {editing && (
        <div className="rounded-md border p-3">
          <label htmlFor="campaign-rules" className="text-xs font-medium">
            Campaign rules
          </label>
          <input
            id="campaign-rules"
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Comma-separated. <code>double</code> means double dates (7.7, 8.8, …); a number means
            that day of every month.
          </p>
          {error && (
            <p data-testid="analytics-campaign-error" className="mt-1 text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
              onClick={save}
            >
              Save
            </button>
            <button className="rounded-md border px-3 py-1 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <AnalyticsTable<WeekdayBucket>
        columns={[
          { key: 'label', header: 'Weekday', cell: (b) => b.label },
          { key: 'days', header: 'Days', align: 'right', cell: (b) => num(b.days) },
          {
            key: 'avgWeight',
            header: 'Avg weight',
            align: 'right',
            cell: (b) => num(Math.round(b.avgWeight)),
          },
          {
            key: 'vs',
            header: 'vs period avg',
            align: 'right',
            cell: (b) => signed(b.vsOverallPct),
          },
          {
            key: 'avgMargin',
            header: 'Avg margin',
            align: 'right',
            cell: (b) => fmt.format(b.avgMargin),
          },
          { key: 'marginPct', header: 'Margin %', align: 'right', cell: (b) => pct(b.avgMarginPct) },
        ]}
        rows={profile}
        rowKey={(b) => String(b.weekday)}
        empty="No days in this period."
      />

      {summary.length === 0 ? (
        <p data-testid="analytics-campaign-empty" className="text-sm text-muted-foreground">
          No campaign date falls inside this period, so there is nothing to measure against.
        </p>
      ) : (
        <div className="space-y-2">
          {summary.map((row: CampaignSummaryRow) => (
            <div key={row.label} data-testid={`campaign-${row.label}`}>
              <p className="text-sm font-medium">
                {row.label}
                {row.peakOffset != null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    peak at D{row.peakOffset >= 0 ? '+' : ''}
                    {row.peakOffset}
                  </span>
                )}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.byOffset.map((o) => (
                  <span
                    key={o.offset}
                    className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${o.avgLift >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
                  >
                    D{o.offset >= 0 ? '+' : ''}
                    {o.offset}: {signed(o.avgLift)}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Lift is against the median tonnage of days outside every campaign window, so a large
            campaign cannot inflate its own baseline.
          </p>
        </div>
      )}
    </AnalyticsSection>
  )
}
```

- [ ] **Step 5: Write `AnalyticsCostStructure.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsCostStructure.tsx`:

```tsx
'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmt, pct } from '@/features/pnl/utils/format'
import { SeriesDay } from '../types'
import { COST_COMPONENTS, costComposition } from '../utils/series'
import { COMPONENT_COLORS, formatDateLabel } from '../utils/theme'
import { AnalyticsSection } from './AnalyticsSection'

interface AnalyticsCostStructureProps {
  series: SeriesDay[]
}

export function AnalyticsCostStructure({ series }: AnalyticsCostStructureProps) {
  const comp = costComposition(series)
  const data = series.map((d) => ({
    label: formatDateLabel(d.date),
    costSmu: d.costSmu,
    costRa: d.costRa,
    costSgOut: d.costSgOut,
    costSgIn: d.costSgIn,
  }))

  return (
    <AnalyticsSection
      id="cost-structure"
      title="Cost Structure"
      subtitle={`Total ${fmt.format(comp.total)} — ${fmt.format(comp.totalPerKg)} / kg`}
    >
      {comp.total === 0 ? (
        <p data-testid="analytics-cost-empty" className="text-sm text-muted-foreground">
          No cost has been attributed in this period, so there is no structure to break down.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {comp.components.map((c) => (
              <div
                key={c.key}
                data-testid={`cost-component-${c.key}`}
                className="rounded-md border p-2"
              >
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: COMPONENT_COLORS[c.key] }}
                  />
                  {c.label}
                </p>
                <p className="text-sm font-semibold tabular-nums">{fmt.format(c.value)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {pct(c.pct)} · {fmt.format(c.perKg)} / kg
                </p>
              </div>
            ))}
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt.format(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* dataKey is the SeriesDay FIELD (costSmu…); the colour map is keyed by the
                    component key (smu…). Swapping the two renders four empty bars. */}
                {COST_COMPONENTS.map((c) => (
                  <Bar
                    key={c.key}
                    dataKey={c.field}
                    stackId="cost"
                    name={c.label}
                    fill={COMPONENT_COLORS[c.key]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </AnalyticsSection>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsTimePatterns src/features/pnl-analytics/components/AnalyticsCostStructure`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/components/
git commit -m "feat(pnl-analytics): trend, time pattern and cost structure sections"
```

---

### Task 17: Frontend — sections 6–9 (SMU & Airline, RA, Incoming/Outgoing, Vendor Execution)

The four sections built on the `/pnl/breakdown/cost-by-*` endpoints. They share a shape — a share
table with an unattributed bucket — so they also share one internal `ShareBlock`.

These are the sections that must carry `ScopeFallbackNote` and `RangeFallbackNote`: their endpoints
accept no route dimension at all, so under a narrowed scope the numbers are still every route. And
they are the sections where absent must not render as empty.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/components/ShareBlock.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsAirline.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsRa.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsSg.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsVendor.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/ShareBlock.spec.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsVendor.spec.tsx`

**Interfaces:**
- Consumes: `ShareResult`, `ShareRow`, `SelfOperateResult`, `buildShare`, `shareTable`, `vendorExecution`, `airlineShare`, `selfOperateGap` from `../utils/share`; `UNATTRIBUTED` from `../utils/series`; `PnlVendorCostItem`, `PnlNamedCostItem`, `PnlSgInRouteCostItem` from `@/features/pnl/hooks/usePnl`; `SERIES_COLORS`, `MARGIN_GREY` from `../utils/theme`; `AnalyticsSection`, `AnalyticsTable`, `AbsentNote`, `EmptyNote`, `ScopeFallbackNote`, `RangeFallbackNote` from `./…`.
- Produces: components `ShareBlock`, `AnalyticsAirline`, `AnalyticsRa`, `AnalyticsSg`, `AnalyticsVendor`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/pnl-analytics/components/ShareBlock.spec.tsx`:

```tsx
/**
 * Three separate facts a share table must never conflate: the data failed to load, the data loaded
 * and was empty, and the data loaded but part of it has no name attached.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ShareBlock } from './ShareBlock'
import { buildShare } from '../utils/share'

const share = buildShare([
  { name: 'Lion', weight: 80, cost: 800 },
  { name: null, weight: 20, cost: 300 },
])

describe('ShareBlock', () => {
  it('renders one row per entry with its share of tonnage', () => {
    render(<ShareBlock what="Airlines" share={share} isError={false} isLoading={false} />)
    expect(screen.getByText('Lion')).toBeInTheDocument()
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('flags how much tonnage carries no name', () => {
    render(<ShareBlock what="Airlines" share={share} isError={false} isLoading={false} />)
    expect(screen.getByTestId('share-attributed')).toHaveTextContent('80.0%')
  })

  it('says the data failed to load rather than showing an empty table', () => {
    render(<ShareBlock what="Airlines" share={undefined} isError isLoading={false} />)
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
  })

  it('says the period was empty when it loaded with no rows', () => {
    render(
      <ShareBlock what="Airlines" share={buildShare([])} isError={false} isLoading={false} />,
    )
    expect(screen.getByText(/no airlines in this period/i)).toBeInTheDocument()
  })
})
```

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsVendor.spec.tsx`:

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsVendor } from './AnalyticsVendor'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'

const data: PnlVendorCostItem[] = [
  {
    vendor: 'ESP',
    totalWeight: 100,
    totalCost: 500,
    airlines: [{ airline: 'Lion', totalWeight: 100, totalCost: 500 }],
  },
  {
    vendor: 'Acme',
    totalWeight: 200,
    totalCost: 1600,
    airlines: [{ airline: 'Lion', totalWeight: 200, totalCost: 1600 }],
  },
]

describe('AnalyticsVendor', () => {
  it('shows the self-operate gap against the ESP baseline', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped={false} ranged={false} />)
    // Acme pays 8/kg where ESP pays 5/kg over 200 kg → 600 of impact.
    expect(screen.getByTestId('self-operate-total')).toHaveTextContent('600')
  })

  it('carries the scope note when the viewer has narrowed the scope', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped ranged={false} />)
    expect(screen.getByText(/does not apply/i)).toBeInTheDocument()
  })

  it('carries the range note in custom-range mode', () => {
    render(<AnalyticsVendor data={data} isLoading={false} isError={false} scoped={false} ranged />)
    expect(screen.getByText(/whole period/i)).toBeInTheDocument()
  })

  it('says so when no vendor shares an airline with ESP', () => {
    render(
      <AnalyticsVendor
        data={[data[1]]}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(screen.getByTestId('self-operate-empty')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/ShareBlock src/features/pnl-analytics/components/AnalyticsVendor`
Expected: FAIL — cannot find modules `./ShareBlock` and `./AnalyticsVendor`

- [ ] **Step 3: Write `ShareBlock.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/ShareBlock.tsx`:

```tsx
'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt, num, pct } from '@/features/pnl/utils/format'
import { ShareResult, ShareRow } from '../utils/share'
import { UNATTRIBUTED } from '../utils/series'
import { MARGIN_GREY, SERIES_COLORS } from '../utils/theme'
import { AbsentNote, EmptyNote } from './AnalyticsNotes'
import { AnalyticsTable } from './AnalyticsTable'

interface ShareBlockProps {
  /** Plural noun for the entity, used in both notes: "Airlines", "RA providers". */
  what: string
  share: ShareResult | undefined
  isLoading: boolean
  isError: boolean
  /** Column header for the name column. Defaults to `what` minus its plural. */
  nameHeader?: string
}

/** Ranking bar for the top rows. The table below carries every row and all the exact numbers. */
const RANK_LIMIT = 8

export function ShareBlock({ what, share, isLoading, isError, nameHeader }: ShareBlockProps) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  // Checked before emptiness: a failed request and an empty period are different facts, and only
  // one of them says anything about the business.
  if (isError || !share) return <AbsentNote what={what} />
  if (!share.rows.length) return <EmptyNote what={what} />

  return (
    <div className="space-y-2">
      <p data-testid="share-attributed" className="text-xs text-muted-foreground">
        {pct(share.attributedPct)} of tonnage carries a name; the rest is grouped under{' '}
        {UNATTRIBUTED}.
      </p>

      {/* Horizontal ranking, the spec's `hBar`. Renders nothing at zero width (every jsdom test),
          which is why the table below is the thing specs assert on. */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={share.rows.slice(0, RANK_LIMIT)}
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => `${num(Math.round(v))} kg`} />
            <Bar dataKey="weight" name="Weight">
              {share.rows.slice(0, RANK_LIMIT).map((r, i) => (
                // The unattributed bucket is not a competitor in this ranking; grey says so.
                <Cell
                  key={r.name}
                  fill={r.attributed ? SERIES_COLORS[i % SERIES_COLORS.length] : MARGIN_GREY}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <AnalyticsTable<ShareRow>
        columns={[
          {
            key: 'name',
            header: nameHeader ?? what,
            cell: (r) => (
              <span className={r.attributed ? '' : 'text-muted-foreground italic'}>{r.name}</span>
            ),
          },
          { key: 'weight', header: 'Weight', align: 'right', cell: (r) => num(Math.round(r.weight)) },
          { key: 'weightPct', header: 'Share', align: 'right', cell: (r) => pct(r.weightPct) },
          { key: 'cost', header: 'Cost', align: 'right', cell: (r) => fmt.format(r.cost) },
          { key: 'costPerKg', header: 'Cost / kg', align: 'right', cell: (r) => fmt.format(r.costPerKg) },
        ]}
        rows={share.rows}
        rowKey={(r) => r.name}
        rowClassName={(r) => (r.attributed ? undefined : 'bg-muted/40')}
      />
    </div>
  )
}
```

- [ ] **Step 4: Write `AnalyticsAirline.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsAirline.tsx`:

```tsx
'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fmt } from '@/features/pnl/utils/format'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'
import { airlineShare, vendorExecution } from '../utils/share'
import { SERIES_COLORS } from '../utils/theme'
import { AnalyticsSection } from './AnalyticsSection'
import { RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsAirlineProps {
  data: PnlVendorCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsAirline({ data, isLoading, isError, scoped, ranged }: AnalyticsAirlineProps) {
  const airlines = data ? airlineShare(data) : undefined
  const vendors = data ? vendorExecution(data) : undefined
  const pieRows = (airlines?.rows ?? []).filter((r) => r.attributed && r.weight > 0).slice(0, 7)

  return (
    <AnalyticsSection
      id="airline"
      title="SMU & Airline"
      subtitle="Where the main-leg tonnage flies and what it costs"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      {pieRows.length > 0 && (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieRows} dataKey="weight" nameKey="name" innerRadius={55} outerRadius={90}>
                {pieRows.map((r, i) => (
                  <Cell key={r.name} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, n: string) => [`${Math.round(v)} kg`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <ShareBlock
        what="Airlines"
        nameHeader="Airline"
        share={airlines}
        isLoading={isLoading}
        isError={isError}
      />

      <div>
        <p className="text-sm font-medium">SMU cost by vendor</p>
        <p className="text-xs text-muted-foreground">
          Total cost across all vendors: {vendors ? fmt.format(vendors.rows.reduce((s, r) => s + r.cost, 0)) : '—'}
        </p>
        <ShareBlock
          what="Vendors"
          nameHeader="Vendor"
          share={vendors}
          isLoading={isLoading}
          isError={isError}
        />
      </div>
    </AnalyticsSection>
  )
}
```

- [ ] **Step 5: Write `AnalyticsRa.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsRa.tsx`:

```tsx
'use client'

import { PnlNamedCostItem } from '@/features/pnl/hooks/usePnl'
import { shareTable } from '../utils/share'
import { AnalyticsSection } from './AnalyticsSection'
import { RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsRaProps {
  data: PnlNamedCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsRa({ data, isLoading, isError, scoped, ranged }: AnalyticsRaProps) {
  return (
    <AnalyticsSection
      id="ra"
      title="Regulated Agent"
      subtitle="Screening cost, by provider"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}
      <ShareBlock
        what="RA providers"
        nameHeader="RA provider"
        share={data ? shareTable(data, 'name') : undefined}
        isLoading={isLoading}
        isError={isError}
      />
    </AnalyticsSection>
  )
}
```

- [ ] **Step 6: Write `AnalyticsSg.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsSg.tsx`:

```tsx
'use client'

import { PnlNamedCostItem, PnlSgInRouteCostItem } from '@/features/pnl/hooks/usePnl'
import { shareTable } from '../utils/share'
import { AnalyticsSection } from './AnalyticsSection'
import { RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsSgProps {
  outgoing: PnlNamedCostItem[] | undefined
  incoming: PnlSgInRouteCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsSg({
  outgoing,
  incoming,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsSgProps) {
  return (
    <AnalyticsSection
      id="sg"
      title="Incoming & Outgoing"
      subtitle="Ground handling either side of the main leg"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      <div>
        <p className="text-sm font-medium">Outgoing (SG Out), by handler</p>
        <ShareBlock
          what="Outgoing handlers"
          nameHeader="Handler"
          share={outgoing ? shareTable(outgoing, 'name') : undefined}
          isLoading={isLoading}
          isError={isError}
        />
      </div>

      <div>
        <p className="text-sm font-medium">Incoming (SG In), by route</p>
        {/* Incoming is reported per route, not per handler — the endpoint has no handler name. */}
        <ShareBlock
          what="Incoming routes"
          nameHeader="Route"
          share={incoming ? shareTable(incoming, 'route') : undefined}
          isLoading={isLoading}
          isError={isError}
        />
      </div>
    </AnalyticsSection>
  )
}
```

- [ ] **Step 7: Write `AnalyticsVendor.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsVendor.tsx`:

```tsx
'use client'

import { fmt, num } from '@/features/pnl/utils/format'
import { PnlVendorCostItem } from '@/features/pnl/hooks/usePnl'
import { SelfOperateRow, selfOperateGap, vendorExecution } from '../utils/share'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'
import { ShareBlock } from './ShareBlock'

interface AnalyticsVendorProps {
  data: PnlVendorCostItem[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsVendor({
  data,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsVendorProps) {
  const gap = data ? selfOperateGap(data) : undefined

  return (
    <AnalyticsSection
      id="vendor"
      title="Vendor Execution"
      subtitle="What third-party vendors cost against ESP's own cost on the same airline"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      <ShareBlock
        what="Vendors"
        nameHeader="Vendor"
        share={data ? vendorExecution(data) : undefined}
        isLoading={isLoading}
        isError={isError}
      />

      {isError || !gap ? (
        <AbsentNote what="Vendor costs" />
      ) : gap.rows.length === 0 ? (
        <p data-testid="self-operate-empty" className="text-sm text-muted-foreground">
          No vendor shares an airline with ESP in this period, so there is no comparable baseline
          for a self-operate gap.
        </p>
      ) : (
        <div className="space-y-2">
          <p data-testid="self-operate-total" className="text-sm">
            Self-operate gap: <strong>{fmt.format(gap.totalImpact)}</strong> — the extra cost paid to
            vendors versus ESP&apos;s own per-kg cost on the same airline. Operating that tonnage
            would tie up {fmt.format(gap.totalCapital)}.
          </p>
          <AnalyticsTable<SelfOperateRow>
            columns={[
              { key: 'airline', header: 'Airline', cell: (r) => r.airline },
              { key: 'vendor', header: 'Vendor', cell: (r) => r.vendor },
              {
                key: 'weight',
                header: 'Weight',
                align: 'right',
                cell: (r) => num(Math.round(r.vendorWeight)),
              },
              {
                key: 'vendorCostPerKg',
                header: 'Vendor / kg',
                align: 'right',
                cell: (r) => fmt.format(r.vendorCostPerKg),
              },
              {
                key: 'espCostPerKg',
                header: 'ESP / kg',
                align: 'right',
                cell: (r) => fmt.format(r.espCostPerKg),
              },
              {
                key: 'gapPerKg',
                header: 'Gap / kg',
                align: 'right',
                cell: (r) => fmt.format(r.gapPerKg),
              },
              { key: 'impact', header: 'Impact', align: 'right', cell: (r) => fmt.format(r.impact) },
            ]}
            rows={gap.rows}
            rowKey={(r) => `${r.vendor}|${r.airline}`}
            // A negative gap means the vendor is cheaper than ESP on that airline — worth seeing,
            // not worth hiding.
            rowClassName={(r) => (r.gapPerKg < 0 ? 'text-emerald-700' : undefined)}
          />
        </div>
      )}
    </AnalyticsSection>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/ShareBlock src/features/pnl-analytics/components/AnalyticsVendor`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/components/
git commit -m "feat(pnl-analytics): airline, RA, SG and vendor execution sections"
```

---

### Task 18: Frontend — sections 10–12 (Best Journey, Routes & Groups, Weight Gap)

Three route-dimension sections. Journey and Weight Gap come from the new aggregation endpoints and
carry only the range note (they do accept the period, but not a route filter, so the scope note
applies too); Routes & Groups is derived from the per-route daily series and honours the scope
fully.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsJourney.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsRoutes.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsWeightGap.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsJourney.spec.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsRoutes.spec.tsx`

**Interfaces:**
- Consumes: `AnalyticsJourneyRow`, `AnalyticsGwChwRow`, `AnalyticsDailySeries` from `../types`; `bestCombination`, `BestRouteRow` from `../utils/journey`; `routeContribution`, `concentration`, `marginStability`, `RouteContributionRow` from `../utils/routes`; `routeLabel`, `splitRouteKey` from `../utils/cycle`; `colorForMargin` from `../utils/theme`; `AnalyticsSection`, `AnalyticsTable`, `AbsentNote`, `ScopeFallbackNote`, `RangeFallbackNote` from `./…`.
- Produces: components `AnalyticsJourney`, `AnalyticsRoutes`, `AnalyticsWeightGap`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsJourney.spec.tsx`:

```tsx
/**
 * The "best combination" is a recommendation. When the 5% tonnage floor did not hold, the winner is
 * one lucky AWB rather than a repeatable rate — and the table has to say so, or the number reads as
 * advice it cannot support.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsJourney } from './AnalyticsJourney'
import { AnalyticsJourneyRow } from '../types'

const jrow = (over: Partial<AnalyticsJourneyRow>): AnalyticsJourneyRow => ({
  vendor: 'ESP',
  airline: 'Lion',
  origin: 'Jabo',
  dest: 'Denpasar',
  awbCount: 10,
  gw: 100,
  chwt: 110,
  revenue: 1000,
  cost: 600,
  margin: 400,
  marginPerKg: 4,
  ...over,
})

describe('AnalyticsJourney', () => {
  it('ranks routes by the upside of moving tonnage onto the best combination', () => {
    render(
      <AnalyticsJourney
        data={[jrow({}), jrow({ vendor: 'Acme', gw: 300, margin: 300, marginPerKg: 1 })]}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    const row = screen.getByTestId('journey-Jabo|Denpasar')
    expect(within(row).getByText(/ESP/)).toBeInTheDocument()
  })

  it('marks a route whose winner did not clear the tonnage floor', () => {
    // The 4/kg winner holds 1 kg of 301 — well under the 5% floor, so nothing is eligible.
    render(
      <AnalyticsJourney
        data={[
          jrow({ gw: 1, margin: 4 }),
          jrow({ vendor: 'Acme', gw: 300, margin: 300, marginPerKg: 1 }),
        ]}
        isLoading={false}
        isError={false}
        scoped={false}
        ranged={false}
      />,
    )
    expect(within(screen.getByTestId('journey-Jabo|Denpasar')).getByTitle(/tonnage floor/i)).toBeInTheDocument()
  })

  it('says the data failed to load rather than showing an empty ranking', () => {
    render(
      <AnalyticsJourney data={undefined} isLoading={false} isError scoped={false} ranged={false} />,
    )
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
  })
})
```

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsRoutes.spec.tsx`:

```tsx
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsRoutes } from './AnalyticsRoutes'
import { AnalyticsDailyRow, AnalyticsDailySeries } from '../types'

const row = (over: Partial<AnalyticsDailyRow>): AnalyticsDailyRow => ({
  date: '2026-05-01',
  origin: 'Jabo',
  dest: 'Denpasar',
  revenue: 100,
  costSmu: 60,
  costRa: 0,
  costSgOut: 0,
  costSgIn: 0,
  weight: 10,
  incompleteTos: 0,
  ...over,
})

const dates = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06']

const series: AnalyticsDailySeries = {
  dates,
  rows: [
    ...dates.map((date) => row({ date })),
    ...dates.map((date) => row({ date, dest: 'Batam', revenue: 50, costSmu: 45, weight: 5 })),
  ],
}

describe('AnalyticsRoutes', () => {
  it('lists every route in scope with its share of margin', () => {
    render(<AnalyticsRoutes series={series} routeKeys={['Jabo|Denpasar', 'Jabo|Batam']} />)
    expect(screen.getByTestId('route-Jabo|Denpasar')).toBeInTheDocument()
    expect(screen.getByTestId('route-Jabo|Batam')).toBeInTheDocument()
  })

  it('reports how many routes the concentration figure had to exclude', () => {
    const withBroken: AnalyticsDailySeries = {
      dates,
      rows: [...series.rows, row({ dest: 'Aceh', revenue: 900, costSmu: 0, incompleteTos: 4 })],
    }
    render(
      <AnalyticsRoutes
        series={withBroken}
        routeKeys={['Jabo|Denpasar', 'Jabo|Batam', 'Jabo|Aceh']}
      />,
    )
    expect(screen.getByTestId('analytics-concentration')).toHaveTextContent(/1 route/i)
  })

  it('leaves stability blank rather than guessing when a route has too few usable days', () => {
    const thin: AnalyticsDailySeries = {
      dates: dates.slice(0, 3),
      rows: dates.slice(0, 3).map((date) => row({ date })),
    }
    render(<AnalyticsRoutes series={thin} routeKeys={['Jabo|Denpasar']} />)
    expect(within(screen.getByTestId('route-Jabo|Denpasar')).getByText('—')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsJourney src/features/pnl-analytics/components/AnalyticsRoutes`
Expected: FAIL — cannot find modules `./AnalyticsJourney` and `./AnalyticsRoutes`

- [ ] **Step 3: Write `AnalyticsJourney.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsJourney.tsx`:

```tsx
'use client'

import { fmt, num, pct } from '@/features/pnl/utils/format'
import { AnalyticsJourneyRow } from '../types'
import { BestRouteRow, bestCombination } from '../utils/journey'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'

interface AnalyticsJourneyProps {
  data: AnalyticsJourneyRow[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsJourney({
  data,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsJourneyProps) {
  const result = data ? bestCombination(data) : undefined

  return (
    <AnalyticsSection
      id="journey"
      title="Best Journey"
      subtitle="The best vendor × airline combination per route, and what the rest of the tonnage leaves on the table"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !result ? (
        <AbsentNote what="Journey data" />
      ) : result.byRoute.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No vendor and airline combination carries attributed tonnage in this period.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {pct(result.overall.optimalPct)} of {num(Math.round(result.overall.attributedTonnage))} kg
            already flies on its route&apos;s best combination. Moving the rest would be worth{' '}
            <strong>{fmt.format(result.overall.upside)}</strong>.
          </p>
          <AnalyticsTable<BestRouteRow>
            columns={[
              { key: 'route', header: 'Route', cell: (r) => r.label },
              {
                key: 'best',
                header: 'Best combination',
                cell: (r) => (
                  <span className="flex items-center gap-1">
                    {r.best.vendor ?? '—'} · {r.best.airline ?? '—'}
                    {/* The floor did not hold: the winner is one lucky shipment, not a rate. */}
                    {!r.floorCleared && (
                      <span
                        title="No combination cleared the 5% tonnage floor, so this winner may not be repeatable."
                        className="text-amber-600"
                      >
                        ⚠
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'bestPerKg',
                header: 'Best margin / kg',
                align: 'right',
                cell: (r) => fmt.format(r.best.marginPerKg),
              },
              {
                key: 'actualPerKg',
                header: 'Route margin / kg',
                align: 'right',
                cell: (r) => fmt.format(r.actualMarginPerKg),
              },
              { key: 'optimalPct', header: 'On best', align: 'right', cell: (r) => pct(r.optimalPct) },
              { key: 'upside', header: 'Upside', align: 'right', cell: (r) => fmt.format(r.upside) },
            ]}
            rows={result.byRoute}
            rowKey={(r) => r.routeKey}
            rowTestId={(r) => `journey-${r.routeKey}`}
            rowClassName={(r) => (r.floorCleared ? undefined : 'bg-amber-50/60')}
          />
          <p className="text-xs text-muted-foreground">
            A combination must carry at least 5% of a route&apos;s attributed tonnage to set that
            route&apos;s benchmark. Rows marked ⚠ had nothing clear that floor.
          </p>
        </>
      )}
    </AnalyticsSection>
  )
}
```

- [ ] **Step 4: Write `AnalyticsRoutes.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsRoutes.tsx`:

```tsx
'use client'

import { fmt, num, pct } from '@/features/pnl/utils/format'
import { AnalyticsDailySeries } from '../types'
import { RouteContributionRow, concentration, marginStability, routeContribution } from '../utils/routes'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'

interface AnalyticsRoutesProps {
  series: AnalyticsDailySeries | undefined
  routeKeys: string[]
}

/** Higher HHI means the period's margin rests on fewer routes. 0.25+ is the usual "concentrated". */
const hhiLabel = (hhi: number) =>
  hhi >= 0.25 ? 'highly concentrated' : hhi >= 0.15 ? 'moderately concentrated' : 'well spread'

export function AnalyticsRoutes({ series, routeKeys }: AnalyticsRoutesProps) {
  const rows = routeContribution(series, routeKeys)
  const conc = concentration(rows)
  const stability = new Map(rows.map((r) => [r.routeKey, marginStability(series, r.routeKey)]))

  return (
    <AnalyticsSection
      id="routes"
      title="Routes & Groups"
      subtitle="Where the margin comes from, and how steady it is"
    >
      <p data-testid="analytics-concentration" className="text-sm">
        Top route holds {pct(conc.top1Pct)} of margin, top three {pct(conc.top3Pct)}; HHI{' '}
        {conc.hhi.toFixed(3)} ({hhiLabel(conc.hhi)}) across {conc.routesCounted} route(s).
        {conc.routesExcluded > 0 && (
          <>
            {' '}
            {conc.routesExcluded} route(s) were excluded because their cost is incomplete — including
            them would let missing cost masquerade as margin.
          </>
        )}
      </p>

      <AnalyticsTable<RouteContributionRow>
        columns={[
          {
            key: 'route',
            header: 'Route',
            cell: (r) => (
              <span className="flex items-center gap-1">
                {r.label}
                {!r.costComplete && (
                  <span title="Cost incomplete on this route" className="text-amber-600">
                    ⚠
                  </span>
                )}
              </span>
            ),
          },
          { key: 'weight', header: 'Weight', align: 'right', cell: (r) => num(Math.round(r.weight)) },
          { key: 'revenue', header: 'Revenue', align: 'right', cell: (r) => fmt.format(r.revenue) },
          { key: 'cost', header: 'Cost', align: 'right', cell: (r) => fmt.format(r.cost) },
          { key: 'margin', header: 'Margin', align: 'right', cell: (r) => fmt.format(r.margin) },
          { key: 'marginPct', header: 'Margin %', align: 'right', cell: (r) => pct(r.marginPct) },
          { key: 'share', header: 'Share', align: 'right', cell: (r) => pct(r.sharePct) },
          {
            key: 'stability',
            header: 'Stability (CV)',
            align: 'right',
            // Fewer than five usable days is not a stability figure. '—' says "not measured";
            // a number here would say "steady", which nobody established.
            cell: (r) => {
              const s = stability.get(r.routeKey)
              return s ? s.cv.toFixed(2) : '—'
            },
          },
        ]}
        rows={rows}
        rowKey={(r) => r.routeKey}
        rowTestId={(r) => `route-${r.routeKey}`}
        rowClassName={(r) => (r.costComplete ? undefined : 'bg-amber-50/60')}
        empty="No routes in this scope."
      />

      <p className="text-xs text-muted-foreground">
        Stability is the coefficient of variation of daily margin per kg, over days with complete
        cost only. Blank means fewer than five such days — not that the route is steady.
      </p>
    </AnalyticsSection>
  )
}
```

- [ ] **Step 5: Write `AnalyticsWeightGap.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsWeightGap.tsx`:

```tsx
'use client'

import { fmt, num } from '@/features/pnl/utils/format'
import { AnalyticsGwChwRow } from '../types'
import { routeLabel } from '../utils/cycle'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote, ScopeFallbackNote } from './AnalyticsNotes'

interface AnalyticsWeightGapProps {
  data: AnalyticsGwChwRow[] | undefined
  isLoading: boolean
  isError: boolean
  scoped: boolean
  ranged: boolean
}

export function AnalyticsWeightGap({
  data,
  isLoading,
  isError,
  scoped,
  ranged,
}: AnalyticsWeightGapProps) {
  const rows = (data ?? []).slice().sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  const totalImpact = rows.reduce((s, r) => s + r.impact, 0)

  return (
    <AnalyticsSection
      id="weight-gap"
      title="Weight Gap"
      subtitle="Gross weight against chargeable weight, and what the difference is worth"
    >
      {scoped && <ScopeFallbackNote />}
      {ranged && <RangeFallbackNote />}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !data ? (
        <AbsentNote what="Weight data" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weight data in this period.</p>
      ) : (
        <>
          <p className="text-sm">
            Net effect across all routes: <strong>{fmt.format(totalImpact)}</strong>. A positive
            figure means gross weight exceeds chargeable weight — tonnage carried but not billed.
          </p>
          <AnalyticsTable<AnalyticsGwChwRow>
            columns={[
              {
                key: 'route',
                header: 'Route',
                cell: (r) => routeLabel(r.origin, r.dest),
              },
              { key: 'gw', header: 'Gross wt', align: 'right', cell: (r) => num(Math.round(r.gw)) },
              { key: 'chwt', header: 'Chargeable wt', align: 'right', cell: (r) => num(Math.round(r.chwt)) },
              { key: 'diff', header: 'Difference', align: 'right', cell: (r) => num(Math.round(r.diff)) },
              {
                key: 'revenuePerKg',
                header: 'Revenue / kg',
                align: 'right',
                cell: (r) => fmt.format(r.revenuePerKg),
              },
              { key: 'impact', header: 'Impact', align: 'right', cell: (r) => fmt.format(r.impact) },
            ]}
            rows={rows}
            rowKey={(r) => `${r.origin}|${r.dest}`}
            rowClassName={(r) => (r.impact < 0 ? 'text-emerald-700' : undefined)}
          />
          <p className="text-xs text-muted-foreground">
            Chargeable weight is an AWB attribute, so it is taken once per AWB and then summed —
            adding it per TO row would multiply it by the number of TOs on the AWB.
          </p>
        </>
      )}
    </AnalyticsSection>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsJourney src/features/pnl-analytics/components/AnalyticsRoutes`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/components/
git commit -m "feat(pnl-analytics): journey, routes and weight gap sections"
```

---

### Task 19: Frontend — sections 13–14 (Operations, Appendix)

Operations is the section behind the `read.sla` permission. Per the spec it is rendered for everyone
— hiding it means a user never learns the capability exists — but for a user without the permission
it renders a note and its hooks are never enabled, so no request is made and no 403 reaches anyone.

The Appendix is the raw per-AWB drilldown, paginated by the existing `usePnlAwbDrilldown`.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsOps.tsx`
- Create: `apps/frontend/src/features/pnl-analytics/components/AnalyticsAppendix.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/AnalyticsOps.spec.tsx`

**Interfaces:**
- Consumes: `SlaOverview` from `../types`; `slaView`, `offloadView`, `SlaView`, `SlaRouteRow`, `OffloadView` from `../utils/ops`; `PnlAwbRow`, `PnlFilter` from `@/features/pnl/hooks/usePnl`; `OffloadedAwbRow` from `@/features/air-shipments/types`; `AnalyticsSection`, `AnalyticsTable`, `AbsentNote`, `RangeFallbackNote` from `./…`.
- Produces: components `AnalyticsOps`, `AnalyticsAppendix`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsOps.spec.tsx`:

```tsx
/**
 * The permission behaviour is the point of this section: visible to everyone so the capability is
 * discoverable, but silent — no request, no 403 — for a user who cannot read SLA data.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsOps } from './AnalyticsOps'
import { SlaOverview } from '../types'

const sla: SlaOverview = {
  summary: {
    alerts: { melewatiSla: { routes: 2, tonnage: 900 } },
    otp: {
      percentage: 92,
      onTimeWeight: 920,
      lateWeight: 80,
      breakdown: [
        { route: 'Kosambi DC - Aceh DC', percentage: 80, onTimeWeight: 80, lateWeight: 20 },
        { route: 'Kosambi DC - Batam DC', percentage: 0, onTimeWeight: 0, lateWeight: 0 },
      ],
    },
  },
}

const base = {
  sla: undefined,
  slaLoading: false,
  slaError: false,
  offloaded: undefined,
  offloadedLoading: false,
  offloadedError: false,
  awbs: [],
  routeKeys: [],
  ranged: false,
}

describe('AnalyticsOps', () => {
  it('explains the missing permission instead of hiding the section', () => {
    render(<AnalyticsOps {...base} canReadSla={false} />)
    expect(screen.getByTestId('analytics-ops-permission')).toHaveTextContent(/SLA/i)
    expect(screen.queryByTestId('analytics-ops-otp')).not.toBeInTheDocument()
  })

  it('shows on-time performance and alerts when the permission is held', () => {
    render(<AnalyticsOps {...base} canReadSla sla={sla} />)
    expect(screen.getByTestId('analytics-ops-otp')).toHaveTextContent('92.0%')
    expect(screen.getByText('Past SLA')).toBeInTheDocument()
  })

  it('keeps a route with no measurement out of the worst-performer ranking', () => {
    render(<AnalyticsOps {...base} canReadSla sla={sla} />)
    // Batam is 0/0, not a 0% performer: it belongs in the "not measured" list, not at the top.
    expect(screen.getByTestId('analytics-ops-nodata')).toHaveTextContent(/Batam/)
    expect(screen.getByTestId('sla-route-Jabo|Aceh')).toBeInTheDocument()
    expect(screen.queryByTestId('sla-route-Jabo|Batam')).not.toBeInTheDocument()
  })

  it('says the SLA data failed to load rather than reporting 0% on-time', () => {
    render(<AnalyticsOps {...base} canReadSla slaError />)
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    expect(screen.queryByTestId('analytics-ops-otp')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsOps`
Expected: FAIL — cannot find module `./AnalyticsOps`

- [ ] **Step 3: Write `AnalyticsOps.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsOps.tsx`:

```tsx
'use client'

import { num, pct } from '@/features/pnl/utils/format'
import { OffloadedAwbRow } from '@/features/air-shipments/types'
import { SlaOverview } from '../types'
import { SlaRouteRow, offloadView, slaView } from '../utils/ops'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote, RangeFallbackNote } from './AnalyticsNotes'

interface AnalyticsOpsProps {
  /** False means the hooks were never enabled: no request was sent and no 403 was produced. */
  canReadSla: boolean
  sla: SlaOverview | undefined
  slaLoading: boolean
  slaError: boolean
  offloaded: OffloadedAwbRow[] | undefined
  offloadedLoading: boolean
  offloadedError: boolean
  /** The current page of the AWB drilldown, used only to attach a route to an offloaded AWB. */
  awbs: Array<{ awb: string; origin: string | null; dest: string | null }>
  routeKeys: string[]
  ranged: boolean
}

export function AnalyticsOps({
  canReadSla,
  sla,
  slaLoading,
  slaError,
  offloaded,
  offloadedLoading,
  offloadedError,
  awbs,
  routeKeys,
  ranged,
}: AnalyticsOpsProps) {
  if (!canReadSla) {
    return (
      <AnalyticsSection
        id="ops"
        title="Operations"
        subtitle="On-time performance, SLA alerts and offloaded AWBs"
      >
        <p
          data-testid="analytics-ops-permission"
          className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"
        >
          This section needs the SLA read permission, which your account does not have. Ask an
          administrator for <code>read.sla</code> to see on-time performance, SLA alerts and
          offloaded AWBs here.
        </p>
      </AnalyticsSection>
    )
  }

  const view = sla ? slaView(sla, routeKeys) : undefined
  const off = offloaded
    ? offloadView(
        offloaded.map((o) => ({ awb: o.awb, airline: (o.airline as string | null) ?? null })),
        awbs,
      )
    : undefined

  return (
    <AnalyticsSection
      id="ops"
      title="Operations"
      subtitle="On-time performance, SLA alerts and offloaded AWBs"
    >
      {ranged && <RangeFallbackNote />}

      {slaLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : slaError || !view ? (
        <AbsentNote what="SLA data" />
      ) : (
        <>
          <p data-testid="analytics-ops-otp" className="text-sm">
            On-time performance <strong>{pct(view.otpPct)}</strong> —{' '}
            {num(Math.round(view.onTimeWeight))} kg on time against {num(Math.round(view.lateWeight))}{' '}
            kg late
            {view.scoped ? ', recomputed over the routes in scope' : ''}.
          </p>

          {view.alerts.length > 0 && (
            <AnalyticsTable<SlaView['alerts'][number]>
              columns={[
                { key: 'label', header: 'Alert', cell: (a) => a.label },
                { key: 'routes', header: 'Routes', align: 'right', cell: (a) => num(a.routes) },
                {
                  key: 'tonnage',
                  header: 'Tonnage',
                  align: 'right',
                  cell: (a) => num(Math.round(a.tonnage)),
                },
              ]}
              rows={view.alerts}
              rowKey={(a) => a.type}
            />
          )}

          <AnalyticsTable<SlaRouteRow>
            columns={[
              { key: 'route', header: 'Route', cell: (r) => r.label },
              { key: 'otp', header: 'OTP', align: 'right', cell: (r) => pct(r.otpPct) },
              {
                key: 'onTime',
                header: 'On time',
                align: 'right',
                cell: (r) => num(Math.round(r.onTimeWeight)),
              },
              { key: 'late', header: 'Late', align: 'right', cell: (r) => num(Math.round(r.lateWeight)) },
            ]}
            rows={view.byRoute}
            rowKey={(r) => r.routeKey}
            rowTestId={(r) => `sla-route-${r.routeKey}`}
            empty="No measured SLA route in this scope."
          />

          {view.noDataRoutes.length > 0 && (
            <p data-testid="analytics-ops-nodata" className="text-xs text-muted-foreground">
              Not measured (no on-time and no late weight, so their 0% is an artifact rather than a
              failure): {view.noDataRoutes.map((r) => r.label).join(', ')}.
            </p>
          )}

          {view.unmapped.length > 0 && (
            <p className="text-xs text-muted-foreground">
              SLA routes with no P&amp;L counterpart, excluded above: {view.unmapped.join(', ')}.
            </p>
          )}
        </>
      )}

      <div>
        <p className="text-sm font-medium">Offloaded AWBs</p>
        {offloadedLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : offloadedError || !off ? (
          <AbsentNote what="Offloaded AWBs" />
        ) : off.count === 0 ? (
          <p className="text-sm text-muted-foreground">No offloaded AWB in this period.</p>
        ) : (
          <>
            <p className="text-sm">
              {num(off.count)} offloaded AWB(s). {pct(off.joinRatePct)} of them matched an AWB on the
              current drilldown page, which is the only way a route can be attached to them.
            </p>
            <AnalyticsTable<{ name: string; count: number }>
              columns={[
                { key: 'name', header: 'Airline', cell: (r) => r.name },
                { key: 'count', header: 'AWBs', align: 'right', cell: (r) => num(r.count) },
              ]}
              rows={off.byAirline}
              rowKey={(r) => r.name}
            />
            {off.byRoute.length > 0 && (
              <AnalyticsTable<{ routeKey: string; label: string; count: number }>
                columns={[
                  { key: 'route', header: 'Route', cell: (r) => r.label },
                  { key: 'count', header: 'AWBs', align: 'right', cell: (r) => num(r.count) },
                ]}
                rows={off.byRoute}
                rowKey={(r) => r.routeKey}
              />
            )}
          </>
        )}
      </div>
    </AnalyticsSection>
  )
}
```

- [ ] **Step 4: Write `AnalyticsAppendix.tsx`**

Create `apps/frontend/src/features/pnl-analytics/components/AnalyticsAppendix.tsx`:

```tsx
'use client'

import { fmt, num, pct } from '@/features/pnl/utils/format'
import { PnlAwbRow } from '@/features/pnl/hooks/usePnl'
import { AnalyticsSection } from './AnalyticsSection'
import { AnalyticsTable } from './AnalyticsTable'
import { AbsentNote } from './AnalyticsNotes'

interface AnalyticsAppendixProps {
  rows: PnlAwbRow[] | undefined
  total: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  isLoading: boolean
  isError: boolean
}

export function AnalyticsAppendix({
  rows,
  total,
  page,
  limit,
  onPageChange,
  isLoading,
  isError,
}: AnalyticsAppendixProps) {
  const lastPage = Math.max(1, Math.ceil(total / limit))

  return (
    <AnalyticsSection
      id="appendix"
      title="Appendix"
      subtitle="The raw per-AWB rows every figure above is built from"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !rows ? (
        <AbsentNote what="AWB rows" />
      ) : (
        <>
          <AnalyticsTable<PnlAwbRow>
            columns={[
              { key: 'awb', header: 'AWB', cell: (r) => r.awb },
              { key: 'date', header: 'Date', cell: (r) => r.date ?? '—' },
              { key: 'vendor', header: 'Vendor', cell: (r) => r.vendor ?? '—' },
              { key: 'airline', header: 'Airline', cell: (r) => r.airline ?? '—' },
              {
                key: 'route',
                header: 'Route',
                cell: (r) => (r.origin && r.dest ? `${r.origin} → ${r.dest}` : '—'),
              },
              { key: 'gw', header: 'Gross wt', align: 'right', cell: (r) => num(Math.round(r.sumGw)) },
              {
                key: 'chwt',
                header: 'Chargeable wt',
                align: 'right',
                cell: (r) => (r.chwt == null ? '—' : num(Math.round(r.chwt))),
              },
              {
                key: 'revenue',
                header: 'Revenue',
                align: 'right',
                cell: (r) => fmt.format(r.totalRevenue),
              },
              {
                key: 'cost',
                header: 'Cost',
                align: 'right',
                cell: (r) => (r.totalCost == null ? '—' : fmt.format(r.totalCost)),
              },
              {
                key: 'margin',
                header: 'Margin %',
                align: 'right',
                cell: (r) => pct(r.grossMarginPct),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.awb}
            // A row with missing cost is shaded rather than dropped: the appendix exists to show
            // exactly what the aggregates were built from, gaps included.
            rowClassName={(r) => (r.hasNullCost ? 'bg-amber-50/60' : undefined)}
            empty="No AWB in this period."
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {lastPage} — {num(total)} AWB(s)
            </span>
            <span className="flex gap-2">
              <button
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </button>
              <button
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                disabled={page >= lastPage}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </button>
            </span>
          </div>
        </>
      )}
    </AnalyticsSection>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/AnalyticsOps`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/components/
git commit -m "feat(pnl-analytics): operations and appendix sections"
```

---

### Task 20: Frontend — the `PnlAnalyticsView` container

Everything above is a pure function or a formatting component. This is the only place that calls
hooks, resolves the route group behind a group scope, and decides what the page shows while data is
still arriving.

**Files:**
- Create: `apps/frontend/src/features/pnl-analytics/components/PnlAnalyticsView.tsx`
- Test: `apps/frontend/src/features/pnl-analytics/components/PnlAnalyticsView.spec.tsx`

**Interfaces:**
- Consumes: every hook from `../hooks/useAnalytics`; `usePnlSummary`, `usePnlCostTotals`, `usePnlCostByVendor`, `usePnlCostByRa`, `usePnlCostBySgOut`, `usePnlCostBySgIn`, `usePnlProfitByRoute`, `usePnlDataQualitySummary`, `usePnlAwbDrilldown`, `PnlFilter` from `@/features/pnl/hooks/usePnl`; `useRouteGroups` from `@/features/route-groups/hooks/useRouteGroups`; `usePermissions` from `@/shared/hooks/use-permissions`; `buildAnalyticsContext` from `../utils/context`; `routeKey` from `../utils/cycle`; `routeKeysIn` from `../utils/series`; `loadCampaigns`/`saveCampaigns` from `../utils/weekday`; every section component.
- Produces: `PnlAnalyticsView` — the component `page.tsx` renders.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl-analytics/components/PnlAnalyticsView.spec.tsx`:

```tsx
/**
 * Follows the mocking pattern of `PnlDailyMatrixView.spec.tsx`: the hooks module is mocked so the
 * container's own decisions — loading, error, empty, permission gate — are what is under test.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlAnalyticsView } from './PnlAnalyticsView'
import { AnalyticsDailySeries, AnalyticsScope } from '../types'
import { PnlFilter } from '@/features/pnl/hooks/usePnl'

jest.mock('../hooks/useAnalytics', () => ({
  ...jest.requireActual('../hooks/useAnalytics'),
  useAnalyticsDailySeries: jest.fn(),
  useAnalyticsPrevDailySeries: jest.fn(),
  useAnalyticsJourney: jest.fn(),
  useAnalyticsGwChw: jest.fn(),
  useAnalyticsSla: jest.fn(),
  useAnalyticsOffloaded: jest.fn(),
}))

jest.mock('@/features/pnl/hooks/usePnl', () => ({
  ...jest.requireActual('@/features/pnl/hooks/usePnl'),
  usePnlSummary: jest.fn(),
  usePnlCostTotals: jest.fn(),
  usePnlCostByVendor: jest.fn(),
  usePnlCostByRa: jest.fn(),
  usePnlCostBySgOut: jest.fn(),
  usePnlCostBySgIn: jest.fn(),
  usePnlProfitByRoute: jest.fn(),
  usePnlDataQualitySummary: jest.fn(),
  usePnlAwbDrilldown: jest.fn(),
}))

jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({
  useRouteGroups: jest.fn(() => ({ data: [] })),
}))

jest.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: jest.fn(),
}))

const analytics = require('../hooks/useAnalytics')
const pnl = require('@/features/pnl/hooks/usePnl')
const perms = require('@/shared/hooks/use-permissions')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' }

const series: AnalyticsDailySeries = {
  dates: ['2026-05-01', '2026-05-02'],
  rows: [
    {
      date: '2026-05-01',
      origin: 'Jabo',
      dest: 'Denpasar',
      revenue: 1000,
      costSmu: 600,
      costRa: 0,
      costSgOut: 0,
      costSgIn: 0,
      weight: 100,
      incompleteTos: 0,
    },
    {
      date: '2026-05-02',
      origin: 'Jabo',
      dest: 'Denpasar',
      revenue: 1000,
      costSmu: 600,
      costRa: 0,
      costSgOut: 0,
      costSgIn: 0,
      weight: 100,
      incompleteTos: 0,
    },
  ],
}

const q = (over: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  ...over,
})

function setup(over: Record<string, unknown> = {}, permission = true) {
  analytics.useAnalyticsDailySeries.mockReturnValue(q({ data: series }))
  analytics.useAnalyticsPrevDailySeries.mockReturnValue(q())
  analytics.useAnalyticsJourney.mockReturnValue(q({ data: [] }))
  analytics.useAnalyticsGwChw.mockReturnValue(q({ data: [] }))
  analytics.useAnalyticsSla.mockReturnValue(q())
  analytics.useAnalyticsOffloaded.mockReturnValue(q())
  pnl.usePnlSummary.mockReturnValue(q())
  pnl.usePnlCostTotals.mockReturnValue(q())
  pnl.usePnlCostByVendor.mockReturnValue(q({ data: [] }))
  pnl.usePnlCostByRa.mockReturnValue(q({ data: [] }))
  pnl.usePnlCostBySgOut.mockReturnValue(q({ data: [] }))
  pnl.usePnlCostBySgIn.mockReturnValue(q({ data: [] }))
  pnl.usePnlProfitByRoute.mockReturnValue(q({ data: [] }))
  pnl.usePnlDataQualitySummary.mockReturnValue(q({ data: [] }))
  pnl.usePnlAwbDrilldown.mockReturnValue(q({ data: { data: [], total: 0 } }))
  perms.usePermissions.mockReturnValue({
    hasPermission: () => permission,
    isSuperAdmin: false,
    isAdmin: false,
    isAdminOrAbove: false,
  })
  Object.entries(over).forEach(([k, v]) => {
    if (analytics[k]) analytics[k].mockReturnValue(v)
    if (pnl[k]) pnl[k].mockReturnValue(v)
  })
}

const props = {
  filter,
  scope: { kind: 'all' } as AnalyticsScope,
  onScopeChange: jest.fn(),
}

describe('PnlAnalyticsView', () => {
  it('renders every section once the series has loaded', () => {
    setup()
    render(<PnlAnalyticsView {...props} />)
    for (const id of [
      'health',
      'summary',
      'trend',
      'time-patterns',
      'cost-structure',
      'airline',
      'ra',
      'sg',
      'vendor',
      'journey',
      'routes',
      'weight-gap',
      'ops',
      'appendix',
    ]) {
      expect(document.getElementById(id)).toBeInTheDocument()
    }
  })

  it('gives the nav one anchor per section, all of which resolve', () => {
    setup()
    render(<PnlAnalyticsView {...props} />)
    const links = Array.from(
      screen.getByTestId('analytics-nav').querySelectorAll('a'),
    ) as HTMLAnchorElement[]
    expect(links).toHaveLength(14)
    // A nav entry pointing at an id no section renders is a dead link with no visible symptom.
    for (const a of links) {
      expect(document.getElementById(a.getAttribute('href')!.slice(1))).toBeInTheDocument()
    }
  })

  it('shows a loading state instead of empty sections while the series is in flight', () => {
    setup({ useAnalyticsDailySeries: q({ isLoading: true }) })
    render(<PnlAnalyticsView {...props} />)
    expect(screen.getByTestId('analytics-loading')).toBeInTheDocument()
    expect(document.getElementById('summary')).not.toBeInTheDocument()
  })

  it('offers a retry when the series failed', () => {
    const refetch = jest.fn()
    setup({ useAnalyticsDailySeries: q({ isError: true, refetch }) })
    render(<PnlAnalyticsView {...props} />)
    screen.getByRole('button', { name: /retry/i }).click()
    expect(refetch).toHaveBeenCalled()
  })

  it('says the period is empty rather than rendering zeroed sections', () => {
    setup({ useAnalyticsDailySeries: q({ data: { dates: [], rows: [] } }) })
    render(<PnlAnalyticsView {...props} />)
    expect(screen.getByTestId('analytics-empty')).toBeInTheDocument()
  })

  it('never requests SLA data for a user without the permission', () => {
    setup({}, false)
    render(<PnlAnalyticsView {...props} />)
    // `enabled: false` is the gate: the request is not merely hidden, it is never sent.
    expect(analytics.useAnalyticsSla).toHaveBeenCalledWith(filter, false)
    expect(analytics.useAnalyticsOffloaded).toHaveBeenCalledWith(filter, false)
    expect(screen.getByTestId('analytics-ops-permission')).toBeInTheDocument()
  })

  it('requests SLA data when the permission is held', () => {
    setup({}, true)
    render(<PnlAnalyticsView {...props} />)
    expect(analytics.useAnalyticsSla).toHaveBeenCalledWith(filter, true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/PnlAnalyticsView`
Expected: FAIL — cannot find module `./PnlAnalyticsView`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl-analytics/components/PnlAnalyticsView.tsx`:

```tsx
'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  PnlFilter,
  usePnlAwbDrilldown,
  usePnlCostByRa,
  usePnlCostBySgIn,
  usePnlCostBySgOut,
  usePnlCostByVendor,
  usePnlCostTotals,
  usePnlDataQualitySummary,
  usePnlProfitByRoute,
  usePnlSummary,
} from '@/features/pnl/hooks/usePnl'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { AnalyticsScope, Campaign } from '../types'
import {
  useAnalyticsDailySeries,
  useAnalyticsGwChw,
  useAnalyticsJourney,
  useAnalyticsOffloaded,
  useAnalyticsPrevDailySeries,
  useAnalyticsSla,
} from '../hooks/useAnalytics'
import { buildAnalyticsContext } from '../utils/context'
import { routeKey } from '../utils/cycle'
import { routeKeysIn } from '../utils/series'
import { loadCampaigns, saveCampaigns } from '../utils/weekday'
import { AnalyticsScopePicker } from './AnalyticsScopePicker'
import { AnalyticsHealth } from './AnalyticsHealth'
import { AnalyticsSummary } from './AnalyticsSummary'
import { AnalyticsTrend } from './AnalyticsTrend'
import { AnalyticsTimePatterns } from './AnalyticsTimePatterns'
import { AnalyticsCostStructure } from './AnalyticsCostStructure'
import { AnalyticsAirline } from './AnalyticsAirline'
import { AnalyticsRa } from './AnalyticsRa'
import { AnalyticsSg } from './AnalyticsSg'
import { AnalyticsVendor } from './AnalyticsVendor'
import { AnalyticsJourney } from './AnalyticsJourney'
import { AnalyticsRoutes } from './AnalyticsRoutes'
import { AnalyticsWeightGap } from './AnalyticsWeightGap'
import { AnalyticsOps } from './AnalyticsOps'
import { AnalyticsAppendix } from './AnalyticsAppendix'

interface PnlAnalyticsViewProps {
  filter: PnlFilter
  /** Lifted to the page: the tab is rendered through a ternary, so local state would be lost. */
  scope: AnalyticsScope
  onScopeChange: (next: AnalyticsScope) => void
}

const APPENDIX_LIMIT = 50

// Anchor targets, in render order. Each id matches the `id` its AnalyticsSection is given, so a
// nav entry can never point at a section that is not on the page.
const SECTIONS: { id: string; label: string }[] = [
  { id: 'health', label: 'Data Health' },
  { id: 'summary', label: 'Summary' },
  { id: 'trend', label: 'Daily Trend' },
  { id: 'time-patterns', label: 'Time Patterns' },
  { id: 'cost-structure', label: 'Cost Structure' },
  { id: 'airline', label: 'SMU & Airline' },
  { id: 'ra', label: 'RA' },
  { id: 'sg', label: 'Incoming & Outgoing' },
  { id: 'vendor', label: 'Vendor Execution' },
  { id: 'journey', label: 'Best Journey' },
  { id: 'routes', label: 'Routes & Groups' },
  { id: 'weight-gap', label: 'Weight Gap' },
  { id: 'ops', label: 'Operations' },
  { id: 'appendix', label: 'Appendix' },
]

function SectionNav() {
  return (
    <nav data-testid="analytics-nav" className="flex flex-wrap gap-2 text-xs">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground"
        >
          {s.label}
        </a>
      ))}
    </nav>
  )
}

export function PnlAnalyticsView({ filter, scope, onScopeChange }: PnlAnalyticsViewProps) {
  const { hasPermission } = usePermissions()
  const canReadSla = hasPermission('read.sla')
  const canReadGroups = hasPermission('read.route_group')

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadCampaigns())
  const [appendixPage, setAppendixPage] = useState(1)

  // Changing the period invalidates the page the reader was on.
  useEffect(() => setAppendixPage(1), [filter])

  const seriesQ = useAnalyticsDailySeries(filter)
  const prevQ = useAnalyticsPrevDailySeries(filter)
  const journeyQ = useAnalyticsJourney(filter)
  const gwChwQ = useAnalyticsGwChw(filter)
  // `enabled` is the permission gate, not a visibility toggle: with it false no request is sent,
  // so a user without read.sla never produces a 403.
  const slaQ = useAnalyticsSla(filter, canReadSla)
  const offloadedQ = useAnalyticsOffloaded(filter, canReadSla)

  const summaryQ = usePnlSummary(filter)
  const costTotalsQ = usePnlCostTotals(filter)
  const vendorQ = usePnlCostByVendor(filter)
  const raQ = usePnlCostByRa(filter)
  const sgOutQ = usePnlCostBySgOut(filter)
  const sgInQ = usePnlCostBySgIn(filter)
  const profitQ = usePnlProfitByRoute(filter)
  const dqSummaryQ = usePnlDataQualitySummary()
  const awbQ = usePnlAwbDrilldown(filter, appendixPage, undefined, APPENDIX_LIMIT)

  const { data: groups } = useRouteGroups({ enabled: canReadGroups })
  const group = scope.kind === 'group' ? groups?.find((g) => g.id === scope.id) : undefined
  const groupRoutes = useMemo(
    () => group?.routes.map((r) => routeKey(r.origin, r.dest)) ?? [],
    [group],
  )

  const ctx = useMemo(
    () =>
      buildAnalyticsContext({
        series: seriesQ.data,
        prevSeries: prevQ.data,
        scope,
        groupRoutes,
        groupName: group?.name,
        campaigns,
        ranged: filter.mode === 'range',
        dq: {
          profitByRoute: profitQ.data,
          costTotals: costTotalsQ.data,
          summary: summaryQ.data,
          costByVendor: vendorQ.data,
          costByRa: raQ.data,
          sla: slaQ.data,
          dataQuality: dqSummaryQ.data,
        },
      }),
    [
      seriesQ.data,
      prevQ.data,
      scope,
      groupRoutes,
      group?.name,
      campaigns,
      filter.mode,
      profitQ.data,
      costTotalsQ.data,
      summaryQ.data,
      vendorQ.data,
      raQ.data,
      slaQ.data,
      dqSummaryQ.data,
    ],
  )

  const onCampaignsChange = (next: Campaign[]) => {
    setCampaigns(next)
    saveCampaigns(next)
  }

  const picker = (
    <AnalyticsScopePicker
      routeKeys={routeKeysIn(seriesQ.data)}
      scope={scope}
      onChange={onScopeChange}
    />
  )

  // The picker stays on screen through every state, so a slow or failed request never removes the
  // control the reader would use next.
  const frame = (body: ReactNode) => (
    <div className="space-y-4">
      {picker}
      {body}
    </div>
  )

  if (seriesQ.isLoading) {
    return frame(
      <p data-testid="analytics-loading" className="text-sm text-muted-foreground">
        Loading analytics…
      </p>,
    )
  }

  if (seriesQ.isError || !seriesQ.data) {
    return frame(
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p>The analytics series could not be loaded.</p>
        <button
          className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs"
          onClick={() => seriesQ.refetch()}
        >
          Retry
        </button>
      </div>,
    )
  }

  if (!seriesQ.data.rows.length) {
    return frame(
      <p data-testid="analytics-empty" className="text-sm text-muted-foreground">
        This period has no shipment data on the selected date basis.
      </p>,
    )
  }

  return frame(
    <div className="space-y-4">
      <SectionNav />
      <AnalyticsHealth
        dq={ctx.dq}
        outliers={ctx.outliers}
        baselineIncomplete={ctx.baselineIncomplete}
      />
      <AnalyticsSummary
        kpi={ctx.kpi}
        kpiDelta={ctx.kpiDelta}
        baselineIncomplete={ctx.baselineIncomplete}
        scopeLabel={ctx.scopeLabel}
      />
      <AnalyticsTrend series={ctx.series} campaigns={ctx.campaigns} scopeLabel={ctx.scopeLabel} />
      <AnalyticsTimePatterns
        series={ctx.series}
        campaigns={ctx.campaigns}
        onCampaignsChange={onCampaignsChange}
      />
      <AnalyticsCostStructure series={ctx.series} />
      <AnalyticsAirline
        data={vendorQ.data}
        isLoading={vendorQ.isLoading}
        isError={vendorQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsRa
        data={raQ.data}
        isLoading={raQ.isLoading}
        isError={raQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsSg
        outgoing={sgOutQ.data}
        incoming={sgInQ.data}
        isLoading={sgOutQ.isLoading || sgInQ.isLoading}
        isError={sgOutQ.isError || sgInQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsVendor
        data={vendorQ.data}
        isLoading={vendorQ.isLoading}
        isError={vendorQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsJourney
        data={journeyQ.data}
        isLoading={journeyQ.isLoading}
        isError={journeyQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsRoutes series={seriesQ.data} routeKeys={ctx.routeKeys} />
      <AnalyticsWeightGap
        data={gwChwQ.data}
        isLoading={gwChwQ.isLoading}
        isError={gwChwQ.isError}
        scoped={ctx.scoped}
        ranged={ctx.ranged}
      />
      <AnalyticsOps
        canReadSla={canReadSla}
        sla={slaQ.data}
        slaLoading={slaQ.isLoading}
        slaError={slaQ.isError}
        offloaded={offloadedQ.data?.data}
        offloadedLoading={offloadedQ.isLoading}
        offloadedError={offloadedQ.isError}
        awbs={awbQ.data?.data ?? []}
        routeKeys={ctx.scoped ? ctx.routeKeys : []}
        ranged={ctx.ranged}
      />
      <AnalyticsAppendix
        rows={awbQ.data?.data}
        total={awbQ.data?.total ?? 0}
        page={appendixPage}
        limit={APPENDIX_LIMIT}
        onPageChange={setAppendixPage}
        isLoading={awbQ.isLoading}
        isError={awbQ.isError}
      />
    </div>,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics/components/PnlAnalyticsView`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl-analytics/components/PnlAnalyticsView.tsx apps/frontend/src/features/pnl-analytics/components/PnlAnalyticsView.spec.tsx
git commit -m "feat(pnl-analytics): analytics view container"
```

---

### Task 21: Frontend — wire the tab into the P&L page

The last task. Until this one lands nothing above is reachable from the UI.

Note the existing assertion in `page.spec.tsx` that the tab row holds exactly **five** buttons — it
becomes six here. That is an intended change to an existing test, not a regression.

**Files:**
- Modify: `apps/frontend/src/features/pnl/constants.ts`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`
- Test: `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx` (modify)

**Interfaces:**
- Consumes: `PnlAnalyticsView` from Task 20; `AnalyticsScope` from Task 2.
- Produces: nothing further depends on this task.

- [ ] **Step 1: Write the failing test**

Add the mock alongside the other view mocks near the top of
`apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx` (after the
`PnlVendorComparisonView` mock, before the `import PnlPage from './page'` line):

```tsx
// Same shape of mock as the comparison views above: echoes back the `scope` prop the page owns, so
// the persistence test can prove a chosen scope survives a tab switch.
jest.mock('@/features/pnl-analytics/components/PnlAnalyticsView', () => ({
  PnlAnalyticsView: ({
    scope,
    onScopeChange,
  }: {
    scope: { kind: string }
    onScopeChange: (next: { kind: string; keys: string[] }) => void
  }) => (
    <div data-testid="analytics-view">
      <span data-testid="analytics-scope">{`scope:${scope.kind}`}</span>
      <button onClick={() => onScopeChange({ kind: 'routes', keys: ['Jabo|Denpasar'] })}>
        pick-scope
      </button>
    </div>
  ),
}))
```

Then update the existing tab-row test and add the new ones. Replace the whole
`it('renders the five tabs as a wrapping gapped pill row, with no leftover separators', …)` block
with:

```tsx
  // flex-wrap alone would leave the first button of the wrapped row drawing a border-l against
  // nothing, with no border-t between the two rows. The row is a gapped pill row instead.
  it('renders the six tabs as a wrapping gapped pill row, with no leftover separators', () => {
    const { container } = renderPage({
      permissions: ['read.pnl', 'read.route_group', 'read.vendor_group'],
    })

    const row = container.querySelector('[data-testid="pnl-view-tabs"]')!
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('gap-2')
    expect(row.className).not.toContain('overflow-hidden')

    const buttons = Array.from(row.querySelectorAll('button'))
    expect(buttons).toHaveLength(6)
    for (const button of buttons) {
      expect(button.className).toContain('rounded-md border')
      expect(button.className).not.toContain('border-l')
    }
  })

  // The tab needs only read.pnl — the page's own gate. Unlike Route/Vendor Comparison it is not
  // hidden from anyone who can reach the page at all.
  it('shows the Analytics tab to a user holding only read.pnl', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))

    expect(screen.getByTestId('analytics-view')).toBeInTheDocument()
  })

  it('keeps the analytics scope when the user leaves the tab and comes back', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))
    fireEvent.click(screen.getByRole('button', { name: 'pick-scope' }))
    expect(screen.getByTestId('analytics-scope')).toHaveTextContent('scope:routes')

    // The tab is rendered by a ternary, so leaving unmounts the view outright: only state lifted
    // to the page survives this round trip.
    fireEvent.click(screen.getByRole('button', { name: 'Estimated' }))
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }))

    expect(screen.getByTestId('analytics-scope')).toHaveTextContent('scope:routes')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && pnpm exec jest "src/app/(dashboard)/pnl/page"`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Analytics"`, and the tab-row test reporting 5 buttons where 6 were expected.

- [ ] **Step 3: Write the implementation**

Add the label to `apps/frontend/src/features/pnl/constants.ts`:

```ts
export const ANALYTICS_LABEL = 'Analytics'
```

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, make five edits.

**(a)** Extend the import of the constants (it currently pulls
`ROUTE_COMPARISON_LABEL, VENDOR_COMPARISON_LABEL`) and add the view import:

```tsx
import {
  ANALYTICS_LABEL,
  ROUTE_COMPARISON_LABEL,
  VENDOR_COMPARISON_LABEL,
} from '@/features/pnl/constants'
import { PnlAnalyticsView } from '@/features/pnl-analytics/components/PnlAnalyticsView'
import { AnalyticsScope } from '@/features/pnl-analytics/types'
```

**(b)** Extend the view union and its subtitles (around `page.tsx:69`):

```tsx
type PnlView = 'estimate' | 'actual' | 'daily' | 'routes' | 'vendors' | 'analytics'

const VIEW_SUBTITLE: Record<PnlView, string> = {
  estimate: 'Estimated P&L based on arrival date — not yet billed',
  actual: 'Actual revenue from settled invoices vs estimate',
  daily: 'Daily revenue and profit margin per origin and destination',
  routes: 'Revenue, cost and margin per date, compared across routes and route groups',
  vendors: 'Revenue, cost and margin per route, compared across vendors and vendor groups',
  analytics: 'Data health, trends, cost structure and route economics for the selected period',
}
```

**(c)** Add the lifted scope state next to `vendorPicks` (around `page.tsx:106`):

```tsx
  // Lifted out of PnlAnalyticsView for the same reason vendorPicks is: the tab is rendered by a
  // ternary below, so leaving it unmounts the component outright. Deliberately NOT cleared by the
  // period effect — a scope carries no date, unlike drilldownRoute.
  const [analyticsScope, setAnalyticsScope] = useState<AnalyticsScope>({ kind: 'all' })
```

**(d)** Add the tab button after the Vendor Comparison button. It carries **no** permission gate:
unlike the two comparison tabs, this one needs nothing beyond the `read.pnl` the page itself
already requires.

```tsx
            <button
              className={`rounded-md border px-3 py-1.5 ${view === 'analytics' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('analytics')}
            >
              {ANALYTICS_LABEL}
            </button>
```

**(e)** Add the ternary branch. Put it after the `view === 'vendors'` branch and before the final
`) : (` that renders the Estimated view:

```tsx
      ) : view === 'analytics' ? (
        filter && (
          <PnlAnalyticsView
            filter={filter}
            scope={analyticsScope}
            onScopeChange={setAnalyticsScope}
          />
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && pnpm exec jest "src/app/(dashboard)/pnl/page"`
Expected: PASS

Then the whole frontend feature, to catch anything the new module broke:

Run: `cd apps/frontend && pnpm exec jest src/features/pnl-analytics src/features/pnl "src/app/(dashboard)/pnl"`
Expected: PASS

And typecheck, since the `PnlView` union and `VIEW_SUBTITLE` must stay exhaustive:

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/constants.ts "apps/frontend/src/app/(dashboard)/pnl/page.tsx" "apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx"
git commit -m "feat(pnl): add Analytics tab to the P&L page"
```

---

## Verification

After Task 21, run the full suites once:

```bash
cd apps/frontend && pnpm exec jest src/features/pnl-analytics src/features/pnl "src/app/(dashboard)/pnl"
cd apps/frontend && pnpm exec tsc --noEmit
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest --runInBand src/modules/pnl
```

The backend full suite needs both the heap bump and `--runInBand`; `--runInBand` alone still
core-dumps.

Then confirm by hand, against a real period, the one invariant no unit test can reach: the
`daily-series` totals must equal `/pnl/summary` for the same cycle and basis. Task 3's integration
spec asserts this, but run it against live data once as well — it is the invariant most likely to
break silently later.
