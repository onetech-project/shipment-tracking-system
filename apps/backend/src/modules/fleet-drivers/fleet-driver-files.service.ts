import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetDriverEntity } from './entities/fleet-driver.entity'
import { StorageService } from '../storage/storage.service'
import { buildDriverSimKey } from '../fleet-vehicles/fleet-files'

export interface DriverUploadIntentInput {
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface DriverConfirmUploadInput {
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
}

// The same three-step flow as vehicle files, against four columns instead of a table: a driver
// has exactly one scan and no sign of gaining more (spec §4.5).
@Injectable()
export class FleetDriverFilesService {
  private readonly logger = new Logger(FleetDriverFilesService.name)

  constructor(
    @InjectRepository(FleetDriverEntity)
    private readonly driverRepo: Repository<FleetDriverEntity>,
    private readonly storage: StorageService,
  ) {}

  async createIntent(
    driverId: string,
    dto: DriverUploadIntentInput,
  ): Promise<{ uploadUrl: string; storageKey: string }> {
    await this.assertDriver(driverId)
    const storageKey = buildDriverSimKey(driverId, dto.mimeType)
    const uploadUrl = await this.storage.createUploadUrl(storageKey, dto.mimeType, dto.sizeBytes)
    return { uploadUrl, storageKey }
  }

  async confirm(driverId: string, dto: DriverConfirmUploadInput): Promise<void> {
    const driver = await this.assertDriver(driverId)

    if (!dto.storageKey.startsWith(`fleet/drivers/${driverId}/sim/`)) {
      throw new BadRequestException('storageKey does not belong to this driver')
    }

    const stat = await this.storage.statObject(dto.storageKey)
    if (!stat) throw new BadRequestException('No object was uploaded for that key')
    if (stat.size !== dto.sizeBytes) {
      throw new BadRequestException('Uploaded object size does not match the confirmation')
    }
    if (stat.mime !== dto.mimeType) {
      throw new BadRequestException('Uploaded object type does not match the confirmation')
    }

    await this.driverRepo.update(driverId, {
      simStorageKey: dto.storageKey,
      simOriginalName: dto.originalName,
      simMimeType: dto.mimeType,
      simSizeBytes: String(dto.sizeBytes),
    })
    await this.dropObject(driver.simStorageKey)
  }

  async downloadUrl(driverId: string): Promise<{ url: string }> {
    const driver = await this.assertDriver(driverId)
    if (!driver.simStorageKey) throw new NotFoundException('Driver has no licence scan')
    const filename = driver.simOriginalName ?? `sim-${driver.nama}`
    return { url: await this.storage.createDownloadUrl(driver.simStorageKey, filename) }
  }

  async remove(driverId: string): Promise<void> {
    const driver = await this.assertDriver(driverId)
    await this.driverRepo.update(driverId, {
      simStorageKey: null,
      simOriginalName: null,
      simMimeType: null,
      simSizeBytes: null,
    })
    await this.dropObject(driver.simStorageKey)
  }

  // Logged rather than thrown, for the reason the vehicle service gives: an orphaned object is
  // cheaper than a slot the operator cannot repair.
  private async dropObject(key: string | null): Promise<void> {
    if (!key) return
    try {
      await this.storage.deleteObject(key)
    } catch (err: unknown) {
      this.logger.warn(`Failed to delete superseded object ${key}: ${String(err)}`)
    }
  }

  private async assertDriver(driverId: string): Promise<FleetDriverEntity> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } })
    if (!driver) throw new NotFoundException('Driver not found')
    return driver
  }
}
