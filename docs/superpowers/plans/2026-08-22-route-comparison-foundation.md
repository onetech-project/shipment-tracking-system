# Route Comparison Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Group Comparison tab to Route Comparison, generalise its table model so a second tab can reuse it, add a Margin column, and keep the user's picks alive across tab switches.

**Architecture:** The PnL page is one Next.js client route with a `useState` tab switch that unmounts the inactive tab. The comparison table is a dumb renderer over index-aligned parallel arrays produced by a projection function. This plan (a) adds an aliased backend route so the rename can ship across a rolling deploy, (b) splits the projection module into a shared model and a route-specific projection, (c) generalises the renderer's row axis from `date` to an opaque `rowKey` and its column type to a structural minimum, (d) adds Margin as a third column block, and (e) lifts the pick state up to the page.

**Tech Stack:** NestJS 10 + raw SQL over a Postgres materialized view (`v_pnl_to`); Next.js 14 App Router + React 18 + @tanstack/react-query; Jest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md`](../specs/2026-08-22-pnl-vendor-comparison-design.md)

**Scope note:** This is plan 1 of 3. Plan 2 is Vendor Group CRUD (independent). Plan 3 is the Vendor Comparison tab (depends on both). Everything this plan builds must leave the app shippable on its own.

## Global Constraints

- Revenue stays **gross**: `COALESCE(SUM(revenue_total),0)`. Do not net the discount out of it.
- Margin is `COALESCE(SUM(revenue_total),0) - COALESCE(SUM(revenue_discount),0) - COALESCE(SUM(cost_to),0)` — character-identical to the Daily Report expression at `apps/backend/src/modules/pnl/pnl.service.ts:899-900`. It is **not** `SUM(gross_profit_to)`.
- Every new response field is read on the frontend with a `?? ` fallback. Frontend and backend deploy in parallel; a new frontend must survive an old backend.
- Do **not** rename the permission `read.route_group`. Permissions are insert-only at boot (`apps/backend/src/modules/permissions/permissions.service.ts:19-33`); renaming the enum member orphans the existing row and silently revokes access from every role that has it.
- Do **not** rename the sidebar menu "Route Group", the `/route-groups` page, or the backend `route-groups` module. Only the comparison tab is renamed.
- Backend tests: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`. The heap bump *and* `--runInBand` are both required; either alone core-dumps.
- Frontend tests: `cd apps/frontend && pnpm exec jest <pattern>`.
- Type gate: `pnpm exec tsc --noEmit` in the app you changed.
- `next lint` already fails on seven pre-existing files and is **not** a gate. Do not try to fix it.
- Indonesian is used for explanatory copy, English for structural labels. Match the surrounding file.

---

## File Structure

**Backend**

| File | Responsibility | Change |
|---|---|---|
| `apps/backend/src/modules/pnl/pnl.controller.ts` | HTTP routes | Modify — route array alias |
| `apps/backend/src/modules/pnl/pnl.service.ts` | SQL + response shaping | Modify — margin in cell, footer, SQL |
| `apps/backend/src/modules/pnl/pnl.controller.spec.ts` | Controller tests | Modify — route metadata assertion |
| `apps/backend/src/modules/pnl/pnl.service.spec.ts` | Service tests | Modify — margin |

**Frontend — the projection module is split by responsibility**

| File | Responsibility | Change |
|---|---|---|
| `apps/frontend/src/features/pnl/utils/comparison.ts` | Axis-agnostic table model: `ComparisonColumn`, `ComparisonRowModel`, `ComparisonFooterRowModel`, `ComparisonTableModel`, `COST_COMPONENTS`, `CLEAN` | **Create** |
| `apps/frontend/src/features/pnl/utils/routeComparison.ts` | Route-axis projection: `toRouteComparisonTable`, `overlappingRoutes`, `routeFromComparisonCell` | **Create** (from `groupComparison.ts`) |
| `apps/frontend/src/features/pnl/utils/groupComparison.ts` | — | **Delete** |
| `apps/frontend/src/features/pnl/components/PnlComparisonTable.tsx` | Shared dumb renderer | **Create** (from `PnlGroupComparisonTable.tsx`) |
| `apps/frontend/src/features/pnl/components/PnlRouteComparisonView.tsx` | Route tab: pickers, banners, wiring | **Create** (from `PnlGroupComparisonView.tsx`) |
| `apps/frontend/src/features/pnl/hooks/usePnl.ts` | Wire types + queries | Modify |
| `apps/frontend/src/app/(dashboard)/pnl/page.tsx` | Tab switch + lifted state | Modify |

Splitting `groupComparison.ts` in two is a deliberate refinement of the spec, which named only `utils/routeComparison.ts`. Plan 3 adds `utils/vendorComparison.ts` alongside it; leaving the shared model inside a route-named file would force Plan 3 to import route-specific code for types it does not use.

---

### Task 1: Backend serves the comparison endpoint under both paths

The alias protects an **old frontend against a new backend**. It must be deployed and fully rolled out *before* the frontend build that switches paths ships, or a new frontend hits an old backend and 404s.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts:169`
- Test: `apps/backend/src/modules/pnl/pnl.controller.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `GET /api/pnl/breakdown/route-comparison` with identical behaviour to `GET /api/pnl/breakdown/group-comparison`.

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/modules/pnl/pnl.controller.spec.ts`:

```ts
import { PATH_METADATA } from '@nestjs/common/constants'

