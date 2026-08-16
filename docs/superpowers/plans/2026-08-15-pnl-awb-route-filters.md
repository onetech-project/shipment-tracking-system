# PnL AWB Route Columns, Filters & Daily-Cell Drill-Through — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show origin, destination, and basis-aware date per AWB in the PnL Estimated drilldown with a filter section for those three fields, and make every Daily Report cell open the Estimated tab pre-filtered to that cell's route and date.

**Architecture:** Backend adds a shared `getStations()` route list (extracted from `getDailyMatrix`), an optional `route` filter object on `getAwbDrilldown` implemented as an `EXISTS` semi-join so per-AWB cost aggregates stay correct, and six new fields per drilldown row derived with `MODE() WITHIN GROUP` plus `COUNT(DISTINCT …) > 1`. Frontend keeps the route filter as React state in `page.tsx`, passes it down to a new filter section in `PnlAwbDrilldown`, and wires `PnlMatrixTable` cell clicks back up through `PnlDailyMatrixView`.

**Tech Stack:** NestJS + TypeORM raw SQL over the `v_pnl_to` materialized view, Jest with a mocked `DataSource`; Next.js App Router, React Query, Tailwind, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-15-pnl-awb-route-filters-design.md`

## Global Constraints

- No database migration and no change to the `v_pnl_to` view definition. Every column used already exists.
- Filter semantics are a **semi-join**: a route filter decides which AWBs appear, never which TOs are summed. AWB-level costs (`MAX(cost_*_awb)`) must keep aggregating over all of an AWB's TOs.
- When no route field is supplied, the drilldown SQL must be byte-identical in behaviour to today's: no `EXISTS` clause is assembled at all.
- Origin is displayed as its raw value (`Jabo` / `Surabaya`) everywhere in the drilldown. Only the Daily Report keeps showing `CGK` / `SUB`.
- Date range bounds are inclusive of the last day: always `< dateTo::DATE + INTERVAL '1 day'`, matching `buildFilter`.
- **Jest on this machine always needs the heap bump — focused runs included.** Without it the run aborts with "FATAL ERROR: Ineffective mark-compacts near heap limit". Wherever a step below prints a bare `pnpm --filter … exec jest …`, run it in this form instead:
  - Backend: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`
  - Frontend: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`
  - Full backend suite: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`
- An `rtk` hook rewrites jest output into a "PASS (n) FAIL (n)" summary; full output lands in `~/.local/share/rtk/tee/*.log` when a failure needs reading.
- Commit after every task.

## File Structure

**Backend**

| File | Responsibility |
| --- | --- |
| `apps/backend/src/modules/pnl/pnl.service.ts` | `PnlStation` type, `getStations()`, route filter + new row fields in `getAwbDrilldown` |
| `apps/backend/src/modules/pnl/pnl.controller.ts` | `GET /pnl/stations`; four new query params on `awb-drilldown` |
| `apps/backend/src/modules/pnl/pnl.service.spec.ts` | Service unit tests (mocked `DataSource.query`) |
| `apps/backend/src/modules/pnl/pnl.controller.spec.ts` | Controller param-forwarding tests |

**Frontend**

| File | Responsibility |
| --- | --- |
| `apps/frontend/src/features/pnl/hooks/usePnl.ts` | `PnlRouteFilter`, `PnlStation`, `usePnlStations`, route-aware `usePnlAwbDrilldown`, `BASIS_LABELS`, new `PnlAwbRow` fields |
| `apps/frontend/src/features/pnl/utils/periodBounds.ts` (new) | Calendar bounds of the active period, for the date inputs' `min`/`max` |
| `apps/frontend/src/features/pnl/utils/periodBounds.spec.ts` (new) | Tests for the above |
| `apps/frontend/src/features/pnl/utils/dailyMatrix.ts` | Adds `routeFromCell(column, date)` — the cell → route-filter mapping |
| `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx` | Three new columns, varies badges, filter section |
| `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx` (new) | Tests for the above |
| `apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx` | Optional `onCellClick` prop |
| `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx` | Forwards `onCellClick` to both tables |
| `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.spec.tsx` (new) | Forwarding test |
| `apps/frontend/src/app/(dashboard)/pnl/page.tsx` | Owns `drilldownRoute`, cell-click handler, scroll, reset on period change |

**Deviation from the spec's test plan:** the spec listed one page-level test for the click-through. This repo has no provider harness for page tests (only two component specs exist, neither renders a page), and rendering `PnlPage` would need `useAuth`, `usePermissions`, `next/navigation`, and six React Query hooks mocked. Instead the same coverage is split into two narrow tests — `routeFromCell` (Task 7) and `PnlDailyMatrixView` forwarding (Task 10) — leaving `page.tsx` with straight-line wiring that Task 11 verifies by hand in the running app.

---

