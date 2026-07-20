import { IsOptional, IsDateString, IsString } from 'class-validator'

export class BarhalDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsString()
  route?: string
}
