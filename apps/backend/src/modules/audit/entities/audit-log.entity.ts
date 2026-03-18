import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm'

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id', nullable: true })
  actorId: string

  @Column()
  action: string

  @Column({ name: 'entity_type', nullable: true })
  resourceType: string

  @Column({ name: 'entity_id', nullable: true })
  resourceId: string

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string

  @Column({ name: 'user_agent', nullable: true })
  userAgent: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
