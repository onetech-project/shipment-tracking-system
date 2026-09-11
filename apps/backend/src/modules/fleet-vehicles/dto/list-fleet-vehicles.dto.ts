import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'
import {
  FLEET_SEVERITIES,
  FLEET_VEHICLE_SORTS,
  FleetSeverity,
  FleetVehicleSort,
  MAX_PAGE_SIZE,
} from '../fleet-vehicles.constants'

export class ListFleetVehiclesDto {
  @IsOptional()
  @IsString()
  q?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  // Capped here as well as in the service so an over-large request is answered with a 400 the
  // caller can act on, rather than silently served a different page size than they asked for.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number

  @IsOptional()
  @IsIn(FLEET_VEHICLE_SORTS)
  sort?: FleetVehicleSort

  @IsOptional()
  @IsIn(FLEET_SEVERITIES)
  severity?: FleetSeverity

  @IsOptional()
  @IsUUID()
  kepemilikanId?: string

  @IsOptional()
  @IsUUID()
  poolId?: string

  @IsOptional()
  @IsUUID()
  statusId?: string

  // Query strings have no booleans. Without this the literal 'false' is truthy and archived rows
  // leak into a list that asked to hide them.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  includeArchived?: boolean
}
