import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { FLEET_MASTER_CATEGORIES, FleetMasterCategory } from '../fleet-master-data.constants'

export class CreateFleetMasterDataDto {
  @IsIn(FLEET_MASTER_CATEGORIES as unknown as string[])
  category: FleetMasterCategory

  // Lowercase slug, not free text: this is the stable key the seed migration and any future code
  // path find a row by, while `label` is the part an admin is free to reword.
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'code must contain only lowercase letters, digits and underscores',
  })
  code: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number

  // 0 is valid and means "warn on the expiry date itself". Capped at 365 so a typo cannot make
  // every document permanently amber.
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
