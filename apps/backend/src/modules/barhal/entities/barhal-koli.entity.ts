import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm'
import { BarhalKoliTo } from './barhal-koli-to.entity'

@Entity('barhal_koli')
@Unique('uq_barhal_koli_number', ['koli_number'])
@Unique('uq_barhal_koli_date_route_seq', ['koli_date', 'route', 'sequence_no'])
export class BarhalKoli {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'koli_number', type: 'text' })
  koli_number: string

  @Index('idx_barhal_koli_date')
  @Column({ name: 'koli_date', type: 'date' })
  koli_date: string

  @Index('idx_barhal_koli_route')
  @Column({ name: 'route', type: 'text' })
  route: string

  @Column({ name: 'origin_code', type: 'text' })
  origin_code: string

  @Column({ name: 'dest_code', type: 'text' })
  dest_code: string

  @Column({ name: 'sequence_no', type: 'integer' })
  sequence_no: number

  @Column({ name: 'weight_before', type: 'numeric', default: 0 })
  weight_before: number

  @Column({ name: 'packing_kayu_weight', type: 'numeric', default: 0 })
  packing_kayu_weight: number

  @Column({ name: 'weight_after', type: 'numeric', default: 0 })
  weight_after: number

  @Column({ name: 'length_cm', type: 'numeric', nullable: true })
  length_cm: number | null

  @Column({ name: 'width_cm', type: 'numeric', nullable: true })
  width_cm: number | null

  @Column({ name: 'height_cm', type: 'numeric', nullable: true })
  height_cm: number | null

  @Column({ name: 'volume', type: 'numeric', nullable: true })
  volume: number | null

  @Column({ name: 'total_to', type: 'integer', default: 0 })
  total_to: number

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  created_by: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date

  @OneToMany(() => BarhalKoliTo, (line) => line.koli)
  lines: BarhalKoliTo[]
}
