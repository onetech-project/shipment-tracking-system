import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehicleEntity } from './fleet-vehicle.entity'

@Entity('fleet_vehicle_documents')
@Index('idx_fleet_vehicle_documents_vehicle', ['vehicleId', 'isCurrent'])
export class FleetVehicleDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(() => FleetVehicleEntity, (v) => v.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: FleetVehicleEntity

  @Column({ name: 'doc_type_id', type: 'uuid' })
  docTypeId: string

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doc_type_id' })
  docType?: FleetMasterDataEntity

  @Column({ length: 80, nullable: true })
  nomor: string | null

  // `date`, not `timestamptz`: a certificate expires on a calendar day, and storing an instant
  // would shift the expiry by timezone. TypeORM hands these back as 'YYYY-MM-DD' strings.
  @Column({ name: 'issued_at', type: 'date', nullable: true })
  issuedAt: string | null

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt: string | null

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
