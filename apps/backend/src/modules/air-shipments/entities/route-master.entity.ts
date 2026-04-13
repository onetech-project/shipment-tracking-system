import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm'

@Entity('route_master')
@Unique(['concat'])
@Index('idx_route_master_concat', ['concat'])
export class RouteMaster {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'concat', type: 'varchar', length: 255 })
  concat: string

  @Column({ name: 'is_locked', type: 'boolean', nullable: true })
  is_locked: boolean | null

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  last_synced_at: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date

  @Column({ type: 'jsonb', nullable: true })
  extra_fields: Record<string, any> | null
}
