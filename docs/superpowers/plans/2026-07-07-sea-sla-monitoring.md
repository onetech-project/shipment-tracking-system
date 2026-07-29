# Sea SLA Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split SLA Monitoring into Air/Sea submenus where Sea computes 7 alert types + OTP over `air_shipments_compileseanonjava`, reusing all Air functionality (alerts-by-route, active/excluded tabs, exclude/restore, export, column config).

**Architecture:** Profile-driven generalization. A new `AlertProfile` object (field mappings + enabled alert types) parameterizes the existing `evaluateAlerts` evaluator and the `AirShipmentsService` aggregation/list/export paths; the profile is resolved from the table name (general param `sea_sla_table_name`). The frontend gets one centralized `sla-mode.config.ts` consumed by a mode-parameterized `SlaPage`, mounted at `/sla/air` and `/sla/sea` under a tab-bar layout.

**Tech Stack:** NestJS 10 + TypeORM (raw SQL over dynamic tables) + Jest; Next.js 14 App Router + axios (no react-query in SLA); PostgreSQL with JSONB `extra_fields`.

**Spec:** `docs/superpowers/specs/2026-07-07-sea-sla-monitoring-design.md`

## Global Constraints

- Package manager is **pnpm** (never npm). Backend tests: `cd apps/backend && pnpm test <pattern>`. Frontend check: `cd apps/frontend && pnpm type-check`.
- **Air behavior must not change.** The AIR profile must reproduce current evaluator/service output exactly; the full existing backend jest suite is the regression gate.
- All dynamic table access is regex-guarded: `/^air_shipments_[a-z0-9_]+$/` — keep every existing guard.
- No new permissions. All Sea reads reuse `read.sla` (`Permission.READ_SLA`); do not touch `packages/shared/src/auth/index.ts`.
- New alert key is `reservasiKapal` (backend label `'Reservasi Kapal'`, frontend label `'Sea Reservation'` — the backend/frontend label divergence matches the existing `reservasiPenerbangan`/'Flight Reservations' precedent).
- Sea table: `air_shipments_compileseanonjava`. Sea field names: completion = `ata_vendor_wh_destination_sertakan_link_evidence`, SPX completion = `trip_completed`, arrival = `ata_sailing`, departure = `atd_sailing`, reservation = `actual_ship_name`.
- Work on branch `feat/sea-alert`. Commit after every task with the shown message; end commits with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Migrations run manually: `cd apps/backend && pnpm migration:run` (data source `src/database/data-source.ts`, `migrationsRun: false`). Local DB: `postgres://postgres:postgres@localhost:5432/app`.

---

### Task 1: Alert evaluator — `AlertProfile`, `reservasiKapal`, profile resolution helper

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/alert-evaluator.ts`
- Test: `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 3, 4, 5):
  - `type AlertType` gains `'reservasiKapal'`; `interface AlertFlags` gains `reservasiKapal: boolean`.
  - `interface AlertProfile { key: 'air' | 'sea'; alertTypes: AlertType[]; completionField: string; spxCompletionField: string; arrivalField: string; departureField: string; reservationField: string; reservationAlertType: AlertType; useSmuTracking: boolean }`
  - `export const AIR_ALERT_PROFILE: AlertProfile`, `export const SEA_ALERT_PROFILE: AlertProfile`
  - `evaluateAlerts(row, nHours, mHours, now?: Date, profile: AlertProfile = AIR_ALERT_PROFILE): AlertFlags`
  - `export function resolveAlertProfile(tableName: string, seaTableName: string): AlertProfile`
  - `ALERT_TYPES` gains `'reservasiKapal'` (extends every `@IsIn(ALERT_TYPES)` DTO automatically); `ALERT_TYPE_LABELS.reservasiKapal = 'Reservasi Kapal'`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts` (inside the file, after the existing top-level `describe`). Also update the import line at the top of the file:

```ts
import {
  evaluateAlerts,
  ALERT_TYPES,
  SEA_ALERT_PROFILE,
  AIR_ALERT_PROFILE,
  resolveAlertProfile,
} from './alert-evaluator'
```

```ts
describe('evaluateAlerts — SEA profile', () => {
  beforeAll(() => jest.useFakeTimers())
  afterAll(() => jest.useRealTimers())

  // Base sea row: ship assigned, sailed and arrived, inside all deadlines at 08:30
  const seaBase = {
    atd_origin: '2025-01-01T08:00:00Z',
    actual_ship_name: 'Berkah Express',
    sla: '02:00:00', // maxSla = 10:00
    tjph: '04:00:00', // maxTjph = 12:00
    ata_sailing: '2025-01-01T09:00:00Z',
    atd_sailing: '2025-01-01T08:30:00Z',
  }
  const N = 1
  const M = 1
  const NOW_OK = new Date('2025-01-01T08:30:00Z')

  const evalSea = (row: Record<string, unknown>, now: Date) =>
    evaluateAlerts(row, N, M, now, SEA_ALERT_PROFILE)

  it('returns all false for a healthy row', () => {
    const flags = evalSea(seaBase, NOW_OK)
    expect(Object.values(flags).some(Boolean)).toBe(false)
    expect(flags).toHaveProperty('reservasiKapal', false)
  })

  describe('reservasiKapal (Sea Reservation)', () => {
    it('triggers when ship name empty, not completed, past atd_origin + n, not sailed', () => {
      const row = { atd_origin: '2025-01-01T08:00:00Z', sla: '02:00:00' }
      const flags = evalSea(row, new Date('2025-01-01T09:30:00Z')) // 1.5h after departure, n=1h
      expect(flags.reservasiKapal).toBe(true)
    })
    it('does NOT trigger when actual_ship_name is set', () => {
      const row = { atd_origin: '2025-01-01T08:00:00Z', actual_ship_name: 'KM Sejahtera' }
      expect(evalSea(row, new Date('2025-01-01T09:30:00Z')).reservasiKapal).toBe(false)
    })
    it('does NOT trigger before atd_origin + n hours', () => {
      const row = { atd_origin: '2025-01-01T08:00:00Z' }
      expect(evalSea(row, new Date('2025-01-01T08:30:00Z')).reservasiKapal).toBe(false)
    })
    it('does NOT trigger when the vessel already sailed (atd_sailing set)', () => {
      const row = { atd_origin: '2025-01-01T08:00:00Z', atd_sailing: '2025-01-01T09:00:00Z' }
      expect(evalSea(row, new Date('2025-01-01T09:30:00Z')).reservasiKapal).toBe(false)
    })
    it('does NOT trigger when completed', () => {
      const row = {
        atd_origin: '2025-01-01T08:00:00Z',
        ata_vendor_wh_destination_sertakan_link_evidence: '2025-01-01T09:00:00Z',
      }
      expect(evalSea(row, new Date('2025-01-01T09:30:00Z')).reservasiKapal).toBe(false)
    })
  })

  describe('potential breaches use ata_sailing + m', () => {
    it('potensiMelebihiSla triggers when ata_sailing + m > maxSla and not completed', () => {
      // maxSla 10:00; ata_sailing 09:30 + 1h = 10:30 > 10:00
      const row = { ...seaBase, ata_sailing: '2025-01-01T09:30:00Z' }
      expect(evalSea(row, NOW_OK).potensiMelebihiSla).toBe(true)
    })
    it('potensiMelebihiSla suppressed when completed', () => {
      const row = {
        ...seaBase,
        ata_sailing: '2025-01-01T09:30:00Z',
        ata_vendor_wh_destination_sertakan_link_evidence: '2025-01-01T09:45:00Z',
      }
      expect(evalSea(row, NOW_OK).potensiMelebihiSla).toBe(false)
    })
    it('potensiMelebihiTjph triggers when ata_sailing + m > maxTjph', () => {
      // maxTjph 12:00; ata_sailing 11:30 + 1h = 12:30 > 12:00
      const row = { ...seaBase, ata_sailing: '2025-01-01T11:30:00Z' }
      expect(evalSea(row, NOW_OK).potensiMelebihiTjph).toBe(true)
    })
    it('ignores air ata_flight for the sea profile', () => {
      const row = { ...seaBase, ata_flight: '2025-01-01T11:30:00Z' } // would breach in AIR profile
      expect(evalSea(row, NOW_OK).potensiMelebihiSla).toBe(false)
    })
  })

  describe('breaches use the sea completion field', () => {
    it('melewatiSla via sea completion after maxSla', () => {
      const row = {
        ...seaBase,
        ata_vendor_wh_destination_sertakan_link_evidence: '2025-01-01T10:30:00Z',
      }
      expect(evalSea(row, NOW_OK).melewatiSla).toBe(true)
    })
    it('melewatiSla via now when not completed and past maxSla', () => {
      expect(evalSea(seaBase, new Date('2025-01-01T10:30:00Z')).melewatiSla).toBe(true)
    })
    it('melewatiTjph via sea completion after maxTjph', () => {
      const row = {
        ...seaBase,
        ata_vendor_wh_destination_sertakan_link_evidence: '2025-01-01T12:30:00Z',
      }
      expect(evalSea(row, NOW_OK).melewatiTjph).toBe(true)
    })
    it('air completion field does not complete a sea row', () => {
      // ata_vendor_wh_destination (air name) set early, sea field empty, now past maxSla
      const row = { ...seaBase, ata_vendor_wh_destination: '2025-01-01T09:00:00Z' }
      expect(evalSea(row, new Date('2025-01-01T10:30:00Z')).melewatiSla).toBe(true)
    })
  })

  describe('SPX alerts use trip_completed', () => {
    it('spxSlaAlert when trip_completed after maxSla', () => {
      const row = { ...seaBase, trip_completed: '2025-01-01T10:30:00Z' }
      expect(evalSea(row, NOW_OK).spxSlaAlert).toBe(true)
    })
    it('spxTjphAlert when trip_completed after maxTjph', () => {
      const row = { ...seaBase, trip_completed: '2025-01-01T12:30:00Z' }
      expect(evalSea(row, NOW_OK).spxTjphAlert).toBe(true)
    })
    it('spxSlaAlert falls back to now when trip_completed empty', () => {
      expect(evalSea(seaBase, new Date('2025-01-01T10:30:00Z')).spxSlaAlert).toBe(true)
    })
    it('air completed_time does not drive sea SPX alerts', () => {
      const row = { ...seaBase, completed_time: '2025-01-01T10:30:00Z' }
      expect(evalSea(row, NOW_OK).spxSlaAlert).toBe(false)
    })
  })

  it('air-only alerts never fire for the sea profile', () => {
    const row = {
      atd_origin: '2025-01-01T08:00:00Z',
      sla: '02:00:00',
      offload_status: 'offload', // would fire flightTracking in AIR profile
    }
    const flags = evalSea(row, new Date('2025-01-01T09:30:00Z'))
    expect(flags.flightTracking).toBe(false)
    expect(flags.reservasiPenerbangan).toBe(false)
  })
})

