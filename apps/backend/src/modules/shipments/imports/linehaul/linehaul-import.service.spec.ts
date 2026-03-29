import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LinehaulImportService } from './linehaul-import.service';
import { LinehaulTrip } from '../../entities/linehaul-trip.entity';
import { LinehaulTripItem } from '../../entities/linehaul-trip-item.entity';
import { ShipmentUpload, UploadStatus } from '../../entities/shipment-upload.entity';
import { ShipmentUploadError } from '../../entities/shipment-upload-error.entity';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const UPLOAD_ID = 'upload-uuid-lh01';
const ORG_ID = 'org-uuid-0001';
const USER_ID = 'user-uuid-0001';

const makeUpload = (override: Partial<ShipmentUpload> = {}): ShipmentUpload =>
  ({
    id: UPLOAD_ID,
    organizationId: ORG_ID,
    uploadedByUserId: USER_ID,
    originalFilename: 'linehaul-trip.pdf',
    fileHash: 'hash123',
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

function makeRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockImplementation((v) => Promise.resolve({ id: 'new-uuid', ...v })),
    ...overrides,
  };
}

const VALID_TRIP = {
  tripCode: 'LT2026031901',
  origin: 'Jakarta',
  destination: 'Bandung',
  schedule: 'SCH-001',
  vendor: 'PT Vendor',
  plateNumber: 'B1234XYZ',
  driverName: 'Ahmad',
  std: '2026-03-19T08:00:00.000Z',
  sta: '2026-03-19T14:00:00.000Z',
  ata: null,
  totalWeight: 1250,
};

const VALID_ITEMS = [
  { toNumber: 'TO-001', weight: 12.5, destination: 'Bandung', dgType: 'non-dg', toType: 'REGULAR' },
  { toNumber: 'TO-002', weight: 8.0, destination: 'Surabaya', dgType: null, toType: 'EXPRESS' },
];

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('LinehaulImportService (unit)', () => {
  let service: LinehaulImportService;
  let tripRepo: ReturnType<typeof makeRepo>;
  let itemRepo: ReturnType<typeof makeRepo>;
  let uploadRepo: ReturnType<typeof makeRepo>;
  let errorRepo: ReturnType<typeof makeRepo>;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    tripRepo = makeRepo();
    itemRepo = makeRepo();
    uploadRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(makeUpload()) });
    errorRepo = makeRepo();
    eventEmitter = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LinehaulImportService,
        { provide: getRepositoryToken(LinehaulTrip), useValue: tripRepo },
        { provide: getRepositoryToken(LinehaulTripItem), useValue: itemRepo },
        { provide: getRepositoryToken(ShipmentUpload), useValue: uploadRepo },
        { provide: getRepositoryToken(ShipmentUploadError), useValue: errorRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(LinehaulImportService);
  });

  it('inserts new trip with all items when no duplicates', async () => {
    await service.import({
      trip: VALID_TRIP,
      items: VALID_ITEMS,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    // Trip saved
    expect(tripRepo.save).toHaveBeenCalled();
    // Items saved (one per item)
    expect(itemRepo.save).toHaveBeenCalledTimes(2);
    // Upload marked completed
    expect(uploadRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UploadStatus.COMPLETED, rowsImported: 2 }),
    );
  });

  it('detects duplicate trip_code and sets awaiting_conflict_review', async () => {
    tripRepo.findOne.mockResolvedValueOnce({ id: 'existing-trip', tripCode: 'LT2026031901' });

    await service.import({
      trip: VALID_TRIP,
      items: VALID_ITEMS,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(errorRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ errorType: 'duplicate' }),
    );
    expect(uploadRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UploadStatus.AWAITING_CONFLICT_REVIEW }),
    );
  });

  it('generates validation errors for items missing toNumber', async () => {
    const invalidItems = [
      { toNumber: '', weight: 5 }, // empty toNumber → validation error
      { toNumber: 'TO-003', weight: 10 },
    ];

    await service.import({
      trip: VALID_TRIP,
      items: invalidItems as any,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    // One error for the invalid item
    expect(errorRepo.save).toHaveBeenCalled();
    // Upload should be partial (1 imported, 1 failed)
    expect(uploadRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UploadStatus.PARTIAL }),
    );
  });

  it('sets status to failed when all items fail validation', async () => {
    const allInvalid = [
      { toNumber: '', weight: 5 },
      { toNumber: '', weight: 10 },
    ];

    await service.import({
      trip: VALID_TRIP,
      items: allInvalid as any,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(uploadRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: UploadStatus.FAILED }),
    );
  });

  it('emits shipment.import.started event', async () => {
    await service.import({
      trip: VALID_TRIP,
      items: VALID_ITEMS,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'shipment.import.started',
      expect.objectContaining({ uploadId: UPLOAD_ID }),
    );
  });

  it('emits shipment.import.completed on success', async () => {
    await service.import({
      trip: VALID_TRIP,
      items: VALID_ITEMS,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'shipment.import.completed',
      expect.objectContaining({ uploadId: UPLOAD_ID, rowsImported: 2 }),
    );
  });

  it('emits shipment.import.partial when some items fail', async () => {
    const mixedItems = [
      { toNumber: '', weight: 5 },
      { toNumber: 'TO-003', weight: 10 },
    ];

    await service.import({
      trip: VALID_TRIP,
      items: mixedItems as any,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'shipment.import.partial',
      expect.objectContaining({ uploadId: UPLOAD_ID }),
    );
  });

  it('updates upload counters correctly', async () => {
    await service.import({
      trip: VALID_TRIP,
      items: VALID_ITEMS,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(uploadRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        totalRowsDetected: 2,
        rowsImported: 2,
        rowsFailed: 0,
      }),
    );
  });
});
