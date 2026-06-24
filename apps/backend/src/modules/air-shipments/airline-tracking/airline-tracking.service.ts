import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { DataSource } from 'typeorm'
import { firstValueFrom } from 'rxjs'
import { GeneralParamsService } from '../../general-params/general-params.service'
import { AirShipmentsService } from '../air-shipments.service'
import { AirlineTrackingSourceService, AirlineSource } from './airline-tracking-source.service'
import { coerceTrackingPayload, parseTracking, splitAwb, toTrackingRow } from './airline-tracking.parser'

const RESULTS_TABLE = 'air_shipments_awb_flight_tracking'
const RETRY_DELAYS_MS = [1000, 3000]
const HTTP_TIMEOUT_MS = 15_000

export interface RefreshSummary {
  attempted: number
  ok: number
  failed: number
  offloads: number
  capped: boolean
}

/**
 * Fetches actual departure (DEP) legs from airline tracking APIs for the
 * config-driven carriers (126/888/778 by default) and stores a computed offload
 * flag per AWB. Drives the Flight Tracking alert for those carriers; non-API
 * carriers keep the sheet-based offload.
 */
@Injectable()
export class AirlineTrackingService {
  private readonly logger = new Logger(AirlineTrackingService.name)

  constructor(
    private readonly http: HttpService,
    private readonly dataSource: DataSource,
    private readonly sources: AirlineTrackingSourceService,
    private readonly generalParams: GeneralParamsService,
    private readonly airShipments: AirShipmentsService,
  ) {}

  /** Substitutes {awbNo}/{carrierCode} (and <AWBno>/<CarrierCode>) placeholders. */
  private fill(template: string, awbNo: string, carrierCode: string): string {
    return String(template)
      .replace(/\{awbNo\}|<AWBno>/gi, awbNo)
      .replace(/\{carrierCode\}|<CarrierCode>/gi, carrierCode)
  }

