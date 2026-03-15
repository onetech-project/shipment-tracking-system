import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Profile } from '../organizations/entities/profile.entity';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { makeAuthGuard, ALLOW_ALL_GUARD, UNAUTH_GUARD, SUPER_ADMIN_USER } from '../../test/test-helpers';

const mockAuthService = {
  login: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  logoutAll: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => fallback ?? 'test'),
  getOrThrow: jest.fn(() => 'secret'),
};

async function buildApp(guardOverride = makeAuthGuard()): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: mockAuthService },
      { provide: ConfigService, useValue: mockConfig },
      { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      { provide: getRepositoryToken(User), useValue: {} },
      { provide: getRepositoryToken(RefreshToken), useValue: {} },
      { provide: getRepositoryToken(Profile), useValue: {} },
      { provide: APP_GUARD, useValue: guardOverride },
    ],
  })
    .overrideGuard(RbacGuard)
    .useValue(ALLOW_ALL_GUARD)
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

describe('AuthController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(() => app.close());

  describe('POST /auth/login', () => {
    it('returns 200 with tokens on valid credentials', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: SUPER_ADMIN_USER,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'superadmin', password: 'Admin@1234' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken', 'access-token');
      expect(res.body.user).toMatchObject({ username: 'superadmin' });
    });

    it('returns 400 when body is missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'only-username' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when extra fields are provided (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'pass', organizationId: 'extra-field' });

      expect(res.status).toBe(400);
    });

    it('propagates 401 from service on bad credentials', async () => {
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.login.mockRejectedValue(new UnauthorizedException('INVALID_CREDENTIALS'));

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'wrong' });

      expect(res.status).toBe(401);
    });

    it('propagates 403 on locked account', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockAuthService.login.mockRejectedValue(new ForbiddenException('ACCOUNT_LOCKED'));

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'pass' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 200 with current user', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: SUPER_ADMIN_USER.id });
    });

    it('returns 401 when not authenticated', async () => {
      const unauthApp = await buildApp(UNAUTH_GUARD as any);
      const res = await request(unauthApp.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(401);
      await unauthApp.close();
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 204', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).post('/auth/logout');
      expect(res.status).toBe(204);
    });
  });

  describe('POST /auth/logout-all', () => {
    it('returns 204', async () => {
      mockAuthService.logoutAll.mockResolvedValue(undefined);
      const res = await request(app.getHttpServer()).post('/auth/logout-all');
      expect(res.status).toBe(204);
    });
  });
});
