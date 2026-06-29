import { Injectable, Logger, Optional, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, DataSource } from 'typeorm'
import { SheetsService } from './sheets.service'
import { DynamicTableService } from './dynamic-table.service'
import { SyncNotificationGateway } from './sync-notification.gateway'
import { ChunkError, RowError, SheetResult } from './sheet-config.interface'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { GoogleSheetSheetConfig } from './entities/google-sheet-sheet-config.entity'
import { GoogleSheetConfigDto } from './dto/google-sheet-config.dto'
import { AlertType, AlertFilter, ALERT_TYPES, evaluateAlerts, parseDurationSafe } from './alert-evaluator'
import { ExcludedQueryDto } from './dto/excluded-query.dto'
import { OffloadedAwbQueryDto } from './dto/tracking-smu.dto'
import {
  buildSlaWorkbook,
  mapActiveRows,
  mapAwbRows,
  expandExcludedRows,
  alertLabel,
  colLabel,
  AWB_HEADERS,
  EXCLUDE_HEADERS,
  SlaSheetSpec,
} from './sla-export.builder'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { GeneralParamsService } from '../general-params/general-params.service'

/** System-managed columns that are never diff-compared against sheet data */
const SYSTEM_COLUMNS = new Set(['id', 'is_locked', 'last_synced_at', 'created_at', 'updated_at'])

@Injectable()
export class AirShipmentsService {
  private readonly logger = new Logger(AirShipmentsService.name)
  private readonly repoMap: Map<string, Repository<any>>

  /** TTL fallback for lookup caches — covers manual DB edits and multi-instance deployments */
  private static readonly LOOKUP_CACHE_TTL_MS = 5 * 60_000
  private readonly lookupCache = new Map<string, { promise: Promise<unknown>; loadedAt: number }>()

  /** Tracking_SMU flight-offload source (drives the Flight Tracking alert). */
  private static readonly TRACKING_SMU_TABLE = 'air_shipments_tracking_smu'
  private static readonly OFFLOAD_CACHE_KEY = 'tracking_smu:offload'
  /** Airline-API offload source (overrides the sheet for configured carriers). */
  private static readonly AIRLINE_TRACKING_TABLE = 'air_shipments_awb_flight_tracking'
  private static readonly API_CARRIERS_CACHE_KEY = 'airline:carriers'
  /** general_params key holding the single app-wide SLA table column layout. */
  private static readonly SLA_COLUMN_LAYOUT_KEY = 'sla_column_layout'

  constructor(
    private readonly sheetsService: SheetsService,
    @Optional() private readonly gateway: SyncNotificationGateway | null,
    @InjectRepository(GoogleSheetConfig)
    private readonly googleSheetConfigRepo: Repository<GoogleSheetConfig>,
    @InjectRepository(GoogleSheetSheetConfig)
    private readonly googleSheetSheetConfigRepo: Repository<GoogleSheetSheetConfig>,
    private readonly dynamicTableService: DynamicTableService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly generalParamsService: GeneralParamsService,
  ) {}

