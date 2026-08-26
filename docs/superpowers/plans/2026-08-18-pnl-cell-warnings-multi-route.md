# PnL Cell Warnings, Multi-Route Filter & Route Columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn on the P&L cells whose numbers are unreliable, let the AWB drilldown filter on many routes at once, make Group Comparison cells jump into that drilldown, and let bare routes be compared alongside route groups.

**Architecture:** Backend gains two small pure utility modules (issue counting, param parsing) so `pnl.service.ts` — already 1101 lines — grows only by the query bodies that must live next to their siblings. Both `daily-matrix` and `group-comparison` get one extra grouped query returning per-issue AWB counts for body *and* footer via `GROUPING SETS`. On the frontend, one shared `MultiRouteFilter` (lifted out of the SLA feature) drives every route picker, and one `CellWarning` shape drives every yellow cell so the two tables cannot drift.

**Tech Stack:** NestJS 10 + TypeORM (raw SQL against the `v_pnl_to` view), PostgreSQL, Next.js 14 + React 18, TanStack Query v5, Tailwind, Jest + Testing Library, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-18-pnl-cell-warnings-multi-route-design.md`

## Global Constraints

- Branch: `feature/pnl-cell-warnings-multi-route`, already created off `development`. Do not switch branches.
- **Every Jest run on this machine needs the heap bump AND `--runInBand`, focused runs included.** Bare `pnpm test` spawns ~15 workers and gets OOM-killed; bare `--runInBand` without the heap bump core-dumps.
  - Backend: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`
  - Frontend: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`
  - Full suite: the same command with no pattern.
- Type gate is `pnpm exec tsc --noEmit` in the app directory, **not** `next lint`. `next lint` has a pre-existing error in `src/features/roles/components/role-permissions-panel.tsx` (`no-assign-module-variable`) that is not ours — leave it alone and never use lint as a gate.
- An `rtk` hook rewrites Jest output down to `PASS (n) FAIL (n)`. When a count looks wrong, read the raw output from the newest file in `~/.local/share/rtk/tee/`.
- Local database for the integration spec: `postgres://postgres:postgres@localhost:5432/app`.
- Comments explain *why*, never *what*. Match the density and tone of the surrounding P&L code, which is comment-heavy at decision points and bare elsewhere.
- All user-facing strings in these components are Indonesian, except issue labels from `ISSUE_LABELS`, which stay English because they name source-sheet columns.
- Route label forms are fixed and must not be unified:
  - dropdown: `Jabo → Denpasar` (raw origin, raw dest) — inside `MultiRouteFilter` only
  - display: `CGK → Denpasar` (`originLabel`, raw dest) — matrix headers, `RoutePicker`, overlap warnings
- `dest_station` is already a city name. There is no destination code mapping and none is to be added.
- Commit after every task with the message given in its final step.

---

## File Structure

**Backend — create**
- `apps/backend/src/modules/pnl/pnl-cell-issues.util.ts` — issue severity rank + shaping raw issue-count rows into `PnlCellIssue[]`. Pure; no DB.
- `apps/backend/src/modules/pnl/pnl-cell-issues.util.spec.ts`
- `apps/backend/src/modules/pnl/pnl-columns.util.ts` — parsing/validating the `columns` and `routes` query params. Pure; no DB.
- `apps/backend/src/modules/pnl/pnl-columns.util.spec.ts`

**Backend — modify**
- `apps/backend/src/modules/pnl/pnl.service.ts` — `getDailyMatrix`, `getAwbDrilldown`, `getGroupComparison`
- `apps/backend/src/modules/pnl/pnl.controller.ts` — `routes` and `columns` params
- `apps/backend/src/modules/pnl/pnl.service.spec.ts`, `pnl.controller.spec.ts`, `pnl-group-comparison.integration.spec.ts`

**Frontend — create**
- `apps/frontend/src/components/shared/multi-route-filter.tsx` (moved from `features/air-shipments/components/MultiRouteFilter.tsx`)
- `apps/frontend/src/components/shared/multi-route-filter.spec.tsx`
- `apps/frontend/src/features/pnl/utils/routeLabels.ts` + `.spec.ts`
- `apps/frontend/src/features/pnl/utils/cellWarning.ts` + `.spec.ts`

**Frontend — modify**
- `apps/frontend/src/features/air-shipments/components/SlaPage.tsx` (import path only)
- `apps/frontend/src/features/pnl/hooks/usePnl.ts` + `.spec.ts`
- `apps/frontend/src/features/pnl/utils/issueLabels.ts` + `.spec.ts`
- `apps/frontend/src/features/pnl/utils/dailyMatrix.ts` + `.spec.ts`
- `apps/frontend/src/features/pnl/utils/groupComparison.ts` + `.spec.ts`
- `apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx` + `.spec.tsx`
- `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx` + `.spec.tsx`
- `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx` + `.spec.tsx`
- `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx` + `.spec.tsx`
- `apps/frontend/src/app/(dashboard)/pnl/page.tsx` + `.spec.tsx`

---

## Task 1: Backend issue-count utility

Extracts the issue severity rank out of `pnl.service.ts` and adds the shaping helpers the next two tasks need. No behaviour change.

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl-cell-issues.util.ts`
- Create: `apps/backend/src/modules/pnl/pnl-cell-issues.util.spec.ts`
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` (delete the `ISSUE_RANK` / `ISSUE_BY_RANK` block near line 94, import them instead)

**Interfaces:**
- Produces: `PnlCellIssue { issue: string; awbs: number }`; `ISSUE_RANK: Record<string, number>`; `ISSUE_BY_RANK: Record<number, string>`; `issueRank(issue: string): number`; `sortIssues(issues: PnlCellIssue[]): PnlCellIssue[]`; `indexIssueRows(rows: Record<string, unknown>[], keyOf: (row: Record<string, unknown>) => string | null): Map<string, PnlCellIssue[]>`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/pnl/pnl-cell-issues.util.spec.ts`:

```ts
import { indexIssueRows, issueRank, sortIssues } from './pnl-cell-issues.util'

describe('issueRank', () => {
  it('ranks the root cause ahead of the symptom it produces', () => {
    // A blank station is what breaks the SG Incoming join, so it must sort first.
    expect(issueRank('station_mapping_missing')).toBeLessThan(issueRank('sg_in_rate_missing'))
  })

  it('sinks an unknown issue below every known one', () => {
    expect(issueRank('something_new')).toBeGreaterThan(issueRank('sg_in_rate_missing'))
  })
})

describe('sortIssues', () => {
  it('orders by severity, not by count or arrival order', () => {
    const sorted = sortIssues([
      { issue: 'sg_in_rate_missing', awbs: 9 },
      { issue: 'no_booking', awbs: 1 },
      { issue: 'ra_rate_missing', awbs: 4 },
    ])
    expect(sorted.map((i) => i.issue)).toEqual([
      'no_booking',
      'ra_rate_missing',
      'sg_in_rate_missing',
    ])
  })

  it('breaks a tie between two unknown issues by name so the order is stable', () => {
    const sorted = sortIssues([
      { issue: 'zeta_thing', awbs: 1 },
      { issue: 'alpha_thing', awbs: 1 },
    ])
    expect(sorted.map((i) => i.issue)).toEqual(['alpha_thing', 'zeta_thing'])
  })

  it('does not mutate the input array', () => {
    const input = [
      { issue: 'sg_in_rate_missing', awbs: 1 },
      { issue: 'no_booking', awbs: 1 },
    ]
    sortIssues(input)
    expect(input[0].issue).toBe('sg_in_rate_missing')
  })
})

