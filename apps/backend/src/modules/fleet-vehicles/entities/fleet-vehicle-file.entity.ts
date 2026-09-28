import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehicleEntity } from './fleet-vehicle.entity'

@Entity('fleet_vehicle_files')
export class FleetVehicleFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(() => FleetVehicleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: FleetVehicleEntity

  @Column({ name: 'slot_id', type: 'uuid' })
  slotId: string

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'slot_id' })
  slot?: FleetMasterDataEntity

  @Column({ name: 'storage_key', length: 255, nullable: true })
  storageKey: string | null

  @Column({ name: 'original_name', length: 255, nullable: true })
  originalName: string | null

  @Column({ name: 'mime_type', length: 100, nullable: true })
  mimeType: string | null

  // The real byte count, not the length of a base64 string. The prototype stored the latter for
  // images and the former for PDFs, so its size column overstated every image by about a third
  // and showed two different units side by side (spec §3.6).
  //
  // bigint reads back as a string in pg; the service parses it at the view boundary.
  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes: string | null

  @Column({ name: 'external_url', type: 'text', nullable: true })
  externalUrl: string | null

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null

  @CreateDateColumn({ name: 'uploaded_at' })
  uploadedAt: Date
}
