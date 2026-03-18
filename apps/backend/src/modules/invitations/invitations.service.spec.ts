import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getQueueToken } from '@nestjs/bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import * as crypto from 'crypto'
import { InvitationsService } from './invitations.service'
import { Invitation } from './entities/invitation.entity'
import { User } from '../users/entities/user.entity'
import { Profile } from '../organizations/entities/profile.entity'
import { UserRole } from '../roles/entities/user-role.entity'

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
  })
}

describe('InvitationsService', () => {
  let service: InvitationsService

  const invitationRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  }

  const userRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ ...dto, id: 'user-new' })),
    save: jest.fn(),
  }

  const profileRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
  }

  const userRoleRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
  }

  const config = {
    get: jest.fn((_key: string, fallback?: unknown) => fallback),
  }

  const emailQueue = {
    add: jest.fn().mockResolvedValue({}),
  }

  const eventEmitter = { emit: jest.fn() }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: getRepositoryToken(Invitation), useValue: invitationRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Profile), useValue: profileRepo },
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: ConfigService, useValue: config },
        { provide: getQueueToken('email'), useValue: emailQueue },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile()

    service = module.get<InvitationsService>(InvitationsService)
    jest.clearAllMocks()
    invitationRepo.create.mockImplementation((dto) => ({ ...dto }))
  })

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('generates a SHA-256 token hash and saves invited_name', async () => {
      invitationRepo.findOne.mockResolvedValue(null)
      invitationRepo.save.mockImplementation(async (inv) => ({ ...inv, id: 'inv-1' }))
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'INVITATION_EXPIRY_HOURS') return 72
        if (key === 'APP_URL') return 'http://localhost:3000'
        return fallback
      })

      const saved = await service.create(
        { email: 'bob@example.com', name: 'Bob Jones', roleId: 'role-1' },
        'org-1',
        'actor-1'
      )

      expect(saved.tokenHash).toHaveLength(64) // SHA-256 hex is 64 chars
      expect(saved.invitedName).toBe('Bob Jones')
      expect(saved.email).toBe('bob@example.com')
      expect(emailQueue.add).toHaveBeenCalledWith(
        'send-invitation',
        expect.objectContaining({ to: 'bob@example.com' })
      )
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invitation.created',
        expect.objectContaining({ invitationId: 'inv-1', organizationId: 'org-1' })
      )
    })

    it('throws ConflictException when pending invitation already exists', async () => {
      invitationRepo.findOne.mockResolvedValue(makeInvitation())

      await expect(
        service.create(
          { email: 'alice@example.com', name: 'Alice', roleId: 'role-1' },
          'org-1',
          'actor-1'
        )
      ).rejects.toThrow(new ConflictException('Pending invitation already exists for this email'))

      expect(invitationRepo.save).not.toHaveBeenCalled()
    })

    it('uses INVITATION_EXPIRY_HOURS config to set expiresAt', async () => {
      invitationRepo.findOne.mockResolvedValue(null)
      invitationRepo.save.mockImplementation(async (inv) => ({ ...inv, id: 'inv-2' }))
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'INVITATION_EXPIRY_HOURS') return 24
        if (key === 'APP_URL') return 'http://localhost:3000'
        return fallback
      })

      const before = Date.now()
      const saved = await service.create(
        { email: 'charlie@example.com', name: 'Charlie', roleId: 'role-1' },
        'org-1',
        'actor-1'
      )
      const after = Date.now()

      const expiresAfterMs = saved.expiresAt.getTime() - before
      const expiresBeforeMs = saved.expiresAt.getTime() - after
      expect(expiresAfterMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100)
      expect(expiresBeforeMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 100)
    })
  })

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns org-scoped invitations', async () => {
      const list = [makeInvitation()]
      invitationRepo.find.mockResolvedValue(list)

      const result = await service.findAll('org-1')

      expect(result).toBe(list)
      expect(invitationRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } })
      )
    })
  })

  // ─── cancel ───────────────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('sets status=revoked for a pending invitation', async () => {
      const inv = makeInvitation()
      invitationRepo.findOne.mockResolvedValue(inv)
      invitationRepo.save.mockResolvedValue({ ...inv, status: 'revoked' })

      await service.cancel('inv-1', 'actor-1')

      expect(invitationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'revoked' })
      )
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invitation.revoked',
        expect.objectContaining({ invitationId: 'inv-1' })
      )
    })

    it('throws NotFoundException when invitation not found', async () => {
      invitationRepo.findOne.mockResolvedValue(null)

      await expect(service.cancel('missing', 'actor-1')).rejects.toThrow(
        new NotFoundException('Invitation not found')
      )
    })

    it('throws BadRequestException when invitation is not pending', async () => {
      invitationRepo.findOne.mockResolvedValue(makeInvitation({ status: 'accepted' }))

      await expect(service.cancel('inv-1', 'actor-1')).rejects.toThrow(
        new BadRequestException('Invitation is not pending')
      )
    })
  })

  // ─── accept ───────────────────────────────────────────────────────────────

  describe('accept()', () => {
    it('creates a new user and marks invitation as accepted', async () => {
      const rawToken = 'abc123rawtoken'
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const invitation = makeInvitation({ tokenHash: hash })

      invitationRepo.findOne.mockResolvedValue(invitation)
      userRepo.findOne.mockResolvedValue(null)
      const savedUser = { id: 'user-new', username: 'newuser' }
      userRepo.create.mockReturnValue(savedUser)
      userRepo.save.mockResolvedValue(savedUser)
      profileRepo.create.mockReturnValue({})
      profileRepo.save.mockResolvedValue({})
      userRoleRepo.create.mockReturnValue({})
      userRoleRepo.save.mockResolvedValue({})
      invitationRepo.save.mockResolvedValue({ ...invitation, status: 'accepted' })

      const result = await service.accept({
        token: rawToken,
        username: 'newuser',
        password: 'password123',
      })

      expect(invitationRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hash, status: 'pending' } })
      )
      expect(userRepo.save).toHaveBeenCalled()
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'invitation.accepted',
        expect.objectContaining({ invitationId: invitation.id })
      )
      expect(result).toEqual({ message: expect.any(String) })
    })

    it('throws BadRequestException for expired/used token', async () => {
      invitationRepo.findOne.mockResolvedValue(null)

      await expect(
        service.accept({ token: 'bad_token', username: 'user', password: 'password123' })
      ).rejects.toThrow(new BadRequestException('INVALID_OR_EXPIRED_INVITATION'))
    })
  })
})
