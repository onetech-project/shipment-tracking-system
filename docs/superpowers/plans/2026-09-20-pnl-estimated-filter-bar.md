# PnL Estimated Filter Bar, Route Group Filter & Revenue Warnings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the AWB drilldown's filter row up to the top of the P&L Estimated tab, add a Route Group filter there and on Daily Report, make every panel on the tab follow that filter at TO grain, and make Revenue cells yellow when revenue is genuinely missing.

**Architecture:** One `PnlRouteFilter` scope drives ten service queries through a single `scopeSql` helper on the backend and a single `routeToParams` call on the frontend. The AWB drilldown moves from AWB grain (`EXISTS` + `MAX(cost_*_awb)`) to TO grain (`WHERE` + `costSplitSql`), which fixes an existing defect where `Revenue − Cost ≠ GP` on multi-TO AWBs and makes every panel reconcile. Route groups resolve client-side into the existing `routes` param, so no new query param or parser is introduced.

**Tech Stack:** NestJS 10 + TypeORM (raw SQL against the `v_pnl_to` view), Next.js 14 App Router, TanStack Query v5, Tailwind, Jest + Testing Library, supertest.

**Spec:** `docs/superpowers/specs/2026-09-20-pnl-estimated-filter-bar-design.md`

## Global Constraints

- **Language.** Code comments in English, matching the surrounding P&L modules. User-facing UI copy in Indonesian, matching the existing filter row (`Rute`, `Dari`, `Sampai`, `Reset`).
- **Standing rules.** Read `/home/faris/.../esp-dashboard/.superpowers/sdd/FLEET-RULES.md` by absolute path before your first command. It binds every agent on this box and **overrides this plan wherever the two differ**. Its memory and exit-code rules are restated here because they are the two most often violated.
- **Every jest command MUST cap workers. Never raise `--maxWorkers` above 1.** The box has 16 cores but ~4 GB free; jest sizes its pool from the core count, so an uncapped `pnpm test` spawns ~15 ts-jest processes and the OOM killer takes them out. The tell is "N suites failed" with **0 individual tests failing** — the suites never ran.
- **Judge every jest run by its EXIT CODE, never by stdout.** The `rtk` wrapper collapses and reorders jest output; a green run routinely writes an EMPTY log. Verified on this box at plan time: two passing runs produced zero readable output. Redirect to your own `/tmp` file and make `echo "EXIT=$?"` the **very next** command — a pipe or a second command overwrites it.
  ```bash
  cd /home/faris/code/esp/esp-dashboard/apps/backend && \
    pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB <pattern> \
    >/tmp/pnl-mine.log 2>&1; echo "EXIT=$?"
  ```
  `~/.local/share/rtk/tee/` is shared — never trust "the newest log", always write your own.
- **No full suite mid-plan.** Run only the focused pattern your step names. The full suites run once, at Final verification, and the controller runs them — not you.
- **Jest patterns are regexes, not paths.** `src/app/(dashboard)/pnl/page.spec.tsx` makes `(dashboard)` a capture group matching the bare string `dashboard`, which no path contains — it matches **zero files** and can exit 0 on the strength of other suites. That is a false green. Use a paren-free substring (`pnl/page.spec`) or `--runTestsByPath` with the quoted full path, and confirm the `Test Suites: N passed` count matches the number of files you named.
- **`cd` does not persist between Bash calls.** Every command cds itself, with absolute paths.
- **TDD.** Every task writes the failing test first, runs it to see it fail, then implements. No exceptions.
- **Empty means no filter.** A `PnlRouteFilter` field that is an empty array or empty string must be `undefined`, never sent. `routeToParams` drops undefined fields; an empty array would serialise as a filter matching nothing.
- **Repeated params need `paramsSerializer: { indexes: null }`.** Without it axios writes `vendor[]=ESP`, which `qs` parses under a key named `'vendor[]'` that no handler reads — the filter vanishes with no error anywhere.
- **Rolling deploy tolerance.** Every new response field read on the frontend uses `?? 0` or `?? []`. Backend and frontend deploy in parallel, so a new frontend briefly calls an old backend.
- **Net revenue.** Every revenue figure returned for display is `revenue_total − revenue_discount`. Any new revenue-returning query selects `COALESCE(SUM(revenue_discount), 0)` alongside and subtracts.
- **Commit style.** Conventional commits, scope `pnl`. End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

### Backend — `apps/backend/src/modules/pnl/`

| File | Responsibility |
|---|---|
| `pnl-scope.util.ts` | **new** — parse the four scope query params into one `PnlRouteFilter`. Pure, no SQL. |
| `pnl-scope.util.spec.ts` | **new** — unit tests for the parser. |
| `pnl.service.ts` | Gains a private `scopeSql()`; ten query methods take a `scope`; four cost queries move to TO grain; three matrix/comparison queries gain `revenue_missing_tos`. |
| `pnl.controller.ts` | Nine handlers accept the scope params via `parseScope`. |
| `pnl-scope.integration.spec.ts` | **new** — the reconciliation invariants, against a real database. |

### Frontend

| File | Responsibility |
|---|---|
| `src/components/shared/route-group-select.tsx` | **new** — the Route Group `<select>`, self-gating on `read.route_group`. Used by two tabs. |
| `src/features/pnl/components/PnlEstimateFilterBar.tsx` | **new** — the filter row, lifted out of the drilldown. |
| `src/features/pnl/components/PnlAwbDrilldown.tsx` | Shrinks to table + paging. |
| `src/features/pnl/components/PnlDailyMatrixView.tsx` | Gains the group select. |
| `src/features/pnl/utils/dailyMatrix.ts` | Gains `unionRoutes` + `offerableRoutes`. |
| `src/features/pnl/utils/cellWarning.ts` | Gains `revenueMissingTos`. |
| `src/features/pnl/hooks/usePnl.ts` | Eight hooks take a `scope`. |
| `src/app/(dashboard)/pnl/page.tsx` | Owns the scope and two group ids; reorders the render. |

### Task dependency order

```
Task 1 (scopeSql)  ─┬─→ Task 2 (drilldown TO grain) ─→ Task 3 (summary+margin) ─→ Task 4 (cost queries)
                    │                                                                   │
                    └───────────────────────────────────────────────────────────────────┴─→ Task 5 (controller)
Task 6 (revenue_missing_tos backend) ─→ Task 7 (cellWarning frontend)
Task 8 (dailyMatrix utils) ─→ Task 9 (RouteGroupSelect) ─→ Task 10 (DailyMatrixView)
Task 5 ─→ Task 11 (usePnl hooks) ─→ Task 12 (FilterBar) ─→ Task 13 (drilldown shrink) ─→ Task 14 (page wiring)
Task 15 (integration invariants) — last, needs everything
```

Tasks 1–5 are the backend scope chain. Tasks 6–7 are independent of it and can ship alone. Tasks 8–10 are the Daily Report half. Tasks 11–14 are the Estimated tab UI. Task 15 proves the whole thing.

---

## Task 1: `scopeSql` — one narrowing clause for ten queries

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` (add private method near `costSplitSql`, around line 1213)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts` (new `describe` block at the end)

**Interfaces:**
- Consumes: `PnlRouteFilter` (already exported from `pnl.service.ts` around line 79).
- Produces: `private scopeSql(scope: PnlRouteFilter | undefined, dateCol: string, boundSoFar: number): { sql: string; params: unknown[] }` — `sql` is a string of `AND …` clauses (empty string when nothing is scoped), `params` are the values to append after the caller's existing params. `boundSoFar` is how many params the caller has already bound, so placeholder numbering continues correctly.

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, inside the top-level `describe('PnlService', …)` block (before its closing `})`):

```ts
  // scopeSql is private; these call it through the type system's back door because it is the
  // single point every scoped query depends on, and a placeholder-numbering bug here would
  // surface as nine separate mysterious query failures rather than one obvious one.
  describe('scopeSql', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (scope: unknown, dateCol: string, bound: number) =>
      (service as any).scopeSql(scope, dateCol, bound) as { sql: string; params: unknown[] }

    it('produces nothing at all for an absent or empty scope', () => {
      expect(call(undefined, 'shipment_date', 1)).toEqual({ sql: '', params: [] })
      expect(call({}, 'shipment_date', 1)).toEqual({ sql: '', params: [] })
    })

    it('zips routes into two parallel arrays so a pair stays a pair', () => {
      const { sql, params } = call(
        { routes: [{ origin: 'Jabo', dest: 'Denpasar' }, { origin: 'Surabaya', dest: 'Pontianak' }] },
        'shipment_date',
        1,
      )
      // One UNNEST of two arrays, never a flattened list: flattened, Surabaya would match Denpasar.
      expect(sql.replace(/\s+/g, ' ')).toContain(
        '(origin_station, dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      expect(params).toEqual([['Jabo', 'Surabaya'], ['Denpasar', 'Pontianak']])
    })

    it('continues placeholder numbering after the params the caller already bound', () => {
      // Range mode binds $1 and $2 before any scope param, so the scope must start at $3.
      const { sql, params } = call({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }, 'shipment_date', 2)
      expect(sql).toContain('UNNEST($3::text[], $4::text[])')
      expect(params).toEqual([['Jabo'], ['Aceh']])
    })

    it('ends the date range on the next day so the last day is included whole', () => {
      const { sql, params } = call({ dateFrom: '2026-05-01', dateTo: '2026-05-03' }, 'date_ata', 1)
      expect(sql).toContain('date_ata >= $2::DATE')
      expect(sql).toContain("date_ata < ($3::DATE + INTERVAL '1 day')")
      expect(params).toEqual(['2026-05-01', '2026-05-03'])
    })

    it('respects the caller alias in the date column it was handed', () => {
      const { sql } = call({ dateFrom: '2026-05-01' }, 'v.shipment_date', 1)
      expect(sql).toContain('v.shipment_date >= $2::DATE')
    })

    it('matches any of the given vendors with one array predicate', () => {
      const { sql, params } = call({ vendors: ['ESP', 'PT Kargo, Tbk'] }, 'shipment_date', 1)
      expect(sql).toContain('vendor = ANY($2::text[])')
      expect(params).toEqual([['ESP', 'PT Kargo, Tbk']])
    })

    it('binds every field in a fixed order so callers can predict the numbering', () => {
      const { sql, params } = call(
        {
          routes: [{ origin: 'Jabo', dest: 'Aceh' }],
          dateFrom: '2026-05-01',
          dateTo: '2026-05-02',
          vendors: ['ESP'],
        },
        'shipment_date',
        1,
      )
      expect(sql).toContain('UNNEST($2::text[], $3::text[])')
      expect(sql).toContain('shipment_date >= $4::DATE')
      expect(sql).toContain("shipment_date < ($5::DATE + INTERVAL '1 day')")
      expect(sql).toContain('vendor = ANY($6::text[])')
      expect(params).toEqual([['Jabo'], ['Aceh'], '2026-05-01', '2026-05-02', ['ESP']])
    })

    it('ignores empty arrays rather than emitting a filter that matches nothing', () => {
      expect(call({ routes: [], vendors: [] }, 'shipment_date', 1)).toEqual({ sql: '', params: [] })
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t scopeSql \
  >/tmp/pnl-be-1.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-be-1.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Implement `scopeSql`**

In `apps/backend/src/modules/pnl/pnl.service.ts`, immediately after the `costSplitSql` method (which ends around line 1230), add:

```ts
  /**
   * The narrowing every scoped P&L query shares: routes, a date window, and vendors, all at TO
   * grain. One definition because ten queries apply it — three of them (summary, daily margin,
   * the AWB drilldown) must agree exactly or the tab stops reconciling against itself.
   *
   * `boundSoFar` is how many params the caller has already bound. Placeholders continue from
   * there, so a caller in range mode ($1, $2 for the period) gets its scope at $3 onward while a
   * caller in cycle mode ($1) gets it at $2 onward.
   *
   * `dateCol` arrives already alias-prefixed by buildFilter when the query needs it; nothing here
   * adds a prefix, or a caller using 'v.' would end up with 'v.v.date_ata'.
   *
   * An empty array is treated as no filter, not as a filter matching nothing — the frontend is
   * careful to send undefined, but a hand-built request should not be able to blank a report.
   */
  private scopeSql(
    scope: PnlRouteFilter | undefined,
    dateCol: string,
    boundSoFar: number,
  ): { sql: string; params: unknown[] } {
    const params: unknown[] = []
    const conds: string[] = []
    const bind = (value: unknown): string => {
      params.push(value)
      return `$${boundSoFar + params.length}`
    }

    // Two parallel arrays rather than one interleaved list: UNNEST zips them, so the pairs stay
    // pairs. A flattened list would match any origin against any destination.
    if (scope?.routes?.length) {
      const origins = bind(scope.routes.map((r) => r.origin))
      const dests = bind(scope.routes.map((r) => r.dest))
      conds.push(
        `(origin_station, dest_station) IN (SELECT * FROM UNNEST(${origins}::text[], ${dests}::text[]))`,
      )
    }
    if (scope?.dateFrom) conds.push(`${dateCol} >= ${bind(scope.dateFrom)}::DATE`)
    if (scope?.dateTo) {
      conds.push(`${dateCol} < (${bind(scope.dateTo)}::DATE + INTERVAL '1 day')`)
    }
    if (scope?.vendors?.length) conds.push(`vendor = ANY(${bind(scope.vendors)}::text[])`)

    return { sql: conds.length ? `AND ${conds.join('\n        AND ')}` : '', params }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t scopeSql \
  >/tmp/pnl-be-2.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-2.log` only matters when EXIT is non-zero.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(pnl): one narrowing clause every scoped query can share

Ten queries are about to take the same route/date/vendor scope. Each
building its own UNNEST would be nine chances to flatten the pairs and
silently match any origin against any destination.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: AWB drilldown moves to TO grain

This is the task that fixes a defect already on `main`: a drilldown row sums `revenue_total` per TO but reads `MAX(cost_*_awb)` per whole AWB, so **Revenue − Cost ≠ GP** on every multi-TO AWB, with no filter involved. Costs move to `costSplitSql`, and the filter moves out of the `EXISTS`.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:544-690` (`getAwbDrilldown`)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts:184-580` (the `getAwbDrilldown` describe block)

**Interfaces:**
- Consumes: `scopeSql(scope, dateCol, boundSoFar)` from Task 1; `costSplitSql(alias)` (existing, line ~1213).
- Produces: `getAwbDrilldown` keeps its exact signature. `PnlAwbRow` keeps every field; only the values of `costSmu`/`costRa`/`costSgOut`/`costSgIn`/`totalCost`/`hasNullCost` change meaning to "the portion belonging to the rows in scope".

- [ ] **Step 1: Write the failing test that proves the defect**

Add this to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, as the FIRST test inside `describe('getAwbDrilldown', …)` (right after the opening line at 184):

```ts
    // Concrete expected values, not `revenue - cost === gp`: after Step 5 the mapper DERIVES gp as
    // rev - totalCost, so asserting that relation here would be true by construction and would
    // pass even if both numbers were wrong. Task 15 checks the relation against real rows, where
    // it is not a tautology.
    it('nets the discount off revenue and reports cost and profit against it', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-9', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '2', costed_tos: '2', sum_gw: '60', chwt: '60',
            total_revenue: '1000', total_discount: '40',
            cost_smu: '300', cost_ra: '100', cost_sg_out: '50', cost_sg_in: '25',
            total_cost: '475',
            has_null_cost: false, issue_rank: null,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-05-1H')
      const row = data[0]
      expect(row.totalRevenue).toBe(960) // 1000 gross - 40 discount
      expect(row.totalCost).toBe(475)
      expect(row.grossProfit).toBe(485) // 960 - 475, not 1000 - 475
      expect(row.grossMarginPct).toBeCloseTo((485 / 960) * 100, 6)
    })

    it('passes the four cost components through as the row reports them', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-6', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '2', costed_tos: '2', sum_gw: '60', chwt: '60',
            total_revenue: '1000', total_discount: '0',
            cost_smu: '300', cost_ra: '100', cost_sg_out: '50', cost_sg_in: '25',
            total_cost: '475',
            has_null_cost: false, issue_rank: null,
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-05-1H')
      const row = data[0]
      expect([row.costSmu, row.costRa, row.costSgOut, row.costSgIn]).toEqual([300, 100, 50, 25])
    })

    it('prorates every AWB-grain cost by weight_share instead of taking the whole AWB', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])
      await service.getAwbDrilldown(1, 50, '2026-05-1H')

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      // costSplitSql's shape. MAX(cost_*_awb) charged the whole AWB's cost against whichever
      // subset of its TOs the filter left standing.
      expect(sql).toContain('SUM(v.cost_smu_awb * v.weight_share)')
      expect(sql).toContain('SUM(v.cost_ra_awb * v.weight_share)')
      expect(sql).toContain('SUM(v.cost_sg_out_awb * v.weight_share)')
      expect(sql).not.toContain('MAX(cost_smu_awb)')
      expect(sql).not.toContain('MAX(cost_total_awb)')
      // SG In already carries the share inside the view; multiplying again would square it.
      expect(sql).toContain('SUM(COALESCE(v.cost_sg_in_to, 0))')
    })

    it('derives hasNullCost from the rows in scope, not from the whole AWB', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])
      await service.getAwbDrilldown(1, 50, '2026-05-1H')

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(sql).toContain('BOOL_OR(v.cost_to IS NULL)')
      expect(sql).not.toContain('MAX(cost_total_awb) IS NULL')
    })
