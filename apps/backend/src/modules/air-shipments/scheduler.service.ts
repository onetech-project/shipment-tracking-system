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
  private labels: Map<string, string> = new Map()
  private state: Map<string, { isSyncing: boolean; consecutiveSkips: number; isPaused: boolean }> =
    new Map()
  // Tracks the sheetId currently associated with each config id so we can clean up
  // stale intervals when the sheet link (sheetId) changes on an update.
  private configIdToSheetId: Map<string, string> = new Map()

  private label(sheetId: string): string {
    return this.labels.get(sheetId) ?? sheetId
  }

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

      this.labels.set(config.sheetId, config.label)
      this.intervals.set(config.sheetId, INTERVAL_SYNC_MS)
      this.state.set(config.sheetId, { isSyncing: false, consecutiveSkips: 0, isPaused: false })
      this.configIdToSheetId.set(config.id, config.sheetId)

      // ensure table schemas are loaded before starting the scheduler
      void Promise.allSettled(
        config.sheetConfigs.map((s) => this.dynamicTableService.ensureTable(s as any))
      )

      const intervalRef = setInterval(() => this.tick(config.sheetId), INTERVAL_SYNC_MS)
      this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
      this.logger.log(`[scheduler] "${config.label}" initialized (${INTERVAL_SYNC_MS}ms)`)
    })
  }

  async tick(sheetId: string): Promise<void> {
    const state = this.state.get(sheetId)
    if (!state) {
      this.logger.warn(`[scheduler] No state found for "${this.label(sheetId)}"`)
      return
    }

    if (state.isSyncing) {
      state.consecutiveSkips++
      this.logger.warn(
        `[scheduler] "${this.label(sheetId)}" sync still in progress — skip #${state.consecutiveSkips}`
      )

      if (state.consecutiveSkips >= 2 && !state.isPaused) {
        state.isPaused = true
        try {
          const INTERVAL_NAME = `air_shipments_sync:${sheetId}`
          this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
          this.logger.warn(`[scheduler] "${this.label(sheetId)}" paused after 2 consecutive skips`)
        } catch (_err) {
          // Interval may already be deleted; ignore
        }
      }
      return
    }

    state.isSyncing = true
    const startedAt = Date.now()
    this.logger.log(`[scheduler] Starting sync for "${this.label(sheetId)}"`)

    try {
      await this.airShipmentsService.runSyncCycle(sheetId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `[scheduler] Sync failed for "${this.label(sheetId)}": ${message}`,
        err instanceof Error ? err.stack : undefined
      )
    } finally {
      const durationMs = Date.now() - startedAt
      this.logger.log(`[scheduler] Sync finished for "${this.label(sheetId)}" in ${durationMs}ms`)
      state.isSyncing = false
      state.consecutiveSkips = 0

      // If the interval was paused while this sync was running, re-add it now
      if (state.isPaused) {
        state.isPaused = false
        const INTERVAL_NAME = `air_shipments_sync:${sheetId}`
        const intervalRef = setInterval(() => this.tick(sheetId), this.intervals.get(sheetId))
        try {
          this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
          this.logger.log(`[scheduler] "${this.label(sheetId)}" resumed`)
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
    this.labels.set(newConfig.sheetId, newConfig.label)

    if (!newConfig.enabled) {
      this.logger.warn(`[scheduler] "${newConfig.label}" disabled — skipping start`)
      return
    }

    const INTERVAL_NAME = `air_shipments_sync:${newConfig.sheetId}`
    const INTERVAL_SYNC_MS = (newConfig.syncInterval || 15) * 1000

    this.intervals.set(newConfig.sheetId, INTERVAL_SYNC_MS)
    this.state.set(newConfig.sheetId, { isSyncing: false, consecutiveSkips: 0, isPaused: false })
    this.configIdToSheetId.set(newConfig.id, newConfig.sheetId)

    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
      }
      const intervalRef = setInterval(() => this.tick(newConfig.sheetId), INTERVAL_SYNC_MS)
      this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
      this.logger.log(`[scheduler] "${newConfig.label}" started (${INTERVAL_SYNC_MS}ms)`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[scheduler] Failed to start "${newConfig.label}": ${message}`)
    }
  }

  @OnEvent('gsheetConfig.deleted') handleConfigChange(payload: { id: string; sheetId: string }) {
    this.logger.log('Received gsheetConfig.deleted event, updating scheduler config...')
    const lbl = this.label(payload.sheetId)
    const INTERVAL_NAME = `air_shipments_sync:${payload.sheetId}`
    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
        this.logger.log(`[scheduler] "${lbl}" deleted`)
      }
    } catch (_err) {
      // Interval may already be deleted; ignore
    }
    this.labels.delete(payload.sheetId)
    this.intervals.delete(payload.sheetId)
    this.state.delete(payload.sheetId)
    this.configIdToSheetId.delete(payload.id)
  }

  @OnEvent('gsheetConfig.updated') handleConfigUpdate(newConfig: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.updated event, updating scheduler config...')
    if (!newConfig) {
      this.logger.warn('No Google Sheet config found during scheduler update')
      return
    }

    // If the sheet link changed, tear down the stale interval registered under the old sheetId.
    const oldSheetId = this.configIdToSheetId.get(newConfig.id)
    if (oldSheetId && oldSheetId !== newConfig.sheetId) {
      const oldIntervalName = `air_shipments_sync:${oldSheetId}`
      try {
        if (this.schedulerRegistry.doesExist('interval', oldIntervalName)) {
          this.schedulerRegistry.deleteInterval(oldIntervalName)
          this.logger.log(
            `[scheduler] "${this.label(oldSheetId)}" old interval removed (sheetId changed)`
          )
        }
      } catch (_err) {}
      this.labels.delete(oldSheetId)
      this.intervals.delete(oldSheetId)
      this.state.delete(oldSheetId)
    }

    this.labels.set(newConfig.sheetId, newConfig.label)
    this.configIdToSheetId.set(newConfig.id, newConfig.sheetId)
    const INTERVAL_NAME = `air_shipments_sync:${newConfig.sheetId}`

    if (!newConfig.enabled) {
      this.logger.warn(`[scheduler] "${newConfig.label}" disabled — stopping`)
      try {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
        this.logger.log(`[scheduler] "${newConfig.label}" stopped due to config update`)
      } catch (_err) {
        // Interval may already be deleted; ignore
      }
      return
    }

    const newIntervalMs = (newConfig.syncInterval || 15) * 1000
    this.intervals.set(newConfig.sheetId, newIntervalMs)

    // Always restart the interval on any config update so that:
    // - config field changes (sheetName, tableName, etc.) are picked up immediately
    // - any paused state from consecutive skips is cleared
    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
      }
      const intervalRef = setInterval(() => this.tick(newConfig.sheetId), newIntervalMs)
      this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)

      const currentState = this.state.get(newConfig.sheetId)
      if (currentState?.isSyncing) {
        currentState.isPaused = false
        currentState.consecutiveSkips = 0
      } else {
        this.state.set(newConfig.sheetId, { isSyncing: false, consecutiveSkips: 0, isPaused: false })
      }

      this.logger.log(`[scheduler] "${newConfig.label}" restarted (${newIntervalMs}ms)`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[scheduler] Failed to restart "${newConfig.label}": ${message}`)
    }
  }
}
