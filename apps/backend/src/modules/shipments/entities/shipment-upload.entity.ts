import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UploadStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  AWAITING_CONFLICT_REVIEW = 'awaiting_conflict_review',
  FAILED = 'failed',
}

@Entity('shipment_uploads')
@Index('idx_shipment_uploads_org_created', ['organizationId', 'createdAt'])
export class ShipmentUpload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ name: 'file_hash', type: 'char', length: 64 })
  fileHash: string;

  @Column({ type: 'varchar', length: 30, default: UploadStatus.QUEUED })
  status: string;

  @Column({ name: 'total_rows_detected', type: 'int', default: 0 })
  totalRowsDetected: number;

  @Column({ name: 'rows_imported', type: 'int', default: 0 })
  rowsImported: number;

  @Column({ name: 'rows_failed', type: 'int', default: 0 })
  rowsFailed: number;

  @Column({ name: 'rows_conflicted', type: 'int', default: 0 })
  rowsConflicted: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
