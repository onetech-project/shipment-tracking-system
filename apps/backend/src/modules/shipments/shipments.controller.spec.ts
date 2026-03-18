import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { makeAuthGuard, SUPER_ADMIN_USER, UNAUTH_GUARD } from '../../test/test-helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SHIPMENT_RESPONSE = {
  id: 'f0000000-0000-4000-8000-000000000001',
  shipmentId: 'SHP-001',
  origin: 'Jakarta',
  destination: 'Bandung',
  status: 'in_transit',
  carrier: 'JNE Express',
  estimatedDeliveryDate: null,
  contentsDescription: null,
};

const mockService = {
  findByShipmentId: jest.fn(),
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildApp(authGuard = makeAuthGuard()): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [ShipmentsController],
    providers: [
      { provide: ShipmentsService, useValue: mockService },
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

describe('ShipmentsController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  describe('GET /shipments/:shipmentId', () => {
    it('returns 200 with shipment for a known ID', async () => {
      mockService.findByShipmentId.mockResolvedValue(SHIPMENT_RESPONSE);
      const res = await request(app.getHttpServer()).get('/shipments/SHP-001');
      expect(res.status).toBe(200);
      expect(res.body.shipmentId).toBe('SHP-001');
      expect(res.body.origin).toBe('Jakarta');
    });

    it('returns 404 SHIPMENT_NOT_FOUND for unknown ID', async () => {
      mockService.findByShipmentId.mockRejectedValue(new NotFoundException('SHIPMENT_NOT_FOUND'));
      const res = await request(app.getHttpServer()).get('/shipments/SHP-999');
      expect(res.status).toBe(404);
    });

    it('returns 400 INVALID_SHIPMENT_ID_FORMAT for malformed ID', async () => {
      mockService.findByShipmentId.mockRejectedValue(new BadRequestException('INVALID_SHIPMENT_ID_FORMAT'));
      const res = await request(app.getHttpServer()).get('/shipments/!!bad!!');
      expect(res.status).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      const unauthApp = await buildApp(UNAUTH_GUARD);
      const res = await request(unauthApp.getHttpServer()).get('/shipments/SHP-001');
      expect(res.status).toBe(401);
      await unauthApp.close();
    });
  });
});
