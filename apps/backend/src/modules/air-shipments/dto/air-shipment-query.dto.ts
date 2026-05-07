import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min, Matches } from 'class-validator'
import { ALERT_FILTERS, AlertFilter } from '../alert-evaluator'

export class AirShipmentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50

  @IsOptional()
  @IsString()
  sortBy: string = 'id'

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc'

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  @IsIn(ALERT_FILTERS)
  alertFilter?: AlertFilter

  @IsOptional()
  @IsString()
  routeFilter?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string
}
