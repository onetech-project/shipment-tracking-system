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

@Entity('fleet_drivers')
@Index('idx_fleet_drivers_active_nama', ['isActive', 'nama'])
export class FleetDriverEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 120 })
  nama: string

  @Column({ length: 30, nullable: true })
  telepon: string | null

  @Column({ name: 'sim_nomor', length: 40, nullable: true })
  simNomor: string | null

  @Column({ name: 'sim_jenis_id', type: 'uuid', nullable: true })
  simJenisId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sim_jenis_id' })
  simJenis?: FleetMasterDataEntity

  // `date`, not `timestamptz`: a licence expires on a calendar day, and storing an instant would
  // make the expiry shift by timezone.
  @Column({ name: 'sim_expires_at', type: 'date', nullable: true })
  simExpiresAt: string | null

  // The licence scan, stored the same way a vehicle file is (spec §4.5) — four columns rather
  // than a fleet_driver_files table, because a driver has exactly one such file.
  @Column({ name: 'sim_storage_key', length: 255, nullable: true })
  simStorageKey: string | null

  @Column({ name: 'sim_original_name', length: 255, nullable: true })
  simOriginalName: string | null

  @Column({ name: 'sim_mime_type', length: 100, nullable: true })
  simMimeType: string | null

  @Column({ name: 'sim_size_bytes', type: 'bigint', nullable: true })
  simSizeBytes: string | null

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
