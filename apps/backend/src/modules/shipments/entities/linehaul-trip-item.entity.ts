import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { LinehaulTrip } from './linehaul-trip.entity';

@Entity('linehaul_trip_items')
@Index('idx_linehaul_items_trip_id', ['linehaulTripId'])
@Index('idx_linehaul_items_to_number', ['toNumber'])
export class LinehaulTripItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'linehaul_trip_id', type: 'uuid' })
  linehaulTripId: string;

  @Column({ name: 'to_number', type: 'varchar', length: 100 })
  toNumber: string;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
  weight: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  destination: string | null;

  @Column({ name: 'dg_type', type: 'varchar', length: 50, nullable: true })
  dgType: string | null;

  @Column({ name: 'to_type', type: 'varchar', length: 50, nullable: true })
  toType: string | null;

  @ManyToOne(() => LinehaulTrip, (trip) => trip.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'linehaul_trip_id' })
  linehaulTrip: LinehaulTrip;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