describe('indexIssueRows', () => {
  const rows = [
    { k: 'a', issue: 'sg_in_rate_missing', awbs: '2' },
    { k: 'a', issue: 'no_booking', awbs: '1' },
    { k: 'b', issue: 'no_booking', awbs: '5' },
  ]

  it('groups rows by key with counts coerced from the driver strings', () => {
    const index = indexIssueRows(rows, (r) => r.k as string)
    expect(index.get('a')).toEqual([
      { issue: 'no_booking', awbs: 1 },
      { issue: 'sg_in_rate_missing', awbs: 2 },
    ])
    expect(index.get('b')).toEqual([{ issue: 'no_booking', awbs: 5 }])
  })

  it('drops a row whose key resolves to null rather than bucketing it under a fake key', () => {
    // The footer rows of a GROUPING SETS query carry a NULL date; callers key those separately,
    // and a row that belongs to neither bucket must vanish instead of corrupting one.
    const index = indexIssueRows(rows, (r) => (r.k === 'b' ? null : (r.k as string)))
    expect(index.has('b')).toBe(false)
    expect(index.get('a')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-cell-issues --runInBand`
Expected: FAIL — `Cannot find module './pnl-cell-issues.util'`

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/modules/pnl/pnl-cell-issues.util.ts`:

```ts
/**
 * Per-cell data quality counts, shared by the daily matrix and the group comparison so a yellow
 * cell means exactly the same thing in both. Pure: the SQL that produces these rows lives beside
 * the query it belongs to in pnl.service.ts.
 */

// One issue type and how many distinct AWBs carry it inside one cell.
export interface PnlCellIssue {
  issue: string
  awbs: number
}

// Severity order for the canonical v_pnl_to.issue values (root cause first). Shared by the
// per-AWB drilldown (which aggregates the most-severe issue across an AWB's TOs) and by the
// per-cell warnings. This order must match the CASE chain in the v_pnl_to definition.
export const ISSUE_RANK: Record<string, number> = {
  no_booking: 1,
  smu_rate_missing: 2,
  ra_rate_missing: 3,
  sgout_name_missing: 4,
  revenue_missing: 5,
  // A blank station breaks the SG Incoming join, so it ranks as the cause of the rate miss below it.
  station_mapping_missing: 6,
  sg_in_rate_missing: 7,
}

export const ISSUE_BY_RANK: Record<number, string> = Object.fromEntries(
  Object.entries(ISSUE_RANK).map(([k, v]) => [v, k]),
)

// An issue the view starts emitting before this map is updated must still be visible, so it sorts
// last rather than being dropped or silently ranked first.
export function issueRank(issue: string): number {
  return ISSUE_RANK[issue] ?? Number.MAX_SAFE_INTEGER
}

// Copies rather than sorts in place: callers pass arrays they got from a Map and reuse them.
export function sortIssues(issues: PnlCellIssue[]): PnlCellIssue[] {
  return [...issues].sort(
    (a, b) => issueRank(a.issue) - issueRank(b.issue) || a.issue.localeCompare(b.issue),
  )
}

// Buckets raw issue-count rows by a caller-chosen key. A null key means "this row is not mine" —
// the GROUPING SETS queries return body and footer rows together, and each caller takes one half.
export function indexIssueRows(
  rows: Record<string, unknown>[],
  keyOf: (row: Record<string, unknown>) => string | null,
): Map<string, PnlCellIssue[]> {
  const index = new Map<string, PnlCellIssue[]>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    const bucket = index.get(key)
    const entry = { issue: row.issue as string, awbs: Number(row.awbs) }
    if (bucket) bucket.push(entry)
    else index.set(key, [entry])
  }
  for (const [key, bucket] of index) index.set(key, sortIssues(bucket))
  return index
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-cell-issues --runInBand`
Expected: PASS, 6 tests

- [ ] **Step 5: Delete the duplicated rank block from the service**

In `apps/backend/src/modules/pnl/pnl.service.ts`, delete this block (around line 94):

```ts
// Severity order for the canonical v_pnl_to.issue values (root cause first). Shared by the
// per-AWB drilldown (which aggregates the most-severe issue across an AWB's TOs).
const ISSUE_RANK: Record<string, number> = {
  no_booking: 1,
  smu_rate_missing: 2,
  ra_rate_missing: 3,
  sgout_name_missing: 4,
  revenue_missing: 5,
  // A blank station breaks the SG Incoming join, so it ranks as the cause of the rate miss below
  // it. This order must match the CASE chain in the v_pnl_to definition.
  station_mapping_missing: 6,
  sg_in_rate_missing: 7,
}
const ISSUE_BY_RANK: Record<number, string> = Object.fromEntries(
  Object.entries(ISSUE_RANK).map(([k, v]) => [v, k]),
)
```

and add to the imports at the top of the file:

```ts
import { ISSUE_BY_RANK, PnlCellIssue } from './pnl-cell-issues.util'
```

`ISSUE_RANK` itself is no longer referenced by the service — only `ISSUE_BY_RANK` is, when mapping `issue_rank` back to a name. Leave `PnlCellIssue` imported now; Task 2 uses it.

- [ ] **Step 6: Verify nothing regressed**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service --runInBand`
Expected: PASS — the existing `issue_rank 6 → station_mapping_missing` assertions still hold.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl-cell-issues.util.ts apps/backend/src/modules/pnl/pnl-cell-issues.util.spec.ts apps/backend/src/modules/pnl/pnl.service.ts
git commit -m "refactor(pnl): extract issue severity rank into a shared util"
```

---

## Task 2: Daily matrix issue counts

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` — `PnlDailyMatrixCell`, `PnlDailyMatrixFooter`, `getDailyMatrix` (around line 880)
- Modify: `apps/backend/src/modules/pnl/pnl.service.spec.ts` — `describe('getDailyMatrix')` around line 484

**Interfaces:**
- Consumes: `PnlCellIssue`, `indexIssueRows` from Task 1
- Produces: `PnlDailyMatrixCell.issues: PnlCellIssue[]`, `PnlDailyMatrixFooter.issues: PnlCellIssue[]`

- [ ] **Step 1: Write the failing tests**

Add inside `describe('getDailyMatrix', ...)` in `apps/backend/src/modules/pnl/pnl.service.spec.ts`. The existing tests in that block mock `getStations` and the fact query; there is now a **third** query, so every existing `mockResolvedValueOnce` chain in this describe needs one more `.mockResolvedValueOnce([])` appended. Do that first, then add:

```ts
    it('attaches per-issue AWB counts to the cell and the footer they belong to', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Aceh' }])
        .mockResolvedValueOnce([
          {
            d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh',
            revenue: '1000', margin: '100', weight: '10', incomplete_tos: '2',
          },
        ])
        .mockResolvedValueOnce([
          // Body rows carry a date; the GROUPING SETS footer rows carry d = null.
          { d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh', issue: 'sg_in_rate_missing', awbs: '1' },
          { d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh', issue: 'no_booking', awbs: '3' },
          { d: null, origin_station: 'Jabo', dest_station: 'Aceh', issue: 'no_booking', awbs: '4' },
        ])

      const result = await service.getDailyMatrix('2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([
        { issue: 'no_booking', awbs: 3 },
        { issue: 'sg_in_rate_missing', awbs: 1 },
      ])
      // The footer is NOT the sum of the body: one AWB shipping on two days is one distinct AWB
      // for the period, so the period figure comes from its own grouping set.
      expect(result.footer[0].issues).toEqual([{ issue: 'no_booking', awbs: 4 }])
    })

    it('gives a clean cell and a clean footer an empty list rather than null', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Aceh' }])
        .mockResolvedValueOnce([
          {
            d: '2026-05-01', origin_station: 'Jabo', dest_station: 'Aceh',
            revenue: '1000', margin: '100', weight: '10', incomplete_tos: '0',
          },
        ])
        .mockResolvedValueOnce([])

      const result = await service.getDailyMatrix('2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([])
      expect(result.footer[0].issues).toEqual([])
    })

    it('counts distinct AWBs and asks only for rows that actually have an issue', async () => {
      dataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.getDailyMatrix('2026-05-1H')

      const issuesSql = (dataSource.query.mock.calls[2][0] as string).replace(/\s+/g, ' ')
      expect(issuesSql).toContain('COUNT(DISTINCT awb)::int AS awbs')
      expect(issuesSql).toContain('issue IS NOT NULL')
      expect(issuesSql).toContain(
        'GROUP BY GROUPING SETS ((d, origin_station, dest_station, issue), (origin_station, dest_station, issue))',
      )
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service -t "getDailyMatrix" --runInBand`
Expected: FAIL — `issues` is undefined on the cell.

- [ ] **Step 3: Add the fields to the interfaces**

In `apps/backend/src/modules/pnl/pnl.service.ts`, add `issues` to both shapes:

```ts
export interface PnlDailyMatrixCell {
  revenue: number
  margin: number
  weight: number
  incompleteTos: number
  issues: PnlCellIssue[] // empty = clean; never null, so the frontend has one shape to read
}
```

```ts
export interface PnlDailyMatrixFooter {
  totalRevenue: number
  totalMargin: number
  totalWeight: number
  avgRevenuePerDay: number
  avgMarginPerDay: number
  marginPct: number | null
  spacePerKg: number | null
  incompleteTos: number
  // Distinct AWBs for the whole period, from its own grouping set — NOT the sum of the day cells,
  // which would count an AWB once per day it shipped.
  issues: PnlCellIssue[]
}
```

- [ ] **Step 4: Add the query and merge it in**

In `getDailyMatrix`, extend the `Promise.all` to three entries and merge the result. Add the third query after the existing fact query inside the same `Promise.all`:

```ts
      this.dataSource.query(
        `
        SELECT d, origin_station, dest_station, issue, COUNT(DISTINCT awb)::int AS awbs
        FROM (
          SELECT
            TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD') AS d,
            origin_station, dest_station, issue, awb
          FROM v_pnl_to
          WHERE ${where}
            AND ${dateCol} IS NOT NULL
            AND issue IS NOT NULL
        ) s
        GROUP BY GROUPING SETS ((d, origin_station, dest_station, issue), (origin_station, dest_station, issue))
        `,
        params,
      ),
```

Change the destructuring to `const [columns, factRows, issueRows] = await Promise.all([...])`.

Then, after `const columnIndex = new Map(...)` and before the fact loop, build the two indexes:

```ts
    // The issues query is the fact query plus `issue IS NOT NULL`, so its grouping set is a subset:
    // an issue can never land on a (date, route) pair that produced no cell.
    const cellIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? null : `${r.d}|${r.origin_station}|${r.dest_station}`,
    )
    const columnIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? `${r.origin_station}|${r.dest_station}` : null,
    )
```

In the fact loop, add `issues` to the cell:

```ts
      rows[ri].cells[ci] = {
        revenue: Number(fact.revenue),
        margin: Number(fact.margin),
        weight: Number(fact.weight),
        incompleteTos: Number(fact.incomplete_tos),
        issues: cellIssues.get(`${fact.d}|${fact.origin_station}|${fact.dest_station}`) ?? [],
      }
```

In the footer builder, replace `return { ... }` with the same object plus:

```ts
        issues: columnIssues.get(`${columns[ci].origin}|${columns[ci].dest}`) ?? [],
```

Change the footer callback signature from `columns.map((_, ci) =>` to `columns.map((_column, ci) =>` only if the linter complains about the unused first argument; otherwise leave it.

Add `indexIssueRows` to the Task 1 import line:

```ts
import { indexIssueRows, ISSUE_BY_RANK, PnlCellIssue } from './pnl-cell-issues.util'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service -t "getDailyMatrix" --runInBand`
Expected: PASS — all pre-existing `getDailyMatrix` tests plus the three new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): return per-issue AWB counts with the daily matrix"
```

---

## Task 3: Backend param-parsing utility

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl-columns.util.ts`
- Create: `apps/backend/src/modules/pnl/pnl-columns.util.spec.ts`

**Interfaces:**
- Produces: `RoutePair { origin: string; dest: string }`; `ColumnPick = { kind: 'group'; id: string } | { kind: 'route'; origin: string; dest: string }`; `parseRoutePairs(raw?: string): RoutePair[]`; `parseColumnPicks(raw?: string): ColumnPick[]`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/pnl/pnl-columns.util.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import { parseColumnPicks, parseRoutePairs } from './pnl-columns.util'

const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'

describe('parseRoutePairs', () => {
  it('splits comma-separated origin|dest pairs and keeps spaces inside a station name', () => {
    expect(parseRoutePairs('Jabo|Denpasar, Surabaya|Tanjung Pinang')).toEqual([
      { origin: 'Jabo', dest: 'Denpasar' },
      { origin: 'Surabaya', dest: 'Tanjung Pinang' },
    ])
  })

  it('returns nothing for an absent or empty param', () => {
    expect(parseRoutePairs(undefined)).toEqual([])
    expect(parseRoutePairs('')).toEqual([])
    expect(parseRoutePairs('  ,  ')).toEqual([])
  })

  it('drops a duplicate pair so it cannot be counted twice', () => {
    expect(parseRoutePairs('Jabo|Aceh,Jabo|Aceh')).toEqual([{ origin: 'Jabo', dest: 'Aceh' }])
  })

  it.each(['Jabo', 'Jabo|', '|Aceh', 'Jabo|Aceh|Extra'])(
    'rejects the malformed pair %p rather than filtering on a half-empty station',
    (raw) => {
      expect(() => parseRoutePairs(raw)).toThrow(BadRequestException)
    },
  )
})

describe('parseColumnPicks', () => {
  it('keeps groups and routes in the order they were picked', () => {
    expect(parseColumnPicks(`g:${G1},r:Jabo|Denpasar,g:${G2}`)).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
      { kind: 'group', id: G2 },
    ])
  })

  it('drops a repeated pick, keeping its first position', () => {
    // A repeat would otherwise overwrite the earlier column in the index built from these picks,
    // leaving that column permanently null.
    expect(parseColumnPicks(`g:${G1},r:Jabo|Aceh,g:${G1}`)).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'route', origin: 'Jabo', dest: 'Aceh' },
    ])
  })

  it('returns nothing for an absent or empty param', () => {
    expect(parseColumnPicks(undefined)).toEqual([])
    expect(parseColumnPicks('')).toEqual([])
  })

  it('rejects a group id that is not a uuid', () => {
    expect(() => parseColumnPicks('g:not-a-uuid')).toThrow(BadRequestException)
  })

  it('rejects a descriptor with no recognised prefix', () => {
    expect(() => parseColumnPicks(`${G1}`)).toThrow(BadRequestException)
    expect(() => parseColumnPicks('x:Jabo|Aceh')).toThrow(BadRequestException)
  })

  it('rejects a malformed route descriptor', () => {
    expect(() => parseColumnPicks('r:Jabo')).toThrow(BadRequestException)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-columns --runInBand`
Expected: FAIL — `Cannot find module './pnl-columns.util'`

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/modules/pnl/pnl-columns.util.ts`:

```ts
import { BadRequestException } from '@nestjs/common'

/**
 * Parsing for the two P&L query params that carry a list: `routes` on the AWB drilldown and
 * `columns` on the group comparison. Both reject malformed input loudly — a silently dropped
 * route reads to the user as "nothing flew here", which is indistinguishable from a real answer.
 */

export interface RoutePair {
  origin: string
  dest: string
}

// One comparison column: either a saved route group, or a single ad-hoc route the user picked.
export type ColumnPick =
  | { kind: 'group'; id: string }
  | { kind: 'route'; origin: string; dest: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Station names contain spaces ('Tanjung Pinang') but never '|' or ',', which is what makes this
// flat encoding safe without escaping.
function parsePair(raw: string): RoutePair {
  const parts = raw.split('|')
  const [origin, dest] = parts.map((p) => p.trim())
  if (parts.length !== 2 || !origin || !dest) {
    throw new BadRequestException(`Invalid route pair: ${raw}`)
  }
  return { origin, dest }
}

function splitList(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseRoutePairs(raw?: string): RoutePair[] {
  const seen = new Set<string>()
  const pairs: RoutePair[] = []
  for (const item of splitList(raw)) {
    const pair = parsePair(item)
    const key = `${pair.origin}|${pair.dest}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push(pair)
  }
  return pairs
}

export function parseColumnPicks(raw?: string): ColumnPick[] {
  const seen = new Set<string>()
  const picks: ColumnPick[] = []
  for (const item of splitList(raw)) {
    let pick: ColumnPick
    if (item.startsWith('g:')) {
      const id = item.slice(2)
      if (!UUID_RE.test(id)) throw new BadRequestException(`Invalid group id: ${id}`)
      pick = { kind: 'group', id }
    } else if (item.startsWith('r:')) {
      pick = { kind: 'route', ...parsePair(item.slice(2)) }
    } else {
      throw new BadRequestException(`Invalid column descriptor: ${item}`)
    }
    const key = pick.kind === 'group' ? `g:${pick.id}` : `r:${pick.origin}|${pick.dest}`
    if (seen.has(key)) continue
    seen.add(key)
    picks.push(pick)
  }
  return picks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-columns --runInBand`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl-columns.util.ts apps/backend/src/modules/pnl/pnl-columns.util.spec.ts
git commit -m "feat(pnl): parse the routes and columns list params"
```

---

## Task 4: AWB drilldown multi-route filter (backend)

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` — `PnlRouteFilter` (around line 60), `getAwbDrilldown` (around line 356)
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts` — `getAwbDrilldown`
- Modify: `apps/backend/src/modules/pnl/pnl.service.spec.ts` — `describe('getAwbDrilldown')`
- Modify: `apps/backend/src/modules/pnl/pnl.controller.spec.ts`

**Interfaces:**
- Consumes: `RoutePair`, `parseRoutePairs` from Task 3
- Produces: `PnlRouteFilter { routes?: RoutePair[]; dateFrom?: string; dateTo?: string }`; HTTP param `routes=Jabo|Denpasar,Jabo|Aceh`

- [ ] **Step 1: Write the failing tests**

In `apps/backend/src/modules/pnl/pnl.service.spec.ts`, find the existing route-filter tests inside `describe('getAwbDrilldown')` that pass `{ origin: ..., dest: ... }` and rewrite them to the new shape, then add:

```ts
    it('matches any of the selected route pairs with a single UNNEST condition', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [
          { origin: 'Jabo', dest: 'Denpasar' },
          { origin: 'Surabaya', dest: 'Pontianak' },
        ],
      })

      const [sql, params] = dataSource.query.mock.calls[0]
      const normalized = (sql as string).replace(/\s+/g, ' ')
      expect(normalized).toContain(
        '(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST($2::text[], $3::text[]))',
      )
      // Two parallel arrays, not an interleaved list: a flattened list would silently pair
      // Denpasar with Surabaya.
      expect(params).toEqual([
        '2026-04-2H',
        ['Jabo', 'Surabaya'],
        ['Denpasar', 'Pontianak'],
        50,
        0,
      ])
    })

    it('still narrows AWBs by EXISTS so cost stays whole-AWB', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      })

      const normalized = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      expect(normalized).toContain('AND EXISTS ( SELECT 1 FROM v_pnl_to m WHERE m.awb = v.awb')
    })

    it('emits no route condition at all when no routes are selected', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [],
      })

      expect(dataSource.query.mock.calls[0][0]).not.toContain('EXISTS')
      expect(dataSource.query.mock.calls[0][1]).toEqual(['2026-04-2H', 50, 0])
    })

    it('combines routes with the date window in one EXISTS', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-04-2H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
        dateFrom: '2026-04-20',
        dateTo: '2026-04-20',
      })

      const [, params] = dataSource.query.mock.calls[0]
      expect(params).toEqual([
        '2026-04-2H',
        ['Jabo'],
        ['Aceh'],
        '2026-04-20',
        '2026-04-20',
        50,
        0,
      ])
    })
```

In `apps/backend/src/modules/pnl/pnl.controller.spec.ts` there are two existing tests to rewrite —
`'getAwbDrilldown forwards the route query params as one object'` (line 81) and
`'getAwbDrilldown passes undefined route fields through untouched'` (line 93). They pass `origin`
and `dest` positionally; replace both with:

```ts
  it('getAwbDrilldown parses the routes param into pairs', async () => {
    await controller.getAwbDrilldown(
      1, 50, '2026-04-2H', undefined, undefined, undefined,
      'Jabo|Denpasar,Surabaya|Pontianak', '2026-04-20', '2026-04-21',
    )

    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1, 50, '2026-04-2H', undefined, undefined, undefined,
      {
        routes: [
          { origin: 'Jabo', dest: 'Denpasar' },
          { origin: 'Surabaya', dest: 'Pontianak' },
        ],
        dateFrom: '2026-04-20',
        dateTo: '2026-04-21',
      },
    )
  })

  it('getAwbDrilldown sends an empty route list when the param is absent', async () => {
    await controller.getAwbDrilldown(1, 50, '2026-04-2H')

    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1, 50, '2026-04-2H', undefined, undefined, undefined,
      { routes: [], dateFrom: undefined, dateTo: undefined },
    )
  })
```

The spec builds the controller through `Test.createTestingModule` with `mockService` and
`ALLOW_ALL_GUARD`; use that existing `controller` and `mockService`, do not construct a new one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service -t "getAwbDrilldown" --runInBand`
Expected: FAIL — the SQL still contains `m.origin_station = $2`.

- [ ] **Step 3: Change the filter interface**

In `apps/backend/src/modules/pnl/pnl.service.ts`, replace the `PnlRouteFilter` interface:

```ts
// Narrows the AWB drilldown only. Empty fields are omitted from the request entirely.
export interface PnlRouteFilter {
  routes?: RoutePair[]
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
}
```

and add to the imports:

```ts
import { RoutePair } from './pnl-columns.util'
```

- [ ] **Step 4: Change the route condition**

In `getAwbDrilldown`, replace these two lines:

```ts
    if (route?.origin) routeConds.push(`m.origin_station = ${bind(route.origin)}`)
    if (route?.dest) routeConds.push(`m.dest_station = ${bind(route.dest)}`)
```

with:

```ts
    // Two parallel arrays rather than one interleaved list: UNNEST zips them, so the pairs stay
    // pairs. A flattened list would match any origin against any destination.
    if (route?.routes?.length) {
      const origins = bind(route.routes.map((r) => r.origin))
      const dests = bind(route.routes.map((r) => r.dest))
      routeConds.push(
        `(m.origin_station, m.dest_station) IN (SELECT * FROM UNNEST(${origins}::text[], ${dests}::text[]))`,
      )
    }
```

Nothing else in the method changes: `bind` already appends to `routeParams` and numbers the placeholder, and the surrounding `EXISTS` wrapper is untouched.

