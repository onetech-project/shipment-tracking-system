import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from '../permissions/entities/role-permission.entity';
import { PermissionEntity } from '../permissions/entities/permission.entity';

function makeRole(overrides: Partial<Role> = {}): Role {
  return Object.assign(new Role(), {
    id: 'role-1',
    name: 'Editor',
    description: null,
    organizationId: 'org-1',
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('RolesService', () => {
  let service: RolesService;

  const roleRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const urRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const rpRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const permRepo = {
    findOne: jest.fn(),
  };

  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(UserRole), useValue: urRepo },
        { provide: getRepositoryToken(RolePermission), useValue: rpRepo },
        { provide: getRepositoryToken(PermissionEntity), useValue: permRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    jest.clearAllMocks();
    roleRepo.create.mockImplementation((dto) => ({ ...dto }));
    urRepo.create.mockImplementation((dto) => ({ ...dto }));
    rpRepo.create.mockImplementation((dto) => ({ ...dto }));
  });

  // ─── findAll ─────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns roles scoped to organization for non-super-admin', async () => {
      const roles = [makeRole()];
      roleRepo.find.mockResolvedValue(roles);

      const result = await service.findAll({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toBe(roles);
      expect(roleRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('returns all roles for super-admin', async () => {
      const roles = [makeRole(), makeRole({ id: 'role-2', organizationId: 'org-2' })];
      roleRepo.find.mockResolvedValue(roles);

      const result = await service.findAll({ organizationId: 'org-1', isSuperAdmin: true });

      expect(result).toBe(roles);
      expect(roleRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns role when found', async () => {
      const role = makeRole();
      roleRepo.findOne.mockResolvedValue(role);

      const result = await service.findOne('role-1', 'org-1');

      expect(result).toBe(role);
      expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { id: 'role-1', organizationId: 'org-1' } });
    });

    it('throws NotFoundException when role not found', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        new NotFoundException('Role not found'),
      );
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates role and emits role.created', async () => {
      roleRepo.findOne.mockResolvedValue(null);
      const saved = makeRole({ id: 'role-new' });
      roleRepo.save.mockResolvedValue(saved);

      const result = await service.create(
        { name: 'Editor', description: 'Can edit' },
        'org-1',
        'actor-1',
      );

      expect(result).toBe(saved);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'role.created',
        expect.objectContaining({ roleId: 'role-new', organizationId: 'org-1', actorId: 'actor-1' }),
      );
    });

    it('throws ConflictException when role name already exists in org', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole());

      await expect(
        service.create({ name: 'Editor', description: null }, 'org-1', 'actor-1'),
      ).rejects.toThrow(new ConflictException('Role with this name already exists'));

      expect(roleRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates role and emits role.updated', async () => {
      const role = makeRole();
      roleRepo.findOne.mockResolvedValue(role);
      roleRepo.save.mockImplementation(async (r) => r);

      const result = await service.update('role-1', { name: 'Senior Editor' }, 'org-1', 'actor-1');

      expect(result.name).toBe('Senior Editor');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'role.updated',
        expect.objectContaining({ roleId: 'role-1', organizationId: 'org-1' }),
      );
    });

    it('throws BadRequestException for system roles', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ isSystem: true }));

      await expect(
        service.update('role-1', { name: 'Hack' }, 'org-1', 'actor-1'),
      ).rejects.toThrow(new BadRequestException('Cannot modify system roles'));
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('removes role and emits role.deleted', async () => {
      const role = makeRole();
      roleRepo.findOne.mockResolvedValue(role);
      roleRepo.remove.mockResolvedValue(undefined);

      await service.delete('role-1', 'org-1', 'actor-1');

      expect(roleRepo.remove).toHaveBeenCalledWith(role);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'role.deleted',
        expect.objectContaining({ roleId: 'role-1' }),
      );
    });

    it('throws BadRequestException for system roles', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ isSystem: true }));

      await expect(service.delete('role-1', 'org-1', 'actor-1')).rejects.toThrow(
        new BadRequestException('Cannot delete system roles'),
      );
    });
  });

  // ─── assignPermissions ───────────────────────────────────────────────────

  describe('assignPermissions()', () => {
    it('replaces all permissions and emits role.permissions_updated', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole());
      permRepo.findOne.mockResolvedValue({ id: 'perm-1' });
      rpRepo.delete.mockResolvedValue(undefined);
      rpRepo.save.mockResolvedValue(undefined);

      await service.assignPermissions('role-1', { permissionIds: ['perm-1'] }, 'org-1', 'actor-1');

      expect(rpRepo.delete).toHaveBeenCalledWith({ roleId: 'role-1' });
      expect(rpRepo.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'role.permissions_updated',
        expect.objectContaining({ roleId: 'role-1' }),
      );
    });

    it('throws NotFoundException when a permissionId does not exist', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole());
      permRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignPermissions('role-1', { permissionIds: ['bad-perm'] }, 'org-1', 'actor-1'),
      ).rejects.toThrow(NotFoundException);

      expect(rpRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ─── assignRole ──────────────────────────────────────────────────────────

  describe('assignRole()', () => {
    it('creates user-role assignment and emits role.assigned', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole());
      urRepo.findOne.mockResolvedValue(null);
      urRepo.save.mockResolvedValue(undefined);

      await service.assignRole(
        { userId: 'user-1', roleId: 'role-1' },
        'org-1',
        'actor-1',
      );

      expect(urRepo.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'role.assigned',
        expect.objectContaining({ userId: 'user-1', roleId: 'role-1' }),
      );
    });

    it('throws ConflictException when user already has the role', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole());
      urRepo.findOne.mockResolvedValue({ userId: 'user-1', roleId: 'role-1' });

      await expect(
        service.assignRole({ userId: 'user-1', roleId: 'role-1' }, 'org-1', 'actor-1'),
      ).rejects.toThrow(new ConflictException('User already has this role'));
    });
  });

  // ─── revokeRole ──────────────────────────────────────────────────────────

  describe('revokeRole()', () => {
    it('deletes user-role record and emits role.revoked', async () => {
      urRepo.delete.mockResolvedValue(undefined);

      await service.revokeRole('user-1', 'role-1', 'org-1', 'actor-1');

      expect(urRepo.delete).toHaveBeenCalledWith({ userId: 'user-1', roleId: 'role-1' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'role.revoked',
        expect.objectContaining({ userId: 'user-1', roleId: 'role-1' }),
      );
    });
  });
});
