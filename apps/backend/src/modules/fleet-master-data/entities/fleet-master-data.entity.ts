import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterCategory } from '../fleet-master-data.constants'

@Entity('fleet_master_data')
@Unique('uq_fleet_master_data_cat_code', ['category', 'code'])
@Index('idx_fleet_master_data_cat_sort', ['category', 'sortOrder'])
export class FleetMasterDataEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // Explicit `type` because the property is a string-union: reflect-metadata cannot infer a
  // column type from it on its own.
  @Column({ type: 'varchar', length: 40 })
  category: FleetMasterCategory

  @Column({ length: 60 })
  code: string

  @Column({ length: 120 })
  label: string

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean

  @Column({ name: 'warn_days', type: 'int', nullable: true })
  warnDays: number | null

  @Column({ name: 'default_valid_months', type: 'int', nullable: true })
  defaultValidMonths: number | null

  @Column({ name: 'is_required', type: 'boolean', nullable: true })
  isRequired: boolean | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
