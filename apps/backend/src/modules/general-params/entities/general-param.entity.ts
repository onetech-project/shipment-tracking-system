import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('general_params')
export class GeneralParam {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ unique: true })
  key: string

  @Column()
  label: string

  @Column()
  value: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