describe('route aliases', () => {
  it('serves the comparison endpoint under both the new and the legacy path', () => {
    const paths = Reflect.getMetadata(
      PATH_METADATA,
      PnlController.prototype.getGroupComparison,
    )

    expect(paths).toEqual(
      expect.arrayContaining(['breakdown/route-comparison', 'breakdown/group-comparison']),
    )
  })
})
```

Note the assertion targets route **metadata**, not a call. `pnl.controller.spec.ts` invokes controller methods directly and never exercises Nest's routing table, so a behavioural test here could not tell the two paths apart.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.controller.spec --runInBand
```

Expected: FAIL — `paths` is the string `'breakdown/group-comparison'`, and `arrayContaining` on a string fails.

- [ ] **Step 3: Change the decorator to a path array**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, replace line 169:

```ts
  @Get('breakdown/group-comparison')
```

with:

```ts
  // Two paths, one handler. `group-comparison` is the legacy name kept alive for one release so a
  // frontend that has not yet been redeployed keeps working — frontend and backend roll out in
  // parallel. Remove the legacy entry only after the release carrying the rename is fully out.
  @Get(['breakdown/route-comparison', 'breakdown/group-comparison'])
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.controller.spec --runInBand
```

Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl.controller.ts apps/backend/src/modules/pnl/pnl.controller.spec.ts
git commit -m "feat(pnl): serve the comparison endpoint under its new route-comparison path"
```

---

### Task 2: Backend returns margin on every comparison cell and footer

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:199-233` (types), `:1090-1116` (SQL), `:1155-1202` (shaping)
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: Task 1's handler.
- Produces: `PnlGroupComparisonCell.margin: number`, `PnlGroupComparisonFooter.totalMargin: number`, `PnlGroupComparisonFooter.avgMarginPerDay: number`.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, inside the existing `getGroupComparison` describe block. Follow the mocking style already used there for `dataSource.query`:

```ts
it('reports margin as revenue minus discount minus cost, matching the Daily Report expression', async () => {
  // One column, one day. revenue 1000, discount 15, cost 600 -> margin 385.
  const factRows = [
    {
      d: '2026-05-01',
      col_idx: 0,
      revenue: '1000',
      margin: '385',
      cost: '600',
      cost_smu: '600',
      cost_ra: '0',
      cost_sg_out: '0',
      cost_sg_in: '0',
      incomplete_tos: 0,
    },
  ]

  jest
    .spyOn(dataSource, 'query')
    .mockResolvedValueOnce([{ id: 'g1', name: 'Group 1', origin_station: 'Jakarta', dest_station: 'SUB' }])
    .mockResolvedValueOnce(factRows)
    .mockResolvedValueOnce([])

  const result = await service.getGroupComparison(
    [{ kind: 'group', id: 'g1' }],
    '2026-05-1H',
    undefined,
    undefined,
    'ata_vendor_wh_destination',
  )

  expect(result.rows.find((r) => r.date === '2026-05-01')!.cells[0]!.margin).toBe(385)
  expect(result.footer[0].totalMargin).toBe(385)
})

it('selects margin with the same expression the daily matrix uses', async () => {
  const spy = jest
    .spyOn(dataSource, 'query')
    .mockResolvedValueOnce([{ id: 'g1', name: 'Group 1', origin_station: 'Jakarta', dest_station: 'SUB' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])

  await service.getGroupComparison(
    [{ kind: 'group', id: 'g1' }],
    '2026-05-1H',
    undefined,
    undefined,
    'ata_vendor_wh_destination',
  )

  const factSql = spy.mock.calls[1][0] as string
  // Gross revenue is unchanged; margin nets the discount. Written as one normalised string so
  // whitespace in the SQL literal cannot make the assertion pass or fail by accident.
  const normalised = factSql.replace(/\s+/g, ' ')
  expect(normalised).toContain('COALESCE(SUM(v.revenue_total), 0) AS revenue')
  expect(normalised).toContain('- COALESCE(SUM(v.revenue_discount), 0) - COALESCE(SUM(v.cost_to), 0) AS margin')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service.spec -t "margin" --runInBand
```

Expected: FAIL — `margin` is `undefined` on the cell, and the SQL contains no `AS margin`.

- [ ] **Step 3: Add margin to the response types**

In `apps/backend/src/modules/pnl/pnl.service.ts`, in `PnlGroupComparisonCell` (starts at `:199`), add after `cost`:

```ts
  // revenue_total - revenue_discount - cost_to, exactly the expression getDailyMatrix uses, so the
  // same route and period reads the same in both tabs. NOT SUM(gross_profit_to): that view column
  // is NULL-propagating while COALESCE(SUM(...)) skips NULL rows, and the two differ by ~75x on
  // current data because most TOs have no computable cost.
  margin: number
```

In `PnlGroupComparisonFooter` (starts at `:221`), add after `totalCost`:

```ts
  totalMargin: number
```

and after `avgCostPerDay`:

```ts
  avgMarginPerDay: number
```

- [ ] **Step 4: Add margin to the fact query**

In `getGroupComparison`, in the fact query (around `:1093`), insert a line directly after the `AS cost` line:

```sql
          COALESCE(SUM(v.revenue_total), 0)
            - COALESCE(SUM(v.revenue_discount), 0)
            - COALESCE(SUM(v.cost_to), 0)                              AS margin,
```

Leave the existing `AS revenue` line untouched — Revenue stays gross.

- [ ] **Step 5: Shape margin into cells and footer**

In the cell assignment (around `:1160`), add after `cost: Number(factRow.cost),`:

```ts
        margin: Number(factRow.margin),
```

In the footer reducer (starts `:1170`), add the accumulator beside `totalCost`:

```ts
      let totalMargin = 0
```

add inside the row loop after `totalCost += cell.cost`:

```ts
        totalMargin += cell.margin
```

and add to the returned object, after `totalCost,`:

