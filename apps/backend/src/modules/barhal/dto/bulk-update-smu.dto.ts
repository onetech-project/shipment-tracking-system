import { IsDateString, IsOptional, IsString } from 'class-validator'

export class BulkUpdateSmuDto {
  @IsDateString()
  koliDate: string

  @IsString()
  dest: string

  @IsOptional()
  @IsString()
  smuNumber?: string

  @IsOptional()
  @IsString()
  airlines?: string

  @IsOptional()
  @IsString()
  flightNo?: string

  @IsOptional()
  @IsDateString()
  std?: string

  @IsOptional()
  @IsDateString()
  sta?: string
}
