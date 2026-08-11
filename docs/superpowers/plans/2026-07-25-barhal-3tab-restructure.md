# Barhal 3-Tab Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `/barhal` menu into 3 routed tabs (Koli / SMU / Dashboard), moving SMU data entry into its own tab (inline-editable table + bulk-apply form + aggregated SMU list) and extending the Dashboard tab with TO-POV KPIs, a weight/chWt chart, and two new recap tables (Per Tanggal, Per Rute).

**Architecture:** Backend gains one new read endpoint (`GET barhal/smu-list`) and a full rewrite of `GET barhal/dashboard`'s response shape (Koli-POV `totals`/`perRoute`/`drillDown` replaced by TO-POV `kpi`/`chartByDate`/`recapBatangKayu`/`recapPerTanggal`/`recapPerRute`). No schema/migration changes — everything is derived via raw SQL from the existing `barhal_koli`, `barhal_koli_to`, `air_shipments_compileaircgk`, and `air_shipments_smu_rate_cgk_spx` tables. Frontend splits the single `/barhal` page into `/barhal/koli`, `/barhal/smu`, `/barhal/dashboard`, each rendering a shared tab-nav; the wizard drops its 4th (SMU) step since SMU entry moves to the new tab.

**Tech Stack:** NestJS + TypeORM (raw `DataSource.query` for reads), class-validator DTOs, Next.js App Router, TanStack Query, Tailwind, Recharts.

## Global Constraints

