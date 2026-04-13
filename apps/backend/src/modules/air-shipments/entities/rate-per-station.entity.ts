import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm'

@Entity('rate_per_station')
@Unique(['origin_dc', 'destination_dc'])
@Index('idx_rate_per_station_origin_dc_destination_dc', ['origin_dc', 'destination_dc'])
export class RatePerStation {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'is_locked', type: 'boolean', nullable: true })
  is_locked: boolean | null

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  last_synced_at: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date

  @Column({ name: 'origin_dc', type: 'varchar', length: 100 })
  origin_dc: string

  @Column({ name: 'destination_dc', type: 'varchar', length: 100 })
  destination_dc: string

  @Column({ type: 'jsonb', nullable: true })
  extra_fields: Record<string, any> | null
}
