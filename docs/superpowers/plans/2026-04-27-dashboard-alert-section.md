# Dashboard Redesign — Alert Section + Filtered Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dashboard into three sections (Greeting → Alert Cards → Filtered Shipment Table) with real-time alert counts, multi-filter support, and live WebSocket refresh — all scoped to the last 15 days.

**Architecture:** A NestJS backend exposes three endpoints (`alert-summary`, `routes`, main query) that all accept a `?days=15` param. Alert logic lives exclusively in `alert-evaluator.ts`. The Next.js dashboard page owns all filter state (alert, route, search, page) and fetches independently from the Shipment menu. WebSocket `sync.completed` events trigger a full refresh while preserving active filters.

**Tech Stack:** NestJS (PostgreSQL + raw SQL queries), Next.js 14 App Router, TypeScript, Socket.io, Tailwind CSS, class-validator.

---

## File Map

| File | Role |
|------|------|
| `apps/backend/src/modules/air-shipments/alert-evaluator.ts` | Single source of truth for all alert logic |
| `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts` | Unit tests for evaluateAlerts() |
| `apps/backend/src/modules/air-shipments/dto/air-shipment-query.dto.ts` | Validated query params incl. `days`, `routeFilter` |
| `apps/backend/src/modules/air-shipments/air-shipments.service.ts` | `getAlertSummaryForTable`, `getRoutesForTable`, `findAllForTable` |
| `apps/backend/src/modules/air-shipments/air-shipments.service.spec.ts` | Service tests for alert-summary, routes, query |
| `apps/backend/src/modules/air-shipments/air-shipments.controller.ts` | REST endpoints: `alert-summary`, `routes`, `/:tableName` |
| `apps/backend/src/modules/air-shipments/sync-notification.gateway.ts` | `notifyCompleted(sheetIdentifier)` emits `sync.completed` |
| `apps/backend/src/modules/air-shipments/sync-notification.gateway.spec.ts` | Gateway unit tests |
| `apps/frontend/src/features/air-shipments/components/DashboardAlertCards.tsx` | 6-card alert summary grid (NEW file) |
| `apps/frontend/src/features/air-shipments/hooks/useSyncNotification.ts` | WebSocket hook — consumes `sync.completed` |
| `apps/frontend/src/features/air-shipments/hooks/useSyncNotification.spec.tsx` | Hook unit tests |
| `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` | Dashboard page — owns all state, 3-section layout |

**Do NOT modify:**
- `apps/frontend/src/features/air-shipments/components/AirShipmentsPage.tsx` (Shipment menu — must remain unchanged)
- `apps/frontend/src/features/air-shipments/components/AirShipmentTable.tsx` (pass props only)

---

## Task 1: Implement alert-evaluator.ts

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/alert-evaluator.ts`

This is the **single source of truth** for all alert logic. Never duplicate `evaluateAlerts` or `parseDuration` elsewhere.

- [ ] **Step 1: Write the file**

```typescript
// apps/backend/src/modules/air-shipments/alert-evaluator.ts

export type AlertType = 'slaAlert' | 'tjphAlert' | 'ataFlightAlert' | 'atdFlightAlert' | 'smuAlert'
export type AlertFilter = AlertType | 'normal'

export interface AlertFlags {
  slaAlert: boolean
  tjphAlert: boolean
  ataFlightAlert: boolean
  atdFlightAlert: boolean
  smuAlert: boolean
}

const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

const getFieldValue = (row: Record<string, unknown>, key: string): unknown => {
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key]
  const extraFields = row.extra_fields
  if (extraFields && typeof extraFields === 'object') {
    return (extraFields as Record<string, unknown>)[key]
  }
  return undefined
}

// NOTE: SLA and TJPH are HH:MM:SS strings; hours CAN exceed 23 — do NOT use Date parsing
function parseDuration(value: string): number {
  const [hours, minutes, seconds] = value.split(':').map(Number)
  return (hours * 3600 + minutes * 60 + seconds) * 1000 // ms
}

export function evaluateAlerts(row: Record<string, unknown>): AlertFlags {
  const now = new Date()

  const ataOriginValue = getFieldValue(row, 'ata_origin')
  const ataOrigin =
    typeof ataOriginValue === 'string' && ataOriginValue.trim() ? new Date(ataOriginValue) : null

  const slaValue = getFieldValue(row, 'sla')
  const tjphValue = getFieldValue(row, 'tjph')
  const slaTime = typeof slaValue === 'string' && slaValue.trim() ? parseDuration(slaValue) : null
  const tjphTime =
    typeof tjphValue === 'string' && tjphValue.trim() ? parseDuration(tjphValue) : null

  const slaDeadline = ataOrigin && slaTime !== null ? new Date(ataOrigin.getTime() + slaTime) : null
  const tjphDeadline =
    ataOrigin && tjphTime !== null ? new Date(ataOrigin.getTime() + tjphTime) : null

  // SLA: between SLA and TJPH deadlines
  const slaAlert =
    slaDeadline !== null && tjphDeadline !== null ? now > slaDeadline && now < tjphDeadline : false
  // TJPH: past TJPH deadline
  const tjphAlert = tjphDeadline !== null ? now > tjphDeadline : false
  // Presence checks (placeholder formulas — update once confirmed)
  const ataFlightAlert = isEmptyValue(getFieldValue(row, 'ata_flight'))
  const atdFlightAlert = isEmptyValue(getFieldValue(row, 'atd_flight'))
  const smuAlert = isEmptyValue(getFieldValue(row, 'tracking_smu'))

  return { slaAlert, tjphAlert, ataFlightAlert, atdFlightAlert, smuAlert }
}

