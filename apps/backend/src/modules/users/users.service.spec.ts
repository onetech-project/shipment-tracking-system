import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Profile } from '../organizations/entities/profile.entity';
import { UserRole } from '../roles/entities/user-role.entity';
import { AuthService } from '../auth/auth.service';

jest.mock('bcrypt');
const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    username: 'alice',
    password: 'hashed-pw',
    isActive: true,
    isLocked: false,
    failedAttempts: 0,
    lockedAt: null,
    requirePasswordReset: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return Object.assign(new Profile(), {
    id: 'profile-1',
    userId: 'user-1',
    organizationId: 'org-1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    ...overrides,
  });
}

describe('UsersService', () => {
  let service: UsersService;

  const qb = {
    select: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const userRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };

  const profileRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
  };

  const urRepo = {};

  const authService = {
    revokeAllTokens: jest.fn(),
  };

  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Profile), useValue: profileRepo },
        { provide: getRepositoryToken(UserRole), useValue: urRepo },
        { provide: AuthService, useValue: authService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    userRepo.create.mockImplementation((dto) => ({ ...dto }));
    profileRepo.create.mockImplementation((dto) => ({ ...dto }));
    userRepo.createQueryBuilder.mockReturnValue(qb);
    qb.select.mockReturnValue(qb);
    qb.innerJoin.mockReturnValue(qb);
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns all users for super-admin without org filter', async () => {
      const users = [makeUser()];
      qb.getMany.mockResolvedValue(users);

      const result = await service.findAll({ organizationId: 'org-1', isSuperAdmin: true });

      expect(result).toBe(users);
      expect(qb.innerJoin).not.toHaveBeenCalled();
    });

    it('returns org-scoped users for non-super-admin', async () => {
      const users = [makeUser()];
      qb.getMany.mockResolvedValue(users);

      const result = await service.findAll({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toBe(users);
      expect(qb.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.stringContaining('org'),
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns user with profile when found', async () => {
      const user = makeUser();
      const profile = makeProfile();
      userRepo.findOne.mockResolvedValue(user);
      profileRepo.findOne.mockResolvedValue(profile);

      const result = await service.findOne('user-1', 'org-1');

      expect(result.id).toBe('user-1');
      expect((result as any).profile).toBe(profile);
    });

    it('returns user with undefined profile for wrong org', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      profileRepo.findOne.mockResolvedValue(null);

      const result = await service.findOne('user-1', 'org-other');

      expect((result as any).profile).toBeNull();
    });

    it('throws NotFoundException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates user with hashed password, profile, and emits user.created', async () => {
      userRepo.findOne.mockResolvedValue(null);
      (bcryptMock.hash as jest.Mock).mockResolvedValue('hashed-new-pw');
      const savedUser = makeUser({ id: 'user-new' });
      userRepo.save.mockResolvedValue(savedUser);
      profileRepo.save.mockResolvedValue(makeProfile({ userId: 'user-new' }));

      const result = await service.create(
        { username: 'bob', password: 'plain', email: 'bob@example.com', firstName: 'Bob', lastName: 'Jones' },
        'org-1',
        'actor-1',
      );

      expect(bcryptMock.hash).toHaveBeenCalledWith('plain', 12);
      expect(result.id).toBe('user-new');
      expect(profileRepo.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.created',
        expect.objectContaining({ userId: 'user-new', organizationId: 'org-1' }),
      );
    });

    it('throws ConflictException when username is already taken', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      await expect(
        service.create(
          { username: 'alice', password: 'pass', email: 'a@b.com', firstName: 'A', lastName: 'B' },
          'org-1',
          'actor-1',
        ),
      ).rejects.toThrow(new ConflictException('Username already taken'));

      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates profile and emits user.updated', async () => {
      const profile = makeProfile();
      profileRepo.findOne.mockResolvedValue(profile);
      profileRepo.save.mockImplementation(async (p) => p);

      const result = await service.update('user-1', { firstName: 'Alicia' }, 'org-1', 'actor-1');

      expect(result.firstName).toBe('Alicia');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.updated',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws NotFoundException when profile not found', async () => {
      profileRepo.findOne.mockResolvedValue(null);

      await expect(service.update('user-1', { firstName: 'X' }, 'org-1', 'actor-1')).rejects.toThrow(
        new NotFoundException('User profile not found'),
      );
    });
  });

  // ─── inactivate ──────────────────────────────────────────────────────────

  describe('inactivate()', () => {
    it('sets isActive=false, revokes tokens, and emits user.inactivated', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);
      authService.revokeAllTokens.mockResolvedValue(undefined);

      await service.inactivate('user-1', 'org-1', 'actor-1');

      expect(user.isActive).toBe(false);
      expect(authService.revokeAllTokens).toHaveBeenCalledWith('user-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.inactivated',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.inactivate('missing', 'org-1', 'actor-1')).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  // ─── unlockUser ──────────────────────────────────────────────────────────

  describe('unlockUser()', () => {
    it('resets lock fields and emits user.unlocked', async () => {
      const user = makeUser({ isLocked: true, failedAttempts: 5, lockedAt: new Date() });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);

      await service.unlockUser('user-1', 'org-1', 'actor-1');

      expect(user.isLocked).toBe(false);
      expect(user.failedAttempts).toBe(0);
      expect(user.lockedAt).toBeNull();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.unlocked',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.unlockUser('missing', 'org-1', 'actor-1')).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  // ─── changePassword ──────────────────────────────────────────────────────

  describe('changePassword()', () => {
    it('updates password and revokes tokens when credentials are valid', async () => {
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);
      (bcryptMock.compare as jest.Mock).mockResolvedValue(true);
      (bcryptMock.hash as jest.Mock).mockResolvedValue('new-hashed-pw');
      userRepo.save.mockResolvedValue(user);
      authService.revokeAllTokens.mockResolvedValue(undefined);

      await service.changePassword('user-1', { currentPassword: 'old-pw', newPassword: 'new-pw' }, 'user-1');

      expect(user.password).toBe('new-hashed-pw');
      expect(authService.revokeAllTokens).toHaveBeenCalledWith('user-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.password_changed',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws ForbiddenException when user tries to change another user password', async () => {
      await expect(
        service.changePassword('user-1', { currentPassword: 'x', newPassword: 'y' }, 'actor-other'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException when current password is wrong', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      (bcryptMock.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', { currentPassword: 'wrong', newPassword: 'new' }, 'user-1'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── adminResetPassword ──────────────────────────────────────────────────

  describe('adminResetPassword()', () => {
    it('hashes password, unlocks user, sets requirePasswordReset, revokes tokens, emits event', async () => {
      const user = makeUser({ isLocked: true, failedAttempts: 3 });
      userRepo.findOne.mockResolvedValue(user);
      (bcryptMock.hash as jest.Mock).mockResolvedValue('reset-hashed-pw');
      userRepo.save.mockResolvedValue(user);
      authService.revokeAllTokens.mockResolvedValue(undefined);

      await service.adminResetPassword(
        'user-1',
        { newPassword: 'newPass1!', requireChange: true },
        'org-1',
        'actor-1',
      );

      expect(user.password).toBe('reset-hashed-pw');
      expect(user.isLocked).toBe(false);
      expect(user.failedAttempts).toBe(0);
      expect(user.requirePasswordReset).toBe(true);
      expect(authService.revokeAllTokens).toHaveBeenCalledWith('user-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.password_reset',
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws NotFoundException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.adminResetPassword('missing', { newPassword: 'x' }, 'org-1', 'actor-1'),
      ).rejects.toThrow(new NotFoundException('User not found'));
    });
  });
});