describe('AIR profile default & profile resolution', () => {
  it('reservasiKapal is always false for the AIR profile', () => {
    const row = { atd_origin: '2025-01-01T08:00:00Z' } // empty ship name + reservation guards met
    const flags = evaluateAlerts(row, 1, 1, new Date('2025-01-01T09:30:00Z'))
    expect(flags.reservasiKapal).toBe(false)
  })
  it('resolveAlertProfile picks SEA for the configured table, AIR otherwise', () => {
    expect(resolveAlertProfile('air_shipments_compileseanonjava', 'air_shipments_compileseanonjava')).toBe(SEA_ALERT_PROFILE)
    expect(resolveAlertProfile('air_shipments_compileaircgk', 'air_shipments_compileseanonjava')).toBe(AIR_ALERT_PROFILE)
    expect(resolveAlertProfile('air_shipments_compileseanonjava', ' air_shipments_compileseanonjava ')).toBe(SEA_ALERT_PROFILE)
  })
})
```

Also update the existing "returns all false when no alerts are triggered" test (near the top of the file): add `reservasiKapal: false,` to its `toEqual({...})` object (the flags object gains a ninth key).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && pnpm test alert-evaluator`
Expected: FAIL — `SEA_ALERT_PROFILE`/`resolveAlertProfile` not exported (TS compile errors).

- [ ] **Step 3: Implement the profile-aware evaluator**

In `apps/backend/src/modules/air-shipments/alert-evaluator.ts`:

Replace the `AlertType` union and `AlertFlags` (lines 1-22) with:

```ts
export type AlertType =
  | 'reservasiPenerbangan'
  | 'reservasiKapal'
  | 'flightTracking'
  | 'potensiMelebihiSla'
  | 'melewatiSla'
  | 'potensiMelebihiTjph'
  | 'melewatiTjph'
  | 'spxTjphAlert'
  | 'spxSlaAlert'

export type AlertFilter = AlertType | 'normal' | 'any'

export type AlertFlags = Record<AlertType, boolean>

/**
 * Field mapping + enabled alert set for one transport mode. The evaluator only
 * reads row fields through this profile, so AIR and SEA sheets (different
 * column names, same semantics) share one rule implementation.
 */
export interface AlertProfile {
  key: 'air' | 'sea'
  /** Alert types this profile computes; all others are always false. */
  alertTypes: AlertType[]
  /** Completion field driving SLA/TJPH breaches, OTP, and the VOID check. */
  completionField: string
  /** Completion field driving the SPX alerts. */
  spxCompletionField: string
  /** Transport arrival (flight/vessel) — the potential-breach reference. */
  arrivalField: string
  /** Transport departure — reservation guard. */
  departureField: string
  /** Field whose emptiness means "not booked/reserved". */
  reservationField: string
  /** Which reservation alert key this profile produces. */
  reservationAlertType: AlertType
  /** Whether SMU/offload signals apply (air only). */
  useSmuTracking: boolean
}

export const AIR_ALERT_PROFILE: AlertProfile = {
  key: 'air',
  alertTypes: [
    'reservasiPenerbangan',
    'flightTracking',
    'potensiMelebihiSla',
    'melewatiSla',
    'potensiMelebihiTjph',
    'melewatiTjph',
    'spxTjphAlert',
    'spxSlaAlert',
  ],
  completionField: 'ata_vendor_wh_destination',
  spxCompletionField: 'completed_time',
  arrivalField: 'ata_flight',
  departureField: 'atd_flight',
  reservationField: 'awb',
  reservationAlertType: 'reservasiPenerbangan',
  useSmuTracking: true,
}

export const SEA_ALERT_PROFILE: AlertProfile = {
  key: 'sea',
  alertTypes: [
    'reservasiKapal',
    'potensiMelebihiSla',
    'melewatiSla',
    'potensiMelebihiTjph',
    'melewatiTjph',
    'spxSlaAlert',
    'spxTjphAlert',
  ],
  completionField: 'ata_vendor_wh_destination_sertakan_link_evidence',
  spxCompletionField: 'trip_completed',
  arrivalField: 'ata_sailing',
  departureField: 'atd_sailing',
  reservationField: 'actual_ship_name',
  reservationAlertType: 'reservasiKapal',
  useSmuTracking: false,
}

/** Maps a dynamic table name to its alert profile (seaTableName from general_params). */
export function resolveAlertProfile(tableName: string, seaTableName: string): AlertProfile {
  return seaTableName.trim() !== '' && tableName.trim() === seaTableName.trim()
    ? SEA_ALERT_PROFILE
    : AIR_ALERT_PROFILE
}
```

Replace the body of `evaluateAlerts` (keep `isEmptyValue`, `getFieldValue`, `parseDuration`, `parseDurationSafe`, `parseDate` unchanged):

