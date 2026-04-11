import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('air_shipments_sub')
@Unique(['to_number'])
@Index('idx_air_shipments_sub_to_number', ['to_number'])
export class AirShipmentSub {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'to_number', type: 'varchar', length: 100 })
  to_number: string;

  @Column({ name: 'is_locked', type: 'boolean', nullable: true })
  is_locked: boolean | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  last_synced_at: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updated_at: Date;

  // ── Application columns (SUB sheet, headerRow 4) ─────────────────────────

  @Column({ type: 'text', nullable: true }) date: string | null;
  @Column({ type: 'text', nullable: true }) vendor: string | null;
  @Column({ type: 'text', nullable: true }) origin: string | null;
  @Column({ type: 'text', nullable: true }) destination: string | null;
  @Column({ type: 'text', nullable: true }) lt_number: string | null;
  @Column({ type: 'numeric', nullable: true }) gross_weight: number | null;
  @Column({ type: 'integer', nullable: true }) qty_parcel: number | null;
  @Column({ type: 'text', nullable: true }) remarks: string | null;
  @Column({ type: 'integer', nullable: true }) slot: number | null;
  @Column({ type: 'text', nullable: true }) driver_name_pickup: string | null;
  @Column({ type: 'text', nullable: true }) nopol_pickup: string | null;
  @Column({ type: 'text', nullable: true }) vehicle_type_pickup: string | null;
  @Column({ type: 'text', nullable: true }) ata_origin: string | null;
  @Column({ type: 'text', nullable: true }) atd_origin: string | null;
  @Column({ type: 'text', nullable: true }) awb: string | null;
  @Column({ type: 'text', nullable: true }) actual_airline_name: string | null;
  @Column({ type: 'text', nullable: true }) flight_no: string | null;
  @Column({ type: 'text', nullable: true }) stt: string | null;
  @Column({ type: 'numeric', nullable: true }) p_panjang: number | null;
  @Column({ type: 'numeric', nullable: true }) l_lebar: number | null;
  @Column({ type: 'numeric', nullable: true }) t_tinggi: number | null;
  @Column({ type: 'numeric', nullable: true }) chargeable_weight_btb_awb: number | null;
  @Column({ type: 'text', nullable: true }) atd_flight: string | null;
  @Column({ type: 'text', nullable: true }) ata_flight: string | null;
  @Column({ type: 'text', nullable: true }) nopol_dooring: string | null;
  @Column({ type: 'text', nullable: true }) vehicle_type_dooring: string | null;
  @Column({ type: 'text', nullable: true }) ata_vendor_wh_destination: string | null;
  @Column({ type: 'text', nullable: true }) link_evidence_of_arrival_wh_destination: string | null;
  @Column({ type: 'text', nullable: true }) issue: string | null;
  @Column({ type: 'text', nullable: true }) remarks_mandatory: string | null;
  @Column({ type: 'text', nullable: true }) dooring_activity_vendor: string | null;
  @Column({ type: 'text', nullable: true }) arrival_status_vendor: string | null;
  @Column({ type: 'text', nullable: true }) eta_spx_wh_destination: string | null;
  @Column({ type: 'text', nullable: true }) completed_time: string | null;
  @Column({ type: 'numeric', nullable: true }) helper_time_departure: number | null;
  @Column({ type: 'text', nullable: true }) helper_ptpdtd: string | null;

  @Column({ type: 'jsonb', nullable: true })
  extra_fields: Record<string, string> | null;
}