export const ALERT_TYPES: AlertType[] = [
  'slaAlert', 'tjphAlert', 'ataFlightAlert', 'atdFlightAlert', 'smuAlert',
]
export const ALERT_FILTERS: AlertFilter[] = [...ALERT_TYPES, 'normal']
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  slaAlert: 'SLA Alert',
  tjphAlert: 'TJPH Alert',
  ataFlightAlert: 'ATA Flight Alert',
  atdFlightAlert: 'ATD Flight Alert',
  smuAlert: 'SMU Alert',
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/air-shipments/alert-evaluator.ts
git commit -m "feat: implement alert-evaluator with SLA, TJPH, and presence checks"
```

---

## Task 2: Write alert-evaluator tests

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts`

- [ ] **Step 1: Write the tests**

```typescript
// apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts
import { evaluateAlerts, AlertType, ALERT_TYPES } from './alert-evaluator'

describe('evaluateAlerts', () => {
  beforeAll(() => { jest.useFakeTimers() })
  afterAll(() => { jest.useRealTimers() })

  it('returns all false when no alerts are triggered', () => {
    jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
    expect(evaluateAlerts({
      sla: '01:00:00', tjph: '03:00:00',
      ata_origin: '2025-01-01T08:00:00Z',
      ata_flight: '2025-01-01T09:00:00Z',
      atd_flight: '2025-01-01T08:30:00Z',
      tracking_smu: 'SMU123',
    })).toEqual({ slaAlert: false, tjphAlert: false, ataFlightAlert: false, atdFlightAlert: false, smuAlert: false })
  })

  it('detects slaAlert when now is after SLA deadline and before TJPH deadline', () => {
    jest.setSystemTime(new Date('2025-01-01T12:30:00Z'))
    expect(evaluateAlerts({
      sla: '02:00:00', tjph: '04:00:00',
      ata_origin: '2025-01-01T10:00:00Z',
      ata_flight: '2025-01-01T11:00:00Z',
      atd_flight: '2025-01-01T10:45:00Z',
      tracking_smu: 'SMU123',
    })).toEqual({ slaAlert: true, tjphAlert: false, ataFlightAlert: false, atdFlightAlert: false, smuAlert: false })
  })

  it('detects tjphAlert when now is past TJPH deadline', () => {
    jest.setSystemTime(new Date('2025-01-01T15:00:00Z'))
    expect(evaluateAlerts({
      sla: '02:00:00', tjph: '04:00:00',
      ata_origin: '2025-01-01T10:00:00Z',
      ata_flight: '2025-01-01T11:00:00Z',
      atd_flight: '2025-01-01T10:45:00Z',
      tracking_smu: 'SMU123',
    })).toEqual({ slaAlert: false, tjphAlert: true, ataFlightAlert: false, atdFlightAlert: false, smuAlert: false })
  })

  it('handles HH:MM:SS durations with hours > 23', () => {
    jest.setSystemTime(new Date('2025-01-02T03:31:20Z'))
    // ataOrigin=2025-01-01T00:00:00Z, sla=25:30:15 → deadline 2025-01-02T01:30:15Z (past)
    // tjph=27:30:15 → deadline 2025-01-02T03:30:15Z (past)
    expect(evaluateAlerts({
      sla: '25:30:15', tjph: '27:30:15',
      ata_origin: '2025-01-01T00:00:00Z',
      ata_flight: '2025-01-01T10:00:00Z',
      atd_flight: '2025-01-01T09:00:00Z',
      tracking_smu: 'SMU123',
    })).toEqual({ slaAlert: false, tjphAlert: true, ataFlightAlert: false, atdFlightAlert: false, smuAlert: false })
  })

  it('reads tracking_smu from extra_fields when not a top-level column', () => {
    jest.setSystemTime(new Date('2025-01-01T08:30:00Z'))
    expect(evaluateAlerts({
      sla: '01:00:00', tjph: '05:00:00',
      ata_origin: '2025-01-01T08:00:00Z',
      ata_flight: '2025-01-01T09:00:00Z',
      atd_flight: '2025-01-01T08:30:00Z',
      extra_fields: { tracking_smu: '' },
    })).toEqual({ slaAlert: false, tjphAlert: false, ataFlightAlert: false, atdFlightAlert: false, smuAlert: true })
  })

  it.each<AlertType>(ALERT_TYPES)(
    'returns false (or true for presence checks) when field is null: %s',
    (alertType) => {
      const row: Record<string, unknown> = {
        sla: '01:00:00', tjph: '05:00:00',
        ata_origin: '2025-01-01T10:00:00Z',
        ata_flight: '2025-01-01T11:00:00Z',
        atd_flight: '2025-01-01T10:00:00Z',
        tracking_smu: 'SMU123',
      }
      const field = { slaAlert: 'sla', tjphAlert: 'tjph', ataFlightAlert: 'ata_flight', atdFlightAlert: 'atd_flight', smuAlert: 'tracking_smu' }[alertType]!
      row[field] = null
      const result = evaluateAlerts(row)
      const isPresenceCheck = ['ataFlightAlert', 'atdFlightAlert', 'smuAlert'].includes(alertType)
      expect(result[alertType]).toBe(isPresenceCheck ? true : false)
    }
  )
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd apps/backend && npx jest alert-evaluator.spec.ts --no-coverage
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts
git commit -m "test: add comprehensive unit tests for evaluateAlerts"
```