  /**
   * Paginated read for dynamic air_shipment_* tables.
   * Allows basic paging and sorting. Validates table name to prevent SQL injection.
   */
  async findAllForTable(
    tableName: string,
    {
      page = 1,
      limit = 50,
      sortBy = 'id',
      sortOrder = 'asc',
      search,
      alertFilter,
      routeFilter,
      days,
      startDate,
      endDate,
      unbounded = false,
    }: {
      page: number
      limit: number
      sortBy: string
      sortOrder: 'asc' | 'desc'
      search?: string
      alertFilter?: AlertFilter
      routeFilter?: string | string[]
      days?: number
      startDate?: string
      endDate?: string
      /** Export mode: return every matching row (no LIMIT/OFFSET). */
      unbounded?: boolean
    }
  ) {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    const columns = await this.getTableColumns(tableName)
    const safeSortBy = columns.includes(sortBy) ? sortBy : 'id'
    const offset = (page - 1) * limit

    const whereClauses: string[] = []
    const params: any[] = []

    if (search && String(search).trim()) {
      const s = `%${String(search).trim()}%`
      const textCols = columns
        .filter(
          (c) => c !== 'extra_fields' && c !== 'id' && c !== 'is_locked' && c !== 'last_synced_at'
        )
        .slice(0, 5)
      const orConds = textCols.map((c, idx) => `${c}::text ILIKE $${params.length + idx + 1}`)
      params.push(...textCols.map(() => s))
      orConds.push(`extra_fields::text ILIKE $${params.length + 1}`)
      params.push(s)
      whereClauses.push(`(${orConds.join(' OR ')})`)
    }

    const routeClause = this.buildRouteFilterClause(routeFilter, columns, params)
    if (routeClause) whereClauses.push(routeClause)

    const dateClause = this.buildDateRangeClause(columns, params, startDate, endDate, days)
    if (dateClause) whereClauses.push(dateClause)

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const isJsonbSort = !columns.includes(sortBy)
    let orderBySql = isJsonbSort
      ? `ORDER BY extra_fields->>'${sortBy}' ${sortOrder.toUpperCase()}`
      : `ORDER BY "${safeSortBy}" ${sortOrder.toUpperCase()}`

    if (isJsonbSort && sortBy.toLowerCase().includes('date')) {
      const v = `NULLIF(extra_fields->>'${sortBy}', '')`
      orderBySql = `ORDER BY (CASE WHEN ${v} ~ '^\\d{4}-\\d{2}-\\d{2}([ T]\\d{1,2}:\\d{2}|$)' THEN ${v}::timestamp END) ${sortOrder.toUpperCase()}`
    }

    if (alertFilter) {
      const [{ nHours, mHours }, reservasiTableName, slaLookup, offloadByAwb] = await Promise.all([
        this.getAlertNMHours(),
        this.generalParamsService.getValue('reservasi_table_name', ''),
        this.getSlaLookupByOriginDest(),
        this.getCachedOffloadByAwb(),
      ])
      const reservasiByAwb = await this.getCachedReservasiTrackinganByAwb(reservasiTableName)
      // Phase 1: narrow scan (no extra_fields) to decide which rows match the alert filter
      const projectedRows: Record<string, unknown>[] = await this.dataSource.query(
        `SELECT ${this.buildAlertProjection(columns)} FROM "${tableName}" ${whereSql} ${orderBySql}`,
        params
      )
      const enriched = this.enrichRowsWithOffload(
        this.enrichRowsWithReservasi(
          this.enrichRowsWithSlaLookup(projectedRows, slaLookup),
          reservasiByAwb,
        ),
        offloadByAwb,
      )
      const filteredRows = this.filterRowsByAlert(enriched, alertFilter, nHours, mHours)
      const total = filteredRows.length
      // Export mode takes every matched row; the paginated UI takes a page slice.
      const pageIds = (unbounded ? filteredRows : filteredRows.slice(offset, offset + limit)).map(
        (row) => row.id
      )
      // Phase 2: fetch full rows (incl. extra_fields) for the current page only
      let data: Record<string, unknown>[] = []
      if (pageIds.length > 0) {
        const fullRows: Record<string, unknown>[] = await this.dataSource.query(
          `SELECT * FROM "${tableName}" WHERE id = ANY($1)`,
          [pageIds]
        )
        const orderIndex = new Map(pageIds.map((id, i) => [id, i]))
        fullRows.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
        data = this.enrichRowsWithOffload(
          this.enrichRowsWithReservasi(
            this.enrichRowsWithSlaLookup(fullRows, slaLookup),
            reservasiByAwb,
          ),
          offloadByAwb,
        )
      }
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    }

    const rows = await this.dataSource.query(
      `SELECT * FROM "${tableName}" ${whereSql} ${orderBySql}` +
        (unbounded ? '' : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`),
      unbounded ? params : [...params, limit, offset]
    )

    const countRes = await this.dataSource.query(
      `SELECT count(*)::int FROM "${tableName}" ${whereSql}`,
      params
    )
    const total = countRes?.[0]?.count ?? 0

    return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  /** Thin delegate kept for the Dashboard / AlertPieChart consumers. */
  async getAlertSummaryForTable(tableName: string, startDate?: string, endDate?: string, days?: number) {
    const { summary } = await this.getSlaOverviewForTable(tableName, startDate, endDate, days)
    return summary
  }

  /**
   * Computes everything the SLA page needs in a single table scan:
   * the alert summary (incl. OTP), the distinct route list, and the
   * per-route alert/OTP breakdown.
   */
  async getSlaOverviewForTable(tableName: string, startDate?: string, endDate?: string, days?: number) {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    const [{ nHours, mHours }, reservasiTableName, slaLookup, offloadByAwb] = await Promise.all([
      this.getAlertNMHours(),
      this.generalParamsService.getValue('reservasi_table_name', ''),
      this.getCachedSlaLookup(),
      this.getCachedOffloadByAwb(),
    ])
    const reservasiByAwb = await this.getCachedReservasiTrackinganByAwb(reservasiTableName)
    const columns = await this.getTableColumns(tableName)
    const whereClauses: string[] = []
    const params: any[] = []

    const dateClause = this.buildDateRangeClause(columns, params, startDate, endDate, days)
    if (dateClause) whereClauses.push(dateClause)

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const rawRows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT ${this.buildAlertProjection(columns)} FROM "${tableName}" ${whereSql}`,
      params
    )
    const rows = this.enrichRowsWithOffload(
      this.enrichRowsWithReservasi(
        this.enrichRowsWithSlaLookup(rawRows, slaLookup),
        reservasiByAwb,
      ),
      offloadByAwb,
    )

    interface AlertSummaryItem {
      routes: number
      tonnage: number
      breakdown: Map<string, number>
    }

    const acc: Record<AlertType, AlertSummaryItem> = {} as any
    for (const type of ALERT_TYPES) {
      acc[type] = { routes: 0, tonnage: 0, breakdown: new Map() }
    }

    const getFieldValue = AirShipmentsService.getFieldValueFromRow

    // OTP accumulators: onTime/late weight per route for completed shipments
    interface OtpRouteItem { onTime: number; late: number }
    const otpByRoute = new Map<string, OtpRouteItem>()
    let otpOnTimeTotal = 0
    let otpLateTotal = 0
    const now = new Date()

    // Per-route accumulators (route-alert-summary shape)
    interface RouteAlertItem {
      totalTonnage: number
      totalCount: number
      alerts: Record<AlertType, number>
      alertCounts: Record<AlertType, number>
      otpOnTime: number
      otpOnTimeCount: number
      otpLate: number
      otpLateCount: number
    }
    const byRoute = new Map<string, RouteAlertItem>()

    // Distinct route list — collected from ALL rows (no void filter), matching
    // the SELECT DISTINCT semantics of getRoutesForTable
    const routesByLabel = new Map<string, { label: string; origin: string; destination: string }>()
    for (const row of rows) {
      const origin = String(getFieldValue(row, 'origin') ?? '').trim()
      const destination = String(getFieldValue(row, 'destination') ?? '').trim()
      if (!origin || !destination) continue
      const label = `${origin} - ${destination}`
      if (!routesByLabel.has(label)) routesByLabel.set(label, { label, origin, destination })
    }

    const alertRows = rows.filter((row) => !AirShipmentsService.isVoidRow(row))
    for (const row of alertRows) {
      const alerts = evaluateAlerts(row, nHours, mHours, now)
      const origin = String(getFieldValue(row, 'origin') ?? '').trim()
      const destination = String(getFieldValue(row, 'destination') ?? '').trim()
      const route = origin && destination ? `${origin} - ${destination}` : ''
      const grossWeight = parseFloat(String(getFieldValue(row, 'gross_weight') ?? '0')) || 0

      const excludedReasons = row.excluded_reasons as Record<string, string> | null
      for (const type of ALERT_TYPES) {
        if (!alerts[type]) continue
        if (excludedReasons?.[type]) continue  // skip if excluded for this specific type
        const item = acc[type]
        const prev = item.breakdown.get(route) ?? 0
        item.breakdown.set(route, prev + grossWeight)
        item.tonnage += grossWeight
      }

      // Per-route accumulation (route-alert-summary semantics: no exclusion check)
      let routeItem: RouteAlertItem | null = null
      if (origin && destination) {
        let existing = byRoute.get(route)
        if (!existing) {
          const emptyAlerts = {} as Record<AlertType, number>
          const emptyCounts = {} as Record<AlertType, number>
          for (const t of ALERT_TYPES) { emptyAlerts[t] = 0; emptyCounts[t] = 0 }
          existing = { totalTonnage: 0, totalCount: 0, alerts: emptyAlerts, alertCounts: emptyCounts, otpOnTime: 0, otpOnTimeCount: 0, otpLate: 0, otpLateCount: 0 }
          byRoute.set(route, existing)
        }
        routeItem = existing
        routeItem.totalTonnage += grossWeight
        routeItem.totalCount += 1
        for (const type of ALERT_TYPES) {
          if (alerts[type]) {
            routeItem.alerts[type] += grossWeight
            routeItem.alertCounts[type] += 1
          }
        }
      }

      // OTP: requires atd_origin + sla to be parseable; skip if not
      const atdOriginRaw = getFieldValue(row, 'atd_origin')
      const slaRaw = getFieldValue(row, 'sla')
      const slaDuration = parseDurationSafe(slaRaw)
      if (atdOriginRaw && slaDuration !== null) {
        const atdOrigin = new Date(String(atdOriginRaw))
        const maxSla = new Date(atdOrigin.getTime() + slaDuration)
        if (!isNaN(atdOrigin.getTime()) && !isNaN(maxSla.getTime())) {
          const completedTimeRaw = getFieldValue(row, 'ata_vendor_wh_destination')
          const completedTimeStr = completedTimeRaw != null ? String(completedTimeRaw).trim() : ''
          let isOnTime: boolean | null = null
          if (completedTimeStr !== '') {
            const completedTime = new Date(completedTimeStr)
            if (!isNaN(completedTime.getTime())) {
              isOnTime = completedTime <= maxSla
            }
          } else if (now > maxSla) {
            isOnTime = false
          }

          if (isOnTime !== null) {
            const prev = otpByRoute.get(route) ?? { onTime: 0, late: 0 }
            if (isOnTime) {
              prev.onTime += grossWeight
              otpOnTimeTotal += grossWeight
            } else {
              prev.late += grossWeight
              otpLateTotal += grossWeight
            }
            otpByRoute.set(route, prev)
            if (routeItem) {
              if (isOnTime) {
                routeItem.otpOnTime += grossWeight
                routeItem.otpOnTimeCount += 1
              } else {
                routeItem.otpLate += grossWeight
                routeItem.otpLateCount += 1
              }
            }
          }
        }
      }
    }

    const alerts: Record<AlertType, { routes: number; tonnage: number; breakdown: Array<{ route: string; tonnage: number }> }> = {} as any
    for (const type of ALERT_TYPES) {
      const item = acc[type]
      const breakdown = Array.from(item.breakdown.entries())
        .map(([route, tonnage]) => ({ route, tonnage: Math.round(tonnage * 100) / 100 }))
        .sort((a, b) => a.route.localeCompare(b.route))
      alerts[type] = {
        routes: item.breakdown.size,
        tonnage: Math.round(item.tonnage * 100) / 100,
        breakdown,
      }
    }

    const completedTotal = otpOnTimeTotal + otpLateTotal
    const otpPercentage =
      completedTotal > 0 ? Math.round((otpOnTimeTotal / completedTotal) * 10000) / 100 : 0

    const otpBreakdown = Array.from(otpByRoute.entries())
      .map(([route, { onTime, late }]) => {
        const total = onTime + late
        return {
          route,
          percentage: total > 0 ? Math.round((onTime / total) * 10000) / 100 : 0,
          onTimeWeight: Math.round(onTime * 100) / 100,
          lateWeight: Math.round(late * 100) / 100,
        }
      })
      .sort((a, b) => a.route.localeCompare(b.route))

    const otp = {
      percentage: otpPercentage,
      onTimeWeight: Math.round(otpOnTimeTotal * 100) / 100,
      lateWeight: Math.round(otpLateTotal * 100) / 100,
      breakdown: otpBreakdown,
    }

    const routes = Array.from(routesByLabel.values()).sort(
      (a, b) => a.origin.localeCompare(b.origin) || a.destination.localeCompare(b.destination)
    )

    const routeAlerts = Array.from(byRoute.entries())
      .map(([route, item]) => {
        const otpTotal = item.otpOnTime + item.otpLate
        return {
          route,
          totalTonnage: Math.round(item.totalTonnage * 100) / 100,
          totalCount: item.totalCount,
          alerts: Object.fromEntries(
            ALERT_TYPES.map((t) => [t, Math.round(item.alerts[t] * 100) / 100])
          ) as Record<AlertType, number>,
          alertCounts: Object.fromEntries(
            ALERT_TYPES.map((t) => [t, item.alertCounts[t]])
          ) as Record<AlertType, number>,
          otp: {
            percentage: otpTotal > 0 ? Math.round((item.otpOnTime / otpTotal) * 10000) / 100 : null,
            onTimeWeight: Math.round(item.otpOnTime * 100) / 100,
            onTimeCount: item.otpOnTimeCount,
            lateWeight: Math.round(item.otpLate * 100) / 100,
            lateCount: item.otpLateCount,
          },
        }
      })
      .sort((a, b) => a.route.localeCompare(b.route))

    return {
      summary: { nHours, mHours, alerts, otp },
      routes: { routes },
      routeAlerts,
    }
  }

  async getRoutesForTable(tableName: string, startDate?: string, endDate?: string, days?: number) {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    const columns = await this.getTableColumns(tableName)
    const originExpr = this.buildFieldValueExpression('origin', columns)
    const destinationExpr = this.buildFieldValueExpression('destination', columns)

    const whereClauses: string[] = []
    const params: any[] = []
    const dateClause = this.buildDateRangeClause(columns, params, startDate, endDate, days)
    if (dateClause) whereClauses.push(dateClause)

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const rows: { origin: string; destination: string }[] = await this.dataSource.query(
      `SELECT DISTINCT ${originExpr} AS origin, ${destinationExpr} AS destination FROM "${tableName}" ${whereSql} ORDER BY origin, destination`,
      params
    )

    return {
      routes: rows
        .filter((row) => row.origin && row.destination)
        .map((row) => ({
          label: `${row.origin} - ${row.destination}`,
          origin: row.origin,
          destination: row.destination,
        })),
    }
  }

  /** Thin delegate kept for the standalone route-alert-summary endpoint. */
  async getRouteAlertSummary(tableName: string, startDate?: string, endDate?: string, days?: number) {
    const { routeAlerts } = await this.getSlaOverviewForTable(tableName, startDate, endDate, days)
    return routeAlerts
  }

  /**
   * Builds a WHERE clause matching any of the given "ORIGIN - DESTINATION" route
   * labels (OR-combined). Accepts a single label or an array; returns null when no
   * valid route is supplied. Appends bind params onto `params`.
   */
  private buildRouteFilterClause(
    routeFilter: string | string[] | undefined,
    columns: string[],
    params: any[],
  ): string | null {
    if (!routeFilter) return null
    const labels = (Array.isArray(routeFilter) ? routeFilter : [routeFilter])
      .map((r) => String(r).trim())
      .filter(Boolean)
    if (labels.length === 0) return null

    const originExpr = this.buildFieldValueExpression('origin', columns)
    const destinationExpr = this.buildFieldValueExpression('destination', columns)
    const orClauses: string[] = []
    for (const label of labels) {
      const parts = label.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean)
      if (parts.length !== 2) continue
      const [origin, destination] = parts
      orClauses.push(
        `(LOWER(${originExpr}) = LOWER($${params.length + 1}) AND LOWER(${destinationExpr}) = LOWER($${params.length + 2}))`,
      )
      params.push(origin, destination)
    }
    return orClauses.length > 0 ? `(${orClauses.join(' OR ')})` : null
  }

