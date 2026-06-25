import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator'

export class OffloadedAwbQueryDto {
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
  @IsString()
  search?: string

  /** true → AWBs that already have evidence (the "Excluded" view); false/absent → active alert list */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  withEvidence?: boolean

  /** Scope to AWBs with shipments in this SLA range (matches the dashboard cards). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string
}

export class SetEvidenceDto {
  @IsString()
  @IsNotEmpty()
  evidence: string
}
