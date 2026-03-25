import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { LinehaulTrip } from '../../entities/linehaul-trip.entity'
import { LinehaulTripItem } from '../../entities/linehaul-trip-item.entity'
import { ShipmentUpload, UploadStatus } from '../../entities/shipment-upload.entity'
import { ShipmentUploadError, UploadErrorType } from '../../entities/shipment-upload-error.entity'
import { LinehaulTripDto } from './dto/linehaul-trip.dto'
import { LinehaulTripItemDto } from './dto/linehaul-trip-item.dto'

interface ImportInput {
  trip: LinehaulTripDto
  items: LinehaulTripItemDto[]
  uploadId: string
  organizationId: string
  userId: string
}

@Injectable()
export class LinehaulImportService {
  private readonly logger = new Logger(LinehaulImportService.name)

  constructor(
    @InjectRepository(LinehaulTrip)
    private readonly tripRepo: Repository<LinehaulTrip>,
    @InjectRepository(LinehaulTripItem)
    private readonly itemRepo: Repository<LinehaulTripItem>,
    @InjectRepository(ShipmentUpload)
    private readonly uploadRepo: Repository<ShipmentUpload>,
    @InjectRepository(ShipmentUploadError)
    private readonly errorRepo: Repository<ShipmentUploadError>,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async import(input: ImportInput): Promise<void> {
    const { trip: tripDto, items: itemDtos, uploadId, organizationId, userId } = input

    const upload = await this.uploadRepo.findOne({ where: { id: uploadId } })
    if (!upload) {
      this.logger.error(`Upload ${uploadId} not found`)
      return
    }

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
      // Validate trip DTO
      const tripInstance = plainToInstance(LinehaulTripDto, tripDto)
      const tripErrors = await validate(tripInstance)
      if (tripErrors.length > 0) {
        const messages = tripErrors.map(
          (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`
        )
        throw new Error(`Trip validation failed: ${messages.join(', ')}`)
      }

      // Check duplicate trip_code within org
      const existingTrip = await this.tripRepo.findOne({
        where: { organizationId, tripCode: tripDto.tripCode },
      })

      if (existingTrip) {
        // Flag as duplicate — store trip ID and items in payload for conflict resolution
        // NOTE: existingShipmentId has FK to shipments table, so we store the
        // linehaul trip ID inside incomingPayload instead.
        await this.errorRepo.save(
          this.errorRepo.create({
            shipmentUploadId: uploadId,
            rowNumber: 0,
            errorType: UploadErrorType.DUPLICATE,
            message: `Trip code '${tripDto.tripCode}' already exists for this organization.`,
            incomingPayload: {
              existingTripId: existingTrip.id,
              trip: tripDto,
              items: itemDtos,
            } as unknown as Record<string, unknown>,
          } as ShipmentUploadError)
        )
        upload.totalRowsDetected = itemDtos.length
        upload.rowsConflicted = 1
        upload.status = UploadStatus.AWAITING_CONFLICT_REVIEW
        upload.completedAt = new Date()
        upload.durationMs = upload.completedAt.getTime() - upload.startedAt!.getTime()
        await this.uploadRepo.save(upload)

        this.eventEmitter.emit('shipment.import.completed', {
          uploadId,
          organizationId,
          userId,
          filename: upload.originalFilename,
          rowsImported: 0,
          rowsFailed: 0,
          rowsConflicted: 1,
        })
        return
      }

      // Create trip record
      const trip = this.tripRepo.create({
        organizationId,
        tripCode: tripDto.tripCode,
        schedule: tripDto.schedule ?? null,
        origin: tripDto.origin,
        destination: tripDto.destination,
        vendor: tripDto.vendor ?? null,
        plateNumber: tripDto.plateNumber ?? null,
        driverName: tripDto.driverName ?? null,
        std: tripDto.std ? new Date(tripDto.std) : null,
        sta: tripDto.sta ? new Date(tripDto.sta) : null,
        ata: tripDto.ata ? new Date(tripDto.ata) : null,
        totalWeight: tripDto.totalWeight ?? null,
        lastImportUploadId: uploadId,
      } as Partial<LinehaulTrip>) as LinehaulTrip

      const savedTrip = await this.tripRepo.save(trip)

      // Process items
      upload.totalRowsDetected = itemDtos.length
      let rowsImported = 0
      let rowsFailed = 0
      const validationErrors: ShipmentUploadError[] = []

      for (let i = 0; i < itemDtos.length; i++) {
        const itemDto = plainToInstance(LinehaulTripItemDto, itemDtos[i])
        const itemErrors = await validate(itemDto)

        if (itemErrors.length > 0) {
          for (const err of itemErrors) {
            validationErrors.push(
              this.errorRepo.create({
                shipmentUploadId: uploadId,
                rowNumber: i + 1,
                errorType: UploadErrorType.VALIDATION,
                fieldName: err.property,
                message:
                  Object.values(err.constraints ?? {}).join('; ') ||
                  `Validation failed for '${err.property}'`,
                incomingPayload: itemDtos[i] as unknown as Record<string, unknown>,
              } as ShipmentUploadError)
            )
          }
          rowsFailed++
          continue
        }

        // Insert trip item
        const item = this.itemRepo.create({
          linehaulTripId: savedTrip.id,
          toNumber: itemDto.toNumber,
          weight: itemDto.weight ?? null,
          destination: itemDto.destination ?? null,
          dgType: itemDto.dgType ?? null,
          toType: itemDto.toType ?? null,
        } as Partial<LinehaulTripItem>) as LinehaulTripItem

        await this.itemRepo.save(item)
        rowsImported++
      }

      // Save validation errors
      if (validationErrors.length > 0) {
        await this.errorRepo.save(validationErrors)
      }

      // Update upload counters and status
      upload.rowsImported = rowsImported
      upload.rowsFailed = rowsFailed

      if (rowsFailed > 0 && rowsImported > 0) {
        upload.status = UploadStatus.PARTIAL
      } else if (rowsImported === 0) {
        upload.status = UploadStatus.FAILED
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
            : 'shipment.import.failed'

      this.eventEmitter.emit(eventName, {
        uploadId,
        organizationId,
        userId,
        filename: upload.originalFilename,
        rowsImported,
        rowsFailed,
        rowsConflicted: 0,
      })
    } catch (err) {
      this.logger.error(`Linehaul import failed for upload ${uploadId}: ${(err as Error).message}`)
      upload.status = UploadStatus.FAILED
      upload.completedAt = new Date()
      if (upload.startedAt) {
        upload.durationMs = upload.completedAt.getTime() - upload.startedAt.getTime()
      }
      await this.uploadRepo.save(upload)
      this.eventEmitter.emit('shipment.import.failed', { uploadId, organizationId, userId })
      throw err
    }
  }
}
