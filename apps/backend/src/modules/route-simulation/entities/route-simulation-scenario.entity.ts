import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('route_simulation_scenarios')
export class RouteSimulationScenarioEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 100, unique: true })
  name: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  // Opaque to the backend — see the migration header.
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>

  @Column({ type: 'int', default: 1 })
  revision: number

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
