import { IsNumber, IsOptional, Min } from 'class-validator'

export class UpdatePackingDto {
  @IsNumber()
  @Min(0)
  weightAfter: number

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  batangKayu?: number
}
