import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString, Matches } from 'class-validator'
import { ALERT_FILTERS, AlertFilter, ALERT_TYPES, AlertType } from '../alert-evaluator'

/** A query value that may arrive as a single string or a repeated param → string[]. */
const toArray = ({ value }: { value: unknown }): string[] | undefined =>
  value === undefined || value === null ? undefined : Array.isArray(value) ? (value as string[]) : [String(value)]

/**
 * Filters for the SLA Excel export. Mirrors the on-screen filter state; there is no
 * page/limit because the export is always unbounded (every matching row).
 */
export class SlaExportQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string

  // Active Alerts tab alert filter; `'any'` when no specific alert is selected.
  @IsOptional()
  @IsIn(ALERT_FILTERS)
  alertFilter?: AlertFilter

  // One or more "ORIGIN - DESTINATION" route labels (repeated param → array).
  @IsOptional()
  @Transform(toArray)
  @IsString({ each: true })
  routeFilter?: string[]

  @IsOptional()
  @IsString()
  search?: string

  // Excluded tab alert-type chip filter (absent = "All").
  @IsOptional()
  @IsIn(ALERT_TYPES)
  excludedAlertType?: AlertType

  // Visible column keys in display order (repeated param → array). Drives the
  // Active Alert sheet's columns so the export matches the on-screen table.
  @IsOptional()
  @Transform(toArray)
  @IsString({ each: true })
  columns?: string[]

  @IsOptional()
  @IsString()
  sortBy?: string

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'
}
