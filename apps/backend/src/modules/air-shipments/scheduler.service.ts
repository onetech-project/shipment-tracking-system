import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { AirShipmentsService } from './air-shipments.service'
import { OnEvent } from '@nestjs/event-emitter'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'
import { DynamicTableService } from './dynamic-table.service'
import { config } from 'googleapis/build/src/apis/config'

/**
 * Concurrency-safe polling scheduler (US4 / FR-001–FR-005).
 *
 * - Runs `AirShipmentsService.runSyncCycle()` every SYNC_INTERVAL_MS.
 * - Skips a tick when a previous cycle is still running.
 * - Self-pauses after 2 consecutive skips, then resumes after the in-flight cycle completes.
 * - Stops cleanly on application shutdown.
 */
@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name)

  // Per-table scheduling state
  private intervals: Map<string, number> = new Map()
  private state: Map<string, { isSyncing: boolean; consecutiveSkips: number; isPaused: boolean }> =
    new Map()

  constructor(
    private readonly airShipmentsService: AirShipmentsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly dynamicTableService: DynamicTableService
  ) {}

  @OnEvent('gsheetConfig.ready') handleConfigReady(configs: GoogleSheetConfig[]) {
    this.logger.log('Received gsheetConfig.ready event, initializing scheduler...')
    configs.forEach((config) => {
      if (!config) {
        this.logger.warn('No Google Sheet config found during scheduler initialization')
        return
      }

      if (!config.enabled) {
        this.logger.warn(
          '[scheduler] Google Sheets integration is disabled — scheduler will not start'
        )
        return
      }

      const INTERVAL_NAME = `air_shipments_sync:${config.sheetId}`
      const INTERVAL_SYNC_MS = (config?.syncInterval || 15) * 1000

      this.intervals.set(config.sheetId, INTERVAL_SYNC_MS)
      this.state.set(config.sheetId, { isSyncing: false, consecutiveSkips: 0, isPaused: false })

      // ensure table schemas are loaded before starting the scheduler
      void Promise.allSettled(
        config.sheetConfigs.map((s) => this.dynamicTableService.ensureTable(s as any))
      )

      const intervalRef = setInterval(() => this.tick(config.sheetId), INTERVAL_SYNC_MS)
      this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
      this.logger.log(
        `[scheduler] Interval ${INTERVAL_NAME} initialized with interval of ${INTERVAL_SYNC_MS}ms`
      )
    })
  }

  async tick(sheetId: string): Promise<void> {
    const state = this.state.get(sheetId)
    if (!state) {
      this.logger.warn(`[scheduler] No state found for sheetId: ${sheetId}`)
      return
    }

    if (state.isSyncing) {
      state.consecutiveSkips++
      this.logger.warn(
        `[scheduler] Sync for sheetId ${sheetId} still in progress — skip #${state.consecutiveSkips}`
      )

      if (state.consecutiveSkips >= 2 && !state.isPaused) {
        state.isPaused = true
        try {
          const INTERVAL_NAME = `air_shipments_sync:${sheetId}`
          this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
          this.logger.warn(`[scheduler] Interval ${INTERVAL_NAME} paused after 2 consecutive skips`)
        } catch (_err) {
          // Interval may already be deleted; ignore
        }
      }
      return
    }

    state.isSyncing = true
    const waspaused = state.isPaused
    const startedAt = Date.now()
    this.logger.log(`[scheduler] Starting sync cycle for sheetId ${sheetId}`)

    try {
      await this.airShipmentsService.runSyncCycle(sheetId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `[scheduler] Sync cycle failed for sheetId ${sheetId}: ${message}`,
        err instanceof Error ? err.stack : undefined
      )
    } finally {
      const durationMs = Date.now() - startedAt
      this.logger.log(`[scheduler] Sync cycle finished for sheetId ${sheetId} in ${durationMs}ms`)
      state.isSyncing = false
      state.consecutiveSkips = 0

      // Resume the interval if it was paused
      if (waspaused) {
        state.isPaused = false
        const INTERVAL_NAME = `air_shipments_sync:${sheetId}`
        const intervalRef = setInterval(() => this.tick(sheetId), this.intervals.get(sheetId))
        try {
          this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
          this.logger.log(`[scheduler] Interval ${INTERVAL_NAME} resumed`)
        } catch (_err) {
          // Interval may already exist; ignore
        }
      }
    }
  }

  onApplicationShutdown(): void {
    this.logger.log('[scheduler] Shutting down — stopping sync intervals')
    this.intervals.forEach((_interval, sheetId) => {
      const INTERVAL_NAME = `air_shipments_sync:${sheetId}`
      try {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
      } catch (_err) {
        // Interval may not exist if already deleted; ignore
      }
    })
  }

  @OnEvent('gsheetConfig.created') handleConfigCreate(newConfig: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.created event, updating scheduler config...')
    if (!newConfig.enabled) {
      this.logger.warn(
        'Google Sheet sync disabled in config, skipping scheduler start for sheetId: ' +
          newConfig.sheetId
      )
      return
    }

    const INTERVAL_NAME = `air_shipments_sync:${newConfig.sheetId}`
    const INTERVAL_SYNC_MS = (newConfig.syncInterval || 15) * 1000

    this.intervals.set(newConfig.sheetId, INTERVAL_SYNC_MS)
    this.state.set(newConfig.sheetId, { isSyncing: false, consecutiveSkips: 0, isPaused: false })

    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
      }
      const intervalRef = setInterval(() => this.tick(newConfig.sheetId), INTERVAL_SYNC_MS)
      this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
      this.logger.log(`[scheduler] Interval ${INTERVAL_NAME} started with ${INTERVAL_SYNC_MS}ms`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[scheduler] Failed to start sync interval ${INTERVAL_NAME}: ${message}`)
    }
  }

  @OnEvent('gsheetConfig.deleted') handleConfigChange(config: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.deleted event, updating scheduler config...')
    const INTERVAL_NAME = `air_shipments_sync:${config.sheetId}`
    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
        this.logger.log(`[scheduler] Interval ${INTERVAL_NAME} deleted due to config deletion`)
      }
    } catch (_err) {
      // Interval may already be deleted; ignore
    }
  }

  @OnEvent('gsheetConfig.updated') handleConfigUpdate(newConfig: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.updated event, updating scheduler config...')
    const INTERVAL_NAME = `air_shipments_sync:${newConfig.sheetId}`
    if (!newConfig) {
      this.logger.warn('No Google Sheet config found during scheduler update')
      return
    }

    if (!newConfig.enabled) {
      this.logger.warn(
        'Google Sheet sync disabled in config, stopping scheduler with name: ' + INTERVAL_NAME
      )
      try {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
        this.logger.log(`[scheduler] Interval ${INTERVAL_NAME} stopped due to config update`)
      } catch (_err) {
        // Interval may already be deleted; ignore
      }
      return
    }

    const newIntervalMs = (newConfig.syncInterval || 15) * 1000
    if (newIntervalMs === this.intervals.get(newConfig.sheetId)) {
      this.logger.log(`[scheduler] Interval ${INTERVAL_NAME} unchanged, no update needed`)
      return
    }

    // Update the interval timing by restarting the interval with the new timing
    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
      }
      const intervalRef = setInterval(() => this.tick(newConfig.sheetId), newIntervalMs)
      this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
      this.logger.log(`[scheduler] Interval ${INTERVAL_NAME} updated to ${newIntervalMs}ms`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[scheduler] Failed to update interval ${INTERVAL_NAME}: ${message}`)
    }
  }
}
