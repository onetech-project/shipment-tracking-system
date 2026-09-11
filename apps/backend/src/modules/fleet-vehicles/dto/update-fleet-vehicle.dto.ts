import { PartialType } from '@nestjs/swagger'
import { CreateFleetVehicleDto } from './create-fleet-vehicle.dto'

// PartialType keeps every rule above while making each field optional, which is exactly the
// patch semantics FleetVehiclesService.update expects: an absent field leaves the column alone.
// isActive is deliberately absent — archiving goes through POST :id/archive and :id/restore so the
// partial unique index on the plate is checked before the flag flips, which a blind patch of
// isActive would skip.
export class UpdateFleetVehicleDto extends PartialType(CreateFleetVehicleDto) {}
