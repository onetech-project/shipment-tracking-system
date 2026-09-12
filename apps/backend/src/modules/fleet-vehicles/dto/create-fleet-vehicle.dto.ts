import { Type } from 'class-transformer'
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { FleetLeaseDto } from './fleet-lease.dto'
import { FleetVehicleDocumentDto } from './replace-fleet-vehicle-documents.dto'

// @IsNotEmpty only rejects the empty string, so a field of spaces slips past it and lands in the
// column as blank identity data that reads as filled in. This is the guard that refuses it.
const NOT_BLANK = /\S/

// Requirement §1 makes the whole identity block mandatory and §3 adds the pool. The columns stay
// nullable so rows written before this rule existed still read back; the rule applies to writes.
export class CreateFleetVehicleDto {
  // The service normalises the plate before storing it, so validation only guards the column
  // width and rejects an outright empty string.
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nopol: string

  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: '$property must not be blank' })
  @MaxLength(60)
  merk: string

  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: '$property must not be blank' })
  @MaxLength(60)
  tipe: string

  // A model year, not a count. The bounds keep a mistyped 20021 out of the integer column while
  // staying wide enough for the oldest unit anyone still runs.
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  tahun: number

  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: '$property must not be blank' })
  @MaxLength(40)
  kapasitas: string

  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: '$property must not be blank' })
  @MaxLength(60)
  noRangka: string

  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: '$property must not be blank' })
  @MaxLength(60)
  noMesin: string

  @IsString()
  @IsNotEmpty()
  @Matches(NOT_BLANK, { message: '$property must not be blank' })
  @MaxLength(60)
  noBpkb: string

  // Conditional, not optional: required only for a sewa lepas kunci unit. The check needs the
  // kepemilikan row's code, which means a master-data read, so it lives in the service — a DTO
  // has no repository. See Task 8.
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

  @IsUUID()
  jenisArmadaId: string

  @IsUUID()
  kepemilikanId: string

  @IsUUID()
  poolId: string

  @IsOptional()
  @IsUUID()
  statusId?: string | null

  @IsOptional()
  @IsUUID()
  driverId?: string | null

  // @ValidateNested with @Type is what makes the nested rules run at all. Without both, the lease
  // is accepted as-is and reaches the service unvalidated. @IsObject rejects a bare string before
  // the nested validator is handed something it cannot walk.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FleetLeaseDto)
  lease?: FleetLeaseDto | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FleetVehicleDocumentDto)
  documents?: FleetVehicleDocumentDto[]
}
