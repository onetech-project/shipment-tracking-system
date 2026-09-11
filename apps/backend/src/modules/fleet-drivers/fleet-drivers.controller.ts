import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetDriversService } from './fleet-drivers.service'
import { CreateFleetDriverDto } from './dto/create-fleet-driver.dto'
import { UpdateFleetDriverDto } from './dto/update-fleet-driver.dto'

// Drivers sit behind the vehicle permissions, not their own set: whoever registers a vehicle
// also assigns its driver.
@ApiTags('Fleet Drivers')
@Controller('fleet/drivers')
@UseGuards(JwtAuthGuard)
export class FleetDriversController {
  constructor(private readonly service: FleetDriversService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_VEHICLE)
  findAll(
    @Query('q') q?: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.service.findAll(q, includeInactive)
  }

  @Post()
  @Authorize(Permission.CREATE_FLEET_VEHICLE)
  create(@Body() dto: CreateFleetDriverDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFleetDriverDto) {
    return this.service.update(id, dto)
  }

  // The counterpart to DELETE, which now archives an assigned driver rather than removing them.
  @Post(':id/restore')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.restore(id)
  }

  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