---

## Task 3: Extend AirShipmentQueryDto

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/dto/air-shipment-query.dto.ts`

The DTO must validate `days` (optional int, min=1) and `routeFilter` (optional string).

- [ ] **Step 1: Write the DTO**

```typescript
// apps/backend/src/modules/air-shipments/dto/air-shipment-query.dto.ts
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ALERT_FILTERS, AlertFilter } from '../alert-evaluator'

export class AirShipmentQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit: number = 50

  @IsOptional() @IsString()
  sortBy: string = 'id'

  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc'

  @IsOptional() @IsString()
  search?: string

  @IsOptional() @IsString() @IsIn(ALERT_FILTERS)
  alertFilter?: AlertFilter

  @IsOptional() @IsString()
  routeFilter?: string

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  days?: number
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/air-shipments/dto/air-shipment-query.dto.ts
git commit -m "feat: add days and routeFilter params to AirShipmentQueryDto"
```

---

## Task 4: Implement getAlertSummaryForTable and getRoutesForTable

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.ts`

Both methods must query `air_shipments_compileaircgk` (and any table by name). They accept an optional `days` param that filters by `ata_origin >= NOW() - N days`. Alert counts can overlap — count each flag independently.

- [ ] **Step 1: Add getAlertSummaryForTable to the service**

Add this method to `AirShipmentsService`:

```typescript
async getAlertSummaryForTable(tableName: string, days?: number) {
  if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
    throw new BadRequestException('Invalid table name')
  }
  const columns = await this.getTableColumns(tableName)
  const whereClauses: string[] = []
  const params: any[] = []

  if (typeof days === 'number') {
    const ataOriginExpr = this.buildTimestampExpression('ata_origin', columns)
    whereClauses.push(`(${ataOriginExpr} >= NOW() - ($${params.length + 1} || ' days')::interval)`)
    params.push(String(days))
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const rows: Record<string, unknown>[] = await this.dataSource.query(
    `SELECT * FROM "${tableName}" ${whereSql}`, params
  )

  return rows.reduce(
    (acc, row) => {
      const alerts = evaluateAlerts(row)
      acc.totalRows += 1
      if (alerts.slaAlert) acc.slaAlert += 1
      if (alerts.tjphAlert) acc.tjphAlert += 1
      if (alerts.ataFlightAlert) acc.ataFlightAlert += 1
      if (alerts.atdFlightAlert) acc.atdFlightAlert += 1
      if (alerts.smuAlert) acc.smuAlert += 1
      if (!Object.values(alerts).some(Boolean)) acc.normal += 1
      return acc
    },
    { totalRows: 0, slaAlert: 0, tjphAlert: 0, ataFlightAlert: 0, atdFlightAlert: 0, smuAlert: 0, normal: 0 }
  )
}
```

- [ ] **Step 2: Add getRoutesForTable to the service**

```typescript
async getRoutesForTable(tableName: string, days?: number) {
  if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
    throw new BadRequestException('Invalid table name')
  }
  const columns = await this.getTableColumns(tableName)
  const originExpr = this.buildFieldValueExpression('origin', columns)
  const destinationExpr = this.buildFieldValueExpression('destination', columns)

  const whereClauses: string[] = []
  const params: any[] = []
  if (typeof days === 'number') {
    const ataOriginExpr = this.buildTimestampExpression('ata_origin', columns)
    whereClauses.push(`(${ataOriginExpr} >= NOW() - ($${params.length + 1} || ' days')::interval)`)
    params.push(String(days))
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const rows: { origin: string; destination: string }[] = await this.dataSource.query(
    `SELECT DISTINCT ${originExpr} AS origin, ${destinationExpr} AS destination FROM "${tableName}" ${whereSql} ORDER BY origin, destination`,
    params
  )

  return {
    routes: rows
      .filter((row) => row.origin && row.destination)
      .map((row) => ({ label: `${row.origin} - ${row.destination}`, origin: row.origin, destination: row.destination })),
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/air-shipments/air-shipments.service.ts
git commit -m "feat: add getAlertSummaryForTable and getRoutesForTable with days filter"
```

