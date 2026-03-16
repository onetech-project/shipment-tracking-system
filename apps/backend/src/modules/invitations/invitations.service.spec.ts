import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { InvitationsService } from './invitations.service';
import { Invitation } from './entities/invitation.entity';

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return Object.assign(new Invitation(), {
    id: 'inv-1',
    email: 'alice@example.com',
    invitedName: 'Alice Smith',
    organizationId: 'org-1',
    invitedBy: 'actor-1',
    roleId: 'role-1',
    tokenHash: 'abc123',
    status: 'pending',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('InvitationsService', () => {
  let service: InvitationsService;

  const invitationRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const config = {
    get: jest.fn((_key: string, fallback?: unknown) => fallback),
  };

  const emailQueue = {
    add: jest.fn().mockResolvedValue({}),
  };

  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: getRepositoryToken(Invitation), useValue: invitationRepo },
        { provide: ConfigService, useValue: config },
        { provide: getQueueToken('email'), useValue: emailQueue },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
    jest.clearAllMocks();
    invitationRepo.create.mockImplementation((dto) => ({ ...dto }));
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('generates a SHA-256 token hash and saves invited_name', async () => {
      invitationRepo.findOne.mockResolvedValue(null);
      invitationRepo.save.mockImplementation(async (inv) => ({ ...inv, id: 'inv-1' }));
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'INVITATION_EXPIRY_HOURS') return 72;
        if (key === 'APP_URL') return 'http://localhost:3000';
        return fallback;
      });

      const saved = await service.create(
        { email: 'bob@example.com', name: 'Bob Jones', roleId: 'role-1' },
        'org-1',
        'actor-1',
      );

      expect(saved.tokenHash).toHaveLength(64); // SHA-256 hex is 64 chars
      expect(saved.invitedName).toBe('Bob Jones');
      expect(saved.email).toBe('bob@example.com');
      expect(emailQueue.add).toHaveBeenCalledWith(
        'send-invitation',
        expect.objectContaining({ to: 'bob@example.com' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invitation.created',
        expect.objectContaining({ invitationId: 'inv-1', organizationId: 'org-1' }),
      );
    });

    it('throws ConflictException when pending invitation already exists', async () => {
      invitationRepo.findOne.mockResolvedValue(makeInvitation());

      await expect(
        service.create({ email: 'alice@example.com', name: 'Alice', roleId: 'role-1' }, 'org-1', 'actor-1'),
      ).rejects.toThrow(new ConflictException('Pending invitation already exists for this email'));

      expect(invitationRepo.save).not.toHaveBeenCalled();
    });

    it('uses INVITATION_EXPIRY_HOURS config to set expiresAt', async () => {
      invitationRepo.findOne.mockResolvedValue(null);
      invitationRepo.save.mockImplementation(async (inv) => ({ ...inv, id: 'inv-2' }));
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'INVITATION_EXPIRY_HOURS') return 24;
        if (key === 'APP_URL') return 'http://localhost:3000';
        return fallback;
      });

      const before = Date.now();
      const saved = await service.create(
        { email: 'charlie@example.com', name: 'Charlie', roleId: 'role-1' },
        'org-1',
        'actor-1',
      );
      const after = Date.now();

      const expiresAfterMs = saved.expiresAt.getTime() - before;
      const expiresBeforeMs = saved.expiresAt.getTime() - after;
      expect(expiresAfterMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100);
      expect(expiresBeforeMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 100);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns org-scoped invitations', async () => {
      const list = [makeInvitation()];
      invitationRepo.find.mockResolvedValue(list);

      const result = await service.findAll('org-1');

      expect(result).toBe(list);
      expect(invitationRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });
  });

  // ─── cancel ───────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('sets status=cancelled for a pending invitation', async () => {
      const inv = makeInvitation();
      invitationRepo.findOne.mockResolvedValue(inv);
      invitationRepo.save.mockResolvedValue({ ...inv, status: 'cancelled' });

      await service.cancel('inv-1', 'org-1', 'actor-1');

      expect(invitationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invitation.cancelled',
        expect.objectContaining({ invitationId: 'inv-1' }),
      );
    });

    it('throws NotFoundException when invitation not found', async () => {
      invitationRepo.findOne.mockResolvedValue(null);

      await expect(service.cancel('missing', 'org-1', 'actor-1')).rejects.toThrow(
        new NotFoundException('Invitation not found'),
      );
    });

    it('throws BadRequestException when invitation is not pending', async () => {
      invitationRepo.findOne.mockResolvedValue(makeInvitation({ status: 'accepted' }));

      await expect(service.cancel('inv-1', 'org-1', 'actor-1')).rejects.toThrow(
        new BadRequestException('Invitation is not pending'),
      );
    });
  });

  // ─── accept ───────────────────────────────────────────────────────────────

  describe('accept()', () => {
    it('marks invitation as accepted and returns it', async () => {
      const rawToken = 'abc123rawtoken';
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const accepted = makeInvitation({ status: 'accepted', usedAt: new Date() });

      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [accepted] }),
      };
      invitationRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.accept(rawToken);

      expect(qb.where).toHaveBeenCalledWith('token_hash = :tokenHash', { tokenHash: hash });
      expect(result).toBe(accepted);
    });

    it('throws BadRequestException for expired/used token', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      };
      invitationRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.accept('bad-token')).rejects.toThrow(
        new BadRequestException('INVALID_OR_EXPIRED_INVITATION'),
      );
    });
  });
});
