import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    username: 'alice',
    password: '$2b$10$hashedpassword',
    isActive: true,
    isLocked: false,
    isSuperAdmin: false,
    failedAttempts: 0,
    lockedAt: null,
    lastLoginAt: null,
    lastLogoutAt: null,
    requirePasswordReset: false,
    ...overrides,
  });
}

describe('AuthService', () => {
  let service: AuthService;

  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const refreshTokenRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto) => dto),
    update: jest.fn(),
  };

  const jwtService = { sign: jest.fn(() => 'signed-token') };

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => fallback),
    getOrThrow: jest.fn(() => 'secret'),
  };

  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    refreshTokenRepo.create.mockImplementation((dto) => dto);
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns tokens and user on valid credentials', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      userRepo.save.mockResolvedValue(user);
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.login('alice', 'pass', 'org-1');

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toMatch(/[0-9a-f]{64}/);
      expect(result.user.username).toBe('alice');
      expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ failedAttempts: 0 }));
    });

    it('throws UnauthorizedException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.login('ghost', 'pass', 'org-1')).rejects.toThrow(
        new UnauthorizedException('INVALID_CREDENTIALS'),
      );
    });

    it('throws ForbiddenException when account is locked', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ isLocked: true }));

      await expect(service.login('alice', 'pass', 'org-1')).rejects.toThrow(
        new ForbiddenException('ACCOUNT_LOCKED'),
      );
    });

    it('increments failedAttempts on wrong password', async () => {
      const user = makeUser({ failedAttempts: 2 });
      userRepo.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      userRepo.save.mockResolvedValue(user);
      config.get.mockReturnValue(5);

      await expect(service.login('alice', 'wrong', 'org-1')).rejects.toThrow(UnauthorizedException);

      expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ failedAttempts: 3 }));
    });

    it('locks account when failedAttempts reaches LOGIN_MAX_ATTEMPTS', async () => {
      const user = makeUser({ failedAttempts: 4 });
      userRepo.findOne.mockResolvedValue(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      userRepo.save.mockResolvedValue(user);
      config.get.mockReturnValue(5);

      await expect(service.login('alice', 'wrong', 'org-1')).rejects.toThrow(UnauthorizedException);

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isLocked: true, failedAttempts: 5 }),
      );
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ isActive: false }));

      await expect(service.login('alice', 'pass', 'org-1')).rejects.toThrow(
        new UnauthorizedException('INVALID_CREDENTIALS'),
      );
    });
  });

  // ─── refreshToken ─────────────────────────────────────────────────────────

  describe('refreshToken()', () => {
    it('revokes old token and issues a new pair', async () => {
      const user = makeUser();
      const tokenRecord: Partial<RefreshToken> = {
        revokedAt: null,
        organizationId: 'org-1',
        familyId: 'fam-1',
      };
      userRepo.findOne.mockResolvedValue(user);
      refreshTokenRepo.save.mockResolvedValue({});

      const result = await service.refreshToken(tokenRecord as RefreshToken, 'user-1');

      expect(refreshTokenRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(result.accessToken).toBe('signed-token');
    });

    it('throws if the user is inactive after revoke', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ isActive: false }));
      refreshTokenRepo.save.mockResolvedValue({});
      const tokenRecord = { revokedAt: null, organizationId: 'org-1', familyId: 'f' } as RefreshToken;

      await expect(service.refreshToken(tokenRecord, 'user-1')).rejects.toThrow(
        new UnauthorizedException('USER_INACTIVE'),
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('sets revokedAt on the token and updates lastLogoutAt', async () => {
      const user = makeUser();
      refreshTokenRepo.update.mockResolvedValue({});
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);

      await service.logout('user-1', 'hash-abc');

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1', tokenHash: 'hash-abc' },
        { revokedAt: expect.any(Date) },
      );
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastLogoutAt: expect.any(Date) }),
      );
    });
  });

  // ─── logoutAll ────────────────────────────────────────────────────────────

  describe('logoutAll()', () => {
    it('revokes all non-revoked tokens for the user', async () => {
      refreshTokenRepo.update.mockResolvedValue({});
      userRepo.findOne.mockResolvedValue(makeUser());
      userRepo.save.mockResolvedValue({});

      await service.logoutAll('user-1');

      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1', revokedAt: IsNull() },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});
