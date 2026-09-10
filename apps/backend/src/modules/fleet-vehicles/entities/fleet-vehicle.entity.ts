import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'
import { FleetDriverEntity } from '../../fleet-drivers/entities/fleet-driver.entity'
import { FleetVehicleDocumentEntity } from './fleet-vehicle-document.entity'

@Entity('fleet_vehicles')
@Index('idx_fleet_vehicles_active_nopol', ['isActive', 'nopol'])
export class FleetVehicleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 20 })
  nopol: string

  @Column({ length: 60, nullable: true })
  merk: string | null

  @Column({ length: 60, nullable: true })
  tipe: string | null

  @Column({ type: 'int', nullable: true })
  tahun: number | null

  // Free text on purpose: operators write "8 ton / 24 m3", which no numeric column captures.
  @Column({ length: 60, nullable: true })
  kapasitas: string | null

  @Column({ name: 'no_rangka', length: 60, nullable: true })
  noRangka: string | null

  @Column({ name: 'no_mesin', length: 60, nullable: true })
  noMesin: string | null

  @Column({ name: 'no_bpkb', length: 60, nullable: true })
  noBpkb: string | null

  @Column({ name: 'pemilik_unit', length: 120, nullable: true })
  pemilikUnit: string | null

  @Column({ type: 'int', nullable: true })
  odometer: number | null

  @Column({ type: 'text', nullable: true })
  catatan: string | null

  @Column({ name: 'jenis_armada_id', type: 'uuid', nullable: true })
  jenisArmadaId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'jenis_armada_id' })
  jenisArmada?: FleetMasterDataEntity | null

  @Column({ name: 'kepemilikan_id', type: 'uuid', nullable: true })
  kepemilikanId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'kepemilikan_id' })
  kepemilikan?: FleetMasterDataEntity | null

  @Column({ name: 'pool_id', type: 'uuid', nullable: true })
  poolId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pool_id' })
  pool?: FleetMasterDataEntity | null

  @Column({ name: 'status_id', type: 'uuid', nullable: true })
  statusId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'status_id' })
  status?: FleetMasterDataEntity | null

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null

  @ManyToOne(() => FleetDriverEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driver_id' })
  driver?: FleetDriverEntity | null

  // Registration status, not operational status — see the migration's comment.
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean

  @OneToMany(() => FleetVehicleDocumentEntity, (doc) => doc.vehicle)
  documents?: FleetVehicleDocumentEntity[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
