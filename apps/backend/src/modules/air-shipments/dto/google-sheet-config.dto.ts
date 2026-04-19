import {
  IsString,
  IsBoolean,
  IsInt,
  IsArray,
  IsOptional,
  ValidateNested,
  IsUrl,
} from 'class-validator'
import { Type } from 'class-transformer'

export class GoogleSheetSheetConfigDto {
  @IsString()
  sheetName: string

  @IsString()
  tableName: string

  @IsInt()
  headerRow: number

  @IsArray()
  uniqueKey: string[]

  @IsBoolean()
  skipNullCols: boolean = true
}

export class GoogleSheetConfigDto {
  @IsString()
  label: string
  @IsUrl()
  sheetLink: string

  @IsInt()
  syncInterval: number

  @IsBoolean()
  enabled: boolean

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoogleSheetSheetConfigDto)
  sheetConfigs?: GoogleSheetSheetConfigDto[]
}