  private buildUrl(source: AirlineSource, awbNo: string, carrierCode: string): string {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(source.payload ?? {})) {
      params.append(k, this.fill(String(v), awbNo, carrierCode))
    }
    const qs = params.toString()
    return qs ? `${source.url}?${qs}` : source.url
  }

  private async httpGetWithRetry(url: string): Promise<unknown> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
      try {
        const res = await firstValueFrom(
          this.http.get(url, { timeout: HTTP_TIMEOUT_MS, responseType: 'json' })
        )
        return res.data
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr
  }

  /** Fetch + parse + upsert a single AWB. Returns the computed offload (or null on failure). */
  async fetchOne(awb: string, sourceByCarrier?: Map<string, AirlineSource>): Promise<boolean | null> {
    const split = splitAwb(awb)
    if (!split) return null
    const { carrierCode, awbNo } = split

    const source = sourceByCarrier
      ? sourceByCarrier.get(carrierCode)
      : (await this.sources.getByCarrier(carrierCode)) ?? undefined
    if (!source || !source.enabled) return null

    try {
      const data = await this.httpGetWithRetry(this.buildUrl(source, awbNo, carrierCode))
      const parsed = parseTracking(coerceTrackingPayload(data))
      const row = toTrackingRow(awb, carrierCode, parsed)
      await this.upsert(row, true, null, parsed.depLegs.length ? data : null)
      return parsed.offload
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`[AirlineTracking] fetch failed for ${awb}: ${message}`)
      // Record the failure but keep any previously stored DEP/offload values.
      await this.dataSource.query(
        `UPDATE "${RESULTS_TABLE}" SET http_ok = false, error = $2, fetched_at = now(), updated_at = now() WHERE awb = $1`,
        [awb, message.slice(0, 500)]
      )
      return null
    }
  }

  private async upsert(
    row: Record<string, string | boolean | null>,
    httpOk: boolean,
    error: string | null,
    raw: unknown,
  ): Promise<void> {
    const cols = [
      'awb', 'carrier_code', 'std_booking', 'std_flight_no', 'actual_flight_dep', 'dep_flight_no',
      'dep2', 'dep2_flight_no', 'dep3', 'dep3_flight_no', 'dep4', 'dep4_flight_no',
      'dep5', 'dep5_flight_no', 'offload',
    ]
    const values = cols.map((c) => row[c] ?? null)
    values.push(httpOk, error, raw == null ? null : JSON.stringify(raw))
    const placeholders = [
      ...cols.map((_, i) => `$${i + 1}`),
      `$${cols.length + 1}`,            // http_ok
      `$${cols.length + 2}`,            // error
      `$${cols.length + 3}::jsonb`,     // raw
      'now()',                          // fetched_at
    ].join(', ')
    const updateSet = [
      ...cols.filter((c) => c !== 'awb').map((c) => `"${c}" = EXCLUDED."${c}"`),
      'http_ok = EXCLUDED.http_ok',
      'error = EXCLUDED.error',
      'raw = EXCLUDED.raw',
      'fetched_at = EXCLUDED.fetched_at',
      'updated_at = now()',
    ].join(', ')
    await this.dataSource.query(
      `INSERT INTO "${RESULTS_TABLE}" (${cols.join(', ')}, http_ok, error, raw, fetched_at)
       VALUES (${placeholders})
       ON CONFLICT (awb) DO UPDATE SET ${updateSet}`,
      values
    )
  }

  /** Periodic refresh of recent, active AWBs for the enabled API carriers. */
  async refreshRecentActive(): Promise<RefreshSummary> {
    const summary: RefreshSummary = { attempted: 0, ok: 0, failed: 0, offloads: 0, capped: false }

    if ((await this.generalParams.getValue('airline_tracking_enabled', 'true')) === 'false') {
      return summary
    }

    const enabled = await this.sources.getEnabled()
    if (!enabled.length) return summary
    const sourceByCarrier = new Map(enabled.map((s) => [s.carrier_code, s]))
    const carrierCodes = enabled.map((s) => s.carrier_code)

    const lookbackDays = this.toInt(await this.generalParams.getValue('airline_tracking_lookback_days', '14'), 14)
    const maxPerCycle = this.toInt(await this.generalParams.getValue('airline_tracking_max_per_cycle', '500'), 500)
    const concurrency = Math.max(1, this.toInt(await this.generalParams.getValue('airline_tracking_concurrency', '5'), 5))

    let targets: { awb: string }[]
    try {
      targets = await this.dataSource.query(
        `SELECT DISTINCT awb FROM air_shipments_compileaircgk
         WHERE awb IS NOT NULL AND BTRIM(awb) <> ''
           AND split_part(awb, '-', 1) = ANY($1::text[])
           AND parse_flexible_timestamp(extra_fields->>'atd_origin') >= now() - ($2 || ' days')::interval
         ORDER BY awb
         LIMIT $3`,
        [carrierCodes, String(lookbackDays), maxPerCycle + 1]
      )
    } catch (err) {
      this.logger.error(
        `[AirlineTracking] failed to select target AWBs: ${err instanceof Error ? err.message : String(err)}`
      )
      return summary
    }

    if (targets.length > maxPerCycle) {
      summary.capped = true
      targets = targets.slice(0, maxPerCycle)
      this.logger.warn(
        `[AirlineTracking] target list capped at ${maxPerCycle}; some recent AWBs skipped this cycle`
      )
    }

    const awbs = targets.map((t) => t.awb)
    summary.attempted = awbs.length
    if (!awbs.length) return summary

    let cursor = 0
    const worker = async () => {
      while (cursor < awbs.length) {
        const awb = awbs[cursor++]
        const result = await this.fetchOne(awb, sourceByCarrier)
        if (result === null) summary.failed++
        else {
          summary.ok++
          if (result) summary.offloads++
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, awbs.length) }, () => worker()))

    // Refresh the offload alert so cards/list reflect the new DEP data immediately.
    this.airShipments.evictOffloadCache()
    this.logger.log(
      `[AirlineTracking] refreshed ${summary.ok}/${summary.attempted} AWBs (${summary.offloads} offload, ${summary.failed} failed${summary.capped ? ', capped' : ''})`
    )
    return summary
  }

  private toInt(v: string, fallback: number): number {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
}