### Task 1: Shared station list

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:140-144` (types), `:751-796` (`getDailyMatrix`)
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts:15-18` (add endpoint after `cycles`)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`, `apps/backend/src/modules/pnl/pnl.controller.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PnlStation { origin: string; originLabel: string; dest: string }`; `PnlService.getStations(): Promise<PnlStation[]>`; `PnlDailyMatrixColumn` becomes an alias of `PnlStation`; `GET /pnl/stations`.

- [ ] **Step 1: Write the failing service test**

Add to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, immediately before `describe('getDailyMatrix', …)`:

```ts
  describe('getStations', () => {
    it('labels known origins and falls back to the raw value for unknown ones', async () => {
      dataSource.query.mockResolvedValueOnce([
        { origin_station: 'Jabo', dest_station: 'Aceh' },
        { origin_station: 'Surabaya', dest_station: 'Pontianak' },
        { origin_station: 'Medan', dest_station: 'Batam' },
      ])

      const result = await service.getStations()

      expect(result).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
        { origin: 'Medan', originLabel: 'Medan', dest: 'Batam' },
      ])
    })

    it('reads the whole view rather than a period', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await service.getStations()
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('SELECT DISTINCT origin_station, dest_station')
      expect(sql).not.toContain('cycle_ata')
      expect(params).toBeUndefined()
    })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter backend exec jest pnl.service --runInBand -t "getStations"`
Expected: FAIL with `service.getStations is not a function`.

- [ ] **Step 3: Add the type and the method**

In `pnl.service.ts`, replace the `PnlDailyMatrixColumn` interface:

```ts
export interface PnlDailyMatrixColumn {
  origin: string // raw v_pnl_to value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}
```

with:

```ts
export interface PnlStation {
  origin: string // raw v_pnl_to value, e.g. 'Jabo'
  originLabel: string // display label, e.g. 'CGK'
  dest: string
}

// A daily matrix column is exactly one station pair, so the two share a definition.
export type PnlDailyMatrixColumn = PnlStation
```

Then add this method inside `PnlService`, directly after `getCycles`:

```ts
  // Distinct origin→destination pairs across the whole view, not just the selected period, so the
  // daily matrix columns and the drilldown route dropdowns stay stable as the user changes cycle.
  async getStations(): Promise<PnlStation[]> {
    const rows = await this.dataSource.query(`
      SELECT DISTINCT origin_station, dest_station
      FROM v_pnl_to
      WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
      ORDER BY 1, 2
    `)
    return (rows as Record<string, string>[]).map((r) => ({
      origin: r.origin_station,
      originLabel: ORIGIN_LABELS[r.origin_station] ?? r.origin_station,
      dest: r.dest_station,
    }))
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backend exec jest pnl.service --runInBand -t "getStations"`
Expected: PASS, 2 tests.

- [ ] **Step 5: Point `getDailyMatrix` at the shared method**

In `getDailyMatrix`, replace:

```ts
    const [columnRows, factRows] = await Promise.all([
      this.dataSource.query(`
        SELECT DISTINCT origin_station, dest_station
        FROM v_pnl_to
        WHERE origin_station IS NOT NULL AND dest_station IS NOT NULL
        ORDER BY 1, 2
      `),
      this.dataSource.query(
```

with:

```ts
    const [columns, factRows] = await Promise.all([
      this.getStations(),
      this.dataSource.query(
```

and delete the now-dead mapping that followed the `Promise.all` call:

```ts
    const columns: PnlDailyMatrixColumn[] = (columnRows as Record<string, string>[]).map((r) => ({
      origin: r.origin_station,
      originLabel: ORIGIN_LABELS[r.origin_station] ?? r.origin_station,
      dest: r.dest_station,
    }))
```

The `columnIndex` line right after it stays as-is. Query order is unchanged (stations first, facts second), so the existing `mockQueries` helper in the spec keeps working.

- [ ] **Step 6: Run the whole PnL service suite**

Run: `pnpm --filter backend exec jest pnl.service --runInBand`
Expected: PASS — the existing `getDailyMatrix` tests still pass unchanged.

- [ ] **Step 7: Write the failing controller test**

In `apps/backend/src/modules/pnl/pnl.controller.spec.ts`, add `getStations: jest.fn(),` to the `mockService` object, then add this test after the `getCycles delegates to service` test:

```ts
  it('getStations delegates to service', async () => {
    mockService.getStations.mockResolvedValueOnce([
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    ])
    expect(await controller.getStations()).toEqual([
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    ])
  })
```

- [ ] **Step 8: Run it to verify it fails**

Run: `pnpm --filter backend exec jest pnl.controller --runInBand -t "getStations"`
Expected: FAIL with `controller.getStations is not a function`.

- [ ] **Step 9: Add the endpoint**

In `pnl.controller.ts`, after the `getCycles` handler:

```ts
  @Get('stations')
  getStations() {
    return this.pnlService.getStations()
  }
```

- [ ] **Step 10: Run both backend PnL suites**

Run: `pnpm --filter backend exec jest pnl.controller pnl.service --runInBand`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.controller.ts apps/backend/src/modules/pnl/pnl.service.spec.ts apps/backend/src/modules/pnl/pnl.controller.spec.ts
git commit -m "feat(pnl): expose the shared station list as GET /pnl/stations"
```

---

### Task 2: Route filter on the AWB drilldown query

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:274-325` (`getAwbDrilldown`)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: `buildFilter(basis, cycle, start, end, alias)` from `./pnl-filter.util` (already imported).
- Produces: `PnlRouteFilter { origin?: string; dest?: string; dateFrom?: string; dateTo?: string }`; `getAwbDrilldown(page, limit, cyclePeriod?, startDate?, endDate?, basis?, route?: PnlRouteFilter)`.

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('getAwbDrilldown', …)` block in `pnl.service.spec.ts`:

```ts
    // The route filter picks which AWBs appear; it must never shrink the set of TOs aggregated for
    // a chosen AWB, because cost columns are MAX(cost_*_awb) over the whole AWB.
    function mockEmptyPage() {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }])
    }

    it('assembles no EXISTS clause when no route field is given', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).not.toContain('EXISTS')
      expect(params).toEqual(['2026-04-2H', 50, 0])
    })

    it('filters by origin through an EXISTS semi-join on the same AWB', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        origin: 'Jabo',
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('EXISTS (')
      expect(sql).toContain('m.awb = v.awb')
      expect(sql).toContain('m.origin_station = $2')
      // The period filter is re-applied inside the subquery, reusing $1 rather than rebinding it.
      expect(sql).toContain('m.cycle_ata = $1')
      expect(params).toEqual(['2026-04-2H', 'Jabo', 50, 0])
    })

    it('filters by destination and date range together, ending exclusive on the next day', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        dest: 'Tanjung Pinang',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('m.dest_station = $2')
      expect(sql).toContain('m.date_ata >= $3::DATE')
      expect(sql).toContain("m.date_ata < $4::DATE + INTERVAL '1 day'")
      expect(params).toEqual(['2026-04-2H', 'Tanjung Pinang', '2026-05-01', '2026-05-01', 50, 0])
    })

    it('uses the date column of the selected basis inside the subquery', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, 'atd_origin', {
        dateFrom: '2026-05-01',
      })
      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toContain('m.date_atd >= $2::DATE')
    })

    it('applies the identical WHERE clause to the count query so paging matches', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(2, 50, '2026-04-2H', undefined, undefined, undefined, {
        origin: 'Jabo',
      })
      const [countSql, countParams] = dataSource.query.mock.calls[1]
      expect(countSql).toContain('COUNT(DISTINCT awb)')
      expect(countSql).toContain('m.origin_station = $2')
      // No LIMIT/OFFSET params on the count query.
      expect(countParams).toEqual(['2026-04-2H', 'Jabo'])
    })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter backend exec jest pnl.service --runInBand -t "getAwbDrilldown"`
Expected: FAIL — 4 of the 5 new tests fail with `expect(received).toContain(expected)` because no `EXISTS` clause is emitted. The first one ("assembles no EXISTS clause") passes immediately; it is a regression guard for the unfiltered path.

- [ ] **Step 3: Add the route filter type**

In `pnl.service.ts`, add next to the other exported interfaces (immediately after `PnlAwbRow`):

```ts
// Optional narrowing for the AWB drilldown. Every field is independent; supplying none leaves the
// query exactly as it was before route filtering existed.
export interface PnlRouteFilter {
  origin?: string
  dest?: string
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
}
```

- [ ] **Step 4: Assemble the semi-join in `getAwbDrilldown`**

Replace the opening of `getAwbDrilldown` — its signature down to and including `const p = params.length` — with:

```ts
  async getAwbDrilldown(
    page: number,
    limit: number,
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    route?: PnlRouteFilter,
  ): Promise<{ data: PnlAwbRow[]; total: number }> {
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
    // Same clause against the subquery alias. It reuses $1/$2, so no params are bound twice.
    const inner = buildFilter(basis, cyclePeriod, startDate, endDate, 'm.')

    // The route filter decides which AWBs are listed, not which TOs are summed: cost columns are
    // MAX(cost_*_awb) over the whole AWB, so dropping TOs here would understate revenue against a
    // full-AWB cost and invent losses. An AWB qualifies when any one of its TOs matches.
    const routeParams: unknown[] = []
    const routeConds: string[] = []
    const bind = (value: unknown): string => {
      routeParams.push(value)
      return `$${params.length + routeParams.length}`
    }
    if (route?.origin) routeConds.push(`m.origin_station = ${bind(route.origin)}`)
    if (route?.dest) routeConds.push(`m.dest_station = ${bind(route.dest)}`)
    if (route?.dateFrom) routeConds.push(`${inner.dateCol} >= ${bind(route.dateFrom)}::DATE`)
    if (route?.dateTo) {
      routeConds.push(`${inner.dateCol} < ${bind(route.dateTo)}::DATE + INTERVAL '1 day'`)
    }
    const routeWhere = routeConds.length
      ? `AND EXISTS (
           SELECT 1 FROM v_pnl_to m
           WHERE m.awb = v.awb
             AND ${inner.where}
             AND ${routeConds.join(' AND ')}
         )`
      : ''

    const offset = (page - 1) * limit
    const filterParams = [...params, ...routeParams]
    const dataParams = [...filterParams, limit, offset]
    const countParams = [...filterParams]
    const p = filterParams.length
```

`bind` keeps placeholder numbering and param order in lockstep, so adding a future route field cannot silently misnumber the ones before it.

- [ ] **Step 5: Wire the clause into both queries**

In the same method, change the data query's `FROM`/`WHERE`:

```sql
        FROM v_pnl_to
        WHERE ${where}
        GROUP BY awb, vendor, airline
```

to:

```sql
        FROM v_pnl_to v
        WHERE ${where}
        ${routeWhere}
        GROUP BY awb, vendor, airline
```

and the count query:

```ts
      this.dataSource.query(
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to WHERE ${where}`,
        countParams,
      ),
```

to:

```ts
      this.dataSource.query(
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to v WHERE ${where} ${routeWhere}`,
        countParams,
      ),
```

- [ ] **Step 6: Run the drilldown tests**

Run: `pnpm --filter backend exec jest pnl.service --runInBand -t "getAwbDrilldown"`
Expected: PASS — 3 pre-existing tests plus the 5 new ones.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): filter the AWB drilldown by route via an EXISTS semi-join"
```

---

### Task 3: Origin, destination and date on each drilldown row

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` (`PnlAwbRow` interface, `getAwbDrilldown` SELECT list and row mapping)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: the `buildFilter(…, 'v.')` call introduced in Task 2.
- Produces: `PnlAwbRow` gains `origin: string | null`, `dest: string | null`, `date: string | null`, `originVaries: boolean`, `destVaries: boolean`, `dateVaries: boolean`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('getAwbDrilldown', …)`:

```ts
    it('reports the dominant origin, dest and date, flagging none as varying when uniform', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-4', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '2', sum_gw: '20', chwt: '25', total_revenue: '200', total_discount: '3',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: '1',
            total_cost: '21', gross_profit: '176', has_null_cost: false, issue_rank: null,
            origin: 'Jabo', dest: 'Tanjung Pinang', route_date: '2026-05-01',
            origin_varies: false, dest_varies: false, date_varies: false,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-04-2H')

      expect(data[0].origin).toBe('Jabo')
      expect(data[0].dest).toBe('Tanjung Pinang')
      expect(data[0].date).toBe('2026-05-01')
      expect(data[0].originVaries).toBe(false)
      expect(data[0].destVaries).toBe(false)
      expect(data[0].dateVaries).toBe(false)
    })

    it('flags an AWB whose TOs disagree, accepting Postgres text booleans', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-5', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '2', sum_gw: '20', chwt: null, total_revenue: '200', total_discount: '3',
            cost_smu: '10', cost_ra: '5', cost_sg_out: '5', cost_sg_in: '1',
            total_cost: '21', gross_profit: '176', has_null_cost: false, issue_rank: null,
            origin: 'Jabo', dest: 'Aceh', route_date: '2026-05-01',
            origin_varies: false, dest_varies: 't', date_varies: true,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-04-2H')

      expect(data[0].destVaries).toBe(true)
      expect(data[0].dateVaries).toBe(true)
      expect(data[0].originVaries).toBe(false)
    })

    it('maps a missing route or date to null rather than a blank string', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-6', vendor: null, airline: null,
            to_count: '1', sum_gw: '10', chwt: null, total_revenue: '100', total_discount: '1.5',
            cost_smu: null, cost_ra: null, cost_sg_out: null, cost_sg_in: null,
            total_cost: null, gross_profit: '0', has_null_cost: true, issue_rank: '1',
            origin: null, dest: null, route_date: null,
            origin_varies: false, dest_varies: false, date_varies: false,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-04-2H')

      expect(data[0].origin).toBeNull()
      expect(data[0].dest).toBeNull()
      expect(data[0].date).toBeNull()
    })

    it('selects the dominant values with MODE against the basis date column', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, 'atd_origin')

      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toContain('MODE() WITHIN GROUP (ORDER BY origin_station)')
      expect(sql).toContain('MODE() WITHIN GROUP (ORDER BY v.date_atd::DATE)')
      expect(sql).toContain('COUNT(DISTINCT v.date_atd::DATE) > 1')
    })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter backend exec jest pnl.service --runInBand -t "getAwbDrilldown"`
Expected: FAIL with `expect(received).toBe(expected)` — `data[0].origin` is `undefined`.

- [ ] **Step 3: Extend `PnlAwbRow`**

In `pnl.service.ts`, add to the `PnlAwbRow` interface, after `airline`:

```ts
  origin: string | null // dominant origin_station across the AWB's TOs
  dest: string | null
  date: string | null // YYYY-MM-DD on the active date basis
  originVaries: boolean // TOs of this AWB disagree on origin
  destVaries: boolean
  dateVaries: boolean
```

- [ ] **Step 4: Add the columns to the SELECT list**

First expose the basis date column — in `getAwbDrilldown`, change:

```ts
    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
```

to:

```ts
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
```

Then, in the data query, insert after the `airline,` line:

```sql
          MODE() WITHIN GROUP (ORDER BY origin_station)                        AS origin,
          MODE() WITHIN GROUP (ORDER BY dest_station)                          AS dest,
          TO_CHAR(MODE() WITHIN GROUP (ORDER BY ${dateCol}::DATE), 'YYYY-MM-DD') AS route_date,
          COUNT(DISTINCT origin_station) > 1                                   AS origin_varies,
          COUNT(DISTINCT dest_station)   > 1                                   AS dest_varies,
          COUNT(DISTINCT ${dateCol}::DATE) > 1                                 AS date_varies,
```

`route_date` rather than `date` keeps the alias clear of the type name.

- [ ] **Step 5: Map the new columns onto the row**

In the `rows.map` callback, add after `airline: r.airline as string | null,`:

```ts
        origin: (r.origin as string | null) ?? null,
        dest: (r.dest as string | null) ?? null,
        date: (r.route_date as string | null) ?? null,
        originVaries: r.origin_varies === true || r.origin_varies === 't',
        destVaries: r.dest_varies === true || r.dest_varies === 't',
        dateVaries: r.date_varies === true || r.date_varies === 't',
```

- [ ] **Step 6: Run the backend PnL suites**

Run: `pnpm --filter backend exec jest pnl.service --runInBand`
Expected: PASS. The three pre-existing drilldown tests still pass — their fixtures omit the new columns, which map to `null`/`false`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): report dominant origin, dest and date per drilldown AWB"
```

---

### Task 4: Controller query parameters

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts:40-50`
- Test: `apps/backend/src/modules/pnl/pnl.controller.spec.ts`

**Interfaces:**
- Consumes: `PnlService.getAwbDrilldown(page, limit, cycle, start, end, basis, route)` from Tasks 2–3.
- Produces: `GET /pnl/awb-drilldown?origin=&dest=&dateFrom=&dateTo=`.

- [ ] **Step 1: Write the failing test**

Add to `pnl.controller.spec.ts`:

```ts
  it('getAwbDrilldown forwards the route query params as one object', async () => {
    mockService.getAwbDrilldown.mockResolvedValueOnce({ data: [], total: 0 })
    await controller.getAwbDrilldown(
      1, 50, '2026-04-2H', undefined, undefined, 'ata_vendor_wh_destination',
      'Jabo', 'Tanjung Pinang', '2026-05-01', '2026-05-01',
    )
    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1, 50, '2026-04-2H', undefined, undefined, 'ata_vendor_wh_destination',
      { origin: 'Jabo', dest: 'Tanjung Pinang', dateFrom: '2026-05-01', dateTo: '2026-05-01' },
    )
  })