```ts
export function evaluateAlerts(
  row: Record<string, unknown>,
  nHours: number,
  mHours: number,
  now: Date = new Date(),
  profile: AlertProfile = AIR_ALERT_PROFILE
): AlertFlags {
  const atdOrigin = parseDate(getFieldValue(row, 'atd_origin'))
  const slaTime = parseDurationSafe(getFieldValue(row, 'sla'))
  const tjphTime = parseDurationSafe(getFieldValue(row, 'tjph'))
  const arrival = getFieldValue(row, profile.arrivalField)
  const departure = getFieldValue(row, profile.departureField)
  const arrivalDate = parseDate(arrival)
  const reservationValue = getFieldValue(row, profile.reservationField)
  const trackinganSmu = profile.useSmuTracking ? getFieldValue(row, 'trackingan_smu') : undefined
  // Flight offload state for this AWB, joined from Tracking_SMU (air_shipments_tracking_smu)
  // by the service enrichment. `offload_has_evidence` is true once a justification link
  // is recorded — which excludes the AWB (and all its TOs) from the Flight Tracking alert.
  const offloadStatus = profile.useSmuTracking ? getFieldValue(row, 'offload_status') : undefined
  const isOffloaded =
    typeof offloadStatus === 'string' && offloadStatus.trim().toLowerCase() === 'offload'
  const offloadHasEvidence =
    profile.useSmuTracking && getFieldValue(row, 'offload_has_evidence') === true
  // Only flag SMU as "not onboard" when there is an explicit non-empty status that isn't "Onboard".
  // Missing/empty means no Reservasi record was found — don't trigger on absence of data.
  const smuNotOnboard =
    typeof trackinganSmu === 'string' &&
    trackinganSmu.trim() !== '' &&
    trackinganSmu.trim().toLowerCase() !== 'onboard'

  const maxSla = atdOrigin && slaTime !== null ? new Date(atdOrigin.getTime() + slaTime) : null
  const maxTjph = atdOrigin && tjphTime !== null ? new Date(atdOrigin.getTime() + tjphTime) : null
  const nMs = nHours * 3_600_000
  const mMs = mHours * 3_600_000

  const completedTime = parseDate(getFieldValue(row, profile.completionField))
  const effectiveTime = completedTime ?? now

  const spxCompletedTime = parseDate(getFieldValue(row, profile.spxCompletionField))
  const spxEffectiveTime = spxCompletedTime ?? now

  // Shared base condition for the reservation alert: departed origin, past the
  // n-hour grace window, transport not yet departed/arrived, not completed.
  const reservationAlertBase =
    isEmptyValue(completedTime) &&
    atdOrigin !== null &&
    now > new Date(atdOrigin.getTime() + nMs) &&
    isEmptyValue(departure) &&
    isEmptyValue(arrival)

  const flags: AlertFlags = {
    reservasiPenerbangan: false,
    reservasiKapal: false,
    flightTracking: false,
    potensiMelebihiSla: false,
    melewatiSla: false,
    potensiMelebihiTjph: false,
    melewatiTjph: false,
    spxTjphAlert: false,
    spxSlaAlert: false,
  }

  // Empty reservation field = flight/vessel hasn't been booked yet
  flags[profile.reservationAlertType] = isEmptyValue(reservationValue) && reservationAlertBase
  // AWB offloaded per Tracking_SMU and not yet justified with an evidence link
  flags.flightTracking = isOffloaded && !offloadHasEvidence

  flags.potensiMelebihiSla =
    isEmptyValue(completedTime) &&
    ((arrivalDate !== null && maxSla !== null && new Date(arrivalDate.getTime() + mMs) > maxSla) ||
      (!isEmptyValue(departure) && smuNotOnboard))

  flags.melewatiSla = maxSla !== null && effectiveTime > maxSla

  flags.potensiMelebihiTjph =
    isEmptyValue(completedTime) &&
    arrivalDate !== null &&
    maxTjph !== null &&
    new Date(arrivalDate.getTime() + mMs) > maxTjph

  flags.melewatiTjph = maxTjph !== null && effectiveTime > maxTjph

  flags.spxTjphAlert = maxTjph !== null && spxEffectiveTime > maxTjph
  flags.spxSlaAlert = maxSla !== null && spxEffectiveTime > maxSla

  // Mask alerts the profile doesn't compute
  const enabled = new Set(profile.alertTypes)
  for (const key of Object.keys(flags) as AlertType[]) {
    if (!enabled.has(key)) flags[key] = false
  }
  return flags
}
```

Update `ALERT_TYPES` and `ALERT_TYPE_LABELS` at the bottom:

```ts
export const ALERT_TYPES: AlertType[] = [
  'reservasiPenerbangan',
  'reservasiKapal',
  'flightTracking',
  'potensiMelebihiSla',
  'melewatiSla',
  'potensiMelebihiTjph',
  'melewatiTjph',
  'spxTjphAlert',
  'spxSlaAlert',
]

export const ALERT_FILTERS: AlertFilter[] = [...ALERT_TYPES, 'normal', 'any']

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  reservasiPenerbangan: 'Reservasi Penerbangan',
  reservasiKapal: 'Reservasi Kapal',
  flightTracking: 'Flight Tracking',
  potensiMelebihiSla: 'Potensi Melebihi SLA',
  melewatiSla: 'Melewati SLA',
  potensiMelebihiTjph: 'Potensi Melebihi TJPH',
  melewatiTjph: 'Melewati TJPH',
  spxTjphAlert: 'SPX TJPH Alert',
  spxSlaAlert: 'SPX SLA Alert',
}
```

Note: `AlertFlags` becoming `Record<AlertType, boolean>` is shape-identical to the old interface; no consumer changes compile-wise.

- [ ] **Step 4: Run the evaluator suite**

Run: `cd apps/backend && pnpm test alert-evaluator`
Expected: PASS — all pre-existing AIR tests green (only the "all false" test needed the new key) + all new SEA tests green.

- [ ] **Step 5: Run the full backend suite (regression gate)**

Run: `cd apps/backend && pnpm test`
Expected: PASS. If `air-shipments.service.spec.ts` or `sla-export.builder.spec.ts` assert on `ALERT_TYPES` length/order or full `AlertFlags` objects, update those assertions to include `reservasiKapal` (its flag is always false for AIR rows).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/air-shipments/alert-evaluator.ts apps/backend/src/modules/air-shipments/alert-evaluator.spec.ts
git commit -m "feat(backend): profile-aware alert evaluator with reservasiKapal sea alert"
```

---

### Task 2: Migration (sea `excluded_reasons` + `sea_sla_table_name` param) and service profile resolution

**Files:**
- Create: `apps/backend/src/database/migrations/20260707000001-sea-sla-monitoring.ts`
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.ts` (constructor area, ~line 60; private helpers near `getAlertNMHours`, ~line 531)

**Interfaces:**
- Consumes: `resolveAlertProfile`, `AIR_ALERT_PROFILE`, `SEA_ALERT_PROFILE`, `AlertProfile` from Task 1.
- Produces (used by Tasks 3, 4): `private async getAlertProfileForTable(tableName: string): Promise<AlertProfile>` on `AirShipmentsService`.

- [ ] **Step 1: Write the migration**

Create `apps/backend/src/database/migrations/20260707000001-sea-sla-monitoring.ts` (pattern copied from `20260526000001-add-excluded-reasons.ts` and `20260428000002`):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm'

export class SeaSlaMonitoring20260707000001 implements MigrationInterface {
  name = 'SeaSlaMonitoring20260707000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sea table is created dynamically by the sheet sync; guard for fresh envs.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileseanonjava') THEN
          ALTER TABLE air_shipments_compileseanonjava ADD COLUMN IF NOT EXISTS excluded_reasons JSONB;
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      INSERT INTO "general_params" ("key", "label", "value")
      VALUES ('sea_sla_table_name', 'Nama Tabel Sheet SLA Laut', 'air_shipments_compileseanonjava')
      ON CONFLICT ("key") DO NOTHING
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "general_params" WHERE "key" = 'sea_sla_table_name'`)
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'air_shipments_compileseanonjava') THEN
          ALTER TABLE air_shipments_compileseanonjava DROP COLUMN IF EXISTS excluded_reasons;
        END IF;
      END $$;
    `)
  }
}
```

(Deviation from spec noted: no seed for `sea_sla_column_layout` — `getValue(key, '[]')` already defaults to an empty layout and the row is created on first save; Air's seed only existed to migrate a legacy layout.)

- [ ] **Step 2: Run the migration and verify**

Run: `cd apps/backend && pnpm migration:run`
Expected: `SeaSlaMonitoring20260707000001` executed.
Verify: `psql postgres://postgres:postgres@localhost:5432/app -c "SELECT column_name FROM information_schema.columns WHERE table_name='air_shipments_compileseanonjava' AND column_name='excluded_reasons'; SELECT key, value FROM general_params WHERE key='sea_sla_table_name';"`
Expected: one `excluded_reasons` row; one param row with value `air_shipments_compileseanonjava`.

