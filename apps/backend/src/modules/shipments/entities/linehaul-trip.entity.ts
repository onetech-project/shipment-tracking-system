import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { LinehaulTripItem } from './linehaul-trip-item.entity';

@Entity('linehaul_trips')
@Index('idx_linehaul_trips_org_trip_code', ['organizationId', 'tripCode'], { unique: true })
@Index('idx_linehaul_trips_org_created', ['organizationId', 'createdAt'])
export class LinehaulTrip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'trip_code', type: 'varchar', length: 100 })
  tripCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  schedule: string | null;

  @Column({ type: 'varchar', length: 255 })
  origin: string;

  @Column({ type: 'varchar', length: 255 })
  destination: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vendor: string | null;

  @Column({ name: 'plate_number', type: 'varchar', length: 50, nullable: true })
  plateNumber: string | null;

  @Column({ name: 'driver_name', type: 'varchar', length: 255, nullable: true })
  driverName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  std: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sta: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ata: Date | null;

  @Column({ name: 'total_weight', type: 'numeric', precision: 12, scale: 3, nullable: true })
  totalWeight: number | null;

  @Column({ name: 'last_import_upload_id', type: 'uuid', nullable: true })
  lastImportUploadId: string | null;

  @OneToMany(() => LinehaulTripItem, (item) => item.linehaulTrip, { cascade: true })
  items: LinehaulTripItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
