import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Permission } from '@shared/auth'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { Authorize } from '../../common/decorators/authorize.decorator'
import { FleetVehiclesService } from './fleet-vehicles.service'
import { CreateFleetVehicleDto } from './dto/create-fleet-vehicle.dto'
import { UpdateFleetVehicleDto } from './dto/update-fleet-vehicle.dto'
import { ListFleetVehiclesDto } from './dto/list-fleet-vehicles.dto'
import { ReplaceFleetVehicleDocumentsDto } from './dto/replace-fleet-vehicle-documents.dto'

@ApiTags('Fleet Vehicles')
@Controller('fleet/vehicles')
@UseGuards(JwtAuthGuard)
export class FleetVehiclesController {
  constructor(private readonly service: FleetVehiclesService) {}

  @Get()
  @Authorize(Permission.READ_FLEET_VEHICLE)
  findAll(@Query() query: ListFleetVehiclesDto) {
    return this.service.findAll(query)
  }

  @Get(':id')
  @Authorize(Permission.READ_FLEET_VEHICLE)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id)
  }

  @Post()
  @Authorize(Permission.CREATE_FLEET_VEHICLE)
  create(@Body() dto: CreateFleetVehicleDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFleetVehicleDto) {
    return this.service.update(id, dto)
  }

  // The whole set replaces the old one in a single transaction because that is the shape of the
  // form: the operator sees every document at once and submits every document at once.
  @Put(':id/documents')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  replaceDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceFleetVehicleDocumentsDto,
  ) {
    return this.service.replaceDocuments(id, dto.documents)
  }

  @Post(':id/restore')
  @Authorize(Permission.UPDATE_FLEET_VEHICLE)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.restore(id)
  }

  // Archiving is a state change, not a deletion, so it is a POST — §5 of the spec, and the same
  // shape restore has. A unit that has been sold keeps its documents and its history and simply
  // stops appearing in the register, which is what the Arsipkan button in the UI means.
  @Post(':id/archive')
  @Authorize(Permission.DELETE_FLEET_VEHICLE)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(id)
  }

  // DELETE genuinely destroys the row. The service refuses with a 409 when the unit has any
  // document history, so this only ever removes a row created by mistake.
  @Delete(':id')
  @HttpCode(204)
  @Authorize(Permission.DELETE_FLEET_VEHICLE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