- [ ] **Step 3: Add profile resolution to the service**

In `apps/backend/src/modules/air-shipments/air-shipments.service.ts`, extend the existing import from `./alert-evaluator` (it already imports `evaluateAlerts`, `AlertFilter`, `AlertType`, `ALERT_TYPES`, `parseDurationSafe`) to also import `AlertProfile`, `resolveAlertProfile`. Then add below `getAlertNMHours` (~line 537):

```ts
  /**
   * Resolves the alert profile (AIR vs SEA field mapping) for a dynamic table.
   * The sea table is configured via the sea_sla_table_name general param so a
   * sheet rename doesn't require a deploy.
   */
  private async getAlertProfileForTable(tableName: string): Promise<AlertProfile> {
    const seaTableName = await this.generalParamsService.getValue(
      'sea_sla_table_name',
      'air_shipments_compileseanonjava',
    )
    return resolveAlertProfile(tableName, seaTableName)
  }
```

- [ ] **Step 4: Compile + full suite**

Run: `cd apps/backend && pnpm test`
Expected: PASS (new method not yet called; compile check via ts-jest).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260707000001-sea-sla-monitoring.ts apps/backend/src/modules/air-shipments/air-shipments.service.ts
git commit -m "feat(backend): sea SLA migration (excluded_reasons + sea_sla_table_name) and profile resolution"
```

---

### Task 3: Thread the profile through overview, list, projection, VOID, OTP, and date filter

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.ts` — `findAllForTable` (68-198), `getSlaOverviewForTable` (211-440), `getRoutesForTable` (442-471), `isVoidRow` (546-549), `filterRowsByAlert` (807-827), `ALERT_PROJECTION_FIELDS`/`buildAlertProjection` (845-874), `buildDateRangeClause` (510-529), `buildTimestampExpression` (885-889), `findExcludedRows` (1763-1807)
- Test: Create `apps/backend/src/modules/air-shipments/alert-projection.spec.ts`

**Interfaces:**
- Consumes: `getAlertProfileForTable` (Task 2), `AlertProfile`/profiles (Task 1).
- Produces (used by Task 4): profile-aware signatures — `isVoidRow(row, profile)`, `filterRowsByAlert(rows, alertFilter, nHours, mHours, profile)`, `buildAlertProjection(columns, profile)`, `static alertProjectionFields(profile): string[]`, `buildDateRangeClause(columns, params, startDate, endDate, days?, useFlexibleTimestamps?)`, `buildTimestampExpression(field, columns, useFlexible?)`. Response shapes: `summary.alerts`/`routeAlerts[].alerts` are keyed by **the profile's** alert types only (7 keys for sea, 8 for air — unchanged for air).

- [ ] **Step 1: Write the failing projection test**

Create `apps/backend/src/modules/air-shipments/alert-projection.spec.ts`:

```ts
import { AirShipmentsService } from './air-shipments.service'
import { AIR_ALERT_PROFILE, SEA_ALERT_PROFILE } from './alert-evaluator'

describe('alertProjectionFields', () => {
  const fields = (profile: any) =>
    new Set<string>((AirShipmentsService as any).alertProjectionFields(profile))

  it('AIR profile projects exactly the legacy field set', () => {
    expect(fields(AIR_ALERT_PROFILE)).toEqual(
      new Set([
        'awb',
        'atd_origin',
        'sla',
        'tjph',
        'ata_flight',
        'atd_flight',
        'trackingan_smu',
        'completed_time',
        'ata_vendor_wh_destination',
        'origin',
        'destination',
        'gross_weight',
      ])
    )
  })

  it('SEA profile projects sea fields and omits SMU tracking', () => {
    expect(fields(SEA_ALERT_PROFILE)).toEqual(
      new Set([
        'actual_ship_name',
        'atd_origin',
        'sla',
        'tjph',
        'ata_sailing',
        'atd_sailing',
        'trip_completed',
        'ata_vendor_wh_destination_sertakan_link_evidence',
        'origin',
        'destination',
        'gross_weight',
      ])
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && pnpm test alert-projection`
Expected: FAIL — `alertProjectionFields` is not a function.

- [ ] **Step 3: Implement the service threading**

All edits in `air-shipments.service.ts`:

**(a) Projection.** Replace `ALERT_PROJECTION_FIELDS` + `buildAlertProjection` (lines 844-874) with:

```ts
  /** Fields read by evaluateAlerts / the summary loops regardless of profile. */
  private static readonly ALERT_PROJECTION_BASE_FIELDS = [
    'atd_origin',
    'sla',
    'tjph',
    'origin',
    'destination',
    'gross_weight',
  ] as const

  /** Every field the alert loops read for this profile. */
  private static alertProjectionFields(profile: AlertProfile): string[] {
    const fields = new Set<string>([
      ...AirShipmentsService.ALERT_PROJECTION_BASE_FIELDS,
      profile.arrivalField,
      profile.departureField,
      profile.reservationField,
      profile.completionField,
      profile.spxCompletionField,
    ])
    if (profile.useSmuTracking) fields.add('trackingan_smu')
    return [...fields]
  }

  /**
   * Narrow SELECT list for alert evaluation: only the fields the alert loops read,
   * each merged from the real column and extra_fields via buildFieldValueExpression.
   * Avoids shipping the full extra_fields JSONB for every row. Note: the aliases
   * exist as top-level keys (null when empty), so field lookups never fall through
   * to extra_fields — which is correct, since the alias already COALESCEs both sources.
   */
  private buildAlertProjection(columns: string[], profile: AlertProfile): string {
    const parts = ['id']
    if (columns.includes('excluded_reasons')) parts.push('excluded_reasons')
    for (const field of AirShipmentsService.alertProjectionFields(profile)) {
      parts.push(`${this.buildFieldValueExpression(field, columns)} AS "${field}"`)
    }
    return parts.join(', ')
  }
```

**(b) VOID check.** Replace `isVoidRow` (546-549):

```ts
  private static isVoidRow(row: Record<string, unknown>, profile: AlertProfile): boolean {
    const val = AirShipmentsService.getFieldValueFromRow(row, profile.completionField)
    return typeof val === 'string' && val.trim().toUpperCase() === 'VOID'
  }
```

**(c) Alert filter.** Replace `filterRowsByAlert` (807-827) signature and evaluator call:

```ts
  private filterRowsByAlert(
    rows: Record<string, unknown>[],
    alertFilter: AlertFilter,
    nHours: number,
    mHours: number,
    profile: AlertProfile,
  ) {
    const now = new Date()
    return rows
      .filter((row) => !AirShipmentsService.isVoidRow(row, profile))
      .filter((row) => !AirShipmentsService.isExcludedForAlert(row, alertFilter))
      .filter((row) => {
        const alerts = evaluateAlerts(row, nHours, mHours, now, profile)
        if (alertFilter === 'normal') {
          return !Object.values(alerts).some(Boolean)
        }
        if (alertFilter === 'any') {
          return Object.values(alerts).some(Boolean)
        }
        return alerts[alertFilter as AlertType]
      })
  }
```

**(d) Date filter.** Replace `buildTimestampExpression` (885-889) and `buildDateRangeClause` (510-529):

```ts
  private buildTimestampExpression(field: string, columns: string[], useFlexible = false) {
    const fieldExpr = this.buildFieldValueExpression(field, columns)
    if (useFlexible) {
      // Sea sheets store non-ISO date strings ('1-Jun-2026 22:15'); the tolerant
      // SQL parser (EXCEPTION → NULL) covers them where the ISO regex would drop rows.
      return `parse_flexible_timestamp(${fieldExpr})`
    }
    const v = `NULLIF(${fieldExpr}, '')`
    return `(CASE WHEN ${v} ~ '^\\d{4}-\\d{2}-\\d{2}([ T]\\d{1,2}:\\d{2}|$)' THEN ${v}::timestamptz END)`
  }

  private buildDateRangeClause(
    columns: string[],
    params: any[],
    startDate?: string,
    endDate?: string,
    days?: number,
    useFlexibleTimestamps = false,
  ): string | null {
    const atdOriginExpr = this.buildTimestampExpression('atd_origin', columns, useFlexibleTimestamps)
    if (startDate && endDate) {
      const clause = `(${atdOriginExpr} >= $${params.length + 1}::timestamptz AND ${atdOriginExpr} <= $${params.length + 2}::timestamptz)`
      params.push(`${startDate}T00:00:00.000Z`, `${endDate}T23:59:59.999Z`)
      return clause
    }
    if (typeof days === 'number') {
      const clause = `(${atdOriginExpr} >= NOW() - ($${params.length + 1} || ' days')::interval)`
      params.push(String(days))
      return clause
    }
    return null
  }
```

