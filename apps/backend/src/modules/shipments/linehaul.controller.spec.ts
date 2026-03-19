import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LinehaulController } from './linehaul.controller';
import { LinehaulTrip } from './entities/linehaul-trip.entity';
import { LinehaulTripItem } from './entities/linehaul-trip-item.entity';
import {
  makeAuthGuard,
  SUPER_ADMIN_USER,
  REGULAR_USER,
  UNAUTH_GUARD,
} from '../../test/test-helpers';

// -----------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------

const ORG_ID = SUPER_ADMIN_USER.organizationId;
const OTHER_ORG_ID = 'b0000000-0000-4000-8000-999999999999';
const TRIP_ID = 'trip-uuid-0001';

const TRIP: Partial<LinehaulTrip> = {
  id: TRIP_ID,
  organizationId: ORG_ID,
  tripCode: 'LT2026031901',
  schedule: 'SCH-001',
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
};

const ITEM: Partial<LinehaulTripItem> = {
  id: 'item-uuid-0001',
  linehaulTripId: TRIP_ID,
  toNumber: 'TO-2026031900001',
  weight: 12.5,
  destination: 'Bandung',
  dgType: 'non-dg',
  toType: 'REGULAR',
  linehaulTrip: TRIP as LinehaulTrip,
};

const ITEMS = [ITEM, {
  id: 'item-uuid-0002',
  linehaulTripId: TRIP_ID,
  toNumber: 'TO-2026031900002',
  weight: 8.0,
  destination: 'Surabaya',
  dgType: null,
  toType: 'EXPRESS',
}];

// -----------------------------------------------------------------------
// Mock repos
// -----------------------------------------------------------------------

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

function makeItemRepo() {
  return {
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  };
}

// -----------------------------------------------------------------------
// App factory
// -----------------------------------------------------------------------

async function buildApp(
  authGuard = makeAuthGuard(),
  tripRepoOverride?: ReturnType<typeof makeTripRepo>,
  itemRepoOverride?: ReturnType<typeof makeItemRepo>,
): Promise<INestApplication> {
  const tripRepo = tripRepoOverride ?? makeTripRepo();
  const itemRepo = itemRepoOverride ?? makeItemRepo();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [LinehaulController],
    providers: [
      { provide: getRepositoryToken(LinehaulTrip), useValue: tripRepo },
      { provide: getRepositoryToken(LinehaulTripItem), useValue: itemRepo },
      { provide: APP_GUARD, useValue: authGuard },
    ],
  }).compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('LinehaulController', () => {
  afterAll(() => jest.restoreAllMocks());

  describe('GET /shipments/linehaul/items/:toNumber', () => {
    it('returns 200 with item + parent trip for valid toNumber', async () => {
      const itemRepo = makeItemRepo();
      itemRepo.createQueryBuilder().getOne.mockResolvedValue(ITEM);

      const app = await buildApp(makeAuthGuard(), undefined, itemRepo);
      const res = await request(app.getHttpServer())
        .get('/shipments/linehaul/items/TO-2026031900001')
        .expect(200);

      expect(res.body).toHaveProperty('item');
      expect(res.body).toHaveProperty('trip');
      expect(res.body.item.toNumber).toBe('TO-2026031900001');
      expect(res.body.trip.tripCode).toBe('LT2026031901');

      await app.close();
    });

    it('returns 404 TRIP_ITEM_NOT_FOUND when not found in org', async () => {
      const app = await buildApp();
      const res = await request(app.getHttpServer())
        .get('/shipments/linehaul/items/TO-UNKNOWN')
        .expect(404);

      expect(res.body.code).toBe('TRIP_ITEM_NOT_FOUND');
      await app.close();
    });

    it('returns 400 INVALID_TO_NUMBER_FORMAT for malformed toNumber', async () => {
      const app = await buildApp();
      const res = await request(app.getHttpServer())
        .get('/shipments/linehaul/items/X')
        .expect(400);

      expect(res.body.code).toBe('INVALID_TO_NUMBER_FORMAT');
      await app.close();
    });

    it('returns 401 for unauthenticated requests', async () => {
      const app = await buildApp(UNAUTH_GUARD);
      await request(app.getHttpServer())
        .get('/shipments/linehaul/items/TO-001')
        .expect(401);
      await app.close();
    });
  });

  describe('GET /shipments/linehaul/trips', () => {
    it('returns paginated trip list', async () => {
      const tripRepo = makeTripRepo();
      tripRepo.createQueryBuilder().getRawAndEntities.mockResolvedValue({
        entities: [TRIP as LinehaulTrip],
        raw: [{ ...TRIP, itemCount: '15' }],
      });

      const app = await buildApp(makeAuthGuard(), tripRepo);
      const res = await request(app.getHttpServer())
        .get('/shipments/linehaul/trips')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].tripCode).toBe('LT2026031901');
      await app.close();
    });
  });

  describe('GET /shipments/linehaul/trips/:tripId', () => {
    it('returns trip + items for own org', async () => {
      const tripRepo = makeTripRepo();
      tripRepo.findOne.mockResolvedValue({
        ...TRIP,
        items: ITEMS,
      });

      const app = await buildApp(makeAuthGuard(), tripRepo);
      const res = await request(app.getHttpServer())
        .get(`/shipments/linehaul/trips/${TRIP_ID}`)
        .expect(200);

      expect(res.body.trip.tripCode).toBe('LT2026031901');
      expect(res.body.items).toHaveLength(2);
      await app.close();
    });

    it('returns 403 for cross-org trip', async () => {
      const tripRepo = makeTripRepo();
      tripRepo.findOne.mockResolvedValue({
        ...TRIP,
        organizationId: OTHER_ORG_ID,
        items: [],
      });

      const app = await buildApp(makeAuthGuard(), tripRepo);
      const res = await request(app.getHttpServer())
        .get(`/shipments/linehaul/trips/${TRIP_ID}`)
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      await app.close();
    });

    it('returns 404 for non-existent trip', async () => {
      const app = await buildApp();
      const res = await request(app.getHttpServer())
        .get('/shipments/linehaul/trips/nonexistent-id')
        .expect(404);

      expect(res.body.code).toBe('TRIP_NOT_FOUND');
      await app.close();
    });
  });
});
