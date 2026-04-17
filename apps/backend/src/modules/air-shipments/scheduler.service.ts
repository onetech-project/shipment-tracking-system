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
  // Per-table scheduling state
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private state: Map<string, { isSyncing: boolean; consecutiveSkips: number; isPaused: boolean }> =
    new Map()

  constructor(
    private readonly airShipmentsService: AirShipmentsService,
    private readonly schedulerRegistry: SchedulerRegistry
  ) {}

  // Using @Interval decorator for automatic scheduling; the method will be called every SYNC_INTERVAL_MS
  // can be disabled by config
  private currentIntervalMs?: number

  // Backwards-compatible global tick state (kept for tests)
  public isSyncing = false
  public consecutiveSkips = 0

  @OnEvent('gsheetConfig.ready') handleConfigReady(config: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.ready event, initializing scheduler...')
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

    // Create per-table intervals
    const intervalMs = (config?.syncInterval || 15) * 1000
    for (const sc of config.sheetConfigs ?? []) {
      this.addIntervalForTable(sc.tableName, intervalMs)
    }
    this.logger.log(
      `[scheduler] Initialized with ${this.intervals.size} per-table interval(s) at ${intervalMs}ms`
    )
  }

  private addIntervalForTable(tableName: string, intervalMs: number) {
    const key = `${INTERVAL_NAME}:${tableName}`
    // Remove existing interval if present
    try {
      if (this.schedulerRegistry.doesExist('interval', key)) {
        this.schedulerRegistry.deleteInterval(key)
      }
      if (this.intervals.has(tableName)) {
        clearInterval(this.intervals.get(tableName)!)
        this.intervals.delete(tableName)
        this.state.delete(tableName)
      }
    } catch (_) {
      // ignore
    }

    const intervalRef = setInterval(() => this.tickFor(tableName), intervalMs)
    this.schedulerRegistry.addInterval(key, intervalRef)
    this.intervals.set(tableName, intervalRef)
    this.state.set(tableName, { isSyncing: false, consecutiveSkips: 0, isPaused: false })
  }

  private async tickFor(tableName: string): Promise<void> {
    const st = this.state.get(tableName) ?? {
      isSyncing: false,
      consecutiveSkips: 0,
      isPaused: false,
    }

    if (st.isSyncing) {
      st.consecutiveSkips++
      this.logger.warn(
        `[scheduler:${tableName}] Sync still in progress — skip #${st.consecutiveSkips}`
      )
      // Pause the interval after 2 consecutive skips
      if (st.consecutiveSkips >= 2 && !st.isPaused) {
        st.isPaused = true
        try {
          const key = `${INTERVAL_NAME}:${tableName}`
          this.schedulerRegistry.deleteInterval(key)
          this.logger.warn(`[scheduler:${tableName}] Paused interval after 2 consecutive skips`)
        } catch (_err) {
          // ignore
        }
      }
      this.state.set(tableName, st)
      return
    }

    st.isSyncing = true
    const wasPaused = st.isPaused
    const startedAt = Date.now()
    this.logger.log(`[scheduler:${tableName}] Starting sync`)

    try {
      await this.airShipmentsService.runSyncForTable(tableName)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[scheduler:${tableName}] Sync failed: ${message}`)
    } finally {
      const durationMs = Date.now() - startedAt
      this.logger.log(`[scheduler:${tableName}] Sync finished in ${durationMs}ms`)
      st.isSyncing = false
      st.consecutiveSkips = 0

      // Resume interval if it was paused
      if (wasPaused) {
        st.isPaused = false
        // Re-create interval with existing timing by reading registry or using default
        // The caller that paused must ensure re-adding; for simplicity, we re-add with same timing by retrieving interval name
        try {
          const key = `${INTERVAL_NAME}:${tableName}`
          if (!this.schedulerRegistry.doesExist('interval', key)) {
            const intervalRef = setInterval(() => this.tickFor(tableName), 1000 * 15)
            this.schedulerRegistry.addInterval(key, intervalRef)
            this.intervals.set(tableName, intervalRef)
            this.logger.log(`[scheduler:${tableName}] Interval resumed`)
          }
        } catch (_err) {
          // ignore
        }
      }
      this.state.set(tableName, st)
    }
  }

  // legacy tick() removed in favor of per-table tickFor()

  // Backwards-compatible tick() — runs a global sync cycle (used by tests)
  async tick(): Promise<void> {
    if (this.isSyncing) {
      this.consecutiveSkips++
      this.logger.warn(`[scheduler] Sync still in progress — skip #${this.consecutiveSkips}`)
      if (this.consecutiveSkips >= 2) {
        try {
          // Legacy interval name (global)
          if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
            this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
          }
        } catch (_err) {
          // ignore
        }
      }
      return
    }

    this.isSyncing = true
    try {
      await this.airShipmentsService.runSyncCycle()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`[scheduler] Sync failed: ${message}`)
    } finally {
      this.isSyncing = false
      this.consecutiveSkips = 0
    }
  }

  onApplicationShutdown(): void {
    this.logger.log('[scheduler] Shutting down — stopping all sync intervals')
    // Attempt to delete any legacy/global interval name as well for compatibility
    try {
      if (this.schedulerRegistry.doesExist('interval', INTERVAL_NAME)) {
        this.schedulerRegistry.deleteInterval(INTERVAL_NAME)
      }
    } catch (_err) {
      // ignore
    }
    for (const [tableName, intervalRef] of this.intervals.entries()) {
      try {
        const key = `${INTERVAL_NAME}:${tableName}`
        if (this.schedulerRegistry.doesExist('interval', key))
          this.schedulerRegistry.deleteInterval(key)
      } catch (_err) {
        // ignore
      }
      try {
        clearInterval(intervalRef)
      } catch (_err) {
        // ignore
      }
    }
    this.intervals.clear()
    this.state.clear()
  }

  @OnEvent('gsheetConfig.updated') handleConfigUpdate(newConfig: GoogleSheetConfig) {
    this.logger.log('Received gsheetConfig.updated event, updating scheduler config...')
    if (!newConfig) {
      this.logger.warn('No Google Sheet config found during scheduler update')
      return
    }
    if (!newConfig.enabled) {
      this.logger.warn('Google Sheet sync disabled in config, stopping all scheduler intervals')
      // Stop all intervals
      for (const tableName of Array.from(this.intervals.keys())) {
        try {
          const key = `${INTERVAL_NAME}:${tableName}`
          if (this.schedulerRegistry.doesExist('interval', key))
            this.schedulerRegistry.deleteInterval(key)
        } catch (_err) {
          // ignore
        }
        try {
          clearInterval(this.intervals.get(tableName)!)
        } catch (_err) {
          // ignore
        }
        this.intervals.delete(tableName)
        this.state.delete(tableName)
      }
      return
    }

    const newIntervalMs = (newConfig.syncInterval || 15) * 1000
    const newTables = new Set((newConfig.sheetConfigs ?? []).map((s) => s.tableName))

    // Remove intervals for tables that no longer exist
    for (const existingTable of Array.from(this.intervals.keys())) {
      if (!newTables.has(existingTable)) {
        try {
          const key = `${INTERVAL_NAME}:${existingTable}`
          if (this.schedulerRegistry.doesExist('interval', key))
            this.schedulerRegistry.deleteInterval(key)
        } catch (_err) {
          // ignore
        }
        try {
          clearInterval(this.intervals.get(existingTable)!)
        } catch (_err) {
          // ignore
        }
        this.intervals.delete(existingTable)
        this.state.delete(existingTable)
      }
    }

    // Add or update intervals for tables in the new config
    for (const tableName of newTables) {
      // If interval exists but timing changed, re-add with new timing
      if (!this.intervals.has(tableName) || this.currentIntervalMs !== newIntervalMs) {
        this.addIntervalForTable(tableName, newIntervalMs)
      }
    }

    this.currentIntervalMs = newIntervalMs
  }
}
