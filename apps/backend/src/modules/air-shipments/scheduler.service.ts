import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Interval, SchedulerRegistry } from '@nestjs/schedule';
import { AirShipmentsService } from './air-shipments.service';

const INTERVAL_NAME = 'air-shipments-sync';
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? '15000', 10);

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
  private readonly logger = new Logger(SchedulerService.name);
  private isSyncing = false;
  private consecutiveSkips = 0;
  private isPaused = false;

  constructor(
    private readonly airShipmentsService: AirShipmentsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  @Interval(INTERVAL_NAME, SYNC_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.isSyncing) {
      this.consecutiveSkips++;
      this.logger.warn(
        `[scheduler] Sync still in progress — skip #${this.consecutiveSkips}`,
      );

      if (this.consecutiveSkips >= 2 && !this.isPaused) {
        this.isPaused = true;
        try {
          this.schedulerRegistry.deleteInterval(INTERVAL_NAME);
          this.logger.warn('[scheduler] Paused interval after 2 consecutive skips');
        } catch (_err) {
          // Interval may already be deleted; ignore
        }
      }
      return;
    }

    this.isSyncing = true;
    const waspaused = this.isPaused;
    const startedAt = Date.now();
    this.logger.log('[scheduler] Starting sync cycle');

    try {
      await this.airShipmentsService.runSyncCycle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[scheduler] Sync cycle failed: ${message}`, err instanceof Error ? err.stack : undefined);
    } finally {
      const durationMs = Date.now() - startedAt;
      this.logger.log(`[scheduler] Sync cycle finished in ${durationMs}ms`);
      this.isSyncing = false;
      this.consecutiveSkips = 0;

      // Resume the interval if it was paused
      if (waspaused) {
        this.isPaused = false;
        const intervalRef = setInterval(() => this.tick(), SYNC_INTERVAL_MS);
        try {
          this.schedulerRegistry.addInterval(INTERVAL_NAME, intervalRef);
          this.logger.log('[scheduler] Interval resumed');
        } catch (_err) {
          // Interval may already exist; ignore
        }
      }
    }
  }

  onApplicationShutdown(): void {
    this.logger.log('[scheduler] Shutting down — stopping sync interval');
    try {
      this.schedulerRegistry.deleteInterval(INTERVAL_NAME);
    } catch (_err) {
      // Interval may not exist if already deleted; ignore
    }
  }
}
