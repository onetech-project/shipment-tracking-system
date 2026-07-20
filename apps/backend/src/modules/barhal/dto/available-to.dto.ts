import { IsOptional, IsString, IsDateString } from 'class-validator'

export class AvailableToDto {
  @IsOptional()
  @IsString()
  route?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  search?: string
}
