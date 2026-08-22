# Vendor Comparison Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth PnL tab, Vendor Comparison, that compares vendor groups and single vendors side by side — rows are origin→destination routes, columns are vendors, cells carry Revenue / Cost / Margin plus the four cost components — and make a clicked cell open the AWB drilldown narrowed to that vendor and route.

**Architecture:** One new read-only backend endpoint (`GET /pnl/breakdown/vendor-comparison`) built the same way `getGroupComparison` is: two `Promise.all`'d raw-SQL queries over the `v_pnl_to` materialized view (one fact query, one `GROUPING SETS` issue query) joined against an `UNNEST` mapping table, shaped into index-aligned parallel arrays. On the frontend, a new projection function feeds the *existing* `PnlComparisonTable` renderer that Plan 1 generalised, so no table markup is written twice. The AWB drilldown gains a vendor filter in its **outer** predicate and renders it as removable chips.

**Tech Stack:** NestJS 10 + raw SQL over a Postgres materialized view (`v_pnl_to`); Next.js 14 App Router + React 18 + @tanstack/react-query + axios; Jest + @testing-library/react + supertest.

**Spec:** [`docs/superpowers/specs/2026-08-22-pnl-vendor-comparison-design.md`](../specs/2026-08-22-pnl-vendor-comparison-design.md) — this plan implements **Fitur 5** in full.

**Scope note:** This is plan 3 of 3.

### Dependencies — both must be merged before this plan starts

**Plan 1 — [`2026-08-22-route-comparison-foundation.md`](./2026-08-22-route-comparison-foundation.md).** This plan **consumes these names verbatim** and must not redefine, re-export or rename any of them:

| From | Names |
|---|---|
| `apps/frontend/src/features/pnl/utils/comparison.ts` | `ComparisonColumn { id, name }`; `ComparisonRowModel { rowKey, rowLabel, revenue, cost, margin, warnings, components }`; `ComparisonFooterRowModel { label, revenue, cost, margin, components, warnings }`; `ComparisonTableModel<TColumn extends ComparisonColumn>`; `COST_COMPONENTS`; `CostComponentKey`; `emptyComponents()`; `CLEAN` |
| `apps/frontend/src/features/pnl/components/PnlComparisonTable.tsx` | `PnlComparisonTable` with props `{ model, firstColumnHeader, cellHint, onCellClick?: (column: TColumn, rowKey: string) => void }` |
| `apps/frontend/src/app/(dashboard)/pnl/page.tsx` | view union `'estimate' \| 'actual' \| 'daily' \| 'routes'` — this plan adds `'vendors'`; state `routePicks` — this plan adds `vendorPicks` beside it |

**Plan 2 — Vendor Group CRUD.** This plan requires, and does not create:

- Tables `vendor_groups (id, name, description, created_at, updated_at)` and `vendor_group_vendors (vendor_group_id, vendor)`.
- `GET /vendor-groups/available-vendors` returning `{ vendor, has_data, in_master }` rows.
- Permission enum members `read.vendor_group` / `create.vendor_group` / `update.vendor_group` / `delete.vendor_group` in `packages/shared/src/auth/index.ts`.
- Frontend `apps/frontend/src/features/vendor-groups/`: `types.ts` exporting `VendorGroup { id, name, description, vendors: string[] }` and `AvailableVendor { vendor, hasData, inMaster }`, and `hooks/useVendorGroups.ts` exporting `useVendorGroups()` (query key `['vendor-groups']`) and `useAvailableVendors()` (query key `['vendor-groups', 'available-vendors']`).

If Plan 2 landed those under different names, fix the imports in Tasks 11 and 12 — do **not** duplicate the module here.

## Global Constraints

- Revenue is **gross**: `COALESCE(SUM(v.revenue_total), 0)`. Never net the discount out of it.
- Margin is `COALESCE(SUM(v.revenue_total),0) - COALESCE(SUM(v.revenue_discount),0) - COALESCE(SUM(v.cost_to),0)` — character-identical to the Daily Report expression at `apps/backend/src/modules/pnl/pnl.service.ts:899-900`. It is **not** `SUM(gross_profit_to)`.
- `cost_sg_in_to` **already contains** `weight_share` in its view definition (`20260816000001-pnl-station-lookup.ts:199-201`). Do not multiply it again. The other three (`cost_smu_awb`, `cost_ra_awb`, `cost_sg_out_awb`) are AWB-grain and **must** be multiplied by `weight_share`.
- Both the fact query and the issue query carry `AND v.origin_station IS NOT NULL AND v.dest_station IS NOT NULL`. Without it a `station_mapping_missing` row is byte-identical to the `GROUPING SETS` super-aggregate row and `indexIssueRows` files it as a second footer.
- `columns` is a **repeated** query param. Express + `qs` yields a **string** for one occurrence and an **array** for two or more, so the handler is typed `string | string[]` and the parser normalises with `Array.isArray` first. The frontend must send `paramsSerializer: { indexes: null }` — axios's default emits `columns[]=`.
- Vendor names are used **raw**: no `BTRIM`, no lowercasing, anywhere in the chain. What the user picks, what is stored, and what is joined must be byte-identical to `v_pnl_to.vendor`.
- The tab is gated on `read.vendor_group` **in the UI only**. The endpoint keeps `read.pnl`: `RbacGuard` uses `getAllAndOverride([handler, class])`, so a method-level `@Authorize` *replaces* the class-level one rather than adding to it.
- Every new response field is read on the frontend with a `?? ` fallback. Frontend and backend deploy in parallel; a new frontend must survive an old backend.
- No Zod. Backend validation is class-validator; this plan's inputs are query params validated by hand in a parser util.
- Backend tests: `cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest <pattern> --runInBand`. The heap bump *and* `--runInBand` are both required; either alone core-dumps.
- Frontend tests: `cd apps/frontend && pnpm exec jest <pattern>`. Type gate: `pnpm exec tsc --noEmit` in the app you changed.
- `next lint` already fails on seven pre-existing files and is **not** a gate. Do not try to fix it.
- Indonesian for explanatory copy, English for structural labels. Match the surrounding file.

---

## File Structure

**Backend**

| File | Responsibility | Change |
|---|---|---|
| `apps/backend/src/modules/pnl/pnl-vendor-columns.util.ts` | Parses the repeated `columns` param into `VendorColumnPick[]`, and the repeated `vendor` param into raw names | **Create** |
| `apps/backend/src/modules/pnl/pnl-vendor-columns.util.spec.ts` | Unit tests for both parsers | **Create** |
| `apps/backend/src/modules/pnl/pnl.service.ts` | `PnlVendorComparison*` types + `getVendorComparison`; vendor predicate in `getAwbDrilldown` | Modify |
| `apps/backend/src/modules/pnl/pnl.controller.ts` | `GET breakdown/vendor-comparison`; repeated `vendor` param on `awb-drilldown` | Modify |
| `apps/backend/src/modules/pnl/pnl.service.spec.ts` | Mocked-SQL tests for the new service method and the drilldown predicate | Modify |
| `apps/backend/src/modules/pnl/pnl.controller.http.spec.ts` | The one supertest case that actually parses a query string | **Create** |
| `apps/backend/src/modules/pnl/pnl-vendor-comparison.integration.spec.ts` | Real-database aggregation tests | **Create** |

**Frontend**

| File | Responsibility | Change |
|---|---|---|
| `apps/frontend/src/features/pnl/hooks/usePnl.ts` | Wire types, `PnlVendorPick`, `usePnlVendorComparison`, `vendors` on `PnlRouteFilter` | Modify |
| `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts` | `vendorColumnsToParams` and `routeToParams` vendor tests; the **pre-existing** drilldown HTTP-contract assertion updated for `paramsSerializer` | Modify |
| `apps/frontend/src/features/pnl/utils/vendorComparison.ts` | Route-axis projection: `toVendorComparisonTable`, `overlappingVendors`, `routeFromVendorComparisonCell`, `vendorRowKey` | **Create** |
| `apps/frontend/src/features/pnl/utils/vendorComparison.spec.ts` | Projection tests | **Create** |
| `apps/frontend/src/components/shared/multi-vendor-filter.tsx` | Vendor multi-select dropdown | **Create** |
| `apps/frontend/src/components/shared/multi-vendor-filter.spec.tsx` | Dropdown tests | **Create** |
| `apps/frontend/src/features/pnl/components/PnlVendorComparisonView.tsx` | Vendor tab: pickers, coverage banner, overlap banner, captions, table | **Create** |
| `apps/frontend/src/features/pnl/components/PnlVendorComparisonView.spec.tsx` | View tests | **Create** |
| `apps/frontend/src/app/(dashboard)/pnl/page.tsx` | Five-tab pill row, `'vendors'` view, `vendorPicks` state, UI gate | Modify |
| `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx` | Tab row + lifted-state tests | Modify |
| `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx` | Vendor chips, `hasRoute`, reconciliation note | Modify |
| `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx` | Chip tests | Modify |

`PnlComparisonTable.tsx` is **not** modified by this plan. If it needs a change, the change belongs in Plan 1.

---

### Task 1: Parse the repeated `columns` and `vendor` params

The parser is its own module and its own unit spec because the integration spec calls `PnlService` directly and the controller spec calls controller methods directly — neither ever parses a query string. Exactly one supertest case (Task 5) covers the string-vs-array behaviour Express actually produces.

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl-vendor-columns.util.ts`
- Test: `apps/backend/src/modules/pnl/pnl-vendor-columns.util.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type VendorColumnPick = { kind: 'group'; id: string } | { kind: 'vendor'; name: string }`
  - `const MAX_VENDOR_COLUMNS = 12`
  - `parseVendorColumnPicks(raw?: string | string[]): VendorColumnPick[]`
  - `parseVendorNames(raw?: string | string[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/pnl/pnl-vendor-columns.util.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import {
  MAX_VENDOR_COLUMNS,
  parseVendorColumnPicks,
  parseVendorNames,
} from './pnl-vendor-columns.util'

const G1 = '11111111-1111-4111-8111-111111111111'
const G2 = '22222222-2222-4222-8222-222222222222'

describe('parseVendorColumnPicks', () => {
  // Express + qs hands a bare string over when the param appears exactly once. Iterating that
  // string character by character is the single most likely way to break this endpoint, and it
  // breaks on the first thing any user does: pick one column.
  it('accepts a single occurrence as a bare string, not as a character sequence', () => {
    expect(parseVendorColumnPicks(`vg:${G1}`)).toEqual([{ kind: 'group', id: G1 }])
  })

  it('keeps groups and vendors in the order they arrived', () => {
    expect(parseVendorColumnPicks([`vg:${G1}`, 'v:PT Angkasa', `vg:${G2}`])).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'vendor', name: 'PT Angkasa' },
      { kind: 'group', id: G2 },
    ])
  })

  // Vendor names are free text from a Google Sheet. Splitting on ',' or '|' — the way the route
  // parser does — would shred exactly these names, which is why this param is repeated instead.
  it('keeps a vendor name that contains a comma, a pipe or a colon intact', () => {
    expect(
      parseVendorColumnPicks(['v:PT Angkasa, Tbk', 'v:CGK|SUB Logistik', 'v:Vendor: Utama']),
    ).toEqual([
      { kind: 'vendor', name: 'PT Angkasa, Tbk' },
      { kind: 'vendor', name: 'CGK|SUB Logistik' },
      { kind: 'vendor', name: 'Vendor: Utama' },
    ])
  })

  it('takes the name raw, without trimming, so it still matches v_pnl_to.vendor byte for byte', () => {
    expect(parseVendorColumnPicks(['v:  ESP  '])).toEqual([{ kind: 'vendor', name: '  ESP  ' }])
  })

  it('drops a repeated pick, keeping its first position', () => {
    expect(parseVendorColumnPicks([`vg:${G1}`, 'v:ESP', `vg:${G1}`, 'v:ESP'])).toEqual([
      { kind: 'group', id: G1 },
      { kind: 'vendor', name: 'ESP' },
    ])
  })

  it('returns nothing for an absent param', () => {
    expect(parseVendorColumnPicks(undefined)).toEqual([])
    expect(parseVendorColumnPicks([])).toEqual([])
  })

  it('rejects a malformed descriptor rather than guessing what it meant', () => {
    expect(() => parseVendorColumnPicks(['ESP'])).toThrow(BadRequestException)
    expect(() => parseVendorColumnPicks(['x:ESP'])).toThrow(BadRequestException)
    expect(() => parseVendorColumnPicks(['vg:not-a-uuid'])).toThrow(BadRequestException)
    expect(() => parseVendorColumnPicks(['v:'])).toThrow(BadRequestException)
  })

  // A vendor name is not an id. It can disappear from the sheet between the picker loading and
  // this request, and a 400 would take the whole table down over one stale checkbox.
  it('lets an unknown vendor name through, to be rendered as an empty column', () => {
    expect(parseVendorColumnPicks(['v:Vendor Yang Sudah Tidak Ada'])).toEqual([
      { kind: 'vendor', name: 'Vendor Yang Sudah Tidak Ada' },
    ])
  })

  it('rejects more than the maximum number of columns', () => {
    const many = Array.from({ length: MAX_VENDOR_COLUMNS + 1 }, (_, i) => `v:Vendor ${i}`)
    expect(() => parseVendorColumnPicks(many)).toThrow(BadRequestException)
    expect(MAX_VENDOR_COLUMNS).toBe(12)
  })

  it('counts the cap after deduping, so repeats do not spend the budget', () => {
    const twelve = Array.from({ length: MAX_VENDOR_COLUMNS }, (_, i) => `v:Vendor ${i}`)
    expect(parseVendorColumnPicks([...twelve, 'v:Vendor 0'])).toHaveLength(MAX_VENDOR_COLUMNS)
  })
})

