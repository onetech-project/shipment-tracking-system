import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { makeAuthGuard, SUPER_ADMIN_USER, UNAUTH_GUARD } from '../../../test/test-helpers';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const UPLOAD_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const ERROR_ID   = 'e1e2e3e4-0000-4000-8000-000000000001';
const ORG_ID     = SUPER_ADMIN_USER.organizationId;

const UPLOAD_STATUS_RESPONSE = {
  uploadId: UPLOAD_ID,
  originalFilename: 'march-batch.pdf',
  status: 'queued',
  totalRowsDetected: 0,
  rowsImported: 0,
  rowsFailed: 0,
  rowsConflicted: 0,
  startedAt: null,
  completedAt: null,
  durationMs: null,
};

const UPLOAD_ERRORS_RESPONSE = {
  items: [
    {
      id: ERROR_ID,
      rowNumber: 14,
      errorType: 'duplicate',
      fieldName: null,
      message: "Shipment ID 'SHP-001' already exists.",
      incomingPayload: { shipmentId: 'SHP-001', origin: 'Jakarta', destination: 'Bandung', status: 'pending' },
      existingShipmentId: 'f1f2f3f4-0000-4000-8000-000000000001',
      resolved: false,
      resolution: null,
    },
  ],
};

const HISTORY_RESPONSE = {
  items: [{ uploadId: UPLOAD_ID, originalFilename: 'march-batch.pdf', status: 'completed', totalRowsDetected: 10, rowsImported: 10, rowsFailed: 0, rowsConflicted: 0, createdAt: new Date().toISOString(), completedAt: null }],
  nextCursor: null,
};