---

## Task 5: Write service tests for alert-summary and routes

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to the existing `describe` block in `air-shipments.service.spec.ts`:

```typescript
it('returns alert summary with correct counts for 15-day scope', async () => {
  const dataSource = service['dataSource'] as jest.Mocked<DataSource>
  dataSource.query.mockImplementation((sql: string) => {
    if (sql.includes('information_schema.columns')) {
      return Promise.resolve([{ column_name: 'extra_fields' }])
    }
    if (sql.startsWith('SELECT * FROM "air_shipments_compileaircgk"')) {
      return Promise.resolve([
        // normal row — all fields present, no deadlines breached
        { extra_fields: { ata_origin: '2025-01-01T00:00:00Z', sla: '24:00:00', tjph: '48:00:00', ata_flight: 'FL001', atd_flight: 'FL001', tracking_smu: 'SMU123' } },
        // ataFlightAlert row
        { extra_fields: { ata_origin: '2025-01-05T00:00:00Z', sla: '24:00:00', tjph: '48:00:00', ata_flight: '', atd_flight: 'FL002', tracking_smu: 'SMU456' } },
        // tjphAlert row (past tjph deadline at test time 2025-01-15T12:00:00Z)
        { extra_fields: { ata_origin: '2025-01-12T00:00:00Z', sla: '24:00:00', tjph: '48:00:00', ata_flight: 'FL003', atd_flight: 'FL003', tracking_smu: 'SMU789' } },
      ])
    }
    return Promise.resolve([])
  })

  jest.useFakeTimers()
  jest.setSystemTime(new Date('2025-01-15T12:00:00Z'))

  const summary = await service.getAlertSummaryForTable('air_shipments_compileaircgk', 15)
  // row 1: normal (sla=24h, tjph=48h from 2025-01-01, now=2025-01-15 → past both → tjphAlert)
  // row 2: ataFlightAlert
  // row 3: tjphAlert (ata_origin=2025-01-12, tjph=48h → deadline 2025-01-14T00:00:00 → past)
  expect(summary.totalRows).toBe(3)
  expect(summary.tjphAlert).toBeGreaterThanOrEqual(1)
  expect(summary.ataFlightAlert).toBe(1)
  expect(summary).toHaveProperty('normal')

  jest.useRealTimers()
})

it('returns distinct routes for a table', async () => {
  const dataSource = service['dataSource'] as jest.Mocked<DataSource>
  dataSource.query.mockImplementation((sql: string) => {
    if (sql.includes('information_schema.columns')) {
      return Promise.resolve([{ column_name: 'extra_fields' }])
    }
    if (sql.startsWith('SELECT DISTINCT')) {
      return Promise.resolve([
        { origin: 'CGK', destination: 'SUB' },
        { origin: 'CGK', destination: 'DPS' },
      ])
    }
    return Promise.resolve([])
  })

  const result = await service.getRoutesForTable('air_shipments_compileaircgk', 15)
  expect(result.routes).toEqual([
    { label: 'CGK - SUB', origin: 'CGK', destination: 'SUB' },
    { label: 'CGK - DPS', origin: 'CGK', destination: 'DPS' },
  ])
})
```

- [ ] **Step 2: Run tests**

```bash
cd apps/backend && npx jest air-shipments.service.spec.ts --no-coverage
```

Expected: New tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/air-shipments/air-shipments.service.spec.ts
git commit -m "test: add service tests for getAlertSummaryForTable and getRoutesForTable"
```

---

## Task 6: Extend findAllForTable with days, routeFilter, and normal filter

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.ts`

The main query already supports `search`. Extend it to support `days`, `routeFilter` (split `origin - destination`), and `alertFilter === 'normal'` (rows where ALL flags are false).

- [ ] **Step 1: Add days filter clause**

In `findAllForTable`, after the `routeFilter` block, add:

```typescript
if (typeof days === 'number') {
  const ataOriginExpr = this.buildTimestampExpression('ata_origin', columns)
  whereClauses.push(
    `(${ataOriginExpr} >= NOW() - ($${params.length + 1} || ' days')::interval)`
  )
  params.push(String(days))
}
```

- [ ] **Step 2: Add routeFilter clause**

In `findAllForTable`, after the `search` block, add:

```typescript
if (routeFilter && routeFilter.trim()) {
  const parts = routeFilter.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 2) {
    const [origin, destination] = parts
    const originExpr = this.buildFieldValueExpression('origin', columns)
    const destinationExpr = this.buildFieldValueExpression('destination', columns)
    whereClauses.push(`LOWER(${originExpr}) = LOWER($${params.length + 1})`)
    params.push(origin)
    whereClauses.push(`LOWER(${destinationExpr}) = LOWER($${params.length + 1})`)
    params.push(destination)
  }
}
```

- [ ] **Step 3: Add alertFilter in-memory evaluation (including 'normal')**

When `alertFilter` is set, fetch all matching rows then filter in memory:

```typescript
if (alertFilter) {
  const rows = await this.dataSource.query(
    `SELECT * FROM "${tableName}" ${whereSql} ${orderBySql}`,
    params
  )
  const filteredRows = this.filterRowsByAlert(rows, alertFilter)
  const total = filteredRows.length
  const data = filteredRows.slice(offset, offset + limit)
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}
```

The `filterRowsByAlert` private method:

```typescript
private filterRowsByAlert(rows: Record<string, unknown>[], alertFilter: AlertFilter) {
  return rows.filter((row) => {
    const alerts = evaluateAlerts(row)
    if (alertFilter === 'normal') return !Object.values(alerts).some(Boolean)
    return alerts[alertFilter as AlertType]
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/air-shipments/air-shipments.service.ts
git commit -m "feat: extend findAllForTable with days, routeFilter, and normal alertFilter"
```

---

## Task 7: Wire controller endpoints

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.controller.ts`

Three endpoints are needed. The `days` query param must be passed through as a number (not string — class-transformer handles this via DTO).

- [ ] **Step 1: Verify the three endpoints exist**

Confirm these routes are in the controller (order matters — specific routes before `:tableName`):

```typescript
// GET /air-shipments/:tableName/alert-summary?days=15
@Get(':tableName/alert-summary')
async getAlertSummary(@Param('tableName') tableName: string, @Query('days') days?: number) {
  return this.service.getAlertSummaryForTable(tableName, days)
}

// GET /air-shipments/:tableName/routes?days=15
@Get(':tableName/routes')
async getRoutes(@Param('tableName') tableName: string, @Query('days') days?: number) {
  return this.service.getRoutesForTable(tableName, days)
}

// GET /air-shipments/:tableName?page=1&limit=50&days=15&alertFilter=slaAlert&routeFilter=CGK-SUB
@Get(':tableName')
async findAllDynamic(@Param('tableName') tableName: string, @Query() query: AirShipmentQueryDto) {
  return this.service.findAllForTable(tableName, query as any)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/air-shipments/air-shipments.controller.ts
git commit -m "feat: wire alert-summary, routes, and main query endpoints in controller"
```

---

## Task 8: Add notifyCompleted to SyncNotificationGateway

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/sync-notification.gateway.ts`

After a successful sync of "Compile Air CGK", the gateway must emit `sync.completed` with `{ sheet: 'compile_air_cgk' }`. The sheet identifier is normalized to snake_case by `normalizeSheetIdentifier()` in the service.

- [ ] **Step 1: Add notifyCompleted method**

```typescript
notifyCompleted(sheetIdentifier: string): void {
  if (!sheetIdentifier) return
  this.server.emit('sync.completed', { sheet: sheetIdentifier })
}
```

- [ ] **Step 2: Ensure the service calls it after each sheet sync**

In `air-shipments.service.ts`, inside `runSyncCycle`, after processing each sheet:

```typescript
const sheetId = this.normalizeSheetIdentifier(sheet.sheetName)
this.gateway?.notifyCompleted(sheetId)
```

The `normalizeSheetIdentifier` private method:

```typescript
private normalizeSheetIdentifier(sheetName: string): string {
  return sheetName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
```

"Compile Air CGK" → `compile_air_cgk` ✓

- [ ] **Step 3: Write failing gateway test**

```typescript
// in sync-notification.gateway.spec.ts
it('emits sync.completed with sheet identifier', () => {
  gateway.notifyCompleted('compile_air_cgk')
  expect(mockServer.emit).toHaveBeenCalledWith('sync.completed', { sheet: 'compile_air_cgk' })
})

it('does not emit sync.completed when identifier is empty', () => {
  gateway.notifyCompleted('')
  expect(mockServer.emit).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: Run gateway tests**

```bash
cd apps/backend && npx jest sync-notification.gateway.spec.ts --no-coverage
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/air-shipments/sync-notification.gateway.ts \
         apps/backend/src/modules/air-shipments/sync-notification.gateway.spec.ts
git commit -m "feat: add notifyCompleted to gateway and test sync.completed emission"
```

---

## Task 9: Implement useSyncNotification hook

**Files:**
- Modify: `apps/frontend/src/features/air-shipments/hooks/useSyncNotification.ts`

The hook must listen for both `sync:update` (row-level diff) and `sync.completed` (sheet-level finish). Dashboard uses `lastCompletedSheet` to trigger refresh.

- [ ] **Step 1: Write the hook**

```typescript
// apps/frontend/src/features/air-shipments/hooks/useSyncNotification.ts
'use client'
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { SyncNotificationPayload } from '../types'

export interface UseSyncNotificationResult {
  isConnected: boolean
  lastSyncAt: string | null
  affectedTables: string[]
  lastCompletedSheet: string | null
  lastCompletedAt: string | null
}

export function useSyncNotification(): UseSyncNotificationResult {
  const [isConnected, setIsConnected] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [affectedTables, setAffectedTables] = useState<string[]>([])
  const [lastCompletedSheet, setLastCompletedSheet] = useState<string | null>(null)
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000'
    const socket = io(wsUrl, { transports: ['websocket'], withCredentials: true })
    socketRef.current = socket

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))
    socket.on('sync:update', (payload: SyncNotificationPayload) => {
      setLastSyncAt(payload.syncedAt)
      setAffectedTables(payload.affectedTables)
    })
    socket.on('sync.completed', (payload: { sheet: string }) => {
      setLastCompletedSheet(payload.sheet)
      setLastCompletedAt(new Date().toISOString())
    })

    return () => { socket.disconnect() }
  }, [])

  return { isConnected, lastSyncAt, affectedTables, lastCompletedSheet, lastCompletedAt }
}
```

- [ ] **Step 2: Run hook tests**

```bash
cd apps/frontend && npx jest hooks/useSyncNotification --no-coverage
```

Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/air-shipments/hooks/useSyncNotification.ts \
         apps/frontend/src/features/air-shipments/hooks/useSyncNotification.spec.tsx
git commit -m "feat: useSyncNotification hook handles sync:update and sync.completed events"
```

