import { IsOptional, IsDateString, IsString } from 'class-validator'

export class SmuListQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string
}
