import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('rate_per_station')
@Unique(['origin_dc', 'destination_dc'])
@Index('idx_rate_per_station_origin_dc_destination_dc', ['origin_dc', 'destination_dc'])
export class RatePerStation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'is_locked', type: 'boolean', nullable: true })
  is_locked: boolean | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  last_synced_at: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;

  // ── Application columns (Data sheet, headerRow 1) ─────────────────────────

  @Column({ type: 'text', nullable: true }) dc: string | null;
  @Column({ type: 'text', nullable: true }) station: string | null;
  @Column({ type: 'text', nullable: true }) origin_city: string | null;
  @Column({ type: 'text', nullable: true }) origin_dc: string | null;
  @Column({ type: 'text', nullable: true }) destination_city: string | null;
  @Column({ type: 'text', nullable: true }) destination_dc: string | null;
  @Column({ type: 'text', nullable: true }) origin_station: string | null;
  @Column({ type: 'text', nullable: true }) destination_station: string | null;
  @Column({ type: 'text', nullable: true }) concat: string | null;
  @Column({ type: 'text', nullable: true }) rate_spx: string | null;
  @Column({ type: 'numeric', nullable: true }) pph_2: number | null;
  @Column({ type: 'numeric', nullable: true }) disc_15: number | null;
  @Column({ type: 'text', nullable: true }) rate_spx_after_pph_disc: string | null;
  @Column({ type: 'integer', nullable: true }) sla: number | null;
  @Column({ type: 'integer', nullable: true }) lost_treshold: number | null;
}
