import { Type } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, Matches } from 'class-validator'
import { AlertType, ALERT_TYPES, GLOBAL_EXCLUDE_KEY } from '../alert-evaluator'

export class ExcludedQueryDto {
  // Allow the global-exclude sentinel so the Excluded tab can filter the "All Alerts" group.
  @IsOptional()
  @IsIn([...ALERT_TYPES, GLOBAL_EXCLUDE_KEY])
  alertType?: AlertType | typeof GLOBAL_EXCLUDE_KEY

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string  // YYYY-MM-DD

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string    // YYYY-MM-DD
}

export class ExcludeRowDto {
  @IsIn(ALERT_TYPES)
  alertType: AlertType

  @IsString()
  @IsNotEmpty()
  reason: string
}

export class RestoreRowDto {
  // Allow the global-exclude sentinel so the Excluded tab can restore an "All Alerts" row.
  @IsIn([...ALERT_TYPES, GLOBAL_EXCLUDE_KEY])
  alertType: AlertType | typeof GLOBAL_EXCLUDE_KEY
}

export class ExcludeByLtDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ltNumbers: string[]

  @IsString()
  @IsNotEmpty()
  reason: string
}

export class RestoreByLtDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ltNumbers: string[]
}
