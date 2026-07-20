import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm'
import { BarhalKoli } from './barhal-koli.entity'

@Entity('barhal_koli_to')
@Unique('uq_barhal_koli_to_to_number', ['to_number'])
export class BarhalKoliTo {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'koli_id', type: 'uuid' })
  koli_id: string

  @ManyToOne(() => BarhalKoli, (koli) => koli.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'koli_id' })
  koli: BarhalKoli

  @Index('idx_barhal_koli_to_to_number')
  @Column({ name: 'to_number', type: 'text' })
  to_number: string

  @Column({ name: 'awb', type: 'text', nullable: true })
  awb: string | null

  @Column({ name: 'gross_weight', type: 'numeric', nullable: true })
  gross_weight: number | null

  @Column({ name: 'smu_account', type: 'text', nullable: true })
  smu_account: string | null

  @Column({ name: 'smu_airlines', type: 'text', nullable: true })
  smu_airlines: string | null

  @Column({ name: 'smu_flight_date', type: 'text', nullable: true })
  smu_flight_date: string | null

  @Column({ name: 'smu_flight_number', type: 'text', nullable: true })
  smu_flight_number: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date
}
