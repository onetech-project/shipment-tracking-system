import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ShipmentUpload, UploadStatus } from '../entities/shipment-upload.entity';
import { ShipmentUploadError } from '../entities/shipment-upload-error.entity';
import { Shipment } from '../entities/shipment.entity';
import { ConflictDecisionDto, ConflictAction } from './dto/resolve-conflict.dto';
import {
  UploadInitiatedResponse,
  ImportStatusResponse,
  ImportErrorsResponse,
  ResolveConflictsResponse,
  UploadHistoryResponse,
} from '@shared/shipments';
import { SHIPMENT_IMPORT_QUEUE } from '../shipments.module';

@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(ShipmentUpload)
    private readonly uploadRepo: Repository<ShipmentUpload>,
    @InjectRepository(ShipmentUploadError)
    private readonly errorRepo: Repository<ShipmentUploadError>,
    @InjectRepository(Shipment)
    private readonly shipmentRepo: Repository<Shipment>,
    @InjectQueue(SHIPMENT_IMPORT_QUEUE)
    private readonly queue: Queue,
  ) {}

  async createUploadRecord(
    organizationId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<UploadInitiatedResponse> {
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    // Idempotency: return existing upload if same org + hash is still active
    const existing = await this.uploadRepo.findOne({
      where: [
        { organizationId, fileHash, status: UploadStatus.QUEUED },
        { organizationId, fileHash, status: UploadStatus.PROCESSING },
      ],
    });

    if (existing) {
      return {
        uploadId: existing.id,
        status: 'queued',
        message: 'Duplicate file — returning existing queued import.',
      };
    }

    const upload = this.uploadRepo.create({
      organizationId,
      uploadedByUserId: userId,
      originalFilename: file.originalname,
      fileHash,
      status: UploadStatus.QUEUED,
    });
    const saved = await this.uploadRepo.save(upload);

    await this.queue.add(
      'process-pdf',
      {
        uploadId: saved.id,
        fileBuffer: file.buffer.toString('base64'),
        organizationId,
        userId,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    return {
      uploadId: saved.id,
      status: 'queued',
      message: 'Import queued. Poll GET /shipments/imports/:uploadId for progress.',
    };
  }

  async getStatus(uploadId: string, organizationId: string): Promise<ImportStatusResponse> {
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('UPLOAD_NOT_FOUND');
    if (upload.organizationId !== organizationId) throw new ForbiddenException('FORBIDDEN');

    return {
      uploadId: upload.id,
      originalFilename: upload.originalFilename,
      status: upload.status as any,
      totalRowsDetected: upload.totalRowsDetected,
      rowsImported: upload.rowsImported,
      rowsFailed: upload.rowsFailed,
      rowsConflicted: upload.rowsConflicted,
      startedAt: upload.startedAt?.toISOString() ?? null,
      completedAt: upload.completedAt?.toISOString() ?? null,
      durationMs: upload.durationMs,
    };
  }

  async getErrors(uploadId: string, organizationId: string): Promise<ImportErrorsResponse> {
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('UPLOAD_NOT_FOUND');
    if (upload.organizationId !== organizationId) throw new ForbiddenException('FORBIDDEN');

    const errors = await this.errorRepo.find({ where: { shipmentUploadId: uploadId } });

    return {
      items: errors.map((e) => ({
        id: e.id,
        rowNumber: e.rowNumber,
        errorType: e.errorType as any,
        fieldName: e.fieldName,
        message: e.message,
        incomingPayload: e.incomingPayload,
        existingShipmentId: e.existingShipmentId,
        resolved: e.resolved,
        resolution: e.resolution as any,
      })),
    };
  }

  async resolveConflicts(
    uploadId: string,
    organizationId: string,
    decisions: ConflictDecisionDto[],
  ): Promise<ResolveConflictsResponse> {
    const upload = await this.uploadRepo.findOne({ where: { id: uploadId } });
    if (!upload) throw new NotFoundException('UPLOAD_NOT_FOUND');
    if (upload.organizationId !== organizationId) throw new ForbiddenException('FORBIDDEN');
    if (upload.status !== UploadStatus.AWAITING_CONFLICT_REVIEW) {
      throw new ConflictException('UPLOAD_NOT_AWAITING_REVIEW');
    }

    const unconflictedErrors = await this.errorRepo.find({
      where: { shipmentUploadId: uploadId, errorType: 'duplicate', resolved: false },
    });

    const unconflictedIds = new Set(unconflictedErrors.map((e) => e.id));
    const decisionMap = new Map(decisions.map((d) => [d.errorId, d.action]));

    // Validate all unresolved duplicate errors have a decision
    for (const id of unconflictedIds) {
      if (!decisionMap.has(id)) {
        throw new ConflictException('MISSING_DECISIONS');
      }
    }

    for (const error of unconflictedErrors) {
      const action = decisionMap.get(error.id);
      if (!action) continue;

      if (action === ConflictAction.OVERWRITE) {
        // Overwrite: update shipment with incoming payload
        const payload = error.incomingPayload as Record<string, any>;
        if (error.existingShipmentId && payload) {
          await this.shipmentRepo.save({
            id: error.existingShipmentId,
            origin: payload['origin'],
            destination: payload['destination'],
            status: payload['status'],
            carrier: payload['carrier'] ?? null,
            estimatedDeliveryDate: payload['estimatedDeliveryDate'] ?? null,
            contentsDescription: payload['contentsDescription'] ?? null,
            lastImportUploadId: uploadId,
          });
          upload.rowsImported += 1;
        }
        error.resolution = 'overwritten';
      } else {
        error.resolution = 'skipped';
      }

      error.resolved = true;
      upload.rowsConflicted -= 1;
    }

    await this.errorRepo.save(unconflictedErrors);

    // Determine terminal status
    upload.status = upload.rowsFailed > 0 ? UploadStatus.PARTIAL : UploadStatus.COMPLETED;
    upload.completedAt = new Date();
    if (upload.startedAt) {
      upload.durationMs = upload.completedAt.getTime() - upload.startedAt.getTime();
    }
    await this.uploadRepo.save(upload);

    return {
      uploadId: upload.id,
      status: upload.status as any,
      rowsImported: upload.rowsImported,
      rowsFailed: upload.rowsFailed,
      rowsConflicted: upload.rowsConflicted,
    };
  }

  async getHistory(
    organizationId: string,
    limit = 20,
    cursor?: string,
  ): Promise<UploadHistoryResponse> {
    const pageLimit = Math.min(limit, 100);
    const qb = this.uploadRepo
      .createQueryBuilder('u')
      .where('u.organization_id = :organizationId', { organizationId })
      .orderBy('u.created_at', 'DESC')
      .limit(pageLimit + 1);

    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      qb.andWhere('u.created_at < :cursor', { cursor: decoded });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > pageLimit;
    const items = hasMore ? rows.slice(0, pageLimit) : rows;

    const nextCursor = hasMore
      ? Buffer.from(items[items.length - 1].createdAt.toISOString()).toString('base64')
      : null;

    return {
      items: items.map((u) => ({
        uploadId: u.id,
        originalFilename: u.originalFilename,
        status: u.status as any,
        totalRowsDetected: u.totalRowsDetected,
        rowsImported: u.rowsImported,
        rowsFailed: u.rowsFailed,
        rowsConflicted: u.rowsConflicted,
        createdAt: u.createdAt.toISOString(),
        completedAt: u.completedAt?.toISOString() ?? null,
      })),
      nextCursor,
    };
  }
}
