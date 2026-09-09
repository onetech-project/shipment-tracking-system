import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'

// Every field nullable rather than merely optional: null clears the column, an absent field
// leaves it unchanged, and FleetDriversService.update depends on telling those apart.
export class UpdateFleetDriverDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nama?: string

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telepon?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  simNomor?: string | null

  @IsOptional()
  @IsUUID()
  simJenisId?: string | null

  @IsOptional()
  @IsDateString()
  simExpiresAt?: string | null

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