  it('getAwbDrilldown passes undefined route fields through untouched', async () => {
    mockService.getAwbDrilldown.mockResolvedValueOnce({ data: [], total: 0 })
    await controller.getAwbDrilldown(1, 50, '2026-04-2H')
    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1, 50, '2026-04-2H', undefined, undefined, undefined,
      { origin: undefined, dest: undefined, dateFrom: undefined, dateTo: undefined },
    )
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter backend exec jest pnl.controller --runInBand -t "getAwbDrilldown"`
Expected: FAIL — the service is called with 6 arguments, not 7.

- [ ] **Step 3: Add the parameters**

Replace the `getAwbDrilldown` handler in `pnl.controller.ts` with:

```ts
  @Get('awb-drilldown')
  getAwbDrilldown(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
    @Query('origin') origin?: string,
    @Query('dest') dest?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.pnlService.getAwbDrilldown(page, limit, cycle, start, end, basis, {
      origin,
      dest,
      dateFrom,
      dateTo,
    })
  }
```

- [ ] **Step 4: Run the controller suite**

Run: `pnpm --filter backend exec jest pnl.controller --runInBand`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite with the required heap bump**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand`
Expected: PASS, no failing suites. (Bare `pnpm test` OOMs on this machine — do not substitute it.)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.controller.ts apps/backend/src/modules/pnl/pnl.controller.spec.ts
git commit -m "feat(pnl): accept route query params on the AWB drilldown endpoint"
```

---

### Task 5: Frontend types and hooks

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts`

**Interfaces:**
- Consumes: `GET /pnl/stations`, the extended `GET /pnl/awb-drilldown` (Tasks 1–4).
- Produces: `PnlRouteFilter`, `PnlStation`, `BASIS_LABELS`, `usePnlStations()`, `usePnlAwbDrilldown(filter, page, route?, limit?)`, six new `PnlAwbRow` fields.

- [ ] **Step 1: Add the types and the basis label map**

In `usePnl.ts`, replace:

```ts
export type DateBasis = 'completed_time' | 'ata_vendor_wh_destination' | 'atd_origin'
export const DEFAULT_DATE_BASIS: DateBasis = 'ata_vendor_wh_destination'
```

with:

```ts
export type DateBasis = 'completed_time' | 'ata_vendor_wh_destination' | 'atd_origin'
export const DEFAULT_DATE_BASIS: DateBasis = 'ata_vendor_wh_destination'

// One source of truth for how a date basis is named in the UI: the header dropdown and the
// drilldown's date column header must never drift apart.
export const BASIS_LABELS: Record<DateBasis, string> = {
  ata_vendor_wh_destination: 'ATA Vendor WH dest',
  atd_origin: 'ATD origin',
  completed_time: 'Completed time',
}

// Narrows the AWB drilldown only. Empty fields are omitted from the request entirely.
export interface PnlRouteFilter {
  origin?: string
  dest?: string
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
}

export interface PnlStation {
  origin: string
  originLabel: string
  dest: string
}
```

Add to the `PnlAwbRow` interface, after `airline: string | null`:

```ts
  origin: string | null
  dest: string | null
  date: string | null
  originVaries: boolean
  destVaries: boolean
  dateVaries: boolean
```

- [ ] **Step 2: Add the stations hook and route-aware drilldown hook**

Replace `usePnlAwbDrilldown` with:

```ts
// Only non-empty fields are sent, so an untouched filter produces the exact request shape the
// endpoint saw before route filtering existed.
function routeToParams(route: PnlRouteFilter | undefined) {
  if (!route) return {}
  return {
    ...(route.origin ? { origin: route.origin } : {}),
    ...(route.dest ? { dest: route.dest } : {}),
    ...(route.dateFrom ? { dateFrom: route.dateFrom } : {}),
    ...(route.dateTo ? { dateTo: route.dateTo } : {}),
  }
}

export function usePnlStations() {
  return useQuery<PnlStation[]>({
    queryKey: ['pnl', 'stations'],
    queryFn: () => apiClient.get('/pnl/stations').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePnlAwbDrilldown(
  filter: PnlFilter | undefined,
  page: number,
  route?: PnlRouteFilter,
  limit = 50,
) {
  return useQuery<{ data: PnlAwbRow[]; total: number }>({
    queryKey: ['pnl', 'awb-drilldown', filter, page, limit, route],
    queryFn: () =>
      apiClient
        .get('/pnl/awb-drilldown', {
          params: { ...filterToParams(filter!), ...routeToParams(route), page, limit },
        })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter frontend exec tsc --noEmit`
Expected: PASS. `PnlAwbDrilldown.tsx` calls `usePnlAwbDrilldown(filter, page)`, which still type-checks because `route` is optional.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/pnl/hooks/usePnl.ts
git commit -m "feat(pnl): add route filter types, station hook and basis labels"
```

---

### Task 6: Period bounds util

**Files:**
- Create: `apps/frontend/src/features/pnl/utils/periodBounds.ts`
- Test: `apps/frontend/src/features/pnl/utils/periodBounds.spec.ts`

**Interfaces:**
- Consumes: `PnlFilter` from `../hooks/usePnl`.
- Produces: `periodBounds(filter: PnlFilter): { min: string; max: string }`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/utils/periodBounds.spec.ts`:

```ts
import { periodBounds } from './periodBounds'

describe('periodBounds', () => {
  it('returns the range endpoints unchanged in range mode', () => {
    const bounds = periodBounds({
      mode: 'range', start: '2026-05-03', end: '2026-05-19', basis: 'atd_origin',
    })
    expect(bounds).toEqual({ min: '2026-05-03', max: '2026-05-19' })
  })

  it('maps a 1H cycle to days 1 through 15', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-05-1H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-05-01', max: '2026-05-15' })
  })

  it('maps a 2H cycle to day 16 through the end of a 31-day month', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-05-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-05-16', max: '2026-05-31' })
  })

  it('maps a 2H cycle to day 16 through the end of a 30-day month', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-04-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-04-16', max: '2026-04-30' })
  })

  it('handles February in a non-leap year', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2026-02-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2026-02-16', max: '2026-02-28' })
  })

  it('handles February in a leap year', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: '2028-02-2H', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '2028-02-16', max: '2028-02-29' })
  })

  it('returns empty bounds for a malformed cycle rather than throwing', () => {
    const bounds = periodBounds({ mode: 'cycle', cycle: 'nonsense', basis: 'atd_origin' })
    expect(bounds).toEqual({ min: '', max: '' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec jest periodBounds --runInBand`
Expected: FAIL — `Cannot find module './periodBounds'`.

- [ ] **Step 3: Write the util**

Create `apps/frontend/src/features/pnl/utils/periodBounds.ts`:

```ts
import { PnlFilter } from '../hooks/usePnl'

export interface PeriodBounds {
  min: string // YYYY-MM-DD, '' when the period cannot be derived
  max: string
}

// Calendar span of the active period, used as min/max on the drilldown's date inputs so a user
// cannot pick a day the page is not showing. Mirrors calendarDatesForFilter on the backend:
// 1H = days 1–15, 2H = day 16 through month end. UTC arithmetic, so it never shifts by timezone.
export function periodBounds(filter: PnlFilter): PeriodBounds {
  if (filter.mode === 'range') {
    return { min: filter.start, max: filter.end }
  }

  const m = /^(\d{4})-(\d{2})-(1H|2H)$/.exec(filter.cycle)
  if (!m) return { min: '', max: '' }

  const [, year, month, half] = m
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  const from = half === '1H' ? 1 : 16
  const to = half === '1H' ? 15 : lastDay
  const pad = (day: number) => String(day).padStart(2, '0')
  return { min: `${year}-${month}-${pad(from)}`, max: `${year}-${month}-${pad(to)}` }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec jest periodBounds --runInBand`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/utils/periodBounds.ts apps/frontend/src/features/pnl/utils/periodBounds.spec.ts
git commit -m "feat(pnl): derive the active period's calendar bounds"
```

---

### Task 7: Cell → route mapping

**Files:**
- Modify: `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`
- Test: `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`

**Interfaces:**
- Consumes: `PnlDailyMatrixColumn`, `PnlRouteFilter` from `../hooks/usePnl`.
- Produces: `routeFromCell(column: PnlDailyMatrixColumn, date: string): PnlRouteFilter`.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`:

```ts
describe('routeFromCell', () => {
  it('maps a CGK column to the raw origin the drilldown filters on', () => {
    const route = routeFromCell({ origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' }, '2026-05-01')
    expect(route).toEqual({
      origin: 'Jabo',
      dest: 'Tanjung Pinang',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    })
  })

  it('maps a SUB column the same way', () => {
    const route = routeFromCell({ origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' }, '2026-05-20')
    expect(route).toEqual({
      origin: 'Surabaya',
      dest: 'Pontianak',
      dateFrom: '2026-05-20',
      dateTo: '2026-05-20',
    })
  })
})
```

Add `routeFromCell` to the existing import from `./dailyMatrix` at the top of that spec file.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec jest dailyMatrix --runInBand`
Expected: FAIL — `routeFromCell is not a function`.

- [ ] **Step 3: Add the mapping**

In `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`, extend the top import to include `PnlRouteFilter`:

```ts
import { PnlDailyMatrix, PnlDailyMatrixColumn, PnlRouteFilter } from '../hooks/usePnl'
```

and append:

```ts
// A clicked matrix cell as an AWB drilldown filter. The column carries both forms of the origin;
// the drilldown filters on the raw value ('Jabo'), while the matrix header shows the label ('CGK').
export function routeFromCell(column: PnlDailyMatrixColumn, date: string): PnlRouteFilter {
  return { origin: column.origin, dest: column.dest, dateFrom: date, dateTo: date }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec jest dailyMatrix --runInBand`
Expected: PASS — the pre-existing projection tests plus 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/utils/dailyMatrix.ts apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts
git commit -m "feat(pnl): map a daily matrix cell to a drilldown route filter"
```

---

### Task 8: Route columns in the drilldown table

**Files:**
- Modify: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`
- Create: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`

**Interfaces:**
- Consumes: `PnlAwbRow.origin/dest/date/*Varies` (Task 5), `BASIS_LABELS` (Task 5).
- Produces: drilldown table with Origin, Destination and basis-labelled date columns; `PnlAwbDrilldown` still takes only `{ filter }` until Task 9.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`:

```tsx
/**
 * Unit tests for PnlAwbDrilldown. The data hooks are mocked so these tests cover rendering and
 * filter interaction only — the query layer is exercised by the backend suites.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlAwbDrilldown } from './PnlAwbDrilldown'
import { PnlAwbRow, PnlFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return {
    ...actual,
    usePnlAwbDrilldown: jest.fn(),
    usePnlAwbTos: jest.fn(() => ({ data: [], isLoading: false })),
    usePnlStations: jest.fn(() => ({ data: [] })),
  }
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hooks = require('../hooks/usePnl')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

function row(overrides: Partial<PnlAwbRow> = {}): PnlAwbRow {
  return {
    awb: '888-1', vendor: 'ESP', airline: 'Citilink CGK',
    origin: 'Jabo', dest: 'Tanjung Pinang', date: '2026-05-01',
    originVaries: false, destVaries: false, dateVaries: false,
    toCount: 1, sumGw: 10, chwt: 12, totalRevenue: 100, totalDiscount: 1.5,
    costSmu: 10, costRa: 5, costSgOut: 5, costSgIn: 1,
    totalCost: 21, grossProfit: 77.5, grossMarginPct: 77.5,
    hasNullCost: false, issue: null,
    ...overrides,
  }
}

function mockRows(rows: PnlAwbRow[]) {
  hooks.usePnlAwbDrilldown.mockReturnValue({
    data: { data: rows, total: rows.length },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
}

describe('PnlAwbDrilldown route columns', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders origin, destination and the date for each AWB', () => {
    mockRows([row()])
    render(<PnlAwbDrilldown filter={filter} />)
    expect(screen.getByText('Jabo')).toBeInTheDocument()
    expect(screen.getByText('Tanjung Pinang')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
  })

  it('titles the date column with the active date basis', () => {
    mockRows([row()])
    const { rerender } = render(<PnlAwbDrilldown filter={filter} />)
    expect(screen.getByRole('columnheader', { name: 'ATA Vendor WH dest' })).toBeInTheDocument()

    rerender(<PnlAwbDrilldown filter={{ ...filter, basis: 'atd_origin' }} />)
    expect(screen.getByRole('columnheader', { name: 'ATD origin' })).toBeInTheDocument()
  })

  it('marks a field whose TOs disagree and leaves uniform fields unmarked', () => {
    mockRows([row({ destVaries: true })])
    const { container } = render(<PnlAwbDrilldown filter={filter} />)
    const marks = container.querySelectorAll('[data-testid="varies-mark"]')
    expect(marks).toHaveLength(1)
    expect(marks[0].getAttribute('title')).toContain('berbeda')
  })

  it('renders a dash when the AWB has no origin, dest or date', () => {
    mockRows([row({ origin: null, dest: null, date: null })])
    const { container } = render(<PnlAwbDrilldown filter={filter} />)
    const cells = Array.from(container.querySelectorAll('tbody tr td')).map((c) => c.textContent)
    // Expander, AWB, then origin / dest / date.
    expect(cells.slice(2, 5)).toEqual(['—', '—', '—'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec jest PnlAwbDrilldown --runInBand`
Expected: FAIL — `Unable to find an element with the text: Jabo`.

- [ ] **Step 3: Add the columns**

In `PnlAwbDrilldown.tsx`, extend the hook import:

```tsx
import {
  usePnlAwbDrilldown,
  usePnlAwbTos,
  BASIS_LABELS,
  PnlFilter,
  PnlToRow,
} from '../hooks/usePnl'
```

Add this component above `PnlAwbDrilldownProps`:

```tsx
// Marks a column whose TOs within one AWB disagree, so a dominant-value cell never reads as the
// whole truth. The AWB stays one row: splitting it would break paging and AWB counts.
function VariesMark({ when }: { when: boolean }) {
  if (!when) return null
  return (
    <span
      data-testid="varies-mark"
      title="TO dalam AWB ini punya nilai berbeda — yang tampil adalah nilai terbanyak"
      className="ml-1 text-amber-600"
    >
      +
    </span>
  )
}
```

Change `ToSubTable`'s `<td colSpan={15}` to `colSpan={18}`, and the loading row's `<td colSpan={15}` to `colSpan={18}`.

In the `<thead>`, insert after the `AWB` header cell:

```tsx
              <th className="px-3 py-2 text-left">Origin</th>
              <th className="px-3 py-2 text-left">Destination</th>
              <th className="px-3 py-2 text-left">{BASIS_LABELS[filter.basis]}</th>
```

In the `<tbody>` row, insert after the AWB `<td>`:

```tsx
                    <td className="px-3 py-2">
                      {row.origin ?? '—'}
                      <VariesMark when={row.originVaries} />
                    </td>
                    <td className="px-3 py-2">
                      {row.dest ?? '—'}
                      <VariesMark when={row.destVaries} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.date ?? '—'}
                      <VariesMark when={row.dateVaries} />
                    </td>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec jest PnlAwbDrilldown --runInBand`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx
git commit -m "feat(pnl): show origin, destination and basis date per drilldown AWB"
```

---

### Task 9: Drilldown filter section

**Files:**
- Modify: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`
- Modify: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx` (pass the new props so the app compiles)

**Interfaces:**
- Consumes: `usePnlStations` (Task 5), `periodBounds` (Task 6), `PnlRouteFilter` (Task 5).
- Produces: `PnlAwbDrilldown` props become `{ filter: PnlFilter; route: PnlRouteFilter; onRouteChange: (next: PnlRouteFilter) => void }`.

- [ ] **Step 1: Write the failing tests**

In `PnlAwbDrilldown.spec.tsx`, update every `render(<PnlAwbDrilldown filter={…} />)` call to pass the new props — for the Task 8 tests use `route={{}}` and `onRouteChange={jest.fn()}` — then append:

```tsx
describe('PnlAwbDrilldown filter section', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    hooks.usePnlStations.mockReturnValue({
      data: [
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
      ],
    })
    mockRows([row()])
  })

  it('offers every distinct origin once', () => {
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    const origin = screen.getByLabelText('Origin') as HTMLSelectElement
    expect(Array.from(origin.options).map((o) => o.value)).toEqual(['', 'Jabo', 'Surabaya'])
  })

  it('lists every destination until an origin narrows it', () => {
    const { rerender } = render(
      <PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />,
    )
    const all = screen.getByLabelText('Destination') as HTMLSelectElement
    expect(Array.from(all.options).map((o) => o.value)).toEqual(['', 'Aceh', 'Pontianak', 'Tanjung Pinang'])

    rerender(
      <PnlAwbDrilldown filter={filter} route={{ origin: 'Surabaya' }} onRouteChange={jest.fn()} />,
    )
    const narrowed = screen.getByLabelText('Destination') as HTMLSelectElement
    expect(Array.from(narrowed.options).map((o) => o.value)).toEqual(['', 'Pontianak'])
  })

  it('reports an origin choice and clears a destination that no longer belongs to it', () => {
    const onRouteChange = jest.fn()
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ origin: 'Jabo', dest: 'Aceh' }}
        onRouteChange={onRouteChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'Surabaya' } })
    expect(onRouteChange).toHaveBeenCalledWith({ origin: 'Surabaya', dest: undefined })
  })

  it('reports date changes', () => {
    const onRouteChange = jest.fn()
    render(<PnlAwbDrilldown filter={filter} route={{ origin: 'Jabo' }} onRouteChange={onRouteChange} />)
    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '2026-05-03' } })
    expect(onRouteChange).toHaveBeenCalledWith({ origin: 'Jabo', dateFrom: '2026-05-03' })
  })

  it('bounds the date inputs to the active cycle', () => {
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)
    const from = screen.getByLabelText('Dari') as HTMLInputElement
    expect(from.min).toBe('2026-05-01')
    expect(from.max).toBe('2026-05-15')
  })

  it('shows Reset only while a filter is active, and clears everything', () => {
    const onRouteChange = jest.fn()
    const { rerender } = render(
      <PnlAwbDrilldown filter={filter} route={{}} onRouteChange={onRouteChange} />,
    )
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()

    rerender(
      <PnlAwbDrilldown filter={filter} route={{ dest: 'Aceh' }} onRouteChange={onRouteChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onRouteChange).toHaveBeenCalledWith({})
  })
})
```

Add `fireEvent` to the `@testing-library/react` import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec jest PnlAwbDrilldown --runInBand`
Expected: FAIL — `Unable to find a label with the text of: Origin`.

- [ ] **Step 3: Add the filter section**

In `PnlAwbDrilldown.tsx`, extend the imports:

```tsx
import {
  usePnlAwbDrilldown,
  usePnlAwbTos,
  usePnlStations,
  BASIS_LABELS,
  PnlFilter,
  PnlRouteFilter,
  PnlToRow,
} from '../hooks/usePnl'
import { periodBounds } from '../utils/periodBounds'
```

Replace the props interface and the top of the component:

```tsx
interface PnlAwbDrilldownProps {
  filter: PnlFilter
  route: PnlRouteFilter
  onRouteChange: (next: PnlRouteFilter) => void
}

export function PnlAwbDrilldown({ filter, route, onRouteChange }: PnlAwbDrilldownProps) {
  const [page, setPage] = useState(1)
  const [expandedAwb, setExpandedAwb] = useState<string | null>(null)
  const { data: stations } = usePnlStations()

  useEffect(() => {
    setPage(1)
    setExpandedAwb(null)
  }, [filter, route])
  const { data, isLoading, isError, refetch } = usePnlAwbDrilldown(filter, page, route)
```

(The `useEffect` gains `route` in its dependency list, and the query call gains `route`.)

Then, after `const title = …`, add the option derivation:

```tsx
  const origins = Array.from(new Set((stations ?? []).map((s) => s.origin)))
  const dests = Array.from(
    new Set(
      (stations ?? [])
        .filter((s) => !route.origin || s.origin === route.origin)
        .map((s) => s.dest),
    ),
  ).sort()
  const bounds = periodBounds(filter)
  const hasRoute = Boolean(route.origin || route.dest || route.dateFrom || route.dateTo)

  // Empty string means "no filter": the hook drops empty fields before building the request.
  function setField(field: keyof PnlRouteFilter, value: string) {
    const next: PnlRouteFilter = { ...route, [field]: value || undefined }
    // A destination that does not belong to the newly chosen origin would return nothing at all.
    if (field === 'origin' && next.dest) {
      const stillValid = (stations ?? []).some((s) => s.origin === value && s.dest === next.dest)
      if (!stillValid) next.dest = undefined
    }
    onRouteChange(next)
  }
```

Insert this block immediately after the header `<div className="border-b px-4 py-3">…</div>`:

```tsx
      <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Origin
          <select
            aria-label="Origin"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            value={route.origin ?? ''}
            onChange={(e) => setField('origin', e.target.value)}
          >
            <option value="">Semua</option>
            {origins.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Destination
          <select
            aria-label="Destination"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            value={route.dest ?? ''}
            onChange={(e) => setField('dest', e.target.value)}
          >
            <option value="">Semua</option>
            {dests.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Dari
          <input
            type="date"
            aria-label="Dari"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={bounds.min}
            max={bounds.max}
            value={route.dateFrom ?? ''}
            onChange={(e) => setField('dateFrom', e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sampai
          <input
            type="date"
            aria-label="Sampai"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={bounds.min}
            max={bounds.max}
            value={route.dateTo ?? ''}
            onChange={(e) => setField('dateTo', e.target.value)}
          />
        </label>

        {hasRoute && (
          <button
            className="pb-1.5 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => onRouteChange({})}
          >
            Reset
          </button>
        )}
      </div>
```

- [ ] **Step 4: Keep the page compiling**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, add the state next to the other `useState` calls in `PnlPageContent`:

```tsx
  const [drilldownRoute, setDrilldownRoute] = useState<PnlRouteFilter>({})
```

extend the `usePnl` import with `PnlRouteFilter`, and change the render line:

```tsx
          {filter && <PnlAwbDrilldown filter={filter} />}
```

to:

```tsx
          {filter && (
            <PnlAwbDrilldown
              filter={filter}
              route={drilldownRoute}
              onRouteChange={setDrilldownRoute}
            />
          )}
```

- [ ] **Step 5: Run the tests and the type-check**

Run: `pnpm --filter frontend exec jest PnlAwbDrilldown --runInBand && pnpm --filter frontend exec tsc --noEmit`
Expected: PASS — 10 tests, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx "apps/frontend/src/app/(dashboard)/pnl/page.tsx"
git commit -m "feat(pnl): add the route filter section to the AWB drilldown"
```

---

### Task 10: Clickable daily matrix cells

**Files:**
- Modify: `apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx`
- Modify: `apps/frontend/src/features/pnl/components/PnlMatrixTable.spec.tsx`
- Modify: `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx`
- Create: `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.spec.tsx`

**Interfaces:**
- Consumes: `PnlDailyMatrixColumn` from `../hooks/usePnl`.
- Produces: `PnlMatrixTable` prop `onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void`; the same prop on `PnlDailyMatrixView`.

- [ ] **Step 1: Write the failing tests**

Append to `PnlMatrixTable.spec.tsx`:

```tsx
describe('PnlMatrixTable cell clicks', () => {
  it('renders no buttons when onCellClick is absent', () => {
    const { container } = render(<PnlMatrixTable title="t" model={baseModel()} />)
    expect(container.querySelectorAll('tbody button')).toHaveLength(0)
  })

  it('reports the column and date of the clicked cell', () => {
    const onCellClick = jest.fn()
    const { container } = render(
      <PnlMatrixTable title="t" model={baseModel()} onCellClick={onCellClick} />,
    )
    const buttons = container.querySelectorAll('tbody button')
    fireEvent.click(buttons[1])
    expect(onCellClick).toHaveBeenCalledWith(columns[1], '2026-07-01')
  })

  it('makes an empty cell clickable too', () => {
    const onCellClick = jest.fn()
    const { container } = render(
      <PnlMatrixTable title="t" model={baseModel()} onCellClick={onCellClick} />,
    )
    const buttons = container.querySelectorAll('tbody button')
    // values is [[null, 0]] — the first cell is empty and must still be clickable.
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    expect(onCellClick).toHaveBeenCalledWith(columns[0], '2026-07-01')
  })

  it('leaves footer cells and the date column unclickable', () => {
    const { container } = render(
      <PnlMatrixTable title="t" model={baseModel()} onCellClick={jest.fn()} />,
    )
    expect(container.querySelectorAll('tfoot button')).toHaveLength(0)
    const firstBodyCell = container.querySelector('tbody tr td') as HTMLTableCellElement
    expect(firstBodyCell.querySelector('button')).toBeNull()
  })
})
```

Add `fireEvent` to the `@testing-library/react` import at the top of that file.

Create `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.spec.tsx`:

```tsx
/**
 * Verifies that a cell click reaches the page: the view is the only hop between PnlMatrixTable
 * and the page-level route state, so this is where the wiring is worth pinning.
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlDailyMatrixView } from './PnlDailyMatrixView'
import { PnlDailyMatrix, PnlFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return { ...actual, usePnlDailyMatrix: jest.fn() }
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hooks = require('../hooks/usePnl')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-07-1H', basis: 'ata_vendor_wh_destination' }

const matrix: PnlDailyMatrix = {
  columns: [
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
    { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
  ],
  rows: [
    { date: '2026-07-01', cells: [{ revenue: 100, margin: 10, weight: 1, incompleteTos: 0 }, null] },
  ],
  footer: [
    { totalRevenue: 100, totalMargin: 10, totalWeight: 1, avgRevenuePerDay: 100,
      avgMarginPerDay: 10, marginPct: 10, spacePerKg: 10, incompleteTos: 0 },
    { totalRevenue: 0, totalMargin: 0, totalWeight: 0, avgRevenuePerDay: 0,
      avgMarginPerDay: 0, marginPct: null, spacePerKg: null, incompleteTos: 0 },
  ],
  periodDays: 1,
}

describe('PnlDailyMatrixView', () => {
  it('forwards a cell click from either table with its column and date', () => {
    hooks.usePnlDailyMatrix.mockReturnValue({
      data: matrix, isLoading: false, isError: false, refetch: jest.fn(),
    })
    const onCellClick = jest.fn()
    const { container } = render(<PnlDailyMatrixView filter={filter} onCellClick={onCellClick} />)

    // Two tables (revenue, margin) × two columns = four clickable body cells.
    const buttons = container.querySelectorAll('tbody button')
    expect(buttons).toHaveLength(4)

    fireEvent.click(buttons[0])
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[0], '2026-07-01')

    fireEvent.click(buttons[3])
    expect(onCellClick).toHaveBeenCalledWith(matrix.columns[1], '2026-07-01')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec jest PnlMatrixTable PnlDailyMatrixView --runInBand`
Expected: FAIL — zero buttons found in `tbody`.

- [ ] **Step 3: Add the prop to `PnlMatrixTable`**

In `PnlMatrixTable.tsx`, extend the imports and props:

```tsx
import { MatrixTableModel, formatDayLabel, groupOrigins } from '../utils/dailyMatrix'
import { PnlDailyMatrixColumn } from '../hooks/usePnl'
import { num, pct } from '../utils/format'

interface PnlMatrixTableProps {
  title: string
  model: MatrixTableModel
  defaultOpen?: boolean
  // When given, every body cell becomes a button — including empty ones, which are a valid answer
  // ("nothing flew this route that day"). Footer cells stay inert: they span the whole period.
  onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
}

export function PnlMatrixTable({ title, model, defaultOpen = true, onCellClick }: PnlMatrixTableProps) {
```

Replace the body cell render inside `model.values[rowIndex].map(...)`:

```tsx
                      <td
                        key={colIndex}
                        title={incompleteTooltip(incomplete)}
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${valueClass(value, model.highlightNegative)}`}
                      >
                        {formatValue(value, 'number')}
                        {incomplete > 0 && <span className="ml-1 text-amber-600">•</span>}
                      </td>
```

with:

```tsx
                      <td
                        key={colIndex}
                        title={incompleteTooltip(incomplete)}
                        className={`whitespace-nowrap border-b border-l text-right ${valueClass(value, model.highlightNegative)} ${onCellClick ? 'p-0' : 'px-3 py-1.5'}`}
                      >
                        {onCellClick ? (
                          <button
                            type="button"
                            title="Lihat AWB rute dan tanggal ini"
                            className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                            onClick={() => onCellClick(model.columns[colIndex], date)}
                          >
                            {formatValue(value, 'number')}
                            {incomplete > 0 && <span className="ml-1 text-amber-600">•</span>}
                          </button>
                        ) : (
                          <>
                            {formatValue(value, 'number')}
                            {incomplete > 0 && <span className="ml-1 text-amber-600">•</span>}
                          </>
                        )}
                      </td>
```

- [ ] **Step 4: Forward the prop through the view**

Replace `PnlDailyMatrixView.tsx`'s signature and its two `PnlMatrixTable` calls:

```tsx
import { PnlDailyMatrixColumn, PnlFilter, usePnlDailyMatrix } from '../hooks/usePnl'
import { groupOrigins, toMarginTable, toRevenueTable } from '../utils/dailyMatrix'
import { PnlMatrixTable } from './PnlMatrixTable'

interface PnlDailyMatrixViewProps {
  filter: PnlFilter
  onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
}

export function PnlDailyMatrixView({ filter, onCellClick }: PnlDailyMatrixViewProps) {
```

and:

```tsx
      <PnlMatrixTable title={`Revenue — ${originSuffix}`} model={toRevenueTable(data)} onCellClick={onCellClick} />
      <PnlMatrixTable title={`Profit Margin — ${originSuffix}`} model={toMarginTable(data)} onCellClick={onCellClick} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec jest PnlMatrixTable PnlDailyMatrixView --runInBand`
Expected: PASS — the pre-existing `PnlMatrixTable` tests plus 5 new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx apps/frontend/src/features/pnl/components/PnlMatrixTable.spec.tsx apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx apps/frontend/src/features/pnl/components/PnlDailyMatrixView.spec.tsx
git commit -m "feat(pnl): make daily report cells clickable"
```

---

### Task 11: Page wiring — cell click opens the filtered Estimated tab

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`

**Interfaces:**
- Consumes: `routeFromCell` (Task 7), `PnlRouteFilter` (Task 5), `PnlDailyMatrixView.onCellClick` (Task 10), `PnlAwbDrilldown.route/onRouteChange` (Task 9).
- Produces: nothing downstream.

- [ ] **Step 1: Import what the wiring needs**

In `page.tsx`, extend the existing imports:

```tsx
import { useState, useEffect, useRef } from 'react'
```

```tsx
import {
  usePnlCycles,
  usePnlSummary,
  PnlFilter,
  PnlRouteFilter,
  PnlDailyMatrixColumn,
  DateBasis,
  DEFAULT_DATE_BASIS,
  BASIS_LABELS,
} from '@/features/pnl/hooks/usePnl'
import { routeFromCell } from '@/features/pnl/utils/dailyMatrix'
```

- [ ] **Step 2: Build the basis options from the shared label map**

Replace:

```tsx
const BASIS_OPTIONS: { value: DateBasis; label: string }[] = [
  { value: 'ata_vendor_wh_destination', label: 'ATA Vendor WH dest' },
  { value: 'atd_origin', label: 'ATD origin' },
  { value: 'completed_time', label: 'Completed time' },
]
```

with:

```tsx
// Order is deliberate — the default basis comes first. Labels come from BASIS_LABELS so the
// drilldown's date column header can never disagree with this dropdown.
const BASIS_OPTIONS: { value: DateBasis; label: string }[] = (
  ['ata_vendor_wh_destination', 'atd_origin', 'completed_time'] as DateBasis[]
).map((value) => ({ value, label: BASIS_LABELS[value] }))
```

- [ ] **Step 3: Add the ref, the click handler, and the reset effect**

Inside `PnlPageContent`, after the `drilldownRoute` state added in Task 9:

```tsx
  const drilldownRef = useRef<HTMLDivElement>(null)

  // A clicked daily cell narrows the drilldown only: the page period, KPIs, chart and breakdowns
  // keep showing the whole cycle, which is what makes the drilldown readable as a subset of them.
  function handleCellClick(column: PnlDailyMatrixColumn, date: string) {
    setDrilldownRoute(routeFromCell(column, date))
    setView('estimate')
    // Runs after the Estimated tab has mounted the drilldown.
    requestAnimationFrame(() => {
      drilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
```

And, after the existing cycle-selection `useEffect`:

```tsx
  // A route filter carries a date inside the old period; keeping it after the period changes would
  // silently empty the table with no visible cause.
  useEffect(() => {
    setDrilldownRoute({})
  }, [dateBasis, mode, cycle, startDate, endDate])
```

- [ ] **Step 4: Wire the daily view and wrap the drilldown in the ref**

Replace:

```tsx
      ) : view === 'daily' ? (
        filter && <PnlDailyMatrixView filter={filter} />
```

with:

```tsx
      ) : view === 'daily' ? (
        filter && <PnlDailyMatrixView filter={filter} onCellClick={handleCellClick} />
```

and replace the drilldown render from Task 9 with:

```tsx
          {filter && (
            <div ref={drilldownRef}>
              <PnlAwbDrilldown
                filter={filter}
                route={drilldownRoute}
                onRouteChange={setDrilldownRoute}
              />
            </div>
          )}
```

- [ ] **Step 5: Type-check, lint, and run the full frontend suite**

Run: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend exec next lint && pnpm --filter frontend exec jest --runInBand`
Expected: PASS on all three.

- [ ] **Step 6: Verify by hand in the running app**

Run the app (`pnpm --filter backend start:dev` and `pnpm --filter frontend dev`), open `/pnl`, and confirm:

1. Estimated tab shows Origin, Destination, and a date column headed `ATA Vendor WH dest`; switching the basis dropdown to `ATD origin` renames that header and changes the dates.
2. Choosing an origin narrows the destination dropdown; picking a date range filters the table; Reset clears all four and restores the full list.
3. Daily Report → click a cell with data → lands on Estimated, scrolled to the drilldown, with that origin, destination, and both date fields set to the cell's day.
4. Clicking an empty cell lands on an empty drilldown with the filter visibly set — not an error state.
5. Changing the cycle clears the route filter.

- [ ] **Step 7: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/pnl/page.tsx"
git commit -m "feat(pnl): open the filtered Estimated tab from a daily report cell"
```

---

## Final Verification

- [ ] `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm test -- --runInBand` passes.
- [ ] `pnpm --filter frontend exec jest --runInBand` passes.
- [ ] `pnpm --filter frontend exec tsc --noEmit` passes.
- [ ] `pnpm --filter backend exec eslint "src/modules/pnl/**/*.ts"` passes.
- [ ] Manual checks 1–5 from Task 11 Step 6 all confirmed.
