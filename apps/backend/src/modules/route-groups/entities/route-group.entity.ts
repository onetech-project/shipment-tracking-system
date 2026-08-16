import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('route_groups')
export class RouteGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 100, unique: true })
  name: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
