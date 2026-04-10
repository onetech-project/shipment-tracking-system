import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm'
import { GoogleSheetConfig } from './google-sheet-config.entity'

@Entity('google_sheet_sheet_config')
export class GoogleSheetSheetConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(() => GoogleSheetConfig, (config) => config.sheetConfigs, { onDelete: 'CASCADE' })
  googleSheetConfig: GoogleSheetConfig

  @Column({ name: 'sheet_name', type: 'text' })
  sheetName: string

  @Column({ name: 'table_name', type: 'text' })
  tableName: string

  @Column({ name: 'header_row', type: 'int', default: 1 })
  headerRow: number

  @Column({ name: 'unique_key', type: 'jsonb' })
  uniqueKey: string[] | string

  @Column({ name: 'skip_null_cols', type: 'boolean', default: true })
  skipNullCols: boolean
}
