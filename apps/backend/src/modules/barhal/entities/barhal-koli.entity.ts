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
@Unique('uq_barhal_koli_date_origin_dest_seq', ['koli_date', 'origin_name', 'dest_name', 'sequence_no'])
export class BarhalKoli {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'koli_number', type: 'text' })
  koli_number: string

  @Index('idx_barhal_koli_date')
  @Column({ name: 'koli_date', type: 'date' })
  koli_date: string

  @Index('idx_barhal_koli_origin_dest')
  @Column({ name: 'origin_name', type: 'text' })
  origin_name: string

  @Column({ name: 'dest_name', type: 'text' })
  dest_name: string

  @Column({ name: 'komoditi', type: 'text' })
  komoditi: string

  @Column({ name: 'sequence_no', type: 'integer' })
  sequence_no: number

  @Column({ name: 'weight_before', type: 'numeric', nullable: true })
  weight_before: number | null

  @Column({ name: 'packing_kayu_weight', type: 'numeric', default: 0 })
  packing_kayu_weight: number

  @Column({ name: 'weight_after', type: 'numeric', nullable: true })
  weight_after: number | null

  @Column({ name: 'length_cm', type: 'numeric', nullable: true })
  length_cm: number | null

  @Column({ name: 'width_cm', type: 'numeric', nullable: true })
  width_cm: number | null

  @Column({ name: 'height_cm', type: 'numeric', nullable: true })
  height_cm: number | null

  @Column({ name: 'volume', type: 'numeric', nullable: true })
  volume: number | null

  @Column({ name: 'batang_kayu', type: 'integer', nullable: true })
  batang_kayu: number | null

  @Column({ name: 'smu_number', type: 'text', nullable: true })
  smu_number: string | null

  @Column({ name: 'airlines', type: 'text', nullable: true })
  airlines: string | null

  @Column({ name: 'flight_no', type: 'text', nullable: true })
  flight_no: string | null

  @Column({ name: 'std', type: 'timestamptz', nullable: true })
  std: Date | null

  @Column({ name: 'sta', type: 'timestamptz', nullable: true })
  sta: Date | null

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