- [ ] **Step 5: Change the controller**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, replace the `origin` and `dest` params of `getAwbDrilldown` with a single `routes` param:

```ts
  @Get('awb-drilldown')
  getAwbDrilldown(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
    @Query('routes') routes?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.pnlService.getAwbDrilldown(page, limit, cycle, start, end, basis, {
      routes: parseRoutePairs(routes),
      dateFrom,
      dateTo,
    })
  }
```

and add the import:

```ts
import { parseRoutePairs } from './pnl-columns.util'
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "pnl.service|pnl.controller" --runInBand`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.controller.ts apps/backend/src/modules/pnl/pnl.service.spec.ts apps/backend/src/modules/pnl/pnl.controller.spec.ts
git commit -m "feat(pnl): filter the AWB drilldown on many routes at once"
```

---

## Task 5: Group comparison columns — groups + bare routes + issues (backend)

The largest backend task: the fact query stops joining `route_group_routes` directly and joins a
per-column route list instead, which is what lets a group column and a bare-route column share one
code path.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` — `PnlGroupComparisonColumn`, `PnlGroupComparisonCell`, `PnlGroupComparisonFooter`, `getGroupComparison` (around line 967); delete the now-unused `UUID_RE` at line 247
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts` — `getGroupComparison`
- Modify: `apps/backend/src/modules/pnl/pnl.service.spec.ts` — `describe('getGroupComparison')` around line 627
- Modify: `apps/backend/src/modules/pnl/pnl.controller.spec.ts` — the three `groupIds` tests around line 103
- Modify: `apps/backend/src/modules/pnl/pnl-group-comparison.integration.spec.ts`

**Interfaces:**
- Consumes: `ColumnPick`, `parseColumnPicks` (Task 3); `PnlCellIssue`, `indexIssueRows` (Task 1)
- Produces: `getGroupComparison(picks: ColumnPick[], cyclePeriod?, startDate?, endDate?, basis?)`; `PnlGroupComparisonColumn { id: string; name: string; routeCount: number; kind: 'group' | 'route'; routes: { origin: string; originLabel: string; dest: string }[] }`; `PnlGroupComparisonCell.issues: PnlCellIssue[]`; `PnlGroupComparisonFooter.issues: PnlCellIssue[]`; HTTP param `columns=g:<uuid>,r:Jabo|Denpasar`

- [ ] **Step 1: Write the failing tests**

In `apps/backend/src/modules/pnl/pnl.service.spec.ts`, rewrite `describe('getGroupComparison')`. The
existing helpers change shape: the fact rows are keyed by `col_idx` rather than `gid`, there is a
third query for issues, and the service is called with `ColumnPick[]` rather than id strings.
Replace the `mockQueries` and `fact` helpers with:

```ts
    // Query order: group routes, facts, issues. The first is skipped when no group is picked.
    function mockQueries(
      groupRoutes: Record<string, string>[],
      facts: Record<string, string>[],
      issues: Record<string, unknown>[] = [],
    ) {
      dataSource.query
        .mockResolvedValueOnce(groupRoutes)
        .mockResolvedValueOnce(facts)
        .mockResolvedValueOnce(issues)
    }

    const fact = (over: Partial<Record<string, string>>) => ({
      d: '2026-05-01',
      col_idx: '0',
      revenue: '0',
      cost: '0',
      cost_smu: '0',
      cost_ra: '0',
      cost_sg_out: '0',
      cost_sg_in: '0',
      incomplete_tos: '0',
      ...over,
    })

    const groupRoute = (over: Partial<Record<string, string>>) => ({
      id: G1,
      name: 'Kalimantan',
      origin_station: 'Jabo',
      dest_station: 'Aceh',
      ...over,
    })

    const group = (id: string) => ({ kind: 'group' as const, id })
    const route = (origin: string, dest: string) => ({ kind: 'route' as const, origin, dest })
```

Keep the existing tests that still apply — `'returns a calendar-complete set of rows for a 1H cycle'`,
`'passes the four cost component fields through from the query row unmangled'`,
`'totals the footer and divides averages by the calendar period'` — rewriting their mocks and call
sites to the shapes above. Delete `'emits the FILTER clause that keeps the components query-shape
correct'`'s `JOIN route_group_routes r` assertion and replace that test with the new one below.
Then add:

```ts
    it('returns nothing and touches no database when nothing is selected', async () => {
      const result = await service.getGroupComparison([], '2026-05-1H')

      expect(dataSource.query).not.toHaveBeenCalled()
      expect(result).toEqual({ columns: [], rows: [], footer: [], periodDays: 15 })
    })

    it('keeps groups and bare routes in the order they were picked', async () => {
      mockQueries(
        [
          groupRoute({ id: G2, name: 'Sumatera', dest_station: 'Medan' }),
          groupRoute({ id: G1, name: 'Kalimantan', dest_station: 'Pontianak' }),
        ],
        [],
      )

      const result = await service.getGroupComparison(
        [group(G1), route('Jabo', 'Denpasar'), group(G2)],
        '2026-05-1H',
      )

      expect(result.columns.map((c) => [c.kind, c.name])).toEqual([
        ['group', 'Kalimantan'],
        ['route', 'CGK → Denpasar'],
        ['group', 'Sumatera'],
      ])
      // The DB returned G2's routes first; the column order must follow the picks, not the driver.
      expect(result.columns[0].id).toBe(G1)
      expect(result.columns[1].id).toBe('r:Jabo|Denpasar')
    })

    it('exposes each column route list so the frontend can build a drilldown filter from it', async () => {
      mockQueries(
        [
          groupRoute({ dest_station: 'Aceh' }),
          groupRoute({ dest_station: 'Pontianak' }),
        ],
        [],
      )

      const result = await service.getGroupComparison(
        [group(G1), route('Surabaya', 'Denpasar')],
        '2026-05-1H',
      )

      expect(result.columns[0].routes).toEqual([
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
        { origin: 'Jabo', originLabel: 'CGK', dest: 'Pontianak' },
      ])
      expect(result.columns[0].routeCount).toBe(2)
      expect(result.columns[1].routes).toEqual([
        { origin: 'Surabaya', originLabel: 'SUB', dest: 'Denpasar' },
      ])
      expect(result.columns[1].routeCount).toBe(1)
    })

    it('drops a group id that no longer exists rather than rendering an empty column', async () => {
      mockQueries([], [])

      const result = await service.getGroupComparison([group(G1)], '2026-05-1H')

      expect(result.columns).toEqual([])
    })

    it('skips the group query entirely when only bare routes are picked', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await service.getGroupComparison([route('Jabo', 'Aceh')], '2026-05-1H')

      // Two calls, not three: there is no group to resolve.
      expect(dataSource.query).toHaveBeenCalledTimes(2)
    })

    it('joins the facts to a per-column route list rather than to route_group_routes', async () => {
      mockQueries([groupRoute({})], [])

      await service.getGroupComparison([group(G1)], '2026-05-1H')

      const factSql = (dataSource.query.mock.calls[1][0] as string).replace(/\s+/g, ' ')
      expect(factSql).toContain('WITH col_routes(col_idx, origin_station, dest_station) AS')
      expect(factSql).toContain('JOIN col_routes cr ON cr.origin_station = v.origin_station')
      expect(factSql).toContain('FILTER (WHERE v.cost_to IS NOT NULL)')
      expect(factSql).not.toContain('route_group_routes')
    })

    it('counts a route shared by two columns in both of them', async () => {
      // Overlap is the point of the join: the columns are independent questions, not a partition,
      // so a route in a group and also picked bare contributes to each column.
      mockQueries(
        [groupRoute({ dest_station: 'Aceh' })],
        [
          fact({ col_idx: '0', revenue: '1000', cost: '800' }),
          fact({ col_idx: '1', revenue: '1000', cost: '800' }),
        ],
      )

      const row = (
        await service.getGroupComparison([group(G1), route('Jabo', 'Aceh')], '2026-05-1H')
      ).rows[0]

      expect(row.cells[0]!.revenue).toBe(1000)
      expect(row.cells[1]!.revenue).toBe(1000)
    })

    it('attaches per-issue AWB counts to the cell and the footer they belong to', async () => {
      mockQueries(
        [groupRoute({})],
        [fact({ revenue: '1000', cost: '800' })],
        [
          { d: '2026-05-01', col_idx: '0', issue: 'sg_in_rate_missing', awbs: '1' },
          { d: '2026-05-01', col_idx: '0', issue: 'no_booking', awbs: '3' },
          { d: null, col_idx: '0', issue: 'no_booking', awbs: '4' },
        ],
      )

      const result = await service.getGroupComparison([group(G1)], '2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([
        { issue: 'no_booking', awbs: 3 },
        { issue: 'sg_in_rate_missing', awbs: 1 },
      ])
      expect(result.footer[0].issues).toEqual([{ issue: 'no_booking', awbs: 4 }])
    })

    it('gives a clean cell and a clean footer an empty issue list rather than null', async () => {
      mockQueries([groupRoute({})], [fact({ revenue: '1000', cost: '800' })], [])

      const result = await service.getGroupComparison([group(G1)], '2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([])
      expect(result.footer[0].issues).toEqual([])
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service -t "getGroupComparison" --runInBand`
Expected: FAIL — `getGroupComparison` still takes string ids.

- [ ] **Step 3: Change the interfaces**

In `apps/backend/src/modules/pnl/pnl.service.ts`:

```ts
export interface PnlGroupComparisonColumn {
  // A group column's id is its uuid; a route column's is `r:<origin>|<dest>`, which is also the
  // descriptor the frontend sends back, so the id round-trips.
  id: string
  name: string
  routeCount: number
  kind: 'group' | 'route'
  // The pairs this column aggregates. Sent to the client so a clicked cell can build the AWB
  // drilldown filter, and so overlap between columns is computed off the same list the numbers
  // came from rather than a second, drifting copy.
  routes: { origin: string; originLabel: string; dest: string }[]
}
```

Add `issues: PnlCellIssue[]` to `PnlGroupComparisonCell` (with the comment `// empty = clean; never null, so the frontend has one shape to read`) and to `PnlGroupComparisonFooter` (with the comment `// Distinct AWBs for the period, from its own grouping set — NOT the sum of the day cells.`).

Delete `const UUID_RE = ...` at line 247 — validation now lives in `pnl-columns.util.ts`. Remove `BadRequestException` from the `@nestjs/common` import if nothing else in the file uses it. Add to the imports:

```ts
import { ColumnPick } from './pnl-columns.util'
```

- [ ] **Step 4: Rewrite the method**

Replace the body of `getGroupComparison` in `apps/backend/src/modules/pnl/pnl.service.ts`:

```ts
  // Revenue and cost per calendar day for each selected comparison column, behind the
  // "Group Comparison" tab. A column is either a saved route group or a single route the user
  // picked ad hoc; both reduce to a list of origin→destination pairs, so both take the same path.
  //
  // Overlap is deliberate: a TO on a route held by three columns lands in all three. Each column
  // is an independent question, the columns are not a partition of the period, and they therefore
  // do not sum to a period total.
  async getGroupComparison(
    picks: ColumnPick[],
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlGroupComparison> {
    const dates = calendarDatesForFilter(cyclePeriod, startDate, endDate)
    const periodDays = Math.max(1, dates.length)

    if (picks.length === 0) {
      return { columns: [], rows: [], footer: [], periodDays }
    }

    const groupIds = picks.filter((p) => p.kind === 'group').map((p) => p.id)
    // Only asked for when a group was actually picked, so a route-only comparison costs one query
    // less rather than sending an empty uuid array to the database.
    const groupRouteRows: Record<string, string>[] = groupIds.length
      ? await this.dataSource.query(
          `
          SELECT g.id, g.name, r.origin_station, r.dest_station
          FROM route_groups g
          LEFT JOIN route_group_routes r ON r.route_group_id = g.id
          WHERE g.id = ANY($1::uuid[])
          ORDER BY g.id, r.origin_station, r.dest_station
          `,
          [groupIds],
        )
      : []

    const groupNames = new Map<string, string>()
    const groupRoutes = new Map<string, { origin: string; originLabel: string; dest: string }[]>()
    for (const row of groupRouteRows) {
      groupNames.set(row.id, row.name)
      if (!groupRoutes.has(row.id)) groupRoutes.set(row.id, [])
      // A group with no routes yet still LEFT JOINs to one row with null stations.
      if (row.origin_station && row.dest_station) {
        groupRoutes.get(row.id)!.push({
          origin: row.origin_station,
          originLabel: originLabel(row.origin_station),
          dest: row.dest_station,
        })
      }
    }

    // A group that was deleted between the picker loading and this request is dropped rather than
    // rendered as a permanently empty column with no name to explain itself.
    const columns: PnlGroupComparisonColumn[] = picks.flatMap((pick) => {
      if (pick.kind === 'group') {
        if (!groupNames.has(pick.id)) return []
        const routes = groupRoutes.get(pick.id) ?? []
        return [{
          id: pick.id,
          name: groupNames.get(pick.id)!,
          routeCount: routes.length,
          kind: 'group' as const,
          routes,
        }]
      }
      const label = originLabel(pick.origin)
      return [{
        id: `r:${pick.origin}|${pick.dest}`,
        name: `${label} → ${pick.dest}`,
        routeCount: 1,
        kind: 'route' as const,
        routes: [{ origin: pick.origin, originLabel: label, dest: pick.dest }],
      }]
    })

    if (columns.length === 0) {
      return { columns: [], rows: [], footer: [], periodDays }
    }

    const { where, params, dateCol } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')

    // One row per (column, route) pair, flattened into three parallel arrays. UNNEST zips them
    // back into the mapping table both queries below join against.
    const colIdx: number[] = []
    const colOrigins: string[] = []
    const colDests: string[] = []
    columns.forEach((column, index) => {
      for (const route of column.routes) {
        colIdx.push(index)
        colOrigins.push(route.origin)
        colDests.push(route.dest)
      }
    })

    const p = params.length
    const colRoutesCte = `
      WITH col_routes(col_idx, origin_station, dest_station) AS (
        SELECT * FROM UNNEST($${p + 1}::int[], $${p + 2}::text[], $${p + 3}::text[])
      )`
    const colParams = [...params, colIdx, colOrigins, colDests]

    const [factRows, issueRows] = await Promise.all([
      this.dataSource.query(
        `
        ${colRoutesCte}
        SELECT
          TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD')                      AS d,
          cr.col_idx                                                   AS col_idx,
          COALESCE(SUM(v.revenue_total), 0)                            AS revenue,
          COALESCE(SUM(v.cost_to), 0)                                  AS cost,
          COALESCE(SUM(v.cost_smu_awb    * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_smu,
          COALESCE(SUM(v.cost_ra_awb     * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_ra,
          COALESCE(SUM(v.cost_sg_out_awb * v.weight_share)
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_out,
          COALESCE(SUM(COALESCE(v.cost_sg_in_to, 0))
                   FILTER (WHERE v.cost_to IS NOT NULL), 0)            AS cost_sg_in,
          COUNT(*) FILTER (WHERE v.cost_to IS NULL)::int               AS incomplete_tos
        FROM v_pnl_to v
        JOIN col_routes cr
          ON cr.origin_station = v.origin_station
         AND cr.dest_station   = v.dest_station
        WHERE ${where}
          AND ${dateCol} IS NOT NULL
        GROUP BY 1, 2
        `,
        colParams,
      ),
      this.dataSource.query(
        `
        ${colRoutesCte}, issue_rows AS (
          SELECT
            TO_CHAR(${dateCol}::DATE, 'YYYY-MM-DD') AS d,
            cr.col_idx                              AS col_idx,
            v.issue                                 AS issue,
            v.awb                                   AS awb
          FROM v_pnl_to v
          JOIN col_routes cr
            ON cr.origin_station = v.origin_station
           AND cr.dest_station   = v.dest_station
          WHERE ${where}
            AND ${dateCol} IS NOT NULL
            AND v.issue IS NOT NULL
        )
        SELECT d, col_idx, issue, COUNT(DISTINCT awb)::int AS awbs
        FROM issue_rows
        GROUP BY GROUPING SETS ((d, col_idx, issue), (col_idx, issue))
        `,
        colParams,
      ),
    ])

    const cellIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? null : `${r.d}|${r.col_idx}`,
    )
    const columnIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.d == null ? String(r.col_idx) : null,
    )

    const rows: PnlGroupComparisonRow[] = dates.map((date) => ({
      date,
      cells: columns.map(() => null),
    }))
    const rowIndex = new Map(rows.map((r, i) => [r.date, i]))

    for (const factRow of factRows as Record<string, string>[]) {
      const ci = Number(factRow.col_idx)
      const ri = rowIndex.get(factRow.d)
      if (!Number.isInteger(ci) || ci < 0 || ci >= columns.length || ri === undefined) continue
      rows[ri].cells[ci] = {
        revenue: Number(factRow.revenue),
        cost: Number(factRow.cost),
        costSmu: Number(factRow.cost_smu),
        costRa: Number(factRow.cost_ra),
        costSgOut: Number(factRow.cost_sg_out),
        costSgIn: Number(factRow.cost_sg_in),
        incompleteTos: Number(factRow.incomplete_tos),
        issues: cellIssues.get(`${factRow.d}|${ci}`) ?? [],
      }
    }

    const footer: PnlGroupComparisonFooter[] = columns.map((_column, ci) => {
      let totalRevenue = 0
      let totalCost = 0
      let totalCostSmu = 0
      let totalCostRa = 0
      let totalCostSgOut = 0
      let totalCostSgIn = 0
      let incompleteTos = 0
      for (const row of rows) {
        const cell = row.cells[ci]
        if (!cell) continue
        totalRevenue += cell.revenue
        totalCost += cell.cost
        totalCostSmu += cell.costSmu
        totalCostRa += cell.costRa
        totalCostSgOut += cell.costSgOut
        totalCostSgIn += cell.costSgIn
        incompleteTos += cell.incompleteTos
      }
      return {
        totalRevenue,
        totalCost,
        totalCostSmu,
        totalCostRa,
        totalCostSgOut,
        totalCostSgIn,
        // Divided by calendar days, not by days that happened to have shipments.
        avgRevenuePerDay: totalRevenue / periodDays,
        avgCostPerDay: totalCost / periodDays,
        incompleteTos,
        issues: columnIssues.get(String(ci)) ?? [],
      }
    })

    return { columns, rows, footer, periodDays }
  }
```

- [ ] **Step 5: Change the controller**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, replace `getGroupComparison`:

```ts
  @Get('breakdown/group-comparison')
  getGroupComparison(
    @Query('columns') columns?: string,
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getGroupComparison(parseColumnPicks(columns), cycle, start, end, basis)
  }
```

and extend the Task 4 import:

```ts
import { parseColumnPicks, parseRoutePairs } from './pnl-columns.util'
```

In `apps/backend/src/modules/pnl/pnl.controller.spec.ts`, replace the three `groupIds` tests (around
line 103) with:

```ts
    it('parses mixed group and route descriptors in pick order', async () => {
      await controller.getGroupComparison(
        `g:11111111-1111-4111-8111-111111111111,r:Jabo|Denpasar`,
        '2026-05-1H',
      )

      expect(mockService.getGroupComparison).toHaveBeenCalledWith(
        [
          { kind: 'group', id: '11111111-1111-4111-8111-111111111111' },
          { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
        ],
        '2026-05-1H',
        undefined,
        undefined,
        undefined,
      )
    })

    it('sends an empty pick list when the columns param is absent', async () => {
      await controller.getGroupComparison(undefined, '2026-05-1H')

      expect(mockService.getGroupComparison).toHaveBeenCalledWith(
        [], '2026-05-1H', undefined, undefined, undefined,
      )
    })
```

- [ ] **Step 6: Update the integration spec**

In `apps/backend/src/modules/pnl/pnl-group-comparison.integration.spec.ts`, change every
`getGroupComparison([id, ...], ...)` call to pass `ColumnPick[]` — `[{ kind: 'group', id }]`. Then add
one test that exercises the new column kind against the real database, placed next to the existing
overlap test and reusing whatever fixture helper that file already defines for seeding
`route_group_routes` and `v_pnl_to`:

```ts
  it('gives a bare route column the same numbers as the group that contains it', async () => {
    // Reuses the seeded group whose only route is Jabo → Aceh.
    const result = await service.getGroupComparison(
      [{ kind: 'group', id: groupId }, { kind: 'route', origin: 'Jabo', dest: 'Aceh' }],
      cycle,
    )

    expect(result.columns.map((c) => c.kind)).toEqual(['group', 'route'])
    expect(result.footer[1].totalRevenue).toBe(result.footer[0].totalRevenue)
    expect(result.footer[1].totalCost).toBe(result.footer[0].totalCost)
  })
```

Read the file first: `groupId` and `cycle` above stand for whatever the existing fixtures name them,
and the seeded route may not be Jabo → Aceh. Adapt the values, not the assertion.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "pnl.service|pnl.controller" --runInBand`
Expected: PASS

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-group-comparison.integration --runInBand`
Expected: PASS if a test database is reachable. If the suite skips itself for want of a database,
say so explicitly in the commit body rather than claiming it passed.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/pnl
git commit -m "feat(pnl): compare bare routes alongside groups, with per-cell issues"
```

---

## Task 6: Lift MultiRouteFilter into shared components

**Files:**
- Create: `apps/frontend/src/components/shared/multi-route-filter.tsx` (git mv from `apps/frontend/src/features/air-shipments/components/MultiRouteFilter.tsx`)
- Create: `apps/frontend/src/components/shared/multi-route-filter.spec.tsx`
- Modify: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx` (line 36, import only)

**Interfaces:**
- Produces: `MultiRouteFilter({ routes: string[]; selected: string[]; onChange: (selected: string[]) => void; className?: string; align?: 'left' | 'right' })` from `@/components/shared/multi-route-filter`

- [ ] **Step 1: Move the file and fix the import**

```bash
git mv apps/frontend/src/features/air-shipments/components/MultiRouteFilter.tsx apps/frontend/src/components/shared/multi-route-filter.tsx
```

In `apps/frontend/src/features/air-shipments/components/SlaPage.tsx` line 36, change:

```ts
import { MultiRouteFilter } from '@/features/air-shipments/components/MultiRouteFilter'
```

to:

```ts
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
```

Do not change the component's contents. Update its doc comment's first line to say it is shared by
the SLA table and the P&L route filters, since "Shared between the table filter row and the summary
panel" is now too narrow.

- [ ] **Step 2: Write the test**

The component had no test; it now has two consumers, so pin its contract. Create
`apps/frontend/src/components/shared/multi-route-filter.spec.tsx`:

```tsx
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MultiRouteFilter } from './multi-route-filter'

const routes = ['CGK - SUB', 'Jabo → Denpasar', 'Jabo → Aceh']

function open(selected: string[] = [], onChange = jest.fn()) {
  render(<MultiRouteFilter routes={routes} selected={selected} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { expanded: false }))
  return onChange
}

// The checkbox carries no accessible name of its own — the label text sits in a sibling <span> —
// so it is addressed through the <label> that wraps it.
function checkboxFor(label: string): HTMLElement {
  return within(screen.getByText(label).closest('label')!).getByRole('checkbox')
}

describe('MultiRouteFilter', () => {
  it('summarises no selection, one selection and many', () => {
    const { rerender } = render(<MultiRouteFilter routes={routes} selected={[]} onChange={jest.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('All Routes')

    rerender(<MultiRouteFilter routes={routes} selected={['Jabo → Aceh']} onChange={jest.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('Jabo → Aceh')

    rerender(<MultiRouteFilter routes={routes} selected={routes} onChange={jest.fn()} />)
    expect(screen.getByRole('button')).toHaveTextContent('3 routes')
  })

  it('appends a newly ticked route rather than replacing the selection', () => {
    // Selection order is meaningful to the P&L comparison, where it decides column order.
    const onChange = open(['Jabo → Aceh'])
    fireEvent.click(checkboxFor('Jabo → Denpasar'))
    expect(onChange).toHaveBeenCalledWith(['Jabo → Aceh', 'Jabo → Denpasar'])
  })

  it('unticks a route already selected', () => {
    const onChange = open(['Jabo → Aceh'])
    fireEvent.click(checkboxFor('Jabo → Aceh'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('narrows the list by the search box without changing the selection', () => {
    open()
    fireEvent.change(screen.getByPlaceholderText('Search routes…'), { target: { value: 'denpasar' } })
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('selects everything with All and clears with None', () => {
    const onChange = open()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onChange).toHaveBeenCalledWith(routes)
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
```

`checkboxFor` reaches the input through its wrapping `<label>` because the component gives the
checkbox no accessible name of its own. If that lookup fails, fix the lookup — never weaken the
assertion about the resulting array.

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest multi-route-filter --runInBand`
Expected: PASS

- [ ] **Step 4: Verify nothing else referenced the old path**

Run: `grep -rn "components/MultiRouteFilter" apps/frontend/src apps/frontend/e2e`
Expected: no output

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/shared/multi-route-filter.tsx apps/frontend/src/components/shared/multi-route-filter.spec.tsx apps/frontend/src/features/air-shipments/components/SlaPage.tsx
git commit -m "refactor(frontend): share MultiRouteFilter outside the SLA feature"
```

---

## Task 7: Route label utility

**Files:**
- Create: `apps/frontend/src/features/pnl/utils/routeLabels.ts`
- Create: `apps/frontend/src/features/pnl/utils/routeLabels.spec.ts`

**Interfaces:**
- Produces: `dropdownRouteLabel(pair: { origin: string; dest: string }): string`; `displayRouteLabel(route: { originLabel: string; dest: string }): string`; `buildRouteLabelIndex(pairs: { origin: string; dest: string }[]): { labels: string[]; byLabel: Map<string, { origin: string; dest: string }> }`; `routesForLabels(labels: string[], index: RouteLabelIndex): PnlRoutePair[]`; `labelsForRoutes(pairs: PnlRoutePair[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/utils/routeLabels.spec.ts`:

```ts
import {
  buildRouteLabelIndex,
  displayRouteLabel,
  dropdownRouteLabel,
  labelsForRoutes,
} from './routeLabels'

describe('dropdownRouteLabel', () => {
  it('names the stations exactly as the data stores them', () => {
    // The dropdown lists stations as the source sheet writes them; the airport-code form belongs
    // to the matrix header, which mirrors the spreadsheet this report replaces.
    expect(dropdownRouteLabel({ origin: 'Jabo', dest: 'Denpasar' })).toBe('Jabo → Denpasar')
  })
})

describe('displayRouteLabel', () => {
  it('uses the airport-code origin label', () => {
    expect(displayRouteLabel({ originLabel: 'CGK', dest: 'Denpasar' })).toBe('CGK → Denpasar')
  })
})

describe('buildRouteLabelIndex', () => {
  const pairs = [
    { origin: 'Jabo', dest: 'Denpasar' },
    { origin: 'Surabaya', dest: 'Tanjung Pinang' },
  ]

  it('lists every label in the order given', () => {
    expect(buildRouteLabelIndex(pairs).labels).toEqual([
      'Jabo → Denpasar',
      'Surabaya → Tanjung Pinang',
    ])
  })

  it('maps a label back to its pair, including a station name with a space in it', () => {
    const { byLabel } = buildRouteLabelIndex(pairs)
    expect(byLabel.get('Surabaya → Tanjung Pinang')).toEqual({
      origin: 'Surabaya',
      dest: 'Tanjung Pinang',
    })
  })

  it('drops a duplicate pair so the dropdown never lists it twice', () => {
    const { labels } = buildRouteLabelIndex([...pairs, { origin: 'Jabo', dest: 'Denpasar' }])
    expect(labels).toHaveLength(2)
  })
})

describe('labelsForRoutes', () => {
  const index = buildRouteLabelIndex([
    { origin: 'Jabo', dest: 'Denpasar' },
    { origin: 'Jabo', dest: 'Aceh' },
  ])

  it('turns selected pairs back into the labels the dropdown ticks', () => {
    expect(labelsForRoutes([{ origin: 'Jabo', dest: 'Aceh' }])).toEqual(['Jabo → Aceh'])
  })

  it('keeps a pair that is not in the index, so a filter is never silently widened', () => {
    // A cell click can carry a route the station list has not caught up with. Dropping it here
    // would show the user a wider result set than the one they asked for, with no clue why.
    expect(labelsForRoutes([{ origin: 'Jabo', dest: 'Manokwari' }])).toEqual(['Jabo → Manokwari'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest routeLabels --runInBand`
Expected: FAIL — `Cannot find module './routeLabels'`

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/features/pnl/utils/routeLabels.ts`:

```ts
import { PnlRoutePair } from '../hooks/usePnl'

/**
 * The two route label forms the P&L UI uses, kept apart on purpose.
 *
 * The matrix headers, the Route Group picker and the overlap warnings label an origin by airport
 * code (CGK, SUB), mirroring the spreadsheet those reports replace. The route dropdown instead
 * names both stations exactly as the data stores them, so what the user ticks reads the same as
 * what the source sheet says. Collapsing these into one form would make one of the two lie.
 */

const SEPARATOR = ' → '

export function dropdownRouteLabel(pair: { origin: string; dest: string }): string {
  return `${pair.origin}${SEPARATOR}${pair.dest}`
}

export function displayRouteLabel(route: { originLabel: string; dest: string }): string {
  return `${route.originLabel}${SEPARATOR}${route.dest}`
}

export interface RouteLabelIndex {
  labels: string[]
  byLabel: Map<string, PnlRoutePair>
}

// MultiRouteFilter speaks in label strings. This is the only place that translates them back, so
// no consumer has to parse a label and guess where a station name with a space in it splits.
export function buildRouteLabelIndex(pairs: { origin: string; dest: string }[]): RouteLabelIndex {
  const byLabel = new Map<string, PnlRoutePair>()
  const labels: string[] = []
  for (const pair of pairs) {
    const label = dropdownRouteLabel(pair)
    if (byLabel.has(label)) continue
    byLabel.set(label, { origin: pair.origin, dest: pair.dest })
    labels.push(label)
  }
  return { labels, byLabel }
}

export function routesForLabels(labels: string[], index: RouteLabelIndex): PnlRoutePair[] {
  return labels.flatMap((label) => {
    const pair = index.byLabel.get(label)
    return pair ? [pair] : []
  })
}

// The inverse. A pair the station list does not know is still labelled rather than dropped: losing
// it would silently widen the filter, which reads as a real (wider) answer instead of a mistake.
export function labelsForRoutes(pairs: PnlRoutePair[]): string[] {
  return pairs.map(dropdownRouteLabel)
}
```

`routesForLabels` is used by Task 9 and Task 11. `PnlRoutePair` does not exist yet: it arrives in Task 9. **Delete the
`import { PnlRoutePair } from '../hooks/usePnl'` line shown above** and declare the type locally for
now, so this task stands on its own:

```ts
export interface PnlRoutePair { origin: string; dest: string }
```

Task 9 Step 4 deletes that local copy and restores the import.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest routeLabels --runInBand`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/pnl/utils/routeLabels.ts apps/frontend/src/features/pnl/utils/routeLabels.spec.ts
git commit -m "feat(pnl): add the two route label forms as one util"
```

---

## Task 8: Cell warning utility

**Files:**
- Create: `apps/frontend/src/features/pnl/utils/cellWarning.ts`
- Create: `apps/frontend/src/features/pnl/utils/cellWarning.spec.ts`
- Modify: `apps/frontend/src/features/pnl/utils/issueLabels.ts` — add `ISSUE_RANK` and `issueRank`
- Modify: `apps/frontend/src/features/pnl/utils/issueLabels.spec.ts`

**Interfaces:**
- Produces: `CellWarning { issues: { issue: string; awbs: number }[]; incompleteTos: number }`; `hasWarning(w: CellWarning | undefined): boolean`; `warningTooltip(w: CellWarning | undefined): string | undefined`; `issueRank(issue: string): number`

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/pnl/utils/issueLabels.spec.ts`:

```ts
import { issueLabel, issueRank } from './issueLabels'

describe('issueRank', () => {
  it('ranks the station gap ahead of the SG In rate miss it causes', () => {
    expect(issueRank('station_mapping_missing')).toBeLessThan(issueRank('sg_in_rate_missing'))
  })

  it('sinks an unknown issue below every known one', () => {
    expect(issueRank('something_new')).toBeGreaterThan(issueRank('sg_in_rate_missing'))
  })
})
```

(replace the existing `import { issueLabel } from './issueLabels'` line with the one above).

Create `apps/frontend/src/features/pnl/utils/cellWarning.spec.ts`:

```ts
import { CellWarning, hasWarning, warningTooltip } from './cellWarning'

const clean: CellWarning = { issues: [], incompleteTos: 0 }

describe('hasWarning', () => {
  it('is false for a clean cell and for a cell with no warning data at all', () => {
    expect(hasWarning(clean)).toBe(false)
    expect(hasWarning(undefined)).toBe(false)
  })

  it('is true when either half is non-empty', () => {
    expect(hasWarning({ issues: [{ issue: 'no_booking', awbs: 1 }], incompleteTos: 0 })).toBe(true)
    expect(hasWarning({ issues: [], incompleteTos: 3 })).toBe(true)
  })
})

describe('warningTooltip', () => {
  it('says nothing for a clean cell, so no tooltip is attached', () => {
    expect(warningTooltip(clean)).toBeUndefined()
    expect(warningTooltip(undefined)).toBeUndefined()
  })

  it('names each issue with its own AWB count, most severe first', () => {
    // Counts stay per issue rather than summed: one AWB can carry two issues, and a total would
    // claim more broken AWBs than there are.
    const tooltip = warningTooltip({
      issues: [
        { issue: 'revenue_missing', awbs: 1 },
        { issue: 'smu_rate_missing', awbs: 2 },
      ],
      incompleteTos: 0,
    })
    expect(tooltip).toBe(
      'Data quality: SMU rate missing for route (2 AWB), Revenue missing (1 AWB)',
    )
  })

  it('adds the incomplete-cost half after a separator', () => {
    const tooltip = warningTooltip({
      issues: [{ issue: 'no_booking', awbs: 1 }],
      incompleteTos: 4,
    })
    expect(tooltip).toBe(
      'Data quality: No booking row (AWB missing in SMU rate sheet) (1 AWB) · 4 TO belum ada cost',
    )
  })

  it('reports incomplete cost on its own when there is no classified issue', () => {
    expect(warningTooltip({ issues: [], incompleteTos: 2 })).toBe('2 TO belum ada cost')
  })

  it('falls back to the raw name for an issue the label map has not caught up with', () => {
    expect(warningTooltip({ issues: [{ issue: 'brand_new', awbs: 1 }], incompleteTos: 0 })).toBe(
      'Data quality: brand_new (1 AWB)',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "cellWarning|issueLabels" --runInBand`
Expected: FAIL — `Cannot find module './cellWarning'` and `issueRank` is not exported.

- [ ] **Step 3: Add the rank to issueLabels**

Append to `apps/frontend/src/features/pnl/utils/issueLabels.ts`:

```ts
// Severity order, root cause first — the same order the backend applies when it collapses an AWB's
// TOs down to one issue. Mirrored here rather than fetched so a tooltip can sort without a request.
export const ISSUE_RANK: Record<string, number> = {
  no_booking: 1,
  smu_rate_missing: 2,
  ra_rate_missing: 3,
  sgout_name_missing: 4,
  revenue_missing: 5,
  station_mapping_missing: 6,
  sg_in_rate_missing: 7,
}

// An issue the view starts emitting before this map is updated sorts last rather than disappearing.
export function issueRank(issue: string): number {
  return ISSUE_RANK[issue] ?? Number.MAX_SAFE_INTEGER
}
```

- [ ] **Step 4: Write the cell warning util**

Create `apps/frontend/src/features/pnl/utils/cellWarning.ts`:

```ts
import { PnlCellIssue } from '../hooks/usePnl'
import { issueLabel, issueRank } from './issueLabels'

/**
 * What makes a P&L cell yellow, and what the tooltip says about it. One definition for the daily
 * matrix and the group comparison, so "yellow" cannot come to mean two different things.
 */
export interface CellWarning {
  issues: PnlCellIssue[] // the cause: classified data quality problems, per issue type
  incompleteTos: number // the effect: TOs with no cost at all
}

export function hasWarning(warning: CellWarning | undefined): boolean {
  if (!warning) return false
  return warning.issues.length > 0 || warning.incompleteTos > 0
}

export function warningTooltip(warning: CellWarning | undefined): string | undefined {
  if (!hasWarning(warning)) return undefined
  const parts: string[] = []
  if (warning!.issues.length > 0) {
    // Per-issue counts, never a total: an AWB can carry two issues, so summing would overstate how
    // many AWBs are actually broken.
    const named = [...warning!.issues]
      .sort((a, b) => issueRank(a.issue) - issueRank(b.issue) || a.issue.localeCompare(b.issue))
      .map((i) => `${issueLabel(i.issue)} (${i.awbs} AWB)`)
      .join(', ')
    parts.push(`Data quality: ${named}`)
  }
  if (warning!.incompleteTos > 0) {
    parts.push(`${warning!.incompleteTos} TO belum ada cost`)
  }
  return parts.join(' · ')
}
```

`PnlCellIssue` does not exist yet — it arrives in Task 9. **Delete the
`import { PnlCellIssue } from '../hooks/usePnl'` line shown above** and declare the type locally for
now, so this task stands on its own:

```ts
export interface PnlCellIssue { issue: string; awbs: number }
```

Task 9 Step 4 deletes that local copy and restores the import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "cellWarning|issueLabels" --runInBand`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/pnl/utils/cellWarning.ts apps/frontend/src/features/pnl/utils/cellWarning.spec.ts apps/frontend/src/features/pnl/utils/issueLabels.ts apps/frontend/src/features/pnl/utils/issueLabels.spec.ts
git commit -m "feat(pnl): define what makes a cell warn and what its tooltip says"
```

---

## Task 9: Multi-route drilldown filter (frontend, end to end)

Delivers spec item 2. The `PnlRouteFilter` shape changes, so every consumer moves in this one task
to keep the tree compiling.

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts` — `PnlRoutePair`, `PnlCellIssue`, `PnlRouteFilter`, `routeToParams`
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts`
- Modify: `apps/frontend/src/features/pnl/utils/routeLabels.ts` — drop the local `PnlRoutePair`, import it
- Modify: `apps/frontend/src/features/pnl/utils/cellWarning.ts` — drop the local `PnlCellIssue`, import it
- Modify: `apps/frontend/src/features/pnl/utils/dailyMatrix.ts` — `routeFromCell`
- Modify: `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts` — `describe('routeFromCell')`
- Modify: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx` + `.spec.tsx`

**Interfaces:**
- Consumes: `MultiRouteFilter` (Task 6); `buildRouteLabelIndex`, `routesForLabels`, `labelsForRoutes` (Task 7)
- Produces: `PnlRoutePair { origin: string; dest: string }`; `PnlCellIssue { issue: string; awbs: number }`; `PnlRouteFilter { routes?: PnlRoutePair[]; dateFrom?: string; dateTo?: string }`; `routeToParams(route?: PnlRouteFilter): { routes?: string; dateFrom?: string; dateTo?: string }`

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts`, replace the `routeToParams` tests with:

```ts
describe('routeToParams', () => {
  it('sends nothing at all for an untouched filter', () => {
    // An untouched filter must produce the exact request shape the endpoint saw before route
    // filtering existed, not `routes=`.
    expect(routeToParams(undefined)).toEqual({})
    expect(routeToParams({})).toEqual({})
    expect(routeToParams({ routes: [] })).toEqual({})
  })

  it('joins route pairs into one comma-separated param', () => {
    expect(
      routeToParams({
        routes: [
          { origin: 'Jabo', dest: 'Denpasar' },
          { origin: 'Surabaya', dest: 'Tanjung Pinang' },
        ],
      }),
    ).toEqual({ routes: 'Jabo|Denpasar,Surabaya|Tanjung Pinang' })
  })

  it('carries the date window alongside the routes', () => {
    expect(
      routeToParams({ routes: [{ origin: 'Jabo', dest: 'Aceh' }], dateFrom: '2026-05-01', dateTo: '2026-05-01' }),
    ).toEqual({ routes: 'Jabo|Aceh', dateFrom: '2026-05-01', dateTo: '2026-05-01' })
  })
})
```

In `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`, replace `describe('routeFromCell')`:

```ts
describe('routeFromCell', () => {
  it('maps a CGK column to the raw origin the drilldown filters on', () => {
    const route = routeFromCell({ origin: 'Jabo', originLabel: 'CGK', dest: 'Tanjung Pinang' }, '2026-05-01')
    expect(route).toEqual({
      routes: [{ origin: 'Jabo', dest: 'Tanjung Pinang' }],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    })
  })

  it('maps a SUB column the same way', () => {
    const route = routeFromCell({ origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' }, '2026-05-20')
    expect(route).toEqual({
      routes: [{ origin: 'Surabaya', dest: 'Pontianak' }],
      dateFrom: '2026-05-20',
      dateTo: '2026-05-20',
    })
  })
})
```

In `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`, replace the tests that
drive the two `<select>`s (they use `screen.getByLabelText('Origin')` / `'Destination'`) with:

```ts
describe('PnlAwbDrilldown route filter', () => {
  beforeEach(() => jest.clearAllMocks())

  const stations = [
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Denpasar' },
    { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
    { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
  ]

  function renderWith(route: PnlRouteFilter, onRouteChange = jest.fn()) {
    hooks.usePnlStations.mockReturnValue({ data: stations })
    mockRows([])
    render(<PnlAwbDrilldown filter={filter} route={route} onRouteChange={onRouteChange} />)
    return onRouteChange
  }

  it('lists every station pair with both stations named as the data stores them', () => {
    renderWith({})
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Jabo → Denpasar')).toBeInTheDocument()
    expect(screen.getByText('Surabaya → Pontianak')).toBeInTheDocument()
    // Not the airport-code form, which belongs to the matrix header.
    expect(screen.queryByText('CGK → Denpasar')).not.toBeInTheDocument()
  })

  it('reports a ticked route back as a pair, appending to the existing selection', () => {
    const onRouteChange = renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Jabo → Denpasar/ }))
    expect(onRouteChange).toHaveBeenCalledWith({
      routes: [
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Jabo', dest: 'Denpasar' },
      ],
    })
  })

  it('shows the currently filtered routes as ticked', () => {
    renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('Jabo → Aceh')
  })

  it('drops the routes key entirely when the last route is unticked', () => {
    // An empty array would still serialise as a filter that matches nothing; undefined means
    // "no route filter", which is what unticking everything asks for.
    const onRouteChange = renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Jabo → Aceh/ }))
    expect(onRouteChange).toHaveBeenCalledWith({ routes: undefined })
  })

  it('resets routes and dates together', () => {
    const onRouteChange = renderWith({ routes: [{ origin: 'Jabo', dest: 'Aceh' }], dateFrom: '2026-05-01' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onRouteChange).toHaveBeenCalledWith({})
  })
})
```

Add `PnlRouteFilter` to the file's import from `../hooks/usePnl`. The checkbox accessible names come
from `MultiRouteFilter`'s `<label>` text; if `getByRole('checkbox', { name })` does not resolve, use
`within(screen.getByText('Jabo → Denpasar').closest('label')!).getByRole('checkbox')` rather than
weakening the assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "usePnl|dailyMatrix|PnlAwbDrilldown" --runInBand`
Expected: FAIL

- [ ] **Step 3: Change the hook types and serialisation**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, replace `PnlRouteFilter` and add the two new
types near it:

```ts
export interface PnlRoutePair {
  origin: string // raw v_pnl_to value, e.g. 'Jabo'
  dest: string // already a city name, e.g. 'Denpasar'
}

// One data quality issue inside one cell, and how many distinct AWBs carry it there.
export interface PnlCellIssue {
  issue: string
  awbs: number
}

// Narrows the AWB drilldown only. Empty fields are omitted from the request entirely.
export interface PnlRouteFilter {
  routes?: PnlRoutePair[]
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
}
```

and replace `routeToParams`:

```ts
// Only non-empty fields are sent, so an untouched filter produces the exact request shape the
// endpoint saw before route filtering existed. Exported so its HTTP param names are pinned by a
// direct test rather than only indirectly through a mocked hook.
export function routeToParams(route: PnlRouteFilter | undefined) {
  if (!route) return {}
  return {
    ...(route.routes?.length
      ? { routes: route.routes.map((r) => `${r.origin}|${r.dest}`).join(',') }
      : {}),
    ...(route.dateFrom ? { dateFrom: route.dateFrom } : {}),
    ...(route.dateTo ? { dateTo: route.dateTo } : {}),
  }
}
```

- [ ] **Step 4: Point the two utils at the shared types**

In `apps/frontend/src/features/pnl/utils/routeLabels.ts`, delete the local
`export interface PnlRoutePair { ... }` and restore the import at the top:

```ts
import { PnlRoutePair } from '../hooks/usePnl'
```

In `apps/frontend/src/features/pnl/utils/cellWarning.ts`, delete the local
`export interface PnlCellIssue { ... }` and keep the import:

```ts
import { PnlCellIssue } from '../hooks/usePnl'
```

- [ ] **Step 5: Change routeFromCell**

In `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`:

```ts
// A clicked matrix cell as an AWB drilldown filter. The column carries both forms of the origin;
// the drilldown filters on the raw value ('Jabo'), while the matrix header shows the label ('CGK').
export function routeFromCell(column: PnlDailyMatrixColumn, date: string): PnlRouteFilter {
  return {
    routes: [{ origin: column.origin, dest: column.dest }],
    dateFrom: date,
    dateTo: date,
  }
}
```

- [ ] **Step 6: Swap the drilldown's two selects for the shared dropdown**

In `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`:

Add imports:

```ts
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { buildRouteLabelIndex, labelsForRoutes, routesForLabels } from '../utils/routeLabels'
```

Delete the `origins` and `dests` derivations and the `setField` origin-pruning branch. Replace them
with:

```ts
  const routeIndex = buildRouteLabelIndex(stations ?? [])
  const hasRoute = Boolean(route.routes?.length || route.dateFrom || route.dateTo)
```

Replace `setField` with two handlers — the date inputs no longer share a code path with the routes:

```ts
  // Empty means "no filter": routeToParams drops empty fields before building the request, and an
  // empty array would otherwise be serialised as a filter that matches nothing.
  function setRoutes(labels: string[]) {
    const routes = routesForLabels(labels, routeIndex)
    onRouteChange({ ...route, routes: routes.length ? routes : undefined })
  }

  function setDate(field: 'dateFrom' | 'dateTo', value: string) {
    onRouteChange({ ...route, [field]: value || undefined })
  }
```

Replace the two `<label>`-wrapped `<select>` blocks (Origin and Destination) with:

```tsx
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Rute
          <MultiRouteFilter
            className="w-[260px]"
            routes={routeIndex.labels}
            selected={labelsForRoutes(route.routes ?? [])}
            onChange={setRoutes}
          />
        </label>
```

Change the two date inputs' `onChange` to call `setDate('dateFrom', e.target.value)` and
`setDate('dateTo', e.target.value)` respectively. Leave the Reset button, the overhang notice, the
table and the pagination untouched.

- [ ] **Step 7: Update the page's cell handler**

`apps/frontend/src/app/(dashboard)/pnl/page.tsx` needs no edit — `handleCellClick` already delegates
to `routeFromCell`, which now returns the new shape. Confirm by reading it; do not change it.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "usePnl|dailyMatrix|PnlAwbDrilldown|routeLabels|cellWarning|pnl/page" --runInBand`
Expected: PASS

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(pnl): filter the AWB drilldown on many routes at once"
```

---

## Task 10: Daily Report cell warnings

Delivers spec item 1 for the Daily Report.

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts` — `PnlDailyMatrixCell`, `PnlDailyMatrixFooter`
- Modify: `apps/frontend/src/features/pnl/utils/dailyMatrix.ts` — `MatrixTableModel`, `MatrixFooterRow`, `toRevenueTable`, `toMarginTable`
- Modify: `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`
- Modify: `apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx` + `.spec.tsx`

**Interfaces:**
- Consumes: `CellWarning`, `hasWarning`, `warningTooltip` (Task 8); `PnlCellIssue` (Task 9)
- Produces: `MatrixTableModel.warnings: CellWarning[][]`; `MatrixFooterRow.warnings?: CellWarning[]`

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/utils/dailyMatrix.spec.ts`, add `issues` to every cell and footer
in the `matrix` fixture (`issues: []` everywhere except one cell — give the third column's
`2026-07-01` cell `issues: [{ issue: 'no_booking', awbs: 2 }]` and that column's footer
`issues: [{ issue: 'no_booking', awbs: 3 }]`). Then replace the two `incompleteTos` assertions:

```ts
  it('warns on the revenue table too, since a missing revenue row understates it', () => {
    const model = toRevenueTable(matrix)
    expect(model.warnings[0][2]).toEqual({
      issues: [{ issue: 'no_booking', awbs: 2 }],
      incompleteTos: 2,
    })
    expect(model.warnings[0][1]).toEqual({ issues: [], incompleteTos: 0 })
    expect(model.highlightNegative).toBe(false)
  })

  it('carries the same warnings onto the margin table and its Total footer row', () => {
    const model = toMarginTable(matrix)
    expect(model.warnings[0][2]).toEqual({
      issues: [{ issue: 'no_booking', awbs: 2 }],
      incompleteTos: 2,
    })
    expect(model.footerRows[0].warnings?.[2]).toEqual({
      issues: [{ issue: 'no_booking', awbs: 3 }],
      incompleteTos: 2,
    })
    // Only the Total row aggregates the period; an average has no set of AWBs behind it.
    expect(model.footerRows[1].warnings).toBeUndefined()
    expect(model.highlightNegative).toBe(true)
  })

  it('gives an absent cell a clean warning rather than undefined', () => {
    // Row 2 has no shipments at all. A missing entry here would make every consumer null-check.
    expect(toRevenueTable(matrix).warnings[1]).toEqual([
      { issues: [], incompleteTos: 0 },
      { issues: [], incompleteTos: 0 },
      { issues: [], incompleteTos: 0 },
    ])
  })
```

In `apps/frontend/src/features/pnl/components/PnlMatrixTable.spec.tsx`, replace `incompleteTos: null`
in `baseModel` with `warnings: [[{ issues: [], incompleteTos: 0 }, { issues: [], incompleteTos: 0 }]]`,
drop the `INCOMPLETE_TOOLTIP` helper, rewrite any test asserting the `•` marker, and add:

```tsx
  const warned = { issues: [{ issue: 'smu_rate_missing', awbs: 2 }], incompleteTos: 3 }
  const clean = { issues: [], incompleteTos: 0 }

  it('paints a warned cell amber and explains it in the title', () => {
    const model = baseModel({ values: [[10, 20]], warnings: [[warned, clean]] })
    const { container } = render(<PnlMatrixTable title="t" model={model} />)
    const [warnedCell, cleanCell] = bodyCells(container)
    expect(warnedCell.className).toContain('bg-amber-100')
    expect(warnedCell.getAttribute('title')).toBe(
      'Data quality: SMU rate missing for route (2 AWB) · 3 TO belum ada cost',
    )
    expect(cleanCell.className).not.toContain('bg-amber-100')
    expect(cleanCell.getAttribute('title')).toBeNull()
  })

  it('keeps a negative value legible as red text when the cell is also warned', () => {
    // The amber background wins — it says the number is unreliable — but the red text must survive,
    // otherwise a warned loss reads as a warned profit.
    const model = baseModel({
      values: [[-5, -5]],
      warnings: [[warned, clean]],
      highlightNegative: true,
    })
    const { container } = render(<PnlMatrixTable title="t" model={model} />)
    const [warnedCell, cleanCell] = bodyCells(container)
    expect(warnedCell.className).toContain('bg-amber-100')
    expect(warnedCell.className).not.toContain('bg-red-50')
    expect(warnedCell.className).toContain('text-red-700')
    expect(cleanCell.className).toContain('bg-red-50')
  })

  it('merges the warning into the button title when the cell is clickable', () => {
    // The button covers the whole cell, so a title on the <td> would be unreachable.
    const model = baseModel({ values: [[10, 20]], warnings: [[warned, clean]] })
    render(<PnlMatrixTable title="t" model={model} onCellClick={jest.fn()} />)
    const [button] = screen.getAllByRole('button', { name: /Lihat AWB/ })
    expect(button.getAttribute('title')).toBe(
      'Lihat AWB rute dan tanggal ini — Data quality: SMU rate missing for route (2 AWB) · 3 TO belum ada cost',
    )
  })

  it('paints a warned footer cell amber but leaves it inert', () => {
    const model = baseModel({
      footerRows: [{ label: 'Total', values: [10, -5], format: 'number', warnings: [warned, clean] }],
    })
    const { container } = render(<PnlMatrixTable title="t" model={model} onCellClick={jest.fn()} />)
    const [warnedFooter] = footerRow(container, 0)
    expect(warnedFooter.className).toContain('bg-amber-100')
    expect(warnedFooter.querySelector('button')).toBeNull()
  })
```

Add `screen` to the Testing Library import in that file if it is not already there.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "dailyMatrix|PnlMatrixTable" --runInBand`
Expected: FAIL

- [ ] **Step 3: Add issues to the hook types**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, add `issues: PnlCellIssue[]` to
`PnlDailyMatrixCell` and to `PnlDailyMatrixFooter`.

- [ ] **Step 4: Project warnings in the model**

In `apps/frontend/src/features/pnl/utils/dailyMatrix.ts`:

```ts
import { CellWarning } from './cellWarning'
```

Replace `incompleteTos?: number[]` on `MatrixFooterRow` with:

```ts
  warnings?: CellWarning[] // index-aligned with columns; absent = this row has no AWBs behind it
```

Replace `incompleteTos: number[][] | null` on `MatrixTableModel` with:

```ts
  warnings: CellWarning[][] // [rowIndex][columnIndex]; always present, clean cells included
```

Add the shared projection helper above `toRevenueTable`:

```ts
// An absent cell still gets a clean warning rather than being left undefined, so the renderer and
// the tests have exactly one shape to read.
const CLEAN: CellWarning = { issues: [], incompleteTos: 0 }

function cellWarnings(matrix: PnlDailyMatrix): CellWarning[][] {
  return matrix.rows.map((row) =>
    row.cells.map((cell) =>
      cell ? { issues: cell.issues, incompleteTos: cell.incompleteTos } : CLEAN,
    ),
  )
}
```

In `toRevenueTable`, replace `incompleteTos: null,` with `warnings: cellWarnings(matrix),`.

In `toMarginTable`, replace `incompleteTos: matrix.rows.map(...)` with `warnings: cellWarnings(matrix),`
and, on the `Total` footer row, replace `incompleteTos: matrix.footer.map((f) => f.incompleteTos),` with:

```ts
        warnings: matrix.footer.map((f) => ({
          issues: f.issues,
          incompleteTos: f.incompleteTos,
        })),
```

Both tables now warn identically, so the revenue table gains the same footer treatment — add the
same `warnings` line to `toRevenueTable`'s `Total` footer row.

- [ ] **Step 5: Render the warnings**

In `apps/frontend/src/features/pnl/components/PnlMatrixTable.tsx`:

```ts
import { CellWarning, hasWarning, warningTooltip } from '../utils/cellWarning'
```

Replace `incompleteTooltip` and `cellButtonTitle` with:

```ts
// The button fills the whole cell, so its title is the only tooltip the hovering user ever reaches —
// the warning must be merged into it, not left on the (now-covered) <td>.
function cellButtonTitle(warning: CellWarning | undefined): string {
  const clickHint = 'Lihat AWB rute dan tanggal ini'
  const tooltip = warningTooltip(warning)
  return tooltip ? `${clickHint} — ${tooltip}` : clickHint
}
```

Replace `valueClass` with:

```ts
// Amber wins the background: it says the number itself is unreliable, which outranks its sign.
// A negative value keeps its red text so a warned loss never reads as a warned profit.
function cellClass(value: number | null, highlightNegative: boolean, warned: boolean): string {
  const negative = value != null && value < 0 && highlightNegative
  if (warned) return `bg-amber-100 dark:bg-amber-950/40 ${negative ? 'text-red-700 dark:text-red-400 font-semibold' : ''}`
  return negative ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/40' : ''
}
```

In the body loop, replace the `incomplete` lookup and `content` with:

```tsx
                    const warning = model.warnings[rowIndex]?.[colIndex]
                    const warned = hasWarning(warning)
                    const column = model.columns[colIndex]
                    const content = formatValue(value, 'number')
```

and the `<td>` with:

```tsx
                      <td
                        key={colIndex}
                        title={onCellClick ? undefined : warningTooltip(warning)}
                        className={`whitespace-nowrap border-b border-l text-right ${cellClass(value, model.highlightNegative, warned)} ${onCellClick ? 'p-0' : 'px-3 py-1.5'}`}
                      >
                        {onCellClick ? (
                          <button
                            type="button"
                            title={cellButtonTitle(warning)}
                            aria-label={`Lihat AWB ${column.originLabel} → ${column.dest}, ${formatDayLabel(date)}`}
                            className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                            onClick={() => onCellClick(column, date)}
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </td>
```

In the footer loop, replace the `incomplete` lookup and `<td>` with:

```tsx
                    const warning = row.warnings?.[colIndex]
                    return (
                      <td
                        key={colIndex}
                        title={warningTooltip(warning)}
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${cellClass(value, model.highlightNegative, hasWarning(warning))}`}
                      >
                        {formatValue(value, row.format)}
                      </td>
                    )
```

The amber `•` markers are gone from both loops — the background is the marker now.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "dailyMatrix|PnlMatrixTable|PnlDailyMatrixView" --runInBand`
Expected: PASS

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl
git commit -m "feat(pnl): colour the daily report cells whose numbers are unreliable"
```

---

## Task 11: Compare bare routes in Group Comparison

Delivers spec item 4.

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts` — `PnlGroupComparisonColumn`, `PnlColumnPick`, `columnsToParam`, `usePnlGroupComparison`
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts`
- Modify: `apps/frontend/src/features/pnl/utils/groupComparison.ts` — `overlappingRoutes`
- Modify: `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`
- Modify: `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx` + `.spec.tsx`

**Interfaces:**
- Consumes: `MultiRouteFilter` (Task 6); `buildRouteLabelIndex`, `routesForLabels`, `labelsForRoutes`, `displayRouteLabel` (Task 7)
- Produces: `PnlColumnPick = { kind: 'group'; id: string } | { kind: 'route'; origin: string; dest: string }`; `columnsToParam(picks: PnlColumnPick[]): string`; `usePnlGroupComparison(filter, picks: PnlColumnPick[])`; `overlappingRoutes(columns: PnlGroupComparisonColumn[])`

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts`, add:

```ts
describe('columnsToParam', () => {
  it('prefixes each pick by kind and keeps the pick order', () => {
    expect(
      columnsToParam([
        { kind: 'group', id: 'abc' },
        { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
      ]),
    ).toBe('g:abc,r:Jabo|Denpasar')
  })

  it('is empty for no picks', () => {
    expect(columnsToParam([])).toBe('')
  })
})
```

In `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`, replace the `overlappingRoutes`
tests with ones driven by response columns:

```ts
describe('overlappingRoutes', () => {
  const aceh = { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }
  const medan = { origin: 'Jabo', originLabel: 'CGK', dest: 'Medan' }

  const column = (over: Partial<PnlGroupComparisonColumn>): PnlGroupComparisonColumn => ({
    id: 'g1', name: 'Kalimantan', routeCount: 1, kind: 'group', routes: [aceh], ...over,
  })

  it('names every column that holds a shared route', () => {
    const overlaps = overlappingRoutes([
      column({ id: 'g1', name: 'Kalimantan', routes: [aceh, medan] }),
      column({ id: 'g2', name: 'Sumatera', routes: [aceh] }),
    ])
    expect(overlaps).toEqual([{ route: 'CGK → Aceh', groupNames: ['Kalimantan', 'Sumatera'] }])
  })

  it('catches a bare route column that duplicates a group member', () => {
    // This is the case the old RouteGroup-driven version could not see at all.
    const overlaps = overlappingRoutes([
      column({ id: 'g1', name: 'Kalimantan', routes: [aceh] }),
      column({ id: 'r:Jabo|Aceh', name: 'CGK → Aceh', kind: 'route', routes: [aceh] }),
    ])
    expect(overlaps).toEqual([{ route: 'CGK → Aceh', groupNames: ['Kalimantan', 'CGK → Aceh'] }])
  })

  it('says nothing when the columns are disjoint', () => {
    expect(
      overlappingRoutes([
        column({ id: 'g1', routes: [aceh] }),
        column({ id: 'g2', name: 'Sumatera', routes: [medan] }),
      ]),
    ).toEqual([])
  })
})
```

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.spec.tsx`, add:

```tsx
  it('lists bare routes to pick alongside the groups', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Jabo → Denpasar')).toBeInTheDocument()
  })

  it('sends groups and routes in the order they were picked', () => {
    renderView()
    fireEvent.click(screen.getByRole('checkbox', { name: /Kalimantan/ }))
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Jabo → Denpasar/ }))

    expect(hooks.usePnlGroupComparison).toHaveBeenLastCalledWith(filter, [
      { kind: 'group', id: 'g1' },
      { kind: 'route', origin: 'Jabo', dest: 'Denpasar' },
    ])
  })

  it('prompts for a pick when nothing is selected', () => {
    renderView()
    expect(screen.getByText('Pilih minimal satu group atau rute untuk melihat perbandingan.')).toBeInTheDocument()
  })