describe('parseVendorNames', () => {
  it('accepts a single occurrence as a bare string', () => {
    expect(parseVendorNames('ESP')).toEqual(['ESP'])
  })

  it('dedupes while keeping order, and drops empty values', () => {
    expect(parseVendorNames(['ESP', '', 'Angkasa', 'ESP'])).toEqual(['ESP', 'Angkasa'])
  })

  it('returns nothing for an absent param', () => {
    expect(parseVendorNames(undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-vendor-columns.util --runInBand
```

Expected: FAIL — `Cannot find module './pnl-vendor-columns.util'`.

- [ ] **Step 3: Write the parser**

Create `apps/backend/src/modules/pnl/pnl-vendor-columns.util.ts`:

```ts
import { BadRequestException } from '@nestjs/common'

/**
 * Parsing for the two repeated query params on the vendor side of P&L: `columns` on the vendor
 * comparison and `vendor` on the AWB drilldown.
 *
 * Repeated, not delimited. Station codes are guaranteed free of ',' and '|' (see
 * pnl-columns.util.ts), which is what lets the route params use a flat delimited encoding. Vendor
 * names are not: they are free text typed into a Google Sheet and may contain any punctuation.
 *
 * Express 4's default `qs` parser gives a **string** when a param appears once and an **array**
 * when it appears twice or more, so every entry point here normalises before iterating. Without
 * that, the single-column case — the first thing any user does — iterates a string one character
 * at a time.
 */

export type VendorColumnPick =
  | { kind: 'group'; id: string }
  | { kind: 'vendor'; name: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The table grows by three columns per pick and only the first column is sticky-left, so this is
// a readability limit as much as a cost one.
export const MAX_VENDOR_COLUMNS = 12

function toArray(raw?: string | string[]): string[] {
  return Array.isArray(raw) ? raw : raw == null ? [] : [raw]
}

export function parseVendorColumnPicks(raw?: string | string[]): VendorColumnPick[] {
  const seen = new Set<string>()
  const picks: VendorColumnPick[] = []

  for (const value of toArray(raw)) {
    if (typeof value !== 'string') {
      throw new BadRequestException(`Invalid column descriptor: ${String(value)}`)
    }
    // First colon only. A vendor named 'Vendor: Utama' is a real possibility, and splitting on
    // every colon would truncate it to 'Vendor' and silently join against nothing.
    const colon = value.indexOf(':')
    if (colon === -1) throw new BadRequestException(`Invalid column descriptor: ${value}`)
    const prefix = value.slice(0, colon)
    const rest = value.slice(colon + 1)

    let pick: VendorColumnPick
    if (prefix === 'vg') {
      if (!UUID_RE.test(rest)) throw new BadRequestException(`Invalid vendor group id: ${rest}`)
      pick = { kind: 'group', id: rest }
    } else if (prefix === 'v') {
      // Raw and untrimmed on purpose: the name has to stay byte-identical to v_pnl_to.vendor or
      // the join misses without saying so. Only a completely empty name is refused.
      if (rest === '') throw new BadRequestException(`Invalid vendor descriptor: ${value}`)
      pick = { kind: 'vendor', name: rest }
    } else {
      throw new BadRequestException(`Invalid column descriptor: ${value}`)
    }

    const key = pick.kind === 'group' ? `vg:${pick.id}` : `v:${pick.name}`
    if (seen.has(key)) continue
    seen.add(key)
    picks.push(pick)
  }

  // Checked after deduping: a client that repeats a pick has not actually asked for more columns.
  if (picks.length > MAX_VENDOR_COLUMNS) {
    throw new BadRequestException(
      `Too many comparison columns: ${picks.length} (max ${MAX_VENDOR_COLUMNS})`,
    )
  }
  return picks
}

// The drilldown's vendor filter. A group column carries many vendors, so this param repeats too.
// Unknown names are passed through: they simply match no rows, which is the honest answer.
export function parseVendorNames(raw?: string | string[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const value of toArray(raw)) {
    if (typeof value !== 'string' || value === '') continue
    if (seen.has(value)) continue
    seen.add(value)
    names.push(value)
  }
  return names
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-vendor-columns.util --runInBand
```

Expected: PASS — 13 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl-vendor-columns.util.ts apps/backend/src/modules/pnl/pnl-vendor-columns.util.spec.ts
git commit -m "feat(pnl): parse vendor comparison columns from a repeated query param

Vendor names come out of a Google Sheet and can hold commas, pipes and colons, so the delimited
encoding the route columns use would shred them. A repeated param avoids the delimiter entirely,
at the cost of having to normalise qs's string-or-array result before touching it."
```

---

### Task 2: Vendor comparison response types and column resolution

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` — types immediately after the closing brace of the `PnlGroupComparison` interface and before the `@Injectable()` decorator (currently `:240`, and shifted further by Plan 1 — anchor on the `@Injectable()` line, not the number), new method after `getGroupComparison`
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: Task 1's `VendorColumnPick`; the pre-existing `getStations(): Promise<PnlStation[]>`; Plan 2's `vendor_groups` / `vendor_group_vendors` tables.
- Produces: `PnlVendorComparisonColumn`, `PnlVendorComparisonCell`, `PnlVendorComparisonRow`, `PnlVendorComparisonFooter`, `PnlVendorComparison`, and `PnlService.getVendorComparison(picks, cyclePeriod?, startDate?, endDate?, basis?)`.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, as a new top-level `describe` inside the outer `describe('PnlService')`:

```ts
  describe('getVendorComparison', () => {
    const VG1 = '33333333-3333-4333-8333-333333333333'
    const VG2 = '44444444-4444-4444-8444-444444444444'

    const group = (id: string) => ({ kind: 'group' as const, id })
    const vendor = (name: string) => ({ kind: 'vendor' as const, name })

    // Query order: vendor-group members, stations, then facts / issues / coverage. The first is
    // skipped entirely when no group was picked.
    function mockColumnQueries(groupRows: Record<string, string | null>[]) {
      dataSource.query
        .mockResolvedValueOnce(groupRows)
        .mockResolvedValueOnce([
          { origin_station: 'Jabo', dest_station: 'Denpasar' },
          { origin_station: 'Jabo', dest_station: 'Aceh' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '0', revenue_in_columns: '0' }])
    }

    it('builds one column per pick, in pick order, with round-tripping ids', async () => {
      mockColumnQueries([
        { id: VG1, name: 'Vendor Utama', vendor: 'ESP' },
        { id: VG1, name: 'Vendor Utama', vendor: 'Angkasa' },
      ])

      const result = await service.getVendorComparison(
        [group(VG1), vendor('PT Kargo, Tbk')],
        '2026-05-1H',
      )

      expect(result.columns).toEqual([
        {
          id: `vg:${VG1}`,
          name: 'Vendor Utama',
          kind: 'group',
          vendors: ['ESP', 'Angkasa'],
          vendorCount: 2,
        },
        {
          id: 'v:PT Kargo, Tbk',
          name: 'PT Kargo, Tbk',
          kind: 'vendor',
          vendors: ['PT Kargo, Tbk'],
          vendorCount: 1,
        },
      ])
    })

    it('drops a group that was deleted since the picker loaded', async () => {
      // VG2 comes back with no row at all: it no longer exists. Rendering it as a nameless empty
      // column would leave the user with nothing to explain the blank.
      mockColumnQueries([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])

      const result = await service.getVendorComparison([group(VG1), group(VG2)], '2026-05-1H')

      expect(result.columns.map((c) => c.id)).toEqual([`vg:${VG1}`])
    })

    it('keeps a group that has no members yet as an empty column', async () => {
      // LEFT JOIN gives one row with a null vendor for a group with no members.
      mockColumnQueries([{ id: VG1, name: 'Group Kosong', vendor: null }])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.columns[0].vendors).toEqual([])
      expect(result.columns[0].vendorCount).toBe(0)
    })

    it('keeps an unknown vendor name as a column instead of failing the request', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Denpasar' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '0', revenue_in_columns: '0' }])

      const result = await service.getVendorComparison([vendor('Sudah Hilang')], '2026-05-1H')

      expect(result.columns.map((c) => c.name)).toEqual(['Sudah Hilang'])
      expect(result.rows.every((r) => r.cells[0] === null)).toBe(true)
    })

    it('rows every station pair the view knows, empty ones included', async () => {
      mockColumnQueries([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.rows.map((r) => `${r.origin}|${r.dest}`)).toEqual([
        'Jabo|Denpasar',
        'Jabo|Aceh',
      ])
      expect(result.rows[0].originLabel).toBe('CGK')
    })

    it('makes no database call at all when nothing was picked', async () => {
      const result = await service.getVendorComparison([], '2026-05-1H')

      expect(dataSource.query).not.toHaveBeenCalled()
      expect(result).toEqual({
        columns: [],
        rows: [],
        footer: [],
        coverage: { revenueInColumns: 0, revenuePeriod: 0 },
      })
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service.spec -t "getVendorComparison" --runInBand
```

Expected: FAIL — `service.getVendorComparison is not a function`.

- [ ] **Step 3: Add the response types**

In `apps/backend/src/modules/pnl/pnl.service.ts`, immediately after the closing brace of the `PnlGroupComparison` interface and before the `@Injectable()` decorator (currently `:240`, and shifted further by Plan 1 — anchor on the `@Injectable()` line, not the number), add:

```ts
export interface PnlVendorComparisonColumn {
  // 'vg:<uuid>' for a saved vendor group, 'v:<raw name>' for a single vendor. Identical to the
  // descriptor the frontend sent, so the id round-trips and the client can match columns to picks.
  id: string
  name: string
  kind: 'group' | 'vendor'
  // The vendor names this column aggregates, raw. Sent to the client so a clicked cell can build
  // the drilldown filter, and so overlap between columns is computed off the same list the numbers
  // came from rather than a second, drifting copy.
  vendors: string[]
  vendorCount: number
}

export interface PnlVendorComparisonCell {
  revenue: number // gross: SUM(revenue_total), discount not netted
  cost: number
  // revenue_total - revenue_discount - cost_to, the same expression getDailyMatrix uses, so one
  // route and period reads the same in both tabs. NOT SUM(gross_profit_to), which is
  // NULL-propagating where COALESCE(SUM(...)) skips NULL rows.
  margin: number
  // Three of these four are AWB-grain and are prorated by weight_share here; cost_sg_in_to already
  // carries weight_share inside the view definition and is therefore summed as-is. All four sit
  // behind the same FILTER (WHERE cost_to IS NOT NULL) clause as `cost`, so they sum exactly to it.
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number // TOs with no computable cost; `cost` here is understated
  issues: PnlCellIssue[] // empty = clean; never null, so the frontend has one shape to read
}

export interface PnlVendorComparisonRow {
  origin: string
  originLabel: string
  dest: string
  cells: (PnlVendorComparisonCell | null)[] // index-aligned with columns; null = nothing flew
}

export interface PnlVendorComparisonFooter {
  totalRevenue: number
  totalCost: number
  totalMargin: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  // The divisor behind the three averages below, sent explicitly rather than recomputed on the
  // client: the Route Comparison footer divides by calendar days, this one divides by routes, and
  // the two tabs share one renderer. A slot that means two different things must say which.
  routesWithData: number
  avgRevenuePerRoute: number | null // null when routesWithData is 0
  avgCostPerRoute: number | null
  avgMarginPerRoute: number | null
  incompleteTos: number
  // Distinct AWBs for the whole period, from its own grouping set — NOT the sum of the row cells.
  issues: PnlCellIssue[]
}

export interface PnlVendorComparison {
  columns: PnlVendorComparisonColumn[]
  rows: PnlVendorComparisonRow[]
  footer: PnlVendorComparisonFooter[] // index-aligned with columns
  // Drives a permanent banner. Only about a third of period revenue is attributable to a vendor at
  // all, so without this the table reads as a decomposition of the period and quietly loses 70%.
  coverage: { revenueInColumns: number; revenuePeriod: number }
}
```

- [ ] **Step 4: Import the pick type**

In the same file, change the import at `:13`:

```ts
import { RoutePair, ColumnPick } from './pnl-columns.util'
```

to:

```ts
import { RoutePair, ColumnPick } from './pnl-columns.util'
import { VendorColumnPick } from './pnl-vendor-columns.util'
```

- [ ] **Step 5: Add the method with columns, rows and zeroed footer**

In `apps/backend/src/modules/pnl/pnl.service.ts`, at the end of the class — directly after `getGroupComparison`'s closing brace and before the class's own closing brace — add:

```ts
  // Revenue, cost and margin per origin→destination route for each selected vendor column, behind
  // the "Vendor Comparison" tab. A column is either a saved vendor group or one raw vendor name;
  // both reduce to a list of vendor names, so both take the same path.
  //
  // Every TO carries at most one vendor, so two columns can only double-count when the same vendor
  // sits in both — surfaced by the client, not forbidden here. The columns still do not sum to the
  // period total: only TOs that have a booking carry a vendor at all.
  async getVendorComparison(
    picks: VendorColumnPick[],
    cyclePeriod?: string,
    startDate?: string,
    endDate?: string,
    basis?: string,
  ): Promise<PnlVendorComparison> {
    // Zeroed rather than measured: with no columns there is no banner to draw, so a period-wide
    // revenue scan would be work nobody reads.
    const empty: PnlVendorComparison = {
      columns: [],
      rows: [],
      footer: [],
      coverage: { revenueInColumns: 0, revenuePeriod: 0 },
    }
    if (picks.length === 0) return empty

    const groupIds = picks.filter((p) => p.kind === 'group').map((p) => p.id)
    // Only asked for when a group was actually picked, so a vendor-only comparison costs one query
    // less rather than sending an empty uuid array to the database.
    const groupRows: Record<string, string | null>[] = groupIds.length
      ? await this.dataSource.query(
          `
          SELECT g.id, g.name, m.vendor
          FROM vendor_groups g
          LEFT JOIN vendor_group_vendors m ON m.vendor_group_id = g.id
          WHERE g.id = ANY($1::uuid[])
          ORDER BY g.id, m.vendor
          `,
          [groupIds],
        )
      : []

    const groupNames = new Map<string, string>()
    const groupVendors = new Map<string, string[]>()
    for (const row of groupRows) {
      const id = row.id as string
      groupNames.set(id, row.name as string)
      if (!groupVendors.has(id)) groupVendors.set(id, [])
      // A group with no members yet still LEFT JOINs to one row with a null vendor.
      if (row.vendor != null) groupVendors.get(id)!.push(row.vendor)
    }

    // A group deleted between the picker loading and this request is dropped rather than rendered
    // as a permanently empty column with no name to explain itself. A vendor *name* is never
    // dropped: names are free text from a sheet and can vanish at any time, and an empty column the
    // user can see and remove is more honest — and far less destructive — than a 400.
    const columns: PnlVendorComparisonColumn[] = picks.flatMap(
      (pick): PnlVendorComparisonColumn[] => {
        if (pick.kind === 'group') {
          if (!groupNames.has(pick.id)) return []
          const vendors = groupVendors.get(pick.id) ?? []
          return [
            {
              id: `vg:${pick.id}`,
              name: groupNames.get(pick.id)!,
              kind: 'group' as const,
              vendors,
              vendorCount: vendors.length,
            },
          ]
        }
        return [
          {
            id: `v:${pick.name}`,
            name: pick.name,
            kind: 'vendor' as const,
            vendors: [pick.name],
            vendorCount: 1,
          },
        ]
      },
    )

    if (columns.length === 0) return empty

    // Every station pair the view knows, not only the ones with data this period, so the rows stay
    // put as the user changes cycle — the same rule the daily matrix columns follow.
    const stations = await this.getStations()
    const rows: PnlVendorComparisonRow[] = stations.map((s) => ({
      origin: s.origin,
      originLabel: s.originLabel,
      dest: s.dest,
      cells: columns.map(() => null),
    }))

    const footer: PnlVendorComparisonFooter[] = columns.map(() => ({
      totalRevenue: 0,
      totalCost: 0,
      totalMargin: 0,
      totalCostSmu: 0,
      totalCostRa: 0,
      totalCostSgOut: 0,
      totalCostSgIn: 0,
      routesWithData: 0,
      avgRevenuePerRoute: null,
      avgCostPerRoute: null,
      avgMarginPerRoute: null,
      incompleteTos: 0,
      issues: [],
    }))

    return { columns, rows, footer, coverage: { revenueInColumns: 0, revenuePeriod: 0 } }
  }
```

The unknown-vendor test mocks four queries but this version issues only one — `getStations()`; the group-members query is skipped because no group was picked. Extra `mockResolvedValueOnce` entries are simply never consumed, so the test passes now and keeps passing when Tasks 3 and 4 add the fact, issue and coverage calls.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service.spec -t "getVendorComparison" --runInBand
```

Expected: PASS — 6 tests.

- [ ] **Step 7: Typecheck and commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): resolve vendor comparison columns from groups and raw names

A deleted group is dropped the way the route comparison drops one, but an unknown vendor name is
kept: names are free text from the sheet, so refusing the request would let one stale checkbox take
down the whole table instead of showing one empty column the user can uncheck."
```

---

### Task 3: Aggregate vendor × route facts and per-cell issues

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` — inside `getVendorComparison`, replacing everything from `const stations = await this.getStations()` to the method's `return`
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: Task 2's `columns` / `rows`; `buildFilter` from `pnl-filter.util`; `indexIssueRows` from `pnl-cell-issues.util`.
- Produces: populated `PnlVendorComparisonCell`s on `rows[i].cells[j]`.

- [ ] **Step 1: Write the failing test**

Add inside the `describe('getVendorComparison')` block from Task 2:

```ts
    const fact = (over: Partial<Record<string, string>>) => ({
      origin_station: 'Jabo',
      dest_station: 'Denpasar',
      col_idx: '0',
      revenue: '0',
      cost: '0',
      margin: '0',
      cost_smu: '0',
      cost_ra: '0',
      cost_sg_out: '0',
      cost_sg_in: '0',
      incomplete_tos: '0',
      ...over,
    })

    // Query order once facts exist: group members, stations, facts, issues, coverage.
    function mockFactQueries(
      facts: Record<string, string>[],
      issues: Record<string, unknown>[] = [],
      coverage: Record<string, string> = { revenue_period: '0', revenue_in_columns: '0' },
    ) {
      dataSource.query
        .mockResolvedValueOnce([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])
        .mockResolvedValueOnce([
          { origin_station: 'Jabo', dest_station: 'Denpasar' },
          { origin_station: 'Jabo', dest_station: 'Aceh' },
        ])
        .mockResolvedValueOnce(facts)
        .mockResolvedValueOnce(issues)
        .mockResolvedValueOnce([coverage])
    }

    it('lands each fact row on its own route and column, leaving the rest null', async () => {
      mockFactQueries([
        fact({ revenue: '1000', cost: '600', margin: '385', cost_smu: '600', incomplete_tos: '2' }),
      ])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.rows[0].cells[0]).toEqual({
        revenue: 1000,
        cost: 600,
        margin: 385,
        costSmu: 600,
        costRa: 0,
        costSgOut: 0,
        costSgIn: 0,
        incompleteTos: 2,
        issues: [],
      })
      // 'Jabo|Aceh' had no fact row: null, which is distinct from a real zero.
      expect(result.rows[1].cells[0]).toBeNull()
    })

    it('selects gross revenue and the Daily Report margin expression', async () => {
      mockFactQueries([])

      await service.getVendorComparison([group(VG1)], '2026-05-1H')

      // Call 2 is the fact query (0 = group members, 1 = stations). Normalised to one line so
      // whitespace in the SQL literal cannot make this pass or fail by accident.
      const factSql = (dataSource.query.mock.calls[2][0] as string).replace(/\s+/g, ' ')
      expect(factSql).toContain('COALESCE(SUM(v.revenue_total), 0) AS revenue')
      expect(factSql).toContain(
        '- COALESCE(SUM(v.revenue_discount), 0) - COALESCE(SUM(v.cost_to), 0) AS margin',
      )
    })

    it('prorates the three AWB-grain components but not cost_sg_in_to', async () => {
      mockFactQueries([])

      await service.getVendorComparison([group(VG1)], '2026-05-1H')

      const factSql = (dataSource.query.mock.calls[2][0] as string).replace(/\s+/g, ' ')
      expect(factSql).toContain('SUM(v.cost_smu_awb * v.weight_share)')
      expect(factSql).toContain('SUM(v.cost_ra_awb * v.weight_share)')
      expect(factSql).toContain('SUM(v.cost_sg_out_awb * v.weight_share)')
      // cost_sg_in_to already multiplies by weight_share inside the view definition. Multiplying
      // again would square the share and silently understate SG In on every multi-TO AWB.
      expect(factSql).toContain('SUM(COALESCE(v.cost_sg_in_to, 0))')
      expect(factSql).not.toContain('cost_sg_in_to * v.weight_share')
    })

    // A behavioural test cannot see this: with the guard in place no station-less row ever comes
    // back, and without it the JS keying has no way to tell a station_mapping_missing row from the
    // GROUPING SETS super-aggregate. The guard itself is the assertion.
    it('guards both queries against null stations so an issue row cannot pose as the footer', async () => {
      mockFactQueries([])

      await service.getVendorComparison([group(VG1)], '2026-05-1H')

      for (const callIndex of [2, 3]) {
        const sql = (dataSource.query.mock.calls[callIndex][0] as string).replace(/\s+/g, ' ')
        expect(sql).toContain('AND v.origin_station IS NOT NULL')
        expect(sql).toContain('AND v.dest_station IS NOT NULL')
      }
    })

    it('attaches per-cell issues to their own route and column', async () => {
      mockFactQueries(
        [fact({ revenue: '1000', cost: '600', margin: '385' })],
        [
          { origin_station: 'Jabo', dest_station: 'Denpasar', col_idx: '0', issue: 'no_booking', awbs: '3' },
          // A null origin_station marks the column-wide grouping set, not a route row.
          { origin_station: null, dest_station: null, col_idx: '0', issue: 'no_booking', awbs: '7' },
        ],
      )

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.rows[0].cells[0]!.issues).toEqual([{ issue: 'no_booking', awbs: 3 }])
      expect(result.footer[0].issues).toEqual([{ issue: 'no_booking', awbs: 7 }])
    })

    it('zips columns to vendors as two parallel arrays, so one vendor cannot leak across columns', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { id: VG1, name: 'Vendor Utama', vendor: 'ESP' },
          { id: VG1, name: 'Vendor Utama', vendor: 'Angkasa' },
        ])
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Denpasar' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '0', revenue_in_columns: '0' }])

      await service.getVendorComparison([group(VG1), vendor('Kargo')], '2026-05-1H')

      const factParams = dataSource.query.mock.calls[2][1] as unknown[]
      // ['2026-05-1H', colIdx[], colVendors[]] — index 0 and 1 pair up positionally.
      expect(factParams[1]).toEqual([0, 0, 1])
      expect(factParams[2]).toEqual(['ESP', 'Angkasa', 'Kargo'])
    })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service.spec -t "getVendorComparison" --runInBand
```

Expected: FAIL — `result.rows[0].cells[0]` is `null` and `dataSource.query.mock.calls[2]` is `undefined`; only two queries are issued.

- [ ] **Step 3: Replace the tail of the method with the fact and issue queries**

In `getVendorComparison`, replace everything from `const stations = await this.getStations()` down to and including the final `return { columns, rows, footer, coverage: ... }` with:

```ts
    // Every station pair the view knows, not only the ones with data this period, so the rows stay
    // put as the user changes cycle — the same rule the daily matrix columns follow.
    const stations = await this.getStations()
    const rows: PnlVendorComparisonRow[] = stations.map((s) => ({
      origin: s.origin,
      originLabel: s.originLabel,
      dest: s.dest,
      cells: columns.map(() => null),
    }))

    const { where, params } = buildFilter(basis, cyclePeriod, startDate, endDate, 'v.')

    // One entry per (column, vendor) pair, flattened into two parallel arrays. UNNEST zips them
    // back into the mapping table both queries below join against. Flattening into a single list
    // would let a vendor from one column answer for another.
    const colIdx: number[] = []
    const colVendors: string[] = []
    columns.forEach((column, index) => {
      for (const vendorName of column.vendors) {
        colIdx.push(index)
        colVendors.push(vendorName)
      }
    })

    const p = params.length
    const colVendorsCte = `
      WITH col_vendors(col_idx, vendor) AS (
        SELECT * FROM UNNEST($${p + 1}::int[], $${p + 2}::text[])
      )`
    const colParams = [...params, colIdx, colVendors]

    // Both queries carry `AND v.origin_station IS NOT NULL AND v.dest_station IS NOT NULL`, and it
    // is load-bearing rather than defensive. The footer half of the GROUPING SETS below identifies
    // itself by a NULL origin_station — and `station_mapping_missing` is an issue whose entire
    // meaning is "this TO has no station". Without the guard such a row is byte-identical to the
    // super-aggregate and indexIssueRows files it as a second footer, double-counting the column's
    // issue AWBs. Zero such rows exist right now, so the bug would be latent, not visible.
    const [factRows, issueRows] = await Promise.all([
      this.dataSource.query(
        `
        ${colVendorsCte}
        SELECT
          v.origin_station                                             AS origin_station,
          v.dest_station                                               AS dest_station,
          cv.col_idx                                                   AS col_idx,
          COALESCE(SUM(v.revenue_total), 0)                            AS revenue,
          COALESCE(SUM(v.cost_to), 0)                                  AS cost,
          COALESCE(SUM(v.revenue_total), 0)
            - COALESCE(SUM(v.revenue_discount), 0)
            - COALESCE(SUM(v.cost_to), 0)                              AS margin,
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
        JOIN col_vendors cv ON cv.vendor = v.vendor
        WHERE ${where}
          AND v.origin_station IS NOT NULL
          AND v.dest_station   IS NOT NULL
        GROUP BY 1, 2, 3
        `,
        colParams,
      ),
      this.dataSource.query(
        `
        ${colVendorsCte}, issue_rows AS (
          SELECT
            v.origin_station AS origin_station,
            v.dest_station   AS dest_station,
            cv.col_idx       AS col_idx,
            v.issue          AS issue,
            v.awb            AS awb
          FROM v_pnl_to v
          JOIN col_vendors cv ON cv.vendor = v.vendor
          WHERE ${where}
            AND v.origin_station IS NOT NULL
            AND v.dest_station   IS NOT NULL
            AND v.issue IS NOT NULL
        )
        SELECT origin_station, dest_station, col_idx, issue, COUNT(DISTINCT awb)::int AS awbs
        FROM issue_rows
        GROUP BY GROUPING SETS ((origin_station, dest_station, col_idx, issue), (col_idx, issue))
        `,
        colParams,
      ),
    ])

    const cellIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.origin_station == null ? null : `${r.origin_station}|${r.dest_station}|${r.col_idx}`,
    )
    const columnIssues = indexIssueRows(issueRows as Record<string, unknown>[], (r) =>
      r.origin_station == null ? String(r.col_idx) : null,
    )

    // Station names are guaranteed free of '|' (the same guarantee that lets the route params use
    // a flat delimited encoding), so this composite key cannot collide.
    const rowIndex = new Map(rows.map((r, i) => [`${r.origin}|${r.dest}`, i]))

    for (const factRow of factRows as Record<string, string>[]) {
      const ci = Number(factRow.col_idx)
      const ri = rowIndex.get(`${factRow.origin_station}|${factRow.dest_station}`)
      if (!Number.isInteger(ci) || ci < 0 || ci >= columns.length || ri === undefined) continue
      rows[ri].cells[ci] = {
        revenue: Number(factRow.revenue),
        cost: Number(factRow.cost),
        margin: Number(factRow.margin),
        costSmu: Number(factRow.cost_smu),
        costRa: Number(factRow.cost_ra),
        costSgOut: Number(factRow.cost_sg_out),
        costSgIn: Number(factRow.cost_sg_in),
        incompleteTos: Number(factRow.incomplete_tos),
        issues: cellIssues.get(`${factRow.origin_station}|${factRow.dest_station}|${ci}`) ?? [],
      }
    }

    const footer: PnlVendorComparisonFooter[] = columns.map((_column, ci) => ({
      totalRevenue: 0,
      totalCost: 0,
      totalMargin: 0,
      totalCostSmu: 0,
      totalCostRa: 0,
      totalCostSgOut: 0,
      totalCostSgIn: 0,
      routesWithData: 0,
      avgRevenuePerRoute: null,
      avgCostPerRoute: null,
      avgMarginPerRoute: null,
      incompleteTos: 0,
      issues: columnIssues.get(String(ci)) ?? [],
    }))

    return { columns, rows, footer, coverage: { revenueInColumns: 0, revenuePeriod: 0 } }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service.spec -t "getVendorComparison" --runInBand
```

Expected: PASS — 12 tests. The coverage mock at position 4 is still unconsumed; Task 4 consumes it.

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): aggregate vendor cost and revenue per route

Prorated by weight_share rather than rolled up per AWB, because a per-AWB rollup cannot carry a
route key: an AWB whose TOs cross two station pairs would post its full cost to both. cost_sg_in_to
is left alone because the view already multiplies it by weight_share.

Both queries filter out null stations. That is what keeps a station_mapping_missing row from coming
back byte-identical to the GROUPING SETS super-aggregate and being filed as a second footer."
```

---

### Task 4: Footer totals, the Avg / Route divisor, and the coverage indicator

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts` — inside `getVendorComparison`, the `Promise.all` destructuring and the `footer` block
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: Task 3's `rows`, `colVendors`, `where`, `params`, `p`.
- Produces: populated `PnlVendorComparisonFooter[]` and `PnlVendorComparison.coverage`.

- [ ] **Step 1: Write the failing test**

Add inside the `describe('getVendorComparison')` block:

```ts
    it('totals every cell in the column and divides the averages by routes with data', async () => {
      mockFactQueries([
        fact({
          dest_station: 'Denpasar',
          revenue: '1000',
          cost: '600',
          margin: '385',
          cost_smu: '400',
          cost_ra: '100',
          cost_sg_out: '50',
          cost_sg_in: '50',
          incomplete_tos: '1',
        }),
        fact({
          dest_station: 'Aceh',
          revenue: '500',
          cost: '200',
          margin: '292.5',
          cost_smu: '150',
          cost_ra: '25',
          cost_sg_out: '15',
          cost_sg_in: '10',
          incomplete_tos: '2',
        }),
      ])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.footer[0]).toMatchObject({
        totalRevenue: 1500,
        totalCost: 800,
        totalMargin: 677.5,
        totalCostSmu: 550,
        totalCostRa: 125,
        totalCostSgOut: 65,
        totalCostSgIn: 60,
        incompleteTos: 3,
        routesWithData: 2,
        avgRevenuePerRoute: 750,
        avgCostPerRoute: 400,
        avgMarginPerRoute: 338.75,
      })
    })

    // Non-null, not non-zero. A route that flew and made exactly nothing is still a route this
    // column covered; dividing it away would quietly inflate every average.
    it('counts a zero-valued cell as a route with data', async () => {
      mockFactQueries([
        fact({ dest_station: 'Denpasar', revenue: '1000', cost: '400', margin: '585' }),
        fact({ dest_station: 'Aceh', revenue: '0', cost: '0', margin: '0' }),
      ])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.footer[0].routesWithData).toBe(2)
      expect(result.footer[0].avgRevenuePerRoute).toBe(500)
    })

    it('reports null averages, not NaN or Infinity, when the column has no data at all', async () => {
      mockFactQueries([])

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.footer[0].routesWithData).toBe(0)
      expect(result.footer[0].avgRevenuePerRoute).toBeNull()
      expect(result.footer[0].avgCostPerRoute).toBeNull()
      expect(result.footer[0].avgMarginPerRoute).toBeNull()
    })

    it('reports how much of the period revenue the picked vendors account for', async () => {
      mockFactQueries([], [], { revenue_period: '10000', revenue_in_columns: '3020' })

      const result = await service.getVendorComparison([group(VG1)], '2026-05-1H')

      expect(result.coverage).toEqual({ revenueInColumns: 3020, revenuePeriod: 10000 })
    })

    it('measures coverage against the deduped union of vendors, not the sum of the columns', async () => {
      // ESP sits in the group and is also picked bare. Summing the columns would count its revenue
      // twice and could report more than 100% coverage.
      dataSource.query
        .mockResolvedValueOnce([{ id: VG1, name: 'Vendor Utama', vendor: 'ESP' }])
        .mockResolvedValueOnce([{ origin_station: 'Jabo', dest_station: 'Denpasar' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue_period: '10000', revenue_in_columns: '3020' }])

      await service.getVendorComparison([group(VG1), vendor('ESP')], '2026-05-1H')

      const coverageParams = dataSource.query.mock.calls[4][1] as unknown[]
      expect(coverageParams[1]).toEqual(['ESP'])
      // Scoped by the same station guard as the table, so the banner describes exactly the rows
      // the table could have shown.
      const coverageSql = (dataSource.query.mock.calls[4][0] as string).replace(/\s+/g, ' ')
      expect(coverageSql).toContain('AND v.origin_station IS NOT NULL')
    })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service.spec -t "getVendorComparison" --runInBand
```

Expected: FAIL — every footer total is `0`, `routesWithData` is `0`, and `dataSource.query.mock.calls[4]` is `undefined`.

- [ ] **Step 3: Add the coverage query to the existing Promise.all**

In `getVendorComparison`, change the destructuring line:

```ts
    const [factRows, issueRows] = await Promise.all([
```

to:

```ts
    const [factRows, issueRows, coverageRows] = await Promise.all([
```

and, immediately after the closing `),` of the *second* (issue) query and before the `])` that closes the `Promise.all`, add a third query:

```ts
      // The deduped union of every picked vendor: two columns holding the same vendor must not push
      // the covered share above 100%. Scoped by the same station guard as the table above, so the
      // banner describes exactly the rows the table could show — a TO with a vendor but no station
      // mapping is excluded from both.
      this.dataSource.query(
        `
        SELECT
          COALESCE(SUM(v.revenue_total), 0)                              AS revenue_period,
          COALESCE(SUM(v.revenue_total) FILTER (
            WHERE v.vendor = ANY($${p + 1}::text[])
              AND v.origin_station IS NOT NULL
              AND v.dest_station   IS NOT NULL
          ), 0)                                                          AS revenue_in_columns
        FROM v_pnl_to v
        WHERE ${where}
        `,
        [...params, [...new Set(colVendors)]],
      ),
```

Both `$${p + 1}` bindings are independent: this query's params array is its own, so reusing the index is correct rather than a collision.

- [ ] **Step 4: Aggregate the footer and return the coverage**

Replace the `const footer: PnlVendorComparisonFooter[] = columns.map((_column, ci) => ({ ... }))` block and the `return` line that follows it with:

```ts
    const footer: PnlVendorComparisonFooter[] = columns.map((_column, ci) => {
      let totalRevenue = 0
      let totalCost = 0
      let totalMargin = 0
      let totalCostSmu = 0
      let totalCostRa = 0
      let totalCostSgOut = 0
      let totalCostSgIn = 0
      let incompleteTos = 0
      // Non-null, not non-zero: a route that flew and made exactly nothing is still a route this
      // column covered, and dividing it away would inflate the average.
      let routesWithData = 0
      for (const row of rows) {
        const cell = row.cells[ci]
        if (!cell) continue
        routesWithData += 1
        totalRevenue += cell.revenue
        totalCost += cell.cost
        totalMargin += cell.margin
        totalCostSmu += cell.costSmu
        totalCostRa += cell.costRa
        totalCostSgOut += cell.costSgOut
        totalCostSgIn += cell.costSgIn
        incompleteTos += cell.incompleteTos
      }
      // null, not 0 and not NaN: "no routes to average over" is a different statement from "the
      // average is zero", and the client renders the first as an em dash.
      const perRoute = (total: number) => (routesWithData > 0 ? total / routesWithData : null)
      return {
        totalRevenue,
        totalCost,
        totalMargin,
        totalCostSmu,
        totalCostRa,
        totalCostSgOut,
        totalCostSgIn,
        routesWithData,
        avgRevenuePerRoute: perRoute(totalRevenue),
        avgCostPerRoute: perRoute(totalCost),
        avgMarginPerRoute: perRoute(totalMargin),
        incompleteTos,
        issues: columnIssues.get(String(ci)) ?? [],
      }
    })

    const coverageRow = (coverageRows as Record<string, string>[])[0]
    return {
      columns,
      rows,
      footer,
      coverage: {
        revenueInColumns: Number(coverageRow?.revenue_in_columns ?? 0),
        revenuePeriod: Number(coverageRow?.revenue_period ?? 0),
      },
    }
```

- [ ] **Step 5: Run the whole pnl suite to verify nothing else moved**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl --runInBand
```

Expected: PASS. `pnl-group-comparison.integration.spec.ts` skips itself loudly without a database; that is not a failure.

- [ ] **Step 6: Typecheck and commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): total the vendor columns and report how much of the period they cover

The Avg / Route divisor is sent as routesWithData rather than left implicit: the Route Comparison
footer divides by calendar days and this one divides by routes, and both render through the same
component, so the slot has to say which it means.

Coverage exists because only about a third of TOs carry a vendor at all. Without the banner the
table reads as a decomposition of period revenue and silently loses the other two thirds."
```

---

### Task 5: Expose the endpoint and prove the repeated param over real HTTP

`pnl.controller.spec.ts` calls controller methods directly and never builds a request, so it cannot tell a string from an array. This task adds **one** supertest case that drives a real Express request through Nest's query parsing — the only place the string-vs-array behaviour is actually observable.

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts:169-178` (append after `getGroupComparison`)
- Test: `apps/backend/src/modules/pnl/pnl.controller.spec.ts`, `apps/backend/src/modules/pnl/pnl.controller.http.spec.ts` (create)

**Interfaces:**
- Consumes: Task 1's `parseVendorColumnPicks`; Tasks 2-4's `getVendorComparison`.
- Produces: `GET /pnl/breakdown/vendor-comparison?columns=…&columns=…&cycle=…&basis=…`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/modules/pnl/pnl.controller.spec.ts` — extend `mockService` with the new method, then add the describe block:

```ts
// add to the mockService object literal at the top of the file:
  getVendorComparison: jest.fn(),
```

```ts
  describe('getVendorComparison', () => {
    it('parses vendor group and raw vendor descriptors in pick order', async () => {
      await controller.getVendorComparison(
        ['vg:11111111-1111-4111-8111-111111111111', 'v:PT Kargo, Tbk'],
        '2026-05-1H',
      )

      expect(mockService.getVendorComparison).toHaveBeenCalledWith(
        [
          { kind: 'group', id: '11111111-1111-4111-8111-111111111111' },
          { kind: 'vendor', name: 'PT Kargo, Tbk' },
        ],
        '2026-05-1H',
        undefined,
        undefined,
        undefined,
      )
    })

    it('sends an empty pick list when the columns param is absent', async () => {
      await controller.getVendorComparison(undefined, '2026-05-1H')

      expect(mockService.getVendorComparison).toHaveBeenCalledWith(
        [], '2026-05-1H', undefined, undefined, undefined,
      )
    })
  })
```

Create `apps/backend/src/modules/pnl/pnl.controller.http.spec.ts`:

```ts
/**
 * The one P&L test that goes through real HTTP.
 *
 * pnl.controller.spec.ts calls controller methods directly and pnl-vendor-comparison.integration
 * .spec.ts calls PnlService directly, so neither ever executes Express's query-string parsing.
 * That parsing is exactly where the `columns` param is fragile: qs hands over a bare string for a
 * single occurrence and an array for two or more, and a handler that assumed "always an array"
 * would iterate that string one character at a time. Only a real request can show the difference.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PnlController } from './pnl.controller'
import { PnlService } from './pnl.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RbacGuard } from '../../common/guards/rbac.guard'
import { ALLOW_ALL_GUARD } from '../../test/test-helpers'

const EMPTY = { columns: [], rows: [], footer: [], coverage: { revenueInColumns: 0, revenuePeriod: 0 } }

const mockService = {
  getVendorComparison: jest.fn().mockResolvedValue(EMPTY),
  getAwbDrilldown: jest.fn().mockResolvedValue({ data: [], total: 0 }),
}

describe('PnlController query-string parsing (HTTP)', () => {
  let app: INestApplication

  beforeEach(async () => {
    jest.clearAllMocks()
    mockService.getVendorComparison.mockResolvedValue(EMPTY)
    mockService.getAwbDrilldown.mockResolvedValue({ data: [], total: 0 })

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PnlController],
      providers: [{ provide: PnlService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(ALLOW_ALL_GUARD)
      .overrideGuard(RbacGuard)
      .useValue(ALLOW_ALL_GUARD)
      .compile()

    app = module.createNestApplication()
    await app.init()
  })

  afterEach(() => app.close())

  it('reads a repeated columns param as one pick per occurrence', async () => {
    await request(app.getHttpServer())
      .get('/pnl/breakdown/vendor-comparison')
      .query({ cycle: '2026-05-1H' })
      // .query() with an array emits the param twice, which is the wire shape the frontend sends.
      .query('columns=vg%3A11111111-1111-4111-8111-111111111111&columns=v%3APT%20Kargo%2C%20Tbk')
      .expect(200)

    expect(mockService.getVendorComparison).toHaveBeenCalledWith(
      [
        { kind: 'group', id: '11111111-1111-4111-8111-111111111111' },
        { kind: 'vendor', name: 'PT Kargo, Tbk' },
      ],
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
    )
  })

  it('reads a single columns occurrence as one pick, not one pick per character', async () => {
    await request(app.getHttpServer())
      .get('/pnl/breakdown/vendor-comparison')
      .query({ cycle: '2026-05-1H' })
      .query('columns=v%3AESP')
      .expect(200)

    expect(mockService.getVendorComparison).toHaveBeenCalledWith(
      [{ kind: 'vendor', name: 'ESP' }],
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
    )
  })

  it('answers 400 for a malformed descriptor instead of silently dropping a column', async () => {
    await request(app.getHttpServer())
      .get('/pnl/breakdown/vendor-comparison')
      .query({ cycle: '2026-05-1H' })
      .query('columns=ESP')
      .expect(400)

    expect(mockService.getVendorComparison).not.toHaveBeenCalled()
  })

  it('reads a repeated vendor param on the AWB drilldown', async () => {
    await request(app.getHttpServer())
      .get('/pnl/awb-drilldown')
      .query({ cycle: '2026-05-1H' })
      .query('vendor=ESP&vendor=Angkasa')
      .expect(200)

    expect(mockService.getAwbDrilldown).toHaveBeenCalledWith(
      1,
      50,
      '2026-05-1H',
      undefined,
      undefined,
      undefined,
      expect.objectContaining({ vendors: ['ESP', 'Angkasa'] }),
    )
  })
})
```

The last case covers the drilldown param Task 6 adds; it fails until then, which is the point.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.controller --runInBand
```

Expected: FAIL — `controller.getVendorComparison is not a function`, and every HTTP case 404s.

- [ ] **Step 3: Add the route**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, change the import at `:7`:

```ts
import { parseColumnPicks, parseRoutePairs } from './pnl-columns.util'
```

to:

```ts
import { parseColumnPicks, parseRoutePairs } from './pnl-columns.util'
import { parseVendorColumnPicks, parseVendorNames } from './pnl-vendor-columns.util'
```

and append after `getGroupComparison` (which ends at `:178`), before the class's closing brace:

```ts
  // No method-level @Authorize. RbacGuard resolves permissions with getAllAndOverride([handler,
  // class]), so a method-level decorator would REPLACE the class-level read.pnl rather than add to
  // it — this endpoint would then stop requiring read.pnl. The read.vendor_group gate is a UI-side
  // gate on the tab; what is genuinely guarded server-side is /vendor-groups itself.
  //
  // `columns` repeats: qs gives a string for one occurrence and an array for two or more, so the
  // parameter is typed for both and the parser normalises before iterating.
  @Get('breakdown/vendor-comparison')
  getVendorComparison(
    @Query('columns') columns?: string | string[],
    @Query('cycle') cycle?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('basis') basis?: string,
  ) {
    return this.pnlService.getVendorComparison(
      parseVendorColumnPicks(columns),
      cycle,
      start,
      end,
      basis,
    )
  }
```

- [ ] **Step 4: Run tests to verify the vendor-comparison cases pass**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.controller --runInBand
```

Expected: PASS except the last HTTP case ("reads a repeated vendor param on the AWB drilldown"), which still fails because `vendors` is not forwarded yet. Task 6 fixes it.

- [ ] **Step 5: Commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl.controller.ts apps/backend/src/modules/pnl/pnl.controller.spec.ts apps/backend/src/modules/pnl/pnl.controller.http.spec.ts
git commit -m "feat(pnl): serve the vendor comparison endpoint

Deliberately no method-level @Authorize: RbacGuard reads permissions with getAllAndOverride, so one
here would replace the class-level read.pnl instead of adding read.vendor_group on top, quietly
widening the endpoint. The tab gate stays in the UI, matching Route Comparison.

The HTTP spec exists because neither the controller spec nor the integration spec parses a query
string, and the repeated-param behaviour is only visible when one is parsed."
```

---

### Task 6: Narrow the AWB drilldown by vendor, in the outer predicate

**Files:**
- Modify: `apps/backend/src/modules/pnl/pnl.service.ts:62-66` (`PnlRouteFilter`), `:349-477` (`getAwbDrilldown`)
- Modify: `apps/backend/src/modules/pnl/pnl.controller.ts:46-63`
- Test: `apps/backend/src/modules/pnl/pnl.service.spec.ts`

**Interfaces:**
- Consumes: Task 1's `parseVendorNames`.
- Produces: `PnlRouteFilter.vendors?: string[]`; `GET /pnl/awb-drilldown?vendor=…&vendor=…`.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/pnl/pnl.service.spec.ts`, inside the existing `describe('getAwbDrilldown')` block (or as a new describe if none exists — follow the mocking style already in the file):

```ts
    it('filters by vendor in the outer predicate, not inside the route EXISTS', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-05-1H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
        vendors: ['ESP', 'Angkasa'],
      })

      const dataSql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ')
      // The outer alias is `v`. Inside the EXISTS the alias is `m`, and a vendor predicate there
      // would only decide WHICH AWBs are listed while the outer aggregate still summed every
      // vendor's TOs — a third question nobody asked.
      expect(dataSql).toContain('AND v.vendor = ANY(')
      expect(dataSql).not.toContain('m.vendor')

      const dataParams = dataSource.query.mock.calls[0][1] as unknown[]
      expect(dataParams).toContain(dataParams.find((p) => Array.isArray(p) && p[0] === 'ESP'))
    })

    it('applies the same vendor predicate to the count query, so paging stays consistent', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-05-1H', undefined, undefined, undefined, {
        vendors: ['ESP'],
      })

      const countSql = (dataSource.query.mock.calls[1][0] as string).replace(/\s+/g, ' ')
      expect(countSql).toContain('AND v.vendor = ANY(')
    })

    it('leaves the query untouched when no vendor is given', async () => {
      dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }])

      await service.getAwbDrilldown(1, 50, '2026-05-1H', undefined, undefined, undefined, {
        routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      })

      const dataSql = dataSource.query.mock.calls[0][0] as string
      expect(dataSql).not.toContain('v.vendor = ANY')
    })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl.service.spec -t "vendor" --runInBand
```

Expected: FAIL — the SQL has no `v.vendor = ANY(`, and `vendors` is not a property of `PnlRouteFilter`.

- [ ] **Step 3: Add `vendors` to the filter type**

In `apps/backend/src/modules/pnl/pnl.service.ts`, replace `PnlRouteFilter` (`:62-66`):

```ts
export interface PnlRouteFilter {
  routes?: RoutePair[]
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
  // Raw vendor names, as stored in v_pnl_to.vendor. Unlike routes and dates, this narrows the
  // OUTER aggregate rather than the EXISTS that selects AWBs — see getAwbDrilldown.
  vendors?: string[]
}
```

- [ ] **Step 4: Add the outer predicate**

In `getAwbDrilldown`, directly after the `const routeWhere = routeConds.length ? ... : ''` assignment and before `const offset = (page - 1) * limit`, add:

```ts
    // Vendor is the one filter that belongs in the OUTER predicate. The route and date conditions
    // above sit inside an EXISTS on purpose: they decide which AWBs are listed while the aggregate
    // still sums the whole AWB, because the cost columns are MAX(cost_*_awb) over it. Vendor is
    // different — v_pnl_to.vendor comes from the AWB's booking, so it is constant across an AWB's
    // TOs, and the outer predicate is what has the same scope as the vendor column whose cell was
    // clicked. Putting it inside the EXISTS would produce a third number nobody asked for.
    const vendorWhere = route?.vendors?.length
      ? `AND v.vendor = ANY(${bind(route.vendors)}::text[])`
      : ''
```

Then change the two query bodies so both carry it. In the data query, replace:

```
        WHERE ${where}
        ${routeWhere}
```

with:

```
        WHERE ${where}
        ${routeWhere}
        ${vendorWhere}
```

and replace the count query line:

```ts
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to v WHERE ${where} ${routeWhere}`,
```

with:

```ts
        `SELECT COUNT(DISTINCT awb)::int AS total FROM v_pnl_to v WHERE ${where} ${routeWhere} ${vendorWhere}`,
```

`bind` appends to `routeParams` and numbers from `params.length + routeParams.length`, so calling it here — after every route bind and before `filterParams` is assembled — keeps the numbering contiguous.

- [ ] **Step 5: Forward the repeated `vendor` param**

In `apps/backend/src/modules/pnl/pnl.controller.ts`, replace `getAwbDrilldown` (`:46-63`):

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
    // Repeats, because a vendor group column carries many vendors and a vendor name may contain
    // any punctuation a delimiter would use.
    @Query('vendor') vendor?: string | string[],
  ) {
    const vendors = parseVendorNames(vendor)
    return this.pnlService.getAwbDrilldown(page, limit, cycle, start, end, basis, {
      routes: parseRoutePairs(routes),
      dateFrom,
      dateTo,
      // Omitted rather than sent empty, so an untouched drilldown produces exactly the filter shape
      // it produced before vendors existed — which is also what the existing specs pin.
      ...(vendors.length ? { vendors } : {}),
    })
  }
```

- [ ] **Step 6: Run the full pnl suite**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl --runInBand
```

Expected: PASS, including the fourth HTTP case from Task 5.

- [ ] **Step 7: Typecheck and commit**

```bash
cd apps/backend && pnpm exec tsc --noEmit
git add apps/backend/src/modules/pnl/pnl.service.ts apps/backend/src/modules/pnl/pnl.controller.ts apps/backend/src/modules/pnl/pnl.service.spec.ts
git commit -m "feat(pnl): let the AWB drilldown be narrowed to a set of vendors

The predicate goes outside the route EXISTS, not inside it. The EXISTS decides which AWBs to list
while the aggregate still sums the whole AWB; vendor is constant across an AWB's TOs, so the outer
predicate is the one whose scope matches the vendor column the user clicked."
```

---

### Task 7: Integration test the aggregation against a real database

**Files:**
- Create: `apps/backend/src/modules/pnl/pnl-vendor-comparison.integration.spec.ts`

**Interfaces:**
- Consumes: Tasks 2-4's `getVendorComparison`; Plan 2's `vendor_groups` / `vendor_group_vendors` tables.
- Produces: nothing.

- [ ] **Step 1: Write the spec**

Create `apps/backend/src/modules/pnl/pnl-vendor-comparison.integration.spec.ts`:

```ts
/**
 * Integration test for PnlService.getVendorComparison.
 *
 * pnl.service.spec.ts mocks dataSource.query(), so it can assert what SQL text got sent but cannot
 * tell whether Postgres would accept it — the same gap that let the `v.v.date_ata` double-prefix
 * bug ship behind green tests in the group comparison. This spec runs the real queries, against a
 * real database, through the real service method.
 *
 * Requires a reachable Postgres — DATABASE_URL if set, otherwise the local dev default documented
 * in apps/backend/.env. Skips (loudly, not silently) when unreachable.
 *
 * Run with:
 *   cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" \
 *     pnpm exec jest pnl-vendor-comparison.integration --runInBand
 */

import 'reflect-metadata'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { DataSource, QueryRunner } from 'typeorm'
import { PnlService } from './pnl.service'

const DATABASE_URL_EXPLICIT = !!process.env.DATABASE_URL
const CONNECTION_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/app'

function isDbReachable(url: string): boolean {
  try {
    const u = new URL(url)
    execSync(
      `pg_isready -h ${u.hostname} -p ${u.port || '5432'} -U ${u.username || 'postgres'}`,
      { stdio: 'ignore', timeout: 5000 },
    )
    return true
  } catch {
    return false
  }
}

const DB_AVAILABLE = isDbReachable(CONNECTION_URL)

describe('PnlService.getVendorComparison (integration)', () => {
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
        `SKIPPED pnl-vendor-comparison.integration.spec.ts\n` +
        `Postgres unreachable at ${CONNECTION_URL} (pg_isready failed).\n` +
        `${'='.repeat(78)}\n`,
    )
    it.skip('SKIPPED — database unreachable, see console warning above', () => {})
    return
  }

  const CYCLE = '2026-05-1H'
  const RANGE_START = '2026-05-01'
  const RANGE_END = '2026-05-15'

  let realDataSource: DataSource
  let queryRunner: QueryRunner
  let service: PnlService
  let groupId: string
  // Read from the data rather than hardcoded: vendor names come from a Google Sheet and a literal
  // here would rot the moment the sheet is edited, turning a real regression into a fixture bug.
  let busiestVendor: string

  beforeAll(async () => {
    realDataSource = new DataSource({
      type: 'postgres',
      url: CONNECTION_URL,
      synchronize: false,
      logging: false,
    })
    await realDataSource.initialize()
  })

  afterAll(async () => {
    if (realDataSource?.isInitialized) {
      await realDataSource.destroy()
    }
  })

  beforeEach(async () => {
    queryRunner = realDataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()

    // Route the service through this exact transactional connection so it sees the uncommitted seed
    // rows below. dataSource.query() on the pooled DataSource could land on another connection.
    service = new PnlService({
      query: (sql: string, params?: unknown[]) => queryRunner.query(sql, params),
    } as unknown as DataSource)

    const [row] = await queryRunner.query(
      `SELECT vendor
       FROM v_pnl_to
       WHERE vendor IS NOT NULL AND vendor <> ''
         AND origin_station IS NOT NULL AND dest_station IS NOT NULL
         AND cycle_ata = $1
       GROUP BY vendor
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
      [CYCLE],
    )
    busiestVendor = row?.vendor
    // Sanity: without a vendor that actually has rows this cycle, every assertion below would pass
    // vacuously at 0 == 0.
    expect(busiestVendor).toBeTruthy()

    groupId = randomUUID()
    await queryRunner.query(`INSERT INTO vendor_groups (id, name) VALUES ($1, $2)`, [
      groupId,
      'INT-TEST Vendor Group',
    ])
    await queryRunner.query(
      `INSERT INTO vendor_group_vendors (vendor_group_id, vendor) VALUES ($1, $2)`,
      [groupId, busiestVendor],
    )
  })

  afterEach(async () => {
    // Rolled back, never committed: vendor_groups / vendor_group_vendors are left as found.
    await queryRunner.rollbackTransaction()
    await queryRunner.release()
  })

  const group = () => ({ kind: 'group' as const, id: groupId })

  it('runs in cycle mode without throwing', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)
    expect(result.columns.map((c) => c.id)).toEqual([`vg:${groupId}`])
    expect(result.footer).toHaveLength(1)
  })

  it('runs in range mode without throwing', async () => {
    const result = await service.getVendorComparison(
      [group()],
      undefined,
      RANGE_START,
      RANGE_END,
    )
    expect(result.columns).toHaveLength(1)
  })

  it('runs in the no-filter fallback (WHERE 1=0) without throwing', async () => {
    await expect(service.getVendorComparison([group()])).resolves.toBeDefined()
  })

  it('gives a bare vendor column the same numbers as the group holding only that vendor', async () => {
    const result = await service.getVendorComparison(
      [group(), { kind: 'vendor', name: busiestVendor }],
      CYCLE,
    )

    expect(result.columns.map((c) => c.kind)).toEqual(['group', 'vendor'])
    expect(result.footer[1].totalRevenue).toBeCloseTo(result.footer[0].totalRevenue, 6)
    expect(result.footer[1].totalCost).toBeCloseTo(result.footer[0].totalCost, 6)
    expect(result.footer[1].totalMargin).toBeCloseTo(result.footer[0].totalMargin, 6)
  })

  it('splits an AWB across the routes its TOs flew instead of posting it whole to each', async () => {
    // cost_to is TO-grain, so summing every cell of a single-vendor column must land exactly on
    // SUM(cost_to) for that vendor. A per-AWB rollup (MAX(cost_smu_awb) GROUP BY awb, as the
    // Cost by Vendor panel uses) would post the same AWB's cost to every route the AWB touched,
    // making this total strictly larger. Same argument for the prorated SMU component.
    const [expected] = await queryRunner.query(
      `SELECT
         COALESCE(SUM(cost_to), 0)                      AS cost,
         COALESCE(SUM(revenue_total), 0)                AS revenue,
         COALESCE(SUM(cost_smu_awb * weight_share)
                  FILTER (WHERE cost_to IS NOT NULL), 0) AS cost_smu
       FROM v_pnl_to
       WHERE cycle_ata = $1 AND vendor = $2
         AND origin_station IS NOT NULL AND dest_station IS NOT NULL`,
      [CYCLE, busiestVendor],
    )
    expect(Number(expected.cost)).toBeGreaterThan(0)

    const result = await service.getVendorComparison([group()], CYCLE)
    const summed = result.rows.reduce(
      (acc, row) => {
        const cell = row.cells[0]
        if (!cell) return acc
        return {
          cost: acc.cost + cell.cost,
          revenue: acc.revenue + cell.revenue,
          costSmu: acc.costSmu + cell.costSmu,
        }
      },
      { cost: 0, revenue: 0, costSmu: 0 },
    )

    expect(summed.cost).toBeCloseTo(Number(expected.cost), 4)
    expect(summed.revenue).toBeCloseTo(Number(expected.revenue), 4)
    expect(summed.costSmu).toBeCloseTo(Number(expected.cost_smu), 4)
  })

  it('sums the four cost components to the cell cost for every non-null cell', async () => {
    const cycleResult = await service.getVendorComparison([group()], CYCLE)
    const rangeResult = await service.getVendorComparison(
      [group()],
      undefined,
      RANGE_START,
      RANGE_END,
    )

    let checkedCells = 0
    for (const result of [cycleResult, rangeResult]) {
      for (const row of result.rows) {
        for (const cell of row.cells) {
          if (!cell) continue
          checkedCells += 1
          expect(cell.costSmu + cell.costRa + cell.costSgOut + cell.costSgIn).toBeCloseTo(
            cell.cost,
            4,
          )
        }
      }
    }
    expect(checkedCells).toBeGreaterThan(0)
  })

  it('divides Avg / Route by the routes that have a cell, not by every route', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)
    const footer = result.footer[0]
    const nonNull = result.rows.filter((r) => r.cells[0] !== null).length

    expect(footer.routesWithData).toBe(nonNull)
    expect(nonNull).toBeGreaterThan(0)
    // Strictly fewer than every station pair, or this test proves nothing about the divisor.
    expect(nonNull).toBeLessThan(result.rows.length)
    expect(footer.avgRevenuePerRoute!).toBeCloseTo(footer.totalRevenue / nonNull, 6)
    expect(footer.avgMarginPerRoute!).toBeCloseTo(footer.totalMargin / nonNull, 6)
  })

  it('never emits a station-less row, so nothing can pose as a second footer', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)

    expect(result.rows.every((r) => !!r.origin && !!r.dest)).toBe(true)
    // One footer entry per column, exactly. A station_mapping_missing row leaking through the
    // GROUPING SETS guard would show up as extra issue AWBs on this single entry.
    expect(result.footer).toHaveLength(result.columns.length)
  })

  it('reports coverage below the period total, because most TOs have no vendor', async () => {
    const result = await service.getVendorComparison([group()], CYCLE)

    expect(result.coverage.revenuePeriod).toBeGreaterThan(0)
    expect(result.coverage.revenueInColumns).toBeGreaterThan(0)
    expect(result.coverage.revenueInColumns).toBeLessThan(result.coverage.revenuePeriod)
  })
})
```

- [ ] **Step 2: Run it**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-vendor-comparison.integration --runInBand
```

Expected: PASS against a live database with the Plan 2 migration applied; a loud skip on a host without Postgres. If it skips, run it again on a machine with the database before merging — this is the only test that proves the SQL parses.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/pnl/pnl-vendor-comparison.integration.spec.ts
git commit -m "test(pnl): run the vendor comparison queries against a real database

The mocked spec can assert SQL text but not that Postgres accepts it, which is how the v.v.date_ata
double prefix once shipped behind eight green tests. The prorata assertion is the load-bearing one:
summing every cell has to land on SUM(cost_to), which a per-AWB rollup could not do."
```

---

### Task 8: Frontend wire types, the query hook, and the drilldown vendor param

**Files:**
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.ts:27-31` (`PnlRouteFilter`), `:257` (types), `:298-307` (`routeToParams`), `:317-334` (`usePnlAwbDrilldown`), end of file (new hook)
- Modify: `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts` — it already exists (105 lines, three describe blocks); append to it (`routeToParams` is exported precisely so it can be tested directly)

**Interfaces:**
- Consumes: the backend response from Tasks 2-6.
- Produces:
  - `PnlVendorComparisonColumn`, `PnlVendorComparisonCell`, `PnlVendorComparisonRow`, `PnlVendorComparisonFooter`, `PnlVendorComparison`
  - `type PnlVendorPick = { kind: 'group'; id: string } | { kind: 'vendor'; name: string }`
  - `vendorColumnsToParams(picks: PnlVendorPick[]): string[]`
  - `usePnlVendorComparison(filter: PnlFilter | undefined, picks: PnlVendorPick[])`
  - `PnlRouteFilter.vendors?: string[]`

- [ ] **Step 1: Write the failing test**

APPEND to `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts` (it already exists — keep its header comment, both `jest.mock` calls and all three existing describe blocks; add `vendorColumnsToParams` to the existing import on `:12` and append only the two describe blocks below):

```ts
describe('vendorColumnsToParams', () => {
  it('emits one descriptor per pick, splitting on the first colon only', () => {
    expect(
      vendorColumnsToParams([
        { kind: 'group', id: '11111111-1111-4111-8111-111111111111' },
        { kind: 'vendor', name: 'PT Kargo, Tbk' },
        { kind: 'vendor', name: 'Vendor: Utama' },
      ]),
    ).toEqual([
      'vg:11111111-1111-4111-8111-111111111111',
      'v:PT Kargo, Tbk',
      'v:Vendor: Utama',
    ])
  })

  it('returns an array, not a joined string — the param repeats on the wire', () => {
    expect(Array.isArray(vendorColumnsToParams([{ kind: 'vendor', name: 'ESP' }]))).toBe(true)
  })
})

describe('routeToParams', () => {
  it('sends vendors as an array under the singular `vendor` key the endpoint reads', () => {
    expect(routeToParams({ vendors: ['ESP', 'Angkasa'] })).toEqual({
      vendor: ['ESP', 'Angkasa'],
    })
  })

  it('omits the key entirely when no vendor is selected', () => {
    expect(routeToParams({ routes: [{ origin: 'Jabo', dest: 'Aceh' }] })).toEqual({
      routes: 'Jabo|Aceh',
    })
    expect(routeToParams({ vendors: [] })).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm exec jest usePnl.spec
```

Expected: FAIL — `vendorColumnsToParams` is not exported and `routeToParams` drops `vendors`.

- [ ] **Step 3: Add `vendors` to the filter and to `routeToParams`**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, replace `PnlRouteFilter` (`:27-31`):

```ts
// Narrows the AWB drilldown only. Empty fields are omitted from the request entirely.
export interface PnlRouteFilter {
  routes?: PnlRoutePair[]
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD, inclusive
  // Raw vendor names. Set when the drilldown was opened from a Vendor Comparison cell; the values
  // must stay byte-identical to v_pnl_to.vendor, so nothing here trims or normalises them.
  vendors?: string[]
}
```

and replace `routeToParams` (`:298-307`):

```ts
export function routeToParams(route: PnlRouteFilter | undefined) {
  if (!route) return {}
  return {
    ...(route.routes?.length
      ? { routes: route.routes.map((r) => `${r.origin}|${r.dest}`).join(',') }
      : {}),
    ...(route.dateFrom ? { dateFrom: route.dateFrom } : {}),
    ...(route.dateTo ? { dateTo: route.dateTo } : {}),
    // An array under a singular key: the endpoint reads `vendor` as a repeated param, which needs
    // paramsSerializer: { indexes: null } on the request below or axios writes `vendor[]=`.
    ...(route.vendors?.length ? { vendor: route.vendors } : {}),
  }
}
```

- [ ] **Step 4: Serialise the drilldown request without brackets**

In the same file, replace `usePnlAwbDrilldown` (`:317-334`):

```ts
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

- [ ] **Step 5: Update the existing drilldown HTTP-contract assertion**

`usePnl.spec.ts:63-73` already pins the axios call with `expect(apiClient.get).toHaveBeenCalledWith('/pnl/awb-drilldown', { params: {…} })` — a deep-equality match on a config object whose ONLY key is `params`. The `paramsSerializer` key added in Step 4 fails it. Replace that assertion with:

```ts
    expect(apiClient.get).toHaveBeenCalledWith('/pnl/awb-drilldown', {
      params: {
        cycle: '2026-05-1H',
        basis: 'ata_vendor_wh_destination',
        routes: 'Jabo|Tanjung Pinang',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-01',
        page: 2,
        limit: 50,
      },
      // `vendor` repeats on the wire; axios's default array serializer would write `vendor[]=`,
      // which qs parses under a key called 'vendor[]' that no handler reads.
      paramsSerializer: { indexes: null },
    })
```

- [ ] **Step 6: Add the vendor comparison wire types**

In `apps/frontend/src/features/pnl/hooks/usePnl.ts`, after the `PnlGroupComparison` interface (ends `:257`) and before `function filterToParams`, add:

```ts
export interface PnlVendorComparisonColumn {
  // 'vg:<uuid>' | 'v:<raw name>' — the same descriptor that was sent, so the id round-trips.
  id: string
  name: string
  kind: 'group' | 'vendor'
  // The vendor names this column aggregates, straight from the response — so a clicked cell and
  // the overlap warning both read the same list the numbers came from.
  vendors: string[]
  vendorCount: number
}

// One comparison column the user picked: a saved vendor group, or one raw vendor name.
export type PnlVendorPick =
  | { kind: 'group'; id: string }
  | { kind: 'vendor'; name: string }

// One descriptor per pick, as an ARRAY: `columns` is a repeated query param, not a delimited list.
// Vendor names are free text and may contain ',' or '|', which is exactly why joining is wrong.
export function vendorColumnsToParams(picks: PnlVendorPick[]): string[] {
  return picks.map((p) => (p.kind === 'group' ? `vg:${p.id}` : `v:${p.name}`))
}

export interface PnlVendorComparisonCell {
  revenue: number
  cost: number
  margin: number
  costSmu: number
  costRa: number
  costSgOut: number
  costSgIn: number
  incompleteTos: number
  issues: PnlCellIssue[]
}

export interface PnlVendorComparisonRow {
  origin: string
  originLabel: string
  dest: string
  cells: (PnlVendorComparisonCell | null)[]
}

export interface PnlVendorComparisonFooter {
  totalRevenue: number
  totalCost: number
  totalMargin: number
  totalCostSmu: number
  totalCostRa: number
  totalCostSgOut: number
  totalCostSgIn: number
  routesWithData: number
  avgRevenuePerRoute: number | null
  avgCostPerRoute: number | null
  avgMarginPerRoute: number | null
  incompleteTos: number
  issues: PnlCellIssue[]
}

export interface PnlVendorComparison {
  columns: PnlVendorComparisonColumn[]
  rows: PnlVendorComparisonRow[]
  footer: PnlVendorComparisonFooter[]
  coverage: { revenueInColumns: number; revenuePeriod: number }
}
```

- [ ] **Step 7: Add the query hook**

At the end of `apps/frontend/src/features/pnl/hooks/usePnl.ts`, add:

```ts
// Disabled until at least one column is picked, so an untouched tab makes no request at all.
// picks is part of the query key, so re-picking refetches without a manual invalidate.
export function usePnlVendorComparison(filter: PnlFilter | undefined, picks: PnlVendorPick[]) {
  return useQuery<PnlVendorComparison>({
    queryKey: ['pnl', 'vendor-comparison', filter, picks],
    queryFn: () =>
      apiClient
        .get('/pnl/breakdown/vendor-comparison', {
          params: { ...filterToParams(filter!), columns: vendorColumnsToParams(picks) },
          // Without this axios emits `columns[]=vg:…`, which qs parses under the key 'columns[]'
          // and the handler never sees — every column would silently disappear.
          paramsSerializer: { indexes: null },
        })
        .then((r) => r.data),
    enabled: !!filter && picks.length > 0,
    staleTime: 60 * 1000,
  })
}
```

- [ ] **Step 8: Run tests and typecheck, then commit**

```bash
cd apps/frontend && pnpm exec jest usePnl
cd apps/frontend && pnpm exec tsc --noEmit
git add apps/frontend/src/features/pnl/hooks/usePnl.ts apps/frontend/src/features/pnl/hooks/usePnl.spec.ts
git commit -m "feat(pnl): add the vendor comparison query and a vendor filter on the drilldown

Both requests set paramsSerializer indexes:null. axios's default writes columns[]=, which qs parses
under a key called 'columns[]' that no handler reads — the columns would vanish with no error on
either side, which is the worst shape this bug could take."
```

---

### Task 9: Project the vendor response onto the shared comparison model

**Files:**
- Create: `apps/frontend/src/features/pnl/utils/vendorComparison.ts`
- Test: `apps/frontend/src/features/pnl/utils/vendorComparison.spec.ts`

**Interfaces:**
- Consumes: Plan 1's `ComparisonTableModel`, `ComparisonRowModel`, `ComparisonFooterRowModel`, `COST_COMPONENTS`, `emptyComponents`, `CLEAN` from `./comparison`; Task 8's wire types; the existing `displayRouteLabel` and `periodBounds`.
- Produces:
  - `vendorRowKey(row: { origin: string; dest: string }): string`
  - `toVendorComparisonTable(data: PnlVendorComparison): ComparisonTableModel<PnlVendorComparisonColumn>`
  - `overlappingVendors(columns: PnlVendorComparisonColumn[]): { vendor: string; columnNames: string[] }[]`
  - `routeFromVendorComparisonCell(column, rowKey, bounds: PeriodBounds): PnlRouteFilter`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/utils/vendorComparison.spec.ts`:

```ts
import { PnlVendorComparison, PnlVendorComparisonColumn } from '../hooks/usePnl'
import {
  overlappingVendors,
  routeFromVendorComparisonCell,
  toVendorComparisonTable,
  vendorRowKey,
} from './vendorComparison'

const column = (over: Partial<PnlVendorComparisonColumn> = {}): PnlVendorComparisonColumn => ({
  id: 'v:ESP',
  name: 'ESP',
  kind: 'vendor',
  vendors: ['ESP'],
  vendorCount: 1,
  ...over,
})

function data(over: Partial<PnlVendorComparison> = {}): PnlVendorComparison {
  return {
    columns: [column()],
    rows: [
      {
        origin: 'Jabo',
        originLabel: 'CGK',
        dest: 'Denpasar',
        cells: [
          {
            revenue: 1000,
            cost: 600,
            margin: 385,
            costSmu: 400,
            costRa: 100,
            costSgOut: 50,
            costSgIn: 50,
            incompleteTos: 1,
            issues: [{ issue: 'no_booking', awbs: 2 }],
          },
        ],
      },
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', cells: [null] },
    ],
    footer: [
      {
        totalRevenue: 1000,
        totalCost: 600,
        totalMargin: 385,
        totalCostSmu: 400,
        totalCostRa: 100,
        totalCostSgOut: 50,
        totalCostSgIn: 50,
        routesWithData: 1,
        avgRevenuePerRoute: 1000,
        avgCostPerRoute: 600,
        avgMarginPerRoute: 385,
        incompleteTos: 1,
        issues: [{ issue: 'no_booking', awbs: 5 }],
      },
    ],
    coverage: { revenueInColumns: 3020, revenuePeriod: 10000 },
    ...over,
  }
}

describe('toVendorComparisonTable', () => {
  it('keys rows by origin|dest and labels them with the display route form', () => {
    const model = toVendorComparisonTable(data())

    expect(model.rows[0].rowKey).toBe('Jabo|Denpasar')
    // Formatted here, not in the renderer: the renderer serves two axes and must not know this one
    // holds routes.
    expect(model.rows[0].rowLabel).toBe('CGK → Denpasar')
  })

  it('carries revenue, cost, margin and the four components index-aligned with the columns', () => {
    const model = toVendorComparisonTable(data())

    expect(model.rows[0].revenue).toEqual([1000])
    expect(model.rows[0].cost).toEqual([600])
    expect(model.rows[0].margin).toEqual([385])
    expect(model.rows[0].components.costSmu).toEqual([400])
    expect(model.rows[0].components.costSgIn).toEqual([50])
    expect(model.rows[0].warnings).toEqual([
      { issues: [{ issue: 'no_booking', awbs: 2 }], incompleteTos: 1 },
    ])
  })

  it('renders an absent cell as null everywhere rather than zero', () => {
    const model = toVendorComparisonTable(data())

    expect(model.rows[1].revenue).toEqual([null])
    expect(model.rows[1].margin).toEqual([null])
    expect(model.rows[1].components.costRa).toEqual([null])
    expect(model.rows[1].warnings).toEqual([{ issues: [], incompleteTos: 0 }])
  })

  it('builds a Total row that expands and an Avg / Route row that does not', () => {
    const model = toVendorComparisonTable(data())

    expect(model.footerRows.map((f) => f.label)).toEqual(['Total', 'Avg / Route'])
    expect(model.footerRows[0].margin).toEqual([385])
    expect(model.footerRows[0].components!.costSmu).toEqual([400])
    expect(model.footerRows[1].margin).toEqual([385])
    // The average of a cost component is not itself a cost anyone books.
    expect(model.footerRows[1].components).toBeNull()
    expect(model.footerRows[1].warnings).toBeNull()
  })

  // Frontend and backend deploy in parallel, so a new frontend can briefly hit a backend whose
  // footer has no averages. null renders as an em dash; NaN would render as 'NaN'.
  it('returns null, not NaN, for averages an older backend did not send', () => {
    const stale = data()
    delete (stale.footer[0] as Partial<PnlVendorComparison['footer'][number]>).avgMarginPerRoute
    delete (stale.footer[0] as Partial<PnlVendorComparison['footer'][number]>).totalMargin

    const model = toVendorComparisonTable(stale)

    expect(model.footerRows[0].margin).toEqual([null])
    expect(model.footerRows[1].margin).toEqual([null])
  })
})

describe('overlappingVendors', () => {
  it('names every column that shares a vendor', () => {
    expect(
      overlappingVendors([
        column({ id: 'vg:a', name: 'Group A', kind: 'group', vendors: ['ESP', 'Angkasa'], vendorCount: 2 }),
        column({ id: 'vg:b', name: 'Group B', kind: 'group', vendors: ['ESP'], vendorCount: 1 }),
        column({ id: 'v:Kargo', name: 'Kargo', vendors: ['Kargo'] }),
      ]),
    ).toEqual([{ vendor: 'ESP', columnNames: ['Group A', 'Group B'] }])
  })

  it('says nothing when no vendor appears twice', () => {
    expect(overlappingVendors([column()])).toEqual([])
  })
})

describe('routeFromVendorComparisonCell', () => {
  it('splits the row key at the first pipe and spans the whole period', () => {
    expect(
      routeFromVendorComparisonCell(
        column({ vendors: ['ESP', 'Angkasa'] }),
        'Jabo|Denpasar',
        { min: '2026-05-01', max: '2026-05-15' },
      ),
    ).toEqual({
      routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      vendors: ['ESP', 'Angkasa'],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-15',
    })
  })

  it('omits the dates when the period has no derivable bounds', () => {
    expect(routeFromVendorComparisonCell(column(), 'Jabo|Aceh', { min: '', max: '' })).toEqual({
      routes: [{ origin: 'Jabo', dest: 'Aceh' }],
      vendors: ['ESP'],
    })
  })
})

describe('vendorRowKey', () => {
  it('matches the key the projection produces', () => {
    expect(vendorRowKey({ origin: 'Jabo', dest: 'Denpasar' })).toBe('Jabo|Denpasar')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm exec jest vendorComparison
```

Expected: FAIL — `Cannot find module './vendorComparison'`.

- [ ] **Step 3: Write the projection**

Create `apps/frontend/src/features/pnl/utils/vendorComparison.ts`:

```ts
import {
  PnlRouteFilter,
  PnlVendorComparison,
  PnlVendorComparisonColumn,
} from '../hooks/usePnl'
import { displayRouteLabel } from './routeLabels'
import { PeriodBounds } from './periodBounds'
import {
  CLEAN,
  COST_COMPONENTS,
  ComparisonFooterRowModel,
  ComparisonRowModel,
  ComparisonTableModel,
  emptyComponents,
} from './comparison'

// The row identity on the vendor axis. Station names are guaranteed free of '|', so this is
// reversible by splitting at the first separator — which is what a clicked cell does.
export function vendorRowKey(row: { origin: string; dest: string }): string {
  return `${row.origin}|${row.dest}`
}

export function toVendorComparisonTable(
  data: PnlVendorComparison,
): ComparisonTableModel<PnlVendorComparisonColumn> {
  const rows: ComparisonRowModel[] = data.rows.map((row) => {
    const components = emptyComponents()
    for (const { key } of COST_COMPONENTS) {
      components[key] = row.cells.map((c) => (c ? c[key] : null))
    }
    return {
      rowKey: vendorRowKey(row),
      // Formatted here, not in the renderer: the renderer serves both the date axis and this one
      // and must not know which it is drawing.
      rowLabel: displayRouteLabel(row),
      revenue: row.cells.map((c) => (c ? c.revenue : null)),
      cost: row.cells.map((c) => (c ? c.cost : null)),
      // `issues` and `margin` are non-optional in the type, but frontend and backend roll out in
      // parallel, so a new frontend can briefly hit an old backend whose cells lack the field. A
      // missing margin renders as an em dash, never NaN.
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
      warnings: data.footer.map((f) => ({
        issues: f.issues ?? [],
        incompleteTos: f.incompleteTos,
      })),
    },
    {
      // Divided by routes that have a cell, not by every route the view knows — the backend sends
      // that divisor as routesWithData, and the view names it under the table because it differs
      // per column. No component breakdown: the average of a component is not a cost anyone books.
      label: 'Avg / Route',
      revenue: data.footer.map((f) => f.avgRevenuePerRoute ?? null),
      cost: data.footer.map((f) => f.avgCostPerRoute ?? null),
      margin: data.footer.map((f) => f.avgMarginPerRoute ?? null),
      components: null,
      warnings: null,
    },
  ]

  return { columns: data.columns, rows, footerRows }
}

// Vendors belonging to more than one of the selected columns. Each TO carries at most one vendor,
// so two columns can only double-count when they share a vendor — and then they genuinely do, in
// both columns. Surfacing it stops the table being read as a partition. Computed from the response
// columns rather than the saved groups, so a bare vendor pick that duplicates a group member is
// caught by the same code.
export function overlappingVendors(
  columns: PnlVendorComparisonColumn[],
): { vendor: string; columnNames: string[] }[] {
  const byVendor = new Map<string, string[]>()
  for (const column of columns) {
    for (const vendor of column.vendors) {
      const names = byVendor.get(vendor)
      if (names) names.push(column.name)
      else byVendor.set(vendor, [column.name])
    }
  }
  return [...byVendor.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([vendor, columnNames]) => ({ vendor, columnNames }))
}

// A clicked vendor comparison cell as an AWB drilldown filter. The cell covers the whole period, so
// the dates come from the period bounds rather than from the row — the row is a route, not a day.
export function routeFromVendorComparisonCell(
  column: PnlVendorComparisonColumn,
  rowKey: string,
  bounds: PeriodBounds,
): PnlRouteFilter {
  // First separator only. Station names contain spaces but never '|', so this is exact; splitting
  // on every '|' would break the moment a name ever did.
  const separator = rowKey.indexOf('|')
  const origin = separator === -1 ? rowKey : rowKey.slice(0, separator)
  const dest = separator === -1 ? '' : rowKey.slice(separator + 1)
  return {
    routes: [{ origin, dest }],
    vendors: column.vendors,
    ...(bounds.min ? { dateFrom: bounds.min } : {}),
    ...(bounds.max ? { dateTo: bounds.max } : {}),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest vendorComparison
```

Expected: PASS — 10 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add apps/frontend/src/features/pnl/utils/vendorComparison.ts apps/frontend/src/features/pnl/utils/vendorComparison.spec.ts
git commit -m "feat(pnl): project the vendor comparison response onto the shared table model

The row key is origin|dest and is split at the FIRST separator when a cell is clicked, so a station
name that ever gained a pipe would still resolve. Every field the backend added is read with a ??
fallback so a frontend that lands before the backend renders em dashes rather than NaN."
```

---

### Task 10: A vendor multi-select for the picker

`RoutePicker` is not reusable here: it leans on grouping by origin across ~31 routes, and vendors have no such axis. `MultiRouteFilter` is the right shape — a searchable checkbox dropdown — so this copies it and speaks vendors.

**Files:**
- Create: `apps/frontend/src/components/shared/multi-vendor-filter.tsx`
- Test: `apps/frontend/src/components/shared/multi-vendor-filter.spec.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `MultiVendorFilter` with props `{ vendors: string[]; selected: string[]; onChange: (selected: string[]) => void; className?: string; align?: 'left' | 'right' }`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/shared/multi-vendor-filter.spec.tsx`:

```tsx
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MultiVendorFilter } from './multi-vendor-filter'

const VENDORS = ['Angkasa Kargo', 'ESP', 'PT Kargo, Tbk']

describe('MultiVendorFilter', () => {
  it('summarises the selection on the trigger', () => {
    const { rerender } = render(
      <MultiVendorFilter vendors={VENDORS} selected={[]} onChange={jest.fn()} />,
    )
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('All Vendors')

    rerender(<MultiVendorFilter vendors={VENDORS} selected={['ESP']} onChange={jest.fn()} />)
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('ESP')

    rerender(
      <MultiVendorFilter vendors={VENDORS} selected={['ESP', 'Angkasa Kargo']} onChange={jest.fn()} />,
    )
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('2 vendors')
  })

  it('adds a vendor on tick and removes it on untick', () => {
    const onChange = jest.fn()
    render(<MultiVendorFilter vendors={VENDORS} selected={['ESP']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Angkasa Kargo' }))
    expect(onChange).toHaveBeenCalledWith(['ESP', 'Angkasa Kargo'])

    fireEvent.click(screen.getByRole('checkbox', { name: 'ESP' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  // Vendor names are free text and the list is flat and alphabetical, so search is the only way
  // through a long one.
  it('filters the list by the search box, case-insensitively', () => {
    render(<MultiVendorFilter vendors={VENDORS} selected={[]} onChange={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.change(screen.getByPlaceholderText('Search vendors…'), { target: { value: 'kargo' } })

    expect(screen.getByRole('checkbox', { name: 'Angkasa Kargo' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'PT Kargo, Tbk' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'ESP' })).not.toBeInTheDocument()
  })

  it('says so when the search matches nothing', () => {
    render(<MultiVendorFilter vendors={VENDORS} selected={[]} onChange={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.change(screen.getByPlaceholderText('Search vendors…'), { target: { value: 'zzz' } })

    expect(screen.getByText('No vendors')).toBeInTheDocument()
  })

  it('clears everything from the trigger without opening the dropdown', () => {
    const onChange = jest.fn()
    render(<MultiVendorFilter vendors={VENDORS} selected={['ESP']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear vendors' }))
    expect(onChange).toHaveBeenCalledWith([])
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm exec jest multi-vendor-filter
```

Expected: FAIL — `Cannot find module './multi-vendor-filter'`.

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/components/shared/multi-vendor-filter.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Truck, X } from 'lucide-react'

export interface MultiVendorFilterProps {
  /** All selectable vendor names, raw and already ordered by the caller. */
  vendors: string[]
  /** Currently selected vendor names. */
  selected: string[]
  onChange: (selected: string[]) => void
  /** Optional className for the trigger button wrapper. */
  className?: string
  /** Which edge the dropdown panel aligns to. */
  align?: 'left' | 'right'
}

/**
 * Multi-select vendor filter rendered as a searchable checkbox list inside a dropdown.
 *
 * Deliberately a sibling of MultiRouteFilter rather than a generalisation of it: routes carry a
 * label/pair translation and a MapPin affordance that mean nothing here, and vendors carry free
 * text that needs the search box to be usable. Two small components beat one with a mode flag.
 *
 * Names are passed through untouched — no trim, no case folding — because they have to stay
 * byte-identical to v_pnl_to.vendor all the way to the SQL join.
 */
export function MultiVendorFilter({
  vendors,
  selected,
  onChange,
  className,
  align = 'left',
}: MultiVendorFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    else document.removeEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectedSet = new Set(selected)
  const filtered = search.trim()
    ? vendors.filter((v) => v.toLowerCase().includes(search.trim().toLowerCase()))
    : vendors

  const toggle = (vendor: string) => {
    if (selectedSet.has(vendor)) onChange(selected.filter((v) => v !== vendor))
    else onChange([...selected, vendor])
  }

  const label =
    selected.length === 0
      ? 'All Vendors'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} vendors`

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate text-left">
          <Truck size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear vendors"
              title="Clear vendors"
              onClick={(e) => {
                // Without stopPropagation the click also toggles the dropdown open, so clearing
                // from the collapsed trigger would leave the panel hanging open.
                e.stopPropagation()
                onChange([])
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onChange([])
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className="text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div
          className={`absolute top-full z-[100] mt-2 max-h-80 w-[260px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg ring-1 ring-black/10 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.18)' }}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-muted px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Filter Vendors</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onChange([...vendors])}
                className="rounded border border-border px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded border border-border px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              >
                None
              </button>
            </div>
          </div>

          <div className="border-b border-border px-2 py-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors…"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="max-h-52 overflow-auto px-2 py-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No vendors</p>
            ) : (
              filtered.map((vendor) => (
                <label
                  key={vendor}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs transition-colors hover:bg-accent/30"
                >
                  <input
                    type="checkbox"
                    aria-label={vendor}
                    checked={selectedSet.has(vendor)}
                    onChange={() => toggle(vendor)}
                    className="h-3 w-3 rounded border border-border accent-accent focus:ring-1 focus:ring-accent"
                  />
                  <span className="truncate" title={vendor}>
                    {vendor}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest multi-vendor-filter
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add apps/frontend/src/components/shared/multi-vendor-filter.tsx apps/frontend/src/components/shared/multi-vendor-filter.spec.tsx
git commit -m "feat(pnl): add a searchable vendor multi-select

A sibling of MultiRouteFilter rather than a generalisation: routes carry a label/pair translation
that means nothing for vendors, and RoutePicker's origin grouping has no vendor equivalent at all."
```

---

### Task 11: The Vendor Comparison view

**Files:**
- Create: `apps/frontend/src/features/pnl/components/PnlVendorComparisonView.tsx`
- Test: `apps/frontend/src/features/pnl/components/PnlVendorComparisonView.spec.tsx`

**Interfaces:**
- Consumes: Plan 1's `PnlComparisonTable` (`{ model, firstColumnHeader, cellHint, onCellClick }`); Task 8's `usePnlVendorComparison` / `PnlVendorPick`; Task 9's `toVendorComparisonTable` / `overlappingVendors` / `routeFromVendorComparisonCell`; Task 10's `MultiVendorFilter`; Plan 2's `useVendorGroups` / `useAvailableVendors`.
- Produces: `PnlVendorComparisonView` with props `{ filter: PnlFilter; picks: PnlVendorPick[]; onPicksChange: (next: PnlVendorPick[]) => void; onCellClick?: (route: PnlRouteFilter) => void }`.

**Deliberate refinement of the spec.** The spec asks for a tooltip on the Avg / Route row naming its divisor. `ComparisonFooterRowModel` (Plan 1) carries a `label` and no tooltip, and `routesWithData` differs **per column**, so one shared row label could not state it honestly. The divisor is therefore named in a caption under the table, per column. Changing `ComparisonFooterRowModel` to carry a tooltip would be a Plan 1 change, and one row label cannot hold N divisors anyway.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/pnl/components/PnlVendorComparisonView.spec.tsx`:

```tsx
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PnlFilter, PnlVendorComparison, PnlVendorPick } from '../hooks/usePnl'
import { PnlVendorComparisonView } from './PnlVendorComparisonView'

jest.mock('../hooks/usePnl', () => {
  const actual = jest.requireActual('../hooks/usePnl')
  return { ...actual, usePnlVendorComparison: jest.fn() }
})
jest.mock('@/features/vendor-groups/hooks/useVendorGroups', () => ({
  useVendorGroups: jest.fn(),
  useAvailableVendors: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pnlHooks = require('../hooks/usePnl')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vendorHooks = require('@/features/vendor-groups/hooks/useVendorGroups')

const filter: PnlFilter = { mode: 'cycle', cycle: '2026-05-1H', basis: 'ata_vendor_wh_destination' }

function comparison(over: Partial<PnlVendorComparison> = {}): PnlVendorComparison {
  return {
    columns: [
      { id: 'vg:g1', name: 'Group A', kind: 'group', vendors: ['ESP'], vendorCount: 1 },
    ],
    rows: [
      {
        origin: 'Jabo',
        originLabel: 'CGK',
        dest: 'Denpasar',
        cells: [
          {
            revenue: 1000, cost: 600, margin: 385,
            costSmu: 400, costRa: 100, costSgOut: 50, costSgIn: 50,
            incompleteTos: 0, issues: [],
          },
        ],
      },
      { origin: 'Jabo', originLabel: 'CGK', dest: 'Aceh', cells: [null] },
    ],
    footer: [
      {
        totalRevenue: 1000, totalCost: 600, totalMargin: 385,
        totalCostSmu: 400, totalCostRa: 100, totalCostSgOut: 50, totalCostSgIn: 50,
        routesWithData: 1,
        avgRevenuePerRoute: 1000, avgCostPerRoute: 600, avgMarginPerRoute: 385,
        incompleteTos: 0, issues: [],
      },
    ],
    coverage: { revenueInColumns: 3020, revenuePeriod: 10000 },
    ...over,
  }
}

interface RenderOptions {
  picks?: PnlVendorPick[]
  onPicksChange?: jest.Mock
  groups?: { id: string; name: string; description: string | null; vendors: string[] }[] | undefined
  data?: PnlVendorComparison | undefined
  onCellClick?: jest.Mock
}

function renderView({
  picks = [],
  onPicksChange = jest.fn(),
  groups = [{ id: 'g1', name: 'Group A', description: null, vendors: ['ESP'] }],
  data = comparison(),
  onCellClick,
}: RenderOptions = {}) {
  vendorHooks.useVendorGroups.mockReturnValue({
    data: groups,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
  vendorHooks.useAvailableVendors.mockReturnValue({
    data: [
      { vendor: 'ESP', hasData: true, inMaster: true },
      { vendor: 'Angkasa Kargo', hasData: false, inMaster: true },
    ],
  })
  pnlHooks.usePnlVendorComparison.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })
  return render(
    <PnlVendorComparisonView
      filter={filter}
      picks={picks}
      onPicksChange={onPicksChange}
      onCellClick={onCellClick}
    />,
  )
}

describe('PnlVendorComparisonView', () => {
  beforeEach(() => jest.clearAllMocks())

  it('states what share of period revenue the columns cover, permanently', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }] })

    expect(
      screen.getByText(/Kolom di bawah mencakup 30% revenue periode ini/),
    ).toBeInTheDocument()
  })

  it('falls back to a number-free sentence when an older backend sent no coverage', () => {
    const stale = comparison()
    delete (stale as Partial<PnlVendorComparison>).coverage
    renderView({ picks: [{ kind: 'group', id: 'g1' }], data: stale })

    expect(screen.getByText(/hanya mencakup TO yang punya vendor/)).toBeInTheDocument()
  })

  it('names the Avg / Route divisor per column, because it differs per column', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }] })

    expect(screen.getByText(/Group A = 1 rute/)).toBeInTheDocument()
  })

  it('lists all three reasons the columns do not add up to the period', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }] })

    const note = screen.getByTestId('vendor-comparison-gap-note')
    expect(note).toHaveTextContent('no_booking')
    expect(note).toHaveTextContent('smu_rate_missing')
    expect(note).toHaveTextContent('station_mapping_missing')
  })

  it('warns when two selected columns share a vendor', () => {
    renderView({
      picks: [{ kind: 'group', id: 'g1' }, { kind: 'vendor', name: 'ESP' }],
      data: comparison({
        columns: [
          { id: 'vg:g1', name: 'Group A', kind: 'group', vendors: ['ESP'], vendorCount: 1 },
          { id: 'v:ESP', name: 'ESP', kind: 'vendor', vendors: ['ESP'], vendorCount: 1 },
        ],
      }),
    })

    expect(
      screen.getByText(/Group A, ESP sama-sama memuat vendor ESP/),
    ).toBeInTheDocument()
  })

  it('asks for a pick before it renders any table', () => {
    renderView({ picks: [], data: undefined })

    expect(
      screen.getByText('Pilih minimal satu vendor group atau vendor untuk melihat perbandingan.'),
    ).toBeInTheDocument()
  })

  it('toggles a group pick without disturbing the order of the others', () => {
    const onPicksChange = jest.fn()
    renderView({
      picks: [{ kind: 'vendor', name: 'ESP' }],
      onPicksChange,
      groups: [{ id: 'g1', name: 'Group A', description: null, vendors: ['ESP'] }],
    })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Group A (1 vendor)' }))
    expect(onPicksChange).toHaveBeenCalledWith([
      { kind: 'vendor', name: 'ESP' },
      { kind: 'group', id: 'g1' },
    ])
  })

  it('prunes a pick for a group that no longer exists, but only once the list has loaded', async () => {
    const onPicksChange = jest.fn()

    // groups undefined = cold react-query cache, the normal state after >5 minutes on another tab.
    // Pruning here would delete the very picks the lifted state exists to preserve.
    renderView({ groups: undefined, picks: [{ kind: 'group', id: 'gone' }], onPicksChange })
    expect(onPicksChange).not.toHaveBeenCalled()

    renderView({ picks: [{ kind: 'group', id: 'gone' }], onPicksChange })
    await waitFor(() => expect(onPicksChange).toHaveBeenCalledWith([]))
  })

  // A vendor name can vanish from the sheet at any time, and nothing distinguishes "deleted" from
  // "not synced yet". An empty column is honest and the user can remove it themselves.
  it('never prunes a raw vendor pick, even one with no data', async () => {
    const onPicksChange = jest.fn()
    renderView({ picks: [{ kind: 'vendor', name: 'Sudah Hilang' }], onPicksChange })

    await waitFor(() => expect(pnlHooks.usePnlVendorComparison).toHaveBeenCalled())
    expect(onPicksChange).not.toHaveBeenCalled()
  })

  it('hands a clicked cell to the caller as a period-wide, vendor-scoped route filter', () => {
    const onCellClick = jest.fn()
    renderView({ picks: [{ kind: 'group', id: 'g1' }], onCellClick })

    fireEvent.click(screen.getByTestId('revenue-Jabo|Denpasar-vg:g1'))

    expect(onCellClick).toHaveBeenCalledWith({
      routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
      vendors: ['ESP'],
      dateFrom: '2026-05-01',
      dateTo: '2026-05-15',
    })
  })

  // An empty group column carries `vendors: []`, which routeToParams drops entirely — the
  // drilldown would open with no vendor predicate and list every vendor's AWBs on that route,
  // the exact opposite of what the clicked column means.
  it('does not open a drilldown from a column whose group has no vendors', () => {
    const onCellClick = jest.fn()
    renderView({
      picks: [{ kind: 'group', id: 'g1' }],
      onCellClick,
      data: comparison({
        columns: [{ id: 'vg:g1', name: 'Group Kosong', kind: 'group', vendors: [], vendorCount: 0 }],
      }),
    })

    fireEvent.click(screen.getByTestId('revenue-Jabo|Denpasar-vg:g1'))
    expect(onCellClick).not.toHaveBeenCalled()
  })

  it('labels the first column Route and hints at routes, not dates', () => {
    renderView({ picks: [{ kind: 'group', id: 'g1' }], onCellClick: jest.fn() })

    expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument()
    expect(screen.getByTestId('revenue-Jabo|Denpasar-vg:g1')).toHaveAttribute(
      'title',
      expect.stringContaining('pada rute ini'),
    )
  })

  // Without the client-side cap the server answers a 13-column request with a 400, which lands in
  // the view's generic isError branch as "Failed to load the comparison." plus a Retry button that
  // will fail identically forever — the user is never told what they actually did wrong.
  it('refuses a thirteenth column and says why', async () => {
    const onPicksChange = jest.fn()
    const twelve: PnlVendorPick[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'vendor' as const,
      name: `Vendor ${i}`,
    }))

    renderView({ picks: twelve, onPicksChange })

    expect(screen.getByText(/Maksimum 12 kolom/)).toBeInTheDocument()

    // The group checkbox is still rendered, but ticking it must not add a thirteenth pick.
    await userEvent.click(screen.getByRole('checkbox', { name: /Group 1/ }))
    expect(onPicksChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/frontend && pnpm exec jest PnlVendorComparisonView
```

Expected: FAIL — `Cannot find module './PnlVendorComparisonView'`.

- [ ] **Step 3: Write the view**

Create `apps/frontend/src/features/pnl/components/PnlVendorComparisonView.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { MultiVendorFilter } from '@/components/shared/multi-vendor-filter'
import {
  useAvailableVendors,
  useVendorGroups,
} from '@/features/vendor-groups/hooks/useVendorGroups'
import {
  PnlFilter,
  PnlRouteFilter,
  PnlVendorPick,
  usePnlVendorComparison,
} from '../hooks/usePnl'
import { periodBounds } from '../utils/periodBounds'
import {
  overlappingVendors,
  routeFromVendorComparisonCell,
  toVendorComparisonTable,
} from '../utils/vendorComparison'
import { PnlComparisonTable } from './PnlComparisonTable'

// Mirrors MAX_VENDOR_COLUMNS in apps/backend/src/modules/pnl/pnl-vendor-columns.util.ts. Enforced
// here too because the server answers an over-long request with a 400, which the error branch below
// would render as an unexplained "Failed to load the comparison." with a Retry button that fails
// identically forever, never telling the user they simply picked too many columns.
const MAX_VENDOR_COLUMNS = 12

interface PnlVendorComparisonViewProps {
  filter: PnlFilter
  // Pick order is column order, so the array is appended to rather than re-sorted. Owned by the
  // page so switching tabs — which unmounts this component outright — does not discard it.
  picks: PnlVendorPick[]
  onPicksChange: (next: PnlVendorPick[]) => void
  onCellClick?: (route: PnlRouteFilter) => void
}

export function PnlVendorComparisonView({
  filter,
  picks,
  onPicksChange,
  onCellClick,
}: PnlVendorComparisonViewProps) {
  const {
    data: groups,
    isLoading: isLoadingGroups,
    isError: isGroupsError,
    refetch: refetchGroups,
  } = useVendorGroups()
  const { data: availableVendors } = useAvailableVendors()
  const { data, isLoading, isError, refetch } = usePnlVendorComparison(filter, picks)

  const pickedVendors = picks.flatMap((p) => (p.kind === 'vendor' ? [p.name] : []))

  // Picks outlive this component, so a group deleted while the user was on another tab would
  // otherwise leave a checkbox pointing at nothing. The `!groups` guard is load-bearing:
  // useVendorGroups has no initialData and react-query's default 5-minute gcTime means an
  // undefined list is the normal state after a few minutes away — pruning then would wipe the
  // selection this whole feature exists to keep. Raw vendor picks are never pruned; a name can
  // vanish from the sheet at any time and an empty column is the honest answer.
  useEffect(() => {
    if (!groups) return
    const pruned = picks.filter((p) => p.kind !== 'group' || groups.some((g) => g.id === p.id))
    if (pruned.length !== picks.length) onPicksChange(pruned)
  }, [groups, picks, onPicksChange])

  const atLimit = picks.length >= MAX_VENDOR_COLUMNS

  const toggleGroup = (id: string) => {
    const isPicked = picks.some((p) => p.kind === 'group' && p.id === id)
    // Unchecking is always allowed; only adding is capped.
    if (!isPicked && atLimit) return
    onPicksChange(
      isPicked
        ? picks.filter((p) => !(p.kind === 'group' && p.id === id))
        : [...picks, { kind: 'group', id }],
    )
  }

  // Vendors are replaced wholesale by the dropdown, but the group picks keep their relative order:
  // dropping and re-adding every pick would silently reshuffle the columns.
  const setVendorNames = (names: string[]) => {
    const kept = picks.filter((p) => p.kind === 'group' || names.includes(p.name))
    const added = names
      .filter((name) => !picks.some((p) => p.kind === 'vendor' && p.name === name))
      .map((name) => ({ kind: 'vendor' as const, name }))
    // The dropdown's "All" button hands over every vendor at once, so the cap is applied here too
    // rather than only on the group checkboxes.
    onPicksChange([...kept, ...added].slice(0, MAX_VENDOR_COLUMNS))
  }

  const overlaps = overlappingVendors(data?.columns ?? [])
  const bounds = periodBounds(filter)

  if (isLoadingGroups) {
    return <div className="h-24 animate-pulse rounded-lg border bg-card" />
  }

  // Distinct from the "nothing to pick" empty state below: GET /vendor-groups is guarded by
  // read.vendor_group, so a user without it gets a 403 here, not an empty list — and would
  // otherwise be told to go create a group on a page that bounces them straight back out.
  if (isGroupsError) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Failed to load Vendor Groups.</p>
        <button onClick={() => refetchGroups()} className="mt-2 text-sm text-primary underline">
          Retry
        </button>
      </div>
    )
  }

  // A user with no saved groups can still compare bare vendors, so this only blocks the whole tab
  // when there is genuinely nothing to pick from.
  if ((groups ?? []).length === 0 && (availableVendors ?? []).length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        {/* Each sentence is its own node so the surrounding <p> never mixes text with the link —
            a mixed parent makes getByText unable to match either half. */}
        <p className="text-sm text-muted-foreground">
          <span>Belum ada Vendor Group maupun vendor yang bisa dibandingkan.</span>{' '}
          <Link href="/vendor-groups" className="text-primary underline">
            Buat satu dulu
          </Link>
          <span>.</span>
        </p>
      </div>
    )
  }

  const coverage = data?.coverage ?? null
  const coveragePct =
    coverage && coverage.revenuePeriod > 0
      ? Math.round((coverage.revenueInColumns / coverage.revenuePeriod) * 100)
      : null
  const divisorNote = (data?.columns ?? [])
    .map((column, i) => `${column.name} = ${data?.footer[i]?.routesWithData ?? 0} rute`)
    .join(', ')

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        {(groups ?? []).length > 0 && (
          <>
            <p className="mb-2 text-sm font-medium">Vendor Group</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(groups ?? []).map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${group.name} (${group.vendors.length} vendor)`}
                    checked={picks.some((p) => p.kind === 'group' && p.id === group.id)}
                    onChange={() => toggleGroup(group.id)}
                  />
                  <span>{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.vendors.length} vendor
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <p className="mb-2 mt-4 text-sm font-medium">Vendor</p>
        <MultiVendorFilter
          className="w-[260px]"
          vendors={(availableVendors ?? []).map((v) => v.vendor)}
          selected={pickedVendors}
          onChange={setVendorNames}
        />

        {atLimit && (
          <p className="mt-2 text-xs text-amber-600">
            {`Maksimum ${MAX_VENDOR_COLUMNS} kolom. Lepas satu pilihan dulu untuk menambah yang lain.`}
          </p>
        )}

        {overlaps.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {/* Built as one interpolated string rather than mixed JSX children, so the whole
                sentence lands in a single text node the tests can match on. */}
            {overlaps.map((o) => (
              <p key={o.vendor}>
                {`${o.columnNames.join(', ')} sama-sama memuat vendor ${o.vendor} — angkanya dihitung di setiap kolom, jadi kolom-kolom ini tidak boleh dijumlahkan.`}
              </p>
            ))}
          </div>
        )}
      </div>

      {picks.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Pilih minimal satu vendor group atau vendor untuk melihat perbandingan.
          </p>
        </div>
      ) : isLoading ? (
        <div className="h-[420px] animate-pulse rounded-lg border bg-card" />
      ) : isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Failed to load the comparison.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="space-y-2">
          {/* Permanent, not conditional on a threshold. Only about a third of TOs carry a vendor,
              so without this the table reads as a decomposition of period revenue and quietly
              loses the rest. */}
          <div className="rounded-md bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            {coveragePct != null
              ? `Kolom di bawah mencakup ${coveragePct}% revenue periode ini. Sisanya berasal dari TO yang tidak punya vendor.`
              : 'Kolom di bawah hanya mencakup TO yang punya vendor. Porsinya belum bisa dihitung dari response ini.'}
          </div>

          {/* Revenue is SUM(revenue_total), gross — revenue_discount is never subtracted. Margin
              does subtract it, so the two columns do not differ by Cost alone. */}
          <p className="text-xs text-muted-foreground">
            Kolom Revenue di sini bruto (belum dikurangi discount), sama seperti tab Daily Report.
            Margin sudah dikurangi discount, jadi Revenue − Cost tidak sama dengan Margin —
            selisihnya adalah discount.
          </p>

          <PnlComparisonTable
            model={toVendorComparisonTable(data)}
            firstColumnHeader="Route"
            cellHint="Lihat AWB kolom ini pada rute ini"
            onCellClick={
              onCellClick
                ? (column, rowKey) => {
                    // A group with no members yields `vendors: []`, which routeToParams drops —
                    // the drilldown would then show every vendor's AWBs on this route, which is
                    // not what this column represents. An empty column has nothing to drill into.
                    if (column.vendors.length === 0) return
                    onCellClick(routeFromVendorComparisonCell(column, rowKey, bounds))
                  }
                : undefined
            }
          />

          {/* The same footer slot divides by calendar days in Route Comparison. Named here rather
              than in the row label because routesWithData differs per column, and one label cannot
              honestly state N divisors. */}
          <p className="text-xs text-muted-foreground">
            {`Avg / Route dibagi jumlah rute yang punya data di kolom itu, bukan seluruh rute — jadi pembaginya bisa berbeda antar kolom: ${divisorNote}.`}
          </p>

          <p
            data-testid="vendor-comparison-gap-note"
            className="text-xs text-muted-foreground"
          >
            Kolom-kolom ini tidak menjumlah ke total periode. Tiga sebabnya: TO tanpa booking
            sehingga vendornya kosong (no_booking); TO yang nama vendornya string kosong, yang
            jatuh ke smu_rate_missing dan bukan no_booking; dan TO ber-station_mapping_missing,
            yang punya vendor dan biaya tetapi belum punya rute sehingga tidak muncul di baris
            mana pun.
          </p>

          <p className="text-xs text-muted-foreground">
            Angka di sini juga tidak akan sama dengan panel Cost by Vendor di tab Estimated: panel
            itu memakai rollup per-AWB, sedangkan tabel ini memakai prorata weight_share per rute.
          </p>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest PnlVendorComparisonView
```

Expected: PASS — 13 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add apps/frontend/src/features/pnl/components/PnlVendorComparisonView.tsx apps/frontend/src/features/pnl/components/PnlVendorComparisonView.spec.tsx
git commit -m "feat(pnl): add the Vendor Comparison view

The coverage banner is permanent rather than threshold-based, because roughly two thirds of TOs
have no vendor at all and a table that omits them silently reads as a full decomposition of the
period. The Avg / Route divisor is named in a caption instead of the row label: it differs per
column, so one shared label could not state it truthfully."
```

---

### Task 12: Five tabs, the vendors view, and the lifted vendor picks

The tab row is currently a segmented control: `flex w-fit rounded-md border overflow-hidden` with a `border-l` separator on each button after the first. Adding `flex-wrap` alone breaks it — the first button on the wrapped row still carries `border-l` and draws a rule against nothing, and there is no `border-t` between the rows. It becomes a **gapped pill row** instead.

**Files:**
- Modify: `apps/frontend/src/features/pnl/constants.ts` — append `VENDOR_COMPARISON_LABEL` (tab labels cannot live in `page.tsx`; see Step 3)
- Modify: `apps/frontend/src/app/(dashboard)/pnl/page.tsx` — imports (`:25`), state (`:84`), gate effect (`:103-107`), render branch (`:283-287`), plus two regions Plan 1 has already edited: anchor on the **declarations**, not on line numbers. The `PnlView` union and `VIEW_SUBTITLE` moved when Plan 1 edited them, and the tab row now has a fourth button — anchor on the `Estimated` / `Actual vs Estimate` / `Daily Report` / `Route Comparison` buttons.
- Test: `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx`

**Interfaces:**
- Consumes: Task 8's `PnlVendorPick`; Task 11's `PnlVendorComparisonView`.
- Produces: view key `'vendors'`; `VENDOR_COMPARISON_LABEL` exported from `@/features/pnl/constants`; page state `vendorPicks` / `setVendorPicks`.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/app/(dashboard)/pnl/page.spec.tsx`, add a mock beside the existing view mocks. It renders its `picks` prop — lifted state is invisible while a mock throws its props away — and offers a fake cell:

```tsx
const VENDOR_CELL_ROUTE: PnlRouteFilter = {
  routes: [{ origin: 'Jabo', dest: 'Denpasar' }],
  vendors: ['ESP'],
  dateFrom: '2026-05-01',
  dateTo: '2026-05-15',
}

jest.mock('@/features/pnl/components/PnlVendorComparisonView', () => ({
  PnlVendorComparisonView: ({
    picks,
    onPicksChange,
    onCellClick,
  }: {
    picks: { kind: string }[]
    onPicksChange: (next: { kind: string; name: string }[]) => void
    onCellClick?: (route: PnlRouteFilter) => void
  }) => (
    <div data-testid="vendor-comparison-view">
      <span data-testid="vendor-picks">{`picks:${picks.length}`}</span>
      <button onClick={() => onPicksChange([{ kind: 'vendor', name: 'ESP' }])}>pick-vendor</button>
      <button onClick={() => onCellClick?.(VENDOR_CELL_ROUTE)}>vendor-cell</button>
    </div>
  ),
}))
```

then add a describe block:

```tsx
describe('PnlPage Vendor Comparison tab', () => {
  beforeAll(() => {
    window.requestAnimationFrame = jest.fn()
    Element.prototype.scrollIntoView = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ replace: jest.fn() })
    ;(usePnlCycles as jest.Mock).mockReturnValue({
      data: ['2026-05-1H'],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
    ;(usePnlSummary as jest.Mock).mockReturnValue({
      data: {
        label: '2026-05-1H',
        totalTos: 0, totalAwbs: 0, totalRevenue: 0, totalDiscount: 0,
        totalCost: 0, grossProfit: 0, grossMarginPct: 0,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    })
  })

  it('hides the tab from a user without read.vendor_group', () => {
    renderPage({ permissions: ['read.pnl', 'read.route_group'] })

    expect(screen.queryByRole('button', { name: 'Vendor Comparison' })).not.toBeInTheDocument()
  })

  it('shows the tab to a user with read.vendor_group', () => {
    renderPage({ permissions: ['read.pnl', 'read.vendor_group'] })

    expect(screen.getByRole('button', { name: 'Vendor Comparison' })).toBeInTheDocument()
  })

  it('keeps the vendor picks when the user leaves the tab and comes back', () => {
    renderPage({ permissions: ['read.pnl', 'read.vendor_group'] })

    fireEvent.click(screen.getByRole('button', { name: 'Vendor Comparison' }))
    expect(screen.getByTestId('vendor-picks')).toHaveTextContent('picks:0')

    // Drive the page's lifted state through the mock, then leave and return.
    fireEvent.click(screen.getByRole('button', { name: 'pick-vendor' }))
    expect(screen.getByTestId('vendor-picks')).toHaveTextContent('picks:1')

    fireEvent.click(screen.getByRole('button', { name: 'Daily Report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vendor Comparison' }))

    expect(screen.getByTestId('vendor-picks')).toHaveTextContent('picks:1')
  })

  it('switches to Estimated and applies a clicked vendor cell as the drilldown route', () => {
    renderPage({ permissions: ['read.pnl', 'read.vendor_group'] })

    fireEvent.click(screen.getByRole('button', { name: 'Vendor Comparison' }))
    fireEvent.click(screen.getByRole('button', { name: 'vendor-cell' }))

    expect(screen.getByText('Estimated').className).toContain('bg-primary')
    expect(screen.getByTestId('drilldown-route')).toHaveTextContent(
      JSON.stringify(VENDOR_CELL_ROUTE),
    )
  })

  // flex-wrap alone would leave the first button of the wrapped row drawing a border-l against
  // nothing, with no border-t between the two rows. The row is a gapped pill row instead.
  it('renders the five tabs as a wrapping gapped pill row, with no leftover separators', () => {
    const { container } = renderPage({
      permissions: ['read.pnl', 'read.route_group', 'read.vendor_group'],
    })

    const row = container.querySelector('[data-testid="pnl-view-tabs"]')!
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('gap-2')
    expect(row.className).not.toContain('overflow-hidden')

    const buttons = Array.from(row.querySelectorAll('button'))
    expect(buttons).toHaveLength(5)
    for (const button of buttons) {
      expect(button.className).toContain('rounded-md border')
      expect(button.className).not.toContain('border-l')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/frontend && pnpm exec jest pnl/page
```

Expected: FAIL — there is no Vendor Comparison button, no `pnl-view-tabs` test id, and four tab buttons.

- [ ] **Step 3: Add the view key, label, subtitle and state**

In `apps/frontend/src/app/(dashboard)/pnl/page.tsx`, add to the imports beside `PnlRouteComparisonView` (`:25`):

```tsx
import { PnlVendorComparisonView } from '@/features/pnl/components/PnlVendorComparisonView'
```

and add `PnlVendorPick` to the existing `@/features/pnl/hooks/usePnl` import list (`:7-16`), beside `PnlColumnPick`.

**The tab label does NOT go in `page.tsx`.** Next 14's App Router type-checks a page module against a fixed export whitelist (`default`, `metadata`, `generateMetadata`, `generateStaticParams`, route-segment config). Any other named export fails `tsc --noEmit` with `TS2344` against the generated `.next/types/app/(dashboard)/pnl/page.ts`. This was hit and verified during Plan 1, which is why `ROUTE_COMPARISON_LABEL` lives in `apps/frontend/src/features/pnl/constants.ts`. Add the vendor label beside it.

Append to `apps/frontend/src/features/pnl/constants.ts`:

```ts
export const VENDOR_COMPARISON_LABEL = 'Vendor Comparison'
```

and add it to the existing `@/features/pnl/constants` import in `page.tsx`, beside `ROUTE_COMPARISON_LABEL`.

Then, in `page.tsx`, replace the `PnlView` union and `VIEW_SUBTITLE`. Anchor on those two declarations rather than on a line number — Plan 1 has already edited this region.

```tsx
type PnlView = 'estimate' | 'actual' | 'daily' | 'routes' | 'vendors'

const VIEW_SUBTITLE: Record<PnlView, string> = {
  estimate: 'Estimated P&L based on arrival date — not yet billed',
  actual: 'Actual revenue from settled invoices vs estimate',
  daily: 'Daily revenue and profit margin per origin and destination',
  routes: 'Revenue, cost and margin per date, compared across routes and route groups',
  vendors: 'Revenue, cost and margin per route, compared across vendors and vendor groups',
}
```

Add the state beside `routePicks` (`:84`):

```tsx
  // Lifted out of PnlVendorComparisonView for the same reason routePicks is: the tab is rendered
  // by a ternary below, so leaving it unmounts the component outright. Deliberately NOT cleared by
  // the period effect — a pick carries no date, unlike drilldownRoute.
  const [vendorPicks, setVendorPicks] = useState<PnlVendorPick[]>([])
```

- [ ] **Step 4: Add the defensive view gate**

After the existing `read.route_group` backstop effect (`:103-107`), add:

```tsx
  // Same backstop as the route tab above: the button is the only way `view` becomes 'vendors'
  // today, but a future URL- or storage-driven value must not be able to park a user on a view
  // whose picker they are not allowed to load.
  useEffect(() => {
    if (view === 'vendors' && !hasPermission('read.vendor_group')) {
      setView('estimate')
    }
  }, [view, hasPermission])
```

- [ ] **Step 5: Restyle the tab row and add the fifth tab**

Replace the whole tab row (`:157-184`) with:

```tsx
          {/* A gapped pill row, not a segmented control. Five tabs no longer fit on one line at
              narrow widths, and merely adding flex-wrap to the old segmented control leaves the
              first button of the wrapped row drawing a border-l against nothing, with no border-t
              separating the rows. Each button owns its whole border instead. */}
          <div data-testid="pnl-view-tabs" className="mt-2 flex flex-wrap gap-2 text-sm">
            <button
              className={`rounded-md border px-3 py-1.5 ${view === 'estimate' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('estimate')}
            >
              Estimated
            </button>
            <button
              className={`rounded-md border px-3 py-1.5 ${view === 'actual' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('actual')}
            >
              Actual vs Estimate
            </button>
            <button
              className={`rounded-md border px-3 py-1.5 ${view === 'daily' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
              onClick={() => setView('daily')}
            >
              Daily Report
            </button>
            {hasPermission('read.route_group') && (
              <button
                className={`rounded-md border px-3 py-1.5 ${view === 'routes' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                onClick={() => setView('routes')}
              >
                {ROUTE_COMPARISON_LABEL}
              </button>
            )}
            {hasPermission('read.vendor_group') && (
              <button
                className={`rounded-md border px-3 py-1.5 ${view === 'vendors' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                onClick={() => setView('vendors')}
              >
                {VENDOR_COMPARISON_LABEL}
              </button>
            )}
          </div>
```

- [ ] **Step 6: Render the tab**

In the render ternary chain, insert a branch directly after the `view === 'routes'` branch and before the final `) : (`:

```tsx
      ) : view === 'vendors' ? (
        filter &&
        hasPermission('read.vendor_group') && (
          <PnlVendorComparisonView
            filter={filter}
            picks={vendorPicks}
            onPicksChange={setVendorPicks}
            onCellClick={applyDrilldownRoute}
          />
        )
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest pnl
```

Expected: PASS. If a pre-existing case asserted four tab buttons or the segmented-control classes, update it — the restyle is intended, not a regression.

- [ ] **Step 8: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add -A "apps/frontend/src/app/(dashboard)/pnl"
git commit -m "feat(pnl): add the Vendor Comparison tab to the P&L page

The tab row becomes a gapped pill row rather than gaining flex-wrap. The old segmented control put
the separator on each button as border-l, so wrapping left the first button of the second row
drawing a rule against nothing and the two rows touching with no border between them.

The tab is gated on read.vendor_group in the UI only — the endpoint stays on read.pnl, because a
method-level @Authorize would replace the class-level one rather than add to it."
```

---

### Task 13: Make the drilldown's vendor filter visible and removable

`hasRoute` (`:121`) gates the Reset button, and both `setRoutes` (`:130`) and `setDate` (`:134`) spread `...route`. A vendor filter that is neither shown nor counted would therefore survive every edit the user makes and every Reset they press — an invisible narrowing on a panel whose whole job is to explain a number.

**Files:**
- Modify: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx:4` (import), `:121` (`hasRoute`), `:135` (new handler), `:155-161` (note), `:163-209` (filter row)
- Test: `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`

**Interfaces:**
- Consumes: Task 8's `PnlRouteFilter.vendors`.
- Produces: no new exports — behaviour only.

- [ ] **Step 1: Write the failing tests**

Add to `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx`:

```tsx
describe('PnlAwbDrilldown vendor filter', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows each active vendor as a chip', () => {
    mockRows([row()])
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ vendors: ['ESP', 'Angkasa Kargo'] }}
        onRouteChange={jest.fn()}
      />,
    )

    expect(screen.getByTestId('vendor-chip-ESP')).toHaveTextContent('ESP')
    expect(screen.getByTestId('vendor-chip-Angkasa Kargo')).toHaveTextContent('Angkasa Kargo')
  })

  it('drops one vendor without disturbing the rest of the filter', () => {
    const onRouteChange = jest.fn()
    mockRows([row()])
    render(
      <PnlAwbDrilldown
        filter={filter}
        route={{ vendors: ['ESP', 'Angkasa Kargo'], dateFrom: '2026-05-01' }}
        onRouteChange={onRouteChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))

    expect(onRouteChange).toHaveBeenCalledWith({
      vendors: ['Angkasa Kargo'],
      dateFrom: '2026-05-01',
    })
  })

  // Empty means "no filter": routeToParams drops empty fields, and an empty array would otherwise
  // be serialised as a filter that matches nothing.
  it('removes the key entirely when the last vendor is dropped', () => {
    const onRouteChange = jest.fn()
    mockRows([row()])
    render(
      <PnlAwbDrilldown filter={filter} route={{ vendors: ['ESP'] }} onRouteChange={onRouteChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hapus filter vendor ESP' }))

    expect(onRouteChange).toHaveBeenCalledWith({ vendors: undefined })
  })

  // Without this, a drilldown opened from a vendor cell would show no Reset at all, and the hidden
  // vendor filter would survive every route and date edit because both handlers spread ...route.
  it('turns Reset on when only vendors are set, and Reset clears them', () => {
    const onRouteChange = jest.fn()
    mockRows([row()])
    render(
      <PnlAwbDrilldown filter={filter} route={{ vendors: ['ESP'] }} onRouteChange={onRouteChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onRouteChange).toHaveBeenCalledWith({})
  })

  it('warns that these numbers will not equal the cell that opened them', () => {
    mockRows([row()])
    render(
      <PnlAwbDrilldown filter={filter} route={{ vendors: ['ESP'] }} onRouteChange={jest.fn()} />,
    )

    expect(screen.getByTestId('vendor-scope-note')).toHaveTextContent(/weight_share/)
  })

  it('says nothing about vendors when no vendor filter is active', () => {
    mockRows([row()])
    render(<PnlAwbDrilldown filter={filter} route={{}} onRouteChange={jest.fn()} />)

    expect(screen.queryByTestId('vendor-scope-note')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/frontend && pnpm exec jest PnlAwbDrilldown
```

Expected: FAIL — no chips render, and `Reset` is absent because `hasRoute` ignores `vendors`.

- [ ] **Step 3: Import the close icon**

In `apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx`, change `:4`:

```tsx
import { ChevronDown, ChevronRight } from 'lucide-react'
```

to:

```tsx
import { ChevronDown, ChevronRight, X } from 'lucide-react'
```

- [ ] **Step 4: Count vendors in `hasRoute` and add the remover**

Replace `hasRoute` (`:121`):

```tsx
  // `vendors` is in here, not just routes and dates. A drilldown opened from a Vendor Comparison
  // cell carries only a vendor and a period; leaving it out would hide Reset from exactly the user
  // who most needs it, and — because setRoutes and setDate both spread ...route — the invisible
  // vendor narrowing would then survive every edit they made.
  const vendors = route.vendors ?? []
  const hasRoute = Boolean(route.routes?.length || route.dateFrom || route.dateTo || vendors.length)
```

and add after `setDate` (`:135`):

```tsx
  // Same "empty means no filter" rule as setRoutes: an empty array would be serialised as a filter
  // matching nothing rather than as no filter at all.
  function removeVendor(name: string) {
    const next = vendors.filter((v) => v !== name)
    onRouteChange({ ...route, vendors: next.length ? next : undefined })
  }
```

- [ ] **Step 5: Add the reconciliation note**

Inside the header `<div className="border-b px-4 py-3">`, after the existing `hasRoute && overhangCount > 0` paragraph (`:155-161`), add:

```tsx
        {vendors.length > 0 && (
          <p data-testid="vendor-scope-note" className="mt-1 text-xs text-amber-600">
            Angka di sini menjumlahkan seluruh TO milik AWB yang cocok dan memakai biaya per-AWB,
            sedangkan sel Vendor Comparison memakai prorata weight_share yang dibatasi satu rute.
            Kedua angka memang tidak akan sama.
          </p>
        )}
```

- [ ] **Step 6: Render the chips**

In the filter row `<div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">`, add directly before the `{hasRoute && ( <button ... Reset` block (`:200`):

```tsx
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
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd apps/frontend && pnpm exec jest PnlAwbDrilldown
```

Expected: PASS — 6 new tests plus every pre-existing one.

- [ ] **Step 8: Typecheck and commit**

```bash
cd apps/frontend && pnpm exec tsc --noEmit
git add apps/frontend/src/features/pnl/components/PnlAwbDrilldown.tsx apps/frontend/src/features/pnl/components/PnlAwbDrilldown.spec.tsx
git commit -m "feat(pnl): show the drilldown's vendor filter as removable chips

setRoutes and setDate both spread ...route, so a vendor filter the panel never rendered would have
survived every edit the user made — and hasRoute gates Reset, so a drilldown opened from a vendor
cell would not even have offered a way out.

The panel also states outright that these numbers will not match the cell that opened them: the
drilldown rolls up whole AWBs while the cell prorates by weight_share within one route."
```

---

### Task 14: Full-suite verification

**Files:** none.

- [ ] **Step 1: Run both suites in full**

```bash
cd apps/backend && NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest --runInBand
cd ../frontend && pnpm exec jest
```

Expected: PASS in both. Record any pre-existing failure explicitly rather than assuming it is unrelated.

- [ ] **Step 2: Run the integration spec against a live database**

```bash
cd apps/backend && DATABASE_URL="postgres://postgres:postgres@localhost:5432/app" \
  NODE_OPTIONS="--max-old-space-size=5120" pnpm exec jest pnl-vendor-comparison.integration --runInBand
```

Expected: PASS. With `DATABASE_URL` set the spec fails loudly rather than skipping, so a green run here is real. This is the only test that proves the SQL parses; do not merge on a skip.

- [ ] **Step 3: Typecheck both apps**

```bash
cd apps/backend && pnpm exec tsc --noEmit
cd ../frontend && pnpm exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Check the tab row and the table at narrow viewports**

Run the app and open P&L as a user holding `read.pnl`, `read.route_group` and `read.vendor_group`. At 1280px and 768px confirm:

- all five tab buttons are visible, each with its own full border, and when they wrap onto two lines there is no stray rule and no touching rows;
- Vendor Comparison with three columns scrolls horizontally **inside** the table container while the page body does not (only the first column is sticky-left, and the table is now 1 + 3N columns over every station pair).

- [ ] **Step 5: Verify the permission gate as a non-super-admin**

A super admin passes both `RbacGuard` (`rbac.guard.ts:38-41`) and `usePermissions` (`use-permissions.ts:9-10`), so the tab appears for them whether or not the grant step was done. Sign in as a **non**-super-admin without `read.vendor_group` and confirm the tab is absent; grant the permission to their role and confirm it appears. Testing this as a super admin passes vacuously.

- [ ] **Step 6: Commit anything the verification changed**

```bash
git add -A
git commit -m "test(pnl): verify both suites after the Vendor Comparison tab"
```

---

## Self-Review

**Spec coverage — every requirement in Fitur 5 mapped to a task.**

| Spec requirement | Task |
|---|---|
| `GET /pnl/breakdown/vendor-comparison` with cycle/range + basis | 5 |
| `columns` repeated param; handler typed `string \| string[]`; `Array.isArray` normalisation | 1, 5 |
| Split at the **first** colon; `vg:<uuid>` / `v:<raw name>`; dedupe; malformed → 400 | 1 |
| Unknown vendor name allowed through as an empty column, not a 400 | 1 (parser), 2 (service) |
| Max 12 columns | 1 (server), 11 (client cap, so an over-long pick never becomes an unexplained 400) |
| Deleted group dropped, mirroring `pnl.service.ts:1043` | 2 |
| Response shape: `PnlVendorComparisonColumn/Cell/Row/Footer/Comparison` | 2 |
| Fact SQL with `col_vendors` UNNEST CTE and `GROUP BY 1,2,3` | 3 |
| Gross revenue; Daily Report margin expression | 3 |
| Three components × `weight_share`, `cost_sg_in_to` **not** multiplied again | 3 |
| `AND v.origin_station IS NOT NULL AND v.dest_station IS NOT NULL` on **both** queries | 3 |
| Issue query with `GROUPING SETS ((o,d,col,issue),(col,issue))` + `indexIssueRows` | 3 |
| Rows = all pairs from `getStations()`, `rowKey = origin + '\|' + dest` | 2 (rows), 9 (rowKey) |
| Footer: Total, and Avg / Route ÷ `routesWithData` (non-null, not non-zero), computed in the service and sent | 4 |
| `coverage: { revenueInColumns, revenuePeriod }` driving a permanent banner | 4 (service), 11 (banner) |
| `paramsSerializer: { indexes: null }` on the frontend request | 8 |
| `usePnlVendorComparison` keyed `['pnl','vendor-comparison',filter,picks]`, `enabled: picks.length > 0` | 8 |
| `toVendorComparisonTable` onto `ComparisonTableModel<PnlVendorComparisonColumn>` | 9 |
| `overlappingVendors` + overlap banner | 9, 11 |
| `routeFromVendorComparisonCell(column, rowKey, periodBounds)` | 9 |
| `MultiVendorFilter` copying `MultiRouteFilter` including its search | 10 |
| `PnlVendorComparisonView` with group checkboxes + vendor multi-select, both fed by `available-vendors` | 11 |
| Table rendered with `firstColumnHeader="Route"` and `cellHint="Lihat AWB kolom ini pada rute ini"` | 11 |
| Avg / Route divisor stated in the UI | 11 (per-column caption — see the refinement note in that task) |
| "Columns do not add up", all three causes named | 11 |
| Cost-by-Vendor non-reconciliation stated in the UI | 11 |
| `PnlView` gains `'vendors'` + `VIEW_SUBTITLE` entry | 12 |
| Five-tab **gapped pill row**, `border-l` removed, no `overflow-hidden` | 12 |
| Double gate mirroring `page.tsx:103-107` and `:176-183` | 12 |
| `vendorPicks` lifted to the page; stale group picks pruned only once `groups` is loaded; vendor picks never pruned | 11 (prune), 12 (state) |
| `PnlRouteFilter.vendors`; `vendor` repeated param on the drilldown | 6, 8 |
| Vendor predicate in the **outer** WHERE, not the inner EXISTS | 6 |
| Drilldown/cell mismatch stated in the UI | 13 |
| `vendors` in `hasRoute`; removable chips | 13 |
| Tab gated on `read.vendor_group` in the UI only; endpoint keeps `read.pnl` | 5 (comment + no `@Authorize`), 12 (gate) |
| No new `v_pnl_to` index | — nothing in this plan adds one, per Keputusan #13 |

**Test-plan retargets — the four things the spec's test table could not test as first written.**

1. **Parser tests** are a unit spec (`pnl-vendor-columns.util.spec.ts`, Task 1) plus **one** supertest file (Task 5). The integration spec calls `PnlService` directly and the controller spec calls controller methods directly, so neither ever parses a query string — only supertest can tell a `string` from a `string[]`.
2. **The `'—'` assertion** belongs to a renderer test, not a projection test. Task 9 asserts `toBeNull()` on the projection; rendering `null` as an em dash is `PnlComparisonTable`'s behaviour and is already covered by Plan 1's renderer spec.
3. **Route aliasing** is asserted through `Reflect.getMetadata(PATH_METADATA, …)` — that is Plan 1 Task 1's job. This plan adds a single-path route and needs no alias, so it makes no metadata assertion of its own.
4. **The page spec mock renders its `picks` prop** (Task 12, Step 1). A mock that discards props makes lifted state unobservable, and the "picks survive a tab switch" test would pass whether or not the state was lifted at all.

**Placeholder scan.** No `TBD`, no `TODO`, no "similar to Task N", no "add error handling", no "write tests for the above". Every code step carries complete, copy-pasteable code, and code shared between tasks is repeated rather than cross-referenced.

**Type consistency.**

- `VendorColumnPick` is defined in Task 1 and imported unchanged by the service (Task 2) and the controller (Task 5).
- `PnlVendorComparison*` are defined once in `pnl.service.ts` (Task 2) and mirrored — not imported; the backend is a separate build — in `usePnl.ts` (Task 8), field for field.
- `PnlVendorPick` lives in `usePnl.ts` beside the pre-existing `PnlColumnPick`, and is the type of both `vendorColumnsToParams`'s parameter (Task 8) and the page's `vendorPicks` state (Task 12).
- `ComparisonTableModel<PnlVendorComparisonColumn>` is Plan 1's generic instantiated with Task 8's column type; `PnlComparisonTable` infers `TColumn` from it, so `onCellClick`'s first argument is `PnlVendorComparisonColumn` with no cast in Task 11.
- `PeriodBounds` is the pre-existing return type of `periodBounds` and is the third parameter of `routeFromVendorComparisonCell` (Task 9), passed from the view (Task 11).
- `PnlRouteFilter` gains `vendors?: string[]` on both sides (Task 6 backend, Task 8 frontend) with the same name and optionality, which is what lets `routeFromVendorComparisonCell`'s return value flow straight into `applyDrilldownRoute` and out through `routeToParams`.
- Every backend field added in this plan is read on the frontend with `?? ` or an `if` guard: `margin`, `totalMargin`, `avg*PerRoute`, `routesWithData`, `issues`, and `coverage`.

**Known follow-on breakage, called out so it is not mistaken for a regression.** Task 8 Step 4 adds `paramsSerializer` to the drilldown request, which breaks the existing deep-equality assertion at `apps/frontend/src/features/pnl/hooks/usePnl.spec.ts:63-73`; Task 8 Step 5 updates it in the same commit. Task 12 restyles the tab row, so any pre-existing page-spec assertion that counted four tab buttons or matched the segmented-control classes needs updating; Task 12 Step 7 flags it. Task 6 keeps `vendors` out of the drilldown filter object when empty specifically so the two existing `pnl.controller.spec.ts` assertions on `{ routes: [], dateFrom: undefined, dateTo: undefined }` stay green.

---

## Execution Handoff

Plan complete, and it is the last of the three. When it lands, the remaining follow-up from the spec is the separate PR that deletes the `breakdown/group-comparison` alias Plan 1 added — do that only after the release carrying Plan 1 is fully rolled out.
