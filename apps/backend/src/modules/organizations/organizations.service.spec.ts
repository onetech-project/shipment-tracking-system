import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrganizationsService } from './organizations.service';
import { Organization } from './entities/organization.entity';
import { AuthService } from '../auth/auth.service';

// Mock slug utilities so tests are deterministic
jest.mock('../../common/utils/slug.util', () => ({
  generateSlug: jest.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
  ensureUniqueSlug: jest.fn(async (base: string) => base),
}));

import { generateSlug, ensureUniqueSlug } from '../../common/utils/slug.util';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return Object.assign(new Organization(), {
    id: 'org-1',
    name: 'Acme',
    slug: 'acme',
    isActive: true,
    ...overrides,
  });
}

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const orgRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn(),
  };

  const authService = {
    revokeAllTokens: jest.fn(),
  };

  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: AuthService, useValue: authService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    jest.clearAllMocks();
    orgRepo.create.mockImplementation((dto) => ({ ...dto }));
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns the organization when it exists', async () => {
      const org = makeOrg();
      orgRepo.findOne.mockResolvedValue(org);

      const result = await service.findOne('org-1');
      expect(result).toBe(org);
    });

    it('throws NotFoundException when not found', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        new NotFoundException('Organization not found'),
      );
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('generates slug automatically from name', async () => {
      const saved = makeOrg({ name: 'Acme Corp', slug: 'acme-corp' });
      orgRepo.findOne.mockResolvedValue(null);
      orgRepo.save.mockResolvedValue(saved);
      (generateSlug as jest.Mock).mockReturnValue('acme-corp');
      (ensureUniqueSlug as jest.Mock).mockResolvedValue('acme-corp');

      const result = await service.create({ name: 'Acme Corp' });

      expect(generateSlug).toHaveBeenCalledWith('Acme Corp');
      expect(ensureUniqueSlug).toHaveBeenCalledWith('acme-corp', orgRepo);
      expect(orgRepo.save).toHaveBeenCalled();
      expect(result.slug).toBe('acme-corp');
    });

    it('appends numeric suffix on slug collision', async () => {
      const saved = makeOrg({ name: 'Acme Corp', slug: 'acme-corp-2' });
      orgRepo.findOne.mockResolvedValue(null);
      orgRepo.save.mockResolvedValue(saved);
      (generateSlug as jest.Mock).mockReturnValue('acme-corp');
      (ensureUniqueSlug as jest.Mock).mockResolvedValue('acme-corp-2');

      const result = await service.create({ name: 'Acme Corp' });

      expect(result.slug).toBe('acme-corp-2');
    });

    it('throws ConflictException when name already in use', async () => {
      orgRepo.findOne.mockResolvedValue(makeOrg());

      await expect(service.create({ name: 'Acme' })).rejects.toThrow(
        new ConflictException('Organization name already exists'),
      );

      expect(orgRepo.save).not.toHaveBeenCalled();
    });

    it('does NOT regenerate slug on update', async () => {
      const org = makeOrg({ slug: 'acme' });
      const updated = makeOrg({ name: 'New Name', slug: 'acme' });
      orgRepo.findOne.mockResolvedValue(org);
      orgRepo.save.mockResolvedValue(updated);

      const result = await service.update('org-1', { name: 'New Name' });

      // generateSlug should not have been called during update
      expect(generateSlug).not.toHaveBeenCalled();
      expect(result.slug).toBe('acme');
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('applies dto changes and saves', async () => {
      const org = makeOrg();
      const saved = makeOrg({ name: 'NewName' });
      orgRepo.findOne.mockResolvedValue(org);
      orgRepo.save.mockResolvedValue(saved);

      const result = await service.update('org-1', { name: 'NewName' });

      expect(orgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'NewName' }));
      expect(result).toBe(saved);
      expect(eventEmitter.emit).toHaveBeenCalledWith('organization.updated', { organizationId: 'org-1' });
    });

    it('throws NotFoundException when organization does not exist', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deactivate ───────────────────────────────────────────────────────────

  describe('deactivate()', () => {
    it('sets isActive=false and revokes tokens', async () => {
      const org = makeOrg();
      orgRepo.findOne.mockResolvedValue(org);
      orgRepo.save.mockResolvedValue(org);
      authService.revokeAllTokens.mockResolvedValue(undefined);

      await service.deactivate('org-1', 'actor-1');

      expect(orgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
      expect(authService.revokeAllTokens).toHaveBeenCalledWith('actor-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('organization.deactivated', {
        organizationId: 'org-1',
        actorId: 'actor-1',
      });
    });

    it('throws NotFoundException when org not found', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      await expect(service.deactivate('missing', 'actor-1')).rejects.toThrow(NotFoundException);
    });
  });
});