```

Read the existing spec first — it already mocks `useRouteGroups` and `usePnlGroupComparison`; extend
those mocks with `useAvailableRoutes` returning
`[{ origin: 'Jabo', originLabel: 'CGK', dest: 'Denpasar', hasData: true }]`, and give the mocked
comparison response's columns the new `kind` and `routes` fields.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "usePnl|groupComparison|PnlGroupComparisonView" --runInBand`
Expected: FAIL

- [ ] **Step 3: Change the hook**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, extend the column type and add the pick type:

```ts
export interface PnlGroupComparisonColumn {
  // A group column's id is its uuid; a route column's is `r:<origin>|<dest>`.
  id: string
  name: string
  routeCount: number
  kind: 'group' | 'route'
  // The pairs this column aggregates, straight from the response — so a clicked cell and the
  // overlap warning both read the same list the numbers came from.
  routes: { origin: string; originLabel: string; dest: string }[]
}

// One comparison column the user picked: a saved group, or a bare route.
export type PnlColumnPick =
  | { kind: 'group'; id: string }
  | { kind: 'route'; origin: string; dest: string }

export function columnsToParam(picks: PnlColumnPick[]): string {
  return picks
    .map((p) => (p.kind === 'group' ? `g:${p.id}` : `r:${p.origin}|${p.dest}`))
    .join(',')
}
```