  private buildDateRangeClause(
    columns: string[],
    params: any[],
    startDate?: string,
    endDate?: string,
    days?: number,
  ): string | null {
    const atdOriginExpr = this.buildTimestampExpression('atd_origin', columns)
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

  private async getAlertNMHours(): Promise<{ nHours: number; mHours: number }> {
    const [n, m] = await Promise.all([
      this.generalParamsService.getValue('n_hours', '5'),
      this.generalParamsService.getValue('m_hours', '5'),
    ])
    return { nHours: parseFloat(n), mHours: parseFloat(m) }
  }

  private static getFieldValueFromRow(row: Record<string, unknown>, key: string): unknown {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key]
    const extra = row.extra_fields
    if (extra && typeof extra === 'object') return (extra as Record<string, unknown>)[key]
    return undefined
  }

  private static isVoidRow(row: Record<string, unknown>): boolean {
    const val = AirShipmentsService.getFieldValueFromRow(row, 'ata_vendor_wh_destination')
    return typeof val === 'string' && val.trim().toUpperCase() === 'VOID'
  }

  private static isExcludedForAlert(
    row: Record<string, unknown>,
    alertFilter: AlertFilter,
  ): boolean {
    if (alertFilter === 'normal' || alertFilter === 'any') return false
    const excluded = row.excluded_reasons as Record<string, string> | null
    return Boolean(excluded?.[alertFilter])
  }

