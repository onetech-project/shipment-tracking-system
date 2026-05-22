import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { join } from 'path'
import { readdir, access, unlink, constants } from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

@Injectable()
export class LogArchiveService {
  private readonly logger = new Logger(LogArchiveService.name)

  // Fires at 00:00 on the 1st of every month, Jakarta time
  @Cron('0 0 1 * *', { name: 'monthly-log-archive', timeZone: 'Asia/Jakarta' })
  async handleCron(): Promise<void> {
    try {
      await this.archivePreviousMonth()
    } catch (err: unknown) {
      this.logger.error(
        `Archive job failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      )
    }
  }

  async archivePreviousMonth(): Promise<void> {
    const logsDir = process.env.LOG_DIR || join(process.cwd(), 'logs')

    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const yyyy = String(prev.getFullYear())
    const mm = String(prev.getMonth() + 1).padStart(2, '0')
    const monthPrefix = `app-${yyyy}-${mm}-`

    let entries: string[]
    try {
      entries = await readdir(logsDir)
    } catch (err) {
      this.logger.warn(`Cannot read logsDir "${logsDir}": ${(err as Error).message}`)
      return
    }

    const dailyFiles = entries
      .filter(name => name.startsWith(monthPrefix) && name.endsWith('.log.gz'))
      .sort() // YYYY-MM-DD prefix → alphabetical == chronological

    if (dailyFiles.length === 0) {
      this.logger.warn(`No daily log files found for ${yyyy}-${mm} — skipping`)
      return
    }

    const archivePath = join(logsDir, `${yyyy}-${mm}.log.gz`)

    // Skip if archive already exists (handles service restart on the 1st)
    try {
      await access(archivePath, constants.F_OK)
      this.logger.warn(`Archive ${archivePath} already exists — skipping`)
      return
    } catch {
      // Does not exist — proceed
    }

    this.logger.log(`Archiving ${dailyFiles.length} files for ${yyyy}-${mm} → ${archivePath}`)

    // Concatenate raw bytes of each .gz file sequentially — valid per RFC 1952 gzip multistream
    const writeStream = createWriteStream(archivePath)
    try {
      for (const name of dailyFiles) {
        await pipeline(createReadStream(join(logsDir, name)), writeStream, { end: false })
      }
      writeStream.end()
      await new Promise<void>((resolve, reject) => {
        writeStream.once('finish', resolve)
        writeStream.once('error', reject)
      })
    } catch (err) {
      writeStream.destroy()
      try { await unlink(archivePath) } catch { /* ignore partial file */ }
      throw err
    }

    // Delete daily files only after the archive is fully written to disk
    const deleteErrors: string[] = []
    for (const name of dailyFiles) {
      try {
        await unlink(join(logsDir, name))
      } catch (err) {
        deleteErrors.push(`${name}: ${(err as Error).message}`)
      }
    }

    if (deleteErrors.length > 0) {
      this.logger.warn(`Some daily files could not be deleted:\n${deleteErrors.join('\n')}`)
    } else {
      this.logger.log(`Archive complete for ${yyyy}-${mm}`)
    }
  }
}
