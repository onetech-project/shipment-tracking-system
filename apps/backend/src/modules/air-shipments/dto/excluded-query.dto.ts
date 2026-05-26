import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min, Matches } from 'class-validator'
import { AlertType, ALERT_TYPES } from '../alert-evaluator'

export class ExcludedQueryDto {
  @IsOptional()
  @IsIn(ALERT_TYPES)
  alertType?: AlertType

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
