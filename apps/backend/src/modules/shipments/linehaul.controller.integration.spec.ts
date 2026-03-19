import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LinehaulController } from './linehaul.controller';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { LinehaulTrip } from './entities/linehaul-trip.entity';
import { LinehaulTripItem } from './entities/linehaul-trip-item.entity';
import { Shipment } from './entities/shipment.entity';
import { makeAuthGuard, SUPER_ADMIN_USER } from '../../test/test-helpers';

// -----------------------------------------------------------------------
// Seeded data
// -----------------------------------------------------------------------

const ORG_ID = SUPER_ADMIN_USER.organizationId;
const TRIP_ID = 'trip-uuid-int01';

const TRIP = {
  id: TRIP_ID,
  organizationId: ORG_ID,
  tripCode: 'LT2026031901',
  origin: 'Jakarta',
  destination: 'Bandung',
  vendor: 'PT Vendor',
  plateNumber: 'B1234XYZ',
  driverName: 'Ahmad',
  std: new Date('2026-03-19T08:00:00Z'),
  sta: new Date('2026-03-19T14:00:00Z'),
  ata: null,
  totalWeight: 1250,
  createdAt: new Date('2026-03-19T07:30:00Z'),
  updatedAt: new Date('2026-03-19T07:30:00Z'),
  schedule: 'SCH-001',
};

const ITEM = {
  id: 'item-uuid-int01',
  linehaulTripId: TRIP_ID,
  toNumber: 'TO-INT001',
  weight: 12.5,
  destination: 'Bandung',
  dgType: 'non-dg',
  toType: 'REGULAR',
  linehaulTrip: TRIP,
};

const SHIPMENT = {
  id: 'shp-uuid-int01',
  organizationId: ORG_ID,
  shipmentId: 'SHP-INT001',
  origin: 'Jakarta',
  destination: 'Bandung',
  status: 'pending',
  carrier: null,
  estimatedDeliveryDate: null,
  contentsDescription: null,
};

// -----------------------------------------------------------------------
// Mock repos
// -----------------------------------------------------------------------

function makeItemRepo() {
  return {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockImplementation(() => Promise.resolve(ITEM)),
    }),
  };
}

function makeTripRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    }),
  };
}

const mockShipmentsService = {
  findByShipmentId: jest.fn().mockResolvedValue(SHIPMENT),
};

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('QR Dual-Lookup Integration', () => {
  let app: INestApplication;
  let itemRepo: ReturnType<typeof makeItemRepo>;

  beforeEach(async () => {
    itemRepo = makeItemRepo();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinehaulController, ShipmentsController],
      providers: [
        { provide: getRepositoryToken(LinehaulTrip), useValue: makeTripRepo() },
        { provide: getRepositoryToken(LinehaulTripItem), useValue: itemRepo },
        { provide: ShipmentsService, useValue: mockShipmentsService },
        { provide: APP_GUARD, useValue: makeAuthGuard() },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('linehaul lookup returns item + trip for valid toNumber', async () => {
    const res = await request(app.getHttpServer())
      .get('/shipments/linehaul/items/TO-INT001')
      .expect(200);

    expect(res.body.item.toNumber).toBe('TO-INT001');
    expect(res.body.trip.tripCode).toBe('LT2026031901');
  });

  it('shipment lookup still works for shipment ID', async () => {
    const res = await request(app.getHttpServer())
      .get('/shipments/SHP-INT001')
      .expect(200);

    expect(res.body.shipmentId).toBe('SHP-INT001');
  });

  it('linehaul lookup returns 404 for unknown toNumber', async () => {
    itemRepo.createQueryBuilder().getOne.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .get('/shipments/linehaul/items/TO-UNKNOWN')
      .expect(404);

    expect(res.body.code).toBe('TRIP_ITEM_NOT_FOUND');
  });
});