```

- [ ] **Step 2: Run to verify the new tests fail**

The two SQL-shape tests are the ones that must fail now; the two value-mapping tests fail only
once `costed_tos` exists in the mapper.

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec \
  -t getAwbDrilldown >/tmp/t2-red.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`. Then `grep -E 'Tests:|✕' /tmp/t2-red.log` and confirm the failures include
`prorates every AWB-grain cost…` and `derives hasNullCost…`.

- [ ] **Step 3: Replace the scope-building block**

In `apps/backend/src/modules/pnl/pnl.service.ts`, inside `getAwbDrilldown`, DELETE everything from the comment `// The route filter decides which AWBs are listed, not which TOs are summed:` down to and including the `vendorWhere` assignment (roughly lines 556–597 — it ends with the closing backtick of the `vendorWhere` ternary). Replace with:

```ts
    // TO grain, like every other P&L surface. This used to be an EXISTS semi-join that picked
    // which AWBs were LISTED while the aggregate still summed the whole AWB, because the cost
    // columns were MAX(cost_*_awb). Now the costs below are prorated by weight_share, so summing
    // only the rows in scope is the arithmetically correct thing to do — and the EXISTS would be
    // the bug, letting out-of-scope TOs back into the totals.
    const scope = this.scopeSql(route, dateCol, params.length)
```

Note `inner` (the `buildFilter(..., 'm.')` call near the top of the method) becomes unused — delete that line too.

- [ ] **Step 4: Swap the cost columns and the WHERE clauses**

Still in `getAwbDrilldown`, in the main `SELECT`, replace these six lines:

```ts
          MAX(cost_smu_awb)                       AS cost_smu,
          MAX(cost_ra_awb)                        AS cost_ra,
          MAX(cost_sg_out_awb)                    AS cost_sg_out,
          SUM(cost_sg_in_to)                      AS cost_sg_in,
          MAX(cost_total_awb) + COALESCE(SUM(cost_sg_in_to), 0) AS total_cost,
          COALESCE(SUM(gross_profit_to), 0)       AS gross_profit,
          (MAX(cost_total_awb) IS NULL OR MAX(cost_sg_in_to) IS NULL) AS has_null_cost,
```

with:

```ts
          ${this.costSplitSql('v')},
          COALESCE(SUM(v.cost_to), 0)             AS total_cost,
          COALESCE(SUM(gross_profit_to), 0)       AS gross_profit,
          BOOL_OR(v.cost_to IS NULL)              AS has_null_cost,
```

Then replace the two `WHERE` fragments. In the data query:

```ts
        FROM v_pnl_to v
        WHERE ${where}
        ${scope.sql}
        GROUP BY awb, vendor, airline
```

and in the count query:

```ts
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to v WHERE ${where} ${scope.sql}`,
```

Finally, update the param assembly just above them:

```ts
    const offset = (page - 1) * limit
    const filterParams = [...params, ...scope.params]
    const dataParams = [...filterParams, limit, offset]
    const countParams = [...filterParams]
    const p = filterParams.length
```

(That block is unchanged apart from `scope.params` replacing `routeParams`.)

- [ ] **Step 5: Add a costed-TO count, and derive GP the way the KPI card does**

Two problems remain, and they are the same problem.

`COALESCE(SUM(...), 0)` is never SQL NULL, so an AWB nothing could cost would show a confident `0` beside a real revenue. A count of costed rows distinguishes the two honestly. Add it to the SELECT beside the cost columns:

```ts
          COUNT(*) FILTER (WHERE v.cost_to IS NOT NULL)::int AS costed_tos,
```

And `SUM(gross_profit_to)` cannot satisfy the row invariant this task exists to establish. `gross_profit_to` is NULL whenever `cost_to` is, so the sum silently **skips** uncosted TOs — while `total_revenue` includes them. On a partially-costed AWB, revenue − cost would therefore not equal it.

`getSummary` already resolves this the other way: it defines gross profit as `totalRevenue − totalCost`, counting every TO's revenue against only the cost that could be computed. The drilldown must use the same definition or its rows cannot sum to the card above them. Delete the `gross_profit` column from the SELECT and derive it in TypeScript.

In `rows.map`, replace:

```ts
      const rev = Number(r.total_revenue) - Number(r.total_discount)
      const gp = Number(r.gross_profit)
      const totalCost = r.total_cost != null ? Number(r.total_cost) : null
```

with:

```ts
      const rev = Number(r.total_revenue) - Number(r.total_discount)
      // COALESCE makes total_cost 0 rather than NULL, so the count of costed rows is what
      // separates "this costs nothing in scope" from "we could not cost it".
      const totalCost = Number(r.costed_tos) > 0 ? Number(r.total_cost) : null
      // Revenue minus cost, exactly as getSummary defines it — NOT SUM(gross_profit_to), which is
      // NULL for every uncosted TO and so silently omits revenue that total_revenue includes.
      // With the old definition a partially-costed AWB could never satisfy Revenue - Cost = GP.
      const gp = totalCost != null ? rev - totalCost : null
```

Further down, `grossProfit: gp,` and `grossMarginPct: rev > 0 && gp != null ? (gp / rev) * 100 : null,`.

Also replace the `hasNullCost:` line with:

```ts
        hasNullCost: r.has_null_cost === true || r.has_null_cost === 't',
```

- [ ] **Step 5b: Pin the partially-costed case**

Add this test beside the two from Step 1 — it is the case Step 5 exists for:

```ts
    it('counts uncosted TOs revenue against the cost that could be computed', async () => {
      // 2 of 3 TOs costed. SUM(gross_profit_to) would have skipped the third TO's revenue too,
      // so the row would read Revenue 1000, Cost 300, GP 600 — three numbers that do not agree.
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-8', vendor: 'ESP', airline: 'Citilink CGK',
            to_count: '3', costed_tos: '2', sum_gw: '90', chwt: '90',
            total_revenue: '1000', total_discount: '0',
            cost_smu: '200', cost_ra: '60', cost_sg_out: '30', cost_sg_in: '10',
            total_cost: '300', has_null_cost: true, issue_rank: '2',
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-05-1H')
      expect(data[0].grossProfit).toBe(700)
      expect(data[0].totalRevenue - data[0].totalCost!).toBe(data[0].grossProfit)
    })

    it('reports no cost at all as NULL, never as a confident zero', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          {
            awb: '888-7', vendor: null, airline: null,
            to_count: '2', costed_tos: '0', sum_gw: '20', chwt: null,
            total_revenue: '500', total_discount: '0',
            cost_smu: '0', cost_ra: '0', cost_sg_out: '0', cost_sg_in: '0',
            total_cost: '0', has_null_cost: true, issue_rank: '1',
          },
        ])
        .mockResolvedValueOnce([{ total: '1' }])

      const { data } = await service.getAwbDrilldown(1, 50, '2026-05-1H')
      expect(data[0].totalCost).toBeNull()
      expect(data[0].grossProfit).toBeNull()
      expect(data[0].grossMarginPct).toBeNull()
    })
```

**Every other mock row in the `getAwbDrilldown` block needs a `costed_tos` field added** — set it equal to its `to_count` for rows that are fully costed, and `'0'` for the `total_cost: null` ones. TypeScript will not catch this (the mocks are plain objects); the tests will, by returning `null` where they expect a number.

- [ ] **Step 6: Rewrite the tests that pinned the old EXISTS shape**

In `pnl.service.spec.ts`, inside `describe('getAwbDrilldown', …)`, these seven tests pin behaviour that is now deliberately gone. Replace each one's body as shown.

`assembles no EXISTS clause when no route field is given` → rename and rewrite:

```ts
    it('adds no scope clause at all when no route field is given', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H')
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).not.toContain('EXISTS')
      expect(sql).not.toContain('UNNEST')
      expect(params).toEqual(['2026-04-2H', 50, 0])
      const [countSql, countParams] = dataSource.query.mock.calls[1]
      expect(countSql).not.toContain('UNNEST')
      expect(countParams).toEqual(['2026-04-2H'])
    })
```

`filters by a route pair through an EXISTS semi-join on the same AWB` → rewrite:

```ts
    it('filters by a route pair directly in WHERE, at TO grain', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })
      const [sql, params] = dataSource.query.mock.calls[0]
      // No semi-join any more: the cost columns are prorated, so out-of-scope TOs must not be
      // summed at all — which is precisely what an EXISTS would have let happen.
      expect(sql).not.toContain('EXISTS')
      expect(sql.replace(/\s+/g, ' ')).toContain(
        '(origin_station, dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      expect(sql).toContain('v.cycle_date = $1')
      expect(params).toEqual(['2026-04-2H', ['Jabo'], ['Aceh'], 50, 0])
    })
```

`filters by route and date range together, ending exclusive on the next day` → change the two `m.` expectations to unprefixed and drop the EXISTS assertion:

```ts
      expect(sql.replace(/\s+/g, ' ')).toContain(
        '(origin_station, dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      expect(sql).toContain('v.shipment_date >= $4::DATE')
      expect(sql).toContain("v.shipment_date < ($5::DATE + INTERVAL '1 day')")
```

(the `expect(params).toEqual([...])` at the end is unchanged and still correct.)

`binds route params after the range-mode offset in custom-date-range mode` → change the one substring:

```ts
      expect(sql.replace(/\s+/g, ' ')).toContain(
        '(origin_station, dest_station) IN (SELECT * FROM UNNEST($3::text[], $4::text[]))',
      )
```

(`LIMIT $5 OFFSET $6` and the params array are unchanged.)

`matches any of the selected route pairs with a single UNNEST condition` → change the one substring the same way (drop the `m.` prefix); params unchanged.

`still narrows AWBs by EXISTS so cost stays whole-AWB` → DELETE this test entirely. It asserts exactly the behaviour being removed; the two new proration tests from Step 1 replace it.

`filters by vendor in the outer predicate, not inside the route EXISTS` → rewrite:

```ts
    it('filters by vendor in the same WHERE as everything else', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-05-1H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
        vendors: ['ESP', 'Angkasa'],
      })

      const dataSql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      // Vendor used to sit in the outer predicate while route sat inside an EXISTS, purely
      // because the two had different grain. They no longer do.
      expect(dataSql).toContain('vendor = ANY(')
      expect(dataSql).not.toContain('m.vendor')
      expect(dataSql).not.toContain('EXISTS')
    })
```

`applies the same vendor predicate to the count query, so paging stays consistent` → change `expect(countSql).toContain('AND v.vendor = ANY(')` to `expect(countSql).toContain('vendor = ANY(')`.

`leaves the query untouched when no vendor is given` → change `expect(dataSql).not.toContain('v.vendor = ANY')` to `expect(dataSql).not.toContain('vendor = ANY')`.

`emits no route condition at all when no routes are selected` → change `expect(...).not.toContain('EXISTS')` to `expect(...).not.toContain('UNNEST')`.

`combines routes with the date window in one EXISTS` → rename to `combines routes with the date window in one WHERE`; body (params assertion) unchanged.

`uses the date column of the selected basis inside the subquery` → rename and rewrite:

```ts
    it('uses the date column of the selected basis', async () => {
      mockEmptyPage()
      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, 'atd_origin', {
        dateFrom: '2026-05-01',
      })
      const [sql] = dataSource.query.mock.calls[0]
      expect(sql).toContain('v.date_atd >= $2::DATE')
    })
```

`applies the identical WHERE clause to the count query so paging matches` → change the substring:

```ts
      expect(countSql.replace(/\s+/g, ' ')).toContain(
        '(origin_station, dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
```

Also update the stale comment above `mockEmptyPage` (`// The route filter picks which AWBs appear; it must never shrink the set of TOs aggregated…`) to:

```ts
    // The scope filter narrows at TO grain: the cost columns are prorated by weight_share, so
    // summing only the rows in scope is correct. It used to be an AWB-level EXISTS, which was
    // required back when those columns were MAX(cost_*_awb).
```

- [ ] **Step 7: Run the whole drilldown block**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t getAwbDrilldown \
  >/tmp/pnl-be-3.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-3.log` only matters when EXIT is non-zero.

- [ ] **Step 8: Run the full backend PnL suite to catch collateral damage**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl \
  >/tmp/pnl-be-4.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-4.log` only matters when EXIT is non-zero.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(pnl): make a drilldown row's revenue, cost and profit agree

A row summed revenue per TO but read MAX(cost_*_awb) per whole AWB, so on
any multi-TO AWB Revenue - Cost did not equal the GP printed beside them.
The cost columns now prorate by weight_share like every other P&L surface,
which also makes filtering at TO grain correct, so the EXISTS semi-join that
existed to protect the old whole-AWB costs goes away.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `getSummary` and `getDailyMargin` take the scope

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:465-543`
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts` (the `getSummary` describe block at line 20)

**Interfaces:**
- Consumes: `scopeSql` (Task 1).
- Produces: `getSummary(cyclePeriod?, startDate?, endDate?, basis?, scope?: PnlRouteFilter)` and `getDailyMargin(cyclePeriod?, startDate?, endDate?, basis?, scope?: PnlRouteFilter)` — the scope is the **fifth** positional argument on both, matching where `getAwbDrilldown` puts its own (after `basis`).

- [ ] **Step 1: Write the failing tests**

Add to the `describe('getSummary', …)` block in `pnl.service.spec.ts`:

```ts
    it('narrows to the scoped routes at TO grain', async () => {
      dataSource.query.mockResolvedValueOnce([{
        total_tos: '4', total_awbs: '1',
        total_revenue: '1000', total_discount: '0', total_cost: '400',
      }])

      await service.getSummary('2026-05-1H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      })

      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql.replace(/\s+/g, ' ')).toContain(
        '(origin_station, dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      expect(params).toEqual(['2026-05-1H', ['Jabo'], ['Denpasar']])
    })

    it('sends exactly the query it sent before scopes existed when none is given', async () => {
      dataSource.query.mockResolvedValueOnce([{
        total_tos: '1', total_awbs: '1',
        total_revenue: '1', total_discount: '0', total_cost: '1',
      }])

      await service.getSummary('2026-05-1H')

      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).not.toContain('UNNEST')
      expect(sql).not.toContain('vendor = ANY')
      expect(params).toEqual(['2026-05-1H'])
    })
```

And a new block after it:

```ts
  describe('getDailyMargin', () => {
    it('narrows to the scoped vendors', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getDailyMargin('2026-05-1H', undefined, undefined, undefined, {
        vendors: ['ESP'],
      })

      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toContain('vendor = ANY($2::text[])')
      expect(params).toEqual(['2026-05-1H', ['ESP']])
    })

    it('keeps its own "date is not null" guard alongside the scope', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getDailyMargin('2026-05-1H', undefined, undefined, undefined, {
        dateFrom: '2026-05-02',
      })

      const sql = dataSource.query.mock.calls[0][0] as string
      // The chart groups by day, so a row with no date on the active basis has nowhere to go and
      // must stay excluded regardless of what the scope says.
      expect(sql).toContain('shipment_date IS NOT NULL')
      expect(sql).toContain('shipment_date >= $2::DATE')
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t "narrows to the scoped" \
  >/tmp/pnl-be-5.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-be-5.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Implement in `getSummary`**

Change the signature and body head:

```ts
  async getSummary(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    scope?: PnlRouteFilter,
  ): Promise<PnlSummary> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const s = this.scopeSql(scope, dateCol, params.length)
    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int                           AS total_tos,
        COUNT(DISTINCT awb)::int                AS total_awbs,
        COALESCE(SUM(revenue_total), 0)         AS total_revenue,
        COALESCE(SUM(revenue_discount), 0)      AS total_discount,
        COALESCE(SUM(cost_to), 0)               AS total_cost
      FROM v_pnl_to
      WHERE ${where}
      ${s.sql}
      `,
      [...params, ...s.params],
    )
```

The rest of the method is unchanged.

- [ ] **Step 4: Implement in `getDailyMargin`**

```ts
  async getDailyMargin(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    scope?: PnlRouteFilter,
  ): Promise<PnlDailyMarginItem[]> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const s = this.scopeSql(scope, dateCol, params.length)
    const rows = await this.dataSource.query(
      `
      SELECT
        TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(revenue_total), 0)    AS revenue,
        COALESCE(SUM(revenue_discount), 0) AS discount,
        COALESCE(SUM(cost_to), 0)          AS cost,
        BOOL_OR(cost_to IS NULL)           AS has_incomplete_cost
      FROM v_pnl_to
      WHERE ${where}
        AND ${dateCol} IS NOT NULL
      ${s.sql}
      GROUP BY 1
      ORDER BY 1
      `,
      [...params, ...s.params],
    )
```

The `rows.map` below is unchanged.

