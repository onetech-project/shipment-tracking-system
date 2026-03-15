import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { makeAuthGuard, ALLOW_ALL_GUARD, DENY_GUARD, SUPER_ADMIN_USER } from '../../test/test-helpers';

const ORG_ID = SUPER_ADMIN_USER.organizationId;
const USER_ID = SUPER_ADMIN_USER.id;
const INVITATION_ID = 'e0000000-0000-4000-8000-000000000001';
const ROLE_ID = 'c0000000-0000-4000-8000-000000000001';

const INVITATION = {
  id: INVITATION_ID,
  email: 'newuser@example.com',
  organizationId: ORG_ID,
  roleId: ROLE_ID,
  invitedBy: USER_ID,
  status: 'pending',
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
};

const mockService = {
  findAll: jest.fn(),
  create: jest.fn(),
  cancel: jest.fn(),
  accept: jest.fn(),
};

async function buildApp(
  authGuard = makeAuthGuard(),
  rbacGuard = ALLOW_ALL_GUARD,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [InvitationsController],
    providers: [
      { provide: InvitationsService, useValue: mockService },
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

describe('InvitationsController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  describe('GET /invitations', () => {
    it('returns 200 with invitations for org', async () => {
      mockService.findAll.mockResolvedValue([INVITATION]);
      const res = await request(app.getHttpServer()).get('/invitations');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].email).toBe('newuser@example.com');
      expect(mockService.findAll).toHaveBeenCalledWith(ORG_ID);
    });

    it('returns 403 when permission denied', async () => {
      const restricted = await buildApp(makeAuthGuard(), DENY_GUARD);
      const res = await request(restricted.getHttpServer()).get('/invitations');
      expect(res.status).toBe(403);
      await restricted.close();
    });
  });

  describe('POST /invitations', () => {
    it('returns 201 on create', async () => {
      mockService.create.mockResolvedValue(INVITATION);
      const res = await request(app.getHttpServer())
        .post('/invitations')
        .send({ email: 'newuser@example.com', roleId: ROLE_ID });
      expect(res.status).toBe(201);
      expect(mockService.create).toHaveBeenCalledWith(
        { email: 'newuser@example.com', roleId: ROLE_ID },
        ORG_ID,
        USER_ID,
      );
    });

    it('returns 409 when pending invitation already exists', async () => {
      mockService.create.mockRejectedValue(
        new ConflictException('Pending invitation already exists for this email'),
      );
      const res = await request(app.getHttpServer())
        .post('/invitations')
        .send({ email: 'newuser@example.com', roleId: ROLE_ID });
      expect(res.status).toBe(409);
    });

    it('returns 400 when email is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/invitations')
        .send({ email: 'not-an-email', roleId: ROLE_ID });
      expect(res.status).toBe(400);
    });

    it('returns 400 when roleId is invalid UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/invitations')
        .send({ email: 'user@example.com', roleId: 'not-a-uuid' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /invitations/:id', () => {
    it('returns 204 on cancel', async () => {
      mockService.cancel.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).delete(`/invitations/${INVITATION_ID}`);
      expect(res.status).toBe(204);
      expect(mockService.cancel).toHaveBeenCalledWith(INVITATION_ID, ORG_ID, USER_ID);
    });

    it('returns 404 when invitation not found', async () => {
      mockService.cancel.mockRejectedValue(new NotFoundException('Invitation not found'));
      const res = await request(app.getHttpServer()).delete(`/invitations/${INVITATION_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 when invitation is not pending', async () => {
      mockService.cancel.mockRejectedValue(new BadRequestException('Invitation is not pending'));
      const res = await request(app.getHttpServer()).delete(`/invitations/${INVITATION_ID}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /invitations/accept (public)', () => {
    it('returns 200 on successful accept', async () => {
      mockService.accept.mockResolvedValue({ ...INVITATION, status: 'accepted' });
      const res = await request(app.getHttpServer())
        .post('/invitations/accept')
        .query({ token: 'valid-raw-token' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('accepted');
    });

    it('returns 400 on invalid or expired token', async () => {
      mockService.accept.mockRejectedValue(
        new BadRequestException('INVALID_OR_EXPIRED_INVITATION'),
      );
      const res = await request(app.getHttpServer())
        .post('/invitations/accept')
        .query({ token: 'expired-token' });
      expect(res.status).toBe(400);
    });
  });
});
