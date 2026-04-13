import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm'

@Entity('air_shipments_sda')
@Unique(['lt_number', 'to_number'])
@Index('idx_air_shipments_sda_lt_number_to_number', ['lt_number', 'to_number'])
export class AirShipmentSda {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'lt_number', type: 'varchar', length: 100 })
  lt_number: string

  @Column({ name: 'to_number', type: 'varchar', length: 100 })
  to_number: string

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
