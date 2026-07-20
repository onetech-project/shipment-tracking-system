import { IsOptional, IsString, IsDateString, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class ListBarhalKoliDto {
  // Matches No. Koli, No. Penerbangan (flight number), and No. TO.
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  route?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 25
}
