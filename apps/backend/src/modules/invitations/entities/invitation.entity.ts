import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column()
  email: string;

  @Column({ name: 'invited_by' })
  invitedBy: string;

  @Column({ name: 'role_id', nullable: true })
  roleId: string;

  @Column({ name: 'invited_name', length: 255, nullable: true })
  invitedName: string;

  @Column({ name: 'token_hash', length: 64, unique: true })
  tokenHash: string;

  @Column({
    type: 'varchar',
    default: 'pending',
  })
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
}
