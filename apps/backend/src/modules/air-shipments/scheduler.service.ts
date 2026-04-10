import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { AirShipmentsService } from './air-shipments.service'
import { OnEvent } from '@nestjs/event-emitter'
import { GoogleSheetConfig } from './entities/google-sheet-config.entity'

const INTERVAL_NAME = 'air-shipments-sync'
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
  private isSyncing = false
  private consecutiveSkips = 0
  private isPaused = false

  constructor(
    private readonly airShipmentsService: AirShipmentsService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  // Using @Interval decorator for automatic scheduling; the method will be called every SYNC_INTERVAL_MS
  // can be disabled by config
  private INTERVAL_SYNC_MS // Default to 15 seconds if not set

  @OnEvent('gsheetConfig.ready') handleConfigReady(config: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.ready event, initializing scheduler...')
    if (!config) {
      this.logger.warn('No Google Sheet config found during scheduler initialization')
      return
    }

    this.INTERVAL_SYNC_MS = (config?.syncInterval || 15) * 1000

    if (!config.enabled) {
      this.logger.warn(
        '[scheduler] Google Sheets integration is disabled — scheduler will not start'
      )
      return
    }

    const intervalRef = setInterval(() => this.tick(), this.INTERVAL_SYNC_MS)
    this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
    this.logger.log(`[scheduler] Initialized with interval of ${this.INTERVAL_SYNC_MS}ms`)
  }

  async tick(): Promise<void> {
    if (this.isSyncing) {
      this.consecutiveSkips++
      this.logger.warn(`[scheduler] Sync still in progress — skip #${this.consecutiveSkips}`)

      if (this.consecutiveSkips >= 2 && !this.isPaused) {
        this.isPaused = true
        try {
          this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
          this.logger.warn('[scheduler] Paused interval after 2 consecutive skips')
        } catch (_err) {
          // Interval may already be deleted; ignore
        }
      }
      return
    }

    this.isSyncing = true
    const waspaused = this.isPaused
    const startedAt = Date.now()
    this.logger.log('[scheduler] Starting sync cycle')

    try {
      await this.airShipmentsService.runSyncCycle()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(
        `[scheduler] Sync cycle failed: ${message}`,
        err instanceof Error ? err.stack : undefined
      )
    } finally {
      const durationMs = Date.now() - startedAt
      this.logger.log(`[scheduler] Sync cycle finished in ${durationMs}ms`)
      this.isSyncing = false
      this.consecutiveSkips = 0

      // Resume the interval if it was paused
      if (waspaused) {
        this.isPaused = false
        const intervalRef = setInterval(() => this.tick(), this.INTERVAL_SYNC_MS)
        try {
          this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
          this.logger.log('[scheduler] Interval resumed')
        } catch (_err) {
          // Interval may already exist; ignore
        }
      }
    }
  }

  onApplicationShutdown(): void {
    this.logger.log('[scheduler] Shutting down — stopping sync interval')
    try {
      this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
    } catch (_err) {
      // Interval may not exist if already deleted; ignore
    }
  }

  @OnEvent('gsheetConfig.updated') handleConfigUpdate(newConfig: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.updated event, updating scheduler config...')
    if (!newConfig) {
      this.logger.warn('No Google Sheet config found during scheduler update')
      return
    }

    if (!newConfig.enabled) {
      this.logger.warn('Google Sheet sync disabled in config, stopping scheduler')
      try {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
        this.logger.log('[scheduler] Interval stopped due to config update')
      } catch (_err) {
        // Interval may already be deleted; ignore
      }
      return
    }

    const newIntervalMs = (newConfig.syncInterval || 15) * 1000
    if (newIntervalMs === this.INTERVAL_SYNC_MS) {
      this.logger.log('Sync interval unchanged, no update needed')
      return
    }

    // Update the interval timing by restarting the interval with the new timing
    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
      }
      const intervalRef = setInterval(() => this.tick(), newIntervalMs)
      this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef)
      this.logger.log(`[scheduler] Sync interval updated to ${newIntervalMs}ms`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[scheduler] Failed to update sync interval: ${message}`)
    }
  }
}
