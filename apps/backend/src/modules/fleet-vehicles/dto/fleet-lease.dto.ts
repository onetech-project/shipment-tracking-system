import { Type } from 'class-transformer'
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator'

// Requirement §2 makes every field here mandatory except angsuranTerbayar. The columns stay
// nullable so rows written before this rule existed remain readable; the rule lives at the entry
// point, where it applies to new writes only.
export class FleetLeaseDto {
  @IsUUID()
  leasingId: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nomorKontrak: string

  // numeric(14,2) in the column, so a decimal is accepted even though operators type whole
  // rupiah. maxDecimalPlaces guards the scale that column actually holds.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cicilanPerBulan: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  tenorBulan: number

  @IsDateString()
  angsuranMulai: string

  // The one optional field: blank means "work it out from angsuranMulai" (spec §5.2).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  angsuranTerbayar?: number | null
}