---

## Task 10: Create DashboardAlertCards component

**Files:**
- Create: `apps/frontend/src/features/air-shipments/components/DashboardAlertCards.tsx`

Displays 6 cards: SLA (#EF4444), TJPH (#F97316), ATA Flight (#EAB308), ATD Flight (#3B82F6), SMU (#8B5CF6), Normal (#22C55E). Shows total count above the grid. Cards are clickable buttons that set the active alert filter.

- [ ] **Step 1: Write the component**

```typescript
// apps/frontend/src/features/air-shipments/components/DashboardAlertCards.tsx
'use client'
import { AlertTriangle, Hourglass, PlaneLanding, PlaneTakeoff, PackageSearch, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DashboardAlertKey = 'slaAlert' | 'tjphAlert' | 'ataFlightAlert' | 'atdFlightAlert' | 'smuAlert' | 'normal'

export interface DashboardAlertSummary {
  totalRows: number
  slaAlert: number
  tjphAlert: number
  ataFlightAlert: number
  atdFlightAlert: number
  smuAlert: number
  normal: number
}

interface DashboardAlertCardsProps {
  summary: DashboardAlertSummary | null
  activeAlert: DashboardAlertKey | null
  onSelect: (alertKey: DashboardAlertKey) => void
  isLoading?: boolean
  error?: string | null
}

const ALERT_CARDS: Array<{ key: DashboardAlertKey; label: string; color: string; icon: React.ElementType }> = [
  { key: 'slaAlert',       label: 'SLA Alert',       color: '#EF4444', icon: AlertTriangle },
  { key: 'tjphAlert',      label: 'TJPH Alert',      color: '#F97316', icon: Hourglass },
  { key: 'ataFlightAlert', label: 'ATA Flight Alert', color: '#EAB308', icon: PlaneLanding },
  { key: 'atdFlightAlert', label: 'ATD Flight Alert', color: '#3B82F6', icon: PlaneTakeoff },
  { key: 'smuAlert',       label: 'SMU Alert',       color: '#8B5CF6', icon: PackageSearch },
  { key: 'normal',         label: 'Normal',           color: '#22C55E', icon: CheckCircle2 },
]

export function DashboardAlertCards({ summary, activeAlert, onSelect, isLoading, error }: DashboardAlertCardsProps) {
  return (
    <section aria-labelledby="dashboard-alert-cards-heading" className="rounded-3xl border border-border bg-panel p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="dashboard-alert-cards-heading" className="text-lg font-semibold text-foreground">Alert cards</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Loading alert summary…'
              : summary
              ? `${summary.totalRows} shipments in the last 15 days`
              : 'Unable to load shipment counts.'}
          </p>
        </div>
        <div className="text-sm text-slate-500">{error ?? (isLoading ? 'Refreshing…' : 'Last 15 days scope')}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ALERT_CARDS.map((card) => {
          const value = summary ? (summary[card.key] ?? 0) : 0
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onSelect(card.key)}
              className={cn(
                'group flex min-h-[120px] flex-col justify-between rounded-3xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2',
                activeAlert === card.key ? 'border-slate-900 bg-slate-50' : 'border-border bg-background'
              )}
              aria-pressed={activeAlert === card.key}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{card.label}</span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${card.color}22`, color: card.color }}>
                  <Icon size={18} />
                </span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-semibold text-foreground">{isLoading ? '—' : value}</p>
                <p className="text-sm text-muted-foreground">
                  {card.key === 'normal' ? 'No alerts triggered' : 'Alert rows'}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/air-shipments/components/DashboardAlertCards.tsx
git commit -m "feat: create DashboardAlertCards component with 6 alert cards"
```

---

## Task 11: Build dashboard page — 3-section layout with filters

**Files:**
- Modify: `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

Remove the 3 old buttons. Build 3 sections: Greeting → Alert Cards → Table. All filter state lives here. **Critical: use `days=15` (not 30) everywhere.**

- [ ] **Step 1: Write the page**