- Reuse existing permissions only: `READ_BARHAL` for all GET endpoints, `CREATE_BARHAL` for all mutating endpoints. No new permissions.
- No new tables/migrations. All new data is derived via `DataSource.query()` raw SQL, following the existing pattern in `barhal.service.ts`.
- Station-name normalization (trailing " DC" stripped case-insensitively, whitespace collapsed) must be replicated in SQL exactly as `normalizeStationName()` does in JS: `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(<col>, '\s+DC$', '', 'i'), '\s+', ' ', 'g'))`.
- TO-POV recap tables (`recapPerTanggal`, `recapPerRute`) are scoped to `air_shipments_compileaircgk` rows with `remarks ILIKE '%barhal%'` and non-null `to_number`/`completed_date`, **not** to `barhal_koli` rows.
- `selisih` (variance) = Weight Before − Weight After. `variancePercent` = `variance / weightBefore * 100` (0 when weightBefore is 0, no division by zero).
- `Add. Revenue` = `total_P * total_L * total_T * 1000`, summed once per distinct Koli in the group (never per-TO).
- `status` = `'completed'` when every Barhal-eligible TO in the group is attached to a `barhal_koli_to` row, else `'incomplete'`.
- chWt Airlines is always computed by summing `air_shipments_smu_rate_cgk_spx.chwt` joined by `awb` (never by SMU number — that column doesn't exist on the rate table). A group with zero matching AWB rows must surface as `null`/`chwt: null` so the frontend can render "SMU Rate belum diupdate" — never coerce to 0 in a way that hides the missing-rate case at the point where "belum diupdate" needs to render (the `chwt` field itself stays `null`; only pre-aggregated sums that feed into KPI/chart totals use `COALESCE(..., 0)`).
- Frontend routes: `/barhal/koli`, `/barhal/smu`, `/barhal/dashboard`, with `/barhal` redirecting to `/barhal/koli`.
- Follow existing code style exactly: Tailwind utility classes matching existing components (`rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring` for inputs, `id-ID` `Intl.NumberFormat` for numbers), TanStack Query hooks in `apps/frontend/src/features/barhal/hooks/`, raw SQL services in `apps/backend/src/modules/barhal/barhal.service.ts`.

---

### Task 1: Backend — SMU list endpoint

**Files:**
- Create: `apps/backend/src/modules/barhal/dto/smu-list-query.dto.ts`
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts`
- Modify: `apps/backend/src/modules/barhal/barhal.controller.ts`
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts`

**Interfaces:**
- Consumes: nothing new — uses existing `this.dataSource.query()` pattern already in `BarhalService`.
- Produces: `BarhalService.getSmuList(dto: SmuListQueryDto): Promise<SmuListRow[]>` where `SmuListRow = { smuNumber: string, date: string, originName: string, destName: string, totalKoli: number, totalTo: number, airlines: string | null, flightNo: string | null, std: string | null, sta: string | null, chwt: number | null }`. Endpoint: `GET barhal/smu-list?date=&origin=&dest=`.

- [ ] **Step 1: Write the DTO**

```typescript
// apps/backend/src/modules/barhal/dto/smu-list-query.dto.ts
import { IsOptional, IsDateString, IsString } from 'class-validator'

export class SmuListQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string
}
```

- [ ] **Step 2: Write the failing test**

Add to `apps/backend/src/modules/barhal/barhal.service.spec.ts`, inside the existing `describe('BarhalService', ...)` block (add this new `describe` after the `bulkUpdateSmu` block, before the closing `})`):

```typescript
  describe('getSmuList', () => {
    it('groups Koli by smu_number and sums matched chWt by AWB, applying date/origin/dest filters', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          smuNumber: 'SMU-1',
          date: '2026-06-01',
          originName: 'Kosambi',
          destName: 'Badung',
          totalKoli: 2,
          totalTo: 3,
          airlines: 'Garuda',
          flightNo: 'GA123',
          std: '2026-06-01T10:00:00.000Z',
          sta: '2026-06-01T12:00:00.000Z',
          chwt: 42,
        },
      ])
      const rows = await service.getSmuList({ date: '2026-06-01', origin: 'Kosambi', dest: 'Badung' })
      expect(rows).toHaveLength(1)
      expect(rows[0].smuNumber).toBe('SMU-1')
      expect(rows[0].chwt).toBe(42)
      const [sql, params] = dataSource.query.mock.calls[0]
      expect(sql).toMatch(/smu_number IS NOT NULL/)
      expect(sql).toMatch(/GROUP BY k\.smu_number/)
      expect(params).toEqual(['2026-06-01', 'Kosambi', 'Badung'])
    })

    it('surfaces chwt as null when no AWB in the group matches the rate table', async () => {
      dataSource.query.mockResolvedValueOnce([
        { smuNumber: 'SMU-2', date: '2026-06-02', originName: 'A', destName: 'B', totalKoli: 1, totalTo: 1, airlines: null, flightNo: null, std: null, sta: null, chwt: null },
      ])
      const rows = await service.getSmuList({})
      expect(rows[0].chwt).toBeNull()
    })
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts -t getSmuList`
Expected: FAIL with "service.getSmuList is not a function"

- [ ] **Step 4: Implement `getSmuList` in `barhal.service.ts`**

Add this import at the top alongside the other DTO imports:

```typescript
import { SmuListQueryDto } from './dto/smu-list-query.dto'
```

Add this method to the `BarhalService` class, after `bulkUpdateSmu` and before `getDashboard`:

```typescript
  async getSmuList(dto: SmuListQueryDto) {
    const params: unknown[] = []
    const conditions: string[] = [`k.smu_number IS NOT NULL`]
    if (dto.date) {
      params.push(dto.date)
      conditions.push(`k.koli_date = $${params.length}`)
    }
    if (dto.origin) {
      params.push(dto.origin)
      conditions.push(`k.origin_name = $${params.length}`)
    }
    if (dto.dest) {
      params.push(dto.dest)
      conditions.push(`k.dest_name = $${params.length}`)
    }
    const where = `WHERE ${conditions.join(' AND ')}`

    return this.dataSource.query(
      `
      SELECT
        k.smu_number AS "smuNumber",
        MIN(k.koli_date)::text AS date,
        MIN(k.origin_name) AS "originName",
        MIN(k.dest_name) AS "destName",
        COUNT(DISTINCT k.id)::int AS "totalKoli",
        COALESCE(SUM(k.total_to), 0)::int AS "totalTo",
        MIN(k.airlines) AS airlines,
        MIN(k.flight_no) AS "flightNo",
        MIN(k.std)::text AS std,
        MIN(k.sta)::text AS sta,
        (
          SELECT SUM(r.chwt)
          FROM (
            SELECT DISTINCT bkt.awb
            FROM barhal_koli bk
            JOIN barhal_koli_to bkt ON bkt.koli_id = bk.id
            WHERE bk.smu_number = k.smu_number AND bkt.awb IS NOT NULL
          ) awbs
          LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb
        )::numeric AS chwt
      FROM barhal_koli k
      ${where}
      GROUP BY k.smu_number
      ORDER BY MIN(k.koli_date) DESC
      `,
      params,
    )
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts -t getSmuList`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire the controller route**

In `apps/backend/src/modules/barhal/barhal.controller.ts`, add the import:

```typescript
import { SmuListQueryDto } from './dto/smu-list-query.dto'
```

Add this method to `BarhalController`, after `getAvailableTos` and before `listKoli`:

```typescript
  @Get('smu-list')
  @Authorize(Permission.READ_BARHAL)
  getSmuList(@Query() dto: SmuListQueryDto) {
    return this.service.getSmuList(dto)
  }
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/barhal/dto/smu-list-query.dto.ts apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.controller.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): add GET barhal/smu-list aggregated-by-SMU endpoint"
```

---

### Task 2: Backend — TO-POV dashboard rewrite

**Files:**
- Modify: `apps/backend/src/modules/barhal/barhal.service.ts`
- Test: `apps/backend/src/modules/barhal/barhal.service.spec.ts`

**Interfaces:**
- Consumes: `BarhalDashboardQueryDto` (`startDate?`, `endDate?`, `origin?`, `dest?` — unchanged).
- Produces: `BarhalService.getDashboard(dto): Promise<{ kpi, chartByDate, recapBatangKayu, recapPerTanggal, recapPerRute }>` — this **replaces** the old `{ totals, perRoute, drillDown }` return shape entirely. `kpi = { totalKoli, totalTo, totalWeightBefore, totalWeightAfter, totalVariance, totalBatangKayu }`. `chartByDate = { date, weightBefore, weightAfter, chwt }[]`. `recapBatangKayu = { date, totalKoli, totalP, totalL, totalT, totalVolume, totalBatangKayu }[]`. `recapPerTanggal = { date, totalTo, totalKoli, weightBefore, weightAfter, chwt, variance, variancePercent, addRevenue, status }[]`. `recapPerRute` is the same shape as `recapPerTanggal` but with `originName`/`destName` instead of `date`.

- [ ] **Step 1: Write the failing tests**

Replace the existing dashboard-related tests (there are none currently in the spec file for `getDashboard`/`exportCsv` — confirm by searching; if absent, just add fresh). Add this new `describe` block to `apps/backend/src/modules/barhal/barhal.service.spec.ts`, after the `getSmuList` block:

```typescript
  describe('getDashboard', () => {
    it('returns TO-POV kpi/chartByDate/recapBatangKayu/recapPerTanggal/recapPerRute', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ koli_count: 2, total_to: 3, weight_before: 30, weight_increase: 6, batang_kayu: 10 }]) // kpi
        .mockResolvedValueOnce([
          { date: '2026-06-01', total_to: 3, attached_to: 3, total_koli: 2, weight_before: 30, chwt: 25, weight_increase: 6, add_revenue: 500 },
        ]) // recapPerTanggal
        .mockResolvedValueOnce([
          { originName: 'Kosambi', destName: 'Badung', total_to: 3, attached_to: 2, total_koli: 2, weight_before: 30, chwt: 25, weight_increase: 6, add_revenue: 500 },
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
        totalVariance: -6,
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
        variance: -6,
        addRevenue: 500,
        status: 'completed',
      })
      expect(result.recapPerTanggal[0].variancePercent).toBeCloseTo(-20)
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
        .mockResolvedValueOnce([{ date: '2026-06-01', total_to: 0, attached_to: 0, total_koli: 0, weight_before: 0, chwt: 0, weight_increase: 0, add_revenue: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await service.getDashboard({})
      expect(result.recapPerTanggal[0].variancePercent).toBe(0)
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts -t getDashboard`
Expected: FAIL (old `getDashboard` returns `{ totals, perRoute, drillDown }`, not `{ kpi, ... }`)

- [ ] **Step 3: Replace `getDashboard` in `barhal.service.ts`**

Delete the entire existing `getDashboard` method (currently lines 269–338) and replace it with:

```typescript
  private normalizedStationSql(column: string): string {
    return `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(${column}, '\\s+DC$', '', 'i'), '\\s+', ' ', 'g'))`
  }

  async getDashboard(dto: BarhalDashboardQueryDto) {
    const params: unknown[] = []
    const conditions: string[] = [`e.remarks ILIKE '%barhal%'`, `e.to_number IS NOT NULL`, `e.completed_date IS NOT NULL`]
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
    const toWhere = `WHERE ${conditions.join(' AND ')}`

    const scopedCte = `
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
    `

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

    const perTanggalRows: {
      date: string
      total_to: number
      attached_to: number
      total_koli: number
      weight_before: string
      chwt: string
      weight_increase: string
      add_revenue: string
    }[] = await this.dataSource.query(
      `
      WITH ${scopedCte},
      groups AS (SELECT DISTINCT to_date FROM scoped)
      SELECT
        g.to_date::text AS date,
        (SELECT COUNT(DISTINCT to_number) FROM scoped s WHERE s.to_date = g.to_date)::int AS total_to,
        (SELECT COUNT(DISTINCT to_number) FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.to_date = g.to_date)::int AS attached_to,
        (SELECT COUNT(DISTINCT bkt.koli_id) FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.to_date = g.to_date)::int AS total_koli,
        (SELECT COALESCE(SUM(gross_weight), 0) FROM scoped s WHERE s.to_date = g.to_date)::numeric AS weight_before,
        (SELECT COALESCE(SUM(r.chwt), 0)
           FROM (SELECT DISTINCT s.awb FROM scoped s WHERE s.to_date = g.to_date AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb)::numeric AS chwt,
        (SELECT COALESCE(SUM(k.weight_after - k.weight_before), 0)
           FROM (SELECT DISTINCT bkt.koli_id FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.to_date = g.to_date) dk
           JOIN barhal_koli k ON k.id = dk.koli_id
           WHERE k.weight_before IS NOT NULL AND k.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM(k.length_cm * k.width_cm * k.height_cm * 1000), 0)
           FROM (SELECT DISTINCT bkt.koli_id FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.to_date = g.to_date) dk
           JOIN barhal_koli k ON k.id = dk.koli_id
           WHERE k.length_cm IS NOT NULL AND k.width_cm IS NOT NULL AND k.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.to_date DESC
      `,
      params,
    )

    const toRecapItem = (row: { total_to: number; attached_to: number; total_koli: number; weight_before: string; chwt: string; weight_increase: string; add_revenue: string }) => {
      const weightBefore = Number(row.weight_before)
      const weightAfter = weightBefore + Number(row.weight_increase)
      const variance = weightBefore - weightAfter
      return {
        totalTo: row.total_to,
        totalKoli: row.total_koli,
        weightBefore,
        weightAfter,
        chwt: Number(row.chwt),
        variance,
        variancePercent: weightBefore > 0 ? (variance / weightBefore) * 100 : 0,
        addRevenue: Number(row.add_revenue),
        status: row.total_to === row.attached_to ? ('completed' as const) : ('incomplete' as const),
      }
    }

    const recapPerTanggal = perTanggalRows.map((row) => ({ date: row.date, ...toRecapItem(row) }))
    const chartByDate = recapPerTanggal.map((r) => ({ date: r.date, weightBefore: r.weightBefore, weightAfter: r.weightAfter, chwt: r.chwt }))

    const perRuteRows: {
      originName: string
      destName: string
      total_to: number
      attached_to: number
      total_koli: number
      weight_before: string
      chwt: string
      weight_increase: string
      add_revenue: string
    }[] = await this.dataSource.query(
      `
      WITH ${scopedCte},
      groups AS (SELECT DISTINCT origin_name, dest_name FROM scoped)
      SELECT
        g.origin_name AS "originName",
        g.dest_name AS "destName",
        (SELECT COUNT(DISTINCT to_number) FROM scoped s WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name)::int AS total_to,
        (SELECT COUNT(DISTINCT to_number) FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name)::int AS attached_to,
        (SELECT COUNT(DISTINCT bkt.koli_id) FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name)::int AS total_koli,
        (SELECT COALESCE(SUM(gross_weight), 0) FROM scoped s WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name)::numeric AS weight_before,
        (SELECT COALESCE(SUM(r.chwt), 0)
           FROM (SELECT DISTINCT s.awb FROM scoped s WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name AND s.awb IS NOT NULL) awbs
           LEFT JOIN air_shipments_smu_rate_cgk_spx r ON r.awb = awbs.awb)::numeric AS chwt,
        (SELECT COALESCE(SUM(k.weight_after - k.weight_before), 0)
           FROM (SELECT DISTINCT bkt.koli_id FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name) dk
           JOIN barhal_koli k ON k.id = dk.koli_id
           WHERE k.weight_before IS NOT NULL AND k.weight_after IS NOT NULL)::numeric AS weight_increase,
        (SELECT COALESCE(SUM(k.length_cm * k.width_cm * k.height_cm * 1000), 0)
           FROM (SELECT DISTINCT bkt.koli_id FROM scoped s JOIN barhal_koli_to bkt ON bkt.to_number = s.to_number WHERE s.origin_name = g.origin_name AND s.dest_name = g.dest_name) dk
           JOIN barhal_koli k ON k.id = dk.koli_id
           WHERE k.length_cm IS NOT NULL AND k.width_cm IS NOT NULL AND k.height_cm IS NOT NULL)::numeric AS add_revenue
      FROM groups g
      ORDER BY g.origin_name, g.dest_name
      `,
      params,
    )

    const recapPerRute = perRuteRows.map((row) => ({ originName: row.originName, destName: row.destName, ...toRecapItem(row) }))

    const koliParams: unknown[] = []
    const koliConditions: string[] = []
    if (dto.startDate && dto.endDate) {
      koliParams.push(dto.startDate, dto.endDate)
      koliConditions.push(`k.koli_date BETWEEN $${koliParams.length - 1} AND $${koliParams.length}`)
    }
    if (dto.origin) {
      koliParams.push(dto.origin)
      koliConditions.push(`k.origin_name = $${koliParams.length}`)
    }
    if (dto.dest) {
      koliParams.push(dto.dest)
      koliConditions.push(`k.dest_name = $${koliParams.length}`)
    }
    const koliWhere = koliConditions.length ? `WHERE ${koliConditions.join(' AND ')}` : ''

    const recapBatangKayu = await this.dataSource.query(
      `
      SELECT
        k.koli_date::text AS date,
        COUNT(*)::int AS "totalKoli",
        COALESCE(SUM(k.length_cm), 0)::numeric AS "totalP",
        COALESCE(SUM(k.width_cm), 0)::numeric AS "totalL",
        COALESCE(SUM(k.height_cm), 0)::numeric AS "totalT",
        COALESCE(SUM(k.volume), 0)::numeric AS "totalVolume",
        COALESCE(SUM(k.batang_kayu), 0)::int AS "totalBatangKayu"
      FROM barhal_koli k
      ${koliWhere}
      GROUP BY k.koli_date
      ORDER BY k.koli_date DESC
      `,
      koliParams,
    )

    return {
      kpi: {
        totalKoli: kpiRow.koli_count,
        totalTo: kpiRow.total_to,
        totalWeightBefore: Number(kpiRow.weight_before),
        totalWeightAfter: Number(kpiRow.weight_before) + Number(kpiRow.weight_increase),
        totalVariance: -Number(kpiRow.weight_increase),
        totalBatangKayu: kpiRow.batang_kayu,
      },
      chartByDate,
      recapBatangKayu,
      recapPerTanggal,
      recapPerRute,
    }
  }
```

Note: keep `exportCsv` untouched — it's Koli-POV and out of scope for this plan.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/modules/barhal/barhal.service.spec.ts -t getDashboard`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full Barhal suite and typecheck**

Run: `cd apps/backend && npx jest src/modules/barhal && npx tsc --noEmit`
Expected: all pass, 0 type errors

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/barhal/barhal.service.ts apps/backend/src/modules/barhal/barhal.service.spec.ts
git commit -m "feat(barhal): rewrite dashboard to TO-POV kpi/chart/recap tables"
```

---

### Task 3: Frontend — types for SMU list and new dashboard shape

**Files:**
- Modify: `apps/frontend/src/features/barhal/types.ts`

**Interfaces:**
- Produces: `BarhalSmuListItem`, `BarhalDashboardKpi`, `BarhalChartByDateItem`, `BarhalRecapBatangKayuItem`, `BarhalRecapPerTanggalItem`, `BarhalRecapPerRuteItem`, and a redefined `BarhalDashboardStats` — consumed by Tasks 4, 8–13.

- [ ] **Step 1: Replace the dashboard types and add SMU list types**

In `apps/frontend/src/features/barhal/types.ts`, delete the existing `BarhalDashboardTotals`, `BarhalDashboardRouteItem`, `BarhalDashboardDrillDownItem`, and `BarhalDashboardStats` interfaces (lines 87–116), replacing them with:

```typescript
export interface BarhalDashboardKpi {
  totalKoli: number
  totalTo: number
  totalWeightBefore: number
  totalWeightAfter: number
  totalVariance: number
  totalBatangKayu: number
}

export interface BarhalChartByDateItem {
  date: string
  weightBefore: number
  weightAfter: number
  chwt: number
}

export interface BarhalRecapBatangKayuItem {
  date: string
  totalKoli: number
  totalP: number
  totalL: number
  totalT: number
  totalVolume: number
  totalBatangKayu: number
}

export interface BarhalRecapPerTanggalItem {
  date: string
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

export interface BarhalRecapPerRuteItem {
  originName: string
  destName: string
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

export interface BarhalDashboardStats {
  kpi: BarhalDashboardKpi
  chartByDate: BarhalChartByDateItem[]
  recapBatangKayu: BarhalRecapBatangKayuItem[]
  recapPerTanggal: BarhalRecapPerTanggalItem[]
  recapPerRute: BarhalRecapPerRuteItem[]
}

export interface BarhalSmuListItem {
  smuNumber: string
  date: string
  originName: string
  destName: string
  totalKoli: number
  totalTo: number
  airlines: string | null
  flightNo: string | null
  std: string | null
  sta: string | null
  chwt: number | null
}
```

- [ ] **Step 2: Typecheck (expect errors in dependent files — this is expected until later tasks fix them)**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i barhal`
Expected: errors in `BarhalStatCards.tsx`, `BarhalRouteChart.tsx`, `dashboard/page.tsx` referencing the deleted types — these are fixed in Tasks 11–13. Confirm no errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/barhal/types.ts
git commit -m "feat(barhal): add SMU list + TO-POV dashboard frontend types"
```

---

### Task 4: Frontend — SMU list hook

**Files:**
- Modify: `apps/frontend/src/features/barhal/hooks/useBarhal.ts`

**Interfaces:**
- Consumes: `BarhalSmuListItem` (Task 3).
- Produces: `useSmuList(params: { date?: string; origin?: string; dest?: string })` — consumed by Task 9.

- [ ] **Step 1: Add the hook**

In `apps/frontend/src/features/barhal/hooks/useBarhal.ts`, add `BarhalSmuListItem` to the type-only import from `'../types'` (alongside the existing names), then add this function at the end of the file:

```typescript
export function useSmuList(params: { date?: string; origin?: string; dest?: string }) {
  return useQuery<BarhalSmuListItem[]>({
    queryKey: ['barhal', 'smu-list', params],
    queryFn: () => apiClient.get('/barhal/smu-list', { params }).then((r) => r.data),
    staleTime: 15 * 1000,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i "useBarhal.ts"`
Expected: no output (no errors in this file)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/barhal/hooks/useBarhal.ts
git commit -m "feat(barhal): add useSmuList hook"
```

---

### Task 5: Frontend — drop wizard Step 4 (SMU)

**Files:**
- Modify: `apps/frontend/src/features/barhal/components/wizard/BarhalKoliWizard.tsx`
- Delete: `apps/frontend/src/features/barhal/components/wizard/Step4Smu.tsx`

**Interfaces:**
- Consumes: `Step3Packing` (existing, unchanged), `isKoliIncomplete`/`nextStepFor` logic (redefined here).
- Produces: `isKoliIncomplete(koli): boolean` and the wizard's internal `nextStepFor` no longer check SMU fields — consumed by `BarhalListTable.tsx` (no signature change, just behavior change, so no edit needed there).

- [ ] **Step 1: Rewrite `BarhalKoliWizard.tsx`**

Replace the full contents of `apps/frontend/src/features/barhal/components/wizard/BarhalKoliWizard.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Step1CreateKoli } from './Step1CreateKoli'
import { Step2SelectTos } from './Step2SelectTos'
import { Step3Packing } from './Step3Packing'
import { BarhalKoli } from '../../types'

const STEP_LABELS = ['Buat Koli', 'Pilih TO', 'Kelola Koli & Berat']

export function isKoliIncomplete(koli: BarhalKoli): boolean {
  return (
    koli.total_to === 0 ||
    koli.weight_after == null ||
    koli.length_cm == null ||
    koli.width_cm == null ||
    koli.height_cm == null ||
    koli.batang_kayu == null
  )
}

function nextStepFor(koli: BarhalKoli): number {
  if (koli.total_to === 0) return 2
  return 3
}

interface BarhalKoliWizardProps {
  open: boolean
  initialKoli?: BarhalKoli
  onClose: () => void
  onDone: () => void
}

export function BarhalKoliWizard({ open, initialKoli, onClose, onDone }: BarhalKoliWizardProps) {
  const [koli, setKoli] = useState<BarhalKoli | undefined>(initialKoli)
  const [step, setStep] = useState(initialKoli ? nextStepFor(initialKoli) : 1)

  const handleClose = () => {
    setKoli(undefined)
    setStep(1)
    onClose()
  }

  const handleStepDone = (updated: BarhalKoli, isFinal: boolean) => {
    setKoli(updated)
    if (isFinal) {
      onDone()
      handleClose()
      return
    }
    setStep((s) => s + 1)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{koli ? koli.koli_number : 'Tambah Koli'}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border pb-3 text-xs">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={`rounded-full px-3 py-1 ${step === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {i + 1} · {label}
            </span>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto py-2">
          {step === 1 && <Step1CreateKoli onCreated={(k) => handleStepDone(k, false)} />}
          {step === 2 && koli && <Step2SelectTos koli={koli} onAttached={(k) => handleStepDone(k, false)} />}
          {step === 3 && koli && <Step3Packing koli={koli} onSaved={(k) => handleStepDone(k, true)} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Delete `Step4Smu.tsx`**

```bash
git rm apps/frontend/src/features/barhal/components/wizard/Step4Smu.tsx
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i barhal`
Expected: no errors referencing `BarhalKoliWizard.tsx` or `Step4Smu` (the pre-existing dashboard-type errors from Task 3 are still expected here, unrelated to this task)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/barhal/components/wizard/BarhalKoliWizard.tsx
git commit -m "feat(barhal): drop wizard Step 4 (SMU), wizard ends at Manage Weight"
```

---

### Task 6: Frontend — shared tab nav + route split (Koli tab)

**Files:**
- Create: `apps/frontend/src/features/barhal/components/BarhalTabNav.tsx`
- Create: `apps/frontend/src/app/(dashboard)/barhal/koli/page.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/barhal/page.tsx`

**Interfaces:**
- Produces: `<BarhalTabNav active="koli" | "smu" | "dashboard" />` — consumed by Tasks 6 (koli page, this task), 10 (smu page), 13 (dashboard page).

- [ ] **Step 1: Create the shared tab nav**

```typescript
// apps/frontend/src/features/barhal/components/BarhalTabNav.tsx
'use client'

const TABS = [
  { key: 'koli', label: 'Koli', href: '/barhal/koli' },
  { key: 'smu', label: 'SMU', href: '/barhal/smu' },
  { key: 'dashboard', label: 'Dashboard', href: '/barhal/dashboard' },
] as const

interface BarhalTabNavProps {
  active: 'koli' | 'smu' | 'dashboard'
}

export function BarhalTabNav({ active }: BarhalTabNavProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          className={`px-4 py-2 text-sm font-medium ${
            active === tab.key
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </a>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Move the Koli list+wizard page to `/barhal/koli`**

Read the current `apps/frontend/src/app/(dashboard)/barhal/page.tsx` in full, then create `apps/frontend/src/app/(dashboard)/barhal/koli/page.tsx` with the same content, but:
- add `import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'`
- remove the `<a href="/barhal/dashboard">Dashboard</a>` link (the tab nav replaces it)
- add `<BarhalTabNav active="koli" />` immediately below the page header `<div className="flex items-center justify-between">...</div>` block

```typescript
// apps/frontend/src/app/(dashboard)/barhal/koli/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useBarhalList, useBarhalStations } from '@/features/barhal/hooks/useBarhal'
import { BarhalListTable } from '@/features/barhal/components/BarhalListTable'
import { BarhalFilters } from '@/features/barhal/components/BarhalFilters'
import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'
import { BarhalKoliWizard } from '@/features/barhal/components/wizard/BarhalKoliWizard'
import { BarhalKoli } from '@/features/barhal/types'

const PAGE_SIZE = 25

function BarhalKoliPageContent() {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [page, setPage] = useState(1)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardKoli, setWizardKoli] = useState<BarhalKoli | undefined>(undefined)

  const { data: stations } = useBarhalStations()
  const { data, isLoading, refetch } = useBarhalList({
    search: search || undefined,
    date: date || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  useEffect(() => {
    setPage(1)
  }, [search, date, origin, dest])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openWizardFor = (koli?: BarhalKoli) => {
    setWizardKoli(koli)
    setWizardOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Barhal</h1>
          <p className="text-sm text-muted-foreground">
            Pencatatan dan pemantauan TO yang telah di packing kayu
          </p>
        </div>
        <button
          type="button"
          onClick={() => openWizardFor(undefined)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Tambah Koli
        </button>
      </div>

      <BarhalTabNav active="koli" />

      <BarhalFilters
        search={search}
        onSearchChange={setSearch}
        date={date}
        onDateChange={setDate}
        origin={origin}
        onOriginChange={setOrigin}
        dest={dest}
        onDestChange={setDest}
        stations={stations ?? { origins: [], dests: [] }}
      />

      <BarhalListTable
        data={data?.data ?? []}
        page={page}
        pageSize={PAGE_SIZE}
        isLoading={isLoading}
        onOpenKoli={openWizardFor}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-border px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-border px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <BarhalKoliWizard
        open={wizardOpen}
        initialKoli={wizardKoli}
        onClose={() => setWizardOpen(false)}
        onDone={() => refetch()}
      />
    </div>
  )
}

export default function BarhalKoliPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.barhal')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.barhal')) return null

  return <BarhalKoliPageContent />
}
```

- [ ] **Step 3: Replace `/barhal/page.tsx` with a redirect**

```typescript
// apps/frontend/src/app/(dashboard)/barhal/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BarhalRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/barhal/koli')
  }, [router])

  return null
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i barhal`
Expected: no errors for `koli/page.tsx`, `BarhalTabNav.tsx`, or the redirect `page.tsx`

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/barhal/components/BarhalTabNav.tsx apps/frontend/src/app/"(dashboard)"/barhal/koli/page.tsx apps/frontend/src/app/"(dashboard)"/barhal/page.tsx
git commit -m "feat(barhal): split Koli tab into its own route, add shared tab nav"
```

---

### Task 7: Frontend — SMU inline-editable table

**Files:**
- Create: `apps/frontend/src/features/barhal/components/BarhalSmuInlineTable.tsx`

**Interfaces:**
- Consumes: `BarhalKoli` (types.ts), `useUpdateSmu` (useBarhal.ts) — one instance per row via a per-row sub-component so each row gets its own hook instance.
- Produces: `<BarhalSmuInlineTable data={BarhalKoli[]} isLoading onSaved={() => void} />` — consumed by Task 10 (SMU page).

- [ ] **Step 1: Write the component**

```typescript
// apps/frontend/src/features/barhal/components/BarhalSmuInlineTable.tsx
'use client'

import { useState } from 'react'
import { useUpdateSmu } from '../hooks/useBarhal'
import { BarhalKoli } from '../types'

interface BarhalSmuInlineTableProps {
  data: BarhalKoli[]
  isLoading?: boolean
  onSaved: () => void
}

function SmuRow({ koli, onSaved }: { koli: BarhalKoli; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [airlines, setAirlines] = useState(koli.airlines ?? '')
  const [flightNo, setFlightNo] = useState(koli.flight_no ?? '')
  const [std, setStd] = useState(koli.std ? koli.std.slice(0, 16) : '')
  const [sta, setSta] = useState(koli.sta ? koli.sta.slice(0, 16) : '')
  const [smuNumber, setSmuNumber] = useState(koli.smu_number ?? '')

  const updateSmu = useUpdateSmu(koli.id)

  const inputClass =
    'w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring'

  const handleSave = async () => {
    await updateSmu.mutateAsync({
      smuNumber: smuNumber || undefined,
      airlines: airlines || undefined,
      flightNo: flightNo || undefined,
      std: std || undefined,
      sta: sta || undefined,
    })
    setEditing(false)
    onSaved()
  }

  return (
    <tr className="hover:bg-accent/30">
      <td className="px-3 py-2">{koli.koli_date}</td>
      <td className="px-3 py-2">{koli.dest_name}</td>
      <td className="px-3 py-2 font-medium">{koli.koli_number}</td>
      <td className="px-3 py-2">
        {editing ? <input value={airlines} onChange={(e) => setAirlines(e.target.value)} className={inputClass} /> : koli.airlines || '-'}
      </td>
      <td className="px-3 py-2">
        {editing ? <input value={flightNo} onChange={(e) => setFlightNo(e.target.value)} className={inputClass} /> : koli.flight_no || '-'}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <input type="datetime-local" value={std} onChange={(e) => setStd(e.target.value)} className={inputClass} />
        ) : (
          koli.std || '-'
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <input type="datetime-local" value={sta} onChange={(e) => setSta(e.target.value)} className={inputClass} />
        ) : (
          koli.sta || '-'
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? <input value={smuNumber} onChange={(e) => setSmuNumber(e.target.value)} className={inputClass} /> : koli.smu_number || '-'}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => (editing ? handleSave() : setEditing(true))}
          disabled={updateSmu.isPending}
          className="rounded-md border border-border px-3 py-1 text-xs font-medium transition hover:bg-accent/50 disabled:opacity-50"
        >
          {updateSmu.isPending ? 'Menyimpan…' : editing ? 'Save' : 'Edit'}
        </button>
      </td>
    </tr>
  )
}

export function BarhalSmuInlineTable({ data, isLoading, onSaved }: BarhalSmuInlineTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Destination</th>
            <th className="px-3 py-2 font-medium">No. Koli</th>
            <th className="px-3 py-2 font-medium">Airlines</th>
            <th className="px-3 py-2 font-medium">Flight No</th>
            <th className="px-3 py-2 font-medium">STD</th>
            <th className="px-3 py-2 font-medium">STA</th>
            <th className="px-3 py-2 font-medium">SMU</th>
            <th className="px-3 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                No Koli found.
              </td>
            </tr>
          ) : (
            data.map((koli) => <SmuRow key={koli.id} koli={koli} onSaved={onSaved} />)
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i BarhalSmuInlineTable`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/barhal/components/BarhalSmuInlineTable.tsx
git commit -m "feat(barhal): add SMU tab inline-editable Koli table"
```

---

### Task 8: Frontend — Bulk SMU form component

**Files:**
- Create: `apps/frontend/src/features/barhal/components/BulkSmuForm.tsx`

**Interfaces:**
- Consumes: `useBulkUpdateSmu` (useBarhal.ts).
- Produces: `<BulkSmuForm stations={BarhalStations} onApplied={() => void} />` — consumed by Task 10.

- [ ] **Step 1: Write the component**

This extracts and generalizes the bulk-apply form previously embedded in the deleted `Step4Smu.tsx`, adding a standalone Origin field (for display/filtering clarity — the backend's bulk-update match key remains Date+Destination, unchanged):

```typescript
// apps/frontend/src/features/barhal/components/BulkSmuForm.tsx
'use client'

import { useState } from 'react'
import { useBulkUpdateSmu } from '../hooks/useBarhal'
import { BarhalStations } from '../types'

interface BulkSmuFormProps {
  stations: BarhalStations
  onApplied: () => void
}

const inputClass =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function BulkSmuForm({ stations, onApplied }: BulkSmuFormProps) {
  const [koliDate, setKoliDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [airlines, setAirlines] = useState('')
  const [flightNo, setFlightNo] = useState('')
  const [std, setStd] = useState('')
  const [sta, setSta] = useState('')
  const [smuNumber, setSmuNumber] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const bulkUpdateSmu = useBulkUpdateSmu()

  const canSubmit = !!koliDate && !!dest && !bulkUpdateSmu.isPending

  const handleApply = async () => {
    setResult(null)
    const res = await bulkUpdateSmu.mutateAsync({
      koliDate,
      dest,
      smuNumber: smuNumber || undefined,
      airlines: airlines || undefined,
      flightNo: flightNo || undefined,
      std: std || undefined,
      sta: sta || undefined,
    })
    setResult(`Diterapkan ke ${res.updated} Koli (${koliDate} → ${dest})`)
    onApplied()
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium">Input Bulk SMU</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Date + Destinasi menentukan Koli mana yang menerima data ini. Kolom kosong tidak akan menimpa data yang sudah ada.
      </p>
      <div className="grid grid-cols-4 gap-3">
        <input type="date" value={koliDate} onChange={(e) => setKoliDate(e.target.value)} className={inputClass} />
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={inputClass}>
          <option value="">Origin</option>
          {stations.origins.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select value={dest} onChange={(e) => setDest(e.target.value)} className={inputClass}>
          <option value="">Destination</option>
          {stations.dests.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <input placeholder="Airlines" value={airlines} onChange={(e) => setAirlines(e.target.value)} className={inputClass} />
        <input placeholder="Flight No" value={flightNo} onChange={(e) => setFlightNo(e.target.value)} className={inputClass} />
        <input type="datetime-local" value={std} onChange={(e) => setStd(e.target.value)} className={inputClass} />
        <input type="datetime-local" value={sta} onChange={(e) => setSta(e.target.value)} className={inputClass} />
        <input placeholder="No. SMU" value={smuNumber} onChange={(e) => setSmuNumber(e.target.value)} className={inputClass} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {bulkUpdateSmu.isPending ? 'Menerapkan…' : 'Terapkan'}
        </button>
        {result && <p className="text-sm text-muted-foreground">{result}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i BulkSmuForm`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/barhal/components/BulkSmuForm.tsx
git commit -m "feat(barhal): add standalone Bulk SMU form for SMU tab"
```

---

### Task 9: Frontend — aggregated SMU list table

**Files:**
- Create: `apps/frontend/src/features/barhal/components/BarhalSmuListTable.tsx`

**Interfaces:**
- Consumes: `BarhalSmuListItem` (types.ts).
- Produces: `<BarhalSmuListTable data={BarhalSmuListItem[]} isLoading />` — consumed by Task 10.

- [ ] **Step 1: Write the component**

```typescript
// apps/frontend/src/features/barhal/components/BarhalSmuListTable.tsx
'use client'

import { BarhalSmuListItem } from '../types'

interface BarhalSmuListTableProps {
  data: BarhalSmuListItem[]
  isLoading?: boolean
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const COLUMN_COUNT = 10

export function BarhalSmuListTable({ data, isLoading }: BarhalSmuListTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Origin</th>
            <th className="px-3 py-2 font-medium">Destination</th>
            <th className="px-3 py-2 font-medium">Total Koli</th>
            <th className="px-3 py-2 font-medium">Total TO</th>
            <th className="px-3 py-2 font-medium">No. SMU</th>
            <th className="px-3 py-2 font-medium">Airlines</th>
            <th className="px-3 py-2 font-medium">Flight No</th>
            <th className="px-3 py-2 font-medium">STD / STA</th>
            <th className="px-3 py-2 font-medium">chWt Airlines</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="px-3 py-6 text-center text-muted-foreground">
                No SMU found.
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr key={item.smuNumber} className="hover:bg-accent/30">
                <td className="px-3 py-2">{item.date}</td>
                <td className="px-3 py-2">{item.originName}</td>
                <td className="px-3 py-2">{item.destName}</td>
                <td className="px-3 py-2">{item.totalKoli}</td>
                <td className="px-3 py-2">{item.totalTo}</td>
                <td className="px-3 py-2 font-medium">{item.smuNumber}</td>
                <td className="px-3 py-2">{item.airlines || '-'}</td>
                <td className="px-3 py-2">{item.flightNo || '-'}</td>
                <td className="px-3 py-2">{item.std ? `${item.std.slice(0, 16)} / ${item.sta?.slice(0, 16) ?? '-'}` : '-'}</td>
                <td className="px-3 py-2">
                  {item.chwt != null ? `${fmt.format(item.chwt)} kg` : (
                    <span className="text-xs text-destructive">SMU Rate belum diupdate</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i BarhalSmuListTable`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/barhal/components/BarhalSmuListTable.tsx
git commit -m "feat(barhal): add aggregated SMU list table with chWt Airlines"
```

---

### Task 10: Frontend — wire the SMU tab page

**Files:**
- Create: `apps/frontend/src/app/(dashboard)/barhal/smu/page.tsx`

**Interfaces:**
- Consumes: `BarhalTabNav` (Task 6), `BarhalSmuInlineTable` (Task 7), `BulkSmuForm` (Task 8), `BarhalSmuListTable` (Task 9), `useBarhalList`/`useBarhalStations` (existing), `useSmuList` (Task 4).

- [ ] **Step 1: Write the page**

```typescript
// apps/frontend/src/app/(dashboard)/barhal/smu/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useBarhalList, useBarhalStations, useSmuList } from '@/features/barhal/hooks/useBarhal'
import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'
import { BarhalSmuInlineTable } from '@/features/barhal/components/BarhalSmuInlineTable'
import { BulkSmuForm } from '@/features/barhal/components/BulkSmuForm'
import { BarhalSmuListTable } from '@/features/barhal/components/BarhalSmuListTable'

function BarhalSmuPageContent() {
  const [date, setDate] = useState('')
  const [dest, setDest] = useState('')

  const { data: stations } = useBarhalStations()
  const { data: koliData, isLoading: koliLoading, refetch: refetchKoli } = useBarhalList({
    date: date || undefined,
    dest: dest || undefined,
    page: 1,
    pageSize: 100,
  })
  const { data: smuList, isLoading: smuLoading, refetch: refetchSmuList } = useSmuList({
    date: date || undefined,
    dest: dest || undefined,
  })

  const handleSaved = () => {
    refetchKoli()
    refetchSmuList()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Barhal</h1>
        <p className="text-sm text-muted-foreground">Input dan pemantauan data SMU</p>
      </div>

      <BarhalTabNav active="smu" />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <select
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Semua Destinasi</option>
          {(stations?.dests ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <BarhalSmuInlineTable data={koliData?.data ?? []} isLoading={koliLoading} onSaved={handleSaved} />

      <BulkSmuForm stations={stations ?? { origins: [], dests: [] }} onApplied={handleSaved} />

      <div>
        <p className="mb-2 text-sm font-medium">List SMU</p>
        <BarhalSmuListTable data={smuList ?? []} isLoading={smuLoading} />
      </div>
    </div>
  )
}

export default function BarhalSmuPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.barhal')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.barhal')) return null

  return <BarhalSmuPageContent />
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i barhal`
Expected: no errors for the `smu/page.tsx` file (dashboard-related errors from Task 3 are still expected and get fixed in Tasks 11–13)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/"(dashboard)"/barhal/smu/page.tsx
git commit -m "feat(barhal): wire SMU tab page (inline table + bulk form + SMU list)"
```

---

### Task 11: Frontend — dashboard KPI cards + weight/chWt chart

**Files:**
- Modify: `apps/frontend/src/features/barhal/components/BarhalStatCards.tsx`
- Delete: `apps/frontend/src/features/barhal/components/BarhalRouteChart.tsx`
- Create: `apps/frontend/src/features/barhal/components/BarhalWeightChart.tsx`

**Interfaces:**
- Consumes: `BarhalDashboardKpi`, `BarhalChartByDateItem` (Task 3).
- Produces: `<BarhalStatCards kpi={BarhalDashboardKpi} />`, `<BarhalWeightChart data={BarhalChartByDateItem[]} />` — consumed by Task 13.

- [ ] **Step 1: Rewrite `BarhalStatCards.tsx`**

```typescript
// apps/frontend/src/features/barhal/components/BarhalStatCards.tsx
'use client'

import { BarhalDashboardKpi } from '../types'

interface BarhalStatCardsProps {
  kpi: BarhalDashboardKpi
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function BarhalStatCards({ kpi }: BarhalStatCardsProps) {
  const cards = [
    { label: 'Total Koli', value: fmt.format(kpi.totalKoli) },
    { label: 'Total TO Barhal', value: fmt.format(kpi.totalTo) },
    { label: 'Total Weight Before', value: `${fmt.format(kpi.totalWeightBefore)} kg` },
    { label: 'Total Weight After', value: `${fmt.format(kpi.totalWeightAfter)} kg` },
    { label: 'Total Variance', value: `${fmt.format(kpi.totalVariance)} kg` },
    { label: 'Total Batang Kayu', value: fmt.format(kpi.totalBatangKayu) },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-xl font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Delete `BarhalRouteChart.tsx`, create `BarhalWeightChart.tsx`**

```bash
git rm apps/frontend/src/features/barhal/components/BarhalRouteChart.tsx
```

```typescript
// apps/frontend/src/features/barhal/components/BarhalWeightChart.tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { BarhalChartByDateItem } from '../types'

interface BarhalWeightChartProps {
  data: BarhalChartByDateItem[]
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

interface TooltipPayload {
  payload: BarhalChartByDateItem
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">{p.date}</p>
      <p className="text-muted-foreground">Weight Before: {fmt.format(p.weightBefore)} kg</p>
      <p className="text-muted-foreground">Weight After: {fmt.format(p.weightAfter)} kg</p>
      <p className="text-muted-foreground">ChWt: {fmt.format(p.chwt)} kg</p>
    </div>
  )
}

export function BarhalWeightChart({ data }: BarhalWeightChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No data for this range.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-4 text-sm font-medium">Weight Before / After / ChWt per Tanggal</p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={60} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="weightBefore" name="Weight Before" fill="#60A5FA" radius={[4, 4, 0, 0]} />
          <Bar dataKey="weightAfter" name="Weight After" fill="#22C55E" radius={[4, 4, 0, 0]} />
          <Bar dataKey="chwt" name="ChWt" fill="#F59E0B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -iE "BarhalStatCards|BarhalWeightChart|BarhalRouteChart"`
Expected: no output (no lingering references to the deleted `BarhalRouteChart`)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/barhal/components/BarhalStatCards.tsx apps/frontend/src/features/barhal/components/BarhalWeightChart.tsx
git commit -m "feat(barhal): rework dashboard KPI cards and chart for TO-POV data"
```

---

### Task 12: Frontend — recap tables (Batang Kayu, Per Tanggal, Per Rute)

**Files:**
- Create: `apps/frontend/src/features/barhal/components/BarhalRecapBatangKayuTable.tsx`
- Create: `apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx`

**Interfaces:**
- Consumes: `BarhalRecapBatangKayuItem`, `BarhalRecapPerTanggalItem`, `BarhalRecapPerRuteItem` (Task 3).
- Produces: `<BarhalRecapBatangKayuTable data={...} />`, `<BarhalRecapToTable rows={(BarhalRecapPerTanggalItem | BarhalRecapPerRuteItem)[]} groupLabel="Date" | "Rute" />` (one generic component reused for both Per Tanggal and Per Rute, since the two share every column except the group key) — consumed by Task 13.

- [ ] **Step 1: Write `BarhalRecapBatangKayuTable.tsx`**

```typescript
// apps/frontend/src/features/barhal/components/BarhalRecapBatangKayuTable.tsx
'use client'

import { BarhalRecapBatangKayuItem } from '../types'

interface BarhalRecapBatangKayuTableProps {
  data: BarhalRecapBatangKayuItem[]
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })

export function BarhalRecapBatangKayuTable({ data }: BarhalRecapBatangKayuTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Total Koli</th>
            <th className="px-3 py-2 font-medium">Total P</th>
            <th className="px-3 py-2 font-medium">Total L</th>
            <th className="px-3 py-2 font-medium">Total T</th>
            <th className="px-3 py-2 font-medium">Total Volume</th>
            <th className="px-3 py-2 font-medium">Total Batang Kayu</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                No data for this range.
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={row.date} className="hover:bg-accent/30">
                <td className="px-3 py-2">{row.date}</td>
                <td className="px-3 py-2">{row.totalKoli}</td>
                <td className="px-3 py-2">{fmt.format(row.totalP)}</td>
                <td className="px-3 py-2">{fmt.format(row.totalL)}</td>
                <td className="px-3 py-2">{fmt.format(row.totalT)}</td>
                <td className="px-3 py-2">{fmt.format(row.totalVolume)}</td>
                <td className="px-3 py-2">{row.totalBatangKayu}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Write the generic `BarhalRecapToTable.tsx`**

```typescript
// apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx
'use client'

import { BarhalRecapPerTanggalItem, BarhalRecapPerRuteItem } from '../types'

type RecapRow =
  | (BarhalRecapPerTanggalItem & { key: string; groupLabel: string })
  | (BarhalRecapPerRuteItem & { key: string; groupLabel: string })

interface BarhalRecapToTableProps {
  rows: (BarhalRecapPerTanggalItem | BarhalRecapPerRuteItem)[]
  groupColumnLabel: string
}

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 })
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })

function groupKeyAndLabel(row: BarhalRecapPerTanggalItem | BarhalRecapPerRuteItem): { key: string; groupLabel: string } {
  if ('date' in row) return { key: row.date, groupLabel: row.date }
  return { key: `${row.originName}-${row.destName}`, groupLabel: `${row.originName} → ${row.destName}` }
}

export function BarhalRecapToTable({ rows, groupColumnLabel }: BarhalRecapToTableProps) {
  const withKeys: RecapRow[] = rows.map((row) => ({ ...row, ...groupKeyAndLabel(row) }))

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
          {withKeys.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                No data for this range.
              </td>
            </tr>
          ) : (
            withKeys.map((row) => (
              <tr key={row.key} className="hover:bg-accent/30">
                <td className="px-3 py-2">{row.groupLabel}</td>
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
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -iE "BarhalRecapBatangKayuTable|BarhalRecapToTable"`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/barhal/components/BarhalRecapBatangKayuTable.tsx apps/frontend/src/features/barhal/components/BarhalRecapToTable.tsx
git commit -m "feat(barhal): add Rekap Batang Kayu, Per Tanggal, and Per Rute tables"
```

---

### Task 13: Frontend — wire the Dashboard tab page

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx`

**Interfaces:**
- Consumes: `BarhalTabNav` (Task 6), `BarhalStatCards`/`BarhalWeightChart` (Task 11), `BarhalRecapBatangKayuTable`/`BarhalRecapToTable` (Task 12), `useBarhalDashboardStats` (existing, now returns the new shape from Task 2/3).

- [ ] **Step 1: Rewrite the dashboard page content**

Replace `apps/frontend/src/app/(dashboard)/barhal/dashboard/page.tsx` in full:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'
import { useBarhalDashboardStats, exportBarhalCsv } from '@/features/barhal/hooks/useBarhalDashboard'
import { useBarhalStations } from '@/features/barhal/hooks/useBarhal'
import { BarhalTabNav } from '@/features/barhal/components/BarhalTabNav'
import { BarhalStatCards } from '@/features/barhal/components/BarhalStatCards'
import { BarhalWeightChart } from '@/features/barhal/components/BarhalWeightChart'
import { BarhalRecapBatangKayuTable } from '@/features/barhal/components/BarhalRecapBatangKayuTable'
import { BarhalRecapToTable } from '@/features/barhal/components/BarhalRecapToTable'
import { triggerBlobDownload } from '@/shared/utils/file-download.util'

function BarhalDashboardContent() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data: stations } = useBarhalStations()
  const { data, isLoading, isError, refetch } = useBarhalDashboardStats({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    origin: origin || undefined,
    dest: dest || undefined,
  })

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const blob = await exportBarhalCsv({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        origin: origin || undefined,
        dest: dest || undefined,
      })
      triggerBlobDownload(blob, `barhal-${startDate || 'all'}_${endDate || 'all'}.csv`)
    } catch (err) {
      window.alert(`Failed to export: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Barhal Dashboard</h1>
          <p className="text-sm text-muted-foreground">Statistik packing kayu &amp; Koli</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
        >
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <BarhalTabNav active="dashboard" />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Semua Origin</option>
          {(stations?.origins ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">Semua Destinasi</option>
          {(stations?.dests ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {isError ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Failed to load dashboard data.</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-primary underline">
            Retry
          </button>
        </div>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <BarhalStatCards kpi={data.kpi} />
          <BarhalWeightChart data={data.chartByDate} />

          <div>
            <p className="mb-2 text-sm font-medium">Rekap Batang Kayu</p>
            <BarhalRecapBatangKayuTable data={data.recapBatangKayu} />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Rekap Per Tanggal</p>
            <BarhalRecapToTable rows={data.recapPerTanggal} groupColumnLabel="Date" />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Rekap Per Rute</p>
            <BarhalRecapToTable rows={data.recapPerRute} groupColumnLabel="Rute" />
          </div>
        </>
      )}
    </div>
  )
}

export default function BarhalDashboardPage() {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.barhal')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.barhal')) return null

  return <BarhalDashboardContent />
}
```

- [ ] **Step 2: Full frontend typecheck**

Run: `cd apps/frontend && npx tsc --noEmit 2>&1 | grep -i barhal`
Expected: no output — all Barhal-related type errors introduced since Task 3 are now resolved.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/"(dashboard)"/barhal/dashboard/page.tsx
git commit -m "feat(barhal): wire Dashboard tab with KPI/chart/recap tables"
```

---

## Self-Review Notes

- **Spec coverage:** Koli tab (Task 6), SMU tab filter/inline table (Task 7), bulk form (Task 8), SMU list w/ chWt (Task 1, Task 9), Dashboard KPI cards (Task 11), chart (Task 11), Rekap Batang Kayu (Task 12), Rekap Per Tanggal + Per Rute (Task 2, Task 12), routes (Task 6), wizard Step 4 removal (Task 5) — all covered.
- **Deferred/out of scope (per spec):** `exportCsv` stays Koli-POV/unchanged; no new permissions; no migrations.
- **Type consistency verified:** `BarhalSmuListItem`, `BarhalDashboardKpi`, `BarhalChartByDateItem`, `BarhalRecapBatangKayuItem`, `BarhalRecapPerTanggalItem`, `BarhalRecapPerRuteItem` are defined once in Task 3 and referenced with identical field names throughout Tasks 4, 8–13.