```ts
        totalMargin,
```

and after `avgCostPerDay: totalCost / periodDays,`:

```ts
        avgMarginPerDay: totalMargin / periodDays,
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl --runInBand
```

Expected: PASS, including the pre-existing `pnl-group-comparison.integration.spec.ts` (it skips itself without a database).

- [ ] **Step 7: Typecheck and commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): return margin with every comparison cell and footer"
```

---

### Task 3: Rename the frontend comparison files and identifiers

Pure rename — no behaviour changes. Doing it before the refactor keeps Tasks 4-7 from writing new code into files that are about to move.

**Files:**
- Rename: `apps/frontend/src/features/pnl/components/PnlGroupComparisonView.tsx` → `PnlRouteComparisonView.tsx` (+ `.spec.tsx`)
- Rename: `apps/frontend/src/features/pnl/components/PnlGroupComparisonTable.tsx` → `PnlComparisonTable.tsx` (+ `.spec.tsx`)
- Rename: `apps/frontend/src/features/pnl/utils/groupComparison.ts` → `utils/routeComparison.ts` (+ `.spec.ts`)
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts:463-476`
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx` (`:25`, `:64`, `:70`, `:104`, `:178-183`, `:286`)
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx`

**Interfaces:**
- Consumes: Task 1's `route-comparison` path.
- Produces: `PnlRouteComparisonView`, `PnlComparisonTable`, `usePnlRouteComparison`, view key `'routes'`, exported constant `ROUTE_COMPARISON_LABEL`.

- [ ] **Step 1: Move the files with git so history follows**

```bash
cd /home/faris/code/esp/esp-dashboard/apps/frontend/src/features/pnl
git mv components/PnlGroupComparisonView.tsx components/PnlRouteComparisonView.tsx
git mv components/PnlGroupComparisonView.spec.tsx components/PnlRouteComparisonView.spec.tsx
git mv components/PnlGroupComparisonTable.tsx components/PnlComparisonTable.tsx
git mv components/PnlGroupComparisonTable.spec.tsx components/PnlComparisonTable.spec.tsx
git mv utils/groupComparison.ts utils/routeComparison.ts
git mv utils/groupComparison.spec.ts utils/routeComparison.spec.ts
```

- [ ] **Step 2: Rename the identifiers**

In the renamed files and their importers, apply exactly these renames. Do **not** rename `PnlGroupComparison*` wire types in this task — they are the HTTP contract and move in Task 5.

| From | To |
|---|---|
| `PnlGroupComparisonView` | `PnlRouteComparisonView` |
| `PnlGroupComparisonViewProps` | `PnlRouteComparisonViewProps` |
| `PnlGroupComparisonTable` | `PnlComparisonTable` |
| `PnlGroupComparisonTableProps` | `PnlComparisonTableProps` |
| `usePnlGroupComparison` | `usePnlRouteComparison` |
| import path `'../utils/groupComparison'` | `'../utils/routeComparison'` |

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, change the query key and the request path (`:464`, `:468`):

```ts
    queryKey: ['pnl', 'route-comparison', filter, picks],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/route-comparison', {
```

- [ ] **Step 3: Change the view key and export the tab label**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, change the `PnlView` union (`:64`) and every `'groups'` literal (`:70`, `:104`, `:178`, `:179`, `:286`) to `'routes'`.

Add near the top of the file, beside `VIEW_SUBTITLE`:

```ts
// Exported so a rename touches one place. The jest specs assert this exact string.
export const ROUTE_COMPARISON_LABEL = 'Route Comparison'
```

Update `VIEW_SUBTITLE` (`:66-71`):

```ts
const VIEW_SUBTITLE: Record<PnlView, string> = {
  estimate: 'Estimated P&L based on arrival date — not yet billed',
  actual: 'Actual revenue from settled invoices vs estimate',
  daily: 'Daily revenue and profit margin per origin and destination',
  routes: 'Revenue, cost and margin per date, compared across routes and route groups',
}
```

and the tab button label (`:182`) to `{ROUTE_COMPARISON_LABEL}`.

- [ ] **Step 4: Update the Indonesian copy inside the tab**

In `PnlRouteComparisonView.tsx`, change these strings. The picker still lists Route Groups, so the heading keeps the word Group; only the tab is renamed.

| Line | From | To |
|---|---|---|
| `:67` | `Failed to load Route Groups.` | unchanged |
| `:83` | `Belum ada Route Group maupun rute yang bisa dibandingkan.` | unchanged |
| `:98` | `Group` | `Route Group` |

- [ ] **Step 5: Update the specs' literals**

In `page.spec.tsx`, replace every `'Group Comparison'` with `'Route Comparison'` (`:153`, `:201`, `:207`, and the mock at `:69-70`). In `PnlRouteComparisonView.spec.tsx`, update the text matchers at `:50`, `:210`, `:219`, `:227`, `:236`, `:369`.

- [ ] **Step 6: Run the frontend suite**

```bash
cd apps/frontend && pnpm exec jest pnl
```

Expected: PASS — same test count as before the rename.

