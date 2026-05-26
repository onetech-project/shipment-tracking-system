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
import { EventEmitter2 } from '@nestjs/event-emitter'
import { GeneralParamsService } from '../general-params/general-params.service'

/** System-managed columns that are never diff-compared against sheet data */
const SYSTEM_COLUMNS = new Set(['id', 'is_locked', 'last_synced_at', 'created_at', 'updated_at'])

@Injectable()
export class AirShipmentsService {
  private readonly logger = new Logger(AirShipmentsService.name)
  private readonly repoMap: Map<string, Repository<any>>

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
    }: {
      page: number
      limit: number
      sortBy: string
      sortOrder: 'asc' | 'desc'
      search?: string
      alertFilter?: AlertFilter
      routeFilter?: string
      days?: number
      startDate?: string
      endDate?: string
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

    if (routeFilter && routeFilter.trim()) {
      const parts = routeFilter
        .split(/\s*-\s*/)
        .map((part) => part.trim())
        .filter(Boolean)
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
      const [{ nHours, mHours }, reservasiTableName, slaLookup] = await Promise.all([
        this.getAlertNMHours(),
        this.generalParamsService.getValue('reservasi_table_name', ''),
        this.getSlaLookupByOriginDest(),
      ])
      const reservasiByAwb = await this.getReservasiTrackinganByAwb(reservasiTableName)
      const rawRows = await this.dataSource.query(
        `SELECT * FROM "${tableName}" ${whereSql} ${orderBySql}`,
        params
      )
      const rows = this.enrichRowsWithReservasi(
        this.enrichRowsWithSlaLookup(rawRows, slaLookup),
        reservasiByAwb,
      )
      const filteredRows = this.filterRowsByAlert(rows, alertFilter, nHours, mHours)
      const total = filteredRows.length
      const data = filteredRows.slice(offset, offset + limit)
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    }

    const rows = await this.dataSource.query(
      `SELECT * FROM "${tableName}" ${whereSql} ${orderBySql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    const countRes = await this.dataSource.query(
      `SELECT count(*)::int FROM "${tableName}" ${whereSql}`,
      params
    )
    const total = countRes?.[0]?.count ?? 0

    return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async getAlertSummaryForTable(tableName: string, startDate?: string, endDate?: string, days?: number) {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    const [{ nHours, mHours }, reservasiTableName, slaLookup] = await Promise.all([
      this.getAlertNMHours(),
      this.generalParamsService.getValue('reservasi_table_name', ''),
      this.getSlaLookupByOriginDest(),
    ])
    const reservasiByAwb = await this.getReservasiTrackinganByAwb(reservasiTableName)
    const columns = await this.getTableColumns(tableName)
    const whereClauses: string[] = []
    const params: any[] = []

    const dateClause = this.buildDateRangeClause(columns, params, startDate, endDate, days)
    if (dateClause) whereClauses.push(dateClause)

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const rawRows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT * FROM "${tableName}" ${whereSql}`,
      params
    )
    const rows = this.enrichRowsWithReservasi(
      this.enrichRowsWithSlaLookup(rawRows, slaLookup),
      reservasiByAwb,
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

    const alertRows = rows.filter((row) => !AirShipmentsService.isVoidRow(row))
    for (const row of alertRows) {
      const alerts = evaluateAlerts(row, nHours, mHours)
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

    return { nHours, mHours, alerts, otp }
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

  async getRouteAlertSummary(tableName: string, startDate?: string, endDate?: string, days?: number) {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    const [{ nHours, mHours }, reservasiTableName, slaLookup] = await Promise.all([
      this.getAlertNMHours(),
      this.generalParamsService.getValue('reservasi_table_name', ''),
      this.getSlaLookupByOriginDest(),
    ])
    const reservasiByAwb = await this.getReservasiTrackinganByAwb(reservasiTableName)
    const columns = await this.getTableColumns(tableName)
    const whereClauses: string[] = []
    const params: any[] = []

    const dateClause = this.buildDateRangeClause(columns, params, startDate, endDate, days)
    if (dateClause) whereClauses.push(dateClause)

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
    const rawRows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT * FROM "${tableName}" ${whereSql}`,
      params
    )
    const rows = this.enrichRowsWithReservasi(
      this.enrichRowsWithSlaLookup(rawRows, slaLookup),
      reservasiByAwb,
    )

    const getFieldValue = AirShipmentsService.getFieldValueFromRow

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
    const routeNow = new Date()

    const alertRows = rows.filter((row) => !AirShipmentsService.isVoidRow(row))
    for (const row of alertRows) {
      const alerts = evaluateAlerts(row, nHours, mHours)
      const origin = String(getFieldValue(row, 'origin') ?? '').trim()
      const destination = String(getFieldValue(row, 'destination') ?? '').trim()
      if (!origin || !destination) continue
      const route = `${origin} - ${destination}`
      const grossWeight = parseFloat(String(getFieldValue(row, 'gross_weight') ?? '0')) || 0

      if (!byRoute.has(route)) {
        const emptyAlerts = {} as Record<AlertType, number>
        const emptyCounts = {} as Record<AlertType, number>
        for (const t of ALERT_TYPES) { emptyAlerts[t] = 0; emptyCounts[t] = 0 }
        byRoute.set(route, { totalTonnage: 0, totalCount: 0, alerts: emptyAlerts, alertCounts: emptyCounts, otpOnTime: 0, otpOnTimeCount: 0, otpLate: 0, otpLateCount: 0 })
      }
      const item = byRoute.get(route)!
      item.totalTonnage += grossWeight
      item.totalCount += 1
      for (const type of ALERT_TYPES) {
        if (alerts[type]) {
          item.alerts[type] += grossWeight
          item.alertCounts[type] += 1
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
          } else if (routeNow > maxSla) {
            isOnTime = false
          }
          if (isOnTime === true) { item.otpOnTime += grossWeight; item.otpOnTimeCount += 1 }
          else if (isOnTime === false) { item.otpLate += grossWeight; item.otpLateCount += 1 }
        }
      }
    }

    return Array.from(byRoute.entries())
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
   */
  private enrichRowsWithSlaLookup(
    rows: Record<string, unknown>[],
    slaLookup: Map<string, { sla: string | null; tjph: string | null }>,
  ): Record<string, unknown>[] {
    if (!slaLookup.size) return rows
    return rows.map((row) => {
      const origin = String(AirShipmentsService.getFieldValueFromRow(row, 'origin') ?? '').trim().toLowerCase()
      const dest = String(AirShipmentsService.getFieldValueFromRow(row, 'destination') ?? '').trim().toLowerCase()
      if (!origin || !dest) return row
      const lookup = slaLookup.get(`${origin}|${dest}`)
      if (!lookup) return row
      const overrides: Record<string, unknown> = {}
      if (lookup.sla != null) overrides.sla = lookup.sla
      if (lookup.tjph != null) overrides.tjph = lookup.tjph
      if (!Object.keys(overrides).length) return row
      return { ...row, ...overrides }
    })
  }

  private enrichRowsWithReservasi(
    rows: Record<string, unknown>[],
    reservasiByAwb: Map<string, string>,
  ): Record<string, unknown>[] {
    if (!reservasiByAwb.size) return rows
    return rows.map((row) => {
      const awb = AirShipmentsService.getFieldValueFromRow(row, 'awb')
      if (!awb) return row
      const trackinganSmu = reservasiByAwb.get(String(awb).trim())
      if (trackinganSmu === undefined) return row
      return { ...row, trackingan_smu: trackinganSmu }
    })
  }

  private filterRowsByAlert(
    rows: Record<string, unknown>[],
    alertFilter: AlertFilter,
    nHours: number,
    mHours: number,
  ) {
    return rows
      .filter((row) => !AirShipmentsService.isVoidRow(row))
      .filter((row) => !AirShipmentsService.isExcludedForAlert(row, alertFilter))
      .filter((row) => {
        const alerts = evaluateAlerts(row, nHours, mHours)
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

    // Ensure table has a `date` column
    const colRes = await this.dataSource.query(`
      SELECT 1
      FROM ${tableName}
      WHERE extra_fields ? 'date'
      LIMIT 1
    `)
    if (!colRes || colRes.length === 0)
      throw new BadRequestException('Table does not have a date column')

    const res = await this.dataSource.query(
      `UPDATE "${tableName}" SET is_locked = $1, updated_at = NOW() 
      WHERE (NULLIF(extra_fields->>'date', ''))::timestamp BETWEEN $2::timestamp AND $3::timestamp RETURNING id`,
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

    // Ensure table has a `date` column
    const colRes = await this.dataSource.query(`
      SELECT 1
      FROM ${tableName}
      WHERE extra_fields ? 'date'
      LIMIT 1
    `)
    if (!colRes || colRes.length === 0)
      throw new BadRequestException('Table does not have a date column')

    const res = await this.dataSource.query(
      `DELETE FROM "${tableName}" WHERE (NULLIF(extra_fields->>'date', ''))::timestamp BETWEEN $1::timestamp AND $2::timestamp RETURNING id`,
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

  async findExcludedRows(
    tableName: string,
    query: ExcludedQueryDto,
  ): Promise<{ data: Record<string, unknown>[]; meta: { total: number; page: number; limit: number } }> {
    if (!/^air_shipments_[a-z0-9_]+$/.test(tableName)) {
      throw new BadRequestException('Invalid table name')
    }

    const { alertType, page = 1, limit = 50, startDate, endDate } = query
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
        `SELECT * FROM "${tableName}" ${whereSql} ORDER BY id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      this.dataSource.query(
        `SELECT count(*)::int FROM "${tableName}" ${whereSql}`,
        params
      ),
    ])

    const total = countRes?.[0]?.count ?? 0

    return { data, meta: { total, page, limit } }
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
