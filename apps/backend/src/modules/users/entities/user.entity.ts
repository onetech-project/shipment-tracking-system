import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  username: string

  @Column({ type: 'varchar', length: 255 })
  password: string

  @Column({ name: 'is_super_admin', type: 'boolean', default: false })
  isSuperAdmin: boolean

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null

  @Column({ name: 'last_logout_at', type: 'timestamptz', nullable: true })
  lastLogoutAt: Date | null

  @Column({ name: 'failed_attempts', type: 'int', default: 0 })
  failedAttempts: number

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null

  @Column({ name: 'require_password_reset', type: 'boolean', default: false })
  requirePasswordReset: boolean

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date
}
