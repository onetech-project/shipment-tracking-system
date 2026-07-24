import { IsOptional, IsString, IsDateString } from 'class-validator'

export class AvailableToDto {
  @IsOptional()
  @IsString()
  origin?: string

  @IsOptional()
  @IsString()
  dest?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  search?: string
}