and replace the query hook:

```ts
// Disabled until at least one column is picked, so an untouched tab makes no request at all.
// picks is part of the query key, so re-picking refetches without a manual invalidate.
export function usePnlGroupComparison(filter: PnlFilter | undefined, picks: PnlColumnPick[]) {
  return useQuery<PnlGroupComparison>({
    queryKey: ['pnl', 'group-comparison', filter, picks],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/group-comparison', {
          params: { ...filterToParams(filter!), columns: columnsToParam(picks) },
        })
        .then((r) => r.data),
    enabled: !!filter && picks.length > 0,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 4: Drive overlap off the response**

In `apps/frontend/src/features/pnl/utils/groupComparison.ts`, replace `overlappingRoutes` and drop
the now-unused `RouteGroup` import:

```ts
import { displayRouteLabel } from './routeLabels'

// Routes belonging to more than one of the selected columns. The comparison columns are
// deliberately independent, so a shared route contributes to every column that holds it and the
// columns do not sum to a period total. Surfacing the overlap stops the table being read as a
// partition. Computed from the response columns rather than the saved groups, so a bare route that
// duplicates a group member is caught by the same code.
export function overlappingRoutes(
  columns: PnlGroupComparisonColumn[],
): { route: string; groupNames: string[] }[] {
  const byRoute = new Map<string, string[]>()
  for (const column of columns) {
    for (const route of column.routes) {
      const label = displayRouteLabel(route)
      const names = byRoute.get(label)
      if (names) names.push(column.name)
      else byRoute.set(label, [column.name])
    }
  }
  return [...byRoute.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([route, groupNames]) => ({ route, groupNames }))
}
```

- [ ] **Step 5: Add the route picker to the view**

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx`:

```ts
import { MultiRouteFilter } from '@/components/shared/multi-route-filter'
import { useAvailableRoutes, useRouteGroups } from '@/features/route-groups/hooks/useRouteGroups'
import { PnlColumnPick, PnlFilter, usePnlGroupComparison } from '../hooks/usePnl'
import { buildRouteLabelIndex, labelsForRoutes, routesForLabels } from '../utils/routeLabels'
```

Replace the `selectedIds` state and `toggle` with:

```ts
  // Pick order is column order, so the array is appended to rather than re-sorted.
  const [picks, setPicks] = useState<PnlColumnPick[]>([])
  const { data: availableRoutes } = useAvailableRoutes()
  const { data, isLoading, isError, refetch } = usePnlGroupComparison(filter, picks)

  const routeIndex = buildRouteLabelIndex(availableRoutes ?? [])
  const pickedRoutes = picks.flatMap((p) => (p.kind === 'route' ? [{ origin: p.origin, dest: p.dest }] : []))

  const toggleGroup = (id: string) =>
    setPicks((prev) =>
      prev.some((p) => p.kind === 'group' && p.id === id)
        ? prev.filter((p) => !(p.kind === 'group' && p.id === id))
        : [...prev, { kind: 'group', id }],
    )

  // Routes are replaced wholesale by the dropdown, but the group picks keep their relative order:
  // dropping and re-adding every pick would silently reshuffle the columns.
  const setRouteLabels = (labels: string[]) => {
    const next = routesForLabels(labels, routeIndex)
    setPicks((prev) => {
      const kept = prev.filter(
        (p) => p.kind === 'group' || next.some((r) => r.origin === p.origin && r.dest === p.dest),
      )
      const added = next
        .filter((r) => !prev.some((p) => p.kind === 'route' && p.origin === r.origin && p.dest === r.dest))
        .map((r) => ({ kind: 'route' as const, origin: r.origin, dest: r.dest }))
      return [...kept, ...added]
    })
  }
```

Replace `const selectedGroups = ...` / `const overlaps = overlappingRoutes(selectedGroups)` with:

```ts
  const overlaps = overlappingRoutes(data?.columns ?? [])
```

In the picker card, change the group checkbox `checked` to
`picks.some((p) => p.kind === 'group' && p.id === group.id)` and its `onChange` to
`() => toggleGroup(group.id)`. Below the group row, add:

```tsx
        <p className="mb-2 mt-4 text-sm font-medium">Rute</p>
        <MultiRouteFilter
          className="w-[260px]"
          routes={routeIndex.labels}
          selected={labelsForRoutes(pickedRoutes)}
          onChange={setRouteLabels}
        />
```

Change the empty-selection branch from `selectedIds.length === 0` to `picks.length === 0`, and its
copy to `Pilih minimal satu group atau rute untuk melihat perbandingan.`

The "Belum ada Route Group" early return must no longer block the page: a user with no groups can
still compare bare routes. Change its condition to also require that no routes are available:

```tsx
  if ((groups ?? []).length === 0 && (availableRoutes ?? []).length === 0) {
```

and reword its copy to:

```tsx
        <p className="text-sm text-muted-foreground">
          <span>Belum ada Route Group maupun rute yang bisa dibandingkan.</span>{' '}
          <Link href="/route-groups" className="text-primary underline">
            Buat satu dulu
          </Link>
          <span>.</span>
        </p>
```

If there are no groups but there are routes, render the picker card with only the Rute section —
guard the group `<p>`/checkbox row on `(groups ?? []).length > 0`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "usePnl|groupComparison|PnlGroupComparisonView" --runInBand`
Expected: PASS

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl
git commit -m "feat(pnl): compare bare routes alongside route groups"
```

---

## Task 12: Group Comparison cell warnings

Delivers spec item 1 for Group Comparison. Comes before the click-through rework so the table has a
`warnings` field to render before Task 13 rebuilds the cells around it.

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts` — `PnlGroupComparisonCell`, `PnlGroupComparisonFooter`
- Modify: `apps/frontend/src/features/pnl/utils/groupComparison.ts` — `ComparisonRowModel`, `ComparisonFooterRowModel`, `toComparisonTable`
- Modify: `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`
- Modify: `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx` + `.spec.tsx`

**Interfaces:**
- Consumes: `CellWarning`, `hasWarning`, `warningTooltip` (Task 8); `PnlCellIssue` (Task 9)
- Produces: `ComparisonRowModel.warnings: CellWarning[]`; `ComparisonFooterRowModel.warnings: CellWarning[] | null`

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`, add `issues` to every cell and
footer of the fixture — `issues: []` everywhere except the first cell of the first column, which gets
`issues: [{ issue: 'no_booking', awbs: 2 }]`, and that column's footer, which gets
`issues: [{ issue: 'no_booking', awbs: 4 }]`. Then add:

```ts
describe('toComparisonTable warnings', () => {
  it('pairs each cell issue list with its incomplete-cost count', () => {
    const model = toComparisonTable(data)
    expect(model.rows[0].warnings[0]).toEqual({
      issues: [{ issue: 'no_booking', awbs: 2 }],
      incompleteTos: 3,
    })
  })

  it('gives an absent cell a clean warning rather than undefined', () => {
    const model = toComparisonTable(data)
    expect(model.rows[0].warnings[1]).toEqual({ issues: [], incompleteTos: 0 })
  })

  it('warns on the Total row but not on Avg / Day', () => {
    // An average has no set of AWBs behind it, so there is nothing for a warning to point at.
    const model = toComparisonTable(data)
    expect(model.footerRows[0].warnings?.[0]).toEqual({
      issues: [{ issue: 'no_booking', awbs: 4 }],
      incompleteTos: 3,
    })
    expect(model.footerRows[1].warnings).toBeNull()
  })
})
```

The `incompleteTos` numbers above must match whatever the existing fixture already sets; read it and
use its values rather than inventing new ones.

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.spec.tsx`, replace every
`incompleteTos: [a, b]` in the fixture with
`warnings: [{ issues: [], incompleteTos: a }, { issues: [], incompleteTos: b }]`, rewrite whatever
test asserted the `•` marker, and add:

```tsx
  it('paints a warned cost cell amber and explains it in the title', () => {
    render(<PnlGroupComparisonTable model={baseModel()} />)
    const warned = screen.getByTestId('cost-2026-05-02-g1')
    expect(warned.closest('td')!.className).toContain('bg-amber-100')
    expect(warned.getAttribute('title')).toBe(
      'Lihat rincian SMU, RA, SG Out, SG In — 3 TO belum ada cost',
    )
  })

  it('leaves a clean cost cell untinted', () => {
    render(<PnlGroupComparisonTable model={baseModel()} />)
    expect(screen.getByTestId('cost-2026-05-02-g2').closest('td')!.className).not.toContain(
      'bg-amber-100',
    )
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "groupComparison|PnlGroupComparisonTable" --runInBand`
Expected: FAIL

- [ ] **Step 3: Add issues to the hook types**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, add `issues: PnlCellIssue[]` to
`PnlGroupComparisonCell` and to `PnlGroupComparisonFooter`.

- [ ] **Step 4: Project the warnings**

In `apps/frontend/src/features/pnl/utils/groupComparison.ts`, add
`import { CellWarning } from './cellWarning'`, replace `incompleteTos: number[]` on
`ComparisonRowModel` with `warnings: CellWarning[]`, and replace `incompleteTos: number[] | null` on
`ComparisonFooterRowModel` with:

```ts
  warnings: CellWarning[] | null // null = this row has no AWBs behind it
```

In `toComparisonTable`, replace the row's `incompleteTos` line with:

```ts
      warnings: row.cells.map((c) =>
        c ? { issues: c.issues, incompleteTos: c.incompleteTos } : { issues: [], incompleteTos: 0 },
      ),
```

On the `Total` footer row, replace `incompleteTos: data.footer.map((f) => f.incompleteTos),` with:

```ts
      warnings: data.footer.map((f) => ({ issues: f.issues, incompleteTos: f.incompleteTos })),
```

and on the `Avg / Day` row, replace `incompleteTos: null,` with `warnings: null,`.

- [ ] **Step 5: Tint the cells**

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx`, add:

```ts
import { CellWarning, hasWarning, warningTooltip } from '../utils/cellWarning'
```

Delete `incompleteTooltip` and replace `costCellTitle` with:

```ts
function costCellTitle(warning: CellWarning | undefined): string {
  const hint = 'Lihat rincian SMU, RA, SG Out, SG In'
  const tooltip = warningTooltip(warning)
  return tooltip ? `${hint} — ${tooltip}` : hint
}
```

In the body row, replace the cost cell with:

```tsx
                    {row.cost.map((value, i) => {
                      const warning = row.warnings[i]
                      return (
                        <td
                          key={`cost-${i}`}
                          className={`border-b border-l p-0 ${hasWarning(warning) ? 'bg-amber-100 dark:bg-amber-950/40' : ''}`}
                        >
                          <button
                            type="button"
                            data-testid={`cost-${row.date}-${model.columns[i].id}`}
                            title={costCellTitle(warning)}
                            aria-expanded={openDates.has(row.date)}
                            className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                            onClick={() => toggle(row.date)}
                          >
                            {formatValue(value)}
                          </button>
                        </td>
                      )
                    })}
```

and tint the revenue cell the same way:

```tsx
                    {row.revenue.map((value, i) => (
                      <td
                        key={`rev-${i}`}
                        data-testid={`revenue-${row.date}-${model.columns[i].id}`}
                        title={warningTooltip(row.warnings[i])}
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${hasWarning(row.warnings[i]) ? 'bg-amber-100 dark:bg-amber-950/40' : ''}`}
                      >
                        {formatValue(value)}
                      </td>
                    ))}
