import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, NotFoundException, ConflictException } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { makeAuthGuard, ALLOW_ALL_GUARD, DENY_GUARD, UNAUTH_GUARD, SUPER_ADMIN_USER } from '../../test/test-helpers';

const ORG = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Acme Corp',
  slug: 'acme-corp',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
};

async function buildApp(
  authGuard = makeAuthGuard(),
  rbacGuard = ALLOW_ALL_GUARD,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [OrganizationsController],
    providers: [
      { provide: OrganizationsService, useValue: mockService },
      { provide: APP_GUARD, useValue: authGuard },
    ],
  })
    .overrideGuard(RbacGuard)
    .useValue(rbacGuard)
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

describe('OrganizationsController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  describe('GET /organizations', () => {
    it('returns 200 with list', async () => {
      mockService.findAll.mockResolvedValue([ORG]);
      const res = await request(app.getHttpServer()).get('/organizations');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].slug).toBe('acme-corp');
    });

    it('returns 403 when permission denied', async () => {
      const restricted = await buildApp(makeAuthGuard(), DENY_GUARD);
      const res = await request(restricted.getHttpServer()).get('/organizations');
      expect(res.status).toBe(403);
      await restricted.close();
    });

    it('returns 401 when not authenticated', async () => {
      const unauth = await buildApp(UNAUTH_GUARD as any);
      const res = await request(unauth.getHttpServer()).get('/organizations');
      expect(res.status).toBe(401);
      await unauth.close();
    });
  });

  describe('GET /organizations/:id', () => {
    it('returns 200 with org', async () => {
      mockService.findOne.mockResolvedValue(ORG);
      const res = await request(app.getHttpServer()).get(`/organizations/${ORG.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ORG.id);
    });

    it('returns 404 when not found', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException('Organization not found'));
      const res = await request(app.getHttpServer()).get(`/organizations/${ORG.id}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid UUID param', async () => {
      const res = await request(app.getHttpServer()).get('/organizations/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /organizations', () => {
    it('returns 201 on create with auto-generated slug', async () => {
      mockService.create.mockResolvedValue(ORG);
      const res = await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Acme Corp' });
      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('acme-corp');
    });

    it('returns 201 with optional address field', async () => {
      mockService.create.mockResolvedValue({ ...ORG, address: '123 Main St' });
      const res = await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Acme Corp', address: '123 Main St' });
      expect(res.status).toBe(201);
    });

    it('returns 409 when name already exists', async () => {
      mockService.create.mockRejectedValue(new ConflictException('Organization name already exists'));
      const res = await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Acme Corp' });
      expect(res.status).toBe(409);
    });

    it('returns 400 when required fields missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/organizations')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /organizations/:id', () => {
    it('returns 200 on update', async () => {
      const updated = { ...ORG, name: 'Acme Updated' };
      mockService.update.mockResolvedValue(updated);
      const res = await request(app.getHttpServer())
        .patch(`/organizations/${ORG.id}`)
        .send({ name: 'Acme Updated' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Acme Updated');
    });

    it('returns 404 when org not found', async () => {
      mockService.update.mockRejectedValue(new NotFoundException('Organization not found'));
      const res = await request(app.getHttpServer())
        .patch(`/organizations/${ORG.id}`)
        .send({ name: 'New' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /organizations/:id', () => {
    it('returns 204 on deactivate', async () => {
      mockService.deactivate.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).delete(`/organizations/${ORG.id}`);
      expect(res.status).toBe(204);
      expect(mockService.deactivate).toHaveBeenCalledWith(ORG.id, SUPER_ADMIN_USER.id);
    });

    it('returns 404 when org not found', async () => {
      mockService.deactivate.mockRejectedValue(new NotFoundException('Organization not found'));
      const res = await request(app.getHttpServer()).delete(`/organizations/${ORG.id}`);
      expect(res.status).toBe(404);
    });
  });
});