const mockService = {
  createUploadRecord: jest.fn(),
  getStatus: jest.fn(),
  getErrors: jest.fn(),
  resolveConflicts: jest.fn(),
  getHistory: jest.fn(),
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildApp(authGuard = makeAuthGuard()): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [ImportController],
    providers: [
      { provide: ImportService, useValue: mockService },
      { provide: APP_GUARD, useValue: authGuard },
    ],
  }).compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImportController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  // ——— POST /shipments/imports ———

  describe('POST /shipments/imports', () => {
    it('returns 202 with uploadId when valid PDF is uploaded', async () => {
      mockService.createUploadRecord.mockResolvedValue({
        uploadId: UPLOAD_ID,
        status: 'queued',
        message: 'Import queued.',
      });

      const res = await request(app.getHttpServer())
        .post('/shipments/imports')
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'march-batch.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('uploadId');
    });

    it('returns 400 INVALID_FILE_TYPE for non-PDF file', async () => {
      const res = await request(app.getHttpServer())
        .post('/shipments/imports')
        .attach('file', Buffer.from('not-a-pdf'), {
          filename: 'data.csv',
          contentType: 'text/csv',
        });

      expect(res.status).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      const unauthApp = await buildApp(UNAUTH_GUARD);
      const res = await request(unauthApp.getHttpServer())
        .post('/shipments/imports')
        .attach('file', Buffer.from('%PDF-1.4'), {
          filename: 'test.pdf',
          contentType: 'application/pdf',
        });
      expect(res.status).toBe(401);
      await unauthApp.close();
    });
  });

  // ——— GET /shipments/imports/history ———

  describe('GET /shipments/imports/history', () => {
    it('returns 200 with paginated history', async () => {
      mockService.getHistory.mockResolvedValue(HISTORY_RESPONSE);
      const res = await request(app.getHttpServer()).get('/shipments/imports/history');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('returns history including both shipment and linehaul uploads', async () => {
      const mixedHistory = {
        items: [
          {
            uploadId: 'lh-upload-0000-4000-8000-000000000001',
            originalFilename: 'linehaul-trip-march.pdf',
            status: 'completed',
            totalRowsDetected: 25,
            rowsImported: 23,
            rowsFailed: 2,
            rowsConflicted: 0,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
          {
            uploadId: UPLOAD_ID,
            originalFilename: 'march-batch.pdf',
            status: 'completed',
            totalRowsDetected: 10,
            rowsImported: 10,
            rowsFailed: 0,
            rowsConflicted: 0,
            createdAt: new Date().toISOString(),
            completedAt: null,
          },
        ],
        nextCursor: null,
      };
      mockService.getHistory.mockResolvedValue(mixedHistory);

      const res = await request(app.getHttpServer()).get('/shipments/imports/history');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].originalFilename).toBe('linehaul-trip-march.pdf');
      expect(res.body.items[0].rowsImported).toBe(23);
      expect(res.body.items[0].rowsFailed).toBe(2);
      expect(res.body.items[1].originalFilename).toBe('march-batch.pdf');
    });

    it('returns linehaul upload with partial status and correct counters', async () => {
      const partialLinehaul = {
        items: [
          {
            uploadId: 'lh-partial-0000-4000-8000-000000000001',
            originalFilename: 'linehaul-partial.pdf',
            status: 'partial',
            totalRowsDetected: 15,
            rowsImported: 12,
            rowsFailed: 3,
            rowsConflicted: 0,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      };
      mockService.getHistory.mockResolvedValue(partialLinehaul);

      const res = await request(app.getHttpServer()).get('/shipments/imports/history');
      expect(res.status).toBe(200);
      expect(res.body.items[0].status).toBe('partial');
      expect(res.body.items[0].totalRowsDetected).toBe(15);
      expect(res.body.items[0].rowsImported).toBe(12);
      expect(res.body.items[0].rowsFailed).toBe(3);
    });

    it('returns linehaul upload with awaiting_conflict_review for duplicate trip', async () => {
      const conflictLinehaul = {
        items: [
          {
            uploadId: 'lh-conflict-0000-4000-8000-000000000001',
            originalFilename: 'linehaul-dup.pdf',
            status: 'awaiting_conflict_review',
            totalRowsDetected: 20,
            rowsImported: 0,
            rowsFailed: 0,
            rowsConflicted: 1,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      };
      mockService.getHistory.mockResolvedValue(conflictLinehaul);

      const res = await request(app.getHttpServer()).get('/shipments/imports/history');
      expect(res.status).toBe(200);
      expect(res.body.items[0].status).toBe('awaiting_conflict_review');
      expect(res.body.items[0].rowsConflicted).toBe(1);
    });

    it('returns 401 when unauthenticated', async () => {
      const unauthApp = await buildApp(UNAUTH_GUARD);
      const res = await request(unauthApp.getHttpServer()).get('/shipments/imports/history');
      expect(res.status).toBe(401);
      await unauthApp.close();
    });
  });

  // ——— GET /shipments/imports/:id ———

  describe('GET /shipments/imports/:id', () => {
    it('returns 200 with upload status', async () => {
      mockService.getStatus.mockResolvedValue(UPLOAD_STATUS_RESPONSE);
      const res = await request(app.getHttpServer()).get(`/shipments/imports/${UPLOAD_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.uploadId).toBe(UPLOAD_ID);
      expect(res.body.status).toBe('queued');
    });

    it('returns 401 when unauthenticated', async () => {
      const unauthApp = await buildApp(UNAUTH_GUARD);
      const res = await request(unauthApp.getHttpServer()).get(`/shipments/imports/${UPLOAD_ID}`);
      expect(res.status).toBe(401);
      await unauthApp.close();
    });
  });

  // ——— GET /shipments/imports/:id/errors ———

  describe('GET /shipments/imports/:id/errors', () => {
    it('returns 200 with error rows', async () => {
      mockService.getErrors.mockResolvedValue(UPLOAD_ERRORS_RESPONSE);
      const res = await request(app.getHttpServer()).get(`/shipments/imports/${UPLOAD_ID}/errors`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].errorType).toBe('duplicate');
    });

    it('returns 401 when unauthenticated', async () => {
      const unauthApp = await buildApp(UNAUTH_GUARD);
      const res = await request(unauthApp.getHttpServer()).get(
        `/shipments/imports/${UPLOAD_ID}/errors`,
      );
      expect(res.status).toBe(401);
      await unauthApp.close();
    });
  });

  // ——— POST /shipments/imports/:id/conflicts/resolve ———

  describe('POST /shipments/imports/:id/conflicts/resolve', () => {
    it('returns 200 with updated status after resolving conflicts', async () => {
      mockService.resolveConflicts.mockResolvedValue({
        uploadId: UPLOAD_ID,
        status: 'completed',
        rowsImported: 10,
        rowsFailed: 0,
        rowsConflicted: 1,
      });

      const res = await request(app.getHttpServer())
        .post(`/shipments/imports/${UPLOAD_ID}/conflicts/resolve`)
        .send({ decisions: [{ errorId: ERROR_ID, action: 'overwrite' }] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(app.getHttpServer())
        .post(`/shipments/imports/${UPLOAD_ID}/conflicts/resolve`)
        .send({ decisions: [{ errorId: ERROR_ID, action: 'delete' }] });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty decisions array', async () => {
      const res = await request(app.getHttpServer())
        .post(`/shipments/imports/${UPLOAD_ID}/conflicts/resolve`)
        .send({ decisions: [] });

      expect(res.status).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      const unauthApp = await buildApp(UNAUTH_GUARD);
      const res = await request(unauthApp.getHttpServer())
        .post(`/shipments/imports/${UPLOAD_ID}/conflicts/resolve`)
        .send({ decisions: [{ errorId: ERROR_ID, action: 'overwrite' }] });
      expect(res.status).toBe(401);
      await unauthApp.close();
    });
  });
});
