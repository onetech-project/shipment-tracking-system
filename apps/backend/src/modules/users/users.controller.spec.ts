import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { makeAuthGuard, ALLOW_ALL_GUARD, DENY_GUARD, SUPER_ADMIN_USER } from '../../test/test-helpers';

const ORG_ID = SUPER_ADMIN_USER.organizationId;
const USER_ID = SUPER_ADMIN_USER.id;
const TARGET_USER_ID = '00000000-0000-4000-8000-000000000002';

const USER_ROW = {
  id: TARGET_USER_ID,
  username: 'john',
  isActive: true,
  isLocked: false,
  lastLoginAt: null,
  createdAt: new Date().toISOString(),
};

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  changePassword: jest.fn(),
  adminResetPassword: jest.fn(),
  unlockUser: jest.fn(),
  inactivate: jest.fn(),
};

async function buildApp(
  authGuard = makeAuthGuard(),
  rbacGuard = ALLOW_ALL_GUARD,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [
      { provide: UsersService, useValue: mockService },
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

describe('UsersController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  describe('GET /users', () => {
    it('returns 200 with users scoped to org', async () => {
      mockService.findAll.mockResolvedValue([USER_ROW]);
      const res = await request(app.getHttpServer()).get('/users');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockService.findAll).toHaveBeenCalledWith(SUPER_ADMIN_USER);
    });

    it('returns 403 when permission denied', async () => {
      const restricted = await buildApp(makeAuthGuard(), DENY_GUARD);
      const res = await request(restricted.getHttpServer()).get('/users');
      expect(res.status).toBe(403);
      await restricted.close();
    });
  });

  describe('GET /users/:id', () => {
    it('returns 200 with user and profile', async () => {
      mockService.findOne.mockResolvedValue({ ...USER_ROW, profile: { email: 'john@test.com' } });
      const res = await request(app.getHttpServer()).get(`/users/${TARGET_USER_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.profile.email).toBe('john@test.com');
    });

    it('returns 404 when not found', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException('User not found'));
      const res = await request(app.getHttpServer()).get(`/users/${TARGET_USER_ID}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid UUID', async () => {
      const res = await request(app.getHttpServer()).get('/users/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /users', () => {
    const createDto = {
      username: 'john',
      password: 'Password@123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
    };

    it('returns 201 on create', async () => {
      mockService.create.mockResolvedValue(USER_ROW);
      const res = await request(app.getHttpServer()).post('/users').send(createDto);
      expect(res.status).toBe(201);
      expect(mockService.create).toHaveBeenCalledWith(createDto, ORG_ID, USER_ID);
    });

    it('returns 409 on duplicate username', async () => {
      mockService.create.mockRejectedValue(new ConflictException('Username already taken'));
      const res = await request(app.getHttpServer()).post('/users').send(createDto);
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /users/:id', () => {
    it('returns 200 on profile update', async () => {
      const profile = { firstName: 'Johnny', lastName: 'Doe' };
      mockService.update.mockResolvedValue(profile);
      const res = await request(app.getHttpServer())
        .patch(`/users/${TARGET_USER_ID}`)
        .send({ firstName: 'Johnny' });
      expect(res.status).toBe(200);
    });

    it('returns 404 when profile not found', async () => {
      mockService.update.mockRejectedValue(new NotFoundException('User profile not found'));
      const res = await request(app.getHttpServer())
        .patch(`/users/${TARGET_USER_ID}`)
        .send({ firstName: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /users/:id', () => {
    it('returns 204 on deactivate', async () => {
      mockService.deactivate.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).delete(`/users/${TARGET_USER_ID}`);
      expect(res.status).toBe(204);
      expect(mockService.deactivate).toHaveBeenCalledWith(TARGET_USER_ID, ORG_ID, USER_ID);
    });
  });

  describe('PATCH /users/:id/password', () => {
    it('returns 204 on successful change', async () => {
      mockService.changePassword.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer())
        .patch(`/users/${USER_ID}/password`)
        .send({ currentPassword: 'OldPass@1', newPassword: 'NewPass@1' });
      expect(res.status).toBe(204);
    });

    it('returns 403 when changing another user password', async () => {
      mockService.changePassword.mockRejectedValue(new ForbiddenException("Cannot change another user's password"));
      const res = await request(app.getHttpServer())
        .patch(`/users/${TARGET_USER_ID}/password`)
        .send({ currentPassword: 'OldPass@1', newPassword: 'NewPass@1' });
      expect(res.status).toBe(403);
    });

    it('returns 401 when current password is wrong', async () => {
      mockService.changePassword.mockRejectedValue(new UnauthorizedException('Current password is incorrect'));
      const res = await request(app.getHttpServer())
        .patch(`/users/${USER_ID}/password`)
        .send({ currentPassword: 'wrong', newPassword: 'NewPass@1' });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /users/:id/password/reset', () => {
    it('returns 204 on admin reset', async () => {
      mockService.adminResetPassword.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer())
        .patch(`/users/${TARGET_USER_ID}/password/reset`)
        .send({ newPassword: 'TempPass@1', requireChange: true });
      expect(res.status).toBe(204);
    });
  });

  describe('PATCH /users/:id/unlock', () => {
    it('returns 204 on unlock', async () => {
      mockService.unlockUser.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).patch(`/users/${TARGET_USER_ID}/unlock`);
      expect(res.status).toBe(204);
    });

    it('returns 404 when user not found', async () => {
      mockService.unlockUser.mockRejectedValue(new NotFoundException('User not found'));
      const res = await request(app.getHttpServer()).patch(`/users/${TARGET_USER_ID}/unlock`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /users/:id/inactivate', () => {
    it('returns 204 on inactivate', async () => {
      mockService.inactivate.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).patch(`/users/${TARGET_USER_ID}/inactivate`);
      expect(res.status).toBe(204);
      expect(mockService.inactivate).toHaveBeenCalledWith(TARGET_USER_ID, ORG_ID, USER_ID);
    });

    it('returns 404 when user not found', async () => {
      mockService.inactivate.mockRejectedValue(new NotFoundException('User not found'));
      const res = await request(app.getHttpServer()).patch(`/users/${TARGET_USER_ID}/inactivate`);
      expect(res.status).toBe(404);
    });

    it('returns 403 when permission denied', async () => {
      const restricted = await buildApp(makeAuthGuard(), DENY_GUARD);
      const res = await request(restricted.getHttpServer()).patch(`/users/${TARGET_USER_ID}/inactivate`);
      expect(res.status).toBe(403);
      await restricted.close();
    });
  });
});
