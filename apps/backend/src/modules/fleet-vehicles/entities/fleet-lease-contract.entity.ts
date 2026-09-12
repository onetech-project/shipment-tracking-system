import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { FleetMasterDataEntity } from '../../fleet-master-data/entities/fleet-master-data.entity'
import { FleetVehicleEntity } from './fleet-vehicle.entity'

@Entity('fleet_lease_contracts')
export class FleetLeaseContractEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string

  @ManyToOne(() => FleetVehicleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: FleetVehicleEntity

  @Column({ name: 'leasing_id', type: 'uuid', nullable: true })
  leasingId: string | null

  @ManyToOne(() => FleetMasterDataEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'leasing_id' })
  leasing?: FleetMasterDataEntity

  @Column({ name: 'nomor_kontrak', length: 60, nullable: true })
  nomorKontrak: string | null

  // numeric, not float: an instalment is money. TypeORM hands numeric back as a string, so the
  // service parses it once at the view boundary rather than letting a string leak into the sums.
  @Column({ name: 'cicilan_per_bulan', type: 'numeric', precision: 14, scale: 2, nullable: true })
  cicilanPerBulan: string | null

  @Column({ name: 'tenor_bulan', type: 'int', nullable: true })
  tenorBulan: number | null

  // date, not timestamptz — the same reasoning as the document columns: an instalment falls on a
  // calendar day, and an instant would shift it by timezone.
  @Column({ name: 'angsuran_mulai', type: 'date', nullable: true })
  angsuranMulai: string | null

  // Empty means "derive it from angsuran_mulai". Operators override it when a unit was taken
  // over mid-contract and the count no longer matches the start date.
  @Column({ name: 'angsuran_terbayar_override', type: 'int', nullable: true })
  angsuranTerbayarOverride: number | null

  @Column({ name: 'closed_at', type: 'date', nullable: true })
  closedAt: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