- [ ] **Step 5: Run to verify they pass**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t "getSummary|getDailyMargin" \
  >/tmp/pnl-be-6.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-6.log` only matters when EXIT is non-zero.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(pnl): let the KPI cards and the margin chart follow a scope

Both already aggregate cost_to, which is TO grain, so narrowing the rows is
arithmetically sound with no other change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The seven breakdown queries take the scope, four move to TO grain

`getCostTotals`, `getCostByVendor`, `getCostByRa`, `getCostBySgOut` all use `MAX(cost_*_awb)` per AWB then sum — the same pattern Task 2 removed from the drilldown. Under a TO-grain filter an AWB with only some TOs matching still contributes its full cost, so `Est. Cost` and its breakdown would disagree. They move to prorated components.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:791-1097` (`getRevenueByRoute`, `getCostTotals`, `getCostByVendor`, `getCostByRa`, `getCostBySgOut`, `getCostBySgIn`, `getProfitByRoute`)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: `scopeSql` (Task 1).
- Produces: all seven methods gain `scope?: PnlRouteFilter` as their **fifth** positional argument. Return types are unchanged.

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `pnl.service.spec.ts`:

```ts
  describe('breakdown queries under a scope', () => {
    // The four cost queries used MAX(cost_*_awb) per AWB — the whole AWB's cost. Under a TO-grain
    // filter that charges a full AWB's cost against whichever subset of its TOs survived, so the
    // breakdown would overshoot the Est. Cost card it sits under.
    it('prorates cost-totals by weight_share instead of taking each whole AWB', async () => {
      dataSource.query.mockResolvedValueOnce([{ smu: '0', ra: '0', sg_out: '0', sg_in: '0' }])

      await service.getCostTotals('2026-05-1H')

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(sql).toContain('SUM(cost_smu_awb * weight_share)')
      expect(sql).not.toContain('MAX(cost_smu_awb)')
    })

    it('scopes cost-totals', async () => {
      dataSource.query.mockResolvedValueOnce([{ smu: '0', ra: '0', sg_out: '0', sg_in: '0' }])

      await service.getCostTotals('2026-05-1H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })

      const [, params] = dataSource.query.mock.calls[0]
      expect(params).toEqual(['2026-05-1H', ['Jabo'], ['Aceh']])
    })

    it('weighs cost-by-vendor on the rows in scope, not on each whole AWB', async () => {
      dataSource.query.mockResolvedValueOnce([])

      await service.getCostByVendor('2026-05-1H')

      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(sql).toContain('SUM(cost_smu_awb * weight_share)')
      expect(sql).toContain('SUM(gross_weight)')
      expect(sql).not.toContain('MAX(sum_gw_per_awb)')
    })

    it('prorates cost-by-ra and cost-by-sg-out too', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await service.getCostByRa('2026-05-1H')
      expect((dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')).toContain(
        'SUM(v.cost_ra_awb * v.weight_share)',
      )

      dataSource.query.mockResolvedValueOnce([])
      await service.getCostBySgOut('2026-05-1H')
      expect((dataSource.query.mock.calls[1][0] as string).replace(/\s+/g, ' ')).toContain(
        'SUM(v.cost_sg_out_awb * v.weight_share)',
      )
    })

    it('scopes the three route-shaped breakdowns', async () => {
      const scope = { routes: [{ origin: 'Jabo', dest: 'Aceh' }] }

      dataSource.query.mockResolvedValueOnce([])
      await service.getRevenueByRoute('2026-05-1H', undefined, undefined, undefined, scope)
      expect(dataSource.query.mock.calls[0][1]).toEqual(['2026-05-1H', ['Jabo'], ['Aceh']])

      dataSource.query.mockResolvedValueOnce([])
      await service.getProfitByRoute('2026-05-1H', undefined, undefined, undefined, scope)
      expect(dataSource.query.mock.calls[1][1]).toEqual(['2026-05-1H', ['Jabo'], ['Aceh']])

      dataSource.query.mockResolvedValueOnce([])
      await service.getCostBySgIn('2026-05-1H', undefined, undefined, undefined, scope)
      expect(dataSource.query.mock.calls[2][1]).toEqual(['2026-05-1H', ['Jabo'], ['Aceh']])
    })

    it('leaves cost-by-sg-in summing the per-TO column it already used', async () => {
      dataSource.query.mockResolvedValueOnce([])
      await service.getCostBySgIn('2026-05-1H')
      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      // SG In is the one component the view already prorated; multiplying by weight_share here
      // would square the share.
      expect(sql).toContain('SUM(cost_sg_in_to)')
      expect(sql).not.toContain('cost_sg_in_to * weight_share')
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t "breakdown queries under a scope" \
  >/tmp/pnl-be-7.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-be-7.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Rewrite `getCostTotals`**

Replace the whole method body (keeping the name) with:

```ts
  async getCostTotals(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    scope?: PnlRouteFilter,
  ): Promise<PnlCostTotals> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const s = this.scopeSql(scope, dateCol, params.length)
    // TO grain, matching SUM(cost_to) in getSummary. The old shape took MAX(cost_*_awb) per AWB,
    // which counted a component even on AWBs whose cost_to was NULL because a sibling component
    // was missing — so this total could exceed the Est. Cost card it sits under even unfiltered.
    const rows = await this.dataSource.query(
      `
      SELECT ${this.costSplitSql()}
      FROM v_pnl_to
      WHERE ${where}
      ${s.sql}
      `,
      [...params, ...s.params],
    )
    const r = rows[0] ?? {}
    return {
      smu: Number(r.cost_smu ?? 0),
      ra: Number(r.cost_ra ?? 0),
      sgOut: Number(r.cost_sg_out ?? 0),
      sgIn: Number(r.cost_sg_in ?? 0),
    }
  }
```

Note `costSplitSql()` emits column aliases `cost_smu`, `cost_ra`, `cost_sg_out`, `cost_sg_in` — hence the renamed reads.

- [ ] **Step 4: Rewrite `getCostByVendor`**

```ts
  async getCostByVendor(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    scope?: PnlRouteFilter,
  ): Promise<PnlVendorCostItem[]> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const s = this.scopeSql(scope, dateCol, params.length)
    // Prorated and grouped in one pass: the per_awb CTE existed only to de-duplicate the
    // AWB-grain MAX, which is gone.
    const rows = await this.dataSource.query(
      `
      SELECT
        COALESCE(NULLIF(vendor, ''), '—')  AS vendor,
        COALESCE(NULLIF(airline, ''), '—') AS airline,
        COALESCE(SUM(gross_weight), 0)     AS total_weight,
        COALESCE(SUM(cost_smu_awb * weight_share)
                 FILTER (WHERE cost_to IS NOT NULL), 0) AS total_cost
      FROM v_pnl_to
      WHERE ${where}
      ${s.sql}
      GROUP BY 1, 2
      ORDER BY vendor ASC, total_cost DESC
      `,
      [...params, ...s.params],
    )
```

Everything from `const byVendor = new Map…` downward is unchanged.

- [ ] **Step 5: Rewrite `getCostByRa` and `getCostBySgOut`**

In `getCostByRa`, add the scope param and replace the `per_awb` CTE with a direct aggregate:

```ts
  async getCostByRa(
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
    scope?: PnlRouteFilter,
  ): Promise<PnlNamedCostItem[]> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')
    const s = this.scopeSql(scope, dateCol, params.length)
    const rows = await this.dataSource.query(
      `
      SELECT
        COALESCE(NULLIF(srx.ra_name, ''), '—') AS name,
        COALESCE(SUM(v.gross_weight), 0)       AS total_weight,
        COALESCE(SUM(v.cost_ra_awb * v.weight_share)
                 FILTER (WHERE v.cost_to IS NOT NULL), 0) AS total_cost
      FROM v_pnl_to v
      LEFT JOIN (
        -- one clean booking per awb (mirrors v_pnl_to's booking CTE) to avoid fan-out
        SELECT DISTINCT ON (awb) awb, ra_name
        FROM air_shipments_smu_rate_cgk_spx
        ORDER BY awb,
          (NULLIF(BTRIM(account), '') IS NOT NULL
           AND NULLIF(BTRIM(via),  '') IS NOT NULL
           AND NULLIF(BTRIM(dest), '') IS NOT NULL) DESC,
          updated_at DESC NULLS LAST
      ) srx ON srx.awb = v.awb
      WHERE ${where}
      ${s.sql}
      GROUP BY 1
      ORDER BY total_cost DESC NULLS LAST
      `,
      [...params, ...s.params],
    )
```

The `rows.map` below is unchanged.

**Careful:** `scopeSql` emits unprefixed column names (`origin_station`, `vendor`). This query aliases `v_pnl_to` as `v` and joins a second table `srx`. `srx` has no `origin_station`, `dest_station` or `vendor` column, so the unqualified names resolve unambiguously to `v`. Verify by running the integration test in Task 15; if Postgres reports `column reference "vendor" is ambiguous` here, that is the signal to give `scopeSql` an `alias` parameter.

`getCostBySgOut` gets the identical treatment — add the scope param, drop the `per_awb` CTE, keep both `LEFT JOIN`s, and use:

```ts
      SELECT
        COALESCE(NULLIF(s.sg_out, ''), '—') AS name,
        COALESCE(SUM(v.gross_weight), 0)    AS total_weight,
        COALESCE(SUM(v.cost_sg_out_awb * v.weight_share)
                 FILTER (WHERE v.cost_to IS NOT NULL), 0) AS total_cost
```

with `WHERE ${where}\n      ${s.sql}\n      GROUP BY 1`.

- [ ] **Step 6: Add the scope to the three already-TO-grain queries**

`getRevenueByRoute`, `getCostBySgIn` and `getProfitByRoute` already aggregate at TO grain. Each one only needs the parameter and two lines:

```ts
    scope?: PnlRouteFilter,
  ): Promise<…> {
    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate)
    const s = this.scopeSql(scope, dateCol, params.length)
```

then `${s.sql}` on the line after `WHERE ${where}`, and `[...params, ...s.params]` as the params argument. `getRevenueByRoute` and `getProfitByRoute` currently call `buildFilter` without capturing `dateCol` — add it to the destructure.

- [ ] **Step 7: Run to verify they pass**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec \
  >/tmp/pnl-be-8.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-8.log` only matters when EXIT is non-zero.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(pnl): cost breakdowns at TO grain, so they match the card above them

Four of them took MAX(cost_*_awb) per AWB, which counts a component even on
AWBs whose cost_to is NULL because a sibling component is missing — so the
breakdown could already exceed Est. Cost with no filter in play. Under a
TO-grain scope it would also charge a whole AWB against a subset of its TOs.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `parseScope` and the nine controller handlers

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl-scope.util.ts`
- Create: `apps/backend/src/modules/pnl/pnl-scope.util.spec.ts`
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts`
- Test: `apps/backend/src/modules/pnl/pnl.controller.http.spec.ts`

**Interfaces:**
- Consumes: `parseRoutePairs` from `pnl-columns.util.ts`; `parseVendorNames` from `pnl-vendor-columns.util.ts`; `PnlRouteFilter` from `pnl.service.ts`.
- Produces:
  ```ts
  export interface PnlScopeQuery {
    routes?: string
    dateFrom?: string
    dateTo?: string
    vendor?: string | string[] | Record<string, unknown>
  }
  export function parseScope(q: PnlScopeQuery): PnlRouteFilter
  ```

- [ ] **Step 1: Write the failing parser tests**

Create `apps/backend/src/modules/pnl/pnl-scope.util.spec.ts`:

```ts
import { parseScope } from './pnl-scope.util'

describe('parseScope', () => {
  it('returns an empty filter when nothing is supplied', () => {
    expect(parseScope({})).toEqual({})
  })

  it('omits fields rather than sending them empty', () => {
    // routeToParams on the frontend drops undefined fields; an empty array would serialise as a
    // filter matching nothing, which reads to the user as a real (empty) answer.
    expect(parseScope({ routes: '', dateFrom: '', dateTo: '', vendor: [] })).toEqual({})
  })

  it('parses route pairs on the pipe, deduping repeats', () => {
    expect(parseScope({ routes: 'Jabo|Aceh,Jabo|Aceh,Surabaya|Batam' })).toEqual({
      routes: [
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Surabaya', dest: 'Batam' },
      ],
    })
  })

  it('passes the dates straight through', () => {
    expect(parseScope({ dateFrom: '2026-05-01', dateTo: '2026-05-15' })).toEqual({
      dateFrom: '2026-05-01',
      dateTo: '2026-05-15',
    })
  })

  it('reads a single vendor, several vendors, and the qs arrayLimit object alike', () => {
    expect(parseScope({ vendor: 'ESP' })).toEqual({ vendors: ['ESP'] })
    expect(parseScope({ vendor: ['ESP', 'Angkasa'] })).toEqual({ vendors: ['ESP', 'Angkasa'] })
    // Past qs's arrayLimit of 20 occurrences the param arrives as a plain object keyed by index.
    expect(parseScope({ vendor: { 0: 'ESP', 1: 'Angkasa' } })).toEqual({
      vendors: ['ESP', 'Angkasa'],
    })
  })

  it('rejects a malformed route pair loudly', () => {
    // A silently dropped route reads to the user as "nothing flew here", which is
    // indistinguishable from a real answer.
    expect(() => parseScope({ routes: 'JaboAceh' })).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl-scope.util \
  >/tmp/pnl-be-9.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-be-9.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Write the parser**

Create `apps/backend/src/modules/pnl/pnl-scope.util.ts`:

```ts
import { parseRoutePairs } from './pnl-columns.util'
import { parseVendorNames } from './pnl-vendor-columns.util'
import { PnlRouteFilter } from './pnl.service'

/**
 * The four query params that narrow a P&L report, assembled into one filter.
 *
 * Nine handlers accept exactly this set, so the assembly lives here rather than being repeated —
 * and, more importantly, so all nine agree on what an empty value means. An omitted field and an
 * empty one are the same thing: no filter. An empty array is NOT "match nothing", which is what a
 * naive pass-through would produce.
 *
 * Parsing itself is delegated: routes to parseRoutePairs (which rejects malformed pairs loudly)
 * and vendors to parseVendorNames (which copes with qs handing over a string, an array, or — past
 * its arrayLimit of 20 — a plain object keyed by index).
 */
export interface PnlScopeQuery {
  routes?: string
  dateFrom?: string
  dateTo?: string
  vendor?: string | string[] | Record<string, unknown>
}

