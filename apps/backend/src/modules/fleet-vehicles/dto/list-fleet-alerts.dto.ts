import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { MAX_ALERT_LIMIT } from '../fleet-alerts.service'

export class ListFleetAlertsDto {
  // Capped rather than open: without a ceiling this endpoint is a way to pull every dated
  // document in the register in one request.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ALERT_LIMIT)
  limit?: number
}
