import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional } from 'class-validator'
import { FLEET_MASTER_CATEGORIES, FleetMasterCategory } from '../fleet-master-data.constants'

export class QueryFleetMasterDataDto {
  @IsOptional()
  @IsIn(FLEET_MASTER_CATEGORIES as unknown as string[])
  category?: FleetMasterCategory

  // Query strings arrive as text; without this transform `?includeInactive=false` would be the
  // truthy string 'false'.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean
}
