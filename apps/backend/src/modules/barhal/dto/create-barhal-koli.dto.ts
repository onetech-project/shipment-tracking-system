import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ArrayNotEmpty, Min } from 'class-validator'

export class CreateBarhalKoliDto {
  @IsDateString()
  koliDate: string

  @IsString()
  route: string

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  toNumbers: string[]

  @IsOptional()
  @IsNumber()
  @Min(0)
  packingKayuWeight?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthCm?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  widthCm?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number
}
