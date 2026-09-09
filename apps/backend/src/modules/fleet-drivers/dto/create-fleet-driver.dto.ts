import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'

export class CreateFleetDriverDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nama: string

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

  // A calendar date, not an instant. The service stores it as-is into a DATE column.
  @IsOptional()
  @IsDateString()
  simExpiresAt?: string | null
}
