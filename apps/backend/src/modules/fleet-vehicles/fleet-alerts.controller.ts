import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetAlertsService } from './fleet-alerts.service'
import { ListFleetAlertsDto } from './dto/list-fleet-alerts.dto'

// At /fleet rather than /fleet/vehicles: the list covers driver licences too, and some of those
// belong to a driver assigned to no vehicle.
@ApiTags('Fleet Alerts')
@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetAlertsController {
  constructor(private readonly service: FleetAlertsService) {}

  @Get('alerts')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  list(@Query() query: ListFleetAlertsDto) {
    return this.service.list(query.limit)
  }
}
