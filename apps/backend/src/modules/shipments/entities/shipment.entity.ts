import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('shipments')
@Index('idx_shipments_org_shipment_id', ['organizationId', 'shipmentId'], { unique: true })
@Index('idx_shipments_org_status', ['organizationId', 'status'])
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'shipment_id', type: 'varchar', length: 100 })
  shipmentId: string;

  @Column({ type: 'varchar', length: 255 })
  origin: string;

  @Column({ type: 'varchar', length: 255 })
  destination: string;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  carrier: string | null;

  @Column({ name: 'estimated_delivery_date', type: 'date', nullable: true })
  estimatedDeliveryDate: Date | null;

  @Column({ name: 'contents_description', type: 'text', nullable: true })
  contentsDescription: string | null;

  @Column({ name: 'last_import_upload_id', type: 'uuid', nullable: true })
  lastImportUploadId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