  /**
   * Returns a cached promise for `key`, invoking `loader` only when the entry is
   * missing or older than LOOKUP_CACHE_TTL_MS. The promise is stored synchronously,
   * so concurrent callers (e.g. the SLA page's parallel requests) share one load.
   * Failed loads are evicted so the next call retries.
   */
  private loadCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const entry = this.lookupCache.get(key)
    if (entry && Date.now() - entry.loadedAt <= AirShipmentsService.LOOKUP_CACHE_TTL_MS) {
      return entry.promise as Promise<T>
    }
    const promise = loader()
    this.lookupCache.set(key, { promise, loadedAt: Date.now() })
    promise.catch(() => {
      if (this.lookupCache.get(key)?.promise === promise) this.lookupCache.delete(key)
    })
    return promise
  }

  /** Evicts lookup caches whose source tables were touched by a sync cycle. */
  private invalidateLookupCaches(affectedTables: string[]): void {
    if (affectedTables.includes('air_shipments_data')) {
      this.lookupCache.delete('sla:air_shipments_data')
    }
    if (affectedTables.includes(AirShipmentsService.TRACKING_SMU_TABLE)) {
      this.lookupCache.delete(AirShipmentsService.OFFLOAD_CACHE_KEY)
    }
    for (const table of affectedTables) {
      this.lookupCache.delete(`reservasi:${table}`)
    }
  }

  private getCachedSlaLookup(): Promise<Map<string, { sla: string | null; tjph: string | null }>> {
    return this.loadCached('sla:air_shipments_data', () => this.getSlaLookupByOriginDest())
  }

  private getCachedReservasiTrackinganByAwb(reservasiTableName: string): Promise<Map<string, string>> {
    return this.loadCached(`reservasi:${reservasiTableName}`, () =>
      this.getReservasiTrackinganByAwb(reservasiTableName)
    )
  }

  /**
   * Loads {awb → trackingan_smu} from the Reservasi sheet table.
   * Returns an empty Map when the table name is blank or the table doesn't exist.
   */
  private async getReservasiTrackinganByAwb(reservasiTableName: string): Promise<Map<string, string>> {
    if (!reservasiTableName?.trim() || !/^air_shipments_[a-z0-9_]+$/.test(reservasiTableName)) {
      return new Map()
    }
    const exists: { exists: boolean }[] = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [reservasiTableName]
    )
    if (!exists[0]?.exists) return new Map()

    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT * FROM "${reservasiTableName}"`
    )
    const map = new Map<string, string>()
    for (const row of rows) {
      const awb = AirShipmentsService.getFieldValueFromRow(row, 'awb')
      const smu = AirShipmentsService.getFieldValueFromRow(row, 'trackingan_smu')
      if (awb) map.set(String(awb).trim(), String(smu ?? '').trim())
    }
    return map
  }

  private getCachedOffloadByAwb(): Promise<Map<string, { offload: boolean; hasEvidence: boolean }>> {
    return this.loadCached(AirShipmentsService.OFFLOAD_CACHE_KEY, () => this.getOffloadByAwb())
  }

  /**
   * Loads { awb → { offload, hasEvidence } } from air_shipments_tracking_smu.
   * `offload_status` is the computed flight-offload flag; `evidence` is the
   * user-supplied justification link. Returns an empty Map when the table is absent.
   */
  private async getOffloadByAwb(): Promise<Map<string, { offload: boolean; hasEvidence: boolean }>> {
    const tableName = AirShipmentsService.TRACKING_SMU_TABLE
    const exists: { exists: boolean }[] = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [tableName]
    )
    if (!exists[0]?.exists) return new Map()

    // Carriers whose offload is API-driven: the sheet's offload_status is ignored for
    // them (their offload comes solely from the airline-API overlay below).
    const apiCarriers = new Set(await this.getEnabledApiCarrierCodes())

    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT awb, offload_status, evidence FROM "${tableName}"`
    )
    const map = new Map<string, { offload: boolean; hasEvidence: boolean }>()
    for (const row of rows) {
      const awb = AirShipmentsService.getFieldValueFromRow(row, 'awb')
      if (!awb) continue
      const key = String(awb).trim()
      const carrier = key.split('-')[0]
      const status = String(AirShipmentsService.getFieldValueFromRow(row, 'offload_status') ?? '')
        .trim()
        .toLowerCase()
      const evidence = AirShipmentsService.getFieldValueFromRow(row, 'evidence')
      map.set(key, {
        offload: !apiCarriers.has(carrier) && status === 'offload',
        hasEvidence: evidence != null && String(evidence).trim() !== '',
      })
    }

    // Overlay airline-API offload: authoritative for configured carriers (126/888/778).
    // Keeps hasEvidence from the sheet/evidence row; adds API-only AWBs with no evidence.
    try {
      const apiRows: { awb: string; offload: boolean }[] = await this.dataSource.query(
        `SELECT awb, offload FROM "${AirShipmentsService.AIRLINE_TRACKING_TABLE}"`
      )
      for (const r of apiRows) {
        if (!r.awb) continue
        const key = String(r.awb).trim()
        map.set(key, { offload: r.offload === true, hasEvidence: map.get(key)?.hasEvidence ?? false })
      }
    } catch {
      // Airline tracking table absent (pre-migration) — sheet offload only.
    }
    return map
  }

  /** Public hook: lets the airline-tracking job refresh the offload alert after a fetch cycle. */
  evictOffloadCache(): void {
    this.lookupCache.delete(AirShipmentsService.OFFLOAD_CACHE_KEY)
    this.lookupCache.delete(AirShipmentsService.API_CARRIERS_CACHE_KEY)
  }

  /** Enabled carrier codes whose offload is API-driven (so the sheet list can exclude them). */
  private getEnabledApiCarrierCodes(): Promise<string[]> {
    return this.loadCached(AirShipmentsService.API_CARRIERS_CACHE_KEY, async () => {
      try {
        const rows: { carrier_code: string }[] = await this.dataSource.query(
          `SELECT carrier_code FROM airline_tracking_source WHERE enabled = true`
        )
        return rows.map((r) => String(r.carrier_code))
      } catch {
        return []
      }
    })
  }

  /**
   * Loads { "origin|destination" → {sla, tjph} } from air_shipments_data.
   * Matches on extra_fields.origin_dc / extra_fields.destination_dc.
   * Returns empty Map when table doesn't exist.
   */
  private async getSlaLookupByOriginDest(): Promise<Map<string, { sla: string | null; tjph: string | null }>> {
    const tableName = 'air_shipments_data'
    const exists: { exists: boolean }[] = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [tableName]
    )
    if (!exists[0]?.exists) return new Map()

    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT * FROM "${tableName}"`
    )
    const map = new Map<string, { sla: string | null; tjph: string | null }>()
    for (const row of rows) {
      const originDc = AirShipmentsService.getFieldValueFromRow(row, 'origin_dc')
      const destDc = AirShipmentsService.getFieldValueFromRow(row, 'destination_dc')
      if (!originDc || !destDc) continue
      const key = `${String(originDc).trim().toLowerCase()}|${String(destDc).trim().toLowerCase()}`
      const sla = AirShipmentsService.getFieldValueFromRow(row, 'sla')
      const lostTreshold = AirShipmentsService.getFieldValueFromRow(row, 'lost_treshold')
      map.set(key, {
        sla: sla != null ? String(sla) : null,
        tjph: lostTreshold != null ? String(lostTreshold) : null,
      })
    }
    return map
  }

  /**
   * Injects sla/tjph from air_shipments_data into each row at the top level.
   * Top-level keys take precedence in getFieldValue, overriding existing sla/tjph.
   * Mutates the rows in place — callers must own the row objects (all callers
   * pass arrays fresh from dataSource.query).
   */
  private enrichRowsWithSlaLookup(
    rows: Record<string, unknown>[],
    slaLookup: Map<string, { sla: string | null; tjph: string | null }>,
  ): Record<string, unknown>[] {
    if (!slaLookup.size) return rows
    for (const row of rows) {
      const origin = String(AirShipmentsService.getFieldValueFromRow(row, 'origin') ?? '').trim().toLowerCase()
      const dest = String(AirShipmentsService.getFieldValueFromRow(row, 'destination') ?? '').trim().toLowerCase()
      if (!origin || !dest) continue
      const lookup = slaLookup.get(`${origin}|${dest}`)
      if (!lookup) continue
      if (lookup.sla != null) row.sla = lookup.sla
      if (lookup.tjph != null) row.tjph = lookup.tjph
    }
    return rows
  }

  /** Mutates the rows in place — see enrichRowsWithSlaLookup. */
  private enrichRowsWithReservasi(
    rows: Record<string, unknown>[],
    reservasiByAwb: Map<string, string>,
  ): Record<string, unknown>[] {
    if (!reservasiByAwb.size) return rows
    for (const row of rows) {
      const awb = AirShipmentsService.getFieldValueFromRow(row, 'awb')
      if (!awb) continue
      const trackinganSmu = reservasiByAwb.get(String(awb).trim())
      if (trackinganSmu === undefined) continue
      row.trackingan_smu = trackinganSmu
    }
    return rows
  }

  /**
   * Injects the AWB's Tracking_SMU offload state into each row at the top level,
   * so evaluateAlerts can drive the Flight Tracking alert. Rows whose AWB is not
   * in Tracking_SMU are left untouched (treated as onboard / no evidence).
   * Mutates the rows in place — see enrichRowsWithSlaLookup.
   */
  private enrichRowsWithOffload(
    rows: Record<string, unknown>[],
    offloadByAwb: Map<string, { offload: boolean; hasEvidence: boolean }>,
  ): Record<string, unknown>[] {
    if (!offloadByAwb.size) return rows
    for (const row of rows) {
      const awb = AirShipmentsService.getFieldValueFromRow(row, 'awb')
      if (!awb) continue
      const hit = offloadByAwb.get(String(awb).trim())
      if (!hit) continue
      row.offload_status = hit.offload ? 'offload' : 'onboard'
      row.offload_has_evidence = hit.hasEvidence
    }
    return rows
  }

  private filterRowsByAlert(
    rows: Record<string, unknown>[],
    alertFilter: AlertFilter,
    nHours: number,
    mHours: number,
  ) {
    const now = new Date()
    return rows
      .filter((row) => !AirShipmentsService.isVoidRow(row))
      .filter((row) => !AirShipmentsService.isExcludedForAlert(row, alertFilter))
      .filter((row) => {
        const alerts = evaluateAlerts(row, nHours, mHours, now)
        if (alertFilter === 'normal') {
          return !Object.values(alerts).some(Boolean)
        }
        if (alertFilter === 'any') {
          return Object.values(alerts).some(Boolean)
        }
        return alerts[alertFilter as AlertType]
      })
  }

  private normalizeSheetIdentifier(sheetName: string): string {
    return sheetName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  private async getTableColumns(tableName: string) {
    const cols: { column_name: string }[] = await this.dataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    )
    return cols.map((c) => c.column_name)
  }

  /** Every field read by evaluateAlerts / the summary aggregation loops. */
  private static readonly ALERT_PROJECTION_FIELDS = [
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
  ] as const

  /**
   * Narrow SELECT list for alert evaluation: only the fields the alert loops read,
   * each merged from the real column and extra_fields via buildFieldValueExpression.
   * Avoids shipping the full extra_fields JSONB for every row. Note: the aliases
   * exist as top-level keys (null when empty), so field lookups never fall through
   * to extra_fields — which is correct, since the alias already COALESCEs both sources.
   */
  private buildAlertProjection(columns: string[]): string {
    const parts = ['id']
    if (columns.includes('excluded_reasons')) parts.push('excluded_reasons')
    for (const field of AirShipmentsService.ALERT_PROJECTION_FIELDS) {
      parts.push(`${this.buildFieldValueExpression(field, columns)} AS "${field}"`)
    }
    return parts.join(', ')
  }

  private buildFieldValueExpression(field: string, columns: string[]) {
    const expressions: string[] = []
    if (columns.includes(field)) {
      expressions.push(`NULLIF(TRIM(CAST("${field}" AS text)), '')`)
    }
    expressions.push(`NULLIF(TRIM(extra_fields->>'${field}'), '')`)
    return expressions.length > 1 ? `COALESCE(${expressions.join(', ')})` : expressions[0]
  }

  private buildTimestampExpression(field: string, columns: string[]) {
    const fieldExpr = this.buildFieldValueExpression(field, columns)
    const v = `NULLIF(${fieldExpr}, '')`
    return `(CASE WHEN ${v} ~ '^\\d{4}-\\d{2}-\\d{2}([ T]\\d{1,2}:\\d{2}|$)' THEN ${v}::timestamptz END)`
  }

  /**
   * Executes a full sync cycle:
   * 1. Fetch all sheets via SheetsService
   * 2. For each sheet, diff incoming rows against DB
   * 3. Upsert changed/new rows; skip locked rows and unchanged rows
   *
   * FR-028–FR-046
   */
  async runSyncCycle(
    sheetId: string
  ): Promise<{ affectedTables: string[]; totalUpserted: number }> {
    const startedAt = Date.now()
    const results = await this.sheetsService.fetchAllSheets(sheetId)

    const sheetResults = await Promise.all(results.map((sheet) => this.processSingleSheet(sheet)))

    const affectedTables = sheetResults.filter((r) => r.upserted > 0).map((r) => r.tableName)
    const totalUpserted = sheetResults.reduce((sum, r) => sum + r.upserted, 0)
    this.invalidateLookupCaches(affectedTables)

    const durationMs = Date.now() - startedAt
    this.logger.log(
      `[sync] Cycle complete in ${durationMs}ms — ${totalUpserted} upserted across ${affectedTables.length} table(s)`
    )

    // Compact per-sheet summary
    for (const r of sheetResults) {
      const parts: string[] = []
      if (r.upserted > 0) parts.push(`upserted=${r.upserted}`)
      if (r.lockedSkipped > 0) parts.push(`locked=${r.lockedSkipped}`)
      if (r.noChangeSkipped > 0) parts.push(`unchanged=${r.noChangeSkipped}`)
      if (r.skippedEmpty > 0) parts.push(`emptyRows=${r.skippedEmpty}`)
      if (r.skippedMissingKey > 0) parts.push(`missingKey=${r.skippedMissingKey}`)
      if (r.rowErrors.length > 0) parts.push(`rowErrors=${r.rowErrors.length}`)
      if (r.chunkErrors.length > 0) parts.push(`chunkErrors=${r.chunkErrors.length}`)
      if (parts.length > 0) {
        this.logger.log(`[sync] "${r.sheetName}" — ${parts.join(' ')}`)
      }
      if (r.rowErrors.length > 0 || r.chunkErrors.length > 0) {
        this.logger.error(
          `[sync] ${r.tableName}: ${r.rowErrors.length} row error(s), ${r.chunkErrors.length} chunk error(s)\n` +
            this.formatErrorSummary(r.rowErrors, r.chunkErrors)
        )
      }
    }

    if (totalUpserted > 0) {
      await this.refreshPnlViewIfNeeded(affectedTables)
    }

    if (totalUpserted > 0 && this.gateway) {
      const payload = {
        affectedTables,
        totalUpserted,
        syncedAt: new Date().toISOString(),
      }
      this.gateway.notifyClients(payload)

      const sheetIdentifiers = sheetResults
        .filter((result) => result.upserted > 0)
        .map((result) => this.normalizeSheetIdentifier(result.sheetName))
        .filter(Boolean)

      for (const sheetIdentifier of sheetIdentifiers) {
        this.gateway.notifyCompleted(sheetIdentifier)
      }
    }

    return { affectedTables, totalUpserted }
  }

  private static readonly PNL_TABLES = new Set([
    'air_shipments_compileaircgk',
    'air_shipments_smu_rate_cgk_spx',
    'air_shipments_smu',
    'air_shipments_ra',
    'air_shipments_sg_outgoing',
    'air_shipments_sg_incoming',
  ])

  private async refreshPnlViewIfNeeded(affectedTables: string[]): Promise<void> {
    if (!affectedTables.some((t) => AirShipmentsService.PNL_TABLES.has(t))) return
    try {
      await this.dataSource.query('REFRESH MATERIALIZED VIEW CONCURRENTLY v_pnl_to')
      this.logger.log('[sync] v_pnl_to refreshed')
    } catch (err) {
      this.logger.error('[sync] v_pnl_to refresh failed', err)
    }
  }

  private async processSingleSheet(sheet: SheetResult): Promise<{
    tableName: string
    sheetName: string
    upserted: number
    lockedSkipped: number
    noChangeSkipped: number
    skippedEmpty: number
    skippedMissingKey: number
    rowErrors: RowError[]
    chunkErrors: ChunkError[]
  }> {
    const { tableName, uniqueKey, headers, rows, sheetName } = sheet
    const skippedEmpty = sheet.skippedEmpty ?? 0
    const skippedMissingKey = sheet.skippedMissingKey ?? 0
    const keyColumns = Array.isArray(uniqueKey) ? uniqueKey : [uniqueKey]
    const rowErrors: RowError[] = []
    const chunkErrors: ChunkError[] = []

    const base = { tableName, sheetName, lockedSkipped: 0, noChangeSkipped: 0, skippedEmpty, skippedMissingKey, rowErrors, chunkErrors }

    const missingKeys = keyColumns.filter((k) => !headers.includes(k))
    if (missingKeys.length > 0) {
      this.logger.warn(
        `[sync] "${sheetName}" missing key column(s) "${missingKeys.join(', ')}" — skipping`
      )
      return { ...base, upserted: 0 }
    }

    if (rows.length === 0) return { ...base, upserted: 0 }

    const rowKey = (row: Record<string, unknown>): string =>
      keyColumns.map((k) => String(row[k] ?? '')).join('\x00')

    // Fetch existing rows — only key columns + data columns needed for diff
    const existingRows = await this.dataSource
      .createQueryBuilder()
      .select('*')
      .from(tableName, 't')
      .getRawMany()
    const existingMap = new Map<string, Record<string, unknown>>()
    for (const row of existingRows) existingMap.set(rowKey(row), row)

    let lockedSkipped = 0
    let noChangeSkipped = 0
    const rowsToUpsert: Record<string, unknown>[] = []

    // Get all entity columns for this table (excluding extra_fields)
    const columnsResult = await this.dataSource.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
      AND table_schema = 'public'
      AND is_generated = 'NEVER'
      `,
      [tableName]
    )

    const entityColumns = columnsResult
      .map((c: any) => c.column_name)
      .filter((c: string) => c !== 'extra_fields')

    for (const incomingRow of rows) {
      const existing = existingMap.get(rowKey(incomingRow))

      // ✅ Cek is_locked dari DB (existing row), bukan dari sheet
      // Kalau row belum ada di DB (existing undefined), berarti INSERT baru → tidak di-skip
      if (existing && existing['is_locked'] === true) {
        lockedSkipped++
        continue
      }

      // Split known and unknown fields
      const regularFields: Record<string, unknown> = {}
      const extraFields: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(incomingRow)) {
        if (entityColumns.includes(k) && k !== 'extra_fields') {
          regularFields[k] = v
        } else if (!SYSTEM_COLUMNS.has(k)) {
          extraFields[k] = v
        }
      }
      if (Object.keys(extraFields).length > 0) {
        regularFields['extra_fields'] = extraFields
      }
      regularFields['last_synced_at'] = new Date()

      if (existing) {
        const hasChanges = Object.keys(incomingRow).some(
          (k) =>
            !SYSTEM_COLUMNS.has(k) &&
            this.normalizeForDiff(incomingRow[k]) !== this.normalizeForDiff(existing[k])
        )
        if (!hasChanges) {
          noChangeSkipped++
          continue
        }
      }

      rowsToUpsert.push(regularFields)
    }

    // Batch upsert in chunks
    const CHUNK_SIZE = 500
    // Only include columns present in the entity plus 'extra_fields' in updateColumns for upsert
    const updateColumns = [...entityColumns, 'extra_fields']
    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE)

      try {
        await this.upsertDynamic({
          tableName,
          data: chunk,
          keyColumns,
          updateColumns,
        })
      } catch (err) {
        const errorType = this.classifyError(err as Error)

        // Log chunk-level error
        chunkErrors.push({
          tableName,
          chunkStart: i,
          chunkEnd: i + chunk.length,
          errorType,
          message: (err as Error).message,
          rowCount: chunk.length,
        })

        this.logger.warn(
          `[sync] ${tableName}: chunk [${i}–${i + chunk.length}] failed (${errorType}) — ` +
            `falling back to row-by-row. Reason: ${(err as Error).message}`
        )

        // Fallback row-by-row
        for (let j = 0; j < chunk.length; j++) {
          const row = chunk[j]
          try {
            await this.upsertDynamic({
              tableName,
              data: [row],
              keyColumns,
              updateColumns,
            })
          } catch (rowErr: unknown) {
            const rowErrorType = this.classifyError(rowErr as Error)
            const key = rowKey(row)

            rowErrors.push({
              tableName,
              rowKey: key,
              rowIndex: i + j,
              errorType: rowErrorType,
              message: (rowErr as Error).message,
              rowData: this.sanitizeRowForLog(row), // hapus data sensitif kalau ada
            })

            this.logger.warn(
              `[sync] ${tableName}: row skipped — ` +
                `key="${key}" index=${i + j} type=${rowErrorType} reason="${(rowErr as Error).message}"`
            )
          }
        }
      }
    }

    return {
      ...base,
      lockedSkipped,
      noChangeSkipped,
      upserted: rowsToUpsert.length - rowErrors.length,
    }
  }

  upsertDynamic = async ({
    tableName,
    data,
    keyColumns,
    updateColumns,
  }: {
    tableName: string
    data: any[]
    keyColumns: string[]
    updateColumns: string[]
  }) => {
    if (!data.length) return

    // ✅ 1. sanitize table name (WAJIB)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
      throw new Error('Invalid table name')
    }

    // ✅ 2. deduplicate (FIX error ON CONFLICT)
    // Key columns may be generated (not top-level in row) — fall back to extra_fields.
    const dedupedMap = new Map<string, any>()
    for (const row of data) {
      const key = keyColumns
        .map((k) => {
          if (k in row) return row[k]
          const ef = row['extra_fields']
          if (ef && typeof ef === 'object') return (ef as Record<string, unknown>)[k] ?? ''
          return ''
        })
        .join('|')
      dedupedMap.set(key, row) // last wins
    }
    const dedupedData = Array.from(dedupedMap.values())

    // ✅ 3. ambil columns (dari row pertama)
    const columns = Object.keys(dedupedData[0])

    // ✅ 4. build values placeholder
    const values = dedupedData
      .map((_, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`)
      .join(',')

    // ✅ 5. flatten values
    const flatValues = dedupedData.flatMap(
      (row) => columns.map((col) => row[col] ?? null) // handle undefined
    )

    // ✅ 6. handle updateSet kosong
    let onConflictClause = ''

    if (updateColumns.length > 0) {
      // Only update columns that are actually present in the INSERT data.
      // Key columns that are GENERATED (derived from extra_fields) won't be in
      // `columns`, so we don't filter them out of updateColumns — they simply
      // won't appear because they're not in the insert data either.
      const updateSet = updateColumns
        .filter((col) => !keyColumns.includes(col)) // jangan update key
        .filter((col) => columns.includes(col)) // only update what we're inserting
        .map((col) => `"${col}" = EXCLUDED."${col}"`)
        .join(', ')

      if (updateSet.length > 0) {
        onConflictClause = `
        ON CONFLICT (${keyColumns.map((k) => `"${k}"`).join(', ')})
        DO UPDATE SET ${updateSet}
      `
      } else {
        onConflictClause = `
        ON CONFLICT (${keyColumns.map((k) => `"${k}"`).join(', ')})
        DO NOTHING
      `
      }
    } else {
      onConflictClause = `
      ON CONFLICT (${keyColumns.map((k) => `"${k}"`).join(', ')})
      DO NOTHING
    `
    }

    // ✅ 7. execute
    await this.dataSource.query(
      `
    INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')})
    VALUES ${values}
    ${onConflictClause}
    `,
      flatValues
    )
  }

  private normalizeForDiff = (val: unknown): string => {
    if (val === null || val === undefined || val === '') return '__NULL__'
    if (val instanceof Date) return val.toISOString()
    return String(val).trim()
  }

  private classifyError(err: Error): RowError['errorType'] {
    const msg = err.message.toLowerCase()
    if (msg.includes('unique') || msg.includes('duplicate')) return 'UNIQUE_CONSTRAINT'
    if (msg.includes('column') || msg.includes('does not exist')) return 'COLUMN_MISMATCH'
    return 'UNKNOWN'
  }

  // Format summary yang mudah dibaca
  private formatErrorSummary(rowErrors: RowError[], chunkErrors: ChunkError[]): string {
    const lines: string[] = []

    if (chunkErrors.length > 0) {
      lines.push('  Chunk errors:')
      for (const e of chunkErrors) {
        lines.push(`    [${e.errorType}] rows ${e.chunkStart}–${e.chunkEnd}: ${e.message}`)
      }
    }

    if (rowErrors.length > 0) {
      lines.push('  Row errors:')
      // Group by errorType supaya tidak banjir log kalau banyak error sejenis
      const grouped = rowErrors.reduce(
        (acc, e) => {
          acc[e.errorType] = acc[e.errorType] ?? []
          acc[e.errorType].push(e)
          return acc
        },
        {} as Record<string, RowError[]>
      )

      for (const [type, errors] of Object.entries(grouped)) {
        lines.push(`    [${type}] ${errors.length} row(s):`)
        for (const e of errors.slice(0, 5)) {
          // max 5 per group supaya tidak spam
          lines.push(`      row ${e.rowIndex} key="${e.rowKey}": ${e.message}`)
        }
        if (errors.length > 5) {
          lines.push(`      ... and ${errors.length - 5} more`)
        }
      }
    }

    return lines.join('\n')
  }

  // Hapus field yang mungkin sensitif sebelum masuk log
  private sanitizeRowForLog(row: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE_KEYS = new Set(['link_evidence_of_arrival_wh_destination'])
    return Object.fromEntries(Object.entries(row).filter(([k]) => !SENSITIVE_KEYS.has(k)))
  }

  // ──────────────────────────────────────────────────
  // US3 — Paginated REST query methods (FR-035–FR-037)
  // ──────────────────────────────────────────────────

  private async paginatedQuery<T extends object>(
    repo: Repository<T>,
    {
      page,
      limit,
      sortBy,
      sortOrder,
      search,
    }: {
      page: number
      limit: number
      sortBy: string
      sortOrder: 'asc' | 'desc'
      search?: string
    },
    tableName?: string
  ) {
    const columns = repo.metadata.columns.map((c) => c.propertyName)
    const safeSortBy = columns.includes(sortBy) ? sortBy : 'id'

    const DIRECT_SEARCHABLE = ['to_number', 'lt_number']
    const JSONB_SEARCHABLE = [
      'flight_no',
      'nopol_pickup',
      'driver_name_pickup',
      'actual_airline_name',
    ]

    const isAirShipmentTable = [
      'air_shipments_cgk',
      'air_shipments_sub',
      'air_shipments_sda',
    ].includes(tableName || '')

    const alias = 'entity'
    const qb = repo.createQueryBuilder(alias)

    if (search && typeof search === 'string' && search.trim() && isAirShipmentTable) {
      const conditions: string[] = []

      // Regular columns — direct ILIKE
      for (const field of DIRECT_SEARCHABLE) {
        conditions.push(`${alias}.${field} ILIKE :search`)
      }

      // JSONB fields — cast via ->>
      for (const field of JSONB_SEARCHABLE) {
        conditions.push(`${alias}.extra_fields->>'${field}' ILIKE :search`)
      }

      qb.where(`(${conditions.join(' OR ')})`, { search: `%${search}%` })
    }

    // Handle sort: JSONB field vs regular column
    const isJsonbSort = !columns.includes(sortBy)
    if (isJsonbSort) {
      qb.orderBy(`${alias}.extra_fields->>'${sortBy}'`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
    } else {
      qb.orderBy(`${alias}.${safeSortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC')
    }

    qb.skip((page - 1) * limit).take(limit)

    const [data, total] = await qb.getManyAndCount()

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async getGoogleSheetConfig(): Promise<GoogleSheetConfig[]> {
    const config = await this.googleSheetConfigRepo.find({
      relations: ['sheetConfigs'],
    })
    return config
  }

  async createGoogleSheetConfig(
    dto: GoogleSheetConfigDto,
    actorId?: string,
    ip?: string,
    userAgent?: string
  ): Promise<GoogleSheetConfig> {
    const sheetId = this.extractSheetId(dto.sheetLink)
    const sheetEntities = (dto.sheetConfigs ?? []).map((sc) =>
      this.googleSheetSheetConfigRepo.create({
        sheetName: sc.sheetName,
        tableName: sc.tableName,
        headerRow: sc.headerRow,
        uniqueKey: sc.uniqueKey,
        skipNullCols: sc.skipNullCols ?? true,
      })
    )

    const config = this.googleSheetConfigRepo.create({
      ...dto,
      sheetId,
      sheetConfigs: sheetEntities,
    })

    const saved = await this.googleSheetConfigRepo.save(config)

    // Fire-and-forget table creation for sheets; do not block API response on failures
    if (Array.isArray(saved.sheetConfigs)) {
      void Promise.allSettled(
        saved.sheetConfigs.map((sc) => this.dynamicTableService.ensureTable(sc as any))
      )
    }

    this.eventEmitter.emit('gsheetConfig.created', saved)
    this.eventEmitter.emit('google_sheet_config.created', {
      actorId,
      resourceId: saved.id,
      ip,
      userAgent,
      after: saved,
      before: null,
    })

    return saved
  }

  async updateGoogleSheetConfig(
    id: string,
    dto: GoogleSheetConfigDto,
    actorId?: string,
    ip?: string,
    userAgent?: string
  ): Promise<GoogleSheetConfig> {
    const sheetId = this.extractSheetId(dto.sheetLink)
    const prev = await this.googleSheetConfigRepo.findOne({
      where: { id },
      relations: ['sheetConfigs'],
    })
    const sheetConfigs = dto.sheetConfigs
    delete dto.sheetConfigs // remove sheetConfigs from dto to avoid confusion in update
    await this.googleSheetConfigRepo.update(id, { ...dto, sheetId })
    const config = await this.googleSheetConfigRepo.findOne({
      where: { id },
      relations: ['sheetConfigs'],
    })
    // Determine which sheet configs are new or changed (uniqueKey change)
    try {
      const prevMap = new Map<string, any>()
      for (const p of prev?.sheetConfigs ?? []) prevMap.set(p.tableName, p)

      const toEnsure: any[] = []
      for (const sc of sheetConfigs ?? []) {
        const prevSc = sc.tableName ? prevMap.get(sc.tableName) : undefined
        if (!prevSc) {
          toEnsure.push(sc)
          continue
        }
        const prevKeys = Array.isArray(prevSc.uniqueKey) ? prevSc.uniqueKey : prevSc.uniqueKey || []
        const newKeys = Array.isArray(sc.uniqueKey) ? sc.uniqueKey : sc.uniqueKey || []
        const prevTableName = prevSc.tableName
        const newTableName = sc.tableName
        // If uniqueKey or tableName changed, we need to ensure the table again
        if (JSON.stringify(prevKeys) !== JSON.stringify(newKeys) || prevTableName !== newTableName)
          toEnsure.push(sc)
      }

      if (toEnsure.length > 0) {
        void Promise.allSettled(toEnsure.map((s) => this.dynamicTableService.ensureTable(s as any)))
      }
    } catch (err) {
      this.logger.warn(
        `[Sync] Failed to ensure tables after config update: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    config.sheetConfigs = sheetConfigs.map((sc) =>
      this.googleSheetSheetConfigRepo.create({
        ...sc,
        skipNullCols: true,
        googleSheetConfig: config,
      })
    )
    await this.googleSheetSheetConfigRepo.delete({ googleSheetConfig: { id } })
    const saved = await this.googleSheetConfigRepo.save(config)
    this.eventEmitter.emit('google_sheet_config.updated', {
      actorId,
      resourceId: id,
      ip,
      userAgent,
      after: saved,
      before: prev,
    })
    this.eventEmitter.emit('gsheetConfig.updated', saved) // Emit event khusus untuk SheetsService agar reload config di scheduler
    return saved
  }

  async deleteGoogleSheetConfig(
    id: string,
    actorId?: string,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    const prev = await this.googleSheetConfigRepo.findOne({
      where: { id },
      relations: ['sheetConfigs'],
    })
    await this.googleSheetConfigRepo.delete(id)
    this.eventEmitter.emit('gsheetConfig.deleted', { id, sheetId: prev?.sheetId })
    this.eventEmitter.emit('google_sheet_config.deleted', {
      actorId,
      resourceId: id,
      ip,
      userAgent,
      after: null,
      before: prev,
    })
  }

  private extractSheetId(link: string): string {
    // Extracts the sheet ID from a Google Sheet link
    const match = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (!match) throw new Error('Invalid Google Sheet link')
    return match[1]
  }

  async lockRow(tableName: string, id: string, locked: boolean, actorId?: string): Promise<string> {
    // use query builder to update is_locked column for the given id in the specified table
    await this.dataSource
      .createQueryBuilder()
      .update(tableName)
      .set({ is_locked: locked })
      .where('id = :id', { id })
      .execute()
    this.eventEmitter.emit('shipment_row.lock_changed', {
      actorId,
      resourceId: id,
      ip: undefined,
      userAgent: undefined,
      after: { is_locked: locked },
      before: { is_locked: !locked },
    })
    return `Row with id ${id} in table ${tableName} has been ${locked ? 'locked' : 'unlocked'}.`
  }

  /**
   * Resolve the SQL date-basis expression for batch-by-date operations.
   * Tables that carry a business `date` field (compileaircgk, smu_rate_cgk_spx) filter on it;
   * date-less rate/reference tables fall back to the real `created_at` column so the feature works
   * on every sheet. The returned fragment is fixed internal SQL (never user input); callers
   * regex-guard `tableName`.
   */
  private async resolveDateExpr(tableName: string): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT EXISTS(SELECT 1 FROM "${tableName}" WHERE extra_fields ? 'date' LIMIT 1) AS has_date`
    )
    return rows?.[0]?.has_date
      ? `parse_flexible_timestamp(extra_fields->>'date')`
      : `created_at::timestamp`
  }

  /**
   * Batch lock/unlock rows by date range. Returns number of affected rows.
   */
  async batchLockByDate(
    tableName: string,
    start: string,
    end: string,
    locked: boolean,
    actorId?: string
  ): Promise<number> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    if (!start || !end) throw new BadRequestException('Start and end dates are required')

    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime()))
      throw new BadRequestException('Invalid date range')

    const dateExpr = await this.resolveDateExpr(tableName)
    const res = await this.dataSource.query(
      `UPDATE "${tableName}" SET is_locked = $1, updated_at = NOW()
      WHERE ${dateExpr} BETWEEN $2::timestamp AND $3::timestamp RETURNING id`,
      [locked, start, end]
    )
    const affected = res?.[1] ?? 0
    this.eventEmitter.emit('shipment_row.batch_lock_changed', {
      actorId,
      tableName,
      start,
      end,
      affected,
      locked,
    })
    return affected
  }

  /**
   * Batch delete rows by date range. Returns number of deleted rows.
   */
  async batchDeleteByDate(
    tableName: string,
    start: string,
    end: string,
    actorId?: string
  ): Promise<number> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    if (!start || !end) throw new BadRequestException('Start and end dates are required')

    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime()))
      throw new BadRequestException('Invalid date range')

    const dateExpr = await this.resolveDateExpr(tableName)
    const res = await this.dataSource.query(
      `DELETE FROM "${tableName}" WHERE ${dateExpr} BETWEEN $1::timestamp AND $2::timestamp RETURNING id`,
      [start, end]
    )
    const deleted = res?.[1] ?? 0
    this.eventEmitter.emit('shipment_row.batch_deleted', {
      actorId,
      tableName,
      start,
      end,
      deleted,
    })
    return deleted
  }

  /**
   * Count rows a batch lock/delete over the given date range would affect. Read-only — used to
   * populate the confirm dialog before a destructive batch delete.
   */
  async batchCountByDate(tableName: string, start: string, end: string): Promise<number> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    if (!start || !end) throw new BadRequestException('Start and end dates are required')

    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime()))
      throw new BadRequestException('Invalid date range')

    const dateExpr = await this.resolveDateExpr(tableName)
    const rows = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM "${tableName}" WHERE ${dateExpr} BETWEEN $1::timestamp AND $2::timestamp`,
      [start, end]
    )
    return rows?.[0]?.count ?? 0
  }

  async excludeRow(
    tableName: string,
    id: string,
    alertType: AlertType,
    reason: string,
  ): Promise<void> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    await this.dataSource.query(
      `UPDATE "${tableName}" SET excluded_reasons = COALESCE(excluded_reasons, '{}') || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ [alertType]: reason }), id]
    )
  }

  async restoreRow(
    tableName: string,
    id: string,
    alertType: AlertType,
  ): Promise<void> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    await this.dataSource.query(
      `UPDATE "${tableName}" SET excluded_reasons = NULLIF(excluded_reasons - $1, '{}') WHERE id = $2`,
      [alertType, id]
    )
  }

  /**
   * Excludes every row matching any of the given `lt_number`s from a specific alert type
   * (recording the chosen alert + reason for audit). One LT may map to several TOs — all
   * matches are updated. Returns the number of rows affected.
   */
  async excludeByLt(
    tableName: string,
    ltNumbers: string[],
    alertType: AlertType,
    reason: string,
  ): Promise<number> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    const lts = Array.from(new Set(ltNumbers.map((v) => String(v).trim()).filter(Boolean)))
    if (lts.length === 0) return 0

    const columns = await this.getTableColumns(tableName)
    const ltExpr = this.buildFieldValueExpression('lt_number', columns)
    const res = await this.dataSource.query(
      `UPDATE "${tableName}"
         SET excluded_reasons = COALESCE(excluded_reasons, '{}') || $1::jsonb
       WHERE LOWER(${ltExpr}) = ANY($2::text[]) RETURNING id`,
      [JSON.stringify({ [alertType]: reason }), lts.map((v) => v.toLowerCase())]
    )
    return res?.[1] ?? 0
  }

  /** Reverses an exclude-by-LT for a specific alert type: removes that key for matching rows. */
  async restoreByLt(tableName: string, ltNumbers: string[], alertType: AlertType): Promise<number> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }
    const lts = Array.from(new Set(ltNumbers.map((v) => String(v).trim()).filter(Boolean)))
    if (lts.length === 0) return 0

    const columns = await this.getTableColumns(tableName)
    const ltExpr = this.buildFieldValueExpression('lt_number', columns)
    const res = await this.dataSource.query(
      `UPDATE "${tableName}"
         SET excluded_reasons = NULLIF(excluded_reasons - $1, '{}')
       WHERE LOWER(${ltExpr}) = ANY($2::text[]) RETURNING id`,
      [alertType, lts.map((v) => v.toLowerCase())]
    )
    return res?.[1] ?? 0
  }

  // ── SLA column layout (single app-wide config, stored in general_params) ────────

  /** Reads the app-wide SLA table column layout. Returns [] (use defaults) when unset/invalid. */
  async getSlaColumnLayout(): Promise<Array<{ key: string; visible: boolean; frozen: boolean }>> {
    const raw = await this.generalParamsService.getValue(
      AirShipmentsService.SLA_COLUMN_LAYOUT_KEY,
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
  ): Promise<void> {
    await this.generalParamsService.upsert(
      AirShipmentsService.SLA_COLUMN_LAYOUT_KEY,
      JSON.stringify(layout),
      'SLA Column Layout',
      actorId,
    )
  }

  async findExcludedRows(
    tableName: string,
    query: ExcludedQueryDto,
    opts: { unbounded?: boolean } = {},
  ): Promise<{ data: Record<string, unknown>[]; meta: { total: number; page: number; limit: number } }> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    const { alertType, page = 1, limit = 50, startDate, endDate } = query
    const { unbounded = false } = opts
    const offset = (page - 1) * limit

    const whereClauses: string[] = [
      `excluded_reasons IS NOT NULL AND excluded_reasons != '{}'::jsonb`,
    ]
    const params: any[] = []

    if (alertType) {
      whereClauses.push(`excluded_reasons ? $${params.length + 1}`)
      params.push(alertType)
    }

    const columns = await this.getTableColumns(tableName)
    const dateClause = this.buildDateRangeClause(columns, params, startDate, endDate)
    if (dateClause) whereClauses.push(dateClause)

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`

    const [data, countRes] = await Promise.all([
      this.dataSource.query(
        `SELECT * FROM "${tableName}" ${whereSql} ORDER BY id ASC` +
          (unbounded ? '' : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`),
        unbounded ? params : [...params, limit, offset]
      ),
      this.dataSource.query(
        `SELECT count(*)::int FROM "${tableName}" ${whereSql}`,
        params
      ),
    ])

    const total = countRes?.[0]?.count ?? 0

    return { data, meta: { total, page, limit } }
  }

  // ── Tracking_SMU offload / evidence ──────────────────────────────────────────

  /**
   * Paginated list of offloaded AWBs from air_shipments_tracking_smu. With
   * `withEvidence=false` (default) returns only AWBs that still need an evidence
   * link (the active Flight Tracking alert); with `withEvidence=true` returns the
   * already-justified AWBs (the Excluded view).
   */
  private async tableExists(tableName: string): Promise<boolean> {
    const rows: { exists: boolean }[] = await this.dataSource.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1
       ) AS exists`,
      [tableName]
    )
    return Boolean(rows[0]?.exists)
  }

  /**
   * Offloaded AWBs for the drill-in list: a UNION of sheet-driven rows (Tracking_SMU,
   * excluding the API-driven carriers) and airline-API rows. Both project identical
   * columns + a `source` flag; evidence (kept on Tracking_SMU) gates the active vs
   * Excluded view in both branches.
   */
  async findOffloadedAwbs(
    query: OffloadedAwbQueryDto,
    opts: { unbounded?: boolean } = {},
  ): Promise<{ data: Record<string, unknown>[]; meta: { total: number; page: number; limit: number } }> {
    const { search, withEvidence = false, page = 1, limit = 50 } = query
    const { unbounded = false } = opts
    const offset = (page - 1) * limit

    const sheetTable = AirShipmentsService.TRACKING_SMU_TABLE
    const apiTable = AirShipmentsService.AIRLINE_TRACKING_TABLE
    const [sheetExists, apiExists] = await Promise.all([
      this.tableExists(sheetTable),
      this.tableExists(apiTable),
    ])
    if (!sheetExists && !apiExists) {
      return { data: [], meta: { total: 0, page, limit } }
    }

    const apiCarriers = await this.getEnabledApiCarrierCodes()
    const params: any[] = [apiCarriers] // $1
    let searchIdx = 0
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`)
      searchIdx = params.length // $2
    }
    const evid = (col: string) =>
      withEvidence
        ? `(${col} IS NOT NULL AND BTRIM(${col}) <> '')`
        : `(${col} IS NULL OR BTRIM(${col}) = '')`

    // Scope to AWBs that have compileaircgk TOs in the selected SLA range, using the
    // SAME date expression as the dashboard cards — so the list and the card tonnage
    // agree (excluding an AWB shown here always lowers the card).
    let dateSubSelect = ''
    if (query.startDate && query.endDate) {
      const compileCols = await this.getTableColumns('air_shipments_compileaircgk')
      const dateClause = this.buildDateRangeClause(compileCols, params, query.startDate, query.endDate)
      if (dateClause) {
        dateSubSelect = `SELECT awb FROM air_shipments_compileaircgk WHERE ${dateClause}`
      }
    }
    const dateFilter = (col: string) => (dateSubSelect ? `AND ${col} IN (${dateSubSelect})` : '')

    const branches: string[] = []
    if (sheetExists) {
      branches.push(`
        SELECT awb AS id, awb, airline, std_booking, std_flight_no, actual_flight_dep, dep_flight_no,
          dep2, dep2_flight_no, dep3, dep3_flight_no, dep4, dep4_flight_no, dep5, dep5_flight_no,
          remarks_offload, evidence, 'sheet'::text AS source, NULL::timestamptz AS fetched_at, NULL::text AS error
        FROM "${sheetTable}"
        WHERE offload_status = 'offload'
          AND split_part(awb, '-', 1) <> ALL($1::text[])
          AND ${evid('evidence')}
          ${searchIdx ? `AND awb ILIKE $${searchIdx}` : ''}
          ${dateFilter('awb')}
      `)
    }
    if (apiExists) {
      const join = sheetExists ? `LEFT JOIN "${sheetTable}" t ON t.awb = a.awb` : ''
      const evidenceCol = sheetExists ? 't.evidence' : 'NULL::text'
      branches.push(`
        SELECT a.awb AS id, a.awb, COALESCE(src.name, a.carrier_code) AS airline, a.std_booking, a.std_flight_no, a.actual_flight_dep, a.dep_flight_no,
          a.dep2, a.dep2_flight_no, a.dep3, a.dep3_flight_no, a.dep4, a.dep4_flight_no, a.dep5, a.dep5_flight_no,
          NULL::text AS remarks_offload, ${evidenceCol} AS evidence, 'api'::text AS source, a.fetched_at, a.error
        FROM "${apiTable}" a
        LEFT JOIN airline_tracking_source src ON src.carrier_code = a.carrier_code
        ${join}
        WHERE a.offload = true
          AND ${evid(evidenceCol)}
          ${searchIdx ? `AND a.awb ILIKE $${searchIdx}` : ''}
          ${dateFilter('a.awb')}
      `)
    }

    const union = branches.map((b) => `(${b})`).join(' UNION ALL ')
    const [data, countRes] = await Promise.all([
      this.dataSource.query(
        `SELECT * FROM (${union}) u ORDER BY awb ASC` +
          (unbounded ? '' : ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`),
        unbounded ? params : [...params, limit, offset]
      ),
      this.dataSource.query(`SELECT count(*)::int AS count FROM (${union}) u`, params),
    ])

    return { data, meta: { total: countRes?.[0]?.count ?? 0, page, limit } }
  }

  // ── SLA Monitoring Excel export ──────────────────────────────────────────────

  /**
   * Builds the SLA Monitoring Excel export: one workbook with an "Active Alert" sheet
   * and an "Exclude" sheet. Each sheet mirrors the filters currently applied to its tab
   * and includes EVERY matching row (unbounded — the 50-row UI pagination does not apply).
   */
  async buildSlaExportWorkbook(
    tableName: string,
    opts: {
      startDate?: string
      endDate?: string
      alertFilter?: AlertFilter
      routeFilter?: string[]
      search?: string
      excludedAlertType?: AlertType
      columns?: string[]
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
    },
  ): Promise<Buffer> {
    const {
      startDate,
      endDate,
      alertFilter,
      routeFilter,
      search,
      excludedAlertType,
      columns,
      sortBy = 'date',
      sortOrder = 'asc',
    } = opts

    const isFlightTracking = alertFilter === 'flightTracking'
    const dateRange = startDate && endDate ? `${startDate} → ${endDate}` : '—'
    const exportedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const searchLine = search && search.trim() ? search.trim() : '—'

    // Flight Tracking drives both tabs off the AWB (offloaded) lists.
    if (isFlightTracking) {
      const [active, excluded] = await Promise.all([
        this.findOffloadedAwbs(
          { search, startDate, endDate, withEvidence: false } as OffloadedAwbQueryDto,
          { unbounded: true },
        ),
        this.findOffloadedAwbs(
          { search, startDate, endDate, withEvidence: true } as OffloadedAwbQueryDto,
          { unbounded: true },
        ),
      ])
      const ftFilters: Array<[string, string]> = [
        ['Date Range:', dateRange],
        ['Alert Type:', 'Flight Tracking'],
        ['Search:', searchLine],
        ['Exported:', exportedAt],
      ]
      return buildSlaWorkbook(
        {
          name: 'Active Alert',
          title: 'SLA Monitoring — Active Alerts (Flight Tracking)',
          filterLines: ftFilters,
          headers: AWB_HEADERS,
          rows: mapAwbRows(active.data),
        },
        {
          name: 'Exclude',
          title: 'SLA Monitoring — Excluded (Flight Tracking)',
          filterLines: ftFilters,
          headers: AWB_HEADERS,
          rows: mapAwbRows(excluded.data),
        },
      )
    }

    // Standard per-TO tables: active rows mapped to the visible columns; excluded rows
    // expanded one line per alert type (mirrors the Excluded tab).
    const cols = columns && columns.length ? columns : await this.defaultExportColumns(tableName)

    const active = await this.findAllForTable(tableName, {
      page: 1,
      limit: 50,
      sortBy,
      sortOrder,
      search,
      alertFilter,
      routeFilter,
      startDate,
      endDate,
      unbounded: true,
    })
    const excluded = await this.findExcludedRows(
      tableName,
      { alertType: excludedAlertType, startDate, endDate } as ExcludedQueryDto,
      { unbounded: true },
    )

    const activeSheet: SlaSheetSpec = {
      name: 'Active Alert',
      title: 'SLA Monitoring — Active Alerts',
      filterLines: [
        ['Date Range:', dateRange],
        ['Alert Type:', alertFilter && alertFilter !== 'any' ? alertLabel(alertFilter) : 'All Alerts'],
        ['Routes:', routeFilter && routeFilter.length ? routeFilter.join(', ') : 'All Routes'],
        ['Search:', searchLine],
        ['Exported:', exportedAt],
      ],
      headers: cols.map(colLabel),
      rows: mapActiveRows(active.data, cols),
    }
    const excludeSheet: SlaSheetSpec = {
      name: 'Exclude',
      title: 'SLA Monitoring — Excluded',
      filterLines: [
        ['Date Range:', dateRange],
        ['Alert Type:', excludedAlertType ? alertLabel(excludedAlertType) : 'All'],
        ['Exported:', exportedAt],
      ],
      headers: EXCLUDE_HEADERS,
      rows: expandExcludedRows(excluded.data, excludedAlertType),
    }

    return buildSlaWorkbook(activeSheet, excludeSheet)
  }

  /** Fallback Active-sheet columns when the client doesn't pass a visible-column list. */
  private async defaultExportColumns(tableName: string): Promise<string[]> {
    const layout = await this.getSlaColumnLayout().catch(() => [])
    const visible = layout.filter((i) => i.visible).map((i) => i.key)
    if (visible.length) return visible
    const hidden = new Set([
      'id',
      'is_locked',
      'last_synced_at',
      'created_at',
      'updated_at',
      'extra_fields',
      'excluded_reasons',
    ])
    return (await this.getTableColumns(tableName)).filter((c) => !hidden.has(c))
  }

  /**
   * Records the evidence link for an AWB, excluding it (and all its TOs) from the alert.
   * Upserts so it also works for API-driven AWBs that have no Tracking_SMU sheet row
   * (evidence lives on Tracking_SMU; the stub row survives sheet re-sync).
   */
  async setEvidenceByAwb(awb: string, evidence: string): Promise<void> {
    if (!awb || !awb.trim()) throw new BadRequestException('AWB is required')
    await this.dataSource.query(
      `INSERT INTO "${AirShipmentsService.TRACKING_SMU_TABLE}" (awb, evidence) VALUES ($1, $2)
       ON CONFLICT (awb) DO UPDATE SET evidence = EXCLUDED.evidence, updated_at = NOW()`,
      [awb, evidence]
    )
    // Evidence is user-edited (not a sync), so evict the offload cache explicitly.
    this.lookupCache.delete(AirShipmentsService.OFFLOAD_CACHE_KEY)
  }

  /** Clears the evidence link for an AWB, restoring it (and its TOs) to the alert. */
  async clearEvidenceByAwb(awb: string): Promise<void> {
    if (!awb || !awb.trim()) throw new BadRequestException('AWB is required')
    await this.dataSource.query(
      `UPDATE "${AirShipmentsService.TRACKING_SMU_TABLE}" SET evidence = NULL, updated_at = NOW() WHERE awb = $1`,
      [awb]
    )
    this.lookupCache.delete(AirShipmentsService.OFFLOAD_CACHE_KEY)
  }

  async getLastSyncAt(): Promise<{ lastSyncAt: string | null; byTable: Record<string, string | null> }> {
    const tableRows = await this.googleSheetSheetConfigRepo
      .createQueryBuilder('ssc')
      .select('DISTINCT ssc.tableName', 'tableName')
      .getRawMany()

    const tableNames: string[] = tableRows
      .map((r: { tableName: string }) => r.tableName)
      .filter((t: string) => t && /^[a-z][a-z0-9_]*$/.test(t))

    if (tableNames.length === 0) return { lastSyncAt: null, byTable: {} }

    const union = tableNames
      .map((t) => `SELECT '${t}' AS table_name, MAX(last_synced_at)::TEXT AS ts FROM "${t}"`)
      .join(' UNION ALL ')
    const rows: { table_name: string; ts: string | null }[] =
      await this.dataSource.query(union)

    const byTable: Record<string, string | null> = {}
    let lastSyncAt: string | null = null
    for (const row of rows) {
      byTable[row.table_name] = row.ts ?? null
      if (row.ts && (!lastSyncAt || row.ts > lastSyncAt)) lastSyncAt = row.ts
    }
    return { lastSyncAt, byTable }
  }
}
