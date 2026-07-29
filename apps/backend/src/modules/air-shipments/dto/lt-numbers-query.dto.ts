import { Type, Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min, Matches } from 'class-validator'
import { ALERT_FILTERS, ALERT_TYPES, AlertFilter, AlertType } from '../alert-evaluator'

export class LtNumbersQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string

  // Active-shipments mode (mirrors AirShipmentQueryDto's filters).
  @IsOptional()
  @IsString()
  @IsIn(ALERT_FILTERS)
  alertFilter?: AlertFilter

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : Array.isArray(value) ? value : [value]
  )
  @IsString({ each: true })
  routeFilter?: string[]

  // Excluded/restore mode (mirrors ExcludedQueryDto's filter).
  @IsOptional()
  @IsIn(ALERT_TYPES)
  alertType?: AlertType

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  excluded?: boolean
}
