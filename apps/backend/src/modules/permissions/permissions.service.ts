import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClsService } from 'nestjs-cls'
import { PermissionEntity } from './entities/permission.entity'
import { RolePermission } from './entities/role-permission.entity'
import { UserRole } from '../roles/entities/user-role.entity'
import { Permission } from '@shared/auth'

@Injectable()
export class PermissionsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(PermissionEntity) private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermission) private readonly rpRepo: Repository<RolePermission>,
    @InjectRepository(UserRole) private readonly urRepo: Repository<UserRole>,
    private readonly cls: ClsService
  ) {}

  async onApplicationBootstrap() {
    await this.seedPermissions()
  }

  private async seedPermissions() {
    const all = Object.values(Permission)
    for (const name of all) {
      const exists = await this.permRepo.findOne({ where: { name } })
      if (!exists) {
        const [action, ...resourceParts] = name.split('.')
        const resource = resourceParts.join('.')
        await this.permRepo.save(this.permRepo.create({ name, action, resource }))
      }
    }
  }

  findAll(): Promise<PermissionEntity[]> {
    return this.permRepo.find({ order: { name: 'ASC' } })
  }

  findOne(id: string): Promise<PermissionEntity | null> {
    return this.permRepo.findOne({ where: { id } })
  }

  async getPermissionsForUser(userId: string, organizationId: string): Promise<Set<string>> {
    const cacheKey = `perm:${userId}:${organizationId}`
    const cached = this.cls.get<Set<string>>(cacheKey)
    if (cached) return cached

    const rows = await this.urRepo
      .createQueryBuilder('ur')
      .innerJoin('role_permissions', 'rp', 'rp.role_id = ur.role_id')
      .innerJoin('permissions', 'p', 'p.id = rp.permission_id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('ur.organization_id = :organizationId', { organizationId })
      .select('p.name', 'name')
      .getRawMany<{ name: string }>()

    const perms = new Set(rows.map((r) => r.name))
    this.cls.set(cacheKey, perms)
    return perms
  }
}