(AIR keeps the exact old expression — `useFlexibleTimestamps` defaults false everywhere it isn't threaded. Verified live: all 13,569 non-empty sea `atd_origin` values parse via `parse_flexible_timestamp`; only 5,401 match the ISO regex.)

**(e) `findAllForTable`.** After the regex guard (line 97-99) add:

```ts
    const profile = await this.getAlertProfileForTable(tableName)
    if (
      alertFilter &&
      alertFilter !== 'normal' &&
      alertFilter !== 'any' &&
      !profile.alertTypes.includes(alertFilter as AlertType)
    ) {
      throw new BadRequestException(`Alert type ${alertFilter} is not available for this table`)
    }
    const useFlexibleTs = profile.key === 'sea'
```

Change line 125 to `const dateClause = this.buildDateRangeClause(columns, params, startDate, endDate, days, useFlexibleTs)`.

Replace the lookup loading block (lines 140-146) with:

```ts
      const emptyOffload = new Map<string, { offload: boolean; hasEvidence: boolean }>()
      const [{ nHours, mHours }, slaLookup] = await Promise.all([
        this.getAlertNMHours(),
        this.getSlaLookupByOriginDest(),
      ])
      const reservasiByAwb = profile.useSmuTracking
        ? await this.getCachedReservasiTrackinganByAwb(
            await this.generalParamsService.getValue('reservasi_table_name', ''),
          )
        : new Map<string, string>()
      const offloadByAwb = profile.useSmuTracking ? await this.getCachedOffloadByAwb() : emptyOffload
```

Change line 149 projection call to `this.buildAlertProjection(columns, profile)` and line 159 to `this.filterRowsByAlert(enriched, alertFilter, nHours, mHours, profile)`. (The two `enrichRowsWithOffload`/`enrichRowsWithReservasi` wrappers can stay — with empty maps they are no-ops.)

**(f) `getSlaOverviewForTable`.** After the regex guard (212-214) add the same two lines (`profile`, `useFlexibleTs`). Replace the lookup block (216-222) with the same conditional-loading shape as (e) but keeping `this.getCachedSlaLookup()` (that is what this method uses today). Then:
- line 227: pass `useFlexibleTs` to `buildDateRangeClause`.
- line 232: `this.buildAlertProjection(columns, profile)`.
- line 250: `for (const type of profile.alertTypes) {`
- line 287: `rows.filter((row) => !AirShipmentsService.isVoidRow(row, profile))`
- line 289: `evaluateAlerts(row, nHours, mHours, now, profile)`
- line 296: `for (const type of profile.alertTypes) {`
- line 312: `for (const t of profile.alertTypes) { ... }`
- line 319: `for (const type of profile.alertTypes) {`
- line 335: `const completedTimeRaw = getFieldValue(row, profile.completionField)` (OTP)
- line 372: `for (const type of profile.alertTypes) {`
- lines 419 and 422: `profile.alertTypes.map(...)` instead of `ALERT_TYPES.map(...)`

**(g) `getRoutesForTable`** (442-471) and **`findExcludedRows`** (1763-1807): at the top of each (after the regex guard) add `const profile = await this.getAlertProfileForTable(tableName)`, and pass the flexible flag into their `buildDateRangeClause` calls: in `getRoutesForTable` line 453 → `this.buildDateRangeClause(columns, params, startDate, endDate, days, profile.key === 'sea')`; in `findExcludedRows` line 1787 → `this.buildDateRangeClause(columns, params, startDate, endDate, undefined, profile.key === 'sea')`.

- [ ] **Step 4: Run projection test + full suite**

Run: `cd apps/backend && pnpm test alert-projection && pnpm test`
Expected: PASS. Existing service tests are the AIR regression gate — if any assert on the projection SQL string, update expectations only for field *order* (the set is identical; `alertProjectionFields` emits base fields first, then air-specific ones).

- [ ] **Step 5: Smoke against live data**

With the backend running (`cd apps/backend && pnpm start:dev`), get a JWT (login via the frontend or existing scripts) and:

Run: `curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/air-shipments/air_shipments_compileseanonjava/sla-overview?startDate=2026-06-01&endDate=2026-06-30" | head -c 600`
Expected: JSON with `summary.alerts` containing exactly the 7 sea keys (`reservasiKapal`, `potensiMelebihiSla`, `melewatiSla`, `potensiMelebihiTjph`, `melewatiTjph`, `spxSlaAlert`, `spxTjphAlert`), `summary.otp`, and non-empty `routeAlerts`.

Also confirm AIR is untouched:
Run: `curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/air-shipments/air_shipments_compileaircgk/sla-overview?startDate=2026-06-01&endDate=2026-06-30" | head -c 600`
Expected: 8 air keys, no `reservasiKapal` key.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/air-shipments/air-shipments.service.ts apps/backend/src/modules/air-shipments/alert-projection.spec.ts
git commit -m "feat(backend): thread alert profile through SLA overview, list, projection and date filter"
```

---

### Task 4: Exclusion validation, per-mode column layout, profile-aware export

**Files:**
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.service.ts` — `excludeRow`/`restoreRow`/`excludeByLt`/`restoreByLt` (1655-1729), `getSlaColumnLayout`/`setSlaColumnLayout` (1734-1761), `buildSlaExportWorkbook` (1933-2050), `defaultExportColumns` (2053+)
- Modify: `apps/backend/src/modules/air-shipments/air-shipments.controller.ts` — `getSlaColumnLayout`/`setSlaColumnLayout` (232-246)

**Interfaces:**
- Consumes: `getAlertProfileForTable` (Task 2).
- Produces (used by Task 5 frontend):
  - `GET /air-shipments/sla-column-layout?mode=sea` and `PUT /air-shipments/sla-column-layout?mode=sea` — sea layout stored under general param `sea_sla_column_layout`; omitted/other `mode` → existing `sla_column_layout`.
  - Exclude/restore endpoints reject alert types not in the table's profile with 400.
  - `GET :tableName/sla-export` for the sea table produces Active Alert + Exclude sheets without the flight-tracking AWB branch.

- [ ] **Step 1: Guard exclusion mutations by profile**

In each of `excludeRow`, `restoreRow`, `excludeByLt`, `restoreByLt` (service lines 1655-1729), directly after the table-name regex guard, add:

```ts
    const profile = await this.getAlertProfileForTable(tableName)
    if (!profile.alertTypes.includes(alertType)) {
      throw new BadRequestException(`Alert type ${alertType} is not available for this table`)
    }
```

(The DTOs already accept `reservasiKapal` via `@IsIn(ALERT_TYPES)` — nothing to change there.)

- [ ] **Step 2: Per-mode column layout**

Service — replace the layout section (1731-1761):

```ts
  // ── SLA column layout (app-wide config per mode, stored in general_params) ────────

  private static slaColumnLayoutKey(mode?: string): string {
    return mode === 'sea' ? 'sea_sla_column_layout' : AirShipmentsService.SLA_COLUMN_LAYOUT_KEY
  }

  /** Reads the app-wide SLA table column layout. Returns [] (use defaults) when unset/invalid. */
  async getSlaColumnLayout(mode?: string): Promise<Array<{ key: string; visible: boolean; frozen: boolean }>> {
    const raw = await this.generalParamsService.getValue(
      AirShipmentsService.slaColumnLayoutKey(mode),
      '[]',
    )
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  /**
   * Persists the app-wide SLA column layout. Delegates to GeneralParamsService.update,
   * which emits general_params.updated → recorded in audit_logs (actor + timestamp + value).
   */
  async setSlaColumnLayout(
    layout: Array<{ key: string; visible: boolean; frozen: boolean }>,
    actorId?: string,
    mode?: string,
  ): Promise<void> {
    await this.generalParamsService.upsert(
      AirShipmentsService.slaColumnLayoutKey(mode),
      JSON.stringify(layout),
      mode === 'sea' ? 'SLA Column Layout (Sea)' : 'SLA Column Layout',
      actorId,
    )
  }
```

Controller — replace the two handlers (232-246):

```ts
  @Get('sla-column-layout')
  @UseGuards(RbacGuard)
  @Authorize(Permission.READ_SLA)
  async getSlaColumnLayout(
    @Query('mode') mode?: string
  ): Promise<{ layout: Array<{ key: string; visible: boolean; frozen: boolean }> }> {
    return { layout: await this.service.getSlaColumnLayout(mode) }
  }

  @Put('sla-column-layout')
  async setSlaColumnLayout(
    @Body() body: SlaColumnLayoutDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('mode') mode?: string
  ): Promise<{ layout: SlaColumnLayoutDto['layout'] }> {
    await this.service.setSlaColumnLayout(body.layout, user?.id, mode)
    return { layout: body.layout }
  }
```

- [ ] **Step 3: Profile-aware export**

In `buildSlaExportWorkbook` (service 1933+): after destructuring `opts`, add:

```ts
    const profile = await this.getAlertProfileForTable(tableName)
    const isFlightTracking = alertFilter === 'flightTracking' && profile.useSmuTracking
```

(replacing the existing `const isFlightTracking = alertFilter === 'flightTracking'` on line 1959 — for the sea table `flightTracking` is already rejected upstream by `findAllForTable`'s filter validation, and this keeps the AWB branch unreachable).

In `defaultExportColumns` (line 2053-2056): change signature to `private async defaultExportColumns(tableName: string, mode?: string)` and the first line to `const layout = await this.getSlaColumnLayout(mode).catch(() => [])`; change its call site (line 2004) to `await this.defaultExportColumns(tableName, profile.key)`.

Export labels need no change: `alertLabel` uses `ALERT_TYPE_LABELS`, which gained `reservasiKapal: 'Reservasi Kapal'` in Task 1.

- [ ] **Step 4: Run the full backend suite**

Run: `cd apps/backend && pnpm test`
Expected: PASS (controller spec + export builder spec keep passing; fix any assertion that hardcodes the old `getSlaColumnLayout()` zero-arg signature).

- [ ] **Step 5: Smoke the new behaviors**

With backend running and `$TOKEN` set:

```bash
# sea layout key round-trip
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"layout":[{"key":"date","visible":true,"frozen":true}]}' \
  "http://localhost:4000/api/air-shipments/sla-column-layout?mode=sea"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/air-shipments/sla-column-layout?mode=sea"
# expect the saved layout; then confirm air layout unchanged:
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/air-shipments/sla-column-layout"
# exclusion rejects air-only type on sea table (expect 400):
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"ltNumbers":["LT-X"],"alertType":"flightTracking","reason":"t"}' \
  "http://localhost:4000/api/air-shipments/air_shipments_compileseanonjava/exclude-by-lt"
# sea export downloads (expect a non-empty xlsx):
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/air-shipments/air_shipments_compileseanonjava/sla-export?startDate=2026-06-01&endDate=2026-06-30" \
  -o /tmp/sea-sla.xlsx && ls -la /tmp/sea-sla.xlsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/air-shipments/air-shipments.service.ts apps/backend/src/modules/air-shipments/air-shipments.controller.ts
git commit -m "feat(backend): profile-guarded exclusions, per-mode SLA column layout, sea-aware export"
```

---

### Task 5: Frontend — centralized mode config and mode-parameterized components

**Files:**
- Create: `apps/frontend/src/features/air-shipments/sla-mode.config.ts`
- Modify: `apps/frontend/src/features/air-shipments/components/DashboardAlertCards.tsx`
- Modify: `apps/frontend/src/features/air-shipments/components/RouteAlertTable.tsx`
- Modify: `apps/frontend/src/features/air-shipments/components/SlaPage.tsx`
- Modify: `apps/frontend/src/features/air-shipments/hooks/useAirShipments.ts` (layout fns, lines 326-335)
- Modify: `apps/frontend/src/app/(dashboard)/sla/page.tsx` (temporary: pass AIR mode so the app keeps compiling; Task 6 replaces this file)

**Interfaces:**
- Consumes: backend `?mode=` layout endpoints (Task 4); sea summary/routeAlerts keyed by the 7 sea alert keys (Task 3).
- Produces (used by Task 6):
  - `export interface SlaAlertDef { key: string; label: string; shortLabel: string; color: string; icon: ElementType }`
  - `export interface SlaMode { key: 'air' | 'sea'; pageTitle: string; tableName: string; alerts: SlaAlertDef[]; hasFlightTracking: boolean; syncSheetKey: string; syncNote: string; defaultVisibleColumns: Set<string>; frozenKeys: Array<{ key: string; width: number }> }`
  - `export const AIR_SLA_MODE: SlaMode`, `export const SEA_SLA_MODE: SlaMode`
  - `SlaPage` signature: `export function SlaPage({ mode }: { mode: SlaMode })`
  - `fetchSlaColumnLayout(mode?: 'air' | 'sea')`, `saveSlaColumnLayout(layout, mode?: 'air' | 'sea')`

- [ ] **Step 1: Create the mode config**

Create `apps/frontend/src/features/air-shipments/sla-mode.config.ts`:

```ts
import type { ElementType } from 'react'
import {
  AlertTriangle,
  Anchor,
  Clock,
  Hourglass,
  Plane,
  PlaneLanding,
  Ship,
  ShieldAlert,
  Timer,
} from 'lucide-react'
import { SLA_FROZEN_KEYS, SLA_DEFAULT_VISIBLE } from './columns.config'

/** One alert type as displayed by the SLA page (cards, dropdown, route table, badges). */
export interface SlaAlertDef {
  key: string
  label: string
  /** Compact header used by the Alerts-by-Route table. */
  shortLabel: string
  color: string
  icon: ElementType
}

/**
 * Everything that differs between the Air and Sea SLA pages. SlaPage,
 * DashboardAlertCards and RouteAlertTable all read from this single source —
 * do NOT re-declare alert keys/labels/colors in components.
 */
export interface SlaMode {
  key: 'air' | 'sea'
  pageTitle: string
  tableName: string
  alerts: SlaAlertDef[]
  /** Air only: the offloaded-AWB (Flight Tracking) tab machinery. */
  hasFlightTracking: boolean
  /** normalizeSheetIdentifier(sheet_name) emitted by the sync.completed socket event. */
  syncSheetKey: string
  syncNote: string
  defaultVisibleColumns: Set<string>
  frozenKeys: Array<{ key: string; width: number }>
}

export const AIR_SLA_MODE: SlaMode = {
  key: 'air',
  pageTitle: 'SLA Monitoring — Air',
  tableName: 'air_shipments_compileaircgk',
  alerts: [
    { key: 'reservasiPenerbangan', label: 'Flight Reservations', shortLabel: 'Flight Res.', color: '#F97316', icon: Clock },
    { key: 'flightTracking', label: 'Flight Tracking', shortLabel: 'Flight Track.', color: '#3B82F6', icon: Plane },
    { key: 'potensiMelebihiSla', label: 'Potential SLA Breach', shortLabel: 'Pot. SLA', color: '#EAB308', icon: Hourglass },
    { key: 'melewatiSla', label: 'SLA Breach', shortLabel: 'SLA Breach', color: '#EF4444', icon: AlertTriangle },
    { key: 'potensiMelebihiTjph', label: 'Potential TJPH Breach', shortLabel: 'Pot. TJPH', color: '#8B5CF6', icon: PlaneLanding },
    { key: 'melewatiTjph', label: 'TJPH Breach', shortLabel: 'TJPH Breach', color: '#DC2626', icon: ShieldAlert },
    { key: 'spxTjphAlert', label: 'SPX TJPH Alert', shortLabel: 'SPX TJPH', color: '#0D9488', icon: Timer },
    { key: 'spxSlaAlert', label: 'SPX SLA Alert', shortLabel: 'SPX SLA', color: '#0891B2', icon: ShieldAlert },
  ],
  hasFlightTracking: true,
  syncSheetKey: 'compileaircgk',
  syncNote: 'Live refresh is active for Compile Air CGK synchronization.',
  defaultVisibleColumns: SLA_DEFAULT_VISIBLE,
  frozenKeys: SLA_FROZEN_KEYS,
}

/** Order follows the product request: reservation, SLA pair, TJPH pair, SPX SLA, SPX TJPH. */
export const SEA_SLA_MODE: SlaMode = {
  key: 'sea',
  pageTitle: 'SLA Monitoring — Sea',
  tableName: 'air_shipments_compileseanonjava',
  alerts: [
    { key: 'reservasiKapal', label: 'Sea Reservation', shortLabel: 'Sea Res.', color: '#F97316', icon: Ship },
    { key: 'potensiMelebihiSla', label: 'Potential SLA Breach', shortLabel: 'Pot. SLA', color: '#EAB308', icon: Hourglass },
    { key: 'melewatiSla', label: 'SLA Breach', shortLabel: 'SLA Breach', color: '#EF4444', icon: AlertTriangle },
    { key: 'potensiMelebihiTjph', label: 'Potential TJPH Breach', shortLabel: 'Pot. TJPH', color: '#8B5CF6', icon: Anchor },
    { key: 'melewatiTjph', label: 'TJPH Breach', shortLabel: 'TJPH Breach', color: '#DC2626', icon: ShieldAlert },
    { key: 'spxSlaAlert', label: 'SPX SLA Alert', shortLabel: 'SPX SLA', color: '#0891B2', icon: ShieldAlert },
    { key: 'spxTjphAlert', label: 'SPX TJPH Alert', shortLabel: 'SPX TJPH', color: '#0D9488', icon: Timer },
  ],
  hasFlightTracking: false,
  syncSheetKey: 'compileseanonjava',
  syncNote: 'Live refresh is active for Compile Sea Non Java synchronization.',
  defaultVisibleColumns: new Set([
    'date',
    'lt_number',
    'to_number',
    'origin',
    'destination',
    'actual_ship_name',
    'atd_origin',
    'atd_sailing',
    'ata_sailing',
    'trip_completed',
    'ata_vendor_wh_destination_sertakan_link_evidence',
    'sla',
    'tjph',
    'issue',
    'remarks',
  ]),
  frozenKeys: SLA_FROZEN_KEYS,
}
```

- [ ] **Step 2: Genericize DashboardAlertCards**

In `DashboardAlertCards.tsx`:
- Change the key type (lines 21-29) to `export type DashboardAlertKey = string` (keep the export name — SlaPage imports it).
- Change `DashboardAlertSummary.alerts` (line 47) to `alerts: Record<string, AlertSummaryItem>`.
- Add to `DashboardAlertCardsProps`: `alertCards: Array<{ key: string; label: string; color: string; icon: ElementType }>` and add `alertCards` to the destructured props.
- Delete the module-level `ALERT_CARDS` const (lines 71-85) and replace its two usages in the render with the `alertCards` prop (the card grid maps over `ALERT_CARDS` — change to `alertCards`).
- Remove now-unused lucide imports if eslint flags them (the icons move to `sla-mode.config.ts`).

- [ ] **Step 3: Genericize RouteAlertTable**

In `RouteAlertTable.tsx`:
- Change `RouteAlertRow.alerts` and `.alertCounts` (lines 7-26) to `Record<string, number>`.
- `onAlertClick` type becomes `(route: string, alertKey: string) => void`.
- Add prop `cols: Array<{ key: string; label: string; color: string }>`; delete the module-level `ALERT_COLS` (lines 42-51) and replace its usages (header map + row cell map) with the `cols` prop.

- [ ] **Step 4: Parameterize SlaPage by mode**

In `SlaPage.tsx`:

1. Signature: `export function SlaPage({ mode }: { mode: SlaMode })` with `import { type SlaMode } from '../sla-mode.config'`.
2. Replace the module-level constants (lines 111-148) — delete `TABLE_NAME`, `TABLE_ENDPOINT`, `ALERT_OPTIONS`, `ALERT_TYPE_LABELS`, `ALERT_BADGE_COLORS` and derive them inside the component from `mode` (memoized):

```ts
  const TABLE_NAME = mode.tableName
  const TABLE_ENDPOINT = `/air-shipments/${TABLE_NAME}`
  const ALERT_OPTIONS = useMemo(
    () => [
      { value: null as AlertFilterOption | null, label: 'All Alerts' },
      ...mode.alerts.map((a) => ({ value: a.key as AlertFilterOption, label: a.label })),
    ],
    [mode],
  )
  const ALERT_TYPE_LABELS = useMemo(
    () => Object.fromEntries(mode.alerts.map((a) => [a.key, a.label])),
    [mode],
  )
  const LT_ALERT_TYPE_OPTIONS = useMemo(
    () => mode.alerts.map((a) => ({ value: a.key as AlertFilterOption, label: a.label })),
    [mode],
  )
  const ALERT_BADGE_COLORS = useMemo(
    () => Object.fromEntries(mode.alerts.map((a) => [a.key, a.color])),
    [mode],
  )
```

`type AlertFilterOption = DashboardAlertKey` stays (it is now `string`). Keep the old `LT_ALERT_TYPE_OPTIONS` module const deleted (line 134-136).
3. Sync effect (line 387): `if (lastCompletedSheet !== mode.syncSheetKey) return`.
4. Column config: replace `SLA_DEFAULT_VISIBLE` reads (line 464) with `mode.defaultVisibleColumns` and `SLA_FROZEN_KEYS` reads (lines 453, 460) with `mode.frozenKeys`; keep `colLabel`/`frozenColWidth` imports.
5. Layout persistence: line 427 → `void fetchSlaColumnLayout(mode.key)`; line 480 → `void saveSlaColumnLayout(columnLayout, mode.key).catch(...)`.
6. Render: line 767 → `<PageHeader title={mode.pageTitle} />`; line 781 → `syncNote={mode.syncNote}`; pass `alertCards={mode.alerts}` to `DashboardAlertCards` (line 770-785) and `cols={mode.alerts.map(({ key, shortLabel, color }) => ({ key, label: shortLabel, color }))}` to `RouteAlertTable` (line 801-807).
7. Flight-tracking paths need **no** conditional edits: `isFlightTracking = activeAlert === 'flightTracking'` (line 219) can never be true in sea mode because `'flightTracking'` is absent from `mode.alerts` (dropdown, cards, and route columns). Leave the OffloadedAwbTable/EvidenceModal wiring as is.

- [ ] **Step 5: Mode param on layout API fns**

In `useAirShipments.ts` replace lines 326-335 with:

```ts
export async function fetchSlaColumnLayout(mode: 'air' | 'sea' = 'air'): Promise<SlaColumnLayoutItem[]> {
  const qs = mode === 'sea' ? '?mode=sea' : ''
  const res = await apiClient.get<{ layout: SlaColumnLayoutItem[] }>(
    `/air-shipments/sla-column-layout${qs}`
  )
  return Array.isArray(res.data?.layout) ? res.data.layout : []
}

export async function saveSlaColumnLayout(
  layout: SlaColumnLayoutItem[],
  mode: 'air' | 'sea' = 'air'
): Promise<void> {
  const qs = mode === 'sea' ? '?mode=sea' : ''
  await apiClient.put(`/air-shipments/sla-column-layout${qs}`, { layout })
}
```

- [ ] **Step 6: Keep the existing route compiling**

In `apps/frontend/src/app/(dashboard)/sla/page.tsx` line 24: `<SlaPage mode={AIR_SLA_MODE} />` with `import { AIR_SLA_MODE } from '@/features/air-shipments/sla-mode.config'`.

- [ ] **Step 7: Type-check and verify Air UI unchanged**

Run: `cd apps/frontend && pnpm type-check`
Expected: PASS.
Then with both apps running, open `http://localhost:3000/sla` and confirm the Air page renders identically (8 cards + OTP, Alerts by Route, Active/Excluded tabs, export button).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/air-shipments/sla-mode.config.ts \
  apps/frontend/src/features/air-shipments/components/DashboardAlertCards.tsx \
  apps/frontend/src/features/air-shipments/components/RouteAlertTable.tsx \
  apps/frontend/src/features/air-shipments/components/SlaPage.tsx \
  apps/frontend/src/features/air-shipments/hooks/useAirShipments.ts \
  "apps/frontend/src/app/(dashboard)/sla/page.tsx"
git commit -m "feat(frontend): centralize SLA alert taxonomy in mode config, parameterize SlaPage by mode"
```

---

### Task 6: Routing — `/sla` layout with Air | Sea tabs

**Files:**
- Create: `apps/frontend/src/app/(dashboard)/sla/layout.tsx`
- Modify: `apps/frontend/src/app/(dashboard)/sla/page.tsx` (becomes a redirect)
- Create: `apps/frontend/src/app/(dashboard)/sla/air/page.tsx`
- Create: `apps/frontend/src/app/(dashboard)/sla/sea/page.tsx`

**Interfaces:**
- Consumes: `SlaPage({ mode })`, `AIR_SLA_MODE`, `SEA_SLA_MODE` (Task 5).
- Produces: routes `/sla` (redirects to `/sla/air`, preserving query string), `/sla/air`, `/sla/sea`. Sidebar needs no change (`href="/sla"`; `NavLink` active state already matches sub-paths).

- [ ] **Step 1: Create the layout (guard + tabs)**

`apps/frontend/src/app/(dashboard)/sla/layout.tsx` (guard moved here from the old page; tab strip mirrors `air-shipments/layout.tsx` lines 77-95):

```tsx
'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth.context'
import { usePermissions } from '@/shared/hooks/use-permissions'

const TABS = [
  { href: '/sla/air', label: 'Air' },
  { href: '/sla/sea', label: 'Sea' },
]

export default function SlaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && user && !hasPermission('read.sla')) {
      router.replace('/dashboard')
    }
  }, [loading, user, hasPermission, router])

  if (loading || !user) return null
  if (!hasPermission('read.sla')) return null

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-1 border-b">
        {TABS.map(({ href, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Redirect `/sla` → `/sla/air`**

Replace the full contents of `apps/frontend/src/app/(dashboard)/sla/page.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** Old bookmarks land here; forward filters (?alert=…&route=…) to the Air tab. */
export default function SlaIndexRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    router.replace(qs ? `/sla/air?${qs}` : '/sla/air')
  }, [router, searchParams])

  return null
}
```

- [ ] **Step 3: Create the Air and Sea pages**

`apps/frontend/src/app/(dashboard)/sla/air/page.tsx`:

```tsx
'use client'
import { Suspense } from 'react'
import { SlaPage } from '@/features/air-shipments/components/SlaPage'
import { AIR_SLA_MODE } from '@/features/air-shipments/sla-mode.config'

export default function SlaAirRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading...</div>}>
      <SlaPage mode={AIR_SLA_MODE} />
    </Suspense>
  )
}
```

`apps/frontend/src/app/(dashboard)/sla/sea/page.tsx`:

```tsx
'use client'
import { Suspense } from 'react'
import { SlaPage } from '@/features/air-shipments/components/SlaPage'
import { SEA_SLA_MODE } from '@/features/air-shipments/sla-mode.config'

export default function SlaSeaRoute() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading...</div>}>
      <SlaPage mode={SEA_SLA_MODE} />
    </Suspense>
  )
}
```

Note: `page.tsx` no longer imports `useAuth`/`usePermissions`/`SlaPage` — the layout guards; the tab pages render. `Suspense` is required because `SlaPage` calls `useSearchParams`.

- [ ] **Step 4: Type-check + manual navigation check**

Run: `cd apps/frontend && pnpm type-check`
Expected: PASS.
Manual: visit `/sla` → lands on `/sla/air` with Air | Sea tabs; `/sla?alert=melewatiSla` → forwards the filter; click Sea → `/sla/sea` renders 7 cards + OTP; sidebar "SLA Monitoring" stays highlighted on both tabs; a user without `read.sla` is redirected to `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/src/app/(dashboard)/sla/layout.tsx" \
  "apps/frontend/src/app/(dashboard)/sla/page.tsx" \
  "apps/frontend/src/app/(dashboard)/sla/air/page.tsx" \
  "apps/frontend/src/app/(dashboard)/sla/sea/page.tsx"
git commit -m "feat(frontend): split SLA monitoring into Air and Sea tabs at /sla/air and /sla/sea"
```

---

### Task 7: End-to-end verification and reconciliation

**Files:** none created (verification only; fix-forward commits allowed).

- [ ] **Step 1: Full automated gates**

```bash
cd apps/backend && pnpm test && pnpm lint
cd ../frontend && pnpm type-check && pnpm lint
```
Expected: all PASS.

- [ ] **Step 2: Reconcile Sea Reservation count against SQL**

Open `/sla/sea`, set the date range to `2026-06-01` → `2026-06-30`, select the "Sea Reservation" alert in the dropdown, note the table's `total` in the pagination meta. Compare with (n = the `n_hours` general param, default 5):

```sql
SELECT count(*)
FROM air_shipments_compileseanonjava
WHERE parse_flexible_timestamp(extra_fields->>'atd_origin') BETWEEN '2026-06-01T00:00:00Z' AND '2026-06-30T23:59:59Z'
  AND NULLIF(TRIM(extra_fields->>'actual_ship_name'), '') IS NULL
  AND NULLIF(TRIM(extra_fields->>'ata_vendor_wh_destination_sertakan_link_evidence'), '') IS NULL
  AND NULLIF(TRIM(extra_fields->>'atd_sailing'), '') IS NULL
  AND NULLIF(TRIM(extra_fields->>'ata_sailing'), '') IS NULL
  AND now() > parse_flexible_timestamp(extra_fields->>'atd_origin') + interval '5 hours'
  AND (excluded_reasons IS NULL OR NOT excluded_reasons ? 'reservasiKapal');
```

Expected: matches the UI total (small deviations only if `n_hours` ≠ 5 or rows are VOID).

- [ ] **Step 3: Exercise the full Sea feature surface**

On `/sla/sea`: click an alert card → route breakdown expands → clicking a route filters the table; "Alerts by Route" cell click filters; exclude a row with a reason → it moves to the Excluded tab → restore it; Exclude LT / Restore LT round-trip; batch date-count popover shows a count; column config hide/show/pin persists across reload (and does NOT affect `/sla/air`'s layout); Export Excel downloads with Active Alert + Exclude sheets; OTP card shows a percentage. Then on `/sla/air`: spot-check cards/table/export still behave exactly as before.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address issues found during sea SLA end-to-end verification"
```
(Skip if nothing changed.)

---

## Plan Self-Review (completed)

- **Spec coverage:** profile evaluator + 7 sea alerts (Task 1), threshold enrichment reuse — unchanged code path (Task 3e/f keep `enrichRowsWithSlaLookup`), sea reservation guards (Task 1), potential = `ata_sailing + m` (Task 1), SPX = `trip_completed` (Task 1), OTP with sea completion (Task 3f), VOID (Task 3b), exclusions incl. by-LT (Tasks 2, 4), per-mode column layout (Tasks 4, 5), profile-aware export (Task 4), tab navigation + redirect (Task 6), `read.sla` on both (Task 6 layout), socket refresh key (Task 5), n/m shared (no change needed). Addition beyond spec (justified by live-data check): flexible date filter for sea (Task 3d) — without it ~60% of sea rows fall out of any date-filtered view.
- **Deviations from spec:** no `sea_sla_column_layout` seed migration (documented in Task 2); backend label `'Reservasi Kapal'` for exports vs frontend `'Sea Reservation'` (matches existing air precedent).
- **Type consistency:** `AlertProfile`/`resolveAlertProfile` (Task 1) match uses in Tasks 2-4; `SlaMode`/`SlaAlertDef` (Task 5) match Task 6 imports; `fetchSlaColumnLayout(mode)` signature consistent across Tasks 4/5.