```typescript
// apps/frontend/src/app/(dashboard)/dashboard/page.tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/page-header'
import { AirShipmentTable } from '@/features/air-shipments/components/AirShipmentTable'
import { SyncStatusBadge } from '@/features/air-shipments/components/SyncStatusBadge'
import {
  DashboardAlertCards,
  DashboardAlertKey,
  DashboardAlertSummary,
} from '@/features/air-shipments/components/DashboardAlertCards'
import { useSyncNotification } from '@/features/air-shipments/hooks/useSyncNotification'
import { AirShipmentsResponse } from '@/features/air-shipments/types'

interface RouteOption { label: string; origin: string; destination: string }

const TABLE_NAME = 'air_shipments_compileaircgk'
const TABLE_ENDPOINT = `/air-shipments/${TABLE_NAME}`
const DAYS = 15

const ALERT_OPTIONS: Array<{ value: DashboardAlertKey | null; label: string }> = [
  { value: null,             label: 'All Alerts' },
  { value: 'slaAlert',       label: 'SLA Alert' },
  { value: 'tjphAlert',      label: 'TJPH Alert' },
  { value: 'ataFlightAlert', label: 'ATA Flight Alert' },
  { value: 'atdFlightAlert', label: 'ATD Flight Alert' },
  { value: 'smuAlert',       label: 'SMU Alert' },
  { value: 'normal',         label: 'Normal' },
]

export default function DashboardPage() {
  const { isConnected, lastSyncAt, lastCompletedSheet } = useSyncNotification()
  const tableRef = useRef<HTMLDivElement | null>(null)

  const [summary, setSummary] = useState<DashboardAlertSummary | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [data, setData] = useState<AirShipmentsResponse | null>(null)
  const [activeAlert, setActiveAlert] = useState<DashboardAlertKey | null>(null)
  const [activeRoute, setActiveRoute] = useState<string>('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({})

  const fetchAlertSummary = async () => {
    setSummaryLoading(true)
    try {
      const res = await apiClient.get<DashboardAlertSummary>(`${TABLE_ENDPOINT}/alert-summary?days=${DAYS}`)
      setSummary(res.data)
    } catch { setSummary(null) }
    finally { setSummaryLoading(false) }
  }

  const fetchRoutes = async () => {
    try {
      const res = await apiClient.get<{ routes: RouteOption[] }>(`${TABLE_ENDPOINT}/routes?days=${DAYS}`)
      setRoutes(res.data.routes ?? [])
    } catch { setRoutes([]) }
  }

  const fetchTableData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', days: String(DAYS) })
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      if (activeAlert) params.set('alertFilter', activeAlert)
      if (activeRoute) params.set('routeFilter', activeRoute)
      const res = await apiClient.get<AirShipmentsResponse>(`${TABLE_ENDPOINT}?${params}`)
      setData(res.data)
    } catch { setError('Unable to load shipment table'); setData(null) }
    finally { setIsLoading(false) }
  }

  const refreshAll = async () => {
    await Promise.all([fetchAlertSummary(), fetchRoutes(), fetchTableData()])
    setLastUpdated(new Date().toLocaleTimeString([], { hour12: false }))
  }

  // Initial load
  useEffect(() => { void refreshAll() }, [])

  // Search debounce
  useEffect(() => {
    const t = window.setTimeout(() => { setSearchQuery(searchInput); setPage(1) }, 700)
    return () => window.clearTimeout(t)
  }, [searchInput])

  // Re-fetch table when filters or page change
  useEffect(() => { void fetchTableData() }, [page, activeAlert, activeRoute, searchQuery])

  // Live refresh on sync completion for Compile Air CGK
  useEffect(() => {
    if (lastCompletedSheet === 'compile_air_cgk') void refreshAll()
  }, [lastCompletedSheet])

  // Build visible columns from data
  const allColumns = useMemo(() => {
    const cols = new Set<string>()
    if (data?.data) {
      for (const row of data.data) {
        Object.keys(row).filter((k) => k !== 'extra_fields').forEach((k) => cols.add(k))
        if (row.extra_fields && typeof row.extra_fields === 'object') {
          Object.keys(row.extra_fields).forEach((k) => cols.add(k))
        }
      }
    }
    return Array.from(cols)
  }, [data])

  useEffect(() => {
    if (!allColumns.length) return
    setVisibleColumns((prev) => {
      const next = { ...prev }
      for (const col of allColumns) if (!(col in next)) next[col] = true
      return next
    })
  }, [allColumns])

  const handleAlertCardClick = (alertKey: DashboardAlertKey) => {
    setActiveAlert((curr) => (curr === alertKey ? null : alertKey))
    setPage(1)
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleAlertDropdownChange = (value: string) => {
    setActiveAlert(value === 'null' ? null : (value as DashboardAlertKey))
    setPage(1)
  }

  const activeAlertLabel = ALERT_OPTIONS.find((o) => o.value === activeAlert)?.label ?? ''

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      {/* Section 1: Greeting */}
      <section className="space-y-6">
        <div className="rounded-3xl border border-border bg-panel p-6 shadow-sm">
          <div className="text-xl font-semibold text-foreground">Welcome back</div>
          <p className="mt-2 text-sm text-muted-foreground">Operational monitoring for the last 15 days.</p>
        </div>

        {/* Section 2: Alert Cards */}
        <DashboardAlertCards
          summary={summary}
          activeAlert={activeAlert}
          onSelect={handleAlertCardClick}
          isLoading={summaryLoading}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {lastUpdated ? `Last updated: ${lastUpdated}` : 'Waiting for data…'}
          </p>
          <SyncStatusBadge isConnected={isConnected} lastSyncAt={lastSyncAt} />
        </div>
      </section>

      {/* Section 3: Filtered Table */}
      <section ref={tableRef} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr_1fr]">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Search</span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search shipments…"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Alert</span>
            <select
              value={activeAlert ?? 'null'}
              onChange={(e) => handleAlertDropdownChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {ALERT_OPTIONS.map((o) => (
                <option key={o.label} value={o.value ?? 'null'}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Route</span>
            <select
              value={activeRoute}
              onChange={(e) => { setActiveRoute(e.target.value); setPage(1) }}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Routes</option>
              {routes.map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
            </select>
          </label>
        </div>

        {/* Filter badge */}
        {activeAlert && (
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span>Filtered by: {activeAlertLabel}</span>
            <button
              type="button"
              className="rounded-full bg-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-300"
              onClick={() => { setActiveAlert(null); setPage(1) }}
              aria-label="Clear alert filter"
            >
              ×
            </button>
          </div>
        )}

        {error ? (
          <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : (
          <div className="rounded-3xl border border-border bg-panel p-4 shadow-sm">
            <AirShipmentTable
              data={data?.data ?? []}
              meta={data?.meta ?? { page: 1, limit: 50, total: 0, totalPages: 1 }}
              sortBy="date"
              sortOrder="asc"
              onSort={() => undefined}
              onPageChange={setPage}
              visibleColumns={visibleColumns}
            />
          </div>
        )}

        {isLoading && (
          <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            Loading table data…
          </div>
        )}
      </section>
    </div>
  )
}
```

