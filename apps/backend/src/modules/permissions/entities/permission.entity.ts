import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('permissions')
@Unique(['name'])
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  resource: string;

  @Column({ nullable: true })
  action: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
