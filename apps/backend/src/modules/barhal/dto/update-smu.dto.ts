import { IsDateString, IsOptional, IsString } from 'class-validator'

export class UpdateSmuDto {
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
