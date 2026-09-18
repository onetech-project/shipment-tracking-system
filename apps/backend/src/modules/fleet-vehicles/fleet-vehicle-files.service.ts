import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FleetVehicleFileEntity } from './entities/fleet-vehicle-file.entity'
import { FleetVehicleEntity } from './entities/fleet-vehicle.entity'
import { FleetMasterDataEntity } from '../fleet-master-data/entities/fleet-master-data.entity'
import { StorageService } from '../storage/storage.service'
import {
  PHOTO_MAX_UPLOAD_BYTES,
  PHOTO_MIME_TYPES,
  isPhotoSlot,
} from '../storage/storage.constants'
import { buildVehicleFileKey, isSafeExternalUrl } from './fleet-files'
import { FleetVehicleFileView } from './fleet-vehicles.types'

export interface UploadIntentInput {
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface ConfirmUploadInput {
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
}

@Injectable()
export class FleetVehicleFilesService {
  private readonly logger = new Logger(FleetVehicleFilesService.name)

  constructor(
    @InjectRepository(FleetVehicleFileEntity)
    private readonly fileRepo: Repository<FleetVehicleFileEntity>,
    @InjectRepository(FleetVehicleEntity)
    private readonly vehicleRepo: Repository<FleetVehicleEntity>,
    @InjectRepository(FleetMasterDataEntity)
    private readonly masterRepo: Repository<FleetMasterDataEntity>,
    private readonly storage: StorageService,
  ) {}

  async list(vehicleId: string): Promise<FleetVehicleFileView[]> {
    const rows = await this.fileRepo.find({
      where: { vehicleId },
      relations: { slot: true },
      order: { uploadedAt: 'DESC' },
    })
    return rows.map((row) => this.toView(row))
  }

  // Step 1 of the three-step upload (spec §4.2). The key is built here, not by the browser: the
  // client chooses neither where the object lands nor what extension it gets.
  async createIntent(
    vehicleId: string,
    slotId: string,
    dto: UploadIntentInput,
  ): Promise<{ uploadUrl: string; storageKey: string }> {
    await this.assertVehicle(vehicleId)
    const slot = await this.assertSlot(slotId)

    this.assertSlotRules(slot, dto.mimeType, dto.sizeBytes)

    const storageKey = buildVehicleFileKey(vehicleId, slot.code, dto.mimeType)
    const uploadUrl = await this.storage.createUploadUrl(storageKey, dto.mimeType, dto.sizeBytes)
    return { uploadUrl, storageKey }
  }

  // Step 3. The HEAD is the point of this method: without it a client could confirm an upload it
  // never performed and leave a row pointing at nothing. The client's own numbers are checked
  // against what the bucket actually holds rather than taken on trust.
  async confirm(
    vehicleId: string,
    slotId: string,
    dto: ConfirmUploadInput,
    userId: string | null,
  ): Promise<FleetVehicleFileView> {
    await this.assertVehicle(vehicleId)
    const slot = await this.assertSlot(slotId)

    // The key must be one this vehicle and slot could have been granted, or a confirm could
    // attach another unit's object to this slot.
    if (!dto.storageKey.startsWith(`fleet/${vehicleId}/${slot.code}/`)) {
      throw new BadRequestException('storageKey does not belong to this vehicle and slot')
    }

    const stat = await this.storage.statObject(dto.storageKey)
    if (!stat) throw new BadRequestException('No object was uploaded for that key')
    if (stat.size !== dto.sizeBytes) {
      throw new BadRequestException('Uploaded object size does not match the confirmation')
    }
    if (stat.mime !== dto.mimeType) {
      throw new BadRequestException('Uploaded object type does not match the confirmation')
    }
    // Measured against the stored object's own numbers, which the three checks above have just
    // proven equal to the client's.
    this.assertSlotRules(slot, stat.mime, stat.size)

    const existing = await this.fileRepo.findOne({ where: { vehicleId, slotId } })
    const saved = await this.fileRepo.save({
      // On an insert, TypeORM's own RETURNING includes the create-date column, so uploadedAt comes
      // back as a real Date with no help from us. On an update (this branch), TypeORM's RETURNING
      // excludes create-date columns, so without this the column, and the response, would carry
      // whatever the row already had — or nothing at all. It also matches what "uploaded_at" means
      // here: a re-uploaded file is the file now, so the timestamp moves to this upload's time.
      ...(existing ? { id: existing.id, uploadedAt: new Date() } : {}),
      vehicleId,
      slotId,
      storageKey: dto.storageKey,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      // bigint columns take a string; passing a number works today but rounds above 2^53.
      sizeBytes: String(dto.sizeBytes),
      externalUrl: null,
      uploadedBy: userId,
    })

    await this.dropObject(existing?.storageKey ?? null)
    // The slot is already in hand from assertSlot above; re-fetching the row we just wrote would
    // be a second round trip for data we already have.
    saved.slot = slot
    return this.toView(saved)
  }

