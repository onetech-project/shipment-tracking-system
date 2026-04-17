import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { GoogleSheetSheetConfig } from './google-sheet-sheet-config.entity'

@Entity('google_sheet_config')
export class GoogleSheetConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'sheet_link', type: 'text' })
  sheetLink: string

  @Column({ name: 'sheet_id', type: 'text' })
  sheetId: string

  @Column({ name: 'sync_interval', type: 'int', default: 15 })
  syncInterval: number

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean

  @Column({ name: 'label', type: 'text' })
  label: string

  @OneToMany(() => GoogleSheetSheetConfig, (sheetConfig) => sheetConfig.googleSheetConfig, {
    cascade: true,
  })
  sheetConfigs: GoogleSheetSheetConfig[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