- [ ] **Step 7: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add -A apps/frontend/src
git commit -m "refactor(pnl): rename the Group Comparison tab to Route Comparison"
```

---

### Task 4: Split the projection module and generalise the row axis

**Files:**
- Create: `apps/frontend/src/features/pnl/utils/comparison.ts`
- Modify: `apps/frontend/src/features/pnl/utils/routeComparison.ts`
- Modify: `apps/frontend/src/features/pnl/utils/routeComparison.spec.ts`

**Interfaces:**
- Consumes: Task 3's file names.
- Produces:
  - `ComparisonColumn = { id: string; name: string }`
  - `ComparisonRowModel = { rowKey, rowLabel, revenue, cost, margin, warnings, components }`
  - `ComparisonFooterRowModel = { label, revenue, cost, margin, components, warnings }`
  - `ComparisonTableModel<TColumn extends ComparisonColumn = ComparisonColumn> = { columns: TColumn[]; rows; footerRows }`
  - `COST_COMPONENTS`, `CostComponentKey`, `CLEAN`
  - `toRouteComparisonTable(data: PnlGroupComparison): ComparisonTableModel<PnlGroupComparisonColumn>`

`margin` is added to the model here so Task 6 only has to fill it. Until then the projection sets it from a `?? null` read, which yields `null` against the current backend and renders as `—`.

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/features/pnl/utils/routeComparison.spec.ts`:

```ts
import { toRouteComparisonTable } from './routeComparison'

describe('toRouteComparisonTable row axis', () => {
  it('keys rows by rowKey and carries a presentational rowLabel', () => {
    const model = toRouteComparisonTable({
      columns: [{ id: 'g1', name: 'Group 1', routeCount: 1, kind: 'group', routes: [] }],
      rows: [
        {
          date: '2026-05-01',
          cells: [
            {
              revenue: 1000,
              cost: 600,
              margin: 385,
              costSmu: 600,
              costRa: 0,
              costSgOut: 0,
              costSgIn: 0,
              incompleteTos: 0,
              issues: [],
            },
          ],
        },
      ],
      footer: [
        {
          totalRevenue: 1000,
          totalCost: 600,
          totalMargin: 385,
          totalCostSmu: 600,
          totalCostRa: 0,
          totalCostSgOut: 0,
          totalCostSgIn: 0,
          avgRevenuePerDay: 1000,
          avgCostPerDay: 600,
          avgMarginPerDay: 385,
          incompleteTos: 0,
          issues: [],
        },
      ],
      periodDays: 1,
    })

    expect(model.rows[0].rowKey).toBe('2026-05-01')
    // The label is already formatted — the renderer must not know this axis holds dates. The
    // format is formatDayLabel's, unchanged: this task is a refactor, so the rendered label must
    // be byte-identical to what the renderer produced before.
    expect(model.rows[0].rowLabel).toBe('1-May-2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm exec jest routeComparison
```

Expected: FAIL — `rowKey` is `undefined` (the model still exposes `date`).

- [ ] **Step 3: Create the shared model module**

Create `apps/frontend/src/features/pnl/utils/comparison.ts`:

```ts
import { CellWarning } from './cellWarning'

export type CostComponentKey = 'costSmu' | 'costRa' | 'costSgOut' | 'costSgIn'

// Order and labels are fixed here so the expanded rows read the same everywhere. These four sum
// exactly to the cost cell above them — the backend's FILTER clauses guarantee it.
export const COST_COMPONENTS: { key: CostComponentKey; label: string }[] = [
  { key: 'costSmu', label: 'SMU' },
  { key: 'costRa', label: 'RA' },
  { key: 'costSgOut', label: 'SG Out' },
  { key: 'costSgIn', label: 'SG In' },
]

// The structural minimum the renderer reads. Each tab supplies a richer column type of its own —
// route columns carry their station pairs, vendor columns carry their vendor names — and the
// renderer stays ignorant of both.
export interface ComparisonColumn {
  id: string
  name: string
}

export interface ComparisonRowModel {
  // Opaque to the renderer: a date on the route axis, an `origin|dest` pair on the vendor axis.
  // It is the identity used for expand/collapse state and test ids, never for display.
  rowKey: string
  rowLabel: string
  revenue: (number | null)[] // index-aligned with columns; null = no shipment, distinct from 0
  cost: (number | null)[]
  margin: (number | null)[]
  warnings: CellWarning[]
  components: Record<CostComponentKey, (number | null)[]>
}

export interface ComparisonFooterRowModel {
  label: string
  revenue: (number | null)[]
  cost: (number | null)[]
  margin: (number | null)[]
  components: Record<CostComponentKey, (number | null)[]> | null // null = this row does not expand
  warnings: CellWarning[] | null // null = this row has no AWBs behind it
}

export interface ComparisonTableModel<TColumn extends ComparisonColumn = ComparisonColumn> {
  columns: TColumn[]
  rows: ComparisonRowModel[]
  footerRows: ComparisonFooterRowModel[]
}

export function emptyComponents(): Record<CostComponentKey, (number | null)[]> {
  return { costSmu: [], costRa: [], costSgOut: [], costSgIn: [] }
}

// An absent cell still gets a clean warning rather than being left undefined, so the renderer and
// the tests have exactly one shape to read. Matches dailyMatrix.ts's CLEAN.
export const CLEAN: CellWarning = { issues: [], incompleteTos: 0 }
```

- [ ] **Step 4: Rewrite the route projection over the shared model**

Replace the contents of `apps/frontend/src/features/pnl/utils/routeComparison.ts` above `overlappingRoutes` with:

```ts
import { PnlGroupComparison, PnlGroupComparisonColumn, PnlRouteFilter } from '../hooks/usePnl'
import { displayRouteLabel } from './routeLabels'
import { formatDayLabel } from './dailyMatrix'
import {
  CLEAN,
  COST_COMPONENTS,
  ComparisonFooterRowModel,
  ComparisonRowModel,
  ComparisonTableModel,
  emptyComponents,
} from './comparison'

export type { CostComponentKey } from './comparison'
export { COST_COMPONENTS } from './comparison'

export function toRouteComparisonTable(
  data: PnlGroupComparison,
): ComparisonTableModel<PnlGroupComparisonColumn> {
  const rows: ComparisonRowModel[] = data.rows.map((row) => {
    const components = emptyComponents()
    for (const { key } of COST_COMPONENTS) {
      components[key] = row.cells.map((c) => (c ? c[key] : null))
    }
    return {
      rowKey: row.date,
      // Formatted here, not in the renderer: the renderer serves two axes and must not know that
      // this one holds dates.
      rowLabel: formatDayLabel(row.date),
      revenue: row.cells.map((c) => (c ? c.revenue : null)),
      cost: row.cells.map((c) => (c ? c.cost : null)),
      // `issues` and `margin` are non-optional in the type, but the deploy pipeline brings backend
      // and frontend up in parallel, so a new frontend can briefly hit an old backend whose cells
      // lack the field. A missing margin renders as an em dash, never NaN.
      margin: row.cells.map((c) => (c ? (c.margin ?? null) : null)),
      warnings: row.cells.map((c) =>
        c ? { issues: c.issues ?? [], incompleteTos: c.incompleteTos } : CLEAN,
      ),
      components,
    }
  })

  const totalComponents = emptyComponents()
  totalComponents.costSmu = data.footer.map((f) => f.totalCostSmu)
  totalComponents.costRa = data.footer.map((f) => f.totalCostRa)
  totalComponents.costSgOut = data.footer.map((f) => f.totalCostSgOut)
  totalComponents.costSgIn = data.footer.map((f) => f.totalCostSgIn)

  const footerRows: ComparisonFooterRowModel[] = [
    {
      label: 'Total',
      revenue: data.footer.map((f) => f.totalRevenue),
      cost: data.footer.map((f) => f.totalCost),
      margin: data.footer.map((f) => f.totalMargin ?? null),
      components: totalComponents,
      warnings: data.footer.map((f) => ({ issues: f.issues ?? [], incompleteTos: f.incompleteTos })),
    },
    {
      // No component breakdown: the average of a component is not itself a cost anyone books.
      label: 'Avg / Day',
      revenue: data.footer.map((f) => f.avgRevenuePerDay),
      cost: data.footer.map((f) => f.avgCostPerDay),
      margin: data.footer.map((f) => f.avgMarginPerDay ?? null),
      components: null,
      warnings: null,
    },
  ]

  return { columns: data.columns, rows, footerRows }
}
```

Keep `overlappingRoutes` and `routeFromComparisonCell` below, unchanged.

- [ ] **Step 5: Point the two consumers at the new names**

In `PnlComparisonTable.tsx` and `PnlRouteComparisonView.tsx`, change `toComparisonTable` → `toRouteComparisonTable` and import `ComparisonTableModel` / `COST_COMPONENTS` from `'../utils/comparison'`.

In `PnlComparisonTable.tsx`, replace `row.date` with `row.rowKey` at `:157`, `:159`, `:164`, `:165`, `:172`, `:180`, `:198`, and replace `formatDayLabel(row.date)` at `:163` with `row.rowLabel`. Delete the now-unused `formatDayLabel` import at `:5`. Rename `openDates` → `openRows` and `setOpenDates` → `setOpenRows` throughout.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest pnl
```

Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add -A apps/frontend/src/features/pnl
git commit -m "refactor(pnl): give the comparison table an opaque row key and a shared model"
```

---

### Task 5: Generalise the column type and the click contract

**Files:**
- Modify: `apps/frontend/src/features/pnl/components/PnlComparisonTable.tsx:11-34`, `:112-117`, `:180`
- Modify: `apps/frontend/src/features/pnl/components/PnlRouteComparisonView.tsx`
- Test: `apps/frontend/src/features/pnl/components/PnlComparisonTable.spec.tsx`

**Interfaces:**
- Consumes: Task 4's `ComparisonColumn`, `ComparisonTableModel<TColumn>`.
- Produces: `PnlComparisonTable` props `{ model, firstColumnHeader, cellHint, onCellClick?: (column, rowKey: string) => void }`.

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/features/pnl/components/PnlComparisonTable.spec.tsx`:

```ts
it('labels the first column from a prop and hands the row key to the click handler', async () => {
  const onCellClick = jest.fn()

  render(
    <PnlComparisonTable
      model={buildModel()} // the spec's existing helper
      firstColumnHeader="Route"
      cellHint="Lihat AWB kolom ini pada rute ini"
      onCellClick={onCellClick}
    />,
  )

  expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument()

  const cell = screen.getByTestId('revenue-2026-05-01-g1')
  expect(cell).toHaveAttribute('title', expect.stringContaining('pada rute ini'))

  await userEvent.click(cell)
  // Second argument is the opaque rowKey, not a date the renderer understands.
  expect(onCellClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }), '2026-05-01')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm exec jest PnlComparisonTable
```

Expected: FAIL — the header renders the hardcoded `Date`, and `firstColumnHeader` / `cellHint` are not props.

- [ ] **Step 3: Generalise the props and the hardcoded copy**

In `PnlComparisonTable.tsx`, replace the props interface (`:11-16`) and `cellTitle` (`:28-34`):

```tsx
interface PnlComparisonTableProps<TColumn extends ComparisonColumn> {
  model: ComparisonTableModel<TColumn>
  // 'Date' on the route axis, 'Route' on the vendor axis.
  firstColumnHeader: string
  // What a clickable cell drills into. The route tab's cells are one day; the vendor tab's cells
  // span the whole period, so a single hardcoded sentence would be false on one of them.
  cellHint: string
  // When given, every value cell becomes a button — including empty ones, which are a valid answer
  // ("nothing flew these routes that day"). Footer cells stay inert: they span the whole period.
  // The second argument is the opaque rowKey; only the caller knows what it means.
  onCellClick?: (column: TColumn, rowKey: string) => void
}

