import { Type } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class CreateFleetVehicleDto {
  // The service normalises the plate before storing it, so validation only guards the column
  // width and rejects an outright empty string.
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nopol: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  merk?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipe?: string | null

  // A model year, not a count. The bounds keep a mistyped 20021 out of the integer column while
  // staying wide enough for the oldest unit anyone still runs.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  tahun?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  kapasitas?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  noRangka?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  noMesin?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  noBpkb?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pemilikUnit?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometer?: number | null

  @IsOptional()
  @IsString()
  catatan?: string | null

  @IsOptional()
  @IsUUID()
  jenisArmadaId?: string | null

  @IsOptional()
  @IsUUID()
  kepemilikanId?: string | null

  @IsOptional()
  @IsUUID()
  poolId?: string | null

  @IsOptional()
  @IsUUID()
  statusId?: string | null

  @IsOptional()
  @IsUUID()
  driverId?: string | null
}
