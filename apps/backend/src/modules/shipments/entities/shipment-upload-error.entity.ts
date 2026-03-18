import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UploadErrorType {
  VALIDATION = 'validation',
  DUPLICATE = 'duplicate',
  PARSE = 'parse',
}

@Entity('shipment_upload_errors')
@Index('idx_upload_errors_upload_id', ['shipmentUploadId'])
@Index('idx_upload_errors_upload_type', ['shipmentUploadId', 'errorType'])
@Index('idx_upload_errors_unresolved', ['shipmentUploadId', 'resolved'])
export class ShipmentUploadError {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'shipment_upload_id', type: 'uuid' })
  shipmentUploadId: string;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber: number;

  @Column({ name: 'error_type', type: 'varchar', length: 30 })
  errorType: string;

  @Column({ name: 'field_name', type: 'varchar', length: 100, nullable: true })
  fieldName: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'incoming_payload', type: 'jsonb', nullable: true })
  incomingPayload: Record<string, unknown> | null;

  @Column({ name: 'existing_shipment_id', type: 'uuid', nullable: true })
  existingShipmentId: string | null;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  resolution: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
