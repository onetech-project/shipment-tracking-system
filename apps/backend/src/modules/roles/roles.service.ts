import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from '../permissions/entities/role-permission.entity';
import { PermissionEntity } from '../permissions/entities/permission.entity';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, AssignRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRole) private readonly urRepo: Repository<UserRole>,
    @InjectRepository(RolePermission) private readonly rpRepo: Repository<RolePermission>,
    @InjectRepository(PermissionEntity) private readonly permRepo: Repository<PermissionEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(organizationId: string): Promise<Role[]> {
    return this.roleRepo.find({ where: { organizationId }, order: { name: 'ASC' } });
  }

  async findOne(id: string, organizationId: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id, organizationId } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto, organizationId: string, actorId: string): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { name: dto.name, organizationId } });
    if (existing) throw new ConflictException('Role with this name already exists');
    const role = this.roleRepo.create({ ...dto, organizationId });
    const saved = await this.roleRepo.save(role);
    this.eventEmitter.emit('role.created', { roleId: saved.id, organizationId, actorId });
    return saved;
  }

  async update(id: string, dto: UpdateRoleDto, organizationId: string, actorId: string): Promise<Role> {
    const role = await this.findOne(id, organizationId);
    if (role.isSystem) throw new BadRequestException('Cannot modify system roles');
    Object.assign(role, dto);
    const saved = await this.roleRepo.save(role);
    this.eventEmitter.emit('role.updated', { roleId: id, organizationId, actorId });
    return saved;
  }

  async delete(id: string, organizationId: string, actorId: string): Promise<void> {
    const role = await this.findOne(id, organizationId);
    if (role.isSystem) throw new BadRequestException('Cannot delete system roles');
    await this.roleRepo.remove(role);
    this.eventEmitter.emit('role.deleted', { roleId: id, organizationId, actorId });
  }

  async assignPermissions(id: string, dto: AssignPermissionsDto, organizationId: string, actorId: string): Promise<void> {
    const role = await this.findOne(id, organizationId);
    // Validate all permissions exist
    for (const permId of dto.permissionIds) {
      const perm = await this.permRepo.findOne({ where: { id: permId } });
      if (!perm) throw new NotFoundException(`Permission ${permId} not found`);
    }
    // Remove existing and insert new
    await this.rpRepo.delete({ roleId: role.id });
    const entries = dto.permissionIds.map((permId) =>
      this.rpRepo.create({ roleId: role.id, permissionId: permId }),
    );
    await this.rpRepo.save(entries);
    this.eventEmitter.emit('role.permissions_updated', { roleId: id, organizationId, actorId });
  }

  async assignRole(dto: AssignRoleDto, organizationId: string, actorId: string): Promise<void> {
    await this.findOne(dto.roleId, organizationId);
    const existing = await this.urRepo.findOne({ where: { userId: dto.userId, roleId: dto.roleId } });
    if (existing) throw new ConflictException('User already has this role');
    const ur = this.urRepo.create({ userId: dto.userId, roleId: dto.roleId, organizationId, assignedBy: actorId });
    await this.urRepo.save(ur);
    this.eventEmitter.emit('role.assigned', { userId: dto.userId, roleId: dto.roleId, organizationId, actorId });
  }

  async revokeRole(userId: string, roleId: string, organizationId: string, actorId: string): Promise<void> {
    await this.urRepo.delete({ userId, roleId });
    this.eventEmitter.emit('role.revoked', { userId, roleId, organizationId, actorId });
  }
}
