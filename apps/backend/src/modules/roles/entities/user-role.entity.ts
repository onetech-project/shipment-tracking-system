import { Entity, Column, PrimaryColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm'
import { User } from '../../users/entities/user.entity'
import { Role } from '../../roles/entities/role.entity'

@Entity('user_roles')
export class UserRole {
  @PrimaryColumn({ name: 'user_id' })
  userId: string

  @PrimaryColumn({ name: 'role_id' })
  roleId: string

  @Column({ name: 'organization_id' })
  organizationId: string

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date

  @Column({ name: 'assigned_by', nullable: true })
  assignedBy: string

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role
}
