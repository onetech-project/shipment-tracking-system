import { Injectable, LoggerService } from '@nestjs/common'
import pino, { Logger as PinoLogger } from 'pino'
import { join } from 'path'
import { mkdirSync } from 'fs'

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
    const fileStream = rfs.createStream(
      (time: any) => {
        if (!time) return 'app.log'
        const date = new Date(time)
        const yyyy = date.getFullYear()
        const mm = String(date.getMonth() + 1).padStart(2, '0')
        const dd = String(date.getDate()).padStart(2, '0')
        return `app-${yyyy}-${mm}-${dd}.log`
      },
      { interval: '1d', path: logsDir, compress: 'gzip' }
    )

    // Console logger (stdout)
    this.consoleLogger = pino({ level })

    // File logger writes JSON to daily rotated files
    this.fileLogger = pino({ level }, fileStream)
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
