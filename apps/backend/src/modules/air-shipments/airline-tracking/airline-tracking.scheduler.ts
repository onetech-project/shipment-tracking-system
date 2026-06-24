import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { AirlineTrackingService } from './airline-tracking.service'

/**
 * Periodic airline-API DEP refresh. Runs every 15 minutes; self-skips when a
 * previous cycle is still in flight. Enable/scope/concurrency are general-params
 * read inside refreshRecentActive (airline_tracking_enabled, *_lookback_days, etc.).
 */
@Injectable()
export class AirlineTrackingScheduler {
  private readonly logger = new Logger(AirlineTrackingScheduler.name)
  private running = false

  constructor(private readonly service: AirlineTrackingService) {}

  @Cron('0 */15 * * * *', { name: 'airline-tracking-refresh' })
  async handle(): Promise<void> {
    if (this.running) {
      this.logger.warn('[AirlineTracking] previous refresh still running — skipping this tick')
      return
    }
    this.running = true
    try {
      await this.service.refreshRecentActive()
    } catch (err) {
      this.logger.error(
        `[AirlineTracking] refresh cycle failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined
      )
    } finally {
      this.running = false
    }
  }
}
