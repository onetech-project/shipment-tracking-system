import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator'

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
}

export class SetEvidenceDto {
  @IsString()
  @IsNotEmpty()
  evidence: string
}
