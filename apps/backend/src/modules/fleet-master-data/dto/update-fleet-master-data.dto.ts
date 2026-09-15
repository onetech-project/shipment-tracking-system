import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

// No `category` and no `code`: both are the row's identity (see FleetMasterDataService.update).
// main.ts runs ValidationPipe with forbidNonWhitelisted: true, so a client that sends either gets
// a 400 naming the property — the row cannot be moved between categories even by accident.
export class UpdateFleetMasterDataDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  warnDays?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  defaultValidMonths?: number | null

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean | null
}