export function parseScope(q: PnlScopeQuery): PnlRouteFilter {
  const routes = parseRoutePairs(q.routes)
  const vendors = parseVendorNames(q.vendor)
  return {
    ...(routes.length ? { routes } : {}),
    ...(q.dateFrom ? { dateFrom: q.dateFrom } : {}),
    ...(q.dateTo ? { dateTo: q.dateTo } : {}),
    ...(vendors.length ? { vendors } : {}),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl-scope.util \
  >/tmp/pnl-be-10.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-10.log` only matters when EXIT is non-zero.

- [ ] **Step 5: Write the failing HTTP tests**

Append to `apps/backend/src/modules/pnl/pnl.controller.http.spec.ts`. First extend `mockService` at the top:

```ts
const mockService = {
  getVendorComparison: jest.fn().mockResolvedValue(EMPTY),
  getAwbDrilldown: jest.fn().mockResolvedValue(EMPTY_DRILLDOWN),
  getSummary: jest.fn().mockResolvedValue({}),
  getDailyMargin: jest.fn().mockResolvedValue([]),
  getCostTotals: jest.fn().mockResolvedValue({ smu: 0, ra: 0, sgOut: 0, sgIn: 0 }),
}
```

and add the matching `mockReset` lines to `beforeEach`:

```ts
    mockService.getSummary.mockResolvedValue({})
    mockService.getDailyMargin.mockResolvedValue([])
    mockService.getCostTotals.mockResolvedValue({ smu: 0, ra: 0, sgOut: 0, sgIn: 0 })
```

Then add a describe block:

```ts
describe('PnlController scope params (HTTP)', () => {
  // Same app setup as the block above; these go inside that same describe, after its last test,
  // so they reuse its beforeEach.

  it('passes routes, dates and a repeated vendor through to getSummary', async () => {
    await request(app.getHttpServer())
      .get('/pnl/summary')
      .query({ cycle: '2026-05-1H', routes: 'Jabo|Aceh', dateFrom: '2026-05-02' })
      .query('vendor=ESP&vendor=PT%20Kargo%2C%20Tbk')
      .expect(200)

    expect(mockService.getSummary).toHaveBeenCalledWith(
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
      {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
        dateFrom: '2026-05-02',
        vendors: ['ESP', 'PT Kargo, Tbk'],
      },
    )
  })

  it('sends an empty scope object when no scope param is present', async () => {
    await request(app.getHttpServer()).get('/pnl/summary').query({ cycle: '2026-05-1H' }).expect(200)

    expect(mockService.getSummary).toHaveBeenCalledWith(
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
      {},
    )
  })

  it('scopes the daily margin chart and the cost totals the same way', async () => {
    await request(app.getHttpServer())
      .get('/pnl/daily-margin')
      .query({ cycle: '2026-05-1H', routes: 'Jabo|Aceh' })
      .expect(200)
    expect(mockService.getDailyMargin).toHaveBeenCalledWith(
      '2026-05-1H', undefined, undefined, undefined,
      { routes: [{ origin: 'Jabo', dest: 'Aceh' }] },
    )

    await request(app.getHttpServer())
      .get('/pnl/breakdown/cost-totals')
      .query({ cycle: '2026-05-1H', routes: 'Jabo|Aceh' })
      .expect(200)
    expect(mockService.getCostTotals).toHaveBeenCalledWith(
      '2026-05-1H', undefined, undefined, undefined,
      { routes: [{ origin: 'Jabo', dest: 'Aceh' }] },
    )
  })

  it('rejects a malformed route pair with 400 rather than silently ignoring it', async () => {
    await request(app.getHttpServer())
      .get('/pnl/summary')
      .query({ cycle: '2026-05-1H', routes: 'JaboAceh' })
      .expect(400)
  })
})
```

Move these four tests inside the existing `describe('PnlController query-string parsing (HTTP)', …)` block so they inherit its app setup — do not create a second `beforeEach`.

- [ ] **Step 6: Run to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.controller.http \
  >/tmp/pnl-be-11.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-be-11.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 7: Wire the controller**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, add the import:

```ts
import { parseScope } from './pnl-scope.util'
```

Then give each of these nine handlers the four scope params and pass `parseScope({...})` as the last service argument: `getSummary`, `getDailyMargin`, `getRevenueByRoute`, `getCostTotals`, `getCostByVendor`, `getCostByRa`, `getCostBySgOut`, `getCostBySgIn`, `getProfitByRoute`.

The shape, shown once in full for `getSummary` — repeat it verbatim for the other eight, changing only the service method called:

```ts
  @Get('summary')
  getSummary(
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
    @Query('routes') routes?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    // Repeats, because a vendor group carries many vendors and a vendor name may contain any
    // punctuation a delimiter would use. Past qs's arrayLimit of 20 it arrives as a plain object
    // keyed by index rather than an array — see parseVendorNames.
    @Query('vendor') vendor?: string | string[] | Record<string, unknown>,
  ) {
    return this.pnlService.getSummary(
      cycle, start, end, basis,
      parseScope({ routes, dateFrom, dateTo, vendor }),
    )
  }
```

- [ ] **Step 8: Simplify `getAwbDrilldown` to use the same parser**

Replace its body with:

```ts
    return this.pnlService.getAwbDrilldown(
      page, limit, cycle, start, end, basis,
      parseScope({ routes, dateFrom, dateTo, vendor }),
    )
```

and delete the now-unused `parseVendorNames`/`parseRoutePairs` imports **only if** no other handler still uses them (`parseColumnPicks` stays; check before deleting).

- [ ] **Step 9: Run to verify everything passes**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.controller \
  >/tmp/pnl-be-12.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-12.log` only matters when EXIT is non-zero.

- [ ] **Step 10: Run every backend PnL suite**

The whole module, not the whole repo — the controller change touches nine handlers, so the
module's own specs are the blast radius worth checking here.

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl \
  >/tmp/pnl-be-task5.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`. The full repo suite runs once at Final verification, not here.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/modules/pnl/
git commit -m "$(cat <<'EOF'
feat(pnl): accept the route/date/vendor scope on nine endpoints

One parser, so all nine agree that an omitted param and an empty one both
mean no filter — an empty array passed through would instead read as a
filter matching nothing, which looks to the user like a real empty answer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `revenue_missing_tos` — a direct signal, not the issue chain

Revenue cells stopped going yellow because the only available signal, `v_pnl_to.issue`, is a priority **chain**: `'revenue_missing'` only surfaces once vendor and all three AWB costs are present. A missing `rate_spx` breaks revenue *and* the cost fallback at once, so such a TO is labelled `'no_booking'` — a cost cause — and the Revenue table correctly discards it. The fix is a direct predicate that cannot be outranked.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` — `getDailyMatrix` (~1098), `getRouteComparison` (~1232), `getVendorComparison` (~1454), plus three interfaces
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Produces: `PnlDailyMatrixCell`, `PnlDailyMatrixFooter`, `PnlRouteComparisonCell`, `PnlRouteComparisonFooter`, `PnlVendorComparisonCell`, `PnlVendorComparisonFooter` each gain `revenueMissingTos: number`.

- [ ] **Step 1: Write the failing tests**

Add to `pnl.service.spec.ts`:

```ts
  describe('revenue_missing_tos', () => {
    it('counts TOs with no revenue directly, bypassing the issue priority chain', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDailyMatrix('2026-05-1H')

      // The fact query is the second call (getStations is first).
      const factSql = (dataSource.query.mock.calls[1][0] as string).replace(/\s+/g, ' ')
      // A direct predicate, like incomplete_tos already is for cost. Going through v_pnl_to.issue
      // would lose every TO whose AWB is also uncosted, because that chain ranks cost first.
      expect(factSql).toContain('COUNT(*) FILTER (WHERE revenue_total IS NULL)::int')
      expect(factSql).toContain('AS revenue_missing_tos')
    })

    it('carries the count onto each cell and sums it into the column footer', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }])
        .mockResolvedValueOnce([
          {
            d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh',
            revenue: '100', margin: '10', weight: '5',
            incomplete_tos: '0', revenue_missing_tos: '2',
          },
          {
            d: '2026-05-02', origin_station: 'Jabo', dest_station: 'Aceh',
            revenue: '100', margin: '10', weight: '5',
            incomplete_tos: '0', revenue_missing_tos: '3',
          },
        ])
        .mockResolvedValueOnce([])

      const matrix = await service.getDailyMatrix('2026-05-1H')

      const firstCell = matrix.rows.find((r) => r.date === '2026-05-01')!.cells[0]!
      expect(firstCell.revenueMissingTos).toBe(2)
      expect(matrix.footer[0].revenueMissingTos).toBe(5)
    })

    it('adds the same aggregate to both comparison tabs, so yellow means one thing', async () => {
      // Route comparison: picks are routes only, so no group query runs.
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      await service.getRouteComparison([{ kind: 'route', origin: 'Jabo', dest: 'Aceh' }], '2026-05-1H')
      expect((dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')).toContain(
        'COUNT(*) FILTER (WHERE v.revenue_total IS NULL)::int',
      )

      jest.clearAllMocks()
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{}])
      await service.getVendorComparison([{ kind: 'vendor', name: 'ESP' }], '2026-05-1H')
      expect((dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')).toContain(
        'COUNT(*) FILTER (WHERE v.revenue_total IS NULL)::int',
      )
    })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t revenue_missing_tos \
  >/tmp/pnl-be-13.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-be-13.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Extend the six interfaces**

In `pnl.service.ts`, add this field to `PnlDailyMatrixCell`, `PnlDailyMatrixFooter`, `PnlRouteComparisonCell`, `PnlRouteComparisonFooter`, `PnlVendorComparisonCell` and `PnlVendorComparisonFooter` (they are around lines 186, 246, 263, 307, 327, 366, 392 — find each by its `incompleteTos` field and add beneath it):

```ts
  // TOs whose revenue_total is NULL. A direct count, deliberately not read off v_pnl_to.issue:
  // that column is a priority chain where 'revenue_missing' only surfaces once vendor and all
  // three AWB costs are present, so a TO missing its rate_spx — which breaks revenue and the cost
  // fallback together — is labelled 'no_booking' and would never be counted here.
  revenueMissingTos: number
```

- [ ] **Step 4: Add the aggregate to `getDailyMatrix`**

In the fact query, after the `incomplete_tos` line:

```ts
          COUNT(*) FILTER (WHERE cost_to IS NULL)::int                           AS incomplete_tos,
          COUNT(*) FILTER (WHERE revenue_total IS NULL)::int                     AS revenue_missing_tos
```

In the `for (const fact of factRows…)` loop, add to the cell object:

```ts
        revenueMissingTos: Number(fact.revenue_missing_tos ?? 0),
```

In the footer accumulator, add `let revenueMissingTos = 0` beside `let incompleteTos = 0`, add `revenueMissingTos += cell.revenueMissingTos` in the loop, and `revenueMissingTos,` to the returned object.

- [ ] **Step 5: Add it to `getRouteComparison`**

In the fact query, after `COUNT(*) FILTER (WHERE v.cost_to IS NULL)::int AS incomplete_tos`:

```ts
          COUNT(*) FILTER (WHERE v.revenue_total IS NULL)::int         AS revenue_missing_tos,
```

(watch the trailing comma — this line is not last in its SELECT list; check the surrounding lines and place the comma correctly.)

In the cell object add `revenueMissingTos: Number(factRow.revenue_missing_tos ?? 0),`; in the footer add the accumulator exactly as in Step 4.

- [ ] **Step 6: Add it to `getVendorComparison`**

Identical to Step 5 — same SQL line, same cell field, same footer accumulator.

- [ ] **Step 7: Run to verify they pass**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl.service.spec -t revenue_missing_tos \
  >/tmp/pnl-be-14.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-14.log` only matters when EXIT is non-zero.

- [ ] **Step 8: Run the whole PnL backend suite**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl \
  >/tmp/pnl-be-15.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-be-15.log` only matters when EXIT is non-zero.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/pnl/
git commit -m "$(cat <<'EOF'
feat(pnl): count revenue-less TOs directly instead of via the issue chain

v_pnl_to.issue ranks cost causes above 'revenue_missing', and a missing
rate_spx breaks revenue and the cost fallback at the same time — so exactly
the TOs whose revenue is gone were labelled 'no_booking' and the Revenue
table, correctly ignoring cost causes, showed them clean.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `revenueMissingTos` reaches the yellow cells

**Files:**
- Modify: `apps/frontend/src/features/pnl/utils/cellWarning.ts`
- Modify: `apps/frontend/src/features/pnl/utils/dailyMatrix.ts` (the `CLEAN` and `EMPTY_FOOTER` constants and `cellWarnings`)
- Modify: `apps/frontend/src/features/pnl/utils/routeComparison.ts`, `vendorComparison.ts` (pass the field through)
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts` (six interfaces)
- Test: `apps/frontend/src/features/pnl/utils/cellWarning.spec.ts`, `dailyMatrix.spec.ts`

**Interfaces:**
- Consumes: the backend field from Task 6.
- Produces: `CellWarning` becomes `{ issues: PnlCellIssue[]; incompleteTos: number; revenueMissingTos: number }`. Every construction site must supply all three.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/utils/cellWarning.spec.ts`, change the shared fixture and add tests:

```ts
const clean: CellWarning = { issues: [], incompleteTos: 0, revenueMissingTos: 0 }
```

(every other object literal in that file needs `revenueMissingTos: 0` added too — TypeScript will point at each one.)

Then add:

```ts
describe('revenueMissingTos', () => {
  it('warns on its own, with no issue and no incomplete cost', () => {
    expect(hasWarning({ issues: [], incompleteTos: 0, revenueMissingTos: 2 })).toBe(true)
  })

  it('says how many TOs have no revenue', () => {
    expect(warningTooltip({ issues: [], incompleteTos: 0, revenueMissingTos: 2 })).toBe(
      '2 TO tanpa revenue',
    )
  })

  it('names the revenue half before the cost half', () => {
    // Revenue first: it says the number itself is missing, which outranks "this number is
    // understated by a cost we could not compute".
    expect(
      warningTooltip({ issues: [], incompleteTos: 3, revenueMissingTos: 2 }),
    ).toBe('2 TO tanpa revenue · 3 TO belum ada cost')
  })

  it('survives revenueWarning, which is the whole point', () => {
    // This is what makes a Revenue cell yellow. incompleteTos is forced to zero because a missing
    // cost cannot move SUM(revenue_total); revenueMissingTos can, by dropping out of that sum.
    expect(
      revenueWarning({
        issues: [{ issue: 'no_booking', awbs: 1 }],
        incompleteTos: 5,
        revenueMissingTos: 2,
      }),
    ).toEqual({ issues: [], incompleteTos: 0, revenueMissingTos: 2 })
  })

  it('leaves a cell with only cost problems clean on the Revenue table', () => {
    expect(
      hasWarning(
        revenueWarning({
          issues: [{ issue: 'smu_rate_missing', awbs: 1 }],
          incompleteTos: 4,
          revenueMissingTos: 0,
        }),
      ),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB cellWarning \
  >/tmp/pnl-fe-16.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-fe-16.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Extend `cellWarning.ts`**

```ts
export interface CellWarning {
  issues: PnlCellIssue[] // the cause: classified data quality problems, per issue type
  incompleteTos: number // the effect on cost: TOs with no cost at all
  // The effect on revenue: TOs whose revenue_total is NULL. Separate from `issues` because
  // v_pnl_to.issue is a priority chain that ranks cost causes above 'revenue_missing', so a TO
  // that is both uncosted and revenue-less never carries the revenue label. This count is a
  // direct aggregate and cannot be outranked.
  revenueMissingTos: number
}
```

`hasWarning`:

```ts
export function hasWarning(warning: CellWarning | undefined): warning is CellWarning {
  if (!warning) return false
  return warning.issues.length > 0 || warning.incompleteTos > 0 || warning.revenueMissingTos > 0
}
```

`warningTooltip` — insert the revenue clause **between** the issues clause and the cost clause:

```ts
  if (warning.revenueMissingTos > 0) {
    parts.push(`${warning.revenueMissingTos} TO tanpa revenue`)
  }
  if (warning.incompleteTos > 0) {
    parts.push(`${warning.incompleteTos} TO belum ada cost`)
  }
```

`revenueWarning` — keep the new field, keep forcing the old one to zero:

```ts
export function revenueWarning(warning: CellWarning | undefined): CellWarning | undefined {
  if (!warning) return undefined
  return {
    issues: warning.issues.filter((i) => REVENUE_ISSUES.has(i.issue)),
    incompleteTos: 0,
    // Kept, unlike incompleteTos: a NULL revenue_total drops straight out of SUM(revenue_total),
    // so this is exactly the signal that the revenue number on screen is understated.
    revenueMissingTos: warning.revenueMissingTos,
  }
}
```

Also update the `REVENUE_ISSUES` comment block — the caveat it carries about the issue chain is now answered by this field, so replace its last paragraph with:

```ts
// The chain caveat that used to live here is answered by CellWarning.revenueMissingTos, which is
// a direct COUNT(*) FILTER (WHERE revenue_total IS NULL) rather than a read of the chain.
```

- [ ] **Step 4: Update the six wire interfaces**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, add `revenueMissingTos: number` to `PnlDailyMatrixCell`, `PnlDailyMatrixFooter`, `PnlRouteComparisonCell`, `PnlRouteComparisonFooter`, `PnlVendorComparisonCell`, `PnlVendorComparisonFooter`.

- [ ] **Step 5: Update every construction site**

`apps/frontend/src/features/pnl/utils/dailyMatrix.ts`:

```ts
const CLEAN: CellWarning = { issues: [], incompleteTos: 0, revenueMissingTos: 0 }
```

```ts
function cellWarnings(matrix: PnlDailyMatrix): CellWarning[][] {
  return matrix.rows.map((row) =>
    row.cells.map((cell) =>
      // `issues` and `revenueMissingTos` are non-optional in the type, but the deploy pipeline
      // brings backend and frontend up in parallel, so a new frontend can briefly hit an old
      // backend whose cells lack the field.
      cell
        ? {
            issues: cell.issues ?? [],
            incompleteTos: cell.incompleteTos,
            revenueMissingTos: cell.revenueMissingTos ?? 0,
          }
        : CLEAN,
    ),
  )
}
```

In `toRevenueTable`:

```ts
  const footerWarnings = matrix.footer.map((f) =>
    revenueWarning({
      issues: f.issues ?? [],
      incompleteTos: f.incompleteTos,
      revenueMissingTos: f.revenueMissingTos ?? 0,
    }),
  )
```

In `toMarginTable`:

```ts
  const footerWarnings = matrix.footer.map((f) => ({
    issues: f.issues ?? [],
    incompleteTos: f.incompleteTos,
    revenueMissingTos: f.revenueMissingTos ?? 0,
  }))
```

In `EMPTY_FOOTER`, add `revenueMissingTos: 0,` beside `incompleteTos: 0,`.

`routeComparison.ts` and `vendorComparison.ts` — both have a `CLEAN` const and two mapping sites (cell warnings, footer warnings). Add `revenueMissingTos: c.revenueMissingTos ?? 0` / `f.revenueMissingTos ?? 0` to each, and `revenueMissingTos: 0` to their `CLEAN`.

- [ ] **Step 6: Fix the fixtures the type change breaks**

Run `cd apps/frontend && pnpm type-check` and add `revenueMissingTos: 0` to every object literal it flags. Expect hits in `dailyMatrix.spec.ts`, `PnlMatrixTable.spec.tsx`, `PnlDailyMatrixView.spec.tsx`, `PnlComparisonTable.spec.tsx`, `routeComparison.spec.ts`, `vendorComparison.spec.ts`.

- [ ] **Step 7: Add the end-to-end warning test**

In `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`, add to the `toRevenueTable` describe:

```ts
  it('warns a revenue cell whose TOs have no revenue, even when the issue names a cost cause', () => {
    // The exact case that made Revenue cells stop going yellow: a TO with no rate_spx has no
    // revenue AND no cost fallback, and v_pnl_to.issue ranks the cost cause first.
    const matrix = matrixWith({
      revenue: 0, margin: 0, weight: 0,
      incompleteTos: 1,
      revenueMissingTos: 2,
      issues: [{ issue: 'no_booking', awbs: 1 }],
    })

    const model = toRevenueTable(matrix)
    const warning = model.warnings[0][0]

    expect(hasWarning(warning)).toBe(true)
    expect(warning.revenueMissingTos).toBe(2)
    // Still no cost noise on this table.
    expect(warning.issues).toEqual([])
    expect(warning.incompleteTos).toBe(0)
  })
```

Add whatever local `matrixWith` helper the file already uses — if it has none, build the `PnlDailyMatrix` literal inline in the same shape the neighbouring tests use. Import `hasWarning` from `./cellWarning`.

- [ ] **Step 8: Run the frontend PnL tests**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl \
  >/tmp/pnl-fe-17.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-fe-17.log` only matters when EXIT is non-zero.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/pnl/
git commit -m "$(cat <<'EOF'
feat(pnl): let a revenue cell go yellow on the count, not the label

revenueWarning keeps revenueMissingTos and still zeroes incompleteTos: a
missing cost cannot move SUM(revenue_total), but a NULL revenue_total drops
straight out of it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `unionRoutes` and `offerableRoutes`

**Files:**
- Modify: `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`
- Test: `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export function unionRoutes(picked: PnlRoutePair[], group: PnlRoutePair[]): PnlRoutePair[]
  export function offerableRoutes(all: PnlRoutePair[], group: PnlRoutePair[]): PnlRoutePair[]
  ```
  Both operate on pairs, not labels, so the two tabs can share them despite labelling routes differently.

- [ ] **Step 1: Write the failing tests**

Add to `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`:

```ts
describe('unionRoutes', () => {
  const jaboAceh = { origin: 'Jabo', dest: 'Aceh' }
  const jaboBatam = { origin: 'Jabo', dest: 'Batam' }
  const subPtk = { origin: 'Surabaya', dest: 'Pontianak' }

  it('returns the picked routes when no group is chosen', () => {
    expect(unionRoutes([jaboAceh], [])).toEqual([jaboAceh])
  })

  it('returns the group members when nothing was picked by hand', () => {
    expect(unionRoutes([], [jaboAceh, jaboBatam])).toEqual([jaboAceh, jaboBatam])
  })

  it('puts the hand-picked routes first, then the group members', () => {
    expect(unionRoutes([subPtk], [jaboAceh])).toEqual([subPtk, jaboAceh])
  })

  it('counts a route on both sides exactly once', () => {
    // Ticking a route and then picking a group that contains it must not double it: the pick is
    // deliberately kept in scope so that changing group later restores it ticked.
    expect(unionRoutes([jaboAceh], [jaboAceh, jaboBatam])).toEqual([jaboAceh, jaboBatam])
  })

  it('is empty only when both sides are', () => {
    expect(unionRoutes([], [])).toEqual([])
  })
})

describe('offerableRoutes', () => {
  const all = [
    { origin: 'Jabo', dest: 'Aceh' },
    { origin: 'Jabo', dest: 'Batam' },
    { origin: 'Surabaya', dest: 'Pontianak' },
  ]

  it('offers everything when no group is chosen', () => {
    expect(offerableRoutes(all, [])).toEqual(all)
  })

  it('withholds the routes the chosen group already covers', () => {
    // A checkbox that changes nothing is worse than one that is absent: unticking a route the
    // group still supplies would leave it filtered anyway.
    expect(offerableRoutes(all, [{ origin: 'Jabo', dest: 'Aceh' }])).toEqual([
      { origin: 'Jabo', dest: 'Batam' },
      { origin: 'Surabaya', dest: 'Pontianak' },
    ])
  })

  it('ignores a group member the list does not carry', () => {
    // The Estimated tab lists only pairs that have flown, while a group is built from the master,
    // so a group can legitimately name a route this dropdown never offered.
    expect(offerableRoutes(all, [{ origin: 'Jabo', dest: 'Manokwari' }])).toEqual(all)
  })

  it('can withhold everything', () => {
    expect(offerableRoutes(all, all)).toEqual([])
  })
})
```

Add `unionRoutes, offerableRoutes` to the file's import from `./dailyMatrix`.

- [ ] **Step 2: Run to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB dailyMatrix \
  >/tmp/pnl-fe-18.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-fe-18.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Implement both**

In `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`, after the existing `routeKey` helper:

```ts
/**
 * The routes a filter is actually narrowing to: what the user ticked, plus everything the chosen
 * route group carries.
 *
 * Hand-picked routes come first so the order the user built stays visible, and a route present on
 * both sides appears once. Both matter because a route ticked BEFORE its group was chosen stays in
 * the scope — it is deliberately not removed, so that choosing a different group later brings it
 * back already ticked.
 */
export function unionRoutes(picked: PnlRoutePair[], group: PnlRoutePair[]): PnlRoutePair[] {
  const seen = new Set(picked.map(routeKey))
  return [...picked, ...group.filter((r) => !seen.has(routeKey(r)))]
}

/**
 * The routes the dropdown may still offer: everything, minus what the chosen group already covers.
 *
 * Withheld rather than shown ticked-and-disabled. MultiRouteFilter has no disabled state, and
 * adding one would touch the SLA page, Analytics and Route Comparison for the sake of one caller —
 * while filtering the list handed to it touches nothing. More importantly, a ticked checkbox that
 * does nothing when unticked is worse than an absent one: the group would keep supplying the route
 * either way.
 */
export function offerableRoutes(all: PnlRoutePair[], group: PnlRoutePair[]): PnlRoutePair[] {
  if (group.length === 0) return all
  const covered = new Set(group.map(routeKey))
  return all.filter((r) => !covered.has(routeKey(r)))
}
```

`routeKey` is currently declared as `function routeKey(pair: { origin: string; dest: string }): string` further down the file — move it above these two functions if hoisting ever becomes an issue (it will not, function declarations hoist).

- [ ] **Step 4: Run to verify they pass**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB dailyMatrix \
  >/tmp/pnl-fe-19.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-fe-19.log` only matters when EXIT is non-zero.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/utils/dailyMatrix.ts apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts
git commit -m "$(cat <<'EOF'
feat(pnl): work out which routes a group-plus-ticks filter covers

offerableRoutes withholds a group's own routes from the dropdown rather than
showing them ticked and inert — unticking one would not widen anything,
because the group still supplies it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `RouteGroupSelect`

**Files:**
- Create: `apps/frontend/src/components/shared/route-group-select.tsx`
- Create: `apps/frontend/src/components/shared/route-group-select.spec.tsx`

**Interfaces:**
- Consumes: `useRouteGroups({ enabled })` from `@/features/route-groups/hooks/useRouteGroups`; `usePermissions` from `@/shared/hooks/use-permissions`; the `RouteGroup` type from `@/features/route-groups/types`.
- Produces:
  ```tsx
  export function RouteGroupSelect(props: {
    value: string | undefined
    onChange: (id: string | undefined) => void
    className?: string
  }): JSX.Element | null
  ```
  Returns `null` when the viewer lacks `read.route_group`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/components/shared/route-group-select.spec.tsx`:

```tsx
/**
 * The permission gate is the reason this has its own spec. GET /route-groups is guarded by
 * read.route_group, so a viewer allowed onto the P&L tabs but not onto Route Groups must not
 * merely have the control hidden — no request may be sent at all, or they collect a 403.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RouteGroupSelect } from './route-group-select'

jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: jest.fn() }))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({ useRouteGroups: jest.fn() }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const perms = require('@/shared/hooks/use-permissions')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const groupsHook = require('@/features/route-groups/hooks/useRouteGroups')

const GROUPS = [
  { id: 'g1', name: 'Jabo Timur', description: null, routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }] },
  { id: 'g2', name: 'Surabaya', description: null, routes: [] },
]

function allow(can: boolean) {
  perms.usePermissions.mockReturnValue({ hasPermission: () => can })
}

beforeEach(() => {
  jest.clearAllMocks()
  groupsHook.useRouteGroups.mockReturnValue({ data: GROUPS })
})

describe('RouteGroupSelect', () => {
  it('lists every group behind a placeholder', () => {
    allow(true)
    render(<RouteGroupSelect value={undefined} onChange={jest.fn()} />)

    expect(screen.getByRole('option', { name: 'Route group…' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Jabo Timur' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Surabaya' })).toBeInTheDocument()
  })

  it('reports the chosen group id', () => {
    allow(true)
    const onChange = jest.fn()
    render(<RouteGroupSelect value={undefined} onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'g1' } })
    expect(onChange).toHaveBeenCalledWith('g1')
  })

  it('reports undefined, not an empty string, when the placeholder is chosen', () => {
    // undefined is what "no group" means everywhere downstream; '' would be a group id nothing
    // matches, and offerableRoutes would then withhold nothing while the label claimed otherwise.
    allow(true)
    const onChange = jest.fn()
    render(<RouteGroupSelect value="g1" onChange={onChange} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('shows the placeholder for a group id that no longer exists', () => {
    // A group deleted while the user was on another tab. Falling back to the placeholder is the
    // honest answer; the scope simply falls back to the hand-picked routes.
    allow(true)
    render(<RouteGroupSelect value="deleted" onChange={jest.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('renders nothing and asks for nothing without read.route_group', () => {
    allow(false)
    const { container } = render(<RouteGroupSelect value={undefined} onChange={jest.fn()} />)

    expect(container).toBeEmptyDOMElement()
    expect(groupsHook.useRouteGroups).toHaveBeenCalledWith({ enabled: false })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB route-group-select \
  >/tmp/pnl-fe-20.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-fe-20.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/components/shared/route-group-select.tsx`:

```tsx
'use client'

import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'

export interface RouteGroupSelectProps {
  /** The chosen group id, or undefined for "no group". */
  value: string | undefined
  onChange: (id: string | undefined) => void
  className?: string
}

/**
 * Picks one saved Route Group to scope a report by. Shared by the P&L Estimated tab and the Daily
 * Report so the two cannot drift into two different controls.
 *
 * Single-select, unlike the Route Comparison tab's checkbox list: that picks comparison COLUMNS,
 * which are many and ordered, while this picks a SCOPE, which is one.
 *
 * The permission gate is not merely visual. GET /route-groups is guarded by read.route_group, so
 * `enabled` must be false for a viewer without it — with `enabled: false` no request is sent at
 * all, and no 403 ever reaches them.
 */
export function RouteGroupSelect({ value, onChange, className }: RouteGroupSelectProps) {
  const { hasPermission } = usePermissions()
  const canReadGroups = hasPermission('read.route_group')
  const { data: groups } = useRouteGroups({ enabled: canReadGroups })

  if (!canReadGroups) return null

  // A group deleted while the user was elsewhere leaves an id matching no option, and the select
  // shows its placeholder — which is the honest answer. Deliberately NOT cleared by an effect:
  // useRouteGroups has no initialData, so `groups` is undefined while loading and again after its
  // gcTime, and clearing then would wipe a live choice.
  const known = (groups ?? []).some((g) => g.id === value)

  return (
    <select
      aria-label="Route Group"
      className={`rounded-md border bg-background px-3 py-1.5 text-sm ${className ?? ''}`}
      value={known ? value : ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">Route group…</option>
      {(groups ?? []).map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB route-group-select \
  >/tmp/pnl-fe-21.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-fe-21.log` only matters when EXIT is non-zero.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/shared/route-group-select.tsx apps/frontend/src/components/shared/route-group-select.spec.tsx
git commit -m "$(cat <<'EOF'
feat(pnl): a route group picker both P&L tabs can share

enabled:false rather than a hidden control: a viewer without read.route_group
must send no request at all, not collect a 403 they cannot act on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Daily Report gains the group filter

**Files:**
- Modify: `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx`
- Modify: `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.spec.tsx`

**Interfaces:**
- Consumes: `RouteGroupSelect` (Task 9), `unionRoutes`/`offerableRoutes` (Task 8), `useRouteGroups`.
- Produces: `PnlDailyMatrixViewProps` gains `groupId: string | undefined` and `onGroupChange: (id: string | undefined) => void`.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.spec.tsx`, extend the mock block at the top:

```tsx
jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: jest.fn() }))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({ useRouteGroups: jest.fn() }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const perms = require('@/shared/hooks/use-permissions')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const groupsHook = require('@/features/route-groups/hooks/useRouteGroups')

const GROUPS = [
  {
    id: 'g1',
    name: 'Jabo Timur',
    description: null,
    routes: [
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Manokwari' },
    ],
  },
]
```

Update `renderView` to take the new props and add them to the render:

```tsx
function renderView(
  picks: PnlRoutePair[] = [],
  onPicksChange = jest.fn(),
  onCellClick = jest.fn(),
  groupId: string | undefined = undefined,
  onGroupChange = jest.fn(),
) {
  return render(
    <PnlDailyMatrixView
      filter={filter}
      picks={picks}
      onPicksChange={onPicksChange}
      onCellClick={onCellClick}
      groupId={groupId}
      onGroupChange={onGroupChange}
    />,
  )
}
```

Extend `beforeEach`:

```tsx
  perms.usePermissions.mockReturnValue({ hasPermission: () => true })
  groupsHook.useRouteGroups.mockReturnValue({ data: GROUPS })
```

Then add the tests:

```tsx
describe('PnlDailyMatrixView route group filter', () => {
  it('narrows the matrix to the chosen group members', () => {
    renderView([], jest.fn(), jest.fn(), 'g1')

    // The group covers Tanjung Pinang (has data) and Manokwari (master-only), so both are columns
    // and Pontianak is gone.
    expect(screen.getAllByText('Tanjung Pinang').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Manokwari').length).toBeGreaterThan(0)
    expect(screen.queryByText('Pontianak')).not.toBeInTheDocument()
  })

  it('keeps a group member with no shipments as an em-dash column', () => {
    renderView([], jest.fn(), jest.fn(), 'g1')
    // A route the group names but nothing flew: an all-em-dash column reads as the real answer,
    // while a dropped column reads as a broken filter.
    expect(screen.getAllByText('Manokwari').length).toBeGreaterThan(0)
  })

  it('adds hand-ticked routes to the group rather than replacing them', () => {
    renderView([{ origin: 'Surabaya', dest: 'Pontianak' }], jest.fn(), jest.fn(), 'g1')

    expect(screen.getAllByText('Pontianak').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tanjung Pinang').length).toBeGreaterThan(0)
  })

  it('stops offering a route the chosen group already covers', () => {
    renderView([], jest.fn(), jest.fn(), 'g1')

    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    // Both group members disappear from the list; the route outside it stays.
    expect(screen.queryByTitle('CGK → Tanjung Pinang')).not.toBeInTheDocument()
    expect(screen.getByTitle('SUB → Pontianak')).toBeInTheDocument()
  })

  it('offers every route again once no group is chosen', () => {
    renderView()

    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    expect(screen.getByTitle('CGK → Tanjung Pinang')).toBeInTheDocument()
    expect(screen.getByTitle('SUB → Pontianak')).toBeInTheDocument()
  })

  it('reports a group choice back to the page', () => {
    const onGroupChange = jest.fn()
    renderView([], jest.fn(), jest.fn(), undefined, onGroupChange)

    fireEvent.change(screen.getByRole('combobox', { name: 'Route Group' }), {
      target: { value: 'g1' },
    })
    expect(onGroupChange).toHaveBeenCalledWith('g1')
  })

  it('says which routes the active filter covers, counting a shared one once', () => {
    // Tanjung Pinang is both ticked and inside the group, so the total is 2, not 3.
    renderView([{ origin: 'Jabo', dest: 'Tanjung Pinang' }], jest.fn(), jest.fn(), 'g1')

    expect(screen.getByTestId('filter-summary')).toHaveTextContent('Jabo Timur')
    expect(screen.getByTestId('filter-summary')).toHaveTextContent('2 rute')
  })

  it('says nothing when no group is chosen, because the dropdown is already honest', () => {
    renderView([{ origin: 'Jabo', dest: 'Tanjung Pinang' }])
    expect(screen.queryByTestId('filter-summary')).not.toBeInTheDocument()
  })
})
```

Add `Manokwari` to the `routes` fixture if it is not already there — it is (the existing fixture carries `{ origin: 'Jabo', originLabel: 'CGK', dest: 'Manokwari' }`).

- [ ] **Step 2: Run to verify they fail**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB PnlDailyMatrixView \
  >/tmp/pnl-fe-22.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-fe-22.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Rewrite the view**

Replace `apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx` with:

```tsx
'use client'

import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { RouteGroupSelect } from '@/components/shared/route-group-select'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import {
  PnlDailyMatrixColumn,
  PnlFilter,
  PnlRoutePair,
  usePnlDailyMatrix,
  usePnlRoutes,
} from '../hooks/usePnl'
import {
  groupOrigins,
  offerableRoutes,
  selectMatrixColumns,
  toMarginTable,
  toRevenueTable,
  unionRoutes,
} from '../utils/dailyMatrix'
import { buildRouteLabelIndex, displayRouteLabel, labelsForRoutes, routesForLabels } from '../utils/routeLabels'
import { PnlMatrixTable } from './PnlMatrixTable'

interface PnlDailyMatrixViewProps {
  filter: PnlFilter
  // Lifted to the page for the same reason the comparison picks are: the tab is rendered by a
  // ternary, so leaving it unmounts this view and would otherwise discard the selection.
  picks: PnlRoutePair[]
  onPicksChange: (next: PnlRoutePair[]) => void
  groupId: string | undefined
  onGroupChange: (id: string | undefined) => void
  onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
}

export function PnlDailyMatrixView({
  filter,
  picks,
  onPicksChange,
  groupId,
  onGroupChange,
  onCellClick,
}: PnlDailyMatrixViewProps) {
  const { data, isLoading, isError, refetch } = usePnlDailyMatrix(filter)
  const { data: routes } = usePnlRoutes()
  const { hasPermission } = usePermissions()
  // `enabled` is the permission gate, not a visibility toggle: with it false no request is sent,
  // so a user without read.route_group never produces a 403.
  const { data: groups } = useRouteGroups({ enabled: hasPermission('read.route_group') })

  const group = groupId ? groups?.find((g) => g.id === groupId) : undefined
  const groupRoutes: PnlRoutePair[] = (group?.routes ?? []).map((r) => ({
    origin: r.origin,
    dest: r.dest,
  }))

  // What the filter actually covers, and what the dropdown may still offer. A route inside the
  // chosen group is withheld rather than shown ticked-and-inert: unticking it would not widen
  // anything, because the group keeps supplying it.
  const effectiveRoutes = unionRoutes(picks, groupRoutes)
  const offerable = offerableRoutes(routes ?? [], groupRoutes)

  // Labelled by airport code, unlike the Route Comparison picker's raw-station form: this dropdown
  // sits directly above a matrix whose headers name origins that way, and the two must agree.
  const routeIndex = buildRouteLabelIndex(offerable, displayRouteLabel)

  // Rendered before the early returns below so the filter stays usable while the report reloads,
  // errors, or comes back empty — otherwise a too-narrow pick would hide the control that undoes it.
  const routeFilter = (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Rute</span>
          <MultiRouteFilter
            className="w-[260px]"
            routes={routeIndex.labels}
            selected={labelsForRoutes(picks, routeIndex)}
            onChange={(labels) => onPicksChange(routesForLabels(labels, routeIndex))}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Route Group</span>
          <RouteGroupSelect value={groupId} onChange={onGroupChange} />
        </label>
      </div>

      {group && (
        <p data-testid="filter-summary" className="mt-3 text-xs text-muted-foreground">
          Filter aktif: <span className="font-medium text-foreground">{group.name}</span> (
          {groupRoutes.length} rute) + {picks.length} rute dipilih →{' '}
          <span className="font-medium text-foreground">{effectiveRoutes.length} rute</span>
        </p>
      )}
    </div>
  )

  function frame(body: React.ReactNode) {
    return (
      <div className="space-y-6">
        {routeFilter}
        {body}
      </div>
    )
  }

  if (isLoading) {
    return frame(
      <div className="space-y-6 animate-pulse">
        <div className="h-[320px] rounded-lg border bg-card" />
        <div className="h-[420px] rounded-lg border bg-card" />
      </div>,
    )
  }

  if (isError) {
    return frame(
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load the daily report.</p>
        <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
          Retry
        </button>
      </div>,
    )
  }

  if (!data || data.columns.length === 0) {
    return frame(
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No route data available.</p>
      </div>,
    )
  }

  // Applied once, ahead of both tables, so the two stay column-aligned and every downstream index —
  // headers, footers, the column a cell click reports — comes from the same narrowed matrix.
  const shown = selectMatrixColumns(data, effectiveRoutes)
  const originSuffix = groupOrigins(shown.columns).map((g) => g.label).join('/')

  return frame(
    <>
      <PnlMatrixTable title={`Revenue — ${originSuffix}`} model={toRevenueTable(shown)} onCellClick={onCellClick} />
      <PnlMatrixTable title={`Profit Margin — ${originSuffix}`} model={toMarginTable(shown)} onCellClick={onCellClick} />
    </>,
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB PnlDailyMatrixView \
  >/tmp/pnl-fe-23.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-fe-23.log` only matters when EXIT is non-zero.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlDailyMatrixView.tsx apps/frontend/src/features/pnl/components/PnlDailyMatrixView.spec.tsx
git commit -m "$(cat <<'EOF'
feat(pnl): filter the Daily Report by route group

selectMatrixColumns is untouched: a group member with no shipments already
renders as an em-dash column, which is the answer rather than a gap.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: The nine hooks take a scope

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts`
- Test: `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts`

**Interfaces:**
- Produces: `usePnlSummary`, `usePnlDailyMargin`, `usePnlRevenueByRoute`, `usePnlProfitByRoute`, `usePnlCostTotals`, `usePnlCostByVendor`, `usePnlCostByRa`, `usePnlCostBySgOut`, `usePnlCostBySgIn` each take `scope?: PnlRouteFilter` as their **last** parameter (after the existing `enabled` where one exists), and include it in `queryKey`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts` (follow the file's existing harness — it already tests `routeToParams` directly):

```ts
// Renders the real hook against a real QueryClient and reads the cache it populated. Comparing two
// key arrays the test itself built would assert only that two different literals differ — it would
// pass with the scope never reaching the hook at all.
describe('scoped query keys', () => {
  function keysAfter(scope?: PnlRouteFilter): unknown[][] {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(() => usePnlSummary(FILTER, scope), { wrapper })
    return client.getQueryCache().getAll().map((q) => q.queryKey as unknown[])
  }

  it('puts the scope in the key, so changing the filter refetches', () => {
    // Without this, react-query serves the previous filter's cached answer and the page silently
    // shows numbers for a filter the user has already changed.
    const scoped = keysAfter({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    const unscoped = keysAfter(undefined)

    expect(scoped).toHaveLength(1)
    expect(unscoped).toHaveLength(1)
    expect(scoped[0]).not.toEqual(unscoped[0])
    // And the scope is what differs, not merely something.
    expect(JSON.stringify(scoped[0])).toContain('Jabo')
  })
})

describe('routeToParams as the scope serialiser', () => {
  it('drops every empty field, so an untouched filter sends the old request shape', () => {
    expect(routeToParams({})).toEqual({})
    expect(routeToParams({ routes: [], vendors: [] })).toEqual({})
    expect(routeToParams(undefined)).toEqual({})
  })

  it('joins route pairs on the pipe and the comma', () => {
    expect(
      routeToParams({
        routes: [
          { origin: 'Jabo', dest: 'Aceh' },
          { origin: 'Surabaya', dest: 'Batam' },
        ],
      }),
    ).toEqual({ routes: 'Jabo|Aceh,Surabaya|Batam' })
  })

  it('sends vendors under the singular key, as an array the serialiser repeats', () => {
    expect(routeToParams({ vendors: ['ESP'] })).toEqual({ vendor: ['ESP'] })
  })
})
```

The `scoped query keys` block renders a real hook, so the file needs:

```ts
import React from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PnlFilter, PnlRouteFilter, routeToParams, usePnlSummary } from './usePnl'

// Never resolves: the test reads the query KEY the hook registered, and a resolving mock would
// only add act() noise.
jest.mock('@/shared/api/client', () => ({
  apiClient: { get: jest.fn(() => new Promise(() => {})) },
}))

const FILTER: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'date' }
```

If `usePnl.spec.ts` has no JSX today it must be renamed `usePnl.spec.tsx` for the `wrapper` above
to compile. Check first: `head -5 apps/frontend/src/features/pnl/hooks/usePnl.spec.ts`. If renaming,
use `git mv` so the file's history follows it.

- [ ] **Step 2: Run to verify**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB usePnl \
  >/tmp/pnl-fe-usepnl.log 2>&1; echo "EXIT=$?"
```

Expected: the `routeToParams` tests may already pass (the function exists); the key test is a guard. This task is mostly mechanical — its real proof is Task 12's component tests and Task 15's integration run.

- [ ] **Step 3: Add the scope to the two simple hooks**

```ts
export function usePnlSummary(filter: PnlFilter | undefined, scope?: PnlRouteFilter) {
  return useQuery<PnlSummary>({
    queryKey: ['pnl', 'summary', filter, scope],
    queryFn: () =>
      apiClient
        .get('/pnl/summary', {
          params: { ...filterToParams(filter!), ...routeToParams(scope) },
          // `vendor` repeats. axios's default array serializer writes `vendor[]=ESP`, which qs
          // parses into a key named 'vendor[]' that no handler reads — the filter would vanish
          // with no error anywhere. Scalar params are unaffected by this setting.
          paramsSerializer: { indexes: null },
        })
        .then((r) => r.data),
    enabled: !!filter,
    staleTime: 60 * 1000,
  })
}
```

`usePnlDailyMargin` gets the identical treatment against `/pnl/daily-margin`.

- [ ] **Step 4: Add it to the seven breakdown hooks**

`usePnlRevenueByRoute` and `usePnlProfitByRoute` take `(filter, scope?)`. `usePnlCostTotals`, `usePnlCostByVendor`, `usePnlCostByRa`, `usePnlCostBySgOut`, `usePnlCostBySgIn` already take `(filter, enabled = true)` — the scope goes **after** it: `(filter, enabled = true, scope?)`. Every one gets the same three changes: `scope` into `queryKey`, `...routeToParams(scope)` into `params`, and `paramsSerializer: { indexes: null }`.

For example:

```ts
export function usePnlCostByVendor(
  filter: PnlFilter | undefined,
  enabled = true,
  scope?: PnlRouteFilter,
) {
  return useQuery<PnlVendorCostItem[]>({
    queryKey: ['pnl', 'cost-by-vendor', filter, scope],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/cost-by-vendor', {
          params: { ...filterToParams(filter!), ...routeToParams(scope) },
          paramsSerializer: { indexes: null },
        })
        .then((r) => r.data),
    enabled: !!filter && enabled,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 5: Thread the scope through `PnlBreakdownPanel`**

`apps/frontend/src/features/pnl/components/PnlBreakdownPanel.tsx` calls seven of these hooks. Add `scope?: PnlRouteFilter` to `PnlBreakdownPanelProps`, pass it down to each section component, and have each section pass it to its hook. The `enabled` argument stays where it is:

```tsx
  const { data, isLoading } = usePnlCostByVendor(filter, true, scope)
```

- [ ] **Step 6: Type-check and run**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm type-check >/tmp/pnl-fe-tsc.log 2>&1; echo "TSC_EXIT=$?"
```

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl \
  >/tmp/pnl-fe-hooks.log 2>&1; echo "EXIT=$?"
```

Expected: `TSC_EXIT=0` and `EXIT=0`.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl/hooks/usePnl.ts apps/frontend/src/features/pnl/hooks/usePnl.spec.ts apps/frontend/src/features/pnl/components/PnlBreakdownPanel.tsx
git commit -m "$(cat <<'EOF'
feat(pnl): carry the scope into every estimated-tab query

The scope goes into queryKey, not only into params: without it react-query
serves the previous filter's cached answer and the page shows numbers for a
filter the user already changed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `PnlEstimateFilterBar`

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlEstimateFilterBar.tsx`
- Create: `apps/frontend/src/features/pnl/components/PnlEstimateFilterBar.spec.tsx`

**Interfaces:**
- Consumes: `usePnlStations`, `periodBounds`, `buildRouteLabelIndex`/`labelsForRoutes`/`routesForLabels` (default `dropdownRouteLabel`), `MultiRouteFilter`, `RouteGroupSelect` (Task 9), `unionRoutes`/`offerableRoutes` (Task 8), `useRouteGroups`.
- Produces:
  ```tsx
  export interface PnlEstimateFilterBarProps {
    filter: PnlFilter
    scope: PnlRouteFilter
    onScopeChange: (next: PnlRouteFilter) => void
    groupId: string | undefined
    onGroupChange: (id: string | undefined) => void
  }
  export function PnlEstimateFilterBar(props: PnlEstimateFilterBarProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/pnl/components/PnlEstimateFilterBar.spec.tsx`:

```tsx
/**
 * The filter row that used to live inside PnlAwbDrilldown. It now drives the whole Estimated tab —
 * KPI cards, chart, breakdowns and the drilldown — so the behaviour pinned here (what it reports,
 * what it refuses to report, and what it withholds from the dropdown) decides ten queries.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlEstimateFilterBar } from './PnlEstimateFilterBar'
import { PnlFilter, PnlRouteFilter } from '../hooks/usePnl'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return { ...actual, usePnlStations: jest.fn() }
})
jest.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: jest.fn() }))
jest.mock('@/features/route-groups/hooks/useRouteGroups', () => ({ useRouteGroups: jest.fn() }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hooks = require('../hooks/usePnl')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const perms = require('@/shared/hooks/use-permissions')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const groupsHook = require('@/features/route-groups/hooks/useRouteGroups')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'date' }

const STATIONS = [
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
  { origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' },
  { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
]

const GROUPS = [
  {
    id: 'g1',
    name: 'Jabo Timur',
    description: null,
    routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }],
  },
]

function renderBar(
  scope: PnlRouteFilter = {},
  onScopeChange = jest.fn(),
  groupId: string | undefined = undefined,
  onGroupChange = jest.fn(),
) {
  render(
    <PnlEstimateFilterBar
      filter={filter}
      scope={scope}
      onScopeChange={onScopeChange}
      groupId={groupId}
      onGroupChange={onGroupChange}
    />,
  )
  return { onScopeChange, onGroupChange }
}

beforeEach(() => {
  jest.clearAllMocks()
  hooks.usePnlStations.mockReturnValue({ data: STATIONS })
  perms.usePermissions.mockReturnValue({ hasPermission: () => true })
  groupsHook.useRouteGroups.mockReturnValue({ data: GROUPS })
})

describe('PnlEstimateFilterBar routes', () => {
  it('names both stations as the data stores them, not by airport code', () => {
    // Unlike the Daily Report's dropdown: there is no airport-code header here to agree with, and
    // the drilldown table below shows raw station values in its Origin and Destination columns.
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    expect(screen.getByTitle('Jabo → Aceh')).toBeInTheDocument()
    expect(screen.getByTitle('Surabaya → Pontianak')).toBeInTheDocument()
  })

  it('reports a ticked route as a raw pair', () => {
    const { onScopeChange } = renderBar()
    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    fireEvent.click(screen.getByTitle('Jabo → Aceh'))
    expect(onScopeChange).toHaveBeenCalledWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
  })

  it('drops the routes key entirely when the last route is unticked', () => {
    // Empty means "no filter": routeToParams drops undefined fields, while an empty array would
    // serialise as a filter matching nothing.
    const { onScopeChange } = renderBar({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    fireEvent.click(screen.getByTitle('Jabo → Aceh'))
    expect(onScopeChange).toHaveBeenCalledWith({ routes: undefined })
  })
})

describe('PnlEstimateFilterBar dates', () => {
  it('reports each date change without disturbing the rest of the scope', () => {
    const scope: PnlRouteFilter = { routes: [{ origin: 'Jabo', dest: 'Aceh' }] }
    const { onScopeChange } = renderBar(scope)

    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '2026-05-03' } })
    expect(onScopeChange).toHaveBeenCalledWith({ ...scope, dateFrom: '2026-05-03' })

    fireEvent.change(screen.getByLabelText('Sampai'), { target: { value: '2026-05-10' } })
    expect(onScopeChange).toHaveBeenCalledWith({ ...scope, dateTo: '2026-05-10' })
  })

  it('bounds both inputs to the active cycle', () => {
    renderBar()
    const from = screen.getByLabelText('Dari') as HTMLInputElement
    const to = screen.getByLabelText('Sampai') as HTMLInputElement
    expect(from.min).toBe('2026-05-01')
    expect(from.max).toBe('2026-05-15')
    expect(to.min).toBe('2026-05-01')
    expect(to.max).toBe('2026-05-15')
  })

  it('caps Dari at Sampai and floors Sampai at Dari when both are set', () => {
    renderBar({ dateFrom: '2026-05-05', dateTo: '2026-05-10' })
    expect((screen.getByLabelText('Dari') as HTMLInputElement).max).toBe('2026-05-10')
    expect((screen.getByLabelText('Sampai') as HTMLInputElement).min).toBe('2026-05-05')
  })

  it('clears a date rather than sending an empty string', () => {
    const { onScopeChange } = renderBar({ dateFrom: '2026-05-05' })
    fireEvent.change(screen.getByLabelText('Dari'), { target: { value: '' } })
    expect(onScopeChange).toHaveBeenCalledWith({ dateFrom: undefined })
  })
})

describe('PnlEstimateFilterBar vendors', () => {
  it('shows each active vendor as a removable chip', () => {
    renderBar({ vendors: ['ESP', 'Angkasa Kargo'] })
    expect(screen.getByTestId('vendor-chip-ESP')).toHaveTextContent('ESP')
    expect(screen.getByTestId('vendor-chip-Angkasa Kargo')).toHaveTextContent('Angkasa Kargo')
  })

  it('drops one vendor without disturbing the rest of the scope', () => {
    const { onScopeChange } = renderBar({
      vendors: ['ESP', 'Angkasa Kargo'],
      dateFrom: '2026-05-01',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))
    expect(onScopeChange).toHaveBeenCalledWith({
      vendors: ['Angkasa Kargo'],
      dateFrom: '2026-05-01',
    })
  })

  it('removes the key entirely when the last vendor is dropped', () => {
    const { onScopeChange } = renderBar({ vendors: ['ESP'] })
    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))
    expect(onScopeChange).toHaveBeenCalledWith({ vendors: undefined })
  })
})

describe('PnlEstimateFilterBar reset', () => {
  it('stays hidden while nothing is filtered', () => {
    renderBar()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('appears for a vendor-only scope, which is how a Vendor Comparison click arrives', () => {
    renderBar({ vendors: ['ESP'] })
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })

  it('appears for a group-only scope', () => {
    renderBar({}, jest.fn(), 'g1')
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })

  it('clears the scope and the group together', () => {
    const { onScopeChange, onGroupChange } = renderBar({ vendors: ['ESP'] }, jest.fn(), 'g1')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onScopeChange).toHaveBeenCalledWith({})
    expect(onGroupChange).toHaveBeenCalledWith(undefined)
  })
})

describe('PnlEstimateFilterBar route group', () => {
  it('stops offering a route the chosen group already covers', () => {
    renderBar({}, jest.fn(), 'g1')
    fireEvent.click(screen.getByRole('button', { name: /All Routes|routes/i }))
    expect(screen.queryByTitle('Jabo → Aceh')).not.toBeInTheDocument()
    expect(screen.getByTitle('Surabaya → Pontianak')).toBeInTheDocument()
  })

  it('keeps a route ticked before the group was chosen, counting it once', () => {
    // Deliberately not removed from the scope: choosing a different group later must bring it
    // back already ticked.
    renderBar({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }, jest.fn(), 'g1')
    expect(screen.getByTestId('filter-summary')).toHaveTextContent('1 rute')
  })

  it('reports a group choice', () => {
    const { onGroupChange } = renderBar()
    fireEvent.change(screen.getByRole('combobox', { name: 'Route Group' }), {
      target: { value: 'g1' },
    })
    expect(onGroupChange).toHaveBeenCalledWith('g1')
  })

  it('says nothing about coverage when no group is chosen', () => {
    renderBar({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    expect(screen.queryByTestId('filter-summary')).not.toBeInTheDocument()
  })

  it('hides the group control entirely without read.route_group', () => {
    perms.usePermissions.mockReturnValue({ hasPermission: () => false })
    renderBar()
    expect(screen.queryByRole('combobox', { name: 'Route Group' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB PnlEstimateFilterBar \
  >/tmp/pnl-fe-24.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-fe-24.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/pnl/components/PnlEstimateFilterBar.tsx`:

```tsx
'use client'

import { X } from 'lucide-react'
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { RouteGroupSelect } from '@/components/shared/route-group-select'
import { useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { PnlFilter, PnlRouteFilter, PnlRoutePair, usePnlStations } from '../hooks/usePnl'
import { offerableRoutes, unionRoutes } from '../utils/dailyMatrix'
import { periodBounds } from '../utils/periodBounds'
import { buildRouteLabelIndex, labelsForRoutes, routesForLabels } from '../utils/routeLabels'

export interface PnlEstimateFilterBarProps {
  filter: PnlFilter
  scope: PnlRouteFilter
  onScopeChange: (next: PnlRouteFilter) => void
  groupId: string | undefined
  onGroupChange: (id: string | undefined) => void
}

/**
 * The Estimated tab's scope, lifted out of PnlAwbDrilldown.
 *
 * It used to narrow the drilldown alone, which is why it lived inside it. It now drives the KPI
 * cards, the margin chart, the breakdowns and the drilldown together, so it sits above all of
 * them — directly under the formula panel, where the reader meets it before any number.
 *
 * Routes are named as the data stores them ('Jabo → Aceh'), unlike the Daily Report's dropdown,
 * which uses airport codes to agree with the matrix headers above it. Here the table below shows
 * raw station values, so this dropdown speaks the language of what it filters.
 */
export function PnlEstimateFilterBar({
  filter,
  scope,
  onScopeChange,
  groupId,
  onGroupChange,
}: PnlEstimateFilterBarProps) {
  const { data: stations } = usePnlStations()
  const { hasPermission } = usePermissions()
  // `enabled` is the permission gate, not a visibility toggle: with it false no request is sent,
  // so a user without read.route_group never produces a 403.
  const { data: groups } = useRouteGroups({ enabled: hasPermission('read.route_group') })

  const group = groupId ? groups?.find((g) => g.id === groupId) : undefined
  const groupRoutes: PnlRoutePair[] = (group?.routes ?? []).map((r) => ({
    origin: r.origin,
    dest: r.dest,
  }))

  const picked = scope.routes ?? []
  const vendors = scope.vendors ?? []
  const effectiveRoutes = unionRoutes(picked, groupRoutes)
  // Withheld rather than shown ticked-and-inert: unticking a route the group still supplies
  // would not widen the filter, and a control that does nothing is worse than an absent one.
  const routeIndex = buildRouteLabelIndex(offerableRoutes(stations ?? [], groupRoutes))
  const bounds = periodBounds(filter)

  // `vendors` counts here, not just routes and dates. A scope set from a Vendor Comparison cell
  // carries only a vendor, and leaving it out would hide Reset from exactly the user who most
  // needs it — while the invisible vendor narrowing survived every other edit, because each
  // handler spreads ...scope.
  const hasScope = Boolean(picked.length || scope.dateFrom || scope.dateTo || vendors.length || groupId)

  // Empty means "no filter": routeToParams drops empty fields before building the request, and an
  // empty array would otherwise be serialised as a filter that matches nothing.
  function setRoutes(labels: string[]) {
    const routes = routesForLabels(labels, routeIndex)
    onScopeChange({ ...scope, routes: routes.length ? routes : undefined })
  }

  function setDate(field: 'dateFrom' | 'dateTo', value: string) {
    onScopeChange({ ...scope, [field]: value || undefined })
  }

  // Same "empty means no filter" rule as setRoutes.
  function removeVendor(name: string) {
    const next = vendors.filter((v) => v !== name)
    onScopeChange({ ...scope, vendors: next.length ? next : undefined })
  }

  function reset() {
    onScopeChange({})
    onGroupChange(undefined)
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-end gap-3 px-4 py-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Rute
          <MultiRouteFilter
            className="w-[260px]"
            routes={routeIndex.labels}
            selected={labelsForRoutes(picked, routeIndex)}
            onChange={setRoutes}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Route Group
          <RouteGroupSelect value={groupId} onChange={onGroupChange} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Dari
          <input
            type="date"
            aria-label="Dari"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={bounds.min}
            max={scope.dateTo || bounds.max}
            value={scope.dateFrom ?? ''}
            onChange={(e) => setDate('dateFrom', e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sampai
          <input
            type="date"
            aria-label="Sampai"
            className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            min={scope.dateFrom || bounds.min}
            max={bounds.max}
            value={scope.dateTo ?? ''}
            onChange={(e) => setDate('dateTo', e.target.value)}
          />
        </label>

        {vendors.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            Vendor
            <div className="flex flex-wrap items-center gap-1 pb-0.5">
              {vendors.map((vendor) => (
                <span
                  key={vendor}
                  data-testid={`vendor-chip-${vendor}`}
                  className="flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs text-foreground"
                >
                  {vendor}
                  <button
                    type="button"
                    aria-label={`Hapus filter vendor ${vendor}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => removeVendor(vendor)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {hasScope && (
          <button
            type="button"
            className="pb-1.5 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={reset}
          >
            Reset
          </button>
        )}
      </div>

      {group && (
        <p
          data-testid="filter-summary"
          className="border-t px-4 py-2 text-xs text-muted-foreground"
        >
          Filter aktif: <span className="font-medium text-foreground">{group.name}</span> (
          {groupRoutes.length} rute) + {picked.length} rute dipilih →{' '}
          <span className="font-medium text-foreground">{effectiveRoutes.length} rute</span>
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB PnlEstimateFilterBar \
  >/tmp/pnl-fe-25.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-fe-25.log` only matters when EXIT is non-zero.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlEstimateFilterBar.tsx apps/frontend/src/features/pnl/components/PnlEstimateFilterBar.spec.tsx
git commit -m "$(cat <<'EOF'
feat(pnl): lift the estimated tab's filter above the numbers it narrows

It drove the drilldown alone, which is why it sat inside it. It now drives
the cards, the chart and the breakdowns too, so it belongs where the reader
meets it before any number rather than below all of them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `PnlAwbDrilldown` shrinks to a table

**Files:**
- Modify: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`
- Modify: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`

**Interfaces:**
- Produces: `PnlAwbDrilldownProps` becomes `{ filter: PnlFilter; route: PnlRouteFilter }` — `onRouteChange` is gone.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`:

- DELETE the entire `describe('PnlAwbDrilldown filter section', …)` block — Task 12 owns every one of those behaviours now.
- DELETE the entire `describe('PnlAwbDrilldown route filter', …)` block — same.
- DELETE the entire `describe('PnlAwbDrilldown vendor filter', …)` block — same, **except** its last two tests, which are about notes, not controls; delete those too (see below).
- DELETE the entire `describe('PnlAwbDrilldown overhang note', …)` block.

Then add a new block pinning what the component must NOT do any more:

```tsx
describe('PnlAwbDrilldown after the filter moved out', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRows([row()])
  })

  it('renders no filter controls of its own', () => {
    // They live in PnlEstimateFilterBar now, above the cards this table sits beneath. Two copies
    // would be two sources of truth for one scope.
    render(<PnlAwbDrilldown filter={filter} route={{}} />)
    expect(screen.queryByLabelText('Dari')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Sampai')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('no longer warns that its numbers overshoot the filter', () => {
    // The note explained TOs outside the filter being summed anyway, which was true while the
    // filter was an AWB-level EXISTS. It is not true now.
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }}
      />,
    )
    expect(screen.queryByText(/punya TO di luar filter/)).not.toBeInTheDocument()
  })

  it('no longer warns that it disagrees with a Vendor Comparison cell', () => {
    // It used per-AWB costs while that tab used prorated ones. Both prorate now.
    render(<PnlAwbDrilldown filter={filter} route={{ vendors: ['ESP'] }} />)
    expect(screen.queryByTestId('vendor-scope-note')).not.toBeInTheDocument()
  })

  it('still passes its route through to the query', () => {
    const route = { routes: [{ origin: 'Jabo', dest: 'Aceh' }] }
    render(<PnlAwbDrilldown filter={filter} route={route} />)
    expect(hooks.usePnlAwbDrilldown).toHaveBeenCalledWith(filter, 1, route)
  })

  it('still resets to page 1 when the route changes', () => {
    hooks.usePnlAwbDrilldown.mockReturnValue({
      data: { data: [row()], total: 60 },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    const { rerender } = render(<PnlAwbDrilldown filter={filter} route={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(screen.getByText('Page 2 / 2')).toBeInTheDocument()

    rerender(
      <PnlAwbDrilldown filter={filter} route={{ routes: [{ origin: 'Jabo', dest: 'Aceh' }] }} />,
    )
    expect(screen.getByText('Page 1 / 2')).toBeInTheDocument()
  })
})
```

Every remaining `render(<PnlAwbDrilldown … onRouteChange={jest.fn()} />)` in the file must drop that prop — TypeScript will flag each.

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB PnlAwbDrilldown \
  >/tmp/pnl-fe-26.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-fe-26.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Strip the component**

In `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`:

1. Change the props interface:

```tsx
interface PnlAwbDrilldownProps {
  filter: PnlFilter
  // Set by PnlEstimateFilterBar, which owns the controls. This component only reads it: the same
  // scope drives the KPI cards and the chart above, so a second place to edit it would be a
  // second source of truth.
  route: PnlRouteFilter
}

export function PnlAwbDrilldown({ filter, route }: PnlAwbDrilldownProps) {
```

2. Delete these, all now unused: the `usePnlStations()` call, `routeIndex`, `bounds`, `vendors`, `hasRoute`, `overhangCount`, `setRoutes`, `setDate`, `removeVendor`.

3. Delete the whole `<div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">…</div>` block (the filter row).

4. Delete the two `<p>` notes in the header — the `hasRoute && overhangCount > 0` one and the `vendors.length > 0` one (`data-testid="vendor-scope-note"`). The header keeps only its title and the AWB count.

5. Delete the now-unused imports: `X` from `lucide-react`, `MultiRouteFilter`, `periodBounds`, `buildRouteLabelIndex`/`labelsForRoutes`/`routesForLabels`, and `usePnlStations` from the hook import list. Keep `ChevronDown`, `ChevronRight`.

- [ ] **Step 4: Run to verify it passes**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB PnlAwbDrilldown \
  >/tmp/pnl-fe-27.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-fe-27.log` only matters when EXIT is non-zero.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx
git commit -m "$(cat <<'EOF'
refactor(pnl): leave the drilldown a table, and drop two stale warnings

Both notes described the AWB-grain filter: TOs outside the filter being
summed anyway, and per-AWB costs disagreeing with the Vendor Comparison's
prorated ones. Neither is true now.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: The page owns the scope

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx`

**Interfaces:**
- Consumes: everything from Tasks 9–13.
- Produces: no exports change. Internal state becomes `estimateScope: PnlRouteFilter`, `estimateGroupId: string | undefined`, `dailyGroupId: string | undefined`.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx`, extend the mocks at the top:

```tsx
jest.mock('@/features/pnl/components/PnlEstimateFilterBar', () => ({
  PnlEstimateFilterBar: ({
    scope,
    groupId,
    onScopeChange,
    onGroupChange,
  }: {
    scope: Record<string, unknown>
    groupId: string | undefined
    onScopeChange: (next: Record<string, unknown>) => void
    onGroupChange: (id: string | undefined) => void
  }) => (
    <div>
      <div data-testid="filter-bar-scope">{JSON.stringify(scope)}</div>
      <div data-testid="filter-bar-group">{String(groupId)}</div>
      <button onClick={() => onScopeChange({ vendors: ['ESP'] })}>Set vendor scope</button>
      <button onClick={() => onGroupChange('g1')}>Pick group</button>
    </div>
  ),
}))
```

and change the `PnlDailyMatrixView` mock so it echoes its group prop and can report a change:

```tsx
jest.mock('@/features/pnl/components/PnlDailyMatrixView', () => ({
  PnlDailyMatrixView: ({
    onCellClick,
    groupId,
    onGroupChange,
  }: {
    onCellClick?: (column: PnlDailyMatrixColumn, date: string) => void
    groupId: string | undefined
    onGroupChange: (id: string | undefined) => void
  }) => (
    <div>
      <button onClick={() => onCellClick?.(CELL_COLUMN, CELL_DATE)}>Fake cell</button>
      <div data-testid="daily-group">{String(groupId)}</div>
      <button onClick={() => onGroupChange('gDaily')}>Pick daily group</button>
    </div>
  ),
}))
```

The `PnlAwbDrilldown` mock drops `onRouteChange` from its signature (it already only reads `route`).

Then add a describe block:

```tsx
describe('PnlPage estimated scope', () => {
  beforeEach(() => {
    mockAuthAndPermissions(['read.pnl'])
    ;(usePnlCycles as jest.Mock).mockReturnValue({
      data: ['2026-05-1H'], isLoading: false, isError: false, refetch: jest.fn(),
    })
    ;(usePnlSummary as jest.Mock).mockReturnValue({
      data: { label: '2026-05-1H' }, isLoading: false, isError: false, refetch: jest.fn(),
    })
  })

  it('renders the filter bar above the drilldown', () => {
    render(<PnlPage />)
    const bar = screen.getByTestId('filter-bar-scope')
    const drilldown = screen.getByTestId('drilldown-route')
    // Node.compareDocumentPosition: 4 means "follows". The filter narrows the cards and the chart
    // now, so it has to be met before them, not after.
    expect(bar.compareDocumentPosition(drilldown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hands the same scope to the filter bar and the drilldown', () => {
    render(<PnlPage />)
    fireEvent.click(screen.getByText('Set vendor scope'))

    expect(screen.getByTestId('filter-bar-scope')).toHaveTextContent('ESP')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent('ESP')
  })

  it('clears the group when a cell click replaces the scope', () => {
    render(<PnlPage />)
    fireEvent.click(screen.getByText('Pick group'))
    expect(screen.getByTestId('filter-bar-group')).toHaveTextContent('g1')

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByText('Fake cell'))

    // A cell click REPLACES the scope; leaving the old group on would silently widen it.
    expect(screen.getByTestId('filter-bar-group')).toHaveTextContent('undefined')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent('Tanjung Pinang')
  })

  it('keeps routes but drops dates when the period changes', () => {
    render(<PnlPage />)
    fireEvent.click(screen.getByText('Set vendor scope'))
    expect(screen.getByTestId('filter-bar-scope')).toHaveTextContent('ESP')

    fireEvent.click(screen.getByRole('button', { name: 'Custom Range' }))

    // Only a date carries the old period; a vendor, a route and a group do not — the same reason
    // routePicks and vendorPicks survive a period change.
    expect(screen.getByTestId('filter-bar-scope')).toHaveTextContent('ESP')
  })

  it('drops a date that belonged to the old period', () => {
    render(<PnlPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByText('Fake cell'))
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent('2026-05-01')

    fireEvent.click(screen.getByRole('button', { name: 'Custom Range' }))
    expect(screen.getByTestId('drilldown-route')).not.toHaveTextContent('2026-05-01')
  })

  it('gives the two tabs their own group, so one cannot move the other', () => {
    render(<PnlPage />)
    fireEvent.click(screen.getByText('Pick group'))

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    expect(screen.getByTestId('daily-group')).toHaveTextContent('undefined')

    fireEvent.click(screen.getByText('Pick daily group'))
    expect(screen.getByTestId('daily-group')).toHaveTextContent('gDaily')

    fireEvent.click(screen.getByRole('button', { name: 'Estimated' }))
    expect(screen.getByTestId('filter-bar-group')).toHaveTextContent('g1')
  })
})
```

Reuse whatever the file's existing permission helper is called — line 156 has a shared `beforeEach` helper; match its name rather than inventing `mockAuthAndPermissions` if it differs.

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "pnl/page" \
  >/tmp/pnl-fe-28.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=1`.
Then `grep -aE 'Tests:|✕' /tmp/pnl-fe-28.log` to confirm WHICH test failed — an EXIT=1 from an
unrelated broken suite is not the red you are looking for.

- [ ] **Step 3: Rename the state and add the two group ids**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, replace:

```tsx
  const [drilldownRoute, setDrilldownRoute] = useState<PnlRouteFilter>({})
  const drilldownRef = useRef<HTMLDivElement>(null)
```

with:

```tsx
  // The Estimated tab's whole scope, not just the drilldown's. It narrows the KPI cards, the
  // margin chart, the breakdowns and the AWB table together — the filter bar below owns the
  // controls, this owns the value.
  const [estimateScope, setEstimateScope] = useState<PnlRouteFilter>({})
  const [estimateGroupId, setEstimateGroupId] = useState<string | undefined>(undefined)
  const filterBarRef = useRef<HTMLDivElement>(null)

  // The Daily Report keeps its OWN group. The two tabs are different scopes and must not drag
  // each other around; this sits beside dailyRoutes for the same reason that does.
  const [dailyGroupId, setDailyGroupId] = useState<string | undefined>(undefined)
```

- [ ] **Step 4: Narrow the period-reset effect**

Replace:

```tsx
  useEffect(() => {
    setDrilldownRoute({})
  }, [dateBasis, mode, cycle, startDate, endDate])
```

with:

```tsx
  // Only the dates carry the old period. A route, a vendor and a group do not — the same reason
  // routePicks, dailyRoutes and vendorPicks are deliberately left alone here. Dropping everything
  // used to be acceptable when this scope narrowed one table; now it would wipe the filter for
  // the whole tab every time the reader changed cycle.
  useEffect(() => {
    setEstimateScope((prev) =>
      prev.dateFrom || prev.dateTo ? { ...prev, dateFrom: undefined, dateTo: undefined } : prev,
    )
  }, [dateBasis, mode, cycle, startDate, endDate])
```

The `prev.dateFrom || prev.dateTo` guard matters: returning a fresh object every time would give `estimateScope` a new identity on every period change, invalidating ten query keys for nothing.

- [ ] **Step 5: Update `applyDrilldownRoute`**

```tsx
  // A cell click REPLACES the scope rather than adding to it, so the group goes too — leaving it
  // on would silently widen what the reader just asked to narrow.
  function applyDrilldownRoute(route: PnlRouteFilter) {
    setEstimateScope(route)
    setEstimateGroupId(undefined)
    setView('estimate')
    // Runs after the Estimated tab has mounted the filter bar. The bar, not the table: what the
    // reader needs to see is that the scope changed, which the numbers below then reflect.
    requestAnimationFrame(() => {
      filterBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
```

- [ ] **Step 6: Reorder the Estimated branch**

Replace the final `) : (` branch's contents with:

```tsx
        <>
          <PnlFormulaPanel />
          {filter && (
            <div ref={filterBarRef}>
              <PnlEstimateFilterBar
                filter={filter}
                scope={estimateScope}
                onScopeChange={setEstimateScope}
                groupId={estimateGroupId}
                onGroupChange={setEstimateGroupId}
              />
            </div>
          )}
          {summary && (
            <PnlKpiCards summary={summary} activeKpi={activeKpi} onSelect={handleKpiSelect} />
          )}
          {filter && <PnlDailyMarginChart filter={filter} scope={estimateScope} />}
          {filter && (
            <PnlBreakdownPanel filter={filter} activeKpi={activeKpi} scope={estimateScope} />
          )}
          {filter && <PnlAwbDrilldown filter={filter} route={estimateScope} />}
          {showDq ? (
            <PnlDataQuality />
          ) : (
            <div className="flex justify-center">
              <button
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setShowDq(true)}
              >
                Check data quality
              </button>
            </div>
          )}
        </>
```

- [ ] **Step 7: Pass the scope to the summary query and the chart**

Change the summary call:

```tsx
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError, refetch: refetchSummary } =
    usePnlSummary(filter, estimateScope)
```

And add the prop to `PnlDailyMarginChart` — open `apps/frontend/src/features/pnl/components/PnlDailyMarginChart.tsx`, add `scope?: PnlRouteFilter` to its props, and pass it: `usePnlDailyMargin(filter, scope)`.

- [ ] **Step 8: Wire the Daily Report's group**

```tsx
          <PnlDailyMatrixView
            filter={filter}
            picks={dailyRoutes}
            onPicksChange={setDailyRoutes}
            groupId={dailyGroupId}
            onGroupChange={setDailyGroupId}
            onCellClick={handleCellClick}
          />
```

- [ ] **Step 9: Run the page tests**

Run:

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB "pnl/page" \
  >/tmp/pnl-fe-29.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`.
Judge by the exit code only. rtk collapses jest's stdout, so an empty log with EXIT=0
is a normal pass; `tail -40 /tmp/pnl-fe-29.log` only matters when EXIT is non-zero.

- [ ] **Step 10: Type-check, and run every frontend PnL suite**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm type-check >/tmp/pnl-fe-tsc-t14.log 2>&1; echo "TSC_EXIT=$?"
```

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl \
  >/tmp/pnl-fe-task14.log 2>&1; echo "EXIT=$?"
```

Expected: `TSC_EXIT=0` and `EXIT=0`. The full repo suite runs once at Final verification.

- [ ] **Step 11: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/pnl/" apps/frontend/src/features/pnl/components/PnlDailyMarginChart.tsx
git commit -m "$(cat <<'EOF'
feat(pnl): one scope for the whole estimated tab

A clicked Daily Report cell now narrows the cards, the chart, the breakdowns
and the AWB table at once, so the headline figures finally equal the cell
that was clicked. Changing period drops only the dates: a route, a vendor
and a group carry no period, the same reason the comparison picks survive.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: The reconciliation invariants, against a real database

Unit tests assert what SQL text was sent; they cannot tell whether Postgres would accept it, and they cannot prove the numbers agree. This is the task that proves the whole spec. It replaces the three yellow notes the earlier tasks deleted.

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl-scope.integration.spec.ts`

**Interfaces:**
- Consumes: the real `PnlService` against a real `DataSource`, following the harness in `pnl-group-comparison.integration.spec.ts`.

- [ ] **Step 1: Write the integration spec**

Create `apps/backend/src/modules/pnl/pnl-scope.integration.spec.ts`. Copy the database-availability preamble from `pnl-group-comparison.integration.spec.ts` verbatim (lines 1–72: `DATABASE_URL_EXPLICIT`, `CONNECTION_URL`, `isDbReachable`, `DB_AVAILABLE`, and the fail-loudly / skip-loudly branches) — it is deliberately duplicated in every integration spec in this module rather than shared, so each file runs standalone.

Then:

```ts
describe('PnL scope reconciliation (integration)', () => {
  // <-- the copied DB_AVAILABLE guard block goes here

  const CYCLE = '2026-05-1H'
  const ROUTE = { origin: 'Jabo', dest: 'Denpasar' }

  let dataSource: DataSource
  let service: PnlService

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: CONNECTION_URL })
    await dataSource.initialize()
    service = new PnlService(dataSource)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
  })

  // Every scope is run twice — unscoped and scoped — because an invariant that only holds when
  // nothing is filtered proves nothing about the filter.
  const SCOPES: { name: string; scope: PnlRouteFilter | undefined }[] = [
    { name: 'unscoped', scope: undefined },
    { name: 'one route', scope: { routes: [ROUTE] } },
    { name: 'a date window', scope: { dateFrom: '2026-05-02', dateTo: '2026-05-08' } },
    { name: 'route and dates', scope: { routes: [ROUTE], dateFrom: '2026-05-02', dateTo: '2026-05-08' } },
  ]

  describe.each(SCOPES)('$name', ({ scope }) => {
    it('has the cost breakdown sum to the Est. Cost card', async () => {
      const [summary, totals] = await Promise.all([
        service.getSummary(CYCLE, undefined, undefined, undefined, scope),
        service.getCostTotals(CYCLE, undefined, undefined, undefined, scope),
      ])
      const breakdown = totals.smu + totals.ra + totals.sgOut + totals.sgIn
      // Floating point over thousands of rows: compare to the nearest rupiah, not bit-for-bit.
      expect(breakdown).toBeCloseTo(summary.totalCost, 0)
    })

    it('has the daily margin chart sum to the same card', async () => {
      const [summary, daily] = await Promise.all([
        service.getSummary(CYCLE, undefined, undefined, undefined, scope),
        service.getDailyMargin(CYCLE, undefined, undefined, undefined, scope),
      ])
      const revenue = daily.reduce((sum, d) => sum + d.revenue, 0)
      // The chart drops rows with no date on the active basis, so it can only ever be <=. An
      // equality here would be wrong; what matters is that it never EXCEEDS the total.
      expect(revenue).toBeLessThanOrEqual(summary.totalRevenue + 1)
    })

    it('has every drilldown row reconcile within itself', async () => {
      const { data } = await service.getAwbDrilldown(
        1, 200, CYCLE, undefined, undefined, undefined, scope,
      )
      expect(data.length).toBeGreaterThan(0)
      for (const row of data) {
        // An AWB nothing could cost has a null cost and a null GP — there is no arithmetic to
        // check on it, and asserting one would be asserting against "unknown".
        if (row.totalCost == null || row.grossProfit == null) continue
        // The defect this whole change set began with: revenue summed per TO, cost taken per
        // whole AWB, so these two differed by the out-of-scope portion of the AWB's cost.
        expect(row.totalRevenue - row.totalCost).toBeCloseTo(row.grossProfit, 0)
        const components =
          (row.costSmu ?? 0) + (row.costRa ?? 0) + (row.costSgOut ?? 0) + (row.costSgIn ?? 0)
        expect(components).toBeCloseTo(row.totalCost, 0)
      }
    })

    it('has the whole drilldown sum to the card above it', async () => {
      const summary = await service.getSummary(CYCLE, undefined, undefined, undefined, scope)
      // One page wide enough to hold the period; assert we actually got them all rather than
      // silently reconciling a prefix.
      const { data, total } = await service.getAwbDrilldown(
        1, 5000, CYCLE, undefined, undefined, undefined, scope,
      )
      expect(data.length).toBe(total)

      const revenue = data.reduce((sum, r) => sum + r.totalRevenue, 0)
      // `?? 0` is right here and not a fudge: an AWB nothing could cost contributes zero to
      // SUM(cost_to) as well, which is exactly what summary.totalCost is.
      const cost = data.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
      expect(revenue).toBeCloseTo(summary.totalRevenue, 0)
      expect(cost).toBeCloseTo(summary.totalCost, 0)
    })
  })

  it('narrows to strictly less than the unscoped period', async () => {
    // Guards against a scope clause that parses, runs, and quietly filters nothing — which every
    // invariant above would happily pass.
    const [all, scoped] = await Promise.all([
      service.getSummary(CYCLE),
      service.getSummary(CYCLE, undefined, undefined, undefined, { routes: [ROUTE] }),
    ])
    expect(scoped.totalTos).toBeGreaterThan(0)
    expect(scoped.totalTos).toBeLessThan(all.totalTos)
  })

  it('accepts a scoped query on every endpoint that takes one', async () => {
    // A smoke test for SQL validity: an ambiguous column reference in the two queries that join a
    // second table (cost-by-ra, cost-by-sg-out) would only ever surface here.
    const scope: PnlRouteFilter = { routes: [ROUTE], dateFrom: '2026-05-02' }
    await expect(
      Promise.all([
        service.getRevenueByRoute(CYCLE, undefined, undefined, undefined, scope),
        service.getProfitByRoute(CYCLE, undefined, undefined, undefined, scope),
        service.getCostByVendor(CYCLE, undefined, undefined, undefined, scope),
        service.getCostByRa(CYCLE, undefined, undefined, undefined, scope),
        service.getCostBySgOut(CYCLE, undefined, undefined, undefined, scope),
        service.getCostBySgIn(CYCLE, undefined, undefined, undefined, scope),
      ]),
    ).resolves.toBeDefined()
  })

  it('counts revenue-less TOs that the issue chain labels as a cost problem', async () => {
    const matrix = await service.getDailyMatrix(CYCLE)
    const cells = matrix.rows.flatMap((r) => r.cells).filter((c) => c != null)
    // Shape, not a magic number: this database may or may not currently hold such a TO, and a
    // test that demanded one would fail on a clean dataset for the wrong reason.
    for (const cell of cells) {
      expect(typeof cell!.revenueMissingTos).toBe('number')
      expect(cell!.revenueMissingTos).toBeGreaterThanOrEqual(0)
    }
    for (const f of matrix.footer) {
      expect(typeof f.revenueMissingTos).toBe('number')
    }
  })
})
```

Add the imports the file needs: `import 'reflect-metadata'`, `execSync`, `DataSource`, `PnlService`, and `PnlRouteFilter` from `./pnl.service`.

**If `CYCLE` has no data on this database,** run `psql "$CONNECTION_URL" -c "SELECT cycle_date, COUNT(*) FROM v_pnl_to GROUP BY 1 ORDER BY 1 DESC LIMIT 5"` and substitute a cycle that does, along with a route from `SELECT DISTINCT origin_station, dest_station FROM v_pnl_to LIMIT 20`.

- [ ] **Step 2: Run it**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB pnl-scope.integration \
  >/tmp/pnl-t15.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`. Then confirm it did not SKIP — this spec is the only proof the SQL is valid,
and a skipped file exits 0:

```bash
grep -aE 'SKIPPED|Test Suites:|Tests:' /tmp/pnl-t15.log
```

If it skipped, the database is unreachable from this shell; report that rather than accepting the
green. If `cost-by-ra` or `cost-by-sg-out` raises `column reference "vendor" is ambiguous`, that is
Task 4 Step 5's flagged risk — give `scopeSql` an optional `alias` parameter and pass `'v.'` from
those two callers.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl-scope.integration.spec.ts
git commit -m "$(cat <<'EOF'
test(pnl): prove every panel on the estimated tab reports the same numbers

Each invariant runs scoped and unscoped, because one that only holds with no
filter proves nothing about the filter, plus a narrowing check so a scope
clause that parses and filters nothing cannot pass them all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

**The controller runs this section, not a subagent** — these are the only full-suite runs in the
plan, and only one jest process may be alive at a time on this box.

- [ ] **Backend, full suite**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/backend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/pnl-final-be.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`. Then confirm the integration specs actually RAN rather than skipping — a
skipped file reads as a pass:

```bash
grep -aE 'SKIPPED|Test Suites:' /tmp/pnl-final-be.log
```

`pnl-scope.integration` and `pnl-group-comparison.integration` must not appear under SKIPPED; the
database is reachable on this box, so a skip means the spec's own guard misfired.

- [ ] **Frontend, types and full suite**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && pnpm type-check >/tmp/pnl-final-tsc.log 2>&1; echo "TSC_EXIT=$?"
```

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend && \
  pnpm exec jest --maxWorkers=1 --workerIdleMemoryLimit=512MB \
  >/tmp/pnl-final-fe.log 2>&1; echo "EXIT=$?"
```

Expected: `TSC_EXIT=0` and `EXIT=0`.

- [ ] **Lint both**

```bash
cd /home/faris/code/esp/esp-dashboard && pnpm lint >/tmp/pnl-final-lint.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`, or only warnings that `git stash && pnpm lint` shows were already there.

- [ ] **Manual check in the running app**

Start with `pnpm dev`, open `/pnl`, and confirm by eye:
1. The filter row sits directly under *How is estimated P&L calculated?*, above the KPI cards.
2. Picking a route changes the KPI cards, the chart, and the AWB table together.
3. Picking a Route Group removes its member routes from the Rute dropdown and shows the "Filter aktif" line.
4. Clicking a Daily Report cell lands on Estimated with the cards showing that cell's numbers.
5. On Daily Report, a Revenue cell whose TOs have no revenue is yellow, and its tooltip says "N TO tanpa revenue".
6. A user without `read.route_group` sees no Route Group control on either tab (check the Network tab: no request to `/route-groups`).

---

## Notes for the implementer

**The one risk worth naming.** `scopeSql` emits unqualified column names (`origin_station`, `vendor`). Eight of the ten queries select from `v_pnl_to` alone, where that is unambiguous. Two — `getCostByRa` and `getCostBySgOut` — join a second table. Those joined tables (`air_shipments_smu_rate_cgk_spx`, `air_shipments_smu`) do not carry `origin_station`, `dest_station` or `vendor`, so the names still resolve. Task 15 is what proves it; if it does not, add an `alias` parameter to `scopeSql` rather than qualifying the names at each call site.

**Task 2 and Task 6 each stand alone.** Task 2 fixes a defect already on `main` and needs nothing else from this plan. Task 6 + Task 7 restore the yellow Revenue cells and need nothing else either. If the branch has to be cut short, those are the two halves worth shipping first.

**What deliberately does not follow the filter.** `PnlDataQuality` stays global. A TO with `station_mapping_missing` has no route, so any route filter discards it — and that panel exists precisely to find it. `/pnl/data-quality` and `/pnl/data-quality/summary` take no scope params.
