import { Entity, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn, Column } from 'typeorm'
import { Role } from '../../roles/entities/role.entity'
import { PermissionEntity } from './permission.entity'

@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn({ name: 'role_id' })
  roleId: string

  @PrimaryColumn({ name: 'permission_id' })
  permissionId: string

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date

  @Column({ name: 'assigned_by' })
  assignedBy: string

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role

  @ManyToOne(() => PermissionEntity)
  @JoinColumn({ name: 'permission_id' })
  permission: PermissionEntity
}
