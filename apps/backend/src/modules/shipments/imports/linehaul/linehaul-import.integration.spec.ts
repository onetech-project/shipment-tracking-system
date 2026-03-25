import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { LinehaulParserService } from './linehaul-parser.service'
import { LinehaulImportService } from './linehaul-import.service'
import { LinehaulTrip } from '../../entities/linehaul-trip.entity'
import { LinehaulTripItem } from '../../entities/linehaul-trip-item.entity'
import { ShipmentUpload, UploadStatus } from '../../entities/shipment-upload.entity'
import { ShipmentUploadError } from '../../entities/shipment-upload-error.entity'

// -----------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------

/** Create a positioned text block as pdfjs-dist would produce (y=0 at top). */
function tb(x: number, y: number, text: string) {
  return { x, y, text }
}

let mockBlocks: ReturnType<typeof tb>[] = []

const UPLOAD_ID = 'upload-uuid-int01'
const ORG_ID = 'org-uuid-0001'
const USER_ID = 'user-uuid-0001'

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
  }) as ShipmentUpload

// In-memory stores to simulate DB
let tripsDb: Record<string, unknown>[]
let itemsDb: Record<string, unknown>[]
let errorsDb: Record<string, unknown>[]
let uploadRecord: ShipmentUpload

function makeRepo(store: Record<string, unknown>[]) {
  return {
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(
        store.find((r: any) => {
          return Object.entries(where).every(([k, v]) => r[k] === v)
        }) ?? null
      )
    }),
    find: jest.fn().mockImplementation(() => Promise.resolve([...store])),
    create: jest
      .fn()
      .mockImplementation((v) => ({ id: `gen-${Math.random().toString(36).slice(2, 8)}`, ...v })),
    save: jest.fn().mockImplementation((v) => {
      if (Array.isArray(v)) {
        v.forEach((item: any) => store.push(item))
        return Promise.resolve(v)
      }
      store.push(v)
      return Promise.resolve(v)
    }),
  }
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('Linehaul Import Integration', () => {
  let parser: LinehaulParserService
  let importService: LinehaulImportService
  let uploadRepo: ReturnType<typeof makeRepo>
  let eventEmitter: { emit: jest.Mock }

  beforeEach(async () => {
    mockBlocks = []
    tripsDb = []
    itemsDb = []
    errorsDb = []
    uploadRecord = makeUpload()

    uploadRepo = {
      findOne: jest.fn().mockResolvedValue(uploadRecord),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => {
        Object.assign(uploadRecord, v)
        return Promise.resolve(uploadRecord)
      }),
    }

    eventEmitter = { emit: jest.fn() }

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
    }).compile()

    parser = module.get(LinehaulParserService)
    importService = module.get(LinehaulImportService)

    // Mock the private extractTextBlocks to return test data instead of reading a real PDF
    jest
      .spyOn(parser as any, 'extractTextBlocks')
      .mockImplementation(() => Promise.resolve(mockBlocks))
  })

  it('full pipeline: parse → persist → verify trip + items + upload status', async () => {
    mockBlocks = [
      // Header
      tb(230, 25, 'Surat Jalan'),
      tb(240, 45, 'LT2026031901'),
      tb(30, 80, 'Origin'),
      tb(200, 80, 'Jakarta'),
      tb(30, 100, 'Destination'),
      tb(200, 100, 'Bandung'),
      tb(400, 45, 'B1234XYZ'),
      // Table header
      tb(60, 250, 'Nomor TO'),
      tb(200, 250, 'Weight'),
      tb(330, 250, 'Destination'),
      // Table rows
      tb(60, 280, 'TO-001'),
      tb(200, 280, '12.5'),
      tb(330, 280, 'Bandung'),
      tb(60, 310, 'TO-002'),
      tb(200, 310, '8.0'),
      tb(330, 310, 'Surabaya'),
    ]

    // Step 1: Parse
    const result = await parser.parse(Buffer.from('test'))
    expect(result.trip.tripCode).toBe('LT2026031901')
    expect(result.items.length).toBe(2)

    // Step 2: Import
    await importService.import({
      trip: result.trip,
      items: result.items,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    })

    // Step 3: Verify trip was persisted
    expect(tripsDb.length).toBe(1)
    expect(tripsDb[0]).toEqual(
      expect.objectContaining({
        tripCode: 'LT2026031901',
        organizationId: ORG_ID,
      })
    )

    // Step 4: Verify items were persisted
    expect(itemsDb.length).toBe(2)
    expect(itemsDb[0]).toEqual(expect.objectContaining({ toNumber: 'TO-001' }))
    expect(itemsDb[1]).toEqual(expect.objectContaining({ toNumber: 'TO-002' }))

    // Step 5: Verify upload status and counters
    expect(uploadRecord.status).toBe(UploadStatus.COMPLETED)
    expect(uploadRecord.totalRowsDetected).toBe(2)
    expect(uploadRecord.rowsImported).toBe(2)
    expect(uploadRecord.rowsFailed).toBe(0)
  })

  it('handles duplicate trip_code correctly', async () => {
    // Pre-seed a trip with same code
    tripsDb.push({
      id: 'existing-trip',
      organizationId: ORG_ID,
      tripCode: 'LT2026031901',
    })

    mockBlocks = [
      tb(230, 25, 'Surat Jalan'),
      tb(240, 45, 'LT2026031901'),
      tb(30, 80, 'Origin'),
      tb(200, 80, 'Jakarta'),
      tb(30, 100, 'Destination'),
      tb(200, 100, 'Bandung'),
      tb(60, 250, 'Nomor TO'),
      tb(200, 250, 'Weight'),
      tb(60, 280, 'TO-001'),
      tb(200, 280, '10'),
    ]

    const result = await parser.parse(Buffer.from('test'))
    await importService.import({
      trip: result.trip,
      items: result.items,
      uploadId: UPLOAD_ID,
      organizationId: ORG_ID,
      userId: USER_ID,
    })

    expect(uploadRecord.status).toBe(UploadStatus.AWAITING_CONFLICT_REVIEW)
    expect(uploadRecord.rowsConflicted).toBe(1)
    expect(errorsDb.length).toBe(1)
  })
})
