import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditLog } from './entities/audit-log.entity';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { makeAuthGuard, ALLOW_ALL_GUARD, DENY_GUARD, UNAUTH_GUARD, SUPER_ADMIN_USER } from '../../test/test-helpers';

const ORG_ID = SUPER_ADMIN_USER.organizationId;

const LOG_ENTRY = {
  id: 'f0000000-0000-4000-8000-000000000001',
  action: 'auth.login',
  organizationId: ORG_ID,
  actorId: SUPER_ADMIN_USER.id,
  resourceType: 'user',
  resourceId: SUPER_ADMIN_USER.id,
  createdAt: new Date().toISOString(),
};

const mockRepo = {
  findAndCount: jest.fn(),
};

async function buildApp(
  authGuard = makeAuthGuard(),
  rbacGuard = ALLOW_ALL_GUARD,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [AuditController],
    providers: [
      { provide: getRepositoryToken(AuditLog), useValue: mockRepo },
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

describe('AuditController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  describe('GET /audit', () => {
    it('returns 200 with paginated logs for the org', async () => {
      mockRepo.findAndCount.mockResolvedValue([[LOG_ENTRY], 1]);
      const res = await request(app.getHttpServer()).get('/audit');
      expect(res.status).toBe(200);
      // findAndCount returns [rows, count] – controller returns it directly as a tuple
      expect(Array.isArray(res.body)).toBe(true);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_ID },
          skip: 0,
          take: 50,
        }),
      );
    });

    it('respects page and limit query params', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      const res = await request(app.getHttpServer()).get('/audit?page=2&limit=10');
      expect(res.status).toBe(200);
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('uses defaults (page=1, limit=50) when params omitted', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);
      await request(app.getHttpServer()).get('/audit');
      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });

    it('returns 403 when permission denied', async () => {
      const restricted = await buildApp(makeAuthGuard(), DENY_GUARD);
      const res = await request(restricted.getHttpServer()).get('/audit');
      expect(res.status).toBe(403);
      await restricted.close();
    });

    it('returns 401 when not authenticated', async () => {
      const unauth = await buildApp(UNAUTH_GUARD as any);
      const res = await request(unauth.getHttpServer()).get('/audit');
      expect(res.status).toBe(401);
      await unauth.close();
    });
  });
});
