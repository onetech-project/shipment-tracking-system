import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Shipment } from '../entities/shipment.entity';
import { ShipmentUpload, UploadStatus } from '../entities/shipment-upload.entity';
import { ShipmentUploadError, UploadErrorType } from '../entities/shipment-upload-error.entity';
import { ImportProcessor } from './import.processor';
import { ImportService } from './import.service';
import { SHIPMENT_IMPORT_QUEUE } from '../shipments.constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUploadRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
    ...overrides,
  };
}

function makeShipmentRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
    save: jest.fn().mockImplementation((v) => Promise.resolve(Array.isArray(v) ? v : v)),
    ...overrides,
  };
}

function makeErrorRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockImplementation((v) => Promise.resolve(Array.isArray(v) ? v : v)),
    ...overrides,
  };
}

const VALID_PDF_TEXT = `
Shipment ID | Origin      | Destination | Status    | Carrier  | Est. Delivery | Contents
SHP-001     | Jakarta     | Bandung     | pending   | JNE      | 2026-04-01    | Goods
SHP-002     | Surabaya    | Malang      | in_transit| TIKI     | 2026-04-02    | Electronics
`.trim();

// Mock pdf-parse to return parsed text
jest.mock('pdf-parse', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return jest.fn().mockImplementation((buffer: Buffer) => {
    if (buffer.toString() === 'INVALID') {
      return Promise.reject(new Error('Invalid PDF'));
    }
    return Promise.resolve({ text: VALID_PDF_TEXT });
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportProcessor (unit)', () => {
  let processor: ImportProcessor;
  let uploadRepo: ReturnType<typeof makeUploadRepo>;
  let shipmentRepo: ReturnType<typeof makeShipmentRepo>;
  let errorRepo: ReturnType<typeof makeErrorRepo>;
  let importService: ImportService;
  let eventEmitter: { emit: jest.Mock };

  const UPLOAD_ID = 'upload-uuid-0001';
  const ORG_ID = 'org-uuid-0001';
  const USER_ID = 'user-uuid-0001';

  const makeUpload = (override: Partial<ShipmentUpload> = {}): ShipmentUpload =>
    ({
      id: UPLOAD_ID,
      organizationId: ORG_ID,
      uploadedByUserId: USER_ID,
      originalFilename: 'march-batch.pdf',
      fileHash: 'abc123',
      status: UploadStatus.QUEUED,
      totalRowsDetected: 0,
      rowsImported: 0,
      rowsFailed: 0,
      rowsConflicted: 0,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...override,
    }) as ShipmentUpload;

  beforeEach(async () => {
    uploadRepo = makeUploadRepo({ findOne: jest.fn().mockResolvedValue(makeUpload()) });
    shipmentRepo = makeShipmentRepo();
    errorRepo = makeErrorRepo();
    eventEmitter = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ImportProcessor,
        ImportService,
        { provide: getRepositoryToken(ShipmentUpload), useValue: uploadRepo },
        { provide: getRepositoryToken(Shipment), useValue: shipmentRepo },
        { provide: getRepositoryToken(ShipmentUploadError), useValue: errorRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: ConfigService, useValue: { get: (_: string, d: unknown) => d } },
        { provide: getQueueToken(SHIPMENT_IMPORT_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    processor = module.get(ImportProcessor);
    importService = module.get(ImportService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process()', () => {
    const makeJob = (fileBuffer: Buffer, uploadId = UPLOAD_ID) =>
      ({ data: { uploadId, fileBuffer: fileBuffer.toString('base64'), organizationId: ORG_ID, userId: USER_ID } });

    it('emits shipment.import.started and sets status to processing', async () => {
      await processor.process(makeJob(Buffer.from('valid-pdf-bytes')) as any);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'shipment.import.started',
        expect.objectContaining({ uploadId: UPLOAD_ID }),
      );
      expect(uploadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UploadStatus.PROCESSING }),
      );
    });

    it('sets status to failed when pdf-parse throws', async () => {
      await processor.process(makeJob(Buffer.from('INVALID')) as any);
      expect(uploadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UploadStatus.FAILED }),
      );
    });

    it('sets status to completed when all rows are valid and no duplicates', async () => {
      // No existing shipments → no duplicates
      shipmentRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });
      await processor.process(makeJob(Buffer.from('valid-pdf-bytes')) as any);
      expect(uploadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UploadStatus.COMPLETED }),
      );
    });

    it('writes ShipmentUploadError for rows missing required fields', async () => {
      // Simulate a malformed row by temporarily patching the text parser
      const pdfParse = require('pdf-parse');
      pdfParse.mockResolvedValueOnce({
        text: `
Shipment ID | Origin | Destination | Status
            |        | Bandung     | pending
`.trim(),
      });
      await processor.process(makeJob(Buffer.from('valid-pdf-bytes')) as any);
      expect(errorRepo.save).toHaveBeenCalled();
    });

    it('flags duplicate shipment IDs as awaiting_conflict_review', async () => {
      shipmentRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'existing-uuid', shipmentId: 'SHP-001', organizationId: ORG_ID },
        ]),
      });
      await processor.process(makeJob(Buffer.from('valid-pdf-bytes')) as any);
      expect(uploadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UploadStatus.AWAITING_CONFLICT_REVIEW }),
      );
    });

    it('emits shipment.import.completed on success', async () => {
      await processor.process(makeJob(Buffer.from('valid-pdf-bytes')) as any);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'shipment.import.completed',
        expect.objectContaining({ uploadId: UPLOAD_ID }),
      );
    });
  });
});
