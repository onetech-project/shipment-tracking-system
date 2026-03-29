import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Job } from 'bullmq'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import * as pdfParse from 'pdf-parse'
import { Shipment } from '../entities/shipment.entity'
import { ShipmentUpload, UploadStatus } from '../entities/shipment-upload.entity'
import { ShipmentUploadError, UploadErrorType } from '../entities/shipment-upload-error.entity'
import { ShipmentRowDto } from './dto/shipment-row.dto'
import { LinehaulParserService, LINEHAUL_MARKERS } from './linehaul/linehaul-parser.service'
import { LinehaulImportService } from './linehaul/linehaul-import.service'
import { SHIPMENT_IMPORT_QUEUE } from '../shipments.constants'

interface ImportJobData {
  uploadId: string
  fileBuffer: string // base64-encoded
  organizationId: string
  userId: string
}

// Sentinel strings that must appear in the parsed text for the template to be
// considered valid. Adjust to match the actual internal PDF template headers.
const TEMPLATE_MARKERS = ['Shipment ID', 'Origin', 'Destination', 'Status']

const BATCH_SIZE = 100

@Processor(SHIPMENT_IMPORT_QUEUE)
export class ImportProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ImportProcessor.name)

  constructor(
    @InjectRepository(ShipmentUpload)
    private readonly uploadRepo: Repository<ShipmentUpload>,
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(ShipmentUploadError)
    private readonly errorRepo: Repository<ShipmentUploadError>,
    private readonly eventEmitter: EventEmitter2,
    private readonly linehaulParser: LinehaulParserService,
    private readonly linehaulImport: LinehaulImportService,
    private readonly config: ConfigService
  ) {
    super()
  }

  onModuleInit() {
    const concurrency = this.config.get<number>('SHIPMENT_IMPORT_CONCURRENCY', 3)
    this.worker.concurrency = concurrency
  }

  async process(job: Job<ImportJobData>): Promise<void> {
    const { uploadId, fileBuffer, organizationId, userId } = job.data

    const upload = await this.uploadRepo.findOne({ where: { id: uploadId } })
    if (!upload) {
      this.logger.error(`Upload ${uploadId} not found — dropping job`)
      return
    }

    // Mark processing
    upload.status = UploadStatus.PROCESSING
    upload.startedAt = new Date()
    await this.uploadRepo.save(upload)

    this.eventEmitter.emit('shipment.import.started', {
      uploadId,
      organizationId,
      userId,
      filename: upload.originalFilename,
    })

    try {
      const buffer = Buffer.from(fileBuffer, 'base64')
      const parsed = await pdfParse.default(buffer)

      // Template detection: check for linehaul markers first
      if (this.isLinehaulTemplate(parsed.text)) {
        this.logger.log(`Upload ${uploadId}: detected Line Haul Trip template`)
        const result = await this.linehaulParser.parse(buffer)
        await this.linehaulImport.import({
          trip: result.trip,
          items: result.items,
          uploadId,
          organizationId,
          userId,
        })
        return
      }

      // Scanned/image PDF: no text extracted — try linehaul parser (has OCR)
      if (!parsed.text.trim()) {
        this.logger.log(`Upload ${uploadId}: no text content — attempting OCR-based parsing`)
        const result = await this.linehaulParser.parse(buffer)
        await this.linehaulImport.import({
          trip: result.trip,
          items: result.items,
          uploadId,
          organizationId,
          userId,
        })
        return
      }

      if (!this.isValidTemplate(parsed.text)) {
        throw new Error('Unrecognized PDF template — cannot extract shipment rows')
      }

      const rows = this.parseRows(parsed.text)
      upload.totalRowsDetected = rows.length

      // Validate all rows
      const validRows: ShipmentRowDto[] = []
      const validationErrors: ShipmentUploadError[] = []

      for (let i = 0; i < rows.length; i++) {
        const dto = plainToInstance(ShipmentRowDto, rows[i])
        const errors = await validate(dto)
        if (errors.length > 0) {
          for (const err of errors) {
            const property = err.property
            const messages = Object.values(err.constraints ?? {}).join('; ')
            validationErrors.push(
              this.errorRepo.create({
                shipmentUploadId: uploadId,
                rowNumber: i + 1,
                errorType: UploadErrorType.VALIDATION,
                fieldName: property,
                message: messages || `Validation failed for field '${property}'`,
                incomingPayload: rows[i] as Record<string, unknown>,
              }) as ShipmentUploadError
            )
          }
        } else {
          validRows.push(dto)
        }
      }

      // Save validation errors
      if (validationErrors.length > 0) {
        await this.errorRepo.save(validationErrors)
        // Count distinct row numbers — a single row may produce multiple field errors
        const distinctFailedRows = new Set(validationErrors.map((e) => e.rowNumber)).size
        upload.rowsFailed += distinctFailedRows
      }

      if (validRows.length === 0) {
        upload.status = UploadStatus.FAILED
        upload.completedAt = new Date()
        upload.durationMs = upload.completedAt.getTime() - upload.startedAt!.getTime()
        await this.uploadRepo.save(upload)
        this.eventEmitter.emit('shipment.import.failed', { uploadId, organizationId })
        return
      }

      // Preflight duplicate detection
      const incomingIds = validRows.map((r) => r.shipmentId)
      const existing = await this.shipmentRepo
        .createQueryBuilder('s')
        .where('s.organization_id = :organizationId', { organizationId })
        .andWhere('s.shipment_id IN (:...ids)', { ids: incomingIds })
        .select(['s.id', 's.shipment_id'])
        .getMany()

      const existingMap = new Map(existing.map((s) => [s.shipmentId, s.id]))

      const toInsert: Shipment[] = []
      const conflictErrors: ShipmentUploadError[] = []

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i]
        const existingId = existingMap.get(row.shipmentId)

        if (existingId) {
          conflictErrors.push(
            this.errorRepo.create({
              shipmentUploadId: uploadId,
              rowNumber: i + 1,
              errorType: UploadErrorType.DUPLICATE,
              message: `Shipment ID '${row.shipmentId}' already exists in the database.`,
              incomingPayload: row as unknown as Record<string, unknown>,
              existingShipmentId: existingId,
            }) as ShipmentUploadError
          )
        } else {
          toInsert.push(
            this.shipmentRepo.create({
              organizationId,
              shipmentId: row.shipmentId,
              origin: row.origin,
              destination: row.destination,
              status: row.status,
              carrier: row.carrier ?? null,
              estimatedDeliveryDate: row.estimatedDeliveryDate
                ? new Date(row.estimatedDeliveryDate)
                : null,
              contentsDescription: row.contentsDescription ?? null,
              lastImportUploadId: uploadId,
            }) as Shipment
          )
        }
      }

      // Batch insert non-duplicates
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE)
        await this.shipmentRepo.save(batch)
      }
      upload.rowsImported = toInsert.length

      // Save conflict errors
      if (conflictErrors.length > 0) {
        await this.errorRepo.save(conflictErrors)
        upload.rowsConflicted = conflictErrors.length
      }

      // Determine terminal status
      if (conflictErrors.length > 0) {
        upload.status = UploadStatus.AWAITING_CONFLICT_REVIEW
      } else if (validationErrors.length > 0) {
        upload.status = UploadStatus.PARTIAL
      } else {
        upload.status = UploadStatus.COMPLETED
      }

      upload.completedAt = new Date()
      upload.durationMs = upload.completedAt.getTime() - upload.startedAt!.getTime()
      await this.uploadRepo.save(upload)

      const eventName =
        upload.status === UploadStatus.COMPLETED
          ? 'shipment.import.completed'
          : upload.status === UploadStatus.PARTIAL
            ? 'shipment.import.partial'
            : 'shipment.import.completed' // awaiting review is a sub-state of completed

      this.eventEmitter.emit(eventName, {
        uploadId,
        organizationId,
        userId,
        filename: upload.originalFilename,
        rowsImported: upload.rowsImported,
        rowsFailed: upload.rowsFailed,
        rowsConflicted: upload.rowsConflicted,
      })
    } catch (err) {
      this.logger.error(`Import failed for upload ${uploadId}: ${(err as Error).message}`)
      upload.status = UploadStatus.FAILED
      upload.errorMessage = (err as Error).message ?? 'Unknown error'
      upload.completedAt = new Date()
      if (upload.startedAt) {
        upload.durationMs = upload.completedAt.getTime() - upload.startedAt.getTime()
      }
      await this.uploadRepo.save(upload)
      this.eventEmitter.emit('shipment.import.failed', { uploadId, organizationId, userId })
      throw err // allow BullMQ to retry
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isValidTemplate(text: string): boolean {
    return TEMPLATE_MARKERS.every((marker) => text.includes(marker))
  }

  private isLinehaulTemplate(text: string): boolean {
    // Chromium/Skia-generated PDFs split characters into separate text operations,
    // producing fragments like "Nomor T\nO" or "Surat Jalan" with embedded newlines.
    // Normalize by removing single newlines within words before checking markers.
    const normalized = text.replace(/([A-Za-z])\n([A-Za-z])/g, '$1$2')
    return LINEHAUL_MARKERS.every((marker) => normalized.includes(marker))
  }

  /**
   * Parse a simple pipe-delimited table from the PDF text.
   * First non-empty line is the header row.
   * Subsequent lines are data rows.
   */
  private parseRows(text: string): Record<string, string>[] {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('|'))

    if (lines.length < 2) return []

    const headers = lines[0].split('|').map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
    )

    return lines.slice(1).map((line) => {
      const cells = line.split('|').map((c) => c.trim())
      const obj: Record<string, string> = {}
      headers.forEach((header, idx) => {
        obj[this.mapHeader(header)] = cells[idx] ?? ''
      })
      return obj
    })
  }

  private mapHeader(raw: string): string {
    const map: Record<string, string> = {
      shipment_id: 'shipmentId',
      origin: 'origin',
      destination: 'destination',
      status: 'status',
      carrier: 'carrier',
      est_delivery: 'estimatedDeliveryDate',
      estimated_delivery: 'estimatedDeliveryDate',
      contents: 'contentsDescription',
      contents_description: 'contentsDescription',
    }
    return map[raw] ?? raw
  }
}