  async setExternalUrl(
    vehicleId: string,
    slotId: string,
    dto: { url: string },
    userId: string | null,
  ): Promise<FleetVehicleFileView> {
    await this.assertVehicle(vehicleId)
    const slot = await this.assertSlot(slotId)
    // Checked again here even though the DTO checks it: this method is also reachable from other
    // callers, and the CHECK constraint cannot see a scheme.
    if (!isSafeExternalUrl(dto.url)) {
      throw new BadRequestException('url must be an http or https link')
    }

    const existing = await this.fileRepo.findOne({ where: { vehicleId, slotId } })
    const saved = await this.fileRepo.save({
      // See the matching comment in confirm(): TypeORM's RETURNING drops create-date columns on
      // an update, and a re-pointed slot means the file (here, the link) is new as of now.
      ...(existing ? { id: existing.id, uploadedAt: new Date() } : {}),
      vehicleId,
      slotId,
      storageKey: null,
      originalName: null,
      mimeType: null,
      sizeBytes: null,
      externalUrl: dto.url,
      uploadedBy: userId,
    })

    await this.dropObject(existing?.storageKey ?? null)
    saved.slot = slot
    return this.toView(saved)
  }

  async downloadUrl(
    vehicleId: string,
    fileId: string,
    disposition?: 'inline' | 'attachment',
  ): Promise<{ url: string }> {
    const file = await this.fileRepo.findOne({
      where: { id: fileId, vehicleId },
      relations: { slot: true },
    })
    if (!file) throw new NotFoundException('File not found')

    // Already a URL. Signing it would be meaningless and the S3 call would fail.
    if (file.externalUrl) return { url: file.externalUrl }
    if (!file.storageKey) throw new NotFoundException('File has no content')

    const filename = file.originalName ?? `${file.slot?.code ?? 'berkas'}`
    return { url: await this.storage.createDownloadUrl(file.storageKey, filename, disposition) }
  }

  async remove(vehicleId: string, fileId: string): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId, vehicleId } })
    if (!file) throw new NotFoundException('File not found')

    await this.fileRepo.delete(fileId)
    await this.dropObject(file.storageKey)
  }

  // Failing to delete the superseded object is logged, not thrown: an orphaned object costs
  // storage, while a failed request would leave the operator with a slot they cannot replace
  // (spec §4.2). The row already points at the new object by the time this runs.
  private async dropObject(key: string | null): Promise<void> {
    if (!key) return
    try {
      await this.storage.deleteObject(key)
    } catch (err: unknown) {
      this.logger.warn(`Failed to delete superseded object ${key}: ${String(err)}`)
    }
  }

  private async assertVehicle(vehicleId: string): Promise<void> {
    const found = await this.vehicleRepo.findOne({ where: { id: vehicleId } })
    if (!found) throw new NotFoundException('Vehicle not found')
  }

  // The FK proves the row exists; only this proves it is a jenis_berkas row, without which a file
  // could be filed under "Mitsubishi Fuso".
  private async assertSlot(slotId: string): Promise<FleetMasterDataEntity> {
    const slot = await this.masterRepo.findOne({
      where: { id: slotId, category: 'jenis_berkas' },
    })
    if (!slot) throw new BadRequestException('slotId must reference a jenis_berkas master row')
    return slot
  }

  // Narrower than the DTO allow-list, and only for photo slots. The DTO cannot do this itself:
  // slotId travels in the path, not the body, so it has no idea which slot a request is for.
  // Applied at both ends of the upload — createIntent sees only what the client claims, confirm
  // sees what the bucket actually holds.
  private assertSlotRules(slot: FleetMasterDataEntity, mime: string, size: number): void {
    if (!isPhotoSlot(slot.code)) return

    if (!PHOTO_MIME_TYPES.includes(mime)) {
      throw new BadRequestException(`Slot ${slot.label} hanya menerima foto (jpg, png, atau webp).`)
    }
    if (size > PHOTO_MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`Ukuran foto ${slot.label} maksimal 5 MB.`)
    }
  }

  private toView(row: FleetVehicleFileEntity): FleetVehicleFileView {
    return {
      id: row.id,
      slotId: row.slotId,
      slotCode: row.slot?.code ?? '',
      slotLabel: row.slot?.label ?? '',
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
      externalUrl: row.externalUrl,
      uploadedAt:
        row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : String(row.uploadedAt),
    }
  }
}
