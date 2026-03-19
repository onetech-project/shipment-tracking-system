import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LinehaulParserService } from './linehaul-parser.service';
import { LinehaulImportService } from './linehaul-import.service';
import { LinehaulTrip } from '../../entities/linehaul-trip.entity';
import { LinehaulTripItem } from '../../entities/linehaul-trip-item.entity';
import { ShipmentUpload, UploadStatus } from '../../entities/shipment-upload.entity';
import { ShipmentUploadError } from '../../entities/shipment-upload-error.entity';

// -----------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------

let mockPdfData: unknown = { Pages: [] };
let mockShouldFail = false;

jest.mock('pdf2json', () => {
  return jest.fn().mockImplementation(() => ({
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === 'pdfParser_dataReady' && !mockShouldFail) {
        setTimeout(() => cb(mockPdfData), 0);
      }
      if (event === 'pdfParser_dataError' && mockShouldFail) {
        setTimeout(() => cb({ parserError: 'corrupt PDF' }), 0);
      }
    },
    parseBuffer: jest.fn(),
  }));
});

function makeTextItem(x: number, y: number, text: string) {
  return { x, y, R: [{ T: encodeURIComponent(text) }] };
}

const UPLOAD_ID = 'upload-uuid-int01';
const ORG_ID = 'org-uuid-0001';
const USER_ID = 'user-uuid-0001';

const makeUpload = (): ShipmentUpload =>
  ({
    id: UPLOAD_ID,
    organizationId: ORG_ID,
    uploadedByUserId: USER_ID,
    originalFilename: 'linehaul-trip.pdf',
    fileHash: 'hash456',
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
  }) as ShipmentUpload;

// In-memory stores to simulate DB
let tripsDb: Record<string, unknown>[];
let itemsDb: Record<string, unknown>[];
let errorsDb: Record<string, unknown>[];
let uploadRecord: ShipmentUpload;

function makeRepo(store: Record<string, unknown>[]) {
  return {
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(store.find((r: any) => {
        return Object.entries(where).every(([k, v]) => r[k] === v);
      }) ?? null);
    }),
    find: jest.fn().mockImplementation(() => Promise.resolve([...store])),
    create: jest.fn().mockImplementation((v) => ({ id: `gen-${Math.random().toString(36).slice(2, 8)}`, ...v })),
    save: jest.fn().mockImplementation((v) => {
      if (Array.isArray(v)) {
        v.forEach((item: any) => store.push(item));
        return Promise.resolve(v);
      }
      store.push(v);
      return Promise.resolve(v);
    }),
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('Linehaul Import Integration', () => {
  let parser: LinehaulParserService;
  let importService: LinehaulImportService;
  let uploadRepo: ReturnType<typeof makeRepo>;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    mockShouldFail = false;
    tripsDb = [];
    itemsDb = [];
    errorsDb = [];
    uploadRecord = makeUpload();

    uploadRepo = {
      findOne: jest.fn().mockResolvedValue(uploadRecord),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => {
        Object.assign(uploadRecord, v);
        return Promise.resolve(uploadRecord);
      }),
    };

    eventEmitter = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LinehaulParserService,
        LinehaulImportService,
        { provide: getRepositoryToken(LinehaulTrip), useValue: makeRepo(tripsDb) },
        { provide: getRepositoryToken(LinehaulTripItem), useValue: makeRepo(itemsDb) },
        { provide: getRepositoryToken(ShipmentUpload), useValue: uploadRepo },
        { provide: getRepositoryToken(ShipmentUploadError), useValue: makeRepo(errorsDb) },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    parser = module.get(LinehaulParserService);
    importService = module.get(LinehaulImportService);
  });

  it('full pipeline: parse → persist → verify trip + items + upload status', async () => {
    // Set up PDF data with header and table
    mockPdfData = {
      Pages: [{
        Texts: [
          // Header
          makeTextItem(2, 1, 'Surat Jalan'),
          makeTextItem(2, 2, 'LT2026031901'),
          makeTextItem(2, 3, 'Origin'),
          makeTextItem(20, 3, 'Jakarta'),
          makeTextItem(2, 4, 'Destination'),
          makeTextItem(20, 4, 'Bandung'),
          makeTextItem(40, 2, 'B1234XYZ'),
          // Table header
          makeTextItem(2, 10, 'Nomor TO'),
          makeTextItem(20, 10, 'Weight'),
          makeTextItem(35, 10, 'Destination'),
          // Table rows
          makeTextItem(2, 12, 'TO-001'),
          makeTextItem(20, 12, '12.5'),
          makeTextItem(35, 12, 'Bandung'),
          makeTextItem(2, 14, 'TO-002'),
          makeTextItem(20, 14, '8.0'),
          makeTextItem(35, 14, 'Surabaya'),
        ],
      }],
    };

    // Step 1: Parse
    const result = await parser.parse(Buffer.from('test'));
    expect(result.trip.tripCode).toBe('LT2026031901');
    expect(result.items.length).toBe(2);

    // Step 2: Import
    await importService.import({
      trip: result.trip,
      items: result.items,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    // Step 3: Verify trip was persisted
    expect(tripsDb.length).toBe(1);
    expect(tripsDb[0]).toEqual(expect.objectContaining({
      tripCode: 'LT2026031901',
      organizationId: ORG_ID,
    }));

    // Step 4: Verify items were persisted
    expect(itemsDb.length).toBe(2);
    expect(itemsDb[0]).toEqual(expect.objectContaining({ toNumber: 'TO-001' }));
    expect(itemsDb[1]).toEqual(expect.objectContaining({ toNumber: 'TO-002' }));

    // Step 5: Verify upload status and counters
    expect(uploadRecord.status).toBe(UploadStatus.COMPLETED);
    expect(uploadRecord.totalRowsDetected).toBe(2);
    expect(uploadRecord.rowsImported).toBe(2);
    expect(uploadRecord.rowsFailed).toBe(0);
  });

  it('handles duplicate trip_code correctly', async () => {
    // Pre-seed a trip with same code
    tripsDb.push({
      id: 'existing-trip',
      organizationId: ORG_ID,
      tripCode: 'LT2026031901',
    });

    mockPdfData = {
      Pages: [{
        Texts: [
          makeTextItem(2, 1, 'Surat Jalan'),
          makeTextItem(2, 2, 'LT2026031901'),
          makeTextItem(2, 3, 'Origin'),
          makeTextItem(20, 3, 'Jakarta'),
          makeTextItem(2, 4, 'Destination'),
          makeTextItem(20, 4, 'Bandung'),
          makeTextItem(2, 10, 'Nomor TO'),
          makeTextItem(20, 10, 'Weight'),
          makeTextItem(2, 12, 'TO-001'),
          makeTextItem(20, 12, '10'),
        ],
      }],
    };

    const result = await parser.parse(Buffer.from('test'));
    await importService.import({
      trip: result.trip,
      items: result.items,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    });

    expect(uploadRecord.status).toBe(UploadStatus.AWAITING_CONFLICT_REVIEW);
    expect(uploadRecord.rowsConflicted).toBe(1);
    expect(errorsDb.length).toBe(1);
  });
});