```

In the footer, change `footerRow.incompleteTos?.[ci] ?? 0` to `footerRow.warnings?.[ci]` wherever it
appears, feed that to `costCellTitle` and `hasWarning`, and tint both the revenue and the cost
footer `<td>` the same way. The amber `•` markers are gone everywhere — the background is the marker.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "groupComparison|PnlGroupComparison" --runInBand`
Expected: PASS

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/pnl
git commit -m "feat(pnl): colour the comparison cells whose numbers are unreliable"
```

---

## Task 13: Clickable Group Comparison cells

Delivers spec item 3.

**Files:**
- Modify: `apps/frontend/src/features/pnl/utils/groupComparison.ts` — `routeFromComparisonCell`
- Modify: `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`
- Modify: `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx` + `.spec.tsx`
- Modify: `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx` + `.spec.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx` + `.spec.tsx`

**Interfaces:**
- Consumes: `PnlGroupComparisonColumn.routes` (Task 11); `PnlRouteFilter` (Task 9); `CellWarning`, `hasWarning`, `warningTooltip` (Task 8)
- Produces: `routeFromComparisonCell(column: PnlGroupComparisonColumn, date: string): PnlRouteFilter`; `PnlGroupComparisonTable({ model, onCellClick })` where `onCellClick?: (column: PnlGroupComparisonColumn, date: string) => void`; `PnlGroupComparisonView({ filter, onCellClick })` where `onCellClick?: (route: PnlRouteFilter) => void`

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/features/pnl/utils/groupComparison.spec.ts`, add:

```ts
describe('routeFromComparisonCell', () => {
  it('carries every route of a group column into one drilldown filter', () => {
    const route = routeFromComparisonCell(
      {
        id: 'g1', name: 'Kalimantan', routeCount: 2, kind: 'group',
        routes: [
          { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' },
          { origin: 'Surabaya', originLabel: 'SUB', dest: 'Pontianak' },
        ],
      },
      '2026-05-01',
    )
    expect(route).toEqual({
      routes: [
        { origin: 'Jabo', dest: 'Aceh' },
        { origin: 'Surabaya', dest: 'Pontianak' },
      ],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    })
  })

  it('narrows a bare route column to its single pair', () => {
    const route = routeFromComparisonCell(
      {
        id: 'r:Jabo|Denpasar', name: 'CGK → Denpasar', routeCount: 1, kind: 'route',
        routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Denpasar' }],
      },
      '2026-05-02',
    )
    expect(route).toEqual({
      routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      dateFrom: '2026-05-02',
      dateTo: '2026-05-02',
    })
  })
})
```

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.spec.tsx`, give the fixture
columns the `kind` and `routes` fields, rewrite the expand tests, and add the click tests:

```tsx
  it('expands the cost detail from a chevron on the date, not from a cost cell', () => {
    // The detail rows always covered every column, so the toggle belongs to the row. Leaving it on
    // a cost cell would make one column's cell silently control all of them.
    render(<PnlGroupComparisonTable model={baseModel()} />)
    expect(screen.queryByTestId('detail-2026-05-01-costSmu')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rincian cost 1-May-2026' }))
    expect(screen.getByTestId('detail-2026-05-01-costSmu')).toBeInTheDocument()
  })

  it('expands the Total footer row from its own chevron', () => {
    render(<PnlGroupComparisonTable model={baseModel()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rincian cost Total' }))
    expect(screen.getByTestId('detail-__footer__-costSmu')).toBeInTheDocument()
  })

  it('reports the column and date behind a clicked revenue or cost cell', () => {
    const onCellClick = jest.fn()
    render(<PnlGroupComparisonTable model={baseModel()} onCellClick={onCellClick} />)

    fireEvent.click(screen.getByTestId('revenue-2026-05-01-g1'))
    expect(onCellClick).toHaveBeenLastCalledWith(columns[0], '2026-05-01')

    fireEvent.click(screen.getByTestId('cost-2026-05-02-g2'))
    expect(onCellClick).toHaveBeenLastCalledWith(columns[1], '2026-05-02')
  })

  it('leaves the value cells inert when no handler is given', () => {
    render(<PnlGroupComparisonTable model={baseModel()} />)
    expect(screen.getByTestId('revenue-2026-05-01-g1').tagName).toBe('TD')
  })

  it('never turns a footer value into a drilldown button', () => {
    // The footer spans the whole period; the Total chevron is the only button it owns.
    render(<PnlGroupComparisonTable model={baseModel()} onCellClick={jest.fn()} />)
    expect(screen.queryByTestId('cost-__footer__-g1')).not.toBeInTheDocument()
  })

  it('still explains a warning through the clickable cell title', () => {
    render(<PnlGroupComparisonTable model={baseModel()} onCellClick={jest.fn()} />)
    expect(screen.getByTestId('cost-2026-05-02-g1').getAttribute('title')).toBe(
      'Lihat AWB kolom ini pada tanggal ini — 3 TO belum ada cost',
    )
  })
```

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.spec.tsx`, add:

```tsx
  it('passes a clicked cell up as a route filter for that column and date', () => {
    const onCellClick = jest.fn()
    renderView({ onCellClick })
    fireEvent.click(screen.getByRole('checkbox', { name: /Kalimantan/ }))
    fireEvent.click(screen.getByTestId('revenue-2026-05-01-g1'))
    expect(onCellClick).toHaveBeenCalledWith({
      routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    })
  })
```

Adapt `renderView` to accept props. The mocked comparison response's `g1` column must carry
`routes: [{ origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh' }]` and a `2026-05-01` row.

In `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx`, add a `PnlGroupComparisonView` stub beside
the existing `PnlDailyMatrixView` stub — one button labelled `comparison-cell` that calls
`onCellClick` with a fixed `PnlRouteFilter` — plus:

```tsx
  it('switches to Estimated and applies a clicked comparison cell as the drilldown route', () => {
    // Same wiring as the Daily Report cell: without it the click leaves the user on the comparison
    // tab with nothing visibly changed.
    renderPage({ permissions: ['read.pnl', 'read.route_group'] })
    fireEvent.click(screen.getByRole('button', { name: 'Group Comparison' }))
    fireEvent.click(screen.getByRole('button', { name: 'comparison-cell' }))

    expect(screen.getByText('Estimated').className).toContain('bg-primary')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent(
      JSON.stringify({
        routes: [{ origin: 'Jabo', dest: 'Aceh' }],
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
      }),
    )
  })
```

Read the existing Daily Report click test first and reuse its `PnlAwbDrilldown` stub and its way of
asserting the applied route and the active tab, rather than inventing `drilldown-route` if that spec
names things differently. Likewise reuse its `renderPage` helper and extend it with `permissions` if
it does not already take them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "groupComparison|PnlGroupComparison|pnl/page" --runInBand`
Expected: FAIL

- [ ] **Step 3: Add the cell-to-filter projection**

Append to `apps/frontend/src/features/pnl/utils/groupComparison.ts`:

```ts
// A clicked comparison cell as an AWB drilldown filter. A group column carries every route it
// aggregates, so the drilldown answers exactly the question the cell did — for that one day.
export function routeFromComparisonCell(
  column: PnlGroupComparisonColumn,
  date: string,
): PnlRouteFilter {
  return {
    routes: column.routes.map((r) => ({ origin: r.origin, dest: r.dest })),
    dateFrom: date,
    dateTo: date,
  }
}
```

and add `PnlRouteFilter` to that file's import from `../hooks/usePnl`.

- [ ] **Step 4: Move the chevron onto the date**

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx`, add:

```ts
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PnlGroupComparisonColumn } from '../hooks/usePnl'
```

and a shared date cell above the component:

```tsx
// The expand toggle lives on the date, not on a cost cell: the detail rows it opens always covered
// every column, so a per-cell toggle claimed a scope it never had.
function DateCell({
  label,
  open,
  onToggle,
  className,
}: {
  label: string
  open: boolean
  onToggle: () => void
  className: string
}) {
  return (
    <td className={`sticky left-0 z-10 whitespace-nowrap border-b border-r p-0 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Rincian cost ${label}`}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-left hover:bg-primary/10"
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
    </td>
  )
}
```

Replace the body row's date `<td>` with:

```tsx
                  <DateCell
                    label={formatDayLabel(row.date)}
                    open={openDates.has(row.date)}
                    onToggle={() => toggle(row.date)}
                    className={striped ? 'bg-muted/30' : 'bg-card'}
                  />
```

In the footer, a row that has `components` gets the same `DateCell` with `label={footerRow.label}`,
`open={openDates.has(FOOTER_KEY)}`, `onToggle={() => toggle(FOOTER_KEY)}` and
`className="bg-card text-right"`; a row without `components` keeps its plain `<td>`.

- [ ] **Step 5: Make both value columns clickable**

Add the props:

```ts
interface PnlGroupComparisonTableProps {
  model: ComparisonTableModel
  // When given, every value cell becomes a button — including empty ones, which are a valid answer
  // ("nothing flew these routes that day"). Footer cells stay inert: they span the whole period.
  onCellClick?: (column: PnlGroupComparisonColumn, date: string) => void
}
```

Replace `costCellTitle` with one title shared by both value columns, since Revenue and Cost now do
the same thing:

```ts
function cellTitle(warning: CellWarning | undefined): string {
  const hint = 'Lihat AWB kolom ini pada tanggal ini'
  const tooltip = warningTooltip(warning)
  return tooltip ? `${hint} — ${tooltip}` : hint
}
```

Replace the body row's two separate revenue and cost maps with one loop over both fields, so they
cannot drift apart:

```tsx
                    {(['revenue', 'cost'] as const).flatMap((field) =>
                      row[field].map((value, i) => {
                        const warning = row.warnings[i]
                        const tint = hasWarning(warning) ? 'bg-amber-100 dark:bg-amber-950/40' : ''
                        const testId = `${field}-${row.date}-${model.columns[i].id}`
                        return onCellClick ? (
                          <td key={testId} className={`border-b border-l p-0 ${tint}`}>
                            <button
                              type="button"
                              data-testid={testId}
                              title={cellTitle(warning)}
                              className="w-full px-3 py-1.5 text-right hover:bg-primary/10"
                              onClick={() => onCellClick(model.columns[i], row.date)}
                            >
                              {formatValue(value)}
                            </button>
                          </td>
                        ) : (
                          <td
                            key={testId}
                            data-testid={testId}
                            title={warningTooltip(warning)}
                            className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${tint}`}
                          >
                            {formatValue(value)}
                          </td>
                        )
                      }),
                    )}
```

In the footer, replace the cost `<td>` that still renders a button with a plain, inert `<td>` — same
`warningTooltip` title and amber tint as the revenue footer cell. No footer value is a button any
more; only the Total row's `DateCell` is.

- [ ] **Step 6: Wire the view and the page**

In `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx`:

```ts
interface PnlGroupComparisonViewProps {
  filter: PnlFilter
  onCellClick?: (route: PnlRouteFilter) => void
}
```

```tsx
          <PnlGroupComparisonTable
            model={toComparisonTable(data)}
            onCellClick={
              onCellClick
                ? (column, date) => onCellClick(routeFromComparisonCell(column, date))
                : undefined
            }
          />
```

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, factor the shared tail out of the existing
`handleCellClick` and add the second handler:

```tsx
  // The page period, KPIs, chart and breakdowns keep showing the whole cycle; only the drilldown
  // narrows, which is what makes it readable as a subset of them.
  function applyDrilldownRoute(route: PnlRouteFilter) {
    setDrilldownRoute(route)
    setView('estimate')
    // Runs after the Estimated tab has mounted the drilldown.
    requestAnimationFrame(() => {
      drilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function handleCellClick(column: PnlDailyMatrixColumn, date: string) {
    applyDrilldownRoute(routeFromCell(column, date))
  }
```

and pass the handler to the comparison view:

```tsx
        filter && hasPermission('read.route_group') && (
          <PnlGroupComparisonView filter={filter} onCellClick={applyDrilldownRoute} />
        )
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest "groupComparison|PnlGroupComparison|pnl/page" --runInBand`
Expected: PASS

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(pnl): jump from a comparison cell into the AWB drilldown"
```

---

## Task 14: Full verification

No new behaviour. This is the gate before the branch is offered for review.

**Files:** none changed unless a failure demands it.

- [ ] **Step 1: Backend type gate, build and full suite**

Run: `cd apps/backend && pnpm exec tsc --noEmit`
Expected: no errors

Run: `cd apps/backend && pnpm build`
Expected: no errors

Run: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest --runInBand`
Expected: all suites pass. The pre-change baseline is 632 passed / 1 skipped / 0 failed. Suites
failing with zero individual test failures is the OOM signature, not a real failure.

- [ ] **Step 2: Frontend type gate and full suite**

Run: `cd apps/frontend && pnpm exec tsc --noEmit`
Expected: no errors

Run: `cd apps/frontend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest --runInBand`
Expected: all suites pass. The pre-change baseline is 152 passed / 0 failed.

Do **not** run `next lint` as a gate — it has a pre-existing unrelated error.

- [ ] **Step 3: Confirm the old params are gone**

Run: `grep -rn "groupIds\|routeToParams(route)\.origin\|incompleteTos: null" apps/backend/src apps/frontend/src`
Expected: no output. Any hit is a leftover from the replaced parameter shapes.

- [ ] **Step 4: Measure the two new queries**

The spec flags query cost as the main risk. Against a real database, run `EXPLAIN ANALYZE` on the
`daily-matrix` and `group-comparison` issue queries for a full 2H cycle and compare total time to
the existing fact queries. Record the numbers in the commit body. If the issue query is more than
roughly twice its fact query, stop and report rather than merging — do not silently accept it.

- [ ] **Step 5: Manual smoke**

Run the app (`pnpm dev` at the repo root) and confirm, on the P&L page:

1. Daily Report — a cell with an issue is amber in **both** the Revenue and the Profit Margin table, its tooltip names the issue types with per-issue AWB counts, and a negative amber cell still shows red text.
2. Estimated — the Rute dropdown lists `Jabo → Denpasar` style labels, ticking two routes narrows the drilldown to both, and Reset clears routes and dates together.
3. Group Comparison — a route can be picked without any group; columns appear in pick order; the overlap notice names a bare route that duplicates a group member.
4. Group Comparison — the date chevron expands the cost breakdown, clicking a Revenue or Cost cell lands on the Estimated tab with that column's routes and that date in the filter, and footer cells do nothing.

- [ ] **Step 6: Commit anything the smoke test forced**

If steps 1–5 required no change, there is nothing to commit; say so rather than making an empty
commit.

---

## Spec Coverage

| Spec section | Task |
|---|---|
| 1 — warning definition (`PnlCellIssue`, `incompleteTos`, drop the `•`) | 1, 2, 5, 8, 10, 12 |
| 2a — daily-matrix issue counts | 2 |
| 2b — awb-drilldown `routes` param | 3, 4 |
| 2c — group-comparison `columns` param, column `kind`/`routes`, cell issues | 3, 5 |
| 3a — shared `MultiRouteFilter` | 6 |
| 3b — two route label forms | 7 |
| 3c — `PnlRouteFilter.routes`, `routeToParams` | 9 |
| 3d — drilldown multi-route UI on `/pnl/stations` | 9 |
| 3e — amber cells, tooltip, red-text degradation, footer treatment | 8, 10, 12 |
| 3f — chevron on Date, clickable Revenue and Cost, inert footer | 13 |
| 3g — bare route picks, `ColumnPick` order, overlap off the response | 11 |
| 3h — `page.tsx` handlers | 9, 13 |
| 4 — test plan | every task's TDD steps |
| Risks — query cost measurement | 14 |