function cellTitle(hint: string, warning: CellWarning | undefined): string {
  const tooltip = warningTooltip(warning)
  return tooltip ? `${hint} — ${tooltip}` : hint
}
```

Change the signature (`:65`):

```tsx
export function PnlComparisonTable<TColumn extends ComparisonColumn>({
  model,
  firstColumnHeader,
  cellHint,
  onCellClick,
}: PnlComparisonTableProps<TColumn>) {
```

Replace the literal `Date` in the first `<th>` (`:116`) with `{firstColumnHeader}`, and the `cellTitle(warning)` call (`:178`) with `cellTitle(cellHint, warning)`.

Rename `DateCell` → `RowHeaderCell` at its definition (`:38`) and its three call sites (`:162`, `:209`), and change its `aria-label` (`:54`) from `` `Rincian cost ${label}` `` — that string is already axis-neutral, so leave the text as is.

- [ ] **Step 4: Pass the new props from the route view**

In `PnlRouteComparisonView.tsx`, update the render (around `:161`):

```tsx
          <PnlComparisonTable
            model={toRouteComparisonTable(data)}
            firstColumnHeader="Date"
            cellHint="Lihat AWB kolom ini pada tanggal ini"
            onCellClick={
              onCellClick
                ? (column, rowKey) => onCellClick(routeFromComparisonCell(column, rowKey))
                : undefined
            }
          />
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest pnl
```

Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add -A apps/frontend/src/features/pnl
git commit -m "refactor(pnl): make the comparison table's column type and copy caller-supplied"
```

---

### Task 6: Render the Margin column

The renderer emits value cells in **three** places. Changing only the body row leaves detail rows and both footer rows N cells short, and the table visibly de-aligns.

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts:223-250`
- Modify: `apps/frontend/src/features/pnl/components/PnlComparisonTable.tsx:78-104`, `:118-148`, `:168`, `:220-237`
- Modify: `apps/frontend/src/features/pnl/components/PnlRouteComparisonView.tsx:157-160`
- Test: `apps/frontend/src/features/pnl/components/PnlComparisonTable.spec.tsx`

**Interfaces:**
- Consumes: Task 2's `margin` / `totalMargin` / `avgMarginPerDay`; Task 4's `ComparisonRowModel.margin`.
- Produces: a third `Margin` header block and `margin-<rowKey>-<columnId>` test ids.

- [ ] **Step 1: Write the failing test**

Add to `PnlComparisonTable.spec.tsx`:

```ts
it('renders a Margin block and keeps every row 1 + 3N cells wide', async () => {
  render(
    <PnlComparisonTable
      model={buildModel()}
      firstColumnHeader="Date"
      cellHint="Lihat AWB kolom ini pada tanggal ini"
    />,
  )

  expect(screen.getByRole('columnheader', { name: 'Margin' })).toBeInTheDocument()
  expect(screen.getByTestId('margin-2026-05-01-g1')).toHaveTextContent('385')

  // One column in the fixture, so every row is 1 + 3 cells.
  const bodyRow = screen.getByTestId('row-2026-05-01')
  expect(bodyRow.querySelectorAll('td')).toHaveLength(4)

  // Expand the Total footer row and check a detail row is padded to the same width.
  await userEvent.click(screen.getByRole('button', { name: 'Rincian cost Total' }))
  const detail = screen.getByTestId('detail-__footer__-costSmu')
  expect(detail.querySelectorAll('td')).toHaveLength(4)
})

it('colours a negative margin red and lets a warning tint win over it', () => {
  render(
    <PnlComparisonTable
      model={buildModelWithNegativeMargin()} // margin -50, no issues
      firstColumnHeader="Date"
      cellHint="Lihat AWB kolom ini pada tanggal ini"
    />,
  )

  expect(screen.getByTestId('margin-2026-05-01-g1').className).toContain('text-red')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm exec jest PnlComparisonTable
```

Expected: FAIL — no `Margin` columnheader, and body rows have 3 cells.

- [ ] **Step 3: Add margin to the wire types**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, add to `PnlGroupComparisonCell` (`:223`) after `cost`:

```ts
  margin: number
```

and to `PnlGroupComparisonFooter` (`:239`) after `totalCost`:

```ts
  totalMargin: number
```

and after `avgCostPerDay`:

```ts
  avgMarginPerDay: number
```

- [ ] **Step 4: Make the field list one constant and use it in all three places**

In `PnlComparisonTable.tsx`, add near `FOOTER_KEY`:

```tsx
// The three value blocks, in render order. Every place that emits value cells loops over this, so
// body rows, detail rows and footer rows can never disagree about how wide a row is.
const FIELDS = ['revenue', 'cost', 'margin'] as const
type Field = (typeof FIELDS)[number]

function valueClass(field: Field, value: number | null): string {
  // Only margin can meaningfully be negative; revenue and cost are sums of non-negative amounts.
  return field === 'margin' && value != null && value < 0 ? 'text-red-600 dark:text-red-400' : ''
}
```

Replace the body flatMap (`:168`) with:

```tsx
                    {FIELDS.flatMap((field) =>
                      row[field].map((value, i) => {
                        const warning = row.warnings[i]
                        // A warning tint outranks the negative-margin colour: an unreliable number
                        // should not be read as a confident loss.
                        const tint = hasWarning(warning) ? WARNING_TINT : valueClass(field, value)
                        const testId = `${field}-${row.rowKey}-${model.columns[i].id}`
```

Replace the detail row's single blank block (`:92-94`) with **two** blank blocks — one before the cost block and one after — so a detail row stays exactly as wide as a body row. They are written out literally rather than looped, because the two blanks are not adjacent: the filled cost block sits between them, and a loop would have to special-case the middle.

```tsx
        <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-card px-3 py-1 pl-6 text-xs text-muted-foreground">
          {label}
        </td>
        {Array.from({ length: groupCount }, (_, i) => (
          <td key={`blank-revenue-${i}`} className="border-b border-l" />
        ))}
        {components[componentKey].map((value, i) => (
          <td
            key={`cost-${i}`}
            className="whitespace-nowrap border-b border-l px-3 py-1 text-right text-xs text-muted-foreground"
          >
            {formatValue(value)}
          </td>
        ))}
        {Array.from({ length: groupCount }, (_, i) => (
          <td key={`blank-margin-${i}`} className="border-b border-l" />
        ))}
```

Replace the two literal footer blocks (`:220-237`) with one loop:

```tsx
                  {FIELDS.flatMap((field) =>
                    footerRow[field].map((value, ci) => (
                      <td
                        key={`${field}-${ci}`}
                        title={warningTooltip(footerRow.warnings?.[ci])}
                        className={`whitespace-nowrap border-b border-l px-3 py-1.5 text-right ${
                          hasWarning(footerRow.warnings?.[ci])
                            ? WARNING_TINT
                            : valueClass(field, value)
                        }`}
                      >
                        {formatValue(value)}
                      </td>
                    )),
                  )}
```

- [ ] **Step 5: Add the third header block**

After the `Cost` `<th>` (`:129`), add:

```tsx
              <th
                colSpan={groupCount}
                className="border-b border-l bg-amber-100 px-3 py-1.5 text-center font-semibold dark:bg-amber-950/40"
              >
                Margin
              </th>
```

and after the second `model.columns.map` sub-header block (`:147`), add a third with `key={`margin-${column.id}`}`.

- [ ] **Step 6: Update the caption**

In `PnlRouteComparisonView.tsx`, replace the caption (`:157-160`). It is kept, not deleted — Revenue is still gross, so `Revenue − Cost` still does not equal `Margin`, and the new column makes that question far more likely to be asked:

```tsx
          <p className="text-xs text-muted-foreground">
            Kolom Revenue di sini bruto (belum dikurangi discount), sama seperti tab Daily Report.
            Margin sudah dikurangi discount, jadi Revenue − Cost tidak sama dengan Margin —
            selisihnya adalah discount.
          </p>
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest pnl
```

Expected: PASS. The pre-existing hardcoded cell count in `PnlComparisonTable.spec.tsx:166-176` will need updating from 1+2N to 1+3N — that is expected, not a regression.

- [ ] **Step 8: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add -A apps/frontend/src/features/pnl
git commit -m "feat(pnl): show margin alongside revenue and cost in Route Comparison"
```

---

### Task 7: Keep the picks alive across tab switches

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx:83-84`, `:286`
- Modify: `apps/frontend/src/features/pnl/components/PnlRouteComparisonView.tsx:19`, `:32-52`
- Test: `apps/frontend/src/features/pnl/components/PnlRouteComparisonView.spec.tsx`, `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx`

**Interfaces:**
- Consumes: Task 3's `PnlRouteComparisonView`.
- Produces: `PnlRouteComparisonView` props gain `picks: PnlColumnPick[]` and `onPicksChange: (next: PnlColumnPick[]) => void`.

- [ ] **Step 1: Write the failing tests**

In `PnlRouteComparisonView.spec.tsx`:

```ts
it('prunes picks for groups that no longer exist, but only once the list has loaded', async () => {
  const onPicksChange = jest.fn()

  // groups undefined = cold react-query cache, which is the normal state after >5 minutes on
  // another tab. Pruning here would delete the very picks this feature exists to preserve.
  renderView({ groups: undefined, picks: [{ kind: 'group', id: 'gone' }], onPicksChange })
  expect(onPicksChange).not.toHaveBeenCalled()

  renderView({ groups: [{ id: 'g1', name: 'Group 1', routes: [] }], picks: [{ kind: 'group', id: 'gone' }], onPicksChange })
  await waitFor(() => expect(onPicksChange).toHaveBeenCalledWith([]))
})

it('keeps a raw route pick that has no data in the current period', async () => {
  const onPicksChange = jest.fn()
  renderView({ groups: [], picks: [{ kind: 'route', origin: 'Jakarta', dest: 'SUB' }], onPicksChange })
  expect(onPicksChange).not.toHaveBeenCalled()
})
```

In `page.spec.tsx`, first make the existing view mock (`:69-75`) observable — lifted state is invisible while the mock throws its props away:

```tsx
jest.mock('@/features/pnl/components/PnlRouteComparisonView', () => ({
  PnlRouteComparisonView: ({ picks }: { picks: { kind: string }[] }) => (
    <div data-testid="route-comparison-view">{`picks:${picks.length}`}</div>
  ),
}))
```

then add:

```ts
it('keeps the comparison picks when the user leaves the tab and comes back', async () => {
  render(<PnlPage />)

  await userEvent.click(screen.getByRole('button', { name: 'Route Comparison' }))
  // The mocked view reports what it was handed; drive the page's state through it.
  expect(screen.getByTestId('route-comparison-view')).toHaveTextContent('picks:0')

  await userEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
  await userEvent.click(screen.getByRole('button', { name: 'Route Comparison' }))

  expect(screen.getByTestId('route-comparison-view')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/frontend && pnpm exec jest pnl
```

Expected: FAIL — the view owns `picks` internally and accepts no such props.

- [ ] **Step 3: Lift the state to the page**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, add beside `drilldownRoute` (`:84`):

```tsx
  // Lifted out of PnlRouteComparisonView so switching tabs does not discard the selection: the
  // tab is rendered by a ternary below, so leaving it unmounts the component outright. Deliberately
  // NOT cleared by the period effect below — a pick carries no date, unlike drilldownRoute.
  const [routePicks, setRoutePicks] = useState<PnlColumnPick[]>([])
```

and import `PnlColumnPick` from the hooks module. Pass it through (`:286`):

```tsx
          <PnlRouteComparisonView
            filter={filter}
            picks={routePicks}
            onPicksChange={setRoutePicks}
            onCellClick={applyDrilldownRoute}
          />
```

- [ ] **Step 4: Make the view controlled**

In `PnlRouteComparisonView.tsx`, replace the `useState` (`:19`) with props, and rewrite the two reducers to read the `picks` prop and call `onPicksChange`:

```tsx
interface PnlRouteComparisonViewProps {
  filter: PnlFilter
  // Pick order is column order, so the array is appended to rather than re-sorted.
  picks: PnlColumnPick[]
  onPicksChange: (next: PnlColumnPick[]) => void
  onCellClick?: (route: PnlRouteFilter) => void
}

export function PnlRouteComparisonView({
  filter,
  picks,
  onPicksChange,
  onCellClick,
}: PnlRouteComparisonViewProps) {
  const toggleGroup = (id: string) =>
    onPicksChange(
      picks.some((p) => p.kind === 'group' && p.id === id)
        ? picks.filter((p) => !(p.kind === 'group' && p.id === id))
        : [...picks, { kind: 'group', id }],
    )

  // Routes are replaced wholesale by the dropdown, but the group picks keep their relative order:
  // dropping and re-adding every pick would silently reshuffle the columns.
  const setRouteLabels = (labels: string[]) => {
    const next = routesForLabels(labels, routeIndex)
    const kept = picks.filter(
      (p) => p.kind === 'group' || next.some((r) => r.origin === p.origin && r.dest === p.dest),
    )
    const added = next
      .filter((r) => !picks.some((p) => p.kind === 'route' && p.origin === r.origin && p.dest === r.dest))
      .map((r) => ({ kind: 'route' as const, origin: r.origin, dest: r.dest }))
    onPicksChange([...kept, ...added])
  }
```

- [ ] **Step 5: Prune stale group picks, guarded**

Add to `PnlRouteComparisonView.tsx`, after the `useRouteGroups()` call:

```tsx
  // Picks now outlive the component, so a group deleted while the user was on another tab would
  // otherwise keep a checkbox pointing at nothing. The `!groups` guard is load-bearing:
  // useRouteGroups has no initialData and react-query's default 5-minute gcTime means an undefined
  // list is the normal state after a few minutes away — pruning then would wipe the selection this
  // whole feature exists to keep. Raw route picks are never pruned; a route with no data in the
  // current period is a legitimate, informative empty column.
  useEffect(() => {
    if (!groups) return
    const pruned = picks.filter((p) => p.kind !== 'group' || groups.some((g) => g.id === p.id))
    if (pruned.length !== picks.length) onPicksChange(pruned)
  }, [groups, picks, onPicksChange])
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest pnl
```

Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add -A apps/frontend/src
git commit -m "feat(pnl): keep the comparison picks when the user switches tabs"
```

---

### Task 8: Full-suite verification

**Files:** none.

- [ ] **Step 1: Run both suites in full**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest --runInBand
cd ../frontend && pnpm exec jest
```

Expected: PASS in both. Record any pre-existing failure explicitly rather than assuming it is unrelated.

- [ ] **Step 2: Typecheck both apps**

```bash
cd apps/backend && pnpm exec tsc --noEmit
cd ../frontend && pnpm exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Check the table at a narrow viewport**

Both comparison tables are now 1+3N columns and only the first column is sticky-left. Run the app, open Route Comparison, pick three route groups, and confirm at 1280px and 768px that the table scrolls horizontally inside its own container and the page body does not.

- [ ] **Step 4: Commit anything the verification changed**

```bash
git add -A
git commit -m "test(pnl): verify the full suite after the Route Comparison foundation"
```

---

## Self-Review

**Spec coverage.** Feature 4 → Tasks 1, 3. Feature 1 → Task 7. Feature 2 → Tasks 2, 6. Foundation refactor (rowKey/rowLabel, `ComparisonColumn`, `cellHint`, `RowHeaderCell`) → Tasks 4, 5. Features 3 and 5 are out of scope for this plan by design.

Two spec items are deliberately deferred rather than dropped: the five-tab pill-row restyle belongs to Plan 3, which is the change that adds the fifth tab; and the `paramsSerializer` change belongs to Plan 3, which is what first sends a repeated param.

**Type consistency.** `ComparisonTableModel<TColumn>` is defined in Task 4 and consumed with an explicit type argument in Tasks 5 and 6. `toRouteComparisonTable` is named identically in Tasks 4, 5 and 6. `FIELDS` is introduced in Task 6 and used in exactly the three places that task enumerates. `PnlColumnPick` is the pre-existing exported type, used unchanged in Task 7.

**Known follow-on breakage, called out so it is not mistaken for a regression:** `PnlComparisonTable.spec.tsx:15-20` destructures cells positionally and `:166-176` hardcodes a cell count for a 1+2N table. Task 6 Step 7 flags both.

---

## Execution Handoff

Plan complete. Plans 2 (Vendor Group CRUD) and 3 (Vendor Comparison) follow — plan 2 is independent and can be written now; plan 3 depends on the shape this plan lands.
