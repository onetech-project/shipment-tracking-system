import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  OneToMany,
  AfterLoad,
} from 'typeorm'
import { RolePermission } from '../../permissions/entities/role-permission.entity'
import { PermissionEntity } from '../../permissions/entities/permission.entity'

@Entity('roles')
@Unique(['name', 'organizationId'])
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  name: string

  @Column({ nullable: true })
  description: string

  @Column({ name: 'organization_id' })
  organizationId: string

  @Column({ name: 'is_system', default: false })
  isSystem: boolean

  @Column({ name: 'is_default', nullable: false, default: false })
  isDefault: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  rolePermissions: RolePermission[]

  permissions: PermissionEntity[]

  @AfterLoad()
  loadPermissions() {
    if (this.rolePermissions) {
      this.permissions = this.rolePermissions.map((rp) => rp.permission).filter(Boolean)
    }
  }
}