**Key constraint:** `DAYS = 15` constant is defined once at the top. All three fetch calls reference it — never hardcode the number inline.

- [ ] **Step 2: Verify Shipment menu is unaffected**

Check that `AirShipmentsPage` still does NOT receive a `days` prop or query param:

```bash
grep -n "days" apps/frontend/src/features/air-shipments/components/AirShipmentsPage.tsx
```

Expected: no results (the page should not pass `days` to any hook or API call).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/(dashboard)/dashboard/page.tsx
git commit -m "feat: rebuild dashboard with 3-section layout, alert filters, and 15-day scope"
```

---

## Task 12: Run all tests and verify acceptance criteria

- [ ] **Step 1: Run backend tests**

```bash
cd apps/backend && npx jest --no-coverage
```

Expected: All suites PASS. Check that `alert-evaluator.spec.ts`, `sync-notification.gateway.spec.ts`, and `air-shipments.service.spec.ts` all appear green.

- [ ] **Step 2: Run frontend tests**

```bash
cd apps/frontend && npx jest --no-coverage
```

Expected: `useSyncNotification.spec.tsx` PASS.

- [ ] **Step 3: Check TypeScript compilation**

```bash
cd apps/backend && npx tsc --noEmit
cd apps/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Verify the days=15 constant is used throughout**

```bash
grep -n "days=30\|days: '30'\|days=\"30\"" apps/frontend/src/app/(dashboard)/dashboard/page.tsx
```

Expected: No output. If any line appears, change it to `DAYS` constant.

- [ ] **Step 5: Verify acceptance criteria checklist**

| Criterion | How to verify |
|-----------|---------------|
| Dashboard shows 3 sections, buttons removed | Visually inspect dashboard page component |
| Alert cards show correct counts within 15-day scope | Check `alert-summary?days=15` response |
| Total shipment count shown above cards | Look for `summary.totalRows` in DashboardAlertCards |
| Clicking a card scrolls to table and activates alert filter | Trace `handleAlertCardClick` in page.tsx |
| Route dropdown populated with distinct Origin - Destination values | Check `routes?days=15` response |
| Alert + Route + Search filters work in combination | All params combined in URLSearchParams |
| "Normal" filter shows only rows with zero alerts | `filterRowsByAlert` in service |
| Filter badge visible and dismissible with ✕ | `activeAlert && (...)` block in page.tsx |
| Pagination 50 rows per page | `limit: '50'` in URLSearchParams |
| Shipment menu page unaffected | AirShipmentsPage has no `days` param |
| SLA Alert formula correct | Covered by alert-evaluator.spec.ts |
| TJPH Alert formula correct | Covered by alert-evaluator.spec.ts |
| parseDuration handles hours > 23 | Covered by alert-evaluator.spec.ts |
| WebSocket triggers live refresh preserving filters | `lastCompletedSheet === 'compile_air_cgk'` effect |

- [ ] **Step 6: Final commit**

```bash
git add -p  # stage any remaining fixes
git commit -m "chore: verify all acceptance criteria for dashboard alert section"
```
