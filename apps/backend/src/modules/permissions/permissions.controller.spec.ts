import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { makeAuthGuard, ALLOW_ALL_GUARD, DENY_GUARD, UNAUTH_GUARD } from '../../test/test-helpers';

const PERM_ID = 'd0000000-0000-4000-8000-000000000001';

const PERMISSION = {
  id: PERM_ID,
  name: 'read.shipment',
  resource: 'shipment',
  action: 'read',
  description: null,
  createdAt: new Date().toISOString(),
};

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  seedPermissions: jest.fn(),
  getPermissionsForUser: jest.fn(),
  onApplicationBootstrap: jest.fn(),
};

async function buildApp(
  authGuard = makeAuthGuard(),
  rbacGuard = ALLOW_ALL_GUARD,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [PermissionsController],
    providers: [
      { provide: PermissionsService, useValue: mockService },
      { provide: APP_GUARD, useValue: authGuard },
    ],
  })
    .overrideGuard(RbacGuard)
    .useValue(rbacGuard)
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

describe('PermissionsController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  describe('GET /permissions', () => {
    it('returns 200 with all permissions', async () => {
      mockService.findAll.mockResolvedValue([PERMISSION]);
      const res = await request(app.getHttpServer()).get('/permissions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('read.shipment');
    });

    it('returns 403 when permission denied', async () => {
      const restricted = await buildApp(makeAuthGuard(), DENY_GUARD);
      const res = await request(restricted.getHttpServer()).get('/permissions');
      expect(res.status).toBe(403);
      await restricted.close();
    });

    it('returns 401 when not authenticated', async () => {
      const unauth = await buildApp(UNAUTH_GUARD as any);
      const res = await request(unauth.getHttpServer()).get('/permissions');
      expect(res.status).toBe(401);
      await unauth.close();
    });
  });

  describe('GET /permissions/:id', () => {
    it('returns 200 with permission', async () => {
      mockService.findOne.mockResolvedValue(PERMISSION);
      const res = await request(app.getHttpServer()).get(`/permissions/${PERM_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(PERM_ID);
    });

    it('returns 404 when not found', async () => {
      mockService.findOne.mockResolvedValue(null);
      const res = await request(app.getHttpServer()).get(`/permissions/${PERM_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid UUID param', async () => {
      const res = await request(app.getHttpServer()).get('/permissions/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });
});
