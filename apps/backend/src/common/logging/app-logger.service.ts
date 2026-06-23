import { Injectable, LoggerService } from '@nestjs/common'
import pino, { Logger as PinoLogger } from 'pino'
import { join } from 'path'
import { mkdirSync } from 'fs'

/**
 * Filename generator for rotating-file-stream.
 *
 * rotating-file-stream calls this with `(null)` for the active file name, and with
 * `(time, index)` for rotation targets, where `index` runs 1..999 in findName() until a
 * non-existent name is found.
 */
export function buildLogFilename(time: number | Date | null, index?: number): string {
  if (!time) return 'app.log'
  const date = new Date(time)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  // `index` (1..999) disambiguates multiple rotations on the same day (e.g. size-based
  // rotation). Without it, findName() can never locate a free name and throws RFS-TOO-MANY.
  // `.log.gz` matches the gzip-compressed output and LogArchiveService's archive filter.
  const seq = String(index ?? 1).padStart(2, '0')
  return `app-${yyyy}-${mm}-${dd}-${seq}.log.gz`
}

@Injectable()
export class AppLogger implements LoggerService {
  private readonly consoleLogger: PinoLogger
  private readonly fileLogger: PinoLogger

  constructor() {
    const level =
      process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info')

    // Ensure logs directory exists
    const logsDir = process.env.LOG_DIR || join(process.cwd(), 'logs')
    try {
      mkdirSync(logsDir, { recursive: true })
    } catch (_) {
      // ignore
    }

    // Create a daily rotating file stream using rotating-file-stream
    // We require dynamically to avoid TS type issues if types are not present
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rfs = require('rotating-file-stream')
    const fileStream = rfs.createStream(buildLogFilename, {
      interval: '1d',
      size: '50M',
      maxFiles: 90,
      path: logsDir,
      compress: 'gzip',
    })

    // Defense-in-depth: an unhandled 'error' event on this stream would otherwise crash the
    // whole process. Degrade logging to console instead of taking down the backend.
    fileStream.on('error', (err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[AppLogger] log file stream error (logging degraded to console):', err)
    })

    const timestamp = () => {
      const now = new Date()
      const y = now.getFullYear()
      const mo = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      const h = String(now.getHours()).padStart(2, '0')
      const mi = String(now.getMinutes()).padStart(2, '0')
      const s = String(now.getSeconds()).padStart(2, '0')
      return `,"time":"${y}-${mo}-${d} ${h}:${mi}:${s}"`
    }

    // Console logger (stdout)
    this.consoleLogger = pino({ level, timestamp })

    // File logger writes JSON to daily rotated files
    this.fileLogger = pino({ level, timestamp }, fileStream)
  }

  private writeToBoth(level: 'info' | 'error' | 'warn' | 'debug' | 'trace', obj: any, msg?: any) {
    // Console
    switch (level) {
      case 'info':
        this.consoleLogger.info(obj, msg)
        this.fileLogger.info(obj, msg)
        break
      case 'error':
        this.consoleLogger.error(obj, msg)
        this.fileLogger.error(obj, msg)
        break
      case 'warn':
        this.consoleLogger.warn(obj, msg)
        this.fileLogger.warn(obj, msg)
        break
      case 'debug':
        this.consoleLogger.debug(obj, msg)
        this.fileLogger.debug(obj, msg)
        break
      case 'trace':
        this.consoleLogger.trace(obj, msg)
        this.fileLogger.trace(obj, msg)
        break
    }
  }

  log(message: any, context?: string) {
    this.writeToBoth('info', { context }, message)
  }

  error(message: any, trace?: string, context?: string) {
    this.writeToBoth('error', { context, trace }, message)
  }

  warn(message: any, context?: string) {
    this.writeToBoth('warn', { context }, message)
  }

  debug(message: any, context?: string) {
    this.writeToBoth('debug', { context }, message)
  }

  verbose(message: any, context?: string) {
    this.writeToBoth('trace', { context }, message)
  }
}
