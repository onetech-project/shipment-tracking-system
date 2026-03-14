import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { PermissionsService } from './permissions.service';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole } from '../roles/entities/user-role.entity';
import { Permission } from '@shared/auth';

describe('PermissionsService', () => {
  let service: PermissionsService;

  const permRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto) => dto),
  };

  const rpRepo = {};

  const urRepo = {
    createQueryBuilder: jest.fn(),
  };

  const cls = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: getRepositoryToken(PermissionEntity), useValue: permRepo },
        { provide: getRepositoryToken(RolePermission), useValue: rpRepo },
        { provide: getRepositoryToken(UserRole), useValue: urRepo },
        { provide: ClsService, useValue: cls },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    jest.clearAllMocks();
    permRepo.create.mockImplementation((dto) => dto);
  });

  // ─── seedPermissions ──────────────────────────────────────────────────────

  describe('onApplicationBootstrap() → seedPermissions()', () => {
    it('creates all Permission enum values that do not already exist', async () => {
      // Only first call returns existing, rest return null → should save all except the first
      const allPermissions = Object.values(Permission);
      permRepo.findOne.mockResolvedValue(null); // none exist yet
      permRepo.save.mockResolvedValue({});

      await service.onApplicationBootstrap();

      expect(permRepo.findOne).toHaveBeenCalledTimes(allPermissions.length);
      expect(permRepo.save).toHaveBeenCalledTimes(allPermissions.length);
    });

    it('skips permissions that already exist', async () => {
      const allPermissions = Object.values(Permission);
      // Simulate that all permissions already exist
      permRepo.findOne.mockResolvedValue({ id: 'existing-id' });
      permRepo.save.mockResolvedValue({});

      await service.onApplicationBootstrap();

      expect(permRepo.findOne).toHaveBeenCalledTimes(allPermissions.length);
      expect(permRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── getPermissionsForUser ────────────────────────────────────────────────

  describe('getPermissionsForUser()', () => {
    function buildQueryBuilder(rawRows: { name: string }[]) {
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rawRows),
      };
      return qb;
    }

    it('queries DB and returns a Set of permission names', async () => {
      const rows = [{ name: 'read.shipment' }, { name: 'create.shipment' }];
      const qb = buildQueryBuilder(rows);
      urRepo.createQueryBuilder.mockReturnValue(qb);
      cls.get.mockReturnValue(undefined); // no cache

      const result = await service.getPermissionsForUser('user-1', 'org-1');

      expect(result).toBeInstanceOf(Set);
      expect(result.has('read.shipment')).toBe(true);
      expect(result.has('create.shipment')).toBe(true);
      expect(cls.set).toHaveBeenCalledWith('perm:user-1:org-1', result);
    });

    it('returns cached result from CLS without hitting DB', async () => {
      const cached = new Set(['read.shipment']);
      cls.get.mockReturnValue(cached);

      const result = await service.getPermissionsForUser('user-1', 'org-1');

      expect(result).toBe(cached);
      expect(urRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns empty Set when user has no role assignments', async () => {
      const qb = buildQueryBuilder([]);
      urRepo.createQueryBuilder.mockReturnValue(qb);
      cls.get.mockReturnValue(undefined);

      const result = await service.getPermissionsForUser('user-1', 'org-1');

      expect(result.size).toBe(0);
    });
  });
});
